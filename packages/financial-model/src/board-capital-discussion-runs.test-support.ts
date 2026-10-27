import {createHash} from "node:crypto";
import Decimal from "decimal.js";
import {deterministicRunEvidenceFingerprint, type DeterministicMethodRun, type DeterministicMethodRunCase} from "@offroad/credit-playbook";
import {readBoardSourcePath} from "./board-capital-discussion";
import {boardCapitalDiscussionPacketOutputSchema, prepareBoardCapitalDiscussionPacket, type BoardCapitalDiscussionPacketInput} from "./board-capital-discussion-packet";
import type {AdoptionBasisEntry, AdoptionBasisSnapshot} from "@offroad/reconciliation";
import {auroraBoardBasis, auroraBoardFacts, auroraBoardReadings, auroraBoardSources, auroraCovenantPacket, auroraInvestmentPacket, auroraPlanPacket, auroraProjectionPacket, auroraReceivablesPacket, auroraWeeklyPacket, covenantWithAdverseDebt, debtTableWithCreditor, withBoardSource, withExtraBoardSource, type BoardTurn} from "./board-capital-discussion.test-support";
import {proposeBoardCapitalDiscussionHypotheses} from "./board-capital-discussion-premises";
import {composeBoundBoardCapitalDiscussion} from "./board-capital-discussion-composer";
import {analysisTestId} from "./adopted-analysis.test-support";

// Evaluation-only module; not exported to application consumers. All cases are synthetic calibrations of ficha C47
// over the published calibrations of the released methods, never production parameters.
const fingerprint = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
type Case = DeterministicMethodRunCase;
type Evidence = Omit<DeterministicMethodRun, "schemaVersion" | "humanApproval" | "run">;
type Packet = ReturnType<typeof prepareBoardCapitalDiscussionPacket>;
type CaseData = ReturnType<typeof auroraBoardBasis>["case"];
export const boardCapitalDiscussionMethodVersion = "2026.10.27-v1";
export const boardCapitalDiscussionRunIds = {
  gold: "prepare-board-capital-discussion-2026-10-27-v1-gold",
  adversarial: "prepare-board-capital-discussion-2026-10-27-v1-adversarial",
  consistency: "prepare-board-capital-discussion-2026-10-27-v1-consistency",
} as const;
export const boardQuestion = "Conselho na quarta. Prepara a discussão de estrutura de capital.";
export const boardPacketInput = (turn: BoardTurn = 2, edit: (c: CaseData) => void = () => undefined, after: (i: BoardCapitalDiscussionPacketInput) => void = () => undefined, question = boardQuestion) => {
  const i = {schemaVersion: "board-capital-discussion-packet-input.v1", question, analysis: auroraBoardBasis(turn, edit).seal()} as BoardCapitalDiscussionPacketInput; after(i); return i;
};
/** The full path: facts with origin, proposed premises, a confirmed basis, the composer over the stored results. */
export function boardPacketViaPremises(turn: BoardTurn = 2, edit: (c: CaseData) => void = () => undefined, question = boardQuestion,
  factsEdit: (f: ReturnType<typeof auroraBoardFacts>) => void = () => undefined) {
  let n = 9800;
  const facts = auroraBoardFacts(turn, edit); factsEdit(facts);
  const entries = proposeBoardCapitalDiscussionHypotheses(facts).map((h) => ({decisionId: analysisTestId(n++),
    slotKey: createHash("sha256").update(h.fieldPath + h.dimensions.scenario).digest("hex"), kind: "hypothesis", fieldPath: h.fieldPath, dimensions: {...h.dimensions}, value: h.value,
    observationId: null, referenceValue: null, referenceDimensions: null, definitionKind: "managerial", actorId: analysisTestId(5), reason: h.reason}) as AdoptionBasisEntry);
  const purpose = "synthetic board discussion";
  const snapshot: AdoptionBasisSnapshot = {schemaVersion: "contextual-adoption.v1", versionId: analysisTestId(601), setId: analysisTestId(6), workId: analysisTestId(7), purpose,
    contextKey: purpose, revision: 1, previousVersionId: null, classification: "working_basis", entries};
  const canonical = JSON.stringify(snapshot);
  return composeBoundBoardCapitalDiscussion({discussion: {envelope: {canonical, fingerprint: createHash("sha256").update(canonical).digest("hex")},
    scope: {workId: analysisTestId(7), purpose, versionId: analysisTestId(601)}}, question, sources: auroraBoardSources().map((x) => ({id: x.id, result: JSON.stringify(x.packet)}))});
}
function observe(id: string, input: BoardCapitalDiscussionPacketInput, expected: unknown, select: (p: Packet) => unknown): Case {
  const result = prepareBoardCapitalDiscussionPacket(input), observed = JSON.stringify(select(result)), expectation = JSON.stringify(expected);
  return {id, expectation, observed, inputFingerprint: fingerprint(input), outputFingerprint: fingerprint(result), passed: expectation === observed};
}
const current = (p: Packet) => p.result.discussion!.versions.at(-1)!;
/** Every text a version shows. */
export const boardShownTexts = (p: Packet) => {const v = current(p); return [v.summary, ...v.pages.flatMap((x) => [x.title, ...x.lines, x.recommendation ?? "", ...x.options]),
  ...v.deliberations.flatMap((x) => [x.title, x.text, ...x.deadlines.map((t) => t.action)]), ...v.questions.flatMap((x) => [x.question, x.answer]), ...v.appendix.map((x) => x.label)];};
/** The receivables case with the program of retailer A capped below the chain's balance: the readings state the new volumes. */
export const boardSublimitCase = (c: CaseData) => {
  c.extraReadings["program-a-volume"] = ["recebiveis", "readings.options[id=risco-sacado-a].volume", "1", "10.0"];
  c.extraReadings.programs = ["recebiveis", "readings.plan[optionId=risco-sacado-a].cumulative", "1", "13.7"];
};
export const boardSublimitExpected = "A rede A deve R$ 19,8 milhões dos R$ 62 milhões da carteira; o contrato com ela veda a cessão sem consentimento, mas o programa próprio da rede antecipa R$ 10,0 milhões sem regresso, a CDI mais 1,5% ao ano.";
/** The NPV of a case of an investment packet in millions with one decimal, as a reading states it (test side only). */
export const boardStatedMillions = (packet: Record<string, unknown>, caseId: string) => {
  const v = (packet.comparison as {metrics: {caseId: string; netPresentValue: string}[]}).metrics.find((m) => m.caseId === caseId)!.netPresentValue;
  return new Decimal(v).div(1000000).toDecimalPlaces(1, Decimal.ROUND_HALF_UP).toFixed(1);
};
/** The working-capital reading of the scenario prazo-60 as the case states it, from a given projection packet (test side only). */
export const boardWorkingCapitalReading = (packet: Record<string, unknown>): [string, string, string, string] => {
  const path = "readings.projected.scenarios[id=prazo-60].rows[periodId=2026-12-31].effects.changeInWorkingCapital";
  return ["projecao", path, "0", new Decimal(readBoardSourcePath(packet, path) as string).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toFixed(0)];
};
/** The weekly result where the case without the line keeps the line and loses the receipts, and the readings of that case. */
export const boardWeeklyVariant = () => auroraWeeklyPacket({lineKeptReceiptsMissing: true}) as unknown as Record<string, unknown>;
export const boardWeeklyVariantCase = (c: CaseData) => {
  const packet = boardWeeklyVariant(), at = (path: string) => readBoardSourcePath(packet, path) as string;
  c.extraReadings["sem-linha-min"] = ["caixa-semanal", "readings.sensitivities[caseId=sem-linha].minimum", "1",
    new Decimal(at("readings.sensitivities[caseId=sem-linha].minimum")).toDecimalPlaces(1, Decimal.ROUND_HALF_UP).toFixed(1)];
  c.extraReadings["sem-linha-week"] = ["caixa-semanal", "readings.sensitivities[caseId=sem-linha].weekStart", "day_long", at("readings.sensitivities[caseId=sem-linha].weekStart")];
};
/** One reading restated from a given packet with its decimals (test side only). */
export const boardRestated = (packet: Record<string, unknown>, source: string, path: string, places: number): [string, string, string, string] =>
  [source, path, String(places), new Decimal(readBoardSourcePath(packet, path) as string).toDecimalPlaces(places, Decimal.ROUND_HALF_UP).toFixed(places)];
/** The four numbers of one plan path restated from a given plan packet. */
export const boardRestatePath = (c: CaseData, packet: Record<string, unknown>, id: string) => {
  const at = `readings.paths[id=${id}].`;
  c.extraReadings[`${id}-cash`] = boardRestated(packet, "plano-2027", at + "minimumCash.amount", 0);
  c.extraReadings[`${id}-lev`] = boardRestated(packet, "plano-2027", at + "worstLeverage", 2);
  c.extraReadings[`${id}-cost`] = boardRestated(packet, "plano-2027", at + "horizonFinancingCost", 0);
  c.extraReadings[`${id}-net`] = boardRestated(packet, "plano-2027", at + "netDebtAtHorizon", 0);
};
/** Names the debt-table method was made to produce for the largest creditor, none of them an entry of the dictionary. */
export const boardOffDictionaryNames = ["Debenturistas; dívida total de R$ 999 milhões", "Bradesco \uff11\uff16", "retorno de menos dezasseis por minuto", "Caixa Total",
  "Bradesco Deve Dezassete Cêntimos", "Bradesco Deve Dezassete Biliões"];
export const boardOffDictionaryExpected = {status: "partial", gap: "page.divida.line.1.label.largest-creditor", line: "Prazo médio de 1,5 anos; maior credor: sem nome confirmado, com 46% da dívida.", shown: false};
export const boardOffDictionaryReading = (p: Packet, name: string) => ({status: p.status,
  gap: p.result.discussion!.gaps.find((g) => g.reason === "label_not_in_dictionary")?.item ?? null, line: current(p).pages.find((x) => x.id === "divida")!.lines[1],
  shown: boardShownTexts(p).some((t) => t.includes(name) || t.includes(name.normalize("NFKC")))});
export const boardRegisteredCreditorExpected = {basket: "Exceção de R$ 15 milhões para garantias, com R$ 12 milhões ocupados pelas garantias da dívida com Itaú.",
  question: "Por que não rolar a dívida com Itaú no vencimento?", named: 7, bradesco: false, status: "prepared_for_human_review"};
export const boardRegisteredCreditorReading = (p: Packet) => ({basket: current(p).pages.find((x) => x.id === "escritura")!.lines[0], question: current(p).questions[0]!.question,
  named: boardShownTexts(p).filter((t) => t.includes("dívida com Itaú")).length, bradesco: boardShownTexts(p).some((t) => t.includes("Bradesco")), status: p.status});
const pageOf = (p: Packet, id: string) => current(p).pages.find((x) => x.id === id)!;
/** The number each reading shows (dates as shown), without the unit words the formatter adds. */
const display = (p: Packet) => Object.fromEntries(p.result.discussion!.identity.map((x) => [x.figureId, ["date", "label", "flag", "calendar"].includes(x.unit) ? x.display : x.rounded.replace(".", ",")]));
const pick = (p: Packet, ids: string[]) => {const d = display(p); return Object.fromEntries(ids.map((x) => [x, d[x]]));};

/** The ficha's answer key, item by item; where the published method gives another number the method's is expected
 * and the ficha's is recorded beside it. */
export const boardFichaDivergences = [
  {page: 2, item: "prazo médio", ficha: "1,4 ano", method: "1,5 ano (1,4511 de build-company-debt-table, uma casa)", figureId: "wal"},
  {page: 3, item: "caixa abaixo do mínimo em dezembro", ficha: "sem número", method: "semana de 21/dez em -R$ 9,5 mi sem a linha da safra; mínimo de R$ 15 mi (project-weekly-cash)", figureId: "sem-linha-min"},
  {page: 5, item: "caixa da linha", ficha: "R$ 24 mi entre nov/26 e set/27", method: "fluxo acumulado de -R$ 21,7 mi em dez/27 (analyze-investment-project, grade anual)", figureId: "peak-need"},
  {page: 5, item: "payback", ficha: "seis anos contra três", method: "cerca de 6 anos; a meta de três anos não está em resultado revisado", figureId: "payback"},
  {page: 6, item: "programas das redes A e B", ficha: "cerca de R$ 23 mi, CDI + 1 a 1,5", method: "R$ 23,5 mi, CDI + 1,2 a 1,5 (monetize-receivables-for-working-capital, turno 2)", figureId: "programs"},
  {page: 8, item: "custo efetivo da debênture", ficha: "CDI + 3,4 a 3,6", method: "CDI + 3,46% a 3,56% ao ano (evaluate-financing-paths)", figureId: "deb-cost-low"},
  {page: 11, item: "demanda que mudaria a recomendação", ficha: "abaixo de R$ 80 mi", method: "abaixo de R$ 74,44 mi, o mínimo dentro dos critérios (evaluate-financing-paths)", figureId: "issue-floor"},
  {page: 0, item: "rede A na carteira", ficha: "32%", method: "R$ 19,8 mi de R$ 62 mi; o pacote não traz a participação", figureId: "rede-a"},
  {page: 0, item: "rating", ficha: "empata", method: "ganho líquido entre -R$ 0,17 mi e R$ 0,03 mi por ano (analyze-relative-debt-cost)", figureId: "rating-low"},
  {page: 5, item: "opção em etapas da linha", ficha: "seguir em etapas, com o custo", method: "pendente: não é caso revisado de analyze-investment-project", figureId: "stages-npv"},
] as const;

function goldCases(): Case[] {
  const t1 = () => boardPacketInput(1), t2 = () => boardPacketInput(2), t3 = () => boardPacketInput(3);
  const p1 = prepareBoardCapitalDiscussionPacket(t1()), p2 = prepareBoardCapitalDiscussionPacket(t2()), p3 = prepareBoardCapitalDiscussionPacket(t3());
  const reuse = (id: string, packet: Packet, input: () => BoardCapitalDiscussionPacketInput, expected: unknown, select: (p: Packet) => unknown): Case => {
    const observed = JSON.stringify(select(packet)), expectation = JSON.stringify(expected);
    return {id, expectation, observed, inputFingerprint: fingerprint(input()), outputFingerprint: fingerprint(packet), passed: expectation === observed};
  };
  const sources = auroraBoardSources();
  return [
    reuse("outline-before-material-when-there-is-time", p1, t1, {stage: "outline_proposed", withheld: true, material: null, versions: 0, status: "framed"},
      (p) => ({stage: p.readings!.stage, withheld: p.readings!.materialWithheld, material: p.readings!.material, versions: p.result.discussion!.versions.length, status: p.status})),
    reuse("outline-asks-only-what-changes-the-material", p1, t1, [["template", null], ["agenda_minutes", null], ["board_has_seen", "linha-embalagem"]],
      (p) => p.readings!.questionsBeforeMaterial.map((q) => [q.code, q.topicId])),
    reuse("four-deliberations-in-urgency-order", p2, t2, [["linha", ["2026-10-02"]], ["safra", ["2026-10-16"]], ["vencimentos", ["2026-10-31", "2026-11-15"]], ["politica", []]],
      (p) => p.readings!.deliberations.map((d) => [d.id, d.deadlines])),
    reuse("outline-in-the-same-urgency-order", p1, t1, ["linha", "safra", "vencimentos", "politica"], (p) => p.readings!.deliberations.map((d) => d.id)),
    reuse("deliberations-with-authority-and-the-supposed-authority-declared", p2, t2, {authority: ["board", "board", "board", "board"], pending: ["linha", "vencimentos", "politica", "safra"]},
      (p) => ({authority: current(p).deliberations.map((d) => d.authority), pending: p.readings!.pending.authority})),
    reuse("titles-pages-1-to-4-conclusion-and-number", p2, t2, ["Pedimos quatro decisões; três têm prazo", "A dívida é de R$ 130 milhões, concentrada em 2027", "O caixa fica abaixo do mínimo em 21 de dezembro e, mantida a dívida como está, chega a R$ -79 milhões no fim de 2027", "A escritura da debênture tem só R$ 3 milhões livres na exceção para garantias de nova dívida"],
      (p) => p.readings!.material!.titles.slice(0, 4).map((t) => t.title)),
    reuse("titles-pages-5-to-8-conclusion-and-number", p2, t2, ["A linha de embalagem rende 16% ao ano, acima do custo de capital de 15% ao ano", "Os programas das redes A e B antecipam R$ 23,5 milhões contra o pico de R$ 25 milhões da safra, sem dívida bancária nova", "Avaliamos 7 caminhos para 2027; só o recomendado passa em todos os critérios", "Recomendamos sondar uma debênture de até R$ 80 milhões, com prazo de 7 anos"],
      (p) => p.readings!.material!.titles.slice(4, 8).map((t) => t.title)),
    reuse("titles-pages-9-to-12-conclusion-and-number", p2, t2, ["A alavancagem fica abaixo da política de 2,5x nos cenários avaliados, com 2,37x no adverso de 2027", "A política de 2,5x precisa de uma definição de EBITDA", "A recomendação depende de demanda acima de R$ 74,44 milhões", "Próximos passos e datas"],
      (p) => p.readings!.material!.titles.slice(8, 12).map((t) => t.title)),
    reuse("every-page-carries-a-number", p2, t2, true, (p) => current(p).pages.every((x) => x.figureIds.length + x.pendingFigureIds.length + x.deadlineIds.length > 0)),
    reuse("numbers-checked-against-the-analyses-debt-covenant-and-cash", p2, t2, {
      "divida-total": "130", "principal-2027": "77", "share-12m": "28", "wal": "1,5", "largest-share": "46", "basket": "15", "basket-used": "12", "cov-limit": "3,0", "policy-limit": "2,5",
      "sem-linha-min": "-9,5", "min-cash": "15", "tight-week": "21 de dezembro", "lev-dez26": "2,2", "lev-dez27": "1,85", "lev-adv27": "2,37", "lev-ger-dez26": "2,0"},
      (p) => pick(p, ["divida-total", "principal-2027", "share-12m", "wal", "largest-share", "basket", "basket-used", "cov-limit", "policy-limit", "sem-linha-min", "min-cash",
        "tight-week", "lev-dez26", "lev-dez27", "lev-adv27", "lev-ger-dez26"])),
    reuse("numbers-checked-against-the-analyses-line-crop-projection-and-cost", p2, t2, {
      "irr": "16", "wacc": "15", "npv": "0,7", "payback": "6", "peak-need": "-21,7", "programs": "23,5", "spread-b": "1,2", "spread-a": "1,5",
      "ebitda-wheat": "52,6", "wc-60": "12", "fpa-2028": "86", "ref-2028": "59", "gap-bps": "125", "date-bps": "60", "rede-a": "19,8", "carteira": "62"},
      (p) => pick(p, ["irr", "wacc", "npv", "payback", "peak-need", "programs", "spread-b", "spread-a", "ebitda-wheat", "wc-60", "fpa-2028", "ref-2028", "gap-bps", "date-bps", "rede-a", "carteira"])),
    reuse("each-number-pinned-to-method-version-and-packet", p2, t2, {checked: Object.keys(auroraBoardReadings).length, pinned: true, all: true},
      (p) => {const s = new Map<string, (typeof sources)[number]>(sources.map((x) => [x.id, x])); const ids = p.result.discussion!.identity;
        return {checked: ids.length, pinned: ids.every((x) => s.get(x.sourceId)?.methodId === x.methodId && s.get(x.sourceId)?.packet.fingerprint === x.packetFingerprint), all: p.readings!.material!.allFiguresMatch};}),
    reuse("financing-plan-read-from-its-reviewed-result", p2, t2, {
      "cash-end-2027": "-79", "service-2027": "90", "available-2027": "36", "n-paths": "7", "debenture-amount": "80", "debenture-term": "7", "deb-cost-low": "3,46", "deb-cost-high": "3,56",
      "amort-first": "2029", "amort-last": "2033", "bradesco-gap": "18", "five-year-amort": "33", "five-year-available": "24", "alt-amount": "70", "cost-2028": "49", "net-debt-2028": "79"},
      (p) => pick(p, ["cash-end-2027", "service-2027", "available-2027", "n-paths", "debenture-amount", "debenture-term", "deb-cost-low", "deb-cost-high", "amort-first", "amort-last",
        "bradesco-gap", "five-year-amort", "five-year-available", "alt-amount", "cost-2028", "net-debt-2028"])),
    reuse("turn-2-without-pending-numbers", p2, t2, {status: "prepared_for_human_review", gaps: []}, (p) => ({status: p.status, gaps: p.gaps})),
    reuse("staged-option-pending-never-invented", p3, t3, {status: "partial", pending: ["page.linha.figure.stages-npv"], reasons: ["figure_pending_reviewed_result"]},
      (p) => ({status: p.status, pending: p.result.discussion!.gaps.map((g) => g.item), reasons: [...new Set(p.gaps.map((g) => g.reason))]})),
    reuse("summary-for-prior-reading-names-every-decision-and-date", p2, t2, {decisions: [true, true, true, true], dates: [true, true, true, true]},
      (p) => {const s = current(p).summary; return {decisions: ["(1)", "(2)", "(3)", "(4)"].map((x) => s.includes(x)), dates: ["2/out", "16/out", "31/out", "15/nov"].map((x) => s.includes(x))};}),
    reuse("appendix-cites-the-reviewed-results", p2, t2, [["Tabela de dívida", ["tabela-divida"]], ["Projeção por drivers e premissas", ["projecao"]], ["Plano da área financeira contra a base", ["plano-fpa"]], ["Fontes e datas das análises", 9]],
      (p) => current(p).appendix.map((a) => [a.label, a.sourceIds.length > 1 ? a.sourceIds.length : a.sourceIds])),
    reuse("likely-questions-with-answer-and-number", p2, t2, {count: 10, everyAnswerHasNumber: true,
      sample: "Da diferença de 125 pontos, 60 pontos vêm da data de contratação; o restante se divide entre prazo, garantia, distribuição do instrumento e escala."},
      (p) => ({count: current(p).questions.length, everyAnswerHasNumber: current(p).questions.every((q) => q.figureIds.length + q.pendingFigureIds.length > 0),
        sample: current(p).questions.find((q) => q.id === "serra-verde")!.answer})),
    reuse("pending-items-declared", p2, t2, {indicative: ["programs", "spread-a"], sources: ["covenant", "recebiveis"], template: "supplied_not_applied", safraSaysIndicative: true},
      (p) => ({indicative: p.readings!.pending.indicative, sources: p.readings!.pending.sources, template: p.readings!.pending.template,
        safraSaysIndicative: pageOf(p, "safra").lines[0]!.includes("indicativo")})),
    reuse("line-before-the-recommendation-when-the-board-has-not-seen-it", p2, t2, {line: 5, recommendation: 8, placement: "main", sideBySide: true},
      (p) => ({line: pageOf(p, "linha").number, recommendation: pageOf(p, "recomendacao").number, placement: pageOf(p, "linha").placement,
        sideBySide: pageOf(p, "linha").lines.some((l) => l.startsWith("Retorno")) && pageOf(p, "linha").lines.some((l) => l.startsWith("Motivo estratégico apresentado pelo presidente do conselho"))})),
    observe("line-the-board-has-seen-goes-to-the-appendix", boardPacketInput(2, (c) => {c.topics[0]!.seen = true;}), {placement: "appendix", mainPages: 11},
      (p) => ({placement: pageOf(p, "linha").placement, mainPages: p.readings!.material!.mainPages})),
    reuse("twelve-pages-fit-forty-five-minutes", p2, t2, {mainPages: 12, capacity: 15, fits: true}, (p) => ({mainPages: current(p).agenda.mainPages, capacity: current(p).agenda.capacity, fits: current(p).agenda.fits})),
    observe("pages-beyond-the-agenda-are-a-gap", boardPacketInput(2, (c) => {c.agendaMinutes = "30";}), {fits: false, gap: true},
      (p) => ({fits: p.readings!.material!.fitsAgenda, gap: p.gaps.some((g) => g.reason === "pages_exceed_agenda")})),
    reuse("turn-3-recommendation-withdrawn-and-facts-kept", p3, t3, {outcome: "applied", recommendation: null,
      kept: ["irr", "wacc", "npv", "payback", "peak-need", "npv-economy", "npv-capex", "npv-slow", "npv-defer", "irr-defer"], firstLine: "Retorno de 16% ao ano contra custo de capital de 15% ao ano; VPL de R$ 0,7 milhão."},
      (p) => ({outcome: p.readings!.omissions[0]!.outcome, recommendation: pageOf(p, "linha").recommendation, kept: p.readings!.omissions[0]!.keptFigureIds, firstLine: pageOf(p, "linha").lines[0]})),
    reuse("turn-3-options-with-criteria-and-numbers", p3, t3,
      ["Seguir agora: VPL de R$ 0,7 milhão e retorno de 16% ao ano.", "Seguir em etapas: VPL de [pendente].", "Esperar as cotações, com a linha adiada: VPL de R$ 1,4 milhão e retorno de 17% ao ano."],
      (p) => pageOf(p, "linha").options),
    reuse("turn-3-deliberation-becomes-the-choice-and-the-notice-stays", p3, t3,
      "decidir o caminho da linha de embalagem, e enviar ao fornecedor atual o aviso para renegociar o contrato até 2/out", (p) => current(p).deliberations[0]!.text),
    reuse("turn-3-prior-version-kept", p3, t3, {versions: [1, 2], priorRecommendation: true, priorFingerprint: true},
      (p) => {const v = p.result.discussion!.versions; return {versions: v.map((x) => x.version), priorRecommendation: v[0]!.pages.find((x) => x.id === "linha")!.recommendation !== null,
        priorFingerprint: p.readings!.material!.priorVersionFingerprint === v[0]!.fingerprint};}),
    observe("refuses-to-omit-the-return-on-request", boardPacketInput(3, (c) => {c.omissions = [{id: "sem-retorno", target: "figure", targetId: "irr", requestedBy: "requester.chair"}];}),
      {outcome: "refused", stillShown: true, versions: 1},
      (p) => ({outcome: p.readings!.omissions[0]!.outcome, stillShown: pageOf(p, "linha").lines[0]!.includes("16%"), versions: p.result.discussion!.versions.length})),
    observe("refuses-to-drop-the-line-page", boardPacketInput(3, (c) => {c.omissions = [{id: "sem-linha", target: "page", targetId: "linha", requestedBy: "requester.chair"}];}),
      {outcome: "refused", reason: "Os fatos materiais ficam no material, porque são o que o conselho precisa para decidir; sem eles, a escolha ficaria sem base.", pageKept: true},
      (p) => ({outcome: p.readings!.omissions[0]!.outcome, reason: p.readings!.omissions[0]!.reason, pageKept: current(p).pages.some((x) => x.id === "linha")})),
    observe("refuses-to-drop-the-leverage-risk", boardPacketInput(3, (c) => {c.omissions = [{id: "sem-risco", target: "page", targetId: "alavancagem", requestedBy: "requester.cfo"}];}),
      {outcome: "refused", pageKept: true}, (p) => ({outcome: p.readings!.omissions[0]!.outcome, pageKept: current(p).pages.some((x) => x.id === "alavancagem")})),
    observe("refuses-to-drop-the-notice-deadline", boardPacketInput(3, (c) => {c.omissions = [{id: "sem-prazo", target: "deadline", targetId: "linha.aviso", requestedBy: "requester.cfo"}];}),
      {outcome: "refused", reason: "O prazo fica, porque vale para qualquer caminho que o conselho escolher.", stillDated: true},
      (p) => ({outcome: p.readings!.omissions[0]!.outcome, reason: p.readings!.omissions[0]!.reason, stillDated: current(p).deliberations[0]!.text.includes("até 2/out")})),
    observe("a-request-for-the-deck-does-not-skip-the-outline", boardPacketInput(1, undefined, undefined, "Quero o deck com apêndice, no nosso template."), {withheld: true, material: null},
      (p) => ({withheld: p.readings!.materialWithheld, material: p.readings!.material})),
    observe("no-time-before-the-meeting-produces-the-material-with-the-outline", boardPacketInput(1, (c) => {c.askedOn = "2026-09-30";}), {stage: "material_prepared", questions: 0, template: "not_supplied"},
      (p) => ({stage: p.readings!.stage, questions: p.readings!.questionsBeforeMaterial.length, template: p.readings!.pending.template})),
    reuse("ficha-divergences-follow-the-published-methods", p2, t2, boardFichaDivergences.filter((x) => x.figureId in display(p2)).map((x) => [x.figureId, display(p2)[x.figureId]]),
      (p) => boardFichaDivergences.filter((x) => x.figureId in display(p)).map((x) => [x.figureId, display(p)[x.figureId]])),
    reuse("paths-page-compares-each-path", p2, t2, [
      "Sem a linha agora, com giro e debênture nova: caixa mínimo de R$ 15 milhões; alavancagem de 2,20x; custo de R$ 49 milhões; dívida líquida em 2028 de R$ 79 milhões; nos critérios: sim; anuência: não.",
      "Manter e rolar no vencimento: caixa mínimo de R$ -79 milhões; alavancagem de 2,38x; custo de R$ 25 milhões; dívida líquida em 2028 de R$ 81 milhões; nos critérios: não; anuência: não."],
      (p) => [pageOf(p, "caminhos").lines[0], pageOf(p, "caminhos").lines[3]]),
    reuse("paths-page-has-seven-paths-with-every-measure", p2, t2, {lines: 7, measures: true},
      (p) => ({lines: pageOf(p, "caminhos").lines.length, measures: pageOf(p, "caminhos").lines.every((l) => ["caixa mínimo", "alavancagem", "custo", "dívida líquida em 2028", "nos critérios", "anuência"].every((m) => l.includes(m)))})),
    reuse("every-material-fact-shown-in-the-current-version", p3, t3, {shown: true, deadlines: 4},
      (p) => ({shown: p.readings!.material!.materialFactsShown, deadlines: p.result.discussion!.materialFacts.deadlines.length})),
    observe("refuses-removing-a-date-that-shares-a-line-with-material-facts", boardPacketInput(2, (c) => {c.omissions = [{id: "sem-mes", target: "figure", targetId: "peak-date", requestedBy: "requester.cfo"}];}),
      {outcome: "refused", kept: ["payback", "peak-need"]}, (p) => ({outcome: p.readings!.omissions[0]!.outcome, kept: p.readings!.omissions[0]!.keptFigureIds})),
    observe("refuses-removing-a-date-that-carries-a-leverage-reading", boardPacketInput(2, (c) => {c.omissions = [{id: "sem-data", target: "figure", targetId: "dez27-date", requestedBy: "requester.cfo"}];}),
      {outcome: "refused", kept: ["lev-dez27"]}, (p) => ({outcome: p.readings!.omissions[0]!.outcome, kept: p.readings!.omissions[0]!.keptFigureIds})),
    observe("refuses-withdrawing-a-recommendation-that-alone-carries-material-facts", boardPacketInput(3, (c) => {
      const line = c.pages.find((x) => x.id === "linha")!;
      line.options = line.options.slice(0, 2);
    }), {outcome: "refused", kept: ["npv-defer", "irr-defer"], recommendationKept: true},
      (p) => ({outcome: p.readings!.omissions[0]!.outcome, kept: p.readings!.omissions[0]!.keptFigureIds, recommendationKept: pageOf(p, "linha").recommendation !== null})),
    ...boardOffDictionaryNames.map((name, k) => observe(`creditor-name-outside-the-dictionary-${k + 1}-shows-generic-words-and-a-gap`,
      withBoardSource("tabela-divida", debtTableWithCreditor(name), () => boardPacketInput(2)), boardOffDictionaryExpected, (p) => boardOffDictionaryReading(p, name))),
    observe("creditor-registered-as-another-bank-is-named-by-its-field", withBoardSource("tabela-divida", debtTableWithCreditor("Itaú", "Bradesco"), () => boardPacketInput(2)),
      boardRegisteredCreditorExpected, boardRegisteredCreditorReading),
    observe("program-sublimit-below-exposure-keeps-exposure-and-capacity-apart",
      withBoardSource("recebiveis", auroraReceivablesPacket({sublimitA: "10"}) as unknown as Record<string, unknown>, () => boardPacketInput(2, boardSublimitCase)),
      boardSublimitExpected, (p) => current(p).questions.find((q) => q.id === "rede-a")!.answer),
    reuse("strategic-reason-shown-as-the-chair-s-informed-fact", p2, t2, {line: "Motivo estratégico apresentado pelo presidente do conselho: reduzir a dependência de um único fornecedor de embalagem.",
      informed: [{id: "motivo-estrategico", origin: "informed", author: "chair", text: "reduzir a dependência de um único fornecedor de embalagem"}], figures: []},
      (p) => ({line: pageOf(p, "linha").lines[3], informed: p.result.discussion!.informed,
        figures: current(p).bindings.filter((b) => b.templateId === "topic.project_strategic_reason").flatMap((b) => b.figureId ? [b.figureId] : [])})),
    observe("line-kept-with-receipts-missing-never-says-without-the-line",
      withBoardSource("caixa-semanal", boardWeeklyVariant(), () => boardPacketInput(2, boardWeeklyVariantCase)), {alternative: true, withoutTheLine: false, status: "prepared_for_human_review"},
      (p) => ({alternative: pageOf(p, "caixa").lines[0]!.startsWith("No caso alternativo de menor caixa"), withoutTheLine: boardShownTexts(p).some((t) => /sem a linha da safra/i.test(t)), status: p.status})),
    reuse("every-number-of-the-final-text-verified", p2, t2, {verified: true, match: true}, (p) => ({verified: p.readings!.material!.verifiedNumbers > 100, match: p.readings!.material!.allFiguresMatch})),
    reuse("never-presents-or-sends", p3, t3, {presented: false, sent: false, grants: false}, (p) => ({presented: p.readings!.presented, sent: p.readings!.sentToThirdParties, grants: p.grantsExecution})),
  ];
}

const forge = (path: "grantsExecution" | "presented" | "sentToThirdParties") => () => {
  const p = prepareBoardCapitalDiscussionPacket(boardPacketInput(2));
  boardCapitalDiscussionPacketOutputSchema.parse(path === "grantsExecution" ? {...p, grantsExecution: true} : {...p, readings: {...p.readings, [path]: true}});
};
/** A source packet altered after its execution, with or without a fingerprint made to match. */
function alterSource(id: string, change: (packet: Record<string, unknown>) => void, refingerprint: boolean, rename = false) {
  return () => {
    const i = boardPacketInput(2);
    const s = i.analysis.sources.find((x) => x.id === id)!, packet = JSON.parse(s.packet) as Record<string, unknown>;
    change(packet);
    if (refingerprint) {
      const {fingerprint: _f, ...payload} = packet;
      packet.fingerprint = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
      if (rename) renameSource(i, id, packet.fingerprint as string);
    }
    s.packet = JSON.stringify(packet);
    return i;
  };
}
/** Rebuilds the discussion basis so that it names the altered packet by its new fingerprint. */
function renameSource(i: BoardCapitalDiscussionPacketInput, id: string, newFingerprint: string) {
  const canonical = i.analysis.discussion.envelope.canonical, old = (JSON.parse(canonical) as {entries: {fieldPath: string; value: {value: string[]}}[]}).entries
    .find((e) => e.fieldPath.endsWith(`.source.${id}`))!.value.value[1]!;
  const next = canonical.split(old).join(newFingerprint);
  i.analysis.discussion.envelope = {canonical: next, fingerprint: createHash("sha256").update(next).digest("hex")};
  return i;
}

function adversarialCases(): Case[] {
  const attempts: [string, () => unknown, string][] = [
    ["material-without-decisions", () => boardPacketInput(2, (c) => {c.pages[0]!.role = "situation"; c.pages[0]!.title = "constraint.indenture_basket|saldo=basket-free";}), "board_capital_material_without_decisions"],
    ["material-with-no-deliberation", () => boardPacketInput(2, (c) => {c.deliberations = [];}), "Too small"],
    ["divergent-number", () => boardPacketInput(2, (c) => {void c;}, (i) => {
      const e = JSON.parse(i.analysis.discussion.envelope.canonical) as {entries: {fieldPath: string; value: {value: string[]}}[]};
      e.entries.find((x) => x.fieldPath.endsWith(".figure.wal.reading"))!.value.value[3] = "1.4";
      const canonical = JSON.stringify(e); i.analysis.discussion.envelope = {canonical, fingerprint: createHash("sha256").update(canonical).digest("hex")};
    }), "board_capital_figure_diverges:wal"],
    ["concatenated-digits-in-an-answer", () => boardPacketInput(2, (c) => {c.questions[0]!.answer += " Dívida {divida-total}{basket-free}.";}), "must match pattern"],
    ["sign-written-before-a-reading-in-the-summary", () => boardPacketInput(2, (c) => {c.summary.closing += " Dívida -{divida-total}.";}), "must match pattern"],
    ["year-reading-used-as-money", () => boardPacketInput(2, (c) => {c.appendix[0]!.label += " de R$ {year-2027}";}), "must match pattern"],
    ["literal-year-written-by-hand", () => boardPacketInput(2, (c) => {c.appendix[0]!.label += " de R$ 2027 mi";}), "must match pattern"],
    ["currency-written-before-a-reading", () => boardPacketInput(2, (c) => {c.pages[1]!.lines[0] += " Dívida de US$ {divida-total}.";}), "must match pattern"],
    ["money-in-billions-instead-of-millions", () => boardPacketInput(2, (c) => {c.pages[1]!.title += " Dívida {divida-total} bilhões.";}), "must match pattern"],
    ["years-shown-as-months", () => boardPacketInput(2, (c) => {c.pages[1]!.lines[1] += " Prazo de {wal} meses.";}), "must match pattern"],
    ["annual-rate-shown-as-monthly", () => boardPacketInput(2, (c) => {c.pages[4]!.lines[0] += " Retorno de {irr} ao mês.";}), "must match pattern"],
    ["calendar-reading-used-as-reais", () => boardPacketInput(2, (c) => {c.summary.closing += " A dívida vence em {year-2027} reais.";}), "must match pattern"],
    ["calendar-reading-with-an-iso-currency", () => boardPacketInput(2, (c) => {c.summary.closing += " A dívida é de {year-2027} BRL.";}), "must match pattern"],
    ["calendar-reading-as-a-percent-in-words", () => boardPacketInput(2, (c) => {c.questions[0]!.answer += " A taxa é de {year-2027} por cento ao ano.";}), "must match pattern"],
    ["calendar-reading-as-a-value", () => boardPacketInput(2, (c) => {c.questions[0]!.answer += " A dívida é de {year-2027}.";}), "must match pattern"],
    ["capitalized-scale-without-a-marker", () => boardPacketInput(2, (c) => {c.questions[0]!.answer += " Em Bilhões de Reais, a dívida vence em {year-2027}.";}), "must match pattern"],
    ...([["principal-as-label", "tabela-divida", "result.table.reconciliation.principal"], ["spread-as-label", "recebiveis", "readings.options[id=risco-sacado-a].spreadOverDi"],
      ["npv-as-label", "linha-embalagem", "comparison.metrics[caseId=base].netPresentValue"]] as const).map(([id, source, path]) => [`financial-field-read-as-a-label-${id}`,
      () => boardPacketInput(2, (c) => {c.extraReadings[id] = [source, path, "-"]; c.pages[1]!.title = `situation.debt_total|total=${id}|ano=year-2027`;}), "board_capital_figure_without_statement"] as [string, () => unknown, string]),
    ["field-outside-the-registry", () => boardPacketInput(2, (c) => {c.extraReadings["irr-gap"] = ["linha-embalagem", "comparison.metrics[caseId=base].irrMinusDiscountRate", "2", "0.8"]; c.pages[1]!.title = "situation.debt_total|total=irr-gap|ano=year-2027";}), "board_capital_field_not_registered:irr-gap"],
    ["date-format-on-a-number", () => boardPacketInput(2, (c) => {c.extraReadings["wal-date"] = ["tabela-divida", "result.table.profile.weightedAverageLifeYears", "day_month", "2026-12-31"]; c.pages[1]!.title = "situation.debt_total|total=divida-total|ano=wal-date";}), "board_capital_figure_without_origin:wal-date"],
    ["scale-chosen-by-the-contribution", () => boardPacketInput(2, (c) => {c.extraReadings["debt-thousand"] = ["tabela-divida", "result.table.reconciliation.principal", "0", "130000"]; c.pages[1]!.title = "situation.debt_total|total=debt-thousand|ano=year-2027";}), "board_capital_figure_diverges:debt-thousand"],
    ["fullwidth-digits-in-a-line", () => boardPacketInput(2, (c) => {c.pages[1]!.lines[1] += " O prazo médio é de \uff11,\uff16 ano.";}), "must match pattern"],
    ["arabic-indic-digits-in-an-answer", () => boardPacketInput(2, (c) => {c.questions[0]!.answer += " A dívida é de \u0661\u0663\u0660.";}), "must match pattern"],
    ["calendar-reading-as-an-amount-in-yen", () => boardPacketInput(2, (c) => {c.summary.closing += " A dívida equivale a {em:year-2027} ienes.";}), "must match pattern"],
    ["calendar-reading-after-a-preposition", () => boardPacketInput(2, (c) => {c.summary.closing += " A dívida equivale a {em:year-2027}.";}), "must match pattern"],
    ["cents-in-free-text", () => boardPacketInput(2, (c) => {c.pages[1]!.lines[0] += " Custo de {divida-total} e centavos.";}), "must match pattern"],
    ["thousands-in-free-text", () => boardPacketInput(2, (c) => {c.pages[1]!.lines[0] += " Milhares de reais em caixa.";}), "must match pattern"],
    ["per-week-in-free-text", () => boardPacketInput(2, (c) => {c.pages[4]!.lines[0] += " Retorno de {irr} por semana.";}), "must match pattern"],
    ["per-semester-in-free-text", () => boardPacketInput(2, (c) => {c.pages[4]!.lines[0] += " Retorno de {irr} por semestre.";}), "must match pattern"],
    ["duration-in-parentheses", () => boardPacketInput(2, (c) => {c.pages[1]!.lines[1] += " Prazo de {wal} (sete anos).";}), "must match pattern"],
    ["value-after-a-date-preposition", () => boardPacketInput(2, (c) => {c.pages[1]!.lines[0] += " Dívida em {divida-total}.";}), "must match pattern"],
    ["discussion-in-another-currency", () => boardPacketViaPremises(2, () => undefined, undefined, (f) => {(f as {currency: string}).currency = "USD";}), "board_capital_currency_not_supported:USD"],
    ["unknown-template-id", () => boardPacketInput(2, (c) => {c.pages[1]!.title = "situation.debt_total_reversed|total=divida-total|ano=year-2027";}), "board_capital_template_unknown"],
    ["slot-left-unbound", () => boardPacketInput(2, (c) => {c.pages[1]!.title = "situation.debt_total|total=divida-total";}), "board_capital_slot_unbound"],
    ["slot-the-template-does-not-have", () => boardPacketInput(2, (c) => {c.pages[1]!.title = "situation.debt_total|total=divida-total|ano=year-2027|sinal=irr";}), "board_capital_slot_invalid"],
    ["years-bound-to-a-months-slot", () => boardPacketInput(2, (c) => {c.pages[10]!.lines[1] = "what_changes.wheat|choque=wheat-shock|defasagem=wal|ano=year-2027|ebitda=ebitda-wheat";}), "board_capital_slot_type_mismatch"],
    ["value-bound-to-a-date-slot", () => boardPacketInput(2, (c) => {c.pages[1]!.title = "situation.debt_total|total=divida-total|ano=divida-total";}), "board_capital_slot_type_mismatch"],
    ["prose-in-a-binding", () => boardPacketInput(2, (c) => {c.pages[1]!.title = "situation.debt_total|total=menos divida-total|ano=year-2027";}), "must match pattern"],
    ["literal-number-in-a-title", () => boardPacketInput(2, (c) => {c.pages[1]!.title = "A dívida é de R$ 130 milhões, curta e concentrada em {year-2027}";}), "must match pattern"],
    ["literal-deadline-in-a-line", () => boardPacketInput(2, (c) => {c.pages[11]!.lines[0] = "2/out: aviso ao fornecedor de embalagem.";}), "must match pattern"],
    ["reading-that-does-not-resolve", () => alterReading("principal-2027", (r) => {r[1] = "result.table.profile.scheduleByYear[year=2099].principal";}), "board_capital_figure_without_origin:principal-2027"],
    ["reading-of-an-unnamed-result", () => alterReading("wal", (r) => {r[0] = "outra-analise";}), "board_capital_figure_without_origin:wal"],
    ["tampered-reviewed-result", alterSource("tabela-divida", (p) => {(p.result as {table: {reconciliation: {principal: string}}}).table.reconciliation.principal = "120";}, false), "board_capital_source_fingerprint_mismatch:tabela-divida"],
    ["reviewed-result-of-another-version", alterSource("covenant", (p) => {p.executorVersion = "2026.10.01-v1";}, false), "board_capital_source_version_mismatch:covenant"],
    ["reviewed-result-the-basis-does-not-name", alterSource("caixa-semanal", (p) => {p.question = "Outra pergunta";}, true), "board_capital_source_not_named:caixa-semanal"],
    ["reviewed-result-of-another-company", alterSource("caixa-semanal", (p) => {p.entityId = "ac400000-0000-4000-9000-000000000002";}, true, true), "board_capital_source_context_mismatch:caixa-semanal"],
    ["result-of-an-unreleased-method", () => boardPacketInput(2, undefined, (i) => {
      const e = JSON.parse(i.analysis.discussion.envelope.canonical) as {entries: {fieldPath: string; value: {value: string[]}}[]};
      e.entries.find((x) => x.fieldPath.endsWith(".source.covenant"))!.value.value[0] = "prepare-capital-structure-decision";
      const canonical = JSON.stringify(e); i.analysis.discussion.envelope = {canonical, fingerprint: createHash("sha256").update(canonical).digest("hex")};
    }), "Invalid option"],
    ["extra-result-beside-the-named-ones", () => boardPacketInput(2, undefined, (i) => {i.analysis.sources.push({id: "extra", packet: i.analysis.sources[0]!.packet});}), "board_capital_source_not_named"],
    ["title-without-an-economic-number", () => boardPacketInput(2, (c) => {c.pages[3]!.title = "next_steps.title";}), "board_capital_title_without_number:escritura"],
    ["next-steps-without-a-deadline", () => boardPacketInput(2, (c) => {c.pages[11]!.lines = ["topic.project_value|retorno=irr|custo=wacc|vpl=npv"];}), "board_capital_page_without_number:passos"],
    ["false-number-in-a-deliberation-title", () => boardPacketInput(2, (c) => {c.deliberations[0]!.title = "Linha de embalagem com retorno de 16,1%";}), "must match pattern"],
    ["false-number-in-an-appendix-label", () => boardPacketInput(2, (c) => {c.appendix[0]!.label = "Tabela de dívida de R$ 130,1 milhões";}), "must match pattern"],
    ["false-number-in-an-option-not-yet-shown", () => boardPacketInput(2, (c) => {c.pages[4]!.options[1] = "Seguir em etapas: VPL de R$ 0,9 milhão.";}), "must match pattern"],
    ["paraphrase-that-drops-a-material-fact", () => boardPacketInput(2, (c) => {c.pages[4]!.lines[1] = "topic.project_value|retorno=irr|custo=wacc|vpl=npv";}), "board_capital_material_fact_not_shown:payback"],
    ["percent-sign-written-after-a-rate", () => boardPacketInput(2, (c) => {c.pages[5]!.lines[0] = "Programas a CDI mais {spread-b}% a {spread-a}, em condições indicativas.";}), "must match pattern"],
    ["question-text-used-as-an-answer", () => boardPacketInput(2, (c) => {c.questions[6]!.answer = "q.cost";}), "board_capital_template_use_invalid:question.estrategica.answer"],
    // Review r7: every slot is a concept, every deadline an action, every fixed assertion a condition, every source label a name.
    ...boardConceptAttempts(boardPacketInput),
    ["tampered-envelope", () => boardPacketInput(2, undefined, (i) => {i.analysis.discussion.envelope = {...i.analysis.discussion.envelope, canonical: i.analysis.discussion.envelope.canonical.replace("2026-10-02", "2026-10-09")};}), "adoption_basis_integrity_mismatch"],
    ["free-material-in-request", () => ({...boardPacketInput(2), material: {pages: []}}), "Unrecognized key"],
    ["fabricated-grant-in-result", forge("grantsExecution"), "grantsExecution"],
    ["fabricated-presentation-in-result", forge("presented"), "presented"],
    ["fabricated-sending-in-result", forge("sentToThirdParties"), "sentToThirdParties"],
  ];
  return attempts.map(([id, build, message]) => {
    let observed: string, passed: boolean, input: unknown;
    try {
      input = build();
      if (input !== undefined) prepareBoardCapitalDiscussionPacket(input);
      observed = "accepted"; passed = false;
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      passed = detail.includes(message); observed = passed ? "rejected by expected boundary" : `unexpected error: ${detail.slice(0, 250)}`;
    }
    return {id, expectation: "rejected by expected boundary", observed, inputFingerprint: fingerprint(input ?? null), outputFingerprint: fingerprint({observed}), passed};
  });
}
/** The evasions of review r7, by meaning: each binds a valid reading of the right dimension to the wrong concept, a
 * valid deadline to the wrong action, a text to the wrong field or deliberation, or a label produced by the source
 * method that is not a name. Shared by the recorded runs (sealed basis) and the property tests (full path). */
export function boardConceptAttempts(build: (turn: BoardTurn, edit: (c: CaseData) => void) => unknown): [string, () => unknown, string][] {
  const row = (name: string, id: string) => `alternatives.row.${name}|caixa=${id}-cash|alavancagem=${id}-lev|custo=${id}-cost|ano=year-2028|divida=${id}-net|criterios=${id}-ok|anuencia=${id}-consent`;
  const finame = (c: CaseData) => {c.extraReadings["finame-creditor"] = ["tabela-divida", "result.table.rows[id=finame].creditor", "-"];};
  const covenant = "measure-covenant-headroom";
  return [
    ["return-and-cost-of-capital-swapped", () => build(2, (c) => {c.pages[4]!.title = "topic.project_return|retorno=wacc|custo=irr";}), "board_capital_slot_concept_mismatch:topic.project_return:retorno"],
    ["debt-total-bound-to-the-free-basket", () => build(2, (c) => {c.pages[1]!.title = "situation.debt_total|total=basket-free|ano=year-2027";}), "board_capital_slot_concept_mismatch:situation.debt_total:total"],
    ["program-cost-bound-to-debt-shares", () => build(2, (c) => {c.pages[5]!.lines.push("topic.crop_program_cost|taxa_b=share-12m|taxa_a=largest-share");}), "board_capital_slot_concept_mismatch:topic.crop_program_cost:taxa_b"],
    ["positive-npv-under-a-negative-claim", () => build(2, (c) => {c.pages[4]!.lines[2] = "topic.project_sensitivities|vpl_economia=npv|vpl_capex=npv-capex|vpl_partida=npv-slow";}),
      "board_capital_slot_concept_mismatch:topic.project_sensitivities:vpl_economia"],
    ["path-row-reading-another-path", () => build(2, (c) => {c.pages[6]!.lines[3] = row("keep_and_roll", "sem-linha-debenture");}), "board_capital_slot_concept_mismatch:alternatives.row.keep_and_roll:caixa"],
    ["ebitda-of-another-year", () => build(2, (c) => {c.pages[10]!.lines[1] = "what_changes.wheat|choque=wheat-shock|defasagem=wheat-lag|ano=year-2028|ebitda=ebitda-wheat";}),
      "board_capital_slot_concept_mismatch:what_changes.wheat:ebitda:variable_y"],
    ["concentration-year-that-is-not-the-largest", () => build(2, (c) => {c.pages[1]!.title = "situation.debt_total|total=divida-total|ano=year-2028";}), "board_capital_template_condition_failed:situation.debt_total"],
    ["adverse-leverage-dated-in-another-year", () => build(2, (c) => {c.pages[8]!.title = "risk.leverage|politica=policy-limit|adverso=lev-adv27|ano=year-2026";}), "board_capital_template_condition_failed:risk.leverage"],
    ["notice-dated-with-the-route-deadline", () => build(2, (c) => {c.pages[11]!.lines[0] = "next_steps.notice|prazo=deadline:vencimentos.rota";}), "board_capital_deadline_action_mismatch:next_steps.notice:prazo:vencimentos.rota"],
    ["fallback-dated-with-the-sounding-deadline", () => build(2, (c) => {c.pages[7]!.lines[2] = "recommendation.alternative|prazo=deadline:vencimentos.sondagem";}),
      "board_capital_deadline_action_mismatch:recommendation.alternative"],
    ["action-of-another-deliberation", () => build(2, (c) => {c.deliberations[0]!.deadlines[0]!.action = "delib.action.decide_route";}), "board_capital_deliberation_text_mismatch:deliberation.linha.deadline.aviso"],
    ["subject-of-another-deliberation", () => build(2, (c) => {c.deliberations[0]!.subject = "delib.crop.subject|ano=year-2026";}), "board_capital_deliberation_text_mismatch:deliberation.linha.subject"],
    ["page-line-used-as-a-deliberation-subject", () => build(2, (c) => {c.deliberations[0]!.subject = "topic.project_payback|payback=payback|pico=peak-need|data=peak-date";}),
      "board_capital_template_use_invalid:deliberation.linha.subject"],
    ["answer-to-another-question", () => build(2, (c) => {c.questions[0]!.answer = "a.peer|total=gap-bps|data=date-bps";}), "board_capital_answer_mismatch:bradesco"],
    // Review r8: one package per method, and a creditor named only by the creditor field of the right row.
    ["second-package-of-the-same-method", () => withExtraBoardSource({id: "covenant-2", methodId: covenant, packet: covenantWithAdverseDebt("400")}, () => build(2, (c) => {
      c.extraReadings["lev-adv27-b"] = ["covenant-2", "result.headroom.measurements[id=dez27-adverso].ratio", "2", "8.04"];
      c.pages[8]!.title = "risk.leverage|politica=policy-limit|adverso=lev-adv27-b|ano=year-2027";
    })), `board_capital_source_method_repeated:${covenant}`],
    ["basket-occupied-by-the-creditor-of-another-row", () => build(2, (c) => {finame(c); c.pages[3]!.lines[0] = "constraint.basket_usage|cesta=basket|ocupado=basket-used|credor=finame-creditor";}),
      "board_capital_template_condition_failed:constraint.basket_usage"],
    ["largest-creditor-in-a-row-creditor-slot", () => build(2, (c) => {c.pages[3]!.lines[0] = "constraint.basket_usage|cesta=basket|ocupado=basket-used|credor=largest-creditor";}),
      "board_capital_slot_concept_mismatch:constraint.basket_usage:credor"],
    ["prepaid-creditor-the-plan-does-not-prepay", () => build(2, (c) => {finame(c); c.pages[7]!.lines[0] = "recommendation.debenture_cost|credor=finame-creditor|baixo=deb-cost-low|alto=deb-cost-high";}),
      "board_capital_template_condition_failed:recommendation.debenture_cost"],
    ["amended-creditor-the-plan-does-not-amend", () => build(2, (c) => {finame(c); c.pages[6]!.lines[6] = c.pages[6]!.lines[6]!.replace("credor=bradesco-creditor", "credor=finame-creditor");}),
      "board_capital_template_condition_failed:alternatives.row.extend_bradesco"],
    ["question-and-answer-name-different-creditors", () => build(2, (c) => {finame(c); c.questions[0]!.question = "q.roll_bank|credor=finame-creditor";}), "board_capital_answer_mismatch:bradesco:credor"],
    // Review r9: exposure is the balance the chain owes, never the program's volume or the eligible capacity; a
    // contractual assertion holds only when the registered contract says so.
    ["exposure-read-from-the-program-volume", () => build(2, (c) => {c.questions[8]!.answer = "a.anchor|saldo=program-a-volume|carteira=carteira|volume=program-a-volume|taxa=spread-a";}),
      "board_capital_slot_concept_mismatch:a.anchor:saldo"],
    ["exposure-read-from-the-eligible-capacity", () => build(2, (c) => {
      c.extraReadings["rede-a-capacity"] = ["recebiveis", "result.funding.portfolio.items[itemId=rede-a].assignable", "1", "19.8"];
      c.questions[8]!.answer = "a.anchor|saldo=rede-a-capacity|carteira=carteira|volume=program-a-volume|taxa=spread-a";
    }), "board_capital_slot_concept_mismatch:a.anchor:saldo"],
    ["program-volume-under-a-sublimit-shown-as-exposure", () => withBoardSource("recebiveis", auroraReceivablesPacket({sublimitA: "10"}) as unknown as Record<string, unknown>, () => build(2, (c) => {
      c.extraReadings["program-a-volume"] = ["recebiveis", "readings.options[id=risco-sacado-a].volume", "1", "10.0"];
      c.extraReadings.programs = ["recebiveis", "readings.plan[optionId=risco-sacado-a].cumulative", "1", "13.7"];
      c.questions[8]!.answer = "a.anchor|saldo=program-a-volume|carteira=carteira|volume=program-a-volume|taxa=spread-a";
    })), "board_capital_slot_concept_mismatch:a.anchor:saldo"],
    ["assignment-ban-asserted-on-an-assignable-contract", () => withBoardSource("recebiveis", auroraReceivablesPacket({contractA: "assignable"}) as unknown as Record<string, unknown>,
      () => build(2, () => undefined)), "board_capital_template_condition_failed:a.anchor"],
    // Review r10: a policy said to lack a definition only when the covenant result records it; each sensitivity cause
    // by the operand its case changes; the chair's reason only as an informed fact attributed to the chair.
    ["policy-already-defined", () => withBoardSource("covenant", auroraCovenantPacket({policyDefinition: "Mesma definição da escritura"}) as unknown as Record<string, unknown>,
      () => build(2, () => undefined)), "board_capital_template_condition_failed:delib.policy.definition"],
    ["sensitivity-called-smaller-economy-with-unchanged-economy", () => {
      const packet = auroraInvestmentPacket({economyCaseWithLargerCapexOnly: true}) as unknown as Record<string, unknown>;
      return withBoardSource("linha-embalagem", packet, () => build(2, (c) => {c.extraReadings["npv-economy"] = ["linha-embalagem", "comparison.metrics[caseId=economy-4].netPresentValue", "1", boardStatedMillions(packet, "economy-4")];}));
    }, "board_capital_template_condition_failed:topic.project_sensitivities"],
    // Review r11: each cause by the driver that defines it, scenario against base, over the scope the sentence states.
    ["later-receivables-claimed-on-longer-inventory", () => {
      const packet = auroraProjectionPacket({inventoryInsteadOfReceivables: true}) as unknown as Record<string, unknown>;
      return withBoardSource("projecao", packet, () => build(2, (c) => {c.extraReadings["wc-60"] = boardWorkingCapitalReading(packet);}));
    }, "board_capital_template_condition_failed:what_changes.receivable_days"],
    ["larger-capex-claimed-on-front-loaded-capex-with-smaller-total", () => {
      const packet = auroraInvestmentPacket({capexFrontLoadedSmallerTotal: true}) as unknown as Record<string, unknown>;
      return withBoardSource("linha-embalagem", packet, () => build(2, (c) => {c.extraReadings["npv-capex"] = ["linha-embalagem", "comparison.metrics[caseId=capex-120].netPresentValue", "1", boardStatedMillions(packet, "capex-120")];}));
    }, "board_capital_template_condition_failed:topic.project_sensitivities"],
    // Review r12: the cause against the same reference as the effect (the scenario it derives from).
    ["receivables-shorter-than-the-parent-with-longer-inventory", () => {
      const packet = auroraProjectionPacket({shorterThanParentWithInventory: true}) as unknown as Record<string, unknown>;
      return withBoardSource("projecao", packet, () => build(2, (c) => {c.extraReadings["wc-60"] = boardWorkingCapitalReading(packet);}));
    }, "board_capital_template_condition_failed:what_changes.receivable_days"],
    // Review r13: a scenario named only when it differs from its reference exactly in the named drivers, active in the
    // period shown; a deferral only with its schedule deferred.
    ["wheat-scenario-whose-shock-starts-after-the-year-shown", () => {
      const packet = auroraProjectionPacket({shockFrom2028: true}) as unknown as Record<string, unknown>;
      return withBoardSource("projecao", packet, () => build(2, (c) => {c.extraReadings["ebitda-wheat"] = boardRestated(packet, "projecao", "readings.projected.scenarios[id=informado-trigo-4m].rows[periodId=2027-12-31].ebitda", 1);}));
    }, "board_capital_template_condition_failed:what_changes.wheat"],
    ["receivables-longer-only-in-another-year", () => {
      const packet = auroraProjectionPacket({receivablesOnlyIn2027: true}) as unknown as Record<string, unknown>;
      return withBoardSource("projecao", packet, () => build(2, (c) => {c.extraReadings["wc-60"] = boardWorkingCapitalReading(packet);}));
    }, "board_capital_template_condition_failed:what_changes.receivable_days"],
    ["deferral-without-a-deferred-schedule", () => {
      const packet = auroraPlanPacket({deferralWithoutLaterSchedule: true}) as unknown as Record<string, unknown>;
      return withBoardSource("plano-2027", packet, () => build(2, (c) => {boardRestatePath(c, packet, "adiar-linha");}));
    }, "board_capital_template_condition_failed:alternatives.row.defer_line"],
    ["informed-fact-attributed-to-another-person", () => build(2, (c) => {c.informed[0]!.author = "cfo";}), "board_capital_informed_fact_mismatch:topic.project_strategic_reason:motivo"],
    ["informed-fact-with-a-number", () => build(2, (c) => {c.informed[0]!.text = "reduzir a dependência em dezasseis por cento";}), "board_capital_number_without_origin"],
    ["reading-in-an-informed-fact-slot", () => build(2, (c) => {c.pages[4]!.lines[3] = "topic.project_strategic_reason|motivo=irr";}), "board_capital_slot_type_mismatch:topic.project_strategic_reason:motivo"],
    ["creditor-and-maturity-of-different-rows", () => build(2, (c) => {
      finame(c); c.questions[0]!.question = "q.roll_bank|credor=finame-creditor"; c.questions[0]!.answer = "a.roll_bank|credor=finame-creditor|falta=bradesco-gap|vencimento=bradesco-maturity";
    }), "board_capital_slot_concept_mismatch:a.roll_bank:vencimento:variable_i"],
  ];
}
/** Changes one adopted reading inside the sealed basis and seals it again. */
function alterReading(figureId: string, change: (reading: string[]) => void) {
  return boardPacketInput(2, undefined, (i) => {
    const e = JSON.parse(i.analysis.discussion.envelope.canonical) as {entries: {fieldPath: string; value: {value: string[]}}[]};
    change(e.entries.find((x) => x.fieldPath.endsWith(`.figure.${figureId}.reading`))!.value.value);
    const canonical = JSON.stringify(e); i.analysis.discussion.envelope = {canonical, fingerprint: createHash("sha256").update(canonical).digest("hex")};
  });
}

function consistencyCases(): Case[] {
  return [boardPacketInput(2), boardPacketInput(3)].flatMap((input, fixtureIndex) => {
    const before = fingerprint(input), first = prepareBoardCapitalDiscussionPacket(input);
    return Array.from({length: 3}, (_, repeat) => {
      const result = prepareBoardCapitalDiscussionPacket(JSON.parse(JSON.stringify(input)));
      const passed = fingerprint(result) === fingerprint(first) && fingerprint(input) === before;
      return {id: `fixture-${fixtureIndex + 1}-repeat-${repeat + 1}`, expectation: "same inputs and versions reproduce all output bytes without mutation",
        observed: passed ? "same inputs and versions reproduce all output bytes without mutation" : "output or input changed", inputFingerprint: before, outputFingerprint: fingerprint(result), passed};
    });
  });
}

export function buildBoardCapitalDiscussionRuns(): Evidence[] {
  return ([{kind: "gold", cases: goldCases()}, {kind: "adversarial", cases: adversarialCases()}, {kind: "consistency", cases: consistencyCases()}] as const).map(({kind, cases}) => {
    const evidence = {runId: boardCapitalDiscussionRunIds[kind], kind, method: {id: "prepare-board-capital-discussion", version: boardCapitalDiscussionMethodVersion},
      executor: {module: "@offroad/financial-model", exportName: "prepareBoardCapitalDiscussionPacket"},
      harness: {module: "@offroad/financial-model/src/board-capital-discussion-runs.test-support.ts", exportName: "buildBoardCapitalDiscussionRuns"},
      modelCalls: 0 as const, cases, result: cases.every((c) => c.passed) ? "pass" as const : "fail" as const};
    return {...evidence, evidenceFingerprint: deterministicRunEvidenceFingerprint(evidence),
      notes: "Synthetic deterministic execution calibrated on ficha C47 over the published calibrations of the released methods. Numerical expectations do not constitute independent review, content approval, live access verification or publication."};
  });
}
