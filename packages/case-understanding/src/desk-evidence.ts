import type {DeskAnalysis, Finding, Trajectory} from "@offroad/credit-analysis";
import type {TracedCalculation} from "@offroad/reconciliation";

/**
 * The desk battery's findings, as evidence the brief can cite and the auditor can check.
 *
 * The battery produces sentences with numbers in them, and the brief's iron rule is that a
 * number without a citable source is rejected before anyone reads it. So every value a finding
 * cites becomes a traced calculation (`desk.covenant-breach-day-one.maxNewDebt`), and the
 * headline metrics of the trajectory become citable the same way. The model narrates, cites,
 * and the same auditor that checks facts checks these: one gate, not two.
 */

const label = (text: string): {pt: string; en: string} => ({pt: text, en: text});

const findingCalculations = (finding: Finding): TracedCalculation[] =>
  Object.entries(finding.values).map(([key, value]) => ({
    id: `desk.${finding.id}.${key}`,
    labels: label(`${finding.id}: ${key}`),
    value,
    trace: finding.inputs.map((input) => ({label: input, value: "", fieldPath: input})),
    inputs: finding.inputs,
    warnings: [],
  }));

export function deskEvidence(desk: DeskAnalysis | null, trajectory: Trajectory | null): {
  calculations: TracedCalculation[];
  promptLines: string[];
} {
  if (!desk) return {calculations: [], promptLines: []};

  const calculations: TracedCalculation[] = desk.findings.flatMap(findingCalculations);

  const metric = (id: string, value: string | null, labelText: string, inputs: string[]) => {
    if (value === null) return;
    calculations.push({id, labels: label(labelText), value, trace: [], inputs, warnings: []});
  };

  metric("desk.alavancagem_pre", desk.leverage.preTurns, "Alavancagem pré-operação (dívida líquida/EBITDA)", ["historical_financials.gross_debt", "historical_financials.cash", "historical_financials.ebitda"]);
  metric("desk.divida_nova_que_cabe", desk.leverage.maxNewDebtUnderCovenants, "Dívida nova que cabe sob o covenant mais apertado", ["debt.covenants", "historical_financials.ebitda"]);
  metric("desk.cobertura_de_juros", desk.leverage.interestCoverage, "Cobertura de juros (EBITDA / despesa financeira)", ["historical_financials.ebitda", "historical_financials.financial_expenses"]);
  metric("desk.cobertura_de_juros_pos", desk.leverage.interestCoveragePost, "Cobertura de juros com a operação", ["transaction.requested_amount", "historical_financials.financial_expenses"]);
  metric("desk.custo_medio_do_stack", desk.stack.weightedCost, "Custo médio do estoque de dívida (efetivo anual)", ["debt.instruments"]);
  metric("desk.divida_fora_do_mapa", desk.stack.scheduleGap, "Dívida no balanço ausente do mapa", ["debt.total_gross", "historical_financials.gross_debt"]);
  metric("desk.vencendo_24m", desk.stack.maturingWithin24Months, "Principal vencendo em 24 meses", ["debt.instruments"]);
  metric("desk.vencendo_12m", desk.stack.maturingWithin12Months, "Principal vencendo em 12 meses", ["debt.maturity_profile", "debt.instruments"]);
  metric("desk.cobertura_12m", desk.stack.liquidityCoverage12, "Caixa sobre o principal de 12 meses", ["interim_financials.cash", "debt.maturity_profile"]);
  metric("desk.ciclo_de_caixa_dias", desk.workingCapital.cycleDays, "Ciclo de caixa em dias", ["historical_financials.receivables", "historical_financials.inventory", "historical_financials.payables"]);
  metric("desk.recebiveis_livres", desk.encumbrance.free, "Recebíveis livres de ônus", ["debt.instruments", "interim_financials.receivables"]);
  if (desk.runway) {
    metric("desk.runway_pre_meses", desk.runway.monthsPre, "Runway antes da operação (meses)", ["interim_financials.cash", "interim_financials.monthly_burn"]);
    metric("desk.runway_pos_meses", desk.runway.monthsPostAfterService, "Runway após a operação, com o serviço da dívida (meses)", ["transaction.requested_amount", "interim_financials.monthly_burn"]);
    metric("desk.queima_mensal", desk.runway.monthlyBurn, "Queima de caixa mensal", ["interim_financials.monthly_burn"]);
    metric("desk.divida_sobre_arr", desk.runway.debtToArr, "Dívida pós-operação sobre ARR", ["interim_financials.arr", "debt.total_gross", "transaction.requested_amount"]);
    metric("desk.arr", desk.runway.arr, "Receita recorrente anualizada (ARR)", ["interim_financials.arr"]);
  }
  for (const scenario of desk.leverage.scenarios) {
    metric(`desk.alavancagem_pos.${scenario.source.replace(/\s+/g, "_")}`, scenario.postTurns, `Alavancagem pós (${scenario.source})`, ["transaction.requested_amount", "historical_financials.ebitda"]);
  }

  if (trajectory) {
    for (const year of trajectory.years) {
      metric(`trajetoria.${year.year}.alavancagem`, year.leverageBase, `Alavancagem projetada ${year.year}`, ["projections.ebitda", "debt.instruments"]);
      metric(`trajetoria.${year.year}.alavancagem_cortada`, year.leverageStressed, `Alavancagem ${year.year} com corte do crescimento`, ["projections.ebitda"]);
    }
    if (trajectory.liabilityManagement) {
      metric("trajetoria.linhas_com_covenant", trajectory.liabilityManagement.covenantedBalance, "Saldo das linhas com covenant a quitar", ["debt.instruments"]);
      metric("trajetoria.dinheiro_novo_liquido", trajectory.liabilityManagement.netNewMoney, "Dinheiro efetivamente novo após a quitação", ["transaction.requested_amount", "debt.instruments"]);
      metric("trajetoria.alavancagem_pos_refi", trajectory.liabilityManagement.postLeverageAfterRefi, "Alavancagem pós com quitação das linhas com covenant", ["debt.instruments", "historical_financials.ebitda"]);
    }
    for (const finding of trajectory.findings) calculations.push(...findingCalculations(finding));
  }

  const promptLines = [
    "",
    "## Análise da mesa (computada deterministicamente; você narra e cita, nunca recalcula)",
    "Cada achado abaixo já foi verificado. Reescreva com a sua prosa se quiser, mas todo número",
    "citado tem id próprio (desk.* e trajetoria.*) e a frase que o usar deve citá-lo.",
    "",
    ...desk.findings.map((finding) => `[${finding.severity.toUpperCase()}] ${finding.pt} · ids: ${Object.keys(finding.values).map((key) => `desk.${finding.id}.${key}`).join(", ")}`),
    ...(trajectory
      ? [
          "",
          "### Trajetória de alavancagem (ids trajetoria.<ano>.alavancagem)",
          ...trajectory.years.map((year) => `${year.year}: ${year.leverageBase}x (cenário cortado ${year.leverageStressed}x)`),
          ...trajectory.findings.map((finding) => `[${finding.severity.toUpperCase()}] ${finding.pt} · ids: ${Object.keys(finding.values).map((key) => `desk.${finding.id}.${key}`).join(", ")}`),
        ]
      : []),
  ];

  return {calculations, promptLines};
}
