import type {ModelGateway} from "@offroad/model-gateway";
import {describe, expect, it} from "vitest";

import {processCapitalPlanningJob} from "./capital-planning";
import type {CapitalProjectAnalysisJob, QueueClient} from "./queue";

const ids = {
  job: "11111111-1111-4111-8111-111111111111",
  organization: "22222222-2222-4222-8222-222222222222",
  session: "33333333-3333-4333-8333-333333333333",
  run: "44444444-4444-4444-8444-444444444444",
  project: "55555555-5555-4555-8555-555555555555",
  plan: "66666666-6666-4666-8666-666666666666",
  brief: "77777777-7777-4777-8777-777777777777",
  research: "88888888-8888-4888-8888-888888888888",
};

const dependencyMap: Record<string, string[]> = {
  M01: [], M02: [], M03: ["M02"], M04: ["M01", "M02"], M05: ["M02", "M03"], M06: ["M04", "M05"],
  D01: ["M06"], D02: ["D01"], D03: ["D02"], D04: ["D03"], D05: ["D04"], D06: ["D05"], D07: ["D06"],
  C01: ["D06"], C02: ["M01", "M04"], C03: ["D06", "D07"], C04: ["C03"], C05: ["D06"],
  C06: ["D06"], C07: ["C03", "D06"], C08: ["C03", "C05", "C07"],
  C09: ["C01", "C02", "C03", "C04", "C05", "C06", "C07", "C08"], C10: ["C05", "C08", "C09"], C11: ["C09", "C10"],
  S01: ["M02", "C06", "C10"], S02: ["M04", "C10"], S03: ["S02"], S04: ["D06", "C09"],
  S05: ["S01", "S03", "S04"], S06: ["S05"], S07: ["S05", "S06"], S08: ["C08", "S05"],
  S09: ["S05"], S10: ["S07", "S08", "S09"], S11: ["S10", "C11"],
};
const taskIds = Object.keys(dependencyMap);

const job: CapitalProjectAnalysisJob = {
  claimed: true,
  job_id: ids.job,
  capability_token: "c".repeat(64),
  lease_expires_at: "2026-09-02T18:00:00.000Z",
  attempt: 1,
  organization_id: ids.organization,
  intake_session_id: ids.session,
  processing_run_id: ids.run,
  kind: "capital_project_analysis",
  payload: {
    analysis_scope: "capital_planning",
    locale: "pt-BR",
    capital_project_id: ids.project,
    capital_project_plan_id: ids.plan,
    capital_project_brief_id: ids.brief,
    capital_task_ids: taskIds,
    capital_artifact_required: true,
    trigger_event: {},
    model_budget: {max_cost_usd: 0.95, max_calls: 2},
  },
};

describe("capital planning executor", () => {
  it("persists the full bounded DAG and abstains from invented transaction terms", async () => {
    const artifacts: Array<{taskId: string; type: string; status: string; content: unknown}> = [];
    let completed: Record<string, unknown> | undefined;
    const queue = {
      writeStage: async () => {},
      loadCapitalProjectContext: async () => ({
        project: {
          id: ids.project, organization_id: ids.organization, project_name: "Camil capital planning",
          entry_job: "capital_planning", access_basis: "public_information", current_phase: "understand",
        },
        session: {
          id: ids.session, locale: "pt-BR", company_profile: {name: "Camil", website: "https://ri.camil.com.br", geography: "Brasil"},
          privacy_status: "public_information", representation_status: "not_claimed",
        },
        professional_context: {
          useForms: ["institutional_work"],
          professionalRoles: ["cfo", "treasury"],
          practiceAreas: ["treasury", "corporate_finance"],
          primaryObjectives: ["evaluate_capital_options"],
          institutionName: "Rede Horizonte",
          disclosureStatus: "complete",
          lastConfirmedAt: "2026-09-02T11:00:00.000Z",
        },
        institution_capabilities: null,
        brief: {
          id: ids.brief, kind: "capital_planning", version: 1,
          content: {capitalIntent: "Quero comparar alternativas de dívida para financiar crescimento e alongar o perfil."},
          content_fingerprint: "a".repeat(64),
        },
        plan: {id: ids.plan, version: 1, fingerprint: "b".repeat(64), compiler_version: "v-test", registry_version: "v-test"},
        tasks: taskIds.map((taskId, ordinal) => ({
          id: taskId, ordinal, batch: ordinal, dependencies: dependencyMap[taskId],
          execution_class: "deterministic", effect: "propose_state",
        })),
        revision: null,
        dependency_artifacts: [],
      }),
      recordPublicResearch: async () => ids.research,
      startCapitalTask: async (_job: unknown, input: {taskId: string}) => `99999999-9999-4999-8999-${String(artifacts.length + 1).padStart(12, "0")}`,
      recordCapitalProjectArtifact: async (_job: unknown, input: {
        taskRunId: string; artifactType: string; status: string; content: unknown;
      }) => {
        const taskId = taskIds[artifacts.length]!;
        artifacts.push({taskId, type: input.artifactType, status: input.status, content: input.content});
        return {
          id: `aaaaaaaa-aaaa-4aaa-8aaa-${String(artifacts.length).padStart(12, "0")}`,
          artifactFingerprint: String(artifacts.length).padStart(64, "a").slice(-64),
          artifactVersion: 1,
          replayed: false,
        };
      },
      finishCapitalTask: async () => "ok",
      complete: async (_job: unknown, result: unknown) => { completed = result as Record<string, unknown>; },
      fail: async () => { throw new Error("must not fail"); },
    } as unknown as QueueClient;
    const gateway = {
      complete: async (request: Parameters<ModelGateway["complete"]>[0]) => {
        const textInput = request.input.find((part) => part.type === "text");
        if (!textInput || textInput.type !== "text") throw new Error("expected text model input");
        const modelInput = JSON.parse(textInput.text) as {
          professionalContext?: {professionalRoles?: string[]; useForms?: string[]};
          journeyBlueprint?: {id?: string};
          collaborativeAdvisoryPolicy?: {alternativeUniverse?: string; professionalContextUse?: string};
        };
        expect(modelInput.professionalContext).toMatchObject({professionalRoles: ["cfo", "treasury"], useForms: ["institutional_work"]});
        expect(modelInput.journeyBlueprint?.id).toBe("capital_planning");
        expect(modelInput.collaborativeAdvisoryPolicy).toMatchObject({
          alternativeUniverse: "company_first_and_unconstrained",
          professionalContextUse: "prioritize_and_shape_never_suppress",
        });
        return ({
        output: {
          executiveRead: "A necessidade declarada combina crescimento e alongamento. Sem demonstrações reconciliadas, o trabalho compara famílias e identifica o que deve ser comprovado antes de uma estrutura.",
          understoodNeed: {
            objective: "Financiar crescimento e, se economicamente coerente, alongar o perfil de passivos.",
            constraints: [],
            assumptionsToConfirm: ["O volume, o cronograma de usos e o perfil atual da dívida ainda precisam ser confirmados."],
          },
          evidenceCoverage: {
            status: "public_only",
            supported: ["A identidade da companhia e o contexto público foram pesquisados."],
            notYetSupported: ["Não há demonstrações reconciliadas, dívida instrumento a instrumento ou projeções aprovadas."],
          },
          alternatives: [
            {
              id: "alt_capital_markets", family: "capital_markets", title: "Mercado de capitais",
              status: "conditional", fitRationale: "Pode ser uma rota para alongamento e diversificação, condicionada a escala, elegibilidade, disclosure e janela de execução.",
              advantages: ["Pode diversificar as fontes e suportar prazo mais longo."],
              tradeoffs: ["Exige preparação, documentação e uma janela adequada de mercado."],
              prerequisites: ["Confirmar forma societária, escala, histórico financeiro e finalidade dos recursos."],
              disconfirmers: ["Escala insuficiente, urgência incompatível ou restrições documentais podem afastar a rota."],
              sourceUrls: ["https://ri.camil.com.br/public"], evidenceClass: "public_directional",
            },
            {
              id: "alt_private_credit", family: "private_credit", title: "Crédito privado bilateral ou club",
              status: "candidate", fitRationale: "Pode oferecer flexibilidade de estrutura, mas depende de capacidade, proteções, garantias disponíveis e retorno exigido.",
              advantages: ["Permite negociar estrutura e proteções de forma concentrada."],
              tradeoffs: ["Pode exigir proteções mais fortes e retorno superior ao de mercados amplos."],
              prerequisites: ["Mapear capacidade de serviço, garantias e restrições da dívida existente."],
              disconfirmers: ["Capacidade insuficiente ou ausência de mitigantes pode inviabilizar a alternativa."],
              sourceUrls: [], evidenceClass: "user_declared_only",
            },
          ],
          comparison: [
            {dimension: "Velocidade", observations: [{alternativeId: "alt_capital_markets", assessment: "Normalmente requer preparação mais extensa."}, {alternativeId: "alt_private_credit", assessment: "Pode ter processo mais concentrado, sujeito à informação disponível."}]},
            {dimension: "Flexibilidade", observations: [{alternativeId: "alt_capital_markets", assessment: "Depende do rito e da base investidora."}, {alternativeId: "alt_private_credit", assessment: "Pode permitir negociação mais customizada."}]},
            {dimension: "Evidência necessária", observations: [{alternativeId: "alt_capital_markets", assessment: "Exige disclosure e elegibilidade confirmados."}, {alternativeId: "alt_private_credit", assessment: "Exige capacidade, garantias e downside documentados."}]},
          ],
          directionalRecommendation: {
            status: "not_ready", alternativeId: null,
            rationale: "Ainda não há base reconciliada para escolher uma estrutura em vez de outra.",
            conditionsBeforeConfirmation: ["Receber o pacote financeiro, o mapa da dívida, o plano de usos e as projeções."],
          },
          informationRequests: [{
            request: "Demonstrações financeiras e balancete mais recente.",
            whyItMatters: "Permitem reconstruir geração de caixa, liquidez e capacidade.",
            decisionImpact: "Define se há espaço para dívida e quais famílias permanecem comparáveis.",
            acceptableEvidence: ["DFP ou demonstrações auditadas", "balancete e DRE gerencial"],
          }],
          questions: [
            {question: "Qual é o cronograma do uso dos recursos?", whyItMatters: "A urgência muda a rota executável.", answerChanges: "Pode afastar processos longos ou favorecer uma ponte."},
            {question: "Existe intenção de alongar dívida atual junto com o crescimento?", whyItMatters: "Usos mistos mudam sources and uses.", answerChanges: "Pode exigir tranches ou uma solução combinada."},
          ],
          unknowns: ["Volume, prazo, amortização, garantias e capacidade não foram comprovados."],
        },
        provider: "anthropic",
        model: "claude-sonnet-5",
        usage: {inputTokens: 200, outputTokens: 400, cachedInputTokens: 0},
        });
      },
      spent: () => ({costUsd: 0.2, budgetExposureUsd: 0.3, calls: 1}),
    } as unknown as ModelGateway;

    const outcome = await processCapitalPlanningJob(job, {
      queue, gateway, lineage: () => [],
      researchProviders: [{
        id: "official", continueAfterSuccess: false,
        search: async (query) => [{
          provider: "official", topic: query.topic, title: "Fonte pública",
          url: "https://ri.camil.com.br/public", snippet: "Informação pública da companhia.",
          publishedAt: "2026-08-01", retrievedAt: "2026-09-02T12:00:00.000Z",
          contentHash: "c".repeat(64),
        }],
      }],
      now: () => new Date("2026-09-02T12:00:00.000Z"),
    });
    expect(outcome.status).toBe("succeeded");
    expect(artifacts).toHaveLength(taskIds.length);
    expect(artifacts.at(-1)).toMatchObject({taskId: "S11", type: "alternative_map", status: "pending_confirmation"});
    expect(JSON.stringify(artifacts.at(-1)?.content)).not.toMatch(/R\$\s*\d|\d+(?:[.,]\d+)?\s*%/);
    expect(completed).toMatchObject({alternative_map_artifact_id: artifacts.at(-1) ? expect.any(String) : ""});
  });
});
