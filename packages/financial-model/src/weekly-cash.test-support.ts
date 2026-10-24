import type {AdoptedWeeklyCashInput} from "./adopted-weekly-cash";
import {analysisTestBasis, analysisTestId as id} from "./adopted-analysis.test-support";
import {auroraWeeklyCash} from "./weekly-cash-streams.test-support";

/** Aurora Alimentos, 14/set/2026 to 03/jan/2027 (ficha C18, synthetic) as adopted contributions. BRL millions. */
export function auroraWeeklyCashBasis() {
  const k = auroraWeeklyCash;
  const f = analysisTestBasis(`weekly_cash.${id(80)}.`, k.firstMonday, "2027-01-03");
  const num = (p: string, unit: string, value: string) => f.contribute(p, unit, {type: "number", value});
  const text = (p: string, value: string, unit = "text") => f.contribute(p, unit, {type: "text", value});
  const list = (p: string, unit: string, value: string[]) => f.contribute(p, unit, {type: "list", value});
  const date = (p: string, value: string) => f.contribute(p, "date", {type: "date", value});
  const input = {...f.context, analysisId: id(80), scenario: "base",
    openingCash: num("openingCash", "currency", k.openingCash), minimumCash: num("minimumCash", "currency", k.minimumCash),
    projectionClosing: num("projectionClosing", "currency", k.projectionClosing!.balance), calendarEnd: date("calendarEnd", k.calendarEnd),
    covenantTestDate: date("covenantTestDate", k.covenantTestDate!),
    streams: k.streams.map(s => ({id: s.id, label: text(`stream.${s.id}.label`, s.label), category: text(`stream.${s.id}.category`, s.category, "convention"),
      direction: text(`stream.${s.id}.direction`, s.direction, "convention"),
      obligation: s.obligation === null ? null : text(`stream.${s.id}.obligation`, s.obligation, "convention"), dates: list(`stream.${s.id}.dates`, "date", [...s.dates]),
      amounts: list(`stream.${s.id}.amounts`, "currency", [...s.amounts])})),
    cases: k.cases.map(c => ({...c, streamIds: [...c.streamIds]})),
    coverage: Object.fromEntries(Object.entries(k.coverage).map(([o, v]) => [o, text(`coverage.${o}`, v, "convention")])),
    actions: k.actions.map(a => {const p = `action.${a.id}.`; return {id: a.id, label: text(p + "label", a.label), streamId: a.streamId, replacesStreamId: a.replacesStreamId,
      amount: num(p + "amount", "currency", a.amount), days: num(p + "days", "days", String(a.days)), rate: num(p + "rate", "ratio", a.rate),
      ratePeriod: text(p + "ratePeriod", a.ratePeriod, "convention"), iofDaily: num(p + "iofDaily", "ratio", a.iofDaily),
      iofDailyCapDays: num(p + "iofDailyCapDays", "days", String(a.iofDailyCapDays)), iofAdditional: num(p + "iofAdditional", "ratio", a.iofAdditional),
      upfrontFee: num(p + "upfrontFee", "ratio", a.upfrontFee), repaymentDate: date(p + "repaymentDate", a.repaymentDate)};}),
  } as unknown as AdoptedWeeklyCashInput;
  const seal = () => ({...input, envelope: f.seal()});
  return {...f, input, seal};
}

/** The facts of ficha C18 as the conversation would state them (synthetic Aurora, R$ million), for
 * the premises path: the same calibration the hand-built basis above adopts. */
export function auroraWeeklyCashFacts(): import("./weekly-cash-premises").WeeklyCashFacts {
  const k = auroraWeeklyCash;
  const doc = <T>(value: T, source: string) => ({value, origin: "document" as const, source});
  const informed = <T>(value: T, source: string) => ({value, origin: "informed" as const, source});
  const houseFact = <T>(value: T, source: string) => ({value, origin: "house" as const, source});
  const contractual = new Set(["finame", "ccb-juros", "debenture-amortizacao", "debenture-juros", "linha-17", "linha-25", "conta-garantida", "antecipacao"]);
  const legal = new Set(["folha", "fgts", "inss", "impostos-vendas", "irpj-csll", "decimo-1", "decimo-2"]);
  return {weeklyCashId: id(81), entityId: id(1), perimeter: "standalone", currency: "BRL", definitionVersionId: id(3),
    openingDate: k.firstMonday, endDate: "2027-01-03",
    openingCash: informed(k.openingCash, "saldo de caixa informado pela tesouraria em 14/set"),
    minimumCash: informed(k.minimumCash, "caixa mínimo de operação informado pela tesouraria"),
    projectionClosing: informed(k.projectionClosing!.balance, "saldo projetado no fechamento de dezembro"),
    calendarEnd: houseFact(k.calendarEnd, "calendário até o fim do ano"),
    covenantTestDate: doc(k.covenantTestDate!, "escritura da debênture, teste anual em 31/dez"),
    streams: k.streams.map((s) => {
      const value = {...s, dates: [...s.dates], amounts: [...s.amounts]};
      return contractual.has(s.id) ? doc(value, "contrato e cronograma de pagamentos")
        : legal.has(s.id) ? houseFact(value, "calendário legal de pagamentos sobre a folha e a projeção de vendas")
          : informed(value, "fluxo informado pela tesouraria");
    }),
    cases: k.cases.map((c) => (c.role === "informed" ? informed : houseFact)({...c, streamIds: [...c.streamIds]}, c.role === "informed" ? "plano informado" : "alternativa examinada")),
    actions: k.actions.map((a) => informed({...a}, "proposta do banco")),
    coverage: Object.fromEntries(Object.entries(k.coverage).map(([o, v]) => [o, informed(v, "obrigações conferidas com a tesouraria")])) as import("./weekly-cash-premises").WeeklyCashFacts["coverage"]};
}
