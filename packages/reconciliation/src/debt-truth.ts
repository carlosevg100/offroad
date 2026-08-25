import {
  aggregateDebtViews,
  applyRateShock,
  buildDebtBalanceBridge,
  calculateLiquidityCoverage,
  debtLedgerBalance,
  groupDebt,
  maturityBuckets,
  propagateDefaults,
  reconcileInterestExpense,
  weightedAverageLife,
  type DebtLedgerMathRow,
  type DefaultEdge,
} from "@offroad/financial-core";
import Decimal from "decimal.js";
import {z} from "zod";

import type {ReconciledFact} from "./facts";

const decimalString = z.string().regex(/^-?\d+(?:\.\d+)?$/);
const evidenceLinkSchema = z.object({fieldPath: z.string(), sourceDocument: z.string(), anchor: z.unknown().optional()}).strict();

export const debtInstrumentSchema = z.object({
  id: z.string().min(1),
  borrower: z.string().nullable(),
  lender: z.string().nullable(),
  instrument: z.string().nullable(),
  contractId: z.string().nullable(),
  entity: z.string().nullable(),
  principal: decimalString,
  accruedInterest: decimalString,
  pik: decimalString,
  indexation: decimalString,
  balance: decimalString,
  currency: z.string().nullable(),
  indexer: z.string().nullable(),
  spread: decimalString.nullable(),
  hedge: z.string().nullable(),
  issueDate: z.string().nullable(),
  drawDate: z.string().nullable(),
  maturity: z.string().nullable(),
  amortization: z.string().nullable(),
  cashCost: z.string().nullable(),
  accountingCost: z.string().nullable(),
  allInCost: z.string().nullable(),
  fees: decimalString,
  averageBalance: decimalString.nullable(),
  cashInterest: decimalString.nullable(),
  accountingInterest: decimalString.nullable(),
  collateral: z.string().nullable(),
  collateralOwner: z.string().nullable(),
  collateralValue: decimalString.nullable(),
  lien: z.string().nullable(),
  priority: z.string().nullable(),
  covenantIncluded: z.boolean(),
  capacityObligation: z.boolean(),
  commitment: decimalString,
  quasiDebt: decimalString,
  recourse: z.string().nullable(),
  coobligation: z.string().nullable(),
  repurchase: z.string().nullable(),
  retainedRisk: z.string().nullable(),
  negativePledge: z.string().nullable(),
  renewalCommitment: z.string().nullable(),
  paymentHistory: z.string().nullable(),
  evidence: z.array(evidenceLinkSchema).min(1),
  completeness: z.number().min(0).max(1),
}).strict();
export type DebtInstrument = z.infer<typeof debtInstrumentSchema>;

export const covenantTestSchema = z.object({
  id: z.string(), instrumentId: z.string().nullable(), metric: z.string().nullable(), definition: z.string().nullable(),
  threshold: decimalString.nullable(), direction: z.enum(["maximum", "minimum", "not_informed"]),
  testedValue: decimalString.nullable(), headroom: decimalString.nullable(), cure: z.string().nullable(),
  crossDefault: z.string().nullable(), status: z.enum(["pass", "fail", "not_computable"]), evidence: z.array(evidenceLinkSchema),
}).strict();
export type CovenantTest = z.infer<typeof covenantTestSchema>;

export const debtPaymentSchema = z.object({
  id: z.string(), instrumentId: z.string().nullable(), date: z.string(), principal: decimalString,
  interest: decimalString, other: decimalString, evidence: z.array(evidenceLinkSchema),
}).strict();

export const obligationSchema = z.object({
  id: z.string(), nature: z.string(), entity: z.string().nullable(), counterparty: z.string().nullable(),
  amount: decimalString, currency: z.string().nullable(), dueDate: z.string().nullable(), probability: z.string().nullable(),
  financialDebt: z.boolean(), capacityObligation: z.boolean(), offBalanceSheet: z.boolean(), evidence: z.array(evidenceLinkSchema),
}).strict();

export const debtReconciliationSchema = z.object({
  id: z.string(), expected: decimalString, observed: decimalString, difference: decimalString,
  status: z.enum(["pass", "fail"]), evidence: z.array(evidenceLinkSchema),
}).strict();

export const debtTruthExceptionSchema = z.object({
  id: z.string(), severity: z.enum(["low", "medium", "high", "critical"]),
  message: z.object({pt: z.string(), en: z.string()}).strict(), affectedInstrumentIds: z.array(z.string()),
  evidence: z.array(evidenceLinkSchema), blocksExternalOutputs: z.boolean(),
}).strict();

export const debtTruthSetSchema = z.object({
  version: z.string(), referenceDate: z.string(), status: z.enum(["complete", "partial", "blocked"]),
  instruments: z.array(debtInstrumentSchema),
  views: z.object({
    grossFinancialDebt: decimalString, unrestrictedCash: decimalString, netFinancialDebt: decimalString,
    covenantDebt: decimalString, adjustedCapacityObligations: decimalString, commitmentsAndQuasiDebt: decimalString,
    contingentExposures: decimalString, offBalanceSheetExposures: decimalString,
  }).strict(),
  maturity: z.record(z.string(), decimalString),
  payments: z.array(debtPaymentSchema),
  obligations: z.array(obligationSchema),
  serviceNext12Months: decimalString,
  weightedAverageLifeYears: decimalString.nullable(),
  byEntity: z.array(z.object({label: z.string(), value: decimalString}).strict()),
  byLender: z.array(z.object({label: z.string(), value: decimalString}).strict()),
  byCurrency: z.array(z.object({label: z.string(), value: decimalString}).strict()),
  byIndexer: z.array(z.object({label: z.string(), value: decimalString}).strict()),
  byGuarantee: z.array(z.object({label: z.string(), value: decimalString}).strict()),
  covenants: z.array(covenantTestSchema), reconciliations: z.array(debtReconciliationSchema),
  balanceBridge: z.object({value: decimalString, lines: z.array(z.object({id: z.string(), value: decimalString, operation: z.enum(["start", "add", "subtract"])}).strict()), reportedClosingBalance: decimalString, difference: decimalString, status: z.enum(["pass", "fail"]), evidence: z.array(evidenceLinkSchema)}).strict().nullable(),
  interestExpenseBridge: z.object({rows: z.array(z.object({id: z.string(), calculated: decimalString, accounting: decimalString, difference: decimalString}).strict()), calculatedTotal: decimalString, accountingTotal: decimalString, difference: decimalString, reportedAccountingTotal: decimalString.nullable(), reportedDifference: decimalString.nullable(), evidence: z.array(evidenceLinkSchema)}).strict().nullable(),
  liquidityCoverage: z.array(z.object({period: z.string(), openingCash: decimalString, sources: decimalString, debtService: decimalString, coverage: decimalString.nullable(), closingCash: decimalString, deficit: decimalString}).strict()),
  stressScenarios: z.array(z.object({id: z.string(), policyVersion: z.string(), instrumentId: z.string(), baseInterest: decimalString, stressedInterest: decimalString, delta: decimalString}).strict()),
  crossDefault: z.object({edges: z.array(z.object({from: z.string(), to: z.string(), type: z.enum(["cross_default", "cross_acceleration"]), thresholdSatisfied: z.boolean(), cureExpired: z.boolean()}).strict()), defaulted: z.array(z.string()), accelerated: z.array(z.string())}).strict(),
  exceptions: z.array(debtTruthExceptionSchema), missingInputs: z.array(z.string()),
  procedureCoverage: z.array(z.object({procedureId: z.string().regex(/^D-\d{2}$/), status: z.enum(["completed", "partial", "blocked", "not_computable", "not_applicable"]), outputCount: z.number().int().nonnegative(), evidenceCount: z.number().int().nonnegative(), missingInputs: z.array(z.string()), exceptionIds: z.array(z.string())}).strict()).length(31),
}).strict();
export type DebtTruthSet = z.infer<typeof debtTruthSetSchema>;

const source = (fact: ReconciledFact) => ({
  fieldPath: fact.key.fieldPath, sourceDocument: fact.accepted.sourceDocument,
  ...(fact.accepted.anchor !== undefined ? {anchor: fact.accepted.anchor} : {}),
});

const bool = (value: string | undefined) => value === "true" || value === "yes" || value === "sim" || value === "1";

export type DebtAnalysisPolicies = {
  reconciliationTolerance?: string;
  rateShocks?: Array<{id: string; policyVersion: string; indexer: string; baseRate: string; shock: string}>;
  initialDefaultInstrumentIds?: string[];
};

export function buildDebtTruthSet(facts: readonly ReconciledFact[], referenceDate: string, policies: DebtAnalysisPolicies = {}): DebtTruthSet {
  const indexes = [...new Set(facts.map((fact) => fact.key.fieldPath.match(/^debt\.instruments\.(\d+)\./)?.[1]).filter(Boolean))] as string[];
  const missing = new Set<string>();
  const instruments: DebtInstrument[] = indexes.map((index) => {
    const prefix = `debt.instruments.${index}`;
    const rows = facts.filter((fact) => fact.key.fieldPath.startsWith(`${prefix}.`));
    const get = (name: string) => rows.find((fact) => fact.key.fieldPath === `${prefix}.${name}`);
    const principal = get("principal") ?? get("balance");
    if (!principal) missing.add(`${prefix}.principal`);
    for (const required of ["lender", "instrument_type", "maturity", "currency"]) if (!get(required)) missing.add(`${prefix}.${required}`);
    const math: DebtLedgerMathRow = {
      id: prefix, principal: principal?.value ?? "0", accruedInterest: get("accrued_interest")?.value ?? "0",
      pik: get("pik")?.value ?? "0", indexation: get("indexation_balance")?.value ?? "0",
    };
    const expected = ["lender", "instrument_type", "principal", "currency", "maturity", "amortization", "cash_cost", "collateral", "covenant_included"];
    const present = expected.filter((name) => get(name) || (name === "principal" && get("balance"))).length;
    return debtInstrumentSchema.parse({
      id: prefix, borrower: get("borrower")?.value ?? null, lender: get("lender")?.value ?? null,
      instrument: get("instrument_type")?.value ?? null, contractId: get("contract_id")?.value ?? null,
      entity: get("entity")?.value ?? rows[0]?.key.entityName ?? null,
      principal: principal?.value ?? "0", accruedInterest: get("accrued_interest")?.value ?? "0",
      pik: get("pik")?.value ?? "0", indexation: get("indexation_balance")?.value ?? "0", balance: debtLedgerBalance(math),
      currency: get("currency")?.value ?? null, indexer: get("indexer")?.value ?? null,
      spread: get("spread")?.value ?? null, hedge: get("hedge")?.value ?? null,
      issueDate: get("issue_date")?.value ?? null, drawDate: get("draw_date")?.value ?? null,
      maturity: get("maturity")?.value ?? null, amortization: get("amortization")?.value ?? null,
      cashCost: get("cash_cost")?.value ?? get("rate")?.value ?? null, accountingCost: get("accounting_cost")?.value ?? null,
      allInCost: get("all_in_cost")?.value ?? null, fees: get("fees")?.value ?? "0",
      averageBalance: get("average_balance")?.value ?? null, cashInterest: get("cash_interest")?.value ?? null,
      accountingInterest: get("accounting_interest")?.value ?? null, collateral: get("collateral")?.value ?? null,
      collateralOwner: get("collateral_owner")?.value ?? null, collateralValue: get("collateral_value")?.value ?? null,
      lien: get("lien")?.value ?? null, priority: get("priority")?.value ?? null,
      covenantIncluded: bool(get("covenant_included")?.value), capacityObligation: bool(get("capacity_obligation")?.value),
      commitment: get("undrawn_commitment")?.value ?? "0", quasiDebt: get("quasi_debt")?.value ?? "0",
      recourse: get("recourse")?.value ?? null, coobligation: get("coobligation")?.value ?? null,
      repurchase: get("repurchase_obligation")?.value ?? null, retainedRisk: get("retained_risk")?.value ?? null,
      negativePledge: get("negative_pledge")?.value ?? null, renewalCommitment: get("renewal_commitment")?.value ?? null,
      paymentHistory: get("payment_history")?.value ?? null,
      evidence: rows.map(source), completeness: present / expected.length,
    });
  });

  const mathRows: DebtLedgerMathRow[] = instruments.map((instrument) => ({
    id: instrument.id, principal: instrument.principal, accruedInterest: instrument.accruedInterest, pik: instrument.pik,
    indexation: instrument.indexation, covenantIncluded: instrument.covenantIncluded,
    capacityObligation: instrument.capacityObligation, commitment: instrument.commitment, quasiDebt: instrument.quasiDebt,
    ...(instrument.currency ? {currency: instrument.currency} : {}), ...(instrument.entity ? {entity: instrument.entity} : {}),
    ...(instrument.lender ? {lender: instrument.lender} : {}), ...(instrument.maturity ? {maturity: instrument.maturity} : {}),
  }));

  const rowIndexes = (prefix: string) => [...new Set(facts.map((fact) => fact.key.fieldPath.match(new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\.(\\d+)\.`))?.[1]).filter(Boolean))] as string[];
  const paymentIndexes = rowIndexes("debt.payments");
  const payments = paymentIndexes.flatMap((index) => {
    const prefix = `debt.payments.${index}`;
    const rows = facts.filter((fact) => fact.key.fieldPath.startsWith(`${prefix}.`));
    const get = (name: string) => rows.find((fact) => fact.key.fieldPath === `${prefix}.${name}`);
    const date = get("date");
    if (!date) { missing.add(`${prefix}.date`); return []; }
    return [debtPaymentSchema.parse({
      id: prefix, instrumentId: get("instrument_id")?.value ?? null, date: date.value,
      principal: get("principal")?.value ?? "0", interest: get("interest")?.value ?? "0", other: get("other")?.value ?? "0",
      evidence: rows.map(source),
    })];
  });

  const obligationIndexes = rowIndexes("debt.obligations");
  const obligations = obligationIndexes.flatMap((index) => {
    const prefix = `debt.obligations.${index}`;
    const rows = facts.filter((fact) => fact.key.fieldPath.startsWith(`${prefix}.`));
    const get = (name: string) => rows.find((fact) => fact.key.fieldPath === `${prefix}.${name}`);
    const nature = get("nature");
    const amount = get("amount");
    if (!nature || !amount) { missing.add(`${prefix}.${!nature ? "nature" : "amount"}`); return []; }
    return [obligationSchema.parse({
      id: prefix, nature: nature.value, entity: get("entity")?.value ?? null, counterparty: get("counterparty")?.value ?? null,
      amount: amount.value, currency: get("currency")?.value ?? null, dueDate: get("due_date")?.value ?? null,
      probability: get("probability")?.value ?? null, financialDebt: bool(get("financial_debt")?.value),
      capacityObligation: bool(get("capacity_obligation")?.value), offBalanceSheet: bool(get("off_balance_sheet")?.value),
      evidence: rows.map(source),
    })];
  });
  const cashFact = facts
    .filter((fact) => /^(historical|interim)_financials\.[^.]+\.cash$/.test(fact.key.fieldPath) && fact.valueType === "number")
    .sort((a, b) => (b.key.periodEnd ?? "").localeCompare(a.key.periodEnd ?? ""))[0];
  const restrictedCash = facts.find((fact) => /\.restricted_cash$/.test(fact.key.fieldPath) && fact.valueType === "number");
  const baseViews = aggregateDebtViews({rows: mathRows, cash: cashFact?.value ?? "0", restrictedCash: restrictedCash?.value ?? "0"});
  const financialObligations = obligations.filter((item) => item.financialDebt).reduce((sum, item) => sum.plus(item.amount), new Decimal(0));
  const capacityObligations = obligations.filter((item) => item.capacityObligation).reduce((sum, item) => sum.plus(item.amount), new Decimal(0));
  const contingentExposures = obligations.filter((item) => /possible|possível|provável|probable/i.test(item.probability ?? "") || /conting/i.test(item.nature)).reduce((sum, item) => sum.plus(item.amount), new Decimal(0));
  const offBalanceSheetExposures = obligations.filter((item) => item.offBalanceSheet).reduce((sum, item) => sum.plus(item.amount), new Decimal(0));
  const views = {
    ...baseViews,
    grossFinancialDebt: new Decimal(baseViews.grossFinancialDebt).plus(financialObligations).toFixed(),
    netFinancialDebt: new Decimal(baseViews.netFinancialDebt).plus(financialObligations).toFixed(),
    adjustedCapacityObligations: new Decimal(baseViews.adjustedCapacityObligations).plus(capacityObligations).toFixed(),
    contingentExposures: contingentExposures.toFixed(),
    offBalanceSheetExposures: offBalanceSheetExposures.toFixed(),
  };

  const covIndexes = [...new Set(facts.map((fact) => fact.key.fieldPath.match(/^debt\.covenants\.(\d+)\./)?.[1]).filter(Boolean))] as string[];
  const covenants: CovenantTest[] = covIndexes.map((index) => {
    const prefix = `debt.covenants.${index}`;
    const get = (name: string) => facts.find((fact) => fact.key.fieldPath === `${prefix}.${name}`);
    const threshold = get("threshold");
    const tested = get("tested_value");
    const direction = get("direction")?.value;
    const normalizedDirection = direction === "maximum" || direction === "minimum" ? direction : "not_informed";
    let headroom: string | null = null;
    let status: CovenantTest["status"] = "not_computable";
    if (threshold && tested && normalizedDirection !== "not_informed") {
      headroom = normalizedDirection === "maximum"
        ? new Decimal(threshold.value).minus(tested.value).toFixed()
        : new Decimal(tested.value).minus(threshold.value).toFixed();
      status = new Decimal(headroom).gte(0) ? "pass" : "fail";
    }
    const evidence = facts.filter((fact) => fact.key.fieldPath.startsWith(`${prefix}.`)).map(source);
    return {
      id: prefix, instrumentId: get("instrument_id")?.value ?? null, metric: get("metric")?.value ?? null,
      definition: get("definition")?.value ?? null, threshold: threshold?.value ?? null, direction: normalizedDirection,
      testedValue: tested?.value ?? null, headroom, cure: get("cure")?.value ?? null,
      crossDefault: get("cross_default")?.value ?? null, status, evidence,
    };
  });

  const reconciliations: z.infer<typeof debtReconciliationSchema>[] = [];
  const scheduleTotal = facts.find((fact) => fact.key.fieldPath === "debt.total_gross" && fact.valueType === "number");
  if (scheduleTotal) {
    const observed = instruments.reduce((sum, item) => sum.plus(item.balance), new Decimal(0));
    const difference = new Decimal(scheduleTotal.value).minus(observed);
    reconciliations.push({
      id: "schedule_to_ledger", expected: scheduleTotal.value, observed: observed.toFixed(), difference: difference.toFixed(),
      status: difference.abs().lte(policies.reconciliationTolerance ?? "1") ? "pass" : "fail", evidence: [source(scheduleTotal), ...instruments.flatMap((item) => item.evidence)],
    });
  }

  const groupInstruments = (key: "indexer" | "collateral") => {
    const grouped = new Map<string, Decimal>();
    for (const instrument of instruments) {
      const label = instrument[key] || "not_informed";
      grouped.set(label, (grouped.get(label) ?? new Decimal(0)).plus(instrument.balance));
    }
    return [...grouped.entries()].map(([label, value]) => ({label, value: value.toFixed()}))
      .sort((a, b) => new Decimal(b.value).comparedTo(a.value) || a.label.localeCompare(b.label));
  };

  const bridgeFact = (name: string) => facts.find((fact) => fact.key.fieldPath === `debt.balance_bridge.${name}` && fact.valueType === "number");
  const openingBalance = bridgeFact("opening_balance");
  const reportedClosing = bridgeFact("closing_balance");
  const balanceBridge = openingBalance && reportedClosing ? (() => {
    const bridge = buildDebtBalanceBridge({
      openingBalance: openingBalance.value, drawdowns: bridgeFact("drawdowns")?.value ?? 0,
      accruedInterest: bridgeFact("accrued_interest")?.value ?? 0, pik: bridgeFact("pik")?.value ?? 0,
      indexation: bridgeFact("indexation")?.value ?? 0, foreignExchange: bridgeFact("foreign_exchange")?.value ?? 0,
      acquisitions: bridgeFact("acquisitions")?.value ?? 0, otherAdditions: bridgeFact("other_additions")?.value ?? 0,
      amortizations: bridgeFact("amortizations")?.value ?? 0, prepayments: bridgeFact("prepayments")?.value ?? 0,
      writeOffs: bridgeFact("write_offs")?.value ?? 0,
    });
    const difference = new Decimal(reportedClosing.value).minus(bridge.value);
    return {
      ...bridge, reportedClosingBalance: reportedClosing.value, difference: difference.toFixed(),
      status: difference.abs().lte(policies.reconciliationTolerance ?? "1") ? "pass" as const : "fail" as const,
      evidence: facts.filter((fact) => fact.key.fieldPath.startsWith("debt.balance_bridge.")).map(source),
    };
  })() : null;

  const interestRows = instruments.filter((item) => item.cashInterest !== null && item.accountingInterest !== null)
    .map((item) => ({id: item.id, calculated: item.cashInterest!, accounting: item.accountingInterest!}));
  const reportedAccountingTotal = facts.find((fact) => fact.key.fieldPath === "debt.interest_bridge.accounting_total" && fact.valueType === "number");
  const interestExpenseBridge = interestRows.length > 0 ? (() => {
    const bridge = reconcileInterestExpense(interestRows);
    return {
      ...bridge, reportedAccountingTotal: reportedAccountingTotal?.value ?? null,
      reportedDifference: reportedAccountingTotal ? new Decimal(reportedAccountingTotal.value).minus(bridge.accountingTotal).toFixed() : null,
      evidence: [...instruments.filter((item) => item.cashInterest !== null && item.accountingInterest !== null).flatMap((item) => item.evidence), ...(reportedAccountingTotal ? [source(reportedAccountingTotal)] : [])],
    };
  })() : null;

  const referenceTime = new Date(`${referenceDate}T00:00:00.000Z`).getTime();
  const twelveMonths = referenceTime + 365.25 * 24 * 60 * 60 * 1000;
  const serviceNext12Months = payments.filter((item) => {
    const time = new Date(`${item.date}T00:00:00.000Z`).getTime();
    return time >= referenceTime && time <= twelveMonths;
  }).reduce((sum, item) => sum.plus(item.principal).plus(item.interest).plus(item.other), new Decimal(0)).toFixed();
  const weightedAverageLifeYears = weightedAverageLife(payments.map((item) => ({date: item.date, principal: item.principal})), referenceDate);

  const yearlyPayments = new Map<string, {principal: Decimal; interest: Decimal; other: Decimal}>();
  for (const payment of payments) {
    const year = payment.date.slice(0, 4);
    const current = yearlyPayments.get(year) ?? {principal: new Decimal(0), interest: new Decimal(0), other: new Decimal(0)};
    current.principal = current.principal.plus(payment.principal);
    current.interest = current.interest.plus(payment.interest);
    current.other = current.other.plus(payment.other);
    yearlyPayments.set(year, current);
  }
  const cashFlowByYear = new Map<string, ReconciledFact>();
  for (const fact of facts.filter((item) => /^(historical_financials|interim_financials|projections)\.(\d{4}).*\.(free_cash_flow|cfo)$/.test(item.key.fieldPath) && item.valueType === "number")) {
    const year = fact.key.fieldPath.match(/\.(\d{4})/)?.[1];
    if (year && (!cashFlowByYear.has(year) || fact.key.fieldPath.endsWith(".free_cash_flow"))) cashFlowByYear.set(year, fact);
  }
  const liquidityInputs = [...yearlyPayments.entries()].sort(([a], [b]) => a.localeCompare(b)).flatMap(([period, service], index) => {
    const cfads = cashFlowByYear.get(period);
    if (!cfads) return [];
    return [{
      period, openingCash: index === 0 ? cashFact?.value ?? "0" : "0", cfads: cfads.value,
      principal: service.principal.toFixed(), interest: service.interest.toFixed(), otherObligations: service.other.toFixed(),
    }];
  });
  const liquidityCoverage = calculateLiquidityCoverage(liquidityInputs);

  const stressScenarios = (policies.rateShocks ?? []).flatMap((policy) => instruments.flatMap((instrument) => {
    if (instrument.indexer !== policy.indexer || instrument.averageBalance === null) return [];
    return [{id: policy.id, policyVersion: policy.policyVersion, instrumentId: instrument.id, ...applyRateShock({averageBalance: instrument.averageBalance, baseRate: policy.baseRate, shock: policy.shock})}];
  }));

  const edgeIndexes = rowIndexes("debt.cross_default_edges");
  const edges: DefaultEdge[] = edgeIndexes.flatMap((index) => {
    const prefix = `debt.cross_default_edges.${index}`;
    const rows = facts.filter((fact) => fact.key.fieldPath.startsWith(`${prefix}.`));
    const get = (name: string) => rows.find((fact) => fact.key.fieldPath === `${prefix}.${name}`)?.value;
    const from = get("from_instrument");
    const to = get("to_instrument");
    const type = get("type")?.replace("-", "_");
    if (!from || !to || (type !== "cross_default" && type !== "cross_acceleration")) return [];
    return [{from, to, type, thresholdSatisfied: bool(get("threshold_satisfied")), cureExpired: bool(get("cure_expired"))}];
  });
  const propagation = propagateDefaults(policies.initialDefaultInstrumentIds ?? [], edges);
  const crossDefault = {edges, ...propagation};

  const exceptions: z.infer<typeof debtTruthExceptionSchema>[] = [];
  for (const row of instruments.filter((item) => item.completeness < 0.4)) exceptions.push({
    id: `incomplete:${row.id}`, severity: "high",
    message: {pt: `O instrumento ${row.id} não possui dados suficientes para uma leitura contratual.`, en: `Instrument ${row.id} lacks sufficient data for a contractual reading.`},
    affectedInstrumentIds: [row.id], evidence: row.evidence, blocksExternalOutputs: true,
  });
  for (const reconciliation of reconciliations.filter((item) => item.status === "fail")) exceptions.push({
    id: `reconciliation:${reconciliation.id}`, severity: "critical",
    message: {pt: "O saldo total do mapa de dívida não concilia com o ledger por instrumento.", en: "The debt schedule total does not reconcile to the instrument ledger."},
    affectedInstrumentIds: instruments.map((item) => item.id), evidence: reconciliation.evidence, blocksExternalOutputs: true,
  });
  for (const covenant of covenants.filter((item) => item.status === "fail")) exceptions.push({
    id: `covenant:${covenant.id}`, severity: "critical",
    message: {pt: `O covenant ${covenant.metric ?? covenant.id} está fora do limite literal informado.`, en: `Covenant ${covenant.metric ?? covenant.id} is outside its stated literal limit.`},
    affectedInstrumentIds: covenant.instrumentId ? [covenant.instrumentId] : [], evidence: covenant.evidence, blocksExternalOutputs: true,
  });
  if (balanceBridge?.status === "fail") exceptions.push({
    id: "reconciliation:debt_balance_bridge", severity: "critical",
    message: {pt: "A ponte de evolução da dívida não concilia com o saldo final informado.", en: "The debt evolution bridge does not reconcile to the reported closing balance."},
    affectedInstrumentIds: instruments.map((item) => item.id), evidence: balanceBridge.evidence, blocksExternalOutputs: true,
  });

  const evidenceCount = instruments.reduce((sum, item) => sum + item.evidence.length, 0) + obligations.reduce((sum, item) => sum + item.evidence.length, 0);
  const has = (predicate: (item: DebtInstrument) => boolean) => instruments.filter(predicate).length;
  const coverageInputs: Array<{id: string; outputCount: number; missing: string[]; notApplicable?: boolean}> = [
    {id: "D-01", outputCount: instruments.length, missing: instruments.length ? [] : ["relação analítica por contrato"]},
    {id: "D-02", outputCount: has((item) => item.indexer !== null), missing: has((item) => item.indexer !== null) ? [] : ["indexador e spread por contrato"]},
    {id: "D-03", outputCount: payments.length || instruments.filter((item) => item.maturity).length, missing: payments.length ? [] : ["cronograma de principal por data"]},
    {id: "D-04", outputCount: instruments.length ? 1 : 0, missing: instruments.length ? [] : ["credor e saldo por contrato"]},
    {id: "D-05", outputCount: has((item) => item.renewalCommitment !== null), missing: has((item) => item.renewalCommitment !== null) ? [] : ["compromisso, limite e histórico das linhas curtas"]},
    {id: "D-06", outputCount: has((item) => /sacado|confirming|forfait/i.test(`${item.instrument} ${item.recourse}`)), missing: ["teste documentado de fornecedores financiados"]},
    {id: "D-07", outputCount: has((item) => item.recourse !== null || item.repurchase !== null || item.retainedRisk !== null), missing: ["mecânica de cessões e risco retido"]},
    {id: "D-08", outputCount: obligations.filter((item) => /lease|arrendamento/i.test(item.nature)).length, missing: ["nota e convenção de arrendamentos"]},
    {id: "D-09", outputCount: obligations.filter((item) => /tribut|refis|pert/i.test(item.nature)).length, missing: ["parcelamentos tributários e cronogramas"]},
    {id: "D-10", outputCount: obligations.filter((item) => /fiança|aval|garantia a terceiro/i.test(item.nature)).length, missing: ["avais, fianças e garantias a terceiros"]},
    {id: "D-11", outputCount: obligations.filter((item) => /mútuo|related/i.test(item.nature)).length, missing: ["mútuos e condições com partes relacionadas"]},
    {id: "D-12", outputCount: has((item) => item.currency !== null && item.currency !== "BRL"), missing: ["receita, dívida e hedge por moeda"]},
    {id: "D-13", outputCount: obligations.filter((item) => /deriv/i.test(item.nature)).length + has((item) => item.hedge !== null), missing: ["posição de derivativos, MTM e finalidade"]},
    {id: "D-14", outputCount: obligations.filter((item) => /earn|aquisição|acquisition/i.test(item.nature)).length, missing: ["parcelas de aquisição e earn-outs"]},
    {id: "D-15", outputCount: obligations.filter((item) => /dividendo|jcp/i.test(item.nature)).length, missing: ["dividendos e JCP declarados não pagos"]},
    {id: "D-16", outputCount: obligations.filter((item) => /conting|provis/i.test(item.nature)).length, missing: ["provisões e contingências por natureza e probabilidade"]},
    {id: "D-17", outputCount: interestExpenseBridge?.rows.length ?? has((item) => item.allInCost !== null), missing: interestExpenseBridge ? [] : ["saldo médio, custo caixa, contábil e all-in"]},
    {id: "D-18", outputCount: weightedAverageLifeYears ? 1 : 0, missing: weightedAverageLifeYears ? [] : ["cronograma de principal por data"]},
    {id: "D-19", outputCount: has((item) => item.collateral !== null), missing: has((item) => item.collateral !== null) ? [] : ["garantias, titularidade, ônus, prioridade e valor"]},
    {id: "D-20", outputCount: covenants.length, missing: covenants.length ? [] : ["definições literais, testes, cura e cross-default"]},
    {id: "D-21", outputCount: has((item) => item.paymentHistory !== null), missing: has((item) => item.paymentHistory !== null) ? [] : ["aditivos, waivers, atrasos e pré-pagamentos"]},
    {id: "D-22", outputCount: new Set(instruments.map((item) => item.entity).filter(Boolean)).size, missing: has((item) => item.entity !== null) ? [] : ["dívida, caixa e fluxo por entidade"]},
    {id: "D-23", outputCount: 0, missing: ["SCR ou confirmação externa legitimamente fornecida"]},
    {id: "D-24", outputCount: instruments.length + obligations.length, missing: instruments.length ? [] : ["ledger de obrigações"]},
    {id: "D-25", outputCount: interestExpenseBridge?.rows.length ?? 0, missing: interestExpenseBridge ? [] : ["juros caixa e contábeis por contrato e razão financeira"]},
    {id: "D-26", outputCount: liquidityCoverage.length, missing: liquidityCoverage.length ? [] : ["CFADS, caixa livre e serviço por período"]},
    {id: "D-27", outputCount: stressScenarios.length, missing: stressScenarios.length ? [] : ["cenário de mercado versionado e saldo médio por indexador"]},
    {id: "D-28", outputCount: has((item) => item.renewalCommitment !== null), missing: ["política versionada de renovação e linhas classificadas"]},
    {id: "D-29", outputCount: edges.length, missing: edges.length ? [] : ["eventos, thresholds, cura e contratos alcançados"]},
    {id: "D-30", outputCount: 0, missing: ["estrutura indicativa pró-forma para teste de dia um"], notApplicable: !facts.some((fact) => fact.key.fieldPath === "transaction.preferred_structure")},
    {id: "D-31", outputCount: instruments.length ? 1 : 0, missing: instruments.length ? [] : ["ledger e análises D-01 a D-30"]},
  ];
  const procedureCoverage = coverageInputs.map((procedure) => {
    const related = exceptions.filter((exception) => procedure.id === "D-24" || procedure.id === "D-31" || (procedure.id === "D-20" && exception.id.startsWith("covenant:")) || (procedure.id === "D-01" && exception.id.startsWith("reconciliation:")));
    return {
      procedureId: procedure.id,
      status: procedure.notApplicable ? "not_applicable" as const : related.some((item) => item.blocksExternalOutputs) ? "blocked" as const : procedure.outputCount > 0 && procedure.missing.length === 0 ? "completed" as const : procedure.outputCount > 0 ? "partial" as const : "not_computable" as const,
      outputCount: procedure.outputCount, evidenceCount, missingInputs: procedure.missing, exceptionIds: related.map((item) => item.id),
    };
  });
  const status = exceptions.some((item) => item.blocksExternalOutputs)
    ? "blocked"
    : missing.size > 0 || procedureCoverage.some((item) => item.status !== "completed" && item.status !== "not_applicable") ? "partial" : "complete";
  return debtTruthSetSchema.parse({
    version: "2026.08.25-v2", referenceDate, status, instruments, views,
    maturity: maturityBuckets(mathRows, referenceDate), byEntity: groupDebt(mathRows, "entity"),
    payments, obligations, serviceNext12Months, weightedAverageLifeYears,
    byLender: groupDebt(mathRows, "lender"), byCurrency: groupDebt(mathRows, "currency"),
    byIndexer: groupInstruments("indexer"), byGuarantee: groupInstruments("collateral"),
    covenants, reconciliations, balanceBridge, interestExpenseBridge, liquidityCoverage, stressScenarios, crossDefault,
    exceptions, missingInputs: [...missing].sort(), procedureCoverage,
  });
}
