import {
 advisorResponseLiveBudget,
 advisorResponseLiveResultSchema,
 advisorResponseLiveSequence,
 advisorResponseLiveSnapshotSchema,
 documentWorkContinuationResultSchema,
 documentWorkContinuationSnapshotSchema,
 documentWorkControlCallBudget,
 documentWorkProductGoldInput,
 documentWorkProductLiveBudget,
 documentWorkProductLiveResultSchema,
 documentWorkProductLiveSnapshotSchema,
 evaluationTaskPolicy,
 executionCanonicalText,
 executiveSynthesisLiveBudget,
 executiveSynthesisLiveResultSchema,
 executiveSynthesisLiveSnapshotSchema,
 type AdvisorResponseLiveResult,
 type AdvisorResponseLiveSnapshot,
 type DocumentWorkContinuationPlan,
 type DocumentWorkContinuationResult,
 type DocumentWorkContinuationSnapshot,
 type DocumentWorkProductLiveResult,
 type DocumentWorkProductLiveSnapshot,
 type ExecutiveSynthesisLiveResult,
 type ExecutiveSynthesisLiveSnapshot,
} from "@offroad/agent-contracts";
import {corporateGrowthScenario, generateCase} from "@offroad/case-factory";
import {fingerprintJson} from "@offroad/case-understanding";
import {defaultTaskPolicies} from "@offroad/model-gateway";
import {documentWorkProductLiveCases} from "@offroad/testing-fixtures/document-work-product-live";
import {documentWorkSourceReviewCases} from "@offroad/testing-fixtures/document-work-source-review";

import type {GovernedEvaluationSpec, GovernedTransportProgress} from "./governed-transport";

/**
 * The script side of the document work product family: each script assembles its snapshot here
 * offline, as it always assembled its inputs, requests the evaluation through the governed
 * transport, and reads the committed record back with a reader bound to the snapshot it sent. The
 * record it writes is the committed one plus the provenance of the requesting run, which the
 * worker never sees. The summaries are the texts the scripts always wrote, now rendered from the
 * committed record.
 */

// ---------------------------------------------------------------------------------------------
// Snapshots, built offline from the same fixtures and defaults the scripts always read.
// ---------------------------------------------------------------------------------------------

export function buildDocumentWorkProductLiveSnapshot(): DocumentWorkProductLiveSnapshot {
 return documentWorkProductLiveSnapshotSchema.parse({
  schemaVersion: "document-work-product-live-snapshot.v1",
  policy: evaluationTaskPolicy(defaultTaskPolicies.preliminary_understanding),
  goldCases: documentWorkProductLiveCases,
  sourceReviewControls: documentWorkSourceReviewCases,
 });
}

/** The continuation runs its one control on the route the source run used for it, and nothing else. */
export function buildDocumentWorkContinuationSnapshot(plan: DocumentWorkContinuationPlan): DocumentWorkContinuationSnapshot {
 const policy = defaultTaskPolicies.preliminary_understanding;
 const control = documentWorkSourceReviewCases.find((sample) => sample.id === plan.caseId);
 if (!control) throw new Error("continuation_source_unavailable");
 return documentWorkContinuationSnapshotSchema.parse({
  schemaVersion: "document-work-product-continuation-snapshot.v1",
  policy: {primary: policy.primary, shadow: null, fallback: null, maxOutputTokens: policy.maxOutputTokens, timeoutMs: policy.timeoutMs},
  plan,
  control,
 });
}

/** The synthetic conversation the advisor probe always sent, byte for byte. */
export const advisorResponseLiveInput = JSON.stringify({locale:"pt-BR",currentBrief:{},project:{name:"Synthetic company meeting",entryJob:"origination_thesis",accessBasis:"public_information"},companyProfile:{companyName:"Synthetic Company"},documentInventory:[],workPlan:[],artifacts:[],recentConversation:[],latestUserMessage:"Quero preparar uma reunião com a Synthetic Company. Quais informações sobre o objetivo da reunião você precisa?",executionRoute:{action:"clarify",reasonCode:"missing_mission_context",analysisScope:null}});

export function buildAdvisorResponseLiveSnapshot(): AdvisorResponseLiveSnapshot {
 return advisorResponseLiveSnapshotSchema.parse({
  schemaVersion: "advisor-response-live-snapshot.v1",
  policy: evaluationTaskPolicy(defaultTaskPolicies.agent_operation_brief),
  routes: {anthropic: {provider: "anthropic", model: "claude-sonnet-5", effort: "medium"}, openai: {provider: "openai", model: "gpt-5.6-sol", effort: "high"}},
  input: advisorResponseLiveInput,
 });
}

/** The case generated offline from the authored scenario, and the reviewer opposite each author provider. */
export function buildExecutiveSynthesisLiveSnapshot(): ExecutiveSynthesisLiveSnapshot {
 const sample = generateCase(corporateGrowthScenario);
 return executiveSynthesisLiveSnapshotSchema.parse({
  schemaVersion: "executive-synthesis-live-snapshot.v1",
  fixtureFingerprint: fingerprintJson(corporateGrowthScenario),
  policies: {case_brief: evaluationTaskPolicy(defaultTaskPolicies.case_brief), audit_evidence: evaluationTaskPolicy(defaultTaskPolicies.audit_evidence)},
  reviewers: {anthropic: {provider: "anthropic", model: "claude-opus-5", effort: "high"}, openai: {provider: "openai", model: "gpt-5.6-sol", effort: "high"}},
  case: {archetypeId: sample.scenario.archetypeId, referenceDate: sample.scenario.referenceDate, candidates: sample.candidates, documents: sample.classifiedDocuments},
 });
}

// ---------------------------------------------------------------------------------------------
// The contract budget of one live run: the script's own ceiling, every call it may make, each
// call's whole timeout, and the time the worker may take to claim it.
// ---------------------------------------------------------------------------------------------

/** `--request-id <uuid>` resumes an earlier request; `--poll-seconds <n>` paces the read, at least one second. */
export function documentWorkLiveOptions(argv: readonly string[]): {pollIntervalMs: number; requestId: string | null} {
 const option = (name: string): string | null => {
  const index = argv.indexOf(`--${name}`);
  return index >= 0 && typeof argv[index + 1] === "string" ? argv[index + 1]! : null;
 };
 const pollSeconds = Number(option("poll-seconds") ?? "5");
 if (!Number.isFinite(pollSeconds) || pollSeconds < 1) throw new Error("document_work_poll_seconds_invalid");
 return {pollIntervalMs: Math.round(pollSeconds * 1000), requestId: option("request-id")};
}

/** The lines the workflow copies to its summary: identities and states only, never content. */
export function logGovernedProgress(progress: GovernedTransportProgress): void {
 if (progress.phase === "requested") console.log(`evaluation requested: ${progress.executionId} (${progress.request}), request ${progress.requestId}`);
 if (progress.phase === "waiting") console.log(`evaluation waiting: job ${progress.job ?? "unknown"}, run ${progress.run ?? "unknown"}, attempts ${progress.attempts ?? 0}`);
}

/** How long a request may wait for the worker to claim it, beyond the work the budget allows. */
export const documentWorkQueueAllowanceMs = 30 * 60_000;

export function documentWorkGovernedBudget(ceiling: {maxCostUsd: number; maxCalls: number}, timeoutMs: number): GovernedEvaluationSpec["budget"] {
 const maxDurationMs = ceiling.maxCalls * timeoutMs;
 return {maxCostMicrousd: Math.round(ceiling.maxCostUsd * 1_000_000), maxModelCalls: ceiling.maxCalls, maxDurationMs, expiresInMs: maxDurationMs + documentWorkQueueAllowanceMs};
}

// ---------------------------------------------------------------------------------------------
// Readers: the committed record, read strictly and bound to the snapshot this process sent.
// ---------------------------------------------------------------------------------------------

const mismatch = (family: string, what: string) => new Error(`${family}_result_mismatch: ${what}`);
const same = (left: unknown, right: unknown) => executionCanonicalText(left) === executionCanonicalText(right);

export function readDocumentWorkProductLiveResult(value: unknown, snapshot: DocumentWorkProductLiveSnapshot): DocumentWorkProductLiveResult {
 const record = documentWorkProductLiveResultSchema.parse(value);
 const fail = (what: string) => mismatch("document_work_product_live", what);
 if (record.fixtureFingerprint !== fingerprintJson(snapshot.goldCases) || record.sourceReviewFixtureFingerprint !== fingerprintJson(snapshot.sourceReviewControls)) throw fail("fixtures");
 if (!same(record.policy, snapshot.policy)) throw fail("policy");
 if (!same(record.runs.map((run) => [run.caseId, run.repeat]), snapshot.goldCases.flatMap((sample) => [[sample.id, 1], [sample.id, 2]]))) throw fail("runs");
 if (!same(record.repeats.map((repeat) => repeat.caseId), snapshot.goldCases.map((sample) => sample.id))) throw fail("repeats");
 // Every product answers the input this process built for its case.
 for (const run of record.runs) {
  const sample = snapshot.goldCases.find((item) => item.id === run.caseId)!;
  const product = run.product as {inputFingerprint?: unknown} | null;
  if (product !== null && product.inputFingerprint !== fingerprintJson(documentWorkProductGoldInput(sample))) throw fail(`product ${run.caseId} ${run.repeat}`);
 }
 if (!same(record.sourceReviewControls.map((control) => [control.caseId, control.expectedIssueFieldId, control.expectedIssueFieldIds, control.expectedCleanFieldIds]),
  snapshot.sourceReviewControls.map((sample) => [sample.id, sample.expectedIssueFieldId, sample.expectedIssueFieldIds, sample.expectedCleanFieldIds]))) throw fail("controls");
 if (record.budget.sourceReviewControls.maxCalls !== documentWorkControlCallBudget(record.spent.calls)) throw fail("control allocation");
 if (record.passed !== (record.accounting.passed && record.controlAccounting.passed)) throw fail("verdict");
 return record;
}

export function readDocumentWorkContinuationResult(value: unknown, snapshot: DocumentWorkContinuationSnapshot): DocumentWorkContinuationResult {
 const record = documentWorkContinuationResultSchema.parse(value);
 const fail = (what: string) => mismatch("document_work_continuation", what);
 const {plan} = snapshot;
 if (record.sourceRunId !== plan.sourceRunId || record.sourceReceiptSha256 !== plan.sourceReceiptSha256 || record.caseId !== plan.caseId
  || record.priorCalls !== plan.priorCalls || record.priorCostUsd !== plan.priorCostUsd) throw fail("plan");
 if (record.combinedCalls !== plan.priorCalls + record.spent.calls || record.combinedCostUsd !== plan.priorCostUsd + record.spent.costUsd) throw fail("combined spend");
 if (record.combinedAcceptancePassed !== record.passed || (record.passed && (record.spent.calls !== 1 || record.spent.costUsd > plan.maxCostUsd))) throw fail("verdict");
 return record;
}

export function readAdvisorResponseLiveResult(value: unknown, snapshot: AdvisorResponseLiveSnapshot): AdvisorResponseLiveResult {
 const record = advisorResponseLiveResultSchema.parse(value);
 const fail = (what: string) => mismatch("advisor_response_live", what);
 if (!same(record.results.map(({provider, shape}) => ({provider, shape})), advisorResponseLiveSequence)) throw fail("sequence");
 const current = record.results.filter((result) => result.shape === "current_prompted");
 if (record.passed !== (current.length === 2 && current.every((result) => result.passed) && record.spent.calls <= advisorResponseLiveBudget.maxCalls
  && record.spent.budgetExposureUsd <= advisorResponseLiveBudget.maxCostUsd)) throw fail("verdict");
 // The snapshot names the routes; each answered request came from one of them.
 const routes = new Set([snapshot.routes.anthropic, snapshot.routes.openai].map((route) => `${route.provider}:${route.model}`));
 for (const request of record.gatewayRequests) for (const attempt of request.attempts) if (!routes.has(`${attempt.provider}:${attempt.model}`)) throw fail("route");
 return record;
}

export function readExecutiveSynthesisLiveResult(value: unknown, snapshot: ExecutiveSynthesisLiveSnapshot): ExecutiveSynthesisLiveResult {
 const record = executiveSynthesisLiveResultSchema.parse(value);
 const fail = (what: string) => mismatch("executive_synthesis_live", what);
 if (record.fixtureFingerprint !== snapshot.fixtureFingerprint) throw fail("fixture");
 if (!same(record.results.map((result) => result.locale), ["pt", "en"])) throw fail("locales");
 if (record.passed !== (record.results.length === 2 && record.results.every((result) => result.passed) && record.spent.unknownCostCalls === 0
  && record.spent.costUsd <= executiveSynthesisLiveBudget.maxCostUsd && record.spent.calls <= executiveSynthesisLiveBudget.maxCalls)) throw fail("verdict");
 return record;
}

// ---------------------------------------------------------------------------------------------
// What each script writes: the committed record with the requesting run's provenance, and the
// summary it always wrote.
// ---------------------------------------------------------------------------------------------

/** The provenance the scripts always stamped, read from the requesting run; the worker never sees it. */
export function requesterProvenance(env: Readonly<Record<string, string | undefined>>) {
 return {gitSha: env.GITHUB_SHA, runId: env.GITHUB_RUN_ID, runAttempt: env.GITHUB_RUN_ATTEMPT, workflowRef: env.GITHUB_WORKFLOW_REF};
}
type Provenance = ReturnType<typeof requesterProvenance>;

/** Each script stamps exactly the provenance fields it always stamped; absent values are dropped, as before. */
export function documentWorkProductLiveEvidence(record: DocumentWorkProductLiveResult, provenance: Provenance) {
 return {...record, gitSha: provenance.gitSha, runId: provenance.runId, runAttempt: provenance.runAttempt, workflowRef: provenance.workflowRef};
}
export function documentWorkContinuationEvidence(record: DocumentWorkContinuationResult, provenance: Provenance) {
 return {...record, runId: provenance.runId, gitSha: provenance.gitSha, runAttempt: provenance.runAttempt};
}
export function advisorResponseLiveEvidence(record: AdvisorResponseLiveResult, provenance: Provenance) {
 return {...record, gitSha: provenance.gitSha, runId: provenance.runId};
}
export function executiveSynthesisLiveEvidence(record: ExecutiveSynthesisLiveResult, provenance: Provenance) {
 return {...record, gitSha: provenance.gitSha, runId: provenance.runId};
}

export function documentWorkProductLiveSummary(record: DocumentWorkProductLiveResult): string {
 const {runs, sourceReviewControls: controls, accounting, spent, sourceReviewControlSpend: controlSpend} = record;
 const controlMaxCalls = record.budget.sourceReviewControls.maxCalls;
 return `# Document work product evaluation\n\n${record.passed?"PASS":"FAIL"} · ${runs.length}/6 independent requests recorded.\n\nSynthetic inputs, actual executor and source reviewer. This is not application E2E, human domain certification or release approval.\n\n${runs.map(run=>`- ${run.caseId} repeat ${run.repeat}: ${run.score?.passed?"PASS":"FAIL"}${run.failure?` (${run.failure})`:""}`).join("\n")}\n\nSource-review controls: ${controls.filter(control=>control.passed).length}/${controls.length}; eight required, including both supported and unsupported claims.\n\nRepeat comparisons require identical input and full expected fact coverage; prose identity is reported separately. First-pass narrative success after review: ${accounting.firstPassSuccessCount}/${runs.length}. All rejected attempts remain in evidence.\n\nGold provider attempts: ${spent.calls}; source-review control attempts: ${controlSpend.calls}. Measured total USD: ${spent.costUsd+controlSpend.costUsd}. Fixed ceilings: gold18/USD2.50, controls${controlMaxCalls ?? "not allocated"}/USD0.50, aggregate26/USD3.00; controls receive only attempts left after gold. Retries and fallback consume those same budgets.\n`;
}

export function documentWorkContinuationSummary(record: DocumentWorkContinuationResult): string {
 return `# Documentary evaluation continuation\n\n${record.passed?"PASS":"FAIL"}: one previously unexecuted control.\n\nSource run ${record.sourceRunId} remains immutable and failed for incomplete coverage. This linked receipt completes that coverage only if passed.\n\nCombined attempts: ${record.combinedCalls}/26. Combined measured USD: ${record.combinedCostUsd}/3. No gold request or prior control repeated. This is not application E2E or automatic promotion.\n`;
}

export function advisorResponseLiveSummary(record: AdvisorResponseLiveResult): string {
 const {results, spent} = record;
 return `# Advisor response provider contract\n\n${record.passed?"PASS":"FAIL"}. Synthetic input, production schema and instructions. Prior shape is diagnostic; both current provider routes must pass. This does not prove an entire user journey.\n\n${results.map(result=>`- ${result.provider} / ${result.shape}: ${result.passed?"PASS":result.failure}`).join("\n")}\n\nMeasured USD ${spent.costUsd}; reserved exposure USD ${spent.budgetExposureUsd}; ${spent.calls} attempts; unknown costs ${spent.unknownCostCalls}.\n`;
}

export function executiveSynthesisLiveSummary(record: ExecutiveSynthesisLiveResult): string {
 const {results, spent} = record;
 return `# Executive synthesis contract\n\n${record.passed ? "PASS" : "FAIL"}. Synthetic input, existing author policy and a different reviewer provider. No release promotion.\n\n${results.map(result => `- ${result.locale}: ${result.passed ? "PASS" : "FAIL"}; ${result.summaryClaimIds.length} bound summary claims; ${result.failure ?? "completed"}`).join("\n")}\n\nMeasured USD ${spent.costUsd}; ${spent.calls} attempts including fallback. Fixed cap USD3 / eight attempts.\n`;
}

/** The ceilings each script declares in its contract, as the founder set them. */
export const documentWorkLiveCeilings = {
 documentary: {maxCostUsd: documentWorkProductLiveBudget.maxCostUsd, maxCalls: documentWorkProductLiveBudget.maxCalls},
 advisor: advisorResponseLiveBudget,
 synthesis: executiveSynthesisLiveBudget,
} as const;
