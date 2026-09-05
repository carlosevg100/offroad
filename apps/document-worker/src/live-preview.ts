/**
 * live_intelligence_preview: the semantic router decides a preview turn.
 *
 * One model call reads the turn into an Intent Envelope (the shadow classifier's contract) plus
 * what the preview desk needs to act: companies named, premise changes, a question about a
 * number, a request for material, answers to open questions. Everything after the call is
 * deterministic: the company resolves to a frozen corpus or to nothing, the composition is
 * derived from the envelope, the plan is compiled by the same compiler the skeleton uses, and the
 * reply states what was understood, at what cost, and where the router abstained. A company
 * without a frozen corpus never receives another company's objects.
 */
import type {IntentEnvelope} from "@offroad/agent-contracts";
import {intentDepthSchema} from "@offroad/agent-contracts";
import {preview} from "@offroad/credit-playbook";

const {describePremises} = preview;
import type {ModelGateway} from "@offroad/model-gateway";
import {z} from "zod";

import {
  SHADOW_ROUTING_SYSTEM,
  shadowRoutingOutputSchema,
  stampIntentEnvelope,
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

export const LIVE_MARK = "[Validação interna, live_intelligence_preview]";
export const LIVE_MARK_EN = "[Internal validation, live_intelligence_preview]";

/** The CDI reference the premises are quoted against when the person says "CDI + x". */
const CDI_REFERENCE = 0.1325;

const previewObjectKinds = ["debt_ledger", "financial_statements", "covenants", "maturity_wall", "interest_schedule", "exit_cost", "scenarios", "alternatives", "meeting_brief"] as const;
const materialForms = ["pitch_pages", "internal_briefing", "analysis_with_scenarios", "board_deck", "memo"] as const;

export const previewTurnSchema = z.object({
  companies: z.array(z.object({
    mention: z.string().min(1).max(120),
    role: z.enum(["subject", "counterparty", "comparable", "other"]),
  })).max(8),
  premiseChanges: z.object({
    newDebtAnnualRate: z.number().min(0).max(1).nullable(),
    cdiSpreadBps: z.number().min(-2_000).max(5_000).nullable(),
    newDebtTermMonths: z.number().int().positive().max(600).nullable(),
    newDebtGraceMonths: z.number().int().nonnegative().max(240).nullable(),
  }),
  numberQuestion: z.object({
    mentioned: z.string().max(80).nullable(),
    objects: z.array(z.enum(previewObjectKinds)).max(9),
  }).nullable(),
  material: z.object({
    requested: z.boolean(),
    form: z.enum(materialForms).nullable(),
    pages: z.number().int().positive().max(60).nullable(),
  }),
  answers: z.array(z.object({
    questionId: z.string().min(1).max(60),
    answer: z.string().min(1).max(400),
    effect: z.object({
      audience: z.string().max(80).nullable(),
      depth: intentDepthSchema.nullable(),
      scope: z.string().max(200).nullable(),
    }),
  })).max(6),
  scopeChanges: z.object({
    audience: z.string().max(80).nullable(),
    depth: intentDepthSchema.nullable(),
    form: z.enum(materialForms).nullable(),
  }),
});
export type PreviewTurn = z.infer<typeof previewTurnSchema>;

export const liveRoutingOutputSchema = shadowRoutingOutputSchema.extend({turn: previewTurnSchema});
export type LiveRoutingOutput = z.infer<typeof liveRoutingOutputSchema>;

export const LIVE_ROUTING_SYSTEM = `${SHADOW_ROUTING_SYSTEM}

You are also the reader of an internal validation desk that analyses one company at a time from a
frozen evidence base. Besides the envelope, fill "turn":
- companies: every company the person names or clearly refers to, the mention as written, with its
  role (subject of the work, counterparty, comparable, other). Never invent one.
- premiseChanges: only numbers the person states for the new debt: annual rate as a decimal (15.5%
  is 0.155), or a spread over CDI in basis points (CDI + 1.5% is 150), term in months, grace in
  months. Leave the rest null.
- numberQuestion: when the person asks where a number came from, the number as written and which
  objects could hold it. Otherwise null.
- material: whether the person asks for a deliverable, its form and page count when stated.
- answers: when the person answers one of the openQuestions listed in the input, the question id,
  the answer as stated and its effect on audience, depth or scope.
- scopeChanges: audience, depth or form the person changes in this turn; null otherwise.`;

export type LiveUnderstanding = {
  envelope: IntentEnvelope;
  output: LiveRoutingOutput;
  model: string;
  costUsd: number;
  latencyMs: number;
};

export type LiveTurnContext = ShadowRoutingContext & {
  /** Questions the desk left open in earlier turns, so an answer can be recognised. */
  openQuestions: Array<{id: string; text: string}>;
  /** Which signed objects already exist in the project (task ids), so a question can be answered from them. */
  priorObjectKinds: string[];
};

/** One model call: the turn read into an envelope and the preview-desk fields. Throws on model or schema failure. */
export async function understandLiveTurn(input: {gateway: ModelGateway; context: LiveTurnContext; now?: () => Date}): Promise<LiveUnderstanding> {
  const {context} = input;
  const spentBefore = input.gateway.spent().costUsd;
  const startedAt = Date.now();
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
      }),
    }],
    schema: liveRoutingOutputSchema,
    schemaName: "live_preview_routing_output",
    thinking: "off",
    metadata: {surface: "live_preview_router"},
  });
  const output = completion.output;
  return {
    envelope: stampIntentEnvelope(output, context, input.now),
    output,
    model: completion.model,
    costUsd: Math.max(0, input.gateway.spent().costUsd - spentBefore),
    latencyMs: Date.now() - startedAt,
  };
}

export type LiveDecisionInput = {
  locale: "pt-BR" | "en-US";
  message: string;
  recentMessages: Array<{role: "user" | "assistant"; content: string}>;
  understanding: LiveUnderstanding;
  /** The corpus an earlier turn of this project already resolved, if any. */
  priorCaseId: string | null;
  artifactTypes: string[];
  runActive: boolean;
  priorOutputs: Map<string, PreviewStepOutput>;
  entryJob: string;
  messageId: string;
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
    model: string;
    costUsd: number;
    latencyMs: number;
    calls: number;
  };
};

type Composition = PreviewComposition;

const t = (locale: "pt-BR" | "en-US", pt: string, en: string) => (locale === "en-US" ? en : pt);

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
    `${t(input.locale, "modelo", "model")}=${understanding.model}`,
    `${t(input.locale, "chamadas", "calls")}=1`,
    `${t(input.locale, "custo", "cost")}=US$ ${understanding.costUsd.toFixed(4)}`,
  ];
  return `${mark} ${fields.join(" · ")}`;
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
  const mentions = [
    ...output.turn.companies.map((company) => company.mention),
    ...core.object.value.filter((object) => object.kind === "company" && object.reference).map((object) => object.reference as string),
  ];
  const resolution = preview.resolvePreviewCorpus(mentions);
  const priorCorpus = input.priorCaseId ? preview.corpusByCaseId(input.priorCaseId) : null;
  const corpusRecord = (corpus: preview.PreviewCorpus | null) => corpus ? {caseId: corpus.caseId, sourcePackId: corpus.sourcePackId, company: corpus.company.legalName} : null;
  const audience = normalizeAudience(output.turn.scopeChanges.audience) ?? normalizeAudience(core.audience.value[0]) ?? "vp";
  const depth = output.turn.scopeChanges.depth ?? core.depth.value;
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
    model: understanding.model,
    costUsd: understanding.costUsd,
    latencyMs: understanding.latencyMs,
    calls: 1,
  });

  if (input.runActive) {
    return {
      kind: "wait", composition: null, activation: null,
      reply: `${headline(input, null, corpusRecord(priorCorpus), audience, depth)}\n${t(locale, "A corrida anterior ainda está em andamento; incorporo este pedido assim que ela terminar.", "The previous run is still in progress; I will take this request in as soon as it finishes.")}`,
      record: base(null, priorCorpus, false, null),
    };
  }

  // The classifier abstains: the desk asks instead of guessing.
  if (output.abstain) {
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

  const scope = compositionFromEnvelope(output, hasAnalysis);
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
    ...(input.registryVersion ? {registryVersion: input.registryVersion} : {}),
  };

  // A question about a number is answered from the signed objects, never by the model.
  if (output.turn.numberQuestion && hasAnalysis) {
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

  const premises = premisesFromTurn(output.turn);
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

  if (output.turn.material.requested && hasAnalysis) {
    const form = output.turn.material.form === "memo" ? "internal_briefing" : output.turn.material.form ?? output.turn.scopeChanges.form ?? "pitch_pages";
    const pages = output.turn.material.pages;
    const request: PreviewRequest = {turn: priorUserTurns.length + 1, composition: "prepare_material", audience: {primary: audience, others: []}, form: form === "memo" ? "internal_briefing" : form, pages, sponsorInstruction, undefinedAspects: pages === null ? ["depth"] : []};
    return {
      kind: "activate", composition: "prepare_material",
      reply: `${headline(input, "prepare_material", corpusRecord(corpus), audience, depth)}\n${t(locale,
        `Vou planejar o material a partir dos objetos assinados: forma ${form}, ${pages ? `${pages} páginas` : "número de páginas a confirmar"}, audiência ${audience}. Números e premissas entram por referência.`,
        `I will plan the material from the signed objects: form ${form}, ${pages ? `${pages} pages` : "page count to confirm"}, audience ${audience}. Numbers and premises enter by reference.`)}`,
      activation: buildPreviewActivation("prepare_material", request, {}, turnInput),
      record: base("prepare_material", corpus, false, null),
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
    ...(core.desiredOutcome.state === "unknown" || core.desiredOutcome.state === "ambiguous" ? ["thesis" as const] : []),
    ...(output.turn.scopeChanges.form === null && composition !== "prepare_decision" ? ["format" as const] : []),
    ...(core.depth.state === "unknown" || core.depth.state === "ambiguous" ? ["depth" as const] : []),
  ];
  const request: PreviewRequest = {turn: priorUserTurns.length + 1, composition, audience: {primary: audience, others: []}, form, pages: null, sponsorInstruction, undefinedAspects};
  const question = output.firstQuestion ? ` ${t(locale, "Uma pergunta muda o plano:", "One question changes the plan:")} ${output.firstQuestion}` : "";
  return {
    kind: "activate", composition,
    reply: `${headline(input, composition, corpusRecord(corpus), audience, depth)}\n${t(locale,
      `Entendi: ${core.desiredOutcome.value}. Companhia: ${corpus.company.legalName} (base congelada do Caso 01, ${corpus.basis}, versão ${corpus.version}). Composição: ${compositionLabels[composition].pt}; audiência ${audience}; profundidade ${depth}.${question} Começo agora sobre a base congelada: dívida instrumento a instrumento, conciliação, covenants, vencimentos, juros, custo de saída, cenários, comparação antes e depois e a devolutiva.`,
      `Understood: ${core.desiredOutcome.value}. Company: ${corpus.company.legalName} (frozen Case 01 base, ${corpus.basis}, version ${corpus.version}). Composition: ${compositionLabels[composition].en}; audience ${audience}; depth ${depth}.${question} I start now on the frozen base: debt instrument by instrument, reconciliation, covenants, maturities, interest, exit cost, scenarios, the before-and-after comparison and the readout.`)}`,
    activation: buildPreviewActivation(composition, request, {}, turnInput),
    record: base(composition, corpus, false, null),
  };
}
