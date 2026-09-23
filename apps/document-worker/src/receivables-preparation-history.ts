import {isDeepStrictEqual} from "node:util";
import {
  applyReceivablesSupplementPatch, newReceivablesSupplementDraft,
  receivablesSupplementDraftSchema, receivablesSupplementPatchSchema,
  type ReceivablesPhaseOneInput, type ReceivablesEvidenceDocument,
} from "@offroad/receivables-analysis";
import {buildReceivablesDocumentSupplementPatch} from "./receivables-document-supplement";
import {applyGovernedReceivablesInformationResponse, governedReceivablesAnswerSchema} from "./receivables-information-response";

export type ReceivablesResponseAuthority = {
  messageId: string; content: string; answeredRequest: unknown;
};
/** A value resolved by the private SQL loader, not a source label supplied by a patch. */
export type ReceivablesResolvedValueAuthority = {
  sourceClass: "project_context" | "house_method";
  sourceId: string; anchor: string; path: string; value: unknown;
};

/** Replay stored patches under their independently loaded authorities before preparing R01.
 * The caller must obtain history/authorities through the capability-bound SQL loader. This
 * function never turns a client-supplied authority object into a database permission. */
export function replayReceivablesPreparationHistory(input: {
  phaseOne: ReceivablesPhaseOneInput;
  documents: readonly ReceivablesEvidenceDocument[];
  history: readonly {patch: unknown; resultingDraft: unknown}[];
  currentDraft: unknown;
  responses: readonly ReceivablesResponseAuthority[];
  resolvedValues: readonly ReceivablesResolvedValueAuthority[];
}) {
  const current = receivablesSupplementDraftSchema.parse(input.currentDraft);
  let replay = newReceivablesSupplementDraft(input.phaseOne.datasetHash);
  const documentPatch = buildReceivablesDocumentSupplementPatch(input).patch;
  const seen = new Set<string>();
  for (const item of input.history) {
    const patch = receivablesSupplementPatchSchema.parse(item.patch);
    if (seen.has(patch.patchId)) throw new Error("receivables_preparation_repeated_patch");
    seen.add(patch.patchId);
    if (patch.patchId.startsWith("document-adapter:")) {
      if (!documentPatch || !isDeepStrictEqual(patch,documentPatch)) throw new Error("receivables_preparation_document_patch_changed");
    } else if (patch.patchId.startsWith("information-response:")) {
      const responses = input.responses.filter(response => patch.patchId === `information-response:${response.messageId}`);
      if (responses.length !== 1) throw new Error("receivables_preparation_answer_authority_missing");
      const response = responses[0]!;
      const answer = governedReceivablesAnswerSchema.parse(response.answeredRequest);
      if (answer.producerBinding?.sourceDatasetHash !== input.phaseOne.datasetHash) throw new Error("receivables_preparation_answer_dataset_changed");
      const expected = applyGovernedReceivablesInformationResponse({...response, currentDraft: replay});
      if (!expected || !isDeepStrictEqual(patch,expected.patch)) throw new Error("receivables_preparation_answer_value_changed");
    } else {
      // Canonical context and house values must be explicitly bound to the exact target.
      // Neither prose, a method title, nor suppliedBy is an authority for arbitrary values.
      const targets = [...Object.entries(patch.sections).map(([key,section]) => ({path:`/${key}`,value:section!.value})),
        ...patch.fields.map(field => ({path:field.path,value:field.value}))];
      // Canonical values are contributed one target per patch. This prevents a valid
      // reference for one field from being borrowed to attest another field.
      if (targets.length !== 1) throw new Error("receivables_preparation_authority_target_ambiguous");
      if (targets.some(target => !target.path.startsWith("/policy") && !target.path.startsWith("/structure"))
        && [...patch.suppliedBy.evidence,...Object.values(patch.evidence).flatMap(group => group ?? [])].some(reference => reference.sourceClass === "house_method")) {
        throw new Error("receivables_preparation_method_not_factual_authority");
      }
      const targetSection = targets[0]!.path.split("/")[1]!;
      const evidenceGroups: Record<string,string[]> = {cedent:["cedentAndServicing"],titles:["titleLegalControls","performanceHistory"],
        cashReceipts:["cashReconciliation"],accounting:["accountingReconciliation"],policy:["eligibilityPolicy"],structure:["facilityAndWaterfall"],findingResolutions:[]};
      const expectedGroups = evidenceGroups[targetSection]!;
      if (!isDeepStrictEqual(Object.keys(patch.evidence).sort(), [...expectedGroups].sort())) throw new Error("receivables_preparation_evidence_target_mismatch");
      const referenceKeys = (references: typeof patch.suppliedBy.evidence) => [...new Set(references.map(reference => JSON.stringify([reference.sourceClass,reference.sourceId,reference.anchor])))].sort();
      const authorReferences = referenceKeys(patch.suppliedBy.evidence);
      if (Object.values(patch.evidence).some(group => !isDeepStrictEqual(referenceKeys(group ?? []),authorReferences))) throw new Error("receivables_preparation_evidence_basis_mismatch");
      const references = [...patch.suppliedBy.evidence,...Object.values(patch.evidence).flatMap(group => group ?? []),
        ...(patch.sections.findingResolutions?.value.flatMap(finding => finding.evidence) ?? [])];
      if (!references.length || references.some(reference => !["project_context","house_method"].includes(reference.sourceClass))) throw new Error("receivables_preparation_patch_authority_missing");
      for (const target of targets) {
        if (!references.some(reference => input.resolvedValues.some(authority => authority.sourceClass === reference.sourceClass
          && authority.sourceId === reference.sourceId && authority.anchor === reference.anchor && authority.path === target.path
          && isDeepStrictEqual(authority.value,target.value)))) throw new Error("receivables_preparation_patch_value_unbound");
      }
      // Extraneous references would otherwise widen the derived result's declared basis.
      if (references.some(reference => !input.resolvedValues.some(authority => authority.sourceClass === reference.sourceClass
        && authority.sourceId === reference.sourceId && authority.anchor === reference.anchor
        && targets.some(target => target.path === authority.path && isDeepStrictEqual(target.value,authority.value))))) throw new Error("receivables_preparation_reference_unbound");
    }
    replay = applyReceivablesSupplementPatch({draft:replay,patch});
    if (!isDeepStrictEqual(replay,receivablesSupplementDraftSchema.parse(item.resultingDraft))) throw new Error("receivables_preparation_history_changed");
  }
  if (!isDeepStrictEqual(replay,current)) throw new Error("receivables_preparation_history_incomplete");
  return replay;
}
