import {
  calculateConcentration,
  calculateCurrencyExposure,
  calculateCashConversion,
  calculateCfads,
  calculateMargin,
  calculateSeasonality,
  calculateWorkingCapital,
  calculateWorkingCapitalInvestment,
  checkIdentity,
} from "@offroad/financial-core";
import Decimal from "decimal.js";
import {z} from "zod";

import type {ReconciledFact} from "./facts";

const decimalString = z.string().regex(/^-?\d+(?:\.\d+)?$/);
const evidenceLinkSchema = z.object({
  fieldPath: z.string().min(1),
  sourceDocument: z.string().min(1),
  anchor: z.unknown().optional(),
}).strict();

export const accountingLineSchema = z.object({
  metric: z.string().min(1),
  value: decimalString,
  evidence: evidenceLinkSchema,
  informationClass: z.string().min(1),
  disputed: z.boolean(),
}).strict();
export type AccountingLine = z.infer<typeof accountingLineSchema>;

export const normalizationAdjustmentSchema = z.object({
  id: z.string().min(1),
  description: z.string().min(1),
  amount: decimalString,
  decision: z.enum(["accepted", "rejected", "case_by_case"]),
  rationale: z.string().min(1),
  evidence: z.array(evidenceLinkSchema).min(1),
}).strict();
export type NormalizationAdjustment = z.infer<typeof normalizationAdjustmentSchema>;

export const financialStatementViewSchema = z.object({
  id: z.string().min(1),
  period: z.string().min(4),
  periodEnd: z.string().nullable(),
  basis: z.enum(["historical", "interim", "projected"]),
  entity: z.string().nullable(),
  scope: z.string().nullable(),
  lines: z.array(accountingLineSchema),
  reportedEbitda: decimalString.nullable(),
  adjustedEbitda: decimalString.nullable(),
  ebitdaMargin: decimalString.nullable(),
  workingCapital: decimalString.nullable(),
  cfads: decimalString.nullable(),
  cashConversion: decimalString.nullable(),
  adjustments: z.array(normalizationAdjustmentSchema),
}).strict();
export type FinancialStatementView = z.infer<typeof financialStatementViewSchema>;

export const cashConversionBridgeSchema = z.object({
  statementId: z.string().min(1),
  lines: z.array(z.object({id: z.string(), value: decimalString, operation: z.enum(["start", "add", "subtract"])}).strict()),
  cfads: decimalString,
  conversion: decimalString,
  evidence: z.array(evidenceLinkSchema),
}).strict();
export type CashConversionBridge = z.infer<typeof cashConversionBridgeSchema>;

export const workingCapitalBridgeSchema = z.object({
  fromStatementId: z.string().min(1),
  toStatementId: z.string().min(1),
  priorWorkingCapital: decimalString,
  currentWorkingCapital: decimalString,
  investment: decimalString,
  evidence: z.array(evidenceLinkSchema),
}).strict();
export type WorkingCapitalBridge = z.infer<typeof workingCapitalBridgeSchema>;

export const maintenanceCapexBridgeSchema = z.object({
  statementId: z.string().min(1),
  totalCapex: decimalString.nullable(),
  maintenanceCapex: decimalString.nullable(),
  growthCapex: decimalString.nullable(),
  method: z.enum(["reported_split", "company_supported_estimate", "not_computable"]),
  evidence: z.array(evidenceLinkSchema),
}).strict();
export type MaintenanceCapexBridge = z.infer<typeof maintenanceCapexBridgeSchema>;

export const financialIdentityCheckSchema = z.object({
  id: z.string().min(1),
  statementId: z.string().min(1),
  left: decimalString,
  right: decimalString,
  difference: decimalString,
  tolerance: decimalString,
  status: z.enum(["pass", "fail"]),
  evidence: z.array(evidenceLinkSchema),
}).strict();
export type FinancialIdentityCheck = z.infer<typeof financialIdentityCheckSchema>;

export const reconciliationExceptionSchema = z.object({
  id: z.string().min(1),
  severity: z.enum(["low", "medium", "high", "critical"]),
  status: z.enum(["open", "resolved"]),
  message: z.object({pt: z.string().min(1), en: z.string().min(1)}).strict(),
  affectedFields: z.array(z.string().min(1)),
  evidence: z.array(evidenceLinkSchema),
  blocksExternalOutputs: z.boolean(),
}).strict();
export type FinancialTruthException = z.infer<typeof reconciliationExceptionSchema>;

export const projectedStatementSetSchema = z.object({
  base: z.array(z.string()),
  downside: z.array(z.string()),
  missingDownside: z.boolean(),
}).strict();
export type ProjectedStatementSet = z.infer<typeof projectedStatementSetSchema>;

export const financialTruthSetSchema = z.object({
  version: z.string().min(1),
  status: z.enum(["complete", "partial", "blocked"]),
  statements: z.array(financialStatementViewSchema),
  cashConversionBridges: z.array(cashConversionBridgeSchema),
  workingCapitalBridges: z.array(workingCapitalBridgeSchema),
  maintenanceCapexBridges: z.array(maintenanceCapexBridgeSchema),
  projectedStatements: projectedStatementSetSchema,
  identityChecks: z.array(financialIdentityCheckSchema),
  exceptions: z.array(reconciliationExceptionSchema),
  missingInputs: z.array(z.string()),
  analytics: z.object({
    customerConcentration: z.object({top1: decimalString, top5: decimalString, top10: decimalString}).strict().nullable(),
    revenueSeasonality: z.object({average: decimalString, peak: decimalString, trough: decimalString, amplitude: decimalString, indices: z.array(decimalString)}).strict().nullable(),
    workingCapitalSeasonality: z.object({average: decimalString, peak: decimalString, trough: decimalString, amplitude: decimalString, indices: z.array(decimalString)}).strict().nullable(),
    currencyExposure: z.array(z.object({currency: z.string(), revenue: decimalString, cost: decimalString, debtService: decimalString, hedge: decimalString, exposure: decimalString, evidence: z.array(evidenceLinkSchema)}).strict()),
    receivablesAging: z.array(z.object({bucket: z.string(), amount: decimalString, evidence: z.array(evidenceLinkSchema)}).strict()),
    inventoryAging: z.array(z.object({bucket: z.string(), amount: decimalString, evidence: z.array(evidenceLinkSchema)}).strict()),
  }).strict(),
  procedureCoverage: z.array(z.object({
    procedureId: z.string().regex(/^Q-\d{2}$/),
    status: z.enum(["completed", "partial", "blocked", "not_computable"]),
    outputCount: z.number().int().nonnegative(),
    evidenceCount: z.number().int().nonnegative(),
    missingInputs: z.array(z.string()),
    exceptionIds: z.array(z.string()),
  }).strict()).length(18),
}).strict();
export type FinancialTruthSet = z.infer<typeof financialTruthSetSchema>;

const source = (fact: ReconciledFact) => ({
  fieldPath: fact.key.fieldPath,
  sourceDocument: fact.accepted.sourceDocument,
  ...(fact.accepted.anchor !== undefined ? {anchor: fact.accepted.anchor} : {}),
});

const numeric = (facts: readonly ReconciledFact[], path: string) =>
  facts.find((fact) => fact.key.fieldPath === path && fact.valueType === "number");

const pathParts = (path: string) => /^(historical_financials|interim_financials|projections)\.(\d{4}(?:_\d{2})?)\.(.+)$/.exec(path);

function indexedRows(facts: readonly ReconciledFact[], prefix: string) {
  const indexes = [...new Set(facts.map((fact) => fact.key.fieldPath.match(new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\.(\\d+)\.`))?.[1]).filter(Boolean))] as string[];
  return indexes.map((index) => ({
    index,
    facts: facts.filter((fact) => fact.key.fieldPath.startsWith(`${prefix}.${index}.`)),
  }));
}

function adjustmentRows(facts: readonly ReconciledFact[], prefix: string): NormalizationAdjustment[] {
  const indexes = [...new Set(facts.map((fact) => fact.key.fieldPath.match(new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\.normalization_adjustments\\.(\\d+)\\.`))?.[1]).filter(Boolean))] as string[];
  return indexes.flatMap((index) => {
    const base = `${prefix}.normalization_adjustments.${index}`;
    const description = facts.find((fact) => fact.key.fieldPath === `${base}.description`);
    const amount = numeric(facts, `${base}.amount`);
    const decision = facts.find((fact) => fact.key.fieldPath === `${base}.decision`);
    const rationale = facts.find((fact) => fact.key.fieldPath === `${base}.rationale`);
    if (!description || !amount || !decision || !["accepted", "rejected", "case_by_case"].includes(decision.value)) return [];
    return [{
      id: `${prefix}:${index}`,
      description: description.value,
      amount: amount.value,
      decision: decision.value as NormalizationAdjustment["decision"],
      rationale: rationale?.value ?? "Rationale not supplied",
      evidence: [source(description), source(amount), source(decision)],
    }];
  });
}

export function buildFinancialTruthSet(facts: readonly ReconciledFact[]): FinancialTruthSet {
  const grouped = new Map<string, ReconciledFact[]>();
  for (const fact of facts) {
    const match = pathParts(fact.key.fieldPath);
    if (!match || fact.valueType !== "number") continue;
    const key = `${match[1]}.${match[2]}`;
    grouped.set(key, [...(grouped.get(key) ?? []), fact]);
  }

  const statements: FinancialStatementView[] = [];
  const cashConversionBridges: CashConversionBridge[] = [];
  const maintenanceCapexBridges: MaintenanceCapexBridge[] = [];
  const identityChecks: FinancialIdentityCheck[] = [];
  const exceptions: FinancialTruthException[] = [];
  const missing = new Set<string>();

  for (const [id, statementFacts] of [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const [group, period] = id.split(".") as ["historical_financials" | "interim_financials" | "projections", string];
    const metric = (name: string) => numeric(statementFacts, `${group}.${period}.${name}`);
    const reportedEbitda = metric("ebitda");
    const adjustments = adjustmentRows(facts, `${group}.${period}`);
    const accepted = adjustments.filter((item) => item.decision === "accepted").reduce((sum, item) => sum.plus(item.amount), new Decimal(0));
    const adjustedEbitda = reportedEbitda ? new Decimal(reportedEbitda.value).plus(accepted).toFixed() : null;
    const revenue = metric("revenue");
    const receivables = metric("receivables");
    const inventory = metric("inventory");
    const payables = metric("payables");
    const workingCapital = receivables && inventory && payables
      ? calculateWorkingCapital({receivables: receivables.value, inventory: inventory.value, payables: payables.value})
      : null;
    const totalCapex = metric("capex");
    const maintenanceCapex = metric("maintenance_capex");
    const growthCapex = metric("growth_capex");
    const cashTaxes = metric("cash_taxes");
    const fixedCharges = metric("fixed_charges");
    const approvedCashAdjustments = metric("approved_cash_adjustments");
    const periodEnd = statementFacts.map((fact) => fact.key.periodEnd).filter(Boolean).sort().at(-1) ?? null;
    const statementId = `${group}.${period}`;
    const lines = statementFacts
      .filter((fact) => !fact.key.fieldPath.includes(".normalization_adjustments."))
      .map((fact) => ({
        metric: fact.key.fieldPath.slice(`${group}.${period}.`.length), value: fact.value,
        evidence: source(fact), informationClass: fact.accepted.informationClass, disputed: fact.disputed,
      }));
    let cfads: string | null = null;
    let cashConversion: string | null = null;
    if (adjustedEbitda && cashTaxes && maintenanceCapex && fixedCharges) {
      const priorWcInvestment = metric("working_capital_investment");
      if (priorWcInvestment) {
        const bridge = calculateCfads({
          adjustedEbitda, cashTaxes: cashTaxes.value, maintenanceCapex: maintenanceCapex.value,
          workingCapitalInvestment: priorWcInvestment.value, fixedCharges: fixedCharges.value,
          approvedCashAdjustments: approvedCashAdjustments?.value ?? "0",
        });
        cfads = bridge.value;
        cashConversion = new Decimal(adjustedEbitda).isZero() ? null : calculateCashConversion(cfads, adjustedEbitda);
        cashConversionBridges.push({
          statementId, lines: bridge.lines, cfads,
          conversion: cashConversion ?? "0",
          evidence: [reportedEbitda, cashTaxes, maintenanceCapex, priorWcInvestment, fixedCharges, approvedCashAdjustments].filter((item): item is ReconciledFact => Boolean(item)).map(source),
        });
      } else missing.add(`${statementId}.working_capital_investment`);
    } else {
      if (!cashTaxes) missing.add(`${statementId}.cash_taxes`);
      if (!maintenanceCapex) missing.add(`${statementId}.maintenance_capex`);
      if (!fixedCharges) missing.add(`${statementId}.fixed_charges`);
    }

    maintenanceCapexBridges.push({
      statementId,
      totalCapex: totalCapex?.value ?? null,
      maintenanceCapex: maintenanceCapex?.value ?? null,
      growthCapex: growthCapex?.value ?? null,
      method: maintenanceCapex && growthCapex ? "reported_split" : maintenanceCapex ? "company_supported_estimate" : "not_computable",
      evidence: [totalCapex, maintenanceCapex, growthCapex].filter((item): item is ReconciledFact => Boolean(item)).map(source),
    });

    const totalAssets = metric("total_assets");
    const liabilitiesEquity = metric("total_liabilities_equity");
    if (totalAssets && liabilitiesEquity) {
      const checked = checkIdentity({id: "balance_sheet", left: totalAssets.value, right: liabilitiesEquity.value});
      identityChecks.push({...checked, statementId, evidence: [source(totalAssets), source(liabilitiesEquity)]});
    }
    const openingCash = metric("opening_cash");
    const netChange = metric("net_change_in_cash");
    const closingCash = metric("closing_cash") ?? metric("cash");
    if (openingCash && netChange && closingCash) {
      const checked = checkIdentity({id: "cash_flow", left: new Decimal(openingCash.value).plus(netChange.value), right: closingCash.value});
      identityChecks.push({...checked, statementId, evidence: [source(openingCash), source(netChange), source(closingCash)]});
    }
    statements.push({
      id: statementId, period, periodEnd,
      basis: group === "historical_financials" ? "historical" : group === "interim_financials" ? "interim" : "projected",
      entity: statementFacts[0]?.key.entityName ?? null,
      scope: statementFacts[0]?.accepted.entityScope ?? null,
      lines, reportedEbitda: reportedEbitda?.value ?? null, adjustedEbitda,
      ebitdaMargin: adjustedEbitda && revenue && !new Decimal(revenue.value).isZero() ? calculateMargin(adjustedEbitda, revenue.value) : null,
      workingCapital, cfads, cashConversion, adjustments,
    });
  }

  const workingCapitalBridges: WorkingCapitalBridge[] = [];
  const actual = statements.filter((statement) => statement.basis !== "projected" && statement.workingCapital !== null).sort((a, b) => (a.periodEnd ?? a.period).localeCompare(b.periodEnd ?? b.period));
  for (let index = 1; index < actual.length; index += 1) {
    const prior = actual[index - 1]!;
    const current = actual[index]!;
    const evidence = [...grouped.get(prior.id) ?? [], ...grouped.get(current.id) ?? []]
      .filter((fact) => /\.(receivables|inventory|payables)$/.test(fact.key.fieldPath)).map(source);
    workingCapitalBridges.push({
      fromStatementId: prior.id, toStatementId: current.id,
      priorWorkingCapital: prior.workingCapital!, currentWorkingCapital: current.workingCapital!,
      investment: calculateWorkingCapitalInvestment(current.workingCapital!, prior.workingCapital!), evidence,
    });
  }

  for (const check of identityChecks.filter((item) => item.status === "fail")) {
    exceptions.push({
      id: `identity:${check.statementId}:${check.id}`, severity: "critical", status: "open",
      message: {pt: `A identidade ${check.id} não fecha em ${check.statementId}.`, en: `The ${check.id} identity does not tie in ${check.statementId}.`},
      affectedFields: check.evidence.map((item) => item.fieldPath), evidence: check.evidence, blocksExternalOutputs: true,
    });
  }
  for (const statement of statements) {
    const disputed = statement.lines.filter((line) => line.disputed);
    if (disputed.length > 0) exceptions.push({
      id: `disputed:${statement.id}`, severity: "high", status: "open",
      message: {pt: `Há números materiais em conflito em ${statement.id}.`, en: `Material figures conflict in ${statement.id}.`},
      affectedFields: disputed.map((line) => line.evidence.fieldPath), evidence: disputed.map((line) => line.evidence), blocksExternalOutputs: true,
    });
  }
  const projected = statements.filter((statement) => statement.basis === "projected");
  const scenarioName = facts.find((fact) => fact.key.fieldPath === "projections.scenario_name")?.value ?? "";
  const scenarioRows = indexedRows(facts, "projections.scenario");
  const downsidePeriods = new Set(scenarioRows.filter(({facts: row}) => /downside|stress|advers/i.test(row.find((fact) => fact.key.fieldPath.endsWith(".name"))?.value ?? ""))
    .map(({facts: row}) => row.find((fact) => fact.key.fieldPath.endsWith(".period"))?.value).filter(Boolean));
  const downside = projected.filter((statement) => /downside|stress/i.test(statement.id) || /downside|stress/i.test(scenarioName) || downsidePeriods.has(statement.period));

  const customerShares = indexedRows(facts, "customers.top_customers").flatMap(({facts: row}) => {
    const share = row.find((fact) => fact.key.fieldPath.endsWith(".share_pct") && fact.valueType === "number");
    return share ? [share] : [];
  });
  const monthlyRows = indexedRows(facts, "historical_financials.monthly")
    .map(({facts: row}) => ({
      month: row.find((fact) => fact.key.fieldPath.endsWith(".month"))?.value ?? "",
      revenue: row.find((fact) => fact.key.fieldPath.endsWith(".revenue") && fact.valueType === "number"),
      workingCapital: row.find((fact) => fact.key.fieldPath.endsWith(".working_capital") && fact.valueType === "number"),
    })).sort((a, b) => a.month.localeCompare(b.month));
  const currencyExposure = indexedRows(facts, "historical_financials.currency_mix").flatMap(({facts: row}) => {
    const find = (suffix: string) => row.find((fact) => fact.key.fieldPath.endsWith(`.${suffix}`));
    const currency = find("currency");
    const revenue = find("revenue");
    const cost = find("cost");
    const debtService = find("debt_service");
    if (!currency || !revenue || !cost || !debtService) return [];
    const hedge = find("hedge");
    return [{
      currency: currency.value, revenue: revenue.value, cost: cost.value, debtService: debtService.value,
      hedge: hedge?.value ?? "0",
      exposure: calculateCurrencyExposure({currency: currency.value, revenue: revenue.value, cost: cost.value, debtService: debtService.value, hedge: hedge?.value ?? 0}).exposure,
      evidence: row.map(source),
    }];
  });
  const aging = (prefix: string) => indexedRows(facts, prefix).flatMap(({facts: row}) => {
    const bucket = row.find((fact) => fact.key.fieldPath.endsWith(".bucket"));
    const amount = row.find((fact) => fact.key.fieldPath.endsWith(".amount") && fact.valueType === "number");
    return bucket && amount ? [{bucket: bucket.value, amount: amount.value, evidence: row.map(source)}] : [];
  });
  const analytics = {
    customerConcentration: customerShares.length > 0 ? calculateConcentration(customerShares.map((fact) => fact.value)) : null,
    revenueSeasonality: calculateSeasonality(monthlyRows.flatMap((row) => row.revenue ? [row.revenue.value] : [])),
    workingCapitalSeasonality: calculateSeasonality(monthlyRows.flatMap((row) => row.workingCapital ? [row.workingCapital.value] : [])),
    currencyExposure,
    receivablesAging: aging("historical_financials.receivables_aging"),
    inventoryAging: aging("historical_financials.inventory_aging"),
  };
  const coverageInputs: Array<{id: string; outputCount: number; missing: string[]}> = [
    {id: "Q-01", outputCount: statements.reduce((sum, item) => sum + item.adjustments.length, 0), missing: statements.some((item) => item.reportedEbitda !== null) ? [] : ["EBITDA reportado e ajustes item a item"]},
    {id: "Q-02", outputCount: cashConversionBridges.length, missing: cashConversionBridges.length ? [] : ["impostos caixa, capex de manutenção, NCG e encargos fixos"]},
    {id: "Q-03", outputCount: maintenanceCapexBridges.filter((item) => item.method !== "not_computable").length, missing: maintenanceCapexBridges.some((item) => item.method !== "not_computable") ? [] : ["registro de capex classificado por finalidade"]},
    {id: "Q-04", outputCount: workingCapitalBridges.length + (analytics.workingCapitalSeasonality ? 1 : 0), missing: workingCapitalBridges.length || analytics.workingCapitalSeasonality ? [] : ["série comparável de clientes, estoques e fornecedores"]},
    {id: "Q-05", outputCount: 0, missing: ["política de reconhecimento, cut-off e devoluções"]},
    {id: "Q-06", outputCount: analytics.customerConcentration ? 1 : 0, missing: analytics.customerConcentration ? [] : ["faturamento por grupo econômico de cliente"]},
    {id: "Q-07", outputCount: 0, missing: ["transações e CNPJs de partes relacionadas"]},
    {id: "Q-08", outputCount: facts.some((fact) => fact.key.fieldPath.startsWith("company.auditor.")) ? 1 : 0, missing: facts.some((fact) => fact.key.fieldPath.startsWith("company.auditor.")) ? [] : ["relatórios do auditor por exercício"]},
    {id: "Q-09", outputCount: statements.filter((item) => item.lines.some((line) => line.disputed)).length, missing: statements.some((item) => item.lines.some((line) => line.disputed)) ? [] : ["auditado e balancete do mesmo período e perímetro"]},
    {id: "Q-10", outputCount: projected.length, missing: projected.length ? [] : ["projeções, premissas e drivers"]},
    {id: "Q-11", outputCount: analytics.revenueSeasonality ? 1 : 0, missing: analytics.revenueSeasonality ? [] : ["24 meses de receita e NCG"]},
    {id: "Q-12", outputCount: analytics.currencyExposure.length, missing: analytics.currencyExposure.length ? [] : ["receita, custos, serviço e hedge por moeda"]},
    {id: "Q-13", outputCount: analytics.inventoryAging.length, missing: analytics.inventoryAging.length ? [] : ["estoque por idade, provisão e perdas"]},
    {id: "Q-14", outputCount: analytics.receivablesAging.length, missing: analytics.receivablesAging.length ? [] : ["aging, PDD, perdas e renegociados"]},
    {id: "Q-15", outputCount: 0, missing: ["desembolsos trabalhistas, provisão e estoque de processos"]},
    {id: "Q-16", outputCount: 0, missing: ["receita e EBITDA por unidade ou segmento"]},
    {id: "Q-17", outputCount: identityChecks.length, missing: identityChecks.length ? [] : ["demonstrações suficientes para identidades"]},
    {id: "Q-18", outputCount: statements.length, missing: statements.length ? [] : ["base financeira material"]},
  ];
  const procedureCoverage = coverageInputs.map((procedure) => {
    const relatedExceptions = exceptions.filter((exception) => procedure.id === "Q-17" ? exception.id.startsWith("identity:") : exception.affectedFields.some((field) => statements.some((statement) => field.startsWith(`${statement.id}.`))));
    return {
      procedureId: procedure.id,
      status: relatedExceptions.some((item) => item.blocksExternalOutputs) ? "blocked" as const : procedure.outputCount > 0 && procedure.missing.length === 0 ? "completed" as const : procedure.outputCount > 0 ? "partial" as const : "not_computable" as const,
      outputCount: procedure.outputCount,
      evidenceCount: procedure.id === "Q-06" ? customerShares.length : statements.reduce((sum, item) => sum + item.lines.length, 0),
      missingInputs: procedure.missing,
      exceptionIds: relatedExceptions.map((item) => item.id),
    };
  });
  const status = exceptions.some((item) => item.blocksExternalOutputs)
    ? "blocked"
    : missing.size > 0 || procedureCoverage.some((item) => item.status !== "completed") ? "partial" : "complete";
  return financialTruthSetSchema.parse({
    version: "2026.08.25-v1", status, statements, cashConversionBridges, workingCapitalBridges,
    maintenanceCapexBridges, projectedStatements: {base: projected.filter((statement) => !downside.includes(statement)).map((statement) => statement.id), downside: downside.map((statement) => statement.id), missingDownside: projected.length > 0 && downside.length === 0},
    identityChecks, exceptions, missingInputs: [...missing].sort(), analytics, procedureCoverage,
  });
}
