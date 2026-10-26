import type {CovenantHeadroomInput} from "./covenant-headroom";
import type {QuarterUpdateInput} from "./quarter-update";
import {auroraWeeklyCash} from "./weekly-cash.fixture";

/** Aurora Alimentos, close of 3T26 read on 15/out/2026 (ficha C54, synthetic). The prior versions are
 * the C18 weekly cash and the C12 test of December as adopted before the close; the update carries the
 * closed quarter and the two structural causes (receivable days at 54, wheat 3% dearer without pass-through)
 * as the independent oracle does (modelo_c54.py). Test fixture only, never a production parameter. BRL millions. */
const iso = (d: Date) => d.toISOString().slice(0, 10);
const at = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));
const plus = (d: Date, days: number) => new Date(d.getTime() + days * 86400000);
const money = (v: number) => v.toFixed(8).replace(/\.?0+$/, "");

/** Receipts of a daily billing collected after the given days, inside the C18 horizon. */
export function auroraReceipts(days: number) {
  const billing: Record<number, number> = {7: 36.5, 8: 37, 9: 37.5, 10: 38, 11: 41, 12: 42};
  const events: [string, string][] = [];
  for (const [mm, v] of Object.entries(billing)) {
    const m = Number(mm), length = ((m < 12 ? at(2026, m + 1, 1) : at(2027, 1, 1)).getTime() - at(2026, m, 1).getTime()) / 86400000;
    for (let d = 0; d < length; d++) {
      const day = plus(at(2026, m, 1), d + days);
      if (day >= at(2026, 9, 14) && day <= at(2027, 1, 3)) events.push([iso(day), money(v / length)]);
    }
  }
  return {dates: events.map(([d]) => d), amounts: events.map(([, v]) => v)};
}
/** Input purchases with wheat (about a third of them) 3% dearer: 5.8 x 1.01 a week. */
export function auroraDearerInputs() {
  const s = auroraWeeklyCash.streams.find(x => x.id === "insumos")!;
  return {dates: [...s.dates], amounts: s.amounts.map(() => "5.858")};
}
export const auroraPriorCovenant: CovenantHeadroomInput = {
  currency: "BRL", readingDate: "2026-09-15",
  limits: [
    {id: "aditamento", label: "Dívida líquida / EBITDA até 3,0x (1º aditamento)", kind: "contractual", status: "in_force", maximumRatio: "3", source: "1º aditamento cl. 3", testDates: ["2026-12-31", "2027-12-31"]},
    {id: "politica", label: "Política do conselho: até 2,5x", kind: "board_policy", status: "in_force", maximumRatio: "2.5", source: "Ata do conselho de março", testDates: ["2026-12-31", "2027-12-31"]},
  ],
  measurements: [
    {id: "dez26-base", label: "dez26-base", date: "2026-12-31", scenario: "base", role: "test", debt: "128.66666667", cash: "15.45720186", reportedEbitda: "54.5",
      adjustments: [{label: "Pagamentos de arrendamento", amount: "-3"}], unrealizedEbitda: "26", limitIds: ["aditamento", "politica"]},
    {id: "dez27-base", label: "dez27-base", date: "2027-12-31", scenario: "base", role: "test", debt: "120", cash: "20.67860248", reportedEbitda: "56.6",
      adjustments: [{label: "Pagamentos de arrendamento", amount: "-3"}], unrealizedEbitda: null, limitIds: ["aditamento", "politica"]},
  ],
  effects: [],
};
const cause = (id: string, label: string, amount: string, o: Partial<QuarterUpdateInput["bridges"][number]["causes"][number]> = {}) =>
  ({id, label, amount, classification: "calendar" as const, until: null, equalsDeviationOf: null, driverLineId: null, basis: "interpretation" as const, question: null, ...o});
export const auroraQuarterUpdate: QuarterUpdateInput = {
  currency: "BRL", quarterStart: "2026-07-01", quarterEnd: "2026-09-30",
  lines: [
    {id: "receita", label: "Receita", unit: "currency", projected: "110", actual: "111.2"},
    {id: "ebitda", label: "EBITDA", unit: "currency", projected: "13.5", actual: "13.1"},
    {id: "caixa", label: "Caixa em 30/set", unit: "currency", projected: "38.9", actual: "37.2"},
    {id: "prazo", label: "Prazo médio de recebimento (dias)", unit: "days", projected: "50", actual: "54"},
    {id: "trigo", label: "Variação do custo do trigo", unit: "ratio", projected: "0", actual: "0.03"},
  ],
  bridges: [
    {lineId: "ebitda", causes: [
      cause("volume", "Volume 1% acima", "0.5"),
      cause("trigo", "Trigo 3% mais caro desde agosto, sem repasse ainda", "-0.6", {classification: "structural", until: "2026-12-31", driverLineId: "trigo"}),
      cause("frete-energia", "Frete e energia", "-0.3"),
    ]},
    {lineId: "caixa", causes: [
      cause("ebitda-abaixo", "EBITDA abaixo", "-0.4", {equalsDeviationOf: "ebitda"}),
      cause("prazo-redes", "Redes pagando em 54 dias (prazo médio de 50)", "-2.1", {classification: "structural", until: "2026-12-31", driverLineId: "prazo",
        question: "Os 54 dias das redes são prazo negociado ou atraso?"}),
      cause("estoque-trigo", "Estoque de trigo antecipado em setembro", "-1.6", {basis: "document"}),
      cause("impostos-outros", "Impostos e outros", "2.4"),
    ]},
  ],
  carry: {cashLineId: "caixa", ebitdaLineId: "ebitda"},
  prior: {weeklyCash: auroraWeeklyCash, covenant: auroraPriorCovenant},
  weekly: {
    updates: [
      {streamId: "recebimentos", causeIds: ["prazo-redes"], ...auroraReceipts(54)},
      {streamId: "insumos", causeIds: ["trigo"], ...auroraDearerInputs()},
    ],
    added: [{id: "programas-redes", label: "Programas de antecipação das redes A e B", category: "operating", direction: "inflow", obligation: null, dates: ["2026-10-15"], amounts: ["23"]}],
  },
  covenant: {measurementId: "dez26-base", effects: [
    {causeId: "trigo", ebitda: "-0.6", cash: "0"},
    {causeId: "prazo-redes", ebitda: "0", cash: "-2.1"},
  ]},
  facilities: [
    {id: "programas-redes", label: "Programas das redes A e B", limit: "23", source: "Deliberação do conselho de 30/set"},
    {id: "conta-garantida", label: "Conta garantida", limit: "10", source: "Contrato da conta garantida"},
  ],
  steps: [
    {facilityId: "programas-redes", mode: "fixed", streamId: "programas-redes", replacesStreamIds: ["linha-17"]},
    {facilityId: "conta-garantida", mode: "residual", date: "2026-12-14"},
  ],
  dependents: [
    {id: "caixa-semanal", label: "Caixa semanal até dezembro", kind: "analysis", reads: ["caixa", "prazo", "trigo"], horizonStart: "2026-09-14", horizonEnd: "2027-01-03", recomputedBy: "weekly_cash"},
    {id: "covenant-dez26", label: "Covenant de dezembro de 2026", kind: "analysis", reads: ["ebitda", "caixa"], horizonStart: "2026-01-01", horizonEnd: "2026-12-31", recomputedBy: "covenant"},
    {id: "projecao-2026", label: "Projeção de 2026", kind: "plan", reads: ["receita", "ebitda", "caixa"], horizonStart: "2026-01-01", horizonEnd: "2026-12-31", recomputedBy: "projection"},
    {id: "tabela-divida", label: "Tabela de dívida (só os pagamentos de juros e do Finame de 15/set)", kind: "analysis", reads: [], horizonStart: "2026-09-30", horizonEnd: "2026-09-30", recomputedBy: null},
    {id: "plano-2027", label: "Plano para 2027, com o repasse do trigo concluído no primeiro trimestre", kind: "plan", reads: ["receita", "ebitda", "caixa"], horizonStart: "2027-01-01", horizonEnd: "2027-12-31", recomputedBy: null},
    {id: "linha-embalagem", label: "Análise da linha de embalagem", kind: "analysis", reads: ["ebitda", "caixa"], horizonStart: "2027-01-01", horizonEnd: "2031-12-31", recomputedBy: null},
    {id: "material-sondagem", label: "Material da sondagem da debênture (EBITDA de junho)", kind: "material", reads: ["ebitda"], horizonStart: "2025-07-01", horizonEnd: "2026-06-30", recomputedBy: null},
  ],
};
