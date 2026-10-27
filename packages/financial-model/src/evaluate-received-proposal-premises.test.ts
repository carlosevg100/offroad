import {createHash} from "node:crypto";
import {describe, expect, it} from "vitest";
import type {AdoptionBasisEntry, AdoptionBasisSnapshot} from "@offroad/reconciliation";
import {composeBoundReceivedProposal} from "./evaluate-received-proposal-composer";
import {prepareReceivedProposalPacket} from "./evaluate-received-proposal-packet";
import {proposeReceivedProposalHypotheses, type ReceivedProposalFacts} from "./evaluate-received-proposal-premises";
import {auroraReceivedProposalBasis, auroraReceivedProposalFacts, receivedProposalQuestion as question} from "./evaluate-received-proposal.test-support";
import {analysisTestId as id} from "./adopted-analysis.test-support";

function envelopeOf(entries: AdoptionBasisEntry[]) {
  const snapshot: AdoptionBasisSnapshot = {schemaVersion: "contextual-adoption.v1", versionId: id(500), setId: id(6), workId: id(7), purpose: "synthetic received proposal",
    contextKey: "proposta-recebida", revision: 1, previousVersionId: null, classification: "working_basis", entries};
  const canonical = JSON.stringify(snapshot);
  return {envelope: {canonical, fingerprint: createHash("sha256").update(canonical).digest("hex")}, scope: {workId: id(7), purpose: snapshot.purpose, versionId: id(500)}};
}
function adopt(facts: ReceivedProposalFacts) {
  let n = 9000;
  const entries = proposeReceivedProposalHypotheses(facts).map((h) => ({decisionId: id(n++), slotKey: createHash("sha256").update(h.fieldPath + h.dimensions.scenario).digest("hex"),
    kind: "hypothesis", fieldPath: h.fieldPath, dimensions: {...h.dimensions}, value: h.value, observationId: null, referenceValue: null, referenceDimensions: null,
    definitionKind: "managerial", actorId: id(5), reason: h.reason}) as AdoptionBasisEntry);
  return {entries, ...envelopeOf(entries)};
}
const packetOf = (b: ReturnType<typeof envelopeOf>) => prepareReceivedProposalPacket(composeBoundReceivedProposal({envelope: b.envelope, scope: b.scope, question}));

describe("ficha 1 premises proposed from facts with origin, adopted, composed and measured", {timeout: 300_000}, () => {
  it("stays inside the basis limit and states the origin of every premise", () => {
    const h = proposeReceivedProposalHypotheses(auroraReceivedProposalFacts());
    expect(h.length).toBeLessThanOrEqual(256);
    expect(h.every((x) => x.reason.startsWith("Origem: "))).toBe(true);
    expect(h.find((x) => x.fieldPath.endsWith(".proposal.drawDate"))!.reason).toMatch(/^Origem: estimativa\./);
    expect(h.find((x) => x.fieldPath.endsWith(".proposal.annualSpread"))!.reason).toMatch(/^Origem: documento\./);
    expect(h.find((x) => x.fieldPath.endsWith(".market.median"))!.reason).toMatch(/^Origem: faixa de mercado\./);
  });
  it("reproduces the hand-built basis: same readings and numbers", () => {
    const p = packetOf(envelopeOf(adopt(auroraReceivedProposalFacts()).entries));
    const reference = prepareReceivedProposalPacket({schemaVersion: "received-proposal-packet-input.v1", question, analysis: auroraReceivedProposalBasis().seal()});
    expect(p.status).toBe(reference.status);
    expect(p.readings).toEqual(reference.readings);
    expect(p.result.evaluation).toEqual(reference.result.evaluation);
    expect([p.readings!.collateral.assignable, p.readings!.negativePledge.remaining]).toEqual(["25.41", "3"]);
  });
  it("declares an absent mandatory operand missing and leaves an absent optional group null", () => {
    const a = adopt(auroraReceivedProposalFacts());
    const gapped = packetOf(envelopeOf(a.entries.filter((e) => !e.fieldPath.endsWith(".basket.occupied"))));
    expect(gapped.status).toBe("framed");
    expect(gapped.gaps.some((g) => g.operand.endsWith(".basket.occupied") && g.reason.startsWith("No contribution adopted for basket.occupied"))).toBe(true);
    const facts = auroraReceivedProposalFacts(); facts.policy = null; facts.history = null;
    const input = composeBoundReceivedProposal({...envelopeOf(adopt(facts).entries), question});
    expect([input.analysis.covenant.policyLimit, input.analysis.history]).toEqual([null, null]);
    expect(packetOf(envelopeOf(adopt(facts).entries)).status).toBe("partial");
  });
  it("reports two contributions for one slot as missing, never picks one", () => {
    const a = adopt(auroraReceivedProposalFacts()), twin = a.entries.find((e) => e.fieldPath.endsWith(".basket.basis"))!;
    const entries = [...a.entries, {...twin, decisionId: id(9999), slotKey: "f".repeat(64), value: {type: "text" as const, value: "per_operation"}}];
    const input = composeBoundReceivedProposal({...envelopeOf(entries), question});
    expect(input.analysis.basket.basis.missingReason).toContain("2 contributions match basket.basis");
    expect(packetOf(envelopeOf(entries)).status).toBe("framed");
  });
  it("composes every listed or named bucket and never drops one silently", () => {
    const a = adopt(auroraReceivedProposalFacts()), order = a.entries.find((e) => e.fieldPath.endsWith(".order.buckets"))!;
    const unlisted = a.entries.map((e) => e === order ? {...e, value: {type: "list" as const, value: (e.value.value as string[]).filter((x) => x !== "rede-a")}} : e);
    expect(composeBoundReceivedProposal({...envelopeOf(unlisted), question}).analysis.portfolio.map((b) => b.id).at(-1)).toBe("rede-a");
    expect(packetOf(envelopeOf(unlisted)).readings!.collateral.assignable).toBe("25.41");
  });
  it("refuses inconsistent facts before proposing premises", () => {
    const holder = auroraReceivedProposalFacts(); holder.portfolio[1]!.value.holder = null;
    expect(() => proposeReceivedProposalHypotheses(holder)).toThrow("names the holder of its assignment");
    const free = auroraReceivedProposalFacts(); free.portfolio[3]!.value.countsAgainstBasket = true;
    expect(() => proposeReceivedProposalHypotheses(free)).toThrow("cannot occupy the basket");
    const test = auroraReceivedProposalFacts(); test.measurements.value[0]!.date = "2026-11-30";
    expect(() => proposeReceivedProposalHypotheses(test)).toThrow("is not a period end");
    const precise = auroraReceivedProposalFacts(); precise.proposal.value.amount = "30.123456789";
    expect(() => proposeReceivedProposalHypotheses(precise)).toThrow();
  });
});
