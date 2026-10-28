import {z} from "zod";
import {composeBoundBoardCapitalDiscussion, prepareBoardCapitalDiscussionPacket, proposeBoardCapitalDiscussionHypotheses, type BoardCapitalDiscussionFacts} from "@offroad/financial-model";
import {compileObjectiveToPlan} from "@offroad/work-plan";
import {extractedOrigin, fingerprintedProposal, itemSource, proposeLote2PremisesForTurn, sourced, stated, summaryRow, type Lote2Summary, type Lote2SummaryItem, type Lote2TurnPremises} from "./lote2-premises";
import {asksOrExplains, foldCue, turnIntentInstruction, turnIntents} from "./premise-cue";
import {inMemoryBasis, readerGaps, type BoundBasis} from "./lote3-reader-check";
import {boardMaterialActions, boardMaterialReasonCodes, boardMaterialSourceIds, boardMaterialSourceMethods, boardMaterialTopics, planBoardMaterial,
  type BoardMaterialConversation, type BoardMaterialOmitted, type BoardMaterialPin, type BoardMaterialPrior} from "./board-material-planner";

/** The method these premises feed, pinned to its implemented version. */
export const boardMaterialPremiseMethod = {methodId: "prepare-board-capital-discussion", methodVersion: "2026.10.27-v1"} as const;
export const boardMaterialObjectiveKind = "board_capital_discussion";

/** The ficha's construction: prepare (or make, assemble) the discussion, the material, the deck, the page or the agenda
 * for the board, or a board meeting on a stated day with a request to prepare it. Folded text. Deciding between capital
 * alternatives at the board (board_decision), a memo, an answer to a board question, the debt table and the quarter's
 * update keep their own routes. */
export const boardMaterialCue = new RegExp([
  String.raw`\b(?:prepar\w*|mont\w*|faz|faca|fazer|organiz\w*|monte)\b[^.?!]{0,40}\b(?:a |o |uma |um )?(?:discussao|material|deck|pagina|apresentacao|pauta|roteiro)\b[^.?!]{0,60}\b(?:conselho|board)\b`,
  String.raw`\b(?:conselho|board)\b[^.?!]{0,40}\b(?:na|nesta|nessa|na proxima|dia)\s+(?:segunda|terca|quarta|quinta|sexta|\d{1,2})\b[^?!]{0,30}\bprepar\w*\b[^.?!]{0,30}\b(?:discussao|material|deck|apresentacao|pauta|roteiro)\b`,
].join("|"));
const neighbour = /\b(?:memorando|memo|resposta|responder|pergunt\w*|serra verde|endividamento atualizado|tabela de divida|trimestre)\b/;

/** The cue of this method: the router's own objective once it knows it, or the ficha's construction over a board message. */
export function boardMaterialCueKind(message: string, hasAttachments: boolean): boolean {
  const kind = compileObjectiveToPlan({message, hasAttachments}).objectiveKind as string;
  if (kind === boardMaterialObjectiveKind) return true;
  const text = foldCue(message);
  return kind === "board_decision" && boardMaterialCue.test(text) && !neighbour.test(text);
}
const premiseKinds = new Set(["proposal_comparison", "relative_debt_cost", "debt_capacity", "debt_table", "covenant_headroom", "weekly_cash",
  "operating_projection", "projection_challenge", "receivables_funding", "quarter_update"]);
/** As premiseEntry: by its own cue, or as a continuation when the latest earlier premise cue among the recent messages is
 * this one, the message is not a question nor a request for explanation, and it does not compile to another premise method. */
export function boardMaterialEntry(message: string, hasAttachments: boolean, earlierUserMessages: readonly string[]): "cue" | "continuation" | null {
  if (boardMaterialCueKind(message, hasAttachments)) return "cue";
  const compiled = compileObjectiveToPlan({message, hasAttachments}).objectiveKind as string;
  if (asksOrExplains(message) || premiseKinds.has(compiled)) return null;
  for (let n = earlierUserMessages.length - 1; n >= 0; n--) {
    const earlier = earlierUserMessages[n]!;
    if (boardMaterialCueKind(earlier, false)) return "continuation";
    if (premiseKinds.has(compileObjectiveToPlan({message: earlier, hasAttachments: false}).objectiveKind)) return null;
  }
  return null;
}
export function shouldProposeBoardMaterialPremises(message: string, hasAttachments: boolean, earlierUserMessages: readonly string[] = []): boolean {
  return boardMaterialEntry(message, hasAttachments, earlierUserMessages) !== null;
}

const topic = z.enum(boardMaterialTopics), action = z.enum(Object.keys(boardMaterialActions) as [keyof typeof boardMaterialActions, ...(keyof typeof boardMaterialActions)[]]);
const item = {origin: extractedOrigin, source: itemSource};
/** Only what the person said or a document states, over the whole conversation so far. Absence stays null. The model
 * never writes a page, a deliberation, a number or a question: those come from the reviewed results and the library. */
export const boardMaterialExtractionSchema = z.strictObject({
  turnIntent: z.enum(turnIntents),
  /** The day the board material was first asked for. */
  askedOn: sourced(z.iso.date()),
  meetingDate: sourced(z.iso.date()), nextMeetingDate: sourced(z.iso.date()),
  agendaMinutes: sourced(z.number().int().min(1).max(999)),
  /** The file of the company's last board presentation, as attached. */
  template: sourced(z.string().trim().min(1).max(200)),
  /** The person accepted the proposed outline (sent the template, said to go ahead). */
  outlineConfirmed: sourced(z.boolean()),
  seen: z.array(z.strictObject({...item, topic, seen: z.boolean()})).max(8),
  reasons: z.array(z.strictObject({...item, topic, author: z.enum(["chair", "cfo", "ceo"]), code: z.enum(boardMaterialReasonCodes)})).max(8),
  deadlines: z.array(z.strictObject({...item, action, date: z.iso.date()})).max(8),
  omissions: z.array(z.strictObject({...item, target: z.enum(["recommendation", "page", "deadline"]), topic: topic.nullable(), action: action.nullable(),
    requestedBy: z.enum(["chair", "cfo", "ceo"]).nullable()})).max(8),
});
export type BoardMaterialExtraction = z.infer<typeof boardMaterialExtractionSchema>;

export const boardMaterialExtractionContract = {
  task: "board_material_extraction" as const,
  system: [
    "Você extrai os fatos de uma conversa sobre preparar a discussão de estrutura de capital numa reunião do conselho, a partir da mensagem da pessoa, das mensagens anteriores, da data de hoje (today) e dos campos de documentos anexados.",
    "Extraia somente o que foi dito ou o que está em documento. Se não estiver, devolva null (em value, origin e source) ou lista vazia. Nunca estime, nunca complete. Você não escreve páginas, decisões, números, títulos nem perguntas: isso vem das análises revisadas.",
    "askedOn é a data em que o material foi pedido pela primeira vez; meetingDate é a data da reunião (\"conselho na quarta\" é a próxima quarta-feira depois de today, no formato AAAA-MM-DD); nextMeetingDate é a reunião seguinte, se dita. agendaMinutes é o tempo de pauta em minutos.",
    "template é o nome do arquivo da última apresentação ao conselho, quando anexado (origin document). outlineConfirmed é true quando a pessoa aceitou o roteiro proposto (mandou o template, disse para seguir), false quando recusou, null quando não disse.",
    "seen diz se o conselho já viu cada tema (linha-embalagem: revisão do projeto da linha de embalagem; safra: financiamento do capital de giro da safra; vencimentos: vencimentos e plano de financiamento; politica: política de endividamento).",
    "reasons são motivos dados por alguém para um tema, com o autor (chair: presidente do conselho; cfo; ceo) e o código do dicionário fechado: reduce_single_supplier_dependence (depender menos de um único fornecedor do insumo principal), diversify_suppliers, own_capacity, reduce_operational_risk, serve_customer_contract; outside_dictionary quando o motivo dito não é nenhum desses. Gostar de um projeto não é motivo.",
    "deadlines são prazos de ações ditos na conversa ou em documento: supplier_notice (aviso ao fornecedor para renegociar o contrato), join_programs (adesão aos programas de antecipação), finish_sounding (concluir a sondagem), decide_route (decidir a rota dos vencimentos).",
    "omissions são pedidos de retirar algo do material: recommendation quando pedem para tirar a recomendação de um tema, page quando pedem para tirar uma página ou um fato, deadline quando pedem para tirar um prazo (action); topic é o tema; requestedBy é quem pediu (o pedido feito em nome do presidente é chair).",
    "origin é informed quando a pessoa disse, document quando veio de um documento. source cita em poucas palavras de onde veio.",
    turnIntentInstruction,
  ].join("\n"),
  schema: boardMaterialExtractionSchema,
  schemaName: "board_material_extraction_v1",
  outputMode: "prompted_json" as const,
  maxOutputTokens: 4_000,
  cacheKey: "board-material-extraction-2026.10.27-v1",
};

/** The extraction as the planner reads it: stated facts once, with their origin; a fact stated twice differently is asked. */
export function boardMaterialConversation(e: BoardMaterialExtraction): {conversation: BoardMaterialConversation; missing: string[]} {
  const missing: string[] = [];
  const once = <T extends {origin: "informed" | "document"; source: string}>(xs: T[], key: (x: T) => string, value: (x: T) => string, name: string) => {
    const seen = new Map<string, string>(), out: T[] = [];
    xs.forEach((x, k) => {const id = key(x), v = value(x); if (seen.has(id)) {if (seen.get(id) !== v) missing.push(`${name}.${k + 1}`);} else {seen.set(id, v); out.push(x);}});
    return out;
  };
  const fact = <T>(f: {value: T | null; origin: "informed" | "document" | null; source: string | null}, name: string) => {
    if (f.value !== null && f.origin === null) {missing.push(name); return null;}
    return stated(f);
  };
  const agenda = fact(e.agendaMinutes, "agendaMinutes");
  const meeting = fact(e.meetingDate, "meetingDate"), asked = fact(e.askedOn, "askedOn");
  if (meeting && asked && meeting.value < asked.value) missing.push("meetingDate");
  return {missing, conversation: {
    askedOn: asked, meetingDate: meeting, nextMeetingDate: fact(e.nextMeetingDate, "nextMeetingDate"),
    agendaMinutes: agenda ? {...agenda, value: String(agenda.value)} : null, template: fact(e.template, "template"), outlineConfirmed: fact(e.outlineConfirmed, "outlineConfirmed"),
    seen: once(e.seen, (x) => x.topic, (x) => String(x.seen), "seen"),
    reasons: once(e.reasons, (x) => `${x.topic}:${x.author}`, (x) => x.code, "reasons"),
    deadlines: once(e.deadlines, (x) => x.action, (x) => x.date, "deadlines"),
    omissions: e.omissions.flatMap((o, k) => {
      // Only the chair and the CFO have a reviewed phrase as requester; anyone else is asked.
      if (o.requestedBy === null || o.requestedBy === "ceo") {missing.push(`omissions.${k + 1}.requestedBy`); return [];}
      return [{...o, requestedBy: o.requestedBy}];
    }),
  }};
}

/** The prior results of the work as the worker reads them from the database: by source method, the latest completed
 * execution with its stored result, or null. */
const priorSchema = z.looseObject({methodId: z.string(), executionId: z.uuid(), resultFingerprint: z.string().regex(/^[a-f0-9]{64}$/), released: z.boolean(), packet: z.looseObject({})});
export const boardMaterialPriorsSchema = z.looseObject({priors: z.array(priorSchema).max(32)});
export function boardMaterialPriorsByMethod(raw: unknown): Partial<Record<string, BoardMaterialPrior | null>> {
  const parsed = boardMaterialPriorsSchema.parse(raw);
  return Object.fromEntries(boardMaterialSourceMethods.map((m) => [m, parsed.priors.find((p) => p.methodId === m) as BoardMaterialPrior | undefined ?? null]));
}

const question = "Verificação das premissas antes da confirmação";
/** The chain the confirmation runs: the discussion composed with the pinned stored results verbatim, then the packet. */
export const boardMaterialReader = (priors: Partial<Record<string, BoardMaterialPrior | null>>, pins: readonly BoardMaterialPin[]) => (b: BoundBasis) =>
  prepareBoardCapitalDiscussionPacket(composeBoundBoardCapitalDiscussion({discussion: b, question,
    sources: pins.map((p) => ({id: p.role, result: JSON.stringify(priors[p.methodId]!.packet)}))}));
/** The method's refusal over the facts, as its raw message, or null. */
export function boardMaterialCheck(priors: Partial<Record<string, BoardMaterialPrior | null>>, pins: readonly BoardMaterialPin[]) {
  const run = boardMaterialReader(priors, pins);
  return (facts: BoardCapitalDiscussionFacts): string | null => {
    try { run(inMemoryBasis(proposeBoardCapitalDiscussionHypotheses(facts))); return null; }
    catch (error) { return error instanceof Error ? error.message : String(error); }
  };
}
export function boardMaterialReaderGaps(facts: BoardCapitalDiscussionFacts, priors: Partial<Record<string, BoardMaterialPrior | null>>, pins: readonly BoardMaterialPin[]): string[] {
  return readerGaps(proposeBoardCapitalDiscussionHypotheses(facts), boardMaterialReader(priors, pins));
}

export const boardMaterialSituation = "board-capital-discussion";
const sourceLabels: Record<string, string> = {"tabela-divida": "Tabela de dívida", covenant: "Covenant e política", "caixa-semanal": "Caixa semanal", "linha-embalagem": "Projeto de investimento",
  projecao: "Projeção por drivers", "plano-fpa": "Crítica ao plano da área financeira", recebiveis: "Recebíveis", "custo-relativo": "Custo relativo da dívida", "plano-2027": "Plano de financiamento"};
const omittedReasons: Record<string, string> = {not_executed: "análise ainda não concluída neste trabalho", not_released: "método ainda não liberado para execução",
  version_not_released: "resultado de versão não liberada", result_not_verified: "resultado não conferido", reading_unavailable: "o resultado não registra o número que o texto usa",
  date_not_stated: "prazo não informado", reason_not_informed: "motivo do presidente não informado", source_unavailable: "fonte não disponível", answer_without_number: "resposta sem número revisado"};
const said = (x: {origin: string; source: string}) => ({origin: x.origin === "analysis" ? "document" as const : x.origin as Lote2SummaryItem["origin"], source: x.source});

/** The card: the meeting, each reviewed result read (pinned by execution and fingerprint), each deliberation with its
 * deadlines, each page, what the conversation stated, and what was left out and why. */
export function boardMaterialSummary(facts: BoardCapitalDiscussionFacts, pins: readonly BoardMaterialPin[], omitted: readonly BoardMaterialOmitted[]): Lote2Summary & {boardSources: BoardMaterialPin[]} {
  const row = summaryRow;
  const optional = <T>(x: T | null, f: (v: T) => Lote2SummaryItem) => x === null ? [] : [f(x)];
  return {situationId: boardMaterialSituation, referenceDate: facts.meetingDate.value, boardSources: [...pins], items: [
    row("premise", "Data da reunião", said(facts.meetingDate), "boardMeetingDate"),
    ...optional(facts.agendaMinutes, (x) => row("premise", "Tempo de pauta", said(x), "boardAgendaMinutes")),
    ...optional(facts.template, (x) => row("premise", "Template do conselho", said(x), "boardTemplate")),
    row("premise", "Roteiro confirmado", said(facts.outlineConfirmed), "boardOutlineConfirmed"),
    row("premise", "Antecedência do roteiro", said(facts.leadDays), "boardLeadDays"), row("premise", "Minutos por página", said(facts.minutesPerPage), "boardMinutesPerPage"),
    ...facts.sources.map((s) => row("version", sourceLabels[s.value.id] ?? s.value.id, said(s), `boardSource.${s.value.id}`)),
    ...facts.deliberations.map((d) => row("action", d.value.id, said(d), `boardDeliberation.${d.value.id}`)),
    ...facts.pages.map((p) => row("item", p.value.id, said(p), `boardPage.${p.value.role}`)),
    ...facts.topics.map((t) => row("premise", t.value.id, said(t), `boardTopicSeen.${t.value.seen === null ? "unknown" : t.value.seen ? "yes" : "no"}`)),
    ...facts.informed.map((x) => row("premise", x.value.code, said(x), "boardInformedReason")),
    ...facts.omissions.map((o) => row("item", o.value.targetId, said(o), `boardOmission.${o.value.target}`)),
    ...omitted.map((o) => row("item", o.item, {origin: "house", source: omittedReasons[o.reason]
      ?? (o.reason.startsWith("template_not_applicable:") ? `o texto da biblioteca não se sustenta nestes resultados (${o.reason.slice(24)})` : o.reason)}, "boardOmitted")),
  ]};
}
export function buildBoardMaterialPremiseProposal(facts: BoardCapitalDiscussionFacts, pins: readonly BoardMaterialPin[], omitted: readonly BoardMaterialOmitted[]) {
  return fingerprintedProposal(boardMaterialPremiseMethod, facts, proposeBoardCapitalDiscussionHypotheses(facts), boardMaterialSummary(facts, pins, omitted));
}

/** One turn's premise step for the board material. Without any completed released result of the work it proposes
 * nothing and says so, before any extraction. */
export async function proposeBoardMaterialPremisesForTurn(input: {
  message: string; hasAttachments: boolean; recentUserMessages: string[]; projectId: string | null; today: string;
  loadEvidence: () => Promise<unknown>; loadPriors: () => Promise<unknown>; extract: (text: string) => Promise<unknown>;
  log: (event: string, detail: Record<string, unknown>) => void;
}): Promise<Lote2TurnPremises | null> {
  const entry = input.projectId ? boardMaterialEntry(input.message, input.hasAttachments, input.recentUserMessages) : null;
  if (!input.projectId || !entry) return null;
  let priors: Partial<Record<string, BoardMaterialPrior | null>>;
  try { priors = boardMaterialPriorsByMethod(await input.loadPriors()); }
  catch (error) { input.log("board_material_premises.failed", {message: error instanceof Error ? error.message.slice(0, 200) : "unknown"}); return null; }
  if (!Object.values(priors).some((p) => p?.released)) {
    input.log("board_material_premises.priors_missing", {});
    return {forAdvisor: {status: "missing", missing: ["sources"]}, proposal: null};
  }
  // The method's own check runs inside the planner; the facts it accepted are not checked twice.
  let verified: {facts: BoardCapitalDiscussionFacts; pins: BoardMaterialPin[]; omitted: BoardMaterialOmitted[]} | null = null;
  return proposeLote2PremisesForTurn({logPrefix: "board_material_premises", idName: "board-material", expansionRefusalAsGap: true, schema: boardMaterialExtractionSchema,
    complete: (extraction, id) => {
      const {conversation, missing} = boardMaterialConversation(extraction);
      if (missing.length) return {status: "missing", missing};
      const planned = planBoardMaterial({ids: {discussionId: id, definitionVersionId: id}, today: input.today, perimeter: "standalone", currency: "BRL", priors, conversation,
        check: (facts) => boardMaterialCheck(priors, verifiedPins(facts))(facts)});
      if (planned.status === "missing") return {status: "missing", missing: planned.missing};
      verified = {facts: planned.facts, pins: planned.pins, omitted: planned.omitted};
      return {status: "complete", facts: planned.facts, situationId: boardMaterialSituation, housePremiseKeys: planned.housePremiseKeys};
    },
    build: (facts) => buildBoardMaterialPremiseProposal(facts, verified!.pins, verified!.omitted),
    readerCheck: (facts) => verified?.facts === facts ? [] : boardMaterialReaderGaps(facts, priors, verifiedPins(facts))}, {...input, entry, projectId: input.projectId,
    loadEvidence: async () => ({today: input.today, documentFields: await input.loadEvidence()})});
  /** The pins of the sources the facts name, in their order. */
  function verifiedPins(facts: BoardCapitalDiscussionFacts): BoardMaterialPin[] {
    return facts.sources.map((s) => {
      const methodId = s.value.methodId as keyof typeof boardMaterialSourceIds, prior = priors[methodId]!;
      return {role: s.value.id as BoardMaterialPin["role"], methodId, executionId: prior.executionId, resultFingerprint: prior.resultFingerprint};
    });
  }
}
