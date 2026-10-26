import {projectedOperatingDriverNames, type ProjectedOperatingDriver} from "@offroad/financial-core";
import type {AdoptedDriverProjectionInput} from "./adopted-operating-projection-drivers";
import {analysisTestBasis, analysisTestId as id} from "./adopted-analysis.test-support";
import {operatingProjectionDriverUnits} from "./adopted-operating-projection-drivers";
import type {OperatingProjectionFacts} from "./operating-projection-premises";

type Origin = "document" | "informed" | "house" | "estimate";
/** Aurora in September 2026 (ficha C24, synthetic). BRL millions, volume in thousand tonnes, unit costs in BRL
 * per kg; drivers are those the independent oracle (modelo_c24.py) is calibrated on. */
const three = (v: string) => [v, v, v];
export const auroraDrivers: Record<ProjectedOperatingDriver, string[]> = {volume: ["107.5", "110", "112.5"], netUnitPrice: ["4.1", "4.215", "4.32"],
  inputCostPerUnit: ["1.01", "1.04", "1.07"], otherVariableCostPerUnit: ["1.822", "1.882", "1.9327"], fixedCosts: ["81.8", "85.6", "89.4"],
  receivableDays: three("50"), inventoryDays: three("45"), payableDays: three("45"), maintenanceCapex: three("8"), leasePayments: three("3"),
  depreciation: three("12"), interestExpense: ["17.5", "15", "15"], taxRate: three("0.34")};
/** Where each projected driver comes from: calibrated estimates, house rules, and the debt table for interest. */
export const auroraDriverOrigins: Record<ProjectedOperatingDriver, Origin> = {volume: "estimate", netUnitPrice: "estimate", inputCostPerUnit: "estimate",
  otherVariableCostPerUnit: "estimate", fixedCosts: "house", receivableDays: "house", inventoryDays: "house", payableDays: "house",
  maintenanceCapex: "estimate", leasePayments: "estimate", depreciation: "estimate", interestExpense: "estimate", taxRate: "house"};
export const auroraActual = {volume: "105", netUnitPrice: "4", inputCostPerUnit: "0.992", otherVariableCostPerUnit: "1.767", fixedCosts: "78.3",
  receivableDays: "50", inventoryDays: "45", payableDays: "45"};
export const auroraCause = "A revisão de julho supõe repasse integral do trigo a partir de setembro; o realizado até agosto mostra repasse mais lento";
export const periodEnds = ["2026-12-31", "2027-12-31", "2028-12-31"];
type Scenario = {id: string; label: string; role: "alternative" | "informed"; basedOn: string; growth?: [string, Origin]; factor?: [string, Origin];
  overrides?: [ProjectedOperatingDriver, string[], Origin][]; shock?: [string, string, string, Origin]};
/** `history` sets the adopted origin of the actual year: drivers, reported revenue and reported EBITDA (all documents by default). */
export type AuroraOptions = {informed?: boolean; cause?: boolean; fixedCosts2025?: string; history?: {drivers?: Origin; revenue?: Origin; ebitda?: Origin}};
export function auroraScenarios(o: AuroraOptions = {}): Scenario[] {
  return [
    {id: "trigo-repasse-6m", label: "Trigo +15% em 2027, repasse em seis meses", role: "alternative", basedOn: "base", shock: ["2027-12-31", "0.15", "6", "house"]},
    {id: "trigo-sem-repasse", label: "Trigo +15% em 2027, sem repasse no ano", role: "alternative", basedOn: "base", shock: ["2027-12-31", "0.15", "12", "house"]},
    {id: "prazo-60", label: "Prazo das redes de 50 para 60 dias", role: "alternative", basedOn: "base", overrides: [["receivableDays", three("60"), "house"]]},
    {id: "volume-menor", label: "Volume 2% menor ao ano", role: "alternative", basedOn: "base", factor: ["0.98", "house"]},
    ...o.informed ? [
      {id: "informado", label: "Informado pelo CFO: volume 3% ao ano, prazo de 60 dias", role: "informed" as const, basedOn: "base",
        growth: ["0.03", "informed"] as [string, Origin], overrides: [["receivableDays", three("60"), "informed"]] as [ProjectedOperatingDriver, string[], Origin][]},
      {id: "informado-trigo-4m", label: "Informado, com trigo +15% e repasse em quatro meses", role: "informed" as const, basedOn: "informado",
        shock: ["2027-12-31", "0.15", "4", "informed"] as [string, string, string, Origin]},
    ] : [],
  ];
}
const versions = (o: AuroraOptions) => [
  {id: "orcamento", label: "Orçamento 2026 aprovado", status: "approved", value: "58", cause: o.cause === false ? null : auroraCause},
  {id: "revisao-julho", label: "Revisão de julho, não aprovada", status: "under_review", value: "55.5", cause: o.cause === false ? null : auroraCause},
];

/** The hand-built adopted basis the packet reads. */
export function auroraProjectionBasis(o: AuroraOptions = {}) {
  const analysisId = id(70), f = analysisTestBasis(`operating_projection.${analysisId}.`, "2025-12-31", "2028-12-31");
  const c = (p: string, unit: string, value: Parameters<typeof f.contribute>[2], scenario = "base") => f.contribute(p, unit, value, scenario);
  const num = (p: string, unit: string, value: string, scenario = "base") => c(p, unit, {type: "number", value}, scenario);
  const txt = (p: string, unit: string, value: string, scenario = "base") => c(p, unit, {type: "text", value}, scenario);
  const list = (p: string, unit: string, value: string[], scenario = "base") => c(p, unit, {type: "list", value}, scenario);
  const missing = (reason: string) => ({decisionId: null, definitionVersionId: id(3), definitionKind: "managerial" as const, missingReason: reason});
  const drivers = Object.fromEntries(projectedOperatingDriverNames.map((k) => [k, list(`base.${k}`, operatingProjectionDriverUnits[k], auroraDrivers[k])]));
  const origins = Object.fromEntries(projectedOperatingDriverNames.map((k) => [k, list(`base.${k}.origins`, "origin", three(auroraDriverOrigins[k]))]));
  const actual = {...auroraActual, ...o.fixedCosts2025 ? {fixedCosts: o.fixedCosts2025} : {}};
  const input = {...f.context, analysisId, scenario: "base",
    purpose: txt("purpose", "text", "Discutir o financiamento com bancos: caixa disponível para a dívida e o que pode dar errado"),
    periodEnds: c("periodEnds", "date", {type: "list", value: periodEnds}),
    conventions: {dayCountBasis: txt("convention.dayCountBasis", "convention", "360"), calibrationTolerance: num("convention.calibrationTolerance", "ratio", "0.005")},
    actual: {periodStart: c("actual.periodStart", "date", {type: "date", value: "2025-01-01"}), periodEnd: c("actual.periodEnd", "date", {type: "date", value: "2025-12-31"}),
      drivers: Object.fromEntries(Object.entries(actual).map(([k, v]) => [k, num(`actual.${k}`, operatingProjectionDriverUnits[k as ProjectedOperatingDriver], v)])),
      reportedRevenue: num("actual.reportedRevenue", "currency", "420"), reportedEbitda: num("actual.reportedEbitda", "currency", "52"),
      origins: Object.fromEntries([...Object.keys(auroraActual).map((k) => [k, o.history?.drivers ?? "document"]),
        ["reportedRevenue", o.history?.revenue ?? "document"], ["reportedEbitda", o.history?.ebitda ?? "document"]]
        .map(([k, v]) => [k, txt(`actual.${k}.origin`, "origin", v!)]))},
    base: {drivers, origins},
    scenarios: auroraScenarios(o).map((s) => {
      const p = `scenario.${s.id}.`, sc = s.id;
      const rule = (name: string, r?: [string, Origin]) => r ? {value: num(p + name, "ratio", r[0], sc), origin: txt(p + name + ".origin", "origin", r[1], sc)} : null;
      return {id: s.id, label: s.label, role: s.role, basedOn: s.basedOn, scenario: sc,
        volumeGrowthRate: rule("volumeGrowthRate", s.growth), volumeFactor: rule("volumeFactor", s.factor),
        overrides: (s.overrides ?? []).map(([driver, values, origin]) => ({driver, values: list(p + `override.${driver}`, operatingProjectionDriverUnits[driver], values, sc),
          origin: txt(p + `override.${driver}.origin`, "origin", origin, sc)})),
        inputCostShock: s.shock ? {fromPeriodEnd: c(p + "shock.fromPeriodEnd", "date", {type: "date", value: s.shock[0]}, sc), rate: num(p + "shock.rate", "ratio", s.shock[1], sc),
          passThroughLagMonths: num(p + "shock.passThroughLagMonths", "months", s.shock[2], sc), origin: txt(p + "shock.origin", "origin", s.shock[3], sc)} : null};
    }),
    companyVersions: versions(o).map((v) => {
      const p = `version.${v.id}.`;
      return {id: v.id, label: v.label, status: txt(p + "status", "convention", v.status), periodEnd: c(p + "periodEnd", "date", {type: "date", value: "2026-12-31"}),
        metric: txt(p + "metric", "convention", "ebitda"), value: num(p + "value", "currency", v.value), origin: txt(p + "origin", "origin", "document"),
        cause: v.cause === null ? missing("A companhia não explicou a diferença") : txt(p + "cause", "text", v.cause)};
    }),
  } as unknown as AdoptedDriverProjectionInput;
  const seal = () => ({...input, envelope: f.seal()});
  return {...f, input, seal};
}

/** The same calibration as facts with their origins, for the premises path. */
export function auroraProjectionFacts(o: AuroraOptions = {}): OperatingProjectionFacts {
  const doc = <T>(value: T, source: string) => ({value, origin: "document" as const, source});
  const house = <T>(value: T, source: string) => ({value, origin: "house" as const, source});
  const as = <T>(value: T, origin: Origin | undefined, source: string) => ({value, origin: origin ?? "document" as Origin, source});
  const actual = {...auroraActual, ...o.fixedCosts2025 ? {fixedCosts: o.fixedCosts2025} : {}};
  return {projectionId: id(4700), entityId: id(1), perimeter: "standalone", currency: "BRL", definitionVersionId: id(3),
    purpose: {value: "Discutir o financiamento com bancos: caixa disponível para a dívida e o que pode dar errado", origin: "informed", source: "pedido do CFO"},
    conventions: {dayCountBasis: house("360" as const, "Prazos médios em ano comercial"), calibrationTolerance: house("0.005", "Reproduzir o último ano auditado em até 0,5%")},
    actual: {periodStart: "2025-01-01", periodEnd: "2025-12-31",
      drivers: as(actual, o.history?.drivers, "Gerencial e custo de produção de 2025"), reportedRevenue: as("420", o.history?.revenue, "Demonstrações de 2025"),
      reportedEbitda: as("52", o.history?.ebitda, "Demonstrações de 2025, EBITDA da CVM 156")},
    periodEnds,
    base: projectedOperatingDriverNames.map((driver) => ({driver, values: auroraDrivers[driver],
      origins: three(auroraDriverOrigins[driver]) as Origin[], source: "Primeira versão por driver calibrada no histórico"})),
    scenarios: auroraScenarios(o).map((s) => ({id: s.id, label: s.label, role: s.role, basedOn: s.basedOn,
      volumeGrowthRate: s.growth ? {value: s.growth[0], origin: s.growth[1], source: "Crescimento de volume"} : null,
      volumeFactor: s.factor ? {value: s.factor[0], origin: s.factor[1], source: "Volume menor que a base"} : null,
      overrides: (s.overrides ?? []).map(([driver, values, origin]) => ({driver, values, origin, source: "Prazo das redes"})),
      inputCostShock: s.shock ? {value: {fromPeriodEnd: s.shock[0], rate: s.shock[1], passThroughLagMonths: Number(s.shock[2])}, origin: s.shock[3], source: "Alta do trigo e regra de repasse"} : null})),
    companyVersions: versions(o).map((v) => ({id: v.id, label: v.label,
      version: doc({status: v.status as "approved" | "under_review", periodEnd: "2026-12-31", metric: "ebitda" as const, value: v.value}, v.status === "approved" ? "Orçamento aprovado pelo conselho" : "Revisão de julho"),
      cause: v.cause === null ? {value: null, origin: "document" as const, source: "A companhia não explicou a diferença"}
        : {value: v.cause, origin: "estimate" as const, source: "Balancetes até agosto comparados com a revisão"}}))};
}
