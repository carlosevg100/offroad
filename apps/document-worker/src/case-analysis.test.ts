import type {ModelGateway, GatewayCallLog} from "@offroad/model-gateway";
import {caseStageIds} from "@offroad/case-runner";
import {parseDocument} from "@offroad/document-parsers";
import {diversifiedReceivablesCase} from "@offroad/receivables-analysis";
import {describe, expect, it} from "vitest";

import {caseAnalysisExecutionPlan, processCaseAnalysisJob} from "./case-analysis";
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
  payload: {locale: "pt-BR", execution_mode: "primary"},
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

describe("worker case analysis", () => {
  it("defaults to a zero-model diagnostic plan before governed confirmations", () => {
    expect(caseAnalysisExecutionPlan({
      stage: "diagnose",
      gates: {
        understandingConfirmed: false,
        structureConfirmed: false,
        productionPlanApproved: false,
        packageApproved: false,
        releaseAuthorized: false,
      },
      objectFingerprints: {},
    })).toEqual({produceMaterials: false, screenMandates: false, introduce: false});
  });

  it("does not unlock matching merely because materials are allowed", () => {
    expect(caseAnalysisExecutionPlan({
      stage: "prepare",
      gates: {
        understandingConfirmed: true,
        structureConfirmed: true,
        productionPlanApproved: true,
        packageApproved: false,
        releaseAuthorized: false,
      },
      objectFingerprints: {
        understanding_snapshot: "1".repeat(64),
        structure_decision: "2".repeat(64),
        production_plan: "3".repeat(64),
      },
    })).toEqual({produceMaterials: true, screenMandates: false, introduce: false});
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
        requested_amount: 40_000_000,
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
        fact("transaction.requested_amount", 40_000_000),
        fact("debt.total_gross", 60_000_000),
        fact("historical_financials.2025.cash", 10_000_000),
        fact("historical_financials.2025.ebitda", 25_000_000),
        fact("leverage.post_transaction_net_debt_ebitda", 2.8),
        fact("projections.minimum_dscr", 1.45),
      ],
      sources: [{id: "source-1", document_version: 1, sha256: "d".repeat(64)}],
      documents: [
        {id: "source-1", original_name: "financials.pdf", document_version: 1, sha256: "d".repeat(64), sha256_verified_at: "2026-08-24T12:00:00.000Z", byte_size: 100, document_kind: "audited_financial_statements"},
      ],
      layers: [{source_document_id: "source-1", document_version: 1, sha256: "d".repeat(64), parser_versions: {}, processing_run_id: job.processing_run_id, status: "ready"}],
      answers: [],
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
          structureConfirmed: true,
          productionPlanApproved: true,
          packageApproved: true,
          releaseAuthorized: true,
        },
        objectFingerprints: {
          understanding_snapshot: "1".repeat(64),
          structure_decision: "2".repeat(64),
          production_plan: "3".repeat(64),
          package_review: "4".repeat(64),
          release_authorization: "5".repeat(64),
        },
      },
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
      recordAgentResponse: async () => ({}),
      recordAgentFailure: async () => {},
      complete: async (_job, result) => { completed = result as Record<string, unknown>; },
      fail: async (_job, error) => { throw new Error(`the case should not fail: ${JSON.stringify(error)}`); },
    };
    let spent = {costUsd: 0, calls: 0};
    const gateway = {
      complete: async (request: {task: string; model?: {provider?: string}}) => {
        modelCalls.push({task: request.task, ...(request.model?.provider ? {provider: request.model.provider} : {})});
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
    expect(persisted.executionPlan).toEqual({produceMaterials: true, screenMandates: true, introduce: true});
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
      status:"decision_required",
      counts:{open:1,treated:0,notComputable:16},
      externalOutputsAllowed:false,
    });
    expect(persistedRedFlags).not.toHaveProperty("findings");
    expect(modelCalls).toEqual([{task: "case_brief"}, {task: "audit_evidence", provider: "openai"}]);
    expect(dealStateWrites).toEqual([
      {objectType: "understanding_snapshot", status: "pending_confirmation"},
      {objectType: "finding_register", status: "draft"},
      {objectType: "structure_option", status: "draft"},
      {objectType: "production_plan", status: "pending_confirmation"},
      {objectType: "material_artifact", status: "pending_confirmation"},
      {objectType: "match_screen", status: "draft"},
    ]);

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
            structureConfirmed: false,
            productionPlanApproved: false,
            packageApproved: false,
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
    expect(modelCalls).toEqual([]);
    expect(spent).toEqual({costUsd: 0, calls: 0});
    expect(retrievalRequests).toHaveLength(1);
    expect(stages.some((event) => event.stage === "mandate_retrieval")).toBe(false);
    expect(dealStateWrites).toEqual([
      {objectType: "understanding_snapshot", status: "pending_confirmation"},
      {objectType: "finding_register", status: "draft"},
    ]);
    expect(recordedState).toMatchObject({
      dealWorkflow: {stage: "diagnose"},
      executionPlan: {produceMaterials: false, screenMandates: false, introduce: false},
    });
    expect(completed).not.toHaveProperty("match_details");
  });
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
