import type {ReceivablesFundingInput, ReceivablesFundingItem, ReceivablesFundingOption} from "@offroad/financial-core";
import type {AdoptedReceivablesFundingInput} from "./adopted-receivables-funding";
import {analysisTestBasis, analysisTestId as id} from "./adopted-analysis.test-support";
import type {ReceivablesFundingFacts} from "./receivables-funding-premises";

/** Aurora Alimentos, portfolio of 15/set/2026 (ficha C35, synthetic), as the independent oracle
 * (modelo_c35.py) states it: six groups of R$ 62 mi, the varejo split by the oracle's premise of
 * R$ 4 mi of best-credit debtors, four receivables options and the bank line, for R$ 17 mi over
 * six months. Synthetic calibration, never a production parameter. BRL millions. */
const current = {originDate: "2026-09-15", dueDate: "2026-11-04", registration: "missing" as const, encumbranceHolder: null, releaseEvent: null, encumbrance: "free" as const,
  contract: "assignable" as const, anchorProgram: "none" as const, creditTier: "standard" as const, debtorCount: null, largestDebtorAmount: null};
// Each named debtor is keyed by itself; each bucket's debtor set is declared disjoint from the named debtors and the other buckets.
const item = (patch: Partial<ReceivablesFundingItem> & Pick<ReceivablesFundingItem, "id" | "label" | "amount">): ReceivablesFundingItem =>
  ({...current, debtorKey: patch.id, debtorSetDisjoint: patch.debtorCount === 1 ? null : true, ...patch});
const policy = {maxDaysPastDue: 0, maxRemainingTermDays: 180, registrationRule: "required" as const, minCreditTier: "standard" as const, sublimitPerDebtor: "3", anchorItemIds: [] as string[]};
const noIof = {iofDaily: "0", iofDailyCapDays: 0, iofAdditional: "0", rolloverDays: null, upfrontFee: "0", collateral: "none" as const};
export function auroraReceivablesFunding(): ReceivablesFundingInput {
  const items: ReceivablesFundingItem[] = [
    item({id: "rede-a", label: "Rede A (maior cliente)", amount: "19.8", contract: "prohibited_without_consent", anchorProgram: "unknown", debtorCount: 1}),
    item({id: "redes-c-d", label: "Redes C e D", amount: "12", encumbrance: "assigned", encumbranceHolder: "Bradesco", releaseEvent: "pré-pagamento da CCB do Bradesco", debtorCount: 2}),
    item({id: "rede-b", label: "Rede B", amount: "3.7", anchorProgram: "active", debtorCount: 1}),
    item({id: "rede-e", label: "Rede E", amount: "4.5", creditTier: "selected", debtorCount: 1}),
    item({id: "rede-f", label: "Rede F", amount: "4.5", creditTier: "selected", debtorCount: 1}),
    item({id: "varejo-selecionado", label: "Varejo médio e atacado, sacados de melhor crédito", amount: "4", creditTier: "selected"}),
    item({id: "varejo-demais", label: "Varejo médio e atacado, demais sacados", amount: "11.3"}),
    item({id: "vencidos", label: "Vencidos acima de 30 dias", amount: "2.2", originDate: "2026-06-26", dueDate: "2026-08-15", debtorSetDisjoint: false}),
  ];
  const options: ReceivablesFundingOption[] = [
    {id: "risco-sacado-b", label: "Risco sacado da rede B", kind: "anchor_program", recourse: "without_recourse",
      eligibility: {...policy, registrationRule: "not_required", sublimitPerDebtor: null, anchorItemIds: ["rede-b"]}, rate: {basis: "di_plus", rate: "0.012"}, ...noIof, leadDaysMin: 10, leadDaysMax: 30},
    {id: "fidc-com-coobrigacao", label: "FIDC multicedente com coobrigação", kind: "fidc", recourse: "with_recourse", eligibility: {...policy},
      rate: {basis: "monthly", rate: "0.016"}, ...noIof, upfrontFee: "0.003", leadDaysMin: 15, leadDaysMax: 30},
    {id: "fidc-sem-coobrigacao", label: "FIDC multicedente sem coobrigação", kind: "fidc", recourse: "without_recourse", eligibility: {...policy, minCreditTier: "selected"},
      rate: {basis: "monthly", rate: "0.019"}, ...noIof, upfrontFee: "0.003", leadDaysMin: 15, leadDaysMax: 30},
    {id: "desconto-bancario", label: "Desconto bancário com rolagem", kind: "bank_discount", recourse: "with_recourse",
      eligibility: {...policy, registrationRule: "not_required", sublimitPerDebtor: null}, rate: {basis: "di_plus", rate: "0.028"},
      iofDaily: "0.000082", iofDailyCapDays: 365, iofAdditional: "0.0038", rolloverDays: 50, upfrontFee: "0", collateral: "receivables_assignment", leadDaysMin: null, leadDaysMax: null},
    {id: "linha-giro", label: "Linha de giro de seis meses", kind: "bank_line", recourse: "with_recourse", eligibility: null, rate: {basis: "di_plus", rate: "0.025"},
      iofDaily: "0.000082", iofDailyCapDays: 365, iofAdditional: "0.0038", rolloverDays: null, upfrontFee: "0.003", collateral: "unknown", leadDaysMin: null, leadDaysMax: null},
  ];
  return {currency: "BRL", referenceDate: "2026-09-15", items, options, needAverage: "17", needPeak: "25", needStartDate: "2026-10-16", calendarDays: 180, businessDays: 126,
    annualDi: "0.149", averageTermDays: 50, needProfile: "seasonal", dedicatedVehicleThreshold: {min: "3", max: "5"}, lienBasketRemaining: "3"};
}
export const receivablesFundingEndDate = "2027-03-31";

/** The same calibration as adopted contributions, field by field. */
export function auroraReceivablesFundingBasis(k: ReceivablesFundingInput = auroraReceivablesFunding()) {
  const f = analysisTestBasis(`receivables_funding.${id(90)}.`, k.referenceDate, receivablesFundingEndDate);
  const num = (p: string, unit: string, value: string) => f.contribute(p, unit, {type: "number", value});
  const text = (p: string, value: string, unit = "text") => f.contribute(p, unit, {type: "text", value});
  const date = (p: string, value: string) => f.contribute(p, "date", {type: "date", value});
  const opt = <T>(v: T | null, fn: (v: T) => ReturnType<typeof num>) => v === null ? null : fn(v);
  const input = {...f.context, analysisId: id(90), scenario: "base",
    needAverage: num("needAverage", "currency", k.needAverage), needPeak: num("needPeak", "currency", k.needPeak), needStartDate: date("needStartDate", k.needStartDate),
    calendarDays: num("calendarDays", "days", String(k.calendarDays)), businessDays: num("businessDays", "days", String(k.businessDays)),
    annualDi: num("annualDi", "ratio", k.annualDi), averageTermDays: num("averageTermDays", "days", String(k.averageTermDays)),
    needProfile: text("needProfile", k.needProfile, "convention"),
    vehicleThresholdMin: num("vehicleThresholdMin", "currency", k.dedicatedVehicleThreshold.min), vehicleThresholdMax: num("vehicleThresholdMax", "currency", k.dedicatedVehicleThreshold.max),
    lienBasketRemaining: opt(k.lienBasketRemaining, (v) => num("lienBasketRemaining", "currency", v)),
    items: k.items.map((i) => {const p = `item.${i.id}.`; return {id: i.id, label: text(p + "label", i.label), amount: num(p + "amount", "currency", i.amount),
      contract: text(p + "contract", i.contract, "convention"), encumbrance: text(p + "encumbrance", i.encumbrance, "convention"),
      encumbranceHolder: opt(i.encumbranceHolder, (v) => text(p + "encumbranceHolder", v)), releaseEvent: opt(i.releaseEvent, (v) => text(p + "releaseEvent", v)),
      originDate: date(p + "originDate", i.originDate), dueDate: date(p + "dueDate", i.dueDate), registration: text(p + "registration", i.registration, "convention"),
      creditTier: text(p + "creditTier", i.creditTier, "convention"), anchorProgram: text(p + "anchorProgram", i.anchorProgram, "convention"),
      debtorCount: opt(i.debtorCount, (v) => num(p + "debtorCount", "count", String(v))), largestDebtorAmount: opt(i.largestDebtorAmount, (v) => num(p + "largestDebtorAmount", "currency", v)),
      debtorKey: text(p + "debtorKey", i.debtorKey, "identity"),
      debtorSetDisjoint: opt(i.debtorSetDisjoint, (v) => text(p + "debtorSetDisjoint", v ? "declared" : "not_declared", "convention"))};}),
    options: k.options.map((o) => {const p = `option.${o.id}.`, e = o.eligibility; return {id: o.id, label: text(p + "label", o.label), kind: text(p + "kind", o.kind, "convention"),
      recourse: text(p + "recourse", o.recourse, "convention"), rateBasis: text(p + "rateBasis", o.rate.basis, "convention"), rate: num(p + "rate", "ratio", o.rate.rate),
      iofDaily: num(p + "iofDaily", "ratio", o.iofDaily), iofDailyCapDays: num(p + "iofDailyCapDays", "days", String(o.iofDailyCapDays)), iofAdditional: num(p + "iofAdditional", "ratio", o.iofAdditional),
      rolloverDays: opt(o.rolloverDays, (v) => num(p + "rolloverDays", "days", String(v))), upfrontFee: num(p + "upfrontFee", "ratio", o.upfrontFee),
      collateral: text(p + "collateral", o.collateral, "convention"),
      leadDaysMin: opt(o.leadDaysMin, (v) => num(p + "leadDaysMin", "days", String(v))), leadDaysMax: opt(o.leadDaysMax, (v) => num(p + "leadDaysMax", "days", String(v))),
      eligibility: e === null ? null : {maxDaysPastDue: num(p + "maxDaysPastDue", "days", String(e.maxDaysPastDue)), maxRemainingTermDays: num(p + "maxRemainingTermDays", "days", String(e.maxRemainingTermDays)),
        registrationRule: text(p + "registrationRule", e.registrationRule, "convention"), minCreditTier: text(p + "minCreditTier", e.minCreditTier, "convention"),
        sublimitPerDebtor: opt(e.sublimitPerDebtor, (v) => num(p + "sublimitPerDebtor", "currency", v)),
        anchorItemIds: e.anchorItemIds.length ? f.contribute(p + "anchorItemIds", "identity", {type: "list", value: [...e.anchorItemIds]}) : null}};}),
  } as unknown as AdoptedReceivablesFundingInput;
  const seal = () => ({...input, envelope: f.seal()});
  return {...f, input, seal};
}

/** The facts of ficha C35 as the conversation states them, with origin, for the premises path:
 * the same calibration the hand-built basis above adopts. */
export function auroraReceivablesFundingFacts(k: ReceivablesFundingInput = auroraReceivablesFunding()): ReceivablesFundingFacts {
  const doc = <T>(value: T, source: string) => ({value, origin: "document" as const, source});
  const informed = <T>(value: T, source: string) => ({value, origin: "informed" as const, source});
  const market = <T>(value: T, source: string) => ({value, origin: "market" as const, source});
  const estimate = <T>(value: T, source: string) => ({value, origin: "estimate" as const, source});
  const estimated = new Set(["varejo-selecionado", "varejo-demais"]);
  return {receivablesFundingId: id(91), entityId: id(1), perimeter: "standalone", currency: "BRL", definitionVersionId: id(3),
    referenceDate: k.referenceDate, endDate: receivablesFundingEndDate,
    needAverage: informed(k.needAverage, "uso médio da linha da safra por seis meses (C18)"), needPeak: informed(k.needPeak, "pico de dezembro da necessidade da safra (C18)"),
    needStartDate: informed(k.needStartDate, "dinheiro necessário na segunda quinzena de outubro"),
    calendarDays: informed(k.calendarDays, "seis meses de uso, em dias corridos"), businessDays: informed(k.businessDays, "seis meses de uso, em dias úteis"),
    annualDi: market(k.annualDi, "CDI anual adotado no caso"), averageTermDays: doc(k.averageTermDays, "prazo médio de recebimento de 50 dias, relatório de contas a receber"),
    needProfile: informed(k.needProfile, "necessidade da safra, em queda até março"),
    dedicatedVehicleThreshold: market(k.dedicatedVehicleThreshold, "ponto de virada de R$ 3 a 5 mi por mês para operação dedicada (módulo de recebíveis)"),
    lienBasketRemaining: k.lienBasketRemaining === null ? null : doc(k.lienBasketRemaining, "exceção remanescente da escritura, tabela de dívida (C10)"),
    items: k.items.map((i) => estimated.has(i.id)
      ? estimate({...i}, "carteira por sacado; divisão do varejo pelos sacados de melhor crédito é premissa do oráculo")
      : doc({...i}, "carteira por sacado e situação, cruzada com contratos e com a tabela de dívida")),
    options: k.options.map((o) => o.kind === "bank_line" ? informed({...o, eligibility: null, rate: {...o.rate}}, "proposta da linha de giro em negociação")
      : market({...o, rate: {...o.rate}, eligibility: o.eligibility ? {...o.eligibility, anchorItemIds: [...o.eligibility.anchorItemIds]} : null}, "faixas de preço e critérios do módulo de recebíveis (01-QUEM-COMPRA, ago/2026)"))};
}
