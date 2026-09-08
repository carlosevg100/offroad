import {ModelGatewayError, type GatewayCallLog, type ModelGateway} from "@offroad/model-gateway";
import {
  applyReceivablesSupplementPatch,
  compileReceivablesSupplementDraft,
  newReceivablesSupplementDraft,
  receivablesSupplementPatchVersion,
} from "@offroad/receivables-analysis";
import {capitalProjectPlanSnapshot} from "@offroad/work-plan";
import {describe, expect, it} from "vitest";

import {governedActiveWorkContext, processAgentOperationBriefJob} from "./agent-operation-brief";
import {liveRoutingOutputSchema} from "./live-preview";
import type {AgentOperationBriefJob, QueueClient} from "./queue";

const job: AgentOperationBriefJob = {
  claimed: true,
  job_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  capability_token: "c".repeat(64),
  lease_expires_at: "2026-08-26T18:00:00.000Z",
  attempt: 1,
  kind: "agent_operation_brief",
  organization_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  intake_session_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  processing_run_id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  payload: {message_id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", locale: "pt-BR"},
};

function validLiveRoutingOutput(company = "Magazine Luiza") {
  const field = <T,>(value: T, state: "explicit" | "inferred" | "ambiguous" | "unknown" = "explicit") => ({
    value, state, confidence: state === "explicit" ? 1 : 0.7,
  });
  return liveRoutingOutputSchema.parse({
    routingCore: {
      action: field(["understand"]),
      object: field([{id: "object-1", ordinal: 1, kind: "company", slots: [{key: "entity", value: company}]}]),
      decisionType: field("none"), audienceType: field("internal_senior"),
      depth: field("preliminary", "inferred"), continuity: field("new"), workResponsibility: field(["producer"]),
    },
    inferableContext: {
      jurisdiction: field(["BR"], "inferred"), asOfDate: field(null, "unknown"), currency: field("BRL", "inferred"),
      deadline: field(null, "unknown"), sponsorInstruction: field(null, "unknown"), constraints: field([]),
      urgency: field(null, "unknown"), availableInputs: field([]),
    },
    primaryWorks: [{work: "understand", confidence: 0.8}], composition: "understand_company_sector_asset",
    firstQuestion: null, abstain: false, abstainReason: null,
    turn: {
      companies: [{mention: company, role: "subject"}],
      premiseChanges: {newDebtAnnualRate: null, cdiSpreadBps: null, newDebtTermMonths: null, newDebtGraceMonths: null},
      numberQuestion: null, material: {requested: false, form: null, pages: null}, answers: [],
      scopeChanges: {audience: null, depth: null, form: null},
    },
  });
}

function r01DraftMissingAdvanceRate() {
  const datasetHash = "a".repeat(64);
  const source = (id: string) => ({sourceClass: "provided_document" as const, sourceId: id, anchor: "page:1"});
  const evidence = {
    cedentAndServicing: [source("cedent")],
    titleLegalControls: [source("title")],
    performanceHistory: [source("performance")],
    cashReconciliation: [source("cash")],
    accountingReconciliation: [source("accounting")],
    eligibilityPolicy: [{sourceClass: "house_method" as const, sourceId: "policy", anchor: "method:R01"}],
    facilityAndWaterfall: [{sourceClass: "user_confirmation" as const, sourceId: "structure", anchor: "message:seed"}],
  };
  const policy = {
    maxDaysPastDue: 30, maxRemainingTermDays: 180, minSeasoningDays: 0,
    requireAssignable: true, requireEvidenceVerified: true, registrationRule: "required" as const,
    excludeDisputed: true, excludeRelatedParties: true, excludeEncumbered: true, allowedDebtorSectors: [],
    maxSingleDebtorShare: "1", maxDebtorGroupShare: "1", minimumEligibleShare: "0.5", minimumEvidenceCoverage: "1",
    minimumRegistrationCoverage: "1", maximumDelinquency30Share: "0.1", maximumDilutionShare: "0.1",
    maximumRepurchaseShare: "0.1", minimumRecoveryRate: "0.2", maximumAccountingMismatchShare: "0.01",
    maximumCashMismatchShare: "0.01", minimumMappedCashShare: "0.95", minimumLinkedAccountCashShare: "0.95",
  };
  const structureFields = [
    ["/structure/requestedFacility", "500"],
    ["/structure/requiredOvercollateralization", "1.2"],
    ["/structure/requiredSubordinationRate", "0.1"],
    ["/structure/actualSeniorAmount", "500"],
    ["/structure/actualMezzanineAmount", "0"],
    ["/structure/actualSubordinatedAmount", "400"],
    ["/structure/reserveRate", "0.02"],
    ["/structure/waterfall/availableCash", "100"],
    ["/structure/waterfall/servicingFeeDue", "5"],
    ["/structure/waterfall/seniorInterestDue", "10"],
    ["/structure/waterfall/seniorPrincipalDue", "50"],
    ["/structure/waterfall/reserveOpening", "10"],
    ["/structure/waterfall/mezzanineDue", "0"],
  ].map(([path, value]) => ({path, value}));
  return applyReceivablesSupplementPatch({
    draft: newReceivablesSupplementDraft(datasetHash),
    patch: {
      schemaVersion: receivablesSupplementPatchVersion,
      patchId: "seed-except-advance-rate",
      sourceDatasetHash: datasetHash,
      suppliedBy: {actorType: "document_worker", actorId: "worker-1", suppliedAt: "2026-09-07T00:00:00.000Z", evidence: [source("seed")]},
      sections: {
        cedent: {value: {id: "cedent-1", legalName: "Cedente S.A.", servicingRole: "cedent"}},
        titles: {value: [{
          sourceReceivableId: "title-1", debtorSector: "varejo", collectedInPeriod: "100",
          defaultedBalance: "0", recoveredInPeriod: "0", dilutionInPeriod: "0", repurchasedInPeriod: "0",
          substitutedInPeriod: "0", assignable: true, evidenceVerified: true, registration: "registered",
          encumbrance: "free", disputed: false, relatedParty: false,
        }]},
        cashReceipts: {value: [{
          id: "cash-1", receivedAt: "2026-08-31", amount: "100", sourceReceivableId: "title-1",
          debtorId: "debtor-1", linkedAccount: true, duplicateOf: null, sourceDocumentId: "bank-1",
          sourceAnchor: "row:2", anchorVerified: true,
        }]},
        accounting: {value: {grossReceivablesBalance: "900", allowanceBalance: "0", reportedCollectionsInPeriod: "100"}},
        policy: {value: policy},
      },
      fields: structureFields,
      evidence,
    },
  });
}

describe("agent operation brief worker", () => {
  it("builds active work memory only from the bound project, objective revision and source manifest", () => {
    const objectiveFingerprint = "c".repeat(64);
    const projectId = "ffffffff-ffff-4fff-8fff-ffffffffffff";
    const objectiveId = "11111111-1111-4111-8111-111111111111";
    const manifestId = "22222222-2222-4222-8222-222222222222";
    const workstream = {
      label: "Analisar", purpose: "Entender o caso", sources: [], analyses: ["crédito"],
      output: "análise", dependencies: [],
    };
    const compiled = governedActiveWorkContext(job.organization_id, {
      session_id: job.intake_session_id, message_id: job.payload.message_id, locale: "pt-BR",
      message: "Continue.", message_metadata: {}, brief: {}, snapshot_fingerprint: "d".repeat(64),
      projection_updated_at: "2026-09-07T02:00:00.000Z", manifest_id: manifestId,
      project: {id: projectId, name: "Projeto Camil", entryJob: "capital_planning", accessBasis: "authorized_private", phase: "analyze", status: "active"},
      latest_execution_brief: {
        id: objectiveId, version: 4, fingerprint: objectiveFingerprint,
        visibleSnapshot: {
          schemaVersion: "execution-brief.v1", fingerprint: objectiveFingerprint, locale: "pt-BR",
          objective: "Preparar decisão de capital", currentContext: [], proposedDeliverable: "Memo",
          workstreams: [workstream, {...workstream, label: "Estruturar"}, {...workstream, label: "Revisar"}],
          assumptions: [], checkpoints: [], executionMode: "start_after_display",
        },
      },
      company_profile: {}, professional_context: null, institution_capabilities: null, organization_methodology: null,
      related_project_memory: [], documents: [{id: "33333333-3333-4333-8333-333333333333", name: "Balanço.xlsx", kind: "financial", status: "ready"}],
      tasks: [], artifacts: [],
      recent_messages: [{id: "44444444-4444-4444-8444-444444444444", role: "assistant", content: "Segredo histórico que não é evidência", created_at: "2026-09-07T01:00:00.000Z"}],
    });
    expect(compiled).toMatchObject({
      context: {
        organizationId: job.organization_id, projectId, revision: 4,
        objective: {id: objectiveId, revision: 4, fingerprint: objectiveFingerprint},
        sourceManifest: {id: manifestId, fingerprint: "d".repeat(64), documentIds: ["33333333-3333-4333-8333-333333333333"]},
      },
      binding: {
        objectiveId, objectiveRevision: 4, sourceManifestId: manifestId,
        sourceManifestDocumentIds: ["33333333-3333-4333-8333-333333333333"],
        sourceManifestEvidenceObjectIds: [projectId, objectiveId],
        sourceManifestMembershipFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
        activeWorkObjectBindings: expect.arrayContaining([
          expect.objectContaining({id: expect.stringMatching(/^project:/), fingerprint: expect.stringMatching(/^[a-f0-9]{64}$/)}),
        ]),
      },
    });
    expect(JSON.stringify(compiled)).not.toContain("Segredo histórico");
  });

  it("applies a bound R01 answer without a model and records the resulting draft revision", async () => {
    let storedPatch: Record<string, unknown> | undefined;
    let response: Record<string, unknown> | undefined;
    let completion: Record<string, unknown> | undefined;
    const queue = {
      writeStage: async () => {},
      loadAgentContext: async () => ({
        session_id: job.intake_session_id,
        message_id: job.payload.message_id,
        locale: "pt-BR",
        message: "72,5%",
        message_metadata: {kind: "information_request_response"},
        answered_information_request: {
          id: "10000000-0000-4000-8000-000000000001",
          requirementKey: "receivables.r01.field.structure.advance_rate",
          question: "Qual advance rate devemos testar?",
          answerKind: "number",
          answerSource: "custom",
          sourceNamespace: "receivables_method_r01_fields",
          answeredAt: "2026-09-07T02:00:00.000Z",
          answeredBy: "20000000-0000-4000-8000-000000000001",
          producerBinding: {
            schemaVersion: "receivables-information-request-binding.v1",
            methodId: "R01", sourceDatasetHash: "a".repeat(64),
            fieldPath: "/structure/advanceRate", valueKind: "percentage",
            unit: "percent_0_100", minimum: 0, maximum: 100, options: [],
          },
        },
        brief: {}, snapshot_fingerprint: "a".repeat(64),
        projection_updated_at: "2026-09-07T02:00:00.000Z", manifest_id: null,
        project: {id: "ffffffff-ffff-4fff-8fff-ffffffffffff", name: "Aurora", entryJob: "capital_planning", accessBasis: "authorized_private", phase: "analyze", status: "active"},
        company_profile: {}, documents: [], tasks: [], artifacts: [], recent_messages: [],
      }),
      loadReceivablesMethodSupplementDraft: async () => null,
      applyReceivablesMethodSupplementPatch: async (_job: unknown, input: {patch: unknown; nextDraft: unknown}) => {
        storedPatch = input as unknown as Record<string, unknown>;
        return {patchId: "30000000-0000-4000-8000-000000000001", draftId: "40000000-0000-4000-8000-000000000001", revision: 1, draftFingerprint: "b".repeat(64), replayed: false};
      },
      enqueueReceivablesMethodRefresh: async () => { throw new Error("incomplete input must not start a refresh"); },
      recordAgentResponse: async (_job: unknown, _id: string, value: unknown) => { response = value as Record<string, unknown>; return {}; },
      complete: async (_job: unknown, value: unknown) => { completion = value as Record<string, unknown>; },
      recordAgentFailure: async () => {},
      fail: async () => { throw new Error("must not fail"); },
    } as unknown as QueueClient;
    const gateway = {
      complete: async () => { throw new Error("a governed field answer must not call a model"); },
      spent: () => ({costUsd: 0, calls: 0}),
    } as unknown as ModelGateway;

    const result = await processAgentOperationBriefJob(job, {queue, gateway, log: () => {}, shadowRouting: false});

    expect(result.status).toBe("succeeded");
    expect(storedPatch).toMatchObject({
      patch: {fields: [{path: "/structure/advanceRate", value: "0.725"}]},
      nextDraft: {revision: 1},
    });
    expect(response?.reply).toContain("input confirmado do modelo R01");
    expect(completion).toMatchObject({
      mode: "governed_receivables_information_response",
      draftRevision: 1,
      draftState: "incomplete",
      refreshProcessingRunId: null,
    });
  });

  it("starts one bounded refresh when a governed answer completes the R01 draft", async () => {
    const priorDraft = r01DraftMissingAdvanceRate();
    expect(compileReceivablesSupplementDraft(priorDraft)).toMatchObject({
      state: "incomplete",
      missingSections: ["structure.advanceRate"],
    });
    let storedDraft: unknown;
    let refreshFingerprint = "";
    let completion: Record<string, unknown> | undefined;
    const queue = {
      writeStage: async () => {},
      loadAgentContext: async () => ({
        session_id: job.intake_session_id,
        message_id: job.payload.message_id,
        locale: "pt-BR",
        message: "72,5%",
        message_metadata: {kind: "information_request_response"},
        answered_information_request: {
          id: "10000000-0000-4000-8000-000000000001",
          requirementKey: "receivables.r01.field.structure.advance_rate",
          question: "Qual advance rate devemos testar?",
          answerKind: "number",
          answerSource: "custom",
          sourceNamespace: "receivables_method_r01_fields",
          answeredAt: "2026-09-07T02:00:00.000Z",
          answeredBy: "20000000-0000-4000-8000-000000000001",
          producerBinding: {
            schemaVersion: "receivables-information-request-binding.v1",
            methodId: "R01", sourceDatasetHash: "a".repeat(64),
            fieldPath: "/structure/advanceRate", valueKind: "percentage",
            unit: "percent_0_100", minimum: 0, maximum: 100, options: [],
          },
        },
        brief: {}, snapshot_fingerprint: "a".repeat(64),
        projection_updated_at: "2026-09-07T02:00:00.000Z", manifest_id: null,
        project: {id: "ffffffff-ffff-4fff-8fff-ffffffffffff", name: "Aurora", entryJob: "capital_planning", accessBasis: "authorized_private", phase: "analyze", status: "active"},
        company_profile: {}, documents: [], tasks: [], artifacts: [], recent_messages: [],
      }),
      loadReceivablesMethodSupplementDraft: async () => priorDraft,
      applyReceivablesMethodSupplementPatch: async (_job: unknown, input: {nextDraft: unknown}) => {
        storedDraft = input.nextDraft;
        return {
          patchId: "30000000-0000-4000-8000-000000000001",
          draftId: "40000000-0000-4000-8000-000000000001",
          revision: 2,
          draftFingerprint: "f".repeat(64),
          replayed: false,
        };
      },
      enqueueReceivablesMethodRefresh: async (_job: unknown, input: {
        draftFingerprint: string;
        compiledSupplementFingerprint: string;
      }) => {
        refreshFingerprint = input.draftFingerprint;
        expect(input.compiledSupplementFingerprint).toMatch(/^[a-f0-9]{64}$/);
        return {
          processingRunId: "50000000-0000-4000-8000-000000000001",
          jobId: "60000000-0000-4000-8000-000000000001",
          compiledSupplementFingerprint: input.compiledSupplementFingerprint,
          replayed: false,
        };
      },
      recordAgentResponse: async () => ({}),
      complete: async (_job: unknown, value: unknown) => { completion = value as Record<string, unknown>; },
      recordAgentFailure: async () => {},
      fail: async () => { throw new Error("must not fail"); },
    } as unknown as QueueClient;
    const gateway = {
      complete: async () => { throw new Error("a governed field answer must not call a model"); },
      spent: () => ({costUsd: 0, calls: 0}),
    } as unknown as ModelGateway;

    const result = await processAgentOperationBriefJob(job, {queue, gateway, log: () => {}, shadowRouting: false});

    expect(result.status).toBe("succeeded");
    expect(compileReceivablesSupplementDraft(storedDraft)).toMatchObject({state: "complete", missingSections: []});
    expect(refreshFingerprint).toBe("f".repeat(64));
    expect(completion).toMatchObject({
      draftState: "complete",
      refreshProcessingRunId: "50000000-0000-4000-8000-000000000001",
    });
  });

  it.each([
    {
      continuation: "a governed answer",
      message: "Alternativas de estrutura de capital mais amplas",
      answeredInformationRequest: {
        id: "55555555-5555-4555-8555-555555555555",
        requirementKey: "case01_scope",
        question: "Você quer uma leitura de refinanciamento ou alternativas mais amplas?",
        answerSource: "choice" as const,
      },
      messageMetadata: {kind: "information_request_response"},
      recentMessages: [{
        id: "44444444-4444-4444-8444-444444444444",
        role: "user" as const,
        content: "Sou analista no time de Investment Banking. Meu VP me pediu para preparar material para uma reunião com a Camil na segunda. Ele falou em refinanciamento, mas não disse que tese quer levar nem que formato espera.",
        created_at: "2026-09-07T11:55:00.000Z",
      }],
      artifacts: [],
      priorSelection: null,
    },
    {
      continuation: "a plan adjustment",
      message: "Na comparação, priorize flexibilidade antes de custo e preserve caixa mínimo.",
      answeredInformationRequest: undefined,
      messageMetadata: {kind: "execution_brief_edit"},
      recentMessages: [{
        id: "44444444-4444-4444-8444-444444444444",
        role: "user" as const,
        content: "Sou analista no time de Investment Banking. Meu VP me pediu para preparar material para uma reunião com a Camil na segunda. Ele falou em refinanciamento, mas não disse que tese quer levar nem que formato espera.",
        created_at: "2026-09-07T11:55:00.000Z",
      }],
      artifacts: [],
      priorSelection: null,
    },
    {
      continuation: "a premise change after the opening turn left recent memory",
      message: "Altere a taxa da nova dívida para 15,50% a.a.",
      answeredInformationRequest: undefined,
      messageMetadata: {},
      recentMessages: [],
      artifacts: [{
        id: "33333333-3333-4333-8333-333333333333",
        type: "preview_alternatives", version: 1, status: "ready",
      }],
      priorSelection: {
        schemaVersion: "workflow-recipe-selection.v1" as const,
        status: "selected" as const,
        reason: "selected" as const,
        recipeId: "refinance-liability-management",
        recipeVersion: "2026.09.07-v1",
        recipeFingerprint: "1".repeat(64),
        sliceFingerprint: "2".repeat(64),
        outcome: "meeting_plan" as const,
        taskIds: ["C05", "S10"],
        parallelBatches: [["C05"], ["S10"]],
        activatedEconomicPacks: ["objective.refinance-liability-management"],
        fingerprint: "3".repeat(64),
      },
    },
  ])("persists the selected recipe before an integration preview activation for $continuation", async ({
    message,
    answeredInformationRequest,
    messageMetadata,
    recentMessages,
    artifacts,
    priorSelection,
  }) => {
    const events: string[] = [];
    let selectedWorkflow: Record<string, unknown> | undefined;
    const previewJob: AgentOperationBriefJob = {
      ...job,
      integration_preview: true,
      integration_preview_mode: "deterministic",
    };
    const queue = {
      writeStage: async () => {},
      loadIntegrationPreviewArtifacts: async () => [],
      loadAgentContext: async () => ({
        session_id: job.intake_session_id,
        message_id: job.payload.message_id,
        locale: "pt-BR",
        message,
        answered_information_request: answeredInformationRequest,
        message_metadata: messageMetadata,
        brief: {}, snapshot_fingerprint: "a".repeat(64),
        projection_updated_at: "2026-09-07T12:00:00.000Z", manifest_id: null,
        project: {
          id: "ffffffff-ffff-4fff-8fff-ffffffffffff", name: "Camil · reunião",
          entryJob: "origination_thesis", accessBasis: "public_information",
          phase: "understand", status: "active",
        },
        active_plan: capitalProjectPlanSnapshot("origination_thesis"),
        company_profile: {name: "Camil"}, documents: [], tasks: [], artifacts,
        recent_messages: recentMessages,
      }),
      loadLatestObjectiveWorkflowSelection: async () => priorSelection,
      recordObjectivePlanPreflight: async (_job: unknown, input: {workflowSelection: unknown}) => {
        events.push("selection");
        selectedWorkflow = input.workflowSelection as Record<string, unknown>;
        return {
          id: "99999999-9999-4999-8999-999999999999",
          status: "blocked" as const, terminalReachable: false, replayed: false,
          specializationId: "88888888-8888-4888-8888-888888888888",
          specializationFingerprint: "c".repeat(64), packIds: ["core.institutional-dcm"],
          minimumMaturity: "implemented" as const, specializationReplayed: false,
          methodBindingId: "77777777-7777-4777-8777-777777777777",
          methodBindingFingerprint: "d".repeat(64), methodBindingStatus: "partial" as const,
          boundTaskIds: [], specialistTaskIds: [], methodBindingReplayed: false,
          workflowSelectionId: "66666666-6666-4666-8666-666666666666",
          workflowSelectionFingerprint: (input.workflowSelection as {fingerprint: string}).fingerprint,
          workflowSelectionStatus: "selected" as const,
          workflowSelectionReason: "selected", workflowSelectionReplayed: false,
        };
      },
      recordAgentResponse: async () => { events.push("activation"); return {}; },
      complete: async () => {}, recordAgentFailure: async () => {},
      fail: async () => { throw new Error("must not fail"); },
    } as unknown as QueueClient;
    const gateway = {
      complete: async () => { throw new Error("deterministic preview must not call a model"); },
      spent: () => ({costUsd: 0, calls: 0}),
    } as unknown as ModelGateway;

    const result = await processAgentOperationBriefJob(previewJob, {queue, gateway, log: () => {}, shadowRouting: false});
    expect(result.status).toBe("succeeded");
    expect(events).toEqual(["selection", "activation"]);
    expect(selectedWorkflow).toMatchObject({
      status: "selected",
      recipeId: "refinance-liability-management",
      outcome: "meeting_plan",
    });
  });

  it("persists only closed diagnostics when the live router fails", async () => {
    let completion: Record<string, unknown> | undefined;
    let failedStage: Record<string, unknown> | undefined;
    let response: Record<string, unknown> | undefined;
    let logged: Record<string, unknown> | undefined;
    const previewJob: AgentOperationBriefJob = {
      ...job,
      integration_preview: true,
      integration_preview_mode: "live",
    };
    const queue = {
      writeStage: async (_job: unknown, stage: string, status: string, detail: unknown) => {
        if (stage === "live_preview:understand" && status === "failed") failedStage = detail as Record<string, unknown>;
      },
      loadIntegrationPreviewArtifacts: async () => [],
      loadAgentContext: async () => ({
        session_id: job.intake_session_id,
        message_id: job.payload.message_id,
        locale: "pt-BR",
        message: "Prepare uma análise da companhia.",
        message_metadata: {},
        brief: {}, snapshot_fingerprint: "a".repeat(64),
        projection_updated_at: "2026-09-07T12:00:00.000Z", manifest_id: null,
        project: {
          id: "ffffffff-ffff-4fff-8fff-ffffffffffff", name: "Projeto",
          entryJob: "origination_thesis", accessBasis: "authorized_private",
          phase: "understand", status: "active",
        },
        company_profile: {}, documents: [], tasks: [], artifacts: [], recent_messages: [],
      }),
      recordAgentResponse: async (_job: unknown, _id: string, value: unknown) => {
        response = value as Record<string, unknown>;
        return {};
      },
      complete: async (_job: unknown, value: unknown) => { completion = value as Record<string, unknown>; },
      recordAgentFailure: async () => {},
      fail: async () => { throw new Error("must not fail"); },
    } as unknown as QueueClient;
    const gateway = {
      complete: async () => { throw new ModelGatewayError("customer-secret-provider-message", "CLIENT_SECRET_FROM_PROVIDER" as never); },
      spent: () => ({costUsd: Number.NaN, calls: Number.POSITIVE_INFINITY, unknownCostCalls: -1, budgetExposureUsd: 20_000, futureMetadata: "customer-secret-spend"}),
    } as unknown as ModelGateway;
    const maliciousCall = {
      invocationId: "10000000-0000-4000-8000-000000000001",
      task: "route_intent", provider: "anthropic", model: "customer-secret-model", effort: "low",
      outcome: "error", promptFingerprint: "a".repeat(64), inputFingerprint: "b".repeat(64), outputFingerprint: "c".repeat(64),
      usage: {inputTokens: 10, outputTokens: 0, cachedInputTokens: 0}, costUsd: 0.03, costStatus: "unknown",
      latencyMs: 100, stopReason: "other", usedFallback: false, fromCassette: false,
      schemaName: "customer-secret-schema", providerError: {name: "customer-secret-error", status: 503, code: "customer-secret-code"},
      validationIssues: [{path: "customer.secret.path", code: "customer-secret-code", message: "customer-secret-message"}],
    } satisfies GatewayCallLog;

    const result = await processAgentOperationBriefJob(previewJob, {
      queue,
      gateway,
      modelLineage: () => [maliciousCall],
      log: (event, detail) => { if (event === "live_preview.router_failed") logged = detail; },
      shadowRouting: false,
    });

    expect(result.status).toBe("succeeded");
    expect(response?.reply).toContain("ficou indisponível");
    expect(completion).toMatchObject({
      decision: "router_failed",
      failureCode: "unknown",
      spend: {costUsd: null, calls: null, unknownCostCalls: null, budgetExposureUsd: null},
    });
    expect(failedStage).toMatchObject({code: "live_router_failed", failureCode: "unknown"});
    expect(logged).toMatchObject({code: "unknown"});
    const persisted = JSON.stringify({response, completion, failedStage, logged});
    expect(persisted).not.toContain("customer-secret");
  });

  it("never exposes a provider-controlled model identifier on a successful live turn", async () => {
    let envelopeRecord: unknown;
    let completion: unknown;
    let stage: unknown;
    let response: unknown;
    let logged: unknown;
    const previewJob: AgentOperationBriefJob = {...job, integration_preview: true, integration_preview_mode: "live"};
    const queue = {
      loadIntegrationPreviewArtifacts: async () => [],
      loadAgentContext: async () => ({
        session_id: job.intake_session_id, message_id: job.payload.message_id, locale: "pt-BR",
        message: "Analise a Magazine Luiza.", message_metadata: {}, brief: {}, snapshot_fingerprint: "a".repeat(64),
        projection_updated_at: "2026-09-07T12:00:00.000Z", manifest_id: null,
        project: {id: "ffffffff-ffff-4fff-8fff-ffffffffffff", name: "Projeto", entryJob: "origination_thesis", accessBasis: "public_information", phase: "understand", status: "active"},
        company_profile: {}, documents: [], tasks: [], artifacts: [], recent_messages: [],
      }),
      recordIntentEnvelope: async (_job: unknown, value: unknown) => { envelopeRecord = value; },
      recordAgentResponse: async (_job: unknown, _id: string, value: unknown) => { response = value; return {}; },
      writeStage: async (_job: unknown, name: string, status: string, value: unknown) => {
        if (name === "live_preview:understand" && status === "succeeded") stage = value;
      },
      complete: async (_job: unknown, value: unknown) => { completion = value; },
      recordAgentFailure: async () => {}, fail: async () => { throw new Error("must not fail"); },
    } as unknown as QueueClient;
    let completed = 0;
    const gateway = {
      complete: async (request: {task: string; schemaName: string}) => {
        completed += 1;
        const live = validLiveRoutingOutput();
        let output: unknown;
        if (request.task === "extract_semantic_objects") output = {
          objects: [{candidateId: "candidate-1", kind: "company", head: {key: "entity", span: {source: "latest_user_message", messageIndex: null, start: 10, end: 24, text: "Magazine Luiza"}}, modifiers: []}],
          activeContextReferences: [], unresolvedReferences: [], excludedQuantitativeSpans: [],
        };
        else if (request.schemaName === "live_preview_turn_output") output = {turn: live.turn};
        else { const {turn: _turn, ...route} = live; output = route; }
        return {
          output, model: "CLIENT_SECRET_MODEL", provider: "anthropic", effort: "low", costUsd: 0.02, latencyMs: 1,
          retryOrdinal: 0, isSameModelRepair: false, usedProviderFallback: false,
          attempts: [{provider: "anthropic", model: "CLIENT_SECRET_MODEL", outcome: "ok"}],
        };
      },
      spent: () => ({costUsd: completed * 0.02, calls: completed, unknownCostCalls: 0, budgetExposureUsd: completed * 0.02}),
    } as unknown as ModelGateway;

    const result = await processAgentOperationBriefJob(previewJob, {
      queue, gateway, shadowRouting: false,
      log: (event, detail) => { if (event === "live_preview.turn_routed") logged = detail; },
    });

    expect(result.status).toBe("succeeded");
    expect(envelopeRecord).toMatchObject({model: "governed_model_route", costUsd: 0.06});
    expect(envelopeRecord).toMatchObject({classifier: {
      routingAttempt: {provider: "anthropic", model: "unknown"},
      semanticObjectAttempt: {provider: "anthropic", model: "unknown"},
      previewTurnAttempt: {provider: "anthropic", model: "unknown"},
    }});
    expect(stage).toMatchObject({modelRoute: "governed_model_route", costUsd: 0.06, calls: 3});
    expect(logged).toMatchObject({modelRoute: "governed_model_route", costUsd: 0.06, calls: 3});
    expect(JSON.stringify({result, envelopeRecord, response, stage, completion, logged})).not.toContain("CLIENT_SECRET_MODEL");
  });

  it("fails closed when a valid live response arrives with invalid spend telemetry", async () => {
    let envelopeWrites = 0;
    let completion: unknown;
    let stage: unknown;
    let response: unknown;
    let logged: unknown;
    const previewJob: AgentOperationBriefJob = {...job, integration_preview: true, integration_preview_mode: "live"};
    const queue = {
      loadIntegrationPreviewArtifacts: async () => [],
      loadAgentContext: async () => ({
        session_id: job.intake_session_id, message_id: job.payload.message_id, locale: "pt-BR",
        message: "Analise a Magazine Luiza.", message_metadata: {}, brief: {}, snapshot_fingerprint: "a".repeat(64),
        projection_updated_at: "2026-09-07T12:00:00.000Z", manifest_id: null,
        project: {id: "ffffffff-ffff-4fff-8fff-ffffffffffff", name: "Projeto", entryJob: "origination_thesis", accessBasis: "public_information", phase: "understand", status: "active"},
        company_profile: {}, documents: [], tasks: [], artifacts: [], recent_messages: [],
      }),
      recordIntentEnvelope: async () => { envelopeWrites += 1; },
      recordAgentResponse: async (_job: unknown, _id: string, value: unknown) => { response = value; return {}; },
      writeStage: async (_job: unknown, name: string, status: string, value: unknown) => {
        if (name === "live_preview:understand" && status === "failed") stage = value;
      },
      complete: async (_job: unknown, value: unknown) => { completion = value; },
      recordAgentFailure: async () => {}, fail: async () => {},
    } as unknown as QueueClient;
    let completed = false;
    const gateway = {
      complete: async () => {
        completed = true;
        return {output: validLiveRoutingOutput(), model: "CLIENT_SECRET_MODEL", provider: "anthropic"};
      },
      spent: () => completed
        ? {costUsd: Number.NaN, calls: Number.POSITIVE_INFINITY, unknownCostCalls: 0, budgetExposureUsd: 20_000}
        : {costUsd: 0, calls: 0, unknownCostCalls: 0, budgetExposureUsd: 0},
    } as unknown as ModelGateway;

    const result = await processAgentOperationBriefJob(previewJob, {
      queue, gateway, shadowRouting: false,
      log: (event, detail) => { if (event === "live_preview.router_failed") logged = detail; },
    });

    expect(["succeeded", "failed"]).toContain(result.status);
    expect(envelopeWrites).toBe(0);
    expect(stage).toMatchObject({code: "live_router_failed", failureCode: "unknown"});
    expect(completion).toMatchObject({decision: "router_failed", spend: {costUsd: null, calls: null}});
    const persisted = JSON.stringify({result, response, stage, completion, logged});
    expect(persisted).not.toContain("CLIENT_SECRET_MODEL");
    expect(persisted).not.toMatch(/NaN|Infinity|20000/);
  });

  it("logs only a closed code when shadow routing receives invalid telemetry", async () => {
    let envelopeWrites = 0;
    let shadowLog: unknown;
    const previewJob: AgentOperationBriefJob = {...job, integration_preview: true, integration_preview_mode: "deterministic"};
    const queue = {
      loadIntegrationPreviewArtifacts: async () => [],
      loadAgentContext: async () => ({
        session_id: job.intake_session_id, message_id: job.payload.message_id, locale: "pt-BR",
        message: "Não sei por onde começar.", message_metadata: {}, brief: {}, snapshot_fingerprint: "a".repeat(64),
        projection_updated_at: "2026-09-07T12:00:00.000Z", manifest_id: null,
        project: {id: "ffffffff-ffff-4fff-8fff-ffffffffffff", name: "Projeto", entryJob: "origination_thesis", accessBasis: "public_information", phase: "understand", status: "active"},
        company_profile: {}, documents: [], tasks: [], artifacts: [], recent_messages: [],
      }),
      recordIntentEnvelope: async () => { envelopeWrites += 1; },
      recordAgentResponse: async () => ({}), writeStage: async () => {}, complete: async () => {},
      recordAgentFailure: async () => {}, fail: async () => {},
    } as unknown as QueueClient;
    let completed = false;
    const gateway = {
      complete: async () => {
        completed = true;
        return {output: validLiveRoutingOutput("Camil"), model: "CLIENT_SECRET_MODEL", provider: "anthropic"};
      },
      spent: () => completed
        ? {costUsd: Number.NaN, calls: Number.POSITIVE_INFINITY, unknownCostCalls: 0, budgetExposureUsd: 20_000}
        : {costUsd: 0, calls: 0, unknownCostCalls: 0, budgetExposureUsd: 0},
    } as unknown as ModelGateway;

    const result = await processAgentOperationBriefJob(previewJob, {
      queue, gateway,
      log: (event, detail) => { if (event === "agent_operation_brief.shadow_routing_failed") shadowLog = detail; },
    });

    expect(["succeeded", "failed"]).toContain(result.status);
    expect(envelopeWrites).toBe(0);
    expect(shadowLog).toMatchObject({job: job.job_id, code: "unknown", modelDiagnostics: []});
    expect(JSON.stringify(shadowLog)).not.toMatch(/CLIENT_SECRET_MODEL|invalid_model_telemetry|NaN|Infinity|20000/);
  });

  it("starts public company research and asks meeting context in parallel without a routing model call", async () => {
    let activation: unknown;
    let response: Record<string, unknown> | undefined;
    let modelCalls = 0;
    const queue = {
      writeStage: async () => {},
      loadAgentContext: async () => ({
        session_id: job.intake_session_id,
        message_id: job.payload.message_id,
        locale: "pt-BR",
        message: "Tenho uma reunião amanhã com a Camil Alimentos S.A. e quero preparar um pitch com alternativas estratégicas de endividamento.",
        brief: {}, snapshot_fingerprint: "a".repeat(64),
        projection_updated_at: "2026-09-02T12:00:00.000Z", manifest_id: null,
        project: {
          id: "ffffffff-ffff-4fff-8fff-ffffffffffff", name: "Reunião Camil",
          entryJob: "origination_thesis", accessBasis: "public_information",
          phase: "understand", status: "active",
        },
        active_plan: capitalProjectPlanSnapshot("origination_thesis"),
        company_profile: {}, documents: [], tasks: [], artifacts: [], recent_messages: [],
      }),
      recordAgentResponse: async (_job: unknown, _id: string, value: unknown, _proposal: unknown, activated: unknown) => {
        response = value as Record<string, unknown>;
        activation = activated;
        return {};
      },
      complete: async () => {}, recordAgentFailure: async () => {},
      fail: async () => { throw new Error("must not fail"); },
    } as unknown as QueueClient;
    const gateway = {
      complete: async () => {
        modelCalls += 1;
        throw new Error("the initial public route must be deterministic");
      },
      spent: () => ({costUsd: 0, calls: modelCalls}),
    } as unknown as ModelGateway;

    const result = await processAgentOperationBriefJob(job, {queue, gateway, log: () => {}, shadowRouting: false});
    expect(result.status).toBe("succeeded");
    expect(modelCalls).toBe(0);
    expect(activation).toMatchObject({
      job: "origination_thesis", company: {name: "Camil Alimentos S.A."},
    });
    expect(response).toMatchObject({state: "asking"});
    expect(response?.reply).toContain("Enquanto essa leitura avança");
    expect((response?.clarification as Record<string, unknown>)?.question).toContain("Com quem será a conversa");
    expect((response?.clarification as Record<string, unknown>)?.question).toContain("relacionamento ou exposição");
  });

  it("activates capital planning deterministically when company and intent are already explicit", async () => {
    let activation: unknown;
    let objectivePreflightInput: {objectivePlan: unknown; preflightDecision: unknown; specialization: unknown; methodBinding: unknown; workflowSelection: unknown; dispatchCandidate: unknown} | undefined;
    const queue = {
      writeStage: async () => {},
      loadAgentContext: async () => ({
        session_id: job.intake_session_id,
        message_id: job.payload.message_id,
        locale: "pt-BR",
        message: "Quero comparar alternativas de dívida com recebíveis para financiar a expansão da Camil.",
        brief: {}, snapshot_fingerprint: "a".repeat(64),
        projection_updated_at: "2026-09-02T12:00:00.000Z", manifest_id: null,
        project: {
          id: "ffffffff-ffff-4fff-8fff-ffffffffffff", name: "Camil · capital",
          entryJob: "capital_planning", accessBasis: "public_information",
          phase: "understand", status: "active",
        },
        active_plan: capitalProjectPlanSnapshot("capital_planning"),
        company_profile: {name: "Camil"}, documents: [], tasks: [], artifacts: [], recent_messages: [],
      }),
      recordAgentResponse: async (_job: unknown, _id: string, _response: unknown, _proposal: unknown, value: unknown) => {
        activation = value;
        return {};
      },
      recordObjectivePlanPreflight: async (_job: unknown, input: {objectivePlan: unknown; preflightDecision: unknown; specialization: unknown; methodBinding: unknown; workflowSelection: unknown; dispatchCandidate: unknown}) => {
        objectivePreflightInput = input;
        return {
          id: "99999999-9999-4999-8999-999999999999",
          status: "blocked" as const,
          terminalReachable: false,
          replayed: false,
          specializationId: "88888888-8888-4888-8888-888888888888",
          specializationFingerprint: "c".repeat(64),
          packIds: ["core.institutional-dcm", "objective.capex-expansion", "analysis.receivables-underwriting"],
          minimumMaturity: "implemented" as const,
          specializationReplayed: false,
          methodBindingId: "77777777-7777-4777-8777-777777777777",
          methodBindingFingerprint: "d".repeat(64),
          methodBindingStatus: "partial" as const,
          boundTaskIds: ["R01"],
          specialistTaskIds: ["R01"],
          methodBindingReplayed: false,
        };
      },
      complete: async () => {}, recordAgentFailure: async () => {},
      fail: async () => { throw new Error("must not fail"); },
    } as unknown as QueueClient;
    const gateway = {
      complete: async () => { throw new Error("deterministic activation must not call a model"); },
      spent: () => ({costUsd: 0, calls: 0}),
    } as unknown as ModelGateway;
    const result = await processAgentOperationBriefJob(job, {queue, gateway, log: () => {}, shadowRouting: false});
    expect(result.status).toBe("succeeded");
    expect(activation).toMatchObject({
      job: "capital_planning", company: {name: "Camil"},
      brief: {capitalIntent: "Quero comparar alternativas de dívida com recebíveis para financiar a expansão da Camil."},
    });
    expect(objectivePreflightInput).toMatchObject({
      objectivePlan: {
        schemaVersion: "objective-plan.v1",
        objectiveKind: "capital_strategy",
        entryJob: "capital_planning",
      },
      preflightDecision: {
        schemaVersion: "objective-plan-readiness.v1",
        status: "blocked",
        terminalReachable: false,
      },
      specialization: {
        schemaVersion: "objective-specialization.v1",
        selectedPackIds: expect.arrayContaining([
          "core.institutional-dcm",
          "objective.capex-expansion",
          "analysis.receivables-underwriting",
        ]),
        profile: {
          minimumMaturity: "implemented",
        },
      },
      methodBinding: {
        schemaVersion: "objective-method-binding.v1",
        status: "partial",
        specialistTaskIds: ["R01"],
        bindings: [expect.objectContaining({
          taskId: "R01",
          procedure: {id: "underwrite-receivables-pool", version: "2026.09.06-v1"},
        })],
      },
      workflowSelection: {
        schemaVersion: "workflow-recipe-selection.v1",
        status: "blocked",
        reason: "economic_situation_not_implemented",
        taskIds: [],
      },
      dispatchCandidate: {
        schemaVersion: "universal-dispatch-candidate.v1",
        mode: "internal_shadow",
        status: "blocked",
        tasks: [],
        willExecute: false,
        externalEffectAllowed: false,
      },
    });
    const preflight = objectivePreflightInput?.preflightDecision as {
      tasks: Array<{taskId: string; executorKey: string | null; reasons: Array<{code: string}>}>;
    };
    const receivables = preflight.tasks.find((task) => task.taskId === "R01");
    expect(receivables?.executorKey).toBe("@offroad/receivables-analysis#underwriteReceivablesPool");
    expect(receivables?.reasons.map((reason) => reason.code)).toEqual(expect.arrayContaining([
      "capability_not_live",
      "evidence_regime_not_allowed",
      "data_class_not_allowed",
    ]));
    expect(receivables?.reasons.map((reason) => reason.code)).not.toContain("executor_unbound");
  });

  it("activates a released public DAG in the same project with zero routing model calls", async () => {
    let modelCalls = 0;
    let recordedBrief: Record<string, unknown> | undefined;
    let recordedActivation: Record<string, unknown> | undefined;
    let completed: Record<string, unknown> | undefined;
    const queue = {
      writeStage: async () => {},
      loadAgentContext: async () => ({
        session_id: job.intake_session_id,
        message_id: job.payload.message_id,
        locale: "pt-BR",
        message: "Quero entender os riscos e a capacidade de dívida antes de escolher uma operação.",
        brief: {},
        approval_input_fingerprint: "b".repeat(64),
        snapshot_fingerprint: "a".repeat(64),
        projection_updated_at: "2026-09-01T12:00:00.000Z",
        manifest_id: null,
        project: {
          id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
          name: "Camil · dívida",
          entryJob: "company_debt_view",
          accessBasis: "public_information",
          phase: "understand",
          status: "active",
        },
        active_plan: capitalProjectPlanSnapshot("company_debt_view"),
        company_profile: {name: "Camil", website: "https://ri.camil.com.br"},
        documents: [],
        tasks: [],
        artifacts: [],
        recent_messages: [],
      }),
      recordAgentResponse: async (
        _job: unknown,
        _messageId: string,
        _response: unknown,
        _proposal: unknown,
        activation: unknown,
        executionBrief: unknown,
      ) => {
        recordedBrief = executionBrief as Record<string, unknown>;
        recordedActivation = activation as Record<string, unknown>;
        return {};
      },
      complete: async (_job: unknown, result: unknown) => { completed = result as Record<string, unknown>; },
      recordAgentFailure: async () => {},
      recordIntentEnvelope: async () => {},
      fail: async () => { throw new Error("must not fail"); },
    } as unknown as QueueClient;
    const gateway = {
      complete: async () => {
        modelCalls += 1;
        throw new Error("the deterministic route must not call a model");
      },
      spent: () => ({costUsd: 0, calls: modelCalls}),
    } as unknown as ModelGateway;

    const result = await processAgentOperationBriefJob(job, {queue, gateway, log: () => {}, shadowRouting: false});
    expect(result.status).toBe("succeeded");
    expect(modelCalls).toBe(0);
    expect(recordedActivation).toMatchObject({job: "company_debt_view", company: {name: "Camil"}});
    expect(recordedBrief).toMatchObject({expectedInputFingerprint: "b".repeat(64), visible: {executionMode: "confirm_before_expensive_work"}});
    expect(completed).toMatchObject({activated_job: "company_debt_view", spend: {costUsd: 0, calls: 0}});
  });

  it("uses the latest turn locale without forking a project that started in Portuguese", async () => {
    let modelInput = "";
    let recordedResponse: Record<string, unknown> | undefined;
    const queue = {
      writeStage: async () => {},
      loadAgentContext: async () => ({
        session_id: job.intake_session_id,
        message_id: job.payload.message_id,
        locale: "en-US",
        message: "Please continue in English and tell me the next step.",
        brief: {currency: "BRL"},
        snapshot_fingerprint: "a".repeat(64),
        projection_updated_at: "2026-09-01T12:00:00.000Z",
        manifest_id: null,
        project: {
          id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
          name: "Projeto Cedro",
          entryJob: "capital_planning",
          accessBasis: "authorized_private",
          phase: "understand",
          status: "active",
        },
        active_plan: capitalProjectPlanSnapshot("capital_planning"),
        company_profile: {companyName: "Cedro"},
        documents: [],
        tasks: [{taskId: "M01", label: "Resolver companhia, grupo, jurisdição e regime de evidência", ordinal: 0, status: "succeeded"}],
        artifacts: [],
        recent_messages: [{
          id: "33333333-3333-4333-8333-333333333333",
          role: "assistant" as const,
          content: "Estou organizando o entendimento inicial.",
          created_at: "2026-09-01T11:59:00.000Z",
        }],
      }),
      recordAgentResponse: async (_job: unknown, _messageId: string, response: unknown) => {
        recordedResponse = response as Record<string, unknown>;
        return {};
      },
      complete: async () => {},
      recordAgentFailure: async () => {},
      recordIntentEnvelope: async () => {},
      fail: async () => { throw new Error("must not fail"); },
    } as unknown as QueueClient;
    const gateway = {
      complete: async (request: {input: Array<{type: string; text?: string}>}) => {
        modelInput = request.input[0]?.text ?? "";
        return {
          output: {state: "idle", reply: "We are preserving the same project. The next step is to complete the current understanding."},
          usage: {inputTokens: 100, outputTokens: 30, cachedInputTokens: 0},
        };
      },
      spent: () => ({costUsd: 0.05, calls: 1}),
    } as unknown as ModelGateway;

    await processAgentOperationBriefJob(job, {queue, gateway, log: () => {}, shadowRouting: false});
    expect(JSON.parse(modelInput)).toMatchObject({
      locale: "en-US",
      project: {name: "Projeto Cedro"},
      recentConversation: [{content: "Estou organizando o entendimento inicial."}],
      workPlan: [{taskId: "M01", label: "Resolve company, group, jurisdiction and evidence regime"}],
    });
    expect(recordedResponse?.reply).toContain("same project");
  });

  it("normalizes an explicit company and activates the exact selected DAG without a model call", async () => {
    let recordedActivation: Record<string, unknown> | undefined;
    let modelCalls = 0;
    const queue = {
      writeStage: async () => {},
      loadAgentContext: async () => ({
        session_id: job.intake_session_id,
        message_id: job.payload.message_id,
        locale: "pt-BR",
        message: "Tenho uma reunião com o CFO da CVC amanhã. Quero explorar um refinanciamento dos vencimentos de 2027 e ainda não temos relacionamento nem exposição de crédito.",
        brief: {},
        snapshot_fingerprint: "a".repeat(64),
        projection_updated_at: "2026-09-01T12:00:00.000Z",
        manifest_id: null,
        project: {
          id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
          name: "Reunião CVC",
          entryJob: "origination_thesis",
          accessBasis: "public_information",
          phase: "understand",
          status: "active",
        },
        active_plan: capitalProjectPlanSnapshot("origination_thesis"),
        company_profile: {},
        documents: [],
        tasks: [],
        artifacts: [],
        recent_messages: [],
      }),
      recordAgentResponse: async (
        _job: unknown,
        _messageId: string,
        _response: unknown,
        _proposal: unknown,
        activation: unknown,
      ) => {
        recordedActivation = activation as Record<string, unknown>;
        return {};
      },
      complete: async () => {},
      recordAgentFailure: async () => {},
      recordIntentEnvelope: async () => {},
      fail: async () => { throw new Error("must not fail"); },
    } as unknown as QueueClient;
    const gateway = {
      complete: async () => {
        modelCalls += 1;
        throw new Error("the explicit public route must not call a model");
      },
      spent: () => ({costUsd: 0, calls: modelCalls}),
    } as unknown as ModelGateway;

    const result = await processAgentOperationBriefJob(job, {queue, gateway, log: () => {}, shadowRouting: false});
    expect(result.status).toBe("succeeded");
    expect(modelCalls).toBe(0);
    expect(recordedActivation).toMatchObject({job: "origination_thesis", company: {name: "CVC"}});
  });

  it("carries answered meeting context into a retry activation instead of rebuilding the brief from the retry sentence", async () => {
    let recordedActivation: Record<string, unknown> | undefined;
    const queue = {
      writeStage: async () => {},
      loadAgentContext: async () => ({
        session_id: job.intake_session_id,
        message_id: job.payload.message_id,
        locale: "pt-BR",
        message: "Retome a análise usando todas as informações que já forneci.",
        brief: {}, snapshot_fingerprint: "a".repeat(64),
        projection_updated_at: "2026-09-04T00:55:00.000Z", manifest_id: null,
        project: {
          id: "ffffffff-ffff-4fff-8fff-ffffffffffff", name: "Reunião Camil",
          entryJob: "origination_thesis", accessBasis: "public_information",
          phase: "understand", status: "active",
        },
        active_plan: capitalProjectPlanSnapshot("origination_thesis"),
        company_profile: {name: "Camil"}, documents: [], tasks: [], artifacts: [],
        recent_messages: [{
          id: "11111111-1111-4111-8111-111111111111",
          role: "user" as const,
          content: "Tenho uma reunião amanhã com a Camil e quero alternativas de estrutura de capital.",
          created_at: "2026-09-04T00:10:00.000Z",
        }, {
          id: "22222222-2222-4222-8222-222222222222",
          role: "user" as const,
          content: "É uma primeira conversa com CFO e tesouraria. Não temos relacionamento nem exposição de crédito. Podemos usar balanço próprio, estruturar e distribuir mercado de capitais e oferecer hedge.",
          created_at: "2026-09-04T00:11:00.000Z",
        }],
      }),
      recordAgentResponse: async (
        _job: unknown, _messageId: string, _response: unknown, _proposal: unknown, activation: unknown,
      ) => { recordedActivation = activation as Record<string, unknown>; return {}; },
      complete: async () => {}, recordAgentFailure: async () => {},
      fail: async () => { throw new Error("must not fail"); },
    } as unknown as QueueClient;
    const gateway = {
      complete: async () => { throw new Error("retry routing must remain deterministic"); },
      spent: () => ({costUsd: 0, calls: 0}),
    } as unknown as ModelGateway;

    const result = await processAgentOperationBriefJob(job, {queue, gateway, log: () => {}, shadowRouting: false});
    expect(result.status).toBe("succeeded");
    expect(recordedActivation).toMatchObject({job: "origination_thesis", company: {name: "Camil"}});
    const meetingContext = (recordedActivation?.brief as {meetingContext: string}).meetingContext;
    expect(meetingContext).toContain("primeira conversa com CFO e tesouraria");
    expect(meetingContext).toContain("Não temos relacionamento nem exposição de crédito");
    expect(meetingContext).toContain("estruturar e distribuir mercado de capitais");
    expect(meetingContext).toContain("Retome a análise");
  });

  it("asks for the institution operating model once research is already active without queueing it again", async () => {
    let recordedResponse: Record<string, unknown> | undefined;
    let recordedActivation: unknown;
    let modelCalls = 0;
    const queue = {
      writeStage: async () => {},
      loadAgentContext: async () => ({
        session_id: job.intake_session_id,
        message_id: job.payload.message_id,
        locale: "pt-BR",
        message: "A reunião é com o CFO. Queremos explorar refinance e não temos relacionamento nem exposição.",
        brief: {}, snapshot_fingerprint: "a".repeat(64),
        projection_updated_at: "2026-09-02T12:00:00.000Z", manifest_id: null,
        project: {
          id: "ffffffff-ffff-4fff-8fff-ffffffffffff", name: "Reunião Camil",
          entryJob: "origination_thesis", accessBasis: "public_information",
          phase: "understand", status: "active",
        },
        company_profile: {name: "Camil"},
        professional_context: null,
        institution_capabilities: null,
        documents: [],
        tasks: [{taskId: "O01", label: "Pesquisar a companhia", ordinal: 0, status: "running"}],
        artifacts: [],
        recent_messages: [{
          id: "33333333-3333-4333-8333-333333333333",
          role: "user" as const,
          content: "Tenho uma reunião com a Camil amanhã.",
          created_at: "2026-09-02T11:59:00.000Z",
        }],
      }),
      recordAgentResponse: async (_job: unknown, _id: string, response: unknown, _proposal: unknown, activation: unknown) => {
        recordedResponse = response as Record<string, unknown>;
        recordedActivation = activation;
        return {};
      },
      complete: async () => {}, recordAgentFailure: async () => {},
      fail: async () => { throw new Error("must not fail"); },
    } as unknown as QueueClient;
    const gateway = {
      complete: async () => { modelCalls += 1; throw new Error("capability clarification is deterministic"); },
      spent: () => ({costUsd: 0, calls: modelCalls}),
    } as unknown as ModelGateway;

    const result = await processAgentOperationBriefJob(job, {queue, gateway, log: () => {}, shadowRouting: false});
    expect(result.status).toBe("succeeded");
    expect(modelCalls).toBe(0);
    expect(recordedActivation).toBeUndefined();
    expect(recordedResponse).toMatchObject({state: "asking"});
    expect((recordedResponse?.clarification as Record<string, unknown>)?.question).toContain("balanço próprio");
    expect((recordedResponse?.clarification as Record<string, unknown>)?.whyItMatters).toContain("companhia");
    expect((recordedResponse?.clarification as Record<string, unknown>)?.whyItMatters).toContain("visão ampla");
  });

  it("uses relevant organization memory before asking for missing Camil meeting context", async () => {
    let recordedActivation: unknown;
    let recordedResponse: Record<string, unknown> | undefined;
    let modelCalls = 0;
    const queue = {
      writeStage: async () => {},
      loadAgentContext: async () => ({
        session_id: job.intake_session_id,
        message_id: job.payload.message_id,
        locale: "pt-BR",
        message: "Tenho uma reunião com a Camil amanhã e quero apresentar um pitch sobre alternativas estratégicas de endividamento.",
        brief: {},
        snapshot_fingerprint: "a".repeat(64),
        projection_updated_at: "2026-09-01T12:00:00.000Z",
        manifest_id: null,
        project: {
          id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
          name: "Camil · reunião",
          entryJob: "origination_thesis",
          accessBasis: "public_information",
          phase: "understand",
          status: "active",
        },
        active_plan: capitalProjectPlanSnapshot("origination_thesis"),
        company_profile: {},
        related_project_memory: [{
          projectId: "11111111-1111-4111-8111-111111111111",
          projectName: "Camil · refinanciamento 2027",
          companyName: "Camil",
          entryJob: "origination_thesis",
          currentPhase: "understand",
          status: "completed",
          updatedAt: "2026-06-01T12:00:00.000Z",
          brief: {kind: "origination_thesis", content: {meetingContext: "Refinanciamento dos vencimentos de 2027."}},
          artifactTypes: ["meeting_brief"],
        }],
        documents: [],
        tasks: [],
        artifacts: [],
        recent_messages: [],
      }),
      recordAgentResponse: async (
        _job: unknown,
        _messageId: string,
        response: unknown,
        _proposal: unknown,
        activation: unknown,
      ) => {
        recordedResponse = response as Record<string, unknown>;
        recordedActivation = activation;
        return {};
      },
      complete: async () => {},
      recordAgentFailure: async () => {},
      recordIntentEnvelope: async () => {},
      fail: async () => { throw new Error("must not fail"); },
    } as unknown as QueueClient;
    const gateway = {
      complete: async () => {
        modelCalls += 1;
        throw new Error("memory-aware public activation must not call a model");
      },
      spent: () => ({costUsd: 0, calls: modelCalls}),
    } as unknown as ModelGateway;

    const result = await processAgentOperationBriefJob(job, {queue, gateway, log: () => {}, shadowRouting: false});
    expect(result.status).toBe("succeeded");
    expect(modelCalls).toBe(0);
    expect(recordedResponse).toMatchObject({state: "asking"});
    expect((recordedResponse?.clarification as Record<string, unknown>)?.question).toContain("Camil · refinanciamento 2027");
    expect((recordedResponse?.clarification as Record<string, unknown>)?.question).toContain("pauta agora é diferente");
    expect(recordedActivation).toMatchObject({job: "origination_thesis", company: {name: "Camil"}});
  });

  it("turns a direct user declaration into a preview, never a silent mutation", async () => {
    let recordedProposal: Record<string, unknown> | undefined;
    let completed: Record<string, unknown> | undefined;
    const queue = {
      writeStage: async () => {},
      loadAgentContext: async () => ({
        session_id: job.intake_session_id,
        message_id: job.payload.message_id,
        locale: "pt-BR",
        message: "O valor pretendido agora é R$ 50 milhões.",
        brief: {requestedAmount: 40_000_000, currency: "BRL", useOfProceeds: "growth_expansion"},
        snapshot_fingerprint: "a".repeat(64),
        projection_updated_at: "2026-08-26T12:00:00.000Z",
        manifest_id: null,
        recent_messages: [],
      }),
      recordAgentResponse: async (_job: unknown, _messageId: string, _response: unknown, proposal: unknown) => {
        recordedProposal = proposal as Record<string, unknown>;
        return {};
      },
      complete: async (_job: unknown, result: unknown) => { completed = result as Record<string, unknown>; },
      recordAgentFailure: async () => {},
      recordIntentEnvelope: async () => {},
      fail: async () => { throw new Error("must not fail"); },
    } as unknown as QueueClient;
    const gateway = {
      complete: async () => ({
        output: {
          state: "proposing",
          reply: "Preparei a atualização do volume para sua revisão.",
          proposal: {
            title: "Atualizar o volume pretendido",
            rationale: "O usuário informou diretamente o novo volume nesta conversa.",
            impactSummary: "Recalcula capacidade, estrutura e aderência de mandato.",
            patches: [{operation: "set", path: "/requestedAmount", value: 50_000_000}],
            recompute: ["metrics", "structure", "matching"],
          },
        },
        usage: {inputTokens: 100, outputTokens: 60, cachedInputTokens: 0},
      }),
      spent: () => ({costUsd: 0.12, calls: 1}),
    } as unknown as ModelGateway;

    const result = await processAgentOperationBriefJob(job, {queue, gateway, log: () => {}, shadowRouting: false});
    expect(result.status).toBe("succeeded");
    expect(recordedProposal?.target).toBe("operation_brief");
    expect(recordedProposal?.evidence).toEqual([{kind: "user_statement", id: job.payload.message_id}]);
    expect(completed?.state).toBe("proposing");
  });

  it("replaces an unsupported numerical proposal with one clarification", async () => {
    let recordedResponse: Record<string, unknown> | undefined;
    const queue = {
      writeStage: async () => {},
      loadAgentContext: async () => ({
        session_id: job.intake_session_id,
        message_id: job.payload.message_id,
        locale: "pt-BR",
        message: "Acho que precisamos aumentar o valor.",
        brief: {requestedAmount: 40_000_000, currency: "BRL", useOfProceeds: "growth_expansion"},
        snapshot_fingerprint: "a".repeat(64),
        projection_updated_at: "2026-08-26T12:00:00.000Z",
        manifest_id: null,
        recent_messages: [],
      }),
      recordAgentResponse: async (_job: unknown, _messageId: string, response: unknown, proposal: unknown) => {
        recordedResponse = response as Record<string, unknown>;
        expect(proposal).toBeUndefined();
        return {};
      },
      complete: async () => {},
      recordAgentFailure: async () => {},
      recordIntentEnvelope: async () => {},
      fail: async () => { throw new Error("must not fail"); },
    } as unknown as QueueClient;
    const gateway = {
      complete: async () => ({
        output: {
          state: "proposing",
          reply: "Vou aumentar o valor.",
          proposal: {
            title: "Aumentar o volume",
            rationale: "O usuário pediu um aumento do volume pretendido.",
            impactSummary: "Recalcula a estrutura.",
            patches: [{operation: "set", path: "/requestedAmount", value: 50_000_000}],
            recompute: ["metrics", "structure"],
          },
        },
        usage: {inputTokens: 100, outputTokens: 60, cachedInputTokens: 0},
      }),
      spent: () => ({costUsd: 0.12, calls: 1}),
    } as unknown as ModelGateway;

    await processAgentOperationBriefJob(job, {queue, gateway, log: () => {}, shadowRouting: false});
    expect(recordedResponse?.state).toBe("asking");
  });

  it("routes an external instruction and refuses to turn it into an operation patch", async () => {
    let recordedResponse: Record<string, unknown> | undefined;
    let completed: Record<string, unknown> | undefined;
    let modelInput = "";
    const queue = {
      writeStage: async () => {},
      loadAgentContext: async () => ({
        session_id: job.intake_session_id,
        message_id: job.payload.message_id,
        locale: "pt-BR",
        message: "Pode enviar o material ao Fundo Alfa.",
        brief: {requestedAmount: 40_000_000, currency: "BRL"},
        snapshot_fingerprint: "a".repeat(64),
        projection_updated_at: "2026-08-26T12:00:00.000Z",
        manifest_id: null,
        recent_messages: [],
      }),
      recordAgentResponse: async (_job: unknown, _messageId: string, response: unknown, proposal: unknown) => {
        recordedResponse = response as Record<string, unknown>;
        expect(proposal).toBeUndefined();
        return {};
      },
      complete: async (_job: unknown, result: unknown) => { completed = result as Record<string, unknown>; },
      recordAgentFailure: async () => {},
      recordIntentEnvelope: async () => {},
      fail: async () => { throw new Error("must not fail"); },
    } as unknown as QueueClient;
    const gateway = {
      complete: async (request: {input: Array<{type: string; text?: string}>}) => {
        modelInput = request.input[0]?.text ?? "";
        return {
          output: {
            state: "proposing",
            reply: "Vou preparar o envio.",
            proposal: {
              title: "Preparar envio",
              rationale: "O usuário solicitou o contato com um financiador específico.",
              impactSummary: "Libera o contato externo.",
              patches: [{operation: "set", path: "/objective", value: "Enviar ao Fundo Alfa"}],
              recompute: ["matching"],
            },
          },
          usage: {inputTokens: 100, outputTokens: 60, cachedInputTokens: 0},
        };
      },
      spent: () => ({costUsd: 0.12, calls: 1}),
    } as unknown as ModelGateway;

    await processAgentOperationBriefJob(job, {queue, gateway, log: () => {}, shadowRouting: false});
    expect(modelInput).toContain('"intent":"authorize_external"');
    expect(recordedResponse).toMatchObject({state: "idle"});
    expect(completed?.request_route).toMatchObject({intent: "authorize_external", effect: "external"});
  });

  it("sends only scoped project memory and real work state in one bounded model call", async () => {
    let calls = 0;
    let modelInput = "";
    let metadata: Record<string, string> | undefined;
    const queue = {
      writeStage: async () => {},
      loadAgentContext: async () => ({
        session_id: job.intake_session_id,
        message_id: job.payload.message_id,
        locale: "pt-BR",
        message: "O que já sabemos e qual é o próximo passo?",
        brief: {currency: "BRL", useOfProceeds: "working_capital"},
        snapshot_fingerprint: "a".repeat(64),
        projection_updated_at: "2026-09-01T12:00:00.000Z",
        manifest_id: null,
        project: {
          id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
          name: "Projeto Cedro",
          entryJob: "company_debt_view",
          accessBasis: "private_authorized",
          phase: "understand",
          status: "active",
        },
        company_profile: {companyName: "Cedro", sector: "Distribuição"},
        professional_context: {
          useForms: ["institutional_work"],
          professionalRoles: ["banker", "originator"],
          practiceAreas: ["dcm", "corporate_banking", "structured_finance"],
          primaryObjectives: ["structure_transactions"],
          institutionName: "Banco Exemplo",
          disclosureStatus: "complete", lastConfirmedAt: "2026-09-01T10:00:00.000Z",
        },
        institution_capabilities: {
          institutionName: "Banco Exemplo", institutionKind: "bank",
          operatingModels: ["balance_sheet_lending", "structuring", "distribution"],
          productFamilies: ["bilateral_credit", "capital_markets"],
          geographies: ["BR", "US"], currencies: ["BRL", "USD"], capabilityNotes: null,
          sourceKind: "self_declared", disclosureStatus: "complete",
          lastConfirmedAt: "2026-09-01T10:00:00.000Z",
        },
        documents: [{
          id: "11111111-1111-4111-8111-111111111111",
          name: "balancete.pdf",
          kind: "trial_balance",
          status: "ready",
        }],
        tasks: [{taskId: "M01", label: "Resolver companhia e grupo", ordinal: 0, status: "succeeded"}],
        artifacts: [{
          id: "22222222-2222-4222-8222-222222222222",
          type: "preliminary_understanding",
          version: 1,
          status: "draft",
        }],
        recent_messages: [{
          id: "33333333-3333-4333-8333-333333333333",
          role: "assistant" as const,
          content: "Estou organizando o entendimento inicial.",
          created_at: "2026-09-01T11:59:00.000Z",
        }],
      }),
      recordAgentResponse: async () => ({}),
      complete: async () => {},
      recordAgentFailure: async () => {},
      recordIntentEnvelope: async () => {},
      fail: async () => { throw new Error("must not fail"); },
    } as unknown as QueueClient;
    const gateway = {
      complete: async (request: {
        input: Array<{type: string; text?: string}>;
        maxOutputTokens: number;
        metadata: Record<string, string>;
      }) => {
        calls += 1;
        modelInput = request.input[0]?.text ?? "";
        metadata = request.metadata;
        expect(request.maxOutputTokens).toBe(2_000);
        return {
          output: {
            state: "idle",
            reply: "Já identificamos a companhia e recebemos o balancete; o próximo passo é concluir a leitura antes de afirmar capacidade financeira.",
          },
          usage: {inputTokens: 180, outputTokens: 45, cachedInputTokens: 0},
        };
      },
      spent: () => ({costUsd: 0.08, calls}),
    } as unknown as ModelGateway;

    const result = await processAgentOperationBriefJob(job, {queue, gateway, log: () => {}, shadowRouting: false});
    const parsedInput = JSON.parse(modelInput) as Record<string, unknown>;

    expect(result.status).toBe("succeeded");
    expect(calls).toBe(1);
    expect(parsedInput).toMatchObject({
      project: {name: "Projeto Cedro", entryJob: "company_debt_view"},
      companyProfile: {companyName: "Cedro"},
      documentInventory: [{name: "balancete.pdf", kind: "trial_balance", status: "ready"}],
      workPlan: [{taskId: "M01", status: "succeeded"}],
      artifacts: [{type: "preliminary_understanding", version: 1, status: "draft"}],
      latestUserMessage: "O que já sabemos e qual é o próximo passo?",
      professionalContext: {professionalRoles: ["banker", "originator"], practiceAreas: ["dcm", "corporate_banking", "structured_finance"]},
      institutionCapabilities: {institutionName: "Banco Exemplo", operatingModels: ["balance_sheet_lending", "structuring", "distribution"]},
      journeyBlueprint: {id: "company_debt_view", firstWorkProduct: expect.any(String)},
      collaborativeAdvisoryPolicy: {
        alternativeUniverse: "company_first_and_unconstrained",
        professionalContextUse: "prioritize_and_shape_never_suppress",
      },
    });
    expect(metadata).toMatchObject({projectEntryJob: "company_debt_view", documentCount: "1", artifactCount: "1"});
    expect(modelInput).not.toContain("object_path");
    expect(modelInput).not.toContain("full_document_text");
  });
});

// Synthetic explicitly reviewed company input; no real document or user data.
function reviewedSectorInputs() {
  return {schema_version: "governed-sector-context-inputs.v1", as_of: "2026-09-08", sources: [], candidates: [{
    id: "10000000-0000-4000-8000-000000000080", field_path: "company.revenue_model", normalized_value: "merchant",
    review_state: "edited", is_primary: true, reviewed_by: "10000000-0000-4000-8000-000000000081", reviewed_at: "2026-09-08T00:00:00Z",
    entity_name: null, entity_scope: "company", period_start: null, period_end: null,
    source_anchor: {}, anchor_verified: null, extraction_method: "user_entry", processing_run_id: null,
    source_document_id: null, extraction_document_version: null, extraction_source_sha256: null,
  }]};
}

it("passes reviewed sector inputs through the real agent caller into persisted brief snapshots", async () => {
  async function run(includeContext: boolean) {
    let recorded: import("./execution-brief").PreparedExecutionBrief | undefined;
    const queue = {
      writeStage: async () => {},
      loadAgentContext: async () => ({session_id: job.intake_session_id, message_id: job.payload.message_id, locale: "pt-BR",
        message: "Quero entender os riscos e a capacidade de dívida antes de escolher uma operação.", brief: {},
        approval_input_fingerprint: "b".repeat(64), snapshot_fingerprint: "a".repeat(64), projection_updated_at: "2026-09-01T12:00:00.000Z", manifest_id: null,
        project: {id: "ffffffff-ffff-4fff-8fff-ffffffffffff", name: "Synthetic company debt", entryJob: "company_debt_view", accessBasis: "public_information", phase: "understand", status: "active"},
        active_plan: capitalProjectPlanSnapshot("company_debt_view"), company_profile: {name: "Synthetic Company"}, documents: [], tasks: [], artifacts: [], recent_messages: [],
        ...(includeContext ? {governed_sector_context_inputs: reviewedSectorInputs()} : {}),
      }),
      recordAgentResponse: async (_job: unknown, _id: unknown, _response: unknown, _proposal: unknown, _activation: unknown, executionBrief: unknown) => {recorded = executionBrief as typeof recorded; return {};},
      complete: async () => {}, recordAgentFailure: async () => {}, recordIntentEnvelope: async () => {}, fail: async () => {throw new Error("must not fail");},
    } as unknown as QueueClient;
    const gateway = {complete: async () => {throw new Error("deterministic route must not invoke models");}, spent: () => ({costUsd: 0, calls: 0})} as unknown as ModelGateway;
    expect((await processAgentOperationBriefJob(job, {queue, gateway, log: () => {}, shadowRouting: false})).status).toBe("succeeded");
    expect(recorded).toBeDefined();
    return recorded!;
  }
  const legacy = await run(false);
  const current = await run(true);
  expect(legacy.visible).not.toHaveProperty("planningContext");
  expect(current.visible.planningContext).toEqual(current.internal.planningContext);
  expect(current.visible.planningContext?.objects[0]?.attributes[0]?.value).toBe("Exposição ao mercado");
  expect(current.visible.planningContext?.objects[0]?.requirements.length).toBeGreaterThan(0);
  expect(current.visible.workstreams).toEqual(legacy.visible.workstreams);
  expect(current.internal.workstreams).toEqual(legacy.internal.workstreams);
  expect(current.visible.fingerprint).not.toBe(legacy.visible.fingerprint);
  expect(current.expectedInputFingerprint).toBe("b".repeat(64));
});
