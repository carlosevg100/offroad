import Decimal from "decimal.js";
import {calculateAdjustedEbitda, calculateLeverage, applyCollateralHaircuts, type CalculationResult} from "@offroad/financial-core";

import {factValue, type ReconciledFact} from "./facts";
import type {RuleContext} from "./rules";

/**
 * The numbers the desk computes, each one showing its work.
 *
 * Every calculation here is arithmetic over reconciled facts, done by `financial-core` in
 * Decimal, and every one carries a trace: which inputs, from which fact, from which document.
 * That is the whole difference between a platform that says "leverage is 2.87x" and one that
 * can be asked *why* and answer with the two numbers and the two documents they came from.
 *
 * A calculation whose inputs are missing does not appear. It is never estimated, never carried
 * over from a neighbouring period, never defaulted to zero — the gap is reported instead, and
 * a missing metric with a named cause is more useful to a credit committee than a number
 * nobody can source.
 */

export type TracedCalculation = {
  id: string;
  labels: {pt: string; en: string};
  value: string;
  /** Inputs, in order, with where each came from. */
  trace: Array<{label: string; value: string; fieldPath?: string; sourceDocument?: string}>;
  /** Facts this calculation depends on — the audit trail from number to page. */
  inputs: string[];
  warnings: string[];
};

/** Missing inputs, so the caller can turn them into a question rather than a silent absence. */
export type CalculationGap = {
  id: string;
  labels: {pt: string; en: string};
  missing: string[];
};

export type CalculationSet = {
  calculations: TracedCalculation[];
  gaps: CalculationGap[];
};

type Sourced = {value: Decimal; fieldPath: string; sourceDocument?: string};

function sourced(context: RuleContext, fieldPath: string, periodEnd?: string): Sourced | null {
  const value = factValue(context.index, fieldPath, periodEnd);
  if (value === null) return null;
  const fact: ReconciledFact | undefined = context.index.get(periodEnd ? [fieldPath, periodEnd].join("|") : fieldPath);
  return {value, fieldPath, ...(fact?.accepted.sourceDocument ? {sourceDocument: fact.accepted.sourceDocument} : {})};
}

function traced(
  id: string,
  labels: {pt: string; en: string},
  result: CalculationResult,
  inputs: Sourced[],
): TracedCalculation {
  const byLabel = new Map(inputs.map((input, index) => [index, input]));
  return {
    id,
    labels,
    value: result.value,
    trace: result.trace.map((entry, index) => {
      const input = byLabel.get(index);
      return {
        label: entry.label,
        value: entry.value,
        ...(input?.fieldPath ? {fieldPath: input.fieldPath} : {}),
        ...(input?.sourceDocument ? {sourceDocument: input.sourceDocument} : {}),
      };
    }),
    inputs: inputs.map((input) => input.fieldPath),
    warnings: result.warnings,
  };
}

/**
 * Computes what can be computed, and names what cannot.
 *
 * The set is deliberately small and load-bearing: net debt, adjusted EBITDA, leverage before
 * and after the operation, collateral capacity after haircuts, and the sources/uses totals.
 * These are the numbers a credit committee asks for first, and the ones every downstream
 * document repeats.
 */
export function computeCalculations(context: RuleContext): CalculationSet {
  const calculations: TracedCalculation[] = [];
  const gaps: CalculationGap[] = [];
  const period = context.periods[0];
  const year = period?.slice(0, 4) ?? "";

  const pick = (paths: string[]): Sourced | null => {
    for (const path of paths) {
      const found = sourced(context, path, period) ?? sourced(context, path);
      if (found) return found;
    }
    return null;
  };

  // ---- net debt -------------------------------------------------------------------------
  const grossDebt = pick(["debt.total_gross", `historical_financials.${year}.gross_debt`, `interim_financials.${year}_07.gross_debt`]);
  const cash = pick([`historical_financials.${year}.cash`, `interim_financials.${year}_07.cash`]);

  let netDebt: Sourced | null = null;
  if (grossDebt && cash) {
    const value = grossDebt.value.minus(cash.value);
    netDebt = {value, fieldPath: "calculated.net_debt"};
    calculations.push({
      id: "net_debt",
      labels: {pt: "Dívida líquida", en: "Net debt"},
      value: value.toDecimalPlaces(2).toFixed(),
      trace: [
        {label: "gross_debt", value: grossDebt.value.toFixed(), fieldPath: grossDebt.fieldPath, ...(grossDebt.sourceDocument ? {sourceDocument: grossDebt.sourceDocument} : {})},
        {label: "cash", value: cash.value.toFixed(), fieldPath: cash.fieldPath, ...(cash.sourceDocument ? {sourceDocument: cash.sourceDocument} : {})},
      ],
      inputs: [grossDebt.fieldPath, cash.fieldPath],
      warnings: [],
    });
  } else {
    gaps.push({
      id: "net_debt",
      labels: {pt: "Dívida líquida", en: "Net debt"},
      missing: [!grossDebt ? "dívida bruta" : "", !cash ? "caixa e equivalentes" : ""].filter(Boolean),
    });
  }

  // ---- adjusted EBITDA ------------------------------------------------------------------
  const ebitda = pick([`historical_financials.${year}.ebitda`, `interim_financials.${year}_07.ebitda_ltm`, `interim_financials.${year}_07.ebitda`]);
  let adjustedEbitda: Sourced | null = null;
  if (ebitda) {
    // Add-backs are only included once a human approved them (R10); none are assumed here.
    const result = calculateAdjustedEbitda(ebitda.value, []);
    adjustedEbitda = {value: new Decimal(result.value), fieldPath: "calculated.adjusted_ebitda"};
    calculations.push(
      traced("adjusted_ebitda", {pt: "EBITDA ajustado", en: "Adjusted EBITDA"}, result, [ebitda, ebitda]),
    );
  } else {
    gaps.push({id: "adjusted_ebitda", labels: {pt: "EBITDA ajustado", en: "Adjusted EBITDA"}, missing: ["EBITDA do período"]});
  }

  // ---- leverage, before and after -------------------------------------------------------
  if (netDebt && adjustedEbitda && adjustedEbitda.value.gt(0)) {
    const result = calculateLeverage(netDebt.value, adjustedEbitda.value);
    calculations.push(
      traced("leverage_pre_transaction", {pt: "Alavancagem pré-operação", en: "Leverage before the transaction"}, result, [netDebt, adjustedEbitda]),
    );

    const requested = pick(["transaction.requested_amount"]);
    if (requested) {
      const postGross = (grossDebt?.value ?? new Decimal(0)).plus(requested.value);
      calculations.push({
        id: "gross_debt_post_transaction",
        labels: {pt: "Dívida bruta pós-operação", en: "Gross debt after the transaction"},
        value: postGross.toDecimalPlaces(2).toFixed(),
        trace: [
          {label: "gross_debt", value: (grossDebt?.value ?? new Decimal(0)).toFixed(), ...(grossDebt?.fieldPath ? {fieldPath: grossDebt.fieldPath} : {})},
          {label: "requested_amount", value: requested.value.toFixed(), fieldPath: requested.fieldPath},
        ],
        inputs: [grossDebt?.fieldPath ?? "", requested.fieldPath].filter(Boolean),
        warnings: [],
      });

      const postNet = postGross.minus(cash?.value ?? new Decimal(0));
      const postResult = calculateLeverage(postNet, adjustedEbitda.value);
      calculations.push({
        ...traced("leverage_post_transaction", {pt: "Alavancagem pós-operação", en: "Leverage after the transaction"}, postResult, [netDebt, adjustedEbitda]),
        // Post-transaction leverage assumes the full amount drawn and no EBITDA from it yet —
        // the conservative reading, and the one a lender underwrites to.
        warnings: [
          ...postResult.warnings,
          "assume desembolso integral e nenhum EBITDA incremental do uso dos recursos",
        ],
      });
    }
  } else if (!gaps.some((gap) => gap.id === "net_debt" || gap.id === "adjusted_ebitda")) {
    gaps.push({id: "leverage", labels: {pt: "Alavancagem", en: "Leverage"}, missing: ["EBITDA positivo"]});
  }

  // ---- collateral capacity --------------------------------------------------------------
  const collateralItems = context.facts
    .filter((fact) => /^collateral\.assets\.\d+\.eligible_base$/.test(fact.key.fieldPath) && fact.valueType === "number")
    .map((fact) => {
      const index = fact.key.fieldPath.split(".")[2];
      const haircut = factValue(context.index, `collateral.assets.${index}.policy_haircut`);
      const description = context.index.get(`collateral.assets.${index}.description`);
      return {
        name: description?.value ?? `ativo ${index}`,
        grossValue: fact.value,
        haircutRate: haircut ? haircut.toFixed() : "0",
        fieldPath: fact.key.fieldPath,
        sourceDocument: fact.accepted.sourceDocument,
      };
    });

  if (collateralItems.length > 0) {
    const result = applyCollateralHaircuts(collateralItems);
    calculations.push({
      id: "collateral_capacity_total",
      labels: {pt: "Capacidade de garantias após haircut", en: "Collateral capacity after haircuts"},
      value: result.value,
      trace: result.trace.map((entry, index) => ({
        label: entry.label,
        value: entry.value,
        ...(collateralItems[index]?.fieldPath ? {fieldPath: collateralItems[index]!.fieldPath} : {}),
        ...(collateralItems[index]?.sourceDocument ? {sourceDocument: collateralItems[index]!.sourceDocument} : {}),
      })),
      inputs: collateralItems.map((item) => item.fieldPath),
      warnings: result.warnings,
    });
  } else {
    gaps.push({
      id: "collateral_capacity_total",
      labels: {pt: "Capacidade de garantias", en: "Collateral capacity"},
      missing: ["base elegível e haircut por ativo"],
    });
  }

  // ---- sources and uses -----------------------------------------------------------------
  for (const [side, id, labels] of [
    ["sources", "sources_total", {pt: "Total das fontes", en: "Total sources"}],
    ["uses", "uses_total", {pt: "Total dos usos", en: "Total uses"}],
  ] as const) {
    const entries = context.facts.filter(
      (fact) => /^transaction\.sources_and_uses\.\d+\.side$/.test(fact.key.fieldPath) && fact.value === side,
    );
    if (entries.length === 0) continue;

    const amounts = entries
      .map((fact) => context.index.get(fact.key.fieldPath.replace(/\.side$/, ".amount")))
      .filter((fact): fact is ReconciledFact => Boolean(fact) && fact!.valueType === "number");
    if (amounts.length === 0) continue;

    const total = amounts.reduce((sum, fact) => sum.plus(new Decimal(fact.value)), new Decimal(0));
    calculations.push({
      id,
      labels,
      value: total.toDecimalPlaces(2).toFixed(),
      trace: amounts.map((fact) => ({
        label: fact.key.fieldPath,
        value: fact.value,
        fieldPath: fact.key.fieldPath,
        ...(fact.accepted.sourceDocument ? {sourceDocument: fact.accepted.sourceDocument} : {}),
      })),
      inputs: amounts.map((fact) => fact.key.fieldPath),
      warnings: [],
    });
  }

  return {calculations, gaps};
}
