import {resolveMandate, type Mandate, type Sourced} from "@offroad/fund-mandate";
import type {FactCandidate} from "@offroad/reconciliation";
import {describe, expect, it} from "vitest";
import {claimFingerprint, supportedSemanticAudit, type ClaimDecision} from "@offroad/case-understanding";

import {executeCaseEngine} from "./engine";

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

describe("the governed case engine", () => {
  it("runs all nine layers through real domain engines and keeps an unavailable writer as a domain state", async () => {
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
      externalReleaseApproved: false,
    });

    expect(result.report.status).toBe("succeeded");
    expect(result.report.stages.map((stage) => stage.stage)).toEqual([
      "extraction",
      "reconciliation",
      "metrics",
      "gaps",
      "structure",
      "claims",
      "materials",
      "matching",
      "outcome",
    ]);
    expect(result.report.stages.every((stage) => stage.status === "succeeded")).toBe(true);
    expect(result.state.reconciliation.calculations.map((calculation) => calculation.id)).toContain("net_debt");
    expect(result.state.brief).toBeNull();
    expect(result.state.briefBlockedBy).toContain("brief_writer_unavailable");
    expect(result.state.materialsBlockedBy).toContain("brief_unavailable");
    expect(result.state.matching.screened).toBe(true);
    expect(result.state.matching.fits[0]).toMatchObject({fundId: "fund-1", verdict: "possible"});
    expect(result.state.outcome.externalDirectionAllowed).toBe(false);
    expect(result.report.stages.every((stage) => stage.outputFingerprint?.length === 64)).toBe(true);
  });

  it("records model usage once and makes a produced brief pass the independent claim audit", async () => {
    const result = await executeCaseEngine({
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
      writeBrief: async () => ({
        brief: {sections: [], executiveSummary: "Resumo institucional sem afirmações numéricas."},
        blockedBy: [],
        usage: {costUsd: 0.21, modelCalls: 1},
        modelInvocations: [{provider: "test", model: "fixture"}],
      }),
      verifyBrief: async ({brief}) => ({
        audit: supportedSemanticAudit(brief),
        usage: {costUsd: 0.05, modelCalls: 1},
        modelInvocations: [{provider: "independent-test", model: "verifier"}],
      }),
    });

    expect(result.report.stages.find((stage) => stage.stage === "claims")?.usage).toEqual({costUsd: 0.26, modelCalls: 2});
    expect(result.report.usage).toEqual({costUsd: 0.26, modelCalls: 2});
    expect(result.state.brief?.executiveSummary).toContain("Resumo institucional");
    expect(result.state.modelInvocations).toHaveLength(2);
    expect(result.state.claimRegistry?.publication.allowed).toBe(true);
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
    const run = (claimDecisions?: ClaimDecision[]) => executeCaseEngine({
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
    expect(pending.state.dataRoom.releasable).toBe(false);

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
  });
});
