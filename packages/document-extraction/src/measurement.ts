import {isDeepStrictEqual} from "node:util";

import {z} from "zod";
import {
  documentLayerSchema,
  documentProfileSchema,
  indexLayer,
  rawExtractionCandidateSchema,
  verifyCandidates,
} from "@offroad/document-intelligence";
import {ModelGatewayError, type ModelGateway, type ModelRef} from "@offroad/model-gateway";

import {extractDocument, renumberByTable, type ExtractionResult} from "./extract";

/**
 * The extraction measurement as a governed evaluation family (stage 17, increment 5).
 *
 * `measure-extraction.ts` parses the documents of a gold case where it runs, as it always did, and
 * sends this snapshot: each document's layer and the profile the gold hands the extractor, the
 * extractor and prompt versions it was built for, and the model settings of the task. The worker
 * runs the extractor over it through the governed gateway and publishes, per document, what the
 * models answered (the raw candidates the extractor keeps) and the counts of its passes. The
 * script reads that back, bound to the snapshot it sent, rebuilds the verified candidates with the
 * extractor's own verifier over the layers it parsed, and scores them where it runs. The gold
 * expectations never enter the snapshot, so the answer key never leaves the script.
 */

const hash = z.string().regex(/^[a-f0-9]{64}$/);
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
/** One to two hundred characters with no surrounding space: what the evaluation contract accepts as a case label. */
const label = z.string().min(1).max(200).refine((value) => value.trim() === value, "no surrounding space");

/**
 * A schema read with nothing stripped and no default filled in: the value passes only when the
 * schema's own reading of it is the value itself, so no field reaches the worker without being
 * read and none is invented on the way. The layer and profile schemas are shared with the rest of
 * the pipeline, which is why strictness is checked by comparison rather than rewritten.
 */
function exactly<T extends z.ZodType>(schema: T) {
  return z.custom<z.output<T>>((value) => {
    const parsed = schema.safeParse(value);
    return parsed.success && isDeepStrictEqual(parsed.data, value);
  }, {message: "not exactly the declared shape"});
}

/** One model route, as the model gateway names it. */
export const measurementModelRouteSchema = z.object({
  provider: z.enum(["anthropic", "openai"]),
  model: z.string().min(1).max(120),
  effort: z.enum(["low", "medium", "high", "xhigh", "max"]),
}).strict();

/** The routes a pass may take and the limits of each call: the whole of the task policy a run uses. */
export const measurementModelSettingsSchema = z.object({
  primary: measurementModelRouteSchema,
  fallback: measurementModelRouteSchema.nullable(),
  maxOutputTokens: z.number().int().min(1).max(128_000),
  timeoutMs: z.number().int().min(1_000).max(3_600_000),
}).strict().refine((model) => model.fallback === null
  || model.fallback.provider !== model.primary.provider || model.fallback.model !== model.primary.model, "the fallback is another route");
export type MeasurementModelSettings = z.infer<typeof measurementModelSettingsSchema>;

export const extractionMeasurementDocumentSchema = z.object({
  /** The file name, which is also the layer's and the profile's document id. */
  name: z.string().min(1).max(300),
  /** SHA-256 of the file's bytes; the contract declares it as a source. */
  sha256: hash,
  profile: exactly(documentProfileSchema),
  layer: exactly(documentLayerSchema),
}).strict();
export type ExtractionMeasurementDocument = z.infer<typeof extractionMeasurementDocumentSchema>;

export const extractionMeasurementSnapshotSchema = z.object({
  schemaVersion: z.literal("extraction-measurement-snapshot.v1"),
  caseId: label,
  caseVersion: label,
  /** What the snapshot was built for; a worker running another extractor or prompt refuses it before anything is sent. */
  extractor: z.object({version: z.string().min(1).max(120), promptVersion: z.string().min(1).max(120)}).strict(),
  model: measurementModelSettingsSchema,
  documents: z.array(extractionMeasurementDocumentSchema).min(1).max(100),
}).strict().superRefine((snapshot, context) => {
  const names = snapshot.documents.map((document) => document.name);
  if (new Set(names).size !== names.length) context.addIssue({code: "custom", path: ["documents"], message: "each document is named once"});
  snapshot.documents.forEach((document, index) => {
    if (document.profile.documentId !== document.name || document.layer.documentId !== document.name) {
      context.addIssue({code: "custom", path: ["documents", index], message: "the profile and the layer belong to the document they are sent with"});
    }
  });
});
export type ExtractionMeasurementSnapshot = z.infer<typeof extractionMeasurementSnapshotSchema>;

/** Every content hash the snapshot carries: the bytes of each document it measures. */
export function extractionMeasurementContentHashes(snapshot: ExtractionMeasurementSnapshot): string[] {
  return [...new Set(snapshot.documents.map((document) => document.sha256))].sort();
}

/** Every route a pass may take, primary first. */
export function extractionMeasurementRoutes(snapshot: ExtractionMeasurementSnapshot): ModelRef[] {
  return snapshot.model.fallback ? [snapshot.model.primary, snapshot.model.fallback] : [snapshot.model.primary];
}

/** The measurement runs in Portuguese, as the script always ran it. */
const localeHint = "pt-BR" as const;
/**
 * One pass at a time. The governed gateway reserves each attempt before it is sent and pairs it
 * with the one call log that follows, so passes cannot overlap; the candidate list is merged in
 * pass order either way, so the extraction is the one four lanes would produce.
 */
const concurrency = 1;

/**
 * How many passes (evidence windows and table passes) each document takes, counted by the
 * extractor itself against a port that answers nothing: every pass is attempted once and fails,
 * no model is involved, and the count is the extractor's own plan, so it cannot drift from it.
 */
export async function extractionMeasurementPasses(snapshot: ExtractionMeasurementSnapshot): Promise<number[]> {
  const silent = {
    complete: async () => { throw new Error("extraction_plan_only"); },
    spent: () => ({costUsd: 0, calls: 0, unknownCostCalls: 0, budgetExposureUsd: 0}),
  } as unknown as ModelGateway;
  const passes: number[] = [];
  for (const document of snapshot.documents) {
    const {chunks} = await extractDocument({layer: document.layer, profile: document.profile, fileName: document.name, gateway: silent, localeHint, concurrency});
    passes.push(chunks.total);
  }
  return passes;
}

const failureSchema = z.object({pass: z.number().int().positive(), of: z.number().int().positive(), message: z.string().max(2_000)}).strict();

/**
 * What the models answered for one document, as `extractDocument` keeps it: the raw candidates
 * (before renumbering, verification or normalisation), the fields reported absent, the alerts and
 * the counts of its passes. Verification is deterministic over the snapshot's layer and profile, so
 * its product is not published: the reader rebuilds it, which keeps a long document well inside
 * the size a committed result may have.
 */
export const measuredExtractionSchema = z.object({
  raw: z.array(exactly(rawExtractionCandidateSchema)),
  absentFields: z.array(z.string()),
  alerts: z.array(z.string()),
  chunks: z.object({total: count, failed: count}).strict(),
  malformed: count,
  usage: z.object({calls: count, costUsd: z.number().nonnegative(), inputTokens: count, outputTokens: count}).strict(),
}).strict();

/**
 * What the extraction family publishes when a governed evaluation succeeds: per document, in the
 * snapshot's order, what the models answered, the passes that failed with the gateway's own
 * message, and the time the extractor took. A partial evaluation publishes only its reason.
 */
export const extractionMeasurementResultSchema = z.object({
  schemaVersion: z.literal("extraction-measurement-result.v1"),
  extractor: z.object({version: z.string().min(1).max(120), promptVersion: z.string().min(1).max(120)}).strict(),
  documents: z.array(z.object({
    name: z.string().min(1).max(300),
    extraction: measuredExtractionSchema,
    failures: z.array(failureSchema),
    ms: count,
  }).strict()).min(1).max(100),
}).strict();
export type ExtractionMeasurementResult = z.infer<typeof extractionMeasurementResultSchema>;

/** JSON as the result is published: what `JSON.stringify` drops (an undefined field) is not published either. */
const published = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/**
 * The extraction of every document of the snapshot, one pass at a time, through the gateway it is
 * given. A pass the model fails stays a failed pass, reported as the script always reported it.
 * Anything else the gateway throws is the governed transport refusing or stopping the run (a
 * denied or unaffordable reservation, a paused switch, a lost lease): later passes then fail at
 * once without reaching the gateway, and the run ends with that refusal instead of publishing an
 * extraction with holes the model did not make. Pure over its arguments: the clock times each
 * document.
 */
export async function runExtractionMeasurement(snapshot: ExtractionMeasurementSnapshot, gateway: ModelGateway, clock: () => Date = () => new Date()): Promise<ExtractionMeasurementResult> {
  let refusal: {error: unknown} | null = null;
  // Read through a function: the gateway wrapper sets it behind the control flow.
  const refused = () => refusal;
  const governed: ModelGateway = {
    complete: async (request) => {
      // After a refusal no later pass reaches the gateway at all: each fails with the same refusal.
      const stop = refused();
      if (stop) throw stop.error;
      try {
        return await gateway.complete(request);
      } catch (error) {
        if (!(error instanceof ModelGatewayError)) refusal ??= {error};
        throw error;
      }
    },
    spent: () => gateway.spent(),
  };
  const documents: ExtractionMeasurementResult["documents"] = [];
  for (const document of snapshot.documents) {
    const failures: Array<{pass: number; of: number; message: string}> = [];
    const started = clock().getTime();
    const extraction = await extractDocument({
      layer: document.layer,
      profile: document.profile,
      fileName: document.name,
      gateway: governed,
      localeHint,
      concurrency,
      onProgress: (progress) => {
        if (progress.stage === "chunk_failed") failures.push({pass: progress.chunk, of: progress.total, message: progress.message.slice(0, 2_000)});
      },
    });
    const stop = refused();
    if (stop) throw stop.error;
    const {raw, absentFields, alerts, chunks, malformed, usage} = extraction;
    documents.push({name: document.name, extraction: published({raw, absentFields, alerts, chunks, malformed, usage}), failures, ms: Math.max(0, clock().getTime() - started)});
  }
  // Only what the script can read back is published.
  return extractionMeasurementResultSchema.parse({schemaVersion: "extraction-measurement-result.v1", extractor: {...snapshot.extractor}, documents});
}

/** A committed extraction measurement as the script uses it: each document's extraction whole, as `extractDocument` returns it. */
export type ExtractionMeasurementReading = {
  extractor: ExtractionMeasurementResult["extractor"];
  documents: Array<{name: string; extraction: ExtractionResult; failures: ExtractionMeasurementResult["documents"][number]["failures"]; ms: number}>;
};

/**
 * The committed result of a governed extraction measurement, read strictly and bound to the
 * snapshot this process sent: the same extractor and prompt, the same documents in the same order,
 * and pass counts that add up and, when the plan is given, are the plan of these very layers.
 * Anything else is not the extraction of these inputs, and nothing of it is used. The verified
 * candidates are then rebuilt exactly as `extractDocument` builds them: the published raw
 * candidates, renumbered by table and verified over this document's own layer and profile.
 */
export function readExtractionMeasurementResult(value: unknown, snapshot: ExtractionMeasurementSnapshot, plan?: readonly number[]): ExtractionMeasurementReading {
  const result = extractionMeasurementResultSchema.parse(value);
  const mismatch = (what: string) => new Error(`extraction_result_mismatch: ${what}`);
  if (!isDeepStrictEqual(result.extractor, snapshot.extractor)) throw mismatch("extractor");
  if (result.documents.length !== snapshot.documents.length) throw mismatch("documents");
  const documents = snapshot.documents.map((document, index): ExtractionMeasurementReading["documents"][number] => {
    const entry = result.documents[index]!;
    if (entry.name !== document.name) throw mismatch(`document ${index + 1}`);
    const {chunks, usage} = entry.extraction;
    // A failed evidence window counts among the windows and a failed table pass among all passes,
    // as the extractor reports them, so each failure sits inside the document's total.
    if (chunks.failed > chunks.total || usage.calls !== chunks.total - chunks.failed || entry.failures.length !== chunks.failed
      || entry.failures.some((failure) => failure.pass > failure.of || failure.of > chunks.total)
      || (plan !== undefined && plan[index] !== chunks.total)) {
      throw mismatch(`passes of ${document.name}`);
    }
    const report = verifyCandidates(renumberByTable(entry.extraction.raw), {
      index: indexLayer(document.layer),
      layer: document.layer,
      profile: document.profile,
      documentVersion: document.layer.documentVersion,
      localeHint,
    });
    return {name: entry.name, extraction: {...entry.extraction, candidates: report.verified, rejected: report.rejected}, failures: entry.failures, ms: entry.ms};
  });
  return {extractor: result.extractor, documents};
}
