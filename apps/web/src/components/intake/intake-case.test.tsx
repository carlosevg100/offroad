import {createTranslator} from "next-intl";
import {renderToStaticMarkup} from "react-dom/server";
import {describe, expect, it, vi} from "vitest";
import en from "../../../messages/en-US.json";
import pt from "../../../messages/pt-BR.json";
import {analyzeCreditPosition, buildDeskInputs, projectLeverageTrajectory} from "@offroad/credit-analysis";
import {assessCapacity, buildTermSheet} from "@offroad/deal-structure";
import {syntheticCreditMaterialsCase as fixture} from "@offroad/testing-fixtures/credit-materials-case";
import type {CaseState} from "@/lib/intake/case-pipeline";
import {IntakeCase} from "./intake-case";
import {leaks, visible} from "./visible-text.test-support";

vi.mock("next-intl/server", () => ({getTranslations: async ({locale}: {locale: string}) => createTranslator({locale, messages: locale === "en-US" ? en : pt, namespace: "Intake.case", onError: (error) => {throw error;}})}));
vi.mock("./intake-desk", () => ({IntakeDesk: () => null}));
vi.mock("./intake-committee", () => ({IntakeCommittee: () => null}));
vi.mock("./intake-data-room", () => ({IntakeDataRoom: () => null}));

// Only the diagnosis projection used by this server component; not a generated economic case.
function stateFor(status: "needs_evidence_scope" | "needs_requested_amount", stalePipeline = false): CaseState {
  const truth = {status: "blocked", procedureCoverage: [], exceptions: []};
  return {
    readiness: {state: "blocked", score: 0, components: [], blockers: []}, capacity: null,
    brief: null, briefBlockedBy: [], reconciliation: {
      exceptions: [], calculations: [],
      financialTruth: {...truth, statements: [], identityChecks: []},
      debtTruth: {...truth, views: {balanceBasis: "missing", offBalanceSheetExposures: "0"}, serviceNext12Months: "0", instruments: [], covenants: []},
    },
    operationTruth: {...truth, request: {amount: null}, sourcesAndUses: {totalSources: "0", totalUses: "0", difference: "0", status: "fail"}},
    receivablesVertical: {status, scopeIssue: {code: "multiple_receivables_tapes", candidates: [
      {documentId: "synthetic-1", fileName: "Pool A.xlsx", sheet: "Recebíveis A", headerRow: 2},
      {documentId: "synthetic-2", fileName: "Pool B.xlsx", sheet: "Recebíveis B", headerRow: 4},
    ]}, evidenceCoverage: {delivered: 2, searched: 2, complete: false, warnings: []},
    // Deliberately invalid stale payload: accessing it would fail. Scope must dominate it.
    pipeline: stalePipeline ? {stale: true} : null},
  } as unknown as CaseState;
}

describe("receivables scope notice", () => {
  it.each(["pt-BR", "en-US"])("renders the scope gap and withholds stale calculations in %s", async (locale) => {
    const copy = (locale === "en-US" ? en : pt).Intake.case;
    const markup = renderToStaticMarkup(await IntakeCase({locale, caseState: stateFor("needs_evidence_scope", true), view: "diagnosis"}));
    expect(markup).toContain(copy.receivablesScopeBody);
    expect(markup).toContain(copy.receivablesScopeGuidance);
    const t = createTranslator({locale, messages: locale === "en-US" ? en : pt, namespace: "Intake.case", onError: (error) => {throw error;}});
    expect(markup).toContain(t("receivablesScopeCoverage", {count: 2}));
    expect(markup).not.toContain(t("receivablesCoverage", {delivered: 2, searched: 2}));
    for (const label of ["Pool A.xlsx", "Pool B.xlsx", "Recebíveis A", "Recebíveis B"]) expect(markup).toContain(label);
    expect(markup).not.toContain(copy.receivablesAmountBody);
    expect(markup).not.toContain("case-receivables__metrics");
    expect(markup).not.toContain(copy.receivablesAnalyzed);
  });
  it.each(["pt-BR", "en-US"])("preserves the missing-amount notice in %s", async (locale) => {
    const copy = (locale === "en-US" ? en : pt).Intake.case;
    const markup = renderToStaticMarkup(await IntakeCase({locale, caseState: stateFor("needs_requested_amount"), view: "diagnosis"}));
    expect(markup).toContain(copy.receivablesAmountBody);
    expect(markup).toContain(copy.receivablesNeedsAmount);
    expect(markup).not.toContain(copy.receivablesScopeBody);
    expect(markup).not.toContain("Pool A.xlsx");
  });
});

/** Only the projection the full case screen reads, over the synthetic Aurora case; not a generated case. */
function fullState(): CaseState {
  const inputs = buildDeskInputs(fixture.facts.map((fact) => ({fieldPath: fact.fieldPath, value: fact.value})), {referenceDate: fixture.referenceDate, indexLevels: fixture.indexLevels, statedRequest: fixture.statedRequest});
  const capacity = assessCapacity(fixture.capacity);
  const truth = {status: "partial", procedureCoverage: [{status: "completed", missingInputs: []}], exceptions: []};
  return {
    readiness: {state: "in_progress", score: 0.8, components: [], blockers: []},
    capacity,
    termSheet: buildTermSheet({...fixture.termSheet, capacity, blockers: []}),
    brief: {executiveSummary: "Receita líquida de R$ 191,2 milhões em 2025.", sections: [
      {id: "history", heading: "Histórico", claims: [{id: "c1", text: "Receita líquida de R$ 191,2 milhões em 2025.", material: true, kind: "fact", supportIds: ["historical_financials.2025.revenue", "net_debt", "desk.alavancagem_pre"]}]},
    ]},
    briefBlockedBy: [],
    materials: [],
    desk: analyzeCreditPosition(inputs.desk!), trajectory: projectLeverageTrajectory(inputs.trajectory!), deskMissing: [], clientQuestions: [],
    reconciliation: {
      facts: [{}],
      calculations: [{id: "net_debt", labels: {pt: "Dívida líquida", en: "Net debt"}, value: "36900000", inputs: ["historical_financials.2025.gross_debt", "historical_financials.2025.cash"], warnings: [], trace: []}],
      exceptions: [],
      financialTruth: {...truth, statements: [], identityChecks: []},
      debtTruth: {...truth, views: {balanceBasis: "missing", offBalanceSheetExposures: "0"}, serviceNext12Months: "0", instruments: [], covenants: []},
    },
    operationTruth: {...truth, request: {amount: "42300000"}, calculatedNeed: null, proForma: null, sourcesAndUses: {totalSources: "0", totalUses: "0", difference: "0", status: "pass"}},
    structureTruth: {...truth, proposal: {amount: "42300000", bindingConstraint: "cash_flow", termMonths: 48, amortizationFormat: "sac", minimumDownsideDscr: "1.4", collateralCoverage: "1.3"}, dayOne: {passes: true}},
    pricingTruth: {
      ...truth, decision: "reference_available", policyVersion: "pricing-policy-2026-08",
      indicativePrice: {bps: {min: 310, max: 410}, sentence: {pt: "Referência indicativa.", en: "Indicative reference."}},
      sample: {eligibleCount: 3, distinctSources: 3, latestObservation: "2026-08-10"}, allIn: {annualizedCostBps: null, totalRate: null},
    },
    materialTruth: {...truth, releaseDecision: "internal_only", consistency: {status: "pass"}},
    matching: {counts: {excluded: 0}, marketTruth: {
      ...truth, missingInputs: [], mandateRegistry: {total: 0, stale: 0}, shortlist: {eligible: 0, requiringConfirmation: 0},
      introductions: {introduced: 0}, distribution: {ready: false},
    }},
    receivablesVertical: null,
  } as unknown as CaseState;
}

describe("the visible text of the case screen", () => {
  it.each(["pt-BR", "en-US"] as const)("prints no field path, identifier or dash, and names what each figure stands on in words (%s)", async (locale) => {
    const lang = locale === "en-US" ? "en" : "pt";
    const markup = renderToStaticMarkup(await IntakeCase({locale, caseState: fullState(), sessionId: "synthetic", view: "full"}));
    const text = visible(markup);
    expect(leaks(text)).toEqual([]);
    // Before: the basis of a term by its key ("capacity"), a calculation traced from field paths, the
    // brief's support by its identifiers, the pricing policy by its version and the M2 to M8 kickers.
    expect(text).toContain(lang === "pt" ? "Capacidade de endividamento calculada" : "Computed debt capacity");
    expect(text).toMatch(lang === "pt" ? /Dívida bruta[^\n]*\(2025\) · Caixa[^\n]*\(2025\)/ : /Gross debt[^\n]*\(2025\) · Cash[^\n]*\(2025\)/);
    expect(text).toContain(lang === "pt" ? "Receita líquida (2025) · Dívida líquida" : "Net revenue (2025) · Net debt");
    expect(text).not.toContain("pricing-policy-2026-08");
    // The identifiers stay with the elements, off the visible text.
    expect(markup).toContain('data-support-ids="historical_financials.2025.revenue net_debt desk.alavancagem_pre"');
    expect(markup).toContain('data-pricing-policy="pricing-policy-2026-08"');
  });
});
