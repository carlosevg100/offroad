import {describe, expect, it} from "vitest";
import {auditVoice} from "@offroad/credit-playbook";
import {
  capitalChartConclusionCodes, capitalChartEvidenceStates, capitalChartGapOrigins, capitalChartOmissionCodes, capitalChartPointRoles,
  capitalChartQuestionCodes, capitalChartReferenceCodes, capitalChartSeriesSchema, capitalChartSeriesVersion, deriveCapitalChartSeries,
  type CapitalChartSeries,
} from "./capital-chart-series";
import {prepareCapitalDecisionDelivery} from "./capital-decision-delivery";
import {capitalDecisionReviewFixture} from "@offroad/testing-fixtures/capital-structure-decision";
import {
  capitalPacketFixtures, negativeCashPacket, partialPacketWithoutProjection, preparedPacket, recommendedPacket, framedPacket,
} from "./capital-packet-variants.test-support";

/** Reads a dot and bracket path such as `decision.alternatives[0].projection` from a value. */
function valueAt(root: unknown, path: string): unknown {
  return path.split(/\.|(?=\[)/).reduce<unknown>((node, segment) => {
    if (node === null || typeof node !== "object") return undefined;
    const index = /^\[(\d+)\]$/.exec(segment);
    return index ? (node as unknown[])[Number(index[1])] : (node as Record<string, unknown>)[segment];
  }, root);
}

function strings(node: unknown, found = new Set<string>()): Set<string> {
  if (typeof node === "string") found.add(node);
  else if (Array.isArray(node)) node.forEach((entry) => strings(entry, found));
  else if (node && typeof node === "object") Object.values(node).forEach((entry) => strings(entry, found));
  return found;
}

function keys(node: unknown, found: string[] = []): string[] {
  if (Array.isArray(node)) node.forEach((entry) => keys(entry, found));
  else if (node && typeof node === "object") for (const [name, value] of Object.entries(node)) {
    found.push(name);
    keys(value, found);
  }
  return found;
}

const piece = (series: CapitalChartSeries, questionCode: string, alternativeId: string) =>
  series.pieces.find((entry) => entry.questionCode === questionCode && entry.alternativeId === alternativeId)!;
const values = (series: CapitalChartSeries, questionCode: string, alternativeId: string) =>
  piece(series, questionCode, alternativeId).points.map((point) => [point.periodLabel, point.value]);

// Packets are rebuilt from fixtures many times per test; under the concurrent CI suite that
// takes seconds, not milliseconds. Latency is not what these tests measure.
describe("capital chart series", {timeout: 30_000}, () => {
  it.each(capitalPacketFixtures)("derives two pieces per calculated alternative from the %s packet, each point read from its path", (_name, build) => {
    const packet = build();
    const series = deriveCapitalChartSeries(packet);
    expect(series.schemaVersion).toBe("capital-chart-series.v1");
    expect(series.version).toBe(capitalChartSeriesVersion);
    expect(series.packet).toEqual({schemaVersion: packet.schemaVersion, status: packet.status, fingerprint: packet.fingerprint});
    expect(series.pieces.map((entry) => entry.pieceId)).toEqual([
      "lowest_available_cash_by_period:maintain", "largest_net_financing_outflow_by_period:maintain",
      "lowest_available_cash_by_period:change", "largest_net_financing_outflow_by_period:change",
    ]);
    expect(series.omissions).toEqual([]);
    const resolvable = strings(packet);
    for (const entry of series.pieces) {
      expect(entry.unit).toBe("BRL");
      expect(entry.reference).toEqual({code: "zero", value: "0"});
      expect(valueAt(packet, entry.decisiveNumber.path)).toBe(entry.decisiveNumber.value);
      expect(entry.conclusion.values.value).toBe(entry.decisiveNumber.value);
      for (const point of entry.points) {
        expect(valueAt(packet, point.path)).toBe(point.value);
        expect(point.sourceIds.length).toBeGreaterThan(0);
        for (const id of point.sourceIds) expect(resolvable.has(id), `${point.path} ${id}`).toBe(true);
      }
      for (const id of entry.hypothesisIds) expect(resolvable.has(id)).toBe(true);
      for (const gap of entry.gaps) expect(resolvable.has(gap.code)).toBe(true);
    }
  });

  it("plots the packet's own numbers: the lowest period-end cash and the largest net financing outflow", () => {
    const [, build] = capitalPacketFixtures[2];
    const series = deriveCapitalChartSeries(build());
    expect(values(series, "lowest_available_cash_by_period", "maintain")).toEqual([["2027-01-31", "325"], ["2027-02-28", "123"]]);
    expect(values(series, "largest_net_financing_outflow_by_period", "maintain")).toEqual([["2027-01-31", "95"], ["2027-02-28", "-242"]]);
    expect(values(series, "lowest_available_cash_by_period", "change")).toEqual([["2027-01-31", "325"], ["2027-02-28", "144.5"]]);
    expect(values(series, "largest_net_financing_outflow_by_period", "change")).toEqual([["2027-01-31", "95"], ["2027-02-28", "-220.5"]]);
    const cash = piece(series, "lowest_available_cash_by_period", "maintain");
    expect(cash.decisiveNumber).toEqual({path: "decision.alternatives[0].projection.rows[1].closingAvailable", value: "123"});
    expect(cash.conclusion).toEqual({code: "minimum_above_reference", values: {periodLabel: "2027-02-28", value: "123", periodsBelowReference: 0}});
    const financing = piece(series, "largest_net_financing_outflow_by_period", "change");
    expect(financing.decisiveNumber).toEqual({path: "decision.alternatives[1].projection.rows[1].netFinancingAvailable", value: "-220.5"});
    expect(financing.conclusion).toEqual({code: "minimum_below_reference", values: {periodLabel: "2027-02-28", value: "-220.5", periodsBelowReference: 1}});
    expect(cash.points[0]!.sourceIds).toEqual([build().decision.alternatives[0]!.projection.basisFingerprint, build().decision.alternatives[0]!.projection.calculationFingerprint]);
  });

  it("marks available cash below zero with the period, the number and the count of periods", () => {
    const series = deriveCapitalChartSeries(negativeCashPacket());
    expect(values(series, "lowest_available_cash_by_period", "maintain")).toEqual([["2027-01-31", "145"], ["2027-02-28", "-237"]]);
    expect(piece(series, "lowest_available_cash_by_period", "maintain").conclusion)
      .toEqual({code: "minimum_below_reference", values: {periodLabel: "2027-02-28", value: "-237", periodsBelowReference: 1}});
  });

  it("resolves a value on the reference line and ties to the earliest period", () => {
    const packet = preparedPacket();
    const rows = packet.decision.alternatives[0]!.projection.rows!;
    rows[0]!.closingAvailable = "0"; rows[1]!.closingAvailable = "0.0";
    const cash = piece(deriveCapitalChartSeries(packet), "lowest_available_cash_by_period", "maintain");
    expect(cash.decisiveNumber).toEqual({path: "decision.alternatives[0].projection.rows[0].closingAvailable", value: "0"});
    expect(cash.conclusion).toEqual({code: "minimum_at_reference", values: {periodLabel: "2027-01-31", value: "0", periodsBelowReference: 0}});
  });

  it("puts the recommended alternative in focus and keeps every other alternative a candidate", () => {
    const series = deriveCapitalChartSeries(recommendedPacket("change"));
    expect(series.recommendedAlternativeId).toBe("change");
    for (const entry of series.pieces) {
      const role = entry.alternativeId === "change" ? "focus" : "candidate";
      expect(entry.points.every((point) => point.role === role), entry.pieceId).toBe(true);
    }
    const [, build] = capitalPacketFixtures[2];
    const unranked = deriveCapitalChartSeries(build());
    expect(unranked.recommendedAlternativeId).toBeNull();
    expect(unranked.pieces.flatMap((entry) => entry.points).every((point) => point.role === "candidate")).toBe(true);
  });

  it("keeps the gaps and hypotheses of each alternative in its pieces and derives the evidence state from them", () => {
    const [, integrated] = capitalPacketFixtures[3];
    const series = deriveCapitalChartSeries(integrated());
    const bound = piece(series, "lowest_available_cash_by_period", "maintain");
    expect(bound.gaps).toEqual([{origin: "contractual", subjectId: "leverage", code: "contract_source_interpretation_and_applicability_review_required"}]);
    expect(bound.evidenceState).toBe("preview_with_gap");
    const free = piece(series, "lowest_available_cash_by_period", "change");
    expect(free.gaps).toEqual([]);
    expect(free.hypothesisIds).toHaveLength(61);
    expect(free.evidenceState).toBe("conditional_on_hypothesis");
    const [, indexed] = capitalPacketFixtures[4];
    expect(piece(deriveCapitalChartSeries(indexed()), "largest_net_financing_outflow_by_period", "maintain").gaps)
      .toEqual([{origin: "contractual", subjectId: "indexed", code: "indexed_interest_interpretation_and_adoption_review_required"}]);
  });

  it("calls a piece complete only for a prepared packet without hypotheses, gaps or conditional reviews", () => {
    const prepared = preparedPacket();
    expect(prepared.status).toBe("prepared_for_human_review");
    expect(deriveCapitalChartSeries(prepared).pieces.every((entry) => entry.evidenceState === "conditional_on_hypothesis")).toBe(true);
    prepared.decision.alternatives[0]!.projection.hypothesisIds = [];
    const series = deriveCapitalChartSeries(prepared);
    expect(piece(series, "lowest_available_cash_by_period", "maintain").evidenceState).toBe("complete_in_verified_scope");
    expect(piece(series, "lowest_available_cash_by_period", "change").evidenceState).toBe("conditional_on_hypothesis");
    const conditional = preparedPacket(4);
    expect(conditional.decision.conditionalReviews).toHaveLength(1);
    conditional.decision.alternatives[0]!.projection.hypothesisIds = [];
    expect(piece(deriveCapitalChartSeries(conditional), "lowest_available_cash_by_period", "maintain").evidenceState).toBe("conditional_on_hypothesis");
    const [, base] = capitalPacketFixtures[2];
    const pending = base();
    pending.decision.alternatives[0]!.projection.hypothesisIds = [];
    expect(piece(deriveCapitalChartSeries(pending), "lowest_available_cash_by_period", "maintain").evidenceState).toBe("preview_with_gap");
  });

  it("produces zero pieces for a partial packet without projection, never an invented number", () => {
    const packet = partialPacketWithoutProjection();
    expect(packet.status).toBe("partial");
    const series = deriveCapitalChartSeries(packet);
    expect(series.pieces).toEqual([]);
    expect(series.omissions).toEqual(["maintain", "change"].map((alternativeId) => ({alternativeId, reasonCode: "projection_rows_absent", gaps: [
      {origin: "information", subjectId: alternativeId, code: "projection_input_missing"},
      {origin: "information", subjectId: alternativeId, code: "projection_incomplete"},
    ]})));
    const framed = deriveCapitalChartSeries(framedPacket());
    expect(framed.packet.status).toBe("framed");
    expect(framed.pieces).toEqual([]);
    expect(framed.omissions).toEqual([]);
  });

  it("reproduces the same bytes for equal input and never mutates the packet", () => {
    for (const [, build] of capitalPacketFixtures) {
      const packet = build();
      const before = structuredClone(packet);
      const first = JSON.stringify(deriveCapitalChartSeries(packet));
      expect(JSON.stringify(deriveCapitalChartSeries(JSON.parse(JSON.stringify(packet))))).toBe(first);
      expect(JSON.stringify(deriveCapitalChartSeries(build()))).toBe(first);
      expect(packet).toEqual(before);
    }
  });

  it("has no style field in any piece and refuses one by contract", () => {
    const forbidden = /colou?r|dash|stroke|style|size|width|height|thickness|font|fill|opacity|thumbnail|line/i;
    for (const [, build] of [...capitalPacketFixtures, ["recommended", () => recommendedPacket("maintain")] as const]) {
      const series = deriveCapitalChartSeries(build());
      expect(keys(series).filter((name) => forbidden.test(name))).toEqual([]);
    }
    const [, build] = capitalPacketFixtures[2];
    const series = deriveCapitalChartSeries(build());
    const [first, ...rest] = series.pieces;
    expect(capitalChartSeriesSchema.safeParse(series).success).toBe(true);
    for (const extra of [{color: "red"}, {lineStyle: "dotted"}, {thumbnail: true}, {size: 3}]) {
      expect(capitalChartSeriesSchema.safeParse({...series, pieces: [{...first!, ...extra}, ...rest]}).success).toBe(false);
      expect(capitalChartSeriesSchema.safeParse({...series, pieces: [{...first!, points: [{...first!.points[0]!, ...extra}]}, ...rest]}).success).toBe(false);
    }
    expect(capitalChartSeriesSchema.safeParse({...series, pieces: [{...first!, conclusion: {code: "free_text", values: first!.conclusion.values}}, ...rest]}).success).toBe(false);
  });

  it("is exported from the package index with the MD test evaluator", async () => {
    const index = await import("./index");
    expect(index.deriveCapitalChartSeries).toBe(deriveCapitalChartSeries);
    expect(index.capitalChartSeriesSchema).toBe(capitalChartSeriesSchema);
    expect(typeof index.evaluateMdTest).toBe("function");
    expect(index.capitalMdTestVersion).toBe("2026.09.24-v1");
  });

  it("refuses anything but a procedure packet", () => {
    const [, build] = capitalPacketFixtures[2];
    const delivery = prepareCapitalDecisionDelivery({review: capitalDecisionReviewFixture().input, material: {requested: false, audience: "authorized_work_participants"}});
    expect(() => deriveCapitalChartSeries(delivery)).toThrow();
    expect(() => deriveCapitalChartSeries({...build(), chart: {color: "red"}})).toThrow();
    expect(() => deriveCapitalChartSeries(null)).toThrow();
  });

  it("emits codes and paths that carry no blocked voice pattern", () => {
    const codes = [
      ...capitalChartQuestionCodes, ...capitalChartPointRoles, ...capitalChartReferenceCodes, ...capitalChartConclusionCodes,
      ...capitalChartEvidenceStates, ...capitalChartOmissionCodes, ...capitalChartGapOrigins, "capital-chart-series.v1", capitalChartSeriesVersion,
    ];
    expect(auditVoice(codes, {channel: "packet"})).toEqual([]);
    const paths = [...capitalPacketFixtures.map(([, build]) => build()), negativeCashPacket(), recommendedPacket("change")]
      .flatMap((packet) => deriveCapitalChartSeries(packet).pieces)
      .flatMap((entry) => [entry.pieceId.split(":")[0]!, entry.decisiveNumber.path, ...entry.points.map((point) => point.path)]);
    expect(paths.length).toBeGreaterThan(0);
    expect(auditVoice(paths, {channel: "packet"}).filter((finding) => finding.severity === "block")).toEqual([]);
  });
});
