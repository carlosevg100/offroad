import {describe, expect, it} from "vitest";

import {classifyCorrection, measureAccuracy, wilsonLowerBound, type FeedbackRow} from "./accuracy";
import {buildAutoAcceptPolicy, worstOffenders} from "./policy";
import {priorityCandidates, toGoldCandidates} from "./gold";

const row = (overrides: Partial<FeedbackRow> = {}): FeedbackRow => ({
  fieldPath: "historical_financials.2025.revenue",
  fieldGroup: "historical_financials",
  valueType: "number",
  documentKind: "audited_financial_statements",
  extractorKey: "llm_v1",
  decision: "accept",
  proposedValue: "412000000",
  correctedValue: null,
  confidence: 0.97,
  anchorVerified: true,
  ...overrides,
});

const repeat = (count: number, overrides: Partial<FeedbackRow>): FeedbackRow[] =>
  Array.from({length: count}, () => row(overrides));

describe("wilsonLowerBound", () => {
  it("does not let a tiny sample outrank a large one", () => {
    // The whole reason the policy reads the bound and not the rate: both of these are "good",
    // but only one of them is known to be good.
    const twoOfTwo = wilsonLowerBound(2, 2);
    const fortySevenOfFifty = wilsonLowerBound(47, 50);
    expect(twoOfTwo).toBeLessThan(fortySevenOfFifty);
    expect(twoOfTwo).toBeLessThan(0.6);
    expect(fortySevenOfFifty).toBeGreaterThan(0.8);
  });

  it("reports nothing when there is nothing to report", () => {
    expect(wilsonLowerBound(0, 0)).toBe(0);
  });

  it("never claims certainty", () => {
    expect(wilsonLowerBound(1000, 1000)).toBeLessThan(1);
  });
});

describe("classifyCorrection", () => {
  it("names a thousands-versus-units misread as a scale error", () => {
    expect(classifyCorrection("71000", "71000000")).toBe("scale");
    expect(classifyCorrection("71000000", "71000")).toBe("scale");
    // A percentage read as a decimal is the same failure at a different magnitude.
    expect(classifyCorrection("0.14", "14")).toBe("scale");
  });

  it("does not mistake an ordinary correction for a scale error", () => {
    expect(classifyCorrection("412000000", "398500000")).toBe("material");
  });

  it("separates a rounding nit from a real mistake", () => {
    expect(classifyCorrection("71412000", "71411986")).toBe("rounding");
  });

  it("says so when it cannot tell", () => {
    expect(classifyCorrection("Alfa Ltda", "Alfa Comércio Ltda")).toBe("unknown");
  });

  it("treats a sign flip as material, not as a scale of ten", () => {
    // -1 is a ratio whose log is undefined; a naive implementation returns NaN and the
    // comparison silently falls through to "scale".
    expect(classifyCorrection("5000", "-5000")).toBe("material");
  });
});

describe("measureAccuracy", () => {
  it("keeps the same field separate per document kind", () => {
    const measurements = measureAccuracy([
      ...repeat(9, {decision: "accept"}),
      ...repeat(1, {decision: "edit", correctedValue: "398500000"}),
      ...repeat(2, {decision: "accept", documentKind: "investor_deck"}),
      ...repeat(6, {decision: "edit", documentKind: "investor_deck", correctedValue: "398500000"}),
    ]);

    const audited = measurements.find((entry) => entry.documentKind === "audited_financial_statements")!;
    const deck = measurements.find((entry) => entry.documentKind === "investor_deck")!;
    expect(audited.accepted).toBe(9);
    expect(deck.accepted).toBe(2);
    // Pooling them would report 11/18 and hide that the deck is the problem.
    expect(audited.lowerBound).toBeGreaterThan(deck.lowerBound);
  });

  it("excludes not-applicable from the rate but keeps it visible", () => {
    const [measurement] = measureAccuracy([...repeat(3, {decision: "accept"}), ...repeat(7, {decision: "not_applicable"})]);
    expect(measurement!.judged).toBe(3);
    expect(measurement!.rate).toBe(1);
    expect(measurement!.notApplicable).toBe(7);
  });

  it("counts scale errors apart from ordinary corrections", () => {
    const [measurement] = measureAccuracy([
      row({decision: "edit", proposedValue: "71000", correctedValue: "71000000"}),
      row({decision: "edit", proposedValue: "412000000", correctedValue: "398500000"}),
      row({decision: "edit", proposedValue: "71412000", correctedValue: "71411986"}),
    ]);
    expect(measurement!.scaleErrors).toBe(1);
    expect(measurement!.roundingErrors).toBe(1);
  });

  it("reports how confident the extractor was when it was wrong", () => {
    const [measurement] = measureAccuracy([
      row({decision: "accept", confidence: 0.99}),
      row({decision: "edit", correctedValue: "1", confidence: 0.98}),
      row({decision: "reject", confidence: 0.92}),
    ]);
    // Confident and wrong is the finding that no confidence threshold can fix.
    expect(measurement!.confidenceWhenWrong).toBeCloseTo(0.95, 5);
  });

  it("lists the worst first, because the list is a work queue", () => {
    const measurements = measureAccuracy([
      ...repeat(20, {decision: "accept", fieldPath: "good.field"}),
      ...repeat(2, {decision: "accept", fieldPath: "bad.field"}),
      ...repeat(18, {decision: "reject", fieldPath: "bad.field"}),
    ]);
    expect(measurements[0]!.fieldPath).toBe("bad.field");
  });
});

describe("the auto-accept policy", () => {
  it("locks a field with a scale error in its history, at any confidence", () => {
    const policy = buildAutoAcceptPolicy(
      measureAccuracy([
        ...repeat(40, {decision: "accept"}),
        row({decision: "edit", proposedValue: "71000", correctedValue: "71000000"}),
      ]),
    );
    const decision = policy.decide({
      fieldPath: "historical_financials.2025.revenue",
      documentKind: "audited_financial_statements",
      confidence: 0.999,
    });
    // 40 of 41 is an excellent rate. It does not matter: the units were misread once, and
    // that misreading repeats on every document of the same shape.
    expect(decision.autoAccept).toBe(false);
    expect(decision.reason).toBe("scale_error");
  });

  it("makes a barely-seen field earn its way out", () => {
    const policy = buildAutoAcceptPolicy(measureAccuracy(repeat(3, {decision: "accept"})));
    expect(policy.decide({fieldPath: "historical_financials.2025.revenue", documentKind: "audited_financial_statements", confidence: 0.99}).reason).toBe("unproven");
  });

  it("raises the bar on a field it has been wrong about", () => {
    // 45 of 50 is a lower bound near 0.79: short of the 0.9 target, well clear of the 0.5
    // floor, so the response is a higher confidence bar rather than a lock.
    const measurements = measureAccuracy([...repeat(45, {decision: "accept"}), ...repeat(5, {decision: "reject"})]);
    const policy = buildAutoAcceptPolicy(measurements);
    const entry = policy.fields.get("historical_financials.2025.revenue\taudited_financial_statements")!;
    expect(entry.reason).toBe("below_target");
    expect(entry.requiredConfidence).toBeGreaterThan(0.95);
    expect(entry.requiredConfidence).toBeLessThanOrEqual(0.99);
    expect(policy.decide({fieldPath: entry.fieldPath, documentKind: entry.documentKind, confidence: 0.95}).autoAccept).toBe(false);
  });

  it("locks rather than raises when the sample cannot rule out a coin flip", () => {
    // 14 of 20 looks like 70%, but the lower bound is 0.48 — the evidence does not exclude a
    // field that is wrong half the time, and the bar is the wrong instrument for that.
    const policy = buildAutoAcceptPolicy(measureAccuracy([...repeat(14, {decision: "accept"}), ...repeat(6, {decision: "reject"})]));
    const entry = policy.fields.get("historical_financials.2025.revenue\taudited_financial_statements")!;
    expect(entry.measurement.rate).toBeCloseTo(0.7, 5);
    expect(entry.measurement.lowerBound).toBeLessThan(0.5);
    expect(entry.reason).toBe("unreliable");
  });

  it("leaves a proven field on the ordinary threshold", () => {
    const policy = buildAutoAcceptPolicy(measureAccuracy(repeat(60, {decision: "accept"})));
    const decision = policy.decide({fieldPath: "historical_financials.2025.revenue", documentKind: "audited_financial_statements", confidence: 0.96});
    expect(decision.autoAccept).toBe(true);
    expect(decision.reason).toBe("proven");
  });

  it("does not lock a field nobody has ever reviewed", () => {
    // The ledger records what was reviewed. Silence about a field is not evidence against it,
    // and treating it as such would stop the product working on its first case.
    const policy = buildAutoAcceptPolicy([]);
    expect(policy.decide({fieldPath: "collateral.assets.0.eligible_base", documentKind: "appraisal", confidence: 0.97})).toEqual({
      autoAccept: true,
      reason: "no_history",
    });
    expect(policy.decide({fieldPath: "collateral.assets.0.eligible_base", documentKind: "appraisal", confidence: 0.5}).autoAccept).toBe(false);
  });

  it("does not let an unseen document kind rescue a failing field", () => {
    const measurements = measureAccuracy([
      ...repeat(2, {decision: "accept", documentKind: null}),
      ...repeat(18, {decision: "reject", documentKind: null}),
    ]);
    const policy = buildAutoAcceptPolicy(measurements);
    const decision = policy.decide({fieldPath: "historical_financials.2025.revenue", documentKind: "a_kind_never_seen", confidence: 0.99});
    expect(decision.autoAccept).toBe(false);
    expect(decision.reason).toBe("unreliable");
  });

  it("locks a field it is wrong about more often than a coin flip", () => {
    // The confidence bar has a ceiling of 0.99, so on a field measured at 10% accuracy the bar
    // alone would still let a confident extractor through while appearing strict.
    const policy = buildAutoAcceptPolicy(measureAccuracy([...repeat(2, {decision: "accept"}), ...repeat(18, {decision: "reject"})]));
    const decision = policy.decide({
      fieldPath: "historical_financials.2025.revenue",
      documentKind: "audited_financial_statements",
      confidence: 0.9999,
    });
    expect(decision).toEqual({autoAccept: false, reason: "unreliable"});
  });

  it("ranks the work by reviewer time, not by percentage", () => {
    const measurements = measureAccuracy([
      ...repeat(48, {decision: "accept", fieldPath: "common.field"}),
      ...repeat(32, {decision: "edit", fieldPath: "common.field", correctedValue: "1"}),
      ...repeat(3, {decision: "reject", fieldPath: "rare.field"}),
    ]);
    // rare.field is wrong 100% of the time; common.field costs a reviewer ten times more work.
    expect(worstOffenders(measurements)[0]!.fieldPath).toBe("common.field");
  });
});

describe("gold candidates", () => {
  it("turns corrections into deduplicated cases, most repeated first", () => {
    const candidates = toGoldCandidates([
      ...repeat(11, {decision: "edit", proposedValue: "71000", correctedValue: "71000000"}),
      row({decision: "edit", proposedValue: "412000000", correctedValue: "398500000"}),
    ]);
    expect(candidates).toHaveLength(2);
    expect(candidates[0]!.occurrences).toBe(11);
    expect(candidates[0]!.errorKind).toBe("scale");
  });

  it("ignores an edit that changed nothing", () => {
    // A reviewer confirming a value through the edit box is not a mistake, and a test case
    // built from it would assert that the extractor's correct answer is wrong.
    expect(toGoldCandidates([row({decision: "edit", proposedValue: "412000000", correctedValue: "412000000"})])).toHaveLength(0);
  });

  it("ignores accepts and rejects, which carry no right answer", () => {
    expect(toGoldCandidates([row({decision: "accept"}), row({decision: "reject"})])).toHaveLength(0);
  });

  it("prioritises scale errors and confident mistakes", () => {
    const candidates = toGoldCandidates([
      row({decision: "edit", proposedValue: "71000", correctedValue: "71000000", confidence: 0.4}),
      row({decision: "edit", proposedValue: "412000000", correctedValue: "398500000", confidence: 0.99}),
      row({decision: "edit", proposedValue: "71412000", correctedValue: "71411986", confidence: 0.99}),
      row({decision: "edit", proposedValue: "500000", correctedValue: "480000", confidence: 0.6}),
    ]);
    const priority = priorityCandidates(candidates);
    // The scale error survives despite low confidence; the rounding nit does not despite high.
    expect(priority.map((entry) => entry.errorKind).sort()).toEqual(["material", "scale"]);
  });

  it("carries no company identifier or filename out of the tenant", () => {
    const [candidate] = toGoldCandidates([row({decision: "edit", correctedValue: "1"})]);
    expect(Object.keys(candidate!).sort()).toEqual([
      "anchorVerified",
      "confidence",
      "documentKind",
      "errorKind",
      "expected",
      "fieldGroup",
      "fieldPath",
      "occurrences",
      "proposed",
      "valueType",
    ]);
  });
});
