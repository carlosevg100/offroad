import {resolveMandate, type Mandate, type Sourced} from "@offroad/fund-mandate";
import type {FactCandidate} from "@offroad/reconciliation";
import {taskCacheFromReport} from "@offroad/case-runner";
import {describe, expect, it} from "vitest";
import {claimFingerprint, supportedSemanticAudit, type ClaimDecision} from "@offroad/case-understanding";
import {diversifiedReceivablesCase, receivablesParametricScenarios} from "@offroad/receivables-analysis";

import {executeCaseEngine, publicCaseState, type CaseEngineInput} from "./engine";

const candidate = (
  fieldPath: string,
  normalizedValue: string,
  valueType: FactCandidate["valueType"] = "number",
  extra: Partial<FactCandidate> = {},
): FactCandidate => ({
  fieldPath,
  normalizedValue,
  valueType,
  sourceDocument: "source-1",
  evidenceRank: 1,
  informationClass: "audited",
  confidence: 0.99,
  anchorVerified: true,
  ...extra,
});

const declared = <T>(value: T): Sourced<T>[] => [{value, provenance: "declared", observedAt: "2026-08-01"}];

function mandate(): Mandate {
  return {
    fundId: "fund-1",
    fundName: "Fundo Institucional",
    ticket: declared({min: "10000000", max: "100000000"}),
    termMonths: declared({min: 24, max: 72}),
    sectors: declared(["Varejo"]),
    instruments: declared(["ccb"]),
    collateral: declared(["recebiveis"]),
    geographies: declared(["SP"]),
    leverageCeiling: declared("4.0"),
    minimumDscr: declared("1.2"),
    active: declared(true),
  };
}

const documents = [
  {id: "d1", kind: "audited_financial_statements" as const},
  {id: "d2", kind: "trial_balance" as const},
  {id: "d3", kind: "debt_schedule" as const},
  {id: "d4", kind: "company_registration" as const},
  {id: "d5", kind: "capital_request_letter" as const},
  {id: "d6", kind: "business_plan" as const},
];

const structureProposal: NonNullable<CaseEngineInput["structureProposal"]> = {
  alternatives: [{
    id: "target-structure",
    label: "Estrutura-alvo",
    instrument: "ccb",
    route: "private_credit",
    amount: "10000000",
    currency: "BRL",
    termMonths: 48,
    graceMonths: 6,
    amortization: "sac",
    indexer: "CDI",
    targetBuyer: "private_credit_funds",
    rationale: "The structure follows the documented use and repayment capacity.",
    pros: ["Simple execution route"],
    cons: ["Pricing remains subject to market confirmation"],
    assumptions: ["The stated use remains unchanged"],
    sources: [{id: "new-debt", label: "New debt", amount: "10000000", origin: "proposal", basisIds: ["ES-45"], condition: "proposed"}],
    uses: [{id: "declared-use", label: "Declared use", amount: "10000000", origin: "company_input", basisIds: ["transaction.purpose"], condition: "available"}],
    security: [{description: "To be confirmed from available collateral", basisIds: ["ES-20"]}],
    covenants: [{description: "Minimum debt-service coverage", basisIds: ["ES-24"]}],
    conditionsPrecedent: [{description: "Corporate approvals", owner: "company", basisIds: ["ES-42"]}],
    implementationDays: {min: 20, max: 40, basisIds: ["ES-44"]},
    basisIds: ["ES-45"],
  }],
  recommendation: {
    alternativeId: "target-structure",
    rationale: "This is the simplest currently supportable route for the case.",
    basisIds: ["ES-41", "ES-45"],
    proposedBy: "test-structure-desk",
    proposedAt: "2026-08-24T12:00:00.000Z",
  },
};
const requiredStructureCandidates = [
  candidate("transaction.requested_amount", "10000000"),
  candidate("transaction.sources_and_uses.1.side", "sources", "text"),
  candidate("transaction.sources_and_uses.1.item", "New debt", "text"),
  candidate("transaction.sources_and_uses.1.amount", "10000000"),
  candidate("transaction.sources_and_uses.2.side", "uses", "text"),
  candidate("transaction.sources_and_uses.2.item", "Declared use", "text"),
  candidate("transaction.sources_and_uses.2.amount", "10000000"),
];

async function executeWithConfirmedStructure(
  input: Omit<CaseEngineInput, "structureProposal" | "structureConfirmation">,
  productionPlanApproved = true,
) {
  const requiredCandidates = requiredStructureCandidates.filter((item) => !input.candidates.some((existing) => existing.fieldPath === item.fieldPath));
  const governedInput = {
    ...input,
    candidates: [...input.candidates, ...requiredCandidates],
    dealBrief: {...input.dealBrief, requestedAmount: "10000000", requestedTermMonths: 48, requestedGraceMonths: 6, instruments: ["ccb" as const]},
    operationPolicies: {...input.operationPolicies, version: input.operationPolicies?.version ?? "test-operation-v1", residualTolerance: "0"},
    structurePolicies: {
      ...input.structurePolicies,
      version: input.structurePolicies?.version ?? "test-structure-v1",
      annualSizingRate: "0.18",
      rateConvention: "effective_annual" as const,
      amortizationFormat: "sac" as const,
      graceInterest: "paid" as const,
    },
    informationAnswers: {
      info_why_now: "A operação financia uma necessidade com prazo econômico definido.",
      info_business_model: "A companhia vende produtos e serviços a uma base recorrente de clientes.",
      info_customer_concentration: "A base de clientes é acompanhada por participação e prazo contratual.",
      ...input.informationAnswers,
    },
  };
  const pending = await executeCaseEngine({...governedInput, structureProposal});
  const proposalFingerprint = pending.state.structureAlternatives.proposalFingerprint;
  if (!proposalFingerprint) throw new Error("test structure proposal did not compile");
  return executeCaseEngine({
    ...governedInput,
    taskCache: taskCacheFromReport(pending.report),
    materialsPreparationApproved: productionPlanApproved,
    structureProposal,
    structureConfirmation: {
      decision: "confirm",
      selectedAlternativeId: "target-structure",
      proposalFingerprint,
      actorId: "company-user-1",
      decidedAt: "2026-08-24T12:10:00.000Z",
    },
  });
}

describe("the governed case engine", () => {
  it("runs all eleven layers through real domain engines and keeps an unavailable writer as a domain state", async () => {
    const result = await executeCaseEngine({
      runId: "run-1",
      caseId: "case-1",
      archetypeId: "growth_expansion",
      locale: "pt",
      referenceDate: "2026-08-24",
      candidates: [
        candidate("company.legal_name", "Empresa Teste Ltda", "text"),
        candidate("transaction.requested_amount", "40000000"),
        candidate("debt.total_gross", "60000000"),
        candidate("historical_financials.2025.cash", "10000000", "number", {periodEnd: "2025-12-31"}),
        candidate("historical_financials.2025.ebitda", "25000000", "number", {periodEnd: "2025-12-31"}),
      ],
      documents,
      roomDocuments: [],
      dealBrief: {
        requestedAmount: "40000000",
        requestedTermMonths: 48,
        sector: "Varejo",
        geography: "SP",
        instruments: ["ccb"],
        collateralKinds: ["recebiveis"],
      },
      resolvedMandates: [resolveMandate(mandate(), {asOf: "2026-08-24"})],
      marketGovernance:{mandateMaxAgeMonths:12,waveLimit:3},
      externalReleaseApproved: false,
    });

    expect(result.report.status).toBe("succeeded");
    expect(result.report.stages.map((stage) => stage.stage)).toEqual([
      "extraction",
      "reconciliation",
      "metrics",
      "gaps",
      "structure",
      "red_flags",
      "claims",
      "materials",
      "language_conduct",
      "matching",
      "outcome",
    ]);
    expect(result.report.stages.every((stage) => stage.status === "succeeded")).toBe(true);
    expect(result.state.reconciliation.calculations.map((calculation) => calculation.id)).toContain("net_debt");
    expect(result.state.brief).toBeNull();
    expect(result.state.briefBlockedBy).toContain("diagnostic_case_not_ready");
    expect(result.state.materialsBlockedBy).toContain("brief_unavailable");
    expect(result.state.matching.screened).toBe(true);
    expect(result.state.matching.fits[0]).toMatchObject({fundId: "fund-1", verdict: "possible"});
    expect(result.state.matching.marketTruth.procedureCoverage).toHaveLength(28);
    expect(result.state.matching.marketTruth.procedureCoverage.slice(18).every((entry)=>entry.status==="not_applicable")).toBe(true);
    expect(result.state.outcome.qualifiedIntroductionAllowed).toBe(false);
    expect(result.report.stages.every((stage) => stage.outputFingerprint?.length === 64)).toBe(true);
    expect(result.report.taskRuns).toHaveLength(11);
    expect(result.report.taskRuns.find((task) => task.taskId === "metrics")).toMatchObject({
      workflow: "case",
      phase: "diagnose",
      cacheHit: false,
      toolsUsed: ["readiness", "financial_core", "credit_analysis"],
    });
    expect(result.report.taskRuns.find((task) => task.taskId === "reconciliation")?.sourceIds).toEqual([
      "d1", "d2", "d3", "d4", "d5", "d6", "source-1",
    ]);
    const structureTasks = result.report.taskRuns.find((task) => task.taskId === "structure")?.subtasks ?? [];
    expect(structureTasks.map((task) => task.taskId)).toEqual([
      "need_capacity",
      "issuer_profile",
      "credit_scenarios",
      "instrument_screen",
      "collateral_design",
      "operation_verdict",
      "operation_truth",
      "indicative_terms",
      "structure_truth",
      "pricing_truth",
      "structure_design",
      "structure_alternatives",
      "structure_decision",
      "assemble",
    ]);
    expect(structureTasks.every((task) => task.graphId === "deal_structuring" && task.status === "succeeded")).toBe(true);
    expect(structureTasks.find((task) => task.taskId === "structure_truth")?.dependencies).toEqual([
      "need_capacity", "operation_truth", "indicative_terms", "instrument_screen", "collateral_design",
    ]);
    const materialTasks = result.report.taskRuns.find((task) => task.taskId === "materials")?.subtasks ?? [];
    expect(materialTasks.map((task) => task.taskId)).toEqual([
      "material_inputs", "financial_model", "compile_documents", "plan_room", "claim_registry", "publication_gate", "material_truth", "assemble",
    ]);
    expect(materialTasks.every((task) => task.graphId === "materials_preparation" && task.status === "succeeded")).toBe(true);
    expect([...structureTasks, ...materialTasks].every((task) => task.usage.modelCalls === 0)).toBe(true);

    result.state.pricingTruth.sample.eligible.push({id: "private-observation", sourceId: "manager-name"} as never);
    result.state.pricingTruth.sample.rejected.push({id: "private-rejection", reasons: ["different_sector"]});
    result.state.pricingTruth.procedureCoverage[0]!.result = {sourceId: "manager-name", observations: ["private-observation"]};
    const publicState = publicCaseState(result.state);
    expect(publicState.pricingTruth.sample).toMatchObject({eligibleCount: 1, rejectedCount: 1});
    expect(publicState.pricingTruth.procedureCoverage[0]?.result).toBeNull();
    expect(JSON.stringify(publicState)).not.toMatch(/manager-name|private-observation|private-rejection/);
    expect(JSON.stringify(publicState.matching)).not.toContain("Fundo Institucional");
    expect(publicState.matching.marketTruth.shortlist).toMatchObject({eligible:1,requiringConfirmation:1});
  });

  it("gives a structure designer only governed compact context and validates its proposal deterministically", async () => {
    let designerCalls = 0;
    const result = await executeCaseEngine({
      runId: "run-structure-designer",
      caseId: "case-structure-designer",
      archetypeId: "other",
      locale: "pt",
      referenceDate: "2026-08-24",
      candidates: [candidate("company.legal_name", "Empresa Teste Ltda", "text"), ...requiredStructureCandidates],
      documents,
      roomDocuments: [],
      dealBrief: {requestedAmount: "10000000", requestedTermMonths: 48, requestedGraceMonths: 6, instruments: ["ccb"]},
      resolvedMandates: [],
      externalReleaseApproved: false,
      operationPolicies: {version: "test-operation-v1", residualTolerance: "0"},
      structurePolicies: {version: "test-structure-v1", annualSizingRate: "0.18", rateConvention: "effective_annual", amortizationFormat: "sac", graceInterest: "paid"},
      designStructure: async (context) => {
        designerCalls += 1;
        expect(context).not.toHaveProperty("documents");
        expect(context.budget).toEqual({maxCostUsd: 0.75, maxModelCalls: 1});
        expect(context.allowedBasisIds).toContain("ES-45");
        return {proposal: structureProposal, blockedBy: [], usage: {costUsd: 0.2, modelCalls: 1}, modelInvocations: [{provider: "test", model: "structure-fixture"}]};
      },
    });
    expect(designerCalls).toBe(1);
    expect(result.state.structureAlternatives.status).toBe("pending_confirmation");
    expect(result.state.structureAlternatives.recommendation).toMatchObject({proposedBy: "offroad_structure_designer"});
    expect(result.state.structureDecision.materialsPreparationAllowed).toBe(false);
    expect(result.state.structureModelInvocations).toHaveLength(1);
    expect(result.report.stages.find((stage) => stage.stage === "structure")?.usage).toEqual({costUsd: 0.2, modelCalls: 1});
  });

  it("writes and verifies the diagnostic case once, then reuses it after structure confirmation", async () => {
    let writerCalls = 0;
    let verifierCalls = 0;
    const result = await executeWithConfirmedStructure({
      runId: "run-2",
      caseId: "case-2",
      archetypeId: "other",
      locale: "pt",
      referenceDate: "2026-08-24",
      candidates: [candidate("company.legal_name", "Empresa Teste Ltda", "text")],
      documents,
      roomDocuments: [],
      dealBrief: {},
      resolvedMandates: [],
      externalReleaseApproved: false,
      writeBrief: async () => {
        writerCalls += 1;
        return {
          brief: {sections: [], executiveSummary: "Resumo institucional sem afirmações numéricas."},
          blockedBy: [],
          usage: {costUsd: 0.21, modelCalls: 1},
          modelInvocations: [{provider: "test", model: "fixture"}],
        };
      },
      verifyBrief: async ({brief}) => {
        verifierCalls += 1;
        return {
          audit: supportedSemanticAudit(brief),
          usage: {costUsd: 0.05, modelCalls: 1},
          modelInvocations: [{provider: "independent-test", model: "verifier"}],
        };
      },
    });

    expect(result.report.stages.find((stage) => stage.stage === "claims")?.usage).toEqual({costUsd: 0, modelCalls: 0});
    expect(result.report.taskRuns.find((task) => task.taskId === "claims")?.cacheHit).toBe(true);
    expect(result.report.usage).toEqual({costUsd: 0, modelCalls: 0});
    expect(result.state.brief?.executiveSummary).toContain("Resumo institucional");
    expect(result.state.modelInvocations).toHaveLength(2);
    expect(result.state.claimRegistry?.publication.allowed).toBe(true);
    expect({writerCalls, verifierCalls}).toEqual({writerCalls: 1, verifierCalls: 1});
  });

  it("cannot compile any material after structure confirmation until the production plan is approved", async () => {
    const result = await executeWithConfirmedStructure({
      runId: "run-production-gate",
      caseId: "case-production-gate",
      archetypeId: "other",
      locale: "pt",
      referenceDate: "2026-08-24",
      candidates: [candidate("company.legal_name", "Empresa Teste Ltda", "text")],
      documents,
      roomDocuments: [],
      dealBrief: {},
      resolvedMandates: [],
      externalReleaseApproved: false,
      writeBrief: async () => ({
        brief: {sections: [], executiveSummary: "Case diagnóstico aprovado e rastreável."},
        blockedBy: [],
      }),
      verifyBrief: async ({brief}) => ({audit: supportedSemanticAudit(brief)}),
    }, false);

    expect(result.state.brief?.executiveSummary).toContain("Case diagnóstico");
    expect(result.state.structureDecision.materialsPreparationAllowed).toBe(true);
    expect(result.state.materials).toEqual([]);
    expect(result.state.financialModel).toBeNull();
    expect(result.state.materialsBlockedBy).toContain("production_plan_not_approved");
  });

  it("executes the receivables vertical inside metrics and carries a refusal into the case blockers", async () => {
    const noEligible = receivablesParametricScenarios.find((scenario) => scenario.id === "r19-no-eligible-base")!;
    const result = await executeCaseEngine({
      runId: "run-receivables",
      caseId: "case-receivables",
      archetypeId: "working_capital",
      locale: "pt",
      referenceDate: "2026-08-24",
      candidates: [
        candidate("company.legal_name", "Cedente Teste Ltda", "text"),
        candidate("transaction.requested_amount", "3000000"),
      ],
      documents,
      roomDocuments: [],
      dealBrief: {requestedAmount: "3000000", instruments: ["fidc"], collateralKinds: ["recebiveis"]},
      resolvedMandates: [],
      externalReleaseApproved: false,
      receivablesCase: noEligible.input,
    });
    expect(result.state.receivables?.decision.status).toBe("not_viable");
    expect(result.state.receivables?.metrics.portfolio.concentrationAdjustedEligibleBalance).toBe("0.00");
    expect(result.state.outcome.reasons).toContain("trigger_eligible_share");
    expect(result.state.outcome.qualifiedIntroductionAllowed).toBe(false);

    const clean = await executeCaseEngine({
      runId: "run-receivables-clean",
      caseId: "case-receivables-clean",
      archetypeId: "working_capital",
      locale: "pt",
      referenceDate: "2026-08-24",
      candidates: [candidate("company.legal_name", "Cedente Teste Ltda", "text"), candidate("transaction.requested_amount", "3000000")],
      documents,
      roomDocuments: [],
      dealBrief: {requestedAmount: "3000000", instruments: ["fidc"], collateralKinds: ["recebiveis"]},
      resolvedMandates: [],
      externalReleaseApproved: false,
      receivablesCase: diversifiedReceivablesCase(),
    });
    expect(clean.state.receivables?.decision.status).toBe("ready_for_structuring");
    expect(clean.state.capacity?.walls.find((wall) => wall.id === "collateral")?.amount).toBe("4800000.00");
  });

  it("keeps a reviewed judgment visible internally but blocks every publishable artifact until approval", async () => {
    const judgment = {
      id: "assessment",
      text: "A companhia apresenta uma estrutura de capital compatível com a análise proposta.",
      material: true,
      kind: "judgment" as const,
      supportIds: ["company.legal_name"],
    };
    const caseBrief = {
      sections: [{id: "strengths" as const, heading: "Pontos fortes", claims: [judgment]}],
      executiveSummary: "Resumo para revisão interna.",
    };
    const run = (claimDecisions?: ClaimDecision[]) => executeWithConfirmedStructure({
      runId: "run-approval",
      caseId: "case-approval",
      archetypeId: "other",
      locale: "pt",
      referenceDate: "2026-08-24",
      candidates: [candidate("company.legal_name", "Empresa Teste Ltda", "text")],
      documents,
      roomDocuments: [],
      dealBrief: {},
      resolvedMandates: [],
      externalReleaseApproved: false,
      ...(claimDecisions ? {claimDecisions} : {}),
      writeBrief: async () => ({brief: caseBrief, blockedBy: []}),
      verifyBrief: async ({brief}) => ({audit: supportedSemanticAudit(brief)}),
    });

    const pending = await run();
    expect(pending.state.brief).toEqual(caseBrief);
    expect(pending.state.claimRegistry?.claims[0]?.status).toBe("pending_approval");
    expect(pending.state.materials).toEqual([]);
    expect(pending.state.financialModel).toMatchObject({
      selectedAlternativeId: "target-structure",
      inputs: {amount: "10000000", termMonths: 48, graceMonths: 6, amortization: "sac"},
    });
    expect(pending.state.financialModel?.workbooks.pt.byteSize).toBeGreaterThan(4_000);
    expect(pending.state.financialModel?.workbooks.en.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(pending.state.dataRoom.releasable).toBe(false);
    expect(pending.state.materialTruth.procedureCoverage).toHaveLength(32);
    expect(pending.state.materialTruth.releaseDecision).toBe("internal_only");

    const approved = await run([{
      claimId: judgment.id,
      claimFingerprint: claimFingerprint(judgment),
      decision: "approved",
      decidedBy: "reviewer-1",
      decidedAt: "2026-08-24T15:00:00.000Z",
      reason: "Conclusão revisada contra as evidências citadas.",
    }]);
    expect(approved.state.claimRegistry?.publication.allowed).toBe(true);
    expect(approved.state.materials.length).toBeGreaterThan(0);
    expect(approved.state.materials.map((material) => material.kind)).toContain("financial_model");
    expect(approved.state.materialTruth.procedureCoverage.find((procedure) => procedure.procedureId === "MA-27")).toMatchObject({
      status: "completed",
    });
    expect(approved.state.materialTruth.procedureCoverage.map((entry)=>entry.procedureId)).toEqual(
      Array.from({length:32},(_,index)=>`MA-${String(index+1).padStart(2,"0")}`),
    );
  });
});
