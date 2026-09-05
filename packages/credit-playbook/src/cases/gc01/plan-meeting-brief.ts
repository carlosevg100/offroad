/**
 * Case 01 (Camil, banker preparing a meeting): the frozen inputs of `plan-meeting-brief` as the
 * executor consumes them, curated from the review corpus of the case with an anchor on every
 * value, plus the helpers that build them. The product's integration_preview reads these
 * inputs instead of extracting them live; that is declared wherever they appear. Hypothetical
 * fixtures in this file are labelled as such in their own notes.
 */
import {createHash} from "node:crypto";
import {planMeetingBrief, type BriefInput} from "../../executors/plan-meeting-brief";

/** Object contents as the executors that produce them would emit, and fingerprints recomputed from that content with the executor's own canonical hash. */
export const stableStringify = (value: unknown): string => JSON.stringify(value, (_key, inner: unknown) => (inner && typeof inner === "object" && !Array.isArray(inner) ? Object.fromEntries(Object.entries(inner as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) : inner));
export const contents: Record<string, Record<string, unknown>> = {
  a1: {unit: "R$ mil", gross_debt: "5670186", contractual_net_debt: "4228477"},
  b2: {unit: "R$ mil", walls: [{period: "2026/27", amount: "1229828"}, {period: "2028/29", amount: "1228475"}], peak: {period: "2026/27"}, coverage: {by_period: [{period: "2026/27", coverage: "1.18375"}]}},
  c3: {covenants: [{instrument: "13ª", index: {value: "4.72"}, tiers: ["3.50", "4.00"]}]},
  d4: {unit: "R$ mil", open_divergences: [{id: "dividends"}]},
  e5: {unit: "R$ mil", exit_costs: []},
  f6: {unit: "R$ mil", ranking: {order: [{id: "status-quo"}]}},
  a7: {unit: "R$ mil", scenarios: []},
  b8: {unit: "R$ mil", rows: []},
};
export const fp = (seed: string) => createHash("sha256").update(stableStringify(contents[seed] ?? {object: seed})).digest("hex");
export type Extra = {value?: {amount: string; unit: string} | null; stanceBasis?: {path: string; comparator: "nonempty" | "empty" | "truthy" | "falsy" | "lt" | "lte" | "gt" | "gte" | "eq" | "ne"; threshold?: string | null; whenTrue: "for" | "against"} | null};
export const headline = (text: string, stance: "for" | "against" | "neutral", seed: string, unit: string | null = null, objectPath = "headline", extra: Extra = {}) => ({text, stance, objectFingerprint: fp(seed), unit, objectPath, ...extra});
export const objects = (): BriefInput["objects"] => [
  {id: "ledger-01", kind: "debt_ledger", state: "complete", fingerprint: fp("a1"), content: contents.a1!, unit: "R$ mil", headlines: [headline("Dívida bruta de 5.670.186 em 31/05/2026", "neutral", "a1", "R$ mil", "gross_debt", {value: {amount: "5670186", unit: "R$ mil"}}), headline("Dívida líquida contratual de 4.228.477 em 31/05/2026", "neutral", "a1", "R$ mil", "contractual_net_debt", {value: {amount: "4228477", unit: "R$ mil"}})]},
  {id: "wall-01", kind: "maturity_wall", state: "diagnosed", fingerprint: fp("b2"), content: contents.b2!, unit: "R$ mil", headlines: [headline("Dois picos: 1.229.828 em 2026/27 e 1.228.475 em 2028/29", "against", "b2", "R$ mil", "walls", {value: {amount: "1229828", unit: "R$ mil"}, stanceBasis: {path: "walls", comparator: "nonempty", whenTrue: "against"}}), headline("Cobertura de 1,18375x do principal de 2026/27 pelo caixa e aplicações; cobertura aritmética, não disponibilidade em D0", "for", "b2", "x", "coverage.by_period[0].coverage", {value: {amount: "1.18375", unit: "x"}, stanceBasis: {path: "coverage.by_period[0].coverage", comparator: "gte", threshold: "1", whenTrue: "for"}})]},
  {id: "cov-01", kind: "covenants", state: "conditioned", fingerprint: fp("c3"), content: contents.c3!, unit: null, headlines: [headline("4,72x pró forma contra os degraus de 3,50x (enquanto os CRA de referência vivem) e 4,00x (condicionado à prova da quitação ordinária); medição em 28/02/2027; comparabilidade condicionada à abertura do EBITDA e às informações complementares da companhia", "against", "c3", "x", "covenants[0].index", {value: {amount: "4.72", unit: "x"}, stanceBasis: {path: "covenants[0].index.value", comparator: "gt", threshold: "4.00", whenTrue: "against"}})]},
  {id: "rec-01", kind: "reconciliation", state: "open_divergences", fingerprint: fp("d4"), content: contents.d4!, unit: "R$ mil", headlines: [headline("Dividendos com quatro valores; estoques em três apresentações", "against", "d4", null, "open_divergences", {stanceBasis: {path: "open_divergences", comparator: "nonempty", whenTrue: "against"}})]},
  {id: "exit-01", kind: "exit_costs", state: "complete", fingerprint: fp("e5"), content: contents.e5!, unit: "R$ mil", headlines: []},
  {id: "ba-01", kind: "before_after", state: "compared", fingerprint: fp("f6"), content: contents.f6!, unit: "R$ mil", headlines: [headline("Alongar as séries DI suaviza 2028/29", "for", "f6", null, "ranking", {stanceBasis: {path: "ranking.order", comparator: "nonempty", whenTrue: "for"}})]},
  {id: "sc-01", kind: "scenarios", state: "declared", fingerprint: fp("a7"), content: contents.a7!, unit: "R$ mil", headlines: []},
  {id: "blocked-01", kind: "interest_schedule", state: "blocked", fingerprint: fp("b8"), content: contents.b8!, unit: "R$ mil", headlines: [headline("must not appear", "for", "b8", null, "rows", {stanceBasis: {path: "rows", comparator: "empty", whenTrue: "for"}})]},
];
export const itr = {document: "01_ITR_1T26_31mai2026.pdf", page: 1};
export const turn1 = (): BriefInput => ({
  caseId: "gc01-analista-ib-camil",
  request: {turn: 1, audience: {primary: "vp"}, form: "first_deliverable", sponsorInstruction: "Ele falou em refinanciamento, mas não disse que tese quer levar nem que formato espera.", undefinedAspects: ["thesis", "format"]},
  objects: objects(),
  documents: ["01_ITR_1T26_31mai2026.pdf", "release_1T26.pdf"],
  candidateQuestions: [
    {id: "q-angle", text: "Leitura de refinanciamento ou alternativas mais amplas?", changesTheWork: "define o universo de alternativas", coverage: {searched: ["01_ITR_1T26_31mai2026.pdf", "release_1T26.pdf"], answeredBy: null, answer: null}, priority: 0},
    {id: "q-meeting", text: "Reunião exploratória ou produto a testar?", changesTheWork: "define profundidade e forma", coverage: {searched: ["01_ITR_1T26_31mai2026.pdf"], answeredBy: null, answer: null}, priority: 1},
    {id: "q-format", text: "Briefing interno, páginas de pitch ou análise com cenários?", changesTheWork: "define o material", coverage: {searched: ["01_ITR_1T26_31mai2026.pdf"], answeredBy: null, answer: null}, priority: 2},
    {id: "q-itr-date", text: "Qual é a data do último ITR?", changesTheWork: "define a data-base", coverage: {searched: ["01_ITR_1T26_31mai2026.pdf"], answeredBy: itr, answer: "31/05/2026, capa do ITR"}, priority: 0},
    {id: "q-trivial", text: "Qual a cor do template?", changesTheWork: "nenhuma", coverage: {searched: ["01_ITR_1T26_31mai2026.pdf"], answeredBy: null, answer: null}, priority: 0},
    {id: "q-fourth", text: "Quem vai à reunião?", changesTheWork: "tom do material", coverage: {searched: ["01_ITR_1T26_31mai2026.pdf"], answeredBy: null, answer: null}, priority: 9},
    {id: "q-unsearched", text: "Qual é o EBITDA dos últimos doze meses?", changesTheWork: "define a alavancagem", priority: 0},
  ],
});
export const block = (result: ReturnType<typeof planMeetingBrief>, id: string) => result.deliverable.blocks.find((entry) => entry.id === id)!;
