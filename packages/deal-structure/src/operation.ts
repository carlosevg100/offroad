import {
  calculateExcessFundingCarry,
  calculateIncrementalWorkingCapital,
  calculateProFormaPosition,
  calculateTransactionNeed,
  reconcileSourcesAndUses,
  testDisbursementCoverage,
} from "@offroad/financial-core";
import type {DebtTruthSet, FinancialTruthSet, ReconciledFact} from "@offroad/reconciliation";
import Decimal from "decimal.js";

import type {CapacityAssessment} from "./capacity";

export const operationTruthVersion = "2026.08.25-v1";
type Status = "completed" | "partial" | "blocked" | "not_computable" | "not_applicable";
type EvidenceLink = {fieldPath: string; sourceDocument: string; anchor?: unknown};
type Line = {
  id: string;
  side: "source" | "use";
  item: string;
  amount: string;
  entity: string | null;
  currency: string;
  date: string | null;
  tranche: string | null;
  condition: "available" | "conditional" | "not_confirmed";
  evidence: EvidenceLink[];
};

export type OperationPolicies = {
  version: string;
  sizingMateriality?: string;
  residualTolerance?: string;
  authorizedBuffer?: string;
  annualDebtCost?: string;
  annualCashYield?: string;
  minimumDscr?: string;
  generalPurposeCap?: string;
};

export type OperationTruthSet = {
  version: string;
  policyVersion: string;
  status: "complete" | "partial" | "blocked";
  request: {amount: string | null; purpose: string | null; termMonths: number | null; evidence: EvidenceLink[]};
  calculatedNeed: {value: string; trace: Array<{label: string; value: string}>; divergence: string | null; status: Status} | null;
  sourcesAndUses: {lines: Line[]; totalSources: string; totalUses: string; difference: string; status: "pass" | "fail" | "not_computable"};
  proForma: {grossDebt: string; unrestrictedCash: string; netDebt: string; leverage: string | null; dayOneCovenantConflict: boolean | null} | null;
  scenarioCapacity: Array<{scenario: string; coverage: string | null; deficit: string; status: "pass" | "fail" | "not_computable"}>;
  effects: {solves: string[]; doesNotTouch: string[]; creates: string[]};
  incrementalWorkingCapital: ReturnType<typeof calculateIncrementalWorkingCapital> | null;
  excessFunding: {excess: string; annualCarry: string} | null;
  tranches: Array<{id: string; amount: string | null; milestone: string | null; evidence: string | null; attestor: string | null; releaseDays: number | null; status: Status}>;
  conditionsPrecedent: Array<{id: string; condition: string; owner: string | null; evidence: string | null; deadline: string | null; status: string | null}>;
  bridgeAndTakeout: {bridgeAmount: string | null; takeout: string | null; failureRisk: string | null; planB: string | null; status: Status};
  disbursementSchedule: ReturnType<typeof testDisbursementCoverage> | null;
  waitAnalysis: {milestone: string | null; date: string | null; waitingCost: string | null; estimatedGain: string | null; decision: string | null; status: Status};
  mixedUses: Array<{category: "productive" | "remediation" | "reinforcement" | "other"; amount: string; description: string}>;
  declaredVersion: {version: string | null; confirmedAt: string | null; stale: boolean; materialTerms: string[]};
  exceptions: Array<{id: string; severity: "medium" | "high" | "critical"; message: string; affectedFields: string[]}>;
  missingInputs: string[];
  procedureCoverage: Array<{procedureId: `OP-${string}`; status: Status; outputCount: number; evidenceCount: number; missingInputs: string[]; exceptionIds: string[]}>;
};

const source = (fact: ReconciledFact): EvidenceLink => ({
  fieldPath: fact.key.fieldPath,
  sourceDocument: fact.accepted.sourceDocument,
  ...(fact.accepted.anchor !== undefined ? {anchor: fact.accepted.anchor} : {}),
});
const asNumber = (value: string | undefined) => value !== undefined && Number.isFinite(Number(value)) ? value : undefined;
const asInteger = (value: string | undefined) => value !== undefined && Number.isInteger(Number(value)) ? Number(value) : null;
const sum = (values: Array<string | undefined>) => values.reduce((total, value) => total.plus(asNumber(value) ?? 0), new Decimal(0)).toFixed();

export function buildOperationTruthSet(input: {
  facts: readonly ReconciledFact[];
  financialTruth: FinancialTruthSet;
  debtTruth: DebtTruthSet;
  capacity: CapacityAssessment | null;
  requestedAmount?: string;
  requestedTermMonths?: number;
  referenceDate: string;
  policies?: OperationPolicies;
}): OperationTruthSet {
  const facts = input.facts;
  const fact = (path: string) => facts.find((candidate) => candidate.key.fieldPath === path);
  const value = (path: string) => fact(path)?.value;
  const indexed = (prefix: string) => [...new Set(facts.flatMap((candidate) => candidate.key.fieldPath.match(new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\.(\\d+)\\.`))?.[1] ?? []))]
    .sort((left, right) => Number(left) - Number(right));
  const evidenceOf = (...paths: string[]) => paths.flatMap((path) => fact(path) ? [source(fact(path)!)] : []);
  const missing = new Set<string>();
  const exceptions: OperationTruthSet["exceptions"] = [];
  const policy = input.policies ?? {version: "required_missing"};
  const requested = asNumber(input.requestedAmount ?? value("transaction.requested_amount"));
  if (!requested) missing.add("transaction.requested_amount");

  const lines: Line[] = indexed("transaction.sources_and_uses").flatMap((index) => {
    const base = `transaction.sources_and_uses.${index}`;
    const side = value(`${base}.side`);
    const amount = asNumber(value(`${base}.amount`));
    const item = value(`${base}.item`);
    const normalizedSide = side === "sources" ? "source" : side === "uses" ? "use" : side;
    if ((normalizedSide !== "source" && normalizedSide !== "use") || !amount || !item) return [];
    return [{
      id: index, side: normalizedSide, item, amount,
      entity: value(`${base}.entity`) ?? null,
      currency: value(`${base}.currency`) ?? value("transaction.currency") ?? "BRL",
      date: value(`${base}.date`) ?? null,
      tranche: value(`${base}.tranche`) ?? null,
      condition: value(`${base}.condition`) === "available" || value(`${base}.condition`) === "conditional" ? value(`${base}.condition`) as "available" | "conditional" : "not_confirmed",
      evidence: evidenceOf(`${base}.amount`, `${base}.item`, `${base}.side`),
    }];
  });
  const sourceLines = lines.filter((line) => line.side === "source");
  const useLines = lines.filter((line) => line.side === "use");
  const tolerance = policy.residualTolerance ?? "0";
  const tie = sourceLines.length && useLines.length
    ? reconcileSourcesAndUses({sources: sourceLines, uses: useLines, tolerance})
    : null;
  if (!sourceLines.length || !useLines.length) missing.add("transaction.sources_and_uses");
  if (tie?.status === "fail") exceptions.push({id: "sources-uses-mismatch", severity: "critical", message: "Sources and uses do not tie within policy tolerance.", affectedFields: lines.map((line) => `transaction.sources_and_uses.${line.id}`)});
  const unmatchedTotalSources = sum(sourceLines.map((line) => line.amount));
  const unmatchedTotalUses = sum(useLines.map((line) => line.amount));
  const sourcesAndUses = tie ? {...tie, lines} : {
    lines,
    totalSources: unmatchedTotalSources,
    totalUses: unmatchedTotalUses,
    difference: new Decimal(unmatchedTotalSources).minus(unmatchedTotalUses).toFixed(),
    status: "not_computable" as const,
  };

  const capex = asNumber(value("project.total_cost")) ?? sum(useLines.filter((line) => /capex|expans|aquisi|equip|obra/i.test(line.item)).map((line) => line.amount));
  const incrementalWcValue = asNumber(value("transaction.incremental_working_capital")) ?? sum(useLines.filter((line) => /capital de giro|working capital|ncg/i.test(line.item)).map((line) => line.amount));
  const transactionCosts = asNumber(value("transaction.transaction_costs")) ?? sum(useLines.filter((line) => /fee|custo|despesa da opera/i.test(line.item)).map((line) => line.amount));
  const executionBuffer = asNumber(value("transaction.execution_buffer"));
  const selfFunding = sum([value("project.company_cash"), value("project.shareholder_equity"), value("transaction.self_funding")]);
  let calculatedNeed: OperationTruthSet["calculatedNeed"] = null;
  if (capex && incrementalWcValue && transactionCosts && executionBuffer !== undefined) {
    const calculation = calculateTransactionNeed({capex, incrementalWorkingCapital: incrementalWcValue, transactionCosts, executionBuffer, selfFunding});
    const divergence = requested ? new Decimal(requested).minus(calculation.calculatedNeed).toFixed() : null;
    calculatedNeed = {value: calculation.calculatedNeed, trace: calculation.trace, divergence, status: requested && policy.sizingMateriality !== undefined ? "completed" : "partial"};
    if (requested && policy.sizingMateriality !== undefined && new Decimal(divergence!).abs().gt(policy.sizingMateriality)) {
      exceptions.push({id: "request-need-divergence", severity: "high", message: "The stated request differs materially from calculated need.", affectedFields: ["transaction.requested_amount"]});
    }
  } else {
    for (const required of [!capex && "project.total_cost", !incrementalWcValue && "transaction.incremental_working_capital", !transactionCosts && "transaction.transaction_costs", executionBuffer === undefined && "transaction.execution_buffer"].filter(Boolean) as string[]) missing.add(required);
  }

  const workingCapitalRows = indexed("transaction.incremental_working_capital_schedule").flatMap((index) => {
    const base = `transaction.incremental_working_capital_schedule.${index}`;
    const row = ["period", "incremental_revenue", "incremental_cogs", "dso_days", "dio_days", "dpo_days", "taxes_and_other_operating", "days_in_period"].map((name) => value(`${base}.${name}`));
    if (row.some((item) => item === undefined)) return [];
    return [{period: row[0]!, incrementalRevenue: row[1]!, incrementalCogs: row[2]!, dsoDays: row[3]!, dioDays: row[4]!, dpoDays: row[5]!, taxesAndOtherOperating: row[6]!, daysInPeriod: row[7]!}];
  });
  const incrementalWorkingCapital = workingCapitalRows.length ? calculateIncrementalWorkingCapital(workingCapitalRows) : null;

  const latestAdjustedEbitda = [...input.financialTruth.statements]
    .filter((statement) => statement.adjustedEbitda !== null)
    .sort((left, right) => right.period.localeCompare(left.period))[0]?.adjustedEbitda ?? undefined;
  const proForma = requested ? calculateProFormaPosition({
    grossDebt: input.debtTruth.views.grossFinancialDebt,
    unrestrictedCash: input.debtTruth.views.unrestrictedCash,
    newDebt: requested,
    refinancedDebt: asNumber(value("transaction.refinanced_debt")) ?? "0",
    feesPaidFromCash: asNumber(value("transaction.fees_paid_from_cash")) ?? "0",
    cashContribution: asNumber(value("project.company_cash")) ?? "0",
    ...(latestAdjustedEbitda ? {adjustedEbitda: latestAdjustedEbitda} : {}),
  }) : null;
  const covenantConflict = input.debtTruth.covenants.some((covenant) => covenant.status === "fail");
  const proFormaWithCovenant = proForma ? {...proForma, dayOneCovenantConflict: input.debtTruth.covenants.length ? covenantConflict : null} : null;
  if (covenantConflict) exceptions.push({id: "day-one-covenant-conflict", severity: "critical", message: "The pro forma structure conflicts with an existing covenant test.", affectedFields: ["debt.covenants"]});

  const scenarioCapacity = indexed("transaction.capacity_scenarios").flatMap((index) => {
    const base = `transaction.capacity_scenarios.${index}`;
    const scenario = value(`${base}.name`);
    const coverage = asNumber(value(`${base}.dscr`)) ?? null;
    const deficit = asNumber(value(`${base}.liquidity_deficit`));
    if (!scenario || deficit === undefined) return [];
    return [{scenario, coverage, deficit, status: coverage === null || policy.minimumDscr === undefined ? "not_computable" as const : new Decimal(coverage).gte(policy.minimumDscr) && new Decimal(deficit).eq(0) ? "pass" as const : "fail" as const}];
  });

  const effects = {
    solves: indexed("transaction.effects.solves").map((index) => value(`transaction.effects.solves.${index}.description`)).filter((item): item is string => Boolean(item)),
    doesNotTouch: indexed("transaction.effects.does_not_touch").map((index) => value(`transaction.effects.does_not_touch.${index}.description`)).filter((item): item is string => Boolean(item)),
    creates: indexed("transaction.effects.creates").map((index) => value(`transaction.effects.creates.${index}.description`)).filter((item): item is string => Boolean(item)),
  };
  const excessFunding = requested && calculatedNeed && policy.authorizedBuffer !== undefined && policy.annualDebtCost !== undefined && policy.annualCashYield !== undefined
    ? calculateExcessFundingCarry({requested, calculatedNeed: calculatedNeed.value, authorizedBuffer: policy.authorizedBuffer, annualDebtCost: policy.annualDebtCost, annualCashYield: policy.annualCashYield})
    : null;

  const tranches = indexed("transaction.tranches").map((index) => {
    const base = `transaction.tranches.${index}`;
    const milestone = value(`${base}.milestone`) ?? null;
    const evidence = value(`${base}.evidence`) ?? null;
    const attestor = value(`${base}.attestor`) ?? null;
    const releaseDays = asInteger(value(`${base}.release_days`));
    const objective = Boolean(milestone && evidence && attestor && releaseDays !== null);
    return {id: index, amount: asNumber(value(`${base}.amount`)) ?? null, milestone, evidence, attestor, releaseDays, status: objective ? "completed" as const : "blocked" as const};
  });
  const conditionsPrecedent = indexed("transaction.conditions_precedent").flatMap((index) => {
    const base = `transaction.conditions_precedent.${index}`;
    const condition = value(`${base}.condition`);
    return condition ? [{id: index, condition, owner: value(`${base}.owner`) ?? null, evidence: value(`${base}.evidence`) ?? null, deadline: value(`${base}.deadline`) ?? null, status: value(`${base}.status`) ?? null}] : [];
  });
  const bridgeAmount = asNumber(value("transaction.bridge.amount")) ?? null;
  const bridgeAndTakeout = {
    bridgeAmount,
    takeout: value("transaction.bridge.takeout") ?? null,
    failureRisk: value("transaction.bridge.takeout_failure_risk") ?? null,
    planB: value("transaction.bridge.plan_b") ?? null,
    status: !bridgeAmount ? "not_applicable" as const : value("transaction.bridge.takeout") && value("transaction.bridge.plan_b") ? "completed" as const : "blocked" as const,
  };
  if (bridgeAndTakeout.status === "blocked") exceptions.push({id: "bridge-without-takeout", severity: "critical", message: "Bridge financing lacks a named take-out or plan B.", affectedFields: ["transaction.bridge"]});

  const scheduleRows = indexed("transaction.disbursement_schedule").flatMap((index) => {
    const base = `transaction.disbursement_schedule.${index}`;
    const period = value(`${base}.period`);
    const sources = asNumber(value(`${base}.sources`));
    const uses = asNumber(value(`${base}.uses`));
    if (!period || sources === undefined || uses === undefined) return [];
    return [{period, openingLiquidity: asNumber(value(`${base}.opening_liquidity`)) ?? "0", scheduledSources: sources, scheduledUses: uses}];
  });
  const disbursementSchedule = scheduleRows.length ? testDisbursementCoverage(scheduleRows) : null;
  if (disbursementSchedule?.status === "fail") exceptions.push({id: "uncovered-disbursement-period", severity: "critical", message: "At least one period has an uncovered funding requirement.", affectedFields: ["transaction.disbursement_schedule"]});
  const waitAnalysis = {
    milestone: value("transaction.wait.milestone") ?? null,
    date: value("transaction.wait.date") ?? null,
    waitingCost: asNumber(value("transaction.wait.cost")) ?? null,
    estimatedGain: asNumber(value("transaction.wait.estimated_gain")) ?? null,
    decision: value("transaction.wait.decision") ?? null,
    status: value("transaction.wait.decision") ? "completed" as const : "not_applicable" as const,
  };
  const mixedUses = indexed("transaction.use_blocks").flatMap((index) => {
    const base = `transaction.use_blocks.${index}`;
    const category = value(`${base}.category`);
    const amount = asNumber(value(`${base}.amount`));
    const description = value(`${base}.description`);
    const normalizedCategory: "productive" | "remediation" | "reinforcement" | "other" = category === "productive" || category === "remediation" || category === "reinforcement" ? category : "other";
    return amount && description ? [{category: normalizedCategory, amount, description}] : [];
  });
  const version = value("transaction.declared_version") ?? null;
  const confirmedAt = value("transaction.declared_version_confirmed_at") ?? null;
  const stale = Boolean(value("transaction.declared_version_stale") === "true" || (confirmedAt && confirmedAt < input.referenceDate && value("transaction.material_change_since_confirmation") === "true"));
  const declaredVersion = {version, confirmedAt, stale, materialTerms: [requested, value("transaction.purpose"), input.requestedTermMonths?.toString() ?? value("transaction.desired_term_months"), value("transaction.preferred_structure")].filter((item): item is string => Boolean(item))};
  if (stale) exceptions.push({id: "stale-operation-version", severity: "critical", message: "The declared operation changed materially after its last confirmation.", affectedFields: ["transaction.declared_version"]});

  const evidenceCounts: Record<`OP-${string}`, number> = {
    "OP-01": evidenceOf("transaction.requested_amount", "project.total_cost", "transaction.incremental_working_capital", "transaction.transaction_costs", "transaction.execution_buffer", "project.company_cash", "project.shareholder_equity", "transaction.self_funding").length,
    "OP-02": lines.reduce((count, line) => count + line.evidence.length, 0),
    "OP-03": evidenceOf("transaction.requested_amount", "transaction.refinanced_debt", "transaction.fees_paid_from_cash", "project.company_cash").length,
    "OP-04": indexed("transaction.capacity_scenarios").reduce((count, index) => count + evidenceOf(`transaction.capacity_scenarios.${index}.name`, `transaction.capacity_scenarios.${index}.dscr`, `transaction.capacity_scenarios.${index}.liquidity_deficit`).length, 0),
    "OP-05": ["solves", "does_not_touch", "creates"].reduce((count, group) => count + indexed(`transaction.effects.${group}`).reduce((subtotal, index) => subtotal + evidenceOf(`transaction.effects.${group}.${index}.description`).length, 0), 0),
    "OP-06": indexed("transaction.incremental_working_capital_schedule").reduce((count, index) => count + facts.filter((candidate) => candidate.key.fieldPath.startsWith(`transaction.incremental_working_capital_schedule.${index}.`)).length, 0),
    "OP-07": evidenceOf("transaction.requested_amount").length,
    "OP-08": indexed("transaction.tranches").reduce((count, index) => count + facts.filter((candidate) => candidate.key.fieldPath.startsWith(`transaction.tranches.${index}.`)).length, 0),
    "OP-09": indexed("transaction.conditions_precedent").reduce((count, index) => count + facts.filter((candidate) => candidate.key.fieldPath.startsWith(`transaction.conditions_precedent.${index}.`)).length, 0),
    "OP-10": facts.filter((candidate) => candidate.key.fieldPath.startsWith("transaction.bridge.")).length,
    "OP-11": indexed("transaction.disbursement_schedule").reduce((count, index) => count + facts.filter((candidate) => candidate.key.fieldPath.startsWith(`transaction.disbursement_schedule.${index}.`)).length, 0),
    "OP-12": facts.filter((candidate) => candidate.key.fieldPath.startsWith("transaction.wait.")).length,
    "OP-13": indexed("transaction.use_blocks").reduce((count, index) => count + facts.filter((candidate) => candidate.key.fieldPath.startsWith(`transaction.use_blocks.${index}.`)).length, 0),
    "OP-14": evidenceOf("transaction.declared_version", "transaction.declared_version_confirmed_at", "transaction.requested_amount", "transaction.purpose", "transaction.desired_term_months", "transaction.preferred_structure").length,
  };
  const exceptionOwners: Record<string, `OP-${string}`[]> = {
    "request-need-divergence": ["OP-01"],
    "sources-uses-mismatch": ["OP-02"],
    "day-one-covenant-conflict": ["OP-03"],
    "bridge-without-takeout": ["OP-10"],
    "uncovered-disbursement-period": ["OP-11"],
    "stale-operation-version": ["OP-14"],
  };
  const coverageSpec: Array<[`OP-${string}`, Status, number, string[]]> = [
    ["OP-01", calculatedNeed?.status ?? "not_computable", calculatedNeed ? 1 : 0, calculatedNeed ? [] : ["complete calculated need"]],
    ["OP-02", sourcesAndUses.status === "pass" ? "completed" : sourcesAndUses.status === "fail" ? "blocked" : "not_computable", lines.length, sourceLines.length && useLines.length ? [] : ["complete sources and uses"]],
    ["OP-03", proFormaWithCovenant ? covenantConflict ? "blocked" : "completed" : "not_computable", proFormaWithCovenant ? 1 : 0, proFormaWithCovenant ? [] : ["requested amount"]],
    ["OP-04", scenarioCapacity.length ? scenarioCapacity.some((item) => item.status === "fail") ? "blocked" : scenarioCapacity.every((item) => item.status === "pass") ? "completed" : "partial" : "not_computable", scenarioCapacity.length, scenarioCapacity.length ? [] : ["scenario liquidity coverage"]],
    ["OP-05", Object.values(effects).every((items) => items.length) ? "completed" : "partial", Object.values(effects).flat().length, Object.values(effects).every((items) => items.length) ? [] : ["three explicit effect lists"]],
    ["OP-06", incrementalWorkingCapital ? "completed" : "not_computable", incrementalWorkingCapital?.periods.length ?? 0, incrementalWorkingCapital ? [] : ["period working capital drivers"]],
    ["OP-07", excessFunding ? "completed" : "not_computable", excessFunding ? 1 : 0, excessFunding ? [] : ["approved carry policy"]],
    ["OP-08", tranches.length ? tranches.some((item) => item.status === "blocked") ? "blocked" : "completed" : "not_applicable", tranches.length, []],
    ["OP-09", conditionsPrecedent.length ? conditionsPrecedent.every((item) => item.owner && item.evidence && item.deadline && item.status) ? "completed" : "partial" : "not_computable", conditionsPrecedent.length, conditionsPrecedent.length ? [] : ["conditions precedent catalogue"]],
    ["OP-10", bridgeAndTakeout.status, bridgeAmount ? 1 : 0, bridgeAndTakeout.status === "blocked" ? ["take-out and plan B"] : []],
    ["OP-11", disbursementSchedule ? disbursementSchedule.status === "pass" ? "completed" : "blocked" : "not_computable", disbursementSchedule?.periods.length ?? 0, disbursementSchedule ? [] : ["draw and works schedule"]],
    ["OP-12", waitAnalysis.status, waitAnalysis.status === "completed" ? 1 : 0, []],
    ["OP-13", mixedUses.length ? "completed" : "not_computable", mixedUses.length, mixedUses.length ? [] : ["uses classified by economic purpose"]],
    ["OP-14", version && confirmedAt && !stale ? "completed" : stale ? "blocked" : "partial", declaredVersion.materialTerms.length, version && confirmedAt ? [] : ["confirmed operation version"]],
  ];
  const procedureCoverage = coverageSpec.map(([procedureId, status, outputCount, procedureMissing]) => ({
    procedureId,
    status,
    outputCount,
    evidenceCount: evidenceCounts[procedureId] ?? 0,
    missingInputs: procedureMissing,
    exceptionIds: exceptions.filter((item) => exceptionOwners[item.id]?.includes(procedureId)).map((item) => item.id),
  }));
  const blocking = exceptions.some((item) => item.severity === "critical");
  return {
    version: operationTruthVersion, policyVersion: policy.version,
    status: blocking ? "blocked" : procedureCoverage.every((item) => item.status === "completed" || item.status === "not_applicable") ? "complete" : "partial",
    request: {amount: requested ?? null, purpose: value("transaction.purpose") ?? null, termMonths: input.requestedTermMonths ?? asInteger(value("transaction.desired_term_months")), evidence: evidenceOf("transaction.requested_amount", "transaction.purpose")},
    calculatedNeed, sourcesAndUses, proForma: proFormaWithCovenant, scenarioCapacity, effects, incrementalWorkingCapital, excessFunding, tranches, conditionsPrecedent, bridgeAndTakeout, disbursementSchedule, waitAnalysis, mixedUses, declaredVersion, exceptions, missingInputs: [...missing].sort(), procedureCoverage,
  };
}
