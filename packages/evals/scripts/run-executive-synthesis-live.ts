/** Synthetic author/reviewer contract evaluation, not application E2E or release approval. */
import {mkdirSync, writeFileSync} from "node:fs";
import {resolve} from "node:path";
import {corporateGrowthScenario, generateCase} from "@offroad/case-factory";
import {reconcileCase} from "@offroad/reconciliation";
import {BRIEF_SYSTEM, SEMANTIC_AUDIT_SYSTEM, buildBriefInput, buildSemanticAuditInput, briefAuthoringSchema, briefReviewWithRevisionSchema, buildBriefEvidenceCatalog, reviewBriefWithOneRevision, compileAuthoredBrief, fingerprintJson, resolveExecutiveSummaryClaims, semanticAuditSchema, type CaseBrief, type BriefReviewAttempt, type NormalizedSemanticAudit} from "@offroad/case-understanding";
import {createAnthropicAdapter, createModelGateway, createOpenAIAdapter, type GatewayCallLog} from "@offroad/model-gateway";
import {executiveSynthesisRevisionInstructions} from "@offroad/credit-playbook";
import {assertDocumentWorkLiveEnvironment} from "../src/document-work-product-live";

async function main() {
  assertDocumentWorkLiveEnvironment(process.env);
  if (!process.env.ANTHROPIC_API_KEY || !process.env.OPENAI_API_KEY) throw new Error("protected_provider_credentials_required");
  const directory = resolve(process.env.RUNNER_TEMP ?? ".", "executive-synthesis-live");
  mkdirSync(directory, {recursive: true});
  const calls: GatewayCallLog[] = [];
  const gateway = createModelGateway({adapters: {anthropic: createAnthropicAdapter({apiKey: process.env.ANTHROPIC_API_KEY}), openai: createOpenAIAdapter({apiKey: process.env.OPENAI_API_KEY})}, budget: {maxCostUsd: 3, maxCalls: 8}, onCall: call => calls.push(call)});
  const sample = generateCase(corporateGrowthScenario);
  const results: Array<{locale: string; passed: boolean; brief: CaseBrief | null; failure: string | null; summaryClaimIds: string[]; start: number; end: number; numericIssues: string[]; semanticIssues: string[]; semanticAudit?: NormalizedSemanticAudit; reviewHistory?: BriefReviewAttempt[]}> = [];
  const persist = () => {
    const spent = gateway.spent();
    const passed = results.length === 2 && results.every(result => result.passed) && spent.unknownCostCalls === 0 && spent.costUsd <= 3 && spent.calls <= 8;
    writeFileSync(resolve(directory, "evidence.json"), JSON.stringify({schemaVersion: "executive-synthesis-live.v2", synthetic: true, promotion: false, humanApprovalProvided: false, scope: "author_and_independent_reviewer_contract_not_application_e2e", gitSha: process.env.GITHUB_SHA, runId: process.env.GITHUB_RUN_ID, fixtureFingerprint: fingerprintJson(corporateGrowthScenario), budget: {maxCostUsd: 3, maxCalls: 8}, spent, passed, results: results.map(result => ({...result, pendingJudgmentIds: result.brief?.sections.flatMap(section => section.claims.filter(claim => claim.material && claim.kind === "judgment").map(claim => claim.id)) ?? []})), calls}, null, 2));
    writeFileSync(resolve(directory, "summary.md"), `# Executive synthesis contract\n\n${passed ? "PASS" : "FAIL"}. Synthetic input, existing author policy and a different reviewer provider. No release promotion.\n\n${results.map(result => `- ${result.locale}: ${result.passed ? "PASS" : "FAIL"}; ${result.summaryClaimIds.length} bound summary claims; ${result.failure ?? "completed"}`).join("\n")}\n\nMeasured USD ${spent.costUsd}; ${spent.calls} attempts including fallback. Fixed cap USD3 / eight attempts.\n`);
    return passed;
  };
  for (const locale of ["pt", "en"] as const) {
    const start = calls.length;
    let brief: CaseBrief | null = null;
    try {
      const reconciliation = reconcileCase({archetypeId: sample.scenario.archetypeId, candidates: sample.candidates, documents: sample.classifiedDocuments, referenceDate: sample.scenario.referenceDate, locale});
      const generated = await gateway.complete({task: "case_brief", system: BRIEF_SYSTEM, input: [{type: "text", text: buildBriefInput({archetypeId: sample.scenario.archetypeId, ...reconciliation, locale})}], schema: briefAuthoringSchema(reconciliation), schemaName: "case_brief"});
      brief = compileAuthoredBrief(generated.output);
      let authorProvider = generated.provider;
      // The same bounded review path as the engine; the fresh review has no repair catalog.
      const outcome = await reviewBriefWithOneRevision({brief, evidence: reconciliation, verify: async (candidate, allowRevision) => {
        const revisionSchema = allowRevision ? briefReviewWithRevisionSchema(candidate, reconciliation) : null;
        const originalInput = JSON.parse(buildSemanticAuditInput({brief: candidate, ...reconciliation}));
        const reviewed = await gateway.complete({task: "audit_evidence",
          system: SEMANTIC_AUDIT_SYSTEM + (allowRevision ? "\n\n" + executiveSynthesisRevisionInstructions : ""),
          input: [{type: "text", text: JSON.stringify({...originalInput, ...(allowRevision ? {revisionEvidence: [...buildBriefEvidenceCatalog(reconciliation).values()]} : {})})}],
          schema: revisionSchema ?? semanticAuditSchema, schemaName: allowRevision ? "semantic_claim_audit_revision" : "semantic_claim_audit",
          allowFallback: false,
          model: authorProvider === "openai" ? {provider: "anthropic", model: "claude-opus-5", effort: "high"} : {provider: "openai", model: "gpt-5.6-sol", effort: "high"},
        });
        const revisions = revisionSchema?.parse(reviewed.output).revisions ?? [];
        if (revisions.length) authorProvider = reviewed.provider;
        return {audit: semanticAuditSchema.parse(reviewed.output), revisions};
      }});
      brief = outcome.proposedBrief;
      const bound = resolveExecutiveSummaryClaims(brief);
      const summarySupports = new Set(bound?.flatMap(claim => claim.supportIds) ?? []);
      const covered = Boolean(bound?.length) && bound!.every(claim => claim.material) && ["company.legal_name", "transaction.requested_amount"].every(id => summarySupports.has(id));
      // Match the engine's claims-stage ceiling, including provider retries and fallback.
      const caseBudgetPassed = calls.length - start <= 3 && calls.slice(start).reduce((sum, call) => sum + (call.costUsd ?? 0), 0) <= 2.25;
      results.push({locale, passed: Boolean(outcome.brief) && covered && caseBudgetPassed, brief,
        failure: !outcome.brief ? outcome.blockedBy[0] ?? "brief_review_failed" : !covered ? "summary_coverage_failed" : !caseBudgetPassed ? "claims_budget_exceeded" : null,
        summaryClaimIds: bound?.map(claim => claim.id) ?? [], start, end: calls.length,
        numericIssues: outcome.numericAudit.findings.map(finding => finding.reason),
        semanticIssues: outcome.semanticAudit?.findings.map(finding => finding.reason) ?? [],
        ...(outcome.semanticAudit ? {semanticAudit: outcome.semanticAudit} : {}), reviewHistory: outcome.attempts});

    } catch {
      results.push({locale, passed: false, brief, failure: "provider_or_contract_failed", summaryClaimIds: [], start, end: calls.length, numericIssues: [], semanticIssues: []});
    }
    persist();
  }
  if (!persist()) process.exitCode = 1;
}
main().catch(() => {console.error("executive_synthesis_live_setup_failed"); process.exitCode = 1;});
