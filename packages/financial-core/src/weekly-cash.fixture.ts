import type {WeeklyCashInput, WeeklyCashStream} from "./weekly-cash";

/** Aurora Alimentos, 14/set/2026 to 03/jan/2027 (ficha C18, synthetic). Streams rebuilt from the
 * independent oracle's rules (modelo_c18.py): receipts 50 days after a daily billing, payroll on the
 * fifth weekday as the oracle counts it, charges, taxes, the harvest, the debt and three actions.
 * Test fixture only: synthetic calibration, never a production parameter. BRL millions. */
const iso = (d: Date) => d.toISOString().slice(0, 10);
const at = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));
const plus = (d: Date, days: number) => new Date(d.getTime() + days * 86400000);
const fifthWeekday = (y: number, m: number) => {let d = at(y, m, 1), k = 0; for (;;) {if (d.getUTCDay() % 6 !== 0 && ++k === 5) return d; d = plus(d, 1);}};
const money = (v: number) => v.toFixed(8).replace(/\.?0+$/, "");
const stream = (id: string, label: string, category: WeeklyCashStream["category"], direction: WeeklyCashStream["direction"], events: [Date, number][]): WeeklyCashStream =>
  ({id, label, category, direction, dates: events.map(([d]) => iso(d)), amounts: events.map(([, v]) => money(v))});

export function auroraWeeklyStreams(): WeeklyCashStream[] {
  const billing: Record<number, number> = {7: 36.5, 8: 37, 9: 37.5, 10: 38, 11: 41, 12: 42};
  const receipts: [Date, number][] = [];
  for (const [mm, v] of Object.entries(billing)) {
    const m = Number(mm), days = (m < 12 ? at(2026, m + 1, 1) : at(2027, 1, 1)).getTime() / 86400000 - at(2026, m, 1).getTime() / 86400000;
    for (let d = 0; d < days; d++) {
      const date = plus(at(2026, m, 1), d + 50);
      if (date >= at(2026, 9, 14) && date <= at(2027, 1, 3)) receipts.push([date, v / days]);
    }
  }
  const months = [9, 10, 11, 12];
  const monthly = (day: number, v: number): [Date, number][] => months.map(m => [at(2026, m, day), v]);
  const weekly = (offset: number, v: number): [Date, number][] => months.flatMap(m => [0, 1, 2, 3].map(w => [at(2026, m, offset + 7 * w), v] as [Date, number]));
  const inHorizon = (e: [Date, number][]) => e.filter(([d]) => d >= at(2026, 9, 14) && d <= at(2027, 1, 3));
  const harvest = (total: number, delayWeeks: number): [Date, number][] => Array.from({length: 11}, (_, k) => [plus(at(2026, 10, 16), 7 * (k + delayWeeks)), total / 11]);
  return [
    stream("recebimentos", "Recebimentos de clientes", "operating", "inflow", inHorizon(receipts)),
    stream("folha", "Folha", "statutory", "outflow", inHorizon(months.map(m => [fifthWeekday(2026, m), 3]))),
    stream("fgts", "FGTS", "statutory", "outflow", inHorizon(monthly(7, 0.6))),
    stream("inss", "INSS", "statutory", "outflow", inHorizon(monthly(20, 0.5))),
    stream("embalagem", "Embalagem (fornecedor, 60 dias)", "operating", "outflow", inHorizon(monthly(10, 2.5))),
    stream("finame", "Finame (principal e juros)", "debt", "outflow", inHorizon(monthly(15, 0.8))),
    stream("impostos-vendas", "Impostos sobre vendas (saldo a pagar)", "statutory", "outflow", inHorizon(monthly(25, 2.4))),
    stream("irpj-csll", "IRPJ e CSLL por estimativa", "statutory", "outflow", inHorizon(monthly(30, 0.9))),
    stream("arrendamentos", "Arrendamentos", "operating", "outflow", inHorizon(monthly(12, 0.25))),
    stream("insumos", "Fornecedores de insumos", "operating", "outflow", inHorizon(weekly(3, 5.8))),
    stream("despesas", "Despesas gerais", "operating", "outflow", inHorizon(weekly(4, 0.5))),
    stream("capex", "Capex de manutenção", "operating", "outflow", inHorizon(monthly(18, 0.7))),
    stream("decimo-1", "13º salário, 1ª parcela", "statutory", "outflow", [[at(2026, 11, 30), 1.5]]),
    stream("decimo-2", "13º salário, 2ª parcela e encargos", "statutory", "outflow", [[at(2026, 12, 18), 2.1]]),
    stream("ccb-juros", "CCB Bradesco, juros trimestrais", "debt", "outflow", [[at(2026, 9, 15), 1.7], [at(2026, 12, 15), 1.7]]),
    stream("debenture-amortizacao", "Debênture 2021, amortização", "debt", "outflow", [[at(2026, 12, 15), 15]]),
    stream("debenture-juros", "Debênture 2021, juros semestrais", "debt", "outflow", [[at(2026, 12, 15), 5.1]]),
    stream("safra", "Compra de safra", "operating", "outflow", harvest(25, 0)),
    stream("safra-30", "Compra de safra (R$ 30 mi)", "operating", "outflow", harvest(30, 0)),
    stream("safra-adiada", "Compra de safra adiada duas semanas", "operating", "outflow", inHorizon(harvest(25, 2))),
    stream("linha-17", "Linha da safra (desembolso)", "operating", "inflow", [[at(2026, 10, 15), 17]]),
    stream("linha-25", "Linha da safra de R$ 25 mi (desembolso)", "action", "inflow", [[at(2026, 10, 15), 25]]),
    stream("conta-garantida", "Conta garantida (saque)", "action", "inflow", [[at(2026, 12, 14), 8]]),
    stream("antecipacao", "Antecipação de recebíveis", "action", "inflow", [[at(2026, 12, 14), 8]]),
  ];
}
const common = ["recebimentos", "folha", "fgts", "inss", "embalagem", "finame", "impostos-vendas", "irpj-csll", "arrendamentos", "insumos", "despesas", "capex",
  "decimo-1", "decimo-2", "ccb-juros", "debenture-amortizacao", "debenture-juros"];
export const auroraWeeklyCash: WeeklyCashInput = {
  currency: "BRL", firstMonday: "2026-09-14", weeks: 16, openingCash: "41", minimumCash: "15", streams: auroraWeeklyStreams(),
  cases: [
    {id: "linha-17", label: "Com a linha da safra de R$ 17 mi em 15/out", role: "informed", streamIds: [...common, "safra", "linha-17"]},
    {id: "sem-linha", label: "Sem a linha", role: "alternative", streamIds: [...common, "safra"]},
    {id: "conta-garantida", label: "Linha de R$ 17 mi e saque de R$ 8 mi da conta garantida em 14/dez", role: "alternative", streamIds: [...common, "safra", "linha-17", "conta-garantida"]},
    {id: "antecipacao", label: "Linha de R$ 17 mi e antecipação de R$ 8 mi de recebíveis em 14/dez", role: "alternative", streamIds: [...common, "safra", "linha-17", "antecipacao"]},
    {id: "linha-25", label: "Linha de R$ 25 mi em 15/out", role: "alternative", streamIds: [...common, "safra", "linha-25"]},
    {id: "safra-30", label: "Safra de R$ 30 mi, com a linha de R$ 17 mi", role: "alternative", streamIds: [...common, "safra-30", "linha-17"]},
    {id: "safra-adiada", label: "Safra adiada duas semanas, com a linha de R$ 17 mi", role: "alternative", streamIds: [...common, "safra-adiada", "linha-17"]},
  ],
  actions: [
    {id: "conta-garantida", label: "Saque de R$ 8 mi da conta garantida por três semanas", streamId: "conta-garantida", amount: "8", days: 21,
      rate: "0.189215", ratePeriod: "annual", iofDaily: "0.000082", iofDailyCapDays: 365, iofAdditional: "0.0038", upfrontFee: "0", repaymentDate: "2027-01-04"},
    {id: "antecipacao", label: "Antecipação de R$ 8 mi de recebíveis", streamId: "antecipacao", amount: "8", days: 45,
      rate: "0.016", ratePeriod: "monthly", iofDaily: "0.000082", iofDailyCapDays: 365, iofAdditional: "0.0038", upfrontFee: "0", repaymentDate: "2027-01-28"},
    {id: "linha-25", label: "Linha da safra de R$ 25 mi em vez de 17 (R$ 8 mi a mais por seis meses)", streamId: "linha-25", amount: "8", days: 182,
      rate: "0.177725", ratePeriod: "annual", iofDaily: "0.000082", iofDailyCapDays: 365, iofAdditional: "0.0038", upfrontFee: "0.005", repaymentDate: "2027-04-15"},
  ],
  projectionClosing: {date: "2027-01-03", balance: "16"},
  calendarEnd: "2026-12-31", covenantTestDate: "2026-12-31",
};
