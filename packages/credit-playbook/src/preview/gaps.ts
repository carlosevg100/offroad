/**
 * The gaps the signed objects declare: what an executor could not prove, cover or reconcile.
 * Questions to the person are generated from these and from nothing else, so a question that
 * names no gap of the base is refused before it reaches the brief.
 */
import type {PreviewStepOutput} from "./run";
import {case01PreviewSteps} from "./workflow";

export const previewGapKeys = [
  "block_reasons", "incomplete_reasons", "unsupported", "unproven_conditions", "legal_conditions",
  "uncovered_terms", "uncovered_series", "assumptions", "open_divergences",
] as const;
export type PreviewGapKey = (typeof previewGapKeys)[number];

export type PreviewGap = {
  /** `<taskId>.<key>[<index>]`, the id a question cites. */
  id: string;
  taskId: string;
  methodId: string;
  objectLabel: string;
  key: PreviewGapKey;
  text: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function gapText(item: unknown): string {
  if (typeof item === "string") return item;
  if (isRecord(item)) {
    const head = [item.id, item.series_id, item.rowId, item.field, item.text, item.question].find((value) => typeof value === "string");
    const tail = [item.reason, item.condition, item.detail, item.note, item.state].find((value) => typeof value === "string");
    return [head, tail].filter(Boolean).join(": ") || JSON.stringify(item).slice(0, 200);
  }
  return String(item);
}

/** Every declared gap of every object in the run, in workflow order, bounded per object. */
export function extractPreviewGaps(outputs: Map<string, PreviewStepOutput>, locale: "pt-BR" | "en-US" = "pt-BR", perObjectLimit = 12): PreviewGap[] {
  const gaps: PreviewGap[] = [];
  for (const step of case01PreviewSteps) {
    if (step.stage === "material") continue;
    const output = outputs.get(step.taskId);
    if (!output) continue;
    let count = 0;
    for (const key of previewGapKeys) {
      const value = (output as Record<string, unknown>)[key];
      if (!Array.isArray(value)) continue;
      for (const [index, item] of value.entries()) {
        if (count >= perObjectLimit) break;
        gaps.push({id: `${step.taskId}.${key}[${index}]`, taskId: step.taskId, methodId: step.methodId, objectLabel: step.label[locale === "en-US" ? "en" : "pt"], key, text: gapText(item).slice(0, 300)});
        count += 1;
      }
    }
    const state = (output as Record<string, unknown>).state;
    if (typeof state === "string" && ["blocked", "incomplete", "partial", "conditioned"].includes(state) && count === 0) {
      gaps.push({id: `${step.taskId}.state`, taskId: step.taskId, methodId: step.methodId, objectLabel: step.label[locale === "en-US" ? "en" : "pt"], key: "incomplete_reasons", text: `state ${state} without an itemised reason`});
    }
  }
  return gaps;
}
