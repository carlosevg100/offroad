import {documentWorkProductSystemInstructions} from "@offroad/credit-playbook";
import {fingerprintJson} from "@offroad/case-understanding";
import {
  documentWorkProductInputSchema, documentWorkProductNarrativeSchema, documentWorkProductSchema,
  documentWorkProductSectionKeys, type DocumentWorkProduct, type DocumentWorkProductInput,
  type DocumentWorkProductNarrative,
} from "@offroad/domain-contracts";
import {providerDataPolicyVersion, type ModelGateway} from "@offroad/model-gateway";



function numbers(text: string): string[] {return text.match(/\d+(?:[.,]\d+)*/g) ?? [];}

/** Conservative source boundaries, not a claim of semantic or domain verification. */
function completeSourceQuote(source: string, quote: string, locale: "pt-BR" | "en-US"): boolean {
  if (source.trim() === quote) return true;
  // A whole line is a complete record, including all columns of a parsed table row.
  if (source.split(/\r?\n/).some(line => line.trim() === quote)) return true;
  const starts = new Set<number>();
  const ends = new Set<number>();
  for (const segment of new Intl.Segmenter(locale, {granularity: "sentence"}).segment(source)) {
    const text = segment.segment;
    const trimmed = text.trim();
    if (!trimmed || !/[.!?]["'”’)]*$/.test(trimmed)) continue;
    starts.add(segment.index + text.length - text.trimStart().length);
    ends.add(segment.index + text.trimEnd().length);
  }
  let index = source.indexOf(quote);
  while (index !== -1) {
    if (starts.has(index) && ends.has(index + quote.length)) return true;
    index = source.indexOf(quote, index + 1);
  }
  return false;
}

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
  return narrative;
}

/** Caller must authenticate, scope sources and verify current approval; this is not an authorization API. */
export async function runDocumentWorkProduct(raw: DocumentWorkProductInput, dependencies: {gateway: Pick<ModelGateway,"complete">}): Promise<DocumentWorkProduct> {
  const input = documentWorkProductInputSchema.parse(raw);
  const result = await dependencies.gateway.complete({
    task: "preliminary_understanding", system: documentWorkProductSystemInstructions,
    input: [{type: "text", text: JSON.stringify({...input, sectionKeys: documentWorkProductSectionKeys[input.job]})}],
    schema: documentWorkProductNarrativeSchema, schemaName: "document_work_product_narrative_v1",
    dataHandling: {classification: "restricted", purpose: "case_analysis", requiredPolicyVersion: providerDataPolicyVersion},
    maxOutputTokens: 10000,
  });
  const narrative = validateDocumentWorkProductNarrative(input,result.output);
  const hasObservations = narrative.sections.some(section => section.observations.length > 0);
  if (!hasObservations && narrative.gaps.length === 0) throw new Error("document_work_product_empty_without_gap");
  const payload = {
    ...narrative, schemaVersion: "document-work-product.v1" as const, job: input.job, locale: input.locale,
    requestFingerprint: input.approvedRequest.fingerprint, inputFingerprint: fingerprintJson(input),
    sources: input.passages, coverage: input.coverage,
    calculationStatus: "not_performed" as const, assessmentStatus: "preliminary_document_review" as const,
    status: hasObservations ? "preliminary" as const : "insufficient_evidence" as const,
  };
  return documentWorkProductSchema.parse({...payload, fingerprint: fingerprintJson(payload)});
}
