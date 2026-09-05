/**
 * Case 01 (Camil, banker preparing a meeting): the frozen inputs of `build-debt-ledger` as the
 * executor consumes them, curated from the review corpus of the case with an anchor on every
 * value, plus the helpers that build them. The product's integration_preview reads these
 * inputs instead of extracting them live; that is declared wherever they appear. Hypothetical
 * fixtures in this file are labelled as such in their own notes.
 */
import {type DebtLedgerInput} from "../../executors/build-debt-ledger";

/** Camil, ITR 31/05/2026 and 28/02/2026, consolidated, R$ thousand (answer key sections 1, 3, 5, 11.1 and 13.5). */
export const itr = (page: number, note?: string, table?: string) => ({document: "01_ITR_1T26_31mai2026.pdf", page, ...(note ? {note} : {}), ...(table ? {table} : {})});
export const trustee = (document: string, page: number) => ({document, page, table: "características das séries"});
export type Row = DebtLedgerInput["rows"][number];
/** Foreign bank lines: the ITR states that the parent guarantees the debts of its foreign subsidiaries (note 15, p. 40); the domestic line has no source for its guarantee. */
export const loan = (id: string, instrument: string, balance: string, prior: string, currency: string): Row => currency === "BRL"
  ? {id, instrument, obligation: {kind: "loan", disbursed: true, views: ["release", "contractual"]}, balance, priorBalance: prior, currency, anchors: {balance: itr(39, "15")}}
  : {id, instrument, obligation: {kind: "loan", disbursed: true, views: ["release", "contractual"]}, balance, priorBalance: prior, currency, guarantee: "garantia da controladora sobre as dívidas das controladas no exterior (sem individualização por contrato)", anchors: {balance: itr(39, "15"), guarantee: itr(40, "15: a controladora é garantidora das dívidas de suas controladas no exterior")}};
export const contra = (id: string, instrument: string, balance: string, prior: string): Row => ({id, instrument, balance, priorBalance: prior, currency: "BRL", contra: true, anchors: {balance: itr(39, "15")}});
/** The securitizadora holds the debentures formally (indenture preamble) and votes as the CRA holders instruct (securitization term). */
export const eco = (escritura: string, craTerm: {document: string; clause: string; page?: number}) => ({
  lender: {formalHolder: "Eco Securitizadora de Direitos Creditórios do Agronegócio S.A. (debenturista)", economicCreditors: "titulares dos CRA, que orientam a securitizadora em assembleia"},
  anchors: {lenderFormalHolder: {document: escritura, clause: "preâmbulo, considerando D", page: 3}, lenderEconomicCreditors: craTerm},
});
/** The 11th's covering report puts the maturity on page 1 and the remuneration on page 2. */
export const publicHolders = (escritura: string) => ({
  lender: {formalHolder: "debenturistas (oferta pública), representados pelo agente fiduciário", economicCreditors: "debenturistas"},
  anchors: {lenderFormalHolder: {document: escritura, clause: "preâmbulo", page: 1}, lenderEconomicCreditors: {document: escritura, clause: "preâmbulo", page: 1}},
});
export const deb = (id: string, issue: string, series: string, balance: string, prior: string, remuneration: Row["remuneration"], maturity: string, report: string, page: number, holder: ReturnType<typeof eco>, maturityPage = page): Row => ({
  id, instrument: `Debêntures ${issue}`, series, obligation: {kind: "debenture", disbursed: true, views: ["release", "contractual"]}, balance, priorBalance: prior, currency: "BRL",
  remuneration, maturity, guarantee: "quirografária", lender: holder.lender,
  anchors: {balance: itr(39, "15"), remuneration: trustee(report, page), maturity: trustee(report, maturityPage), guarantee: itr(39, "15"), ...holder.anchors},
});
export const cdi = (spread: string): Row["remuneration"] => ({type: "spread_over_index", index: "CDI", spreadPercentPerYear: spread});
export const pct = (percent: string): Row["remuneration"] => ({type: "percent_of_index", index: "CDI", percentOfIndex: percent});
export const ipca = (spread: string): Row["remuneration"] => ({type: "spread_over_index", index: "IPCA", spreadPercentPerYear: spread});
export const h11 = publicHolders("escritura_11a_emissao.pdf");
export const h13 = eco("escritura_13a_emissao.pdf", {document: "cra_292_termo_securitizacao.pdf", clause: "17.8.8: a securitizadora convoca os titulares dos CRA para orientar o exercício dos direitos nas debêntures"});
export const h14 = eco("escritura_14a_emissao.pdf", {document: "escritura_14a_emissao.pdf", clause: "7.26.5: a securitizadora convoca assembleia especial de titulares de CRA e delibera conforme a orientação", page: 55});
export const h15 = eco("escritura_15a_emissao.pdf", {document: "escritura_15a_emissao.pdf", clause: "7.26.5: a securitizadora convoca assembleia especial de titulares de CRA e delibera conforme a orientação", page: 56});
export const camil = (): DebtLedgerInput => ({
  referenceDate: "2026-05-31",
  priorDate: "2026-02-28",
  unit: "BRL thousand",
  unitAnchor: {document: "01_ITR_1T26_31mai2026.pdf", page: 11, note: "cabeçalho das demonstrações: em milhares de reais"},
  source: "note",
  rows: [
    loan("loan-brl", "Capital de giro, moeda nacional", "1314412", "951593", "BRL"),
    loan("loan-usd", "Capital de giro, USD", "867244", "492857", "USD"),
    loan("loan-clp", "Capital de giro, CLP", "54180", "43397", "CLP"),
    loan("loan-pen", "Capital de giro, PEN", "181158", "199398", "PEN"),
    contra("loan-costs", "Custo de transação (empréstimos)", "-9099", "-1123"),
    deb("deb-11-1", "11ª emissão", "1ª", "151795", "157626", cdi("1.55"), "2028-10-30", "af_11a_emissao.pdf", 2, h11, 1),
    deb("deb-11-2", "11ª emissão", "2ª", "505984", "525419", cdi("1.55"), "2028-10-30", "af_11a_emissao.pdf", 2, h11, 1),
    deb("deb-13-1", "13ª emissão", "1ª", "306038", "316694", cdi("0.65"), "2028-11-16", "af_13a_emissao.pdf", 2, h13),
    deb("deb-13-2", "13ª emissão", "2ª", "282357", "279335", ipca("6.3416"), "2030-11-18", "af_13a_emissao.pdf", 3, h13),
    deb("deb-13-3", "13ª emissão", "3ª", "110321", "109185", ipca("6.5264"), "2033-11-16", "af_13a_emissao.pdf", 4, h13),
    deb("deb-14-1", "14ª emissão", "1ª", "438918", "423854", pct("104"), "2029-06-15", "af_14a_emissao.pdf", 2, h14),
    deb("deb-14-2", "14ª emissão", "2ª", "204059", "195876", ipca("6.8286"), "2031-06-16", "af_14a_emissao.pdf", 3, h14),
    deb("deb-14-3", "14ª emissão", "3ª", "66024", "63457", ipca("6.9982"), "2034-06-15", "af_14a_emissao.pdf", 4, h14),
    deb("deb-15-1", "15ª emissão", "1ª", "770123", "795649", pct("105"), "2030-11-18", "af_15a_emissao.pdf", 2, h15),
    deb("deb-15-2", "15ª emissão", "2ª", "408703", "420902", {type: "fixed", ratePercentPerYear: "14.15"}, "2032-11-16", "af_15a_emissao.pdf", 3, h15),
    deb("deb-15-3", "15ª emissão", "3ª", "50401", "50020", ipca("8.20"), "2032-11-16", "af_15a_emissao.pdf", 4, h15),
    deb("deb-15-4", "15ª emissão", "4ª", "30793", "30591", ipca("8.70"), "2035-11-16", "af_15a_emissao.pdf", 5, h15),
    contra("deb-costs", "Custo de transação (debêntures)", "-63225", "-66347"),
  ],
  balanceSheet: {current: "1229828", nonCurrent: "4440358", anchor: itr(12, undefined, "Balanço patrimonial consolidado, empréstimos, financiamentos e debêntures")},
  schedule: {basis: "twelve_month_windows", periods: [
    {period: "2026/27", amount: "1229828", endsAt: "2027-05-31"}, {period: "2027/28", amount: "776868", endsAt: "2028-05-31"}, {period: "2028/29", amount: "1228475", endsAt: "2029-05-31"},
    {period: "2029/30", amount: "694497", endsAt: "2030-05-31"}, {period: "2030/31", amount: "994544", endsAt: "2031-05-31"}, {period: "after 2031", amount: "809198", endsAt: null}, {period: "debenture costs", amount: "-63224", endsAt: null},
  ], anchor: itr(40, "15")},
  cash: {
    cashAndEquivalents: {value: "1430714", anchor: itr(20, "3")},
    financialInvestments: {value: "25095", anchor: itr(11, undefined, "Balanço patrimonial consolidado, aplicações financeiras")},
    derivativeAssets: {value: "235", anchor: itr(51, "25")},
    derivativeLiabilities: {value: "14335", anchor: itr(51, "25")},
  },
  definitions: {
    // The release states no prose definition: the labeled rows of its table are the definition, and the method says a labeled table counts as one.
    release: {text: "Dívida bruta (-) Caixa e aplicações financeiras = Dívida líquida (linhas rotuladas da tabela Endividamento e Caixa)", anchor: {document: "ri_release_1t26.pdf", page: 12, table: "Endividamento e Caixa"}},
    contractual: {text: "somatória da rubrica de empréstimos, financiamentos e debêntures no passivo circulante e não circulante, mais a rubrica de operações com derivativos do passivo circulante e não circulante em seu balanço patrimonial, bem como qualquer outra rubrica que se refira à dívida onerosa da Emissora que venha a ser criada, menos a soma (a) da rubrica de disponibilidades (caixa e equivalentes à caixa) com (b) as aplicações financeiras (circulante e não circulante), com (c) operações com derivativos do ativo circulante e não circulante em seu balanço patrimonial, com base em valores extraídos do balanço patrimonial consolidado da Emissora", anchor: {document: "escritura_13a_emissao.pdf", clause: "1.1, Dívida Líquida", page: 7}},
  },
  releaseReportedNetDebt: {value: "4214400", anchor: {document: "ri_release_1t26.pdf", page: 12, table: "Endividamento e Caixa"}},
});

/** Deterministic permutation, different at every step. */
export const permute = <T>(items: T[], seed: number): T[] => {
  const copy = [...items];
  let state = seed;
  for (let index = copy.length - 1; index > 0; index -= 1) {
    state = (state * 1103515245 + 12345) % 2147483648;
    const swap = state % (index + 1);
    [copy[index], copy[swap]] = [copy[swap]!, copy[index]!];
  }
  return copy;
};
export const sumShares = (entries: Array<{shareOfGrossBeforeContra: string}>) => entries.reduce((sum, entry) => sum + Number(entry.shareOfGrossBeforeContra), 0);
