import {createHash} from "node:crypto";
import {beforeAll, describe, expect, it} from "vitest";
import {boardReleasedSources, composeBoundBoardCapitalDiscussion, prepareBoardCapitalDiscussionPacket, prepareCapitalPathsPacket, proposeBoardCapitalDiscussionHypotheses,
  type BoardCapitalDiscussionFacts, type BoardSourceMethodId} from "@offroad/financial-model";
import {boardMaterialCheck, boardMaterialConversation, boardMaterialPriorsByMethod, boardOmittedReason} from "./board-material-premises-proposal";
import {answeredInstrument, boardMaterialPathRows, boardMaterialRecordRoles, planBoardMaterial, recordsNamed, type BoardMaterialPlanned, type BoardMaterialPrior} from "./board-material-planner";
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
/** A stored result changed after its execution, parsed by its released schema and sealed again. */
function altered(s: Source, edit: (p: Record<string, unknown>) => void): Source {
  const packet = structuredClone(s.packet);
  edit(packet);
  const parsed = (boardReleasedSources[s.methodId as BoardSourceMethodId].schema as unknown as {parse: (v: unknown) => Record<string, unknown>}).parse(packet);
  const {fingerprint: _f, ...payload} = parsed;
  return {...s, packet: {...packet, fingerprint: createHash("sha256").update(JSON.stringify(payload)).digest("hex")}};
}
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
const priorsOf = (with_: Source[]) => boardMaterialPriorsByMethod({priors: with_.map((s, n) => ({methodId: s.methodId, executionId: hex(700 + n), resultFingerprint: s.packet.fingerprint as string,
  released: true, moneyScale: s.moneyScale, packet: s.packet} satisfies BoardMaterialPrior))});
const checkOf = (priors: ReturnType<typeof priorsOf>) => (facts: BoardCapitalDiscussionFacts) => boardMaterialCheck(priors, facts.sources.map((x) => ({role: x.value.id as never,
  methodId: x.value.methodId as never, executionId: hex(1), resultFingerprint: x.value.packetFingerprint, moneyScale: x.value.moneyScale})))(facts);
function plan(with_: Source[]): BoardMaterialPlanned {
  const priors = priorsOf(with_);
  return planBoardMaterial({ids: {discussionId: hex(9), definitionVersionId: hex(9)}, today: "2026-09-28", perimeter: "standalone", currency: "BRL", priors, conversation, check: checkOf(priors)});
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

  it("with the plan of 2027 the C32 bridge produces (paths keyed by label), binds every path by its moves and prepares the calibration's material", () => {
    const withBridge = sources.map((s) => s.id === "plano-2027" ? {...s, packet: bridgePlan} : s);
    const planned = plan(withBridge), base = plan(sources);
    expect([planned.status, base.status]).toEqual(["complete", "complete"]);
    if (planned.status !== "complete" || base.status !== "complete") return;
    // No path, case, limit or scenario is read by the calibration's ids: every page of the calibration stays, over paths
    // whose ids are the C32 bridge's labels.
    expect(planned.facts.pages.map((p) => p.value.id)).toEqual(base.facts.pages.map((p) => p.value.id));
    expect(planned.omitted).toEqual(base.omitted);
    expect(JSON.stringify(planned.facts.figures)).not.toMatch(/\[id=(?:manter|sem-linha-debenture|bradesco-sem-linha)\]/);
    // The same material, page for page and number for number (the references name the bridge's own path ids).
    expect(material(planned.facts, withBridge)).toEqual(material(base.facts, sources));
  }, 240_000);

  it("without a confirmed identity of the bank instrument, asks which row of the debt table it is, never shows the refusal", () => {
    // The person rejected the proposed identity of the Bradesco CCB: no link for it, the rest of the material stays.
    const planned = planBoardMaterial({ids: {discussionId: hex(9), definitionVersionId: hex(9)}, today: "2026-09-28", perimeter: "standalone", currency: "BRL",
      priors: priorsOf(sources), conversation: {...conversation, linkRejections: [{label: "Bradesco", origin: "informed", source: "não é a mesma CCB"}]}, check: checkOf(priorsOf(sources))});
    // The method refuses the material without the alternative it recommends, which names the bank creditor: the person is
    // asked which row of the debt table the plan's CCB is, never shown the refusal; each text left out names the question.
    expect(planned.status === "missing" ? planned.missing : planned.status).toEqual(["instrumentLink.ccb-bradesco"]);
    const asked = planned.omitted.filter((o) => o.reason.startsWith("link_absent:"));
    expect(asked.length).toBeGreaterThan(0);
    expect(asked.filter((o) => o.reason !== "link_absent:CCB Bradesco")).toEqual([]);
    expect(boardOmittedReason("link_absent:CCB Bradesco")).toMatch(/^qual linha da tabela de dívida é este instrumento do plano\?.*\(CCB Bradesco\)$/);
  }, 240_000);

  // Independent review, round 12: an identity is proposed only on every registered term; otherwise it is asked with both
  // sides' terms, the person's answer is the identity (checked by the method), and a rejection wins over both.
  const withoutPlanDate = (s: Source) => altered(s, (p) => {
    const r = p.result as {contributions: {fieldPath: string}[]};
    r.contributions = r.contributions.filter((c) => !c.fieldPath.endsWith(".instrument.ccb-bradesco.finalPaymentDate"));
  });
  // The table registers no spread for the Bradesco row (the method's own partial case: the material is the same).
  const spreadMissing = () => sources.map((s) => s.id === "tabela-divida" ? altered(s, (p) => {
    ((p.result as {table: {rows: {id: string; spread: string | null}[]}}).table.rows.find((x) => x.id === "ccb-bradesco")!).spread = null;
  }) : s);
  const reviewerCase = () => sources.map((s) => s.id === "plano-2027" ? withoutPlanDate(s) : s.id === "tabela-divida" ? altered(s, (p) => {
    ((p.result as {table: {rows: {id: string; finalPayment: string}[]}}).table.rows.find((x) => x.id === "ccb-bradesco")!).finalPayment = "2032-09-15";
  }) : s);
  const planWith = (with_: Source[], conv: Partial<typeof conversation> = {}) => planBoardMaterial({ids: {discussionId: hex(9), definitionVersionId: hex(9)}, today: "2026-09-28",
    perimeter: "standalone", currency: "BRL", priors: priorsOf(with_), conversation: {...conversation, ...conv}, check: checkOf(priorsOf(with_))});
  it("never proposes an identity on a single coincident term: the plan without a final payment and a row maturing in 2032 is asked", () => {
    const planned = planWith(reviewerCase());
    expect(planned.status === "missing" ? planned.missing : planned.status).toEqual(["instrumentLink.ccb-bradesco"]);
    const q = planned.linkQuestions!.find((x) => x.instrumentId === "ccb-bradesco")!;
    expect(q.needed).toBe(true);
    expect(q.instrument).toMatch(/^Plano, CCB Bradesco: vencimento final não registrado; .*spread ou taxa 0\.026;/);
    expect(q.candidates).toEqual([expect.stringMatching(/^Tabela de dívida, CCB Bradesco: vencimento final 2032-09-15; .*spread ou taxa 0\.026;/)]);
  }, 240_000);
  it("takes the person's answer as the identity, checked by the method, and asks again when a term differs", () => {
    // The table registers no spread for the Bradesco row: nothing is proposed, the person is asked and answers which row it is.
    const asked = planWith(spreadMissing());
    expect(asked.status === "missing" ? asked.missing : asked.status).toEqual(["instrumentLink.ccb-bradesco"]);
    expect(asked.linkQuestions!.find((x) => x.instrumentId === "ccb-bradesco")!.candidates).toEqual([expect.stringMatching(/spread ou taxa não registrado;/)]);
    const answered = planWith(spreadMissing(), {linkAnswers: [{instrument: null, row: "a linha CCB Bradesco", origin: "informed", source: "a CCB do plano é a linha CCB Bradesco da tabela"}]});
    expect(answered.status === "missing" ? answered.missing : answered.status).toBe("complete");
    if (answered.status !== "complete") return;
    expect(answered.facts.links.map((l) => [l.value.instrumentId, l.value.rowId, l.origin, l.source])).toEqual([["ccb-bradesco", "ccb-bradesco", "informed", "a CCB do plano é a linha CCB Bradesco da tabela"]]);
    // The row the person names differs in the final payment: asked again with the term, never adopted.
    const wrong = planWith(sources, {linkAnswers: [{instrument: "CCB Bradesco", row: "Debênture 1ª emissão Debenturistas", origin: "informed", source: "é a debênture"}]});
    expect(wrong.status === "missing" ? wrong.missing : wrong.status).toEqual(["instrumentLinkMismatch.ccb-bradesco.final_payment"]);
    // A row the table does not name is asked, never guessed.
    const unknown = planWith(sources, {linkAnswers: [{instrument: "CCB Bradesco", row: "a linha do Itaú", origin: "informed", source: "é a do Itaú"}]});
    expect(unknown.status === "missing" ? unknown.missing : unknown.status).toEqual(["linkAnswers.1.row"]);
  }, 240_000);
  // Independent review, round 13: an explicit name is never replaced, and the most specific name wins.
  it("asks again, quoting the person, when the instrument named does not resolve; never links another instrument", () => {
    const planned = planWith(sources, {linkAnswers: [{instrument: "CCB Itaú", row: "CCB Bradesco", origin: "informed", source: "a CCB Itaú do plano é a linha CCB Bradesco"}]});
    expect(planned.status === "missing" ? [planned.missing, planned.linkAsks] : planned).toEqual([["linkAnswers.1.instrument"],
      [expect.stringMatching(/^O plano não tem um único instrumento com o nome "CCB Itaú" \(a pessoa disse "a CCB Itaú do plano é a linha CCB Bradesco"\)/)]]);
    // With no instrument named and two instruments being asked about, the answer is asked again, never given to either.
    const two = [{id: "ccb-bradesco", label: "CCB Bradesco"}, {id: "debenture-2021", label: "Debênture 2021"}];
    expect(answeredInstrument(two, ["ccb-bradesco", "debenture-2021"], null)).toEqual([]);
    expect(answeredInstrument(two, ["ccb-bradesco"], null)).toEqual(["ccb-bradesco"]);
    expect(answeredInstrument(two, ["ccb-bradesco"], "CCB Itaú")).toEqual([]);
    expect(answeredInstrument([...two, {id: "ccb-bradesco-2", label: "CCB Bradesco"}], [], "ccb-bradesco-2")).toEqual(["ccb-bradesco-2"]);
  }, 240_000);
  it("resolves an exact row id before a prefix id and before labels, and an id inside another row's longer label does not count", () => {
    const twin = (id: string) => ({id, label: "CCB", creditor: "Bradesco", finalPayment: "2027-09-15"});
    const rows = [twin("ccb-bradesco"), twin("ccb-bradesco-2")];
    expect(recordsNamed(rows, "ccb-bradesco-2", (r) => [r.label, r.creditor], (r) => r.finalPayment).map((r) => r.id)).toEqual(["ccb-bradesco-2"]);
    expect(recordsNamed(rows, "é a ccb-bradesco", (r) => [r.label, r.creditor], (r) => r.finalPayment).map((r) => r.id)).toEqual(["ccb-bradesco"]);
    // Identical labels, creditors and terms, named only by label: both, so the person is asked.
    expect(recordsNamed(rows, "a CCB do Bradesco", (r) => [r.label, r.creditor], (r) => r.finalPayment).map((r) => r.id)).toEqual(["ccb-bradesco", "ccb-bradesco-2"]);
    // An id that is a prefix of another row's label: the row named by its full label and creditor wins.
    const prefix = [{id: "debenture", label: "Debênture", creditor: "Banco A", finalPayment: "2028-06-15"},
      {id: "debenture-2", label: "Debênture 2ª emissão", creditor: "Debenturistas", finalPayment: "2031-06-15"}];
    expect(recordsNamed(prefix, "a Debênture 2ª emissão dos Debenturistas", (r) => [r.label, r.creditor], (r) => r.finalPayment).map((r) => r.id)).toEqual(["debenture-2"]);
    expect(recordsNamed(prefix, "a debenture do Banco A", (r) => [r.label, r.creditor], (r) => r.finalPayment).map((r) => r.id)).toEqual(["debenture"]);
  });

  // Independent review, round 14: an identifier the person wrote must be a record's id exactly; never a part of one.
  it("asks again when the answer writes an id no record has, never matching a part of a known id or a label", () => {
    const instrument = planWith(sources, {linkAnswers: [{instrument: "ccb-bradesco-3", row: "CCB Bradesco", origin: "informed", source: "é a ccb-bradesco-3"}]});
    expect(instrument.status === "missing" ? [instrument.missing, instrument.linkAsks] : instrument).toEqual([["linkAnswers.1.instrument"],
      [expect.stringMatching(/"ccb-bradesco-3".*CCB Bradesco \(ccb-bradesco\)/)]]);
    const row = planWith(sources, {linkAnswers: [{instrument: "CCB Bradesco", row: "ccb-bradesco-3", origin: "informed", source: "é a linha ccb-bradesco-3"}]});
    expect(row.status === "missing" ? [row.missing, row.linkAsks] : row).toEqual([["linkAnswers.1.row"],
      [expect.stringMatching(/"ccb-bradesco-3".*CCB Bradesco \(ccb-bradesco\)/)]]);
    const rows = [{id: "ccb-bradesco", label: "CCB", creditor: "Bradesco", finalPayment: "2027-09-15"}, {id: "debenture-1", label: "Debênture 1ª emissão", creditor: "Debenturistas", finalPayment: "2028-06-15"}];
    for (const unknown of ["ccb-bradesco-02", "ccb-bradesco-b", "ccb-bradsco", "a linha ccb-bradesco-3 do Bradesco"]) {
      expect(recordsNamed(rows, unknown, (r) => [r.label, r.creditor], (r) => r.finalPayment), unknown).toEqual([]);
    }
    for (const unknown of ["ccb-bradesco-3", "ccb-bradesco-b", "ccb-bradsco"]) expect(answeredInstrument([{id: "ccb-bradesco", label: "CCB Bradesco"}], ["ccb-bradesco"], unknown), unknown).toEqual([]);
    // Every positive still resolves: the exact id, the label and creditor, a label with an ordinal and a year.
    expect(recordsNamed(rows, "é a ccb-bradesco", (r) => [r.label, r.creditor], (r) => r.finalPayment).map((r) => r.id)).toEqual(["ccb-bradesco"]);
    expect(recordsNamed(rows, "a linha CCB Bradesco de 2027", (r) => [r.label, r.creditor], (r) => r.finalPayment).map((r) => r.id)).toEqual(["ccb-bradesco"]);
    expect(recordsNamed(rows, "Debênture 1ª emissão Debenturistas", (r) => [r.label, r.creditor], (r) => r.finalPayment).map((r) => r.id)).toEqual(["debenture-1"]);
    expect(recordsNamed(rows, "debenture-1", (r) => [r.label, r.creditor], (r) => r.finalPayment).map((r) => r.id)).toEqual(["debenture-1"]);
    expect(answeredInstrument([{id: "ccb-bradesco", label: "CCB Bradesco"}], [], "a CCB Bradesco do plano")).toEqual(["ccb-bradesco"]);
  }, 240_000);

  it("an informed identity wins over a proposed one, and a rejection wins over both", () => {
    const both = planWith(sources, {linkAnswers: [{instrument: "CCB Bradesco", row: "CCB Bradesco", origin: "informed", source: "é a mesma CCB"}]});
    expect(both.status === "complete" ? both.facts.links.map((l) => [l.value.rowId, l.origin]) : both).toEqual([["ccb-bradesco", "informed"]]);
    const rejected = planWith(sources, {linkAnswers: [{instrument: "CCB Bradesco", row: "CCB Bradesco", origin: "informed", source: "é a mesma CCB"}],
      linkRejections: [{label: "Bradesco", origin: "informed", source: "não, não é a do Bradesco"}]});
    expect(rejected.status === "missing" ? rejected.missing : rejected.status).toEqual(["instrumentLink.ccb-bradesco"]);
  }, 240_000);

  it("binds every record by the role the method binds it by: the planner's roles are the library's own", async () => {
    // The roles are copied in the planner (the package exports no template); each must equal the role its template declares.
    const lib = (await import(/* @vite-ignore */ new URL("../../../packages/financial-model/src/board-capital-discussion-templates.ts", import.meta.url).href)) as
      {boardTemplates: Record<string, {roles?: {bind: string}[]}>};
    for (const {row, role} of boardMaterialPathRows) expect(lib.boardTemplates[`alternatives.row.${row}`]!.roles, row).toEqual([role]);
    for (const [key, x] of Object.entries(boardMaterialRecordRoles)) expect(lib.boardTemplates[x.template]!.roles!.find((r) => r.bind === key), key).toEqual(x.role);
  });
});
