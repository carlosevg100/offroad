import {
 advisorResponseLiveAudience,
 advisorResponseLiveBudget,
 advisorResponseLiveContentHashes,
 advisorResponseLiveResultSchema,
 advisorResponseLiveSequence,
 advisorResponseLiveSnapshotSchema,
 compareDocumentWorkRepeats,
 distinctEvaluationRoutes,
 documentWorkContinuationAudience,
 documentWorkContinuationContentHashes,
 documentWorkContinuationResultSchema,
 documentWorkContinuationSnapshotSchema,
 documentWorkControlCallBudget,
 documentWorkControlFailure,
 documentWorkFailureDiagnostics,
 documentWorkProductGoldInput,
 documentWorkProductLiveAudience,
 documentWorkProductLiveBudget,
 documentWorkProductLiveContentHashes,
 documentWorkProductLiveResultSchema,
 documentWorkProductLiveSnapshotSchema,
 evaluationPolicyRoutes,
 executiveSynthesisLiveAudience,
 executiveSynthesisLiveBudget,
 executiveSynthesisLiveContentHashes,
 executiveSynthesisLiveResultSchema,
 executiveSynthesisLiveRoutes,
 executiveSynthesisLiveSnapshotSchema,
 scoreDocumentWorkLive,
 scoreDocumentWorkSourceReviewControl,
 summarizeDocumentWorkAttempts,
 summarizeDocumentWorkControls,
 type AdvisorResponseLiveResult,
 type AdvisorResponseLiveSnapshot,
 type DocumentWorkContinuationResult,
 type DocumentWorkContinuationSnapshot,
 type DocumentWorkProductLiveResult,
 type DocumentWorkProductLiveSnapshot,
 type EvaluationTaskPolicy,
 type ExecutiveSynthesisLiveResult,
 type ExecutiveSynthesisLiveSnapshot,
 type LiveProduct,
} from "@offroad/agent-contracts";
import {
 BRIEF_SYSTEM,
 SEMANTIC_AUDIT_SYSTEM,
 boundSemanticAuditSchema,
 briefAuthoringSchema,
 briefReviewWithRevisionSchema,
 buildBriefEvidenceCatalog,
 buildBriefInput,
 buildSemanticAuditInput,
 compileAuthoredBrief,
 expandBoundSemanticAudit,
 fingerprintJson,
 resolveExecutiveSummaryClaims,
 reviewBriefWithOneRevision,
 type CaseBrief,
} from "@offroad/case-understanding";
import {documentKindSchema} from "@offroad/credit-ontology";
import {archetypeIdSchema, executiveSynthesisRevisionInstructions, type ClassifiedDocument} from "@offroad/credit-playbook";
import type {DocumentWorkProductNarrative} from "@offroad/domain-contracts";
import type {ModelGateway, TaskKind, TaskPolicy} from "@offroad/model-gateway";
import {reconcileCase, type FactCandidate} from "@offroad/reconciliation";
import {advisorResponseContract} from "./agent-operation-brief";
import {createEvaluationBudgetScope} from "./evaluation-budget-partition";
import type {EvaluationFamily} from "./evaluation-families";
import {runDocumentWorkProduct, validateDocumentWorkProductNarrative} from "./document-work-product";
import {hydrateDocumentWorkSelection} from "./document-work-selection";
import {expandDocumentWorkSourceReview, reviewDocumentWorkSourceFidelity, sourceReviewSchema, validateDocumentWorkSourceReview, type DocumentWorkSourceReview} from "./document-work-source-review";

/**
 * The document work product family of governed evaluations: the four protected live evaluations
 * whose scripts held provider keys until stage 17, increment 5. Each family is a pure function of
 * its snapshot and the governed gateway, returning the record its script always wrote, computed by
 * the same worker modules the script called: the documentary executor and its source reviewer,
 * the advisor response contract and the executive synthesis author and reviewer. The ceilings each
 * script kept are kept here per attempt (evaluation-budget-partition.ts); the contract's budget in
 * the database is the outer authority. What the families cannot observe, the per-attempt provider
 * call log, is the worker's log and the database receipts; each record lists its requests instead.
 * The provenance of the requesting run (commit, run id, attempt, workflow) is the script's to add.
 */

/** The gateway policy of a task, from the snapshot form. */
function taskPolicy(policy: EvaluationTaskPolicy): TaskPolicy {
 return {primary: policy.primary, ...(policy.shadow ? {shadow: policy.shadow} : {}), ...(policy.fallback ? {fallback: policy.fallback} : {}),
  maxOutputTokens: policy.maxOutputTokens, timeoutMs: policy.timeoutMs};
}

// ---------------------------------------------------------------------------------------------
// run-document-work-product-live: the documentary executor, two independent repeats of each gold
// case, then the authored source-review controls with the attempts gold left.
// ---------------------------------------------------------------------------------------------

type DocumentWorkRun = DocumentWorkProductLiveResult["runs"][number];
type DocumentWorkControlRecord = DocumentWorkProductLiveResult["sourceReviewControls"][number];

export async function runDocumentWorkProductLive(snapshot: DocumentWorkProductLiveSnapshot, governed: ModelGateway,
 policies: Partial<Record<TaskKind, TaskPolicy>>): Promise<DocumentWorkProductLiveResult> {
 const scope = createEvaluationBudgetScope(governed, policies);
 const budget = documentWorkProductLiveBudget;
 const gold = scope.partition("gold", budget.gold);
 const runs: DocumentWorkRun[] = [];
 const repeats: DocumentWorkProductLiveResult["repeats"] = [];
 const controls: DocumentWorkControlRecord[] = [];
 for (const sample of snapshot.goldCases) {
  const input = documentWorkProductGoldInput(sample);
  const outputs: LiveProduct[] = [];
  for (const repeat of [1, 2] as const) {
   const start = gold.gateway.spent().calls;
   let capturedNarrative: unknown, narrativeProviderIndex: number | null = null, completeCalls = 0, narrativeCalls = 0, reviewCalls = 0;
   const responses: DocumentWorkRun["responses"] = [];
   // Observes each executor request exactly as the script did; the index is that of the answering attempt.
   const observed: Pick<ModelGateway, "complete"> = {async complete(request) {
    completeCalls++;
    const isNarrative = request.schemaName === "document_work_selection_v1";
    if (isNarrative) narrativeCalls++; else reviewCalls++;
    const response = await gold.gateway.complete(request);
    const index = gold.gateway.spent().calls - 1;
    if (isNarrative) {
     capturedNarrative = response.output; narrativeProviderIndex = index;
     let validationFailure: unknown;
     try { capturedNarrative = hydrateDocumentWorkSelection(input, response.output); validateDocumentWorkProductNarrative(input, capturedNarrative); } catch (error) { validationFailure = error; }
     const diagnostic = documentWorkFailureDiagnostics(validationFailure, capturedNarrative, index);
     responses.push({kind: "narrative", providerCallIndex: index, contentFingerprint: fingerprintJson(response.output), validationPassed: validationFailure === undefined,
      diagnostics: validationFailure === undefined ? null : diagnostic, syntheticNarrative: diagnostic.rejectedOutput, syntheticReview: null});
    } else {
     const wire = response.output as Record<string, unknown>;
     const {revisedSelection, ...reviewWire} = wire;
     const parsed = sourceReviewSchema.safeParse(request.schemaName === "document_work_source_review_revision_v3" ? reviewWire : response.output);
     let reviewAccepted = false; let expanded: DocumentWorkSourceReview | null = null;
     try {
      if (parsed.success) {
       expanded = expandDocumentWorkSourceReview(input, parsed.data);
       reviewAccepted = validateDocumentWorkSourceReview(input, capturedNarrative as DocumentWorkProductNarrative, expanded).issues.length === 0;
      }
     } catch { /* recorded as not accepted, as the script recorded it */ }
     responses.push({kind: "source_review", providerCallIndex: index, contentFingerprint: fingerprintJson(response.output), validationPassed: reviewAccepted,
      diagnostics: null, syntheticNarrative: null, syntheticReview: expanded ?? (parsed.success ? parsed.data : null)});
     if (request.schemaName === "document_work_source_review_revision_v3" && revisedSelection !== null && revisedSelection !== undefined) {
      try { capturedNarrative = hydrateDocumentWorkSelection(input, revisedSelection); validateDocumentWorkProductNarrative(input, capturedNarrative); } catch { /* kept as captured */ }
     }
    }
    return response;
   }} as Pick<ModelGateway, "complete">;
   try {
    const product = await runDocumentWorkProduct(input, {gateway: observed});
    outputs.push(product);
    runs.push({caseId: sample.id, repeat, product, score: scoreDocumentWorkLive(product, sample), failure: null, diagnostics: null,
     providerCallRange: {start, end: gold.gateway.spent().calls}, completeCalls, narrativeCalls, reviewCalls, responses});
   } catch (error) {
    // A transport failure is not the executor's: the evaluation ends here, partial.
    scope.throwIfHalted();
    const diagnostics = documentWorkFailureDiagnostics(error, capturedNarrative, narrativeProviderIndex);
    runs.push({caseId: sample.id, repeat, product: null, score: null, failure: diagnostics.code, diagnostics,
     providerCallRange: {start, end: gold.gateway.spent().calls}, completeCalls, narrativeCalls, reviewCalls, responses});
   }
  }
  repeats.push({caseId: sample.id, comparison: outputs.length === 2 ? compareDocumentWorkRepeats(outputs[0]!, outputs[1]!, sample) : null});
 }
 // The controls receive only the attempts completed gold runs left of the aggregate.
 const controlMaxCalls = documentWorkControlCallBudget(gold.gateway.spent().calls);
 const reviews = scope.partition("source_review_controls", {maxCostUsd: budget.sourceReviewControls.maxCostUsd, maxCalls: controlMaxCalls});
 for (const sample of snapshot.sourceReviewControls) {
  const start = reviews.gateway.spent().calls;
  const expected = {expectedIssueFieldId: sample.expectedIssueFieldId, expectedIssueFieldIds: sample.expectedIssueFieldIds, expectedCleanFieldIds: sample.expectedCleanFieldIds, scope: sample.scope};
  try {
   validateDocumentWorkProductNarrative(sample.input, sample.narrative);
   const review = await reviewDocumentWorkSourceFidelity(sample.input, sample.narrative, {gateway: reviews.gateway});
   controls.push({caseId: sample.id, ...expected, passed: scoreDocumentWorkSourceReviewControl(sample, review), review, failure: null,
    providerCallRange: {start, end: reviews.gateway.spent().calls}});
  } catch (error) {
   scope.throwIfHalted();
   const end = reviews.gateway.spent().calls;
   controls.push({caseId: sample.id, ...expected, passed: false, review: null, failure: documentWorkControlFailure(error, start, end), providerCallRange: {start, end}});
  }
 }
 const goldSpend = gold.gateway.spent(), controlSpend = reviews.gateway.spent();
 const accounting = summarizeDocumentWorkAttempts(runs.map((run) => ({passed: run.score?.passed === true, completeCalls: run.completeCalls, narrativeCalls: run.narrativeCalls,
  reviewCalls: run.reviewCalls, firstResponseValid: run.responses.find((response) => response.kind === "narrative")?.validationPassed === true,
  providerCalls: run.providerCallRange.end - run.providerCallRange.start})), repeats.map((item) => item.comparison?.passed === true), goldSpend);
 const controlAccounting = summarizeDocumentWorkControls(controls, goldSpend, controlSpend);
 return documentWorkProductLiveResultSchema.parse({
  schemaVersion: "document-work-product-executor-eval.v7", synthetic: true, scope: "actual_executor_and_authored_source_review_controls_not_application_e2e", promotion: false,
  fixtureFingerprint: fingerprintJson(snapshot.goldCases), sourceReviewFixtureFingerprint: fingerprintJson(snapshot.sourceReviewControls),
  policy: snapshot.policy, budgetReservation: "conservative_text_v1",
  budget: {maxCostUsd: budget.maxCostUsd, maxCalls: budget.maxCalls, gold: budget.gold,
   sourceReviewControls: {maxCostUsd: budget.sourceReviewControls.maxCostUsd, maxCalls: controlMaxCalls, allocation: budget.sourceReviewControls.allocation}},
  spent: goldSpend, sourceReviewControlSpend: controlSpend, accounting, controlAccounting, passed: accounting.passed && controlAccounting.passed,
  runs, repeats, sourceReviewControls: controls, gatewayRequests: gold.requests, sourceReviewControlGatewayRequests: reviews.requests,
 } satisfies DocumentWorkProductLiveResult);
}

export const documentWorkProductLiveFamily: EvaluationFamily = {
 id: "document_work_product_live",
 prepare(value) {
  const snapshot = documentWorkProductLiveSnapshotSchema.parse(value);
  const policies = {preliminary_understanding: taskPolicy(snapshot.policy)};
  return {
   family: "document_work_product_live",
   routes: evaluationPolicyRoutes(snapshot.policy),
   contentHashes: documentWorkProductLiveContentHashes(snapshot),
   audience: documentWorkProductLiveAudience(snapshot),
   policies,
   run: (gateway) => runDocumentWorkProductLive(snapshot, gateway, policies),
  };
 },
};

// ---------------------------------------------------------------------------------------------
// continue-document-work-product-live: the one control the second authorized round left
// unexecuted, with the single call and the dollars its receipt left.
// ---------------------------------------------------------------------------------------------

export async function runDocumentWorkContinuation(snapshot: DocumentWorkContinuationSnapshot, governed: ModelGateway,
 policies: Partial<Record<TaskKind, TaskPolicy>>): Promise<DocumentWorkContinuationResult> {
 const scope = createEvaluationBudgetScope(governed, policies);
 const {plan, control} = snapshot;
 const partition = scope.partition("continuation", {maxCalls: plan.remainingCalls, maxCostUsd: plan.maxCostUsd});
 let review: DocumentWorkSourceReview | null = null;
 let failure: "continuation_rejected_or_unknown" | null = null;
 try { review = await reviewDocumentWorkSourceFidelity(control.input, control.narrative, {gateway: partition.gateway}); }
 catch { scope.throwIfHalted(); failure = "continuation_rejected_or_unknown"; }
 const spent = partition.gateway.spent();
 const combinedCalls = plan.priorCalls + spent.calls, combinedCostUsd = plan.priorCostUsd + spent.costUsd;
 const passed = review !== null && scoreDocumentWorkSourceReviewControl(control, review) && spent.calls === 1
  && spent.unknownCostCalls === 0 && spent.costUsd <= plan.maxCostUsd && combinedCalls === 26 && combinedCostUsd <= 3;
 return documentWorkContinuationResultSchema.parse({
  schemaVersion: "document-work-product-continuation.v2", synthetic: true, scope: "one_previously_unexecuted_control",
  sourceRunId: plan.sourceRunId, sourceReceiptSha256: plan.sourceReceiptSha256, sourceEvaluationPassed: false, caseId: plan.caseId,
  passed, combinedAcceptancePassed: passed, combinedCalls, combinedCostUsd, priorCalls: plan.priorCalls, priorCostUsd: plan.priorCostUsd,
  spent, gatewayRequests: partition.requests, review, failure,
 } satisfies DocumentWorkContinuationResult);
}

export const documentWorkContinuationFamily: EvaluationFamily = {
 id: "document_work_product_continuation",
 prepare(value) {
  const snapshot = documentWorkContinuationSnapshotSchema.parse(value);
  const policies = {preliminary_understanding: taskPolicy(snapshot.policy)};
  return {
   family: "document_work_product_continuation",
   routes: evaluationPolicyRoutes(snapshot.policy),
   contentHashes: documentWorkContinuationContentHashes(snapshot),
   audience: documentWorkContinuationAudience(snapshot),
   policies,
   run: (gateway) => runDocumentWorkContinuation(snapshot, gateway, policies),
  };
 },
};

// ---------------------------------------------------------------------------------------------
// run-advisor-response-live: the production advisor response contract on each route, in the prior
// structured shape (diagnostic) and the current prompted shape (the gate), never falling back.
// ---------------------------------------------------------------------------------------------

export async function runAdvisorResponseLive(snapshot: AdvisorResponseLiveSnapshot, governed: ModelGateway,
 policies: Partial<Record<TaskKind, TaskPolicy>>): Promise<AdvisorResponseLiveResult> {
 const scope = createEvaluationBudgetScope(governed, policies);
 const partition = scope.partition("advisor", advisorResponseLiveBudget);
 const input = [{type: "text" as const, text: snapshot.input}];
 const results: AdvisorResponseLiveResult["results"] = [];
 for (const {provider, shape} of advisorResponseLiveSequence) {
  const start = partition.gateway.spent().calls;
  try {
   const generated = await partition.gateway.complete({...advisorResponseContract, input, allowFallback: false,
    outputMode: shape === "prior_structured" ? "structured" : "prompted_json",
    maxOutputTokens: shape === "prior_structured" ? 2000 : advisorResponseContract.maxOutputTokens,
    model: snapshot.routes[provider]});
   const parsed = advisorResponseContract.schema.safeParse(generated.output);
   results.push({provider, shape, passed: parsed.success, failure: parsed.success ? null : "response_contract_failed", start, end: partition.gateway.spent().calls});
  } catch (error) {
   scope.throwIfHalted();
   const code = error && typeof error === "object" && "code" in error ? String(error.code) : "provider_failed";
   results.push({provider, shape, passed: false, failure: code, start, end: partition.gateway.spent().calls});
  }
 }
 const spent = partition.gateway.spent();
 const current = results.filter((result) => result.shape === "current_prompted");
 const passed = current.length === 2 && current.every((result) => result.passed) && spent.calls <= advisorResponseLiveBudget.maxCalls
  && spent.budgetExposureUsd <= advisorResponseLiveBudget.maxCostUsd;
 return advisorResponseLiveResultSchema.parse({
  schemaVersion: "advisor-response-live.v2", synthetic: true, promotion: false, scope: "actual_advisor_response_contract_not_full_application",
  passed, budget: {maxCostUsd: advisorResponseLiveBudget.maxCostUsd, maxCalls: advisorResponseLiveBudget.maxCalls}, spent, results, gatewayRequests: partition.requests,
 } satisfies AdvisorResponseLiveResult);
}

export const advisorResponseLiveFamily: EvaluationFamily = {
 id: "advisor_response_live",
 prepare(value) {
  const snapshot = advisorResponseLiveSnapshotSchema.parse(value);
  const policies = {agent_operation_brief: taskPolicy(snapshot.policy)};
  return {
   family: "advisor_response_live",
   routes: distinctEvaluationRoutes([snapshot.routes.anthropic, snapshot.routes.openai]),
   contentHashes: advisorResponseLiveContentHashes(snapshot),
   audience: advisorResponseLiveAudience(snapshot),
   policies,
   run: (gateway) => runAdvisorResponseLive(snapshot, gateway, policies),
  };
 },
};

// ---------------------------------------------------------------------------------------------
// run-executive-synthesis-live: the author writes the brief in each locale and a reviewer on the
// other provider audits it, with at most one revision, as the engine's claims stage does.
// ---------------------------------------------------------------------------------------------

/** One locale as the loop records it; the published schema reads the brief and the audits as JSON. */
type SynthesisResult = Omit<ExecutiveSynthesisLiveResult["results"][number], "pendingJudgmentIds" | "brief" | "semanticAudit" | "reviewHistory">
 & {brief: CaseBrief | null; semanticAudit?: unknown; reviewHistory?: unknown};

export async function runExecutiveSynthesisLive(snapshot: ExecutiveSynthesisLiveSnapshot, governed: ModelGateway,
 policies: Partial<Record<TaskKind, TaskPolicy>>): Promise<ExecutiveSynthesisLiveResult> {
 const scope = createEvaluationBudgetScope(governed, policies);
 const partition = scope.partition("synthesis", executiveSynthesisLiveBudget);
 const archetypeId = archetypeIdSchema.parse(snapshot.case.archetypeId);
 // Zod keeps absent optional keys absent, which is exactly the shape the reconciler reads.
 const candidates = snapshot.case.candidates as unknown as FactCandidate[];
 const documents = snapshot.case.documents as ClassifiedDocument[];
 const results: SynthesisResult[] = [];
 for (const locale of ["pt", "en"] as const) {
  const start = partition.gateway.spent().calls, startCostUsd = partition.gateway.spent().costUsd;
  let brief: CaseBrief | null = null;
  try {
   const reconciliation = reconcileCase({archetypeId, candidates, documents, referenceDate: snapshot.case.referenceDate, locale});
   const generated = await partition.gateway.complete({task: "case_brief", system: BRIEF_SYSTEM, input: [{type: "text", text: buildBriefInput({archetypeId, ...reconciliation, locale})}],
    schema: briefAuthoringSchema(reconciliation), schemaName: "case_brief"});
   brief = compileAuthoredBrief(generated.output);
   let authorProvider = generated.provider;
   // The same bounded review path as the engine; the fresh review has no repair catalog.
   const outcome = await reviewBriefWithOneRevision({brief, evidence: reconciliation, verify: async (candidate, allowRevision) => {
    const revisionSchema = allowRevision ? briefReviewWithRevisionSchema(candidate, reconciliation) : null;
    const originalInput = JSON.parse(buildSemanticAuditInput({brief: candidate, ...reconciliation})) as Record<string, unknown>;
    const reviewed = await partition.gateway.complete({task: "audit_evidence",
     system: SEMANTIC_AUDIT_SYSTEM + (allowRevision ? "\n\n" + executiveSynthesisRevisionInstructions : ""),
     input: [{type: "text", text: JSON.stringify({...originalInput, ...(allowRevision ? {revisionEvidence: [...buildBriefEvidenceCatalog(reconciliation).values()]} : {})})}],
     schema: revisionSchema ?? boundSemanticAuditSchema(candidate), schemaName: allowRevision ? "semantic_claim_audit_revision_v2" : "semantic_claim_audit_v2",
     allowFallback: false,
     model: authorProvider === "openai" ? snapshot.reviewers.anthropic : snapshot.reviewers.openai,
    });
    const revisions = revisionSchema?.parse(reviewed.output).revisions ?? [];
    if (revisions.length) authorProvider = reviewed.provider;
    return {audit: expandBoundSemanticAudit(candidate, reviewed.output), revisions};
   }});
   brief = outcome.proposedBrief;
   const bound = resolveExecutiveSummaryClaims(brief);
   const summarySupports = new Set(bound?.flatMap((claim) => claim.supportIds) ?? []);
   const covered = Boolean(bound?.length) && bound!.every((claim) => claim.material) && ["company.legal_name", "transaction.requested_amount"].every((id) => summarySupports.has(id));
   // Match the engine's claims-stage ceiling, including provider retries and fallback.
   const spent = partition.gateway.spent();
   const caseBudgetPassed = spent.calls - start <= 3 && spent.costUsd - startCostUsd <= 2.25;
   results.push({locale, passed: Boolean(outcome.brief) && covered && caseBudgetPassed, brief,
    failure: !outcome.brief ? outcome.blockedBy[0] ?? "brief_review_failed" : !covered ? "summary_coverage_failed" : !caseBudgetPassed ? "claims_budget_exceeded" : null,
    summaryClaimIds: bound?.map((claim) => claim.id) ?? [], start, end: spent.calls,
    numericIssues: outcome.numericAudit.findings.map((finding) => finding.reason),
    semanticIssues: outcome.semanticAudit?.findings.map((finding) => finding.reason) ?? [],
    ...(outcome.semanticAudit ? {semanticAudit: outcome.semanticAudit} : {}), reviewHistory: outcome.attempts});
  } catch {
   scope.throwIfHalted();
   results.push({locale, passed: false, brief, failure: "provider_or_contract_failed", summaryClaimIds: [], start, end: partition.gateway.spent().calls, numericIssues: [], semanticIssues: []});
  }
 }
 const spent = partition.gateway.spent();
 const passed = results.length === 2 && results.every((result) => result.passed) && spent.unknownCostCalls === 0
  && spent.costUsd <= executiveSynthesisLiveBudget.maxCostUsd && spent.calls <= executiveSynthesisLiveBudget.maxCalls;
 return executiveSynthesisLiveResultSchema.parse({
  schemaVersion: "executive-synthesis-live.v3", synthetic: true, promotion: false, humanApprovalProvided: false,
  scope: "author_and_independent_reviewer_contract_not_application_e2e", fixtureFingerprint: snapshot.fixtureFingerprint,
  budget: {maxCostUsd: executiveSynthesisLiveBudget.maxCostUsd, maxCalls: executiveSynthesisLiveBudget.maxCalls}, spent, passed,
  results: results.map((result) => ({...result, pendingJudgmentIds: result.brief?.sections.flatMap((section) => section.claims
   .filter((claim) => claim.material && claim.kind === "judgment").map((claim) => claim.id)) ?? []})),
  gatewayRequests: partition.requests,
 });
}

export const executiveSynthesisLiveFamily: EvaluationFamily = {
 id: "executive_synthesis_live",
 prepare(value) {
  const snapshot = executiveSynthesisLiveSnapshotSchema.parse(value);
  // The case must be one the playbook knows: an unknown archetype or document kind is refused before anything is sent.
  archetypeIdSchema.parse(snapshot.case.archetypeId);
  for (const document of snapshot.case.documents) documentKindSchema.parse(document.kind);
  const policies = {case_brief: taskPolicy(snapshot.policies.case_brief), audit_evidence: taskPolicy(snapshot.policies.audit_evidence)};
  return {
   family: "executive_synthesis_live",
   routes: executiveSynthesisLiveRoutes(snapshot),
   contentHashes: executiveSynthesisLiveContentHashes(snapshot),
   audience: executiveSynthesisLiveAudience(snapshot),
   policies,
   run: (gateway) => runExecutiveSynthesisLive(snapshot, gateway, policies),
  };
 },
};

/** Registered under each script's file name, the scriptId its contract's audience carries. */
export const documentWorkEvaluationFamilies: Readonly<Record<string, EvaluationFamily>> = Object.freeze({
 "run-document-work-product-live": documentWorkProductLiveFamily,
 "continue-document-work-product-live": documentWorkContinuationFamily,
 "run-advisor-response-live": advisorResponseLiveFamily,
 "run-executive-synthesis-live": executiveSynthesisLiveFamily,
});
