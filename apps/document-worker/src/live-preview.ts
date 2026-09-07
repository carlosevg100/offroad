/**
 * live_intelligence_preview: the semantic router decides a preview turn.
 *
 * The canonical route contract and independent semantic-object contract run before a supplemental
 * preview-control extraction. Everything after those calls is deterministic: the company resolves
 * to a frozen corpus or to nothing, the plan is compiled by the same compiler the skeleton uses,
 * and the reply states what was understood, at what cost, and where the router abstained. A company
 * without a frozen corpus never receives another company's objects.
 */
import type {IntentEnvelope} from "@offroad/agent-contracts";
import {intentDepthSchema} from "@offroad/agent-contracts";
import {preview} from "@offroad/credit-playbook";

const {describePremises} = preview;
import type {ModelGateway} from "@offroad/model-gateway";
import {buildOriginationResearchPlan, runPublicResearch, type PublicSearchProvider, type ResearchRun} from "@offroad/public-research";
import {z} from "zod";

import {
  shadowIntentEnvelope,
  shadowRoutingOutputSchema,
  type ShadowRoutingContext,
} from "./intent-shadow";
import {
  answerFromObjects,
  buildPreviewActivation,
  type PreviewActivation,
  type PreviewComposition,
  type PreviewPremises,
  type PreviewRequest,
  type PreviewStepOutput,
  type PreviewTurnInput,
} from "./integration-preview";
import {governedModelRoute, safeModelTurnTelemetry, safeSuccessfulModelCall} from "./model-call-log";

export const LIVE_MARK = "[Validação interna, live_intelligence_preview]";
export const LIVE_MARK_EN = "[Internal validation, live_intelligence_preview]";

/** The CDI reference the premises are quoted against when the person says "CDI + x". */
const CDI_REFERENCE = 0.1325;

const previewObjectKinds = ["debt_ledger", "financial_statements", "covenants", "maturity_wall", "interest_schedule", "exit_cost", "scenarios", "alternatives", "meeting_brief"] as const;
const materialForms = ["pitch_pages", "internal_briefing", "analysis_with_scenarios", "board_deck", "memo"] as const;

// Prompted JSON is not grammar-bound: a model may write null for an object it has nothing to say
// about, or omit an optional field. The schema accepts those forms (and stays representable as
// JSON Schema, which a transform is not); `normalizePreviewTurn` gives the derivation one shape.
const materialFormSchema = z.enum(materialForms);
const rawPreviewTurnSchema = z.object({
  companies: z.array(z.object({
    mention: z.string().min(1).max(120),
    role: z.enum(["subject", "counterparty", "comparable", "other"]).nullish(),
  })).max(8).nullish(),
  premiseChanges: z.object({
    newDebtAnnualRate: z.number().min(0).max(1).nullish(),
    cdiSpreadBps: z.number().min(-2_000).max(5_000).nullish(),
    newDebtTermMonths: z.number().int().positive().max(600).nullish(),
    newDebtGraceMonths: z.number().int().nonnegative().max(240).nullish(),
  }).nullish(),
  numberQuestion: z.object({
    mentioned: z.string().max(80).nullish(),
    objects: z.array(z.enum(previewObjectKinds)).max(9).nullish(),
  }).nullish(),
  material: z.object({
    requested: z.boolean().nullish(),
    form: materialFormSchema.nullish(),
    pages: z.number().int().positive().max(60).nullish(),
  }).nullish(),
  answers: z.array(z.object({
    questionId: z.string().min(1).max(60),
    answer: z.string().min(1).max(400),
    effect: z.object({
      audience: z.string().max(80).nullish(),
      depth: intentDepthSchema.nullish(),
      scope: z.string().max(200).nullish(),
    }).nullish(),
  })).max(6).nullish(),
  scopeChanges: z.object({
    audience: z.string().max(80).nullish(),
    depth: intentDepthSchema.nullish(),
    form: materialFormSchema.nullish(),
  }).nullish(),
});
export const previewTurnSchema = rawPreviewTurnSchema;

export type PreviewTurn = {
  companies: Array<{mention: string; role: "subject" | "counterparty" | "comparable" | "other"}>;
  premiseChanges: {newDebtAnnualRate: number | null; cdiSpreadBps: number | null; newDebtTermMonths: number | null; newDebtGraceMonths: number | null};
  numberQuestion: {mentioned: string | null; objects: Array<(typeof previewObjectKinds)[number]>} | null;
  material: {requested: boolean; form: (typeof materialForms)[number] | null; pages: number | null};
  answers: Array<{questionId: string; answer: string; effect: {audience: string | null; depth: z.infer<typeof intentDepthSchema> | null; scope: string | null}}>;
  scopeChanges: {audience: string | null; depth: z.infer<typeof intentDepthSchema> | null; form: (typeof materialForms)[number] | null};
};

/** One shape for the derivation: every null or missing object, list or field becomes its neutral value. */
export function normalizePreviewTurn(raw: z.infer<typeof rawPreviewTurnSchema>): PreviewTurn {
  return {
    companies: (raw.companies ?? []).map((company) => ({mention: company.mention, role: company.role ?? "other"})),
    premiseChanges: {
      newDebtAnnualRate: raw.premiseChanges?.newDebtAnnualRate ?? null,
      cdiSpreadBps: raw.premiseChanges?.cdiSpreadBps ?? null,
      newDebtTermMonths: raw.premiseChanges?.newDebtTermMonths ?? null,
      newDebtGraceMonths: raw.premiseChanges?.newDebtGraceMonths ?? null,
    },
    numberQuestion: raw.numberQuestion ? {mentioned: raw.numberQuestion.mentioned ?? null, objects: raw.numberQuestion.objects ?? []} : null,
    material: {requested: raw.material?.requested ?? false, form: raw.material?.form ?? null, pages: raw.material?.pages ?? null},
    answers: (raw.answers ?? []).map((answer) => ({questionId: answer.questionId, answer: answer.answer, effect: {audience: answer.effect?.audience ?? null, depth: answer.effect?.depth ?? null, scope: answer.effect?.scope ?? null}})),
    scopeChanges: {audience: raw.scopeChanges?.audience ?? null, depth: raw.scopeChanges?.depth ?? null, form: raw.scopeChanges?.form ?? null},
  };
}



export const liveRoutingOutputSchema = shadowRoutingOutputSchema.extend({
  // `deepen` is an internal preview continuation, not an Atlas composition emitted by the
  // canonical classifier. Keep the compatibility rail explicit while the universal compiler is
  // still in shadow.
  composition: z.union([shadowRoutingOutputSchema.shape.composition.unwrap(), z.literal("deepen")]).nullable(),
  turn: previewTurnSchema,
});
export type LiveRoutingOutput = Omit<z.infer<typeof liveRoutingOutputSchema>, "turn"> & {turn: PreviewTurn};

const liveTurnExtractionOutputSchema = z.object({turn: previewTurnSchema}).strict();

export const LIVE_ROUTING_SYSTEM = `You extract supplemental, non-routing controls for an internal validation desk.
The canonical route and semantic objects are decided by separate governed contracts. You must not
classify, route, plan, answer or execute the request. Fill only "turn":
- companies: every company the person names or clearly refers to, the mention as written, with its
  role (subject of the work, counterparty, comparable, other). A company written in the message is
  always listed; never invent one.
- premiseChanges: only numbers the person states for the new debt: annual rate as a decimal (15.5%
  is 0.155), or a spread over CDI in basis points (CDI + 1.5% is 150), term in months, grace in
  months. Leave the rest null.
- numberQuestion: when the person asks where a number came from, the number as written and which
  objects could hold it. Otherwise null.
- material: whether the person asks for a deliverable, its form and page count when stated.
- answers: when the person answers one of the openQuestions listed in the input, the question id,
  the answer as stated and its effect on audience, depth or scope.
- scopeChanges: an object with audience, depth and form, each null unless the person changes it in
  this turn.
- requestKind comes from the product control. When it is execution_brief_edit, read the prose as an
  instruction to revise the current plan. When it is information_request_response, the product has
  already bound the prose to the exact question in openQuestions; return that question id in answers.
  Do not reinterpret either control as an unrelated new assignment.`;

export type LiveUnderstanding = {
  envelope: IntentEnvelope;
  output: LiveRoutingOutput;
  modelRoute: typeof governedModelRoute;
  costUsd: number;
  latencyMs: number;
  calls: number;
  routingAttempt: ReturnType<typeof safeSuccessfulModelCall>;
  semanticObjectAttempt: ReturnType<typeof safeSuccessfulModelCall>;
  previewTurnAttempt: ReturnType<typeof safeSuccessfulModelCall>;
};

export type LiveTurnContext = ShadowRoutingContext & {
  /** Questions the desk left open in earlier turns, so an answer can be recognised. */
  openQuestions: Array<{id: string; text: string}>;
  /** Which signed objects already exist in the project (task ids), so a question can be answered from them. */
  priorObjectKinds: string[];
  requestKind: "message" | "execution_brief_edit" | "information_request_response";
};

/**
 * The canonical two-contract router runs first. A third, non-routing contract may then extract
 * preview-only controls. If route or semantic coverage fails, this function fails closed before
 * the supplemental contract can influence an envelope or a workflow.
 */
export async function understandLiveTurn(input: {gateway: ModelGateway; context: LiveTurnContext; now?: () => Date}): Promise<LiveUnderstanding> {
  const {context} = input;
  const spentBefore = input.gateway.spent();
  const startedAt = Date.now();
  const canonical = await shadowIntentEnvelope({gateway: input.gateway, context, ...(input.now ? {now: input.now} : {})});
  const completion = await input.gateway.complete({
    task: "route_intent",
    system: LIVE_ROUTING_SYSTEM,
    input: [{
      type: "text",
      text: JSON.stringify({
        locale: context.locale,
        latestUserMessage: context.message,
        recentConversation: context.recentMessages.slice(-8),
        entryJob: context.entryJob,
        documentCount: context.documentIds.length,
        professionalContext: context.professionalContext,
        openQuestions: context.openQuestions,
        priorObjects: context.priorObjectKinds,
        requestKind: context.requestKind,
      }),
    }],
    schema: liveTurnExtractionOutputSchema,
    schemaName: "live_preview_turn_output",
    // The envelope schema is too large for the provider's compiled grammar; the schema travels in the prompt.
    outputMode: "prompted_json",
    thinking: "off",
    metadata: {surface: "live_preview_router"},
  });
  const normalizedTurn = normalizePreviewTurn(completion.output.turn);
  const output: LiveRoutingOutput = {
    ...canonical.output,
    turn: normalizedTurn,
  };
  const telemetry = safeModelTurnTelemetry(spentBefore, input.gateway.spent(), Date.now() - startedAt);
  return {
    envelope: canonical.envelope,
    output,
    modelRoute: governedModelRoute,
    routingAttempt: canonical.routingAttempt,
    semanticObjectAttempt: canonical.semanticObjects.routingAttempt,
    previewTurnAttempt: safeSuccessfulModelCall(completion),
    ...telemetry,
  };
}

export type LiveDecisionInput = {
  locale: "pt-BR" | "en-US";
  message: string;
  recentMessages: Array<{role: "user" | "assistant"; content: string}>;
  understanding: LiveUnderstanding;
  /** The corpus an earlier turn of this project already resolved, if any. */
  priorCaseId: string | null;
  /** The request of the active preview brief and the answers it already carries, so an answer changes the plan instead of restarting it. */
  priorRequest: Partial<PreviewRequest> | null;
  priorAnswers: Array<{questionId: string; answer: string}>;
  openQuestions: Array<{id: string; text: string}>;
  artifactTypes: string[];
  runActive: boolean;
  priorOutputs: Map<string, PreviewStepOutput>;
  entryJob: string;
  messageId: string;
  planEditRequested?: boolean;
  /** Exact request selected by the governed question control; never inferred from prose. */
  answeredQuestion?: {id: string; text: string};
  registryVersion?: string;
};

export type LiveDecision = {
  kind: "activate" | "answer" | "wait" | "converse" | "abstain";
  composition: PreviewComposition | null;
  reply: string;
  activation: PreviewActivation | null;
  /** What the stage event and the gate report record about this turn. */
  record: {
    composition: PreviewComposition | null;
    corpus: {caseId: string; sourcePackId: string; company: string} | null;
    companiesMentioned: string[];
    namedComposition: string | null;
    primaryWorks: string[];
    audience: string;
    depth: string;
    abstained: boolean;
    abstainReason: string | null;
    firstQuestion: string | null;
    modelRoute: typeof governedModelRoute;
    costUsd: number;
    latencyMs: number;
    calls: number;
  };
};

type Composition = PreviewComposition;

const t = (locale: "pt-BR" | "en-US", pt: string, en: string) => (locale === "en-US" ? en : pt);

const knownAudiences = new Set(["vp", "board", "committee", "cfo", "ceo", "companhia", "investors"]);
const canonicalAudience: Record<LiveRoutingOutput["routingCore"]["audienceType"]["value"], string | null> = {
  self: "self",
  internal_senior: "vp",
  company_management: "cfo",
  board_or_committee: "board",
  capital_provider: "investors",
  market: "market",
  unspecified: null,
};

function normalizeAudience(value: string | null | undefined): string | null {
  if (!value) return null;
  const lower = value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  if (/\bvp\b|vice/.test(lower)) return "vp";
  if (/conselho|board/.test(lower)) return "board";
  if (/comite|committee/.test(lower)) return "committee";
  if (/\bcfo\b|diretor(a)? financeir/.test(lower)) return "cfo";
  if (/\bceo\b/.test(lower)) return "ceo";
  if (/companhia|company|cliente|client/.test(lower)) return "companhia";
  if (/investidor|investor|fundo|fund/.test(lower)) return "investors";
  return lower.replace(/[^a-z0-9 ]+/g, " ").trim().slice(0, 40) || null;
}

/** The premises the turn states, in the shape the executors take (a spread over CDI becomes a rate). */
export function premisesFromTurn(turn: PreviewTurn): PreviewPremises {
  const changes = turn.premiseChanges;
  const premises: Record<string, unknown> = {};
  if (changes.newDebtAnnualRate !== null) premises.newDebtAnnualRate = changes.newDebtAnnualRate.toFixed(4).replace(/0+$/, "").replace(/\.$/, ".0");
  else if (changes.cdiSpreadBps !== null) premises.newDebtAnnualRate = (CDI_REFERENCE + changes.cdiSpreadBps / 10_000).toFixed(4).replace(/0+$/, "").replace(/\.$/, ".0");
  if (changes.newDebtTermMonths !== null) premises.newDebtTermMonths = changes.newDebtTermMonths;
  if (changes.newDebtGraceMonths !== null) premises.newDebtGraceMonths = changes.newDebtGraceMonths;
  return preview.previewPremisesSchema.parse(premises);
}

const compositionLabels: Record<Composition, {pt: string; en: string}> = {
  prepare_meeting: {pt: "preparar reunião", en: "prepare meeting"},
  prepare_material: {pt: "preparar material", en: "prepare material"},
  change_premise: {pt: "alterar premissa", en: "change premise"},
  deepen: {pt: "aprofundar", en: "deepen"},
  prepare_decision: {pt: "preparar decisão", en: "prepare decision"},
};

/** Named compositions of the Atlas that the preview desk can run on the Case 01 chain, and how. */
function compositionFromEnvelope(output: LiveRoutingOutput, hasAnalysis: boolean): {composition: Composition | null; outOfScope: string | null} {
  const named = output.composition;
  const works = output.primaryWorks.map((work) => work.work);
  switch (named) {
    case "prepare_meeting":
    case "understand_company_sector_asset":
    case "analyze_performance_and_credit":
    case "diagnose_capital_structure":
    case "develop_alternatives":
    case "design_indicative_structure":
    case "build_or_review_model":
    case "read_contract_covenant_waterfall":
    case "extract_and_reconcile_data":
      return {composition: hasAnalysis ? "deepen" : "prepare_meeting", outOfScope: null};
    case "prepare_material":
      return {composition: hasAnalysis ? "prepare_material" : "prepare_meeting", outOfScope: null};
    case "prepare_decision":
    case "review_work":
      return {composition: "prepare_decision", outOfScope: null};
    case "answer_a_question":
      return {composition: null, outOfScope: null};
    case "identify_capital":
    case "introduce":
    case "monitor":
    case "manage_work":
    case "evaluate_received_opportunity":
    case "map_market_and_precedents":
    case "find_and_organize_information":
      return {composition: null, outOfScope: named};
    default:
      break;
  }
  if (works.some((work) => ["capital_strategy", "analyze", "understand", "model", "read_documents", "extract_and_reconcile"].includes(work))) {
    return {composition: hasAnalysis ? "deepen" : "prepare_meeting", outOfScope: null};
  }
  if (works.some((work) => ["capital_match", "market", "find_and_organize"].includes(work))) {
    return {composition: null, outOfScope: works[0] ?? null};
  }
  return {composition: null, outOfScope: null};
}

function headline(input: LiveDecisionInput, composition: Composition | null, corpus: LiveDecision["record"]["corpus"], audience: string, depth: string): string {
  const {understanding} = input;
  const mark = input.locale === "en-US" ? LIVE_MARK_EN : LIVE_MARK;
  const fields = [
    `${t(input.locale, "composição", "composition")}=${composition ?? t(input.locale, "nenhuma", "none")}`,
    `${t(input.locale, "companhia", "company")}=${corpus ? corpus.company : t(input.locale, "não identificada", "not identified")}`,
    `corpus=${corpus ? corpus.caseId : t(input.locale, "nenhum", "none")}`,
    `${t(input.locale, "audiência", "audience")}=${audience}`,
    `${t(input.locale, "profundidade", "depth")}=${depth}`,
    `${t(input.locale, "rota", "route")}=${understanding.modelRoute}`,
    `${t(input.locale, "chamadas", "calls")}=${understanding.calls}`,
    `${t(input.locale, "custo", "cost")}=US$ ${understanding.costUsd.toFixed(4)}`,
  ];
  return `${mark} ${fields.join(" · ")}`;
}

function normalizeText(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** The message without what the person quotes: a quoted question is the desk's words, not a request. */
function unquoted(message: string): string {
  return message.replace(/["\u201c][^"\u201d]*["\u201d]/g, " ");
}

/**
 * An answer that quotes the desk's question (its first words at least) without naming its id: the
 * classifier leaves `answers` empty in that case, and the turn would otherwise be read as a scope
 * change or a deliverable. The effect comes from the scope changes the classifier did read.
 */
function answersQuotedInText(message: string, openQuestions: Array<{id: string; text: string}>, scope: PreviewTurn["scopeChanges"]): PreviewTurn["answers"] {
  const normalized = normalizeText(message);
  return openQuestions.flatMap((question) => {
    const head = normalizeText(question.text).split(" ").slice(0, 6).join(" ");
    if (head.split(" ").length < 4 || !normalized.includes(head)) return [];
    const answer = unquoted(message).replace(/^\s*sobre a (sua|tua|minha|nossa) pergunta\s*:?\s*/i, "").replace(/^\s*:\s*/, "").trim().slice(0, 600) || message.slice(0, 600);
    return [{questionId: question.id, answer, effect: {audience: scope.audience, depth: scope.depth, scope: null}}];
  });
}

const pageWords: Record<string, number> = {uma: 1, um: 1, duas: 2, dois: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10};

/** A page count written in the message ("três páginas", "5 páginas"); null when none is stated. */
function pagesInText(message: string): number | null {
  const match = normalizeText(message).match(/\b(\d{1,2}|uma|um|duas|dois|tres|quatro|cinco|seis|sete|oito|nove|dez) paginas?\b/);
  if (!match) return null;
  const value = /^\d/.test(match[1]!) ? Number(match[1]) : pageWords[match[1]!] ?? null;
  return value && value >= 1 && value <= 60 ? value : null;
}

function numericValuesInText(message: string): number[] {
  return [...unquoted(message).matchAll(/\b\d+(?:[.,]\d+)?\b/g)]
    .map((match) => Number(match[0].replace(",", ".")))
    .filter(Number.isFinite);
}

function hasNumericValue(message: string, expected: number): boolean {
  const tolerance = Math.max(0.000_001, Math.abs(expected) * 0.000_001);
  return numericValuesInText(message).some((value) => Math.abs(value - expected) <= tolerance);
}

/**
 * Keeps only premise values attributable to the current user message. Unit conversions are
 * explicit and bounded: decimal rate ↔ percentage, years ↔ months and percentage spread ↔ bps.
 * A supplemental extraction may locate these values; it may never invent one or carry it from a
 * prior turn.
 */
function attributablePremiseTurn(turn: PreviewTurn, message: string): PreviewTurn {
  const changes = turn.premiseChanges;
  const annualRate = changes.newDebtAnnualRate;
  const spreadBps = changes.cdiSpreadBps;
  const termMonths = changes.newDebtTermMonths;
  const graceMonths = changes.newDebtGraceMonths;
  const normalized = normalizeText(unquoted(message));
  const raw = unquoted(message).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const rateContext = /\b(?:taxa|juros|interest|rate|cdi|a\.?a\.?)\b/.test(raw) && /%/.test(raw);
  const spreadContext = /\b(?:cdi|spread|bps|pontos?[- ]base|basis points?)\b/.test(raw);
  const supportsMonths = (months: number, kind: "term" | "grace") => {
    if (hasNumericValue(message, months) && new RegExp(`\\b${months}\\s*(?:mes|meses|months?)\\b`, "i").test(normalized)) return true;
    if (months % 12 !== 0) return false;
    const years = months / 12;
    if (!hasNumericValue(message, years)) return false;
    return kind === "grace"
      ? new RegExp(`\\b${years}\\b[^.!?]{0,24}\\b(?:carencia|grace)\\b|\\b(?:carencia|grace)\\b[^.!?]{0,24}\\b${years}\\b`, "i").test(normalized)
      : new RegExp(`\\b${years}\\s*(?:ano|anos|year|years)\\b`, "i").test(normalized);
  };
  return {
    ...turn,
    premiseChanges: {
      newDebtAnnualRate: annualRate !== null && rateContext && (hasNumericValue(message, annualRate) || hasNumericValue(message, annualRate * 100)) ? annualRate : null,
      cdiSpreadBps: spreadBps !== null && spreadContext && (hasNumericValue(message, spreadBps) || hasNumericValue(message, spreadBps / 100)) ? spreadBps : null,
      newDebtTermMonths: termMonths !== null && supportsMonths(termMonths, "term") ? termMonths : null,
      newDebtGraceMonths: graceMonths !== null && supportsMonths(graceMonths, "grace") ? graceMonths : null,
    },
  };
}

function explicitNumberQuestion(message: string, mentioned: string): boolean {
  const plain = unquoted(message);
  const values = numericValuesInText(plain);
  const mentionedValues = numericValuesInText(mentioned);
  if (values.length === 0 || mentionedValues.length === 0
    || !mentionedValues.every((expected) => values.some((value) => Math.abs(value - expected) <= 0.000_001))) return false;
  return /\?/.test(plain)
    || /\b(?:de onde|qual (?:e|é) a origem|como (?:cheg|calcul)|por que|porque|explique|mostre)\b/i.test(normalizeText(plain));
}

/**
 * Decides the turn from the understanding. Deterministic: the model spoke once, in
 * `understandLiveTurn`; everything here is derivation the person can audit in the reply.
 */
export function decideLiveTurn(input: LiveDecisionInput): LiveDecision {
  const {locale, understanding} = input;
  const output = understanding.output;
  const core = output.routingCore;
  const hasAnalysis = input.artifactTypes.includes("preview_alternatives");
  const priorUserTurns = input.recentMessages.filter((message) => message.role === "user").map((message) => message.content);
  const sponsorInstruction = (understanding.envelope.executionContext.sponsorInstruction.value ?? [...priorUserTurns, input.message].join("\n")).slice(0, 4_000);
  // Company identity is routing authority, not a preview-control hint. Only the semantic-object
  // contract may contribute a model-derived mention. The raw message is still checked below by
  // the deterministic alias registry, so an exact name cannot be lost to an extractor miss.
  const mentions = core.object.value
    .filter((object) => object.kind === "company")
    .flatMap((object) => object.slots.filter(({key}) => key === "entity").map(({value}) => value));
  // The classifier sometimes leaves a named company out of its list; the registry's aliases are
  // matched against the message itself as well, as whole words, so a company the person wrote
  // is never "not identified" because of the model.
  const fromClassifier = preview.resolvePreviewCorpus(mentions);
  const fromText = preview.resolvePreviewCorpus([input.message]);
  const resolution = fromClassifier.kind === "resolved" ? fromClassifier : fromText.kind === "resolved" ? fromText : fromClassifier;
  const priorCorpus = input.priorCaseId ? preview.corpusByCaseId(input.priorCaseId) : null;
  const corpusRecord = (corpus: preview.PreviewCorpus | null) => corpus ? {caseId: corpus.caseId, sourcePackId: corpus.sourcePackId, company: corpus.company.legalName} : null;
  // Audience and depth are canonical routing axes. Neither the supplemental extraction nor a
  // keyword shortcut may replace them: quoted, historical or negated mentions of a board are not
  // the audience of the current request.
  // Among the audiences the classifier lists, a known role wins over free text ("banker (self)"),
  // so the headline names the reader of the work, not the person writing the request.
  const classifiedAudience = canonicalAudience[core.audienceType.value];
  const audience = (classifiedAudience && knownAudiences.has(classifiedAudience) ? classifiedAudience : null)
    ?? classifiedAudience
    ?? "vp";
  const depth = core.depth.value;
  // Three readings of the message itself, for what the classifier got wrong in the gate: it filed
  // "para o conselho" as a board deck request, filed a request for pages as an answer to the format
  // question, and carried a rate from an earlier turn into a message with no number. The text adds
  // what the classifier missed and vetoes what it invented; the reply shows the result.
  const materialWords = /\b(material|p[a\u00e1]ginas?|pitch|deck|memo|apresenta[c\u00e7][a\u00e3]o|briefing|planilha|relat[o\u00f3]rio)\b/i;
  // Without the classifier's flag, only an imperative aimed at the deliverable or a stated page
  // count counts: "meu VP me pediu para preparar material" is the story of the request, not one.
  const imperativeMaterial = /^\s*(vamos|monte|monta|prepare|prepara|preparem|fa[c\u00e7]a|faz|gere|gera|produza|escreva|redija|quero|precis\w+)\b[^.!?]{0,40}\b(material|p[a\u00e1]ginas?|pitch|deck|memo|apresenta[c\u00e7][a\u00e3]o|briefing)\b/i;
  const materialExplicit = hasAnalysis
    && materialWords.test(unquoted(input.message))
    && (output.composition === "prepare_material" || imperativeMaterial.test(unquoted(input.message)) || pagesInText(unquoted(input.message)) !== null);
  const premiseCompatible = output.composition === "build_or_review_model"
    || (output.composition === "answer_a_question" && input.answeredQuestion !== undefined);
  const governedPremiseTurn = premiseCompatible
    ? attributablePremiseTurn(output.turn, input.message)
    : {...output.turn, premiseChanges: {newDebtAnnualRate: null, cdiSpreadBps: null, newDebtTermMonths: null, newDebtGraceMonths: null}};
  const turnPremises = premisesFromTurn(governedPremiseTurn);
  const base = (composition: Composition | null, corpus: preview.PreviewCorpus | null, abstained: boolean, abstainReason: string | null) => ({
    composition,
    corpus: corpusRecord(corpus),
    companiesMentioned: mentions,
    namedComposition: output.composition,
    primaryWorks: output.primaryWorks.map((work) => work.work),
    audience,
    depth,
    abstained,
    abstainReason,
    firstQuestion: output.firstQuestion,
    modelRoute: understanding.modelRoute,
    costUsd: understanding.costUsd,
    latencyMs: understanding.latencyMs,
    calls: understanding.calls,
  });

  if (input.runActive) {
    return {
      kind: "wait", composition: null, activation: null,
      reply: `${headline(input, null, corpusRecord(priorCorpus), audience, depth)}\n${t(locale, "A corrida anterior ainda está em andamento; incorporo este pedido assim que ela terminar.", "The previous run is still in progress; I will take this request in as soon as it finishes.")}`,
      record: base(null, priorCorpus, false, null),
    };
  }

  // The classifier abstains: the desk asks instead of guessing.
  if (output.abstain && !input.planEditRequested && !input.answeredQuestion) {
    const question = output.firstQuestion ?? t(locale, "O que você precisa que eu faça, para qual companhia e para quem?", "What do you need done, for which company and for whom?");
    return {
      kind: "abstain", composition: null, activation: null,
      reply: `${headline(input, null, corpusRecord(priorCorpus), audience, depth)}\n${t(locale, "Não consegui ler o pedido com segurança", "I could not read the request with confidence")}${output.abstainReason ? ` (${output.abstainReason})` : ""}. ${question}`,
      record: base(null, priorCorpus, true, output.abstainReason ?? "classifier_abstained"),
    };
  }

  // Company: a mention that resolves, the corpus of an earlier turn, or nothing.
  let corpus: preview.PreviewCorpus | null = null;
  if (resolution.kind === "resolved") corpus = resolution.corpus;
  else if (resolution.kind === "none") corpus = priorCorpus;
  if (resolution.kind === "unknown") {
    const named = resolution.mentions.join(", ");
    return {
      kind: "abstain", composition: null, activation: null,
      reply: `${headline(input, null, null, audience, depth)}\n${t(locale,
        `Não tenho base congelada para ${named}. Nesta validação interna analiso só a companhia do Caso 01, e não uso os objetos dela para outra companhia. Para ${named} eu precisaria dos documentos (ITR, escrituras, relatórios do agente fiduciário) ou de uma pesquisa pública autorizada, que este modo ainda não executa.`,
        `I hold no frozen base for ${named}. In this internal validation I analyse only the Case 01 company, and I never use its objects for another company. For ${named} I would need the documents (quarterly statements, indentures, trustee reports) or an authorised public research, which this mode does not run yet.`)}`,
      record: base(null, null, true, "company_without_corpus"),
    };
  }

  const scope = input.planEditRequested
    ? {composition: hasAnalysis ? "deepen" as const : "prepare_meeting" as const, outOfScope: null}
    : compositionFromEnvelope(output, hasAnalysis);
  // A board or a committee decides: the same analysis chain, the decision form of the brief.
  if (scope.composition && !scope.outOfScope && (audience === "board" || audience === "committee")) scope.composition = "prepare_decision";
  if (scope.outOfScope) {
    return {
      kind: "abstain", composition: null, activation: null,
      reply: `${headline(input, null, corpusRecord(corpus), audience, depth)}\n${t(locale,
        `Li o pedido como "${scope.outOfScope}", que está fora do que esta validação interna executa (análise de crédito e preparação de reunião, material ou decisão sobre a base congelada do Caso 01). Não sigo por conta própria; diga se quer a análise da companhia.`,
        `I read the request as "${scope.outOfScope}", which is outside what this internal validation runs (credit analysis and the preparation of a meeting, material or decision on the frozen Case 01 base). I do not proceed on my own; say if you want the company's analysis.`)}`,
      record: base(null, corpus, true, `out_of_scope:${scope.outOfScope}`),
    };
  }

  const turnInput: PreviewTurnInput = {
    locale, message: input.message, recentMessages: input.recentMessages, artifactTypes: input.artifactTypes, runActive: input.runActive,
    priorOutputs: input.priorOutputs, entryJob: input.entryJob, messageId: input.messageId,
    ...(input.planEditRequested !== undefined ? {planEditRequested: input.planEditRequested} : {}),
    ...(input.registryVersion ? {registryVersion: input.registryVersion} : {}),
  };

  // A question about a number is answered from signed objects only when the canonical route says
  // answer and the referenced number plus question language are present in the current message.
  const numberQuestion = output.turn.numberQuestion;
  if (output.composition === "answer_a_question" && numberQuestion?.mentioned && hasAnalysis
    && explicitNumberQuestion(input.message, numberQuestion.mentioned)) {
    return {
      kind: "answer", composition: null, activation: null,
      reply: `${headline(input, null, corpusRecord(corpus), audience, depth)}\n${answerFromObjects(turnInput)}`,
      record: base(null, corpus, false, null),
    };
  }

  if (!corpus) {
    const question = output.firstQuestion ?? t(locale, "De qual companhia estamos falando?", "Which company are we talking about?");
    return {
      kind: "abstain", composition: null, activation: null,
      reply: `${headline(input, null, null, audience, depth)}\n${t(locale, "Entendi o pedido, mas não a companhia.", "I understood the request, but not the company.")} ${question}`,
      record: base(null, null, true, "company_not_named"),
    };
  }

  // Answers to open questions, from the classifier or quoted in the text; the merged list rides in
  // the brief for the planner and the audit.
  const knownQuestionIds = new Set(input.openQuestions.map((question) => question.id));
  const governedScopeEffect: PreviewTurn["scopeChanges"] = {
    audience: classifiedAudience ?? null,
    depth: core.depth.state === "explicit" || core.depth.state === "inferred" ? core.depth.value : null,
    form: output.turn.scopeChanges.form,
  };
  const classifierAnswers = output.turn.answers
    .filter((answer) => knownQuestionIds.has(answer.questionId))
    .map((answer) => ({...answer, effect: {...answer.effect, audience: governedScopeEffect.audience, depth: governedScopeEffect.depth}}));
  const governedAnswers: PreviewTurn["answers"] = input.answeredQuestion ? [{
    questionId: input.answeredQuestion.id,
    answer: input.message,
    effect: {audience: governedScopeEffect.audience, depth: governedScopeEffect.depth, scope: null},
  }] : [];
  const answers = [
    ...governedAnswers,
    ...classifierAnswers.filter((answer) => !governedAnswers.some((governed) => governed.questionId === answer.questionId)),
    ...answersQuotedInText(input.message, input.openQuestions, governedScopeEffect).filter((quoted) => !governedAnswers.some((governed) => governed.questionId === quoted.questionId) && !classifierAnswers.some((answer) => answer.questionId === quoted.questionId)),
  ];
  const mergedAnswers = [...input.priorAnswers.filter((existing) => !answers.some((answer) => answer.questionId === existing.questionId)), ...answers.map((answer) => ({questionId: answer.questionId, answer: answer.answer}))];
  const answerText = answers.map((answer) => `${answer.questionId}: ${answer.answer}`).join("; ");
  const answersApplied = answers.length ? t(locale, `Respostas aplicadas (${answerText}). `, `Answers applied (${answerText}). `) : "";

  // A deliverable asked in words wins over the answer reading of the same turn: the person who
  // asks for three pitch pages also answers the format question, and the material plan carries it.
  if (materialExplicit) {
    const form = output.turn.material.form === "memo" ? "internal_briefing" : output.turn.material.form ?? output.turn.scopeChanges.form ?? "pitch_pages";
    const pages = output.turn.material.pages ?? pagesInText(input.message);
    const request: PreviewRequest = {turn: priorUserTurns.length + 1, composition: "prepare_material", audience: {primary: audience, others: []}, form: form === "memo" ? "internal_briefing" : form, pages, sponsorInstruction: answers.length ? `${sponsorInstruction}\n${answerText}`.slice(0, 4_000) : sponsorInstruction, undefinedAspects: pages === null ? ["depth"] : []};
    return {
      kind: "activate", composition: "prepare_material",
      reply: `${headline(input, "prepare_material", corpusRecord(corpus), audience, depth)}\n${answersApplied}${t(locale,
        `Vou planejar o material a partir dos objetos assinados: forma ${form}, ${pages ? `${pages} páginas` : "número de páginas a confirmar"}, audiência ${audience}. Números e premissas entram por referência.`,
        `I will plan the material from the signed objects: form ${form}, ${pages ? `${pages} pages` : "page count to confirm"}, audience ${audience}. Numbers and premises enter by reference.`)}`,
      activation: buildPreviewActivation("prepare_material", request, {}, turnInput, answers.length ? {answers: mergedAnswers} : {}),
      record: base("prepare_material", corpus, false, null),
    };
  }

  // Answers change scope, audience, depth or form: the plan recompiles and unchanged objects replay.
  if (answers.length > 0 && hasAnalysis) {
    const prior = input.priorRequest ?? {};
    const answeredAspects = new Set<string>();
    let nextAudience = audience;
    let nextDepth = depth;
    let nextForm: PreviewRequest["form"] = (prior.form as PreviewRequest["form"] | undefined) ?? "first_deliverable";
    for (const answer of answers) {
      if (answer.effect.audience) { nextAudience = normalizeAudience(answer.effect.audience) ?? nextAudience; answeredAspects.add("audience"); }
      if (answer.effect.depth) { nextDepth = answer.effect.depth; answeredAspects.add("depth"); }
      if (answer.effect.scope) { answeredAspects.add("thesis"); }
    }
    if (output.turn.scopeChanges.form) { nextForm = output.turn.scopeChanges.form === "memo" ? "internal_briefing" : output.turn.scopeChanges.form; answeredAspects.add("format"); }
    const undefinedAspects = ((prior.undefinedAspects as PreviewRequest["undefinedAspects"] | undefined) ?? []).filter((aspect) => !answeredAspects.has(aspect));
    const request: PreviewRequest = {turn: priorUserTurns.length + 1, composition: "deepen", audience: {primary: nextAudience, others: []}, form: nextForm, pages: (prior.pages as number | null | undefined) ?? null, sponsorInstruction: `${sponsorInstruction}\n${answerText}`.slice(0, 4_000), undefinedAspects};
    const premisesAnswered = turnPremises;
    const composition: Composition = Object.keys(premisesAnswered).length > 0 ? "change_premise" : "deepen";
    if (composition === "change_premise") request.composition = "change_premise";
    return {
      kind: "activate", composition,
      reply: `${headline(input, composition, corpusRecord(corpus), nextAudience, nextDepth)}\n${t(locale,
        `Respostas aplicadas (${answerText}). Escopo atualizado: audiência ${nextAudience}, profundidade ${nextDepth}, forma ${nextForm}${undefinedAspects.length ? `; ainda em aberto: ${undefinedAspects.join(", ")}` : ""}. O plano recompila; o que não muda replica por fingerprint.`,
        `Answers applied (${answerText}). Scope updated: audience ${nextAudience}, depth ${nextDepth}, form ${nextForm}${undefinedAspects.length ? `; still open: ${undefinedAspects.join(", ")}` : ""}. The plan recompiles; what does not change replays by fingerprint.`)}`,
      activation: buildPreviewActivation(composition, request, premisesAnswered, turnInput, {answers: mergedAnswers}),
      record: {...base(composition, corpus, false, null), audience: nextAudience, depth: nextDepth},
    };
  }

  const premises = turnPremises;
  const premiseKeys = Object.keys(premises);
  if (premiseKeys.length > 0 && hasAnalysis) {
    const request: PreviewRequest = {turn: priorUserTurns.length + 1, composition: "change_premise", audience: {primary: audience, others: []}, form: "first_deliverable", pages: null, sponsorInstruction, undefinedAspects: []};
    return {
      kind: "activate", composition: "change_premise",
      reply: `${headline(input, "change_premise", corpusRecord(corpus), audience, depth)}\n${t(locale,
        `Premissa registrada (${describePremises(premises)}). Só os nós cujas entradas mudam recalculam; o resto replica por fingerprint.`,
        `Premise recorded (${describePremises(premises)}). Only the nodes whose inputs change recompute; the rest replays by fingerprint.`)}`,
      activation: buildPreviewActivation("change_premise", request, premises, turnInput),
      record: base("change_premise", corpus, false, null),
    };
  }

  const composition = scope.composition ?? (hasAnalysis ? null : "prepare_meeting");
  if (!composition) {
    return {
      kind: "converse", composition: null, activation: null,
      reply: `${headline(input, null, corpusRecord(corpus), audience, depth)}\n${t(locale,
        "A análise já está no projeto. Posso preparar o material, alterar uma premissa, aprofundar ou explicar de onde saiu um número.",
        "The analysis is already in the project. I can prepare the material, change a premise, deepen, or explain where a number came from.")}`,
      record: base(null, corpus, false, null),
    };
  }
  const form: PreviewRequest["form"] = composition === "prepare_decision" ? "board_deck" : output.turn.scopeChanges.form === "memo" ? "internal_briefing" : output.turn.scopeChanges.form ?? "first_deliverable";
  const undefinedAspects: PreviewRequest["undefinedAspects"] = [
    ...(output.composition === null ? ["thesis" as const] : []),
    ...(output.turn.scopeChanges.form === null && composition !== "prepare_decision" ? ["format" as const] : []),
    ...(core.depth.state === "unknown" || core.depth.state === "ambiguous" ? ["depth" as const] : []),
  ];
  const request: PreviewRequest = {turn: priorUserTurns.length + 1, composition, audience: {primary: audience, others: []}, form, pages: null, sponsorInstruction, undefinedAspects};
  const question = output.firstQuestion ? ` ${t(locale, "Uma pergunta muda o plano:", "One question changes the plan:")} ${output.firstQuestion}` : "";
  return {
    kind: "activate", composition,
    reply: `${headline(input, composition, corpusRecord(corpus), audience, depth)}\n${t(locale,
      `Entendi: ${understanding.envelope.routingCore.desiredOutcome.value}. Companhia: ${corpus.company.legalName} (base congelada do Caso 01, ${corpus.basis}, versão ${corpus.version}). Composição: ${compositionLabels[composition].pt}; audiência ${audience}; profundidade ${depth}.${question} Começo agora sobre a base congelada: dívida instrumento a instrumento, conciliação, covenants, vencimentos, juros, custo de saída, cenários, comparação antes e depois e a devolutiva.`,
      `Understood: ${understanding.envelope.routingCore.desiredOutcome.value}. Company: ${corpus.company.legalName} (frozen Case 01 base, ${corpus.basis}, version ${corpus.version}). Composition: ${compositionLabels[composition].en}; audience ${audience}; depth ${depth}.${question} I start now on the frozen base: debt instrument by instrument, reconciliation, covenants, maturities, interest, exit cost, scenarios, the before-and-after comparison and the readout.`)}`,
    activation: buildPreviewActivation(composition, request, {}, turnInput),
    record: base(composition, corpus, false, null),
  };
}

export type UnknownCompanyResearch = {
  status: "succeeded" | "partial" | "abstained" | "unavailable";
  company: string;
  queries: number;
  sources: Array<{title: string; url: string; provider: string}>;
  cacheHits: number;
  providerCalls: number;
  maxCostExposureUsd: number;
  reason: string | null;
  latencyMs: number;
};

/**
 * A company without a frozen corpus gets a bounded public research instead of another company's
 * objects: the deterministic origination plan, at most three queries, three sources each, through
 * the providers the worker holds. No model call. Without a provider the result says so.
 */
export async function researchUnknownCompany(input: {providers: PublicSearchProvider[]; company: string; maxQueries?: number; maxSourcesPerQuery?: number; now?: () => Date}): Promise<UnknownCompanyResearch> {
  const startedAt = Date.now();
  const company = input.company.trim().slice(0, 200);
  if (input.providers.length === 0) return {status: "unavailable", company, queries: 0, sources: [], cacheHits: 0, providerCalls: 0, maxCostExposureUsd: 0, reason: "no public research provider configured", latencyMs: 0};
  try {
    const plan = buildOriginationResearchPlan({legalName: company}).slice(0, input.maxQueries ?? 3);
    const run: ResearchRun = await runPublicResearch({plan, providers: input.providers, maxSourcesPerQuery: input.maxSourcesPerQuery ?? 3, ...(input.now ? {now: input.now} : {})});
    const seen = new Set<string>();
    const sources = run.sources.filter((source) => (seen.has(source.url) ? false : (seen.add(source.url), true))).slice(0, 9).map((source) => ({title: source.title, url: source.url, provider: source.provider}));
    return {
      status: run.status, company, queries: run.metrics.queryCount, sources,
      cacheHits: run.metrics.cacheHits, providerCalls: run.metrics.providerCalls,
      maxCostExposureUsd: Object.values(run.metrics.maxCostExposureUsdByProvider).reduce((total, value) => total + value, 0),
      reason: run.failures.length ? run.failures.map((failure) => `${failure.provider}:${failure.code}`).slice(0, 4).join(", ") : null,
      latencyMs: Date.now() - startedAt,
    };
  } catch (error) {
    return {status: "unavailable", company, queries: 0, sources: [], cacheHits: 0, providerCalls: 0, maxCostExposureUsd: 0, reason: `public research failed: ${error instanceof Error ? error.message.slice(0, 160) : "unknown"}`, latencyMs: Date.now() - startedAt};
  }
}

/** The line the reply carries about the research: what was found, at what exposure, and what is still needed. */
export function researchReplyLine(locale: "pt-BR" | "en-US", research: UnknownCompanyResearch): string {
  const host = (url: string) => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; } };
  if (research.status === "unavailable") {
    return t(locale, `Pesquisa pública indisponível para ${research.company} (${research.reason ?? "sem provedor"}).`, `Public research unavailable for ${research.company} (${research.reason ?? "no provider"}).`);
  }
  const listed = research.sources.slice(0, 5).map((source) => `${source.title} (${host(source.url)})`).join("; ");
  return t(locale,
    `Pesquisa pública feita para ${research.company}: ${research.queries} consultas, ${research.sources.length} fontes${research.cacheHits ? `, ${research.cacheHits} do cache` : ""}, exposição máxima US$ ${research.maxCostExposureUsd.toFixed(3)}${listed ? `: ${listed}` : ""}. Com isso monto um entendimento preliminar; a análise de crédito exige os documentos da companhia (ITR, escrituras, relatórios do agente fiduciário) ou uma base congelada.`,
    `Public research done for ${research.company}: ${research.queries} queries, ${research.sources.length} sources${research.cacheHits ? `, ${research.cacheHits} from cache` : ""}, maximum exposure US$ ${research.maxCostExposureUsd.toFixed(3)}${listed ? `: ${listed}` : ""}. That supports a preliminary understanding; the credit analysis needs the company's documents (quarterly statements, indentures, trustee reports) or a frozen base.`);
}
