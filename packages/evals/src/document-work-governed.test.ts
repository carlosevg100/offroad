import {describe, expect, it} from "vitest";
import {
 advisorResponseLiveAudience,
 advisorResponseLiveContentHashes,
 distinctEvaluationRoutes,
 documentWorkContinuationAudience,
 documentWorkContinuationContentHashes,
 documentWorkProductLiveAudience,
 documentWorkProductLiveContentHashes,
 evaluationPolicyRoutes,
 executionCanonicalText,
 executiveSynthesisLiveAudience,
 executiveSynthesisLiveContentHashes,
 executiveSynthesisLiveRoutes,
 type DocumentWorkContinuationPlan,
} from "@offroad/agent-contracts";
import {corporateGrowthScenario, generateCase} from "@offroad/case-factory";
import {fingerprintJson} from "@offroad/case-understanding";
import {createModelGateway, defaultTaskPolicies, type AdapterRequest, type ModelGateway, type Provider, type ProviderAdapter, type TaskKind, type TaskPolicy} from "@offroad/model-gateway";
import {documentWorkProductLiveCases} from "@offroad/testing-fixtures/document-work-product-live";
import {documentWorkSourceReviewCases} from "@offroad/testing-fixtures/document-work-source-review";

import {
 advisorResponseLiveEvidence,
 advisorResponseLiveSummary,
 buildAdvisorResponseLiveSnapshot,
 buildDocumentWorkContinuationSnapshot,
 buildDocumentWorkProductLiveSnapshot,
 buildExecutiveSynthesisLiveSnapshot,
 documentWorkContinuationEvidence,
 documentWorkContinuationSummary,
 documentWorkGovernedBudget,
 documentWorkLiveCeilings,
 documentWorkLiveOptions,
 documentWorkProductLiveEvidence,
 documentWorkProductLiveSummary,
 executiveSynthesisLiveEvidence,
 executiveSynthesisLiveSummary,
 readAdvisorResponseLiveResult,
 readDocumentWorkContinuationResult,
 readDocumentWorkProductLiveResult,
 readExecutiveSynthesisLiveResult,
 requesterProvenance,
} from "./document-work-governed";
import {composeGovernedEvaluation} from "./governed-transport";

/** The worker's own families and the synthetic answers its tests use; nothing here reaches a provider. */
type Family = {prepare(snapshot: unknown): {routes: unknown[]; contentHashes: string[]; audience: {caseId: string; caseVersion: string}; policies: Partial<Record<TaskKind, TaskPolicy>>; run(gateway: ModelGateway, clock: () => Date): Promise<unknown>}};
const worker = async () => {
 const families = await import(new URL("../../../apps/document-worker/src/evaluation-family-document-work.ts", import.meta.url).href) as {documentWorkEvaluationFamilies: Record<string, Family>};
 const answers = await import(new URL("../../../apps/document-worker/src/evaluation-family-document-work.test-support.ts", import.meta.url).href) as {
  documentWorkSyntheticAnswer: (request: AdapterRequest, controls?: readonly unknown[]) => ReturnType<ProviderAdapter["complete"]> extends Promise<infer T> ? T : never;
 };
 return {families: families.documentWorkEvaluationFamilies, answer: answers.documentWorkSyntheticAnswer};
};

/** Runs a family in this process through a plain gateway with synthetic adapters, and returns its committed bytes. */
async function committed(scriptId: string, snapshot: unknown, controls: readonly unknown[] = []): Promise<{text: string; requests: number}> {
 const {families, answer} = await worker();
 const prepared = families[scriptId]!.prepare(snapshot);
 let requests = 0;
 const adapter = (provider: Provider): ProviderAdapter => ({provider, complete: async (request) => { requests++; return answer(request, controls as never); }});
 const gateway = createModelGateway({adapters: {anthropic: adapter("anthropic"), openai: adapter("openai")}, policies: {...defaultTaskPolicies, ...prepared.policies},
  budgetReservation: "conservative_text_v1"});
 return {text: executionCanonicalText(await prepared.run(gateway, () => new Date())), requests};
}

const plan: DocumentWorkContinuationPlan = {sourceRunId: "34467680287", sourceReceiptSha256: "01c86a6de3c52f704a9ecf1917d03163d29d2a84d9b51c542e8b3ac0a480ed47",
 caseId: "source-review-diligence-request-versus-commitment", remainingCalls: 1, maxCostUsd: 0.42, priorCalls: 25, priorCostUsd: 0.25};
const environment = {GITHUB_SHA: "a".repeat(40), GITHUB_RUN_ID: "1234", GITHUB_RUN_ATTEMPT: "1", GITHUB_WORKFLOW_REF: "carlosevg100/offroad/.github/workflows/document-work-product-live.yml@refs/heads/main"};
const identity = {organizationId: "40000000-0000-4000-9000-0000000000e1", executionId: "40000000-0000-4000-8000-0000000000e1",
 requestId: "40000000-0000-4000-8000-0000000000e2", processingRunId: "40000000-0000-4000-8000-0000000000e3"};

describe("document work snapshots, built offline", () => {
 it("carry the authored fixtures byte for byte and survive the canonical text", () => {
  const documentary = buildDocumentWorkProductLiveSnapshot();
  expect([fingerprintJson(documentary.goldCases), fingerprintJson(documentary.sourceReviewControls)])
   .toEqual([fingerprintJson(documentWorkProductLiveCases), fingerprintJson(documentWorkSourceReviewCases)]);
  expect(documentary.policy).toEqual({...defaultTaskPolicies.preliminary_understanding});
  const synthesis = buildExecutiveSynthesisLiveSnapshot();
  const sample = generateCase(corporateGrowthScenario);
  expect(fingerprintJson(synthesis.case)).toBe(fingerprintJson({archetypeId: sample.scenario.archetypeId, referenceDate: sample.scenario.referenceDate,
   candidates: sample.candidates, documents: sample.classifiedDocuments}));
  expect(synthesis.fixtureFingerprint).toBe(fingerprintJson(corporateGrowthScenario));
  for (const snapshot of [documentary, buildDocumentWorkContinuationSnapshot(plan), buildAdvisorResponseLiveSnapshot(), synthesis]) {
   expect(JSON.parse(executionCanonicalText(snapshot))).toEqual(snapshot);
  }
  // The same bytes on every run: a request lost in transport or resumed later is the same evaluation.
  expect(executionCanonicalText(buildDocumentWorkProductLiveSnapshot())).toBe(executionCanonicalText(documentary));
  expect(executionCanonicalText(buildExecutiveSynthesisLiveSnapshot())).toBe(executionCanonicalText(synthesis));
 });

 it("keep the continuation to the one route and the one control of its plan", () => {
  const snapshot = buildDocumentWorkContinuationSnapshot(plan);
  expect([snapshot.control.id, snapshot.policy.fallback, evaluationPolicyRoutes(snapshot.policy)]).toEqual([plan.caseId, null, [defaultTaskPolicies.preliminary_understanding.primary]]);
  expect(() => buildDocumentWorkContinuationSnapshot({...plan, caseId: "unknown-control"})).toThrow("continuation_source_unavailable");
 });

 it("compose contracts the database accepts, under the ceilings each script always kept", () => {
  const documentary = buildDocumentWorkProductLiveSnapshot(), continuation = buildDocumentWorkContinuationSnapshot(plan);
  const advisor = buildAdvisorResponseLiveSnapshot(), synthesis = buildExecutiveSynthesisLiveSnapshot();
  const specs = [
   {audience: {...documentWorkProductLiveAudience(documentary), scriptId: "run-document-work-product-live"}, routes: evaluationPolicyRoutes(documentary.policy),
    budget: documentWorkGovernedBudget(documentWorkLiveCeilings.documentary, documentary.policy.timeoutMs), snapshot: documentary, sourceContentHashes: documentWorkProductLiveContentHashes(documentary)},
   {audience: {...documentWorkContinuationAudience(continuation), scriptId: "continue-document-work-product-live"}, routes: evaluationPolicyRoutes(continuation.policy),
    budget: documentWorkGovernedBudget({maxCostUsd: plan.maxCostUsd, maxCalls: 1}, continuation.policy.timeoutMs), snapshot: continuation, sourceContentHashes: documentWorkContinuationContentHashes(continuation)},
   {audience: {...advisorResponseLiveAudience(advisor), scriptId: "run-advisor-response-live"}, routes: distinctEvaluationRoutes([advisor.routes.anthropic, advisor.routes.openai]),
    budget: documentWorkGovernedBudget(documentWorkLiveCeilings.advisor, advisor.policy.timeoutMs), snapshot: advisor, sourceContentHashes: advisorResponseLiveContentHashes(advisor)},
   {audience: {...executiveSynthesisLiveAudience(synthesis), scriptId: "run-executive-synthesis-live"}, routes: executiveSynthesisLiveRoutes(synthesis),
    budget: documentWorkGovernedBudget(documentWorkLiveCeilings.synthesis, 600_000), snapshot: synthesis, sourceContentHashes: executiveSynthesisLiveContentHashes(synthesis)},
  ];
  const composed = specs.map((spec) => composeGovernedEvaluation(spec, identity, Date.now()).contract);
  expect(composed.map((contract) => [contract.audience.scriptId, contract.tools.map((tool) => tool.id), contract.budget.maxCostMicrousd, contract.budget.maxModelCalls,
   contract.budget.maxDurationMs])).toEqual([
   ["run-document-work-product-live", ["provider:anthropic:claude-sonnet-5", "provider:openai:gpt-5.6-terra"], 3_000_000, 26, 26 * 180_000],
   ["continue-document-work-product-live", ["provider:anthropic:claude-sonnet-5"], 420_000, 1, 180_000],
   ["run-advisor-response-live", ["provider:anthropic:claude-sonnet-5", "provider:openai:gpt-5.6-sol"], 1_000_000, 8, 8 * 180_000],
   ["run-executive-synthesis-live", ["provider:anthropic:claude-opus-5", "provider:openai:gpt-5.6-sol"], 3_000_000, 8, 8 * 600_000],
  ]);
  // Each worker family reads the same snapshot into the same audience, routes and sources the contract declares.
  return worker().then(({families}) => {
   for (const [index, spec] of specs.entries()) {
    const prepared = families[spec.audience.scriptId]!.prepare(spec.snapshot);
    expect(prepared.audience).toEqual({caseId: composed[index]!.audience.caseId, caseVersion: composed[index]!.audience.caseVersion});
    expect(prepared.contentHashes).toEqual(composed[index]!.inputs.sources.map((source) => source.contentHash));
    expect(prepared.routes).toEqual(spec.routes);
   }
  });
 });

 it("read the poll pace and a resumed request, refusing a pace under one second", () => {
  expect(documentWorkLiveOptions([])).toEqual({pollIntervalMs: 5000, requestId: null});
  expect(documentWorkLiveOptions(["--poll-seconds", "1", "--request-id", identity.requestId])).toEqual({pollIntervalMs: 1000, requestId: identity.requestId});
  expect(() => documentWorkLiveOptions(["--poll-seconds", "0.5"])).toThrow("document_work_poll_seconds_invalid");
 });
});

describe("document work records, committed by the worker and read back by the script", () => {
 it("reads the documentary record bound to its snapshot and writes the evidence and summary the script always wrote", async () => {
  const snapshot = buildDocumentWorkProductLiveSnapshot();
  const {text, requests} = await committed("run-document-work-product-live", snapshot, snapshot.sourceReviewControls);
  expect(requests).toBe(20);
  const record = readDocumentWorkProductLiveResult(JSON.parse(text), snapshot);
  expect([record.passed, record.runs.length, record.sourceReviewControls.length, record.spent.calls, record.sourceReviewControlSpend.calls]).toEqual([true, 6, 8, 12, 8]);
  const evidence = documentWorkProductLiveEvidence(record, requesterProvenance(environment));
  expect(evidence).toMatchObject({gitSha: environment.GITHUB_SHA, runId: "1234", runAttempt: "1", workflowRef: environment.GITHUB_WORKFLOW_REF, schemaVersion: "document-work-product-executor-eval.v7"});
  const summary = documentWorkProductLiveSummary(record);
  expect(summary.startsWith("# Document work product evaluation\n\nPASS · 6/6 independent requests recorded.")).toBe(true);
  expect(summary).toContain("Source-review controls: 8/8; eight required");
  expect(summary).toContain("Fixed ceilings: gold18/USD2.50, controls14/USD0.50, aggregate26/USD3.00");
  // A record of other inputs is not this run's: nothing of it is written.
  for (const change of [
   (value: Record<string, unknown>) => { value.fixtureFingerprint = "0".repeat(64); },
   (value: Record<string, unknown>) => { (value.runs as unknown[]).reverse(); },
   (value: Record<string, unknown>) => { ((value.runs as Array<{product: {inputFingerprint: string}}>)[0]!.product.inputFingerprint) = "0".repeat(64); },
   (value: Record<string, unknown>) => { value.passed = !(value.passed as boolean); },
   (value: Record<string, unknown>) => { value.gitSha = "a".repeat(40); },
   (value: Record<string, unknown>) => { ((value.sourceReviewControls as Array<{expectedIssueFieldIds: string[]}>)[0]!.expectedIssueFieldIds) = []; },
  ]) {
   const altered = JSON.parse(text) as Record<string, unknown>;
   change(altered);
   expect(() => readDocumentWorkProductLiveResult(altered, snapshot)).toThrow();
  }
 });

 it("reads the continuation, the advisor probe and the executive synthesis bound to their snapshots", async () => {
  const continuation = buildDocumentWorkContinuationSnapshot(plan);
  const one = readDocumentWorkContinuationResult(JSON.parse((await committed("continue-document-work-product-live", continuation, [continuation.control])).text), continuation);
  expect([one.passed, one.combinedCalls, one.spent.calls]).toEqual([true, 26, 1]);
  expect(documentWorkContinuationEvidence(one, requesterProvenance(environment))).toMatchObject({runId: "1234", gitSha: environment.GITHUB_SHA, runAttempt: "1"});
  expect(documentWorkContinuationSummary(one)).toBe(`# Documentary evaluation continuation\n\nPASS: one previously unexecuted control.\n\nSource run 34467680287 remains immutable and failed for incomplete coverage. This linked receipt completes that coverage only if passed.\n\nCombined attempts: 26/26. Combined measured USD: ${one.combinedCostUsd}/3. No gold request or prior control repeated. This is not application E2E or automatic promotion.\n`);
  expect(() => readDocumentWorkContinuationResult({...one, sourceRunId: "1"}, continuation)).toThrow();

  const advisor = buildAdvisorResponseLiveSnapshot();
  const probe = readAdvisorResponseLiveResult(JSON.parse((await committed("run-advisor-response-live", advisor)).text), advisor);
  expect([probe.passed, probe.results.map((result) => result.passed)]).toEqual([true, [true, true, true, true]]);
  expect(advisorResponseLiveEvidence(probe, requesterProvenance(environment))).toMatchObject({gitSha: environment.GITHUB_SHA, runId: "1234"});
  expect(advisorResponseLiveSummary(probe)).toContain("- anthropic / current_prompted: PASS\n- openai / prior_structured: PASS");
  expect(() => readAdvisorResponseLiveResult({...probe, results: [...probe.results].reverse()}, advisor)).toThrow();

  const synthesis = buildExecutiveSynthesisLiveSnapshot();
  const brief = readExecutiveSynthesisLiveResult(JSON.parse((await committed("run-executive-synthesis-live", synthesis)).text), synthesis);
  expect([brief.passed, brief.results.map((result) => [result.locale, result.passed, result.end - result.start])]).toEqual([true, [["pt", true, 3], ["en", true, 3]]]);
  expect(executiveSynthesisLiveEvidence(brief, requesterProvenance(environment))).toMatchObject({gitSha: environment.GITHUB_SHA, runId: "1234"});
  expect(executiveSynthesisLiveSummary(brief)).toContain("- pt: PASS; 2 bound summary claims; completed");
  expect(() => readExecutiveSynthesisLiveResult({...brief, fixtureFingerprint: "0".repeat(64)}, synthesis)).toThrow();
 });
});
