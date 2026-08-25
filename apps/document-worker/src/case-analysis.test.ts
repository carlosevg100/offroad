import type {ModelGateway, GatewayCallLog} from "@offroad/model-gateway";
import {diversifiedReceivablesCase} from "@offroad/receivables-analysis";
import {describe, expect, it} from "vitest";

import {processCaseAnalysisJob} from "./case-analysis";
import type {CaseAnalysisJob, QueueClient} from "./queue";

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
  latencyMs: 10,
  stopReason: "end",
  usedFallback: false,
  fromCassette: false,
  schemaName: "case_brief",
};

describe("worker case analysis", () => {
  it("persists a borrower-safe snapshot and keeps fund identity in the private job result", async () => {
    let recordedState: Record<string, unknown> | null = null;
    let completed: Record<string, unknown> | null = null;
    const stages: Array<{stage: string; status: string}> = [];
    const modelCalls: Array<{task: string; provider?: string}> = [];
    const retrievalRequests: Array<{query: string; allowedFundIds?: string[]}> = [];
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
          observation("ticket", {min: "10000000", max: "100000000"}),
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
      receivables_case: diversifiedReceivablesCase("worker-receivables-case"),
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
      recordCaseSnapshot: async (_job, _manifest, state) => {
        recordedState = state as Record<string, unknown>;
        return "manifest-1";
      },
      recordControlledExecution: async () => "execution-1",
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
      now: () => new Date("2026-08-24T13:00:00.000Z"),
    });

    expect(outcome).toEqual({status: "succeeded", manifestId: "manifest-1"});
    expect(stages).toEqual([
      {stage: "case_analysis", status: "started"},
      {stage: "retrieval", status: "started"},
      {stage: "retrieval", status: "succeeded"},
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
    expect(privateResult.retrieval_lineage).toMatchObject({
      primary: {resultIds: ["71100000-0000-4000-8000-000000000003"]},
    });
    expect(persisted.caseRunReport).toBeTruthy();
    expect(persisted.receivables).toMatchObject({
      caseId: "worker-receivables-case",
      decision: {status: "ready_for_structuring", externalDirectionAllowed: false},
    });
    expect(modelCalls).toEqual([{task: "case_brief"}, {task: "audit_evidence", provider: "openai"}]);
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
