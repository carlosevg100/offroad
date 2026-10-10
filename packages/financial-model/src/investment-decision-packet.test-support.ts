import {createHash} from "node:crypto";
import Decimal from "decimal.js";
import type {AdoptionBasisEntry, AdoptionBasisSnapshot} from "@offroad/reconciliation";
import type {AnalysisSelection} from "./adopted-analysis-binding";
import type {AdoptedInvestmentAnalysisInput} from "./adopted-investment-analysis";
import {analysisTestId as id} from "./adopted-analysis.test-support";

const D = Decimal.clone({precision: 60}), mm = (v: Decimal.Value) => new D(v).times(1000000).toDecimalPlaces(8).toFixed();

/** One synthetic adopted basis holding several scenarios of the C32 packaging line, each with
 * its own horizon. Synthetic hypotheses for calibration only; never production parameters. */
export function c32PacketBasis() {
  const entries: AdoptionBasisEntry[] = []; let n = 2000;
  const snapshot: AdoptionBasisSnapshot = {schemaVersion: "contextual-adoption.v1", versionId: id(1500), setId: id(1006),
    workId: id(1007), purpose: "synthetic investment decision", contextKey: "synthetic", revision: 1,
    previousVersionId: null, classification: "working_basis", entries};
  const scope = {workId: id(1007), purpose: snapshot.purpose, versionId: snapshot.versionId};
  const inputs: AdoptedInvestmentAnalysisInput[] = [];
  const analysisId = id(1004);

  /** Mirrors projeto_embalagem.py: economy factor scales the run-rate economy, capex factor
   * scales capex and depreciation, a later start delays the ramp, deferral shifts the project. */
  const contributor = (scenario: string, openingDate: string, endDate: string) => (path: string, unit: string, value: AdoptionBasisEntry["value"]): AnalysisSelection => {
    const decisionId = id(n++);
    entries.push({decisionId, slotKey: createHash("sha256").update(path + scenario).digest("hex"), kind: "hypothesis",
      fieldPath: `investment.${analysisId}.${path}`,
      dimensions: {entityId: id(1001), perimeter: "standalone", periodStart: openingDate, periodEnd: endDate, currency: "BRL", unit, scale: "1", scenario, definitionVersionId: id(1003)},
      value, observationId: null, referenceValue: null, referenceDimensions: null, definitionKind: "managerial", actorId: id(1005), reason: "Synthetic C32 calibration hypothesis"});
    return {decisionId, definitionVersionId: id(1003), definitionKind: "managerial", missingReason: null};
  };
  /** A sensitivity that adopts only the operands it changes and inherits the rest. */
  function overlay(base: AdoptedInvestmentAnalysisInput, scenario: string, change: (contribute: ReturnType<typeof contributor>, input: AdoptedInvestmentAnalysisInput, years: number[]) => void) {
    const input = structuredClone({...base, envelope: {canonical: "", fingerprint: ""}}) as AdoptedInvestmentAnalysisInput;
    input.scenario = scenario; input.inheritedScenario = base.scenario;
    const years = Array.from({length: Number(base.endDate.slice(0, 4)) - 2025}, (_, k) => 2026 + k);
    change(contributor(scenario, base.openingDate, base.endDate), input, years);
    inputs.push(input); return input;
  }
  function addCase(o: {scenario: string; economyFactor?: Decimal.Value; capexFactor?: Decimal.Value; operationStart?: string; deferYears?: number; withCompany?: boolean; quantum?: string}) {
    const defer = o.deferYears ?? 0, economy = new D(o.economyFactor ?? 1), capexFactor = new D(o.capexFactor ?? 1);
    const openingDate = "2025-12-31", endDate = `${2036 + defer}-12-31`;
    const years = Array.from({length: 11 + defer}, (_, k) => 2026 + k);
    const contribute = contributor(o.scenario, openingDate, endDate);
    const number = (p: string, unit: string, value: string) => contribute(p, unit, {type: "number", value});
    const text = (p: string, value: string) => contribute(p, "convention", {type: "text", value});
    const date = (p: string, value: string) => contribute(p, "date", {type: "date", value});
    const list = (p: string, unit: string, value: string[]) => contribute(p, unit, {type: "list", value});
    const growth = (y: number) => new D("1.04").pow(Math.max(0, y - 2027));
    const capex = (y: number) => y - defer === 2026 ? capexFactor.times(10) : y - defer === 2027 ? capexFactor.times(8) : new D(0);
    const series: Record<string, (y: number) => Decimal.Value> = {
      annualNetRevenue: () => 0, annualAvoidedOperatingCost: y => growth(y).times(30).times(economy),
      annualVariableOperatingCost: y => growth(y).times("19.5").times(economy), annualFixedOperatingCost: y => growth(y).times("4.5").times(economy),
      annualMaintenanceCapex: () => "0.6", annualDepreciation: () => capexFactor.times("1.8"), growthCapexPaid: capex};
    const money = Object.fromEntries(Object.entries(series).map(([k, f]) => [k, list("project." + k, "currency", years.map(y => {
      const v = new D(f(y)); return v.eq(0) ? "0" : mm(v);
    }))]));
    const opening = Object.fromEntries(["receivables", "inventory", "newPayables", "lostSupplierCredit"].map(k => [k, number("project.openingWorkingCapital." + k, "currency", "0")]));
    const project = {money, openingWorkingCapital: opening, cashTaxRate: list("project.cashTaxRate", "ratio", years.map(() => "0.34")),
      lossTaxTreatment: list("project.lossTaxTreatment", "convention", years.map(() => "no_cash_benefit")), fixedCostScaling: list("project.fixedCostScaling", "convention", years.map(() => "load")),
      exposure: {mode: "monthly_ramp", operationStartMonth: date("project.ramp.operationStartMonth", o.operationStart ?? `${2027 + defer}-05-01`), stageMonths: list("project.ramp.stageMonths", "months", ["3"]), stageLoads: list("project.ramp.stageLoads", "ratio", ["0.5"]), terminalLoad: number("project.ramp.terminalLoad", "ratio", "1")},
      closingWorkingCapital: {mode: "startup_drivers", startup: {money: {annualIncrementalRevenue: number("project.startup.annualIncrementalRevenue", "currency", "0"), annualNewVariableCost: number("project.startup.annualNewVariableCost", "currency", mm("19.5")), annualDisplacedPurchases: number("project.startup.annualDisplacedPurchases", "currency", mm("30"))},
        days: {receivableDays: number("project.startup.receivableDays", "days", "0"), inventoryDays: number("project.startup.inventoryDays", "days", "45"), newSupplierDays: number("project.startup.newSupplierDays", "days", "30"), lostSupplierDays: number("project.startup.lostSupplierDays", "days", "60")}, adoptedYearDays: text("project.startup.adoptedYearDays", "360")},
        retainedCapitalMultipliers: list("project.startup.retainedCapitalMultipliers", "ratio", years.map(y => y < 2027 + defer || y === years.at(-1) ? "0" : "1"))}};
    const companyMoney = {ebitda: "40", nonCashEbitdaBridge: "0", cashLeasePayments: "3", netWorkingCapitalChange: "2", maintenanceCapex: "8", growthCapex: "4", taxableBaseBeforeProject: "20", netFinancingCashAvailable: "-10", netCapitalCashAvailable: "0", netRestrictedCashMovement: "0", closingDebtStock: "30"};
    const company = o.withCompany === false ? null : {openingAvailableCash: number("company.openingAvailableCash", "currency", mm("20")), openingRestrictedCash: number("company.openingRestrictedCash", "currency", mm("7")),
      money: Object.fromEntries(Object.entries(companyMoney).map(([k, v]) => [k, list("company." + k, "currency", years.map(y => k === "closingDebtStock" && y >= 2033 ? "0" : mm(v)))])),
      cashTaxRate: list("company.cashTaxRate", "ratio", years.map(() => "0.34")), lossTaxTreatment: list("company.lossTaxTreatment", "convention", years.map(() => "no_cash_benefit")),
      debtInventoryStatus: text("company.debtInventoryStatus", "provided"), debtIds: list("company.debtIds", "identity", ["synthetic-debt"]), finalPaymentDates: list("company.finalPaymentDates", "date", ["2033-12-31"])};
    const valuation = {perspective: text("valuation.perspective", "standalone_project"), baseDate: date("valuation.baseDate", "2026-12-31"), timing: text("valuation.timing", "adopted_times"), adoptedTimes: list("valuation.adoptedTimes", "years", years.map((_, k) => String(k))),
      discountRate: number("valuation.discountRate", "ratio", "0.15"), irrLower: number("valuation.irrLower", "ratio", "-0.5"), irrUpper: number("valuation.irrUpper", "ratio", "2"), precisionMode: text("valuation.precisionMode", o.quantum ? "calibration_monetary_quantum" : "unrounded"), precisionDecimals: number("valuation.precisionDecimals", "count", "0"), precisionQuantum: number("valuation.precisionQuantum", "currency", o.quantum ?? "0")};
    const input = {envelope: {canonical: "", fingerprint: ""}, scope, entityId: id(1001), perimeter: "standalone", currency: "BRL", openingDate, endDate, numericInterpretations: [],
      analysisId, scenario: o.scenario, periodEnds: list("periodEnds", "date", years.map(y => `${y}-12-31`)), project, company, valuation} as unknown as AdoptedInvestmentAnalysisInput;
    inputs.push(input); return input;
  }
  function seal() {
    const canonical = JSON.stringify(snapshot), envelope = {canonical, fingerprint: createHash("sha256").update(canonical).digest("hex")};
    for (const input of inputs) input.envelope = envelope;
    return envelope;
  }
  return {entries, addCase, overlay, seal};
}

/** The five C32 cases of projeto_embalagem.py, as a packet input. Sensitivities adopt only
 * what they change; the deferral moves every dated series and so is adopted in full. */
export function c32PacketInput(o: {quantum?: string} = {}) {
  const b = c32PacketBasis();
  const base = b.addCase({scenario: "base", ...o});
  const growth = (y: number) => new D("1.04").pow(Math.max(0, y - 2027));
  const series = (years: number[], f: (y: number) => Decimal) => ({type: "list" as const, value: years.map(y => {const v = f(y); return v.eq(0) ? "0" : mm(v);})});
  const economy4 = b.overlay(base, "economy-4", (c, i, years) => {
    const factor = new D(4).div(6);
    i.project.money.annualAvoidedOperatingCost = c("project.annualAvoidedOperatingCost", "currency", series(years, y => growth(y).times(30).times(factor)));
    i.project.money.annualVariableOperatingCost = c("project.annualVariableOperatingCost", "currency", series(years, y => growth(y).times("19.5").times(factor)));
    i.project.money.annualFixedOperatingCost = c("project.annualFixedOperatingCost", "currency", series(years, y => growth(y).times("4.5").times(factor)));
  });
  const capex120 = b.overlay(base, "capex-120", (c, i, years) => {
    i.project.money.growthCapexPaid = c("project.growthCapexPaid", "currency", series(years, y => y === 2026 ? new D(12) : y === 2027 ? new D("9.6") : new D(0)));
    i.project.money.annualDepreciation = c("project.annualDepreciation", "currency", series(years, () => new D("2.16")));
  });
  const slower = b.overlay(base, "slower-start", (c, i) => {
    if (i.project.exposure.mode !== "monthly_ramp") throw new Error("ramp expected");
    i.project.exposure.operationStartMonth = c("project.ramp.operationStartMonth", "date", {type: "date", value: "2027-11-01"});
  });
  const cases = [
    {id: "base", role: "base" as const, label: "Linha de embalagem, cronograma original", changes: [], analysis: base},
    {id: "economy-4", role: "sensitivity" as const, label: "Economia de R$ 4 milhões por ano", changes: ["Economia anual em regime de R$ 4 milhões em vez de R$ 6 milhões"], analysis: economy4},
    {id: "capex-120", role: "sensitivity" as const, label: "Capex 20% maior", changes: ["Capex e depreciação 20% maiores"], analysis: capex120},
    {id: "slower-start", role: "sensitivity" as const, label: "Partida seis meses mais lenta", changes: ["Operação começa em novembro de 2027"], analysis: slower},
    {id: "defer-12", role: "deferral" as const, label: "Adiar doze meses", changes: ["Desembolsos e partida um ano depois"], analysis: b.addCase({scenario: "defer-12", deferYears: 1, ...o})},
  ];
  return {basis: b, input: {schemaVersion: "investment-decision-packet-input.v1" as const, question: "A linha de embalagem se paga e deve seguir agora?", cases}, seal: b.seal};
}
