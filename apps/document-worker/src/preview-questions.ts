/**
 * Questions to the person, generated from the gaps the signed objects declare. One model call per
 * run, bounded to four questions, each citing at least one gap id of the base; a question that
 * cites no gap is dropped, and when the model is unavailable the fixed alignment points of the
 * first readout are used and named as such. The answer's effect on the work (audience, depth,
 * scope, format, premise) is what the next turn's router applies.
 */
import type {ModelGateway} from "@offroad/model-gateway";
import type {preview} from "@offroad/credit-playbook";
import {z} from "zod";

export type CandidateQuestion = {
  id: string;
  text: string;
  changesTheWork: string;
  coverage: {searched: string[]; answeredBy: null; answer: null};
  priority: number;
};

const effectAspects = ["thesis", "meeting_type", "format", "audience", "depth", "premise", "scope"] as const;

export const previewQuestionsOutputSchema = z.object({
  questions: z.array(z.object({
    id: z.string().regex(/^q-[a-z0-9-]{2,30}$/),
    text: z.string().min(8).max(300),
    gapIds: z.array(z.string().min(1).max(80)).min(1).max(6),
    changesTheWork: z.string().min(8).max(200),
    effect: z.enum(effectAspects),
    priority: z.number().int().min(1).max(4),
  })).max(6),
  abstain: z.boolean(),
  abstainReason: z.string().max(300).nullable(),
});
export type PreviewQuestionsOutput = z.infer<typeof previewQuestionsOutputSchema>;

export const PREVIEW_QUESTIONS_SYSTEM = `You write the questions an internal debt capital markets desk asks the person it works for,
after it analysed a company from a frozen evidence base. You receive the gaps the analysis
declared (what could not be proven, covered or reconciled), the request as understood, the
person's professional context and the questions already answered.

Write at most four questions, in the request's language, each one:
- grounded in one or more listed gap ids (copy them exactly into gapIds; never invent a gap);
- answerable by the person without opening a document (the base was already searched);
- with a real effect on the work (changesTheWork) and the aspect it changes: thesis, meeting_type,
  format, audience, depth, premise or scope;
- ordered by how much the answer changes the material (priority 1 asks first).
Do not ask what the base already answers, do not ask the same thing twice, do not ask questions
already answered. If no gap needs the person, return no questions and say why in abstainReason.
Return the requested JSON only.`;

export type PreviewQuestionsInput = {
  gateway: ModelGateway | null;
  locale: "pt-BR" | "en-US";
  gaps: preview.PreviewGap[];
  request: {desiredOutcome: string | null; audience: string | null; depth: string | null; form: string | null; undefinedAspects: string[]; sponsorInstruction: string | null};
  professionalContext: {useForms: string[]; professionalRoles: string[]; practiceAreas: string[]; primaryObjectives: string[]} | null;
  answered: Array<{questionId: string; answer: string}>;
  /** The documents of the base every question's coverage declares as searched. */
  documents: string[];
  /** The fixed alignment points used when the model is unavailable. */
  fixed: CandidateQuestion[];
};

export type PreviewQuestionsResult = {
  questions: CandidateQuestion[];
  source: "model" | "fixed" | "none";
  model: string | null;
  costUsd: number;
  latencyMs: number;
  dropped: number;
  reason: string | null;
  /** Which gap ids each generated question cites, for the artifact and the report. */
  citations: Record<string, string[]>;
};

/** One call, bounded and audited: every kept question cites a gap of the base. */
export async function generatePreviewQuestions(input: PreviewQuestionsInput): Promise<PreviewQuestionsResult> {
  const fallback = (source: "fixed" | "none", reason: string | null, extra: Partial<PreviewQuestionsResult> = {}): PreviewQuestionsResult => ({
    questions: source === "fixed" ? input.fixed : [], source, model: null, costUsd: 0, latencyMs: 0, dropped: 0, reason, citations: {}, ...extra,
  });
  if (!input.gateway) return fallback(input.fixed.length ? "fixed" : "none", "no model gateway for this run");
  if (input.gaps.length === 0) return fallback("none", "the objects declare no gap");
  const gapIds = new Set(input.gaps.map((gap) => gap.id));
  const spentBefore = input.gateway.spent().costUsd;
  const startedAt = Date.now();
  try {
    const completion = await input.gateway.complete({
      task: "preview_questions",
      system: PREVIEW_QUESTIONS_SYSTEM,
      input: [{
        type: "text",
        text: JSON.stringify({
          locale: input.locale,
          request: input.request,
          professionalContext: input.professionalContext,
          answered: input.answered,
          gaps: input.gaps.map((gap) => ({id: gap.id, object: gap.objectLabel, kind: gap.key, text: gap.text})),
        }),
      }],
      schema: previewQuestionsOutputSchema,
      schemaName: "preview_questions_output",
      thinking: "off",
      metadata: {surface: "preview_questions"},
    });
    const costUsd = Math.max(0, input.gateway.spent().costUsd - spentBefore);
    const latencyMs = Date.now() - startedAt;
    const answeredIds = new Set(input.answered.map((answer) => answer.questionId));
    const kept: CandidateQuestion[] = [];
    const citations: Record<string, string[]> = {};
    let dropped = 0;
    const seen = new Set<string>();
    for (const question of [...completion.output.questions].sort((a, b) => a.priority - b.priority)) {
      const cited = question.gapIds.filter((id) => gapIds.has(id));
      if (cited.length === 0 || seen.has(question.id) || answeredIds.has(question.id)) { dropped += 1; continue; }
      seen.add(question.id);
      kept.push({id: question.id, text: question.text, changesTheWork: question.changesTheWork, coverage: {searched: input.documents, answeredBy: null, answer: null}, priority: kept.length + 1});
      citations[question.id] = cited;
      if (kept.length === 4) break;
    }
    if (kept.length === 0) {
      return fallback(input.fixed.length ? "fixed" : "none", completion.output.abstainReason ?? "the model returned no question grounded in a gap", {model: completion.model, costUsd, latencyMs, dropped});
    }
    return {questions: kept, source: "model", model: completion.model, costUsd, latencyMs, dropped, reason: null, citations};
  } catch (error) {
    return fallback(input.fixed.length ? "fixed" : "none", `model call failed: ${error instanceof Error ? error.message.slice(0, 160) : "unknown"}`, {latencyMs: Date.now() - startedAt});
  }
}
