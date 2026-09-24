import {isDeepStrictEqual} from "node:util";

import {z} from "zod";
import {documentKinds, documentKindSchema, informationClassSchema, type DocumentKind, type InformationClass} from "@offroad/credit-ontology";
import {documentLayerSchema, layerKindSchema} from "@offroad/document-intelligence";
import type {ParseResult, ParserWarningCode} from "@offroad/document-parsers";
import type {ModelGateway, ModelRef} from "@offroad/model-gateway";

import {createClassifier} from "./classify";

/**
 * The classification measurement as a governed evaluation family (stage 17, increment 5).
 *
 * `measure-classification.ts` parses the documents of a gold case where it runs, as it always did,
 * and sends this snapshot: each document's parse result whole, the classifier version it was built
 * for and the model settings of the task. The worker classifies each document through the governed
 * gateway with the same classifier and publishes, per document, what the script's record takes
 * from it; the script compares that with the gold where it runs. The expected profiles are the
 * answer key of this measurement, so they never enter the snapshot.
 */

const hash = z.string().regex(/^[a-f0-9]{64}$/);
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
/** One to two hundred characters with no surrounding space: what the evaluation contract accepts as a case label. */
const label = z.string().min(1).max(200).refine((value) => value.trim() === value, "no surrounding space");

/** A schema read with nothing stripped and no default filled in: the value passes only when it is the schema's own reading of it. */
function exactly<T extends z.ZodType>(schema: T) {
  return z.custom<z.output<T>>((value) => {
    const parsed = schema.safeParse(value);
    return parsed.success && isDeepStrictEqual(parsed.data, value);
  }, {message: "not exactly the declared shape"});
}

const warningCodes = ["scanned_page", "no_text", "encrypted", "unsupported_legacy_format", "unsupported_format", "hidden_sheet", "formula_without_value",
  "limit_reached", "parse_error"] as const satisfies readonly ParserWarningCode[];
// A parser warning code this list does not name fails to compile here, instead of refusing a snapshot later.
const everyWarningCode: [Exclude<ParserWarningCode, (typeof warningCodes)[number]>] extends [never] ? true : never = true;
void everyWarningCode;

const routeSchema = z.object({
  provider: z.enum(["anthropic", "openai"]),
  model: z.string().min(1).max(120),
  effort: z.enum(["low", "medium", "high", "xhigh", "max"]),
}).strict();

/** The parse result of one document, whole, as the parser produced it where the script runs. */
export const measuredParseSchema = z.object({
  layer: exactly(documentLayerSchema),
  parserVersions: z.record(z.string().min(1).max(120), z.string().min(1).max(200)),
  /** Null when the file needed no conversion; the parser leaves the field out then. */
  conversion: z.object({from: z.string().min(1).max(200), to: z.string().min(1).max(200), by: z.string().min(1).max(200), version: z.string().min(1).max(200)}).strict().nullable(),
  warnings: z.array(z.object({code: z.enum(warningCodes), message: z.string().max(2_000), where: z.string().max(500).optional()}).strict()).max(10_000),
  detected: z.object({kind: layerKindSchema, mime: z.string().min(1).max(200), extension: z.string().max(40), mismatch: z.boolean()}).strict(),
}).strict();

export const classificationMeasurementSnapshotSchema = z.object({
  schemaVersion: z.literal("classification-measurement-snapshot.v1"),
  caseId: label,
  caseVersion: label,
  /** What the snapshot was built for; a worker running another classifier refuses it before anything is sent. */
  classifierVersion: z.string().min(1).max(120),
  model: z.object({
    primary: routeSchema,
    fallback: routeSchema.nullable(),
    maxOutputTokens: z.number().int().min(1).max(128_000),
    timeoutMs: z.number().int().min(1_000).max(3_600_000),
  }).strict().refine((model) => model.fallback === null
    || model.fallback.provider !== model.primary.provider || model.fallback.model !== model.primary.model, "the fallback is another route"),
  documents: z.array(z.object({
    /** The file name, which is also the layer's document id. */
    name: z.string().min(1).max(300),
    /** SHA-256 of the file's bytes; the contract declares it as a source. */
    sha256: hash,
    parsed: measuredParseSchema,
  }).strict()).min(1).max(100),
}).strict().superRefine((snapshot, context) => {
  const names = snapshot.documents.map((document) => document.name);
  if (new Set(names).size !== names.length) context.addIssue({code: "custom", path: ["documents"], message: "each document is named once"});
  snapshot.documents.forEach((document, index) => {
    if (document.parsed.layer.documentId !== document.name || document.parsed.detected.kind !== document.parsed.layer.kind) {
      context.addIssue({code: "custom", path: ["documents", index], message: "the parse belongs to the document it is sent with"});
    }
  });
});
export type ClassificationMeasurementSnapshot = z.infer<typeof classificationMeasurementSnapshotSchema>;

/** Every content hash the snapshot carries: the bytes of each document it classifies. */
export function classificationMeasurementContentHashes(snapshot: ClassificationMeasurementSnapshot): string[] {
  return [...new Set(snapshot.documents.map((document) => document.sha256))].sort();
}

/** Every route a classification may take, primary first. */
export function classificationMeasurementRoutes(snapshot: ClassificationMeasurementSnapshot): ModelRef[] {
  return snapshot.model.fallback ? [snapshot.model.primary, snapshot.model.fallback] : [snapshot.model.primary];
}

/**
 * What the classification family publishes when a governed evaluation succeeds: per document, in
 * the snapshot's order, exactly the columns of the script's record that come from the classifier
 * (kind, class, period, confidence, cost, calls) and the time it took. The expected columns and
 * the comparison are the script's own. A partial evaluation publishes only its reason.
 */
export const classificationMeasurementResultSchema = z.object({
  schemaVersion: z.literal("classification-measurement-result.v1"),
  classifierVersion: z.string().min(1).max(120),
  documents: z.array(z.object({
    document: z.string().min(1).max(300),
    actualKind: documentKindSchema,
    actualClass: informationClassSchema,
    /** The classifier's own period pattern; null when the document does not state one. */
    actualPeriodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
    confidence: z.number().min(0).max(1),
    costUsd: z.number().nonnegative(),
    calls: z.number().int().positive(),
    ms: count,
  }).strict()).min(1).max(100),
}).strict();
export type ClassificationMeasurementResult = z.infer<typeof classificationMeasurementResultSchema>;

/** The parse result the classifier reads, rebuilt from the snapshot: a missing conversion is left out, as the parser leaves it. */
function parseResultOf(parsed: ClassificationMeasurementSnapshot["documents"][number]["parsed"]): ParseResult {
  const {conversion, warnings, ...rest} = parsed;
  return {
    ...rest,
    warnings: warnings.map(({where, ...warning}) => ({...warning, ...(where === undefined ? {} : {where})})),
    ...(conversion ? {conversion} : {}),
  };
}

/**
 * Classifies every document of the snapshot, in order, with the product's classifier over the
 * gateway it is given. A classification that fails ends the run, as it ended the script before.
 * Pure over its arguments: the clock times each document.
 */
export async function runClassificationMeasurement(snapshot: ClassificationMeasurementSnapshot, gateway: ModelGateway, clock: () => Date = () => new Date()): Promise<ClassificationMeasurementResult> {
  const classify = createClassifier(gateway);
  const documents: ClassificationMeasurementResult["documents"] = [];
  for (const document of snapshot.documents) {
    const started = clock().getTime();
    const {profile, usage} = await classify({parsed: parseResultOf(document.parsed), fileName: document.name, locale: "pt-BR"});
    documents.push({
      document: document.name,
      actualKind: profile.document_kind as DocumentKind,
      actualClass: profile.information_class as InformationClass,
      actualPeriodEnd: profile.period_end ?? null,
      confidence: profile.confidence,
      costUsd: Number(usage?.classifyCostUsd ?? 0),
      calls: Number(usage?.classifyCalls ?? 1),
      ms: Math.max(0, clock().getTime() - started),
    });
  }
  // Only what the script can read back is published.
  return classificationMeasurementResultSchema.parse({schemaVersion: "classification-measurement-result.v1", classifierVersion: snapshot.classifierVersion, documents});
}

/**
 * The committed result of a governed classification measurement, read strictly and bound to the
 * snapshot this process sent: the same classifier, the same documents in the same order, and a
 * class that follows the kind wherever the ontology defines it, as the classifier derives it.
 * Anything else is not the classification of these inputs, and nothing of it is used.
 */
export function readClassificationMeasurementResult(value: unknown, snapshot: ClassificationMeasurementSnapshot): ClassificationMeasurementResult {
  const result = classificationMeasurementResultSchema.parse(value);
  const mismatch = (what: string) => new Error(`classification_result_mismatch: ${what}`);
  if (result.classifierVersion !== snapshot.classifierVersion) throw mismatch("classifier");
  if (result.documents.length !== snapshot.documents.length) throw mismatch("documents");
  snapshot.documents.forEach((document, index) => {
    const entry = result.documents[index]!;
    if (entry.document !== document.name) throw mismatch(`document ${index + 1}`);
    const definition = documentKinds.find((candidate) => candidate.kind === entry.actualKind);
    if (definition && definition.informationClass !== entry.actualClass) throw mismatch(`class of ${document.name}`);
  });
  return result;
}
