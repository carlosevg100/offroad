import type {AdapterRequest, AdapterResponse} from "@offroad/model-gateway";
import {documentWorkAuthoredFields} from "./document-work-source-review";

/**
 * Synthetic provider answers for the document work product families, for tests and the CI proof
 * only: each answer is derived from the request the family sends, so a run passes its gates
 * without any provider. The documentary narrative selects every available quotation, the source
 * reviews accept every authored field unless the request is one of the authored controls, whose
 * expected findings they flag exactly, the advisor asks one clarification, and the executive
 * synthesis writes two number-free claims on the identity and request facts, which the reviewer
 * accepts. Nothing here is a model output, and nothing here is reachable from the worker's entry.
 */

type Control = {
 narrative: Parameters<typeof documentWorkAuthoredFields>[0];
 expectedIssueFieldIds: readonly string[];
};

/** The input part of a request as JSON; every family sends one text part. */
function inputJson(request: AdapterRequest): Record<string, unknown> {
 const part = request.input[0];
 if (!part || part.type !== "text") throw new Error("synthetic_answer_requires_text");
 return JSON.parse(part.text) as Record<string, unknown>;
}
function inputText(request: AdapterRequest): string {
 const part = request.input[0];
 if (!part || part.type !== "text") throw new Error("synthetic_answer_requires_text");
 return part.text;
}

const excerpt = (text: string) => text.trim().slice(0, 160).trim();

function sourceReview(request: AdapterRequest, controls: readonly Control[], revision: boolean): unknown {
 const fields = (inputJson(request).authoredFields as Array<{id: string; text: string}>);
 const key = JSON.stringify(fields.map(({id, text}) => [id, text]));
 const control = controls.find((sample) => JSON.stringify(documentWorkAuthoredFields(sample.narrative).map(({id, text}) => [id, text])) === key);
 const flagged = new Set(control?.expectedIssueFieldIds ?? []);
 return {
  reviewedFieldIds: fields.map((field) => field.id),
  fieldAssessments: fields.map((field) => ({fieldId: field.id, verdict: flagged.has(field.id) ? "unsupported" : "no_factual_assertion", exactExcerpt: excerpt(field.text), sourceIds: []})),
  issues: fields.filter((field) => flagged.has(field.id)).map((field) => ({fieldId: field.id, code: "other_unsupported", sourceIds: [], exactExcerpt: excerpt(field.text),
   premiseRole: "asserted_fact", rationale: "Synthetic control finding."})),
  ...(revision ? {revisedSelection: null} : {}),
 };
}

function narrativeSelection(request: AdapterRequest): unknown {
 const input = inputJson(request) as {sources: Array<{availableQuotes: Array<{id: string}>}>; sectionKeys: string[]};
 const quotes = input.sources.flatMap((source) => source.availableQuotes.map((quote) => quote.id)).slice(0, 12);
 const titles = ["Documented terms", "What the documents show", "Points to confirm"];
 return {
  sections: input.sectionKeys.map((key, index) => ({key, title: titles[index] ?? "Documented points", quoteIds: index === 0 ? quotes : []})),
  hypotheses: [],
  gaps: [{text: "The documents leave some terms to confirm.", question: "Which remaining terms should be confirmed before the discussion?"}],
 };
}

function caseBrief(request: AdapterRequest): unknown {
 const english = inputText(request).startsWith("Requested output locale: en-US");
 return {
  sections: [
   {id: "identity", heading: english ? "Identity" : "Identidade", claims: [{id: "identity-company", material: true, kind: "fact", supportIds: ["company.legal_name"],
    text: english ? "The company is identified in its registration document." : "A companhia está identificada no seu documento cadastral."}]},
   {id: "request", heading: english ? "Request" : "Pedido", claims: [{id: "request-amount", material: true, kind: "fact", supportIds: ["transaction.requested_amount"],
    text: english ? "The company submitted a financing request." : "A companhia apresentou um pedido de financiamento."}]},
  ],
  executiveSummaryClaimIds: ["identity-company", "request-amount"],
 };
}

function semanticAudit(request: AdapterRequest, revision: boolean): unknown {
 const claims = inputJson(request).claims as Array<{claimId: string}>;
 return {
  reviewsByClaim: Object.fromEntries(claims.map((claim) => [claim.claimId, {verdict: "supported", reasons: [], explanation: "Synthetic review: the claim stays within its cited support."}])),
  ...(revision ? {revisions: []} : {}),
 };
}

const advisorAnswer = {
 state: "asking",
 reply: "Synthetic answer: before preparing the meeting, one point about its objective is needed.",
 clarification: {question: "What decision should the meeting support?", whyItMatters: "The objective defines which information to prepare.", answerKind: "text", choices: [], priority: "required_now"},
};

/**
 * The synthetic answer to one request of these families. `controls` are the authored source-review
 * controls the snapshot carries, so a control review flags exactly its expected findings.
 */
export function documentWorkSyntheticAnswer(request: AdapterRequest, controls: readonly Control[] = []): AdapterResponse {
 const output = (() => {
  switch (request.schemaName) {
   case "document_work_selection_v1": return narrativeSelection(request);
   case "document_work_source_review_revision_v3": return sourceReview(request, controls, true);
   case "document_work_source_review_v5": return sourceReview(request, controls, false);
   case "agent_operation_brief_response_v2": return advisorAnswer;
   case "case_brief": return caseBrief(request);
   case "semantic_claim_audit_revision_v2": return semanticAudit(request, true);
   case "semantic_claim_audit_v2": return semanticAudit(request, false);
   default: throw new Error(`synthetic_answer_unknown_schema: ${request.schemaName}`);
  }
 })();
 const rawText = JSON.stringify(output);
 // Small, deterministic usage: enough to be measured and settled, far below any reservation.
 return {output, rawText, usage: {inputTokens: 1_000 + (inputText(request).length % 997), outputTokens: 100 + (rawText.length % 211), cachedInputTokens: 0},
  model: request.model, stopReason: "end"};
}
