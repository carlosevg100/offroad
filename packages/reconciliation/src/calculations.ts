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
  // Projection dates can be years ahead of the balance sheet. They must never move the
  // calculation anchor forward and make today's cash, debt and LTM EBITDA disappear.
  const period = [...new Set(
    context.facts
      .filter((fact) => /^(historical|interim)_financials\./.test(fact.key.fieldPath))
      .map((fact) => fact.key.periodEnd)
      .filter((value): value is string => Boolean(value)),
  )].sort().reverse()[0] ?? context.periods[0];
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
      const refinancing = pick(["transaction.refinancing"]);
      const companyCash = pick(["project.company_cash"]);
      const projectedEbitda = pick([`projections.${year}.ebitda`]);
      const postGross = (grossDebt?.value ?? new Decimal(0))
        .plus(requested.value)
        .minus(refinancing?.value ?? new Decimal(0));
      calculations.push({
        id: "gross_debt_post_transaction",
        labels: {pt: "Dívida bruta pós-operação", en: "Gross debt after the transaction"},
        value: postGross.toDecimalPlaces(2).toFixed(),
        trace: [
          {label: "gross_debt", value: (grossDebt?.value ?? new Decimal(0)).toFixed(), ...(grossDebt?.fieldPath ? {fieldPath: grossDebt.fieldPath} : {})},
          {label: "requested_amount", value: requested.value.toFixed(), fieldPath: requested.fieldPath},
          ...(refinancing ? [{label: "refinancing_repaid", value: refinancing.value.negated().toFixed(), fieldPath: refinancing.fieldPath}] : []),
        ],
        inputs: [grossDebt?.fieldPath ?? "", requested.fieldPath, refinancing?.fieldPath ?? ""].filter(Boolean),
        warnings: [],
      });

      const postCash = (cash?.value ?? new Decimal(0)).minus(companyCash?.value ?? new Decimal(0));
      const leverageEbitda = projectedEbitda ?? adjustedEbitda;
      const postNet = postGross.minus(postCash);
      const postResult = calculateLeverage(postNet, leverageEbitda.value);
      calculations.push({
        id: "leverage_post_transaction",
        labels: {pt: "Alavancagem pós-operação", en: "Leverage after the transaction"},
        value: postResult.value,
        trace: [
          {label: "gross_debt_post_transaction", value: postGross.toFixed(), fieldPath: "calculated.gross_debt_post_transaction"},
          {label: "cash_before_transaction", value: (cash?.value ?? new Decimal(0)).toFixed(), ...(cash?.fieldPath ? {fieldPath: cash.fieldPath} : {})},
          ...(companyCash ? [{label: "company_cash_used", value: companyCash.value.toFixed(), fieldPath: companyCash.fieldPath}] : []),
          {label: projectedEbitda ? "projected_ebitda_at_closing" : "current_adjusted_ebitda", value: leverageEbitda.value.toFixed(), fieldPath: leverageEbitda.fieldPath},
        ],
        inputs: [grossDebt?.fieldPath ?? "", requested.fieldPath, refinancing?.fieldPath ?? "", cash?.fieldPath ?? "", companyCash?.fieldPath ?? "", leverageEbitda.fieldPath].filter(Boolean),
        warnings: [
          ...postResult.warnings,
          ...(projectedEbitda
            ? ["usa o EBITDA projetado para o ano do fechamento, identificado como premissa da administração"]
            : ["na ausência de EBITDA para o fechamento, mantém o EBITDA ajustado atual"]),
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

  const collateralCapacityComponents = [
    "collateral.receivables_capacity",
    "collateral.inventory_capacity",
    "collateral.property_equipment_capacity",
  ]
    .map((fieldPath) => sourced(context, fieldPath, period) ?? sourced(context, fieldPath))
    .filter((item): item is Sourced => item !== null);

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
  } else if (collateralCapacityComponents.length > 0) {
    const total = collateralCapacityComponents.reduce((sum, item) => sum.plus(item.value), new Decimal(0));
    calculations.push({
      id: "collateral_capacity_total",
      labels: {pt: "Capacidade de garantias após haircut", en: "Collateral capacity after haircuts"},
      value: total.toDecimalPlaces(2).toFixed(),
      trace: collateralCapacityComponents.map((item) => ({
        label: item.fieldPath,
        value: item.value.toFixed(),
        fieldPath: item.fieldPath,
        ...(item.sourceDocument ? {sourceDocument: item.sourceDocument} : {}),
      })),
      inputs: collateralCapacityComponents.map((item) => item.fieldPath),
      warnings: [],
    });
  } else {
    gaps.push({
      id: "collateral_capacity_total",
      labels: {pt: "Capacidade de garantias", en: "Collateral capacity"},
      missing: ["base elegível e haircut por ativo"],
    });
  }

  // ---- stabilized project add-on --------------------------------------------------------
  const investmentIndexes = [...new Set(
    context.facts
      .map((fact) => fact.key.fieldPath.match(/^project\.investments\.(\d+)\.stabilized_revenue$/)?.[1])
      .filter((index): index is string => Boolean(index)),
  )].sort((a, b) => Number(a) - Number(b));
  if (investmentIndexes.length > 0) {
    const revenues = investmentIndexes
      .map((index) => sourced(context, `project.investments.${index}.stabilized_revenue`))
      .filter((item): item is Sourced => item !== null);
    const margins = investmentIndexes
      .map((index) => sourced(context, `project.investments.${index}.stabilized_ebitda_margin`))
      .filter((item): item is Sourced => item !== null);
    if (revenues.length === investmentIndexes.length) {
      const totalRevenue = revenues.reduce((sum, item) => sum.plus(item.value), new Decimal(0));
      calculations.push({
        id: "addon_stabilized_revenue",
        labels: {pt: "Receita estabilizada incremental", en: "Stabilized incremental revenue"},
        value: totalRevenue.toDecimalPlaces(2).toFixed(),
        trace: revenues.map((item) => ({label: item.fieldPath, value: item.value.toFixed(), fieldPath: item.fieldPath, ...(item.sourceDocument ? {sourceDocument: item.sourceDocument} : {})})),
        inputs: revenues.map((item) => item.fieldPath),
        warnings: ["run-rate estabilizado do projeto, não receita do primeiro ano"],
      });
    }
    if (revenues.length === investmentIndexes.length && margins.length === investmentIndexes.length) {
      const totalEbitda = investmentIndexes.reduce((sum, _index, position) =>
        sum.plus(revenues[position]!.value.times(margins[position]!.value)), new Decimal(0));
      calculations.push({
        id: "addon_stabilized_ebitda",
        labels: {pt: "EBITDA estabilizado incremental", en: "Stabilized incremental EBITDA"},
        value: totalEbitda.toDecimalPlaces(2).toFixed(),
        trace: investmentIndexes.flatMap((_index, position) => [
          {label: revenues[position]!.fieldPath, value: revenues[position]!.value.toFixed(), fieldPath: revenues[position]!.fieldPath, ...(revenues[position]!.sourceDocument ? {sourceDocument: revenues[position]!.sourceDocument} : {})},
          {label: margins[position]!.fieldPath, value: margins[position]!.value.toFixed(), fieldPath: margins[position]!.fieldPath, ...(margins[position]!.sourceDocument ? {sourceDocument: margins[position]!.sourceDocument} : {})},
        ]),
        inputs: investmentIndexes.flatMap((_index, position) => [revenues[position]!.fieldPath, margins[position]!.fieldPath]),
        warnings: ["receita estabilizada multiplicada pela margem EBITDA estabilizada de cada unidade"],
      });
    } else if (revenues.length > 0) {
      gaps.push({
        id: "addon_stabilized_ebitda",
        labels: {pt: "EBITDA estabilizado incremental", en: "Stabilized incremental EBITDA"},
        missing: ["margem EBITDA estabilizada de cada unidade"],
      });
    }
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
