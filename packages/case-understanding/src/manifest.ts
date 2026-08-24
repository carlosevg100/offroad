import {createHash} from "node:crypto";
import {z} from "zod";

/** A reproducible record of every version and input that produced a case artifact. */
export const artifactManifestSchemaVersion = "2026.08.24-v1";

export const modelInvocationManifestSchema = z.object({
  invocationId: z.string().min(1),
  task: z.string().min(1),
  provider: z.string().min(1),
  model: z.string().min(1),
  reasoning: z.string().min(1).optional(),
  promptFingerprint: z.string().min(1),
  inputFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  outputFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
});

export const sourceDocumentManifestSchema = z.object({
  documentId: z.string().min(1),
  versionId: z.string().min(1),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
});

export const outputArtifactManifestSchema = z.object({
  artifactId: z.string().min(1),
  kind: z.enum([
    "case_state",
    "credit_opinion",
    "teaser",
    "credit_memo",
    "term_sheet",
    "diligence_qa",
    "data_room_index",
    "mandate_screen",
    "other",
  ]),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
});

export const pipelineVersionManifestSchema = z.object({
  parser: z.string().min(1),
  ontology: z.string().min(1),
  extractionPrompt: z.string().min(1),
  modelPolicy: z.string().min(1),
  reconciliation: z.string().min(1),
  financialCore: z.string().min(1),
  playbook: z.string().min(1),
  marketData: z.object({version: z.string().min(1), asOf: z.iso.datetime()}),
  caseUnderstanding: z.string().min(1),
  materialCompiler: z.string().min(1),
  template: z.string().min(1),
  matching: z.string().min(1),
});

export const caseArtifactManifestSchema = z.object({
  schemaVersion: z.literal(artifactManifestSchemaVersion),
  caseId: z.string().min(1),
  runId: z.string().min(1),
  createdAt: z.iso.datetime(),
  locale: z.enum(["pt-BR", "en-US"]),
  inputFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  versions: pipelineVersionManifestSchema,
  models: z.array(modelInvocationManifestSchema),
  sources: z.array(sourceDocumentManifestSchema).min(1),
  outputs: z.array(outputArtifactManifestSchema),
  manifestFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
}).superRefine((manifest, context) => {
  reportDuplicates(manifest.models.map((model) => model.invocationId), "models", context);
  reportDuplicates(manifest.sources.map((source) => `${source.documentId}:${source.versionId}`), "sources", context);
  reportDuplicates(manifest.outputs.map((output) => output.artifactId), "outputs", context);
});
export type CaseArtifactManifest = z.infer<typeof caseArtifactManifestSchema>;

type ManifestInput = Omit<CaseArtifactManifest, "schemaVersion" | "manifestFingerprint">;

export function buildCaseArtifactManifest(raw: ManifestInput): CaseArtifactManifest {
  const input = z.object({
    caseId: z.string().min(1),
    runId: z.string().min(1),
    createdAt: z.iso.datetime(),
    locale: z.enum(["pt-BR", "en-US"]),
    inputFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    versions: pipelineVersionManifestSchema,
    models: z.array(modelInvocationManifestSchema),
    sources: z.array(sourceDocumentManifestSchema).min(1),
    outputs: z.array(outputArtifactManifestSchema),
  }).parse(raw);

  const ordered = {
    ...input,
    models: [...input.models].sort(compareStable),
    sources: [...input.sources].sort(compareStable),
    outputs: [...input.outputs].sort(compareStable),
  };
  const payload = {schemaVersion: artifactManifestSchemaVersion, ...ordered};
  const manifestFingerprint = sha256(stableJson(payload));
  return caseArtifactManifestSchema.parse({...payload, manifestFingerprint});
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function compareStable(left: unknown, right: unknown): number {
  return stableJson(left).localeCompare(stableJson(right));
}

function reportDuplicates(values: string[], path: string, context: z.RefinementCtx): void {
  if (new Set(values).size === values.length) return;
  context.addIssue({code: "custom", path: [path], message: `${path} must not contain duplicate identifiers`});
}
