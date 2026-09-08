import {createTranslator} from "next-intl";
import {renderToStaticMarkup} from "react-dom/server";
import {describe, expect, it, vi} from "vitest";
import en from "../../../messages/en-US.json";
import pt from "../../../messages/pt-BR.json";
import type {CaseState} from "@/lib/intake/case-pipeline";
import {IntakeCase} from "./intake-case";

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
