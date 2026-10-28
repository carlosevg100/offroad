import type {AdoptionBasisEntry} from "@offroad/reconciliation";
import {analysisTestBasis, analysisTestId as id} from "./adopted-analysis.test-support";
import type {AdoptedBoardCapitalDiscussionInput, BoardCapitalDiscussionAnalyses} from "./adopted-board-capital-discussion";
import type {BoardCapitalDiscussionFacts} from "./board-capital-discussion-premises";
import {prepareInvestmentDecisionPacket} from "./investment-decision-packet";
import {c32PacketInput} from "./investment-decision-packet.test-support";
import {boardDeferralRules, boardShiftDate} from "./board-capital-discussion-templates";
import {prepareDebtTablePacket} from "./debt-table-packet";
import {auroraDebtTableBasis} from "./debt-table.test-support";
import Decimal from "decimal.js";
import {prepareCovenantHeadroomPacket} from "./covenant-headroom-packet";
import {auroraCovenantBasis} from "./covenant-headroom.test-support";
import {prepareWeeklyCashPacket} from "./weekly-cash-packet";
import {auroraWeeklyCashBasis} from "./weekly-cash.test-support";
import {prepareOperatingProjectionPacket} from "./operating-projection-packet";
import {auroraProjectionBasis as operatingProjectionBasis} from "./operating-projection.test-support";
import {prepareProjectionChallengePacket} from "./projection-challenge-packet";
import {auroraProjectionBasis as projectionChallengeBasis} from "./projection-challenge.test-support";
import {prepareReceivablesFundingPacket} from "./receivables-funding-packet";
import {auroraReceivablesFunding, auroraReceivablesFundingBasis} from "./receivables-funding.test-support";
import {prepareRelativeDebtCostPacket} from "./relative-debt-cost-packet";
import {c03Id, c03PacketInput} from "./relative-debt-cost.test-support";
import {prepareCapitalPathsPacket} from "./capital-structure-paths-packet";
import {auroraCapitalPathsBasis, auroraCapitalPathsKernel} from "./capital-structure-paths.test-support";

/** Aurora Alimentos, board meeting of 30/set/2026 (ficha C47, synthetic). The reviewed results are the published
 * calibrations of the released methods, run as they are: C10 debt table, C12 covenant test, C18 weekly cash, C32
 * packaging line, C24 projection with the CFO's informed scenario (turn two of C24), C26 challenge to the FP&A plan,
 * C35 receivables with retailer A's own program (turn two of C35), C03 relative cost and the C32 financing plan for 2027 (evaluate-financing-paths). Three adaptations, all of
 * identity and none of value: the C32 and C03 calibrations are rebound to the shared synthetic company id, and the
 * C12 basis carries the December managerial reading that the C54 calibration adds to it, with the policy definition
 * still unwritten. BRL millions. */
const company = id(1);

/** Replaces one id everywhere in a calibration input (identity only; no value changes). */
function rebind<T>(value: T, from: string, to: string): T {
  return JSON.parse(JSON.stringify(value).split(`"${from}"`).join(`"${to}"`)) as T;
}

/** The C03 relative cost rebound to the shared company; regressions only: the rating actions' exposure set to other
 * horizons (months), the method recomputing the nominal benefits over them. */
export function auroraRelativeCostPacket(variant: {ratingHorizonMonths?: readonly [number, number]; ratingCostCoverage?: "incomplete"} = {}) {
  const relative = c03PacketInput();
  if (variant.ratingCostCoverage) for (const actionId of [relative.ids.ratingLow, relative.ids.ratingHigh]) for (const e of relative.entries)
    if (e.fieldPath.endsWith(`action.${actionId}.costCoverage`)) e.value = {type: "text", value: variant.ratingCostCoverage};
  if (variant.ratingHorizonMonths) {
    const [low, high] = variant.ratingHorizonMonths;
    for (const [actionId, months] of [[relative.ids.ratingLow, low], [relative.ids.ratingHigh, high]] as const) for (const e of relative.entries) {
      if (e.fieldPath.endsWith(`action.${actionId}.ends`)) {const end = new Date(Date.UTC(2026, 4 + months, 1)).toISOString().slice(0, 10); e.value = {type: "list", value: [end]};}
      if (e.fieldPath.endsWith(`action.${actionId}.yearFractions`)) e.value = {type: "list", value: [new Decimal(months).div(12).toFixed()]};
    }
  }
  for (const e of relative.entries) if (e.dimensions.entityId === c03Id(1)) e.dimensions.entityId = company;
  return prepareRelativeDebtCostPacket(rebind(relative.seal(), c03Id(1), company)) as unknown as Record<string, unknown>;
}

function buildSources() {
  const debtTable = prepareDebtTablePacket({schemaVersion: "debt-table-packet-input.v1", question: "Monta a tabela de dívida com tudo que temos.", analysis: auroraDebtTableBasis().seal()});
  const covenant = auroraCovenantPacket();
  const weekly = auroraWeeklyPacket();
  const investment = auroraInvestmentPacket();
  const projection = auroraProjectionPacket();
  const challenge = prepareProjectionChallengePacket({schemaVersion: "projection-challenge-packet-input.v1",
    question: "Que premissas você questionaria nessa projeção? Vai para os bancos semana que vem.", analysis: projectionChallengeBasis().seal()});
  const receivables = auroraReceivablesPacket();
  const relative = c03PacketInput();
  for (const e of relative.entries) if (e.dimensions.entityId === c03Id(1)) e.dimensions.entityId = company;
  // Entries first, then the inputs: the sealed snapshot is a string, so the rebind never touches it.
  const relativeCost = prepareRelativeDebtCostPacket(rebind(relative.seal(), c03Id(1), company));
  const plan = auroraPlanPacket();
  return [
    {id: "tabela-divida", methodId: "build-company-debt-table", packet: debtTable},
    {id: "covenant", methodId: "measure-covenant-headroom", packet: covenant},
    {id: "caixa-semanal", methodId: "project-weekly-cash", packet: weekly},
    {id: "linha-embalagem", methodId: "analyze-investment-project", packet: investment},
    {id: "projecao", methodId: "build-operating-projection", packet: projection},
    {id: "plano-fpa", methodId: "challenge-financial-projection", packet: challenge},
    {id: "recebiveis", methodId: "monetize-receivables-for-working-capital", packet: receivables},
    {id: "custo-relativo", methodId: "analyze-relative-debt-cost", packet: relativeCost},
    {id: "plano-2027", methodId: "evaluate-financing-paths", packet: plan},
  ] as const;
}
/** C12 with the December managerial reading that C54 adds; the variant writes the policy's EBITDA definition (regressions only). */
export function auroraCovenantPacket(variant: {policyDefinition?: string; adverseDebt?: string; policyMaximum?: string; unshownMeasurement?: true; baseAsManagerialContrast?: true; covenantMaximum?: string; adverseManagerial?: true;
  managerialDebt?: string; endWithoutAdjustment?: true} = {}) {
  const c = auroraCovenantBasis(variant.policyDefinition ? {policyDefinition: variant.policyDefinition} : {}), measurements = (c.input as unknown as {measurements: unknown[]}).measurements;
  // Regressions only: the adverse measurement of December 2027 with another debt.
  if (variant.adverseDebt) c.entries.find((e) => e.fieldPath.endsWith("measurement.dez27-adverso.debt"))!.value = {type: "number", value: variant.adverseDebt};
  const p = "measurement.dez26-gerencial.", sc = "base", num = (path: string, value: string) => c.contribute(p + path, "currency", {type: "number", value}, sc);
  measurements.push({id: "dez26-gerencial", label: "dez26-gerencial", role: "test", limitIds: ["politica"], scenario: sc, date: c.contribute(p + "date", "date", {type: "date", value: "2026-12-31"}, sc),
    debt: num("debt", variant.managerialDebt ?? "128.66666667"), cash: num("cash", "15.45720186"), reportedEbitda: num("reportedEbitda", "55.5"), adjustments: [], unrealizedEbitda: null});
  // Regressions only (review r40): the December 2027 base measurement registered without the lease adjustment (another definition).
  if (variant.endWithoutAdjustment) (measurements as {id: string; adjustments: unknown[]}[]).find((m) => m.id === "dez27-base")!.adjustments = [];
  // Regressions only: the board policy at another maximum, and a measurement against it that no reading shows (2,426x).
  if (variant.policyMaximum) for (const e of c.entries) if (/\.politica\.maximumRatio$|limit\.politica\.max/.test(e.fieldPath)) e.value = {type: "number", value: variant.policyMaximum};
  // Regressions only: the record under the id dez26-base becomes a managerial contrast (reported EBITDA, no adjustment,
  // 2,116x), and the contractual test of December 2026 is registered under another id (2,198x).
  if (variant.baseAsManagerialContrast) {
    const base = (measurements as {id: string; role: string; limitIds: string[]; scenario: string; adjustments: unknown[]}[]).find((m) => m.id === "dez26-base")!;
    Object.assign(base, {role: "contrast", limitIds: [], scenario: "gerencial_contraste", adjustments: []});
    c.entries.find((e) => e.fieldPath.endsWith("measurement.dez26-base.reportedEbitda"))!.value = {type: "number", value: "53.5"};
    const q = "measurement.dez26-contratual.", sc = "base", n3 = (path: string, value: string) => c.contribute(q + path, "currency", {type: "number", value}, sc);
    measurements.push({id: "dez26-contratual", label: "dez26-contratual", role: "test", limitIds: ["aditamento", "politica"], scenario: sc,
      date: c.contribute(q + "date", "date", {type: "date", value: "2026-12-31"}, sc), debt: n3("debt", "128.66666667"), cash: n3("cash", "15.45720186"), reportedEbitda: n3("reportedEbitda", "54.5"),
      adjustments: [{id: "arrendamentos", label: c.contribute(q + "adjustment.arrendamentos.label", "text", {type: "text", value: "Pagamentos de arrendamento"}, sc), amount: n3("adjustment.arrendamentos.amount", "-3")}],
      unrealizedEbitda: null});
  }
  // Regressions only: the contractual covenant at another maximum, and a managerial adverse measurement of December 2027
  // (reported EBITDA, no adjustment, 2,2229x) that tests only the board policy, beside the contractual test (2,3707x).
  if (variant.covenantMaximum) for (const e of c.entries) if (/limit\.aditamento\.maximumRatio$/.test(e.fieldPath)) e.value = {type: "number", value: variant.covenantMaximum};
  if (variant.adverseManagerial) {
    const q = "measurement.dez27-adverso-gerencial.", sc = "adverse", n4 = (path: string, value: string) => c.contribute(q + path, "currency", {type: "number", value}, sc);
    measurements.push({id: "dez27-adverso-gerencial", label: "dez27-adverso-gerencial", role: "test", limitIds: ["politica"], scenario: sc,
      date: c.contribute(q + "date", "date", {type: "date", value: "2027-12-31"}, sc), debt: n4("debt", "120"), cash: n4("cash", "13.05649438"), reportedEbitda: n4("reportedEbitda", "48.11"),
      adjustments: [], unrealizedEbitda: null});
  }
  if (variant.unshownMeasurement) {
    const q = "measurement.dez27-estresse.", s2 = "estresse_dez", n2 = (path: string, value: string) => c.contribute(q + path, "currency", {type: "number", value}, s2);
    measurements.push({id: "dez27-estresse", label: "dez27-estresse", role: "test", limitIds: ["politica"], scenario: s2, date: c.contribute(q + "date", "date", {type: "date", value: "2027-12-31"}, s2),
      debt: n2("debt", "121.3"), cash: n2("cash", "0"), reportedEbitda: n2("reportedEbitda", "50"), adjustments: [], unrealizedEbitda: null});
  }
  return prepareCovenantHeadroomPacket({schemaVersion: "covenant-headroom-packet-input.v1", question: "Como estamos contra os covenants?", headlineMeasurementId: variant.baseAsManagerialContrast ? "dez26-contratual" : "dez26-base", analysis: c.seal()});
}
/** C32 rebound to the shared company id. The variant relabels nothing: it makes the case called economy-4 keep the base
 * economy and carry the larger capex instead (regressions only), so a fixed text saying "economia menor" is false. */
export function auroraInvestmentPacket(variant: {economyCaseWithLargerCapexOnly?: true; capexFrontLoadedSmallerTotal?: true; baseLabel?: string;
  economyCaseDiscountRate?: {rate: string; withEconomy: boolean}; deferralHorizonYears?: number; deferralLastPeriodEnd?: string;
  exactDeferral?: "control" | "lastPeriodEconomy" | "adoptedTimes" | "startupCapital"; discountRate?: string; economyCaseFactor?: string; economyLaterLarger?: true} = {}) {
  const calibration = variant.economyCaseWithLargerCapexOnly ? c32WithMislabelledEconomy() : variant.capexFrontLoadedSmallerTotal ? c32WithFrontLoadedCapex()
    : variant.economyCaseDiscountRate ? c32WithEconomyAtRate(variant.economyCaseDiscountRate.rate, variant.economyCaseDiscountRate.withEconomy)
    : variant.deferralHorizonYears !== undefined ? c32WithDeferralHorizon(variant.deferralHorizonYears)
    : variant.deferralLastPeriodEnd !== undefined ? c32WithDeferralLastPeriod(variant.deferralLastPeriodEnd)
    : variant.exactDeferral !== undefined ? c32WithExactDeferral(variant.exactDeferral)
    : variant.economyCaseFactor !== undefined ? c32WithEconomyFactor(variant.economyCaseFactor) : variant.economyLaterLarger ? c32WithEconomyLaterLarger() : c32PacketInput(), from = id(1001);
  // Regressions only: every case discounted at another cost of capital.
  if (variant.discountRate) for (const e of calibration.basis.entries) if (e.fieldPath.endsWith(".valuation.discountRate")) e.value = {...e.value, value: variant.discountRate} as typeof e.value;
  // The same analysis registered for another project: only the base case's label changes.
  if (variant.baseLabel) calibration.input.cases[0]!.label = variant.baseLabel;
  for (const e of calibration.basis.entries) if (e.dimensions.entityId === from) e.dimensions.entityId = company;
  for (const x of calibration.input.cases) x.analysis.entityId = company;
  calibration.seal();
  return prepareInvestmentDecisionPacket(calibration.input);
}
/** The C32 cases with capex-120 rebuilt so the first year's capex is larger and the total smaller (12 and 5 against 10 and 8). */
function c32WithFrontLoadedCapex() {
  const f = c32PacketInput(), b = f.basis, base = f.input.cases[0]!.analysis;
  const millions = (v: string) => new Decimal(v).times(1000000).toFixed();
  const capex = b.overlay(base, "capex-antecipado", (c, i, years) => {
    i.project.money.growthCapexPaid = c("project.growthCapexPaid", "currency", {type: "list", value: years.map((y) => y === 2026 ? millions("12") : y === 2027 ? millions("5") : "0")});
  });
  f.input.cases[2] = {...f.input.cases[2]!, analysis: capex};
  return f;
}
/** The C32 cases with defer-12 deferred one year (capex and first operation) but its horizon extended by the given years
 * (regressions only; one year is the calibration). */
function c32WithDeferralHorizon(years: number) {
  const f = c32PacketInput(), b = f.basis;
  const deferred = b.addCase({scenario: "defer-12-h", deferYears: years, operationStart: "2028-05-01"});
  // Capex and the startup multipliers deferred one year only, on a horizon longer by the given years.
  const ys = Array.from({length: 11 + years}, (_, k) => 2026 + k);
  for (const e of b.entries) {
    if (e.dimensions.scenario !== "defer-12-h") continue;
    if (e.fieldPath.endsWith(".project.growthCapexPaid")) e.value = {type: "list", value: ys.map((y) => y === 2027 ? "10000000" : y === 2028 ? "8000000" : "0")};
    if (e.fieldPath.endsWith(".project.startup.retainedCapitalMultipliers")) e.value = {type: "list", value: ys.map((y) => y < 2028 || y === ys.at(-1) ? "0" : "1")};
  }
  f.input.cases[4] = {...f.input.cases[4]!, analysis: deferred};
  return f;
}
/** The C32 cases with defer-12 rebuilt as the base moved uniformly by one period, series by series by the declared
 * rules (regressions only), and one deviation at a time on top of it. */
function c32WithExactDeferral(kind: "control" | "lastPeriodEconomy" | "adoptedTimes" | "startupCapital") {
  const f = c32PacketInput(), b = f.basis, field = (p: string) => p.split(".").slice(2).join(".");
  const base = new Map(b.entries.filter((e) => e.dimensions.scenario === "base").map((e) => [field(e.fieldPath), e]));
  const ends = base.get("periodEnds")!.value.value as string[], step = 12, k = 1;
  for (const e of b.entries) {
    if (e.dimensions.scenario !== "defer-12") continue;
    const key = field(e.fieldPath), ref = base.get(key)!, rule = boardDeferralRules.series[key];
    if (rule) {
      const ys = ref.value.value as string[];
      e.value = {...e.value, value: Array.from({length: ys.length + k}, (_, t) => rule === "calendar" ? boardShiftDate(ends[0]!, t * step) : rule === "index" ? String(t)
        : t >= k ? ys[t - k]! : rule === "flow" || rule === "zero" ? "0" : ys[0]!)} as typeof e.value;
    } else if (boardDeferralRules.shiftedDates.includes(key)) {
      const v = ref.value.value;
      e.value = {...e.value, value: Array.isArray(v) ? v.map((x) => boardShiftDate(String(x), k * step)) : boardShiftDate(String(v), k * step)} as typeof e.value;
    } else e.value = structuredClone(ref.value);
    if (kind === "lastPeriodEconomy" && key === "project.annualAvoidedOperatingCost") {const xs = [...e.value.value as string[]]; xs[xs.length - 1] = new Decimal(xs.at(-1)!).plus(1000000).toFixed(); e.value = {...e.value, value: xs} as typeof e.value;}
    if (kind === "adoptedTimes" && key === "valuation.adoptedTimes") {const xs = [...e.value.value as string[]]; xs[xs.length - 1] = "11.5"; e.value = {...e.value, value: xs} as typeof e.value;}
    if (kind === "startupCapital" && key === "project.startup.inventoryDays") e.value = {...e.value, value: "30"} as typeof e.value;
  }
  return f;
}
/** The C32 cases with defer-12's one added period ending at another date (regressions only; 2037-12-31 is the
 * calibration): the horizon's end, every input's period end and the valuation time of that period move with it. */
function c32WithDeferralLastPeriod(end: string) {
  const f = c32PacketInput(), b = f.basis, deferred = f.input.cases[4]!.analysis as unknown as {endDate: string};
  const months = (Number(end.slice(0, 4)) - 2036) * 12 + Number(end.slice(5, 7)) - 12;
  for (const e of b.entries) {
    if (e.dimensions.scenario !== "defer-12") continue;
    if (e.dimensions.periodEnd === "2037-12-31") e.dimensions.periodEnd = end;
    if (e.fieldPath.endsWith(".periodEnds")) e.value = {type: "list", value: [...(e.value.value as string[]).slice(0, -1), end]};
    if (e.fieldPath.endsWith(".valuation.adoptedTimes")) e.value = {type: "list", value: [...(e.value.value as string[]).slice(0, -1), new Decimal(10).plus(new Decimal(months).div(12)).toFixed()]};
  }
  deferred.endDate = end;
  return f;
}
/** The C32 cases with economy-4's three operating series scaled by another factor (regressions only; 4/6 is the calibration). */
/** Regressions only (review r38): economy-4 with the avoided cost at 90% of the base, a fixed cost of 1 million and a
 * variable cost equal to the avoided cost less 1 million less E, E zero through 2032 and 22 million after: a net operating
 * economy of zero in the first years and 22 million a year later, larger than the base's at the end. */
function c32WithEconomyLaterLarger() {
  const f = c32PacketInput(), b = f.basis, base = f.input.cases[0]!.analysis;
  const P = Decimal.clone({precision: 60}), growth = (y: number) => new P("1.04").pow(Math.max(0, y - 2027));
  const series = (years: number[], g: (y: number) => Decimal) => ({type: "list" as const, value: years.map((y) => {const v = g(y); return v.eq(0) ? "0" : new P(v).times(1000000).toDecimalPlaces(8).toFixed();})});
  const avoided = (y: number) => growth(y).times(30).times("0.9"), extra = (y: number) => new P(y > 2032 ? 22 : 0);
  const economy = b.overlay(base, "economy-4-later-larger", (c, i, years) => {
    i.project.money.annualAvoidedOperatingCost = c("project.annualAvoidedOperatingCost", "currency", series(years, avoided));
    i.project.money.annualVariableOperatingCost = c("project.annualVariableOperatingCost", "currency", series(years, (y) => avoided(y).minus(1).minus(extra(y))));
    i.project.money.annualFixedOperatingCost = c("project.annualFixedOperatingCost", "currency", series(years, () => new P(1)));
  });
  f.input.cases[1] = {...f.input.cases[1]!, analysis: economy};
  return f;
}
function c32WithEconomyFactor(factor: string) {
  const f = c32PacketInput(), b = f.basis, base = f.input.cases[0]!.analysis;
  const P = Decimal.clone({precision: 60}), growth = (y: number) => new P("1.04").pow(Math.max(0, y - 2027)), k = new P(factor);
  const series = (years: number[], g: (y: number) => Decimal) => ({type: "list" as const, value: years.map((y) => {const v = g(y); return v.eq(0) ? "0" : new P(v).times(1000000).toDecimalPlaces(8).toFixed();})});
  const economy = b.overlay(base, "economy-4-factor", (c, i, years) => {
    i.project.money.annualAvoidedOperatingCost = c("project.annualAvoidedOperatingCost", "currency", series(years, (y) => growth(y).times(30).times(k)));
    i.project.money.annualVariableOperatingCost = c("project.annualVariableOperatingCost", "currency", series(years, (y) => growth(y).times("19.5").times(k)));
    i.project.money.annualFixedOperatingCost = c("project.annualFixedOperatingCost", "currency", series(years, (y) => growth(y).times("4.5").times(k)));
  });
  f.input.cases[1] = {...f.input.cases[1]!, analysis: economy};
  return f;
}
/** The C32 cases with economy-4 discounted at another rate (regressions only): with the smaller economy, or with the
 * base's operations unchanged (positive NPV at the base's 15%, negative at 30%). */
function c32WithEconomyAtRate(rate: string, withEconomy: boolean) {
  const f = c32PacketInput(), b = f.basis, base = f.input.cases[0]!.analysis;
  // The same arithmetic as the C32 calibration's economy case (precision 60, eight decimals).
  const P = Decimal.clone({precision: 60}), growth = (y: number) => new P("1.04").pow(Math.max(0, y - 2027)), factor = new P(4).div(6);
  const series = (years: number[], g: (y: number) => Decimal) => ({type: "list" as const, value: years.map((y) => {const v = g(y); return v.eq(0) ? "0" : new P(v).times(1000000).toDecimalPlaces(8).toFixed();})});
  const economy = b.overlay(base, "economy-4-rate", (c, i, years) => {
    if (withEconomy) {
      i.project.money.annualAvoidedOperatingCost = c("project.annualAvoidedOperatingCost", "currency", series(years, (y) => growth(y).times(30).times(factor)));
      i.project.money.annualVariableOperatingCost = c("project.annualVariableOperatingCost", "currency", series(years, (y) => growth(y).times("19.5").times(factor)));
      i.project.money.annualFixedOperatingCost = c("project.annualFixedOperatingCost", "currency", series(years, (y) => growth(y).times("4.5").times(factor)));
    }
    (i as unknown as {valuation: Record<string, unknown>}).valuation.discountRate = c("valuation.discountRate", "ratio", {type: "number", value: rate});
  });
  f.input.cases[1] = {...f.input.cases[1]!, analysis: economy};
  return f;
}
/** The C32 cases with economy-4 built as an overlay of capex only (economy unchanged, capex and depreciation 20% larger). */
function c32WithMislabelledEconomy() {
  const f = c32PacketInput(), b = f.basis, base = f.input.cases[0]!.analysis;
  const millions = (v: string) => new Decimal(v).times(1000000).toFixed();
  const series = (years: number[], value: (y: number) => string) => ({type: "list" as const, value: years.map((y) => {const v = value(y); return v === "0" ? "0" : millions(v);})});
  const economy = b.overlay(base, "economy-4-capex", (c, i, years) => {
    i.project.money.growthCapexPaid = c("project.growthCapexPaid", "currency", series(years, (y) => y === 2026 ? "12" : y === 2027 ? "9.6" : "0"));
    i.project.money.annualDepreciation = c("project.annualDepreciation", "currency", series(years, () => "2.16"));
  });
  f.input.cases[1] = {...f.input.cases[1]!, analysis: economy};
  return f;
}
/** C24 with the CFO's informed scenario. The variant (regressions only) makes the scenario prazo-60 lengthen inventory
 * days instead of the chains' receivable days, which stay as in the base. */
export function auroraProjectionPacket(variant: {inventoryInsteadOfReceivables?: true; shorterThanParentWithInventory?: true; shockFrom2028?: true; receivablesOnlyIn2027?: true; shockLabel?: string;
  periodEnds?: readonly string[]} = {}) {
  const b = operatingProjectionBasis({informed: true});
  // Regressions only: the second and third periods end mid-2027 and at the end of 2027 (a half-year or a quarter row).
  if (variant.periodEnds) {
    const end = variant.periodEnds.at(-1)!;
    for (const e of b.entries) {if (e.fieldPath.endsWith(".periodEnds")) e.value = {type: "list", value: [...variant.periodEnds]}; if (e.dimensions.periodEnd) e.dimensions.periodEnd = end;}
    (b.input as unknown as {endDate: string}).endDate = end;
  }
  // The same shock registered under another input: only the scenario's label changes.
  if (variant.shockLabel) (b.input as unknown as {scenarios: {id: string; label: string}[]}).scenarios.find((x) => x.id === "informado-trigo-4m")!.label = variant.shockLabel;
  if (variant.shockFrom2028) b.entries.find((e) => e.fieldPath.endsWith("scenario.informado-trigo-4m.shock.fromPeriodEnd"))!.value = {type: "date", value: "2028-12-31"};
  if (variant.receivablesOnlyIn2027) b.entries.find((e) => e.fieldPath.endsWith("scenario.prazo-60.override.receivableDays"))!.value = {type: "list", value: ["50", "60", "60"]};
  if (variant.shorterThanParentWithInventory) {
    // Receivable days of 55 against a parent scenario of 60, with longer inventory: the working-capital effect comes from inventory.
    const scenarios = (b.input as unknown as {scenarios: {id: string; basedOn: string; overrides: unknown[]}[]}).scenarios;
    const i = scenarios.findIndex((x) => x.id === "prazo-60"), scenario = scenarios[i]!;
    scenario.basedOn = "informado";
    b.entries.find((e) => e.fieldPath.endsWith("scenario.prazo-60.override.receivableDays"))!.value = {type: "list", value: ["55", "55", "55"]};
    scenario.overrides = [...scenario.overrides, {driver: "inventoryDays", values: b.contribute("scenario.prazo-60.override.inventoryDays", "days", {type: "list", value: ["60", "60", "60"]}, "prazo-60"),
        origin: b.contribute("scenario.prazo-60.override.inventoryDays.origin", "origin", {type: "text", value: "house"}, "prazo-60")}];
    scenarios.splice(i, 1); scenarios.push(scenario);
  }
  if (variant.inventoryInsteadOfReceivables) {
    const scenario = (b.input as unknown as {scenarios: {id: string; overrides: unknown[]}[]}).scenarios.find((x) => x.id === "prazo-60")!;
    scenario.overrides = [{driver: "inventoryDays", values: b.contribute("scenario.prazo-60.override.inventoryDays", "days", {type: "list", value: ["55", "55", "55"]}, "prazo-60"),
      origin: b.contribute("scenario.prazo-60.override.inventoryDays.origin", "origin", {type: "text", value: "house"}, "prazo-60")}];
  }
  return prepareOperatingProjectionPacket({schemaVersion: "operating-projection-packet-input.v1",
    question: "Não temos projeção pronta. Ajuda a construir uma para discutir o financiamento.", analysis: b.seal()});
}
/** C18. The variant (regressions only) keeps the line in the case without the line and takes the customer receipts out of it instead. */
export function auroraWeeklyPacket(variant: {lineKeptReceiptsMissing?: true} = {}) {
  const b = auroraWeeklyCashBasis();
  if (variant.lineKeptReceiptsMissing) {
    const c = (b.input as unknown as {cases: {id: string; streamIds: string[]}[]}).cases.find((x) => x.id === "sem-linha")!;
    c.streamIds = [...c.streamIds.filter((x) => x !== "recebimentos"), "linha-17"];
  }
  return prepareWeeklyCashPacket({schemaVersion: "weekly-cash-packet-input.v1", question: "Como fica o caixa até dezembro e o que vence?", analysis: b.seal()});
}
/** C32's financing plan. The variant (regressions only) gives the deferred project variant the schedule of the one that goes on
 * (same disbursement and same start-up working capital), keeping only its later EBITDA. */
export function auroraPlanPacket(variant: {deferralWithoutLaterSchedule?: true; keptDebtWithNewLoan?: true; deferralWithOperationOnTime?: true; extensionWithExtraPrepayment?: true;
  amendmentWithoutExtension?: true; developmentLoanAsBank?: true; deferralOnlyCapexAndEbitda?: true; projectNamed?: string;
  deferredCapexFactor?: number; longInstrumentLabel?: string; alternativeEndingIn2034?: true; giroPaidInPeriod?: number; longIssueAmount?: string; shorterProfile?: true; eighthPath?: "other" | "recommended"} = {}) {
  const k = auroraCapitalPathsKernel();
  // Regressions only: the horizon after the plan reaches 2034 and the tested alternative profile pays its last third in 2034.
  if (variant.alternativeEndingIn2034) {
    const kk = k as unknown as {index: {afterHorizon: {year: number; annualRate: string}[]}; postHorizon: Record<string, unknown>; instruments: Record<string, unknown>[]};
    kk.index.afterHorizon = [...kk.index.afterHorizon, {year: 2034, annualRate: "0.12"}];
    for (const [key, v] of Object.entries(kk.postHorizon)) kk.postHorizon[key] = key === "years" ? [...v as number[], 2034] : [...v as string[], (v as string[]).at(-1)!];
    const long = kk.instruments.find((x) => x.id === "debenture-80")! as {afterHorizon: {shares: {year: number; share: string}[]; alternatives: {id: string; label: string; shares: {year: number; share: string}[]}[]}};
    const third = long.afterHorizon.alternatives[0]!.shares[0]!.share;
    long.afterHorizon.alternatives = [{id: "cinco-anos", label: "Amortização de 2029 a 2034", shares: [{year: 2029, share: third}, {year: 2030, share: third}, {year: 2034, share: third}]}];
  }
  // Regressions only: the deferred variant's capex multiplied (a deferral that also changes magnitude).
  if (variant.deferredCapexFactor) {
    const later = k.projectVariants.find((v) => v.id === "adiar-12") as unknown as {effects: Record<string, string[]>};
    later.effects = {...later.effects, growthCapex: later.effects.growthCapex!.map((x) => new Decimal(x).times(variant.deferredCapexFactor!).toFixed())};
  }
  // Regressions only: the recommended long instrument registered under another label (its species).
  if (variant.longInstrumentLabel) Object.assign((k as unknown as {instruments: Record<string, unknown>[]}).instruments.find((x) => x.id === "debenture-80")!, {label: variant.longInstrumentLabel});
  // The same plan registered for another project: only the project variants' labels change.
  if (variant.projectNamed) for (const v of k.projectVariants as unknown as {label: string}[]) v.label = v.label.replace(/linha de embalagem/i, variant.projectNamed);
  const instrument = (id: string) => (k as unknown as {instruments: Record<string, unknown>[]}).instruments.find((x) => x.id === id)!;
  if (variant.amendmentWithoutExtension) {
    const original = instrument("ccb-bradesco"), amended = instrument("ccb-bradesco-aditada");
    Object.assign(amended, {finalPaymentDate: original.finalPaymentDate, principal: original.principal, afterHorizon: {kind: "none"}});
  }
  if (variant.developmentLoanAsBank) Object.assign(instrument("finame-linha"), {lenderKind: "bank", label: "CCB para uso livre"});
  if (variant.deferralOnlyCapexAndEbitda) {
    const goOn = k.projectVariants.find((v) => v.id === "seguir") as unknown as {effects: Record<string, string[]>}, later = k.projectVariants.find((v) => v.id === "adiar-12") as unknown as {effects: Record<string, string[]>};
    later.effects = {...later.effects, depreciation: goOn.effects.depreciation!, maintenanceCapex: goOn.effects.maintenanceCapex!, startupWorkingCapitalCashFlow: goOn.effects.startupWorkingCapitalCashFlow!};
  }
  const path = (id: string) => (k as unknown as {paths: {id: string; instrumentIds: string[]; prepayments: {instrumentId: string; periodEnd: string}[]}[]}).paths.find((x) => x.id === id)!;
  // Regressions only: the recommended debenture issued at another amount (the demand), draws and issue fee in proportion.
  if (variant.longIssueAmount !== undefined) {
    const long = instrument("debenture-80") as {draws: string[]; charges: {amount: string}[]};
    const scale = new Decimal(variant.longIssueAmount).div(80);
    long.draws = long.draws.map((x) => new Decimal(x).times(scale).toFixed());
    long.charges = long.charges.map((c) => ({...c, amount: new Decimal(c.amount).times(scale).toFixed()}));
  }
  // Regressions only (review r43): an eighth path. "other": a three-year bank loan without the project; "recommended": the
  // same moves as the recommended path with a revised debenture (the original repriced at 4%), so the eighth is the only one recommended.
  if (variant.eighthPath) {
    const kk = k as unknown as {paths: {id: string; label: string; instrumentIds: string[]; projectVariantId?: string}[]; instruments: {id: string; label: string; rate: {kind: string; spreads?: string[]}}[]};
    if (variant.eighthPath === "other") {
      const from = kk.paths.find((p) => p.id === "ccb-tres-anos")!;
      kk.paths.push({...structuredClone(from), id: "credito-sem-projeto", label: "Crédito bancário de trinta milhões sem o projeto", projectVariantId: "sem-linha"});
    } else {
      const previous = kk.instruments.find((i) => i.id === "debenture-80")!, improved = structuredClone(previous);
      improved.id = "debenture-revista"; improved.label = "Debênture"; kk.instruments.push(improved);
      if (previous.rate.kind === "index_plus_spread") previous.rate.spreads = previous.rate.spreads!.map(() => "0.04");
      const from = kk.paths.find((p) => p.id === "sem-linha-debenture")!;
      kk.paths.push({...structuredClone(from), id: "emissao-revista", label: "Emissão revista sem o projeto", instrumentIds: from.instrumentIds.map((x) => x === "debenture-80" ? "debenture-revista" : x)});
    }
  }
  // Regressions only (review r40): a second tested profile of the debenture, amortized entirely in 2029, shorter than the five-year one.
  if (variant.shorterProfile) {
    const long = instrument("debenture-80") as {afterHorizon: {alternatives: {id: string; label: string; shares: {year: number; share: string}[]}[]}};
    long.afterHorizon.alternatives = [...long.afterHorizon.alternatives, {id: "um-ano", label: "Amortização em 2029", shares: [{year: 2029, share: "1"}]}];
  }
  // Regressions only: the 17 million crop loan repaid in another quarter (its registered term changes; index 2 is the calibration).
  if (variant.giroPaidInPeriod !== undefined) Object.assign(instrument("giro-4t26-17"), {principal: Array.from({length: 10}, (_, i) => i === variant.giroPaidInPeriod ? "17" : "0")});
  if (variant.keptDebtWithNewLoan) path("manter").instrumentIds = [...path("manter").instrumentIds, "giro-4t26-17"];
  if (variant.extensionWithExtraPrepayment) path("alongar-bradesco").prepayments = [{instrumentId: "debenture-2021", periodEnd: "2027-03-31"}];
  if (variant.deferralWithOperationOnTime) {
    const goOn = k.projectVariants.find((v) => v.id === "seguir") as unknown as {effects: Record<string, string[]>}, later = k.projectVariants.find((v) => v.id === "adiar-12") as unknown as {effects: Record<string, string[]>};
    later.effects = {...later.effects, ebitda: goOn.effects.ebitda!, depreciation: goOn.effects.depreciation!, maintenanceCapex: goOn.effects.maintenanceCapex!};
  }
  if (variant.deferralWithoutLaterSchedule) {
    const goOn = k.projectVariants.find((v) => v.id === "seguir")!, later = k.projectVariants.find((v) => v.id === "adiar-12")!;
    (later as {effects: Record<string, unknown>}).effects = {...(later as {effects: Record<string, unknown>}).effects,
      growthCapex: (goOn as {effects: {growthCapex: string[]}}).effects.growthCapex, startupWorkingCapitalCashFlow: (goOn as {effects: {startupWorkingCapitalCashFlow: string[]}}).effects.startupWorkingCapitalCashFlow};
  }
  return prepareCapitalPathsPacket(auroraCapitalPathsBasis(k).seal());
}
/** C35 with retailer A's own program (turn two of C35). Variants for the regressions only: a sublimit of the program per
 * debtor below the chain's balance, or the chain's contract registered as assignable. */
export function auroraReceivablesPacket(variant: {sublimitA?: string; contractA?: "assignable" | "prohibited_without_consent"; debtorRenamed?: true; jointProgram?: true;
  needPeak?: string; cheapBankDiscount?: true; thirdProgram?: true} = {}) {
  const k = auroraReceivablesFunding(), anchor = k.options[0]!;
  // Regressions only: a larger seasonal peak, and a bank discount cheap enough that the plan uses it after the programs.
  if (variant.needPeak) (k as {needPeak: string}).needPeak = variant.needPeak;
  if (variant.cheapBankDiscount) Object.assign(k.options.find((o) => o.id === "desconto-bancario")!, {rate: {basis: "di_plus", rate: "0.016"}, iofDaily: "0", iofAdditional: "0"});
  // Regressions only: the second program is linked to rede A and rede B together (a joint program, not rede A's own).
  const anchored = variant.jointProgram ? ["rede-a", "rede-b"] : ["rede-a"];
  // Regressions only: rede E with its own program, after the two programs of the calibration.
  if (variant.thirdProgram) (k.options as unknown[]).push({...anchor, id: "risco-sacado-e", label: "Risco sacado da rede E", indicative: false,
    eligibility: {...anchor.eligibility!, anchorItemIds: ["rede-e"]}, rate: {basis: "di_plus" as const, rate: "0.016"}, leadDaysMin: null, leadDaysMax: null});
  const basis = auroraReceivablesFundingBasis({...k, items: k.items.map((i) => i.id === "rede-a" || (variant.thirdProgram && i.id === "rede-e") ? {...i, anchorProgram: "active" as const, ...i.id === "rede-a" && variant.contractA ? {contract: variant.contractA} : {}} : i),
      options: [...k.options, {...anchor, id: "risco-sacado-a", label: variant.jointProgram ? "Risco sacado das redes A e B" : "Risco sacado da rede A",
        eligibility: {...anchor.eligibility!, anchorItemIds: anchored, ...variant.sublimitA ? {sublimitPerDebtor: variant.sublimitA} : {}},
        rate: {basis: "di_plus" as const, rate: "0.015"}, leadDaysMin: null, leadDaysMax: null}]});
  // Regressions only: another debtor (Rede Z) behind the old item and option identifiers.
  if (variant.debtorRenamed) for (const e of basis.entries) {
    if (e.fieldPath.endsWith("item.rede-a.debtorKey")) e.value = {type: "text", value: "rede-z"};
    if (e.fieldPath.endsWith("item.rede-a.label")) e.value = {type: "text", value: "Rede Z"};
  }
  return prepareReceivablesFundingPacket({schemaVersion: "receivables-funding-packet-input.v1",
    question: "Tenho uns 60 milhões de recebíveis. Dá para usar isso para financiar a safra em vez da linha do banco?", analysis: basis.seal()});
}
/** The debt table with the credit line relabelled as a restricted machinery line (same identifier; regressions only). */
export function debtTableWithCreditLineLabel(label: string) {
  const b = auroraDebtTableBasis();
  const entry = b.entries.find((e) => e.fieldPath.endsWith("credit_line.conta-garantida.label"));
  if (!entry) throw new Error("credit line label not found");
  entry.value = {type: "text", value: label};
  return prepareDebtTablePacket({schemaVersion: "debt-table-packet-input.v1", question: "Monta a tabela de dívida com tudo que temos.", analysis: b.seal()}) as unknown as Record<string, unknown>;
}
let cached: ReturnType<typeof buildSources> | null = null;
let replaced: Record<string, Record<string, unknown>> = {};
let added: {id: string; methodId: string; packet: Record<string, unknown>}[] = [];
/** The reviewed results, computed once per process and handed out as copies. */
export function auroraBoardSources(): {id: string; methodId: string; packet: Record<string, unknown>}[] {
  cached ??= buildSources();
  return [...cached.map((s) => ({id: s.id, methodId: s.methodId, packet: structuredClone(replaced[s.id] ?? s.packet) as unknown as Record<string, unknown>})),
    ...added.map((s) => ({...s, packet: structuredClone(s.packet)}))];
}
/** Runs a case with a second reviewed result of a method already in the material, named in the basis beside the first. */
export function withExtraBoardSource<T>(source: {id: string; methodId: string; packet: Record<string, unknown>}, run: () => T): T {
  added = [...added, source];
  try {return run();} finally {added = added.filter((x) => x !== source);}
}
/** The covenant test executed again by its own method with the adverse debt of December 2027 raised (same company, currency and version). */
export function covenantWithAdverseDebt(debt: string) {
  const c = auroraCovenantBasis();
  const entry = c.entries.find((e) => e.fieldPath.endsWith("measurement.dez27-adverso.debt"));
  if (!entry) throw new Error("adverse debt entry not found");
  entry.value = {type: "number", value: debt};
  return prepareCovenantHeadroomPacket({schemaVersion: "covenant-headroom-packet-input.v1", question: "Como estamos contra os covenants?", headlineMeasurementId: "dez26-base",
    analysis: c.seal()}) as unknown as Record<string, unknown>;
}
/** Runs a case with one reviewed result replaced by another execution of its method; the basis names the new one. */
export function withBoardSource<T>(id: string, packet: Record<string, unknown>, run: () => T): T {
  replaced = {...replaced, [id]: packet};
  try {return run();} finally {const {[id]: _gone, ...rest} = replaced; replaced = rest;}
}
/** The debt table executed by its own method with the largest creditor adopted under another name. */
export function debtTableWithCreditor(name: string, registered = "Debenturistas") {
  const b = auroraDebtTableBasis();
  const entry = b.entries.find((e) => e.fieldPath.endsWith(".creditor") && (e.value as {value?: unknown}).value === registered);
  if (!entry) throw new Error("creditor entry not found");
  entry.value = {type: "text", value: name};
  return prepareDebtTablePacket({schemaVersion: "debt-table-packet-input.v1", question: "Monta a tabela de dívida com tudo que temos.", analysis: b.seal()}) as unknown as Record<string, unknown>;
}

/** The debt table with one instrument's principal changed (regressions only; the method recomputes everything else). */
/** The debt table executed by its own method at another reference date (its twelve-month horizon moves with it). */
export function debtTableAtReferenceDate(date: string) {
  const b = auroraDebtTableBasis();
  // The basis opens at the reference date: the context and every adopted entry's period start move together.
  b.context.openingDate = date; (b.input as {openingDate: string}).openingDate = date;
  for (const e of b.entries) e.dimensions = {...e.dimensions, periodStart: date};
  return prepareDebtTablePacket({schemaVersion: "debt-table-packet-input.v1", question: "Monta a tabela de dívida com tudo que temos.", analysis: b.seal()}) as unknown as Record<string, unknown>;
}
export function debtTableWithPrincipal(instrumentId: string, principal: string) {
  const b = auroraDebtTableBasis();
  for (const e of b.entries) if (e.fieldPath.endsWith(`instrument.${instrumentId}.principal`)) e.value = {type: "number", value: principal};
  return prepareDebtTablePacket({schemaVersion: "debt-table-packet-input.v1", question: "Monta a tabela de dívida com tudo que temos.", analysis: b.seal()}) as unknown as Record<string, unknown>;
}

/** [source, path, decimals or date format, stated]; the unit, scale and periodicity come from the field registry. */
type Reading = [string, string, string, string?];
/** The seven paths the plan evaluates (the status quo and the candidates, by rank), with what the board compares:
 * minimum cash, worst leverage, financing cost and net debt to 2028, and execution (inside every gate, consent). */
export const auroraPaths: [string, string, string, string, string][] = [
  ["sem-linha-debenture", "15", "2.20", "49", "79"], ["adiar-linha", "-60", "2.21", "31", "89"], ["debenture-com-linha", "15", "2.40", "57", "102"],
  ["manter", "-79", "2.38", "25", "81"], ["ccb-tres-anos", "-65", "2.41", "35", "87"], ["alongar-com-banco", "12", "2.40", "57", "102"], ["alongar-bradesco", "-11", "2.40", "44", "93"]];
function auroraPathReadings(): Record<string, Reading> {
  return Object.fromEntries(auroraPaths.flatMap(([id, cash, leverage, cost, net]) => {
    const at = `readings.paths[id=${id}].`;
    return [[`${id}-cash`, ["plano-2027", at + "minimumCash.amount", "0", cash]],
      [`${id}-lev`, ["plano-2027", at + "worstLeverage", "2", leverage]], [`${id}-cost`, ["plano-2027", at + "horizonFinancingCost", "0", cost]],
      [`${id}-net`, ["plano-2027", at + "netDebtAtHorizon", "0", net]], [`${id}-ok`, ["plano-2027", at + "eligible", "-"]],
      [`${id}-consent`, ["plano-2027", at + "consentRequired", "-"]]] as [string, Reading][];
  }));
}
/** Each number as a reading of a reviewed result: [source, path, unit, scale, places, stated]. */
export const auroraBoardReadings: Record<string, Reading> = {
  "divida-total": ["tabela-divida", "result.table.reconciliation.principal", "0", "130"],
  "principal-2027": ["tabela-divida", "result.table.profile.scheduleByYear[year=2027].principal", "0", "77"],
  "share-12m": ["tabela-divida", "result.table.profile.dueWithinTwelveMonthsShare", "0", "28"],
  "wal": ["tabela-divida", "result.table.profile.weightedAverageLifeYears", "1", "1.5"],
  "largest-creditor": ["tabela-divida", "result.table.profile.largestCreditor.creditor", "-"],
  "bradesco-creditor": ["tabela-divida", "result.table.rows[id=ccb-bradesco].creditor", "-"],
  "largest-share": ["tabela-divida", "result.table.profile.largestCreditor.share", "0", "46"],
  "basket": ["tabela-divida", "result.table.negativePledgeBaskets[holderId=debenture-1].basket", "0", "15"],
  "basket-used": ["tabela-divida", "result.table.negativePledgeBaskets[holderId=debenture-1].occupied", "0", "12"],
  "basket-free": ["tabela-divida", "result.table.negativePledgeBaskets[holderId=debenture-1].remaining", "0", "3"],
  "bradesco-maturity": ["tabela-divida", "result.table.rows[id=ccb-bradesco].finalPayment", "month_long", "2027-09-15"],
  "cov-limit": ["covenant", "result.headroom.limits[id=aditamento].maximumRatio", "1", "3.0"],
  "policy-limit": ["covenant", "result.headroom.limits[id=politica].maximumRatio", "1", "2.5"],
  "lev-dez26": ["covenant", "result.headroom.measurements[id=dez26-base].ratio", "1", "2.2"],
  "lev-dez27": ["covenant", "result.headroom.measurements[id=dez27-base].ratio", "2", "1.85"],
  "lev-adv27": ["covenant", "result.headroom.measurements[id=dez27-adverso].ratio", "2", "2.37"],
  "ebitda-adv27": ["covenant", "result.headroom.measurements[id=dez27-adverso].reportedEbitda", "1", "48.1"],
  "lev-ger-dez26": ["covenant", "result.headroom.measurements[id=dez26-gerencial].ratio", "1", "2.0"],
  "min-cash": ["caixa-semanal", "result.weekly.minimumCash", "0", "15"],
  "sem-linha-min": ["caixa-semanal", "readings.sensitivities[caseId=sem-linha].minimum", "1", "-9.5"],
  "sem-linha-week": ["caixa-semanal", "readings.sensitivities[caseId=sem-linha].weekStart", "day_long", "2026-12-21"],
  "tight-week": ["caixa-semanal", "readings.tightestWeek.weekStart", "day_long", "2026-12-21"],
  "irr": ["linha-embalagem", "comparison.metrics[caseId=base].annualIrr", "0", "16"],
  "wacc": ["linha-embalagem", "comparison.metrics[caseId=base].discountRate", "0", "15"],
  "npv": ["linha-embalagem", "comparison.metrics[caseId=base].netPresentValue", "1", "0.7"],
  "payback": ["linha-embalagem", "comparison.metrics[caseId=base].paybackYears", "0", "6"],
  "peak-need": ["linha-embalagem", "comparison.metrics[caseId=base].peakCumulativeCashNeed.amount", "1", "-21.7"],
  "peak-date": ["linha-embalagem", "comparison.metrics[caseId=base].peakCumulativeCashNeed.periodEndDate", "month_long", "2027-12-31"],
  "npv-economy": ["linha-embalagem", "comparison.metrics[caseId=economy-4].netPresentValue", "1", "-6.4"],
  "npv-capex": ["linha-embalagem", "comparison.metrics[caseId=capex-120].netPresentValue", "1", "-2.1"],
  "npv-slow": ["linha-embalagem", "comparison.metrics[caseId=slower-start].netPresentValue", "1", "-1.0"],
  "npv-defer": ["linha-embalagem", "comparison.metrics[caseId=defer-12].netPresentValue", "1", "1.4"],
  "irr-defer": ["linha-embalagem", "comparison.metrics[caseId=defer-12].annualIrr", "0", "17"],
  "wheat-shock": ["projecao", "result.projection.projection.scenarios[id=informado-trigo-4m].inputCostShock.rate", "0", "15"],
  "wheat-lag": ["projecao", "result.projection.projection.scenarios[id=informado-trigo-4m].inputCostShock.passThroughLagMonths", "0", "4"],
  "ebitda-wheat": ["projecao", "readings.projected.scenarios[id=informado-trigo-4m].rows[periodId=2027-12-31].ebitda", "1", "52.6"],
  "wc-60": ["projecao", "readings.projected.scenarios[id=prazo-60].rows[periodId=2026-12-31].effects.changeInWorkingCapital", "0", "12"],
  "fpa-2028": ["plano-fpa", "readings.gap.plan.ebitda", "0", "86"],
  "ref-2028": ["plano-fpa", "readings.gap.reference.ebitda", "0", "59"],
  "programs": ["recebiveis", "readings.plan[optionId=risco-sacado-a].cumulative", "1", "23.5"],
  "spread-b": ["recebiveis", "readings.options[id=risco-sacado-b].spreadOverDi", "1", "1.2"],
  "spread-a": ["recebiveis", "readings.options[id=risco-sacado-a].spreadOverDi", "1", "1.5"],
  "rede-a": ["recebiveis", "result.funding.portfolio.items[itemId=rede-a].amount", "1", "19.8"],
  "rede-a-retained": ["recebiveis", "result.funding.options[id=risco-sacado-a].byItem[itemId=rede-a].retained", "1", "19.8"],
  "need-peak": ["recebiveis", "result.funding.need.peak", "0", "25"],
  "carteira": ["recebiveis", "readings.gross", "0", "62"],
  "gap-bps": ["custo-relativo", "decomposition.grossBps", "0", "125"],
  "date-bps": ["custo-relativo", "result.bridge.steps[family=pricing_date].bps", "0", "60"],
  "known-bps": ["custo-relativo", "result.bridge.knownAdjustmentsBps", "0", "70"],
  "unexplained-bps": ["custo-relativo", "result.bridge.unexplainedAfterKnownAdjustmentsBps", "0", "55"],
  "rating-low": ["custo-relativo", "levers[role=rating&scenario=low].netOfKnownCosts", "2", "-0.17"],
  "rating-high": ["custo-relativo", "levers[role=rating&scenario=high].netOfKnownCosts", "2", "0.03"],
  "cl-creditor": ["tabela-divida", "result.table.creditLines[id=conta-garantida].creditor", "-"],
  "cl-unused": ["tabela-divida", "result.table.creditLines[id=conta-garantida].unused", "0", "10"],
  "debenture-creditor": ["tabela-divida", "result.table.rows[id=debenture-1].creditor", "-"],
  "rede-a-label": ["recebiveis", "result.funding.portfolio.items[itemId=rede-a].label", "-"],
  "project-label": ["linha-embalagem", "cases[id=base].label", "-"],
  "wheat-label": ["projecao", "result.projection.projection.scenarios[id=informado-trigo-4m].label", "-"],
  "crop-question": ["recebiveis", "question", "-"],
  "cash-end-2027": ["plano-2027", "result.evaluation.paths[id=manter].closingAvailableByPeriod[periodId=2027-12-31].closingAvailable", "0", "-79"],
  "service-2027": ["plano-2027", "result.evaluation.paths[id=manter].debtServiceByYear[year=2027].service", "0", "90"],
  "available-2027": ["plano-2027", "result.evaluation.paths[id=manter].debtServiceByYear[year=2027].availableForService", "0", "36"],
  "n-paths": ["plano-2027", "readings.horizon.candidatePaths", "0", "7"],
  "debenture-amount": ["plano-2027", "readings.recommendation.longInstrument.issueTarget", "0", "80"],
  "issue-floor": ["plano-2027", "readings.recommendation.longInstrument.issueFloorInsideGates", "2", "74.44"],
  "debenture-term": ["plano-2027", "readings.recommendation.longInstrument.termYears", "0", "7"],
  "deb-cost-low": ["plano-2027", "readings.recommendation.longInstrument.equivalentSpread", "2", "3.46"],
  "deb-cost-high": ["plano-2027", "readings.recommendation.longInstrument.equivalentSpreadAtCondition", "2", "3.56"],
  "amort-first": ["plano-2027", "readings.recommendation.longInstrument.firstAmortizationYear", "year", "2029"],
  "amort-last": ["plano-2027", "readings.recommendation.longInstrument.lastAmortizationYear", "year", "2033"],
  "bradesco-gap": ["plano-2027", "result.evaluation.paths[id=bradesco-sem-linha].shortfallVsPolicyMinimum", "0", "18"],
  "five-year-amort": ["plano-2027", "result.evaluation.paths[id=sem-linha-debenture].amortizationTests[profileId=cinco-anos].years[year=2029].scheduledAmortization", "0", "33"],
  "five-year-available": ["plano-2027", "result.evaluation.paths[id=sem-linha-debenture].amortizationTests[profileId=cinco-anos].years[year=2029].availableAfterInterest", "0", "24"],
  "alt-amount": ["plano-2027", "readings.alternative.issueTarget", "0", "70"],
  "cost-2028": ["plano-2027", "readings.recommendation.horizonFinancingCost", "0", "49"],
  "net-debt-2028": ["plano-2027", "readings.recommendation.netDebtAtHorizon", "0", "79"],
  "year-2026": ["tabela-divida", "result.table.profile.scheduleByYear[year=2026].year", "year", "2026"],
  "year-2027": ["tabela-divida", "result.table.profile.scheduleByYear[year=2027].year", "year", "2027"],
  "year-2028": ["tabela-divida", "result.table.profile.scheduleByYear[year=2028].year", "year", "2028"],
  "dez26-date": ["covenant", "result.headroom.measurements[id=dez26-base].date", "month_long", "2026-12-31"],
  "dez27-date": ["covenant", "result.headroom.measurements[id=dez27-base].date", "month_long", "2027-12-31"],
  "horizon-12m": ["tabela-divida", "result.table.profile.twelveMonthHorizon", "month_long", "2027-06-30"],
  ...auroraPathReadings(),
};
/** Numbers the material needs and no reviewed result supplies: [required method, the exact field it stands for, reason]. */
export const auroraBoardPending: Record<string, [string, string, string]> = {
  "stages-npv": ["analyze-investment-project", "comparison.metrics[caseId=staged].netPresentValue", "note.case_not_reviewed"],
  "cl-terms": ["build-company-debt-table", "result.table.creditLines[id=conta-garantida].terms", "note.credit_line_terms_not_registered"],
};
export const auroraMaterialFigures = ["principal-2027", "cash-end-2027", "debenture-amount", "deb-cost-low", "deb-cost-high", "bradesco-gap", "share-12m", "min-cash", "sem-linha-min", "cov-limit", "policy-limit", "irr", "wacc", "npv", "payback", "peak-need",
  "npv-economy", "npv-capex", "npv-slow", "programs", "lev-dez26", "lev-adv27", "ebitda-wheat", "wc-60"];
export const auroraIndicative = {figures: ["programs", "spread-a"], reason: "note.program_indicative"};

export type BoardTurn = 1 | 2 | 3;
/** The case of ficha C47 at each turn: the request (turn 1), the template, the time and what the board has seen
 * (turn 2) and the chair's request to withdraw the recommendation on the packaging line (turn 3). */
export function auroraBoardCase(turn: BoardTurn) {
  return {
    askedOn: "2026-09-28", meetingDate: "2026-09-30", leadDays: "1", minutesPerPage: "3",
    agendaMinutes: turn === 1 ? null : "45", nextMeetingDate: null as string | null, template: turn === 1 ? null : "conselho-jun26.pptx", outlineConfirmed: turn !== 1,
    topics: [{id: "linha-embalagem", label: "topic.packaging_review", seen: turn === 1 ? null : false}, {id: "safra", label: "topic.crop_financing", seen: false as boolean | null}],
    deliberations: [
      {id: "linha", topicId: "linha-embalagem" as string | null, title: "delib.packaging_line|projeto=project-label", subject: "delib.packaging_line.subject|projeto=project-label",
        recommendation: "delib.packaging_line.wait" as string | null, authority: "board" as const, authorityBasis: null as string | null,
        deadlines: [{id: "aviso", date: "2026-10-02", action: "delib.action.supplier_notice"}]},
      {id: "vencimentos", topicId: "vencimentos", title: "delib.maturities|ano=year-2027", subject: "delib.maturities.subject|ano=year-2027",
        recommendation: "delib.maturities.sounding|valor=debenture-amount|prazo=debenture-term",
        authority: "board" as const, authorityBasis: null, deadlines: [{id: "sondagem", date: "2026-10-31", action: "delib.action.finish_sounding"}, {id: "rota", date: "2026-11-15", action: "delib.action.decide_route"}]},
      {id: "politica", topicId: "politica", title: "delib.policy", subject: "delib.policy.definition|limite=policy-limit", recommendation: null,
        authority: "board" as const, authorityBasis: null, deadlines: []},
      {id: "safra", topicId: "safra", title: "delib.crop|ano=year-2026", subject: "delib.crop.subject|ano=year-2026", recommendation: "delib.crop.programs",
        authority: "board" as const, authorityBasis: null, deadlines: [{id: "adesao", date: "2026-10-16", action: "delib.action.join_programs"}]},
    ],
    pages: [
      {id: "decisoes", role: "decisions", topicId: "geral", title: "page.decisions", lines: [], recommendation: null, options: []},
      {id: "divida", role: "situation", topicId: "geral", title: "situation.debt_total|total=divida-total|ano=year-2027", recommendation: null, options: [],
        lines: ["situation.debt_maturity|principal=principal-2027|ano=year-2027|parcela=share-12m|horizonte=horizon-12m",
          "situation.debt_profile|prazo=wal|credor=largest-creditor|participacao=largest-share"]},
      {id: "caixa", role: "situation", topicId: "geral", title: "situation.cash_shortfall|semana=tight-week|saldo=cash-end-2027|ano=year-2027", recommendation: null, options: [],
        lines: ["situation.cash_without_line|semana=sem-linha-week|saldo=sem-linha-min|minimo=min-cash", "situation.debt_service|ano=year-2027|servico=service-2027|disponivel=available-2027"]},
      {id: "escritura", role: "constraint", topicId: "geral", title: "constraint.indenture_basket|titular=debenture-creditor|saldo=basket-free", recommendation: null, options: [],
        lines: ["constraint.basket_usage|cesta=basket|ocupado=basket-used|credor=bradesco-creditor", "constraint.covenant_policy|covenant=cov-limit|politica=policy-limit"]},
      {id: "linha", role: "topic", topicId: "linha-embalagem", title: "topic.project_return|retorno=irr|custo=wacc|projeto=project-label",
        lines: ["topic.project_value|retorno=irr|custo=wacc|vpl=npv", "topic.project_payback|payback=payback|pico=peak-need|data=peak-date",
          "topic.project_sensitivities|vpl_economia=npv-economy|vpl_capex=npv-capex|vpl_partida=npv-slow", "topic.project_strategic_reason|motivo=informed:motivo-estrategico"],
        recommendation: "topic.project_wait_quotes_registered|vpl=npv-defer|retorno=irr-defer" as string | null,
        options: ["option.go_now|vpl=npv|retorno=irr", "option.staged|vpl=stages-npv", "option.wait_quotes_registered|vpl=npv-defer|retorno=irr-defer"]},
      {id: "safra", role: "topic", topicId: "safra", title: "topic.crop_programs|valor=programs|pico=need-peak", recommendation: null, options: [],
        lines: ["topic.crop_program_cost|taxa_b=spread-b|taxa_a=spread-a", "topic.crop_overdraft|credor=cl-creditor|livre=cl-unused|termos=cl-terms"]},
      {id: "caminhos", role: "alternatives", topicId: "vencimentos", title: "alternatives.count|caminhos=n-paths|ano=year-2027", recommendation: null, options: [],
        lines: auroraPaths.map(([id]) => `alternatives.row.${auroraPathRows[id]}|caixa=${id}-cash|alavancagem=${id}-lev|custo=${id}-cost|ano=year-2028|divida=${id}-net|criterios=${id}-ok|anuencia=${id}-consent`)},
      {id: "movimentos", role: "alternatives", topicId: "vencimentos", title: "alternatives.moves.title|caminhos=n-paths", recommendation: null, options: [],
        lines: auroraPaths.map(([id]) => `alternatives.moves.${auroraPathRows[id]}|projeto=project-label${["sem-linha-debenture", "debenture-com-linha", "alongar-com-banco", "alongar-bradesco"].includes(id) ? "|credor=bradesco-creditor" : ""}`)},
      {id: "recomendacao", role: "recommendation", topicId: "vencimentos", title: "recommendation.debenture|valor=debenture-amount|prazo=debenture-term", recommendation: null, options: [],
        lines: ["recommendation.debenture_cost|credor=bradesco-creditor|baixo=deb-cost-low|alto=deb-cost-high", "recommendation.amortization|inicio=amort-first|fim=amort-last",
          "recommendation.alternative|credor=bradesco-creditor|prazo=deadline:vencimentos.rota|projeto=project-label"]},
      {id: "alavancagem", role: "risk", topicId: "vencimentos", title: "risk.leverage|politica=policy-limit|adverso=lev-adv27|ano=year-2027", recommendation: null, options: [],
        lines: ["risk.leverage_path|inicio=lev-dez26|data_inicio=dez26-date|fim=lev-dez27|data_fim=dez27-date", "risk.leverage_adverse|ano=year-2027|adverso=lev-adv27|politica=policy-limit"]},
      {id: "politica", role: "risk", topicId: "politica", title: "risk.policy_definition|politica=policy-limit", recommendation: null, options: [],
        lines: ["risk.policy_readings|gerencial=lev-ger-dez26|escritura=lev-dez26|data=dez26-date"]},
      {id: "mudaria", role: "what_changes", topicId: "vencimentos", title: "what_changes.title|piso=issue-floor", recommendation: null, options: [],
        lines: ["what_changes.demand|piso=issue-floor|alvo=debenture-amount", "what_changes.wheat|choque=wheat-shock|defasagem=wheat-lag|ano=year-2027|ebitda=ebitda-wheat|insumo=wheat-label",
          "what_changes.receivable_days|ano=year-2026|giro=wc-60"]},
      {id: "passos", role: "next_steps", topicId: "geral", title: "next_steps.title", recommendation: null, options: [],
        lines: ["next_steps.notice|prazo=deadline:linha.aviso|projeto=project-label", "next_steps.programs|prazo=deadline:safra.adesao",
          "next_steps.sounding|prazo=deadline:vencimentos.sondagem", "next_steps.route|prazo=deadline:vencimentos.rota|ano=year-2027"]},
    ] as {id: string; role: string; topicId: string | null; title: string; lines: string[]; recommendation: string | null; options: string[]}[],
    summary: {opening: "summary.opening.debt_and_cash|principal=principal-2027|ano=year-2027|semana=tight-week",
      closing: "summary.closing.leverage|alavancagem=lev-dez26|data=dez26-date|politica=policy-limit"},
    appendix: [
      {id: "tabela", label: "appendix.debt_table", sourceIds: ["tabela-divida"]},
      {id: "projecao", label: "appendix.projection", sourceIds: ["projecao"]},
      {id: "plano-fpa", label: "appendix.plan_vs_base", sourceIds: ["plano-fpa"]},
      {id: "fontes", label: "appendix.sources", sourceIds: ["tabela-divida", "covenant", "caixa-semanal", "linha-embalagem", "projecao", "plano-fpa", "recebiveis", "custo-relativo", "plano-2027"]},
    ],
    questions: [
      {id: "bradesco", question: "q.roll_bank|credor=bradesco-creditor", answer: "a.roll_bank|credor=bradesco-creditor|falta=bradesco-gap|vencimento=bradesco-maturity|projeto=project-label"},
      {id: "prazo", question: "q.term|prazo=debenture-term", answer: "a.term|ano=amort-first|amortizacao=five-year-amort|disponivel=five-year-available"},
      {id: "demanda", question: "q.demand", answer: "a.demand|valor=alt-amount|prazo=deadline:vencimentos.rota|credor=bradesco-creditor|vencimento=bradesco-maturity|projeto=project-label"},
      {id: "custo", question: "q.cost", answer: "a.cost|baixo=deb-cost-low|alto=deb-cost-high|custo=cost-2028|ano=year-2028|divida=net-debt-2028|ano_fim=year-2028"},
      {id: "serra-verde", question: "q.peer", answer: "a.peer|total=gap-bps|ajustes=known-bps|data=date-bps|resto=unexplained-bps"},
      {id: "rating", question: "q.rating", answer: "a.rating|baixo=rating-low|alto=rating-high"},
      {id: "estrategica", question: "q.strategic|projeto=project-label", answer: "a.strategic|retorno=irr|custo=wacc"},
      {id: "trigo", question: "q.wheat|insumo=wheat-label", answer: "a.wheat|choque=wheat-shock|defasagem=wheat-lag|ano=year-2027|ebitda=ebitda-wheat|ebitda_adverso=ebitda-adv27|alavancagem=lev-adv27|covenant=cov-limit|insumo=wheat-label"},
      {id: "rede-a", question: "q.anchor|rede=rede-a-label", answer: "a.anchor|rede=rede-a-label|saldo=rede-a|carteira=carteira|volume=rede-a-retained|taxa=spread-a"},
      {id: "fpa", question: "q.plan_vs_base|plano=fpa-2028|ano=year-2028|base=ref-2028", answer: "a.plan_vs_base|base=ref-2028"},
    ],
    /** Facts informed in the conversation: the chair's strategic reason for the packaging line. */
    informed: [{id: "motivo-estrategico", origin: "informed", author: "chair", code: "reduce_single_supplier_dependence"}],
    /** Readings a test adds to the basis beside the calibration's own. */
    extraReadings: {} as Record<string, Reading>,
    omissions: turn === 3 ? [{id: "linha-sem-recomendacao", target: "recommendation", targetId: "linha", requestedBy: "requester.chair"}] : [] as {id: string; target: string; targetId: string; requestedBy: string}[],
  };
}
/** The reviewed library row of each path the plan evaluates. */
export const auroraPathRows: Record<string, string> = {"sem-linha-debenture": "no_line_debenture", "adiar-linha": "defer_line", "debenture-com-linha": "debenture_with_line",
  "manter": "keep_and_roll", "ccb-tres-anos": "short_bank_loan", "alongar-com-banco": "extend_with_bank", "alongar-bradesco": "extend_bradesco"};

/** The discussion as adopted contributions, by hand, on its own basis; the reviewed results travel beside it. */
export function auroraBoardBasis(turn: BoardTurn = 2, edit: (c: ReturnType<typeof auroraBoardCase>) => void = () => undefined) {
  const c = auroraBoardCase(turn); edit(c);
  const f = analysisTestBasis(`board_capital.${id(95)}.`, c.askedOn, c.meetingDate);
  const sources = auroraBoardSources();
  const contribute = (p: string, unit: string, value: AdoptionBasisEntry["value"]) => f.contribute(p, unit, value);
  const text = (p: string, value: string) => contribute(p, "text", {type: "text", value});
  const list = (p: string, value: string[], unit = "identity") => contribute(p, unit, {type: "list", value});
  const input = {...f.context, analysisId: id(95), scenario: "base",
    meeting: {date: contribute("meeting.date", "date", {type: "date", value: c.meetingDate}), askedOn: contribute("meeting.askedOn", "date", {type: "date", value: c.askedOn}),
      leadDays: contribute("meeting.leadDays", "days", {type: "number", value: c.leadDays}), minutesPerPage: contribute("meeting.minutesPerPage", "minutes", {type: "number", value: c.minutesPerPage}),
      agendaMinutes: c.agendaMinutes === null ? null : contribute("meeting.agendaMinutes", "minutes", {type: "number", value: c.agendaMinutes}),
      nextMeetingDate: c.nextMeetingDate === null ? null : contribute("meeting.nextMeetingDate", "date", {type: "date", value: c.nextMeetingDate}),
      template: c.template === null ? null : text("meeting.template", c.template),
      outlineConfirmed: contribute("meeting.outlineConfirmed", "convention", {type: "boolean", value: c.outlineConfirmed})},
    sources: sources.map((s) => ({id: s.id, reading: list(`source.${s.id}`, [s.methodId, s.packet.fingerprint as string])})),
    topics: c.topics.map((t) => ({id: t.id, label: text(`topic.${t.id}.label`, t.label), seen: t.seen === null ? null : contribute(`topic.${t.id}.seen`, "convention", {type: "boolean", value: t.seen})})),
    deliberations: c.deliberations.map((d) => {const p = `deliberation.${d.id}.`; return {id: d.id, title: text(p + "title", d.title), subject: text(p + "subject", d.subject),
      recommendation: d.recommendation === null ? null : text(p + "recommendation", d.recommendation), authority: list(p + "authority", d.authorityBasis === null ? [d.authority] : [d.authority, d.authorityBasis]),
      deadlines: d.deadlines.map((x) => ({id: x.id, reading: list(`${p}deadline.${x.id}`, [x.date, x.action])}))};}),
    figures: [...Object.entries({...auroraBoardReadings, ...c.extraReadings}).map(([k, r]) => ({id: k, kind: "reading" as const, reading: list(`figure.${k}.reading`, r.filter((x): x is string => x !== undefined))})),
      ...Object.entries(auroraBoardPending).map(([k, r]) => ({id: k, kind: "pending" as const, reading: list(`figure.${k}.pending`, r)}))],
    materialFigureIds: list("figures.material", auroraMaterialFigures),
    indicative: auroraIndicative.figures.map((x) => ({figureId: x, reason: text(`figure.${x}.indicative`, auroraIndicative.reason)})),
    pages: c.pages.map((pg) => {const p = `page.${pg.id}.`; return {id: pg.id, role: contribute(p + "role", "convention", {type: "text", value: pg.role}), title: text(p + "title", pg.title),
      lines: list(p + "lines", pg.lines, "text"), recommendation: pg.recommendation === null ? null : text(p + "recommendation", pg.recommendation),
      options: pg.options.length ? list(p + "options", pg.options, "text") : null};}),
    summary: {opening: text("summary.opening", c.summary.opening), closing: text("summary.closing", c.summary.closing)},
    appendix: c.appendix.map((a) => ({id: a.id, reading: list(`appendix.${a.id}`, [a.label, ...a.sourceIds])})),
    questions: c.questions.map((q) => ({id: q.id, question: text(`question.${q.id}.question`, q.question), answer: text(`question.${q.id}.answer`, q.answer)})),
    omissions: c.omissions.map((o) => ({id: o.id, reading: list(`omission.${o.id}`, [o.target, o.targetId, o.requestedBy])})),
    informed: c.informed.map((x) => ({id: x.id, reading: list(`informed.${x.id}`, [x.origin, x.author, x.code])})),
  } as unknown as AdoptedBoardCapitalDiscussionInput;
  const seal = (): BoardCapitalDiscussionAnalyses => ({sources: auroraBoardSources().map((s) => ({id: s.id, packet: JSON.stringify(s.packet)})), discussion: {...input, envelope: f.seal()}});
  return {...f, input, case: c, seal};
}

/** The same case as facts with their origin, for the premises path. */
export function auroraBoardFacts(turn: BoardTurn = 2, edit: (c: ReturnType<typeof auroraBoardCase>) => void = () => undefined): BoardCapitalDiscussionFacts {
  const c = auroraBoardCase(turn), sources = auroraBoardSources(); edit(c);
  const fact = <T>(value: T, origin: "document" | "informed" | "house" | "estimate" | "analysis", source: string) => ({value, origin, source});
  return {discussionId: id(9500), entityId: company, perimeter: "standalone", currency: "BRL", definitionVersionId: id(3),
    askedOn: fact(c.askedOn, "informed", "data do pedido na conversa"), meetingDate: fact(c.meetingDate, "informed", "conselho na quarta, informado pelo CFO"),
    leadDays: fact(c.leadDays, "house", "roteiro antes do material quando há ao menos um dia até a reunião"),
    minutesPerPage: fact(c.minutesPerPage, "house", "uma página a cada três minutos de pauta"),
    agendaMinutes: c.agendaMinutes === null ? null : fact(c.agendaMinutes, "informed", "tempo de pauta informado pelo CFO"),
    nextMeetingDate: null, template: c.template === null ? null : fact(c.template, "document", "última apresentação ao conselho, anexada"),
    outlineConfirmed: fact(c.outlineConfirmed, "informed", c.outlineConfirmed ? "CFO seguiu o roteiro e mandou o template" : "roteiro ainda não confirmado"),
    sources: sources.map((s) => fact({id: s.id, methodId: s.methodId, packetFingerprint: s.packet.fingerprint as string}, "analysis", "resultado revisado no cofre, na versão vigente")),
    topics: c.topics.map((t) => fact(t, "informed", "o que o conselho já viu, segundo o CFO")),
    deliberations: c.deliberations.map((d) => fact(d, "analysis", "decisões com prazo extraídas das análises revisadas")),
    figures: [...Object.entries({...auroraBoardReadings, ...c.extraReadings}).map(([k, r]) => fact({id: k, kind: "reading" as const, reading: r.filter((x): x is string => x !== undefined)}, "analysis", "leitura do resultado revisado")),
      ...Object.entries(auroraBoardPending).map(([k, r]) => fact({id: k, kind: "pending" as const, reading: r}, "house", "número sem resultado revisado"))],
    materialFigureIds: fact(auroraMaterialFigures, "house", "fatos materiais para as decisões do conselho"),
    indicative: auroraIndicative.figures.map((x) => fact({figureId: x, reason: auroraIndicative.reason}, "analysis", "programa da rede A sem prazo confirmado")),
    pages: c.pages.map((p) => fact(p, "house", "plano de páginas proposto")),
    summary: fact(c.summary, "house", "página de síntese para envio prévio"),
    appendix: c.appendix.map((a) => fact(a, "house", "apêndice consultável")),
    questions: c.questions.map((q) => fact(q, "house", "perguntas prováveis do conselho")),
    omissions: c.omissions.map((o) => fact(o, "informed", "pedido do CFO na conversa")),
    informed: c.informed.map((x) => fact({id: x.id, author: x.author, code: x.code}, x.origin as "informed", "presidente do conselho na conversa sobre a linha de embalagem")),
  } as unknown as BoardCapitalDiscussionFacts;
}
