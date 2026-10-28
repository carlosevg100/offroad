import {beforeAll, describe, expect, it} from "vitest";
import {boardCapitalDiscussionAnalysisId, composeBoundBoardCapitalDiscussion, prepareBoardCapitalDiscussionPacket, proposeBoardCapitalDiscussionHypotheses,
  type BoardCapitalDiscussionFacts} from "@offroad/financial-model";
import {boardMaterialCheck, boardMaterialConversation, boardMaterialEntry, boardMaterialExtractionSchema, boardMaterialPriorsByMethod, boardMaterialReaderGaps,
  buildBoardMaterialPremiseProposal, proposeBoardMaterialPremisesForTurn, type BoardMaterialExtraction} from "./board-material-premises-proposal";
import {boardMaterialSourceIds, planBoardMaterial, type BoardMaterialPrior} from "./board-material-planner";
import {inMemoryBasis} from "./lote3-reader-check";
import {comparableHypotheses, financialModelFixture, nonAnswering} from "./lote2-premises.test-support";
import {uuidV5} from "./investment-premises-proposal";

type Source = {id: string; methodId: string; packet: Record<string, unknown>; moneyScale: "reais" | "millions"};
let gold: (turn: 1 | 2 | 3) => BoardCapitalDiscussionFacts;
let sources: Source[];
beforeAll(async () => {
  const f = await financialModelFixture<{auroraBoardFacts: typeof gold; auroraBoardSources: () => Source[]}>("board-capital-discussion.test-support.ts");
  gold = f.auroraBoardFacts; sources = f.auroraBoardSources();
}, 120_000);

const hex = (n: number) => `a0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
/** The latest completed execution of each source method of the work, as the database returns them. */
const priorsRead = (edit: (p: BoardMaterialPrior) => BoardMaterialPrior | null = (p) => p) => ({priors: sources.flatMap((s, n) => {
  const p = edit({methodId: s.methodId, executionId: hex(700 + n), resultFingerprint: s.packet.fingerprint as string, released: true, moneyScale: s.moneyScale, packet: structuredClone(s.packet)});
  return p ? [p] : [];
})});
const none = {value: null, origin: null, source: null};
const informed = <T>(value: T, source: string) => ({value, origin: "informed" as const, source});

/** Ficha C47, turn by turn, as the extraction reads the conversation (the earlier C32 conversation carries the chair's
 * reason and the supplier contract carries the notice date). */
const turns: Record<1 | 2 | 3, {message: string; hasAttachments: boolean; earlier: string[]; extraction: BoardMaterialExtraction}> = {
  1: {message: "Conselho na quarta. Prepara a discussão de estrutura de capital.", hasAttachments: false, earlier: [], extraction: {turnIntent: "answers_pending",
    askedOn: informed("2026-09-28", "data do pedido"), meetingDate: informed("2026-09-30", "conselho na quarta"), nextMeetingDate: none, agendaMinutes: none, template: none, outlineConfirmed: none,
    seen: [], reasons: [{topic: "linha-embalagem", author: "chair", code: "reduce_single_supplier_dependence", origin: "informed", source: "presidente do conselho, conversa da linha de embalagem"}],
    deadlines: [{action: "supplier_notice", date: "2026-10-02", origin: "document", source: "contrato de fornecimento de embalagem, aviso de renegociação"}], omissions: []}},
  2: {message: "Segue o template. Temos 45 minutos. O conselho não viu a revisão da linha; o presidente gosta dela.", hasAttachments: true,
    earlier: ["Conselho na quarta. Prepara a discussão de estrutura de capital."], extraction: {turnIntent: "answers_pending",
      askedOn: informed("2026-09-28", "data do pedido"), meetingDate: informed("2026-09-30", "conselho na quarta"), nextMeetingDate: none,
      agendaMinutes: informed(45, "tempo de pauta"), template: {value: "conselho-jun26.pptx", origin: "document", source: "anexo"}, outlineConfirmed: informed(true, "segue o template"),
      seen: [{topic: "linha-embalagem", seen: false, origin: "informed", source: "o conselho não viu a revisão da linha"}],
      reasons: [{topic: "linha-embalagem", author: "chair", code: "reduce_single_supplier_dependence", origin: "informed", source: "presidente do conselho"}],
      deadlines: [{action: "supplier_notice", date: "2026-10-02", origin: "document", source: "contrato de fornecimento de embalagem"}], omissions: []}},
  3: {message: "O presidente quer apresentar a linha ele mesmo. Tira a recomendação dessa parte.", hasAttachments: false,
    earlier: ["Conselho na quarta. Prepara a discussão de estrutura de capital.", "Segue o template. Temos 45 minutos. O conselho não viu a revisão da linha; o presidente gosta dela."],
    extraction: {turnIntent: "answers_pending",
      askedOn: informed("2026-09-28", "data do pedido"), meetingDate: informed("2026-09-30", "conselho na quarta"), nextMeetingDate: none,
      agendaMinutes: informed(45, "tempo de pauta"), template: {value: "conselho-jun26.pptx", origin: "document", source: "anexo"}, outlineConfirmed: informed(true, "segue o template"),
      seen: [{topic: "linha-embalagem", seen: false, origin: "informed", source: "o conselho não viu a revisão da linha"}],
      reasons: [{topic: "linha-embalagem", author: "chair", code: "reduce_single_supplier_dependence", origin: "informed", source: "presidente do conselho"}],
      deadlines: [{action: "supplier_notice", date: "2026-10-02", origin: "document", source: "contrato de fornecimento de embalagem"}],
      omissions: [{target: "recommendation", topic: "linha-embalagem", action: null, requestedBy: "chair", origin: "informed", source: "pedido do presidente"}]}},
};

async function runTurn(turn: 1 | 2 | 3, edit?: (p: BoardMaterialPrior) => BoardMaterialPrior | null, extraction = turns[turn].extraction) {
  const t = turns[turn], events: string[] = [];
  const result = await proposeBoardMaterialPremisesForTurn({message: t.message, hasAttachments: t.hasAttachments, recentUserMessages: t.earlier, projectId: hex(1), today: "2026-09-28",
    loadEvidence: async () => [], loadPriors: async () => priorsRead(edit), extract: async () => extraction, log: (e) => {events.push(e);}});
  return {result, events};
}
const projectAnalysis = boardCapitalDiscussionAnalysisId(uuidV5(`offroad:board-material:${hex(1)}`));
const asGold = (f: BoardCapitalDiscussionFacts) => comparableHypotheses(proposeBoardCapitalDiscussionHypotheses(f));

describe("board material: ficha C47 through the conversation", () => {
  for (const turn of [1, 2, 3] as const) it(`turn ${turn}: the card is the calibration's facts and its confirmation runs the method to the same packet`, async () => {
    const {result, events} = await runTurn(turn);
    expect(events.at(-1)).toBe("board_material_premises.proposed");
    expect(result?.forAdvisor.status).toBe("proposed");
    const facts = result!.proposal!.facts as BoardCapitalDiscussionFacts, expected = gold(turn);
    const rename = new Map([[projectAnalysis, boardCapitalDiscussionAnalysisId(expected.discussionId)]]);
    // Every fact is the calibration's, except the identity's origin: the calibration adopts the Bradesco CCB of the plan as
    // the Bradesco row of the debt table from the analysis of both results; the bridge proposes it, origin house, because
    // both register the final payment, the rate kind and the spread and all agree. The 2021 debenture is not proposed
    // (the plan registers no final payment): it is asked on the card, with both sides' terms.
    const noLinks = (xs: ReturnType<typeof comparableHypotheses>) => xs.filter((h) => !/(?:^|\.)link\./.test(JSON.stringify(h)));
    expect(noLinks(comparableHypotheses(proposeBoardCapitalDiscussionHypotheses(facts), rename))).toEqual(noLinks(asGold(expected)));
    expect(facts.links.map((l) => [l.value, l.origin])).toEqual([
      [{id: "ccb-bradesco", planSourceId: "plano-2027", instrumentId: "ccb-bradesco", tableSourceId: "tabela-divida", rowId: "ccb-bradesco"}, "house"]]);
    expect(expected.links.map((l) => l.value)).toEqual([facts.links[0]!.value]);
    // The proposal shows both sides' registered terms next to each other, so the person confirms knowingly.
    expect(facts.links[0]!.source).toBe("Identificação proposta do mesmo contrato, todos os termos registrados iguais. Plano, CCB Bradesco: vencimento final 2027-09-15; "
      + "taxa pós-fixada (índice mais spread); índice 0.149; spread ou taxa 0.026; saldo 40 (contexto, não é termo). Tabela de dívida, CCB Bradesco: vencimento final 2027-09-15; "
      + "taxa pós-fixada (índice mais spread); índice CDI 0.149; spread ou taxa 0.026; saldo 40 (contexto, não é termo). Confirme com o cartão ou recuse na conversa");
    // The confirmed card (in memory) and the calibration give the same material.
    const run = (f: BoardCapitalDiscussionFacts) => {
      const packet = prepareBoardCapitalDiscussionPacket(composeBoundBoardCapitalDiscussion({discussion: inMemoryBasis(proposeBoardCapitalDiscussionHypotheses(f)), question: "C47",
        sources: f.sources.map((s) => ({id: s.value.id, result: JSON.stringify(sources.find((x) => x.id === s.value.id)!.packet)}))}));
      return {status: packet.status, readings: packet.readings, versions: packet.result.discussion?.versions.map((v) => v.fingerprint)};
    };
    expect(run(facts)).toEqual(run(expected));
    const stage = run(facts).readings!;
    expect(stage.stage).toBe(turn === 1 ? "outline_proposed" : "material_prepared");
    if (turn === 3) expect(stage.omissions).toEqual([expect.objectContaining({id: "linha-sem-recomendacao", outcome: "applied"})]);
    // The card pins every result it read, by execution and fingerprint, and lists what it left out (nothing here).
    const summary = result!.proposal!.summary as unknown as {boardSources: {role: string; executionId: string}[]; items: {labelKey: string | null}[]};
    expect(summary.boardSources.map((p) => p.role)).toEqual(Object.values(boardMaterialSourceIds));
    expect(summary.items.some((i) => i.labelKey === "boardOmitted")).toBe(false);
    // One card row per proposed identity, origin house, saying it is a proposed identification of the same contract.
    const items = summary.items as {labelKey: string | null; origin: string; source: string; label: string}[];
    expect(items.filter((i) => i.labelKey === "boardInstrumentLink").map((i) => [i.label, i.origin])).toEqual([["ccb-bradesco = ccb-bradesco", "house"]]);
    // The debenture of 2021: asked, never proposed on the spread alone; its missing final payment is named.
    const asked = items.filter((i) => i.labelKey === "boardInstrumentLinkQuestion");
    expect(asked.map((i) => [i.label, i.origin])).toEqual([["Debênture 2021", "house"]]);
    expect(asked[0]!.source).toMatch(/^Qual linha da tabela de dívida é este instrumento do plano\? Plano, Debênture 2021: vencimento final não registrado; .*Tabela de dívida, Debênture 1ª emissão Debenturistas: vencimento final 2028-06-15;/);
  }, 120_000);

  it("proposes nothing when the turn does not answer, and nothing without a completed released result", async () => {
    for (const intent of nonAnswering) expect((await runTurn(2, undefined, {...turns[2].extraction, turnIntent: intent})).result).toBeNull();
    const {result} = await runTurn(1, () => null);
    expect(result?.forAdvisor).toEqual({status: "missing", missing: ["sources"]});
  }, 120_000);

  it("reads each source in the scale the database records for its method, and leaves out by name a source without one", async () => {
    const {result} = await runTurn(2, (p) => p.methodId === "analyze-relative-debt-cost" ? {...p, moneyScale: null} : p);
    expect(result?.forAdvisor.status).toBe("proposed");
    const facts = result!.proposal!.facts as BoardCapitalDiscussionFacts;
    expect(facts.sources.map((s) => s.value.id)).not.toContain("custo-relativo");
    expect(facts.sources.every((s) => s.value.moneyScale === sources.find((x) => x.methodId === s.value.methodId)!.moneyScale)).toBe(true);
    const items = (result!.proposal!.summary as {items: {label: string; labelKey: string | null; source: string}[]}).items.filter((i) => i.labelKey === "boardOmitted");
    expect(items.find((i) => i.label === "sources.custo-relativo")?.source).toBe("escala monetária do método não registrada");
    // The pins the card carries name each source's scale as the database gave it.
    const pins = (result!.proposal!.summary as unknown as {boardSources: {role: string; moneyScale: string}[]}).boardSources;
    expect(pins.every((p) => p.moneyScale === sources.find((x) => x.id === p.role)!.moneyScale)).toBe(true);
  }, 120_000);

  it("leaves out by name what an unreleased or unexecuted method would have supplied, never a page of its own", async () => {
    // The relative debt cost is published and not released: its two questions go, the rest of the material stays.
    const {result} = await runTurn(2, (p) => p.methodId === "analyze-relative-debt-cost" ? {...p, released: false} : p);
    expect(result?.forAdvisor.status).toBe("proposed");
    const facts = result!.proposal!.facts as BoardCapitalDiscussionFacts;
    expect(facts.sources.map((s) => s.value.id)).not.toContain("custo-relativo");
    expect(facts.questions.map((q) => q.value.id)).toEqual(["bradesco", "prazo", "demanda", "custo", "estrategica", "trigo", "rede-a", "fpa"]);
    expect(facts.figures.some((f) => f.value.id.endsWith("-bps"))).toBe(false);
    const items = (result!.proposal!.summary as {items: {label: string; labelKey: string | null}[]}).items.filter((i) => i.labelKey === "boardOmitted").map((i) => i.label);
    expect(items).toEqual(["sources.custo-relativo", "question.serra-verde", "question.rating"]);
    // Without the receivables result the crop decision keeps its title (the tightest week dates it) but loses what the
    // receivables result supplied: its recommendation, its deadline, its page, its question and its step.
    const crop = await runTurn(2, (p) => p.methodId === "monetize-receivables-for-working-capital" ? null : p);
    const left = (crop.result!.proposal!.summary as {items: {label: string; labelKey: string | null}[]}).items.filter((i) => i.labelKey === "boardOmitted").map((i) => i.label);
    expect(left).toEqual(["sources.recebiveis", "deliberation.safra.deadline.adesao", "page.safra", "page.passos.line.2", "question.rede-a", "deliberation.safra.recommendation"]);
    // The recommendation was planned and the method refused its condition without the result: left out, by template.
    const reason = (crop.result!.proposal!.summary as {items: {label: string; source: string}[]}).items.find((i) => i.label === "deliberation.safra.recommendation")!.source;
    expect(reason).toBe("o texto da biblioteca não se sustenta nestes resultados (delib.crop.programs)");
  }, 240_000);

  it("asks what the conversation states twice differently and what it does not state, never picks one", async () => {
    const e = turns[2].extraction;
    expect(boardMaterialConversation({...e, agendaMinutes: {value: 45, origin: null, source: null}}).missing).toEqual(["agendaMinutes"]);
    expect(boardMaterialConversation({...e, seen: [...e.seen, {topic: "linha-embalagem", seen: true, origin: "informed", source: "x"}]}).missing).toEqual(["seen.2"]);
    expect(boardMaterialConversation({...e, omissions: [{...turns[3].extraction.omissions[0]!, requestedBy: "ceo"}]}).missing).toEqual(["omissions.1.requestedBy"]);
    // A notice date for the sounding that differs from the plan's is asked, never taken.
    const {result} = await runTurn(2, undefined, {...e, deadlines: [...e.deadlines, {action: "finish_sounding", date: "2026-11-30", origin: "informed", source: "x"}]});
    expect(result?.forAdvisor).toEqual({status: "missing", missing: ["deadlines.2.date"]});
    // No meeting date: asked.
    expect((await runTurn(2, undefined, {...e, meetingDate: none})).result?.forAdvisor).toEqual({status: "missing", missing: ["meetingDate"]});
  }, 240_000);

  it("keeps the method's refusal by name and never plans around a material fact", async () => {
    const priors = boardMaterialPriorsByMethod(priorsRead());
    const {conversation} = boardMaterialConversation(turns[2].extraction);
    const planned = planBoardMaterial({ids: {discussionId: hex(9), definitionVersionId: hex(9)}, today: "2026-09-28", perimeter: "standalone", currency: "BRL", priors, conversation});
    expect(planned.status).toBe("complete");
    if (planned.status !== "complete") return;
    // A stated number that diverges from its result is refused by the method, named before any card.
    const tampered = structuredClone(planned.facts);
    const f = tampered.figures.find((x) => x.value.id === "npv")!;
    (f.value as {reading: string[]}).reading = [...(f.value as {reading: string[]}).reading.slice(0, 3), "9.9"];
    expect(boardMaterialReaderGaps(tampered, priors, planned.pins)).toEqual([expect.stringMatching(/^readerRefused\.board_capital_figure_diverges/)]);
    expect(boardMaterialCheck(priors, planned.pins)(planned.facts)).toBeNull();
    // A whole proposal is fingerprinted with unbound identities.
    const proposal = buildBoardMaterialPremiseProposal(planned.facts, planned.pins, planned.omitted);
    expect(proposal.hypotheses.every((h) => h.dimensions.entityId === null)).toBe(true);
  }, 120_000);

  it("routes the ficha's phrases and keeps the neighbours out", () => {
    for (const m of ["Conselho na quarta. Prepara a discussão de estrutura de capital.", "Faz uma página para o conselho com o plano de financiamento.",
      "Prepara a discussão de estrutura de capital para o conselho de quarta",
      // Decision 6: board material or deck on capital structure, financing or debt is this method's, by ficha exception.
      "Monta o material do conselho sobre a estrutura de capital.", "Monta o deck do conselho com o plano de financiamento."]) expect(boardMaterialEntry(m, false, [])).toBe("cue");
    for (const m of ["Preciso levar ao conselho uma decisão sobre estrutura de capital e alternativas.", "Prepara o memorando do trimestre para o conselho.",
      "Tenho conselho na quarta e vão me perguntar por que pagamos mais que a Serra Verde. Me ajuda a pensar a resposta.", "Preciso do endividamento atualizado para o conselho.",
      "Prepara a resposta para o conselho sobre por que pagamos mais que a Serra Verde.",
      // Board material without the capital topic, or on another topic, stays material preparation.
      "Monta o material do conselho.", "Monta o material do conselho sobre a safra."]) expect(boardMaterialEntry(m, false, [])).toBeNull();
    expect(boardMaterialEntry(turns[2].message, true, turns[2].earlier)).toBe("continuation");
    expect(boardMaterialEntry(turns[3].message, false, turns[3].earlier)).toBe("continuation");
    expect(boardMaterialEntry("O que é uma debênture?", false, turns[3].earlier)).toBeNull();
    expect(boardExtractionAccepts()).toBe(true);
  });
});
const boardExtractionAccepts = () => [1, 2, 3].every((t) => boardMaterialExtractionSchema.safeParse(turns[t as 1 | 2 | 3].extraction).success);
