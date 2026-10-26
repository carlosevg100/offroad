import {createHash} from "node:crypto";
import {describe, expect, it} from "vitest";
import type {AdoptionBasisEntry, AdoptionBasisSnapshot} from "@offroad/reconciliation";
import {composeBoundReceivablesFunding} from "./receivables-funding-composer";
import {prepareReceivablesFundingPacket} from "./receivables-funding-packet";
import {proposeReceivablesFundingHypotheses, type ReceivablesFundingFacts} from "./receivables-funding-premises";
import {auroraReceivablesFundingBasis, auroraReceivablesFundingFacts} from "./receivables-funding.test-support";
import {analysisTestId as id} from "./adopted-analysis.test-support";

const question = "Tenho uns 60 milhões de recebíveis. Dá para usar isso para financiar a safra em vez da linha do banco?";
function envelopeOf(entries: AdoptionBasisEntry[]) {
  const snapshot: AdoptionBasisSnapshot = {schemaVersion: "contextual-adoption.v1", versionId: id(500), setId: id(6), workId: id(7), purpose: "synthetic receivables funding",
    contextKey: "recebiveis-giro", revision: 1, previousVersionId: null, classification: "working_basis", entries};
  const canonical = JSON.stringify(snapshot);
  return {envelope: {canonical, fingerprint: createHash("sha256").update(canonical).digest("hex")}, scope: {workId: id(7), purpose: snapshot.purpose, versionId: id(500)}};
}
function adopt(facts: ReceivablesFundingFacts) {
  let n = 9000;
  const entries = proposeReceivablesFundingHypotheses(facts).map((h) => ({decisionId: id(n++), slotKey: createHash("sha256").update(h.fieldPath + h.dimensions.scenario).digest("hex"),
    kind: "hypothesis", fieldPath: h.fieldPath, dimensions: {...h.dimensions}, value: h.value, observationId: null, referenceValue: null, referenceDimensions: null,
    definitionKind: "managerial", actorId: id(5), reason: h.reason}) as AdoptionBasisEntry);
  return {entries, ...envelopeOf(entries)};
}
const packetOf = (b: ReturnType<typeof envelopeOf>) => prepareReceivablesFundingPacket(composeBoundReceivablesFunding({envelope: b.envelope, scope: b.scope, question}));
const n = (v: string | null | undefined, p = 1) => Number(v).toFixed(p);

describe("C35 premises proposed from facts with origin, adopted, composed and measured", {timeout: 180000}, () => {
  it("stays inside the basis limit and states the origin of every premise", () => {
    const h = proposeReceivablesFundingHypotheses(auroraReceivablesFundingFacts());
    expect(h.length).toBe(168);
    expect(h.every((x) => x.reason.startsWith("Origem: "))).toBe(true);
    expect(h.find((x) => x.fieldPath.endsWith(".item.varejo-selecionado.amount"))!.reason).toMatch(/^Origem: estimativa\./);
    expect(h.find((x) => x.fieldPath.endsWith(".option.fidc-com-coobrigacao.rate"))!.reason).toMatch(/^Origem: faixa de mercado\./);
    const many = auroraReceivablesFundingFacts(), extra = many.items[1]!;
    for (let i = 0; i < 8; i++) many.items.push({...extra, value: {...extra.value, id: `extra-${i}`}});
    expect(() => proposeReceivablesFundingHypotheses(many)).toThrow("receivables_funding_premises_exceed_basis");
  });
  it("reproduces the hand-built basis: same readings and numbers", () => {
    const p = packetOf(envelopeOf(adopt(auroraReceivablesFundingFacts()).entries));
    const reference = prepareReceivablesFundingPacket({schemaVersion: "receivables-funding-packet-input.v1", question, analysis: auroraReceivablesFundingBasis().seal()});
    expect(p.status).toBe(reference.status);
    expect(p.readings).toEqual(reference.readings);
    expect(p.result.funding).toEqual(reference.result.funding);
    expect(p.gaps.map((g) => g.reason)).toEqual(["largest_debtor_not_informed", "largest_debtor_not_informed"]);
    const r = p.readings!;
    expect([r.assignable, r.plan.at(-1)!.cumulative, r.bankLineReserve]).toEqual(["25", "25", "linha-giro"]);
    expect(r.options.map((o) => [o.id, n(o.cost, 2)])).toEqual([["risco-sacado-b", "1.33"], ["fidc-com-coobrigacao", "1.75"], ["linha-giro", "1.82"], ["desconto-bancario", "1.96"], ["fidc-sem-coobrigacao", "2.08"]]);
  });
  it("declares an absent mandatory operand missing and leaves an absent optional one null", () => {
    const a = adopt(auroraReceivablesFundingFacts());
    const gapped = packetOf(envelopeOf(a.entries.filter((e) => !e.fieldPath.endsWith(".needPeak"))));
    expect(gapped.status).toBe("framed");
    expect(gapped.gaps.some((g) => g.operand.endsWith(".needPeak") && g.reason.startsWith("No contribution adopted for needPeak"))).toBe(true);
    const facts = auroraReceivablesFundingFacts(); facts.lienBasketRemaining = null;
    const b = adopt(facts), input = composeBoundReceivablesFunding({...envelopeOf(b.entries), question});
    expect(input.analysis.lienBasketRemaining).toBeNull();
    expect(packetOf(envelopeOf(b.entries)).result.funding!.options.every((o) => o.fitsLienBasket === null)).toBe(true);
    // The bank line has no eligibility term in the basis, so it is composed without eligibility.
    expect(input.analysis.options.find((o) => o.id === "linha-giro")!.eligibility).toBeNull();
  });
  it("reports two contributions for one slot as missing, never picks one", () => {
    const a = adopt(auroraReceivablesFundingFacts()), twin = a.entries.find((e) => e.fieldPath.endsWith(".item.rede-a.contract"))!;
    const entries = [...a.entries, {...twin, decisionId: id(9999), slotKey: "f".repeat(64), value: {type: "text" as const, value: "assignable"}}];
    const input = composeBoundReceivablesFunding({...envelopeOf(entries), question});
    expect(input.analysis.items.find((i) => i.id === "rede-a")!.contract.missingReason).toContain("2 contributions match item.rede-a.contract");
    expect(packetOf(envelopeOf(entries)).status).toBe("framed");
  });
  it("composes every listed or named item and never drops one silently", () => {
    const a = adopt(auroraReceivablesFundingFacts());
    const order = a.entries.find((e) => e.fieldPath.endsWith(".order.items"))!;
    const unlisted = a.entries.map((e) => e === order ? {...e, value: {type: "list" as const, value: (e.value.value as string[]).filter((x) => x !== "rede-a")}} : e);
    const input = composeBoundReceivablesFunding({...envelopeOf(unlisted), question});
    expect(input.analysis.items.map((i) => i.id).at(-1)).toBe("rede-a");
    expect(packetOf(envelopeOf(unlisted)).readings!.gross).toBe("62");
    const ghost = a.entries.map((e) => e === order ? {...e, value: {type: "list" as const, value: [...(e.value.value as string[]), "fantasma"]}} : e);
    const g = composeBoundReceivablesFunding({...envelopeOf(ghost), question}).analysis.items.find((i) => i.id === "fantasma")!;
    expect([g.label.decisionId, g.amount.decisionId]).toEqual([null, null]);
    expect(packetOf(envelopeOf(ghost)).status).toBe("framed");
  });
  it("refuses inconsistent facts before proposing premises", () => {
    const holder = auroraReceivablesFundingFacts(); holder.items[1]!.value.encumbranceHolder = null;
    expect(() => proposeReceivablesFundingHypotheses(holder)).toThrow("must name the holder of its encumbrance");
    const line = auroraReceivablesFundingFacts(); line.options[4]!.value.eligibility = line.options[1]!.value.eligibility;
    expect(() => proposeReceivablesFundingHypotheses(line)).toThrow("only the bank line has no eligibility");
    const orphan = auroraReceivablesFundingFacts(); orphan.options[0]!.value.eligibility!.anchorItemIds = ["nenhum"];
    expect(() => proposeReceivablesFundingHypotheses(orphan)).toThrow("names an item the analysis does not carry");
    const lead = auroraReceivablesFundingFacts(); lead.options[1]!.value.leadDaysMax = null;
    expect(() => proposeReceivablesFundingHypotheses(lead)).toThrow("both lead days or neither");
    const precise = auroraReceivablesFundingFacts(); precise.needAverage.value = "17.123456789";
    expect(() => proposeReceivablesFundingHypotheses(precise)).toThrow();
  });
});
