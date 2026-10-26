import type {AdoptedProjectionChallengeInput} from "./adopted-projection-challenge";
import {analysisTestBasis, analysisTestId as id} from "./adopted-analysis.test-support";
import type {ProjectionChallengeFacts} from "./projection-challenge-premises";

/** Aurora Alimentos, plan 2026 to 2028 prepared by FP&A for the banks, read against the C24 projection by
 * drivers (ficha C26, synthetic). Volume in thousand tonnes, price and variable cost in BRL per kg, other
 * values in BRL millions; the independent oracle is modelo_c26.py. */
export type AuroraProjectionOptions = {capacity?: boolean; documented?: readonly string[]; premiumOverAverage?: string; marginCause?: string};
const years = ["2025", "2026", "2027", "2028"];
const common = {variableUnitCost: ["2.759", "2.832", "2.922", "3.0027"], interestExpense: ["17.5", "17.5", "15", "15"],
  inventoryDays: "45", payableDays: "45", leasePayments: "3", depreciation: "12", taxRate: "0.34"};
export const auroraProjectionCases = {
  reference: {...common, quantity: ["105", "107.5", "110", "112.5"], netUnitPrice: ["4", "4.1", "4.215", "4.32"], fixedCosts: ["78.3", "81.8", "85.6", "89.4"],
    receivableDays: "50", maintenanceCapex: "8"},
  plan: {...common, quantity: ["105", "109.7", "114.7", "119.8"], netUnitPrice: ["4", "4.14", "4.285", "4.435"], fixedCosts: ["78.3", "80.6", "83.1", "85.6"],
    receivableDays: "45", maintenanceCapex: "5"},
};
export const auroraProjectionAssumptions = [
  {id: "volume", label: "Volume +4,5% ao ano", drivers: ["quantity"],
    ruler: "Volume cresceu 2,3% em 2025; capacidade instalada de 118 mil t por ano",
    evidence: ["Pedidos ou contratos com volume mínimo", "Projeto de ampliação de capacidade, com o capex e o financiamento dele"]},
  {id: "preco", label: "Preço líquido +3,5% ao ano", drivers: ["netUnitPrice"],
    ruler: "Custo variável por kg sobe cerca de 3% ao ano na base",
    evidence: ["Histórico de repasse de preço acima do custo", "Contratos com cláusula de reajuste", "Mudança de mix documentada, com participação e preço por linha"]},
  {id: "fixos", label: "Custos fixos +3% ao ano", drivers: ["fixedCosts"],
    ruler: "Inflação e dissídio perto de 4,5% a 5% ao ano",
    evidence: ["Projeto de produtividade que gera o ganho, com prazo e responsável"]},
  {id: "prazo-capex", label: "Prazo de recebimento de 45 dias e capex de manutenção de R$ 5 mi", drivers: ["receivableDays", "maintenanceCapex"],
    ruler: "Prazo de 50 dias hoje, as duas maiores redes pedem 60; capex de manutenção de R$ 8 mi por ano nos últimos três anos",
    evidence: ["Acordo comercial com as redes que fixe o prazo", "Plano de manutenção que sustente o capex menor"]},
] as const;
const unitConvention = "Volume em mil toneladas; preço líquido e custo variável em R$ por kg; demais valores em R$ milhões";
const capacitySource = "Cadastro da fábrica: capacidade instalada de 118 mil t por ano";

export function auroraProjectionBasis(o: AuroraProjectionOptions = {}) {
  const f = analysisTestBasis(`projection_challenge.${id(70)}.`, "2025-01-01", "2028-12-31");
  const c = (p: string, unit: string, value: Parameters<typeof f.contribute>[2], scenario = "plano") => f.contribute(p, unit, value, scenario);
  const text = (p: string, unit: string, value: string, scenario?: string) => c(p, unit, {type: "text", value}, scenario);
  const list = (p: string, unit: string, value: readonly string[], scenario?: string) => c(p, unit, {type: "list", value: [...value]}, scenario);
  const num = (p: string, unit: string, value: string, scenario?: string) => c(p, unit, {type: "number", value}, scenario);
  const kase = (k: "reference" | "plan", scenario: string) => {
    const v = auroraProjectionCases[k], p = `case.${k}.`;
    return {quantity: list(p + "quantity", "quantity", v.quantity, scenario), netUnitPrice: list(p + "netUnitPrice", "unit_price", v.netUnitPrice, scenario),
      variableUnitCost: list(p + "variableUnitCost", "unit_price", v.variableUnitCost, scenario), fixedCosts: list(p + "fixedCosts", "currency", v.fixedCosts, scenario),
      interestExpense: list(p + "interestExpense", "currency", v.interestExpense, scenario), receivableDays: num(p + "receivableDays", "days", v.receivableDays, scenario),
      inventoryDays: num(p + "inventoryDays", "days", v.inventoryDays, scenario), payableDays: num(p + "payableDays", "days", v.payableDays, scenario),
      maintenanceCapex: num(p + "maintenanceCapex", "currency", v.maintenanceCapex, scenario), leasePayments: num(p + "leasePayments", "currency", v.leasePayments, scenario),
      depreciation: num(p + "depreciation", "currency", v.depreciation, scenario), taxRate: num(p + "taxRate", "ratio", v.taxRate, scenario)};
  };
  const input = {...f.context, analysisId: id(70), scenario: "plano", referenceScenario: "referencia", planScenario: "plano",
    periodIds: list("periodIds", "identity", years), targetPeriodId: text("targetPeriodId", "identity", "2028"),
    dayBasis: text("dayBasis", "convention", "360"), unitConvention: text("unitConvention", "text", unitConvention),
    reference: kase("reference", "referencia"), plan: kase("plan", "plano"),
    assumptions: auroraProjectionAssumptions.map(a => {
      const p = `assumption.${a.id}.`;
      return {id: a.id, label: text(p + "label", "text", a.label), drivers: list(p + "drivers", "identity", a.drivers), ruler: text(p + "ruler", "text", a.ruler),
        evidence: list(p + "evidence", "text", a.evidence), evidenceStatus: text(p + "evidenceStatus", "convention", o.documented?.includes(a.id) ? "documented" : "not_presented")};
    }),
    capacity: o.capacity === false ? null : {maximumQuantity: num("capacity.maximumQuantity", "quantity", "118"),
      investmentInPlan: c("capacity.investmentInPlan", "convention", {type: "boolean", value: false}), source: text("capacity.source", "text", capacitySource)},
    marginCause: o.marginCause ? text("marginCause", "text", o.marginCause) : null,
    requestedReceivableDays: num("requestedReceivableDays", "days", "60"),
    premiumOverAverage: o.premiumOverAverage ? num("premiumOverAverage", "ratio", o.premiumOverAverage) : null,
  } as unknown as AdoptedProjectionChallengeInput;
  const seal = () => ({...input, envelope: f.seal()});
  return {...f, input, seal};
}

/** The same calibration as facts with their origins, for the premises path: the plan's drivers are the
 * company's spreadsheet; the reference is the house's projection by drivers; yardsticks and evidence are house rules. */
export function auroraProjectionFacts(o: AuroraProjectionOptions = {}): ProjectionChallengeFacts {
  const doc = <T>(value: T, source: string) => ({value, origin: "document" as const, source});
  const informed = <T>(value: T, source: string) => ({value, origin: "informed" as const, source});
  const house = <T>(value: T, source: string) => ({value, origin: "house" as const, source});
  const estimate = <T>(value: T, source: string) => ({value, origin: "estimate" as const, source});
  const kase = (k: "reference" | "plan") => {const {...v} = auroraProjectionCases[k]; return {...v, quantity: [...v.quantity], netUnitPrice: [...v.netUnitPrice],
    variableUnitCost: [...v.variableUnitCost], fixedCosts: [...v.fixedCosts], interestExpense: [...v.interestExpense]};};
  return {challengeId: id(4700), entityId: id(1), perimeter: "standalone", currency: "BRL", definitionVersionId: id(3),
    openingDate: "2025-01-01", endDate: "2028-12-31", scenario: "plano", referenceScenario: "referencia", planScenario: "plano",
    periodIds: doc([...years], "plano-2026-2028-v3.xlsx"), targetPeriodId: informed("2028", "pergunta sobre o plano que vai aos bancos"),
    dayBasis: house("360" as const, "Ano comercial de 360 dias para giro por prazos"), unitConvention: house(unitConvention, "Convenção de unidades da base por drivers"),
    reference: estimate(kase("reference"), "Projeção por drivers históricos da casa (C24)"), plan: doc(kase("plan"), "plano-2026-2028-v3.xlsx"),
    assumptions: auroraProjectionAssumptions.map(a => ({
      term: doc({id: a.id, label: a.label, drivers: [...a.drivers]}, "plano-2026-2028-v3.xlsx"),
      ruler: house(a.ruler, "Réguas da casa: histórico, capacidade, inflação e prazos"),
      evidence: house([...a.evidence], "Evidência que sustentaria a premissa diante de um comitê de crédito"),
      evidenceStatus: o.documented?.includes(a.id) ? informed("documented" as const, "documento apresentado pela companhia") : informed("not_presented" as const, "nenhum documento apresentado")})),
    capacity: o.capacity === false ? null : {maximumQuantity: doc("118", capacitySource), investmentInPlan: doc(false, "plano-2026-2028-v3.xlsx sem capex de capacidade"),
      source: doc(capacitySource, "Cadastro da fábrica")},
    marginCause: o.marginCause ? informed(o.marginCause, "resposta do CFO") : null,
    requestedReceivableDays: informed("60", "As duas maiores redes pedem 60 dias"),
    premiumOverAverage: o.premiumOverAverage ? informed(o.premiumOverAverage, "Linha premium lançada em março, 25% mais cara") : null};
}
