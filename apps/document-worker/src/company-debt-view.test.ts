import {describe, expect, it} from "vitest";

import type {ModelGateway} from "@offroad/model-gateway";
import type {PublicSearchProvider} from "@offroad/public-research";

import {processCompanyDebtViewJob} from "./company-debt-view";
import type {CapitalProjectAnalysisJob, QueueClient} from "./queue";

const ids = {
  organization: "11111111-1111-4111-8111-111111111111",
  session: "22222222-2222-4222-8222-222222222222",
  run: "33333333-3333-4333-8333-333333333333",
  job: "44444444-4444-4444-8444-444444444444",
  project: "55555555-5555-4555-8555-555555555555",
  plan: "66666666-6666-4666-8666-666666666666",
  brief: "77777777-7777-4777-8777-777777777777",
  research: "88888888-8888-4888-8888-888888888888",
};

const taskDefinitions = [
  ["M01", []], ["M02", []], ["M03", ["M02"]], ["M04", ["M01", "M02"]],
  ["M05", ["M02", "M03"]], ["M06", ["M04", "M05"]],
  ["D01", ["M06"]], ["D02", ["D01"]], ["D03", ["D02"]], ["D04", ["D03"]],
  ["D05", ["D04"]], ["D06", ["D05"]], ["D07", ["D06"]],
  ["C01", ["D06"]], ["C02", ["M01", "M04"]], ["C03", ["D06", "D07"]],
  ["C04", ["C03"]], ["C05", ["D06"]], ["C06", ["D06"]], ["C07", ["C03", "D06"]],
  ["C08", ["C03", "C05", "C07"]],
  ["C09", ["C01", "C02", "C03", "C04", "C05", "C06", "C07", "C08"]],
  ["C10", ["C05", "C08", "C09"]], ["C11", ["C09", "C10"]],
] as const;

const job: CapitalProjectAnalysisJob = {
  claimed: true, job_id: ids.job, capability_token: "c".repeat(64),
  lease_expires_at: "2026-09-01T13:00:00.000Z", attempt: 1,
  organization_id: ids.organization, intake_session_id: ids.session,
  processing_run_id: ids.run, kind: "capital_project_analysis",
  payload: {
    analysis_scope: "company_debt_view", locale: "pt-BR",
    capital_project_id: ids.project, capital_project_plan_id: ids.plan,
    capital_project_brief_id: ids.brief,
    capital_task_ids: taskDefinitions.map(([taskId]) => taskId),
    capital_artifact_required: true, trigger_event: {type: "project_started"},
    model_budget: {max_cost_usd: 0.95, max_calls: 2},
  },
};

function context(overrides: Record<string, unknown> = {}) {
  return {
    project: {id: ids.project, organization_id: ids.organization, project_name: "Projeto Cedro", entry_job: "company_debt_view", access_basis: "public_information", current_phase: "diagnose"},
    session: {id: ids.session, locale: "pt-BR", company_profile: {name: "Cedro Distribuição", website: "https://cedro.example"}, privacy_status: "public_information", representation_status: "not_claimed"},
    brief: {id: ids.brief, kind: "company_debt_view", version: 1, content: {focus: "Compreender riscos, liquidez e flexibilidade financeira."}, content_fingerprint: "b".repeat(64)},
    plan: {id: ids.plan, version: 1, fingerprint: "a".repeat(64), compiler_version: "2026.09.01-v2", registry_version: "2026.09.01-v2"},
    tasks: taskDefinitions.map(([id, dependencies], ordinal) => ({id, ordinal, batch: ordinal, dependencies: [...dependencies], execution_class: id === "C02" ? "research" : "deterministic", effect: "propose_state"})),
    ...overrides,
  };
}

function diagnostic(sourceUrl: string) {
  const signal = (label: string) => ({
    label, observation: "A fonte pública registra um sinal que precisa ser confirmado com documentos da companhia.",
    implication: "O sinal orienta a análise de dívida, mas não permite calcular capacidade ou cobertura.",
    sourceUrls: [sourceUrl], confidence: "medium" as const, claimClass: "reference" as const,
  });
  return {
    executiveRead: "A leitura pública permite enquadrar o negócio e alguns riscos, mas não sustenta cálculos de alavancagem, cobertura, liquidez ou capacidade.",
    companySnapshot: "A companhia atua em distribuição e a evidência pública disponível ainda não confirma seu perímetro financeiro ou a composição da dívida.",
    evidenceCoverage: {publicDataQuality: "partial" as const, whatCanBeAssessed: ["Modelo de negócio e exposição setorial"], criticalMissingInputs: ["Demonstrações financeiras conciliadas", "Mapa da dívida"]},
    businessRiskProfile: {businessModel: "Distribuição empresarial com necessidade de financiar estoque, prazo de clientes e obrigações operacionais.", cashFlowDrivers: ["Volume de vendas e margem bruta"], sensitivities: ["Prazo de recebimento e rotação de estoque"], sourceUrls: [sourceUrl]},
    financialSignals: [signal("Qualidade financeira")],
    debtAndLiquiditySignals: [signal("Dívida e liquidez")],
    workingCapitalSignals: [signal("Capital de giro")],
    risks: [{risk: "Conversão de resultado em caixa ainda não comprovada", evidence: "A fonte pública não oferece conciliação financeira suficiente.", debtRelevance: "A conversão em caixa condiciona serviço da dívida e folga de liquidez.", mitigantsToTest: ["Histórico de fluxo de caixa"], sourceUrls: [sourceUrl], confidence: "medium" as const}],
    capacityAssessment: {status: "not_computable" as const, conclusion: "Não é possível calcular capacidade sem demonstrações conciliadas, mapa da dívida e premissas de caixa.", bindingUnknowns: ["Dívida líquida e cronograma de vencimentos"], requiredInputs: ["Demonstrações financeiras", "Mapa da dívida", "Business plan"]},
    diagnosticHypotheses: [{title: "Pressão de giro a testar", thesis: "O ciclo operacional pode ser uma fonte material de necessidade de capital e deve ser reconstruído.", support: ["Sinal setorial e descrição do modelo de negócio"], disconfirmers: ["Ciclo financeiro curto e caixa estruturalmente positivo"], sourceUrls: [sourceUrl]}],
    informationRequests: [{request: "Demonstrações financeiras e mapa da dívida", whyItMatters: "Permitem reconstruir posição financeira e obrigações.", decisionImpact: "Definem se capacidade e risco podem ser calculados.", acceptableEvidence: ["PDF", "Excel"]}],
    questions: [
      {question: "Como o resultado se converte em caixa?", whyItMatters: "Serviço da dívida depende de caixa disponível.", answerChanges: "Muda capacidade e prazo indicativos."},
      {question: "Qual é o perfil de vencimentos atual?", whyItMatters: "Mostra concentração e pressão de liquidez.", answerChanges: "Muda urgência e alternativas a estudar."},
      {question: "Quais linhas financiam o capital de giro?", whyItMatters: "Evita dupla contagem de liquidez.", answerChanges: "Muda dívida econômica e necessidade incremental."},
    ],
    unknowns: ["Perímetro, dívida, caixa, vencimentos e projeções continuam sem confirmação documental"],
  };
}

function gatewayWith(output: ReturnType<typeof diagnostic>, calls: {count: number}): ModelGateway {
  return {
    complete: (async () => {
      calls.count += 1;
      return {output, provider: "anthropic" as const, model: "claude-sonnet-5", effort: "medium" as const,
        usage: {inputTokens: 1200, outputTokens: 1200, cachedInputTokens: 0}, costUsd: 0.03,
        latencyMs: 900, stopReason: "end" as const, usedFallback: false, fromCassette: false,
        attempts: [{provider: "anthropic" as const, model: "claude-sonnet-5", outcome: "ok" as const}]};
    }) as ModelGateway["complete"],
    spent: () => ({costUsd: calls.count * 0.03, calls: calls.count, unknownCostCalls: 0, budgetExposureUsd: calls.count * 0.04}),
  };
}

function queueFor(input: {loadContext?: () => Promise<unknown>; artifacts: Array<Record<string, unknown>>; completed: Array<Record<string, unknown>>; started: string[]}) {
  let sequence = 0;
  const taskByRun = new Map<string, string>();
  return {
    loadCapitalProjectContext: input.loadContext ?? (async () => context()),
    startCapitalTask: async (_job: CapitalProjectAnalysisJob, task: {taskId: string}) => {
      input.started.push(task.taskId); sequence += 1;
      const id = `00000000-0000-4000-8000-${String(sequence).padStart(12, "0")}`;
      taskByRun.set(id, task.taskId); return id;
    },
    recordCapitalProjectArtifact: async (_job: CapitalProjectAnalysisJob, artifact: Record<string, unknown> & {taskRunId: string}) => {
      const taskId = taskByRun.get(artifact.taskRunId)!;
      input.artifacts.push({...artifact, taskId});
      const ordinal = taskDefinitions.findIndex(([id]) => id === taskId) + 101;
      return {id: `10000000-0000-4000-8000-${String(ordinal).padStart(12, "0")}`, artifactFingerprint: ordinal.toString(16).padStart(64, "0"), artifactVersion: 1, replayed: false};
    },
    finishCapitalTask: async () => {}, recordPublicResearch: async () => ids.research,
    writeStage: async () => {}, complete: async (_job: CapitalProjectAnalysisJob, result: Record<string, unknown>) => { input.completed.push(result); },
    fail: async () => { throw new Error("job should not fail"); },
  } as unknown as QueueClient;
}

describe("company debt view vertical", () => {
  it("runs one synthesis over bounded parallel research and persists the full diagnostic DAG", async () => {
    const sourceUrl = "https://public.example/company";
    const provider: PublicSearchProvider = {id: "perplexity", search: async (query) => [{
      provider: "perplexity", topic: query.topic, title: `Fonte ${query.topic}`, url: sourceUrl,
      snippet: "Informação pública sem valor financeiro usada apenas como sinal.", publishedAt: null,
      retrievedAt: "2026-09-01T12:00:00.000Z", contentHash: query.id,
    }]};
    const artifacts: Array<Record<string, unknown>> = [];
    const completed: Array<Record<string, unknown>> = [];
    const started: string[] = [];
    const calls = {count: 0};
    const result = await processCompanyDebtViewJob(job, {
      queue: queueFor({artifacts, completed, started}), gateway: gatewayWith(diagnostic(sourceUrl), calls),
      lineage: () => [], researchProviders: [provider], now: () => new Date("2026-09-01T12:00:00.000Z"),
    });

    expect(result.status).toBe("succeeded");
    expect(calls.count).toBe(1);
    expect(started).toHaveLength(24);
    expect(new Set(started)).toEqual(new Set(taskDefinitions.map(([id]) => id)));
    const final = artifacts.find((artifact) => artifact.taskId === "C11");
    expect(final).toMatchObject({artifactType: "company_debt_diagnostic", status: "pending_confirmation"});
    expect(final?.dependencies).toHaveLength(2);
    expect(artifacts.find((artifact) => artifact.taskId === "D01")?.content).toMatchObject({status: "not_applicable_public_only", documents: []});
    expect(artifacts.find((artifact) => artifact.taskId === "D03")?.content).toMatchObject({publicSearchSnippetsAreNotExtractedFinancialStatements: true});
    expect(artifacts.find((artifact) => artifact.taskId === "C03")?.content).toMatchObject({status: "not_computable_from_public_snippets"});
    expect(completed[0]).toMatchObject({spend: {externalSearchCostExposureUsd: 0.04}});
  });

  it("abstains without spending a model call when public research returns no source", async () => {
    const artifacts: Array<Record<string, unknown>> = [];
    const completed: Array<Record<string, unknown>> = [];
    const started: string[] = [];
    const calls = {count: 0};
    const result = await processCompanyDebtViewJob(job, {
      queue: queueFor({artifacts, completed, started}), gateway: gatewayWith(diagnostic("https://unused.example"), calls),
      lineage: () => [], researchProviders: [], now: () => new Date("2026-09-01T12:00:00.000Z"),
    });

    expect(result.status).toBe("succeeded");
    expect(calls.count).toBe(0);
    const final = artifacts.find((artifact) => artifact.taskId === "C11");
    expect(final?.content).toMatchObject({researchStatus: "abstained", provenance: {provider: "deterministic", model: "none"}, capacityAssessment: {status: "not_computable"}});
  });

  it("treats non-HTTPS search results as unusable and abstains before model synthesis", async () => {
    const artifacts: Array<Record<string, unknown>> = [];
    const completed: Array<Record<string, unknown>> = [];
    const started: string[] = [];
    const calls = {count: 0};
    const provider: PublicSearchProvider = {id: "perplexity", search: async (query) => [{
      provider: "perplexity", topic: query.topic, title: "Fonte insegura", url: "http://public.example/company",
      snippet: "Resultado sem transporte seguro.", publishedAt: null,
      retrievedAt: "2026-09-01T12:00:00.000Z", contentHash: query.id,
    }]};
    await processCompanyDebtViewJob(job, {
      queue: queueFor({artifacts, completed, started}), gateway: gatewayWith(diagnostic("https://unused.example"), calls),
      lineage: () => [], researchProviders: [provider], now: () => new Date("2026-09-01T12:00:00.000Z"),
    });

    expect(calls.count).toBe(0);
    expect(artifacts.find((artifact) => artifact.taskId === "C11")?.content).toMatchObject({researchStatus: "abstained"});
  });

  it("revises only the final diagnostic and reuses C09 and C10 without another search", async () => {
    const sourceUrl = "https://public.example/company";
    const priorDiagnostic = diagnostic(sourceUrl);
    priorDiagnostic.companySnapshot = "A fonte pública registra R$ 10 milhões, sem permitir concluir capacidade ou reconciliar a posição financeira.";
    const prior = {schemaVersion: "company-debt-diagnostic.v1", asOfDate: "2026-09-01", company: {name: "Cedro Distribuição", website: "https://cedro.example"}, ...priorDiagnostic, sources: [{title: "Fonte", url: sourceUrl, topic: "identity", publishedAt: null, provider: "perplexity"}], researchStatus: "succeeded", scopeBoundary: "Diagnóstico público preliminar, sem underwriting ou capacidade calculada.", provenance: {provider: "anthropic", model: "claude-sonnet-5", executorVersion: "2026.09.01-v1"}};
    const revisionJob: CapitalProjectAnalysisJob = {...job, job_id: "99999999-9999-4999-8999-999999999999", payload: {...job.payload, capital_task_ids: ["C11"], revision_of_artifact_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", correction_decision_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", model_budget: {max_cost_usd: 0.85, max_calls: 1}}};
    const loadContext = async () => context({
      revision: {of_artifact_id: revisionJob.payload.revision_of_artifact_id, prior_content: prior, decision_id: revisionJob.payload.correction_decision_id, correction_note: "Deixar explícito que o capital de giro ainda não foi conciliado."},
      dependency_artifacts: ["C09", "C10"].map((taskId, index) => ({task_id: taskId, id: `20000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`, artifact_fingerprint: String(index + 1).repeat(64), content: {status: "preserved"}, evidence_refs: [{sourceType: "public_research_run", sourceId: ids.research}]})),
    });
    const artifacts: Array<Record<string, unknown>> = [];
    const completed: Array<Record<string, unknown>> = [];
    const started: string[] = [];
    const calls = {count: 0};
    const revisedDiagnostic = diagnostic(sourceUrl);
    revisedDiagnostic.companySnapshot = priorDiagnostic.companySnapshot;
    const result = await processCompanyDebtViewJob(revisionJob, {
      queue: queueFor({loadContext, artifacts, completed, started}), gateway: gatewayWith(revisedDiagnostic, calls),
      lineage: () => [], researchProviders: [{id: "perplexity", search: async () => { throw new Error("revision must not search"); }}],
      now: () => new Date("2026-09-01T14:00:00.000Z"),
    });

    expect(result.status).toBe("succeeded");
    expect(started).toEqual(["C11"]);
    expect(calls.count).toBe(1);
    expect(artifacts[0]?.dependencies).toHaveLength(2);
    expect(completed[0]).toMatchObject({revision_of_artifact_id: revisionJob.payload.revision_of_artifact_id, spend: {externalSearchCostExposureUsd: 0}});
  });
});
