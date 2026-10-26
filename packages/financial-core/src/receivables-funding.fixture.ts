import type {ReceivablesFundingInput, ReceivablesFundingItem, ReceivablesFundingOption} from "./receivables-funding";

/** Aurora Alimentos, portfolio of 15/set/2026 (ficha C35, synthetic), rebuilt from the independent
 * oracle (modelo_c35.py): six groups of R$ 62 mi, the varejo split by the oracle's premise of R$ 4 mi
 * of best-credit debtors, four receivables options and the bank line, for R$ 17 mi over six months.
 * Test fixture only: synthetic calibration, never a production parameter. BRL millions. */
const current = {originDate: "2026-09-15", dueDate: "2026-11-04", registration: "missing" as const, encumbranceHolder: null, releaseEvent: null, encumbrance: "free" as const,
  contract: "assignable" as const, anchorProgram: "none" as const, creditTier: "standard" as const, debtorCount: null, largestDebtorAmount: null};
// Each named debtor is keyed by itself; each bucket's debtor set is declared disjoint from the named debtors and the other buckets.
const item = (patch: Partial<ReceivablesFundingItem> & Pick<ReceivablesFundingItem, "id" | "label" | "amount">): ReceivablesFundingItem =>
  ({...current, debtorKey: patch.id, debtorSetDisjoint: patch.debtorCount === 1 ? null : true, ...patch});
const policy = {maxDaysPastDue: 0, maxRemainingTermDays: 180, registrationRule: "required" as const, minCreditTier: "standard" as const, sublimitPerDebtor: "3", anchorItemIds: [] as string[]};
const noIof = {iofDaily: "0", iofDailyCapDays: 0, iofAdditional: "0", rolloverDays: null, upfrontFee: "0", collateral: "none" as const};

export const auroraReceivablesItems: ReceivablesFundingItem[] = [
  item({id: "rede-a", label: "Rede A (maior cliente)", amount: "19.8", contract: "prohibited_without_consent", anchorProgram: "unknown", debtorCount: 1}),
  item({id: "redes-c-d", label: "Redes C e D", amount: "12", encumbrance: "assigned", encumbranceHolder: "Bradesco", releaseEvent: "pré-pagamento da CCB do Bradesco", debtorCount: 2}),
  item({id: "rede-b", label: "Rede B", amount: "3.7", anchorProgram: "active", debtorCount: 1}),
  item({id: "rede-e", label: "Rede E", amount: "4.5", creditTier: "selected", debtorCount: 1}),
  item({id: "rede-f", label: "Rede F", amount: "4.5", creditTier: "selected", debtorCount: 1}),
  item({id: "varejo-selecionado", label: "Varejo médio e atacado, sacados de melhor crédito", amount: "4", creditTier: "selected"}),
  item({id: "varejo-demais", label: "Varejo médio e atacado, demais sacados", amount: "11.3"}),
  item({id: "vencidos", label: "Vencidos acima de 30 dias", amount: "2.2", originDate: "2026-06-26", dueDate: "2026-08-15", debtorSetDisjoint: false}),
];
export const auroraReceivablesOptions: ReceivablesFundingOption[] = [
  {id: "risco-sacado-b", label: "Risco sacado da rede B", kind: "anchor_program", recourse: "without_recourse",
    eligibility: {...policy, registrationRule: "not_required", sublimitPerDebtor: null, anchorItemIds: ["rede-b"]}, rate: {basis: "di_plus", rate: "0.012"}, ...noIof, leadDaysMin: 10, leadDaysMax: 30},
  {id: "fidc-com-coobrigacao", label: "FIDC multicedente com coobrigação", kind: "fidc", recourse: "with_recourse", eligibility: policy,
    rate: {basis: "monthly", rate: "0.016"}, ...noIof, upfrontFee: "0.003", leadDaysMin: 15, leadDaysMax: 30},
  {id: "fidc-sem-coobrigacao", label: "FIDC multicedente sem coobrigação", kind: "fidc", recourse: "without_recourse", eligibility: {...policy, minCreditTier: "selected"},
    rate: {basis: "monthly", rate: "0.019"}, ...noIof, upfrontFee: "0.003", leadDaysMin: 15, leadDaysMax: 30},
  {id: "desconto-bancario", label: "Desconto bancário com rolagem", kind: "bank_discount", recourse: "with_recourse",
    eligibility: {...policy, registrationRule: "not_required", sublimitPerDebtor: null}, rate: {basis: "di_plus", rate: "0.028"},
    iofDaily: "0.000082", iofDailyCapDays: 365, iofAdditional: "0.0038", rolloverDays: 50, upfrontFee: "0", collateral: "receivables_assignment", leadDaysMin: null, leadDaysMax: null},
  {id: "linha-giro", label: "Linha de giro de seis meses", kind: "bank_line", recourse: "with_recourse", eligibility: null, rate: {basis: "di_plus", rate: "0.025"},
    iofDaily: "0.000082", iofDailyCapDays: 365, iofAdditional: "0.0038", rolloverDays: null, upfrontFee: "0.003", collateral: "unknown", leadDaysMin: null, leadDaysMax: null},
];
export const auroraReceivablesFunding: ReceivablesFundingInput = {
  currency: "BRL", referenceDate: "2026-09-15", items: auroraReceivablesItems, options: auroraReceivablesOptions,
  needAverage: "17", needPeak: "25", needStartDate: "2026-10-16", calendarDays: 180, businessDays: 126, annualDi: "0.149",
  averageTermDays: 50, needProfile: "seasonal", dedicatedVehicleThreshold: {min: "3", max: "5"}, lienBasketRemaining: "3",
};
