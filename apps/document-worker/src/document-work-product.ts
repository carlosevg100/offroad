import {documentWorkProductRepairInstructions, documentWorkProductSystemInstructions} from "@offroad/credit-playbook";
import {fingerprintJson} from "@offroad/case-understanding";
import {
  documentWorkProductInputSchema, documentWorkProductNarrativeSchema, documentWorkProductSchema,
  documentWorkProductSectionKeys, type DocumentWorkProduct, type DocumentWorkProductInput,
  type DocumentWorkProductNarrative,
} from "@offroad/domain-contracts";
import {providerDataPolicyVersion, type ModelGateway} from "@offroad/model-gateway";
import {reviewAndProposeDocumentWorkRevision, verifyDocumentWorkSourceFidelity} from "./document-work-source-review";

import {buildDocumentWorkSelectionContext, completeSourceQuote, documentWorkSelectionSchema, hydrateDocumentWorkSelection} from "./document-work-selection";



function numbers(text: string): string[] {return text.match(/\d+(?:[.,]\d+)*/g) ?? [];}

export function validateDocumentWorkProductNarrative(input: DocumentWorkProductInput, raw: unknown): DocumentWorkProductNarrative {
  const narrative = documentWorkProductNarrativeSchema.parse(raw);
  const expected = documentWorkProductSectionKeys[input.job];
  if (narrative.sections.some((section,index) => section.key !== expected[index])) throw new Error("document_work_product_wrong_sections");
  const passages = new Map(input.passages.map(p => [p.id,p]));
  for (const section of narrative.sections) {
    if (numbers(section.title).length) throw new Error("document_work_product_unbound_number");
    for (const observation of section.observations) {
      const quotedNumbers = new Set<string>();
      for (const citation of observation.citations) {
        const passage = passages.get(citation.passageId);
        if (!passage || !completeSourceQuote(passage.text, citation.quote, input.locale)) throw new Error("document_work_product_invalid_citation");
        numbers(citation.quote).forEach(number => quotedNumbers.add(number));
      }
      if (numbers(observation.text).some(number => !quotedNumbers.has(number))) throw new Error("document_work_product_unbound_number");
      if (!observation.citations.some(citation => citation.quote === observation.text)) throw new Error("document_work_product_non_extractive_observation");
    }
  }
  for (const hypothesis of narrative.hypotheses) {
    if (hypothesis.basisPassageIds.some(id => !passages.has(id))) throw new Error("document_work_product_invalid_citation");
    if (numbers(hypothesis.text + hypothesis.question).length) throw new Error("document_work_product_unbound_number");
  }
  if (narrative.gaps.some(gap => numbers(gap.text + gap.question).length)) throw new Error("document_work_product_unbound_number");
  if (!narrative.sections.some(section => section.observations.length > 0) && narrative.gaps.length === 0) throw new Error("document_work_product_empty_without_gap");
  return narrative;
}

const correctableValidationCodes = new Set([
  "document_work_product_wrong_sections", "document_work_product_unbound_number",
  "document_work_product_invalid_citation", "document_work_product_non_extractive_observation",
  "document_work_product_empty_without_gap", "document_work_product_duplicate_selection",
]);

/** Caller must authenticate, scope sources and verify current approval; this is not an authorization API. */
export async function runDocumentWorkProduct(raw: DocumentWorkProductInput, dependencies: {gateway: Pick<ModelGateway,"complete">}): Promise<DocumentWorkProduct> {
  const input = documentWorkProductInputSchema.parse(raw);
  const propose = async (code?: string) => {
    // The same gateway accounts for both calls. Provider, policy and budget failures propagate;
    // only a known local output-validation failure can trigger one corrective pass.
    const result = await dependencies.gateway.complete({
      task: "preliminary_understanding", system: code ? `${documentWorkProductSystemInstructions}\n${documentWorkProductRepairInstructions}` : documentWorkProductSystemInstructions,
      input: [{type: "text", text: JSON.stringify({job: input.job, locale: input.locale, approvedRequest: input.approvedRequest, coverage: input.coverage, sources: buildDocumentWorkSelectionContext(input).sources, sectionKeys: documentWorkProductSectionKeys[input.job], ...(code ? {validationFeedback: {code}} : {})})}],
      schema: documentWorkSelectionSchema, schemaName: "document_work_selection_v1",
      dataHandling: {classification: "restricted", purpose: "case_analysis", requiredPolicyVersion: providerDataPolicyVersion},
      maxOutputTokens: 10000,
    });
    return result.output;
  };
  const first = await propose();
  let narrative: DocumentWorkProductNarrative;
  let repaired = false;
  try { narrative = validateDocumentWorkProductNarrative(input, hydrateDocumentWorkSelection(input, first)); }
  catch (error) {
    if (!(error instanceof Error) || !correctableValidationCodes.has(error.message)) throw error;
    // Never publish, patch or feed back the rejected narrative. Validate a fresh complete
    // response against the original corpus, with no third attempt if it is still invalid.
    repaired = true;
    narrative = validateDocumentWorkProductNarrative(input, hydrateDocumentWorkSelection(input, await propose(error.message)));
  }
  if (repaired) {
    await verifyDocumentWorkSourceFidelity(input, narrative, {gateway: dependencies.gateway});
  } else {
    const {review,revisedSelection}=await reviewAndProposeDocumentWorkRevision(input,narrative,first,{gateway:dependencies.gateway});
    if(review.issues.length){
      if(!revisedSelection)throw new Error("document_work_product_source_review_failed");
      narrative=validateDocumentWorkProductNarrative(input,hydrateDocumentWorkSelection(input,revisedSelection));
      // The critic's replacement is untrusted until a separate fresh review passes.
      await verifyDocumentWorkSourceFidelity(input,narrative,{gateway:dependencies.gateway});
    }
  }
  const hasObservations = narrative.sections.some(section => section.observations.length > 0);
  const payload = {
    ...narrative, schemaVersion: "document-work-product.v1" as const, job: input.job, locale: input.locale,
    requestFingerprint: input.approvedRequest.fingerprint, inputFingerprint: fingerprintJson(input),
    sources: input.passages, coverage: input.coverage,
    calculationStatus: "not_performed" as const, assessmentStatus: "preliminary_document_review" as const,
    status: hasObservations ? "preliminary" as const : "insufficient_evidence" as const,
  };
  return documentWorkProductSchema.parse({...payload, fingerprint: fingerprintJson(payload)});
}
