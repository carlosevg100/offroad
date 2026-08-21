import {describe, expect, it} from "vitest";
import {buildRedeHorizonteDocumentIntake, redeHorizonteFileHashes} from "@offroad/testing-fixtures";
import {
  autoAcceptDecision,
  chartOfAccounts,
  chartOfAccountsMap,
  documentKindDefinition,
  documentKinds,
  evidenceRankFor,
  fieldCatalog,
  financialDefinitions,
  isMaterialFieldPath,
  leafAccounts,
  parsePeriodToken,
  persistedFieldGroups,
  proposePrecedence,
  reconciliationRules,
  resolveFieldPath,
  suggestedDocumentName,
  validateChartOfAccounts,
} from "./index";

describe("evidence ranks", () => {
  it("orders classes from audited (1) to company documents (7)", () => {
    expect(evidenceRankFor("audited")).toBe(1);
    expect(evidenceRankFor("reviewed")).toBe(2);
    expect(evidenceRankFor("accounting")).toBe(3);
    expect(evidenceRankFor("bank_statement")).toBe(4);
    expect(evidenceRankFor("management")).toBe(5);
    expect(evidenceRankFor("projection")).toBe(6);
    expect(evidenceRankFor("company_document")).toBe(7);
  });

  it("calculated values inherit the worst input rank", () => {
    expect(evidenceRankFor("calculated", [1, 3, 2])).toBe(3);
    expect(evidenceRankFor("calculated", [])).toBe(7);
    expect(evidenceRankFor("calculated", [Number.NaN, 2])).toBe(7);
  });

  it("proposes precedence without deciding ties", () => {
    expect(proposePrecedence("audited", "management")).toBe("left");
    expect(proposePrecedence("projection", "accounting")).toBe("right");
    expect(proposePrecedence("management", "management")).toBe("tie");
  });
});

describe("document taxonomy", () => {
  it("has unique kinds with a valid rank and folder", () => {
    const kinds = new Set(documentKinds.map((d) => d.kind));
    expect(kinds.size).toBe(documentKinds.length);
    for (const definition of documentKinds) {
      expect(definition.evidenceRank).toBeGreaterThanOrEqual(1);
      expect(definition.evidenceRank).toBeLessThanOrEqual(7);
      expect(definition.labels.pt.length).toBeGreaterThan(0);
      expect(definition.labels.en.length).toBeGreaterThan(0);
    }
    expect(documentKindDefinition("audited_financial_statements").evidenceRank).toBe(1);
    expect(documentKindDefinition("appraisal_report").evidenceRank).toBe(4);
  });

  it("suggests organized names in the AAAA-MM_Tipo_Entidade shape", () => {
    expect(suggestedDocumentName({kind: "audited_financial_statements", entityName: "Rede Horizonte Ltda.", periodEnd: "2025-12-31"})).toBe(
      "2025-12_Demonstracoes_financeiras_auditadas_Rede_Horizonte_Ltda",
    );
    expect(suggestedDocumentName({kind: "capital_request_letter", locale: "en"})).toBe("Capital_request_letter");
  });
});

describe("field catalog", () => {
  it("resolves every field path produced by the Rede Horizonte fixture", () => {
    const documents = Object.entries(redeHorizonteFileHashes).map(([name, sha256], index) => ({id: `doc-${index}`, original_name: name, sha256}));
    const {candidates} = buildRedeHorizonteDocumentIntake(documents);
    expect(candidates.length).toBeGreaterThan(30);
    const unresolved = candidates.map((c) => c.fieldPath).filter((path) => resolveFieldPath(path) === null);
    expect(unresolved).toEqual([]);
    for (const candidate of candidates) {
      expect(persistedFieldGroups).toContain(candidate.fieldGroup);
      expect(resolveFieldPath(candidate.fieldPath)?.definition.group).toBe(candidate.fieldGroup);
    }
  });

  it("captures period, index and YTD/LTM windows", () => {
    expect(resolveFieldPath("historical_financials.2025.revenue")?.params).toEqual({period: "2025"});
    expect(resolveFieldPath("interim_financials.2026_07.revenue_7m")?.params).toEqual({period: "2026_07", window: "ytd", ytdMonths: 7});
    expect(resolveFieldPath("interim_financials.2026_07.ebitda_ltm")?.params).toEqual({period: "2026_07", window: "ltm"});
    expect(resolveFieldPath("interim_financials.2026_07.cash")?.params).toEqual({period: "2026_07"});
    expect(resolveFieldPath("debt.instruments.3.balance")?.params).toEqual({index: 3});
    expect(resolveFieldPath("projections.2028.key_assumptions.2.driver")?.params).toEqual({period: "2028", index: 2});
    expect(resolveFieldPath("company.unknown_field")).toBeNull();
    expect(resolveFieldPath("historical_financials.20xx.revenue")).toBeNull();
  });

  it("classifies materiality", () => {
    expect(isMaterialFieldPath("transaction.requested_amount")).toBe(true);
    expect(isMaterialFieldPath("company.city")).toBe(false);
    expect(isMaterialFieldPath("collateral.total_capacity")).toBe(true);
  });

  it("has unique patterns and bilingual labels", () => {
    const patterns = new Set(fieldCatalog.map((f) => f.pattern));
    expect(patterns.size).toBe(fieldCatalog.length);
    for (const field of fieldCatalog) {
      expect(field.labels.pt.length).toBeGreaterThan(0);
      expect(field.labels.en.length).toBeGreaterThan(0);
      if (field.requiresPeriod) expect(field.pattern).toContain("{period}");
    }
  });
});

describe("periods", () => {
  it("parses year and month tokens", () => {
    expect(parsePeriodToken("2025")).toEqual({startsOn: "2025-01-01", endsOn: "2025-12-31", kind: "year", fiscalYear: 2025});
    expect(parsePeriodToken("2026_07")).toEqual({startsOn: "2026-07-01", endsOn: "2026-07-31", kind: "month", fiscalYear: 2026});
    expect(parsePeriodToken("2024_02")).toEqual({startsOn: "2024-02-01", endsOn: "2024-02-29", kind: "month", fiscalYear: 2024});
    expect(parsePeriodToken("2026_13")).toBeNull();
    expect(parsePeriodToken("jul-26")).toBeNull();
  });
});

describe("chart of accounts", () => {
  it("is internally consistent (codes exist, same statement, no cycles)", () => {
    expect(validateChartOfAccounts()).toEqual([]);
    const codes = new Set(chartOfAccounts.map((a) => a.code));
    expect(codes.size).toBe(chartOfAccounts.length);
  });

  it("exposes leaves per statement and the key totals", () => {
    expect(leafAccounts("income").every((a) => a.statement === "income" && !a.sumOf)).toBe(true);
    expect(chartOfAccountsMap.get("bs_total_assets")?.sumOf).toEqual(["bs_current_assets", "bs_noncurrent_assets"]);
    expect(chartOfAccountsMap.get("is_adjusted_ebitda")?.sumOf).toEqual(["is_ebitda", "is_nonrecurring_adjustments"]);
    expect(chartOfAccountsMap.get("cf_closing_cash")?.sumOf).toEqual(["cf_opening_cash", "cf_net_change_in_cash"]);
  });
});

describe("auto-accept policy v1", () => {
  it("accepts a verified, precise, confident, conflict-free material value", () => {
    const decision = autoAcceptDecision({materiality: "material", anchorVerified: true, anchorPrecision: "cell", calibratedConfidence: 0.97, hasOpenConflict: false, shadowAgreement: true});
    expect(decision.accept).toBe(true);
    expect(decision.reasons).toEqual([]);
    expect(decision.policyVersion).toBe("auto-accept-v1");
  });

  it("refuses unverified anchors, page-only precision, conflicts and shadow disagreement for material values", () => {
    expect(autoAcceptDecision({materiality: "material", anchorVerified: false, anchorPrecision: "cell", calibratedConfidence: 0.99, hasOpenConflict: false}).reasons).toContain("anchor_not_verified");
    const pageOnly = autoAcceptDecision({materiality: "material", anchorVerified: true, anchorPrecision: "page", calibratedConfidence: 0.99, hasOpenConflict: false});
    expect(pageOnly.accept).toBe(false);
    expect(pageOnly.effectiveConfidence).toBe(0.8);
    expect(pageOnly.reasons).toContain("precision_page_not_allowed");
    expect(autoAcceptDecision({materiality: "material", anchorVerified: true, anchorPrecision: "row", calibratedConfidence: 0.99, hasOpenConflict: true}).reasons).toContain("open_conflict");
    expect(autoAcceptDecision({materiality: "material", anchorVerified: true, anchorPrecision: "row", calibratedConfidence: 0.99, hasOpenConflict: false, shadowAgreement: false}).reasons).toContain("shadow_disagreement");
    expect(autoAcceptDecision({materiality: "material", anchorVerified: true, anchorPrecision: "row", calibratedConfidence: 0.94, hasOpenConflict: false}).reasons).toContain("confidence_below_threshold");
  });

  it("is looser for supporting values but still requires a verified anchor", () => {
    expect(autoAcceptDecision({materiality: "supporting", anchorVerified: true, anchorPrecision: "page", calibratedConfidence: 0.92, hasOpenConflict: true}).accept).toBe(false);
    expect(autoAcceptDecision({materiality: "supporting", anchorVerified: true, anchorPrecision: "block", calibratedConfidence: 0.92, hasOpenConflict: true}).accept).toBe(true);
    expect(autoAcceptDecision({materiality: "supporting", anchorVerified: false, anchorPrecision: "block", calibratedConfidence: 0.99, hasOpenConflict: false}).accept).toBe(false);
  });
});

describe("reconciliation rules and definitions", () => {
  it("has R1–R19 with unique ids and bilingual titles", () => {
    expect(reconciliationRules.map((r) => r.id)).toEqual(Array.from({length: 19}, (_, i) => `R${i + 1}`));
    for (const rule of reconciliationRules) {
      expect(rule.titles.pt.length).toBeGreaterThan(0);
      expect(rule.titles.en.length).toBeGreaterThan(0);
      expect(rule.rationale.pt.length).toBeGreaterThan(0);
    }
  });

  it("declares the base financial definitions with explicit inputs", () => {
    const ids = financialDefinitions.map((d) => d.id);
    expect(ids).toEqual(expect.arrayContaining(["adjusted_ebitda", "cfads", "dscr", "interest_coverage", "collateral_coverage", "net_debt", "leverage"]));
    for (const definition of financialDefinitions) {
      for (const input of definition.inputs) expect(definition.formula).toContain(input);
    }
  });
});

describe("commercial data has a document kind, so the customers group is reachable", () => {
  it("gives customer concentration its own kind rather than leaving it as other", () => {
    // Without it, the nearest neighbour a model reaches for is `management_accounts`, a table of
    // customers is plainly not that, and the document lands on `other`.
    const definition = documentKindDefinition("customer_concentration");
    expect(definition.informationClass).toBe("management");
    expect(definition.typicalFieldGroups).toContain("customers");
  });

  it("keeps other empty, which is why other is not an answer", () => {
    // `other` maps to no field groups at all: a document classified there is never asked for
    // anything, so a missing kind is not a cosmetic gap, it silently removes a field group.
    expect(documentKindDefinition("other").typicalFieldGroups).toHaveLength(0);
  });

  it("ranks it below anything an accountant or an auditor touched", () => {
    const concentration = evidenceRankFor(documentKindDefinition("customer_concentration").informationClass);
    expect(concentration).toBeGreaterThan(evidenceRankFor("audited"));
    expect(concentration).toBeGreaterThan(evidenceRankFor("accounting"));
  });
});
