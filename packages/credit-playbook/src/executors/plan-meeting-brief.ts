import Decimal from "decimal.js";
import {createHash} from "node:crypto";

import {z} from "zod";

/**
 * Executor of the method `plan-meeting-brief` (v7, after the sixth independent review). Assembles
 * the first deliverable only from objects in a usable state, each fact bound to the fingerprint of
 * the object it cites; a conditioned, partial or open object names a gap instead of filling a block.
 * Points for and against the thesis come from the stance each object declared on its facts. The
 * page plan honours the number of pages asked, carries the audience's discriminator, and allows
 * production only once the person confirmed that exact plan. Questions the base already answers
 * are refused whatever the caller says; a question that changes nothing is not asked. A previous
 * version yields a change note instead of a silent rewrite. A block is filled only with facts; a
 * usable object without facts names a gap. A conditioned or open object is carried as an uncovered
 * term so its finding is never silently dropped. A financial figure in a fact carries its unit.
 * Without audience or form the deliverable still goes out and the page plan waits. Points for and
 * against the thesis come from the stance any usable object declared, never from a list of kinds.
 * Only cited objects count as used. A question is asked only after a declared search of the base
 * that found no answer. A fact's unit cannot contradict the fact's own words nor the unit of the
 * object it quotes; every fact names the field of the object it reproduces; a fact that asserts a
 * legal event (a breach) is refused, since no object asserts one. A plan that cannot hold the pages
 * asked emits the question inside the cap of three. Every gap, open questions included, is an
 * uncovered term. When an object's content is given, its fingerprint is recomputed from that
 * content and every fact's path must resolve inside it. This executor plans; the prose of the
 * pages is a model step downstream, never produced here.
 */
const nonEmpty = z.string().trim().min(1);
const identifier = z.string().regex(/^[a-z][a-z0-9_.-]*$/);
const sha256 = z.string().regex(/^[a-f0-9]{64}$/);
const anchorSchema = z.object({document: nonEmpty, page: z.number().int().positive().optional(), note: nonEmpty.optional(), clause: nonEmpty.optional()}).strict();
type Anchor = z.infer<typeof anchorSchema>;
const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export const objectKinds = ["debt_ledger", "maturity_wall", "covenants", "reconciliation", "interest_schedule", "scenarios", "exit_costs", "before_after", "company_view", "performance"] as const;
/** States that let an object fill a block; every other state names a gap. */
const USABLE_STATES = new Set(["complete", "resolved", "closes", "declared", "compared", "diagnosed"]);

export const approvedObjectSchema = z.object({
  id: identifier,
  kind: z.enum(objectKinds),
  state: z.enum(["complete", "resolved", "closes", "declared", "compared", "diagnosed", "conditioned", "incomplete", "partial", "open_divergences", "identity_failed", "blocked"]),
  fingerprint: sha256,
  /** The object's own content, as the executor that produced it emitted it; when given, the fingerprint must be the hash of this content and every fact's path must resolve inside it. */
  content: z.record(z.string(), z.unknown()).nullable().default(null),
  /** The monetary unit the object's figures are stated in, when it has any; a fact quoting a figure must carry the same unit. */
  unit: nonEmpty.nullable().default(null),
  /** Facts the deliverable may cite; each one is bound to the object's fingerprint, names the field it reproduces and declares its stance on the thesis. */
  headlines: z.array(z.object({text: nonEmpty, stance: z.enum(["for", "against", "neutral"]), objectFingerprint: sha256, /** The figure the text carries, structured: its amount (decimal string) and unit; required whenever the text carries a figure, and it must be found in the signed field the path names. */ value: z.object({amount: z.string().regex(/^-?\d+(\.\d+)?$/), unit: nonEmpty}).strict().nullable().default(null), /** For a headline for or against the thesis: the signed field and the test that supports the stance; the executor evaluates it on the signed content and refuses a stance it does not support. */ stanceBasis: z.object({path: nonEmpty, comparator: z.enum(["nonempty", "empty", "truthy", "falsy", "lt", "lte", "gt", "gte", "eq", "ne"]), threshold: z.string().regex(/^-?\d+(\.\d+)?$/).nullable().default(null), whenTrue: z.enum(["for", "against"])}).strict().nullable().default(null), /** Unit of any figure the text carries (R$ mil, x, %); required when the text carries a thousands-separated number. */ unit: nonEmpty.nullable().default(null), /** The field of the object the fact reproduces, so a fact can be audited against the object it is bound to. */ objectPath: nonEmpty}).strict()).max(12).default([]),
}).strict();

export const briefRequestSchema = z.object({
  turn: z.number().int().positive(),
  /** The person the material is for first; the others do not change the discriminator. */
  /** Null when the person has not said who the material is for; the deliverable goes out and the plan waits. */
  audience: z.object({primary: nonEmpty, others: z.array(nonEmpty).default([])}).strict().nullable(),
  form: z.enum(["first_deliverable", "internal_briefing", "pitch_pages", "analysis_with_scenarios", "board_deck"]).nullable(),
  pages: z.number().int().positive().nullable().default(null),
  /** What the sponsor said, kept verbatim. */
  sponsorInstruction: z.string().nullable().default(null),
  /** What the instruction left undefined, declared by the caller; the deliverable names it instead of hiding it. */
  undefinedAspects: z.array(z.enum(["thesis", "meeting_type", "format", "audience", "depth"])).default([]),
  confirmedPlanId: z.string().nullable().default(null),
}).strict();

export const candidateQuestionSchema = z.object({
  id: identifier,
  text: nonEmpty,
  /** Why the answer changes the material; a question without a real reason is not asked. */
  changesTheWork: nonEmpty,
  /** The declared search of the base: which documents were checked and what was found; a question without a search is not asked, and a found answer refuses it. */
  coverage: z.object({searched: z.array(nonEmpty).min(1), answeredBy: anchorSchema.nullable(), answer: nonEmpty.nullable()}).strict().nullable().default(null),
  /** How much the answer changes the material, from the coverage map: lower asks first. */
  priority: z.number().int().nonnegative(),
}).strict();

export const previousVersionSchema = z.object({
  outputFingerprint: sha256,
  blocks: z.array(z.object({id: identifier, state: z.enum(["filled", "gap"]), objectIds: z.array(identifier)}).strict()),
  objectFingerprints: z.record(identifier, sha256),
}).strict();

export const briefInputSchema = z.object({
  /** The documents of the base the coverage searches may name; a search of a document that is not in the base is not a search. */
  documents: z.array(nonEmpty).min(1),
  caseId: nonEmpty,
  request: briefRequestSchema,
  objects: z.array(approvedObjectSchema),
  candidateQuestions: z.array(candidateQuestionSchema).default([]),
  previousVersion: previousVersionSchema.nullable().default(null),
}).strict().superRefine((input, context) => {
  const objectIds = new Set<string>();
  input.objects.forEach((object, index) => {
    if (objectIds.has(object.id)) context.addIssue({code: "custom", path: ["objects", index], message: `duplicate object ${object.id}`});
    objectIds.add(object.id);
    if (object.content !== null) {
      const recomputed = createHash("sha256").update(stableStringify(object.content)).digest("hex");
      if (recomputed !== object.fingerprint) context.addIssue({code: "custom", path: ["objects", index, "fingerprint"], message: `${object.id}: the fingerprint is not the hash of the object's content; the content or the fingerprint was altered`});
      if (object.unit !== null && typeof object.content.unit === "string" && object.content.unit !== object.unit) context.addIssue({code: "custom", path: ["objects", index, "unit"], message: `${object.id}: the declared unit ${object.unit} differs from the unit inside the object's content (${object.content.unit})`});
    }
    object.headlines.forEach((headline, position) => {
      if (headline.objectFingerprint !== object.fingerprint) context.addIssue({code: "custom", path: ["objects", index, "headlines", position], message: `${object.id}: the headline is bound to another fingerprint than the object's`});
      if (headline.unit === null && /\d{1,3}(\.\d{3})+/.test(headline.text)) context.addIssue({code: "custom", path: ["objects", index, "headlines", position], message: `${object.id}: a fact with a figure needs its unit`});
      if (/rompid|rompiment|quebr|violad|violac|breach|descumpr|inadimpl|default declar|event of default|cross[- ]default|vencimento antecipado declar|acelerad|waiver|cumprid|em conformidade|compliance/i.test(headline.text)) context.addIssue({code: "custom", path: ["objects", index, "headlines", position], message: `${object.id}: a fact asserts a breach, a violation or a declared default; no object asserts a legal event, only an interim reading against a limit`});
      if (/\d{1,3}(\.\d{3})+|\d+,\d+/.test(headline.text) && headline.value === null) context.addIssue({code: "custom", path: ["objects", index, "headlines", position], message: `${object.id}: the fact carries a figure and no structured value; the amount and its unit travel with the text`});
      if (headline.value !== null) {
        if (headline.unit !== null && headline.unit.toLowerCase() !== headline.value.unit.toLowerCase()) context.addIssue({code: "custom", path: ["objects", index, "headlines", position], message: `${object.id}: the fact's unit (${headline.unit}) and its value's unit (${headline.value.unit}) differ`});
        if (!textCarriesAmount(headline.text, headline.value.amount)) context.addIssue({code: "custom", path: ["objects", index, "headlines", position], message: `${object.id}: the text does not carry the amount ${headline.value.amount} its value declares`});
        if (object.content !== null && !leavesCarryAmount(resolvePath(object.content, headline.objectPath), headline.value.amount)) context.addIssue({code: "custom", path: ["objects", index, "headlines", position], message: `${object.id}: the amount ${headline.value.amount} is not in the signed field ${headline.objectPath}; a figure is reproduced from the object, never restated`});
      }
      if (headline.stance !== "neutral" && headline.stanceBasis === null) context.addIssue({code: "custom", path: ["objects", index, "headlines", position], message: `${object.id}: a fact ${headline.stance} the thesis names the signed field and the test that supports the stance`});
      if (headline.stanceBasis !== null && object.content !== null) {
        const supported = evaluateBasis(resolvePath(object.content, headline.stanceBasis.path), headline.stanceBasis.comparator, headline.stanceBasis.threshold);
        if (supported === null) context.addIssue({code: "custom", path: ["objects", index, "headlines", position], message: `${object.id}: the stance basis ${headline.stanceBasis.path} does not resolve to a value the comparator ${headline.stanceBasis.comparator} can test`});
        else if (!supported || headline.stanceBasis.whenTrue !== headline.stance) context.addIssue({code: "custom", path: ["objects", index, "headlines", position], message: `${object.id}: the signed content does not support the stance ${headline.stance} (${headline.stanceBasis.path} ${headline.stanceBasis.comparator}${headline.stanceBasis.threshold ? ` ${headline.stanceBasis.threshold}` : ""} is ${supported ? "true" : "false"}, declared ${headline.stanceBasis.whenTrue})`});
      }
      if (object.content !== null && resolvePath(object.content, headline.objectPath) === undefined) context.addIssue({code: "custom", path: ["objects", index, "headlines", position], message: `${object.id}: the path ${headline.objectPath} does not resolve inside the object's content`});
      if (headline.unit !== null && object.unit !== null && /\d{1,3}(\.\d{3})+/.test(headline.text) && headline.unit.toLowerCase() !== object.unit.toLowerCase()) context.addIssue({code: "custom", path: ["objects", index, "headlines", position], message: `${object.id}: the fact quotes a figure in ${headline.unit} and the object states its figures in ${object.unit}`});
      if (headline.unit !== null) {
        const words = headline.text.toLowerCase();
        const unit = headline.unit.toLowerCase();
        const saysThousand = /\bmil\b|thousand/.test(words) && !/milh/.test(words);
        const saysMillion = /milh[õo]es|million/.test(words);
        if (saysThousand && /milh|million/.test(unit)) context.addIssue({code: "custom", path: ["objects", index, "headlines", position], message: `${object.id}: the fact says thousands and its unit says millions`});
        if (saysMillion && /\bmil\b|thousand/.test(unit) && !/milh/.test(unit)) context.addIssue({code: "custom", path: ["objects", index, "headlines", position], message: `${object.id}: the fact says millions and its unit says thousands`});
      }
    });
  });
  const questionIds = new Set<string>();
  input.candidateQuestions.forEach((question, index) => {
    if (questionIds.has(question.id)) context.addIssue({code: "custom", path: ["candidateQuestions", index], message: `duplicate question ${question.id}`});
    questionIds.add(question.id);
    for (const searched of question.coverage?.searched ?? []) if (!input.documents.includes(searched)) context.addIssue({code: "custom", path: ["candidateQuestions", index, "coverage"], message: `${question.id}: the search names ${searched}, which is not a document of the base; a search of the base names its documents`});
    if (question.coverage?.answeredBy && !input.documents.includes(question.coverage.answeredBy.document)) context.addIssue({code: "custom", path: ["candidateQuestions", index, "coverage"], message: `${question.id}: the answer is anchored to ${question.coverage.answeredBy.document}, which is not a document of the base`});
    if (question.coverage && (question.coverage.answeredBy === null) !== (question.coverage.answer === null)) context.addIssue({code: "custom", path: ["candidateQuestions", index, "coverage"], message: `${question.id}: an answer and its anchor come together`});
  });
  const blockIds = new Set<string>();
  input.previousVersion?.blocks.forEach((block, index) => {
    if (blockIds.has(block.id)) context.addIssue({code: "custom", path: ["previousVersion", "blocks", index], message: `duplicate block ${block.id} in the previous version`});
    blockIds.add(block.id);
  });
  if (input.request.pages !== null && (input.request.form === "first_deliverable" || input.request.form === null)) context.addIssue({code: "custom", path: ["request", "pages"], message: "the first deliverable has no page plan; pages belong to a material form"});
});
export type BriefInput = z.input<typeof briefInputSchema>;

type Kind = (typeof objectKinds)[number];
type Stance = "for" | "against" | "neutral";
const BLOCKS: Array<{id: string; label: string; needs: Kind[]; stance: Stance | null}> = [
  {id: "company_view", label: "Visão da companhia", needs: ["company_view"], stance: null},
  {id: "performance_outlook", label: "Desempenho histórico e outlook", needs: ["performance"], stance: null},
  {id: "debt_by_instrument", label: "Dívida por instrumento", needs: ["debt_ledger"], stance: null},
  {id: "maturity_schedule", label: "Cronograma de vencimentos", needs: ["maturity_wall"], stance: null},
  {id: "liquidity_coverage", label: "Liquidez e cobertura", needs: ["maturity_wall", "interest_schedule"], stance: null},
  {id: "assumptions", label: "Premissas preliminares", needs: ["scenarios"], stance: null},
  {id: "points_for_thesis", label: "Pontos que sustentam a tese", needs: [], stance: "for"},
  {id: "points_against_thesis", label: "Pontos contra a tese", needs: [], stance: "against"},
  {id: "initial_alternatives", label: "Alternativas iniciais", needs: ["before_after"], stance: null},
  {id: "open_questions", label: "Perguntas pendentes", needs: [], stance: null},
  {id: "exhibits", label: "Exhibits preliminares", needs: ["debt_ledger", "maturity_wall"], stance: null},
];

const PAGE_PLANS: Record<"pitch_pages" | "internal_briefing" | "analysis_with_scenarios" | "board_deck", Array<{title: string; blocks: string[]}>> = {
  pitch_pages: [
    {title: "Situação atual", blocks: ["debt_by_instrument", "maturity_schedule", "liquidity_coverage", "points_against_thesis"]},
    {title: "Alternativas", blocks: ["initial_alternatives", "points_for_thesis"]},
    {title: "Impacto nos indicadores", blocks: ["assumptions", "exhibits"]},
  ],
  internal_briefing: [{title: "Briefing", blocks: ["company_view", "performance_outlook", "debt_by_instrument", "maturity_schedule", "points_for_thesis", "points_against_thesis", "open_questions"]}],
  analysis_with_scenarios: [{title: "Análise", blocks: ["debt_by_instrument", "maturity_schedule", "liquidity_coverage"]}, {title: "Cenários", blocks: ["assumptions", "initial_alternatives"]}],
  board_deck: [{title: "Contexto", blocks: ["company_view", "performance_outlook"]}, {title: "Estrutura de capital", blocks: ["debt_by_instrument", "maturity_schedule", "liquidity_coverage"]}, {title: "Alternativas e decisão", blocks: ["initial_alternatives", "points_for_thesis", "points_against_thesis"]}],
};

type Block = {id: string; label: string; state: "filled" | "gap"; object_ids: string[]; pending_object_ids: string[]; headlines: Array<{text: string; unit: string | null; value: {amount: string; unit: string} | null; object_id: string; object_fingerprint: string; object_path: string | null}>; gap: string | null};
type Page = {number: number; title: string; blocks: string[]};
export type BriefOutput = {
  schema_version: "method.plan-meeting-brief.v7";
  case_id: string;
  turn: number;
  state: "planned" | "awaiting_confirmation";
  /** objects_used lists only the objects a filled block cites; usable objects without facts are listed apart. */
  deliverable: {blocks: Block[]; objects_used: string[]; objects_usable_not_cited: string[]; objects_pending: Array<{id: string; state: string}>; objects_excluded: Array<{id: string; state: string}>};
  page_plan: {state: "not_requested" | "awaiting_audience_and_form" | "proposed" | "confirmed" | "unsupported"; id: string | null; form: string | null; audience: {primary: string; others: string[]} | null; pages: Page[]; discriminator: string | null; production_allowed: boolean; reason: string | null};
  alignment_questions: Array<{id: string; text: string; changes_the_work: string}>;
  refused_questions: Array<{id: string; reason: string; answered_by: Anchor | null}>;
  /** What this executor does not produce: the prose of the pages is a model step downstream of the confirmed plan. */
  not_produced_here: string[];
  ambiguity_named: string | null;
  change_note: {previous_output_fingerprint: string; changes: string[]} | null;
  uncovered_terms: Array<{id: string; state: "insufficient_evidence"; reason: string}>;
  trace: {inputFingerprint: string; outputFingerprint: string};
};

const stableStringify = (value: unknown): string => JSON.stringify(value, (_key, inner: unknown) => (inner && typeof inner === "object" && !Array.isArray(inner) ? Object.fromEntries(Object.entries(inner as Record<string, unknown>).sort(([a], [b]) => compare(a, b))) : inner));
const fingerprint = (value: unknown) => createHash("sha256").update(stableStringify(value)).digest("hex");
/** Whether the text carries the amount (pt-BR or plain digits: 5.670.186, 4,72, 1.18375). */
function textCarriesAmount(text: string, amount: string): boolean {
  const normalized = new Decimal(amount).toFixed();
  const [integer, fraction] = normalized.replace(/^-/, "").split(".") as [string, string | undefined];
  const digits = fraction && fraction.replace(/0+$/, "").length > 0 ? `${integer}.${fraction.replace(/0+$/, "")}` : integer;
  const candidates = new Set<string>();
  for (const token of text.match(/-?\d[\d.,]*/g) ?? []) {
    const plain = token.replace(/^-/, "");
    candidates.add(plain.replace(/\./g, "").replace(/,/g, "."));
    candidates.add(plain.replace(/,/g, ""));
    candidates.add(plain);
  }
  return [...candidates].some((candidate) => { try { return new Decimal(candidate).toFixed() === new Decimal(digits).toFixed(); } catch { return false; } });
}
/** Whether any leaf under the value equals the amount. */
function leavesCarryAmount(value: unknown, amount: string): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string" || typeof value === "number") { try { return new Decimal(value).eq(amount); } catch { return false; } }
  if (Array.isArray(value)) return value.some((entry) => leavesCarryAmount(entry, amount));
  if (typeof value === "object") return Object.values(value as Record<string, unknown>).some((entry) => leavesCarryAmount(entry, amount));
  return false;
}
/** Evaluates a stance basis on a resolved signed value; null when the comparator cannot test the value. */
function evaluateBasis(value: unknown, comparator: string, threshold: string | null): boolean | null {
  const size = Array.isArray(value) ? value.length : typeof value === "string" ? value.length : value && typeof value === "object" ? Object.keys(value as object).length : null;
  switch (comparator) {
    case "nonempty": return size === null ? null : size > 0;
    case "empty": return size === null ? null : size === 0;
    case "truthy": return value === undefined ? null : Boolean(value);
    case "falsy": return value === undefined ? null : !value;
    default: {
      if (threshold === null || (typeof value !== "string" && typeof value !== "number")) return null;
      let left: Decimal;
      try { left = new Decimal(value); } catch { return null; }
      const right = new Decimal(threshold);
      return comparator === "lt" ? left.lt(right) : comparator === "lte" ? left.lte(right) : comparator === "gt" ? left.gt(right) : comparator === "gte" ? left.gte(right) : comparator === "eq" ? left.eq(right) : !left.eq(right);
    }
  }
}
/** Resolves a dotted path with optional indexes ("coverage.by_period[0].coverage") inside an object; undefined when any step is missing. */
export function resolvePath(content: unknown, path: string): unknown {
  let current: unknown = content;
  for (const step of path.split(".").flatMap((part) => part.split(/[[\]]/).filter((piece) => piece.length > 0))) {
    if (current === null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[step];
    if (current === undefined) return undefined;
  }
  return current;
}
const TRIVIAL_REASON = /^(nenhuma|nenhum|none|n\/?a|nada|-)$/i;

/** Fits the base layout to the pages asked: merges the tail when fewer, splits the fullest page when more. */
function fitPages(base: Array<{title: string; blocks: string[]}>, pages: number | null): Array<{title: string; blocks: string[]}> | null {
  const layout = base.map((page) => ({title: page.title, blocks: [...page.blocks]}));
  if (pages === null || pages === layout.length) return layout;
  if (pages < layout.length) {
    while (layout.length > pages) {
      const last = layout.pop()!;
      const previous = layout[layout.length - 1]!;
      previous.title = `${previous.title} e ${last.title.toLowerCase()}`;
      previous.blocks.push(...last.blocks);
    }
    return layout;
  }
  const totalBlocks = layout.reduce((sum, page) => sum + page.blocks.length, 0);
  if (pages > totalBlocks) return null;
  while (layout.length < pages) {
    const index = layout.reduce((best, page, position) => (page.blocks.length > layout[best]!.blocks.length ? position : best), 0);
    const page = layout[index]!;
    const half = Math.ceil(page.blocks.length / 2);
    layout.splice(index + 1, 0, {title: `${page.title} (continuação)`, blocks: page.blocks.slice(half)});
    page.blocks = page.blocks.slice(0, half);
  }
  return layout;
}

export function planMeetingBrief(raw: BriefInput): BriefOutput {
  const parsed = briefInputSchema.parse(raw);
  const input = {...parsed, request: {...parsed.request, audience: parsed.request.audience ? {primary: parsed.request.audience.primary, others: [...parsed.request.audience.others].sort(compare)} : null, undefinedAspects: [...parsed.request.undefinedAspects].sort(compare)}, objects: [...parsed.objects].sort((a, b) => compare(a.id, b.id)).map((object) => ({...object, headlines: [...object.headlines].sort((a, b) => compare(a.text, b.text) || compare(a.stance, b.stance) || compare(a.unit ?? "", b.unit ?? "") || compare(a.objectPath, b.objectPath) || compare(a.value?.amount ?? "", b.value?.amount ?? "") || compare(a.stanceBasis?.path ?? "", b.stanceBasis?.path ?? "") || compare(a.stanceBasis?.comparator ?? "", b.stanceBasis?.comparator ?? ""))})), candidateQuestions: [...parsed.candidateQuestions].sort((a, b) => a.priority - b.priority || compare(a.id, b.id)).map((question) => ({...question, coverage: question.coverage ? {...question.coverage, searched: [...question.coverage.searched].sort(compare)} : null})), previousVersion: parsed.previousVersion ? {...parsed.previousVersion, blocks: [...parsed.previousVersion.blocks].sort((a, b) => compare(a.id, b.id)).map((block) => ({...block, objectIds: [...block.objectIds].sort(compare)}))} : null};
  const usable = input.objects.filter((object) => USABLE_STATES.has(object.state));
  const pending = input.objects.filter((object) => !USABLE_STATES.has(object.state) && object.state !== "blocked");
  const excluded = input.objects.filter((object) => object.state === "blocked");
  const byKind = new Map<Kind, typeof usable>();
  for (const object of usable) byKind.set(object.kind, [...(byKind.get(object.kind) ?? []), object]);
  const pendingByKind = new Map<Kind, typeof pending>();
  for (const object of pending) pendingByKind.set(object.kind, [...(pendingByKind.get(object.kind) ?? []), object]);

  const refused: BriefOutput["refused_questions"] = [];
  const askable: typeof input.candidateQuestions = [];
  for (const question of input.candidateQuestions) {
    if (question.coverage?.answer) refused.push({id: question.id, reason: `the base already answers it: ${question.coverage.answer}`, answered_by: question.coverage.answeredBy});
    else if (!question.coverage) refused.push({id: question.id, reason: "no search of the base is declared for this question; a question is asked only after the documents were checked and found silent", answered_by: null});
    else if (TRIVIAL_REASON.test(question.changesTheWork.trim())) refused.push({id: question.id, reason: "the answer does not change the work", answered_by: null});
    else askable.push(question);
  }
  const asked = askable.slice(0, 3).map((question) => ({id: question.id, text: question.text, changes_the_work: question.changesTheWork}));
  for (const question of askable.slice(3)) refused.push({id: question.id, reason: "beyond the three questions that change the work most; kept for a later turn", answered_by: null});

  const blocks: Block[] = BLOCKS.map((block) => {
    if (block.id === "open_questions") {
      return {id: block.id, label: block.label, state: asked.length > 0 ? "filled" : "gap", object_ids: [], pending_object_ids: [], headlines: asked.map((question) => ({text: question.text, unit: null, value: null, object_id: `question:${question.id}`, object_fingerprint: fingerprint(question), object_path: null})), gap: asked.length > 0 ? null : "no question that changes the work remains"};
    }
    // A stance block draws on every usable object that declared the stance; a kind never decides the side.
    const found = block.stance !== null ? usable : block.needs.flatMap((kind) => byKind.get(kind) ?? []);
    const waiting = block.stance !== null ? pending.filter((object) => object.headlines.some((headline) => headline.stance === block.stance)) : block.needs.flatMap((kind) => pendingByKind.get(kind) ?? []);
    const headlines = found.flatMap((object) => object.headlines.filter((headline) => block.stance === null || headline.stance === block.stance).map((headline) => ({text: headline.text, unit: headline.unit, value: headline.value, object_id: object.id, object_fingerprint: headline.objectFingerprint, object_path: headline.objectPath})));
    if (block.stance !== null) {
      if (headlines.length === 0) return {id: block.id, label: block.label, state: "gap", object_ids: [], pending_object_ids: waiting.map((object) => object.id), headlines: [], gap: `no usable object states a point ${block.stance} the thesis${waiting.length > 0 ? `; ${waiting.map((object) => `${object.id} is ${object.state}`).join(", ")}` : ""}`};
      return {id: block.id, label: block.label, state: "filled", object_ids: found.filter((object) => object.headlines.some((headline) => headline.stance === block.stance)).map((object) => object.id), pending_object_ids: waiting.map((object) => object.id), headlines, gap: null};
    }
    const missing = block.needs.filter((kind) => !byKind.has(kind));
    if (missing.length > 0) {
      const reasons = missing.map((kind) => { const held = pendingByKind.get(kind) ?? []; return held.length > 0 ? `${kind}: ${held.map((object) => `${object.id} is ${object.state}`).join(", ")}` : `no usable object of kind ${kind}`; });
      return {id: block.id, label: block.label, state: "gap", object_ids: found.map((object) => object.id), pending_object_ids: waiting.map((object) => object.id), headlines: [], gap: `${reasons.join("; ")}; the block is named as a gap, not written`};
    }
    if (headlines.length === 0) return {id: block.id, label: block.label, state: "gap", object_ids: found.map((object) => object.id), pending_object_ids: waiting.map((object) => object.id), headlines: [], gap: `${found.map((object) => object.id).join(", ")} usable but without facts to cite; a block is filled with facts, not with an object id`};
    return {id: block.id, label: block.label, state: "filled", object_ids: found.map((object) => object.id), pending_object_ids: waiting.map((object) => object.id), headlines, gap: null};
  });

  const audience = input.request.audience;
  const refreshOpenQuestions = () => { const block = blocks.find((entry) => entry.id === "open_questions")!; block.state = asked.length > 0 ? "filled" : "gap"; block.headlines = asked.map((question) => ({text: question.text, unit: null, value: null, object_id: `question:${question.id}`, object_fingerprint: fingerprint(question), object_path: null})); block.gap = asked.length > 0 ? null : "no question that changes the work remains"; };
  let pagePlan: BriefOutput["page_plan"] = {state: "not_requested", id: null, form: input.request.form, audience, pages: [], discriminator: null, production_allowed: false, reason: "the first deliverable is not a material; the page plan waits for the audience and the form"};
  if (audience === null || input.request.form === null) pagePlan = {state: "awaiting_audience_and_form", id: null, form: input.request.form, audience, pages: [], discriminator: null, production_allowed: false, reason: `the deliverable goes out; the page plan waits for ${[audience === null ? "the audience" : null, input.request.form === null ? "the form" : null].filter(Boolean).join(" and ")}`};
  else if (input.request.form !== "first_deliverable") {
    const layout = fitPages(PAGE_PLANS[input.request.form], input.request.pages);
    if (!layout) {
      pagePlan = {state: "unsupported", id: null, form: input.request.form, audience, pages: [], discriminator: null, production_allowed: false, reason: `${input.request.pages} pages exceed the blocks the form ${input.request.form} carries; the question goes back to the person`};
      // The question the method promises: it is asked, not only announced, and inside the cap of three; the lowest-priority question gives way.
      if (asked.length === 3) { const dropped = asked.pop()!; refused.push({id: dropped.id, reason: "gave way to the page plan question; three questions at most; kept for a later turn", answered_by: null}); }
      asked.push({id: "q-pages-exceed-blocks", text: `Foram pedidas ${input.request.pages} páginas e a forma ${input.request.form} tem ${PAGE_PLANS[input.request.form].reduce((sum, page) => sum + page.blocks.length, 0)} blocos; que conteúdo as páginas extras devem receber?`, changes_the_work: "define o plano de páginas, sem o qual nada é produzido"});
    }
    else {
      const pages: Page[] = layout.map((page, index) => ({number: index + 1, title: page.title, blocks: page.blocks}));
      const discriminator = `what changes the decision of ${audience.primary} comes first${audience.others.length > 0 ? `; ${audience.others.join(", ")} read the same pages` : ""}`;
      const planId = fingerprint({form: input.request.form, audience, pages, discriminator});
      const confirmed = input.request.confirmedPlanId === planId;
      pagePlan = {state: confirmed ? "confirmed" : "proposed", id: planId, form: input.request.form, audience, pages, discriminator, production_allowed: confirmed, reason: confirmed ? null : input.request.confirmedPlanId ? "the confirmed plan differs from this one; production waits for the person to confirm this plan" : "production waits for the person to confirm the plan"};
    }
  }

  refreshOpenQuestions();
  const aspects: Record<string, string> = {thesis: "which thesis to carry", meeting_type: "whether the meeting explores or tests a product", format: "which format is expected", audience: "who the material is for", depth: "how deep the material goes"};
  const ambiguityNamed = input.request.undefinedAspects.length > 0 ? `the sponsor's instruction leaves undefined: ${input.request.undefinedAspects.map((aspect) => aspects[aspect]).join("; ")}. The deliverable says so and starts the work anyway` : null;

  let changeNote: BriefOutput["change_note"] = null;
  if (input.previousVersion) {
    const changes: string[] = [];
    for (const block of blocks) {
      const previous = input.previousVersion.blocks.find((entry) => entry.id === block.id);
      if (!previous) changes.push(`block ${block.id} is new`);
      else if (previous.state !== block.state) changes.push(`block ${block.id} moved from ${previous.state} to ${block.state}`);
      else if (stableStringify(previous.objectIds) !== stableStringify(block.object_ids)) changes.push(`block ${block.id} now cites ${block.object_ids.join(", ") || "nothing"} instead of ${previous.objectIds.join(", ") || "nothing"}`);
    }
    for (const object of input.objects) {
      const before = input.previousVersion.objectFingerprints[object.id];
      if (before === undefined) changes.push(`object ${object.id} entered since the previous version`);
      else if (before !== object.fingerprint) changes.push(`object ${object.id} changed (premise or number) since the previous version: ${before.slice(0, 12)} to ${object.fingerprint.slice(0, 12)}`);
    }
    for (const id of Object.keys(input.previousVersion.objectFingerprints).sort(compare)) if (!input.objects.some((object) => object.id === id)) changes.push(`object ${id} left since the previous version`);
    changeNote = {previous_output_fingerprint: input.previousVersion.outputFingerprint, changes};
  }

  const uncovered = [
    ...blocks.filter((block) => block.state === "gap").map((block) => ({id: block.id, state: "insufficient_evidence" as const, reason: block.gap!})),
    ...pending.map((object) => ({id: `object:${object.id}`, state: "insufficient_evidence" as const, reason: `${object.id} (${object.kind}) is ${object.state}; its findings are carried as conditions and not written into the deliverable: ${object.headlines.map((headline) => headline.text).join("; ") || "no facts declared"}`})),
  ];
  const body = {
    schema_version: "method.plan-meeting-brief.v7" as const,
    case_id: input.caseId,
    turn: input.request.turn,
    state: pagePlan.state === "proposed" ? "awaiting_confirmation" as const : "planned" as const,
    deliverable: {blocks, objects_used: usable.filter((object) => blocks.some((block) => block.state === "filled" && block.headlines.some((headline) => headline.object_id === object.id))).map((object) => object.id), objects_usable_not_cited: usable.filter((object) => !blocks.some((block) => block.state === "filled" && block.headlines.some((headline) => headline.object_id === object.id))).map((object) => object.id), objects_pending: pending.map((object) => ({id: object.id, state: object.state})), objects_excluded: excluded.map((object) => ({id: object.id, state: object.state}))},
    page_plan: pagePlan,
    alignment_questions: asked,
    refused_questions: refused.sort((a, b) => compare(a.id, b.id)),
    not_produced_here: ["the prose of the pages: a model-assisted step downstream of the confirmed plan, with every number by reference to the objects, never written by this executor"],
    ambiguity_named: ambiguityNamed,
    change_note: changeNote,
    uncovered_terms: uncovered,
  };
  const inputFingerprint = fingerprint(input);
  return {...body, trace: {inputFingerprint, outputFingerprint: fingerprint({...body, inputFingerprint})}};
}
