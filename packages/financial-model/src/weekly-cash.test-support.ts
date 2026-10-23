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
