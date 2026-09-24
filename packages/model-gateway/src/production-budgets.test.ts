import {describe, expect, it} from "vitest";
import {productionModelCeilingsUsd, productionRunBudget} from "./production-budgets";

/**
 * The run budget travels to `private.begin_processing_run`, which validates it and divides it
 * between the documents and the case analysis. These are the rules of that function (migration
 * 20260829003002_economic_pipeline_guardrails.sql): a budget outside them is refused with
 * `processing_budget_invalid` and no run starts.
 */
type RunBudget = {[Key in keyof typeof productionRunBudget]: number};
function allocate(budget: RunBudget, paidDocuments: number) {
  const valid = budget.max_cost_usd > 0 && budget.max_cost_usd <= 25
    && budget.max_calls >= 1 && budget.max_calls <= 500
    && budget.document_max_cost_usd > 0 && budget.document_max_cost_usd <= budget.max_cost_usd
    && budget.document_max_calls >= 1 && budget.document_max_calls <= 50
    && budget.case_max_cost_usd > 0 && budget.case_max_cost_usd < budget.max_cost_usd
    && budget.case_max_calls >= 1 && budget.case_max_calls <= 20 && budget.case_max_calls < budget.max_calls;
  return {
    valid,
    documentUsd: Math.min(budget.document_max_cost_usd, (budget.max_cost_usd - budget.case_max_cost_usd) / paidDocuments),
    documentCalls: Math.min(budget.document_max_calls, Math.floor((budget.max_calls - budget.case_max_calls) / paidDocuments)),
  };
}

describe("production budgets", () => {
  it("passes the database's validation and gives an eight-document room the whole per-document ceiling", () => {
    expect(allocate(productionRunBudget, 8)).toEqual({valid: true, documentUsd: productionModelCeilingsUsd.documentPipeline, documentCalls: 8});
    // Beyond eight documents the database divides what the case leaves, as it always has.
    expect(allocate(productionRunBudget, 10).documentUsd).toBeCloseTo((16 - 3.1) / 10, 10);
    expect(productionRunBudget.case_max_cost_usd).toBe(productionModelCeilingsUsd.caseAnalysis);
  });

  it("admits at every room size at least 1.49 times what the old run budget gave a document", () => {
    // 1.49 is the largest ratio of calibrated to former reservation over the document requests:
    // with it no call the former estimate admitted is refused for money by the calibrated one.
    const old: RunBudget = {max_cost_usd: 5, max_calls: 160, document_max_cost_usd: 0.75, document_max_calls: 8, case_max_cost_usd: 1, case_max_calls: 4};
    for (let documents = 1; documents <= 40; documents++) {
      expect(allocate(productionRunBudget, documents).documentUsd / allocate(old, documents).documentUsd, `${documents}`).toBeGreaterThanOrEqual(1.49);
    }
    expect(productionModelCeilingsUsd.caseAnalysis / old.case_max_cost_usd).toBeGreaterThanOrEqual(1.58);
  });

  it("names every ceiling in whole cents of five, never zero", () => {
    for (const [name, value] of Object.entries(productionModelCeilingsUsd)) {
      expect(value, name).toBeGreaterThan(0);
      expect(Math.round(value * 100) % 5, name).toBe(0);
    }
  });
});
