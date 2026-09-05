/**
 * Case 01 (Camil, banker preparing a meeting): the frozen inputs of `diagnose-maturity-wall` as the
 * executor consumes them, curated from the review corpus of the case with an anchor on every
 * value, plus the helpers that build them. The product's integration_preview reads these
 * inputs instead of extracting them live; that is declared wherever they appear. Hypothetical
 * fixtures in this file are labelled as such in their own notes.
 */
import {type MaturityWallInput} from "../../executors/diagnose-maturity-wall";

export const itr = (page: number, note?: string) => ({document: "01_ITR_1T26_31mai2026.pdf", page, ...(note ? {note} : {})});
export const threshold = {share: "0.20", policyKey: "policy.structure.maturity_wall", policyVersion: "2026.09.05-v8"};
export const prior = (amount: string) => ({amount, asOf: "2026-02-28", unit: "BRL thousand" as const, perimeter: "consolidated" as const, anchor: itr(40, "15, coluna 28/02/2026")});
/** Camil at 31/05/2026: the note 15 schedule by safra year, cash of note 3, the two approved operations of the 18/05/2026 board minutes (approved, not contracted, not disbursed). R$ thousand. */
export const camil = (): MaturityWallInput => ({
  referenceDate: "2026-05-31",
  unit: "BRL thousand",
  unitAnchor: {document: "01_ITR_1T26_31mai2026.pdf", page: 39, note: "nota 15, valores em R$ mil"},
  perimeter: "consolidated",
  grossDebt: {value: "5670186", unit: "BRL thousand", anchor: itr(39, "15")},
  periods: [
    {period: "2026/27", amount: "1229828", prior: prior("1074636"), endsAt: "2027-05-31"},
    {period: "2027/28", amount: "776868", prior: prior("712945"), endsAt: "2028-05-31"},
    {period: "2028/29", amount: "1228475", prior: prior("886187"), endsAt: "2029-05-31"},
    {period: "2029/30", amount: "694497", prior: prior("586660"), endsAt: "2030-05-31"},
    {period: "2030/31", amount: "994544", prior: prior("989147"), endsAt: "2031-05-31"},
    {period: "after 2031", amount: "809198", prior: prior("805151"), endsAt: null},
    {period: "debenture costs", amount: "-63224", kind: "adjustment", prior: prior("-66343"), endsAt: null},
  ],
  scheduleAnchor: itr(40, "15"),
  cash: {value: "1430714", definition: "accounting_equivalents_up_to_90_days", anchor: itr(20, "3")},
  operatingGeneration: null,
  claimedSources: [
    {id: "notas-comerciais-2026", label: "1ª emissão de notas comerciais, R$ 251 milhões, aprovada em 18/05/2026", amount: "251000", claimedPeriod: null, evidence: {approval: {date: "2026-05-18", anchor: {document: "ca_notas_comerciais_2026-05-27.pdf", page: 2, note: "ata do conselho: aprovação em 18/05/2026; a ata não nomeia o período do vencimento que a emissão cobre"}}, contract: null, disbursement: null}},
    {id: "cpr-2026", label: "operação estruturada com CPR, até R$ 535 milhões, aprovada em 18/05/2026", amount: "535000", claimedPeriod: null, evidence: {approval: {date: "2026-05-18", anchor: {document: "ca_operacao_estruturada_2026-05-27.pdf", page: 2, note: "ata do conselho: aprovação em 18/05/2026; a ata não nomeia o período que a operação cobre"}}, contract: null, disbursement: null}},
  ],
  wallThreshold: threshold,
  // The 13th's indenture writes the mechanics: the covenant is a non-automatic event (7.24.3(VIII)) and the acceleration is declared unless the assembly resolves otherwise (7.24.5); the accelerable balance is not asserted here.
  acceleration: {clause: {text: "descumprimento do índice financeiro é evento de vencimento antecipado não automático; a assembleia geral de debenturistas poderá deliberar pela não declaração do vencimento antecipado", anchor: {document: "escritura_13a_emissao.pdf", clause: "7.24.3(VIII) e 7.24.5", page: 55, note: "páginas 54-55"}}, defaultOutcome: "declared_unless_assembly_waives", accelerableBalance: null},
});
