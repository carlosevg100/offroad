import {createHash} from "node:crypto";
import {describe, expect, it} from "vitest";
import type {AdoptionBasisEntry, AdoptionBasisSnapshot} from "@offroad/reconciliation";
import type {ProposedHypothesis} from "./investment-premises";
import {composeBoundQuarterUpdate} from "./quarter-update-composer";
import {composeQuarterUpdateFromStoredPriors} from "./quarter-update-stored-priors";
import {prepareQuarterUpdatePacket} from "./quarter-update-packet";
import {proposeQuarterUpdateHypotheses} from "./quarter-update-premises";
import {proposeWeeklyCashHypotheses} from "./weekly-cash-premises";
import {proposeCovenantHeadroomHypotheses} from "./covenant-headroom-premises";
import {composeBoundWeeklyCash} from "./weekly-cash-composer";
import {composeBoundCovenantHeadroom} from "./covenant-headroom-composer";
import {auroraPriorCovenantFacts, auroraQuarterUpdateBasis, auroraQuarterUpdateFacts} from "./quarter-update.test-support";
import {auroraWeeklyCashFacts} from "./weekly-cash.test-support";
import {analysisTestId as id} from "./adopted-analysis.test-support";

const question = "Fechou o trimestre. Atualiza tudo.";
function envelopeOf(entries: AdoptionBasisEntry[], version: number, purpose: string) {
  const snapshot: AdoptionBasisSnapshot = {schemaVersion: "contextual-adoption.v1", versionId: id(version), setId: id(6), workId: id(7), purpose,
    contextKey: purpose, revision: 1, previousVersionId: null, classification: "working_basis", entries};
  const canonical = JSON.stringify(snapshot);
  return {envelope: {canonical, fingerprint: createHash("sha256").update(canonical).digest("hex")}, scope: {workId: id(7), purpose, versionId: id(version)}};
}
function adopt(hypotheses: ProposedHypothesis[], start: number) {
  let n = start;
  return hypotheses.map((h) => ({decisionId: id(n++), slotKey: createHash("sha256").update(h.fieldPath + h.dimensions.scenario).digest("hex"),
    kind: "hypothesis", fieldPath: h.fieldPath, dimensions: {...h.dimensions}, value: h.value, observationId: null, referenceValue: null, referenceDimensions: null,
    definitionKind: "managerial", actorId: id(5), reason: h.reason}) as AdoptionBasisEntry);
}
/** The prior versions on their own bases, their stored execution inputs as the earlier requests composed them, and the close on a third basis. */
function cases() {
  const weeklyCash = envelopeOf(adopt(proposeWeeklyCashHypotheses(auroraWeeklyCashFacts()), 9000), 501, "synthetic weekly cash");
  const covenant = envelopeOf(adopt(proposeCovenantHeadroomHypotheses(auroraPriorCovenantFacts()), 9400), 502, "synthetic covenant headroom");
  const update = envelopeOf(adopt(proposeQuarterUpdateHypotheses(auroraQuarterUpdateFacts(weeklyCash.envelope.fingerprint, covenant.envelope.fingerprint)), 9700), 503, "synthetic quarter update");
  const storedWeekly = JSON.stringify(composeBoundWeeklyCash({...weeklyCash, question: "Como fica o caixa até dezembro e o que vence?"}));
  const storedCovenant = JSON.stringify(composeBoundCovenantHeadroom({...covenant, question: "Como estamos contra os covenants?", headlineMeasurementId: "dez26-base"}));
  return {weeklyCash, covenant, update, storedWeekly, storedCovenant};
}

describe("the quarter update composed from the close and the stored prior inputs", {timeout: 300000}, () => {
  it("equals the composition from the prior bases and reproduces the reviewed calibration", () => {
    const c = cases();
    const fromStored = composeQuarterUpdateFromStoredPriors({update: c.update, question, prior: {weeklyCash: c.storedWeekly, covenant: c.storedCovenant}});
    const fromBases = composeBoundQuarterUpdate({prior: {weeklyCash: c.weeklyCash, covenant: c.covenant}, update: c.update, question});
    expect(fromStored).toEqual(fromBases);
    // Each prior analysis is the stored one, verbatim.
    expect(fromStored.analysis.prior.weeklyCash).toEqual(JSON.parse(c.storedWeekly).analysis);
    expect(fromStored.analysis.prior.covenant).toEqual(JSON.parse(c.storedCovenant).analysis);
    const p = prepareQuarterUpdatePacket(fromStored);
    const reference = prepareQuarterUpdatePacket({schemaVersion: "quarter-update-packet-input.v1", question, analysis: auroraQuarterUpdateBasis().seal()});
    expect(p.status).toBe("prepared_for_human_review");
    expect(p.readings).toEqual(reference.readings);
    expect(p.fingerprint).toBe(prepareQuarterUpdatePacket(fromBases).fingerprint);
  });
  it("accepts parsed stored inputs and refuses a stored input of another method", () => {
    const c = cases();
    const parsed = composeQuarterUpdateFromStoredPriors({update: c.update, question, prior: {weeklyCash: JSON.parse(c.storedWeekly), covenant: JSON.parse(c.storedCovenant)}});
    expect(parsed).toEqual(composeQuarterUpdateFromStoredPriors({update: c.update, question, prior: {weeklyCash: c.storedWeekly, covenant: c.storedCovenant}}));
    expect(() => composeQuarterUpdateFromStoredPriors({update: c.update, question, prior: {weeklyCash: c.storedCovenant, covenant: c.storedCovenant}})).toThrow("quarter_update_prior_weekly_cash_invalid");
    expect(() => composeQuarterUpdateFromStoredPriors({update: c.update, question, prior: {weeklyCash: c.storedWeekly, covenant: c.storedWeekly}})).toThrow("quarter_update_prior_covenant_invalid");
    expect(() => composeQuarterUpdateFromStoredPriors({update: c.update, question, prior: {weeklyCash: "not json", covenant: c.storedCovenant}})).toThrow();
  });
});
