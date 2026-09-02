import type {ModelGateway, GatewayCallLog} from "@offroad/model-gateway";
import {caseStageIds} from "@offroad/case-runner";
import {parseDocument} from "@offroad/document-parsers";
import {diversifiedReceivablesCase} from "@offroad/receivables-analysis";
import {describe, expect, it} from "vitest";

import {caseAnalysisExecutionPlan, processCaseAnalysisJob, researchSubjectFromDeclaration} from "./case-analysis";
import type {CaseAnalysisJob, QueueClient} from "./queue";
import {documentEvidence, encodeReceivablesEvidence} from "./receivables-evidence";

const job: CaseAnalysisJob = {
  claimed: true,
  job_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  capability_token: "c".repeat(64),
  lease_expires_at: "2026-08-24T18:00:00.000Z",
  attempt: 1,
  kind: "case_analysis",
  organization_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  intake_session_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  processing_run_id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  payload: {locale: "pt-BR", execution_mode: "primary", analysis_scope: "full_case"},
};

const invocation: GatewayCallLog = {
  invocationId: "invocation-1",
  task: "case_brief",
  provider: "anthropic",
  model: "claude-sonnet-5",
  effort: "high",
  outcome: "ok",
  promptFingerprint: "a".repeat(64),
  inputFingerprint: "b".repeat(64),
  outputFingerprint: "c".repeat(64),
  usage: {inputTokens: 100, outputTokens: 20, cachedInputTokens: 0},
  costUsd: 0.1,
  costStatus: "measured",
  latencyMs: 10,
  stopReason: "end",
  usedFallback: false,
  fromCassette: false,
  schemaName: "case_brief",
};

function structureProposalFromRequest(request: {
  input?: Array<{type: string; text?: string}>;
}) {
  const text = request.input?.find((item) => item.type === "text")?.text ?? "";
  const payload = JSON.parse(text.slice(text.lastIndexOf("\n\n") + 2)) as {
    asOf: string;
    deterministicBaseStructure: {
      amount: string | null;
      termMonths: number | null;
      graceMonths: number | null;
      amortizationFormat: string | null;
    };
    eligibleInstruments: Array<{id: string; route: string; buyers: string[]}>;
    allowedBasisIds: string[];
  };
  const instrument = payload.eligibleInstruments[0]!;
  const amount = payload.deterministicBaseStructure.amount ?? "40000000";
  const basisId = payload.allowedBasisIds.includes("transaction.requested_amount")
    ? "transaction.requested_amount"
    : payload.allowedBasisIds[0]!;
  return {
    alternatives: [{
      id: `${instrument.id}-base`,
      label: "Estrutura indicativa base",
      instrument: instrument.id,
      route: instrument.route,
      amount,
      currency: "BRL",
      termMonths: payload.deterministicBaseStructure.termMonths ?? 48,
      graceMonths: payload.deterministicBaseStructure.graceMonths ?? 6,
      amortization: payload.deterministicBaseStructure.amortizationFormat ?? "sac",
      indexer: "CDI",
      targetBuyer: instrument.buyers[0] ?? null,
      rationale: "A estrutura respeita a capacidade calculada e o uso declarado dos recursos.",
      pros: ["Compatível com o envelope de capacidade calculado."],
      cons: ["Condições finais dependem da análise do financiador."],
      assumptions: ["Estrutura indicativa sujeita à confirmação das informações."],
      sources: [{
        id: "new-debt",
        label: "Nova dívida",
        amount,
        origin: "proposal",
        basisIds: [basisId],
        condition: "proposed",
      }],
      uses: [{
        id: "declared-use",
        label: "Uso declarado dos recursos",
        amount,
        origin: "company_input",
        basisIds: [basisId],
        condition: "available",
      }],
      security: [],
      covenants: [],
      conditionsPrecedent: [],
      implementationDays: null,
      basisIds: [basisId],
    }],
    recommendation: {
      alternativeId: `${instrument.id}-base`,
      rationale: "É a rota elegível que melhor preserva a finalidade declarada e a capacidade calculada.",
      basisIds: [basisId],
      proposedBy: "offroad_structure_designer",
      proposedAt: payload.asOf,
    },
  };
}

describe("worker case analysis", () => {
  it("runs the first understanding as one bounded read without loading or executing the full case DAG", async () => {
    const preliminaryJob: CaseAnalysisJob = {
      ...job,
      kind: "preliminary_analysis",
      payload: {
        locale: "pt-BR",
        execution_mode: "primary",
        analysis_scope: "preliminary_understanding",
        model_budget: {max_cost_usd: 0.6, max_calls: 1},
      },
    };
    const calls: string[] = [];
    const stages: Array<{stage: string; status: string}> = [];
    let recorded: {inputFingerprint: string; payload: unknown} | null = null;
    let completed: Record<string, unknown> | null = null;
    const queue: QueueClient = {
      claim: async () => null,
      heartbeat: async () => {},
      writeStage: async (_job, stage, status) => { stages.push({stage, status}); },
      startCapitalTask: async () => "11111111-1111-4111-8111-111111111111",
      recordCapitalProjectArtifact: async () => ({
        id: "22222222-2222-4222-8222-222222222222",
        artifactFingerprint: "a".repeat(64),
        artifactVersion: 1,
        replayed: false,
      }),
      finishCapitalTask: async (_job, input) => input.taskRunId,
      recordDocument: async () => {},
      recordCandidates: async () => ({written: 0, replaced: 0}),
      recordRetrievalChunks: async () => ({written: 0, sourceDocumentId: "source-1"}),
      recordReceivablesEvidence: async () => ({written: false, replayed: false, source_document_id: "11111111-1111-4111-8111-111111111111", content_sha256: "1".repeat(64)}),
      loadIntakeEvents: async () => [],
      recordIntakeRequestLadders: async () => {},
      recordAnalysisScopeSuggestions: async () => ({}),
      documentAdvisorAuthorization: async () => ({}),
      loadPreliminaryInput: async () => ({
        session: {
          id: job.intake_session_id,
          locale: "pt-BR",
          archetype: "working_capital",
          company_profile: {
            name: "Companhia Exemplo",
            legal_name: "Companhia Exemplo Ltda.",
            website: "https://companhia.example",
            description: "Distribuidora B2B com carteira de recebíveis.",
          },
          capital_objective: null,
          requested_amount: null,
          capital_currency: "BRL",
          sector: "Distribuição",
          geography: "SP",
        },
        candidates: [
          {
            id: "candidate-1",
            field_path: "company.legal_name",
            label: "Razão social",
            raw_value: "Companhia Exemplo Ltda.",
            normalized_value: "Companhia Exemplo Ltda.",
            value_type: "text",
            source_document_id: "source-1",
            evidence_rank: 1,
            information_class: "historical",
            confidence: 0.99,
            anchor_verified: true,
            source_anchor: {page: 1},
          },
          {
            id: "candidate-2",
            field_path: "transaction.purpose",
            label: "Finalidade",
            raw_value: "Financiar o crescimento do capital de giro.",
            normalized_value: "Financiar o crescimento do capital de giro.",
            value_type: "text",
            source_document_id: "source-1",
            evidence_rank: 1,
            information_class: "company_document",
            confidence: 0.98,
            anchor_verified: true,
            source_anchor: {page: 2},
          },
          {
            id: "candidate-3",
            field_path: "transaction.requested_amount",
            label: "Montante",
            raw_value: "R$ 20 milhões",
            normalized_value: "20000000",
            value_type: "number",
            source_document_id: "source-1",
            evidence_rank: 1,
            information_class: "company_document",
            confidence: 0.98,
            anchor_verified: true,
            source_anchor: {page: 2},
          },
        ],
        documents: [{
          id: "source-1",
          original_name: "apresentacao.pdf",
          document_version: 1,
          sha256: "a".repeat(64),
          sha256_verified_at: "2026-08-31T12:00:00.000Z",
          byte_size: 1_000,
          document_kind: "institutional_presentation",
        }],
      }),
      loadCaseInput: async () => { throw new Error("the preliminary job must not load full case input"); },
      loadRetrievalContext: async () => { throw new Error("the preliminary job must not retrieve playbook or mandates"); },
      recordPublicResearch: async () => "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      recordPreliminaryUnderstanding: async (_job, input) => {
        recorded = input;
        return "ffffffff-ffff-4fff-8fff-ffffffffffff";
      },
      recordDealStateObject: async () => { throw new Error("the preliminary job must not mutate Deal State"); },
      recordCaseSnapshot: async () => { throw new Error("the preliminary job must not persist a case snapshot"); },
      recordControlledExecution: async () => { throw new Error("the preliminary job must not create a controlled execution"); },
      loadAgentContext: async () => ({}),
      loadCapitalProjectContext: async () => ({}),
      recordAgentResponse: async () => ({}),
      recordAgentFailure: async () => {},
      completeAdvisorSpecializedJob: async () => {},
      complete: async (_job, result) => { completed = result as Record<string, unknown>; },
      fail: async (_job, error) => { throw new Error(`the preliminary job should not fail: ${JSON.stringify(error)}`); },
    };
    let spent = {costUsd: 0, calls: 0};
    const gateway = {
      complete: async (request: {task: string}) => {
        calls.push(request.task);
        spent = {costUsd: 0.08, calls: 1};
        return {
          output: {
            understandingSummary: "A companhia atua em distribuição B2B e busca capital para sustentar o crescimento do ciclo operacional.",
            companyName: "Cedro Distribuição",
            legalName: "Cedro Distribuição e Logística Ltda.",
            website: null,
            archetypeId: "working_capital",
            capitalObjective: "Sustentar o crescimento do ciclo operacional.",
            companySummary: "A companhia se apresenta como distribuidora B2B com carteira própria de recebíveis.",
            sectorSummary: "A distribuição B2B depende de gestão de estoque, prazo a clientes e disponibilidade de capital de giro.",
            positioningSummary: "As fontes consultadas confirmam a presença digital informada, mas não permitem concluir posição competitiva.",
            sector: "Distribuição B2B",
            geography: "SP",
            operationSummary: "A necessidade declarada é levantar BRL 20 milhões para financiar capital de giro associado ao crescimento.",
            researchSignals: [{claim: "O domínio informado é consistente com a identidade pesquisada.", sourceUrls: ["https://example.com/identity"]}],
            openPoints: [{question: "Qual é o uso detalhado dos recursos?", whyItMatters: "Define a lista de informações necessária.", category: "operation"}],
          },
          provider: "anthropic",
          model: "claude-sonnet-5",
          effort: "medium",
          usage: {inputTokens: 200, outputTokens: 100, cachedInputTokens: 0},
          costUsd: 0.08,
          latencyMs: 10,
          stopReason: "end",
          usedFallback: false,
          fromCassette: false,
          attempts: [],
        };
      },
      spent: () => spent,
    } as unknown as ModelGateway;

    const outcome = await processCaseAnalysisJob(preliminaryJob, {
      queue,
      gateway,
      lineage: () => [],
      researchProviders: [{
        id: "perplexity",
        search: async (query) => [{
          provider: "perplexity",
          topic: query.topic,
          title: `Fonte ${query.topic}`,
          url: `https://example.com/${query.topic}`,
          snippet: "Contexto público verificado.",
          publishedAt: null,
          retrievedAt: "2026-08-31T12:00:00.000Z",
          contentHash: "b".repeat(64),
        }],
      }],
      now: () => new Date("2026-08-31T12:00:00.000Z"),
    });

    expect(outcome).toEqual({status: "succeeded"});
    expect(calls).toEqual(["preliminary_understanding"]);
    expect(stages).toEqual([
      {stage: "preliminary_understanding", status: "started"},
      {stage: "public_research", status: "started"},
      {stage: "public_research", status: "succeeded"},
      {stage: "preliminary_understanding", status: "succeeded"},
    ]);
    expect(recorded).not.toBeNull();
    const preliminary = (recorded as unknown as {payload: {
      operation: {objective: string | null; requestedAmount: string | null};
      preliminaryAssessment: {boundary: string; openPoints: string[]};
    }}).payload;
    expect(preliminary.operation).toMatchObject({
      objective: "Financiar o crescimento do capital de giro.",
      requestedAmount: "20000000",
    });
    expect(preliminary.preliminaryAssessment.openPoints).not.toContain("Confirmar o objetivo e a destinação dos recursos.");
    expect(preliminary.preliminaryAssessment.openPoints).not.toContain("Confirmar o montante indicativo.");
    expect(preliminary.preliminaryAssessment.boundary).toContain("Ainda não é diagnóstico financeiro");
    expect(completed).toMatchObject({
      preliminary_understanding_id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
      analysis_scope: "preliminary_understanding",
      spend: {calls: 1},
    });
  });

  it("starts bounded public research from an explicitly named company in the opening request", () => {
    expect(researchSubjectFromDeclaration("Tenho uma reunião com a Camil amanhã e quero discutir alternativas de dívida.")).toEqual({
      legalName: "Camil",
    });
    expect(researchSubjectFromDeclaration("Please analyze https://www.example-capital.com before the meeting.")).toEqual({
      legalName: "example capital",
      website: "https://www.example-capital.com",
    });
    expect(researchSubjectFromDeclaration("Quero analisar uma companhia do varejo.")).toBeNull();
  });

  it("defaults to a zero-model diagnostic plan before governed confirmations", () => {
    expect(caseAnalysisExecutionPlan({
      stage: "diagnose",
      gates: {
        understandingConfirmed: false,
        structureOptionCurrent: false,
        structureConfirmed: false,
        productionPlanApproved: false,
        packageApproved: false,
        matchApproved: false,
        releaseAuthorized: false,
      },
      objectFingerprints: {},
    })).toEqual({designStructure: false, produceMaterials: false, screenMandates: false, introduce: false});
  });

  it("does not unlock matching merely because materials are allowed", () => {
    expect(caseAnalysisExecutionPlan({
      stage: "prepare",
      gates: {
        understandingConfirmed: true,
        structureOptionCurrent: true,
        structureConfirmed: true,
        productionPlanApproved: true,
        packageApproved: false,
        matchApproved: false,
        releaseAuthorized: false,
      },
      objectFingerprints: {
        understanding_snapshot: "1".repeat(64),
        structure_decision: "2".repeat(64),
        production_plan: "3".repeat(64),
      },
    })).toEqual({designStructure: true, produceMaterials: true, screenMandates: false, introduce: false});
  });

  it("persists a borrower-safe snapshot and keeps fund identity in the private job result", async () => {
    let recordedState: Record<string, unknown> | null = null;
    let completed: Record<string, unknown> | null = null;
    const stages: Array<{stage: string; status: string}> = [];
    const modelCalls: Array<{task: string; provider?: string}> = [];
    const retrievalRequests: Array<{query: string; allowedFundIds?: string[]}> = [];
    const dealStateWrites: Array<{objectType: string; status: string}> = [];
    let publicResearchRecord: {plan: unknown; result: unknown} | null = null;
    const receivablesDocumentId = "11111111-1111-4111-8111-111111111111";
    const receivablesFileHash = "9".repeat(64);
    const parsedReceivables = await parseDocument({
      bytes: new TextEncoder().encode([
        "NUM_TITULO,CNPJ_SACADO,NOME_SACADO,DT_EMISSAO,DT_VENCIMENTO,VLR_TITULO,SITUACAO,DT_PAGAMENTO,VLR_PAGO",
        "NF-1,11222333000144,Comprador A,2026-06-01,2026-07-01,100000,ABERTO,,",
        "NF-2,22333444000155,Comprador B,2026-05-01,2026-06-01,50000,LIQUIDADO,2026-06-03,50000",
      ].join("\n")),
      documentId: receivablesDocumentId,
      documentVersion: 1,
      fileName: "carteira.csv",
      localeHint: "pt-BR",
    });
    const encodedReceivables = encodeReceivablesEvidence(documentEvidence({
      documentId: receivablesDocumentId,
      fileName: "carteira.csv",
      fileHash: receivablesFileHash,
      parsed: parsedReceivables,
    }));
    const raw = {
      session: {
        id: job.intake_session_id,
        archetype: "growth_expansion",
        locale: "pt-BR",
        extraction_version: "fixture-v1",
        requested_amount: 10_000_000,
        requested_term_months: 48,
        sector: "Varejo",
        geography: "SP",
        instruments: ["ccb"],
        collateral_kinds: ["recebiveis"],
        current_run_id: job.processing_run_id,
        status: "processing",
      },
      run: {id: job.processing_run_id, pipeline_version: "fixture", status: "running", versions: {}, model_calls: 0},
      candidates: [
        fact("company.legal_name", "Empresa Teste Ltda", "text"),
        fact("transaction.requested_amount", 10_000_000),
        fact("debt.total_gross", 60_000_000),
        fact("debt.instruments.1.principal", 60_000_000),
        fact("historical_financials.2025.cash", 10_000_000),
        fact("historical_financials.2025.ebitda", 25_000_000),
        fact("leverage.post_transaction_net_debt_ebitda", 2.8),
        fact("projections.minimum_dscr", 1.45),
        fact("project.total_cost", 10_000_000),
        fact("project.investments.1.amount", 10_000_000),
        fact("collateral.total_capacity", 12_000_000),
        fact("transaction.sources_and_uses.1.side", "sources", "text"),
        fact("transaction.sources_and_uses.1.item", "Nova dívida", "text"),
        fact("transaction.sources_and_uses.1.amount", 10_000_000),
        fact("transaction.sources_and_uses.1.currency", "BRL", "text"),
        fact("transaction.sources_and_uses.1.condition", "available", "text"),
        fact("transaction.sources_and_uses.2.side", "uses", "text"),
        fact("transaction.sources_and_uses.2.item", "Expansão", "text"),
        fact("transaction.sources_and_uses.2.amount", 10_000_000),
        fact("transaction.sources_and_uses.2.currency", "BRL", "text"),
        fact("transaction.sources_and_uses.2.condition", "available", "text"),
      ],
      sources: [
        {id: "source-1", document_version: 1, sha256: "d".repeat(64)},
        {id: "source-2", document_version: 1, sha256: "e".repeat(64)},
        {id: "source-3", document_version: 1, sha256: "f".repeat(64)},
        {id: "source-4", document_version: 1, sha256: "a".repeat(64)},
        {id: "source-5", document_version: 1, sha256: "b".repeat(64)},
        {id: "source-6", document_version: 1, sha256: "c".repeat(64)},
      ],
      documents: [
        {id: "source-1", original_name: "financials.pdf", document_version: 1, sha256: "d".repeat(64), sha256_verified_at: "2026-08-24T12:00:00.000Z", byte_size: 100, document_kind: "audited_financial_statements"},
        {id: "source-2", original_name: "trial-balance.xlsx", document_version: 1, sha256: "e".repeat(64), sha256_verified_at: "2026-08-24T12:00:00.000Z", byte_size: 100, document_kind: "trial_balance"},
        {id: "source-3", original_name: "debt-schedule.xlsx", document_version: 1, sha256: "f".repeat(64), sha256_verified_at: "2026-08-24T12:00:00.000Z", byte_size: 100, document_kind: "debt_schedule"},
        {id: "source-4", original_name: "company-registration.pdf", document_version: 1, sha256: "a".repeat(64), sha256_verified_at: "2026-08-24T12:00:00.000Z", byte_size: 100, document_kind: "company_registration"},
        {id: "source-5", original_name: "capital-request.pdf", document_version: 1, sha256: "b".repeat(64), sha256_verified_at: "2026-08-24T12:00:00.000Z", byte_size: 100, document_kind: "capital_request_letter"},
        {id: "source-6", original_name: "business-plan.xlsx", document_version: 1, sha256: "c".repeat(64), sha256_verified_at: "2026-08-24T12:00:00.000Z", byte_size: 100, document_kind: "business_plan"},
      ],
      layers: [
        ["source-1", "d"], ["source-2", "e"], ["source-3", "f"],
        ["source-4", "a"], ["source-5", "b"], ["source-6", "c"],
      ].map(([source_document_id, hash]) => ({
        source_document_id,
        document_version: 1,
        sha256: String(hash).repeat(64),
        parser_versions: {},
        processing_run_id: job.processing_run_id,
        status: "ready",
      })),
      answers: [
        {id: "answer-1", requirement_id: "info_why_now", response: "provided", answer: "O cronograma do projeto exige contratação neste semestre.", note: null},
        {id: "answer-2", requirement_id: "info_business_model", response: "provided", answer: "A companhia vende produtos a uma base recorrente de clientes.", note: null},
        {id: "answer-3", requirement_id: "info_customer_concentration", response: "provided", answer: "Os cinco maiores clientes e suas participações estão identificados.", note: null},
        {id: "answer-4", requirement_id: "info_ramp_history", response: "provided", answer: "As duas últimas unidades atingiram maturidade dentro do cronograma informado.", note: null},
        {id: "answer-5", requirement_id: "info_capex_actual", response: "provided", answer: "O custo real da última unidade foi reconciliado com o orçamento.", note: null},
      ],
      directory_mandates: [{
        fund_id: "f1111111-1111-4111-8111-111111111111",
        fund_name: "Fundo Confidencial",
        observations: [
          observation("ticket", {min: "2000000", max: "100000000"}),
          observation("term_months", {min: 24, max: 72}),
          observation("sectors", ["Varejo"]),
          observation("instruments", ["ccb"]),
          observation("collateral", ["recebiveis"]),
          observation("geographies", ["SP"]),
          observation("leverage_ceiling", "3.5"),
          observation("minimum_dscr", "1.2"),
          observation("active", true),
        ],
      }],
      registered_mandates: [],
      match_provider_context: [{
        provider_id: "f1111111-1111-4111-8111-111111111111",
        provider_kind: "credit_fund",
        provider_source: "directory",
        fund_directory_id: "f1111111-1111-4111-8111-111111111111",
        provider_organization_id: null,
        provider_fund_id: null,
      }],
      model_lineage: [],
      expected_model_calls: 0,
      receivables_evidence: [{
        source_document_id: receivablesDocumentId,
        document_version: 1,
        content_kind: "document_layer",
        schema_version: encodedReceivables.schemaVersion,
        source_sha256: receivablesFileHash,
        content_sha256: encodedReceivables.contentSha256,
        payload_sha256: encodedReceivables.payloadSha256,
        codec: "gzip-json-v1",
        uncompressed_bytes: encodedReceivables.uncompressedBytes,
        payload_base64: encodedReceivables.payloadBase64,
      }],
      receivables_provider_context: {
        programs: [{
          id: "21111111-1111-4111-8111-111111111111",
          provider_id: "31111111-1111-4111-8111-111111111111",
          provider_legal_name: "Financeira Privada Confidencial S.A.",
          program_name: "Desconto de recebíveis",
          provider_kind: "credit_finance_company",
          route_ids: ["financial_institution_receivables_discount"],
          status: "active",
          created_at: "2026-08-01T00:00:00.000Z",
          updated_at: "2026-08-20T00:00:00.000Z",
        }],
        observations: [
          providerObservation("eligible_routes", ["financial_institution_receivables_discount"]),
          providerObservation("currencies", ["BRL"]),
          providerObservation("ticket", {min: "100000", max: "50000000"}),
          providerObservation("weighted_average_term_days", {min: "1", max: "180"}),
          providerObservation("minimum_history_months", 1),
          providerObservation("maximum_past_due_over_30_ratio", "0.25"),
          providerObservation("maximum_past_due_over_90_ratio", "0.15"),
          providerObservation("maximum_dilution_ratio", {mode: "case_by_case", note: "Confirmar histórico de diluição."}),
          providerObservation("maximum_adjusted_loss_ratio", {mode: "case_by_case", note: "Confirmar histórico de perdas."}),
          providerObservation("maximum_single_obligor_ratio", "0.80"),
          providerObservation("maximum_top_ten_obligor_ratio", "1"),
          providerObservation("minimum_eligible_portfolio_amount", "100000"),
          providerObservation("live_appetite", true, "conversation"),
          providerObservation("available_capacity", "15000000", "conversation"),
        ],
      },
      receivables_case: diversifiedReceivablesCase("worker-receivables-case"),
      market_distribution_context:{version:"2026.08.26-v1",status:"active",mandateMaxAgeMonths:12,waveLimit:3,learningGateAnchorCount:2},
      red_flag_context:{
        policy:{
          version:"2026.08.26-v1",status:"active",validFrom:"2026-08-01",validUntil:null,
          thresholds:{inventoryRevenueGrowthGapPct:"10",changingInformationVersions:3},
          materiality:{},responseSla:{},
        },
        reviews:[],mandateDecision:null,declineCommunication:null,
      },
      deal_workflow: {
        stage: "introduce",
        gates: {
          understandingConfirmed: true,
          structureOptionCurrent: true,
          structureConfirmed: true,
          productionPlanApproved: true,
          packageApproved: true,
          matchApproved: true,
          releaseAuthorized: true,
        },
        objectFingerprints: {
          understanding_snapshot: "1".repeat(64),
          structure_decision: "2".repeat(64),
          production_plan: "3".repeat(64),
          package_review: "4".repeat(64),
          release_authorization: "5".repeat(64),
          material_artifact: "6".repeat(64),
        },
      },
      deal_state_context: {} as Record<string, unknown>,
      _execution: {
        id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
        mode: "primary",
        input_fingerprint: "e".repeat(64),
        pipeline_version: "fixture",
        model_policy_version: "2026.08.24-v1",
      },
    };
    const queue: QueueClient = {
      claim: async () => null,
      heartbeat: async () => {},
      writeStage: async (_job, stage, status) => { stages.push({stage, status}); },
      startCapitalTask: async () => "11111111-1111-4111-8111-111111111111",
      recordCapitalProjectArtifact: async () => ({
        id: "22222222-2222-4222-8222-222222222222",
        artifactFingerprint: "a".repeat(64),
        artifactVersion: 1,
        replayed: false,
      }),
      finishCapitalTask: async (_job, input) => input.taskRunId,
      recordDocument: async () => {},
      recordCandidates: async () => ({written: 0, replaced: 0}),
      recordRetrievalChunks: async () => ({written: 0, sourceDocumentId: "source-1"}),
      recordReceivablesEvidence: async () => ({
        written: true,
        replayed: false,
        source_document_id: "11111111-1111-4111-8111-111111111111",
        content_sha256: "a".repeat(64),
      }),
      loadIntakeEvents: async () => [],
      recordIntakeRequestLadders: async () => {},
      recordAnalysisScopeSuggestions: async () => ({}),
      documentAdvisorAuthorization: async () => ({}),
      loadPreliminaryInput: async () => raw,
      loadCaseInput: async () => raw,
      loadRetrievalContext: async (_job, input) => {
        retrievalRequests.push(input);
        return {
          playbook_version: "2026.08.24-v2",
          results: [{
            source: "house_playbook",
            id: "71100000-0000-4000-8000-000000000003",
            content: "Expansão exige orçamento, cronograma, capacidade de pagamento e cenário de atraso.",
            citation: {key: "growth-expansion", label: "credit-playbook:growth-expansion"},
            score: 0.8,
          }],
          abstained: false,
        };
      },
      recordPublicResearch: async (_job, plan, result) => {
        publicResearchRecord = {plan, result};
        return "ffffffff-ffff-4fff-8fff-ffffffffffff";
      },
      recordPreliminaryUnderstanding: async () => "f2000000-0000-4000-8000-000000000001",
      recordDealStateObject: async (_job, input) => {
        dealStateWrites.push({objectType: input.objectType, status: input.status});
        return "f1000000-0000-4000-8000-000000000001";
      },
      recordCaseSnapshot: async (_job, _manifest, state) => {
        recordedState = state as Record<string, unknown>;
        return "manifest-1";
      },
      recordControlledExecution: async () => "execution-1",
      loadAgentContext: async () => ({}),
      loadCapitalProjectContext: async () => ({}),
      recordAgentResponse: async () => ({}),
      recordAgentFailure: async () => {},
      completeAdvisorSpecializedJob: async () => {},
      complete: async (_job, result) => { completed = result as Record<string, unknown>; },
      fail: async (_job, error) => { throw new Error(`the case should not fail: ${JSON.stringify(error)}`); },
    };
    let spent = {costUsd: 0, calls: 0};
    const dealStateRecords: Array<{objectType: string; status: string; inputFingerprint: string; payload: unknown; dependencies?: unknown[]}> = [];
    queue.recordDealStateObject = async (_job, input) => {
      dealStateWrites.push({objectType: input.objectType, status: input.status});
      dealStateRecords.push(input);
      return "f1000000-0000-4000-8000-000000000001";
    };
    const gateway = {
      complete: async (request: {task: string; model?: {provider?: string}; input?: Array<{type: string; text?: string}>}) => {
        modelCalls.push({task: request.task, ...(request.model?.provider ? {provider: request.model.provider} : {})});
        if (request.task === "structure_design") {
          spent = {costUsd: 0.1, calls: 1};
          const output = structureProposalFromRequest(request);
          return {
            output,
            provider: "anthropic",
            model: "claude-opus-5",
            effort: "high",
            usage: invocation.usage,
            costUsd: 0.1,
            latencyMs: 10,
            stopReason: "end",
            usedFallback: false,
            fromCassette: false,
            attempts: [],
          };
        }
        if (request.task === "audit_evidence") {
          spent = {costUsd: 0.15, calls: 2};
          return {
            output: {reviews: []},
            provider: "openai",
            model: "gpt-5.6-sol",
            effort: "high",
            usage: invocation.usage,
            costUsd: 0.05,
            latencyMs: 10,
            stopReason: "end",
            usedFallback: false,
            fromCassette: false,
            attempts: [],
          };
        }
        spent = {costUsd: 0.1, calls: 1};
        return {
          output: {sections: [], executiveSummary: "Resumo institucional sem afirmações materiais."},
          provider: "anthropic",
          model: "claude-sonnet-5",
          effort: "high",
          usage: invocation.usage,
          costUsd: 0.1,
          latencyMs: 10,
          stopReason: "end",
          usedFallback: false,
          fromCassette: false,
          attempts: [],
        };
      },
      spent: () => spent,
    } as unknown as ModelGateway;

    const proposalOutcome = await processCaseAnalysisJob(job, {
      queue: {
        ...queue,
        loadCaseInput: async () => ({
          ...raw,
          deal_workflow: {
            stage: "structure",
            gates: {
              understandingConfirmed: true,
              structureOptionCurrent: false,
              structureConfirmed: false,
              productionPlanApproved: false,
              packageApproved: false,
              matchApproved: false,
              releaseAuthorized: false,
            },
            objectFingerprints: {understanding_snapshot: "1".repeat(64)},
          },
        }),
      },
      gateway,
      lineage: () => spent.calls ? [invocation] : [],
      researchProviders: [],
      now: () => new Date("2026-08-24T13:00:00.000Z"),
    });
    expect(proposalOutcome.status).toBe("succeeded");
    const persistedStructureOption = dealStateRecords.find((record) => record.objectType === "structure_option");
    expect(persistedStructureOption).toBeTruthy();
    const structurePayload = persistedStructureOption!.payload as {
      proposal: unknown;
      compiled: {proposalFingerprint: string};
    };
    expect(structurePayload.compiled.proposalFingerprint).toMatch(/^[a-f0-9]{64}$/);
    raw.deal_state_context = {
      structure_option: {
        status: "pending_confirmation",
        inputFingerprint: persistedStructureOption!.inputFingerprint,
        fingerprint: "6".repeat(64),
        payload: persistedStructureOption!.payload,
        dependencies: persistedStructureOption!.dependencies ?? [],
      },
      structure_decision: {
        status: "confirmed",
        inputFingerprint: "7".repeat(64),
        fingerprint: "2".repeat(64),
        payload: {
          confirmation: {
            decision: "confirm",
            selectedAlternativeId: (structurePayload.proposal as {alternatives: Array<{id: string}>}).alternatives[0]!.id,
            proposalFingerprint: structurePayload.compiled.proposalFingerprint,
            actorId: "company-user-1",
            decidedAt: "2026-08-24T13:05:00.000Z",
          },
        },
        dependencies: [{objectType: "structure_option", objectFingerprint: "6".repeat(64)}],
      },
    };
    modelCalls.length = 0;
    retrievalRequests.length = 0;
    dealStateWrites.length = 0;
    dealStateRecords.length = 0;
    stages.length = 0;
    recordedState = null;
    completed = null;
    spent = {costUsd: 0, calls: 0};

    const outcome = await processCaseAnalysisJob(job, {
      queue,
      gateway,
      lineage: () => spent.calls ? [invocation] : [],
      researchProviders: [{
        id: "official",
        search: async (query) => [{
          provider: "official",
          topic: query.topic,
          title: `Fonte ${query.topic}`,
          url: `https://example.com/${query.topic}`,
          snippet: "Contexto público.",
          publishedAt: null,
          retrievedAt: "2026-08-24T13:00:00.000Z",
          contentHash: "f".repeat(64),
        }],
      }],
      now: () => new Date("2026-08-24T13:00:00.000Z"),
    });

    expect(outcome).toEqual({status: "succeeded", manifestId: "manifest-1"});
    expect(stages.slice(0, 5)).toEqual([
      {stage: "case_analysis", status: "started"},
      {stage: "public_research", status: "started"},
      {stage: "public_research", status: "succeeded"},
      {stage: "retrieval", status: "started"},
      {stage: "retrieval", status: "succeeded"},
    ]);
    const caseEvents = stages.filter((event) => event.stage.startsWith("case:"));
    expect(caseEvents).toHaveLength(caseStageIds.length * 2);
    for (const stage of caseStageIds) {
      expect(caseEvents.filter((event) => event.stage === `case:${stage}`)).toEqual([
        {stage: `case:${stage}`, status: "started"},
        {stage: `case:${stage}`, status: "succeeded"},
      ]);
    }
    expect(stages.slice(-3)).toEqual([
      {stage: "mandate_retrieval", status: "started"},
      {stage: "mandate_retrieval", status: "succeeded"},
      {stage: "case_analysis", status: "succeeded"},
    ]);
    const persisted = recordedState as unknown as Record<string, unknown>;
    const privateResult = completed as unknown as Record<string, unknown>;
    const publicMatching = persisted.matching as Record<string, unknown>;
    expect(publicMatching).toMatchObject({screened: true, counts: {fits: 1, possible: 0, excluded: 0}});
    expect(JSON.stringify(persisted)).not.toContain("Fundo Confidencial");
    expect(JSON.stringify(persisted)).not.toContain("Expansão exige orçamento");
    expect(JSON.stringify(privateResult)).toContain("Fundo Confidencial");
    expect(JSON.stringify(privateResult)).not.toContain("Expansão exige orçamento");
    expect(retrievalRequests).toHaveLength(2);
    expect(retrievalRequests[0]?.allowedFundIds).toEqual([]);
    expect(retrievalRequests[1]?.allowedFundIds).toEqual(["f1111111-1111-4111-8111-111111111111"]);
    expect(persisted.retrieval).toMatchObject({
      primary: {playbookVersion: "2026.08.24-v2", sourceCounts: {house_playbook: 1}},
      mandates: {allowedFundCount: 1},
    });
    expect(publicResearchRecord).not.toBeNull();
    expect((publicResearchRecord as unknown as {result: {sources: unknown[]}}).result.sources).toHaveLength(5);
    expect(persisted.externalResearch).toMatchObject({status: "succeeded", sourceCount: 5});
    expect(persisted.dealWorkflow).toMatchObject({stage: "introduce"});
    expect(persisted.executionPlan).toEqual({designStructure: true, produceMaterials: true, screenMandates: true, introduce: true});
    expect(privateResult.retrieval_lineage).toMatchObject({
      primary: {resultIds: ["71100000-0000-4000-8000-000000000003"]},
    });
    expect(persisted.caseRunReport).toBeTruthy();
    expect(persisted.receivables).toMatchObject({
      caseId: "worker-receivables-case",
      decision: {status: "ready_for_structuring", externalDirectionAllowed: false},
    });
    expect(persisted.receivablesVertical).toMatchObject({
      version: "2026.08.28-v1",
      status: "analyzed",
      classification: {categoryIds: ["trade_receivables"], cellIds: ["mercantil_b2b"]},
      evidenceCoverage: {delivered: 1, searched: 1},
      pipeline: {
        boundaries: {
          companyFacingRecommendationAllowed: false,
          externalDirectionAllowed: false,
          qualifiedIntroductionAllowed: false,
          creditApprovalExpressed: false,
        },
      },
    });
    expect(JSON.stringify(persisted.receivablesVertical)).not.toContain("Fundo Confidencial");
    expect(JSON.stringify(persisted.receivablesVertical)).not.toContain("Financeira Privada Confidencial");
    expect(privateResult.receivables_analysis).toMatchObject({
      phaseTwoB: {summary: {screened: 1}},
      evidenceCollection: {mandates: {summary: {programsReviewed: 1}}},
      boundaries: {
        companyFacingRecommendationAllowed: false,
        externalDirectionAllowed: false,
        qualifiedIntroductionAllowed: false,
        creditApprovalExpressed: false,
      },
    });
    expect(JSON.stringify(privateResult.receivables_analysis)).toContain("Financeira Privada Confidencial");
    const persistedReconciliation = persisted.reconciliation as {
      financialTruth: {procedureCoverage: Array<{procedureId: string}>};
      debtTruth: {procedureCoverage: Array<{procedureId: string}>};
    };
    expect(persistedReconciliation.financialTruth.procedureCoverage).toHaveLength(18);
    expect(persistedReconciliation.debtTruth.procedureCoverage).toHaveLength(31);
    expect(persistedReconciliation.financialTruth.procedureCoverage[0]?.procedureId).toBe("Q-01");
    expect(persistedReconciliation.debtTruth.procedureCoverage[30]?.procedureId).toBe("D-31");
    const persistedOperation = persisted.operationTruth as {procedureCoverage: Array<{procedureId: string}>};
    expect(persistedOperation.procedureCoverage).toHaveLength(14);
    expect(persistedOperation.procedureCoverage[0]?.procedureId).toBe("OP-01");
    expect(persistedOperation.procedureCoverage[13]?.procedureId).toBe("OP-14");
    const persistedStructure = persisted.structureTruth as {procedureCoverage: Array<{procedureId: string}>};
    expect(persistedStructure.procedureCoverage).toHaveLength(45);
    expect(persistedStructure.procedureCoverage[0]?.procedureId).toBe("ES-01");
    expect(persistedStructure.procedureCoverage[44]?.procedureId).toBe("ES-45");
    const persistedPricing = persisted.pricingTruth as {
      decision: string;
      indicativePrice: unknown;
      procedureCoverage: Array<{procedureId: string}>;
    };
    expect(persistedPricing.procedureCoverage).toHaveLength(13);
    expect(persistedPricing.procedureCoverage[0]?.procedureId).toBe("PR-01");
    expect(persistedPricing.procedureCoverage[12]?.procedureId).toBe("PR-13");
    expect(persistedPricing.decision).toBe("abstain");
    expect(persistedPricing.indicativePrice).toBeNull();
    const persistedMaterials=persisted.materialTruth as {releaseDecision:string;procedureCoverage:Array<{procedureId:string;result:unknown}>};
    expect(persistedMaterials.procedureCoverage).toHaveLength(32);
    expect(persistedMaterials.procedureCoverage[0]).toMatchObject({procedureId:"MA-01",result:null});
    expect(persistedMaterials.procedureCoverage[31]).toMatchObject({procedureId:"MA-32",result:null});
    expect(persistedMaterials.releaseDecision).toBe("internal_only");
    const persistedRedFlags=persisted.redFlagTruth as {
      status:string;
      counts:{total:number;pending:number};
      externalOutputsAllowed:boolean;
    };
    expect(persistedRedFlags).toMatchObject({
      status:"attention_required",
      counts:{open:0,treated:0,notComputable:16},
      externalOutputsAllowed:false,
    });
    expect(persistedRedFlags).not.toHaveProperty("findings");
    expect(modelCalls).toEqual([{task: "case_brief"}, {task: "audit_evidence", provider: "openai"}]);
    expect(dealStateWrites).toEqual([
      {objectType: "match_screen", status: "pending_confirmation"},
    ]);
    const persistedMatchScreen = dealStateRecords.find((record) => record.objectType === "match_screen");
    expect(persistedMatchScreen).toMatchObject({
      status: "pending_confirmation",
      dependencies: [
        {objectType: "package_review", objectFingerprint: "4".repeat(64)},
        {objectType: "material_artifact", objectFingerprint: "6".repeat(64)},
      ],
      payload: {
        schemaVersion: "2026.08.29-v3",
        noContactAuthorized: true,
        candidates: [expect.objectContaining({
          providerName: "Fundo Confidencial",
          providerKind: "credit_fund",
        })],
      },
    });

    modelCalls.length = 0;
    retrievalRequests.length = 0;
    dealStateWrites.length = 0;
    stages.length = 0;
    recordedState = null;
    completed = null;
    spent = {costUsd: 0, calls: 0};
    const diagnosticOutcome = await processCaseAnalysisJob(job, {
      queue: {...queue, loadCaseInput: async () => ({
        ...raw,
        deal_workflow: {
          stage: "diagnose",
          gates: {
            understandingConfirmed: false,
            structureOptionCurrent: false,
            structureConfirmed: false,
            productionPlanApproved: false,
            packageApproved: false,
            matchApproved: false,
            releaseAuthorized: false,
          },
          objectFingerprints: {},
        },
      })},
      gateway,
      lineage: () => spent.calls ? [invocation] : [],
      researchProviders: [],
      now: () => new Date("2026-08-24T13:00:00.000Z"),
    });
    expect(diagnosticOutcome).toEqual({status: "succeeded", manifestId: "manifest-1"});
    expect(modelCalls).toEqual([{task: "case_brief"}, {task: "audit_evidence", provider: "openai"}]);
    expect(spent).toEqual({costUsd: 0.15, calls: 2});
    expect(retrievalRequests).toHaveLength(1);
    expect(stages.some((event) => event.stage === "mandate_retrieval")).toBe(false);
    expect(dealStateWrites).toEqual([
      {objectType: "understanding_snapshot", status: "pending_confirmation"},
      {objectType: "finding_register", status: "draft"},
    ]);
    const diagnosticUnderstanding = dealStateRecords.find((record) => record.objectType === "understanding_snapshot")?.payload as Record<string, unknown>;
    expect(diagnosticUnderstanding).toMatchObject({
      schemaVersion: "2026.08.31-v2",
      caseId: job.intake_session_id,
    });
    for (const required of ["readiness", "reconciliation", "operationTruth", "capacity", "trajectory", "desk", "clientQuestions", "brief", "briefBlockedBy", "redFlagTruth"]) {
      expect(diagnosticUnderstanding).toHaveProperty(required);
    }
    expect(diagnosticUnderstanding.brief).toMatchObject({
      executiveSummary: "Resumo institucional sem afirmações materiais.",
    });
    expect(diagnosticUnderstanding).not.toHaveProperty("structureTruth");
    expect(diagnosticUnderstanding).not.toHaveProperty("pricingTruth");
    expect(diagnosticUnderstanding).not.toHaveProperty("materials");
    expect(diagnosticUnderstanding).not.toHaveProperty("matching");
    expect(recordedState).toMatchObject({
      dealWorkflow: {stage: "diagnose"},
      executionPlan: {produceMaterials: false, screenMandates: false, introduce: false},
    });
    expect(completed).not.toHaveProperty("match_details");
  }, 20_000);
});

function fact(fieldPath: string, normalizedValue: unknown, valueType = "number") {
  return {
    id: `${fieldPath}-id`,
    field_path: fieldPath,
    normalized_value: normalizedValue,
    value_type: valueType,
    source_document_id: "source-1",
    evidence_rank: 1,
    information_class: "audited",
    confidence: 0.99,
    anchor_verified: true,
    source_anchor: {kind: "table_cell", id: fieldPath},
  };
}

function observation(criterion: string, value: unknown) {
  return {criterion, value, provenance: "declared", observed_at: "2026-08-01", note: null};
}

let providerObservationSequence = 0;
function providerObservation(criterion: string, value: unknown, provenance = "declared") {
  providerObservationSequence += 1;
  return {
    id: `51111111-1111-4111-8111-${String(providerObservationSequence).padStart(12, "0")}`,
    provider_id: "31111111-1111-4111-8111-111111111111",
    program_id: "21111111-1111-4111-8111-111111111111",
    criterion,
    value,
    provenance,
    observed_at: "2026-08-01",
    valid_until: "2026-09-30",
    note: null,
    source_url: null,
    recorded_by: "41111111-1111-4111-8111-111111111111",
  };
}
