/**
 * The banker's synthesis of the signed objects: the prose a person reads before the meeting.
 * Two sources, one contract. Without a model the synthesis is a skeleton: every section lists
 * the headlines the objects already state, in their words, with their object paths. With a model
 * the sections carry prose, and every number in that prose is checked against the numbers the
 * objects hold: a sentence with a number the objects do not hold is removed and listed, so the
 * text never says more than the objects do. Fingerprints of the objects it read make the change
 * note of the next version deterministic.
 */
import {createHash} from "node:crypto";
import {z} from "zod";

import type {PreviewRequest, PreviewStepOutput} from "./run";
import {case01PreviewSteps} from "./workflow";

export const synthesisSectionSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_-]{1,40}$/),
  title: z.string().min(2).max(120),
  paragraphs: z.array(z.object({
    text: z.string().min(1).max(1_200),
    /** Object paths the paragraph draws on (`c09.covenants[0].ratio`); prose without a reference is allowed, numbers without one are not. */
    references: z.array(z.string().max(120)).max(12).default([]),
  })).min(1).max(8),
});
export type SynthesisSection = z.infer<typeof synthesisSectionSchema>;

export const synthesisOutputSchema = z.object({
  schema_version: z.literal("preview-synthesis.v1"),
  state: z.enum(["skeleton", "drafted"]),
  sections: z.array(synthesisSectionSchema).min(1).max(10),
  numbers: z.object({
    verified: z.number().int().nonnegative(),
    removed: z.array(z.object({sectionId: z.string(), sentence: z.string().max(600), numbers: z.array(z.string()).max(10)})).max(60),
  }),
  objects_read: z.record(z.string(), z.string()),
  change_note: z.array(z.string().max(200)).max(40),
  source: z.object({kind: z.enum(["skeleton", "model"]), model: z.string().nullable(), costUsd: z.number().nonnegative(), latencyMs: z.number().nonnegative(), reason: z.string().max(300).nullable()}),

  /** The fingerprint of everything above, so the synthesis is compared like every other object. */
  trace: z.object({outputFingerprint: z.string().regex(/^[a-f0-9]{64}$/)}),
});
export type SynthesisOutput = z.infer<typeof synthesisOutputSchema>;

const stable = (value: unknown): string => JSON.stringify(value, (_key, inner: unknown) => (inner && typeof inner === "object" && !Array.isArray(inner) ? Object.fromEntries(Object.entries(inner as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) : inner));

/** The fingerprint of a synthesis without its trace: the same objects and the same prose give the same value. */
export function synthesisFingerprint(output: Omit<SynthesisOutput, "trace">): string {
  return createHash("sha256").update(stable(output)).digest("hex");
}

export const synthesisSectionOrder: Array<{id: string; title: {pt: string; en: string}; tasks: string[]}> = [
  {id: "situation", title: {pt: "Situação atual da dívida", en: "Current debt situation"}, tasks: ["C05", "D07"]},
  {id: "covenants", title: {pt: "Covenants e condições", en: "Covenants and conditions"}, tasks: ["C09"]},
  {id: "maturities", title: {pt: "Vencimentos, juros e custo de saída", en: "Maturities, interest and exit cost"}, tasks: ["C10", "C07", "S07"]},
  {id: "alternatives", title: {pt: "Cenários e alternativas", en: "Scenarios and alternatives"}, tasks: ["C08", "S10"]},
  {id: "next_steps", title: {pt: "Pontos a alinhar e próximos passos", en: "Points to align and next steps"}, tasks: ["A01"]},
];

type Headline = {text: string; objectPath?: string; stance?: string};

function headlinesOf(output: PreviewStepOutput | undefined): Headline[] {
  if (!output) return [];
  const record = output as Record<string, unknown>;
  const deliverable = record.deliverable;
  if (deliverable && typeof deliverable === "object" && Array.isArray((deliverable as Record<string, unknown>).blocks)) {
    return ((deliverable as Record<string, unknown>).blocks as Array<Record<string, unknown>>).flatMap((block) => Array.isArray(block.headlines) ? (block.headlines as Headline[]) : []);
  }
  return [];
}

/** Every number the objects hold, in the forms prose writes them (1234.5, 1.234,5, 1234,5, 4.72x, 4,72x, 15.5%). */
export function numberVocabulary(outputs: Map<string, PreviewStepOutput>): Set<string> {
  const vocabulary = new Set<string>();
  const add = (value: string) => {
    const trimmed = value.trim();
    if (!/^-?\d+(\.\d+)?$/.test(trimmed)) return;
    const [whole = "", fraction] = trimmed.replace("-", "").split(".");
    const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    const variants = new Set<string>([trimmed, whole, grouped]);
    if (fraction !== undefined) {
      variants.add(`${whole},${fraction}`); variants.add(`${grouped},${fraction}`);
      for (const digits of [0, 1, 2]) {
        const rounded = Number(trimmed).toFixed(digits);
        variants.add(rounded); variants.add(rounded.replace(".", ","));
        const [roundedWhole = ""] = rounded.split(".");
        variants.add(roundedWhole.replace(/\B(?=(\d{3})+(?!\d))/g, "."));
      }
      const percent = (Number(trimmed) * 100).toFixed(2);
      variants.add(`${percent}%`); variants.add(`${percent.replace(".", ",")}%`); variants.add(`${percent.replace(/\.?0+$/, "")}%`); variants.add(`${percent.replace(/\.?0+$/, "").replace(".", ",")}%`);
    }
    for (const variant of variants) { const bare = variant.replace(/^-/, ""); vocabulary.add(bare); vocabulary.add(`${bare}x`); }
  };
  const walk = (value: unknown, depth: number) => {
    if (depth > 8 || value === null || value === undefined) return;
    if (typeof value === "number") add(String(value));
    else if (typeof value === "string") add(value);
    else if (Array.isArray(value)) value.forEach((item) => walk(item, depth + 1));
    else if (typeof value === "object") Object.values(value as Record<string, unknown>).forEach((item) => walk(item, depth + 1));
  };
  for (const [taskId, output] of outputs) if (taskId !== "A02") walk(output, 0);
  return vocabulary;
}

const NUMBER_PATTERN = /\d[\d.,]*(?:%|x)?/g;
const YEAR_OR_SMALL = /^(19|20)\d{2}$|^\d{1,2}$/;

/** Sentences whose numbers the objects do not hold are removed, sentence by sentence, and listed. */
export function validateSynthesisNumbers(sections: SynthesisSection[], vocabulary: Set<string>): {sections: SynthesisSection[]; verified: number; removed: SynthesisOutput["numbers"]["removed"]} {
  const removed: SynthesisOutput["numbers"]["removed"] = [];
  let verified = 0;
  const kept = sections.map((section) => ({
    ...section,
    paragraphs: section.paragraphs.flatMap((paragraph) => {
      // Sentences end at a period, exclamation or question mark followed by a space and a capital or a digit; a thousands separator never ends one.
      const sentences = paragraph.text.split(/(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÂÊÔÃÕÇ0-9])/).map((sentence) => sentence.trim()).filter(Boolean);
      const surviving: string[] = [];
      for (const sentence of sentences) {
        const numbers = (sentence.match(NUMBER_PATTERN) ?? []).map((token) => token.replace(/[.,]$/, "")).filter((token) => !YEAR_OR_SMALL.test(token.replace(/[%x]$/, "")));
        const unverifiable = numbers.filter((token) => !vocabulary.has(token) && !vocabulary.has(token.replace(/[%x]$/, "")));
        if (unverifiable.length > 0) removed.push({sectionId: section.id, sentence: sentence.trim().slice(0, 600), numbers: unverifiable.slice(0, 10)});
        else { verified += numbers.length; surviving.push(sentence.trim()); }
      }
      const text = surviving.join(" ").trim();
      return text ? [{...paragraph, text}] : [];
    }),
  })).filter((section) => section.paragraphs.length > 0);
  return {sections: kept, verified, removed};
}

/** The skeleton: the objects' own headlines, section by section, no prose. */
export function synthesisSkeleton(input: {outputs: Map<string, PreviewStepOutput>; request: PreviewRequest; locale: "pt-BR" | "en-US"; objectFingerprints: Record<string, string>; previous: SynthesisOutput | null}): SynthesisOutput {
  const lang = input.locale === "en-US" ? "en" : "pt";
  const sections: SynthesisSection[] = [];
  for (const section of synthesisSectionOrder) {
    const paragraphs: SynthesisSection["paragraphs"] = [];
    for (const taskId of section.tasks) {
      const output = input.outputs.get(taskId);
      if (!output) continue;
      const step = case01PreviewSteps.find((candidate) => candidate.taskId === taskId);
      const state = typeof (output as Record<string, unknown>).state === "string" ? String((output as Record<string, unknown>).state) : "unknown";
      const headlines = headlinesOf(input.outputs.get("A01")).filter((headline) => headline.objectPath?.startsWith(`${taskId.toLowerCase()}.`) || headline.objectPath === taskId.toLowerCase());
      const text = headlines.length
        ? headlines.map((headline) => headline.text).join(" ")
        : lang === "pt" ? `${step?.label.pt ?? taskId}: estado ${state}; nenhum fato citável assinado por este objeto.` : `${step?.label.en ?? taskId}: state ${state}; no citable fact signed by this object.`;
      paragraphs.push({text, references: headlines.map((headline) => headline.objectPath ?? taskId.toLowerCase()).slice(0, 12)});
    }
    if (paragraphs.length) sections.push({id: section.id, title: section.title[lang], paragraphs});
  }
  const output: Omit<SynthesisOutput, "trace"> = {
    schema_version: "preview-synthesis.v1",
    state: "skeleton",
    sections: sections.length ? sections : [{id: "situation", title: synthesisSectionOrder[0]!.title[lang], paragraphs: [{text: lang === "pt" ? "Nenhum objeto disponível para a síntese." : "No object available for the synthesis.", references: []}]}],
    numbers: {verified: 0, removed: []},
    objects_read: input.objectFingerprints,
    change_note: synthesisChangeNote(input.previous?.objects_read ?? null, input.objectFingerprints, input.locale),
    source: {kind: "skeleton", model: null, costUsd: 0, latencyMs: 0, reason: null},
  };
  return {...output, trace: {outputFingerprint: synthesisFingerprint(output)}};
}

/** Which objects changed since the previous synthesis, by fingerprint, in words the reader checks against the panel. */
export function synthesisChangeNote(previous: Record<string, string> | null, current: Record<string, string>, locale: "pt-BR" | "en-US"): string[] {
  if (!previous) return [];
  const lang = locale === "en-US" ? "en" : "pt";
  const notes: string[] = [];
  for (const [taskId, fingerprint] of Object.entries(current)) {
    const step = case01PreviewSteps.find((candidate) => candidate.taskId === taskId);
    const label = step?.label[lang] ?? taskId;
    if (!(taskId in previous)) notes.push(lang === "pt" ? `${label}: objeto novo` : `${label}: new object`);
    else if (previous[taskId] !== fingerprint) notes.push(lang === "pt" ? `${label}: objeto alterado` : `${label}: object changed`);
  }
  for (const taskId of Object.keys(previous)) if (!(taskId in current)) notes.push(lang === "pt" ? `${taskId}: objeto ausente` : `${taskId}: object missing`);
  return notes;
}
