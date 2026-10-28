import {createHash} from "node:crypto";
import {beforeAll, describe, expect, it} from "vitest";
import {boardReleasedSources, composeBoundBoardCapitalDiscussion, prepareBoardCapitalDiscussionPacket, prepareCapitalPathsPacket, proposeBoardCapitalDiscussionHypotheses,
  type BoardCapitalDiscussionFacts, type BoardSourceMethodId} from "@offroad/financial-model";
import {boardMaterialCheck, boardMaterialConversation, boardMaterialPriorsByMethod, boardOmittedReason} from "./board-material-premises-proposal";
import {boardLibraryFixedRecords, planBoardMaterial, type BoardMaterialPlanned, type BoardMaterialPrior} from "./board-material-planner";
import {inMemoryBasis} from "./lote3-reader-check";
import {itemKeys} from "./lote2-premises";
import {houseStatusQuoLabel} from "./financing-paths-premises-proposal";
import {financialModelFixture} from "./lote2-premises.test-support";

type Source = {id: string; methodId: string; packet: Record<string, unknown>; moneyScale: "reais" | "millions"};
type Kernel = {paths: {id: string; label: string; role: string}[]};
let sources: Source[], gold: (turn: 1 | 2 | 3) => BoardCapitalDiscussionFacts, bridgePlan: Record<string, unknown>;
beforeAll(async () => {
  const board = await financialModelFixture<{auroraBoardSources: () => Source[]; auroraBoardFacts: typeof gold}>("board-capital-discussion.test-support.ts");
  sources = board.auroraBoardSources(); gold = board.auroraBoardFacts;
  // The plan of 2027 as the C32 bridge adopts it: every path keyed by its label (the status quo by the method's own
  // label), adopted, composed and executed by the released method. No id is renamed to the calibration's.
  const paths = await financialModelFixture<{auroraCapitalPathsKernel: () => Kernel; auroraCapitalPathsBasis: (k: Kernel) => {seal: () => unknown}}>("capital-structure-paths.test-support.ts");
  const k = paths.auroraCapitalPathsKernel();
  const labels = k.paths.map((p) => p.role === "status_quo" ? houseStatusQuoLabel : p.label), ids = itemKeys(labels);
  const map = new Map(k.paths.map((p, n) => [p.id, ids[n]!]));
  const bridged = structuredClone(k);
  bridged.paths.forEach((p, n) => {p.id = map.get(p.id)!; p.label = labels[n]!;});
  bridgePlan = prepareCapitalPathsPacket(paths.auroraCapitalPathsBasis(bridged).seal()) as unknown as Record<string, unknown>;
}, 240_000);

const hex = (n: number) => `a0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
/** A stored result with some record ids written otherwise (a result of another company), its fingerprint recomputed. */
function renamed(s: Source, pairs: [string, string][]): Source {
  let text = JSON.stringify(s.packet);
  for (const [a, b] of pairs) text = text.split(a).join(b);
  const parsed = (boardReleasedSources[s.methodId as BoardSourceMethodId].schema as unknown as {parse: (v: unknown) => Record<string, unknown>}).parse(JSON.parse(text));
  const {fingerprint: _f, ...payload} = parsed;
  return {...s, packet: {...JSON.parse(text), fingerprint: createHash("sha256").update(JSON.stringify(payload)).digest("hex")}};
}
const conversation = boardMaterialConversation({turnIntent: "answers_pending", askedOn: {value: "2026-09-28", origin: "informed", source: "pedido"},
  meetingDate: {value: "2026-09-30", origin: "informed", source: "quarta"}, nextMeetingDate: {value: null, origin: null, source: null}, agendaMinutes: {value: 45, origin: "informed", source: "pauta"},
  template: {value: "conselho-jun26.pptx", origin: "document", source: "anexo"}, outlineConfirmed: {value: true, origin: "informed", source: "segue"},
  seen: [{topic: "linha-embalagem", seen: false, origin: "informed", source: "não viu"}],
  reasons: [{topic: "linha-embalagem", author: "chair", code: "reduce_single_supplier_dependence", origin: "informed", source: "presidente"}],
  deadlines: [{action: "supplier_notice", date: "2026-10-02", origin: "document", source: "contrato"}], omissions: []}).conversation;
function plan(with_: Source[]): BoardMaterialPlanned {
  const priors = boardMaterialPriorsByMethod({priors: with_.map((s, n) => ({methodId: s.methodId, executionId: hex(700 + n), resultFingerprint: s.packet.fingerprint as string,
    released: true, moneyScale: s.moneyScale, packet: s.packet} satisfies BoardMaterialPrior))});
  return planBoardMaterial({ids: {discussionId: hex(9), definitionVersionId: hex(9)}, today: "2026-09-28", perimeter: "standalone", currency: "BRL", priors, conversation,
    check: (facts) => boardMaterialCheck(priors, facts.sources.map((x) => ({role: x.value.id as never, methodId: x.value.methodId as never, executionId: hex(1), resultFingerprint: x.value.packetFingerprint,
      moneyScale: x.value.moneyScale})))(facts)});
}
/** The material the method prepares from planned facts over these results: every page, line, option, question and the summary. */
function material(facts: BoardCapitalDiscussionFacts, with_: Source[]) {
  const packet = prepareBoardCapitalDiscussionPacket(composeBoundBoardCapitalDiscussion({discussion: inMemoryBasis(proposeBoardCapitalDiscussionHypotheses(facts)), question: "C47",
    sources: facts.sources.map((s) => ({id: s.value.id, result: JSON.stringify(with_.find((x) => x.id === s.value.id)!.packet)}))}));
  const v = packet.result.discussion!.versions.at(-1)!;
  return {pages: v.pages.map((p) => ({title: p.title, lines: p.lines, recommendation: p.recommendation, options: p.options})), summary: v.summary,
    questions: v.questions.map((q) => [q.question, q.answer]), deliberations: v.deliberations.map((d) => d.text), allFiguresMatch: packet.readings?.material?.allFiguresMatch};
}
/** Every page, line, option, recommendation, question and deliberation of the calibration that the planned facts do not
 * carry, and whether each is named among what the plan left out. Nothing may go missing in silence. */
function silentLosses(planned: BoardCapitalDiscussionFacts, omitted: {item: string}[]) {
  const g = gold(2), named = (item: string) => omitted.some((o) => o.item === item || o.item.startsWith(`${item}.`) || item.startsWith(`${o.item}.`));
  const out: string[] = [];
  for (const p of g.pages) {
    const mine = planned.pages.find((x) => x.value.id === p.value.id)?.value;
    if (!mine) {if (!named(`page.${p.value.id}`)) out.push(`page.${p.value.id}`); continue;}
    p.value.lines.forEach((l, j) => {if (!mine.lines.includes(l) && !named(`page.${p.value.id}.line.${j + 1}`)) out.push(`page.${p.value.id}.line.${j + 1}`);});
    p.value.options.forEach((o, j) => {if (!mine.options.includes(o) && !named(`page.${p.value.id}.option.${j + 1}`) && !named(`page.${p.value.id}.options`)) out.push(`page.${p.value.id}.option.${j + 1}`);});
    if (p.value.recommendation && !mine.recommendation && !named(`page.${p.value.id}.recommendation`)) out.push(`page.${p.value.id}.recommendation`);
  }
  for (const q of g.questions) if (!planned.questions.some((x) => x.value.id === q.value.id) && !named(`question.${q.value.id}`)) out.push(`question.${q.value.id}`);
  for (const d of g.deliberations) {
    const mine = planned.deliberations.find((x) => x.value.id === d.value.id)?.value;
    if (!mine) {if (!named(`deliberation.${d.value.id}`)) out.push(`deliberation.${d.value.id}`); continue;}
    if (d.value.recommendation && !mine.recommendation && !named(`deliberation.${d.value.id}.recommendation`)) out.push(`deliberation.${d.value.id}.recommendation`);
  }
  return out;
}

describe("board material planner: records read by what the results register, never by the calibration's ids", () => {
  it("over results whose measurements, rows, basket and credit line carry other ids, prepares the calibration's material", () => {
    const other = sources.map((s) => s.id === "covenant" ? renamed(s, [["dez26-base", "teste-dezembro-a"], ["dez27-base", "teste-dezembro-b"], ["dez27-adverso", "teste-adverso-b"], ["dez26-gerencial", "teste-politica-a"]])
      : s.id === "tabela-divida" ? renamed(s, [["debenture-1", "emissao-um"], ["conta-garantida", "linha-rotativa"]]) : s);
    const mine = plan(other), base = plan(sources);
    expect([mine.status, base.status]).toEqual(["complete", "complete"]);
    if (mine.status !== "complete" || base.status !== "complete") return;
    expect(mine.omitted).toEqual(base.omitted);
    // The readings name the records by their own ids.
    for (const id of ["teste-dezembro-a", "teste-dezembro-b", "teste-adverso-b", "teste-politica-a", "emissao-um", "linha-rotativa"]) expect(JSON.stringify(mine.facts.figures)).toContain(`=${id}]`);
    expect(material(mine.facts, other)).toEqual(material(base.facts, sources));
    expect(silentLosses(mine.facts, mine.omitted)).toEqual([]);
  }, 240_000);

  it("with the plan of 2027 the C32 bridge produces (paths keyed by label), names every path the library cannot read and loses nothing in silence", () => {
    const withBridge = sources.map((s) => s.id === "plano-2027" ? {...s, packet: bridgePlan} : s);
    const planned = plan(withBridge);
    expect(planned.status).toBe("complete");
    if (planned.status !== "complete") return;
    const pages = planned.facts.pages.map((p) => p.value.id);
    // The two pages of paths, the cash page (the status quo is read by the library as "manter") and the two answers bound to
    // fixed paths are left out and named; every other page of the calibration stays.
    expect(pages).toEqual(["decisoes", "divida", "escritura", "linha", "safra", "recomendacao", "alavancagem", "politica", "mudaria", "passos"]);
    const reasons = (item: string) => planned.omitted.filter((o) => o.item === item).map((o) => o.reason);
    expect(reasons("page.caminhos")).toEqual(["path_set_incomplete"]);
    expect(reasons("page.caminhos.paths")).toEqual(expect.arrayContaining(["library_fixed_record:sem-linha-debenture", "library_fixed_record:manter",
      "path_without_library_row:manter-e-rolar-no-vencimento"]));
    expect(reasons("page.caixa")).toEqual(["library_fixed_record:manter"]);
    expect(reasons("question.bradesco")).toEqual(["library_fixed_record:bradesco-sem-linha"]);
    expect(reasons("question.prazo")).toEqual(["library_fixed_record:sem-linha-debenture"]);
    expect(boardOmittedReason("library_fixed_record:manter")).toMatch(/identificador fixo.*\(manter\)$/);
    expect(silentLosses(planned.facts, planned.omitted)).toEqual([]);
    // What stays is the calibration's own text, number for number.
    const mine = material(planned.facts, withBridge), base = material((plan(sources) as {facts: BoardCapitalDiscussionFacts}).facts, sources);
    expect(mine.allFiguresMatch).toBe(true);
    for (const p of mine.pages) expect(base.pages).toContainEqual(p);
    expect(mine.summary).toBe(base.summary);
  }, 240_000);

  it("names the fixed records of the library it checks, per source", () => {
    expect(Object.keys(boardLibraryFixedRecords).sort()).toEqual(["caixa-semanal", "covenant", "linha-embalagem", "plano-2027", "projecao"]);
  });
});
