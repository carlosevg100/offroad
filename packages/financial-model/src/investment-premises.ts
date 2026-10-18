import Decimal from "decimal.js";
import {z} from "zod";

const Exact = Decimal.clone({precision: 80, rounding: Decimal.ROUND_HALF_UP});
const fmt = (v: Decimal) => v.toDecimalPlaces(8).toFixed();
const text = z.string().trim().min(1).max(2000);
const amount = z.string().regex(/^\d{1,24}(?:\.\d{1,20})?$/);
const ratio = z.string().regex(/^-?\d{1,4}(?:\.\d{1,20})?$/);
const month = z.iso.date().refine(d => d.endsWith("-01"), "Operation starts on the first day of a month");
const origins = ["document", "informed", "house", "estimate"] as const;
const originLabel: Record<(typeof origins)[number], string> = {document: "documento", informed: "informado", house: "premissa da casa", estimate: "estimativa"};
/** A value and where it came from; the source names the document, the message or the house rule. */
const fact = <T extends z.ZodType>(value: T) => z.strictObject({value, origin: z.enum(origins), source: text});

/** The facts of one investment, each with its origin. These are proposals: nothing here is
 * adopted until a person confirms the set, and every number later read by the method comes from
 * the adopted basis, not from this object. */
export const investmentFactsSchema = z.strictObject({
  analysisId: z.uuid(), entityId: z.uuid(), perimeter: text, currency: z.string().regex(/^[A-Z]{3}$/),
  definitionVersionId: z.uuid(),
  /** First projected year and number of years in the explicit horizon (economic life plus the build). */
  firstYear: z.number().int().min(2000).max(2200), years: z.number().int().min(3).max(40),
  capex: fact(z.array(z.strictObject({year: z.number().int(), amount})).min(1).max(40)),
  operationStart: fact(month),
  ramp: fact(z.strictObject({stageMonths: z.array(z.number().int().min(1).max(60)).max(6), stageLoads: z.array(ratio).max(6)})),
  annualIncrementalRevenue: fact(amount), annualDisplacedPurchases: fact(amount),
  annualNewVariableCost: fact(amount), annualNewFixedCost: fact(amount),
  /** Annual growth of benefits and costs after the year operation starts. */
  annualGrowth: fact(ratio), annualMaintenance: fact(amount), usefulLifeYears: fact(z.number().int().min(1).max(60)),
  cashTaxRate: fact(ratio), receivableDays: fact(amount), inventoryDays: fact(amount), newSupplierDays: fact(amount), lostSupplierDays: fact(amount),
  discountRate: fact(ratio),
  /** Whether the startup working capital returns in the last year of the horizon. */
  workingCapitalReturnsAtEnd: fact(z.boolean()),
  sensitivities: z.strictObject({benefitFactor: fact(ratio), capexFactor: fact(ratio), startDelayMonths: fact(z.number().int().min(1).max(36)), deferMonths: fact(z.literal(12))}),
}).superRefine((f, ctx) => {
  if (f.ramp.value.stageMonths.length !== f.ramp.value.stageLoads.length) ctx.addIssue({code: "custom", message: "Ramp stages and loads must align"});
  const last = f.firstYear + f.years - 1;
  if (f.capex.value.some(c => c.year < f.firstYear || c.year > last)) ctx.addIssue({code: "custom", message: "Capex outside the horizon"});
  if (Number(f.operationStart.value.slice(0, 4)) > last) ctx.addIssue({code: "custom", message: "Operation starts after the horizon"});
});
export type InvestmentFacts = z.infer<typeof investmentFactsSchema>;
export type ProposedHypothesis = {fieldPath: string; dimensions: {entityId: string; perimeter: string; periodStart: string; periodEnd: string;
  currency: string; unit: string; scale: "1"; scenario: string; definitionVersionId: string}; value: {type: "number" | "text" | "date" | "list"; value: string | string[]}; reason: string};

const addMonths = (d: string, n: number) => {const x = new Date(`${d}T00:00:00Z`); x.setUTCMonth(x.getUTCMonth() + n); return x.toISOString().slice(0, 10);};

/** The hypotheses one confirmation adopts: the base case, three sensitivities that adopt only
 * what they change, and a twelve-month deferral adopted in full, each with its role, label and
 * what it changes. Every reason states the origin of the number. Deterministic. */
export function proposeInvestmentHypotheses(raw: unknown): ProposedHypothesis[] {
  const f = investmentFactsSchema.parse(raw);
  const out: ProposedHypothesis[] = [], prefix = `investment.${f.analysisId}.`;
  const why = (x: {origin: (typeof origins)[number]; source: string}) => `Origem: ${originLabel[x.origin]}. ${x.source}`;
  const house = (source: string) => `Origem: premissa da casa. ${source}`;
  const mi = (v: Decimal.Value) => new Exact(v).div(1000000).toDecimalPlaces(1).toFixed().replace(".", ",");
  function caseBuilder(scenario: string, shiftYears: number) {
    const openingDate = `${f.firstYear - 1}-12-31`, endDate = `${f.firstYear + f.years - 1 + shiftYears}-12-31`;
    const years = Array.from({length: f.years + shiftYears}, (_, k) => f.firstYear + k);
    const add = (path: string, unit: string, value: ProposedHypothesis["value"], reason: string) => out.push({fieldPath: prefix + path,
      dimensions: {entityId: f.entityId, perimeter: f.perimeter, periodStart: openingDate, periodEnd: endDate, currency: f.currency, unit, scale: "1", scenario, definitionVersionId: f.definitionVersionId},
      value, reason});
    return {years, add, list: (path: string, unit: string, values: string[], reason: string) => add(path, unit, {type: "list", value: values}, reason)};
  }
  const startYear = Number(f.operationStart.value.slice(0, 4));
  const growth = (y: number) => new Exact(1).plus(f.annualGrowth.value).pow(Math.max(0, y - startYear));
  const capexOf = (y: number, factor: Decimal.Value, shift: number) => f.capex.value.filter(c => c.year + shift === y).reduce((s, c) => s.plus(new Exact(c.amount).times(factor)), new Exact(0));
  const totalCapex = f.capex.value.reduce((s, c) => s.plus(c.amount), new Exact(0));
  const benefitSeries = (years: number[], key: "annualDisplacedPurchases" | "annualNewVariableCost" | "annualNewFixedCost" | "annualIncrementalRevenue", factor: Decimal.Value) =>
    years.map(y => fmt(growth(y).times(f[key].value).times(factor)));

  function fullCase(scenario: string, shift: number, role: string, label: string, changes: string[]) {
    const c = caseBuilder(scenario, shift), {years} = c;
    c.add("case.role", "convention", {type: "text", value: role}, house("Papel do caso na análise do investimento"));
    c.add("case.label", "explanation", {type: "text", value: label}, house("Rótulo do caso"));
    if (changes.length) c.add("case.changes", "explanation", {type: "list", value: changes}, house("O que o caso muda em relação ao caso base"));
    c.list("periodEnds", "date", years.map(y => `${y}-12-31`), house("Fim de cada ano do horizonte explícito"));
    c.list("project.annualNetRevenue", "currency", benefitSeries(years, "annualIncrementalRevenue", 1), why(f.annualIncrementalRevenue));
    c.list("project.annualAvoidedOperatingCost", "currency", benefitSeries(years, "annualDisplacedPurchases", 1), why(f.annualDisplacedPurchases));
    c.list("project.annualVariableOperatingCost", "currency", benefitSeries(years, "annualNewVariableCost", 1), why(f.annualNewVariableCost));
    c.list("project.annualFixedOperatingCost", "currency", benefitSeries(years, "annualNewFixedCost", 1), why(f.annualNewFixedCost));
    c.list("project.annualMaintenanceCapex", "currency", years.map(() => fmt(new Exact(f.annualMaintenance.value))), why(f.annualMaintenance));
    c.list("project.growthCapexPaid", "currency", years.map(y => fmt(capexOf(y, 1, shift))), why(f.capex));
    c.list("project.annualDepreciation", "currency", years.map(() => fmt(totalCapex.div(f.usefulLifeYears.value))), why(f.usefulLifeYears) + " Depreciação linear do capex total pela vida útil.");
    for (const k of ["receivables", "inventory", "newPayables", "lostSupplierCredit"]) c.add("project.openingWorkingCapital." + k, "currency", {type: "number", value: "0"}, house("Projeto novo, sem giro incremental na abertura"));
    c.list("project.cashTaxRate", "ratio", years.map(() => f.cashTaxRate.value), why(f.cashTaxRate));
    c.list("project.lossTaxTreatment", "convention", years.map(() => "no_cash_benefit"), house("Prejuízo do projeto não gera benefício de caixa isolado"));
    c.list("project.fixedCostScaling", "convention", years.map(() => "load"), house("Custo fixo acompanha a carga da operação"));
    const start = addMonths(f.operationStart.value, shift * 12);
    c.add("project.ramp.operationStartMonth", "date", {type: "date", value: start}, why(f.operationStart));
    c.list("project.ramp.stageMonths", "months", f.ramp.value.stageMonths.map(String), why(f.ramp));
    c.list("project.ramp.stageLoads", "ratio", f.ramp.value.stageLoads, why(f.ramp));
    c.add("project.ramp.terminalLoad", "ratio", {type: "number", value: "1"}, house("Carga cheia depois da rampa"));
    c.add("project.startup.annualIncrementalRevenue", "currency", {type: "number", value: fmt(new Exact(f.annualIncrementalRevenue.value))}, why(f.annualIncrementalRevenue));
    c.add("project.startup.annualNewVariableCost", "currency", {type: "number", value: fmt(new Exact(f.annualNewVariableCost.value))}, why(f.annualNewVariableCost));
    c.add("project.startup.annualDisplacedPurchases", "currency", {type: "number", value: fmt(new Exact(f.annualDisplacedPurchases.value))}, why(f.annualDisplacedPurchases));
    for (const k of ["receivableDays", "inventoryDays", "newSupplierDays", "lostSupplierDays"] as const)
      c.add("project.startup." + k, "days", {type: "number", value: f[k].value}, why(f[k]));
    c.add("project.startup.adoptedYearDays", "convention", {type: "text", value: "360"}, house("Prazos em dias sobre ano comercial de 360 dias"));
    const startYearShifted = Number(start.slice(0, 4));
    c.list("project.startup.retainedCapitalMultipliers", "ratio", years.map((y, n) => y < startYearShifted || (f.workingCapitalReturnsAtEnd.value && n === years.length - 1) ? "0" : "1"), why(f.workingCapitalReturnsAtEnd));
    c.add("valuation.perspective", "convention", {type: "text", value: "standalone_project"}, house("Projeto avaliado isolado, sem financiamento"));
    c.add("valuation.baseDate", "date", {type: "date", value: `${f.firstYear}-12-31`}, house("Valor na data do fim do primeiro ano"));
    c.add("valuation.timing", "convention", {type: "text", value: "adopted_times"}, house("Fluxo de cada ano no ponto do ano, primeiro ano em t igual a zero"));
    c.list("valuation.adoptedTimes", "years", years.map((_, k) => String(k)), house("Grade anual do valor"));
    c.add("valuation.discountRate", "ratio", {type: "number", value: f.discountRate.value}, why(f.discountRate));
    c.add("valuation.irrLower", "ratio", {type: "number", value: "-0.5"}, house("Intervalo de busca da TIR"));
    c.add("valuation.irrUpper", "ratio", {type: "number", value: "2"}, house("Intervalo de busca da TIR"));
    c.add("valuation.precisionMode", "convention", {type: "text", value: "unrounded"}, house("Sem arredondamento"));
    c.add("valuation.precisionDecimals", "count", {type: "number", value: "0"}, house("Sem arredondamento"));
    c.add("valuation.precisionQuantum", "currency", {type: "number", value: "0"}, house("Sem arredondamento"));
    return c;
  }
  function overlay(scenario: string, label: string, changes: string[], apply: (c: ReturnType<typeof caseBuilder>) => void) {
    const c = caseBuilder(scenario, 0);
    c.add("case.role", "convention", {type: "text", value: "sensitivity"}, house("Papel do caso na análise do investimento"));
    c.add("case.label", "explanation", {type: "text", value: label}, house("Rótulo do caso"));
    c.add("case.changes", "explanation", {type: "list", value: changes}, house("O que o caso muda em relação ao caso base"));
    c.add("case.inherits", "convention", {type: "text", value: "base"}, house("Herda do caso base tudo o que não muda"));
    apply(c);
  }
  fullCase("base", 0, "base", "Investimento como planejado", []);
  const s = f.sensitivities, net = new Exact(f.annualDisplacedPurchases.value).plus(f.annualIncrementalRevenue.value).minus(f.annualNewVariableCost.value).minus(f.annualNewFixedCost.value);
  overlay("benefit-lower", `Benefício anual de R$ ${mi(net.times(s.benefitFactor.value))} milhões`, [`Benefício anual em regime de R$ ${mi(net.times(s.benefitFactor.value))} milhões em vez de R$ ${mi(net)} milhões`], c => {
    c.list("project.annualNetRevenue", "currency", benefitSeries(c.years, "annualIncrementalRevenue", s.benefitFactor.value), why(s.benefitFactor));
    c.list("project.annualAvoidedOperatingCost", "currency", benefitSeries(c.years, "annualDisplacedPurchases", s.benefitFactor.value), why(s.benefitFactor));
    c.list("project.annualVariableOperatingCost", "currency", benefitSeries(c.years, "annualNewVariableCost", s.benefitFactor.value), why(s.benefitFactor));
    c.list("project.annualFixedOperatingCost", "currency", benefitSeries(c.years, "annualNewFixedCost", s.benefitFactor.value), why(s.benefitFactor));
  });
  const pct = new Exact(s.capexFactor.value).minus(1).times(100).toDecimalPlaces(0).toFixed();
  overlay("capex-higher", `Capex ${pct}% maior`, [`Capex e depreciação ${pct}% maiores`], c => {
    c.list("project.growthCapexPaid", "currency", c.years.map(y => fmt(capexOf(y, s.capexFactor.value, 0))), why(s.capexFactor));
    c.list("project.annualDepreciation", "currency", c.years.map(() => fmt(totalCapex.times(s.capexFactor.value).div(f.usefulLifeYears.value))), why(s.capexFactor));
  });
  const later = addMonths(f.operationStart.value, s.startDelayMonths.value);
  overlay("slower-start", `Partida ${s.startDelayMonths.value} meses mais tarde`, [`Operação começa em ${later.slice(5, 7)}/${later.slice(0, 4)}`], c => {
    c.add("project.ramp.operationStartMonth", "date", {type: "date", value: later}, why(s.startDelayMonths));
  });
  fullCase("defer-12", 1, "deferral", "Adiar doze meses", ["Desembolsos e partida um ano depois"]);
  return out;
}
