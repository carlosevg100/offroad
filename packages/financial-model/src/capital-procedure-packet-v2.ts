import {createHash} from "node:crypto";
import {z} from "zod";
import {capitalDecisionDeliveryInputSchema, capitalDecisionDeliveryOutputSchema, prepareCapitalDecisionDelivery} from "./capital-decision-delivery";
import {capitalContractPreparationV2InputSchema, capitalContractPreparationV2OutputSchema, prepareCapitalContractEvidenceV2} from "./capital-contract-preparation-v2";
import {capitalContractAdoptionsV2InputSchema, capitalContractAdoptionsOutputSchema, reconcileCapitalContractAdoptionsV2} from "./capital-contract-adoptions";
const key = z.string().min(1).max(300); const hash = z.string().regex(/^[a-f0-9]{64}$/);
export const capitalProcedurePacketV2InputSchema = z.strictObject({
  schemaVersion: z.literal("capital-procedure-packet-input.v2"),
  decision: capitalDecisionDeliveryInputSchema,
  contracts: z.array(z.strictObject({id: key, alternativeId: key, preparation: capitalContractPreparationV2InputSchema})).max(128),
  adoptionLinks: z.array(z.strictObject({contractId: key, ratioId: key, instrumentId: key,
    definitions: capitalContractAdoptionsV2InputSchema.shape.definitions, origins: capitalContractAdoptionsV2InputSchema.shape.origins})).max(128),
}).superRefine((i, c) => {
  if (new Set(i.contracts.map(r => r.id)).size !== i.contracts.length || new Set(i.adoptionLinks.map(r => r.ratioId)).size !== i.adoptionLinks.length)
    c.addIssue({code: "custom", message: "Duplicate contractual packet identity"});
});
export const capitalProcedurePacketV2OutputSchema = z.strictObject({
  schemaVersion: z.literal("capital-procedure-packet.v2"), decision: capitalDecisionDeliveryOutputSchema,
  contracts: z.array(z.strictObject({id: key, alternativeId: key, result: capitalContractPreparationV2OutputSchema})),
  adoptionLinks: z.array(z.strictObject({contractId: key, ratioId: key, result: capitalContractAdoptionsOutputSchema})),
  status: z.enum(["framed", "partial", "prepared_for_human_review"]),
  contractualGaps: z.array(z.strictObject({subjectId: key, code: z.string().min(1).max(640)})),
  contractSourceVersionIds: z.array(z.uuid()), observationIds: z.array(z.uuid()), inputFingerprint: hash,
  requiresPinnedInputAndManifest: z.literal(true), requiresLiveRightsCheck: z.literal(true),
  mutatesWorkingBasis: z.literal(false), grantsExecution: z.literal(false), grantsPublication: z.literal(false), fingerprint: hash,
});
/** Recomputes both adopted decision and source-bound contractual candidates. Linking is
 * explicit and never substitutes a contribution. Interest traces are preserved separately:
 * cash timing, capitalized interest and principal are not equated by nominal-value matching. */
export function prepareCapitalProcedurePacketV2(raw: unknown) {
  const input = capitalProcedurePacketV2InputSchema.parse(raw);
  const decision = prepareCapitalDecisionDelivery(input.decision);
  const contractualGaps: {subjectId: string; code: string}[] = [];
  const identities = new Set<string>();
  const contracts = input.contracts.map((row, index) => {
    const alternative = decision.alternatives.find(a => a.id === row.alternativeId);
    if (!alternative) throw new Error("capital_packet_unknown_alternative");
    const result = prepareCapitalContractEvidenceV2((raw as z.input<typeof capitalProcedurePacketV2InputSchema>).contracts[index]!.preparation); const s = result.scope; const a = alternative.projection;
    if (s.workId !== decision.workId || s.purpose !== decision.purpose || s.entityId !== a.entityId || s.perimeter !== a.perimeter
      || s.currency !== a.currency || s.scenario !== a.scenario || s.asOf < a.openingDate || s.asOf > a.endDate)
      throw new Error("capital_packet_contract_context_mismatch");
    for (const entry of row.preparation.inventory) {
      const identity = JSON.stringify([row.alternativeId, entry.instrumentId, entry.seriesId]);
      if (identities.has(identity)) throw new Error("capital_packet_duplicate_economic_identity");
      identities.add(identity);
    }
    for (const indexed of result.indexedContracts) {
      if (indexed.result && indexed.result.finalState.date > a.endDate) throw new Error("capital_packet_indexed_horizon_mismatch");
      if (indexed.result) contractualGaps.push({subjectId: row.id, code: "indexed_interest_interpretation_and_adoption_review_required"});
    }
    for (const gap of result.gaps) contractualGaps.push({subjectId: row.id, code: `${gap.code}:${gap.instrumentId}:${gap.seriesId}`});
    if (result.interest) contractualGaps.push({subjectId: row.id, code: "interest_cash_timing_and_adoption_review_required"});
    return {id: row.id, alternativeId: row.alternativeId, result};
  });
  const adoptionLinks = input.adoptionLinks.map(link => {
    const contract = input.contracts.find(c => c.id === link.contractId);
    const ratio = input.decision.review.ratios.find(r => r.id === link.ratioId);
    if (!contract || !ratio || contract.alternativeId !== ratio.alternativeId) throw new Error("capital_packet_adoption_reference_mismatch");
    const result = reconcileCapitalContractAdoptionsV2({preparation: contract.preparation, ratio: ratio.input,
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
  const payload = {schemaVersion: "capital-procedure-packet.v2", decision, contracts, adoptionLinks,
    status: contractualGaps.length ? "partial" : decision.status, contractualGaps,
    contractSourceVersionIds: [...new Set([...contracts.flatMap(c => c.result.sourceVersionIds), ...adoptionLinks.flatMap(l => l.result.sourceVersionIds)])],
    observationIds: [...new Set([...decision.provenance.observationIds, ...contracts.flatMap(c => c.result.observationIds)])],
    inputFingerprint: createHash("sha256").update(JSON.stringify(input)).digest("hex"), requiresPinnedInputAndManifest: true,
    requiresLiveRightsCheck: true, mutatesWorkingBasis: false, grantsExecution: false, grantsPublication: false};
  return capitalProcedurePacketV2OutputSchema.parse({...payload, fingerprint: createHash("sha256").update(JSON.stringify(payload)).digest("hex")});
}
