import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {executeCaseEngine, structureAlternativesInputSchema, type StructureDesignerContext} from "@offroad/case-engine";
import {
  BRIEF_SYSTEM, SEMANTIC_AUDIT_SYSTEM, boundSemanticAuditSchema, briefAuthoringSchema, briefReviewWithRevisionSchema,
  buildBriefEvidenceCatalog, buildBriefInput, buildSemanticAuditInput, deskEvidence, type CaseBrief,
} from "@offroad/case-understanding";
import {executiveSynthesisRevisionInstructions, preview} from "@offroad/credit-playbook";
import {documentKinds, type DocumentKind} from "@offroad/credit-ontology";
import {createClassifier} from "@offroad/document-classification";
import {extractDocument, targetFields} from "@offroad/document-extraction";
import {parseDocument} from "@offroad/document-parsers";
import {
  buildRepairGuidance, COST_RESERVATION_SAFETY_FACTOR, createModelGateway, defaultTaskPolicies, estimateCostUsd, listPrices,
  productionModelCeilingsUsd, productionRunBudget, resolveModel, retentionMatrixVersion,
  type AdapterRequest, type AdapterResponse, type GatewayRequest, type ModelGateway, type ModelRef, type ProviderAdapter,
} from "@offroad/model-gateway";
import type {PublicSearchProvider} from "@offroad/public-research";
import {reconcileCase, type FactCandidate} from "@offroad/reconciliation";
import {describe, expect, it} from "vitest";
import type {z} from "zod";

import {processAgentOperationBriefJob} from "./agent-operation-brief";
import {processCaseAnalysisJob} from "./case-analysis";
import {processCapitalPlanningJob} from "./capital-planning";
import {processCompanyDebtViewJob} from "./company-debt-view";
import {processIntegrationPreviewRunJob} from "./integration-preview";
import {jobModelBudget} from "./model-budgets";
import {processOriginationThesisJob} from "./origination-thesis";
import type {AgentOperationBriefJob, CapitalProjectAnalysisJob, CaseAnalysisJob, ClaimedJob, QueueClient, WorkConversationJob} from "./queue";
import {STRUCTURE_DESIGN_SYSTEM, buildStructureDesignInput} from "./structure-design";
import {processWorkConversationJob} from "./work-conversation";

/**
 * The largest request every production job kind builds, rebuilt with the worker's own code on the
 * repository's documents, gold fields and conversation caps, reserved by the gateway itself, and
 * held against the job's budget. `productionModelCeilingsUsd` records how each ceiling follows
 * from these requests; this file fails when a request outgrows the budget that must admit it.
 *
 * "Worst attempt" is the worst legitimate attempt of the job: earlier attempts billed at their
 * full upper bound (the reservation without its 10% price margin), the last at its reservation,
 * one request allowed to fail at its ceiling and go through its repair and fallback, within the
 * job's call ceiling.
 */
type Request = GatewayRequest<z.ZodType>;
const repo = resolve(import.meta.dirname, "../../..");
const assets = resolve(repo, "packages/testing-fixtures/assets");
const gold = resolve(repo, "packages/testing-fixtures/gold");
const ids = {
  organization: "11111111-1111-4111-8111-111111111111", session: "22222222-2222-4222-8222-222222222222",
  run: "33333333-3333-4333-8333-333333333333", job: "44444444-4444-4444-8444-444444444444",
  project: "55555555-5555-4555-8555-555555555555", plan: "66666666-6666-4666-8666-666666666666",
  brief: "77777777-7777-4777-8777-777777777777", research: "88888888-8888-4888-8888-888888888888",
};
const upperBound = (reservationUsd: number) => reservationUsd / COST_RESERVATION_SAFETY_FACTOR;
/** Every earlier attempt billed at its bound and the current one reserved, at its worst point. */
const worstAttempt = (reservations: readonly number[]) => Math.max(...reservations.map((reservation, index) =>
  reservations.slice(0, index).reduce((total, earlier) => total + upperBound(earlier), 0) + reservation));
/** Production's discovery provider: OpenAI web search at its declared worst cost per query. */
const webSearch = {researchCostPerQueryUsd: 0.02, researchProvidersConfigured: true, maxCallsPerJob: 8};
const gatewayBudget = (job: ClaimedJob) => jobModelBudget({job, ...webSearch}).maxCostUsd;

/** Records what a job asks and answers nothing, so every model call it would make is captured. */
function recorder(): {requests: Request[]; gateway: ModelGateway} {
  const requests: Request[] = [];
  return {requests, gateway: {
    async complete(request) { requests.push(request as Request); throw new Error("recorded_not_sent"); },
    spent: () => ({costUsd: 0, calls: 0, unknownCostCalls: 0, budgetExposureUsd: 0}),
  }};
}

/** What the production gateway reserves for the first attempt of a request on a route. */
async function reserve(request: Request, route: ModelRef, system = request.system): Promise<number> {
  const charged: number[] = [];
  const probe = createModelGateway({adapters: {}, processingEligibility: async ({attempt}) => {
    charged.push(attempt.reservationUsd);
    return {allowed: false, policyVersion: retentionMatrixVersion, assuranceId: null, reasons: ["reservation_probe"]};
  }});
  await probe.complete({...request, system, model: route, allowFallback: false}).catch(() => undefined);
  if (charged.length !== 1) throw new Error(`no reservation for ${request.task} on ${route.model}`);
  return charged[0]!;
}
/** The primary and, when the request allows it, the fallback route of a request. */
function routes(request: Request): {primary: ModelRef; fallback?: ModelRef} {
  const {primary, fallback} = resolveModel(request.task, defaultTaskPolicies, {override: request.model, useShadow: request.useShadow});
  return fallback && request.allowFallback !== false ? {primary, fallback} : {primary};
}
/** A same-model repair carries its guidance in the system: five schema issues, as the gateway keeps. */
const repairSystem = (request: Request) => `${request.system}\n\n${buildRepairGuidance("schema", Array.from({length: 5}, (_, index) => ({
  path: `proposal.patches.${index}.value`, code: "invalid_type", message: "Invalid input: expected string, received number"})))}`;

let corpusText: string | undefined;
/** Portuguese financial prose and tables from the Camil and Cogna filings of the fixtures. */
async function corpus(): Promise<string> {
  if (corpusText) return corpusText;
  let text = "";
  for (const file of ["camil/01_ITR_1T26_31mai2026.pdf", "camil/02_Proposta_Administracao_AGOE_2026.pdf", "cogna/01_Release_Resultados_2T26.pdf"]) {
    const parsed = await parseDocument({bytes: new Uint8Array(readFileSync(resolve(assets, file))), documentId: "00000000-0000-4000-8000-000000000001", documentVersion: 1, fileName: "filing.pdf"});
    text += ` ${(parsed.layer.pages ?? []).flatMap((page) => [...page.blocks.map((block) => block.text), ...page.tables.flatMap((table) => table.rows.map((row) => row.cells.map((cell) => cell.text).join(" | ")))]).join(" ")}`;
  }
  corpusText = text.replace(/\s+/g, " ");
  return corpusText;
}

/** Public research at its caps: five sources per query, every snippet past the cut the job applies. */
function publicResearch(text: string): PublicSearchProvider {
  let offset = 0;
  return {id: "perplexity", maxCostUsdPerCall: 0.005, search: async (query) => Array.from({length: 5}, (_, index) => {
    const snippet = text.slice(offset, offset + 2_000);
    offset = (offset + 2_000) % (text.length - 2_000);
    return {provider: "perplexity", topic: query.topic, title: `Relatório público ${query.topic} ${index + 1} sobre a companhia e sua dívida`,
      url: `https://ri.camil.com.br/${query.topic}/${query.id.slice(0, 12)}/${index}`, snippet, publishedAt: "2026-05-31",
      retrievedAt: "2026-09-01T12:00:00.000Z", contentHash: createHash("sha256").update(`${query.id}${index}`).digest("hex")};
  })} as PublicSearchProvider;
}

describe("production budgets hold the largest request of every job", () => {
  it("document pipeline: classification and seven extraction windows fit one document's share", async () => {
    // The widest field catalogue travels beside every window: the unclassifiable `other` kind.
    const widest = documentKinds.map((definition) => definition.kind as DocumentKind)
      .sort((left, right) => targetFields(right).length - targetFields(left).length)[0]!;
    expect(targetFields(widest).length).toBeGreaterThanOrEqual(494);
    const parse = async (file: string) => parseDocument({bytes: new Uint8Array(readFileSync(resolve(assets, file))), documentId: "00000000-0000-4000-8000-000000000002", documentVersion: 1, fileName: file.split("/")[1]!});
    const proposal = await parse("camil/02_Proposta_Administracao_AGOE_2026.pdf");
    const extraction = recorder();
    await extractDocument({layer: proposal.layer, profile: {documentId: proposal.layer.documentId, kind: widest, informationClass: "audited", evidenceRank: 1, confidence: 0.9, quality: {alerts: []}} as never,
      fileName: "02_Proposta_Administracao_AGOE_2026.pdf", gateway: extraction.gateway});
    expect(extraction.requests.length).toBeGreaterThan(7);
    const windows = await Promise.all(extraction.requests.map(async (request) => ({request, reservation: await reserve(request, routes(request).primary)})));
    const largest = windows.sort((left, right) => right.reservation - left.reservation)[0]!;
    const plan = await parse("rede-horizonte/05_Business_Plan_3_Novas_Lojas_2026_2030.xlsx");
    const classification = recorder();
    await createClassifier(classification.gateway)({parsed: plan, fileName: "05_Business_Plan_3_Novas_Lojas_2026_2030.xlsx", locale: "pt-BR"}).catch(() => undefined);
    const classify = await reserve(classification.requests[0]!, routes(classification.requests[0]!).primary);
    const worst = worstAttempt([classify, ...Array.from({length: 7}, () => largest.reservation)]);
    const share = Math.min(productionRunBudget.document_max_cost_usd, (productionRunBudget.max_cost_usd - productionRunBudget.case_max_cost_usd) / 8);
    const budget = gatewayBudget({claimed: true, job_id: ids.job, capability_token: "c".repeat(64), lease_expires_at: "2026-09-24T18:00:00.000Z", attempt: 1,
      organization_id: ids.organization, intake_session_id: ids.session, processing_run_id: ids.run, kind: "document_pipeline",
      payload: {source_document_id: ids.brief, document_version: 1, original_name: "x.pdf", object_path: "x.pdf", model_budget: {max_cost_usd: share, max_calls: 8}}} as unknown as ClaimedJob);
    expect(budget).toBe(productionModelCeilingsUsd.documentPipeline);
    expect(largest.reservation).toBeGreaterThan(0.18);
    expect(worst).toBeLessThanOrEqual(budget);

    // The single document job on record at 8.32 USD cannot come from the call ceiling of 28 Aug
    // 2026 (eight calls an attempt, three attempts): even with every call at the input its
    // calibrated bound allows and its whole output, at the Sonnet 5 price then recorded (3/15),
    // they stay far below it.
    const sonnetThen = {...listPrices["claude-sonnet-5"]!, input: 3, output: 15, cacheWrite: 3.75, cachedInput: 0.3};
    const inputBound = (largest.reservation / COST_RESERVATION_SAFETY_FACTOR - 8_000 * 10 / 1_000_000) / (2 / 1_000_000);
    const perCallThen = estimateCostUsd("claude-sonnet-5", {inputTokens: Math.ceil(inputBound), cachedInputTokens: 0, outputTokens: 8_000}, {"claude-sonnet-5": sonnetThen});
    expect(3 * 8 * perCallThen).toBeLessThan(8.3179);
  }, 120_000);

  it("case analysis: structure, brief and both audits fit the case engine's policy on the Camil gold case", async () => {
    const candidatesOf = (caseId: string): FactCandidate[] => (JSON.parse(readFileSync(resolve(gold, caseId, "expected/fields.json"), "utf8")) as Array<Record<string, unknown>>)
      .map((field) => ({fieldPath: String(field.fieldPath), normalizedValue: String(field.value), valueType: field.valueType as FactCandidate["valueType"],
        sourceDocument: String(field.sourceDocument ?? "source-1"), evidenceRank: 1, informationClass: "audited", confidence: 0.99, anchorVerified: true,
        entityScope: "consolidated", currency: "BRL", unit: field.valueType === "number" ? "currency" : "text", scale: "1",
        ...(field.periodStart ? {periodStart: String(field.periodStart)} : {}), ...(field.periodEnd ? {periodEnd: String(field.periodEnd)} : {})} as FactCandidate));
    const documents = ["audited_financial_statements", "trial_balance", "debt_schedule", "company_registration", "capital_request_letter", "business_plan", "reviewed_interim_statements"]
      .map((kind, index) => ({id: `d${index}`, kind}));
    const playbookLines = Array.from({length: 12}, (_, index) => `- [credit-playbook:growth-expansion-${index}] Expansão exige orçamento, cronograma, capacidade de pagamento, cenário de atraso, garantias e covenants coerentes com o fluxo de caixa projetado.`);
    // The structure request, from the engine's own designer context for the Rede Horizonte room.
    let structure: Request | undefined;
    await executeCaseEngine({runId: "r", caseId: "c", archetypeId: "growth_expansion", locale: "pt", referenceDate: "2026-09-24",
      candidates: candidatesOf("rede-horizonte"), documents: documents as never, roomDocuments: [],
      dealBrief: {requestedAmount: "90000000", requestedTermMonths: 60, instruments: ["ccb"]}, resolvedMandates: [], externalReleaseApproved: false,
      designStructure: async (context: StructureDesignerContext) => {
        structure = {task: "structure_design", system: STRUCTURE_DESIGN_SYSTEM, input: [{type: "text", text: buildStructureDesignInput({context, asOf: "2026-09-24", playbookLines, requestedChanges: []})}],
          schema: structureAlternativesInputSchema, schemaName: "structure_alternatives", maxOutputTokens: 8_000};
        return {proposal: null, blockedBy: ["reservation_probe"]};
      }} as never).catch(() => undefined);
    expect(structure).toBeDefined();
    // The brief and its reviews for the largest gold case: Camil, 170 facts.
    const reconciliation = reconcileCase({archetypeId: "growth_expansion", candidates: candidatesOf("camil"), documents: documents as never, referenceDate: "2026-09-24", locale: "pt"});
    expect(reconciliation.facts.length).toBeGreaterThanOrEqual(170);
    const desk = deskEvidence(null, null);
    const brief: Request = {task: "case_brief", system: BRIEF_SYSTEM, schemaName: "case_brief", input: [{type: "text", text: buildBriefInput({archetypeId: "growth_expansion", ...reconciliation, locale: "pt", deskLines: desk.promptLines, playbookLines})}],
      schema: briefAuthoringSchema(reconciliation)};
    const evidenceIds = [...buildBriefEvidenceCatalog(reconciliation).keys()];
    const sections = ["identity", "business", "request", "project", "history", "current_position", "projections", "strengths", "risks", "executive_summary"] as const;
    const authored: CaseBrief = {sections: sections.map((id, section) => ({id, heading: `Seção ${id}`, claims: Array.from({length: 5}, (_, claim) => ({
      id: `${id}-${claim}`, material: true, kind: "fact" as const,
      text: "A companhia apresenta receita líquida e EBITDA consistentes com o histórico auditado, e a alavancagem após a operação permanece dentro do covenant mais apertado do mapa de dívida, segundo os fatos conciliados citados.",
      supportIds: evidenceIds.slice((section * 5 + claim) % (evidenceIds.length - 3), (section * 5 + claim) % (evidenceIds.length - 3) + 3)}))})),
      executiveSummary: "Resumo executivo.", executiveSummaryClaimIds: ["identity-0", "request-0"]};
    const audit = (allowRevision: boolean, reviewer: ModelRef): Request => {
      const evidence = {facts: reconciliation.facts, calculations: reconciliation.calculations, gaps: reconciliation.gaps, exceptions: reconciliation.exceptions};
      const input = JSON.parse(buildSemanticAuditInput({brief: authored, ...evidence})) as Record<string, unknown>;
      return {task: "audit_evidence", system: SEMANTIC_AUDIT_SYSTEM + (allowRevision ? `\n\n${executiveSynthesisRevisionInstructions}` : ""),
        input: [{type: "text", text: JSON.stringify({...input, ...(allowRevision ? {revisionEvidence: [...buildBriefEvidenceCatalog(evidence).values()]} : {})})}],
        schema: (allowRevision ? briefReviewWithRevisionSchema(authored, evidence) : boundSemanticAuditSchema(authored)) as z.ZodType,
        schemaName: allowRevision ? "semantic_claim_audit_revision_v2" : "semantic_claim_audit_v2", allowFallback: false, model: reviewer};
    };
    const opus: ModelRef = {provider: "anthropic", model: "claude-opus-5", effort: "high"};
    const sol: ModelRef = {provider: "openai", model: "gpt-5.6-sol", effort: "high"};
    const briefReservation = await reserve(brief, routes(brief).primary);
    // Opus writes, Sol reviews with revision; a revision by Sol sends the fresh review to Opus.
    const primaryPath = [await reserve(structure!, routes(structure!).primary), briefReservation,
      await reserve(audit(true, sol), sol), await reserve(audit(false, opus), opus)];
    const caseJob = {claimed: true, job_id: ids.job, capability_token: "c".repeat(64), lease_expires_at: "2026-09-24T18:00:00.000Z", attempt: 1,
      organization_id: ids.organization, intake_session_id: ids.session, processing_run_id: ids.run, kind: "case_analysis",
      payload: {locale: "pt-BR", execution_mode: "primary", analysis_scope: "full_case", model_budget: {max_cost_usd: productionRunBudget.case_max_cost_usd, max_calls: productionRunBudget.case_max_calls}}} as unknown as ClaimedJob;
    const budget = gatewayBudget(caseJob);
    expect(budget).toBeCloseTo(3, 10);
    expect(briefReservation).toBeGreaterThan(1.1);
    expect(worstAttempt(primaryPath)).toBeLessThanOrEqual(budget);
    // The brief alone never fitted the old case budget, a dollar less five research queries.
    expect(briefReservation).toBeGreaterThan(gatewayBudget({...caseJob, payload: {...(caseJob.payload as object), model_budget: {max_cost_usd: 1, max_calls: 4}}} as ClaimedJob));
  }, 120_000);

  it("preliminary analysis: one understanding and its fallback fit the database's 0.90 at every input cap", async () => {
    const text = await corpus();
    const fields = JSON.parse(readFileSync(resolve(gold, "camil/expected/fields.json"), "utf8")) as Array<Record<string, unknown>>;
    const job = {claimed: true, job_id: ids.job, capability_token: "c".repeat(64), lease_expires_at: "2026-09-24T18:00:00.000Z", attempt: 1, kind: "preliminary_analysis",
      organization_id: ids.organization, intake_session_id: ids.session, processing_run_id: ids.run,
      payload: {locale: "pt-BR", execution_mode: "primary", analysis_scope: "preliminary_understanding", model_budget: {max_cost_usd: 0.9, max_calls: 2}}} as unknown as CaseAnalysisJob;
    const queue = {
      writeStage: async () => {}, recordPublicResearch: async () => ids.research, fail: async () => {}, complete: async () => {}, recordAgentAssessment: async () => ({}),
      loadPreliminaryInput: async () => ({
        session: {id: ids.session, capital_project_id: ids.project, locale: "pt-BR", archetype: "working_capital",
          company_profile: {name: "Camil Alimentos S.A.", legal_name: "Camil Alimentos S.A.", website: "https://ri.camil.com.br", description: text.slice(0, 2_000)},
          capital_objective: text.slice(2_000, 2_600), requested_amount: 500_000_000, capital_currency: "BRL", sector: "Alimentos", geography: "Brasil"},
        candidates: Array.from({length: 150}, (_, index) => {
          const field = fields[index % fields.length]!;
          return {id: `candidate-${index}`, field_path: field.fieldPath, label: `Rótulo do campo ${String(field.fieldPath)}`, raw_value: String(field.value), normalized_value: String(field.value),
            value_type: field.valueType, source_document_id: `source-${index % 80}`, evidence_rank: 1, information_class: "company_document", confidence: 0.97,
            anchor_verified: true, source_anchor: {page: 1 + (index % 40), quote: text.slice(index * 200, index * 200 + 180)}};
        }),
        documents: Array.from({length: 90}, (_, index) => ({id: `source-${index}`, original_name: `Documento_${index}_Demonstracoes_Financeiras_Consolidadas_2025.pdf`, document_version: 1,
          sha256: createHash("sha256").update(String(index)).digest("hex"), sha256_verified_at: "2026-08-31T12:00:00.000Z", byte_size: 1_000_000, document_kind: "audited_financial_statements"})),
        initial_request: text.slice(3_000, 11_000), correction_request: text.slice(11_000, 15_000),
      }),
    } as unknown as QueueClient;
    const recorded = recorder();
    await processCaseAnalysisJob(job, {queue, gateway: recorded.gateway, lineage: () => [], researchProviders: [publicResearch(text)], now: () => new Date("2026-08-31T12:00:00.000Z")}).catch(() => undefined);
    const request = recorded.requests[0]!;
    const {primary, fallback} = routes(request);
    const path = [await reserve(request, primary), await reserve(request, fallback!)];
    expect(worstAttempt(path)).toBeLessThanOrEqual(gatewayBudget(job));
    expect(gatewayBudget(job)).toBeCloseTo(0.8, 10);
  }, 120_000);

  it("agent operation brief: the shadow router and a brief repaired and answered by Sol fit its own ceiling", async () => {
    const text = await corpus();
    const uuid = (n: number) => `${String(n).padStart(8, "0")}-0000-4000-8000-${String(n).padStart(12, "0")}`;
    const job: AgentOperationBriefJob = {claimed: true, job_id: ids.job, capability_token: "c".repeat(64), lease_expires_at: "2026-09-24T18:00:00.000Z", attempt: 1,
      kind: "agent_operation_brief", organization_id: ids.organization, intake_session_id: ids.session, processing_run_id: ids.run,
      payload: {message_id: uuid(1), locale: "pt-BR"}};
    // Every field at the cap the context schema allows.
    const context = {
      session_id: ids.session, message_id: uuid(1), locale: "pt-BR", message: `Preciso preparar a reunião com a Camil sobre refinanciamento. ${text}`.slice(0, 8_000),
      message_metadata: {}, brief: {objective: text.slice(9_000, 11_000), audience: "Comitê", notes: text.slice(11_000, 13_000)},
      snapshot_fingerprint: "a".repeat(64), projection_updated_at: "2026-09-07T12:00:00.000Z", manifest_id: null,
      project: {id: ids.project, name: "Camil refinanciamento", entryJob: "company_debt_view", accessBasis: "authorized_private", phase: "analyze", status: "active"},
      company_profile: {name: "Camil Alimentos S.A.", website: "https://ri.camil.com.br", description: text.slice(13_000, 14_500)},
      related_project_memory: Array.from({length: 8}, (_, index) => ({projectId: uuid(100 + index), projectName: `Projeto Camil ${index}`, companyName: "Camil Alimentos S.A.",
        entryJob: "company_debt_view", currentPhase: "analyze", status: "active", updatedAt: "2026-09-01T00:00:00.000Z",
        brief: {kind: "company_debt_view", content: {focus: text.slice(20_000 + index * 3_000, 23_000 + index * 3_000)}}, artifactTypes: Array.from({length: 20}, (_, a) => `artifact_type_${a}`)})),
      documents: Array.from({length: 250}, (_, index) => ({id: uuid(1_000 + index), name: `Documento_${index}_Demonstracoes_Financeiras_Consolidadas_2025.pdf`, kind: "audited_financial_statements", status: "ready"})),
      tasks: Array.from({length: 80}, (_, index) => ({taskId: `C${String(index).padStart(2, "0")}`, label: `Tarefa de análise ${index}`, ordinal: index, status: "succeeded"})),
      artifacts: Array.from({length: 80}, (_, index) => ({id: uuid(2_000 + index), type: "company_debt_diagnostic", version: 1, status: "pending_confirmation"})),
      recent_messages: Array.from({length: 12}, (_, index) => ({id: uuid(3_000 + index), role: index % 2 ? "assistant" : "user",
        content: text.slice(50_000 + index * 8_000, 50_000 + (index + 1) * 8_000), created_at: "2026-09-07T12:00:00.000Z"})),
    };
    const queue = {writeStage: async () => {}, loadAgentContext: async () => context, loadIntegrationPreviewArtifacts: async () => [], recordAgentResponse: async () => ({}),
      recordIntentEnvelope: async () => {}, complete: async () => {}, recordAgentFailure: async () => {}, fail: async () => {}} as unknown as QueueClient;
    const recorded = recorder();
    await processAgentOperationBriefJob(job, {queue, gateway: recorded.gateway, log: () => {}}).catch(() => undefined);
    const byTask = (task: Request["task"]) => recorded.requests.find((request) => request.task === task)!;
    const [route, objects, reply] = [byTask("route_intent"), byTask("extract_semantic_objects"), byTask("agent_operation_brief")];
    const {primary, fallback} = routes(reply);
    const path = [await reserve(route, routes(route).primary), await reserve(objects, routes(objects).primary),
      await reserve(reply, primary), await reserve(reply, primary, repairSystem(reply)), await reserve(reply, fallback!)];
    const budget = gatewayBudget(job);
    expect(budget).toBe(productionModelCeilingsUsd.agentOperationBrief);
    expect(path[4]).toBeGreaterThan(0.6);
    expect(worstAttempt(path)).toBeLessThanOrEqual(budget);
    // The historical maximum (0.2245 USD per job) plus the largest request fits with room.
    expect(0.2245 + Math.max(...path)).toBeLessThanOrEqual(budget);
  }, 120_000);

  it("work conversation: the one call of a turn at every cap fits the database's 0.25", async () => {
    const text = await corpus();
    const job = {claimed: true, job_id: ids.job, capability_token: "c".repeat(64), lease_expires_at: "2026-09-24T18:00:00.000Z", attempt: 1,
      organization_id: ids.organization, intake_session_id: null, work_id: ids.project, processing_run_id: ids.run, kind: "work_conversation",
      payload: {message_id: ids.brief, locale: "pt-BR", model_budget: {max_calls: 1, max_cost_usd: 0.25}}} as unknown as WorkConversationJob;
    const queue = {
      loadWorkTurn: async () => ({workId: ids.project, messageId: ids.brief, locale: "pt-BR", message: text.slice(0, 8_000), fingerprint: "d".repeat(64),
        context: {purpose: text.slice(8_000, 16_000), audience: text.slice(16_000, 16_500), deadline: "2026-10-01", commitment: "preparing", stage: "analyze", revision: 3},
        messages: Array.from({length: 12}, (_, index) => ({role: index % 2 ? "assistant" : "user", content: text.slice(20_000 + index * 8_000, 28_000 + index * 8_000)}))}),
      commitWorkTurn: async () => ({}), fail: async () => {},
    } as unknown as QueueClient;
    const recorded = recorder();
    await processWorkConversationJob(job, {queue, gateway: recorded.gateway, log: () => {}});
    const request = recorded.requests[0]!;
    // One call: the fallback is never reached within the call ceiling.
    expect(jobModelBudget({job, ...webSearch}).maxCalls).toBe(1);
    expect(await reserve(request, routes(request).primary)).toBeLessThanOrEqual(gatewayBudget(job));
  }, 120_000);

  const plans: Record<string, Record<string, string[]>> = {
    company_debt_view: {M01: [], M02: [], M03: ["M02"], M04: ["M01", "M02"], M05: ["M02", "M03"], M06: ["M04", "M05"], D01: ["M06"], D02: ["D01"], D03: ["D02"], D04: ["D03"], D05: ["D04"], D06: ["D05"], D07: ["D06"],
      C01: ["D06"], C02: ["M01", "M04"], C03: ["D06", "D07"], C04: ["C03"], C05: ["D06"], C06: ["D06"], C07: ["C03", "D06"], C08: ["C03", "C05", "C07"], C09: ["C01", "C02", "C03", "C04", "C05", "C06", "C07", "C08"], C10: ["C05", "C08", "C09"], C11: ["C09", "C10"]},
    origination_thesis: {M01: [], M02: [], M03: ["M02"], M04: ["M01", "M02"], M05: ["M02", "M03"], M06: ["M04", "M05"], M07: ["M06", "C02", "K04"], C02: ["M01", "M04"], K04: ["M01", "M04"]},
  };
  plans.capital_planning = {...plans.company_debt_view!, S01: ["M02", "C06", "C10"], S02: ["M04", "C10"], S03: ["S02"], S04: ["D06", "C09"], S05: ["S01", "S03", "S04"], S06: ["S05"], S07: ["S05", "S06"], S08: ["C08", "S05"], S09: ["S05"], S10: ["S07", "S08", "S09"], S11: ["S10", "C11"]};
  const briefs: Record<string, (text: string) => Record<string, unknown>> = {
    company_debt_view: (text) => ({focus: text.slice(0, 3_000)}),
    origination_thesis: (text) => ({meetingContext: text.slice(0, 5_000), thesisToTest: text.slice(5_000, 8_000), audience: text.slice(8_000, 8_240), meetingDate: "2026-09-20"}),
    capital_planning: (text) => ({capitalIntent: text.slice(0, 5_000)}),
  };
  const budgets = {company_debt_view: 0.95, origination_thesis: 1.5, capital_planning: 0.95} as const;

  for (const scope of ["company_debt_view", "origination_thesis", "capital_planning"] as const) {
    it(`${scope.replaceAll("_", " ")}: the synthesis over every public source and its fallback fit the job's budget`, async () => {
      const text = await corpus();
      let sequence = 0;
      const queue = {
        writeStage: async () => {}, recordPublicResearch: async () => ids.research, finishCapitalTask: async () => {}, complete: async () => {}, fail: async () => {}, recordAgentAssessment: async () => {},
        loadCapitalProjectContext: async () => ({
          project: {id: ids.project, organization_id: ids.organization, project_name: "Projeto Camil", entry_job: scope, access_basis: "public_information", current_phase: "understand"},
          session: {id: ids.session, locale: "pt-BR", company_profile: {name: "Camil Alimentos S.A.", website: "https://ri.camil.com.br", geography: "Brasil"}, privacy_status: "public_information", representation_status: "not_claimed"},
          professional_context: null, institution_capabilities: null,
          brief: {id: ids.brief, kind: scope, version: 1, content: briefs[scope]!(text), content_fingerprint: "a".repeat(64)},
          plan: {id: ids.plan, version: 1, fingerprint: "b".repeat(64), compiler_version: "v-test", registry_version: "v-test"},
          tasks: Object.entries(plans[scope]!).map(([id, dependencies], ordinal) => ({id, ordinal, batch: ordinal, dependencies, execution_class: id === "C02" ? "research" : "deterministic", effect: "propose_state"})),
          revision: null, dependency_artifacts: [], prior_failed_task_feedback: [],
        }),
        startCapitalTask: async () => `99999999-9999-4999-8999-${String(++sequence).padStart(12, "0")}`,
        recordCapitalProjectArtifact: async () => ({id: `aaaaaaaa-aaaa-4aaa-8aaa-${String(++sequence).padStart(12, "0")}`, artifactFingerprint: "c".repeat(64), artifactVersion: 1, replayed: false}),
      } as unknown as QueueClient;
      const job = {claimed: true, job_id: ids.job, capability_token: "c".repeat(64), lease_expires_at: "2026-09-24T18:00:00.000Z", attempt: 1,
        organization_id: ids.organization, intake_session_id: ids.session, processing_run_id: ids.run, kind: "capital_project_analysis",
        payload: {analysis_scope: scope, locale: "pt-BR", capital_project_id: ids.project, capital_project_plan_id: ids.plan, capital_project_brief_id: ids.brief,
          capital_task_ids: Object.keys(plans[scope]!), capital_artifact_required: true, trigger_event: {}, model_budget: {max_cost_usd: budgets[scope], max_calls: 2}}} as unknown as CapitalProjectAnalysisJob;
      const recorded = recorder();
      const dependencies = {queue, gateway: recorded.gateway, lineage: () => [], researchProviders: [publicResearch(text)], now: () => new Date("2026-09-01T12:00:00.000Z"), log: () => {}};
      if (scope === "company_debt_view") await processCompanyDebtViewJob(job, dependencies);
      else if (scope === "origination_thesis") await processOriginationThesisJob(job, dependencies);
      else await processCapitalPlanningJob(job, dependencies);
      const request = recorded.requests[0]!;
      expect(JSON.parse((request.input[0] as {text: string}).text).publicSources.length).toBe(scope === "origination_thesis" ? 60 : 40);
      const {primary, fallback} = routes(request);
      const path = [await reserve(request, primary), await reserve(request, fallback!)];
      // The database's budget, less the research reserve, admits the worst attempt now; for the
      // origination thesis that is the trigger's 1.50 below the derived 1.55.
      expect(worstAttempt(path)).toBeLessThanOrEqual(gatewayBudget(job));
    }, 120_000);
  }

  it("integration preview: the questions and the synthesis fit the database's 0.50, and a failed synthesis with its fallback fits the derived 0.60", async () => {
    const composition = "prepare_decision";
    const steps = preview.previewStepsForComposition(composition).map((step) => step.taskId);
    let sequence = 0;
    const queue = {
      writeStage: async () => {},
      loadCapitalProjectContext: async () => ({mode: "integration_preview",
        preview: {mode: "integration_preview", composition, caseId: "gc01-analista-ib-camil", workflow: preview.previewWorkflowIdentity(composition), premises: {}},
        project: {id: ids.project, organization_id: ids.organization, project_name: "Reunião Camil", entry_job: "origination_thesis", access_basis: "public_information", current_phase: "understand"},
        session: {id: ids.session, locale: "pt-BR", company_profile: {name: "Camil Alimentos S.A."}},
        brief: {id: ids.brief, kind: "integration_preview", version: 1, content: {request: {turn: 1, audience: {primary: "vp", others: ["board"]}, form: "pitch_pages", pages: 3,
          sponsorInstruction: "Refinanciamento das debêntures de 2027 e 2028 com alongamento do perfil e comparação com CRA e notas comerciais, considerando covenants e custo total", undefinedAspects: ["thesis", "format"]}}, content_fingerprint: "b".repeat(64)},
        plan: {id: ids.plan, version: 2, fingerprint: "d".repeat(64)},
        tasks: steps.map((id, ordinal) => ({id, ordinal, batch: ordinal, label: id, dependencies: [], execution_class: "deterministic", effect: "propose_state", maturity_at_compile: "implemented"})),
        prior_artifacts: [], recent_messages: []}),
      startCapitalTask: async (_job: unknown, task: {taskId: string}) => `run-${task.taskId}`,
      recordCapitalProjectArtifact: async (_job: unknown, artifact: {content: unknown}) => ({id: `00000000-0000-4000-8000-${String(++sequence).padStart(12, "0")}`,
        artifactFingerprint: createHash("sha256").update(JSON.stringify(artifact.content)).digest("hex"), artifactVersion: 1, replayed: false}),
      storeCapitalProjectMaterial: async () => ({objectPath: "x", storageEtag: "e", replayed: false}), finishCapitalTask: async () => "finished",
      syncProjectInformationRequests: async () => ({openCount: 0, preservedClosedCount: 0, supersededCount: 0}),
      completeIntegrationPreviewRun: async () => ({replayed: false}), fail: async () => {},
    } as unknown as QueueClient;
    const job = {claimed: true, job_id: ids.job, capability_token: "c".repeat(64), lease_expires_at: "2026-09-24T18:00:00.000Z", attempt: 1,
      organization_id: ids.organization, intake_session_id: ids.session, processing_run_id: ids.run, integration_preview: true, integration_preview_mode: "live",
      kind: "capital_project_analysis", payload: {analysis_scope: "integration_preview", locale: "pt-BR", capital_project_id: ids.project, capital_project_plan_id: ids.plan,
        capital_project_brief_id: ids.brief, capital_task_ids: steps, capital_artifact_required: true, trigger_event: {type: "advisor_semantic_route", mode: "integration_preview"},
        model_budget: {max_cost_usd: 0.5, max_calls: 4}, preview: {mode: "integration_preview", composition, caseId: "gc01-analista-ib-camil", workflow: preview.previewWorkflowIdentity(composition), premises: {}}}} as unknown as CapitalProjectAnalysisJob;
    const recorded = recorder();
    await processIntegrationPreviewRunJob(job, {queue, log: () => {}, gateway: recorded.gateway, presentationTemplate: undefined as never}).catch(() => undefined);
    const questions = recorded.requests.find((request) => request.task === "preview_questions")!;
    const synthesis = recorded.requests.find((request) => request.task === "preview_synthesis")!;
    const {primary, fallback} = routes(synthesis);
    const [asked, written, writtenByFallback] = [await reserve(questions, routes(questions).primary), await reserve(synthesis, primary), await reserve(synthesis, fallback!)];
    expect(gatewayBudget(job)).toBe(0.5);
    expect(worstAttempt([asked, written])).toBeLessThanOrEqual(gatewayBudget(job));
    expect(worstAttempt([asked, written, writtenByFallback])).toBeLessThanOrEqual(productionModelCeilingsUsd.integrationPreview);
  }, 120_000);
});

describe("a job's largest request above its budget is refused before anything is sent", () => {
  it("refuses the case brief under the old case budget and sends it under the new one", async () => {
    const reconciliation = reconcileCase({archetypeId: "growth_expansion", documents: [], referenceDate: "2026-09-24", locale: "pt",
      candidates: (JSON.parse(readFileSync(resolve(gold, "camil/expected/fields.json"), "utf8")) as Array<Record<string, unknown>>).map((field) => ({
        fieldPath: String(field.fieldPath), normalizedValue: String(field.value), valueType: field.valueType as FactCandidate["valueType"], sourceDocument: "source-1",
        evidenceRank: 1, informationClass: "audited", confidence: 0.99, anchorVerified: true} as FactCandidate))});
    const brief: Request = {task: "case_brief", system: BRIEF_SYSTEM, schemaName: "case_brief", schema: briefAuthoringSchema(reconciliation),
      input: [{type: "text", text: buildBriefInput({archetypeId: "growth_expansion", ...reconciliation, locale: "pt"})}]};
    const sent: AdapterRequest[] = [];
    const adapter: ProviderAdapter = {provider: "anthropic", async complete(request) {
      sent.push(request);
      return {output: {sections: [], executiveSummaryClaimIds: ["x"]}, rawText: "{}", model: request.model, stopReason: "end", usage: {inputTokens: 1, outputTokens: 1, cachedInputTokens: 0}} as AdapterResponse;
    }};
    const caseJob = (maxCostUsd: number) => ({claimed: true, job_id: ids.job, capability_token: "c".repeat(64), lease_expires_at: "2026-09-24T18:00:00.000Z", attempt: 1,
      organization_id: ids.organization, intake_session_id: ids.session, processing_run_id: ids.run, kind: "case_analysis",
      payload: {locale: "pt-BR", execution_mode: "primary", analysis_scope: "full_case", model_budget: {max_cost_usd: maxCostUsd, max_calls: 4}}}) as unknown as ClaimedJob;
    const gatewayFor = (job: ClaimedJob) => createModelGateway({adapters: {anthropic: adapter}, budget: (({maxCostUsd, maxCalls}) => ({maxCostUsd, maxCalls}))(jobModelBudget({job, ...webSearch}))});
    const old = gatewayFor(caseJob(1));
    await expect(old.complete({...brief, allowFallback: false})).rejects.toMatchObject({code: "budget_exceeded"});
    expect(sent).toHaveLength(0);
    expect(old.spent()).toMatchObject({calls: 0, budgetExposureUsd: 0});
    const current = gatewayFor(caseJob(productionRunBudget.case_max_cost_usd));
    await current.complete({...brief, allowFallback: false}).catch(() => undefined);
    expect(sent).toHaveLength(1);
  }, 120_000);
});
