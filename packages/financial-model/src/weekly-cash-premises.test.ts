import {createHash} from "node:crypto";
import {describe, expect, it} from "vitest";
import type {AdoptionBasisEntry, AdoptionBasisSnapshot} from "@offroad/reconciliation";
import {composeBoundWeeklyCash} from "./weekly-cash-composer";
import {prepareWeeklyCashPacket} from "./weekly-cash-packet";
import {proposeWeeklyCashHypotheses, type WeeklyCashFacts} from "./weekly-cash-premises";
import {auroraWeeklyCashBasis, auroraWeeklyCashFacts} from "./weekly-cash.test-support";
import {analysisTestId as id} from "./adopted-analysis.test-support";

const question = "Como fica o caixa até dezembro e o que vence?";
function envelopeOf(entries: AdoptionBasisEntry[]) {
  const snapshot: AdoptionBasisSnapshot = {schemaVersion: "contextual-adoption.v1", versionId: id(500), setId: id(6), workId: id(7), purpose: "synthetic weekly cash",
    contextKey: "caixa-semanal", revision: 1, previousVersionId: null, classification: "working_basis", entries};
  const canonical = JSON.stringify(snapshot);
  return {envelope: {canonical, fingerprint: createHash("sha256").update(canonical).digest("hex")}, scope: {workId: id(7), purpose: snapshot.purpose, versionId: id(500)}};
}
function adopt(facts: WeeklyCashFacts) {
  let n = 9000;
  const entries = proposeWeeklyCashHypotheses(facts).map((h) => ({decisionId: id(n++), slotKey: createHash("sha256").update(h.fieldPath + h.dimensions.scenario).digest("hex"),
    kind: "hypothesis", fieldPath: h.fieldPath, dimensions: {...h.dimensions}, value: h.value, observationId: null, referenceValue: null, referenceDimensions: null,
    definitionKind: "managerial", actorId: id(5), reason: h.reason}) as AdoptionBasisEntry);
  return {entries, ...envelopeOf(entries)};
}
const packetOf = (b: ReturnType<typeof envelopeOf>) => prepareWeeklyCashPacket(composeBoundWeeklyCash({envelope: b.envelope, scope: b.scope, question}));
const n = (v: string | null | undefined, p = 1) => Number(v).toFixed(p);

describe("C18 premises proposed from facts with origin, adopted, composed and measured", {timeout: 180000}, () => {
  it("stays inside the basis limit and states the origin of every premise", () => {
    const h = proposeWeeklyCashHypotheses(auroraWeeklyCashFacts());
    expect(h.length).toBe(200);
    expect(h.every((x) => x.reason.startsWith("Origem: "))).toBe(true);
    const many = auroraWeeklyCashFacts(), extra = many.streams[0]!;
    for (let i = 0; i < 16; i++) many.streams.push({...extra, value: {...extra.value, id: `extra-${i}`}});
    expect(() => proposeWeeklyCashHypotheses(many)).toThrow("weekly_cash_premises_exceed_basis");
  });
  it("reproduces the hand-built basis: same readings and numbers", () => {
    const p = packetOf(envelopeOf(adopt(auroraWeeklyCashFacts()).entries));
    const reference = prepareWeeklyCashPacket({schemaVersion: "weekly-cash-packet-input.v1", question, analysis: auroraWeeklyCashBasis().seal()});
    expect(p.status).toBe("prepared_for_human_review");
    expect(p.readings).toEqual(reference.readings);
    expect(p.result.weekly).toEqual(reference.result.weekly);
    expect(p.gaps).toEqual([]);
    const r = p.readings!;
    expect([r.tightestWeek.weekStart, n(r.tightestWeek.closing), r.weeksBelowMinimum]).toEqual(["2026-12-21", "7.5", ["2026-12-14", "2026-12-21"]]);
    expect(r.closingHidesTheWeek).toBe(true);
    expect(r.cheapestCoveringAction).toMatchObject({id: "conta-garantida", openAtCovenantTest: true});
    expect(r.actionsByCost.map((a) => [a.id, n(a.cost, 2), a.covers])).toEqual([["conta-garantida", "0.12", true], ["antecipacao", "0.25", true], ["linha-25", "0.87", true]]);
    expect(r.sensitivities.map((s) => [s.caseId, n(s.minimum)])).toEqual([["sem-linha", "-9.5"], ["safra-30", "2.5"], ["safra-adiada", "12.0"]]);
  });
  it("declares an absent mandatory operand missing and leaves an absent optional one null", () => {
    const a = adopt(auroraWeeklyCashFacts());
    const gapped = packetOf(envelopeOf(a.entries.filter((e) => !e.fieldPath.endsWith(".openingCash"))));
    expect(gapped.status).toBe("framed");
    expect(gapped.gaps.some((g) => g.operand.endsWith(".openingCash") && g.reason.startsWith("No contribution adopted for openingCash"))).toBe(true);
    const facts = auroraWeeklyCashFacts(); facts.covenantTestDate = null;
    const b = adopt(facts), input = composeBoundWeeklyCash({...envelopeOf(b.entries), question});
    expect(input.analysis.covenantTestDate).toBeNull();
    const p = packetOf(envelopeOf(b.entries));
    expect(p.gaps).toEqual([]);
    expect(p.readings!.cheapestCoveringAction).toMatchObject({id: "conta-garantida", openAtCovenantTest: null});
  });
  it("reports two contributions for one slot as missing, never picks one", () => {
    const a = adopt(auroraWeeklyCashFacts()), twin = a.entries.find((e) => e.fieldPath.endsWith(".minimumCash"))!;
    const entries = [...a.entries, {...twin, decisionId: id(9999), slotKey: "f".repeat(64), value: {type: "number" as const, value: "20"}}];
    const input = composeBoundWeeklyCash({...envelopeOf(entries), question});
    expect(input.analysis.minimumCash.decisionId).toBeNull();
    expect(input.analysis.minimumCash.missingReason).toContain("2 contributions match minimumCash");
    expect(packetOf(envelopeOf(entries)).status).toBe("framed");
  });
  it("composes every listed or named item and never drops one silently", () => {
    const a = adopt(auroraWeeklyCashFacts()), without = (suffix: string) => envelopeOf(a.entries.filter((e) => !e.fieldPath.endsWith(suffix)));
    expect(() => composeBoundWeeklyCash({...without(".case.sem-linha.role"), question})).toThrow("weekly_cash_case_role_missing");
    expect(() => composeBoundWeeklyCash({...without(".case.sem-linha.streamIds"), question})).toThrow("weekly_cash_case_streams_missing");
    expect(() => composeBoundWeeklyCash({...without(".action.antecipacao.streamId"), question})).toThrow("weekly_cash_action_stream_missing");
    const noDates = composeBoundWeeklyCash({...without(".stream.fgts.dates"), question});
    expect(noDates.analysis.streams.find((s) => s.id === "fgts")!.dates.missingReason).toBe("No contribution adopted for stream.fgts.dates in scenario base");
    expect(packetOf(without(".stream.fgts.dates")).status).toBe("framed");
    // An id named by a field path but missing from the adopted order is still composed, after the listed ones.
    const order = a.entries.find((e) => e.fieldPath.endsWith(".order.cases"))!;
    const unlisted = a.entries.map((e) => e === order ? {...e, value: {type: "list" as const, value: (e.value.value as string[]).filter((x) => x !== "sem-linha")}} : e);
    const input = composeBoundWeeklyCash({...envelopeOf(unlisted), question});
    expect(input.analysis.cases.map((c) => c.id).at(-1)).toBe("sem-linha");
    expect(packetOf(envelopeOf(unlisted)).readings!.sensitivities.map((s) => s.caseId)).toContain("sem-linha");
    // A listed stream with no adopted field is composed with every operand missing.
    const streams = a.entries.find((e) => e.fieldPath.endsWith(".order.streams"))!;
    const ghost = a.entries.map((e) => e === streams ? {...e, value: {type: "list" as const, value: [...(e.value.value as string[]), "fantasma"]}} : e);
    const g = composeBoundWeeklyCash({...envelopeOf(ghost), question}).analysis.streams.find((s) => s.id === "fantasma")!;
    expect([g.label.decisionId, g.dates.decisionId, g.amounts.decisionId]).toEqual([null, null, null]);
  });
  it("refuses inconsistent facts before proposing premises", () => {
    const long = auroraWeeklyCashFacts(); long.streams[0]!.value.id = "a".repeat(41);
    expect(() => proposeWeeklyCashHypotheses(long)).toThrow();
    const short = auroraWeeklyCashFacts(); short.streams[1]!.value.amounts.pop();
    expect(() => proposeWeeklyCashHypotheses(short)).toThrow("must have one amount per date");
    const orphan = auroraWeeklyCashFacts(); orphan.actions[0]!.value.streamId = "nenhum";
    expect(() => proposeWeeklyCashHypotheses(orphan)).toThrow("needs an action inflow stream");
    const replaces = auroraWeeklyCashFacts(); replaces.actions[2]!.value.replacesStreamId = "nenhum";
    expect(() => proposeWeeklyCashHypotheses(replaces)).toThrow("replaces a stream the analysis does not carry");
    const costless = auroraWeeklyCashFacts(); costless.actions.pop();
    expect(() => proposeWeeklyCashHypotheses(costless)).toThrow("is an action without its terms");
    const two = auroraWeeklyCashFacts(); two.cases[1]!.value.role = "informed";
    expect(() => proposeWeeklyCashHypotheses(two)).toThrow("Exactly one informed case");
    const unknown = auroraWeeklyCashFacts(); unknown.cases[0]!.value.streamIds.push("nenhum");
    expect(() => proposeWeeklyCashHypotheses(unknown)).toThrow("names a stream the analysis does not carry");
    const outside = auroraWeeklyCashFacts(); outside.streams[1]!.value.dates[0] = "2027-02-01";
    expect(() => proposeWeeklyCashHypotheses(outside)).toThrow("event outside the horizon");
    const tuesday = auroraWeeklyCashFacts(); tuesday.openingDate = "2026-09-15";
    expect(() => proposeWeeklyCashHypotheses(tuesday)).toThrow("must be a Monday");
    const inflowDue = auroraWeeklyCashFacts(); inflowDue.streams[0]!.value.obligation = "payroll";
    expect(() => proposeWeeklyCashHypotheses(inflowDue)).toThrow("not an outflow");
    const precise = auroraWeeklyCashFacts(); precise.openingCash.value = "41.123456789";
    expect(() => proposeWeeklyCashHypotheses(precise)).toThrow();
  });
});
