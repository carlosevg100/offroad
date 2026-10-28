import {createHash} from "node:crypto";
import Decimal from "decimal.js";
import {formatBoardReading} from "./board-capital-discussion";
import {boardFieldOf} from "./board-capital-discussion-sources";
import {deterministicRunEvidenceFingerprint, type DeterministicMethodRun, type DeterministicMethodRunCase} from "@offroad/credit-playbook";
import {readBoardSourcePath} from "./board-capital-discussion";
import {boardCapitalDiscussionPacketOutputSchema, prepareBoardCapitalDiscussionPacket, type BoardCapitalDiscussionPacketInput} from "./board-capital-discussion-packet";
import type {AdoptionBasisEntry, AdoptionBasisSnapshot} from "@offroad/reconciliation";
import {auroraBoardBasis, auroraBoardFacts, auroraBoardPending, debtTableWithPrincipal, debtTableAtReferenceDate, auroraRelativeCostPacket, auroraBoardReadings, auroraBoardSources, auroraCovenantPacket, debtTableWithCreditLineLabel, auroraInvestmentPacket, auroraPlanPacket, auroraProjectionPacket, auroraReceivablesPacket, auroraWeeklyPacket, covenantWithAdverseDebt, debtTableWithCreditor, withBoardSource, withExtraBoardSource, type BoardTurn} from "./board-capital-discussion.test-support";
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
  c.extraReadings["rede-a-retained"] = ["recebiveis", "result.funding.options[id=risco-sacado-a].byItem[itemId=rede-a].retained", "1", "10.0"];
  c.extraReadings.programs = ["recebiveis", "readings.plan[optionId=risco-sacado-a].cumulative", "1", "13.7"];
};
export const boardSublimitExpected = "A carteira tem R$ 19,8 milhões de rede A, de um total de R$ 62 milhões; o contrato com esse cliente veda a cessão sem consentimento, mas o programa próprio dele antecipa R$ 10,0 milhões sem regresso, a CDI mais 1,5% ao ano.";
/** The NPV of a case of an investment packet in millions with one decimal, as a reading states it (test side only). */
/** The deferral case's NPV and IRR as the case states them, from a given investment packet (test side only). */
export const boardDeferralReadings = (packet: Record<string, unknown>) => (c: CaseData) => {
  const irr = (packet.comparison as {metrics: {caseId: string; annualIrr: string}[]}).metrics.find((m) => m.caseId === "defer-12")!.annualIrr;
  c.extraReadings["npv-defer"] = ["linha-embalagem", "comparison.metrics[caseId=defer-12].netPresentValue", "1", boardStatedMillions(packet, "defer-12")];
  c.extraReadings["irr-defer"] = ["linha-embalagem", "comparison.metrics[caseId=defer-12].annualIrr", "0", new Decimal(irr).times(100).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toFixed(0)];
};
/** The material with the deferral named by its exact definition ("capex e início de operação adiados e horizonte da
 * análise estendido na mesma medida") instead of the role the analysis registers (test side only). */
export const boardStrictDeferral = (c: CaseData) => {
  const page = c.pages.find((x) => x.id === "linha")!;
  if (page.recommendation) page.recommendation = page.recommendation.replace("topic.project_wait_quotes_registered|", "topic.project_wait_quotes|");
  page.options = page.options.map((o) => o.replace("option.wait_quotes_registered|", "option.wait_quotes|"));
};
/** The wheat answer against a covenant of the given maximum, with the adverse leverage of the contractual test or of the
 * managerial measurement (test side only). */
export const boardCovenantAnswer = (cov: string, managerial: boolean) => (c: CaseData) => {
  c.extraReadings["cov-limit"] = ["covenant", "result.headroom.limits[id=aditamento].maximumRatio", "1", cov];
  // Review r41: every adverse test the covenant breaches is stated on the risk page (its own sentence), as the rule requires.
  const breaches: [string, string, string, string, string][] = [["dez26-adverso", "2.32", "52.4", "2026-12-31", "26"], ["dez27-adverso", "2.37", "48.1", "2027-12-31", "27"]];
  for (const [id, ratio, ebitda, date, yy] of breaches) if (new Decimal(ratio).gt(cov)) {
    const lev = yy === "27" ? "lev-adv27" : `lev-adv${yy}`, eb = yy === "27" ? "ebitda-adv27" : `ebitda-adv${yy}`;
    if (yy !== "27") {c.extraReadings[lev] = ["covenant", `result.headroom.measurements[id=${id}].ratio`, "2", ratio]; c.extraReadings[eb] = ["covenant", `result.headroom.measurements[id=${id}].reportedEbitda`, "1", ebitda];}
    c.extraReadings[`adv${yy}-date`] = ["covenant", `result.headroom.measurements[id=${id}].date`, "month_long", date];
    c.pages.find((x) => x.id === "alavancagem")!.lines.push(`risk.leverage_breach_covenant|ebitda=${eb}|data=adv${yy}-date|alavancagem=${lev}|covenant=cov-limit`);
  }
  if (!managerial) return;
  c.extraReadings["lev-adv27-ger"] = ["covenant", "result.headroom.measurements[id=dez27-adverso-gerencial].ratio", "2", "2.22"];
  c.extraReadings["ebitda-adv27-ger"] = ["covenant", "result.headroom.measurements[id=dez27-adverso-gerencial].reportedEbitda", "1", "48.1"];
  const q = c.questions.find((x) => x.id === "trigo")!;
  q.answer = q.answer.replace("ebitda_adverso=ebitda-adv27", "ebitda_adverso=ebitda-adv27-ger").replace("alavancagem=lev-adv27", "alavancagem=lev-adv27-ger");
};
/** The adverse leverage read twice, by an id selector and by an equivalent compound selector (test side only). */
export const boardEquivalentSelectors = (places: string, stated: string) => (c: CaseData) => {
  c.extraReadings["lev-adv27"] = ["covenant", "result.headroom.measurements[id=dez27-adverso].ratio", "2", "2.46"];
  c.extraReadings["lev-adv27-alt"] = ["covenant", "result.headroom.measurements[id=dez27-adverso&scenario=adverse].ratio", places, stated];
  const q = c.questions.find((x) => x.id === "trigo")!; q.answer = q.answer.replace("alavancagem=lev-adv27", "alavancagem=lev-adv27-alt");
};
/** The rating readings restated from a relative-cost packet (test side only). */
export const boardRatingReadings = (packet: Record<string, unknown>) => (c: CaseData) => {
  const lever = (scenario: string) => (packet.levers as {role: string; scenario: string; netOfKnownCosts: string}[]).find((l) => l.role === "rating" && l.scenario === scenario)!.netOfKnownCosts;
  for (const [id, scenario] of [["rating-low", "low"], ["rating-high", "high"]] as const)
    c.extraReadings[id] = ["custo-relativo", `levers[role=rating&scenario=${scenario}].netOfKnownCosts`, "2", new Decimal(lever(scenario)).div(1000000).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2)];
};
/** Every reading of one source restated from another execution of its method, at the same presentation (test side only). */
/** The plan with the recommended debenture issued at another amount (the demand), its readings restated, the amount shown with two decimals. */
export const boardDemandAt = (amount: string, build: (turn: BoardTurn, edit: (c: CaseData) => void) => unknown = boardPacketInput) => {
  const packet = auroraPlanPacket({longIssueAmount: amount}) as unknown as Record<string, unknown>;
  return withBoardSource("plano-2027", packet, () => build(2, (c) => {
    boardRestateSource("plano-2027", "evaluate-financing-paths", packet)(c);
    c.extraReadings["debenture-amount"] = ["plano-2027", "readings.recommendation.longInstrument.issueTarget", "2", amount];
  }));
};
export const boardRestateSource = (sourceId: string, methodId: string, packet: Record<string, unknown>) => (c: CaseData) => {
  for (const [id, r] of Object.entries({...auroraBoardReadings, ...c.extraReadings} as Record<string, [string, string, string, string?]>)) {
    if (r[0] !== sourceId || r[3] === undefined) continue;
    const spec = boardFieldOf(methodId, r[1]), raw = readBoardSourcePath(packet, r[1]);
    const shown = spec ? formatBoardReading(raw, spec, r[2], null, "BRL", spec.horizonMonths?.(packet, r[1]) ?? null) : null;
    if (shown) c.extraReadings[id] = [r[0], r[1], r[2], shown.rounded];
  }
};
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
/** The working-capital line bound to 2027 instead of 2026 (the same scenario, another year). */
export const boardWorkingCapital2027 = (c: CaseData) => {
  c.extraReadings["wc-60-2027"] = ["projecao", "readings.projected.scenarios[id=prazo-60].rows[periodId=2027-12-31].effects.changeInWorkingCapital", "0", "1"];
  const page = c.pages.find((x) => x.id === "mudaria")!;
  page.lines.push("what_changes.receivable_days|ano=year-2027|giro=wc-60-2027");
};
/** The status-quo readings restated from a given plan packet (the path row and the cash, service and available of 2027). */
export const boardRestateKeptDebt = (c: CaseData, packet: Record<string, unknown>) => {
  boardRestatePath(c, packet, "manter");
  c.extraReadings["cash-end-2027"] = boardRestated(packet, "plano-2027", "result.evaluation.paths[id=manter].closingAvailableByPeriod[periodId=2027-12-31].closingAvailable", 0);
  c.extraReadings["service-2027"] = boardRestated(packet, "plano-2027", "result.evaluation.paths[id=manter].debtServiceByYear[year=2027].service", 0);
  c.extraReadings["available-2027"] = boardRestated(packet, "plano-2027", "result.evaluation.paths[id=manter].debtServiceByYear[year=2027].availableForService", 0);
};
/** The four informed entries of review r16, now inexpressible: an informed fact is a code of a closed dictionary. */
export const boardInformedProse = ["retorno de menos dezasseis por minuto", "retorno de dezassete por minuto", "a dívida é a terça parte da receita", "a dívida corresponde a um bilião"];
/** Names the debt-table method was made to produce for the largest creditor, none of them an entry of the dictionary. */
export const boardOffDictionaryNames = ["Debenturistas; dívida total de R$ 999 milhões", "Bradesco \uff11\uff16", "retorno de menos dezasseis por minuto", "Caixa Total",
  "Bradesco Deve Dezassete Cêntimos", "Bradesco Deve Dezassete Biliões"];
export const boardOffDictionaryExpected = {status: "partial", gap: "page.divida.line.1.label.largest-creditor", line: "Prazo médio de 1,5 anos; maior credor: sem nome confirmado, com 46% da dívida.", shown: false};
export const boardOffDictionaryReading = (p: Packet, name: string) => ({status: p.status,
  gap: p.result.discussion!.gaps.find((g) => g.reason === "label_not_in_dictionary")?.item ?? null, line: current(p).pages.find((x) => x.id === "divida")!.lines[1],
  shown: boardShownTexts(p).some((t) => t.includes(name) || t.includes(name.normalize("NFKC")))});
export const boardRegisteredCreditorExpected = {basket: "Exceção de R$ 15 milhões para garantias, com R$ 12 milhões ocupados pelas garantias da dívida com Itaú.",
  question: "Por que não rolar a dívida com Itaú no vencimento?", named: 10, bradesco: false, status: "partial"};
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
    reuse("titles-pages-1-to-4-conclusion-and-number", p2, t2, ["Pedimos quatro decisões; três têm prazo", "A dívida é de R$ 130 milhões, concentrada em 2027", "O caixa fica abaixo do mínimo em 21 de dezembro e, mantida a dívida como está, chega a R$ -79 milhões no fim de 2027", "O contrato da dívida com Debenturistas tem só R$ 3 milhões livres na exceção para garantias de nova dívida"],
      (p) => p.readings!.material!.titles.slice(0, 4).map((t) => t.title)),
    reuse("titles-pages-5-to-8-conclusion-and-number", p2, t2, ["A linha de embalagem rende 16% ao ano, acima do custo de capital de 15% ao ano", "Os programas dos clientes antecipam R$ 23,5 milhões contra o pico de R$ 25 milhões, sem dívida bancária nova", "Avaliamos 7 caminhos para 2027; só o recomendado passa em todos os critérios", "Os 7 caminhos combinam estes movimentos da dívida e do projeto"],
      (p) => p.readings!.material!.titles.slice(4, 8).map((t) => t.title)),
    reuse("titles-pages-9-to-12-conclusion-and-number", p2, t2, ["Recomendamos sondar uma debênture de até R$ 80 milhões, com prazo de 7 anos", "A alavancagem chega a 2,37x no adverso de 2027, abaixo da política de 2,5x pela definição da escritura", "A política de 2,5x precisa de uma definição de EBITDA", "A recomendação depende de demanda a partir de R$ 74,44 milhões"],
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
    reuse("turn-2-pending-only-the-credit-line-terms", p2, t2, {status: "partial", gaps: ["page.safra.figure.cl-terms"]}, (p) => ({status: p.status, gaps: p.result.discussion!.gaps.map((g) => g.item)})),
    reuse("staged-option-pending-never-invented", p3, t3, {status: "partial", pending: ["page.linha.figure.stages-npv", "page.safra.figure.cl-terms"], reasons: ["figure_pending_reviewed_result"]},
      (p) => ({status: p.status, pending: p.result.discussion!.gaps.map((g) => g.item), reasons: [...new Set(p.gaps.map((g) => g.reason))]})),
    reuse("summary-for-prior-reading-names-every-decision-and-date", p2, t2, {decisions: [true, true, true, true], dates: [true, true, true, true]},
      (p) => {const s = current(p).summary; return {decisions: ["(1)", "(2)", "(3)", "(4)"].map((x) => s.includes(x)), dates: ["2/out", "16/out", "31/out", "15/nov"].map((x) => s.includes(x))};}),
    reuse("appendix-cites-the-reviewed-results", p2, t2, [["Tabela de dívida", ["tabela-divida"]], ["Projeção por drivers e premissas", ["projecao"]], ["Plano da área financeira contra a base", ["plano-fpa"]], ["Fontes e datas das análises", 9]],
      (p) => current(p).appendix.map((a) => [a.label, a.sourceIds.length > 1 ? a.sourceIds.length : a.sourceIds])),
    reuse("likely-questions-with-answer-and-number", p2, t2, {count: 10, everyAnswerHasNumber: true,
      sample: "Da diferença de 125 pontos, os ajustes conhecidos somam 70 pontos, dos quais 60 pontos de ajuste pela data de contratação; 55 pontos ficam sem explicação na comparação."},
      (p) => ({count: current(p).questions.length, everyAnswerHasNumber: current(p).questions.every((q) => q.figureIds.length + q.pendingFigureIds.length > 0),
        sample: current(p).questions.find((q) => q.id === "serra-verde")!.answer})),
    reuse("pending-items-declared", p2, t2, {indicative: ["programs", "spread-a"], sources: ["covenant", "recebiveis"], template: "supplied_not_applied", safraSaysIndicative: true},
      (p) => ({indicative: p.readings!.pending.indicative, sources: p.readings!.pending.sources, template: p.readings!.pending.template,
        safraSaysIndicative: pageOf(p, "safra").lines[0]!.includes("indicativo")})),
    reuse("line-before-the-recommendation-when-the-board-has-not-seen-it", p2, t2, {line: 5, recommendation: 9, placement: "main", sideBySide: true},
      (p) => ({line: pageOf(p, "linha").number, recommendation: pageOf(p, "recomendacao").number, placement: pageOf(p, "linha").placement,
        sideBySide: pageOf(p, "linha").lines.some((l) => l.startsWith("Retorno")) && pageOf(p, "linha").lines.some((l) => l.startsWith("Motivo apresentado pelo presidente do conselho"))})),
    observe("line-the-board-has-seen-goes-to-the-appendix", boardPacketInput(2, (c) => {c.topics[0]!.seen = true;}), {placement: "appendix", mainPages: 12},
      (p) => ({placement: pageOf(p, "linha").placement, mainPages: p.readings!.material!.mainPages})),
    reuse("thirteen-pages-fit-forty-five-minutes", p2, t2, {mainPages: 13, capacity: 15, fits: true}, (p) => ({mainPages: current(p).agenda.mainPages, capacity: current(p).agenda.capacity, fits: current(p).agenda.fits})),
    observe("pages-beyond-the-agenda-are-a-gap", boardPacketInput(2, (c) => {c.agendaMinutes = "30";}), {fits: false, gap: true},
      (p) => ({fits: p.readings!.material!.fitsAgenda, gap: p.gaps.some((g) => g.reason === "pages_exceed_agenda")})),
    reuse("turn-3-recommendation-withdrawn-and-facts-kept", p3, t3, {outcome: "applied", recommendation: null,
      kept: ["irr", "wacc", "npv", "payback", "peak-need", "npv-economy", "npv-capex", "npv-slow", "npv-defer", "irr-defer"], firstLine: "Retorno de 16% ao ano contra custo de capital de 15% ao ano; VPL de R$ 0,7 milhão."},
      (p) => ({outcome: p.readings!.omissions[0]!.outcome, recommendation: pageOf(p, "linha").recommendation, kept: p.readings!.omissions[0]!.keptFigureIds, firstLine: pageOf(p, "linha").lines[0]})),
    reuse("turn-3-options-with-criteria-and-numbers", p3, t3,
      ["Seguir agora: VPL de R$ 0,7 milhão e retorno de 16% ao ano.", "Seguir em etapas: VPL de [pendente].", "Esperar as cotações, no caso que a análise registra como adiamento: VPL de R$ 1,4 milhão e retorno de 17% ao ano."],
      (p) => pageOf(p, "linha").options),
    reuse("turn-3-deliberation-becomes-the-choice-and-the-notice-stays", p3, t3,
      "decidir o caminho da linha de embalagem, e enviar ao fornecedor o aviso para renegociar o contrato até 2/out", (p) => current(p).deliberations[0]!.text),
    reuse("turn-3-prior-version-kept", p3, t3, {versions: [1, 2], priorRecommendation: true, priorFingerprint: true},
      (p) => {const v = p.result.discussion!.versions; return {versions: v.map((x) => x.version), priorRecommendation: v[0]!.pages.find((x) => x.id === "linha")!.recommendation !== null,
        priorFingerprint: p.readings!.material!.priorVersionFingerprint === v[0]!.fingerprint};}),
    observe("refuses-to-omit-the-return-on-request", boardPacketInput(3, (c) => {c.omissions = [{id: "sem-retorno", target: "figure", targetId: "irr", requestedBy: "requester.chair"}];}),
      {outcome: "refused", stillShown: true, versions: 1},
      (p) => ({outcome: p.readings!.omissions[0]!.outcome, stillShown: pageOf(p, "linha").lines[0]!.includes("16%"), versions: p.result.discussion!.versions.length})),
    observe("refuses-to-drop-the-line-page", boardPacketInput(3, (c) => {c.omissions = [{id: "sem-linha", target: "page", targetId: "linha", requestedBy: "requester.chair"}];}),
      {outcome: "refused", reason: "Só a recomendação pode sair a pedido; páginas, linhas e fatos ficam no material como foram compostos.", pageKept: true},
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
      "Caminho A: caixa mínimo de R$ 15 milhões; alavancagem de 2,20x; custo de R$ 49 milhões; dívida líquida em 2028 de R$ 79 milhões; nos critérios: sim; anuência: não.",
      "Caminho D: caixa mínimo de R$ -79 milhões; alavancagem de 2,38x; custo de R$ 25 milhões; dívida líquida em 2028 de R$ 81 milhões; nos critérios: não; anuência: não."],
      (p) => [pageOf(p, "caminhos").lines[0], pageOf(p, "caminhos").lines[3]]),
    reuse("paths-page-has-seven-paths-with-every-measure", p2, t2, {lines: 7, measures: true},
      (p) => ({lines: pageOf(p, "caminhos").lines.length, measures: pageOf(p, "caminhos").lines.every((l) => ["caixa mínimo", "alavancagem", "custo", "dívida líquida em 2028", "nos critérios", "anuência"].every((m) => l.includes(m)))})),
    reuse("every-material-fact-shown-in-the-current-version", p3, t3, {shown: true, deadlines: 4},
      (p) => ({shown: p.readings!.material!.materialFactsShown, deadlines: p.result.discussion!.materialFacts.deadlines.length})),
    observe("refuses-removing-a-date-that-shares-a-line-with-material-facts", boardPacketInput(2, (c) => {c.omissions = [{id: "sem-mes", target: "figure", targetId: "peak-date", requestedBy: "requester.cfo"}];}),
      {outcome: "refused", kept: []}, (p) => ({outcome: p.readings!.omissions[0]!.outcome, kept: p.readings!.omissions[0]!.keptFigureIds})),
    observe("refuses-removing-a-date-that-carries-a-leverage-reading", boardPacketInput(2, (c) => {c.omissions = [{id: "sem-data", target: "figure", targetId: "dez27-date", requestedBy: "requester.cfo"}];}),
      {outcome: "refused", kept: []}, (p) => ({outcome: p.readings!.omissions[0]!.outcome, kept: p.readings!.omissions[0]!.keptFigureIds})),
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
    reuse("strategic-reason-shown-as-the-chair-s-informed-fact", p2, t2, {line: "Motivo apresentado pelo presidente do conselho: reduzir a dependência de um único fornecedor do insumo principal.",
      informed: [{id: "motivo-estrategico", origin: "informed", author: "chair", code: "reduce_single_supplier_dependence"}], figures: []},
      (p) => ({line: pageOf(p, "linha").lines[3], informed: p.result.discussion!.informed,
        figures: current(p).bindings.filter((b) => b.templateId === "topic.project_strategic_reason").flatMap((b) => b.figureId ? [b.figureId] : [])})),
    observe("line-kept-with-receipts-missing-never-says-without-the-line",
      withBoardSource("caixa-semanal", boardWeeklyVariant(), () => boardPacketInput(2, boardWeeklyVariantCase)), {alternative: true, withoutTheLine: false, status: "partial"},
      (p) => ({alternative: pageOf(p, "caixa").lines[0]!.startsWith("No caso alternativo de menor caixa"), withoutTheLine: boardShownTexts(p).some((t) => /sem a linha da safra/i.test(t)), status: p.status})),
    observe("working-capital-of-another-year-is-shown-as-a-variation", boardPacketInput(2, boardWorkingCapital2027),
      "No cenário de prazo maior de recebimento das redes, a variação do capital de giro em 2027 fica R$ 1 milhão acima da do cenário de referência.",
      (p) => pageOf(p, "mudaria").lines[3]),
    observe("omission-of-pages-is-refused-and-no-fact-sentence-leaves", boardPacketInput(3, (c) => {
      c.omissions = [{id: "sem-movimentos", target: "page", targetId: "movimentos", requestedBy: "requester.chair"}, {id: "sem-recomendacao", target: "page", targetId: "recomendacao", requestedBy: "requester.chair"}];
    }), {outcomes: ["refused", "refused"], versions: 1, movesShown: true, amortizationShown: true},
      (p) => ({outcomes: p.readings!.omissions.map((o) => o.outcome), versions: p.result.discussion!.versions.length,
        movesShown: current(p).pages.some((x) => x.id === "movimentos"), amortizationShown: boardShownTexts(p).some((t) => t.includes("Amortização de 2029 a 2033"))})),
    observe("informed-reason-outside-the-dictionary-shows-generic-words-and-a-gap", boardPacketInput(2, (c) => {c.informed[0]!.code = "a_divida_corresponde_a_um_bilhao";}),
      {line: "Motivo apresentado pelo presidente do conselho: a confirmar.", gap: "page.linha.line.3.informed.motivo-estrategico", status: "partial", shown: false},
      (p) => ({line: pageOf(p, "linha").lines[3], gap: p.result.discussion!.gaps.find((g) => g.reason === "informed_reason_not_in_dictionary")?.item ?? null, status: p.status,
        shown: boardShownTexts(p).some((t) => /bilhão|bilião|corresponde a um|a_divida/i.test(t))})),
    reuse("peer-cost-keeps-the-unexplained-remainder", p2, t2,
      "Da diferença de 125 pontos, os ajustes conhecidos somam 70 pontos, dos quais 60 pontos de ajuste pela data de contratação; 55 pontos ficam sem explicação na comparação.",
      (p) => current(p).questions.find((q) => q.id === "serra-verde")!.answer),
        observe("credit-line-restricted-to-machinery-is-never-a-working-capital-line", withBoardSource("tabela-divida", debtTableWithCreditLineLabel("Linha para aquisição de máquinas"), () => boardPacketInput(2)),
      {line: "Linha de crédito registrada com Itaú, com limite livre de R$ 10 milhões; modalidade e finalidade: [pendente].", claimsOverdraft: false},
      (p) => ({line: pageOf(p, "safra").lines[1], claimsOverdraft: boardShownTexts(p).some((t) => /conta garantida|máquinas/i.test(t))})),
    observe("debtor-rede-z-behind-the-old-identifiers-is-never-called-rede-a", withBoardSource("recebiveis", auroraReceivablesPacket({debtorRenamed: true}) as unknown as Record<string, unknown>, () => boardPacketInput(2)),
      {question: "Dependemos demais de um único cliente?", calledReda: false, gap: true},
      (p) => ({question: current(p).questions.find((q) => q.id === "rede-a")!.question, calledReda: boardShownTexts(p).some((t) => /rede A|Rede Z/.test(t)),
        gap: p.result.discussion!.gaps.some((g) => g.reason === "label_not_in_dictionary" && g.item.includes("rede-a-label"))})),
    // Review r18: an object is named only by its registered field in a closed vocabulary, the same in every source.
    observe("sugar-scenario-is-never-called-wheat", withBoardSource("projecao", auroraProjectionPacket({shockLabel: "Informado, com açúcar +15% e repasse em quatro meses"}) as unknown as Record<string, unknown>, () => boardPacketInput(2)),
      {generic: true, namesInput: false, gap: true},
      (p) => ({generic: pageOf(p, "mudaria").lines[1]!.startsWith("No cenário do insumo "), namesInput: boardShownTexts(p).some((t) => /trigo|açúcar/i.test(t)),
        gap: p.result.discussion!.gaps.some((g) => g.reason === "object_not_in_vocabulary" && g.item.endsWith(".object.wheat-label"))})),
    observe("boiler-investment-with-a-boiler-plan-is-named-as-the-boiler", withBoardSource("linha-embalagem", auroraInvestmentPacket({baseLabel: "Caldeira, cronograma original"}) as unknown as Record<string, unknown>,
      () => withBoardSource("plano-2027", auroraPlanPacket({projectNamed: "caldeira"}) as unknown as Record<string, unknown>, () => boardPacketInput(2))),
      {title: true, firstPath: true, namesPackaging: false},
      (p) => ({title: pageOf(p, "linha").title.startsWith("A caldeira rende "), firstPath: pageOf(p, "movimentos").lines[0]!.startsWith("Caminho A: sem a caldeira; "),
        namesPackaging: boardShownTexts(p).some((t) => /linha de embalagem/i.test(t))})),
    // Review r19: whole-field identity; a joint program is never the client's own, and its volume is the client's.
    observe("input-label-corn-up-wheat-unchanged-never-names-an-input", withBoardSource("projecao", auroraProjectionPacket({shockLabel: "Milho 15% mais caro, com trigo inalterado"}) as unknown as Record<string, unknown>, () => boardPacketInput(2)),
      {generic: true, namesInput: false, gap: true},
      (p) => ({generic: pageOf(p, "mudaria").lines[1]!.startsWith("No cenário do insumo "), namesInput: boardShownTexts(p).some((t) => /trigo|açúcar|milho|óleo/i.test(t)),
        gap: p.result.discussion!.gaps.some((g) => g.reason === "object_not_in_vocabulary" && g.item.endsWith(".object.wheat-label"))})),
    observe("input-label-corn-not-wheat-never-names-an-input", withBoardSource("projecao", auroraProjectionPacket({shockLabel: "Alta do milho, não do trigo"}) as unknown as Record<string, unknown>, () => boardPacketInput(2)),
      {generic: true, namesInput: false, gap: true},
      (p) => ({generic: pageOf(p, "mudaria").lines[1]!.startsWith("No cenário do insumo "), namesInput: boardShownTexts(p).some((t) => /trigo|açúcar|milho|óleo/i.test(t)),
        gap: p.result.discussion!.gaps.some((g) => g.reason === "object_not_in_vocabulary" && g.item.endsWith(".object.wheat-label"))})),
    observe("input-label-oil-up-wheat-unchanged-never-names-an-input", withBoardSource("projecao", auroraProjectionPacket({shockLabel: "Óleo mais caro; trigo sem mudança"}) as unknown as Record<string, unknown>, () => boardPacketInput(2)),
      {generic: true, namesInput: false, gap: true},
      (p) => ({generic: pageOf(p, "mudaria").lines[1]!.startsWith("No cenário do insumo "), namesInput: boardShownTexts(p).some((t) => /trigo|açúcar|milho|óleo/i.test(t)),
        gap: p.result.discussion!.gaps.some((g) => g.reason === "object_not_in_vocabulary" && g.item.endsWith(".object.wheat-label"))})),
    observe("joint-program-shows-the-client-s-volume-without-an-owner", withBoardSource("recebiveis", auroraReceivablesPacket({jointProgram: true}) as unknown as Record<string, unknown>,
      () => boardPacketInput(2, (c) => {c.questions[8]!.answer = "a.anchor_shared|rede=rede-a-label|saldo=rede-a|carteira=carteira|volume=rede-a-retained|taxa=spread-a";})),
      {volume: true, own: false},
      (p) => ({volume: current(p).questions.find((q) => q.id === "rede-a")!.answer.includes("um programa de antecipação aceita R$ 19,8 milhões desses recebíveis"),
        own: boardShownTexts(p).some((t) => /próprio dele|23,5 milhões desses/.test(t))})),
    // Review r42: the same breach read through composite selectors, stated and kept.
    observe("covenant-of-2-4-read-by-composite-selectors-breach-stated", (() => {
      const packet = auroraCovenantPacket({covenantMaximum: "2.4", adverseDebt: "123.57599438"}) as unknown as Record<string, unknown>;
      return withBoardSource("covenant", packet, () => boardPacketInput(2, (c) => {boardRestateSource("covenant", "measure-covenant-headroom", packet)(c);
        c.extraReadings["cov-limit"] = ["covenant", "result.headroom.limits[id=aditamento&kind=contractual].maximumRatio", "1", "2.4"];
        c.extraReadings["lev-adv27"] = ["covenant", "result.headroom.measurements[id=dez27-adverso&scenario=adverse].ratio", "2", "2.45"];
        c.extraReadings["adv27-date"] = ["covenant", "result.headroom.measurements[id=dez27-adverso].date", "month_long", "2027-12-31"];
        c.questions = c.questions.filter((q) => q.id !== "trigo");
        c.pages.find((x) => x.id === "alavancagem")!.lines.push("risk.leverage_breach_covenant|ebitda=ebitda-adv27|data=adv27-date|alavancagem=lev-adv27|covenant=cov-limit");}));
    })(), {line: "Com EBITDA de R$ 48,1 milhões em dezembro de 2027, a alavancagem chega a 2,45x e passa o covenant de 2,4x."},
      (p) => ({line: pageOf(p, "alavancagem").lines.find((l) => l.includes("passa o covenant"))})),
    // Review r41: the 2027 breach of a covenant of 2,35x stated in its own sentence; the material comes out.
    observe("covenant-of-2-35-breached-in-2027-stated-with-limit-measurement-and-date", (() => {
      const packet = auroraCovenantPacket({covenantMaximum: "2.35"}) as unknown as Record<string, unknown>;
      return withBoardSource("covenant", packet, () => boardPacketInput(2, (c) => {boardRestateSource("covenant", "measure-covenant-headroom", packet)(c);
        c.extraReadings["cov-limit"] = ["covenant", "result.headroom.limits[id=aditamento].maximumRatio", "2", "2.35"];
        c.extraReadings["adv27-date"] = ["covenant", "result.headroom.measurements[id=dez27-adverso].date", "month_long", "2027-12-31"];
        c.questions = c.questions.filter((q) => q.id !== "trigo");
        c.pages.find((x) => x.id === "alavancagem")!.lines.push("risk.leverage_breach_covenant|ebitda=ebitda-adv27|data=adv27-date|alavancagem=lev-adv27|covenant=cov-limit");}));
    })(), {line: "Com EBITDA de R$ 48,1 milhões em dezembro de 2027, a alavancagem chega a 2,37x e passa o covenant de 2,35x."},
      (p) => ({line: pageOf(p, "alavancagem").lines.find((l) => l.includes("passa o covenant"))})),
    // Review r40: with several tested profiles, the term answer names the one it reads by what is proven, never "mais curto".
    observe("term-answer-with-a-shorter-profile-registered-names-the-profile-read", (() => {
      const packet = auroraPlanPacket({shorterProfile: true}) as unknown as Record<string, unknown>;
      return withBoardSource("plano-2027", packet, () => boardPacketInput(2, boardRestateSource("plano-2027", "evaluate-financing-paths", packet)));
    })(), {answer: "Num perfil de amortização testado que termina antes do adotado, a amortização de 2029, de R$ 33 milhões, passa o caixa disponível depois dos juros, de R$ 24 milhões; o perfil adotado passa em todo o horizonte."},
      (p) => ({answer: current(p).questions.find((q) => q.id === "prazo")!.answer})),
    // Review r39: a seen crop never sends the unseen packaging line to the appendix; the withdrawal reaches every occurrence of its theme only.
    observe("unseen-packaging-line-stays-before-the-recommendation-when-the-crop-is-seen", boardPacketInput(2, (c) => {c.topics = c.topics.map((t) => ({...t, seen: t.id === "safra"}));}),
      {linha: "main", safra: "appendix"}, (p) => ({linha: pageOf(p, "linha").placement, safra: pageOf(p, "safra").placement})),
    observe("withdrawal-of-the-packaging-line-recommendation-reaches-every-occurrence-and-only-it", boardPacketInput(3),
      {linha: false, safra: true, vencimentos: true, anywhere: false}, (p) => {const v = current(p); const all = [v.summary, ...v.deliberations.map((x) => x.text), ...v.pages.flatMap((x) => [x.title, ...x.lines, x.recommendation ?? "", ...x.options])].join(" | ");
        return {linha: v.deliberations.find((x) => x.id === "linha")!.recommendationShown, safra: v.deliberations.find((x) => x.id === "safra")!.recommendationShown,
          vencimentos: v.deliberations.find((x) => x.id === "vencimentos")!.recommendationShown, anywhere: /não emitir o pedido de compra|Recomendamos pedir cotações/.test(all)};}),
    // Review r36: the demand floor is inclusive; at the floor and one quantum above, the floor is said "a partir de".
    ...(["74.44", "74.45"] as const).map((amount) => observe(`demand-${amount === "74.44" ? "exactly-at" : "one-quantum-above"}-the-floor-said-from-the-floor`, boardDemandAt(amount) as BoardCapitalDiscussionPacketInput,
      {title: "A recomendação depende de demanda a partir de R$ 74,44 milhões"}, (p) => ({title: boardShownTexts(p).find((t) => t.startsWith("A recomendação depende de demanda"))}))),
    // Review r35: "de curto prazo" only with a registered effective term of up to twelve months (0,5, 1,25 and 2,25 anos).
    ...([[2, "six"], [5, "fifteen"], [9, "twenty-seven"]] as const).map(([period, months]) => observe(`bank-credit-of-${months}-months-${period === 2 ? "called-short-term" : "described-without-short-term"}`, (() => {
      const packet = auroraPlanPacket({giroPaidInPeriod: period}) as unknown as Record<string, unknown>;
      return withBoardSource("plano-2027", packet, () => boardPacketInput(2, boardRestateSource("plano-2027", "evaluate-financing-paths", packet)));
    })(), {line: true, short: period === 2}, (p) => {const line = boardShownTexts(p).find((t) => t.startsWith("Caminho A: sem ")); return {line: Boolean(line), short: Boolean(line?.includes("crédito bancário de curto prazo"))};})),
    // Review r34: the annual projection keeps "EBITDA de 2027".
    observe("annual-projection-row-shown-as-the-year", (() => {
      const packet = auroraProjectionPacket() as unknown as Record<string, unknown>;
      return withBoardSource("projecao", packet, () => boardPacketInput(2, boardRestateSource("projecao", "build-operating-projection", packet)));
    })(), {line: "No cenário do trigo 15% mais caro com repasse em 4 meses, o EBITDA de 2027 fica em cerca de R$ 52,6 milhões."}, (p) => ({line: pageOf(p, "mudaria").lines[1]})),
    // Audit after r33: the rating benefit net of the known costs, said as such, and a unique largest creditor.
    observe("rating-benefit-net-of-known-costs-with-incomplete-coverage", withBoardSource("custo-relativo", auroraRelativeCostPacket({ratingCostCoverage: "incomplete"}),
      () => boardPacketInput(2, (c) => {const q = c.questions.find((x) => x.id === "rating")!; q.answer = q.answer.replace("a.rating|", "a.rating_known_costs|");})),
      {qualified: true}, (p) => ({qualified: current(p).questions.find((q) => q.id === "rating")!.answer.includes("o ganho líquido dos custos conhecidos fica entre")})),
    observe("largest-creditor-unique-with-another-principal", (() => {
      const packet = debtTableWithPrincipal("ccb-bradesco", "50");
      return withBoardSource("tabela-divida", packet, () => boardPacketInput(2, boardRestateSource("tabela-divida", "build-company-debt-table", packet)));
    })(), {line: "Prazo médio de 1,5 anos; maior credor: Debenturistas, com 43% da dívida."},
      (p) => ({line: current(p).pages.flatMap((x) => x.lines).find((l) => l.startsWith("Prazo médio"))})),
    // Review r32: the period of a lever's benefit is the horizon its source registers.
    ...([3, 6, 12] as const).map((months) => observe(`rating-benefit-over-${months}-months`, (() => {
      const packet = auroraRelativeCostPacket({ratingHorizonMonths: [months, months]});
      return withBoardSource("custo-relativo", packet, () => boardPacketInput(2, boardRatingReadings(packet)));
    })(), {period: months === 12 ? "por ano" : months === 3 ? "em três meses" : "em seis meses"},
      (p) => ({period: /milhão (por ano|em três meses|em seis meses);/.exec(current(p).questions.find((q) => q.id === "rating")!.answer)?.[1]}))),
    // Review r31: the same presentation through equivalent selectors is one reading of one field.
    observe("equivalent-selectors-with-one-presentation", withBoardSource("covenant", auroraCovenantPacket({adverseDebt: "124.0361"}) as unknown as Record<string, unknown>,
      () => boardPacketInput(2, boardEquivalentSelectors("2", "2.46"))),
      {below: true}, (p) => ({below: current(p).questions.find((q) => q.id === "trigo")!.answer.includes("a alavancagem fica em 2,46x, abaixo do covenant de 3,0x.")})),
    // Review r30: the contractual adverse test against the covenant of 3,0x, beside the managerial one.
    observe("contractual-adverse-below-the-covenant-of-3-0-beside-a-managerial-measurement", withBoardSource("covenant", auroraCovenantPacket({adverseManagerial: true}) as unknown as Record<string, unknown>,
      () => boardPacketInput(2, boardCovenantAnswer("3.0", false))),
      {below: true}, (p) => ({below: current(p).questions.find((q) => q.id === "trigo")!.answer.includes("a alavancagem fica em 2,37x, abaixo do covenant de 3,0x.")})),
    // Review r29: the readings bound to the registered contractual test are named for what it is.
    observe("contractual-reading-by-the-registered-test-beside-a-managerial-contrast", withBoardSource("covenant", auroraCovenantPacket({baseAsManagerialContrast: true}) as unknown as Record<string, unknown>,
      () => boardPacketInput(2, (c) => {c.extraReadings["lev-dez26"] = ["covenant", "result.headroom.measurements[id=dez26-contratual].ratio", "1", "2.2"];
        c.extraReadings["dez26-date"] = ["covenant", "result.headroom.measurements[id=dez26-contratual].date", "month_long", "2026-12-31"];})),
      {line: "Pelo EBITDA gerencial, 2,0x; pela definição da escritura, 2,2x em dezembro de 2026."}, (p) => ({line: pageOf(p, "politica").lines[0]})),
    // Review r28: the policy of 2,44x shown with two decimals keeps every member below it, the unshown 2,426x included.
    observe("policy-shown-with-two-decimals-above-every-measurement", withBoardSource("covenant", auroraCovenantPacket({policyMaximum: "2.44", unshownMeasurement: true}) as unknown as Record<string, unknown>,
      () => boardPacketInput(2, (c) => {c.extraReadings["policy-limit"] = ["covenant", "result.headroom.limits[id=politica].maximumRatio", "2", "2.44"];})),
      {title: "A alavancagem chega a 2,37x no adverso de 2027, abaixo da política de 2,44x pela definição da escritura"}, (p) => ({title: pageOf(p, "alavancagem").title})),
    // Review r27: the adverse leverage with two decimals, shown only in the wheat answer, keeps the summary's order.
    observe("summary-below-the-policy-with-the-adverse-shown-with-two-decimals", withBoardSource("covenant", auroraCovenantPacket({adverseDebt: "124"}) as unknown as Record<string, unknown>,
      () => boardPacketInput(2, (c) => {c.extraReadings["lev-adv27"] = ["covenant", "result.headroom.measurements[id=dez27-adverso].ratio", "2", "2.46"];
        const page = c.pages.find((x) => x.id === "alavancagem")!; page.title = "risk.policy_definition|politica=policy-limit"; page.lines = page.lines.filter((l) => !l.startsWith("risk.leverage_adverse"));})),
      {wheat: true}, (p) => ({wheat: current(p).questions.find((q) => q.id === "trigo")!.answer.includes("a alavancagem fica em 2,46x")})),
    // Review r26: the same figures stated with two decimals keep the order and the sign as shown.
    observe("adverse-leverage-stated-with-two-decimals-keeps-the-order", withBoardSource("covenant", auroraCovenantPacket({adverseDebt: "124"}) as unknown as Record<string, unknown>,
      () => boardPacketInput(2, (c) => {c.extraReadings["lev-adv27"] = ["covenant", "result.headroom.measurements[id=dez27-adverso].ratio", "2", "2.46"];})),
      {title: "A alavancagem chega a 2,46x no adverso de 2027, abaixo da política de 2,5x pela definição da escritura"}, (p) => ({title: pageOf(p, "alavancagem").title})),
    observe("sensitivity-npv-stated-with-two-decimals-keeps-the-sign", withBoardSource("linha-embalagem", auroraInvestmentPacket({economyCaseFactor: "0.965"}) as unknown as Record<string, unknown>,
      () => boardPacketInput(2, (c) => {c.extraReadings["npv-economy"] = ["linha-embalagem", "comparison.metrics[caseId=economy-4].netPresentValue", "2", "-0.01"];})),
      {negative: true}, (p) => ({negative: pageOf(p, "linha").lines.some((l) => l.includes("com economia menor, R$ -0,01 milhão"))})),
    // Review r25: the variant by its components, the species by its registered label, and an order only as shown.
    observe("deferred-variant-with-double-capex-described-by-its-components", (() => {
      const plan = auroraPlanPacket({deferredCapexFactor: 2}) as unknown as Record<string, unknown>;
      return withBoardSource("plano-2027", plan, () => boardPacketInput(2, (c) => {boardRestatePath(c, plan, "adiar-linha");
        const page = c.pages.find((x) => x.id === "movimentos")!; page.lines = page.lines.map((l) => l.replace("alternatives.moves.defer_line|", "alternatives.moves.defer_line_generic|"));}));
    })(), {line: "Caminho B: outra variante da linha de embalagem, com capex, EBITDA, depreciação, manutenção e capital de giro de partida começando depois dos do plano de referência; crédito bancário de curto prazo."},
      (p) => ({line: pageOf(p, "movimentos").lines[1]})),
    observe("long-instrument-registered-as-a-commercial-note", withBoardSource("plano-2027", auroraPlanPacket({longInstrumentLabel: "Nota comercial"}) as unknown as Record<string, unknown>, () => boardPacketInput(2)),
      {title: true, debenture: false}, (p) => ({title: pageOf(p, "recomendacao").title.startsWith("Recomendamos sondar uma nota comercial de até"),
        debenture: boardShownTexts(p).some((t) => /sond(ar|agem) .*debênture|Demanda da debênture/.test(t))})),
    observe("long-instrument-without-a-registered-species", withBoardSource("plano-2027", auroraPlanPacket({longInstrumentLabel: "Nota comercial de longo prazo"}) as unknown as Record<string, unknown>, () => boardPacketInput(2)),
      {title: true, gap: true}, (p) => ({title: pageOf(p, "recomendacao").title.startsWith("Recomendamos sondar um instrumento de mercado de capitais de até"),
        gap: p.result.discussion!.gaps.some((g) => g.reason === "species_not_registered")})),
    observe("return-and-cost-of-capital-equal-as-shown", (() => {
      const investment = auroraInvestmentPacket({discountRate: "0.158"}) as unknown as Record<string, unknown>;
      return withBoardSource("linha-embalagem", investment, () => boardPacketInput(2, (c) => {
        c.extraReadings.wacc = ["linha-embalagem", "comparison.metrics[caseId=base].discountRate", "0", "16"];
        for (const [id, caseId] of [["npv", "base"], ["npv-economy", "economy-4"], ["npv-capex", "capex-120"], ["npv-slow", "slower-start"], ["npv-defer", "defer-12"]] as const)
          c.extraReadings[id] = ["linha-embalagem", `comparison.metrics[caseId=${caseId}].netPresentValue`, "1", boardStatedMillions(investment, caseId)];
      }));
    })(), {title: "A linha de embalagem rende 16% ao ano, praticamente igual ao custo de capital de 16% ao ano"}, (p) => ({title: pageOf(p, "linha").title})),
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
    ["years-bound-to-a-months-slot", () => boardPacketInput(2, (c) => {c.pages[11]!.lines[1] = "what_changes.wheat|choque=wheat-shock|defasagem=wal|ano=year-2027|ebitda=ebitda-wheat|insumo=wheat-label";}), "board_capital_slot_type_mismatch"],
    ["value-bound-to-a-date-slot", () => boardPacketInput(2, (c) => {c.pages[1]!.title = "situation.debt_total|total=divida-total|ano=divida-total";}), "board_capital_slot_type_mismatch"],
    ["prose-in-a-binding", () => boardPacketInput(2, (c) => {c.pages[1]!.title = "situation.debt_total|total=menos divida-total|ano=year-2027";}), "must match pattern"],
    ["literal-number-in-a-title", () => boardPacketInput(2, (c) => {c.pages[1]!.title = "A dívida é de R$ 130 milhões, curta e concentrada em {year-2027}";}), "must match pattern"],
    ["literal-deadline-in-a-line", () => boardPacketInput(2, (c) => {c.pages[12]!.lines[0] = "2/out: aviso ao fornecedor de embalagem.";}), "must match pattern"],
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
    ["next-steps-without-a-deadline", () => boardPacketInput(2, (c) => {c.pages[12]!.lines = ["topic.project_value|retorno=irr|custo=wacc|vpl=npv"];}), "board_capital_page_without_number:passos"],
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
    ["return-and-cost-of-capital-swapped", () => build(2, (c) => {c.pages[4]!.title = "topic.project_return|retorno=wacc|custo=irr|projeto=project-label";}), "board_capital_slot_concept_mismatch:topic.project_return:retorno"],
    ["debt-total-bound-to-the-free-basket", () => build(2, (c) => {c.pages[1]!.title = "situation.debt_total|total=basket-free|ano=year-2027";}), "board_capital_slot_concept_mismatch:situation.debt_total:total"],
    ["program-cost-bound-to-debt-shares", () => build(2, (c) => {c.pages[5]!.lines.push("topic.crop_program_cost|taxa_b=share-12m|taxa_a=largest-share");}), "board_capital_slot_concept_mismatch:topic.crop_program_cost:taxa_b"],
    ["positive-npv-under-a-negative-claim", () => build(2, (c) => {c.pages[4]!.lines[2] = "topic.project_sensitivities|vpl_economia=npv|vpl_capex=npv-capex|vpl_partida=npv-slow";}),
      "board_capital_slot_concept_mismatch:topic.project_sensitivities:vpl_economia"],
    ["path-row-reading-another-path", () => build(2, (c) => {c.pages[6]!.lines[3] = row("keep_and_roll", "sem-linha-debenture");}), "board_capital_slot_concept_mismatch:alternatives.row.keep_and_roll:caixa"],
    ["ebitda-of-another-year", () => build(2, (c) => {c.pages[11]!.lines[1] = "what_changes.wheat|choque=wheat-shock|defasagem=wheat-lag|ano=year-2028|ebitda=ebitda-wheat|insumo=wheat-label";}),
      "board_capital_slot_concept_mismatch:what_changes.wheat:ebitda:variable_y"],
    ["concentration-year-that-is-not-the-largest", () => build(2, (c) => {c.pages[1]!.title = "situation.debt_total|total=divida-total|ano=year-2028";}), "board_capital_template_condition_failed:situation.debt_total"],
    ["adverse-leverage-dated-in-another-year", () => build(2, (c) => {c.pages[9]!.title = "risk.leverage|politica=policy-limit|adverso=lev-adv27|ano=year-2026";}), "board_capital_template_condition_failed:risk.leverage"],
    ["notice-dated-with-the-route-deadline", () => build(2, (c) => {c.pages[12]!.lines[0] = "next_steps.notice|prazo=deadline:vencimentos.rota|projeto=project-label";}), "board_capital_deadline_action_mismatch:next_steps.notice:prazo:vencimentos.rota"],
    ["fallback-dated-with-the-sounding-deadline", () => build(2, (c) => {c.pages[8]!.lines[2] = "recommendation.alternative|credor=bradesco-creditor|prazo=deadline:vencimentos.sondagem|projeto=project-label";}),
      "board_capital_deadline_action_mismatch:recommendation.alternative"],
    ["action-of-another-deliberation", () => build(2, (c) => {c.deliberations[0]!.deadlines[0]!.action = "delib.action.decide_route";}), "board_capital_deliberation_text_mismatch:deliberation.linha.deadline.aviso"],
    ["subject-of-another-deliberation", () => build(2, (c) => {c.deliberations[0]!.subject = "delib.crop.subject|ano=year-2026";}), "board_capital_deliberation_text_mismatch:deliberation.linha.subject"],
    ["page-line-used-as-a-deliberation-subject", () => build(2, (c) => {c.deliberations[0]!.subject = "topic.project_payback|payback=payback|pico=peak-need|data=peak-date";}),
      "board_capital_template_use_invalid:deliberation.linha.subject"],
    ["answer-to-another-question", () => build(2, (c) => {c.questions[0]!.answer = "a.peer|total=gap-bps|ajustes=known-bps|data=date-bps|resto=unexplained-bps";}), "board_capital_answer_mismatch:bradesco"],
    // Review r8: one package per method, and a creditor named only by the creditor field of the right row.
    ["second-package-of-the-same-method", () => withExtraBoardSource({id: "covenant-2", methodId: covenant, packet: covenantWithAdverseDebt("400")}, () => build(2, (c) => {
      c.extraReadings["lev-adv27-b"] = ["covenant-2", "result.headroom.measurements[id=dez27-adverso].ratio", "2", "8.04"];
      c.pages[9]!.title = "risk.leverage|politica=policy-limit|adverso=lev-adv27-b|ano=year-2027";
    })), `board_capital_source_method_repeated:${covenant}`],
    ["basket-occupied-by-the-creditor-of-another-row", () => build(2, (c) => {finame(c); c.pages[3]!.lines[0] = "constraint.basket_usage|cesta=basket|ocupado=basket-used|credor=finame-creditor";}),
      "board_capital_template_condition_failed:constraint.basket_usage"],
    ["largest-creditor-in-a-row-creditor-slot", () => build(2, (c) => {c.pages[3]!.lines[0] = "constraint.basket_usage|cesta=basket|ocupado=basket-used|credor=largest-creditor";}),
      "board_capital_slot_concept_mismatch:constraint.basket_usage:credor"],
    ["prepaid-creditor-the-plan-does-not-prepay", () => build(2, (c) => {finame(c); c.pages[8]!.lines[0] = "recommendation.debenture_cost|credor=finame-creditor|baixo=deb-cost-low|alto=deb-cost-high";}),
      "board_capital_template_condition_failed:recommendation.debenture_cost"],
    ["amended-creditor-the-plan-does-not-amend", () => build(2, (c) => {finame(c); c.pages[7]!.lines[6] = c.pages[7]!.lines[6]!.replace("credor=bradesco-creditor", "credor=finame-creditor");}),
      "board_capital_template_condition_failed:alternatives.moves.extend_bradesco"],
    ["question-and-answer-name-different-creditors", () => build(2, (c) => {finame(c); c.questions[0]!.question = "q.roll_bank|credor=finame-creditor";}), "board_capital_answer_mismatch:bradesco:credor"],
    // Review r9: exposure is the balance the chain owes, never the program's volume or the eligible capacity; a
    // contractual assertion holds only when the registered contract says so.
    ["exposure-read-from-the-program-volume", () => build(2, (c) => {c.extraReadings["program-a-volume"] = ["recebiveis", "readings.options[id=risco-sacado-a].volume", "1", "19.8"]; c.questions[8]!.answer = "a.anchor|rede=rede-a-label|saldo=program-a-volume|carteira=carteira|volume=program-a-volume|taxa=spread-a";}),
      "board_capital_slot_concept_mismatch:a.anchor:saldo"],
    ["exposure-read-from-the-eligible-capacity", () => build(2, (c) => {
      c.extraReadings["rede-a-capacity"] = ["recebiveis", "result.funding.portfolio.items[itemId=rede-a].assignable", "1", "19.8"];
      c.questions[8]!.answer = "a.anchor|rede=rede-a-label|saldo=rede-a-capacity|carteira=carteira|volume=rede-a-retained|taxa=spread-a";
    }), "board_capital_slot_concept_mismatch:a.anchor:saldo"],
    ["program-volume-under-a-sublimit-shown-as-exposure", () => withBoardSource("recebiveis", auroraReceivablesPacket({sublimitA: "10"}) as unknown as Record<string, unknown>, () => build(2, (c) => {
      c.extraReadings["program-a-volume"] = ["recebiveis", "readings.options[id=risco-sacado-a].volume", "1", "10.0"];
      c.extraReadings["rede-a-retained"] = ["recebiveis", "result.funding.options[id=risco-sacado-a].byItem[itemId=rede-a].retained", "1", "10.0"];
      c.extraReadings.programs = ["recebiveis", "readings.plan[optionId=risco-sacado-a].cumulative", "1", "13.7"];
      c.questions[8]!.answer = "a.anchor|rede=rede-a-label|saldo=program-a-volume|carteira=carteira|volume=program-a-volume|taxa=spread-a";
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
    // Review r21: "estendido na mesma medida" only when the periods added equal the deferral exactly.
    ...[2, 3, 5].flatMap((years) => ([2, 3] as const).map((turn) => [`one-year-deferral-with-a-${years}-year-extension-turn-${turn}`, () => {
      const packet = auroraInvestmentPacket({deferralHorizonYears: years}) as unknown as Record<string, unknown>;
      return withBoardSource("linha-embalagem", packet, () => build(turn, (c) => {boardDeferralReadings(packet)(c); boardStrictDeferral(c);}));
    }, "board_capital_template_condition_failed:topic.project_wait_quotes:1"] as [string, () => unknown, string])),
    // Review r22: one added period of 6, 24 or 48 months against a 12-month deferral, measured by dates.
    ...(["2037-06-30", "2038-12-31", "2040-12-31"] as const).flatMap((end) => ([2, 3] as const).map((turn) => [`one-year-deferral-with-an-added-period-ending-${end}-turn-${turn}`, () => {
      const packet = auroraInvestmentPacket({deferralLastPeriodEnd: end}) as unknown as Record<string, unknown>;
      return withBoardSource("linha-embalagem", packet, () => build(turn, (c) => {boardDeferralReadings(packet)(c); boardStrictDeferral(c);}));
    }, "board_capital_template_condition_failed:topic.project_wait_quotes:1"] as [string, () => unknown, string])),
    // Review r34: a half-year or a quarter row shown as a year; a page given another role than its templates'.
    ...([2, 3] as const).flatMap((turn) => [
      ...([["half-year", ["2026-12-31", "2027-06-30", "2027-12-31"]], ["quarter", ["2026-12-31", "2027-09-30", "2027-12-31"]]] as const).map(([kind, ends]) => [`${kind}-row-shown-as-ebitda-of-2027-turn-${turn}`, () => {
        const packet = auroraProjectionPacket({periodEnds: ends}) as unknown as Record<string, unknown>;
        return withBoardSource("projecao", packet, () => build(turn, boardRestateSource("projecao", "build-operating-projection", packet)));
      }, "board_capital_template_condition_failed:what_changes.wheat:3"]),
      [`recommendation-page-given-the-situation-role-turn-${turn}`, () => build(turn, (c) => {c.pages.find((x) => x.id === "recomendacao")!.role = "situation";}), "board_capital_page_role_mismatch:recomendacao:situation"],
    ] as [string, () => unknown, string][]),
    // Review r33 and the audit of every claim: the whole plan, the cost coverage, the program count, the alternative
    // presented and a unique largest creditor.
    ...([2, 3] as const).flatMap((turn) => [
      ...(["25", "40"] as const).map((peak) => [`bank-discount-after-the-programs-peak-${peak}-turn-${turn}`, () => withBoardSource("recebiveis",
        auroraReceivablesPacket({needPeak: peak, cheapBankDiscount: true}) as unknown as Record<string, unknown>,
        () => build(turn, (c) => {c.extraReadings["need-peak"] = ["recebiveis", "result.funding.need.peak", "0", peak];})), "board_capital_template_condition_failed:delib.crop.programs:8"]),
      [`third-program-in-the-plan-turn-${turn}`, () => withBoardSource("recebiveis", auroraReceivablesPacket({thirdProgram: true}) as unknown as Record<string, unknown>, () => build(turn, () => undefined)),
        "board_capital_template_condition_failed:topic.crop_programs:7"],
      [`rating-net-gain-with-incomplete-cost-coverage-turn-${turn}`, () => withBoardSource("custo-relativo", auroraRelativeCostPacket({ratingCostCoverage: "incomplete"}), () => build(turn, () => undefined)),
        "board_capital_template_condition_failed:a.rating:3"],
      [`alternative-plan-said-presented-and-absent-turn-${turn}`, () => build(turn, (c) => {for (const pg of c.pages) pg.lines = pg.lines.filter((l) => !l.startsWith("recommendation.alternative"));
        c.questions = c.questions.filter((x) => !x.answer.startsWith("a.demand"));}), "board_capital_alternative_not_presented"],
    ] as [string, () => unknown, string][]),
    ["largest-creditor-tied-with-another", () => {
      const packet = debtTableWithPrincipal("ccb-bradesco", "60");
      return withBoardSource("tabela-divida", packet, () => build(2, boardRestateSource("tabela-divida", "build-company-debt-table", packet)));
    }, "board_capital_template_condition_failed:situation.debt_profile:0"],
    // Review r32: a range whose ends cover different horizons is refused.
    ...([2, 3] as const).map((turn) => [`rating-range-of-three-and-twelve-months-turn-${turn}`, () => {
      const packet = auroraRelativeCostPacket({ratingHorizonMonths: [3, 12]});
      return withBoardSource("custo-relativo", packet, () => build(turn, boardRatingReadings(packet)));
    }, "board_capital_template_condition_failed:a.rating:0"] as [string, () => unknown, string]),
    // Review r31: equivalent selectors are one field; two presentations of it are refused.
    ...([2, 3] as const).map((turn) => [`adverse-leverage-2-4602-shown-twice-by-equivalent-selectors-turn-${turn}`, () => withBoardSource("covenant",
      auroraCovenantPacket({adverseDebt: "124.0361"}) as unknown as Record<string, unknown>, () => build(turn, boardEquivalentSelectors("1", "2.5"))),
      "board_capital_reading_presentation_not_unique:lev-adv27,lev-adv27-alt"] as [string, () => unknown, string]),
    // Review r30: compliance with a limit only by a registered, unbreached test of that very limit.
    ...([2, 3] as const).flatMap((turn) => [
      [`managerial-adverse-read-below-a-breached-covenant-turn-${turn}`, () => withBoardSource("covenant", auroraCovenantPacket({covenantMaximum: "2.3", adverseManagerial: true}) as unknown as Record<string, unknown>,
        () => build(turn, boardCovenantAnswer("2.3", true))), "board_capital_template_condition_failed:a.wheat:8"],
      [`contractual-adverse-against-a-covenant-of-2-3-turn-${turn}`, () => withBoardSource("covenant", auroraCovenantPacket({covenantMaximum: "2.3", adverseManagerial: true}) as unknown as Record<string, unknown>,
        () => build(turn, boardCovenantAnswer("2.3", false))), "board_capital_template_condition_failed:a.wheat:3"],
    ] as [string, () => unknown, string][]),
    // Review r29: a managerial contrast under the id dez26-base is never the base path nor the contractual reading.
    ...([2, 3] as const).map((turn) => [`managerial-contrast-under-the-base-id-read-as-the-contract-turn-${turn}`, () => withBoardSource("covenant",
      auroraCovenantPacket({baseAsManagerialContrast: true}) as unknown as Record<string, unknown>,
      () => build(turn, (c) => {c.extraReadings["lev-dez26"] = ["covenant", "result.headroom.measurements[id=dez26-base].ratio", "1", "2.1"];})),
      "board_capital_template_condition_failed:"] as [string, () => unknown, string]),
    // Review r28: every member of a global order, shown or not, against the limit as shown.
    ...([2, 3] as const).map((turn) => [`unshown-measurement-2-426-above-the-policy-shown-as-2-4-turn-${turn}`, () => withBoardSource("covenant",
      auroraCovenantPacket({policyMaximum: "2.44", unshownMeasurement: true}) as unknown as Record<string, unknown>,
      () => build(turn, (c) => {c.extraReadings["policy-limit"] = ["covenant", "result.headroom.limits[id=politica].maximumRatio", "1", "2.4"];})),
      "board_capital_display_order_lost:summary.closing.leverage:0:result.headroom.measurements[9].ratio,policy-limit"] as [string, () => unknown, string]),
    // Review r27: one presentation per reading across the material; a shorter profile by its last effective payment.
    ...([2, 3] as const).flatMap((turn) => [
      [`summary-below-the-policy-with-the-adverse-shown-as-2-5-in-the-wheat-answer-turn-${turn}`, () => withBoardSource("covenant", auroraCovenantPacket({adverseDebt: "124"}) as unknown as Record<string, unknown>,
        () => build(turn, (c) => {c.extraReadings["lev-adv27"] = ["covenant", "result.headroom.measurements[id=dez27-adverso].ratio", "1", "2.5"];
          const page = c.pages.find((x) => x.id === "alavancagem")!; page.title = "risk.policy_definition|politica=policy-limit"; page.lines = page.lines.filter((l) => !l.startsWith("risk.leverage_adverse"));})),
        "board_capital_display_order_lost:summary.closing.leverage:0:lev-adv27"],
      [`tested-profile-ending-in-2034-called-shorter-turn-${turn}`, () => withBoardSource("plano-2027", auroraPlanPacket({alternativeEndingIn2034: true}) as unknown as Record<string, unknown>, () => build(turn, () => undefined)),
        "board_capital_template_condition_failed:a.term"],
    ] as [string, () => unknown, string][]),
    ["same-reading-at-two-precisions", () => build(2, (c) => {c.extraReadings["lev-adv27-short"] = ["covenant", "result.headroom.measurements[id=dez27-adverso].ratio", "1", "2.4"];
      const q = c.questions.find((x) => x.id === "trigo")!; q.answer = q.answer.replace("alavancagem=lev-adv27", "alavancagem=lev-adv27-short");}), "board_capital_reading_presentation_not_unique"],
    // Review r26: an order or a sign that the shown figures do not keep.
    ...([2, 3] as const).flatMap((turn) => [
      [`adverse-leverage-2-459-shown-as-the-policy-2-5-turn-${turn}`, () => withBoardSource("covenant", auroraCovenantPacket({adverseDebt: "124"}) as unknown as Record<string, unknown>,
        () => build(turn, (c) => {c.extraReadings["lev-adv27"] = ["covenant", "result.headroom.measurements[id=dez27-adverso].ratio", "1", "2.5"];})), "board_capital_display_order_lost:risk.leverage:0:lev-adv27,policy-limit"],
      [`negative-npv-shown-as-zero-turn-${turn}`, () => withBoardSource("linha-embalagem", auroraInvestmentPacket({economyCaseFactor: "0.965"}) as unknown as Record<string, unknown>,
        () => build(turn, (c) => {c.extraReadings["npv-economy"] = ["linha-embalagem", "comparison.metrics[caseId=economy-4].netPresentValue", "1", "0.0"];})), "board_capital_display_order_lost:topic.project_sensitivities:0:npv-economy"],
    ] as [string, () => unknown, string][]),
    // Review r25: a plan variant whose capex also changes is not a deferral.
    ...([2, 10] as const).flatMap((factor) => ([2, 3] as const).map((turn) => [`deferred-variant-with-capex-times-${factor}-named-a-deferral-turn-${turn}`, () => {
      const plan = auroraPlanPacket({deferredCapexFactor: factor}) as unknown as Record<string, unknown>;
      return withBoardSource("plano-2027", plan, () => build(turn, (c) => boardRestatePath(c, plan, "adiar-linha")));
    }, "board_capital_template_condition_failed:alternatives.moves.defer_line"] as [string, () => unknown, string])),
    // Review r24: a pending figure takes only the slot of its own field; a condition on it is undefined and never holds.
    ["staged-npv-pending-as-the-cost-of-capital-at-30-percent", () => {
      const packet = auroraInvestmentPacket({discountRate: "0.3"}) as unknown as Record<string, unknown>;
      return withBoardSource("linha-embalagem", packet, () => build(2, (c) => {
        c.extraReadings.wacc = ["linha-embalagem", "comparison.metrics[caseId=base].discountRate", "0", "30"];
        for (const [id, caseId] of [["npv", "base"], ["npv-economy", "economy-4"], ["npv-capex", "capex-120"], ["npv-slow", "slower-start"], ["npv-defer", "defer-12"]] as const)
          c.extraReadings[id] = ["linha-embalagem", `comparison.metrics[caseId=${caseId}].netPresentValue`, "1", boardStatedMillions(packet, caseId)];
        c.pages.find((x) => x.id === "linha")!.title = "topic.project_return|retorno=irr|custo=stages-npv|projeto=project-label";
      }));
    }, "board_capital_slot_concept_mismatch:topic.project_return:custo:pending_origin"],
    ["staged-npv-pending-as-the-return-in-the-answer", () => build(2, (c) => {c.questions.find((q) => q.id === "estrategica")!.answer = "a.strategic|retorno=stages-npv|custo=wacc";}),
      "board_capital_slot_concept_mismatch:a.strategic:retorno:pending_origin"],
    ["cost-of-capital-pending-leaves-the-claim-undefined", () => {
      auroraBoardPending["wacc-pending"] = ["analyze-investment-project", "comparison.metrics[caseId=base].discountRate", "note.case_not_reviewed"];
      try {return build(2, (c) => {c.pages.find((x) => x.id === "linha")!.title = "topic.project_return|retorno=irr|custo=wacc-pending|projeto=project-label";});}
      finally {delete auroraBoardPending["wacc-pending"];}
    }, "board_capital_template_condition_undefined:topic.project_return:0"],
    // Review r23: the deferral is the base moved uniformly; the calibration's case is not, so the exact sentence is refused
    // and the material names the case by its registered role. The exact control passes the definition (conditions 0 and 1)
    // and is refused only by the comparison with going on now (condition 2): a pure deferral lowers a positive NPV.
    ["calibration-deferral-named-by-its-exact-definition", () => build(2, boardStrictDeferral), "board_capital_template_condition_failed:topic.project_wait_quotes:1"],
    ...(["control", "lastPeriodEconomy", "adoptedTimes", "startupCapital"] as const).flatMap((kind) => ([2, 3] as const).map((turn) => [`exact-deferral-${kind}-turn-${turn}`, () => {
      const packet = auroraInvestmentPacket({exactDeferral: kind}) as unknown as Record<string, unknown>;
      return withBoardSource("linha-embalagem", packet, () => build(turn, (c) => {boardDeferralReadings(packet)(c); boardStrictDeferral(c); c.deliberations.find((d) => d.id === "linha")!.recommendation = null;}));
    }, `board_capital_template_condition_failed:topic.project_wait_quotes:${kind === "control" ? 2 : 1}`] as [string, () => unknown, string])),
    // The option at turn 3, with the recommendation by registered role: refused by the definition alone.
    ...(["lastPeriodEconomy", "startupCapital"] as const).map((kind) => [`exact-deferral-${kind}-option-turn-3`, () => {
      const packet = auroraInvestmentPacket({exactDeferral: kind}) as unknown as Record<string, unknown>;
      return withBoardSource("linha-embalagem", packet, () => build(3, (c) => {boardDeferralReadings(packet)(c); boardStrictDeferral(c);
        c.deliberations.find((d) => d.id === "linha")!.recommendation = null; c.pages.find((x) => x.id === "linha")!.recommendation = "topic.project_wait_quotes_registered|vpl=npv-defer|retorno=irr-defer";}));
    }, "board_capital_template_condition_failed:option.wait_quotes:1"] as [string, () => unknown, string]),
    // Review r20: an exact definition compares the case's whole input object; a discount rate changed with the economy,
    // or alone (positive NPV at 15%, negative at 30%), is never presented as a smaller economy.
    ...([["smaller-economy-with-a-30-percent-discount-rate", true], ["base-operations-at-a-30-percent-discount-rate-called-smaller-economy", false]] as const).map(([name, withEconomy]) => [name, () => {
      const packet = auroraInvestmentPacket({economyCaseDiscountRate: {rate: "0.3", withEconomy}}) as unknown as Record<string, unknown>;
      return withBoardSource("linha-embalagem", packet, () => build(2, (c) => {c.extraReadings["npv-economy"] = ["linha-embalagem", "comparison.metrics[caseId=economy-4].netPresentValue", "1", boardStatedMillions(packet, "economy-4")];}));
    }, "board_capital_template_condition_failed:topic.project_sensitivities"] as [string, () => unknown, string]),
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
    // Review r18: the investment analysed and the plan's project variants name different projects.
    ["boiler-investment-against-the-packaging-plan", () => withBoardSource("linha-embalagem", auroraInvestmentPacket({baseLabel: "Caldeira, cronograma original"}) as unknown as Record<string, unknown>,
      () => build(2, () => undefined)), "board_capital_template_condition_failed:alternatives.moves."],
    // Review r19: the same category with different qualifiers is a different project; a joint program is never one client's own.
    ["packaging-line-sul-against-a-norte-plan", () => withBoardSource("linha-embalagem", auroraInvestmentPacket({baseLabel: "Linha de embalagem da unidade Sul, cronograma original"}) as unknown as Record<string, unknown>,
      () => withBoardSource("plano-2027", auroraPlanPacket({projectNamed: "linha de embalagem da unidade Norte"}) as unknown as Record<string, unknown>, () => build(2, () => undefined))),
      "board_capital_template_condition_failed:alternatives.moves."],
    ["joint-program-called-the-client-s-own", () => withBoardSource("recebiveis", auroraReceivablesPacket({jointProgram: true}) as unknown as Record<string, unknown>,
      () => build(2, () => undefined)), "board_capital_template_condition_failed:a.anchor"],
    ["deferral-without-a-deferred-schedule", () => {
      const packet = auroraPlanPacket({deferralWithoutLaterSchedule: true}) as unknown as Record<string, unknown>;
      return withBoardSource("plano-2027", packet, () => build(2, (c) => {boardRestatePath(c, packet, "adiar-linha");}));
    }, "board_capital_template_condition_failed:alternatives.moves.defer_line"],
    // Review r42: a composite selector equivalent to the simple one is the same limit, under the same fiscalization.
    ["covenant-of-2-4-read-by-a-composite-selector-breached-at-2-45-not-stated", () => {
      const packet = auroraCovenantPacket({covenantMaximum: "2.4", adverseDebt: "123.57599438"}) as unknown as Record<string, unknown>;
      return withBoardSource("covenant", packet, () => build(2, (c) => {boardRestateSource("covenant", "measure-covenant-headroom", packet)(c);
        c.extraReadings["cov-limit"] = ["covenant", "result.headroom.limits[id=aditamento&kind=contractual].maximumRatio", "1", "2.4"];
        c.extraReadings["lev-adv27"] = ["covenant", "result.headroom.measurements[id=dez27-adverso&scenario=adverse].ratio", "2", "2.45"];}));
    }, "board_capital_breach_not_disclosed:aditamento:dez27-adverso"],
    // Review r41: one period per sentence; a registered breach of a shown limit must be stated.
    ["wheat-answer-for-2027-with-the-adverse-measurement-of-2026", () => {
      const packet = auroraCovenantPacket() as unknown as Record<string, unknown>;
      return withBoardSource("covenant", packet, () => build(2, (c) => {boardRestateSource("covenant", "measure-covenant-headroom", packet)(c);
        c.extraReadings["ebitda-adv27"] = ["covenant", "result.headroom.measurements[id=dez26-adverso].reportedEbitda", "1", "52.4"];
        c.extraReadings["lev-adv26"] = ["covenant", "result.headroom.measurements[id=dez26-adverso].ratio", "2", "2.32"];
        const q = c.questions.find((x) => x.id === "trigo")!; q.answer = q.answer.replace("alavancagem=lev-adv27", "alavancagem=lev-adv26");}));
    }, "board_capital_template_condition_failed:a.wheat"],
    ["covenant-of-2-35-breached-in-2027-not-stated", () => {
      const packet = auroraCovenantPacket({covenantMaximum: "2.35"}) as unknown as Record<string, unknown>;
      return withBoardSource("covenant", packet, () => build(2, (c) => {boardRestateSource("covenant", "measure-covenant-headroom", packet)(c);
        c.extraReadings["cov-limit"] = ["covenant", "result.headroom.limits[id=aditamento].maximumRatio", "2", "2.35"];}));
    }, "board_capital_breach_not_disclosed:aditamento:dez27-adverso"],
    // Review r40: two readings compared share their base; otherwise refused.
    ["policy-definitions-compared-with-another-managerial-debt", () => {
      const packet = auroraCovenantPacket({managerialDebt: "80"}) as unknown as Record<string, unknown>;
      return withBoardSource("covenant", packet, () => build(2, boardRestateSource("covenant", "measure-covenant-headroom", packet)));
    }, "board_capital_template_condition_failed:risk.policy_readings"],
    ["leverage-path-ending-under-another-definition", () => {
      const packet = auroraCovenantPacket({endWithoutAdjustment: true}) as unknown as Record<string, unknown>;
      return withBoardSource("covenant", packet, () => build(2, boardRestateSource("covenant", "measure-covenant-headroom", packet)));
    }, "board_capital_template_condition_failed:risk.leverage_path"],
    // Review r39: the theme is derived from the templates; a topic in the facts that is not it, or none, is refused.
    ["page-topic-swapped-to-the-crop", () => boardPacketViaPremises(3, (c) => {c.pages.find((x) => x.id === "linha")!.topicId = "safra";}), "Topic safra of page linha is not the theme of its texts (linha-embalagem)"],
    ["page-topic-missing", () => boardPacketViaPremises(3, (c) => {c.pages.find((x) => x.id === "linha")!.topicId = null;}), "Topic of page linha missing"],
    ["deliberation-topic-swapped-to-the-crop", () => boardPacketViaPremises(3, (c) => {c.deliberations.find((x) => x.id === "linha")!.topicId = "safra";}), "Topic safra of deliberation linha is not the theme of its texts (linha-embalagem)"],
    // Review r38: "economia menor" is the net operating economy in every period; smaller first and larger later is refused.
    ["economy-smaller-first-and-larger-later", () => {
      const packet = auroraInvestmentPacket({economyLaterLarger: true}) as unknown as Record<string, unknown>;
      return withBoardSource("linha-embalagem", packet, () => build(2, (c) => {
        c.extraReadings["npv-economy"] = ["linha-embalagem", "comparison.metrics[caseId=economy-4].netPresentValue", "1", boardStatedMillions(packet, "economy-4")];}));
    }, "board_capital_template_condition_failed:topic.project_sensitivities"],
    // Review r37: a boundary shown at a precision that moves it to a value the source rejects is refused, naming the reading.
    ...([["0", "74"], ["1", "74.4"]] as const).map(([places, stated]) => [`demand-floor-shown-with-${places === "0" ? "no-decimals" : "one-decimal"}`, () => {
      const packet = auroraPlanPacket() as unknown as Record<string, unknown>;
      return withBoardSource("plano-2027", packet, () => build(2, (c) => {c.extraReadings["issue-floor"] = ["plano-2027", "readings.recommendation.longInstrument.issueFloorInsideGates", places, stated];}));
    }, "board_capital_boundary_display_unsafe:what_changes.title:issue-floor"] as [string, () => unknown, string]),
    ["twelve-month-horizon-mid-month-shown-as-the-month", () => {
      const packet = debtTableAtReferenceDate("2026-06-15");
      return withBoardSource("tabela-divida", packet, () => build(2, boardRestateSource("tabela-divida", "build-company-debt-table", packet)));
    }, "board_capital_boundary_display_unsafe:situation.debt_maturity:horizon-12m"],
    // Review r36: one quantum below the floor the plan has no recommendation; nothing about the demand is written.
    ["demand-one-quantum-below-the-floor", () => boardDemandAt("74.43", build), "board_capital_figure_without_origin:debenture-amount"],
    // Review r14: the debt kept as it is takes no new loan; a deferral starts operating later; a path's moves are its complete set.
    ["kept-debt-with-a-new-working-capital-loan", () => {
      const packet = auroraPlanPacket({keptDebtWithNewLoan: true}) as unknown as Record<string, unknown>;
      return withBoardSource("plano-2027", packet, () => build(2, (c) => {boardRestateKeptDebt(c, packet);}));
    }, "board_capital_template_condition_failed:situation.cash_shortfall"],
    ["deferral-with-operation-on-the-original-schedule", () => {
      const packet = auroraPlanPacket({deferralWithOperationOnTime: true}) as unknown as Record<string, unknown>;
      return withBoardSource("plano-2027", packet, () => build(2, (c) => {boardRestatePath(c, packet, "adiar-linha");}));
    }, "board_capital_template_condition_failed:alternatives.moves.defer_line"],
    ["extension-path-with-an-undeclared-prepayment", () => {
      const packet = auroraPlanPacket({extensionWithExtraPrepayment: true}) as unknown as Record<string, unknown>;
      return withBoardSource("plano-2027", packet, () => build(2, (c) => {boardRestatePath(c, packet, "alongar-bradesco");}));
    }, "board_capital_template_condition_failed:alternatives.moves.extend_bradesco"],
    // Review r15: moves and descriptions by the instruments' terms, never by identifiers; a deferral by every component.
    ["extension-whose-amendment-does-not-extend", () => {
      const packet = auroraPlanPacket({amendmentWithoutExtension: true}) as unknown as Record<string, unknown>;
      return withBoardSource("plano-2027", packet, () => build(2, (c) => {boardRestatePath(c, packet, "alongar-bradesco"); c.extraReadings["bradesco-gap"] = boardRestated(packet, "plano-2027", "result.evaluation.paths[id=bradesco-sem-linha].shortfallVsPolicyMinimum", 0);}));
    }, "board_capital_template_condition_failed:alternatives.moves.extend_bradesco"],
    ["development-bank-description-on-a-bank-loan", () => {
      const packet = auroraPlanPacket({developmentLoanAsBank: true}) as unknown as Record<string, unknown>;
      return withBoardSource("plano-2027", packet, () => build(2, (c) => {for (const id of ["debenture-com-linha", "alongar-com-banco", "alongar-bradesco"]) boardRestatePath(c, packet, id);}));
    }, "board_capital_template_condition_failed:alternatives.moves.debenture_with_line"],
    ["deferral-proven-only-by-capex-and-ebitda", () => {
      const packet = auroraPlanPacket({deferralOnlyCapexAndEbitda: true}) as unknown as Record<string, unknown>;
      return withBoardSource("plano-2027", packet, () => build(2, (c) => {boardRestatePath(c, packet, "adiar-linha");}));
    }, "board_capital_template_condition_failed:alternatives.moves.defer_line"],
    ["informed-fact-attributed-to-another-person", () => build(2, (c) => {c.informed[0]!.author = "cfo";}), "board_capital_informed_fact_mismatch:topic.project_strategic_reason:motivo"],
    // Review r16: an informed fact is a code of the method's dictionary; prose, numbers in words, fractions and
    // periodicity cannot be written as a code (each of the log's entries, alone).
    ...boardInformedProse.map((text, k) => [`informed-fact-as-prose-${k + 1}`, () => build(2, (c) => {c.informed[0]!.code = text;}), "must match pattern"] as [string, () => unknown, string]),
    ["reading-in-an-informed-fact-slot", () => build(2, (c) => {c.pages[4]!.lines[3] = "topic.project_strategic_reason|motivo=irr";}), "board_capital_slot_type_mismatch:topic.project_strategic_reason:motivo"],
    ["creditor-and-maturity-of-different-rows", () => build(2, (c) => {
      finame(c); c.questions[0]!.question = "q.roll_bank|credor=finame-creditor"; c.questions[0]!.answer = "a.roll_bank|credor=finame-creditor|falta=bradesco-gap|vencimento=bradesco-maturity|projeto=project-label";
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
