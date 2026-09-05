/**
 * The banker's synthesis in live mode: one bounded model call writes the prose of each section
 * from the signed objects and the brief, and a deterministic check removes every sentence whose
 * numbers the objects do not hold. Without a model, or when the call fails, the skeleton (the
 * objects' own headlines) stands and says so.
 */
import {preview} from "@offroad/credit-playbook";
import type {ModelGateway} from "@offroad/model-gateway";
import {z} from "zod";

const {synthesisSectionOrder, validateSynthesisNumbers, numberVocabulary, synthesisChangeNote, synthesisFingerprint} = preview;

/**
 * What the model may write: the shared section shape, bounded tighter than the skeleton's. The gate
 * measured the unbounded prose at the four-thousand-token cap in half the runs (truncated output,
 * a wasted call of about forty seconds); three paragraphs of at most seven hundred characters per
 * section keep the whole synthesis near a thousand words.
 */
export const synthesisModelSectionSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_-]{1,40}$/),
  title: z.string().min(2).max(120),
  paragraphs: z.array(z.object({
    text: z.string().min(1).max(700),
    references: z.array(z.string().max(120)).max(6).default([]),
  })).min(1).max(3),
});

export const synthesisModelOutputSchema = z.object({
  sections: z.array(synthesisModelSectionSchema).min(1).max(8),
  abstain: z.boolean(),
  abstainReason: z.string().max(300).nullable(),
});

export const PREVIEW_SYNTHESIS_SYSTEM = `You write the internal synthesis a debt capital markets banker reads before a meeting, in the
request's language, from signed objects and a brief plan you receive as JSON. Rules:
- Write only what the objects state. Every number you write must appear in the objects, in the
  same unit; do not compute new numbers, do not round beyond what the objects show, do not cite
  market data. A sentence with a number the objects do not hold will be removed.
- Name states honestly: incomplete, conditioned, partial, blocked objects are described as such,
  with the reason the object gives. Gaps are stated as gaps, never filled.
- Each paragraph lists in references the object paths it draws on (as given in the input).
- Keep the section ids and order given; two or three paragraphs per section, each at most
  ninety words (about six hundred characters); the whole synthesis at most a thousand words; at
  most six references per paragraph; no headings inside paragraphs; no bullet characters.
- No recommendation to the company, no offer to investors, no legal opinion: this is a desk's
  internal reading for the person's own meeting preparation.
Return the requested JSON only.`;

export type PreviewSynthesisInput = {
  gateway: ModelGateway | null;
  locale: "pt-BR" | "en-US";
  outputs: Map<string, preview.PreviewStepOutput>;
  request: preview.PreviewRequest;
  objectFingerprints: Record<string, string>;
  previous: preview.SynthesisOutput | null;
  skeleton: preview.SynthesisOutput;
};

/** Objects as the model reads them: state, signed scalars and the brief's headlines, bounded. */
function objectsForModel(outputs: Map<string, preview.PreviewStepOutput>): Record<string, unknown> {
  const view: Record<string, unknown> = {};
  for (const step of preview.case01PreviewSteps) {
    if (step.methodId === "write-meeting-synthesis") continue;
    const output = outputs.get(step.taskId);
    if (!output) continue;
    const record = output as Record<string, unknown>;
    const scalars = Object.fromEntries(Object.entries(record).filter(([key, value]) => key !== "trace" && (typeof value === "string" || typeof value === "number" || typeof value === "boolean")));
    const arrays = Object.fromEntries(Object.entries(record).filter(([key, value]) => Array.isArray(value) && key !== "trace").map(([key, value]) => [key, (value as unknown[]).slice(0, 12)]));
    view[step.taskId.toLowerCase()] = {label: step.label.pt, method: step.methodId, ...scalars, ...arrays};
  }
  return view;
}

export async function writePreviewSynthesis(input: PreviewSynthesisInput): Promise<preview.SynthesisOutput> {
  const {skeleton} = input;
  if (!input.gateway) return {...skeleton, source: {...skeleton.source, reason: "no model gateway for this run"}};
  const spentBefore = input.gateway.spent().costUsd;
  const startedAt = Date.now();
  try {
    const completion = await input.gateway.complete({
      task: "preview_synthesis",
      system: PREVIEW_SYNTHESIS_SYSTEM,
      input: [{
        type: "text",
        text: JSON.stringify({
          locale: input.locale,
          request: input.request,
          sections: synthesisSectionOrder.map((section) => ({id: section.id, title: section.title[input.locale === "en-US" ? "en" : "pt"], objects: section.tasks.map((task) => task.toLowerCase())})),
          objects: objectsForModel(input.outputs),
          previousChangeNote: input.previous ? synthesisChangeNote(input.previous.objects_read, input.objectFingerprints, input.locale) : [],
        }),
      }],
      schema: synthesisModelOutputSchema,
      schemaName: "preview_synthesis_output",
      thinking: "off",
      metadata: {surface: "preview_synthesis"},
    });
    const costUsd = Math.max(0, input.gateway.spent().costUsd - spentBefore);
    const latencyMs = Date.now() - startedAt;
    if (completion.output.abstain) {
      return {...skeleton, source: {kind: "skeleton", model: completion.model, costUsd, latencyMs, reason: completion.output.abstainReason ?? "the model abstained"}};
    }
    const checked = validateSynthesisNumbers(completion.output.sections, numberVocabulary(input.outputs));
    if (checked.sections.length === 0) {
      return {...skeleton, numbers: {verified: checked.verified, removed: checked.removed}, source: {kind: "skeleton", model: completion.model, costUsd, latencyMs, reason: "every sentence carried a number the objects do not hold"}};
    }
    const drafted: Omit<preview.SynthesisOutput, "trace"> = {
      schema_version: "preview-synthesis.v1",
      state: "drafted",
      sections: checked.sections,
      numbers: {verified: checked.verified, removed: checked.removed},
      objects_read: input.objectFingerprints,
      change_note: synthesisChangeNote(input.previous?.objects_read ?? null, input.objectFingerprints, input.locale),
      source: {kind: "model", model: completion.model, costUsd, latencyMs, reason: null},
    };
    return {...drafted, trace: {outputFingerprint: synthesisFingerprint(drafted)}};
  } catch (error) {
    return {...skeleton, source: {...skeleton.source, latencyMs: Date.now() - startedAt, reason: `model call failed: ${error instanceof Error ? error.message.slice(0, 160) : "unknown"}`}};
  }
}
