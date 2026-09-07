import {z} from "zod";

import {
  intentContinuitySchema,
  canonicalIntentActionSchema,
  intentAudienceTypeSchema,
  intentDecisionTypeSchema,
  intentDepthSchema,
  intentObjectKindSchema,
  intentObjectSlotKeySchema,
  compositionPolicy,
  intentCompositionPolicyPrompt,
  namedCompositionSchema,
  primaryWorkSchema,
  resolveCompositionPrimaryWorks,
  workResponsibilitySchema,
  type NamedComposition,
} from "./intent-envelope";

export const intentClassifierInputSchema = z.object({
  locale: z.enum(["pt-BR", "en-US"]),
  latestUserMessage: z.string().min(1),
  recentConversation: z.array(z.object({role: z.string().min(1), content: z.string()})).max(8),
  entryJob: z.string().nullable(),
  documentCount: z.number().int().nonnegative(),
  professionalContext: z.object({
    useForms: z.array(z.string()),
    professionalRoles: z.array(z.string()),
    practiceAreas: z.array(z.string()),
    primaryObjectives: z.array(z.string()),
  }).nullable(),
});
export type IntentClassifierInput = z.infer<typeof intentClassifierInputSchema>;

/** Parse once before JSON serialization so runtime and evals send the same bounded shape. */
export function buildIntentClassifierInput(input: IntentClassifierInput): IntentClassifierInput {
  return intentClassifierInputSchema.parse(input);
}

/**
 * The exact model-written portion of an Intent Envelope. It lives beside the envelope contract
 * so the worker and the gold gate cannot silently test different prompts or schemas.
 *
 * This schema is intentionally more permissive than the persisted envelope: prompted JSON is
 * not grammar-bound. The worker clamps strings and lists and stamps authority, evidence and
 * tenant fields from the control plane before persistence.
 */
const inferredClassifierField = <T extends z.ZodTypeAny>(value: T) => z.object({
  value,
  state: z.enum(["explicit", "inferred", "ambiguous", "unknown", "not_applicable"]),
  confidence: z.number().min(0).max(1).nullish(),
  basis: z.string().max(200).nullish(),
});

const classifierObjectSlotsSchema = z.array(z.object({
  key: intentObjectSlotKeySchema,
  value: z.string().min(1).max(200),
})).max(12).superRefine((slots, ctx) => {
  const keys = new Set<string>();
  for (const [index, slot] of slots.entries()) {
    if (keys.has(slot.key)) ctx.addIssue({code: z.ZodIssueCode.custom, path: [index, "key"], message: "slot keys are unique within an object"});
    keys.add(slot.key);
  }
});

const classifierObjectInstancesSchema = z.array(z.object({
  id: z.string().regex(/^object-[1-9]\d*$/),
  ordinal: z.number().int().min(1).max(24),
  kind: intentObjectKindSchema,
  slots: classifierObjectSlotsSchema,
}).strict()).max(24).superRefine((objects, ctx) => {
  const ids = new Set<string>();
  const ordinals = new Set<number>();
  for (const [index, object] of objects.entries()) {
    if (ids.has(object.id)) ctx.addIssue({code: z.ZodIssueCode.custom, path: [index, "id"], message: "object ids are unique"});
    if (ordinals.has(object.ordinal)) ctx.addIssue({code: z.ZodIssueCode.custom, path: [index, "ordinal"], message: "object ordinals are unique"});
    if (object.id !== `object-${object.ordinal}`) {
      ctx.addIssue({code: z.ZodIssueCode.custom, path: [index, "id"], message: "object id matches its ordinal"});
    }
    ids.add(object.id);
    ordinals.add(object.ordinal);
  }
  const ordered = [...ordinals].sort((left, right) => left - right);
  if (ordered.some((ordinal, index) => ordinal !== index + 1)) {
    ctx.addIssue({code: z.ZodIssueCode.custom, message: "object ordinals are contiguous from one"});
  }
});

export const intentClassifierOutputSchema = z.object({
  routingCore: z.object({
    // Empty lists are representable at the model boundary so an honest abstention is valid JSON.
    // `canonicalizeIntentClassifierOutput` then supplies a fail-closed envelope shape; the
    // persisted contract remains strict and never accepts an empty routing core.
    action: inferredClassifierField(z.array(canonicalIntentActionSchema).max(1)),
    object: inferredClassifierField(classifierObjectInstancesSchema),
    decisionType: inferredClassifierField(intentDecisionTypeSchema),
    audienceType: inferredClassifierField(intentAudienceTypeSchema),
    depth: inferredClassifierField(intentDepthSchema),
    continuity: inferredClassifierField(intentContinuitySchema),
    workResponsibility: inferredClassifierField(z.array(workResponsibilitySchema).max(8)),
  }).strict(),
  inferableContext: z.object({
    jurisdiction: inferredClassifierField(z.array(z.string().min(1).max(40)).max(8)),
    asOfDate: inferredClassifierField(z.string().max(40).nullable()),
    currency: inferredClassifierField(z.string().max(12).nullable()),
    deadline: inferredClassifierField(z.string().max(300).nullable()),
    sponsorInstruction: inferredClassifierField(z.string().max(2_000).nullable()),
    constraints: inferredClassifierField(z.array(z.string().max(600)).max(40)),
    urgency: inferredClassifierField(z.enum(["now", "today", "this_week", "ongoing"]).nullable()),
    availableInputs: inferredClassifierField(z.array(z.string().max(400)).max(80)),
  }),
  primaryWorks: z.array(z.object({work: primaryWorkSchema, confidence: z.number().min(0).max(1)})).max(6),
  composition: namedCompositionSchema.nullable(),
  /** The one question the classifier would ask first, if it were allowed to ask. */
  firstQuestion: z.string().max(600).nullable(),
  abstain: z.boolean(),
  abstainReason: z.string().max(600).nullable(),
}).strict();
export type IntentClassifierOutput = z.infer<typeof intentClassifierOutputSchema>;

const abstentionQuestion = (locale: IntentClassifierInput["locale"]): string => locale === "pt-BR"
  ? "Qual material, documento ou assunto você quer que eu examine, e qual resultado você espera?"
  : "Which material, document or subject should I examine, and what result do you expect?";

const normalizeForPolicy = (value: string): string => value
  .normalize("NFKD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLocaleLowerCase("pt-BR")
  // Expand common English negative contractions before cue polarity is evaluated. Curly
  // apostrophes survive NFKD, so both forms are intentional.
  .replace(/\b(?:don['’]t|doesn['’]t|didn['’]t|won['’]t|wouldn['’]t|shouldn['’]t|can['’]t|cannot|couldn['’]t|isn['’]t|aren['’]t|wasn['’]t|weren['’]t|haven['’]t|hasn['’]t|hadn['’]t)\b/g, " not ");

/** A deterministic override is allowed only for an affirmative cue in its own clause. */
function hasAffirmedCue(text: string, cue: RegExp): boolean {
  const flags = cue.flags.includes("g") ? cue.flags : `${cue.flags}g`;
  for (const match of text.matchAll(new RegExp(cue.source, flags))) {
    const before = text.slice(Math.max(0, (match.index ?? 0) - 100), match.index ?? 0);
    const after = text.slice((match.index ?? 0) + match[0].length, (match.index ?? 0) + match[0].length + 100);
    const clause = before.split(/[.;!?\x0a]|\b(?:mas|porem|contudo|apenas|somente|but|however|only)\b/).at(-1) ?? "";
    const rejectedAfterQuestion = /^[^.;!\x0a]{0,80}\?\s*(?:nao|not|no)\b/.test(after);
    if (!/\b(nao|not|sem|without|nunca|jamais|never|evite|evitar|avoid)\b/.test(clause) && !rejectedAfterQuestion) return true;
  }
  return false;
}

/** External side effects require a direct user command, never mere lexical co-occurrence. */
function hasExplicitExternalOutreach(text: string): boolean {
  const courtesy = /^(?:(?:ja|agora|por favor|please)\s+)*/;
  const imperative = /(?:envie|manda|mande|compartilhe|conecte|introduza|apresente|send|share|connect|introduce|faca a introducao|make the introduction)\b/;
  const modalCommand = /(?:(?:pode|podem|can you|quero que|vamos)\s+)(?:envie|enviar|manda|mande|mandar|compartilhe|compartilhar|conecte|conectar|introduza|introduzir|apresente|apresentar|send|share|connect|introduce|faca a introducao|make the introduction)\b/;
  const directCommand = new RegExp(`${courtesy.source}(?:${imperative.source}|${modalCommand.source})`);
  const rejected = /\b(?:nao|not|sem|without|nunca|jamais|never|evite|evitar|avoid|proibid[oa]|forbidden|not allowed|fora de questao|nem pensar|de jeito nenhum|absolutely not|definitely not)\b/;
  return directCommand.test(text)
    && /\b(fundos?|investidores?|financiadores?|bancos?|lenders?|investors?|providers?)\b/.test(text)
    && !rejected.test(text);
}

/** Classify one affirmative, user-authored clause. Cross-clause noun/verb joins are forbidden. */
function explicitCompositionForClause(input: IntentClassifierInput, text: string): NamedComposition | null {
  const hasPrior = input.recentConversation.length > 0;
  const material = /\b(material|deck|pitch|memo|one[- ]?pager|apresentacao|presentation|paginas?|pages?|planilha|spreadsheet)\b/.test(text);
  const meeting = /\b(reuniao|meeting|conversa|conversation)\b/.test(text);
  const materialTransition = hasPrior && /\b(gostei|selecion\w*|escolh\w*|vamos preparar|prepare the material|liked|selected|chosen)\b/.test(text);
  const specifiedMaterial = /\b(\d+|tres|three)\s*(paginas?|pages?)\b/.test(text)
    || /\b(deck|memo|one[- ]?pager|planilha|spreadsheet)\b/.test(text);
  const materialCreation = hasAffirmedCue(text, /\b(produz\w*|prepar\w*|cri\w*|monte|montar|gere|gerar|build|create|produce|prepare|draft|generate)\b/);

  const negatedMaterial = /\b(sem|nao|not|without)\s+(?:produz\w*|faz\w*|cri\w*|prepar\w*|create)?\s*(?:o\s+|um\s+)?(?:material|deck|pitch|memo|arquivo|file)\b/.test(text)
    || /\b(?:material|deck|pitch|memo|arquivo|file)\b[^.;!\x0a]{0,60}\?\s*(?:nao|not|no)\b/.test(text);
  const externalOutreach = hasExplicitExternalOutreach(text);

  if (hasAffirmedCue(text, /\b(ajust\w*|alter\w*|atualiz\w*|recalcul\w*|change|update|recalculate)\b/)
    && /\b(cenario|scenario|premissa|assumption|cdi|taxa|rate|prazo|term|spread|modelo|model)\b/.test(text)) return "build_or_review_model";
  if (hasAffirmedCue(text, /\b(de onde saiu|qual a origem|como chegou|where did|how did)\b/)
    || (hasAffirmedCue(text, /\b(por que|why)\b/) && /\b(alavancagem|leverage|numero|number|indicador|metric)\b/.test(text))) return "answer_a_question";
  if (hasAffirmedCue(text, /\b(diferenca|difference|como funciona|how does|explique|explain|o que e|what is)\b/)
    && /\b(debenture|fidc|ccb|bond|loan|instrumento|instrument)\b/.test(text)) return "answer_a_question";
  if (hasAffirmedCue(text, /\b(construa|construir|monte|montar|revise|revisar|build|review|audit)\b/)
    && /\b(modelo|model|forecast|projecao|projection)\b/.test(text)) return "build_or_review_model";
  if (/\b(covenant|headroom)\b/.test(text) && hasAffirmedCue(text, /\b(aguenta|suporta|holds?|cobertura|coverage)\b/)) return "analyze_performance_and_credit";
  if (/\b(covenant|headroom|folga)\b/.test(text) && hasAffirmedCue(text, /\b(teste|testar|analise|analisar|teste?\b|holds?)\b/)
    && !/\b(clausula|clause|formula|waterfall)\b/.test(text)) return "analyze_performance_and_credit";
  if (hasAffirmedCue(text, /\b(leia|ler|analise|analisar|teste|testar|read|analy[sz]e|test)\b/)
    && /\b(contrato|contract|clausula|clause|covenant|waterfall|escritura|indenture)\b/.test(text)) return "read_contract_covenant_waterfall";
  if (hasAffirmedCue(text, /\b(so organiza|apenas organiza|organize only|no analysis|sem analise)\b/)) return "find_and_organize_information";
  if (hasAffirmedCue(text, /\b(extraia|extrair|concilie|conciliar|reconcilie|reconciliar|extract|reconcile|spreading)\b/)) return "extract_and_reconcile_data";
  if (hasAffirmedCue(text, /\b(o que falta|onde paramos|organize o projeto|incorpore os comentarios|what is missing|where did we stop|organize the project|incorporate the comments)\b/)) return "manage_work";
  if (externalOutreach) return "introduce";
  if (hasAffirmedCue(text, /\b(quem financiaria|quais fundos|matching|capital aderente|who would finance|which funds|find capital)\b/)
    || hasAffirmedCue(text, /\bidentifi\w*\b[^.;!\x0a]{0,60}\b(investidores?|fundos?|financiadores?|investors?|funds?|lenders?|providers?)\b/)) return "identify_capital";
  if (hasAffirmedCue(text, /\b(monitor\w*|acompanh\w*|avise quando|todo trimestre|track|alert me|quarterly)\b/)) return "monitor";
  if (hasAffirmedCue(text, /\b(mapeie|mapear|levante|pesquise|map|research|como esta|how is)\b[^.;!\x0a]{0,60}\b(mercado|emissoes|comparaveis|precedentes|pricing|spread|market|issuances|comparables|precedents)\b/)
    || hasAffirmedCue(text, /\b(comparaveis|precedentes|condicoes de mercado|pricing|comparables|precedents|market conditions)\b/)) return "map_market_and_precedents";
  if (/\b(conselh\w*|board|comite\w*|committee)\b/.test(text)
    && hasAffirmedCue(text, /\b(decis\w*|discut\w*|avali\w*|alternativ\w*|recomend\w*|prepar\w*|decision)\b/)) return "prepare_decision";
  if (hasAffirmedCue(text, /\b(revise|revisar|review|critique|criticar|cetico|skeptical|controle de qualidade|quality control)\b/)) return "review_work";
  if (material && !negatedMaterial && ((specifiedMaterial && materialCreation) || materialTransition)) return "prepare_material";
  if (material && meeting) return "prepare_meeting";
  if (hasAffirmedCue(text, /\b(recebi|recebemos|received)\b/) && /\b(proposta|deal|oportunidade|opportunity|term sheet)\b/.test(text)) return "evaluate_received_opportunity";
  if (hasAffirmedCue(text, /\b(estruture|estruturar|desenhe|desenhar|structure|design)\b/)
    && /\b(operacao|operation|recebiveis|receivables|divida|debt|term sheet)\b/.test(text)) return "design_indicative_structure";
  if (hasAffirmedCue(text, /\b(compare|comparar|avalie|avaliar|explore|explorar|compare|evaluate|explore)\b[^.;!\x0a]{0,60}\b(alternativas|opcoes|caminhos|alternatives|options|paths)\b/)) return "develop_alternatives";
  if (hasAffirmedCue(text, /\b(diagnostique|diagnosticar|diagnose)\b/)
    || hasAffirmedCue(text, /\b(vencimentos|maturity|liquidez|liquidity|estrutura de capital|capital structure|refinanc|repricing)\b/)) return "diagnose_capital_structure";
  if (hasAffirmedCue(text, /\b(qualidade de credito|credit quality|risco de credito|credit risk|desempenho financeiro|financial performance)\b/)) return "analyze_performance_and_credit";
  if (hasAffirmedCue(text, /\b(entender|entenda|compreender|understand|explique|explain)\b/)) return "understand_company_sector_asset";
  if (hasAffirmedCue(text, /\b(levante|localize|ache|baixe|organize|atualize|find|locate|download|organize|update)\b/)) return "find_and_organize_information";
  return null;
}

/**
 * High-precision deterministic overrides are intentionally narrower than the model. We remove
 * quoted/reported source text, rejected rhetorical questions and negative clauses, then accept an
 * override only when every remaining actionable clause agrees. A conflicting or incomplete turn
 * stays with the semantic model instead of being guessed from isolated keywords.
 */
function explicitComposition(input: IntentClassifierInput): NamedComposition | null {
  const normalized = normalizeForPolicy(input.latestUserMessage)
    .replace(/"[^"]*"|'[^']*'|“[^”]*”|‘[^’]*’/g, " ")
    .replace(/\b(?:source text|source|texto fonte|noticia|documento|contrato)\b[^.;!\x0a]{0,80}\b(?:says?|said|diz|disse|contem a frase)\b[^.;!\x0a]*/g, " ")
    .replace(/(?:^|[.;!\x0a])\s*[^?]{0,180}\?\s*(?:nao|not|no|nem pensar|de jeito nenhum|absolutely not|definitely not)\b[^.;!\x0a]*/g, " ");
  const clauses = normalized
    .replace(/\b(apenas|somente|so|only|just)\b/g, ". $1")
    .split(/[.;!?\x0a]|\b(?:mas|porem|contudo|but|however)\b/)
    .map((clause) => clause.trim())
    .filter(Boolean)
    .filter((clause) => !/\b(nao|not|sem|without|nunca|jamais|never|evite|evitar|avoid)\b/.test(clause));
  const exclusive = clauses.filter((clause) => /^(?:apenas|somente|so|only|just)\b/.test(clause));
  const candidates = (exclusive.length > 0 ? exclusive : clauses)
    .map((clause) => explicitCompositionForClause(input, clause))
    .filter((composition): composition is NamedComposition => composition !== null);
  const unique = [...new Set(candidates)];
  return unique.length === 1 ? unique[0]! : null;
}

/** Requests that explicitly delegate the missing objective, fabricate evidence or route by title. */
function requiresObjectiveClarification(input: IntentClassifierInput): boolean {
  const text = normalizeForPolicy(input.latestUserMessage);
  const asksToFabricate = /\b(invente|inventar|fabrique|fabricar|invent|fabricate|make up)\b/.test(text)
    && /\b(companhia|empresa|company|documentos?|documents?|evidencias?|evidence)\b/.test(text);
  const asksToGuessObjective = /\b(conclua|descubra|adivinhe|infira|guess|infer|determine)\b/.test(text)
    && /\b(qual operacao|o que eu quero|meu objetivo|which operation|what i want|my objective)\b/.test(text);
  const routesByTitleOnly = /\b(normalmente|padrao|tipic[oa]|normally|standard|typical)\b/.test(text)
    && /\b(cargo|posicao|funcao|managing director|diretor|analista|banker|role|position|title)\b/.test(text)
    && !/\b(companhia|empresa|company|contrato|contract|modelo|model|operacao|operation|material|documento|document|mercado|market)\b/.test(text);
  return asksToFabricate || asksToGuessObjective || routesByTitleOnly;
}

const policyField = <T>(value: T, composition: NamedComposition) => ({
  value,
  state: "inferred" as const,
  confidence: 0.99,
  basis: `deterministic policy for ${composition}`,
});

function policyContinuity(
  composition: NamedComposition,
  output: IntentClassifierOutput,
  input: IntentClassifierInput,
): IntentClassifierOutput["routingCore"]["continuity"] {
  const text = normalizeForPolicy(input.latestUserMessage);
  if (composition === "monitor") return policyField("monitor" as const, composition);
  if (/\b(esquece|ignora|novo trabalho|forget|ignore|new task)\b/.test(text)) return policyField("new" as const, composition);
  if (composition === "build_or_review_model"
    && /\b(ajusta|altera|atualiza|recalcula|change|update|recalculate)\b/.test(text)) return policyField("refresh" as const, composition);
  if (input.recentConversation.length > 0 && [
    "answer_a_question", "review_work", "prepare_material", "prepare_decision", "introduce", "map_market_and_precedents",
  ].includes(composition)) return policyField("resume" as const, composition);
  return output.routingCore.continuity;
}

function policyQuestion(
  composition: NamedComposition,
  output: IntentClassifierOutput,
  input: IntentClassifierInput,
): string | null {
  if (composition === "introduce") return input.locale === "pt-BR"
    ? "Você confirma a autorização para compartilhar externamente e qual estrutura ou termos devem orientar o envio?"
    : "Do you confirm authorization to share externally, and which structure or terms should govern the outreach?";
  if (composition === "prepare_material") {
    const text = normalizeForPolicy(input.latestUserMessage);
    const destinationIsExplicit = /\b(interno|interna|internal|cliente|client[- ]?ready|companhia|board|conselho|comite|committee)\b/.test(text);
    if (!destinationIsExplicit) return input.locale === "pt-BR"
      ? "Esse material deve ir diretamente à companhia ou ao cliente, ou primeiro passar por revisão interna?"
      : "Should this material go directly to the company or client, or first go through internal review?";
  }
  if (composition === "prepare_meeting" && output.firstQuestion) {
    const question = normalizeForPolicy(output.firstQuestion);
    const changesAngle = /\b(angulo|tese|alternativa|angle|thesis)\b/.test(question);
    const changesForm = /\b(formato|material|paginas?|deck|memo|format|pages?)\b/.test(question);
    return changesAngle && changesForm ? output.firstQuestion : null;
  }
  // Evidence gaps belong to the selected executor's coverage map, not to routing.
  return null;
}

/**
 * Turns semantic reading into a stable workflow identity. The model reads the turn; finite policy
 * derives plan-driving fields from the named composition and explicit control cues. This keeps
 * prose flexible while composition, order, depth and responsibilities are versioned and testable.
 */
export function canonicalizeIntentClassifierOutput(
  output: IntentClassifierOutput,
  inputOrLocale: IntentClassifierInput | IntentClassifierInput["locale"],
): IntentClassifierOutput {
  const input: IntentClassifierInput = typeof inputOrLocale === "string"
    ? {locale: inputOrLocale, latestUserMessage: "", recentConversation: [], entryJob: null, documentCount: 0, professionalContext: null}
    : inputOrLocale;
  const locale = input.locale;
  const explicit = explicitComposition(input);
  const composition = explicit ?? output.composition;
  const core = output.routingCore;
  const assertsMeaning = (state: typeof core.action.state) => state === "explicit" || state === "inferred";
  const unresolvedSemantics = core.object.value.length === 0
    || !assertsMeaning(core.object.state)
    || (explicit === null && (core.action.value.length !== 1 || !assertsMeaning(core.action.state)))
    || (core.decisionType.value !== "none" && !assertsMeaning(core.decisionType.state))
    || (core.audienceType.value !== "unspecified" && !assertsMeaning(core.audienceType.state));
  const mustAbstain = requiresObjectiveClarification(input)
    || composition === null
    || (composition === "introduce" && explicit !== "introduce")
    || unresolvedSemantics
    || (output.abstain && explicit === null);

  if (!mustAbstain) {
    const policy = compositionPolicy(composition);
    const primaryWorks = resolveCompositionPrimaryWorks(composition, {
      documentsPresent: input.documentCount > 0,
    });
    return intentClassifierOutputSchema.parse({
      routingCore: {
        ...output.routingCore,
        action: policyField([policy.canonicalAction], composition),
        object: output.routingCore.object.value.length > 0 ? output.routingCore.object : {value: [{id: "object-1", ordinal: 1, kind: "process", slots: []}], state: "unknown", confidence: null, basis: null},
        depth: policyField(policy.depth, composition),
        continuity: policyContinuity(composition, output, input),
        workResponsibility: policyField([...policy.workResponsibilities], composition),
      },
      inferableContext: output.inferableContext,
      primaryWorks: primaryWorks.map((work) => ({work, confidence: 0.99})),
      composition,
      firstQuestion: policyQuestion(composition, output, input),
      abstain: false,
      abstainReason: null,
    });
  }

  const modelQuestion = output.firstQuestion?.trim() || "";
  const asksOutcome = /\b(resultado|objetivo|espera|precisa|result|outcome|expect)\b/.test(normalizeForPolicy(modelQuestion));
  const question = modelQuestion
    ? `${modelQuestion}${asksOutcome ? "" : (locale === "pt-BR" ? " E qual resultado você espera?" : " And what result do you expect?")}`
    : abstentionQuestion(locale);

  return intentClassifierOutputSchema.parse({
    routingCore: {
      ...output.routingCore,
      action: {value: ["understand"], state: "unknown", confidence: null, basis: null},
      object: {value: [{id: "object-1", ordinal: 1, kind: "document", slots: []}], state: "unknown", confidence: null, basis: null},
      decisionType: {value: "none", state: "not_applicable", confidence: null, basis: null},
      audienceType: {value: "unspecified", state: "unknown", confidence: null, basis: null},
      depth: {value: "point", state: "unknown", confidence: null, basis: null},
      continuity: {value: "new", state: "unknown", confidence: null, basis: null},
      workResponsibility: {value: ["producer"], state: "unknown", confidence: null, basis: null},
    },
    inferableContext: output.inferableContext,
    primaryWorks: [{work: "understand", confidence: 0}],
    composition: null,
    firstQuestion: question.slice(0, 600),
    abstain: true,
    abstainReason: output.abstainReason?.trim() || (locale === "pt-BR"
      ? "O objeto e o resultado esperado ainda não estão identificados."
      : "The object and expected result are not identified yet."),
  });
}

/** Stable production classifier instructions, shared verbatim by runtime and gold gate. */
export const INTENT_CLASSIFIER_SYSTEM = `You classify one turn of a debt capital markets conversation into an intent envelope. You do
not answer the request and you do not plan or execute the work.

Fill only what the turn, the recent conversation and the listed inputs support. Every field carries
a state and a confidence: "explicit" when the person said it, "inferred" when it follows from what
they said, "ambiguous" when two readings remain, "unknown" when nothing supports a value. Never
guess authority, evidence regime, permissions or documents: they are not yours to fill.

Use only the canonical enums and codes in the schema. "action" contains exactly one canonical
action when the request is understood. "decisionType" and "audienceType" classify the decision and
audience without narrative prose. Objects are distinct instances with stable "object-N" ids,
one-based contiguous ordinals and canonical slots. Order objects by first material appearance in
the current message, then append objects resolved only from recent conversation in their first
historical appearance order; if two objects first appear together, use the schema enum order.
Never return free-form desired-outcome, decision or audience narratives. Use "entity" only for a
named or identifier-specific entity and "subject" for a generic category or qualitative subject.
Normalize amounts to base units, currencies to ISO-4217, percentages to fractional decimal text
without a percent sign (12% is "0.12"), ratios to decimal multiples (4.7x is "4.7"), indexers to
their uppercase code, basis-point changes to integer text, tenor to months, page/count values to
integer text, and cadence to a stable English code such as "weekly" or "quarterly". Do not split
one object across multiple instances.

Choose the composition that names the requested outcome, not an intermediate step. The complete
composition and ordered-work policy below is generated from the same executable policy used by
canonicalization, envelope validation, runtime stamping and fingerprints:
${intentCompositionPolicyPrompt()}

The requested outcome wins over an intermediate task: a board discussion remains prepare_decision
even though diagnosis is required; an explicit request to produce the selected material remains
prepare_material even when the file will be used in a meeting. A follow-up such as "revise isso"
uses the recent conversation to resolve "isso"; do not abstain merely because it is a pronoun.

Work responsibility describes the person's role in this work, never their job title: producer,
coordinator, reviewer, decision_maker, sponsor, recipient, external_authorizer.
Producer applies when the person asks the system to create or analyse. Reviewer applies when they
ask for a challenge or review. Coordinator applies when they orchestrate a structure, process or
capital outreach. Decision_maker applies when they own the choice being prepared; sponsor applies
when they own the broader programme. Multiple responsibilities may apply.
Never infer decision_maker or external_authorizer from a banker, analyst, advisor or investor job
title. A person preparing client work is normally producer and coordinator; the client owns the
capital decision. A person screening received material can be both producer and reviewer.

Depth: point only for a bounded factual question or a truly context-free request; preliminary for
early exploration, triage or idea generation; institutional for an existing deliverable, decision,
full structure or model update. Continuity: use resume for a follow-up that continues prior work,
refresh for an assumption or data update, monitor for recurring surveillance, comparison for an
explicit comparison, and new when there is no prior work or the person explicitly replaces the
prior objective.

If the turn is too ambiguous to identify the referenced object and desired outcome, set abstain to
true, composition to null and ask one question that identifies both. If one answer would change the
work family, ordering, audience or deliverable, put that single question in firstQuestion.
A firstQuestion does not mean abstention. When a named composition is identifiable, set abstain to
false, select it and ask the question while work begins. A sponsor asking for meeting preparation
is prepare_meeting even when the thesis angle or output format still needs confirmation.
Questions about missing evidence belong to the downstream coverage engine, not here, unless the
missing fact changes the workflow itself. For a point explanation, explicit model update, review,
collection-only request, market query or bounded covenant analysis, leave firstQuestion null.
Do not abstain merely because evidence, assumptions, thesis angle or format is incomplete when the
subject and requested outcome family are already clear. Ask here when the answer changes the
workflow or external effect: internal review versus client-ready material, thesis angle plus output
form for an underspecified sponsor assignment, or authorization and selected structure before an
external introduction. Evidence such as a receivables tape, budget, debt schedule, mandate or capex
amount is requested later by coverage and is not a router question.
Return the requested JSON only.`;
