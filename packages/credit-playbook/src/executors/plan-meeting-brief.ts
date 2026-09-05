import {createHash} from "node:crypto";

import {z} from "zod";

/**
 * Executor of the method `plan-meeting-brief`. Assembles the first deliverable from approved
 * objects only, proposes the page plan for the material the person asked for, and limits the
 * alignment questions to three that really change the work, refusing any question the documents
 * already answer. Nothing is produced before the plan is confirmed; the executor says so.
 */
const nonEmpty = z.string().trim().min(1);

export const approvedObjectSchema = z.object({
  id: nonEmpty,
  kind: z.enum(["debt_ledger", "maturity_wall", "covenants", "reconciliation", "interest_schedule", "scenarios", "exit_costs", "before_after", "company_view", "performance"]),
  state: z.enum(["complete", "conditioned", "incomplete", "blocked", "resolved", "partial", "closes", "open_divergences"]),
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  /** Short facts the deliverable may cite, each with the object as its source. */
  headlines: z.array(nonEmpty).max(12).default([]),
}).strict();

export const briefRequestSchema = z.object({
  turn: z.number().int().positive(),
  audience: z.array(nonEmpty).min(1),
  form: z.enum(["first_deliverable", "internal_briefing", "pitch_pages", "analysis_with_scenarios", "board_deck"]),
  pages: z.number().int().positive().nullable().default(null),
  /** What the sponsor said; the ambiguity the deliverable must name instead of hiding. */
  sponsorInstruction: z.string().nullable().default(null),
  confirmedPlanId: z.string().nullable().default(null),
}).strict();

export const candidateQuestionSchema = z.object({
  id: nonEmpty,
  text: nonEmpty,
  /** Why the answer changes the material; a question without it is not asked. */
  changesTheWork: nonEmpty,
  /** Set upstream by the coverage map: true when the base already answers it. */
  answeredByDocuments: z.boolean(),
  /** How much the answer changes the material, from the coverage map: lower asks first. */
  priority: z.number().int().nonnegative(),
}).strict();

export const briefInputSchema = z.object({
  caseId: nonEmpty,
  request: briefRequestSchema,
  objects: z.array(approvedObjectSchema),
  candidateQuestions: z.array(candidateQuestionSchema).default([]),
}).strict();
export type BriefInput = z.input<typeof briefInputSchema>;

const BLOCKS: Array<{id: string; label: string; needs: Array<z.infer<typeof approvedObjectSchema>["kind"]>}> = [
  {id: "company_view", label: "Visão da companhia", needs: ["company_view"]},
  {id: "performance_outlook", label: "Desempenho histórico e outlook", needs: ["performance"]},
  {id: "debt_by_instrument", label: "Dívida por instrumento", needs: ["debt_ledger"]},
  {id: "maturity_schedule", label: "Cronograma de vencimentos", needs: ["maturity_wall"]},
  {id: "liquidity_coverage", label: "Liquidez e cobertura", needs: ["maturity_wall", "interest_schedule"]},
  {id: "assumptions", label: "Premissas preliminares", needs: ["scenarios"]},
  {id: "points_for_thesis", label: "Pontos que sustentam a tese", needs: ["covenants", "exit_costs"]},
  {id: "points_against_thesis", label: "Pontos que derrubam a tese", needs: ["covenants", "reconciliation"]},
  {id: "initial_alternatives", label: "Alternativas iniciais", needs: ["before_after"]},
  {id: "open_questions", label: "Perguntas pendentes", needs: []},
  {id: "exhibits", label: "Exhibits preliminares", needs: ["debt_ledger", "maturity_wall"]},
];

export type BriefOutput = {
  schemaVersion: "method.plan-meeting-brief.v1";
  caseId: string;
  turn: number;
  deliverable: {blocks: Array<{id: string; label: string; state: "filled" | "gap"; objectIds: string[]; headlines: string[]; gap: string | null}>; objectsUsed: string[]};
  pagePlan: {id: string; form: string; audience: string[]; pages: Array<{number: number; title: string; blocks: string[]}>; discriminator: string; state: "proposed" | "confirmed"; productionAllowed: boolean} | null;
  alignmentQuestions: Array<{id: string; text: string; changesTheWork: string}>;
  refusedQuestions: Array<{id: string; reason: string}>;
  ambiguityNamed: string | null;
  trace: {inputFingerprint: string; outputFingerprint: string};
};

const fingerprint = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

const PAGE_PLANS: Record<string, (pages: number | null) => Array<{title: string; blocks: string[]}>> = {
  pitch_pages: () => [
    {title: "Situação atual", blocks: ["debt_by_instrument", "maturity_schedule", "liquidity_coverage", "points_against_thesis"]},
    {title: "Alternativas", blocks: ["initial_alternatives", "points_for_thesis"]},
    {title: "Impacto nos indicadores", blocks: ["assumptions", "exhibits"]},
  ],
  internal_briefing: () => [{title: "Briefing", blocks: ["company_view", "performance_outlook", "debt_by_instrument", "maturity_schedule", "points_for_thesis", "points_against_thesis", "open_questions"]}],
  analysis_with_scenarios: () => [{title: "Análise", blocks: ["debt_by_instrument", "maturity_schedule", "liquidity_coverage"]}, {title: "Cenários", blocks: ["assumptions", "initial_alternatives"]}],
  board_deck: () => [{title: "Contexto", blocks: ["company_view", "performance_outlook"]}, {title: "Estrutura de capital", blocks: ["debt_by_instrument", "maturity_schedule", "liquidity_coverage"]}, {title: "Alternativas e decisão", blocks: ["initial_alternatives", "points_for_thesis", "points_against_thesis"]}],
  first_deliverable: () => [],
};

export function planMeetingBrief(raw: BriefInput): BriefOutput {
  const input = briefInputSchema.parse(raw);
  const objects = [...input.objects].sort((a, b) => compare(a.id, b.id));
  const usable = objects.filter((object) => object.state !== "blocked");
  const byKind = new Map<string, typeof usable>();
  for (const object of usable) byKind.set(object.kind, [...(byKind.get(object.kind) ?? []), object]);

  const questions = [...input.candidateQuestions].sort((a, b) => a.priority - b.priority || compare(a.id, b.id));
  const refused = questions.filter((question) => question.answeredByDocuments).map((question) => ({id: question.id, reason: "the documents in the base already answer it; asking it would be a defect"}));
  const asked = questions.filter((question) => !question.answeredByDocuments).slice(0, 3).map((question) => ({id: question.id, text: question.text, changesTheWork: question.changesTheWork}));

  const blocks = BLOCKS.map((block) => {
    if (block.id === "open_questions") {
      return {id: block.id, label: block.label, state: asked.length > 0 ? "filled" as const : "gap" as const, objectIds: [], headlines: asked.map((question) => question.text), gap: asked.length > 0 ? null : "no material question remains"};
    }
    const found = block.needs.flatMap((kind) => byKind.get(kind) ?? []);
    const missing = block.needs.filter((kind) => !byKind.has(kind));
    if (missing.length > 0) return {id: block.id, label: block.label, state: "gap" as const, objectIds: found.map((object) => object.id), headlines: [], gap: `no approved object of kind ${missing.join(", ")}; the block is named as a gap, not written`};
    return {id: block.id, label: block.label, state: "filled" as const, objectIds: found.map((object) => object.id), headlines: found.flatMap((object) => object.headlines), gap: null};
  });

  let pagePlan: BriefOutput["pagePlan"] = null;
  if (input.request.form !== "first_deliverable") {
    const pages = PAGE_PLANS[input.request.form]!(input.request.pages).map((page, index) => ({number: index + 1, title: page.title, blocks: page.blocks}));
    const planId = fingerprint({form: input.request.form, audience: input.request.audience, pages}).slice(0, 16);
    const confirmed = input.request.confirmedPlanId === planId;
    pagePlan = {id: planId, form: input.request.form, audience: input.request.audience, pages, discriminator: `audience ${input.request.audience.join(", ")}: what changes their decision comes first`, state: confirmed ? "confirmed" : "proposed", productionAllowed: confirmed};
  }

  const ambiguityNamed = input.request.sponsorInstruction && /não (disse|definiu)|sem (ângulo|formato)|indefinid/i.test(input.request.sponsorInstruction)
    ? "the sponsor's instruction leaves angle and format undefined; the deliverable says so and starts the work anyway"
    : null;

  const body = {
    schemaVersion: "method.plan-meeting-brief.v1" as const,
    caseId: input.caseId,
    turn: input.request.turn,
    deliverable: {blocks, objectsUsed: usable.map((object) => object.id)},
    pagePlan,
    alignmentQuestions: asked,
    refusedQuestions: refused,
    ambiguityNamed,
  };
  return {...body, trace: {inputFingerprint: fingerprint({...input, objects, candidateQuestions: questions}), outputFingerprint: fingerprint(body)}};
}
