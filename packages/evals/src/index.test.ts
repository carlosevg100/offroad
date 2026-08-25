import {createHash} from "node:crypto";
import {existsSync, readFileSync} from "node:fs";
import {dirname, join, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {describe, expect, it} from "vitest";
import {resolveFieldPath} from "@offroad/credit-ontology";
import {
  alignIndexedGroups,
  buildRedeHorizonteGoldFields,
  checkThresholds,
  compareSweep,
  renderSweepMarkdown,
  evaluateSnapshot,
  goldDocumentPath,
  loadGoldCase,
  renderMarkdownReport,
  snapshotFromFixture,
  valuesMatch,
  type ExtractionSnapshot,
} from "./index";
import {goldOutcomeSchema, goldStructureSchema} from "./gold";

describe("gold case contract v2", () => {
  it("separates the route dimensions in an expected structure", () => {
    const structure = goldStructureSchema.parse({
      id: "receivables-fidc",
      classification: "preferred",
      route: {
        capitalNeed: "working_capital",
        repaymentSources: ["receivables_collection"],
        assetBackings: ["receivables"],
        obligationInstruments: ["receivables_assignment"],
        distributedSecurities: ["fidc_senior_quota"],
        structureMechanisms: ["receivables_purchase"],
        capitalVehicles: ["fidc"],
        capitalProviderTypes: ["fidc_manager"],
        distributionRoutes: ["bilateral_private"],
        securityEnhancements: ["overcollateralization"],
      },
    });
    expect(structure.route.capitalVehicles).toEqual(["fidc"]);
    expect(structure.route.obligationInstruments).toEqual(["receivables_assignment"]);
  });

  it("makes the terminal outcome part of the answer key", () => {
    expect(goldOutcomeSchema.parse({
      state: "ready_for_client_authorized_introduction",
      qualifiedIntroductionAllowed: true,
      reasonsInclude: [],
    }).state).toBe("ready_for_client_authorized_introduction");
    expect(() => goldOutcomeSchema.parse({
      state: "material_information_gaps",
      qualifiedIntroductionAllowed: true,
      reasonsInclude: [],
    })).toThrow(/only after client authorization/);
  });
});

const here = dirname(fileURLToPath(import.meta.url));
const goldDir = resolve(here, "..", "..", "testing-fixtures", "gold", "rede-horizonte");
const gold = loadGoldCase(goldDir);

const fixtureDocuments = gold.manifest.documents.map((document, index) => ({
  id: `doc-${index}`,
  original_name: document.name,
  sha256: createHash("sha256").update(readFileSync(goldDocumentPath(gold, document.name))).digest("hex"),
}));

describe("gold case G1 (Rede Horizonte)", () => {
  it("is internally valid: documents exist with the declared hashes, fields resolve in the ontology, ids are unique", () => {
    for (const document of gold.manifest.documents) {
      const path = goldDocumentPath(gold, document.name);
      expect(existsSync(path), path).toBe(true);
      const sha256 = createHash("sha256").update(readFileSync(path)).digest("hex");
      expect(sha256).toBe(document.sha256);
    }
    for (const field of gold.fields) expect(resolveFieldPath(field.fieldPath), field.fieldPath).not.toBeNull();
    for (const profile of gold.profiles) expect(gold.manifest.documents.some((d) => d.name === profile.document)).toBe(true);
    const ids = gold.exceptions.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(gold.exceptions.map((e) => e.id).filter((id) => id.startsWith("RF-"))).toEqual(["RF-01", "RF-02", "RF-03", "RF-04", "RF-05", "RF-06", "RF-07"]);
    expect(gold.acceptance.map((a) => a.id)).toEqual(["AC-01", "AC-02", "AC-03", "AC-04", "AC-05", "AC-06", "AC-07", "AC-08", "AC-09"]);
    expect(gold.acceptance.reduce((sum, a) => sum + a.weight, 0)).toBe(100);
    for (const criterion of gold.acceptance) {
      for (const path of criterion.fieldPaths) expect(gold.fields.some((f) => f.fieldPath === path), path).toBe(true);
      for (const id of criterion.calculationIds) expect(gold.calculations.some((c) => c.id === id), id).toBe(true);
      for (const id of criterion.exceptionIds) expect(gold.exceptions.some((e) => e.id === id), id).toBe(true);
    }
  });

  it("keeps expected/fields.json in sync with the builder (regenerate with `pnpm gold:rede-horizonte`)", () => {
    const built = buildRedeHorizonteGoldFields();
    const committed = JSON.parse(readFileSync(join(goldDir, "expected", "fields.json"), "utf8")) as unknown;
    expect(committed).toEqual(built.fields);
    expect(built.fromFixture).toBe(38);
    expect(built.fields.length).toBeGreaterThan(70);
  });
});

describe("baseline — the fixture extractor that runs in production today", () => {
  const snapshot = snapshotFromFixture(fixtureDocuments);
  const report = evaluateSnapshot(gold, snapshot);

  it("is precise on what it produces but incomplete, unclassified and unverified — the honest baseline", () => {
    expect(report.fields.precision.value).toBe(1);
    expect(report.fields.unscoredCandidates).toBe(0);
    expect(report.fields.material.recall).toBeGreaterThan(0.2);
    expect(report.fields.material.recall).toBeLessThan(0.3);
    expect(report.hallucination).toEqual({autoAcceptedMaterial: 0, withoutVerifiedAnchor: 0, rate: 0});
    expect(report.classification.accuracy).toBeNull();
    expect(report.calculations.matched).toBe(0);
    const detected = report.exceptions.outcomes.filter((o) => o.status === "detected").map((o) => o.id);
    expect(detected).toEqual(expect.arrayContaining(["RF-05", "RF-06", "MI-01", "MI-02", "MI-03"]));
    expect(detected).not.toContain("RF-01");
    expect(detected).not.toContain("RF-02");
    const acceptance = Object.fromEntries(report.acceptance.outcomes.map((o) => [o.id, o.status]));
    expect(acceptance).toMatchObject({"AC-03": "pass", "AC-04": "pass", "AC-09": "pass", "AC-01": "fail", "AC-07": "fail"});
    expect(checkThresholds(report).all).toBe(false);
  });

  it("renders a markdown report with the headline metrics", () => {
    const markdown = renderMarkdownReport(report);
    expect(markdown).toContain("# Eval: rede-horizonte · rede-horizonte-fixture@rede-horizonte-v1");
    expect(markdown).toContain("| Precision on comparable candidates | 100.0% (38/38)");
    expect(markdown).toContain("| RF-05 | medium | detected |");
    expect(markdown).toContain("| AC-03 | 15 | yes | pass | n/a |");
  });
});

describe("a perfect snapshot", () => {
  it("scores 100% on every metric and passes all thresholds", () => {
    const perfect: ExtractionSnapshot = {
      extractor: {name: "perfect", version: "test"},
      documents: gold.manifest.documents.map((d) => d.name),
      profiles: gold.profiles.map((p) => ({document: p.document, kind: p.kind})),
      candidates: gold.fields.map((field) => ({
        fieldPath: field.fieldPath,
        normalizedValue: field.value,
        valueType: field.valueType,
        ...(field.sourceDocument ? {sourceDocument: field.sourceDocument} : {}),
        ...(field.periodStart ? {periodStart: field.periodStart} : {}),
        ...(field.periodEnd ? {periodEnd: field.periodEnd} : {}),
        informationClass: field.fieldPath.startsWith("historical") ? "audited" : field.fieldPath.startsWith("interim") ? "reviewed" : field.fieldPath.startsWith("projections") ? "projection" : field.fieldPath.startsWith("company") ? "company_document" : "management",
        evidenceRank: 3,
        confidence: 0.99,
        anchorVerified: true,
        anchorPrecision: "cell",
        autoAccepted: true,
      })),
      exceptions: gold.exceptions.map((e) => ({type: e.type, severity: e.severity, title: e.id, description: e.keywords[0] ?? e.description, ...(e.ruleId ? {ruleId: e.ruleId} : {})})),
      calculations: gold.calculations.map((c) => ({id: c.id, value: c.value})),
    };
    const report = evaluateSnapshot(gold, perfect);
    expect(report.fields.material.recall).toBe(1);
    expect(report.fields.precision.value).toBe(1);
    expect(report.hallucination.rate).toBe(0);
    expect(report.classification.accuracy).toBe(1);
    expect(report.exceptions.recall).toBe(1);
    expect(report.exceptions.falsePositives).toBe(0);
    expect(report.calculations.recall).toBe(1);
    expect(report.acceptance.criticalFailures).toEqual([]);
    expect(report.acceptance.passedWeight).toBe(100);
    expect(checkThresholds(report).all).toBe(true);
  });

  it("flags hallucinations: auto-accepted material values without a verified anchor", () => {
    const risky: ExtractionSnapshot = {
      extractor: {name: "risky", version: "test"},
      documents: [],
      profiles: [],
      candidates: [{fieldPath: "transaction.requested_amount", normalizedValue: "54000000", valueType: "number", informationClass: "company_document", evidenceRank: 7, confidence: 0.99, anchorVerified: false, anchorPrecision: "page", autoAccepted: true}],
      exceptions: [],
      calculations: [],
    };
    const report = evaluateSnapshot(gold, risky);
    expect(report.hallucination).toEqual({autoAcceptedMaterial: 1, withoutVerifiedAnchor: 1, rate: 1});
    expect(checkThresholds(report).hallucination).toBe(false);
  });
});

describe("value matching", () => {
  it("compares numbers with exact/absolute/relative tolerance, texts by normalized equality, lists as sets", () => {
    expect(valuesMatch("54000000", "54000000.00", "number", {kind: "exact"})).toBe(true);
    expect(valuesMatch("54000000", "54000001", "number", {kind: "exact"})).toBe(false);
    expect(valuesMatch("1.7788", "1.7787878788", "number", {kind: "relative", value: "0.005"})).toBe(true);
    expect(valuesMatch("1.7788", "1.9", "number", {kind: "relative", value: "0.005"})).toBe(false);
    expect(valuesMatch("100", "100.4", "number", {kind: "absolute", value: "0.5"})).toBe(true);
    expect(valuesMatch("abc", "100", "number", {kind: "exact"})).toBe(false);
    expect(valuesMatch("Rede Horizonte Alimentos S.A.", "rede horizonte alimentos s.a.", "text", {kind: "exact"})).toBe(true);
    expect(valuesMatch(JSON.stringify(["Franca", "Araraquara"]), JSON.stringify(["araraquara", "Franca"]), "list", {kind: "exact"})).toBe(true);
    expect(valuesMatch("2027-04-01", "2027-04-01", "date", {kind: "exact"})).toBe(true);
  });
});

describe("indexed tuple alignment", () => {
  const goldFields = [
    {fieldPath: "transaction.sources_and_uses.1.side", value: "sources", valueType: "text", materiality: "material", tolerance: {kind: "exact"}},
    {fieldPath: "transaction.sources_and_uses.1.amount", value: "35000000", valueType: "number", materiality: "material", tolerance: {kind: "exact"}},
    {fieldPath: "transaction.sources_and_uses.2.side", value: "uses", valueType: "text", materiality: "material", tolerance: {kind: "exact"}},
    {fieldPath: "transaction.sources_and_uses.2.amount", value: "49000000", valueType: "number", materiality: "material", tolerance: {kind: "exact"}},
  ] as never[];
  const candidate = (fieldPath: string, normalizedValue: string, valueType: "text" | "number") => ({
    fieldPath,
    normalizedValue,
    valueType,
    informationClass: "company_document" as const,
    evidenceRank: 7,
    confidence: 0.9,
    anchorVerified: true,
    anchorPrecision: "row" as const,
    autoAccepted: false,
  });

  it("matches tuples by content — the index is presentation order, not a fact", () => {
    // The document lists uses first; the answer key lists sources first. Same two facts.
    const aligned = alignIndexedGroups(goldFields, [
      candidate("transaction.sources_and_uses.1.side", "uses", "text"),
      candidate("transaction.sources_and_uses.1.amount", "49000000", "number"),
      candidate("transaction.sources_and_uses.2.side", "sources", "text"),
      candidate("transaction.sources_and_uses.2.amount", "35000000", "number"),
    ]);
    const byPath = new Map(aligned.map((c) => [c.fieldPath, c.normalizedValue]));
    expect(byPath.get("transaction.sources_and_uses.1.side")).toBe("sources");
    expect(byPath.get("transaction.sources_and_uses.1.amount")).toBe("35000000");
    expect(byPath.get("transaction.sources_and_uses.2.side")).toBe("uses");
    expect(byPath.get("transaction.sources_and_uses.2.amount")).toBe("49000000");
  });

  it("does not invent agreement — a tuple that matches nothing keeps failing", () => {
    const aligned = alignIndexedGroups(goldFields, [
      candidate("transaction.sources_and_uses.1.side", "uses", "text"),
      candidate("transaction.sources_and_uses.1.amount", "77000000", "number"),
    ]);
    // Best pairing is gold tuple 2 (side matches); the wrong amount still disagrees with it.
    const byPath = new Map(aligned.map((c) => [c.fieldPath, c.normalizedValue]));
    expect(byPath.get("transaction.sources_and_uses.2.side")).toBe("uses");
    expect(byPath.get("transaction.sources_and_uses.2.amount")).toBe("77000000");
  });

  it("leaves non-indexed candidates untouched", () => {
    const plain = candidate("company.legal_name", "Rede Horizonte", "text");
    const aligned = alignIndexedGroups(goldFields, [plain]);
    expect(aligned).toEqual([plain]);
  });
});

describe("model sweep comparison", () => {
  const base = evaluateSnapshot(gold, snapshotFromFixture(fixtureDocuments));
  const perfect = (costUsd: number): typeof base => ({
    ...base,
    fields: {...base.fields, material: {expected: 65, matched: 65, recall: 1}, precision: {comparable: 65, correct: 65, flagged: 0, value: 1}},
    classification: {expected: 8, correct: 8, accuracy: 1},
    exceptions: {...base.exceptions, recall: 1, falsePositives: 0},
    usage: {costUsd, calls: 10},
  });

  it("recommends the cheapest allowlisted configuration that clears every threshold", () => {
    const comparison = compareSweep([
      {label: "extract:opus-5@high", provider: "anthropic", model: "claude-opus-5", report: perfect(4.0), productionAllowed: true},
      {label: "extract:sonnet-5@medium", provider: "anthropic", model: "claude-sonnet-5", report: perfect(2.4), productionAllowed: true},
      {label: "extract:gpt-4o", provider: "openai", model: "gpt-4o", report: {...base, usage: {costUsd: 0.9, calls: 10}}, productionAllowed: false},
    ]);
    expect(comparison.recommended?.label).toBe("extract:sonnet-5@medium");
    expect(comparison.verdicts.find((v) => v.label === "extract:gpt-4o")?.passesThresholds).toBe(false);
    expect(comparison.cheapestQualified).toBeUndefined();
    const markdown = renderSweepMarkdown(comparison);
    expect(markdown).toContain("**Recommended (cheapest qualifying, already allowlisted):** extract:sonnet-5@medium");
    expect(markdown).toContain("| extract:gpt-4o | sweep only |");
  });

  it("surfaces a cheaper non-allowlisted candidate as evidence, without promoting it", () => {
    const comparison = compareSweep([
      {label: "extract:sonnet-5@medium", provider: "anthropic", model: "claude-sonnet-5", report: perfect(2.4), productionAllowed: true},
      {label: "extract:gpt-4.1", provider: "openai", model: "gpt-4.1", report: perfect(1.48), productionAllowed: false},
    ]);
    expect(comparison.recommended?.label).toBe("extract:sonnet-5@medium");
    expect(comparison.cheapestQualified?.label).toBe("extract:gpt-4.1");
    expect(renderSweepMarkdown(comparison)).toContain("requires the same result on the other gold sets");
  });

  it("refuses to recommend anything when no configuration qualifies", () => {
    const comparison = compareSweep([{label: "fixture", provider: "none", model: "fixture", report: base, productionAllowed: true}]);
    expect(comparison.recommended).toBeUndefined();
    expect(renderSweepMarkdown(comparison)).toContain("**No allowlisted configuration cleared every threshold.**");
  });
});


describe("a contradiction the desk named is not a wrong value", () => {
  it("marks the field flagged and keeps precision when a rule cites the field path", () => {
    const snapshot = snapshotFromFixture(fixtureDocuments);
    const target = gold.fields.find((field) => field.fieldPath === "transaction.requested_amount")!;
    const tampered: ExtractionSnapshot = {
      ...snapshot,
      candidates: snapshot.candidates.map((candidate) => (candidate.fieldPath === target.fieldPath ? {...candidate, normalizedValue: "40000000"} : candidate)),
      exceptions: [...snapshot.exceptions, {ruleId: "R3", type: "source_conflict", severity: "high", title: "Valor solicitado diverge", description: "carta 40.000.000 × memorial 42.300.000", fieldPaths: [target.fieldPath]}],
    };
    const report = evaluateSnapshot(gold, tampered);
    const outcome = report.fields.outcomes.find((entry) => entry.fieldPath === target.fieldPath)!;
    expect(outcome.status).toBe("flagged");
    expect(report.fields.precision.flagged).toBe(1);
    expect(report.fields.precision.value).toBe(1);
    // Without the rule the same candidate is simply wrong.
    const silent = evaluateSnapshot(gold, {...tampered, exceptions: snapshot.exceptions});
    expect(silent.fields.outcomes.find((entry) => entry.fieldPath === target.fieldPath)!.status).toBe("wrong_value");
    expect(silent.fields.precision.value).toBeLessThan(1);
  });
});
