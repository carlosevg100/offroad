import {createHash} from "node:crypto";
import {readContextualBasis} from "@offroad/reconciliation";
import {adoptedDefinedRatioFixture, capitalContractPreparationFixture} from "@offroad/testing-fixtures/capital-structure-decision";
import {capitalContractPreparationInputSchema, prepareCapitalContractEvidence} from "./capital-contract-preparation";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export function capitalContractAdoptionFixture() {
  const ratio = adoptedDefinedRatioFixture(); const snapshot = readContextualBasis(ratio.input.envelope, ratio.input.scope);
  ratio.input.perimeter = "consolidated";
  snapshot.entries.forEach((e, n) => {e.dimensions.perimeter = "consolidated"; e.kind = "observation"; e.observationId = id(500 + n);});
  snapshot.entries[0]!.value = {type: "number", value: "150"}; snapshot.entries[2]!.value = {type: "number", value: "2"};
  const refresh = () => {const canonical = JSON.stringify(snapshot); ratio.input.envelope = {canonical, fingerprint: createHash("sha256").update(canonical).digest("hex")};}; refresh();
  const preparation = capitalContractPreparationInputSchema.parse({...capitalContractPreparationFixture(), interest: null, interestConventions: null});
  Object.assign(preparation, {workId: ratio.input.scope.workId, purpose: ratio.input.scope.purpose, entityId: ratio.input.entityId, perimeter: ratio.input.perimeter,
    currency: ratio.input.currency, scenario: ratio.input.scenario, asOf: ratio.input.measurementDate});
  const c = preparation.covenants!; c.asOfDate = preparation.asOf;
  c.componentValues.forEach(e => {e.asOf = preparation.asOf;}); c.ltmEbitda!.asOf = preparation.asOf;
  const calculated = prepareCapitalContractEvidence(preparation);
  const definitions = (["numerator", "denominator", "limit"] as const).map((field, n) => ({field,
    versionId: snapshot.entries[n]!.dimensions.definitionVersionId!, kind: "contractual" as const,
    definition: field === "numerator" ? "Loans less cash" : field === "denominator" ? "LTM EBITDA" : "Upper leverage threshold",
    contractSourceVersionId: preparation.sources[0]!.sourceVersionId, contractAnchor: {clause: "1.1", page: 1}}));
  const origins = definitions.map((d, n) => ({field: d.field, decisionId: snapshot.entries[n]!.decisionId,
    observationId: snapshot.entries[n]!.observationId!, sourceVersionId: id(900), calculationFingerprint: calculated.fingerprint,
    instrumentId: "debt", sourceVersionIds: calculated.sourceVersionIds, observationIds: calculated.observationIds}));
  return {input: {preparation, ratio: ratio.input, instrumentId: "debt", definitions, origins}, snapshot, refresh};
}
