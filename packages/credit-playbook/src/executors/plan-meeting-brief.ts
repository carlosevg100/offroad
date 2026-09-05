import {createHash} from "node:crypto";

import {z} from "zod";

/**
 * Executor of the method `plan-meeting-brief` (v2, after the first independent review). Assembles
 * the first deliverable only from objects in a usable state, each fact bound to the fingerprint of
 * the object it cites; a conditioned, partial or open object names a gap instead of filling a block.
 * Points for and against the thesis come from the stance each object declared on its facts. The
 * page plan honours the number of pages asked, carries the audience's discriminator, and allows
 * production only once the person confirmed that exact plan. Questions the base already answers
 * are refused whatever the caller says; a question that changes nothing is not asked. A previous
 * version yields a change note instead of a silent rewrite.
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
  /** Facts the deliverable may cite; each one is bound to the object's fingerprint and declares its stance on the thesis. */
  headlines: z.array(z.object({text: nonEmpty, stance: z.enum(["for", "against", "neutral"]), objectFingerprint: sha256}).strict()).max(12).default([]),
}).strict();

export const briefRequestSchema = z.object({
  turn: z.number().int().positive(),
  /** The person the material is for first; the others do not change the discriminator. */
  audience: z.object({primary: nonEmpty, others: z.array(nonEmpty).default([])}).strict(),
  form: z.enum(["first_deliverable", "internal_briefing", "pitch_pages", "analysis_with_scenarios", "board_deck"]),
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
  /** Where the base already answers it, from the coverage map; a covered question is refused. */
  coverage: z.object({answeredBy: anchorSchema, answer: nonEmpty}).strict().nullable().default(null),
  /** How much the answer changes the material, from the coverage map: lower asks first. */
  priority: z.number().int().nonnegative(),
}).strict();

export const previousVersionSchema = z.object({
  outputFingerprint: sha256,
  blocks: z.array(z.object({id: identifier, state: z.enum(["filled", "gap"]), objectIds: z.array(identifier)}).strict()),
  objectFingerprints: z.record(identifier, sha256),
}).strict();

export const briefInputSchema = z.object({
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
    object.headlines.forEach((headline, position) => {
      if (headline.objectFingerprint !== object.fingerprint) context.addIssue({code: "custom", path: ["objects", index, "headlines", position], message: `${object.id}: the headline is bound to another fingerprint than the object's`});
    });
  });
  const questionIds = new Set<string>();
  input.candidateQuestions.forEach((question, index) => {
    if (questionIds.has(question.id)) context.addIssue({code: "custom", path: ["candidateQuestions", index], message: `duplicate question ${question.id}`});
    questionIds.add(question.id);
  });
  if (input.request.pages !== null && input.request.form === "first_deliverable") context.addIssue({code: "custom", path: ["request", "pages"], message: "the first deliverable has no page plan; pages belong to a material form"});
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
  {id: "points_for_thesis", label: "Pontos que sustentam a tese", needs: ["covenants", "exit_costs", "before_after", "scenarios", "maturity_wall"], stance: "for"},
  {id: "points_against_thesis", label: "Pontos que derrubam a tese", needs: ["covenants", "reconciliation", "maturity_wall", "before_after"], stance: "against"},
  {id: "initial_alternatives", label: "Alternativas iniciais", needs: ["before_after"], stance: null},
  {id: "open_questions", label: "Perguntas pendentes", needs: [], stance: null},
  {id: "exhibits", label: "Exhibits preliminares", needs: ["debt_ledger", "maturity_wall"], stance: null},
];

const PAGE_PLANS: Record<Exclude<BriefInput["request"]["form"], "first_deliverable">, Array<{title: string; blocks: string[]}>> = {
  pitch_pages: [
    {title: "Situação atual", blocks: ["debt_by_instrument", "maturity_schedule", "liquidity_coverage", "points_against_thesis"]},
    {title: "Alternativas", blocks: ["initial_alternatives", "points_for_thesis"]},
    {title: "Impacto nos indicadores", blocks: ["assumptions", "exhibits"]},
  ],
  internal_briefing: [{title: "Briefing", blocks: ["company_view", "performance_outlook", "debt_by_instrument", "maturity_schedule", "points_for_thesis", "points_against_thesis", "open_questions"]}],
  analysis_with_scenarios: [{title: "Análise", blocks: ["debt_by_instrument", "maturity_schedule", "liquidity_coverage"]}, {title: "Cenários", blocks: ["assumptions", "initial_alternatives"]}],
  board_deck: [{title: "Contexto", blocks: ["company_view", "performance_outlook"]}, {title: "Estrutura de capital", blocks: ["debt_by_instrument", "maturity_schedule", "liquidity_coverage"]}, {title: "Alternativas e decisão", blocks: ["initial_alternatives", "points_for_thesis", "points_against_thesis"]}],
};

type Block = {id: string; label: string; state: "filled" | "gap"; object_ids: string[]; pending_object_ids: string[]; headlines: Array<{text: string; object_id: string; object_fingerprint: string}>; gap: string | null};
type Page = {number: number; title: string; blocks: string[]};
export type BriefOutput = {
  schema_version: "method.plan-meeting-brief.v2";
  case_id: string;
  turn: number;
  state: "planned" | "awaiting_confirmation";
  deliverable: {blocks: Block[]; objects_used: string[]; objects_pending: Array<{id: string; state: string}>; objects_excluded: Array<{id: string; state: string}>};
  page_plan: {state: "not_requested" | "proposed" | "confirmed" | "unsupported"; id: string | null; form: string; audience: {primary: string; others: string[]}; pages: Page[]; discriminator: string | null; production_allowed: boolean; reason: string | null};
  alignment_questions: Array<{id: string; text: string; changes_the_work: string}>;
  refused_questions: Array<{id: string; reason: string; answered_by: Anchor | null}>;
  ambiguity_named: string | null;
  change_note: {previous_output_fingerprint: string; changes: string[]} | null;
  uncovered_terms: Array<{id: string; state: "insufficient_evidence"; reason: string}>;
  trace: {inputFingerprint: string; outputFingerprint: string};
};

const stableStringify = (value: unknown): string => JSON.stringify(value, (_key, inner: unknown) => (inner && typeof inner === "object" && !Array.isArray(inner) ? Object.fromEntries(Object.entries(inner as Record<string, unknown>).sort(([a], [b]) => compare(a, b))) : inner));
const fingerprint = (value: unknown) => createHash("sha256").update(stableStringify(value)).digest("hex");
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
  const input = {...parsed, request: {...parsed.request, audience: {primary: parsed.request.audience.primary, others: [...parsed.request.audience.others].sort(compare)}, undefinedAspects: [...parsed.request.undefinedAspects].sort(compare)}, objects: [...parsed.objects].sort((a, b) => compare(a.id, b.id)).map((object) => ({...object, headlines: [...object.headlines].sort((a, b) => compare(a.text, b.text))})), candidateQuestions: [...parsed.candidateQuestions].sort((a, b) => a.priority - b.priority || compare(a.id, b.id))};
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
    if (question.coverage) refused.push({id: question.id, reason: `the base already answers it: ${question.coverage.answer}`, answered_by: question.coverage.answeredBy});
    else if (TRIVIAL_REASON.test(question.changesTheWork.trim())) refused.push({id: question.id, reason: "the answer does not change the work", answered_by: null});
    else askable.push(question);
  }
  const asked = askable.slice(0, 3).map((question) => ({id: question.id, text: question.text, changes_the_work: question.changesTheWork}));
  for (const question of askable.slice(3)) refused.push({id: question.id, reason: "beyond the three questions that change the work most; kept for a later turn", answered_by: null});

  const blocks: Block[] = BLOCKS.map((block) => {
    if (block.id === "open_questions") {
      return {id: block.id, label: block.label, state: asked.length > 0 ? "filled" : "gap", object_ids: [], pending_object_ids: [], headlines: asked.map((question) => ({text: question.text, object_id: `question:${question.id}`, object_fingerprint: fingerprint(question)})), gap: asked.length > 0 ? null : "no question that changes the work remains"};
    }
    const found = block.needs.flatMap((kind) => byKind.get(kind) ?? []);
    const waiting = block.needs.flatMap((kind) => pendingByKind.get(kind) ?? []);
    const headlines = found.flatMap((object) => object.headlines.filter((headline) => block.stance === null || headline.stance === block.stance).map((headline) => ({text: headline.text, object_id: object.id, object_fingerprint: headline.objectFingerprint})));
    if (block.stance !== null) {
      if (headlines.length === 0) return {id: block.id, label: block.label, state: "gap", object_ids: found.map((object) => object.id), pending_object_ids: waiting.map((object) => object.id), headlines: [], gap: `no usable object states a point ${block.stance} the thesis${waiting.length > 0 ? `; ${waiting.map((object) => `${object.id} is ${object.state}`).join(", ")}` : ""}`};
      return {id: block.id, label: block.label, state: "filled", object_ids: found.filter((object) => object.headlines.some((headline) => headline.stance === block.stance)).map((object) => object.id), pending_object_ids: waiting.map((object) => object.id), headlines, gap: null};
    }
    const missing = block.needs.filter((kind) => !byKind.has(kind));
    if (missing.length > 0) {
      const reasons = missing.map((kind) => { const held = pendingByKind.get(kind) ?? []; return held.length > 0 ? `${kind}: ${held.map((object) => `${object.id} is ${object.state}`).join(", ")}` : `no usable object of kind ${kind}`; });
      return {id: block.id, label: block.label, state: "gap", object_ids: found.map((object) => object.id), pending_object_ids: waiting.map((object) => object.id), headlines: [], gap: `${reasons.join("; ")}; the block is named as a gap, not written`};
    }
    return {id: block.id, label: block.label, state: "filled", object_ids: found.map((object) => object.id), pending_object_ids: waiting.map((object) => object.id), headlines, gap: null};
  });

  const audience = input.request.audience;
  let pagePlan: BriefOutput["page_plan"] = {state: "not_requested", id: null, form: input.request.form, audience, pages: [], discriminator: null, production_allowed: false, reason: "the first deliverable is not a material; the page plan waits for the audience and the form"};
  if (input.request.form !== "first_deliverable") {
    const layout = fitPages(PAGE_PLANS[input.request.form], input.request.pages);
    if (!layout) pagePlan = {state: "unsupported", id: null, form: input.request.form, audience, pages: [], discriminator: null, production_allowed: false, reason: `${input.request.pages} pages exceed the blocks the form ${input.request.form} carries; ask the person which blocks the extra pages should hold`};
    else {
      const pages: Page[] = layout.map((page, index) => ({number: index + 1, title: page.title, blocks: page.blocks}));
      const discriminator = `what changes the decision of ${audience.primary} comes first${audience.others.length > 0 ? `; ${audience.others.join(", ")} read the same pages` : ""}`;
      const planId = fingerprint({form: input.request.form, audience, pages, discriminator});
      const confirmed = input.request.confirmedPlanId === planId;
      pagePlan = {state: confirmed ? "confirmed" : "proposed", id: planId, form: input.request.form, audience, pages, discriminator, production_allowed: confirmed, reason: confirmed ? null : input.request.confirmedPlanId ? "the confirmed plan differs from this one; production waits for the person to confirm this plan" : "production waits for the person to confirm the plan"};
    }
  }

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

  const uncovered = blocks.filter((block) => block.state === "gap" && block.id !== "open_questions").map((block) => ({id: block.id, state: "insufficient_evidence" as const, reason: block.gap!}));
  const body = {
    schema_version: "method.plan-meeting-brief.v2" as const,
    case_id: input.caseId,
    turn: input.request.turn,
    state: pagePlan.state === "proposed" ? "awaiting_confirmation" as const : "planned" as const,
    deliverable: {blocks, objects_used: usable.map((object) => object.id), objects_pending: pending.map((object) => ({id: object.id, state: object.state})), objects_excluded: excluded.map((object) => ({id: object.id, state: object.state}))},
    page_plan: pagePlan,
    alignment_questions: asked,
    refused_questions: refused.sort((a, b) => compare(a.id, b.id)),
    ambiguity_named: ambiguityNamed,
    change_note: changeNote,
    uncovered_terms: uncovered,
  };
  const inputFingerprint = fingerprint(input);
  return {...body, trace: {inputFingerprint, outputFingerprint: fingerprint({...body, inputFingerprint})}};
}
