import {createHash} from "node:crypto";
import {capitalDecisionReviewFixture} from "@offroad/testing-fixtures/capital-structure-decision";
import {capitalContractAdoptionFixture} from "./capital-contract-adoptions.test-support";
import {prepareCapitalContractEvidence} from "./capital-contract-preparation";
import {capitalProcedurePacketInputSchema} from "./capital-procedure-packet";

/** Synthetic cases shared by regression tests and recorded deterministic evaluations. */
export const capitalPacketFixture = () => capitalProcedurePacketInputSchema.parse({decision: {review: capitalDecisionReviewFixture().input,
  material: {requested: false, audience: "authorized_work_participants"}}, contracts: [], adoptionLinks: []});
export function integratedCapitalPacketFixture() {
  const f = capitalDecisionReviewFixture(); const c = capitalContractAdoptionFixture();
  const p = f.input.composition.alternatives[0]!.projection.operating;
  for (const e of f.snapshot.entries) e.dimensions.perimeter = "consolidated";
  c.input.ratio.scope = p.scope; c.input.ratio.entityId = p.entityId; c.input.ratio.scenario = p.scenario;
  c.input.ratio.measurementDate = p.endDate;
  const ltmStart = `${Number(p.endDate.slice(0, 4)) - 1}-03-01`;
  c.input.ratio.denominator.periodStart = ltmStart; c.snapshot.entries[1]!.dimensions.periodStart = ltmStart;
  for (const e of c.snapshot.entries) Object.assign(e.dimensions, {entityId: p.entityId, scenario: p.scenario, periodEnd: p.endDate});
  Object.assign(c.input.preparation, {workId: p.scope.workId, purpose: p.scope.purpose, entityId: p.entityId, scenario: p.scenario, asOf: p.endDate});
  c.input.preparation.covenants!.asOfDate = p.endDate;
  c.input.preparation.covenants!.componentValues.forEach(e => {e.asOf = p.endDate;});
  c.input.preparation.covenants!.ltmEbitda!.asOf = p.endDate;
  const prepared = prepareCapitalContractEvidence(c.input.preparation);
  c.input.origins.forEach(o => {o.calculationFingerprint = prepared.fingerprint;});
  f.snapshot.entries.push(...c.snapshot.entries as unknown as typeof f.snapshot.entries);
  const canonical = JSON.stringify(f.snapshot); const envelope = {canonical, fingerprint: createHash("sha256").update(canonical).digest("hex")};
  for (const a of [...f.input.composition.alternatives, ...f.input.composition.sensitivities]) {
    a.projection.operating.envelope = envelope; a.projection.operating.perimeter = "consolidated";
    a.projection.funding.input.envelope = envelope; a.projection.funding.input.perimeter = "consolidated";
  }
  c.input.ratio.envelope = envelope;
  f.input.ratios.push({id: "leverage", alternativeId: "maintain", input: c.input.ratio});
  return capitalProcedurePacketInputSchema.parse({decision: {review: f.input, material: {requested: false, audience: "authorized_work_participants"}},
    contracts: [{id: "contract", alternativeId: "maintain", preparation: c.input.preparation}],
    adoptionLinks: [{contractId: "contract", ratioId: "leverage", instrumentId: "debt", definitions: c.input.definitions, origins: c.input.origins}]});
}
