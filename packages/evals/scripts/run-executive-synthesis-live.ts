/** Synthetic author/reviewer contract evaluation, not application E2E or release approval. */
import {mkdirSync, writeFileSync} from "node:fs";
import {resolve} from "node:path";
import {corporateGrowthScenario, generateCase} from "@offroad/case-factory";
import {reconcileCase} from "@offroad/reconciliation";
import {BRIEF_SYSTEM, SEMANTIC_AUDIT_SYSTEM, auditBrief, buildBriefInput, buildSemanticAuditInput, briefAuthoringSchema, compileAuthoredBrief, fingerprintJson, normalizeSemanticAudit, resolveExecutiveSummaryClaims, semanticAuditSchema, type CaseBrief, type NormalizedSemanticAudit} from "@offroad/case-understanding";
import {createAnthropicAdapter, createModelGateway, createOpenAIAdapter, type GatewayCallLog} from "@offroad/model-gateway";
import {assertDocumentWorkLiveEnvironment} from "../src/document-work-product-live";

async function main() {
  assertDocumentWorkLiveEnvironment(process.env);
  if (!process.env.ANTHROPIC_API_KEY || !process.env.OPENAI_API_KEY) throw new Error("protected_provider_credentials_required");
  const directory = resolve(process.env.RUNNER_TEMP ?? ".", "executive-synthesis-live");
  mkdirSync(directory, {recursive: true});
  const calls: GatewayCallLog[] = [];
  const gateway = createModelGateway({adapters: {anthropic: createAnthropicAdapter({apiKey: process.env.ANTHROPIC_API_KEY}), openai: createOpenAIAdapter({apiKey: process.env.OPENAI_API_KEY})}, budget: {maxCostUsd: 3, maxCalls: 8}, onCall: call => calls.push(call)});
  const sample = generateCase(corporateGrowthScenario);
  const results: Array<{locale: string; passed: boolean; brief: CaseBrief | null; failure: string | null; summaryClaimIds: string[]; start: number; end: number; numericIssues: string[]; semanticIssues: string[]; semanticAudit?: NormalizedSemanticAudit}> = [];
  const persist = () => {
    const spent = gateway.spent();
    const passed = results.length === 2 && results.every(result => result.passed) && spent.unknownCostCalls === 0 && spent.costUsd <= 3 && spent.calls <= 8;
    writeFileSync(resolve(directory, "evidence.json"), JSON.stringify({schemaVersion: "executive-synthesis-live.v1", synthetic: true, promotion: false, humanApprovalProvided: false, scope: "author_and_independent_reviewer_contract_not_application_e2e", gitSha: process.env.GITHUB_SHA, runId: process.env.GITHUB_RUN_ID, fixtureFingerprint: fingerprintJson(corporateGrowthScenario), budget: {maxCostUsd: 3, maxCalls: 8}, spent, passed, results: results.map(result => ({...result, pendingJudgmentIds: result.brief?.sections.flatMap(section => section.claims.filter(claim => claim.material && claim.kind === "judgment").map(claim => claim.id)) ?? []})), calls}, null, 2));
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
      // As in the case engine, numerical review is separate from the retained human judgment gate.
      const numeric = auditBrief({brief, facts: reconciliation.facts, calculations: reconciliation.calculations, gaps: reconciliation.gaps, exceptions: reconciliation.exceptions, requireJudgmentApproval: false});
      const bound = resolveExecutiveSummaryClaims(brief);
      if (!numeric.ok || !bound) {
        results.push({locale, passed: false, brief, failure: "brief_audit_failed", summaryClaimIds: bound?.map(claim => claim.id) ?? [], start, end: calls.length, numericIssues: numeric.audit.findings.map(finding => finding.reason), semanticIssues: []});
      } else {
        const reviewed = await gateway.complete({task: "audit_evidence", system: SEMANTIC_AUDIT_SYSTEM, input: [{type: "text", text: buildSemanticAuditInput({brief, facts: reconciliation.facts, calculations: reconciliation.calculations, gaps: reconciliation.gaps, exceptions: reconciliation.exceptions})}], schema: semanticAuditSchema, schemaName: "semantic_claim_audit", model: generated.provider === "openai" ? {provider: "anthropic", model: "claude-opus-5", effort: "high"} : {provider: "openai", model: "gpt-5.6-sol", effort: "high"}});
        const semantic = normalizeSemanticAudit(brief, reviewed.output);
        const summarySupports = new Set(bound.flatMap(claim => claim.supportIds));
        // A formally bound but empty or irrelevant opening does not pass this fixture.
        const covered = bound.every(claim => claim.material) && ["company.legal_name", "transaction.requested_amount"].every(id => summarySupports.has(id));
        results.push({locale, passed: semantic.status === "pass" && covered, brief, failure: semantic.status !== "pass" ? "semantic_audit_failed" : !covered ? "summary_coverage_failed" : null, summaryClaimIds: bound.map(claim => claim.id), start, end: calls.length, numericIssues: [], semanticIssues: semantic.findings.map(finding => finding.reason), semanticAudit: semantic});
      }
    } catch {
      results.push({locale, passed: false, brief, failure: "provider_or_contract_failed", summaryClaimIds: [], start, end: calls.length, numericIssues: [], semanticIssues: []});
    }
    persist();
  }
  if (!persist()) process.exitCode = 1;
}
main().catch(() => {console.error("executive_synthesis_live_setup_failed"); process.exitCode = 1;});
