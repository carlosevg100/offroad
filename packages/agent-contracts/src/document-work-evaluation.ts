import {createHash} from "node:crypto";

import {fingerprintJson} from "@offroad/case-understanding";
import {z} from "zod";

/**
 * The document work product family of governed evaluations. Four protected live evaluations run
 * in the worker under the governed evaluation transport: the documentary executor with its
 * source-review controls, the one-control continuation of its second authorized round, the
 * advisor response contract and the executive synthesis author and reviewer. This module is the
 * contract between each script, which assembles the inputs offline, and the worker, which runs
 * them: the ceilings each evaluation keeps, the snapshot each one sends, the scoring and
 * accounting its record is made of, and the record the worker publishes and the script reads.
 *
 * The scoring and accounting functions moved here unchanged from the evals package, so the worker
 * that now runs the evaluations computes exactly what the scripts computed.
 */

// ---------------------------------------------------------------------------------------------
// Scoring and accounting of the documentary evaluation (moved unchanged from packages/evals).
// ---------------------------------------------------------------------------------------------

export type LiveProduct = {
  job: string; status: string; fingerprint: string; inputFingerprint: string;
  sections: Array<{key: string; observations: Array<{text: string; citations: Array<{passageId: string; quote: string}>}>}>;
  hypotheses: Array<{text: string; question: string}>; gaps: Array<{text: string; question: string}>;
};
type SemanticAssertion = {id:string;rationale:string;sourceId:string;sourceQuote:string;forbiddenClaims:readonly {id:string;pattern:string}[]};
type LiveSample = {job:string;expected:readonly string[];passages:readonly {id:string;text:string}[];semanticAssertions?:readonly SemanticAssertion[] | undefined};
/** Authored reference-case checks, not a general claim of semantic verification. */
export function scoreDocumentWorkSemantics(product: LiveProduct, sample: LiveSample) {
  const failures: Array<{assertionId:string;ruleId:string;field:string;matchedText:string}> = [];
  for (const assertion of sample.semanticAssertions ?? []) {
    if (!sample.passages.some(passage => passage.id === assertion.sourceId && passage.text.includes(assertion.sourceQuote))) {
      failures.push({assertionId:assertion.id,ruleId:"reference-source-mismatch",field:"reference",matchedText:""});
      continue;
    }
    const fields = [...product.hypotheses.flatMap((item,index) => [{field:`hypotheses.${index}.text`,text:item.text,pairedText:null},{field:`hypotheses.${index}.question`,text:item.question,pairedText:item.text}]),
      ...product.gaps.flatMap((item,index) => [{field:`gaps.${index}.text`,text:item.text,pairedText:null},{field:`gaps.${index}.question`,text:item.question,pairedText:item.text}])];
    for (const {field,text,pairedText} of fields) for (const rule of assertion.forbiddenClaims) {
      const pattern = new RegExp(rule.pattern,"gi");
      for (const match of text.matchAll(pattern)) {
        const sentenceStart = Math.max(text.lastIndexOf(".",match.index),text.lastIndexOf("?",match.index),text.lastIndexOf("!",match.index)) + 1;
        const sentenceEnd = text.slice(match.index).search(/[.!?]/);
        const clause = text.slice(sentenceStart,sentenceEnd < 0 ? undefined : match.index + sentenceEnd);
        const conditionalEnd = clause.indexOf(",");
        // A stated hypothesis antecedent is not an assertion that its condition already holds.
        if (/^\s*if\b/i.test(clause) && conditionalEnd >= 0 && match.index - sentenceStart < conditionalEnd) continue;
        if (/\bif\s+(?:the\s+)?$/i.test(text.slice(sentenceStart,match.index))) continue;
        // Documentary absence explicitly scoped to supplied information preserves the source meaning.
        const afterClaim = text.slice(match.index + match[0].length);
        if (rule.id === "asserted-absence" && /^(?: and (?:a |an )?(?:leverage covenant|amortization schedule))? (?:from|in) (?:the )?(?:supplied|provided|reviewed|available) (?:passages|documents|materials|information)\b/i.test(afterClaim)) continue;
        // Narrow paired-field exception for this English reference rule: the same term is
        // explicitly hypothetical in the paired text and the question asks for possibly none.
        // Other assertions in either field still pass through every rule independently.
        const term = /\b(leverage covenant|amortization schedule)\b/i.exec(match[0])?.[1];
        if (rule.id === "asserted-absence" && pairedText && term
          && new RegExp(`^if (?:the (?:agreement|loan) (?:has no|lacks)|no) (?:an? )?${term}\\b[^,]*,`, "i").test(pairedText.trim())
          && /^what (?:other|additional) [^.!?]+, if any, [^.!?]+\?$/i.test(text.trim())
          && /^in the $/i.test(text.slice(Math.max(0,match.index-7),match.index))) continue;
        failures.push({assertionId:assertion.id,ruleId:rule.id,field,matchedText:match[0]});
      }
    }
  }
  return {passed:failures.length === 0,scope:"authored_reference_assertions_only" as const,assertions:(sample.semanticAssertions ?? []).map(item=>({id:item.id,rationale:item.rationale})),failures};
}
export function scoreDocumentWorkLive(product: LiveProduct, sample: LiveSample) {
  const observations = product.sections.flatMap(section => section.observations);
  const quotes = observations.flatMap(observation => observation.citations);
  const text = quotes.map(quote => quote.quote).join("\n").toLowerCase();
  const expectedCoverage = sample.expected.map(term => ({term, covered: text.includes(term.toLowerCase())}));
  const supported = observations.every(observation => observation.citations.some(citation => citation.quote.includes(observation.text)))
    && quotes.every(citation => sample.passages.some(passage => passage.id === citation.passageId && passage.text.includes(citation.quote)));
  const sourceCoverage = sample.passages.every(source => quotes.some(quote => quote.passageId === source.id));
  const substantive = observations.length >= 2 && product.hypotheses.length + product.gaps.length > 0;
  const semantics = scoreDocumentWorkSemantics(product,sample);
  return {passed: semantics.passed && product.job === sample.job && product.status === "preliminary" && supported && sourceCoverage && substantive && expectedCoverage.every(item => item.covered), supported, sourceCoverage, substantive, expectedCoverage, semantics};
}
export function compareDocumentWorkRepeats(first: LiveProduct, second: LiveProduct, sample: Parameters<typeof scoreDocumentWorkLive>[1]) {
  const a = scoreDocumentWorkLive(first,sample), b = scoreDocumentWorkLive(second,sample);
  return {passed: a.passed && b.passed && first.inputFingerprint === second.inputFingerprint,
    sameInput: first.inputFingerprint === second.inputFingerprint, sameFullOutput: first.fingerprint === second.fingerprint,
    expectedFactCoverageStable: JSON.stringify(a.expectedCoverage) === JSON.stringify(b.expectedCoverage)};
}

/** Exact authored control expectations; never a general semantic acceptance claim. */
export function scoreDocumentWorkSourceReviewControl(
  sample: {expectedIssueFieldId:string|null;expectedIssueFieldIds:readonly string[];expectedCleanFieldIds:readonly string[]},
  review: {issues:readonly {fieldId:string}[]},
): boolean {
  const flagged = new Set(review.issues.map(issue=>issue.fieldId));
  return (sample.expectedIssueFieldId !== null || review.issues.length === 0)
    && sample.expectedIssueFieldIds.every(id=>flagged.has(id))
    && sample.expectedCleanFieldIds.every(id=>!flagged.has(id));
}

const guardCodes = new Set([
  "document_work_product_wrong_sections", "document_work_product_unbound_number",
  "document_work_product_invalid_citation", "document_work_product_non_extractive_observation",
  "document_work_product_empty_without_gap", "document_work_product_source_review_failed",
  "document_work_product_duplicate_selection", "document_work_product_quote_budget_exceeded",
]);
const diagnosticText = z.string().min(1).max(2000);
// Allowlisted diagnostic shape only. Provider metadata, arbitrary error text and unknown fields never enter evidence.
const rejectedNarrative = z.object({
  sections: z.array(z.object({key: z.enum(["terms","differences","clarifications","company_context","discussion_points","meeting_questions","transaction","protections","risks"]), title: diagnosticText,
    observations: z.array(z.object({text: diagnosticText, citations: z.array(z.object({passageId:z.string().min(1).max(160),quote:diagnosticText}).strict()).max(8)}).strict()).max(12),
  }).strict()).max(3),
  hypotheses: z.array(z.object({text: diagnosticText,basisPassageIds:z.array(z.string().min(1).max(160)).max(8),question:diagnosticText}).strict()).max(8),
  gaps: z.array(z.object({text: diagnosticText,question:diagnosticText}).strict()).max(12),
}).strict();

/** Eval artifact only: caller is the protected workflow executing the fixed synthetic corpus. */
export function documentWorkFailureDiagnostics(error: unknown, output: unknown, providerCallIndex: number | null) {
  const code = error instanceof Error && guardCodes.has(error.message) ? error.message : "executor_or_provider_rejected";
  const parsed = rejectedNarrative.safeParse(output);
  return {
    code,
    rejectedOutput: parsed.success ? {
      classification: "synthetic_rejected_narrative_not_product" as const,
      content: parsed.data,
      contentFingerprint: fingerprintJson(parsed.data),
      providerCallIndex,
    } : null,
  };
}

type Spend={calls:number;costUsd:number;unknownCostCalls:number};
type Control={caseId:string;passed:boolean;providerCallRange:{start:number;end:number}};

/** Gold retains 18 attempts; unused attempts may be assigned only after gold has finished. */
export function documentWorkControlCallBudget(goldCalls:number):number {
 if(!Number.isSafeInteger(goldCalls)||goldCalls<0||goldCalls>18)throw new Error("document_work_invalid_gold_call_accounting");
 return 26-goldCalls;
}

export function summarizeDocumentWorkControls(controls:readonly Control[],gold:Spend,spent:Spend){
 let maxCalls:number|null=null;
 try{maxCalls=documentWorkControlCallBudget(gold.calls);}catch{}
 let cursor=0;
 const rangesValid=controls.every(control=>{
  const {start,end}=control.providerCallRange;
  const valid=Number.isSafeInteger(start)&&Number.isSafeInteger(end)&&start===cursor&&end>=start;
  cursor=end;return valid;
 });
 const executedControls=controls.filter(control=>control.providerCallRange.end>control.providerCallRange.start).length;
 const totalCalls=gold.calls+spent.calls,totalCostUsd=gold.costUsd+spent.costUsd;
 return {passed:maxCalls!==null&&controls.length===8&&new Set(controls.map(control=>control.caseId)).size===8
  &&controls.every(control=>control.passed)&&executedControls===8&&rangesValid&&cursor===spent.calls
  &&Number.isSafeInteger(spent.calls)&&spent.calls>=8&&spent.calls<=maxCalls&&totalCalls<=26
  &&Number.isFinite(gold.costUsd)&&gold.costUsd>=0&&gold.costUsd<=2.5
  &&Number.isFinite(spent.costUsd)&&spent.costUsd>=0&&spent.costUsd<=.5&&totalCostUsd<=3
  &&gold.unknownCostCalls===0&&spent.unknownCostCalls===0,
  maxCalls,executedControls,totalCalls,totalCostUsd,notCalledControls:controls.filter(control=>control.providerCallRange.start===control.providerCallRange.end).map(control=>control.caseId)};
}

/** Keep budget non-execution distinct from a provider/validation rejection, without raw errors. */
export function documentWorkControlFailure(error:unknown,start:number,end:number):string {
 const code=error&&typeof error==="object"&&"code" in error?error.code:undefined;
 if(code==="budget_exceeded")return start===end?"not_called_budget":"attempted_budget_exhausted";
 if(code==="all_attempts_failed"||code==="invalid_output"||code==="output_truncated"||code==="timeout")return "provider_response_rejected";
 return "executor_or_provider_rejected";
}

/** Evidence accounting only; validation and source review remain in the real executor. */
export function summarizeDocumentWorkAttempts(
  runs: readonly {passed:boolean;completeCalls:number;narrativeCalls:number;reviewCalls:number;firstResponseValid:boolean;providerCalls:number}[],
  repeats: readonly boolean[],
  spent: {calls:number;costUsd:number;unknownCostCalls:number},
) {
  const firstPassSuccessCount = runs.filter(run=>run.passed && run.narrativeCalls === 1 && run.reviewCalls === 1 && run.firstResponseValid).length;
  const bounded = runs.every(run=>run.completeCalls >= 2 && run.completeCalls <= 3 && run.narrativeCalls >= 1 && run.narrativeCalls <= 2
    && ((run.reviewCalls === 1 && run.completeCalls <= 3) || (run.reviewCalls === 2 && run.narrativeCalls === 1 && run.completeCalls === 3)) && run.completeCalls === run.narrativeCalls + run.reviewCalls && run.providerCalls >= run.completeCalls)
    && runs.reduce((sum,run)=>sum+run.providerCalls,0) === spent.calls;
  return {passed:runs.length === 6 && runs.every(run=>run.passed) && repeats.length === 3 && repeats.every(Boolean)
    && bounded && spent.calls >= 12 && spent.calls <= 18 && Number.isFinite(spent.costUsd) && spent.costUsd >= 0 && spent.costUsd <= 2.5 && spent.unknownCostCalls === 0,
    firstPassSuccessCount, firstPassSuccessRate:runs.length ? firstPassSuccessCount/runs.length : 0,
    requestsRecorded:runs.length, callsPerRequest:runs.map(run=>({executorCompleteCalls:run.completeCalls,narrativeCalls:run.narrativeCalls,sourceReviewCalls:run.reviewCalls,providerCalls:run.providerCalls}))};
}

// ---------------------------------------------------------------------------------------------
// Ceilings. The founder's defaults, read by the script for the contract budget and by the worker
// for the partitions it keeps inside it. Spending changes are the founder's decision.
// ---------------------------------------------------------------------------------------------

/** Gold keeps 18 attempts and USD 2.50; the controls receive the attempts gold left of 26, and USD 0.50. */
export const documentWorkProductLiveBudget = {
  maxCostUsd: 3, maxCalls: 26,
  gold: {maxCostUsd: 2.5, maxCalls: 18},
  sourceReviewControls: {maxCostUsd: 0.5, allocation: "26-minus-completed-gold-calls"},
} as const;
export const advisorResponseLiveBudget = {maxCostUsd: 1, maxCalls: 8} as const;
export const executiveSynthesisLiveBudget = {maxCostUsd: 3, maxCalls: 8} as const;

// ---------------------------------------------------------------------------------------------
// Shared pieces of the snapshots and records.
// ---------------------------------------------------------------------------------------------

const hash = z.string().regex(/^[a-f0-9]{64}$/);
const identifier = z.string().min(1).max(160);
const whole = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const dollars = z.number().finite().nonnegative();
const sha256Text = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");

/** One model route, as the model gateway names it. */
export const evaluationModelRouteSchema = z.object({
  provider: z.enum(["anthropic", "openai"]),
  model: z.string().min(1).max(120),
  effort: z.enum(["low", "medium", "high", "xhigh", "max"]),
}).strict();
export type EvaluationModelRoute = z.infer<typeof evaluationModelRouteSchema>;

/** A task policy exactly as the script read it from the gateway defaults; null where the policy has none. */
export const evaluationTaskPolicySchema = z.object({
  primary: evaluationModelRouteSchema,
  shadow: evaluationModelRouteSchema.nullable(),
  fallback: evaluationModelRouteSchema.nullable(),
  maxOutputTokens: z.number().int().min(1).max(128_000),
  timeoutMs: z.number().int().min(1_000).max(3_600_000),
}).strict();
export type EvaluationTaskPolicy = z.infer<typeof evaluationTaskPolicySchema>;

/** Reads a gateway task policy into the snapshot form; routes the evaluation never takes are dropped. */
export function evaluationTaskPolicy(policy: {primary: EvaluationModelRoute; shadow?: EvaluationModelRoute; fallback?: EvaluationModelRoute; maxOutputTokens: number; timeoutMs: number}): EvaluationTaskPolicy {
  return evaluationTaskPolicySchema.parse({
    primary: policy.primary, shadow: policy.shadow ?? null, fallback: policy.fallback ?? null,
    maxOutputTokens: policy.maxOutputTokens, timeoutMs: policy.timeoutMs,
  });
}

/** Every route a task policy may send to, primary first. */
export function evaluationPolicyRoutes(policy: EvaluationTaskPolicy): EvaluationModelRoute[] {
  return policy.fallback && (policy.fallback.provider !== policy.primary.provider || policy.fallback.model !== policy.primary.model)
    ? [policy.primary, policy.fallback] : [policy.primary];
}

/** Distinct routes by provider and model, in first-seen order: a contract declares each once. */
export function distinctEvaluationRoutes(routes: readonly EvaluationModelRoute[]): EvaluationModelRoute[] {
  const seen = new Map<string, EvaluationModelRoute>();
  for (const route of routes) if (!seen.has(`${route.provider}:${route.model}`)) seen.set(`${route.provider}:${route.model}`, route);
  return [...seen.values()];
}

/** Spend as the model gateway reports it, for one partition of the run. */
export const evaluationSpendSchema = z.object({calls: whole, costUsd: dollars, unknownCostCalls: whole, budgetExposureUsd: dollars}).strict();
export type EvaluationSpend = z.infer<typeof evaluationSpendSchema>;

const callRangeSchema = z.object({start: whole, end: whole}).strict();

/**
 * One request the evaluation made through the governed gateway, content-free: which attempts it
 * took, what answered it and what it cost. It replaces the per-attempt call log the scripts kept
 * when they held the providers: that log belongs to the worker now, and each attempt's
 * reservation and settlement belong to the database receipts the script writes beside the record.
 */
export const evaluationGatewayRequestSchema = z.object({
  partition: z.string().regex(/^[a-z_]{1,40}$/),
  task: z.string().min(1).max(60),
  schemaName: z.string().min(1).max(120),
  providerCallRange: callRangeSchema,
  outcome: z.enum(["ok", "budget_exceeded", "all_attempts_failed", "output_truncated"]),
  attempts: z.array(z.object({
    provider: z.enum(["anthropic", "openai"]),
    model: z.string().min(1).max(120),
    outcome: z.enum(["ok", "refusal", "error", "invalid_output", "policy_rejected"]),
    retryOrdinal: whole,
    isSameModelRepair: z.boolean(),
    usedProviderFallback: z.boolean(),
  }).strict()).max(4),
  answer: z.object({
    provider: z.enum(["anthropic", "openai"]),
    /** The model name the provider answered with, which may carry a dated suffix. */
    model: z.string().min(1).max(300),
    effort: z.enum(["low", "medium", "high", "xhigh", "max"]),
    usage: z.object({inputTokens: whole, outputTokens: whole, cachedInputTokens: whole, cacheCreationInputTokens: whole.optional(), reasoningTokens: whole.optional()}).strict(),
    costUsd: dollars,
    latencyMs: whole,
    stopReason: z.enum(["end", "max_tokens", "refusal", "other"]),
    fromCassette: z.boolean(),
  }).strict().nullable(),
  spent: evaluationSpendSchema,
}).strict();
export type EvaluationGatewayRequest = z.infer<typeof evaluationGatewayRequestSchema>;

/** A regular expression the scoring compiles; refused here when it does not compile. */
const pattern = z.string().min(1).max(300).refine((value) => {
  try { new RegExp(value, "gi"); return true; } catch { return false; }
}, "pattern must compile");

// ---------------------------------------------------------------------------------------------
// The documentary executor with its source-review controls (run-document-work-product-live).
// ---------------------------------------------------------------------------------------------

const jobSchema = z.enum(["comparison", "meeting", "review"]);
const sectionKeySchema = z.enum(["terms", "differences", "clarifications", "company_context", "discussion_points", "meeting_questions", "transaction", "protections", "risks"]);
const passageText = z.string().min(1).max(12_000);
const authoredText = z.string().min(1).max(2_000);

/** One authored gold case, exactly as the fixture holds it. Nothing is trimmed, so its fingerprint survives. */
export const documentWorkGoldCaseSchema = z.object({
  id: identifier,
  job: jobSchema,
  objective: z.string().min(1).max(8_000),
  expected: z.array(z.string().min(1).max(200)).min(1).max(20),
  semanticAssertions: z.array(z.object({
    id: identifier,
    rationale: z.string().min(1).max(2_000),
    sourceId: identifier,
    sourceQuote: z.string().min(1).max(2_000),
    forbiddenClaims: z.array(z.object({id: identifier, pattern}).strict()).min(1).max(20),
  }).strict()).max(10).optional(),
  passages: z.array(z.object({id: identifier, documentName: z.string().min(1).max(500), text: passageText}).strict()).min(1).max(20),
}).strict();
export type DocumentWorkGoldCase = z.infer<typeof documentWorkGoldCaseSchema>;

/** The executor input of a control, as the fixture holds it; the executor reads it again with its own schema. */
export const documentWorkInputSnapshotSchema = z.object({
  job: jobSchema,
  locale: z.enum(["pt-BR", "en-US"]),
  approvedRequest: z.object({text: z.string().min(1).max(8_000), fingerprint: hash}).strict(),
  passages: z.array(z.object({
    id: identifier, documentId: identifier, documentName: z.string().min(1).max(500), version: identifier, hash, anchor: z.string().min(1).max(500), text: passageText,
  }).strict()).min(1).max(80),
  coverage: z.object({documentsConsidered: z.number().int().positive(), omittedPassages: whole, limitations: z.array(authoredText).max(30)}).strict(),
}).strict();
export type DocumentWorkInputSnapshot = z.infer<typeof documentWorkInputSnapshotSchema>;

export const documentWorkNarrativeSnapshotSchema = z.object({
  sections: z.array(z.object({
    key: sectionKeySchema,
    title: authoredText,
    observations: z.array(z.object({text: authoredText, citations: z.array(z.object({passageId: identifier, quote: authoredText}).strict()).min(1).max(8)}).strict()).max(12),
  }).strict()).length(3),
  hypotheses: z.array(z.object({text: authoredText, basisPassageIds: z.array(identifier).min(1).max(8), question: authoredText}).strict()).max(8),
  gaps: z.array(z.object({text: authoredText, question: authoredText}).strict()).max(12),
}).strict();
export type DocumentWorkNarrativeSnapshot = z.infer<typeof documentWorkNarrativeSnapshotSchema>;

/** One authored source-review control, exactly as the fixture holds it. */
export const documentWorkSourceReviewControlSchema = z.object({
  id: identifier,
  scope: z.literal("mixed_locale_review_controls"),
  input: documentWorkInputSnapshotSchema,
  narrative: documentWorkNarrativeSnapshotSchema,
  expectedIssueFieldId: identifier.nullable(),
  expectedIssueFieldIds: z.array(identifier).max(43),
  expectedCleanFieldIds: z.array(identifier).max(43),
}).strict();
export type DocumentWorkSourceReviewControl = z.infer<typeof documentWorkSourceReviewControlSchema>;

/**
 * The documentary snapshot: the task policy the executor runs under, the authored gold cases and
 * the authored source-review controls. The ceilings are not in it: both sides read them from
 * documentWorkProductLiveBudget, so no snapshot can ask for more.
 */
export const documentWorkProductLiveSnapshotSchema = z.object({
  schemaVersion: z.literal("document-work-product-live-snapshot.v1"),
  policy: evaluationTaskPolicySchema,
  goldCases: z.array(documentWorkGoldCaseSchema).min(1).max(3),
  sourceReviewControls: z.array(documentWorkSourceReviewControlSchema).min(1).max(8),
}).strict().superRefine((snapshot, context) => {
  if (new Set(snapshot.goldCases.map((sample) => sample.id)).size !== snapshot.goldCases.length) context.addIssue({code: "custom", path: ["goldCases"], message: "each gold case once"});
  if (new Set(snapshot.sourceReviewControls.map((sample) => sample.id)).size !== snapshot.sourceReviewControls.length) context.addIssue({code: "custom", path: ["sourceReviewControls"], message: "each control once"});
});
export type DocumentWorkProductLiveSnapshot = z.infer<typeof documentWorkProductLiveSnapshotSchema>;

/** The executor input of one gold case, built exactly as the documentary script always built it. */
export function documentWorkProductGoldInput(sample: DocumentWorkGoldCase) {
  return {
    job: sample.job,
    locale: "en-US" as const,
    approvedRequest: {text: sample.objective, fingerprint: fingerprintJson({objective: sample.objective})},
    passages: sample.passages.map((passage) => ({...passage, documentId: passage.id, version: "1", hash: fingerprintJson(passage.text), anchor: "paragraph 1"})),
    coverage: {documentsConsidered: sample.passages.length, omittedPassages: 0, limitations: ["Synthetic document-only case; no financial calculations or independent diligence."]},
  };
}

/** Every content hash the documentary snapshot carries once: each passage the executor and the controls read. */
export function documentWorkProductLiveContentHashes(snapshot: DocumentWorkProductLiveSnapshot): string[] {
  const hashes = [
    ...snapshot.goldCases.flatMap((sample) => documentWorkProductGoldInput(sample).passages.map((passage) => passage.hash)),
    ...snapshot.sourceReviewControls.flatMap((sample) => sample.input.passages.map((passage) => passage.hash)),
  ];
  return [...new Set(hashes)].sort();
}

/** The evaluation panel: the documentary evaluation, versioned by the authored fixtures it carries. */
export function documentWorkProductLiveAudience(snapshot: DocumentWorkProductLiveSnapshot): {caseId: string; caseVersion: string} {
  return {caseId: "document-work-product-live", caseVersion: fingerprintJson({goldCases: snapshot.goldCases, sourceReviewControls: snapshot.sourceReviewControls})};
}

const documentWorkLiveScoreSchema = z.object({
  passed: z.boolean(), supported: z.boolean(), sourceCoverage: z.boolean(), substantive: z.boolean(),
  expectedCoverage: z.array(z.object({term: z.string(), covered: z.boolean()}).strict()),
  semantics: z.object({
    passed: z.boolean(),
    scope: z.literal("authored_reference_assertions_only"),
    assertions: z.array(z.object({id: z.string(), rationale: z.string()}).strict()),
    failures: z.array(z.object({assertionId: z.string(), ruleId: z.string(), field: z.string(), matchedText: z.string()}).strict()),
  }).strict(),
}).strict();
const diagnosticsSchema = z.object({
  code: z.string().min(1).max(120),
  rejectedOutput: z.object({classification: z.literal("synthetic_rejected_narrative_not_product"), content: z.json(), contentFingerprint: hash, providerCallIndex: whole.nullable()}).strict().nullable(),
}).strict();

/** What the documentary evaluation publishes: the record its script always wrote, now written by the worker. */
export const documentWorkProductLiveResultSchema = z.object({
  schemaVersion: z.literal("document-work-product-executor-eval.v7"),
  synthetic: z.literal(true),
  scope: z.literal("actual_executor_and_authored_source_review_controls_not_application_e2e"),
  promotion: z.literal(false),
  fixtureFingerprint: hash,
  sourceReviewFixtureFingerprint: hash,
  policy: evaluationTaskPolicySchema,
  budgetReservation: z.literal("conservative_text_v1"),
  budget: z.object({
    maxCostUsd: z.literal(3), maxCalls: z.literal(26),
    gold: z.object({maxCostUsd: z.literal(2.5), maxCalls: z.literal(18)}).strict(),
    sourceReviewControls: z.object({maxCostUsd: z.literal(0.5), maxCalls: whole.nullable(), allocation: z.literal("26-minus-completed-gold-calls")}).strict(),
  }).strict(),
  spent: evaluationSpendSchema,
  sourceReviewControlSpend: evaluationSpendSchema,
  accounting: z.object({
    passed: z.boolean(), firstPassSuccessCount: whole, firstPassSuccessRate: z.number().finite().min(0).max(1), requestsRecorded: whole,
    callsPerRequest: z.array(z.object({executorCompleteCalls: whole, narrativeCalls: whole, sourceReviewCalls: whole, providerCalls: whole}).strict()),
  }).strict(),
  controlAccounting: z.object({
    passed: z.boolean(), maxCalls: whole.nullable(), executedControls: whole, totalCalls: whole, totalCostUsd: dollars, notCalledControls: z.array(identifier),
  }).strict(),
  passed: z.boolean(),
  runs: z.array(z.object({
    caseId: identifier,
    repeat: z.union([z.literal(1), z.literal(2)]),
    product: z.json().nullable(),
    score: documentWorkLiveScoreSchema.nullable(),
    failure: z.string().min(1).max(120).nullable(),
    diagnostics: diagnosticsSchema.nullable(),
    providerCallRange: callRangeSchema,
    completeCalls: whole, narrativeCalls: whole, reviewCalls: whole,
    responses: z.array(z.object({
      kind: z.enum(["narrative", "source_review"]),
      providerCallIndex: whole,
      contentFingerprint: hash,
      validationPassed: z.boolean(),
      diagnostics: diagnosticsSchema.nullable(),
      syntheticNarrative: z.json().nullable(),
      syntheticReview: z.json().nullable(),
    }).strict()).max(3),
  }).strict()).max(6),
  repeats: z.array(z.object({
    caseId: identifier,
    comparison: z.object({passed: z.boolean(), sameInput: z.boolean(), sameFullOutput: z.boolean(), expectedFactCoverageStable: z.boolean()}).strict().nullable(),
  }).strict()).max(3),
  sourceReviewControls: z.array(z.object({
    caseId: identifier, expectedIssueFieldId: identifier.nullable(), expectedIssueFieldIds: z.array(identifier), expectedCleanFieldIds: z.array(identifier),
    scope: z.literal("mixed_locale_review_controls"), passed: z.boolean(), review: z.json().nullable(), failure: z.string().min(1).max(120).nullable(), providerCallRange: callRangeSchema,
  }).strict()).max(8),
  gatewayRequests: z.array(evaluationGatewayRequestSchema).max(18),
  sourceReviewControlGatewayRequests: z.array(evaluationGatewayRequestSchema).max(8),
}).strict();
export type DocumentWorkProductLiveResult = z.infer<typeof documentWorkProductLiveResultSchema>;

// ---------------------------------------------------------------------------------------------
// The one-control continuation of the second authorized documentary round
// (continue-document-work-product-live).
// ---------------------------------------------------------------------------------------------

/** What the continuation may still spend, derived offline from the pinned receipt of the source run. */
export const documentWorkContinuationPlanSchema = z.object({
  sourceRunId: z.string().regex(/^[0-9]{1,20}$/),
  sourceReceiptSha256: hash,
  caseId: identifier,
  remainingCalls: z.literal(1),
  maxCostUsd: z.number().finite().positive().max(0.5),
  priorCalls: z.literal(25),
  priorCostUsd: z.number().finite().nonnegative().max(3),
}).strict();
export type DocumentWorkContinuationPlan = z.infer<typeof documentWorkContinuationPlanSchema>;

/** The continuation snapshot: the plan, the one control it runs and the policy of its single route. */
export const documentWorkContinuationSnapshotSchema = z.object({
  schemaVersion: z.literal("document-work-product-continuation-snapshot.v1"),
  policy: evaluationTaskPolicySchema,
  plan: documentWorkContinuationPlanSchema,
  control: documentWorkSourceReviewControlSchema,
}).strict().superRefine((snapshot, context) => {
  if (snapshot.control.id !== snapshot.plan.caseId) context.addIssue({code: "custom", path: ["control", "id"], message: "the control is the plan's case"});
  // One call and no other provider: the source run held only this route for its last control.
  if (snapshot.policy.fallback !== null) context.addIssue({code: "custom", path: ["policy", "fallback"], message: "the continuation has one route"});
});
export type DocumentWorkContinuationSnapshot = z.infer<typeof documentWorkContinuationSnapshotSchema>;

export function documentWorkContinuationContentHashes(snapshot: DocumentWorkContinuationSnapshot): string[] {
  return [...new Set(snapshot.control.input.passages.map((passage) => passage.hash))].sort();
}

export function documentWorkContinuationAudience(snapshot: DocumentWorkContinuationSnapshot): {caseId: string; caseVersion: string} {
  return {caseId: "document-work-product-continuation", caseVersion: snapshot.plan.sourceReceiptSha256};
}

export const documentWorkContinuationResultSchema = z.object({
  schemaVersion: z.literal("document-work-product-continuation.v2"),
  synthetic: z.literal(true),
  scope: z.literal("one_previously_unexecuted_control"),
  sourceRunId: z.string().regex(/^[0-9]{1,20}$/),
  sourceReceiptSha256: hash,
  sourceEvaluationPassed: z.literal(false),
  caseId: identifier,
  passed: z.boolean(),
  combinedAcceptancePassed: z.boolean(),
  combinedCalls: whole,
  combinedCostUsd: dollars,
  priorCalls: z.literal(25),
  priorCostUsd: dollars,
  spent: evaluationSpendSchema,
  gatewayRequests: z.array(evaluationGatewayRequestSchema).max(1),
  review: z.json().nullable(),
  failure: z.literal("continuation_rejected_or_unknown").nullable(),
}).strict();
export type DocumentWorkContinuationResult = z.infer<typeof documentWorkContinuationResultSchema>;

// ---------------------------------------------------------------------------------------------
// The advisor response provider contract (run-advisor-response-live).
// ---------------------------------------------------------------------------------------------

/** Both routes the probe exercises, each once per response shape, never falling back to the other. */
export const advisorResponseLiveSnapshotSchema = z.object({
  schemaVersion: z.literal("advisor-response-live-snapshot.v1"),
  policy: evaluationTaskPolicySchema,
  routes: z.object({anthropic: evaluationModelRouteSchema, openai: evaluationModelRouteSchema}).strict(),
  /** The synthetic conversation the production contract receives, as one text part. */
  input: z.string().min(1).max(20_000),
}).strict().superRefine((snapshot, context) => {
  if (snapshot.routes.anthropic.provider !== "anthropic") context.addIssue({code: "custom", path: ["routes", "anthropic"], message: "the anthropic route is anthropic"});
  if (snapshot.routes.openai.provider !== "openai") context.addIssue({code: "custom", path: ["routes", "openai"], message: "the openai route is openai"});
});
export type AdvisorResponseLiveSnapshot = z.infer<typeof advisorResponseLiveSnapshotSchema>;

export function advisorResponseLiveContentHashes(snapshot: AdvisorResponseLiveSnapshot): string[] {
  return [sha256Text(snapshot.input)];
}

export function advisorResponseLiveAudience(snapshot: AdvisorResponseLiveSnapshot): {caseId: string; caseVersion: string} {
  return {caseId: "advisor-response-live", caseVersion: sha256Text(snapshot.input)};
}

/** The order the probe always ran its four requests in. */
export const advisorResponseLiveSequence = [
  {provider: "anthropic", shape: "prior_structured"},
  {provider: "anthropic", shape: "current_prompted"},
  {provider: "openai", shape: "prior_structured"},
  {provider: "openai", shape: "current_prompted"},
] as const;

export const advisorResponseLiveResultSchema = z.object({
  schemaVersion: z.literal("advisor-response-live.v2"),
  synthetic: z.literal(true),
  promotion: z.literal(false),
  scope: z.literal("actual_advisor_response_contract_not_full_application"),
  passed: z.boolean(),
  budget: z.object({maxCostUsd: z.literal(1), maxCalls: z.literal(8)}).strict(),
  spent: evaluationSpendSchema,
  results: z.array(z.object({
    provider: z.enum(["anthropic", "openai"]),
    shape: z.enum(["prior_structured", "current_prompted"]),
    passed: z.boolean(),
    failure: z.string().min(1).max(120).nullable(),
    start: whole,
    end: whole,
  }).strict()).max(4),
  gatewayRequests: z.array(evaluationGatewayRequestSchema).max(4),
}).strict();
export type AdvisorResponseLiveResult = z.infer<typeof advisorResponseLiveResultSchema>;

// ---------------------------------------------------------------------------------------------
// The executive synthesis author and independent reviewer (run-executive-synthesis-live).
// ---------------------------------------------------------------------------------------------

const optionalLabel = z.string().min(1).max(200).optional();
/** One fact candidate of the generated case, exactly as the case factory produced it. */
export const executiveSynthesisFactCandidateSchema = z.object({
  fieldPath: z.string().min(1).max(300),
  normalizedValue: z.string().max(20_000),
  valueType: z.enum(["text", "number", "date", "boolean", "list"]),
  sourceDocument: z.string().min(1).max(300),
  evidenceRank: z.number().int().min(1).max(7),
  informationClass: z.string().min(1).max(120),
  confidence: z.number().finite().min(0).max(1),
  anchorVerified: z.boolean(),
  periodStart: optionalLabel,
  periodEnd: optionalLabel,
  entityName: optionalLabel,
  entityScope: optionalLabel,
  currency: optionalLabel,
  unit: optionalLabel,
  scale: optionalLabel,
  scenario: optionalLabel,
  definitionVersionId: optionalLabel,
  anchor: z.json().optional(),
}).strict();
export type ExecutiveSynthesisFactCandidate = z.infer<typeof executiveSynthesisFactCandidateSchema>;

/**
 * The executive synthesis snapshot: the case generated offline from the authored scenario (its
 * fact candidates and classified documents), the scenario's fingerprint, the author and reviewer
 * task policies, and the reviewer route opposite each author provider.
 */
export const executiveSynthesisLiveSnapshotSchema = z.object({
  schemaVersion: z.literal("executive-synthesis-live-snapshot.v1"),
  fixtureFingerprint: hash,
  policies: z.object({case_brief: evaluationTaskPolicySchema, audit_evidence: evaluationTaskPolicySchema}).strict(),
  reviewers: z.object({anthropic: evaluationModelRouteSchema, openai: evaluationModelRouteSchema}).strict(),
  case: z.object({
    archetypeId: z.string().min(1).max(80),
    referenceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    candidates: z.array(executiveSynthesisFactCandidateSchema).min(1).max(2_000),
    documents: z.array(z.object({id: z.string().min(1).max(300), kind: z.string().min(1).max(120)}).strict()).min(1).max(200),
  }).strict(),
}).strict().superRefine((snapshot, context) => {
  if (snapshot.reviewers.anthropic.provider !== "anthropic") context.addIssue({code: "custom", path: ["reviewers", "anthropic"], message: "the anthropic reviewer is anthropic"});
  if (snapshot.reviewers.openai.provider !== "openai") context.addIssue({code: "custom", path: ["reviewers", "openai"], message: "the openai reviewer is openai"});
});
export type ExecutiveSynthesisLiveSnapshot = z.infer<typeof executiveSynthesisLiveSnapshotSchema>;

/** The generated case is the one source the author and the reviewer read. */
export function executiveSynthesisLiveContentHashes(snapshot: ExecutiveSynthesisLiveSnapshot): string[] {
  return [fingerprintJson(snapshot.case)];
}

export function executiveSynthesisLiveAudience(snapshot: ExecutiveSynthesisLiveSnapshot): {caseId: string; caseVersion: string} {
  return {caseId: "executive-synthesis-live", caseVersion: snapshot.fixtureFingerprint};
}

/** Every route the author and the reviewers may send to. */
export function executiveSynthesisLiveRoutes(snapshot: ExecutiveSynthesisLiveSnapshot): EvaluationModelRoute[] {
  return distinctEvaluationRoutes([...evaluationPolicyRoutes(snapshot.policies.case_brief), snapshot.reviewers.anthropic, snapshot.reviewers.openai]);
}

export const executiveSynthesisLiveResultSchema = z.object({
  schemaVersion: z.literal("executive-synthesis-live.v3"),
  synthetic: z.literal(true),
  promotion: z.literal(false),
  humanApprovalProvided: z.literal(false),
  scope: z.literal("author_and_independent_reviewer_contract_not_application_e2e"),
  fixtureFingerprint: hash,
  budget: z.object({maxCostUsd: z.literal(3), maxCalls: z.literal(8)}).strict(),
  spent: evaluationSpendSchema,
  passed: z.boolean(),
  results: z.array(z.object({
    locale: z.enum(["pt", "en"]),
    passed: z.boolean(),
    brief: z.json().nullable(),
    /** The first blocking finding names a claim id of the author's, so its length is the author's too. */
    failure: z.string().min(1).nullable(),
    /** Claim ids are the author's own, unbounded by the brief schema; the result keeps them as written. */
    summaryClaimIds: z.array(z.string().min(1)),
    start: whole,
    end: whole,
    numericIssues: z.array(z.string().max(2_000)),
    semanticIssues: z.array(z.string().max(2_000)),
    semanticAudit: z.json().optional(),
    reviewHistory: z.json().optional(),
    pendingJudgmentIds: z.array(z.string().min(1)),
  }).strict()).max(2),
  gatewayRequests: z.array(evaluationGatewayRequestSchema).max(8),
}).strict();
export type ExecutiveSynthesisLiveResult = z.infer<typeof executiveSynthesisLiveResultSchema>;
