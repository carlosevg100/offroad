import {createHash} from "node:crypto";
import {z} from "zod";
import {capitalDecisionDeliveryInputSchema, capitalDecisionDeliveryOutputSchema, prepareCapitalDecisionDelivery} from "./capital-decision-delivery";
import {capitalContractPreparationInputSchema, capitalContractPreparationOutputSchema, prepareCapitalContractEvidence} from "./capital-contract-preparation";
import {capitalContractAdoptionsInputSchema, capitalContractAdoptionsOutputSchema, reconcileCapitalContractAdoptions} from "./capital-contract-adoptions";
const key = z.string().min(1).max(300); const hash = z.string().regex(/^[a-f0-9]{64}$/);
export const capitalProcedurePacketInputSchema = z.strictObject({
  decision: capitalDecisionDeliveryInputSchema,
  contracts: z.array(z.strictObject({id: key, alternativeId: key, preparation: capitalContractPreparationInputSchema})).max(128),
  adoptionLinks: z.array(z.strictObject({contractId: key, ratioId: key, instrumentId: key,
    definitions: capitalContractAdoptionsInputSchema.shape.definitions, origins: capitalContractAdoptionsInputSchema.shape.origins})).max(128),
}).superRefine((i, c) => {
  if (new Set(i.contracts.map(r => r.id)).size !== i.contracts.length || new Set(i.adoptionLinks.map(r => r.ratioId)).size !== i.adoptionLinks.length)
    c.addIssue({code: "custom", message: "Duplicate contractual packet identity"});
});
export const capitalProcedurePacketOutputSchema = z.strictObject({
  schemaVersion: z.literal("capital-procedure-packet.v1"), decision: capitalDecisionDeliveryOutputSchema,
  contracts: z.array(z.strictObject({id: key, alternativeId: key, result: capitalContractPreparationOutputSchema})),
  adoptionLinks: z.array(z.strictObject({contractId: key, ratioId: key, result: capitalContractAdoptionsOutputSchema})),
  status: z.enum(["framed", "partial", "prepared_for_human_review"]),
  contractualGaps: z.array(z.strictObject({subjectId: key, code: key})),
  contractSourceVersionIds: z.array(z.uuid()), observationIds: z.array(z.uuid()), inputFingerprint: hash,
  requiresPinnedInputAndManifest: z.literal(true), requiresLiveRightsCheck: z.literal(true),
  mutatesWorkingBasis: z.literal(false), grantsExecution: z.literal(false), grantsPublication: z.literal(false), fingerprint: hash,
});
/** Recomputes both adopted decision and source-bound contractual candidates. Linking is
 * explicit and never substitutes a contribution. Interest traces are preserved separately:
 * cash timing, capitalized interest and principal are not equated by nominal-value matching. */
export function prepareCapitalProcedurePacket(raw: unknown) {
  const input = capitalProcedurePacketInputSchema.parse(raw);
  const decision = prepareCapitalDecisionDelivery(input.decision);
  const contractualGaps: {subjectId: string; code: string}[] = [];
  const contracts = input.contracts.map((row, index) => {
    const alternative = decision.alternatives.find(a => a.id === row.alternativeId);
    if (!alternative) throw new Error("capital_packet_unknown_alternative");
    const result = prepareCapitalContractEvidence((raw as z.input<typeof capitalProcedurePacketInputSchema>).contracts[index]!.preparation); const s = result.scope; const a = alternative.projection;
    if (s.workId !== decision.workId || s.purpose !== decision.purpose || s.entityId !== a.entityId || s.perimeter !== a.perimeter
      || s.currency !== a.currency || s.scenario !== a.scenario || s.asOf < a.openingDate || s.asOf > a.endDate)
      throw new Error("capital_packet_contract_context_mismatch");
    if (result.interest) contractualGaps.push({subjectId: row.id, code: "interest_cash_timing_and_adoption_review_required"});
    return {id: row.id, alternativeId: row.alternativeId, result};
  });
  const adoptionLinks = input.adoptionLinks.map(link => {
    const contract = input.contracts.find(c => c.id === link.contractId);
    const ratio = input.decision.review.ratios.find(r => r.id === link.ratioId);
    if (!contract || !ratio || contract.alternativeId !== ratio.alternativeId) throw new Error("capital_packet_adoption_reference_mismatch");
    const result = reconcileCapitalContractAdoptions({preparation: contract.preparation, ratio: ratio.input,
      instrumentId: link.instrumentId, definitions: link.definitions, origins: link.origins});
    if (result.status !== "aligned") contractualGaps.push({subjectId: link.ratioId, code: `contract_adoption_${result.status}`});
    // Even aligned numbers and receipts do not prove interpretation or rights.
    contractualGaps.push({subjectId: link.ratioId, code: "contract_source_interpretation_and_applicability_review_required"});
    return {contractId: link.contractId, ratioId: link.ratioId, result};
  });
  for (const ratio of decision.ratios) if (ratio.definitionKind === "contractual" && !adoptionLinks.some(l => l.ratioId === ratio.id))
    contractualGaps.push({subjectId: ratio.id, code: "contract_preparation_and_adoption_link_required"});
  for (const contract of contracts) if (contract.result.covenants && !adoptionLinks.some(l => l.contractId === contract.id))
    contractualGaps.push({subjectId: contract.id, code: "calculated_covenant_not_linked_to_adopted_ratio"});
  const payload = {schemaVersion: "capital-procedure-packet.v1", decision, contracts, adoptionLinks,
    status: contractualGaps.length ? "partial" : decision.status, contractualGaps,
    contractSourceVersionIds: [...new Set([...contracts.flatMap(c => c.result.sourceVersionIds), ...adoptionLinks.flatMap(l => l.result.sourceVersionIds)])],
    observationIds: [...new Set([...decision.provenance.observationIds, ...contracts.flatMap(c => c.result.observationIds)])],
    inputFingerprint: createHash("sha256").update(JSON.stringify(input)).digest("hex"), requiresPinnedInputAndManifest: true,
    requiresLiveRightsCheck: true, mutatesWorkingBasis: false, grantsExecution: false, grantsPublication: false};
  return capitalProcedurePacketOutputSchema.parse({...payload, fingerprint: createHash("sha256").update(JSON.stringify(payload)).digest("hex")});
}
