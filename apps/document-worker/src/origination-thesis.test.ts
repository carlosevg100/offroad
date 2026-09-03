import {describe, expect, it} from "vitest";

import type {ModelGateway} from "@offroad/model-gateway";
import type {PublicSearchProvider} from "@offroad/public-research";

import {processOriginationThesisJob} from "./origination-thesis";
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
  {id: "M01", dependencies: []},
  {id: "M02", dependencies: []},
  {id: "M03", dependencies: ["M02"]},
  {id: "M04", dependencies: ["M01", "M02"]},
  {id: "M05", dependencies: ["M02", "M03"]},
  {id: "M06", dependencies: ["M04", "M05"]},
  {id: "M07", dependencies: ["M06", "C02", "K04"]},
  {id: "C02", dependencies: ["M01", "M04"]},
  {id: "K04", dependencies: ["M01", "M04"]},
] as const;

const job: CapitalProjectAnalysisJob = {
  claimed: true,
  job_id: ids.job,
  capability_token: "c".repeat(64),
  lease_expires_at: "2026-09-01T13:00:00.000Z",
  attempt: 1,
  organization_id: ids.organization,
  intake_session_id: ids.session,
  processing_run_id: ids.run,
  kind: "capital_project_analysis",
  payload: {
    analysis_scope: "origination_thesis",
    locale: "pt-BR",
    capital_project_id: ids.project,
    capital_project_plan_id: ids.plan,
    capital_project_brief_id: ids.brief,
    capital_task_ids: taskDefinitions.map((task) => task.id),
    capital_artifact_required: true,
    trigger_event: {type: "project_started"},
    model_budget: {max_cost_usd: 0.75, max_calls: 2},
  },
};

describe("origination thesis vertical", () => {
  it("runs bounded public research, persists every TaskSpec output and leaves the brief pending confirmation", async () => {
    const recordedArtifacts: Array<{taskId: string; artifactType: string; status: string; dependencies: unknown[]}> = [];
    const completed: unknown[] = [];
    let taskRunSequence = 0;
    const taskByRun = new Map<string, string>();

    const queue = {
      loadCapitalProjectContext: async () => ({
        project: {
          id: ids.project,
          organization_id: ids.organization,
          project_name: "Projeto Aurora",
          entry_job: "origination_thesis",
          access_basis: "public_information",
          current_phase: "understand",
        },
        session: {
          id: ids.session,
          locale: "pt-BR",
          company_profile: {name: "Aurora Logística", website: "https://aurora.example"},
          privacy_status: "public_information",
          representation_status: "not_claimed",
        },
        professional_context: {
          affiliationKind: "bank",
          professionalRole: "dcm_banker",
          teamName: "DCM",
          institutionName: "Banco Farol",
          operatingModels: ["structuring", "distribution"],
          productFamilies: ["bilateral_credit", "capital_markets"],
          primaryObjectives: ["prepare_meetings", "originate_ideas"],
          contextNotes: null,
          disclosureStatus: "complete",
          lastConfirmedAt: "2026-09-01T11:00:00.000Z",
        },
        institution_capabilities: {
          institutionName: "Banco Farol",
          institutionKind: "bank",
          operatingModels: ["balance_sheet_lending", "structuring", "distribution"],
          productFamilies: ["bilateral_credit", "capital_markets"],
          geographies: ["BR"],
          currencies: ["BRL"],
          capabilityNotes: "A instituição estrutura, distribui e pode considerar uso de balanço.",
          sourceKind: "self_declared",
          disclosureStatus: "complete",
          lastConfirmedAt: "2026-09-01T11:00:00.000Z",
        },
        brief: {
          id: ids.brief,
          kind: "origination_thesis",
          version: 1,
          content: {
            meetingContext: "Reunião exploratória para compreender prioridades de dívida da companhia.",
            audience: "Diretoria financeira",
          },
          content_fingerprint: "b".repeat(64),
        },
        plan: {
          id: ids.plan,
          version: 1,
          fingerprint: "a".repeat(64),
          compiler_version: "2026.09.01-v2",
          registry_version: "2026.09.01-v2",
        },
        tasks: taskDefinitions.map((task, ordinal) => ({
          id: task.id,
          ordinal,
          batch: ordinal,
          dependencies: [...task.dependencies],
          execution_class: task.id === "C02" || task.id === "K04" ? "research" : "deterministic",
          effect: "propose_state",
        })),
      }),
      startCapitalTask: async (_job: CapitalProjectAnalysisJob, input: {taskId: string}) => {
        taskRunSequence += 1;
        const runId = `00000000-0000-4000-8000-${String(taskRunSequence).padStart(12, "0")}`;
        taskByRun.set(runId, input.taskId);
        return runId;
      },
      recordCapitalProjectArtifact: async (_job: CapitalProjectAnalysisJob, input: {
        taskRunId: string; artifactType: string; status: string; dependencies?: unknown[];
      }) => {
        const taskId = taskByRun.get(input.taskRunId)!;
        recordedArtifacts.push({
          taskId,
          artifactType: input.artifactType,
          status: input.status,
          dependencies: input.dependencies ?? [],
        });
        const ordinal = taskDefinitions.findIndex((task) => task.id === taskId) + 101;
        return {
          id: `00000000-0000-4000-8000-${String(ordinal).padStart(12, "0")}`,
          artifactFingerprint: ordinal.toString(16).padStart(64, "0"),
          artifactVersion: 1,
          replayed: false,
        };
      },
      finishCapitalTask: async (_job: CapitalProjectAnalysisJob, input: {taskRunId: string}) => input.taskRunId,
      recordPublicResearch: async () => ids.research,
      writeStage: async () => {},
      complete: async (_job: CapitalProjectAnalysisJob, result: unknown) => { completed.push(result); },
      fail: async () => { throw new Error("job should not fail"); },
    } as unknown as QueueClient;

    const researchProvider: PublicSearchProvider = {
      id: "perplexity",
      search: async (query) => [{
        provider: "perplexity",
        topic: query.topic,
        title: `Fonte ${query.topic}`,
        url: `https://public.example/${query.id}`,
        snippet: "Informação pública recuperada para a lente de dívida.",
        publishedAt: null,
        retrievedAt: "2026-09-01T12:00:00.000Z",
        contentHash: query.id,
      }],
    };
    const sourceUrl = "https://public.example/allowed";
    let acquiredPages = 0;
    const gateway: ModelGateway = {
      complete: (async (request) => {
        const textInput = request.input.find((part) => part.type === "text");
        if (!textInput || textInput.type !== "text") throw new Error("expected text model input");
        const modelInput = JSON.parse(textInput.text) as {
          allowedMaterialNumericTokens?: string[];
          professionalContext?: {professionalRole?: string; institutionName?: string};
          journeyBlueprint?: {id?: string};
          collaborativeAdvisoryPolicy?: {alternativeUniverse?: string; professionalContextUse?: string};
        };
        expect(modelInput.allowedMaterialNumericTokens).toContain("r$1,0");
        expect(modelInput.allowedMaterialNumericTokens).not.toContain("24meses");
        expect(modelInput.professionalContext).toMatchObject({professionalRole: "dcm_banker", institutionName: "Banco Farol"});
        expect(modelInput.journeyBlueprint?.id).toBe("origination_thesis");
        expect(modelInput.collaborativeAdvisoryPolicy).toMatchObject({
          alternativeUniverse: "company_first_and_unconstrained",
          professionalContextUse: "prioritize_and_shape_never_suppress",
        });
        expect(JSON.stringify(modelInput)).toContain("CONTEUDO_APROFUNDADO");
        return {
        output: {
          executiveRead: "A companhia apresenta uma emissão pública de R$1,0 e sinais que merecem uma conversa dirigida sobre flexibilidade financeira e prioridades de capital.",
          companySnapshot: "A leitura pública identifica a atividade operacional, mas ainda não confirma números privados, perímetro ou intenção de financiamento.",
          debtLensSignals: [{
            finding: "A companhia divulga informações operacionais relevantes para preparar a reunião.",
            relevance: "Esses sinais ajudam a formular perguntas sem transformar hipótese em conclusão.",
            sourceUrls: [sourceUrl],
            confidence: "medium" as const,
          }],
          financingAngles: [{
            title: "Flexibilidade do balanço",
            route: "Alternativas de dívida a investigar",
            rationale: "A reunião deve esclarecer prioridades de capital antes de desenhar qualquer estrutura indicativa.",
            sourceUrls: [sourceUrl],
            prerequisites: ["Confirmar dívida atual e cronograma de vencimentos."],
            disconfirmers: ["Ausência de necessidade de capital ou restrições incompatíveis."],
          }],
          meetingQuestions: [
            {question: "Quais prioridades de capital orientam a companhia?", whyItMatters: "Define o problema financeiro antes do instrumento.", answerChanges: "Muda o universo de alternativas a aprofundar."},
            {question: "Como está organizado o perfil de vencimentos?", whyItMatters: "Mostra pressões e flexibilidade no horizonte relevante.", answerChanges: "Muda a necessidade de refinanciamento e o prazo a estudar."},
            {question: "Quais restrições precisam ser preservadas?", whyItMatters: "Evita sugerir estruturas incompatíveis com a companhia.", answerChanges: "Muda garantias, covenants e alternativas possíveis."},
          ],
          unknowns: ["Dívida econômica, liquidez, projeções e intenção de capital ainda não foram confirmadas."],
          suggestedOpening: "Preparamos uma leitura exclusivamente pública para testar prioridades e identificar quais alternativas merecem aprofundamento com a companhia.",
        },
        provider: "anthropic" as const,
        model: "claude-sonnet-5",
        effort: "medium" as const,
        usage: {inputTokens: 1_000, outputTokens: 1_000, cachedInputTokens: 0},
        costUsd: 0.02,
        latencyMs: 800,
        stopReason: "end" as const,
        usedFallback: false,
        fromCassette: false,
        attempts: [{provider: "anthropic" as const, model: "claude-sonnet-5", outcome: "ok" as const}],
      }}) as ModelGateway["complete"],
      spent: () => ({costUsd: 0.02, calls: 1, unknownCostCalls: 0, budgetExposureUsd: 0.03}),
    };

    // The processor accepts only persisted URLs. Make the one URL emitted by the model equal to
    // an actual search result while keeping the search provider independent per query.
    researchProvider.search = async (query) => [{
      provider: "perplexity",
      topic: query.topic,
      title: `Fonte ${query.topic}`,
      url: sourceUrl,
      snippet: "Informação pública recuperada para a lente de dívida, incluindo uma emissão de R$ 1,0.",
      publishedAt: null,
      retrievedAt: "2026-09-01T12:00:00.000Z",
      contentHash: query.id,
    }];

    const result = await processOriginationThesisJob(job, {
      queue,
      gateway,
      lineage: () => [],
      researchProviders: [researchProvider],
      contentAcquirer: async ({url}) => {
        acquiredPages += 1;
        return {
          lineage: {
            sourceUrl: url, finalUrl: url, publisherSourceId: null, publisherAuthorityTier: null,
            acquiredBy: "firecrawl", retrievedAt: "2026-09-01T12:00:00.000Z",
            contentType: "text/markdown", byteSize: 200, contentHash: "f".repeat(64),
          },
          content: `CONTEUDO_APROFUNDADO ${"sobre companhia, dívida e desempenho. ".repeat(4)}`,
        };
      },
      now: () => new Date("2026-09-01T12:00:00.000Z"),
    });

    expect(result.status).toBe("succeeded");
    expect(recordedArtifacts.map((artifact) => artifact.taskId)).toHaveLength(9);
    expect(new Set(recordedArtifacts.map((artifact) => artifact.taskId))).toEqual(new Set(taskDefinitions.map((task) => task.id)));
    const meetingBrief = recordedArtifacts.find((artifact) => artifact.taskId === "M07");
    expect(meetingBrief).toMatchObject({artifactType: "meeting_brief", status: "pending_confirmation"});
    expect(meetingBrief?.dependencies).toHaveLength(3);
    expect(completed).toHaveLength(1);
    expect(acquiredPages).toBe(1);
  });

  it("fails closed when the persisted final TaskSpec does not consume the research outputs", async () => {
    let failedCode = "";
    const queue = {
      writeStage: async () => {},
      loadCapitalProjectContext: async () => ({
        project: {id: ids.project, organization_id: ids.organization, project_name: "Projeto", entry_job: "origination_thesis", access_basis: "public_information", current_phase: "understand"},
        session: {id: ids.session, locale: "pt-BR", company_profile: {name: "Companhia"}, privacy_status: "public_information", representation_status: "not_claimed"},
        brief: {id: ids.brief, kind: "origination_thesis", version: 1, content: {meetingContext: "Contexto público suficiente para a reunião."}, content_fingerprint: "b".repeat(64)},
        plan: {id: ids.plan, version: 1, fingerprint: "a".repeat(64), compiler_version: "version-2", registry_version: "version-2"},
        tasks: taskDefinitions.map((task, ordinal) => ({...task, ordinal, batch: ordinal, execution_class: "deterministic", effect: "propose_state"})).map((task) => task.id === "M07" ? {...task, dependencies: ["M06"]} : task),
      }),
      fail: async (_job: CapitalProjectAnalysisJob, error: {code: string}) => { failedCode = error.code; },
    } as unknown as QueueClient;

    const result = await processOriginationThesisJob(job, {
      queue,
      gateway: {complete: async () => { throw new Error("unreachable"); }, spent: () => ({costUsd: 0, calls: 0, unknownCostCalls: 0, budgetExposureUsd: 0})},
      lineage: () => [],
      researchProviders: [],
    });

    expect(result.status).toBe("failed");
    expect(failedCode).toBe("origination_task_dependencies_invalid");
  });

  it("revises only M07 and reuses the governed research artifacts without another search", async () => {
    const priorArtifactId = "99999999-9999-4999-8999-999999999999";
    const decisionId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const revisionJob: CapitalProjectAnalysisJob = {
      ...job,
      job_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      processing_run_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      payload: {
        ...job.payload,
        capital_task_ids: ["M07"],
        revision_of_artifact_id: priorArtifactId,
        correction_decision_id: decisionId,
        trigger_event: {type: "artifact_correction_requested"},
        model_budget: {max_cost_usd: 0.70, max_calls: 1},
      },
    };
    const sourceUrl = "https://public.example/reused";
    const source = {
      provider: "perplexity",
      topic: "sector",
      title: "Fonte pública preservada",
      url: sourceUrl,
      snippet: "Fonte já recuperada e registrada no primeiro processamento.",
      publishedAt: null,
      retrievedAt: "2026-09-01T12:00:00.000Z",
      contentHash: "d".repeat(64),
    };
    const startedTasks: string[] = [];
    const completed: Array<Record<string, unknown>> = [];
    const recordedArtifacts: Array<{taskId: string; dependencies: unknown[]}> = [];
    let modelCalls = 0;

    const queue = {
      loadCapitalProjectContext: async () => ({
        project: {id: ids.project, organization_id: ids.organization, project_name: "Projeto Aurora", entry_job: "origination_thesis", access_basis: "public_information", current_phase: "understand"},
        session: {id: ids.session, locale: "pt-BR", company_profile: {name: "Aurora Logística", website: "https://aurora.example"}, privacy_status: "public_information", representation_status: "not_claimed"},
        brief: {id: ids.brief, kind: "origination_thesis", version: 1, content: {meetingContext: "Reunião exploratória para compreender prioridades de dívida da companhia."}, content_fingerprint: "b".repeat(64)},
        plan: {id: ids.plan, version: 1, fingerprint: "a".repeat(64), compiler_version: "2026.09.01-v2", registry_version: "2026.09.01-v2"},
        tasks: taskDefinitions.map((task, ordinal) => ({id: task.id, ordinal, batch: ordinal, dependencies: [...task.dependencies], execution_class: task.id === "C02" || task.id === "K04" ? "research" : "deterministic", effect: "propose_state"})),
        revision: {
          of_artifact_id: priorArtifactId,
          prior_content: {executiveRead: "Versão anterior a corrigir."},
          decision_id: decisionId,
          correction_note: "A hipótese de refinanciamento não reflete a conversa; enfatizar capital de giro.",
        },
        dependency_artifacts: [
          {task_id: "M06", id: "00000000-0000-4000-8000-000000000106", artifact_fingerprint: "1".repeat(64), content: {planId: ids.plan}, evidence_refs: []},
          {task_id: "C02", id: "00000000-0000-4000-8000-000000000107", artifact_fingerprint: "2".repeat(64), content: {status: "succeeded", researchRunId: ids.research, sources: [source], failures: []}, evidence_refs: []},
          {task_id: "K04", id: "00000000-0000-4000-8000-000000000108", artifact_fingerprint: "3".repeat(64), content: {status: "succeeded", researchRunId: ids.research, sources: [], failures: []}, evidence_refs: []},
        ],
      }),
      startCapitalTask: async (_job: CapitalProjectAnalysisJob, input: {taskId: string}) => {
        startedTasks.push(input.taskId);
        return "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
      },
      recordCapitalProjectArtifact: async (_job: CapitalProjectAnalysisJob, input: {dependencies?: unknown[]}) => {
        recordedArtifacts.push({taskId: "M07", dependencies: input.dependencies ?? []});
        return {id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", artifactFingerprint: "4".repeat(64), artifactVersion: 2, replayed: false};
      },
      finishCapitalTask: async () => {},
      recordPublicResearch: async () => { throw new Error("revision must not run public research"); },
      writeStage: async () => {},
      complete: async (_job: CapitalProjectAnalysisJob, result: Record<string, unknown>) => { completed.push(result); },
      fail: async () => { throw new Error("job should not fail"); },
    } as unknown as QueueClient;
    const gateway: ModelGateway = {
      complete: (async () => {
        modelCalls += 1;
        return {
          output: {
            executiveRead: "A conversa deve priorizar a dinâmica de capital de giro, mantendo qualquer alternativa como hipótese condicionada a dados privados.",
            companySnapshot: "As fontes públicas ajudam a entender a atividade, mas não confirmam dívida, liquidez ou intenção de captação.",
            debtLensSignals: [{finding: "Há sinais operacionais públicos úteis para preparar a reunião.", relevance: "Eles orientam perguntas sem substituir dados privados.", sourceUrls: [sourceUrl], confidence: "medium" as const}],
            financingAngles: [{title: "Capital de giro", route: "Alternativas a investigar", rationale: "A correção do usuário pede que a conversa teste primeiro a necessidade de giro.", sourceUrls: [sourceUrl], prerequisites: ["Confirmar ciclo financeiro e sazonalidade."], disconfirmers: ["Ausência de necessidade de giro."]}],
            meetingQuestions: [
              {question: "Como evoluiu o ciclo financeiro?", whyItMatters: "Dimensiona a necessidade de giro.", answerChanges: "Muda volume e desenho a estudar."},
              {question: "Quais fontes já financiam o giro?", whyItMatters: "Evita sobreposição.", answerChanges: "Muda a alternativa incremental."},
              {question: "Existe sazonalidade relevante?", whyItMatters: "Afeta disponibilidade e amortização.", answerChanges: "Muda prazo e perfil de uso."},
            ],
            unknowns: ["Dados privados de dívida, liquidez e giro permanecem não confirmados."],
            suggestedOpening: "A leitura foi ajustada para testar primeiro a dinâmica de capital de giro.",
          },
          provider: "anthropic" as const, model: "claude-sonnet-5", effort: "medium" as const,
          usage: {inputTokens: 800, outputTokens: 700, cachedInputTokens: 0}, costUsd: 0.015,
          latencyMs: 600, stopReason: "end" as const, usedFallback: false, fromCassette: false,
          attempts: [{provider: "anthropic" as const, model: "claude-sonnet-5", outcome: "ok" as const}],
        };
      }) as ModelGateway["complete"],
      spent: () => ({costUsd: 0.015, calls: 1, unknownCostCalls: 0, budgetExposureUsd: 0.02}),
    };

    const result = await processOriginationThesisJob(revisionJob, {
      queue,
      gateway,
      lineage: () => [],
      researchProviders: [{id: "perplexity", search: async () => { throw new Error("revision must not search"); }}],
      now: () => new Date("2026-09-01T14:00:00.000Z"),
    });

    expect(result.status).toBe("succeeded");
    expect(startedTasks).toEqual(["M07"]);
    expect(modelCalls).toBe(1);
    expect(recordedArtifacts).toEqual([{taskId: "M07", dependencies: expect.arrayContaining([
      expect.objectContaining({artifactId: "00000000-0000-4000-8000-000000000106"}),
      expect.objectContaining({artifactId: "00000000-0000-4000-8000-000000000107"}),
      expect.objectContaining({artifactId: "00000000-0000-4000-8000-000000000108"}),
    ])}]);
    expect(completed).toHaveLength(1);
    expect(completed[0]).toMatchObject({
      revision_of_artifact_id: priorArtifactId,
      correction_decision_id: decisionId,
      spend: {externalSearchCostExposureUsd: 0},
    });
  });

  it("resumes a failed first run from proven artifacts and retries only M07 without another search", async () => {
    const sourceUrl = "https://public.example/resumed";
    const source = {
      provider: "openai" as const,
      topic: "sector" as const,
      title: "Fonte pública preservada",
      url: sourceUrl,
      snippet: "Sinal público preservado da primeira tentativa.",
      publishedAt: null,
      retrievedAt: "2026-09-01T12:00:00.000Z",
      contentHash: "d".repeat(64),
    };
    const completedArtifacts = taskDefinitions
      .filter((task) => task.id !== "M07")
      .map((task, ordinal) => ({
        task_id: task.id,
        id: `10000000-0000-4000-8000-${String(ordinal + 1).padStart(12, "0")}`,
        artifact_fingerprint: String(ordinal + 1).repeat(64).slice(0, 64),
        content: task.id === "C02"
          ? {status: "partial", researchRunId: ids.research, sources: [source], failures: [{queryId: "q", provider: "official", code: "archive_unavailable"}]}
          : task.id === "K04"
            ? {status: "partial", researchRunId: ids.research, sources: [], failures: []}
            : {taskId: task.id},
        evidence_refs: [],
      }));
    const startedTasks: string[] = [];
    let publicResearchCalls = 0;
    let completedJobs = 0;
    const queue = {
      loadCapitalProjectContext: async () => ({
        project: {id: ids.project, organization_id: ids.organization, project_name: "Projeto Aurora", entry_job: "origination_thesis", access_basis: "public_information", current_phase: "understand"},
        session: {id: ids.session, locale: "pt-BR", company_profile: {name: "Aurora Logística"}, privacy_status: "public_information", representation_status: "not_claimed"},
        brief: {id: ids.brief, kind: "origination_thesis", version: 1, content: {meetingContext: "Reunião pública sobre alternativas de dívida."}, content_fingerprint: "b".repeat(64)},
        plan: {id: ids.plan, version: 1, fingerprint: "a".repeat(64), compiler_version: "2026.09.01-v2", registry_version: "2026.09.01-v2"},
        tasks: taskDefinitions.map((task, ordinal) => ({id: task.id, ordinal, batch: ordinal, dependencies: [...task.dependencies], execution_class: "deterministic", effect: "propose_state"})),
        completed_artifacts: completedArtifacts,
      }),
      startCapitalTask: async (_job: CapitalProjectAnalysisJob, input: {taskId: string}) => {
        startedTasks.push(input.taskId);
        return "20000000-0000-4000-8000-000000000001";
      },
      recordCapitalProjectArtifact: async () => ({
        id: "30000000-0000-4000-8000-000000000001",
        artifactFingerprint: "e".repeat(64), artifactVersion: 1, replayed: false,
      }),
      finishCapitalTask: async () => {},
      recordPublicResearch: async () => {
        publicResearchCalls += 1;
        throw new Error("a resumed M07 must not repeat public research");
      },
      writeStage: async () => {},
      complete: async () => { completedJobs += 1; },
      fail: async () => { throw new Error("resumed job should not fail"); },
    } as unknown as QueueClient;
    const gateway = {
      complete: async () => ({
        output: {
          executiveRead: "A leitura pública orienta uma conversa sobre flexibilidade financeira sem presumir intenção de captação.",
          companySnapshot: "As fontes públicas permitem preparar perguntas, mas não substituem dados privados da companhia.",
          debtLensSignals: [{finding: "Existe informação pública útil para a conversa.", relevance: "O sinal orienta a agenda.", sourceUrls: [sourceUrl], confidence: "medium" as const}],
          financingAngles: [{title: "Flexibilidade financeira", route: "Hipótese a investigar", rationale: "A reunião deve testar a prioridade da companhia.", sourceUrls: [sourceUrl], prerequisites: ["Confirmar dívida e liquidez."], disconfirmers: ["Ausência de necessidade de capital."]}],
          meetingQuestions: [
            {question: "Qual é a prioridade de capital?", whyItMatters: "Define o problema.", answerChanges: "Muda as rotas."},
            {question: "Como está o perfil de dívida?", whyItMatters: "Define pressões.", answerChanges: "Muda prazo e instrumento."},
            {question: "Quais restrições devem ser preservadas?", whyItMatters: "Evita alternativas incompatíveis.", answerChanges: "Muda garantias e covenants."},
          ],
          unknowns: ["Dívida, liquidez e intenção permanecem não confirmadas."],
          suggestedOpening: "Preparamos uma leitura pública para testar prioridades de dívida.",
        },
        provider: "anthropic" as const, model: "claude-sonnet-5", effort: "medium" as const,
        usage: {inputTokens: 600, outputTokens: 500, cachedInputTokens: 0}, costUsd: 0.01,
        latencyMs: 500, stopReason: "end" as const, usedFallback: false, fromCassette: false,
        attempts: [{provider: "anthropic" as const, model: "claude-sonnet-5", outcome: "ok" as const}],
      }),
      spent: () => ({costUsd: 0.01, calls: 1, unknownCostCalls: 0, budgetExposureUsd: 0.02}),
    } as unknown as ModelGateway;

    const result = await processOriginationThesisJob(job, {
      queue, gateway, lineage: () => [],
      researchProviders: [{id: "openai", search: async () => { throw new Error("must not search"); }}],
      now: () => new Date("2026-09-01T14:00:00.000Z"),
    });

    expect(result.status).toBe("succeeded");
    expect(startedTasks).toEqual(["M07"]);
    expect(publicResearchCalls).toBe(0);
    expect(completedJobs).toBe(1);
  });
});
