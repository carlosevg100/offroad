import {createHash} from "node:crypto";
import {deterministicRunEvidenceFingerprint, type DeterministicMethodRun, type DeterministicMethodRunCase} from "@offroad/credit-playbook";
import {boardCapitalDiscussionPacketOutputSchema, prepareBoardCapitalDiscussionPacket, type BoardCapitalDiscussionPacketInput} from "./board-capital-discussion-packet";
import {auroraBoardBasis, auroraBoardReadings, auroraBoardSources, type BoardTurn} from "./board-capital-discussion.test-support";

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
function observe(id: string, input: BoardCapitalDiscussionPacketInput, expected: unknown, select: (p: Packet) => unknown): Case {
  const result = prepareBoardCapitalDiscussionPacket(input), observed = JSON.stringify(select(result)), expectation = JSON.stringify(expected);
  return {id, expectation, observed, inputFingerprint: fingerprint(input), outputFingerprint: fingerprint(result), passed: expectation === observed};
}
const current = (p: Packet) => p.result.discussion!.versions.at(-1)!;
const pageOf = (p: Packet, id: string) => current(p).pages.find((x) => x.id === id)!;
const display = (p: Packet) => Object.fromEntries(p.result.discussion!.identity.map((x) => [x.figureId, x.display]));
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
    reuse("titles-pages-1-to-4-conclusion-and-number", p2, t2, ["Pedimos quatro decisões; três têm prazo", "A dívida é de R$ 130 milhões, curta e concentrada em 2027", "Sem ação, o caixa fica abaixo do mínimo em dezembro e chega a R$ -79 milhões no fim de 2027", "A escritura de 2021 deixa só R$ 3 milhões de exceção para garantias de nova dívida"],
      (p) => p.readings!.material!.titles.slice(0, 4).map((t) => t.title)),
    reuse("titles-pages-5-to-8-conclusion-and-number", p2, t2, ["A linha de embalagem rende 16% contra custo de capital de 15% e disputa o caixa mais apertado", "A safra pode ser financiada por até R$ 23,5 milhões dos programas dos clientes, sem dívida bancária nova", "Avaliamos 7 caminhos para 2027; só o recomendado passa em todos os critérios", "Recomendamos sondar uma debênture de até R$ 80 milhões, em 7 anos"],
      (p) => p.readings!.material!.titles.slice(4, 8).map((t) => t.title)),
    reuse("titles-pages-9-to-12-conclusion-and-number", p2, t2, ["A alavancagem fica abaixo da política de 2,5x nos cenários avaliados, com 2,37x no adverso de 2027", "A política de 2,5x precisa de uma definição de EBITDA", "Mudaria a recomendação: demanda abaixo de R$ 74,44 milhões, trigo mais caro ou redes pagando mais tarde", "Próximos passos e datas"],
      (p) => p.readings!.material!.titles.slice(8, 12).map((t) => t.title)),
    reuse("every-page-carries-a-number", p2, t2, true, (p) => current(p).pages.every((x) => x.figureIds.length + x.pendingFigureIds.length + x.deadlineIds.length > 0)),
    reuse("numbers-checked-against-the-analyses-debt-covenant-and-cash", p2, t2, {
      "divida-total": "130", "principal-2027": "77", "share-12m": "28", "wal": "1,5", "largest-share": "46", "basket": "15", "basket-used": "12", "cov-limit": "3,0", "policy-limit": "2,5",
      "sem-linha-min": "-9,5", "min-cash": "15", "tight-week": "21/dez", "lev-dez26": "2,2", "lev-dez27": "1,85", "lev-adv27": "2,37", "lev-ger-dez26": "2,0"},
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
    reuse("appendix-cites-the-reviewed-results", p2, t2, [["Tabela de dívida", ["tabela-divida"]], ["Projeção por drivers e premissas", ["projecao"]], ["Plano do FP&A contra a base", ["plano-fpa"]], ["Fontes e datas das análises", 9]],
      (p) => current(p).appendix.map((a) => [a.label, a.sourceIds.length > 1 ? a.sourceIds.length : a.sourceIds])),
    reuse("likely-questions-with-answer-and-number", p2, t2, {count: 10, everyAnswerHasNumber: true,
      sample: "Da diferença de 125 pontos, 60 vêm da data de contratação; o resto é escala, concentração de clientes, prazo curto e ausência de rating."},
      (p) => ({count: current(p).questions.length, everyAnswerHasNumber: current(p).questions.every((q) => q.figureIds.length + q.pendingFigureIds.length > 0),
        sample: current(p).questions.find((q) => q.id === "serra-verde")!.answer})),
    reuse("pending-items-declared", p2, t2, {indicative: ["programs", "spread-a"], sources: ["covenant", "recebiveis"], template: "supplied_not_applied", safraSaysIndicative: true},
      (p) => ({indicative: p.readings!.pending.indicative, sources: p.readings!.pending.sources, template: p.readings!.pending.template,
        safraSaysIndicative: pageOf(p, "safra").lines[0]!.includes("indicativas")})),
    reuse("line-before-the-recommendation-when-the-board-has-not-seen-it", p2, t2, {line: 5, recommendation: 8, placement: "main", sideBySide: true},
      (p) => ({line: pageOf(p, "linha").number, recommendation: pageOf(p, "recomendacao").number, placement: pageOf(p, "linha").placement,
        sideBySide: pageOf(p, "linha").lines.some((l) => l.startsWith("Retorno")) && pageOf(p, "linha").lines.some((l) => l.startsWith("Motivo estratégico"))})),
    observe("line-the-board-has-seen-goes-to-the-appendix", boardPacketInput(2, (c) => {c.topics[0]!.seen = true;}), {placement: "appendix", mainPages: 11},
      (p) => ({placement: pageOf(p, "linha").placement, mainPages: p.readings!.material!.mainPages})),
    reuse("twelve-pages-fit-forty-five-minutes", p2, t2, {mainPages: 12, capacity: 15, fits: true}, (p) => ({mainPages: current(p).agenda.mainPages, capacity: current(p).agenda.capacity, fits: current(p).agenda.fits})),
    observe("pages-beyond-the-agenda-are-a-gap", boardPacketInput(2, (c) => {c.agendaMinutes = "30";}), {fits: false, gap: true},
      (p) => ({fits: p.readings!.material!.fitsAgenda, gap: p.gaps.some((g) => g.reason === "pages_exceed_agenda")})),
    reuse("turn-3-recommendation-withdrawn-and-facts-kept", p3, t3, {outcome: "applied", recommendation: null,
      kept: ["irr", "wacc", "npv", "payback", "peak-need", "npv-economy", "npv-capex", "npv-slow", "npv-defer", "irr-defer"], firstLine: "Retorno de 16% contra custo de capital de 15%; VPL de R$ 0,7 milhão."},
      (p) => ({outcome: p.readings!.omissions[0]!.outcome, recommendation: pageOf(p, "linha").recommendation, kept: p.readings!.omissions[0]!.keptFigureIds, firstLine: pageOf(p, "linha").lines[0]})),
    reuse("turn-3-options-with-criteria-and-numbers", p3, t3,
      ["Seguir agora: VPL de R$ 0,7 milhão e retorno de 16%.", "Seguir em etapas: VPL de R$ [pendente] milhões.", "Esperar as cotações e adiar doze meses: VPL de R$ 1,4 milhão e retorno de 17%."],
      (p) => pageOf(p, "linha").options),
    reuse("turn-3-deliberation-becomes-the-choice-and-the-notice-stays", p3, t3,
      "decidir o caminho da linha de embalagem, e enviar ao fornecedor atual o aviso para renegociar o contrato até 2/out", (p) => current(p).deliberations[0]!.text),
    reuse("turn-3-prior-version-kept", p3, t3, {versions: [1, 2], priorRecommendation: true, priorFingerprint: true},
      (p) => {const v = p.result.discussion!.versions; return {versions: v.map((x) => x.version), priorRecommendation: v[0]!.pages.find((x) => x.id === "linha")!.recommendation !== null,
        priorFingerprint: p.readings!.material!.priorVersionFingerprint === v[0]!.fingerprint};}),
    observe("refuses-to-omit-the-return-on-request", boardPacketInput(3, (c) => {c.omissions = [{id: "sem-retorno", target: "figure", targetId: "irr", requestedBy: "Presidente do conselho"}];}),
      {outcome: "refused", stillShown: true, versions: 1},
      (p) => ({outcome: p.readings!.omissions[0]!.outcome, stillShown: pageOf(p, "linha").lines[0]!.includes("16%"), versions: p.result.discussion!.versions.length})),
    observe("refuses-to-drop-the-line-page", boardPacketInput(3, (c) => {c.omissions = [{id: "sem-linha", target: "page", targetId: "linha", requestedBy: "Presidente do conselho"}];}),
      {outcome: "refused", reason: "Os fatos materiais ficam no material, porque são o que o conselho precisa para decidir; sem eles, a escolha ficaria sem base.", pageKept: true},
      (p) => ({outcome: p.readings!.omissions[0]!.outcome, reason: p.readings!.omissions[0]!.reason, pageKept: current(p).pages.some((x) => x.id === "linha")})),
    observe("refuses-to-drop-the-leverage-risk", boardPacketInput(3, (c) => {c.omissions = [{id: "sem-risco", target: "page", targetId: "alavancagem", requestedBy: "CFO"}];}),
      {outcome: "refused", pageKept: true}, (p) => ({outcome: p.readings!.omissions[0]!.outcome, pageKept: current(p).pages.some((x) => x.id === "alavancagem")})),
    observe("refuses-to-drop-the-notice-deadline", boardPacketInput(3, (c) => {c.omissions = [{id: "sem-prazo", target: "deadline", targetId: "linha.aviso", requestedBy: "CFO"}];}),
      {outcome: "refused", reason: "O prazo fica, porque vale para qualquer caminho que o conselho escolher.", stillDated: true},
      (p) => ({outcome: p.readings!.omissions[0]!.outcome, reason: p.readings!.omissions[0]!.reason, stillDated: current(p).deliberations[0]!.text.includes("até 2/out")})),
    observe("a-request-for-the-deck-does-not-skip-the-outline", boardPacketInput(1, undefined, undefined, "Quero o deck com apêndice, no nosso template."), {withheld: true, material: null},
      (p) => ({withheld: p.readings!.materialWithheld, material: p.readings!.material})),
    observe("no-time-before-the-meeting-produces-the-material-with-the-outline", boardPacketInput(1, (c) => {c.askedOn = "2026-09-30";}), {stage: "material_prepared", questions: 0, template: "not_supplied"},
      (p) => ({stage: p.readings!.stage, questions: p.readings!.questionsBeforeMaterial.length, template: p.readings!.pending.template})),
    reuse("ficha-divergences-follow-the-published-methods", p2, t2, boardFichaDivergences.filter((x) => x.figureId in display(p2)).map((x) => [x.figureId, display(p2)[x.figureId]]),
      (p) => boardFichaDivergences.filter((x) => x.figureId in display(p)).map((x) => [x.figureId, display(p)[x.figureId]])),
    reuse("paths-page-compares-each-path", p2, t2, [
      "Sem a linha agora: giro de R$ 17 mi e debênture de R$ 80 mi: caixa mínimo R$ 15 mi; alavancagem 2,20x; custo R$ 49 mi; dívida líquida 2028 R$ 79 mi; nos critérios: sim; anuência: não.",
      "Manter e rolar no vencimento: caixa mínimo R$ -79 mi; alavancagem 2,38x; custo R$ 25 mi; dívida líquida 2028 R$ 81 mi; nos critérios: não; anuência: não."],
      (p) => [pageOf(p, "caminhos").lines[0], pageOf(p, "caminhos").lines[3]]),
    reuse("paths-page-has-seven-paths-with-every-measure", p2, t2, {lines: 7, measures: true},
      (p) => ({lines: pageOf(p, "caminhos").lines.length, measures: pageOf(p, "caminhos").lines.every((l) => ["caixa mínimo", "alavancagem", "custo", "dívida líquida 2028", "nos critérios", "anuência"].every((m) => l.includes(m)))})),
    reuse("every-material-fact-shown-in-the-current-version", p3, t3, {shown: true, deadlines: 4},
      (p) => ({shown: p.readings!.material!.materialFactsShown, deadlines: p.result.discussion!.materialFacts.deadlines.length})),
    observe("refuses-removing-a-date-that-shares-a-line-with-material-facts", boardPacketInput(2, (c) => {c.omissions = [{id: "sem-mes", target: "figure", targetId: "peak-date", requestedBy: "CFO"}];}),
      {outcome: "refused", kept: ["payback", "peak-need"]}, (p) => ({outcome: p.readings!.omissions[0]!.outcome, kept: p.readings!.omissions[0]!.keptFigureIds})),
    observe("refuses-removing-a-label-that-carries-the-sensitivities", boardPacketInput(2, (c) => {c.omissions = [{id: "sem-rotulo", target: "figure", targetId: "label-economy", requestedBy: "CFO"}];}),
      {outcome: "refused", kept: ["npv-economy", "npv-capex", "npv-slow"]}, (p) => ({outcome: p.readings!.omissions[0]!.outcome, kept: p.readings!.omissions[0]!.keptFigureIds})),
    observe("refuses-withdrawing-a-recommendation-that-alone-carries-material-facts", boardPacketInput(3, (c) => {
      const line = c.pages.find((x) => x.id === "linha")!;
      line.recommendation = "Recomendamos pedir cotações firmes; com economia menor o VPL vai a R$ {npv-economy} milhões e com capex maior a R$ {npv-capex} milhões; partida mais lenta, R$ {npv-slow} milhão; adiar doze meses leva o VPL a R$ {npv-defer} milhão e o retorno a {irr-defer}%.";
      line.lines.splice(2, 1);
    }), {outcome: "refused", kept: ["npv-economy", "npv-capex", "npv-slow"], recommendationKept: true},
      (p) => ({outcome: p.readings!.omissions[0]!.outcome, kept: p.readings!.omissions[0]!.keptFigureIds, recommendationKept: pageOf(p, "linha").recommendation !== null})),
    ...(["peak-date", "label-economy"] as const).map((first, k) => observe(`refuses-hidden-subject-omissions-order-${k + 1}`, boardPacketInput(2, (c) => {
      c.deliberations[0]!.subject = "decidir com payback de {payback} anos e fluxo de R$ {peak-need} milhões; VPLs de R$ {npv-economy} milhões, R$ {npv-capex} milhões, R$ {npv-slow} milhão";
      c.omissions = [first, first === "peak-date" ? "label-economy" : "peak-date"].map((id, i) => ({id: `pedido-${i}`, target: "figure" as const, targetId: id, requestedBy: "Presidente do conselho"}));
    }), {outcomes: ["refused", "refused"], shown: true},
      (p) => ({outcomes: p.readings!.omissions.map((o) => o.outcome), shown: ["Payback de cerca de 6 anos", "R$ -21,7 milhões", "R$ -6,4 milhões"].every((n) => JSON.stringify(current(p)).includes(n))}))),
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
    ["material-without-decisions", () => boardPacketInput(2, (c) => {c.pages[0]!.role = "situation"; c.pages[0]!.lines = ["{divida-total}"];}), "board_capital_material_without_decisions"],
    ["material-with-no-deliberation", () => boardPacketInput(2, (c) => {c.deliberations = [];}), "Too small"],
    ["divergent-number", () => boardPacketInput(2, (c) => {void c;}, (i) => {
      const e = JSON.parse(i.analysis.discussion.envelope.canonical) as {entries: {fieldPath: string; value: {value: string[]}}[]};
      e.entries.find((x) => x.fieldPath.endsWith(".figure.wal.reading"))!.value.value[5] = "1.4";
      const canonical = JSON.stringify(e); i.analysis.discussion.envelope = {canonical, fingerprint: createHash("sha256").update(canonical).digest("hex")};
    }), "board_capital_figure_diverges:wal"],
    ["concatenated-decimal-in-a-deliberation-title", () => boardPacketInput(2, (c) => {c.deliberations[0]!.title += " Dívida R$ {divida-total},{basket-free} mi.";}), "crosses_markers"],
    ["concatenated-digits-in-an-answer", () => boardPacketInput(2, (c) => {c.questions[0]!.answer += " Dívida R$ {divida-total}{basket-free} mi.";}), "crosses_markers"],
    ["sign-written-before-a-reading-in-the-summary", () => boardPacketInput(2, (c) => {c.summary.closing += " Dívida R$ -{divida-total} mi.";}), "crosses_markers"],
    ["year-used-as-money-in-an-appendix-label", () => boardPacketInput(2, (c) => {c.appendix[0]!.label += " de R$ 2027 mi";}), "year_as_amount"],
    ["money-without-its-currency-mark", () => boardPacketInput(2, (c) => {c.pages[1]!.lines[0] += " Dívida de {divida-total} milhões.";}), "currency_mark"],
    ["literal-number-in-a-title", () => boardPacketInput(2, (c) => {c.pages[1]!.title = "A dívida é de R$ 130 milhões, curta e concentrada em 2027";}), "board_capital_number_without_origin"],
    ["literal-deadline-in-a-line", () => boardPacketInput(2, (c) => {c.pages[11]!.lines[0] = "2/out: aviso ao fornecedor de embalagem.";}), "board_capital_number_without_origin"],
    ["reading-that-does-not-resolve", () => alterReading("wal", (r) => {r[1] = "result.table.profile.averageLife";}), "board_capital_figure_without_origin:wal"],
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
    ["title-without-an-economic-number", () => boardPacketInput(2, (c) => {c.pages[3]!.title = "A escritura de 2021 limita as garantias de qualquer nova dívida";}), "board_capital_title_without_number:escritura"],
    ["next-steps-without-a-deadline", () => boardPacketInput(2, (c) => {c.pages[11]!.lines = ["Aviso ao fornecedor e adesão aos programas."];}), "board_capital_page_without_number:passos"],
    ["false-number-in-a-deliberation-title", () => boardPacketInput(2, (c) => {c.deliberations[0]!.title = "Linha de embalagem com retorno de 16,1%";}), "board_capital_number_without_origin"],
    ["false-number-in-an-appendix-label", () => boardPacketInput(2, (c) => {c.appendix[0]!.label = "Tabela de dívida de R$ 130,1 milhões";}), "board_capital_number_without_origin"],
    ["false-number-in-an-option-not-yet-shown", () => boardPacketInput(2, (c) => {c.pages[4]!.options[1] = "Seguir em etapas: VPL de R$ 0,9 milhão.";}), "board_capital_number_without_origin"],
    ["paraphrase-that-drops-a-material-fact", () => boardPacketInput(2, (c) => {c.pages[4]!.lines[1] = "O fluxo acumulado do projeto chega a R$ {peak-need} milhões em {peak-date}.";}), "board_capital_material_fact_not_shown:payback"],
    ["spread-without-its-percent-sign", () => boardPacketInput(2, (c) => {c.pages[5]!.lines[0] = "Programas a CDI mais {spread-b} a {spread-a}% ao ano, em condições indicativas.";}), "board_capital_unit_missing:spread-b"],
    ["answer-without-an-economic-number", () => boardPacketInput(2, (c) => {c.questions[6]!.answer = "Reduz a dependência de um fornecedor; cotações firmes decidem até {deadline:linha.aviso}.";}), "board_capital_answer_without_number:estrategica"],
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
