import {createHash} from "node:crypto";
import {describe, expect, it} from "vitest";
import type {AdoptionBasisEntry, AdoptionBasisSnapshot} from "@offroad/reconciliation";
import {composeBoundCapitalPaths} from "./capital-structure-paths-composer";
import {prepareCapitalPathsPacket} from "./capital-structure-paths-packet";
import {proposeCapitalPathsHypotheses, type CapitalPathsFacts} from "./capital-structure-paths-premises";
import {auroraCapitalPathsBasis, auroraCapitalPathsFacts, capitalPathsQuestion as question} from "./capital-structure-paths.test-support";
import {analysisTestId as id} from "./adopted-analysis.test-support";

function envelopeOf(entries: AdoptionBasisEntry[]) {
  const snapshot: AdoptionBasisSnapshot = {schemaVersion: "contextual-adoption.v1", versionId: id(500), setId: id(6), workId: id(7), purpose: "synthetic capital paths",
    contextKey: "caminhos-de-capital", revision: 1, previousVersionId: null, classification: "working_basis", entries};
  const canonical = JSON.stringify(snapshot);
  return {envelope: {canonical, fingerprint: createHash("sha256").update(canonical).digest("hex")}, scope: {workId: id(7), purpose: snapshot.purpose, versionId: id(500)}};
}
function adopt(facts: CapitalPathsFacts) {
  let n = 9000;
  const entries = proposeCapitalPathsHypotheses(facts).map((h) => ({decisionId: id(n++), slotKey: createHash("sha256").update(h.fieldPath + h.dimensions.scenario).digest("hex"),
    kind: "hypothesis", fieldPath: h.fieldPath, dimensions: {...h.dimensions}, value: h.value, observationId: null, referenceValue: null, referenceDimensions: null,
    definitionKind: "managerial", actorId: id(5), reason: h.reason}) as AdoptionBasisEntry);
  return {entries, ...envelopeOf(entries)};
}
const packetOf = (b: ReturnType<typeof envelopeOf>) => prepareCapitalPathsPacket(composeBoundCapitalPaths({envelope: b.envelope, scope: b.scope, question}));

describe("ficha C32 premises proposed from facts with origin, adopted, composed and measured", {timeout: 600_000}, () => {
  it("stays inside the basis limit and states the origin of every premise", () => {
    const h = proposeCapitalPathsHypotheses(auroraCapitalPathsFacts());
    expect(h.length).toBeLessThanOrEqual(256);
    expect(h.every((x) => x.reason.startsWith("Origem: "))).toBe(true);
    expect(h.find((x) => x.fieldPath.endsWith(".instrument.debenture-2021.terms"))!.reason).toMatch(/^Origem: documento\./);
    expect(h.find((x) => x.fieldPath.endsWith(".company.minimumCash"))!.reason).toMatch(/^Origem: premissa da casa\./);
    expect(h.find((x) => x.fieldPath.endsWith(".postHorizon.ebitda"))!.reason).toMatch(/^Origem: resultado revisado de outro método\./);
  });
  it("reproduces the calibration: same readings and numbers", () => {
    const p = packetOf(envelopeOf(adopt(auroraCapitalPathsFacts()).entries));
    const reference = prepareCapitalPathsPacket(auroraCapitalPathsBasis().seal());
    expect(p.status).toBe(reference.status);
    expect(p.readings).toEqual(reference.readings);
    expect(p.result.evaluation).toEqual(reference.result.evaluation);
    expect([p.readings!.recommendation!.pathId, p.readings!.recommendation!.netDebtAtHorizon.slice(0, 5)]).toEqual(["sem-linha-debenture", "79.31"]);
  });
  it("declares an absent operand missing, never zero, and reports two contributions for one slot", () => {
    const a = adopt(auroraCapitalPathsFacts());
    const gapped = packetOf(envelopeOf(a.entries.filter((e) => !e.fieldPath.endsWith(".basket.occupied"))));
    expect(gapped.status).toBe("framed");
    expect(gapped.gaps.some((g) => g.operand.endsWith(".basket.occupied") && g.reason.startsWith("No contribution adopted for basket.occupied"))).toBe(true);
    const twin = a.entries.find((e) => e.fieldPath.endsWith(".company.minimumCash"))!;
    const entries = [...a.entries, {...twin, decisionId: id(9999), slotKey: "f".repeat(64), value: {type: "number" as const, value: "25"}}];
    expect(composeBoundCapitalPaths({...envelopeOf(entries), question}).analysis.company.minimumCash.missingReason).toContain("2 contributions match company.minimumCash");
  });
  it("composes every listed or named path and never drops one silently", () => {
    const a = adopt(auroraCapitalPathsFacts()), order = a.entries.find((e) => e.fieldPath.endsWith(".order.paths"))!;
    const unlisted = a.entries.map((e) => e === order ? {...e, value: {type: "list" as const, value: (e.value.value as string[]).filter((x) => x !== "manter")}} : e);
    expect(composeBoundCapitalPaths({...envelopeOf(unlisted), question}).analysis.paths.map((p) => p.id).at(-1)).toBe("manter");
  });
  it("refuses inconsistent facts before proposing premises", () => {
    const f = auroraCapitalPathsFacts(); f.instruments[0]!.value.couponTreatment = "cash_paid";
    expect(() => proposeCapitalPathsHypotheses(f)).toThrow("Facts do not make a valid capital paths input");
    const g = auroraCapitalPathsFacts(); g.minimumCash.value = "15.123456789";
    expect(() => proposeCapitalPathsHypotheses(g)).toThrow();
  });
});
