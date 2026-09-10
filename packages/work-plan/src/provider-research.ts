import {publicCapitalCatalogReference} from "@offroad/public-research/capital-catalog";
import {createHash} from "node:crypto";
import {z} from "zod";

const sha256 = z.string().regex(/^[a-f0-9]{64}$/);
const observationSchema = z.object({
  criterion: z.string().min(1).max(100),
  value: z.string().min(1).max(2000),
  provenance: z.string().min(1).max(100),
  observedAt: z.iso.datetime({offset: true}).nullable(),
}).strict();
const providerResearchPayloadSchema = z.object({
  schemaVersion: z.literal("provider-research.v1"),
  scope: z.literal("research_only"),
  projectId: z.uuid(),
  planId: z.uuid(),
  planFingerprint: sha256,
  locale: z.enum(["pt-BR", "en-US"]),
  objective: z.string().min(1).max(20000),
  asOf: z.iso.datetime({offset: true}),
  sourceFingerprint: sha256,
  providers: z.array(z.object({
    providerId: z.string().min(1).max(200),
    name: z.string().min(1).max(500),
    sourceClass: z.enum(["directory", "registered"]),
    observations: z.array(observationSchema).max(100),
    gaps: z.array(z.string().min(1).max(500)).max(30),
  }).strict()).max(500),
  limitations: z.array(z.string().min(1).max(1000)).min(1).max(30),
  shortlistAuthorized: z.literal(false),
  externalEffectAllowed: z.literal(false),
}).strict();
export const providerResearchPublicCatalogSchema = z.object({
  schemaVersion: z.literal(publicCapitalCatalogReference.schemaVersion), snapshotId: z.literal(publicCapitalCatalogReference.snapshotId),
  sourceFingerprint: z.literal(publicCapitalCatalogReference.sourceFingerprint), asOf: z.literal(publicCapitalCatalogReference.asOf),
}).strict();
const publicSource = z.object({id: z.string().min(1), publisher: z.string().min(1).max(500), url: z.string().url().max(2000).refine(value => new URL(value).protocol === "https:"), accessedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)}).strict();
const providerResearchPayloadV2Schema = providerResearchPayloadSchema.extend({
  schemaVersion: z.literal("provider-research.v2"), publicCatalog: providerResearchPublicCatalogSchema,
  providers: z.array(providerResearchPayloadSchema.shape.providers.element.extend({
    sourceClass: z.enum(["directory", "registered", "public_research"]),
    observations: z.array(observationSchema.extend({sources: z.array(publicSource).min(1).max(20).optional()}).strict()).max(100),
  }).strict().superRefine((row, ctx) => {
    if (row.sourceClass === "public_research" && (row.observations.length === 0 || row.observations.some(observation => !observation.sources?.length))) ctx.addIssue({code: "custom", message: "Public research requires linked evidence"});
  })).max(528),
}).strict();
const payloadSchema = z.union([providerResearchPayloadSchema, providerResearchPayloadV2Schema]);
export const providerResearchArtifactSchema = z.union([providerResearchPayloadSchema.extend({fingerprint: sha256}).strict(), providerResearchPayloadV2Schema.extend({fingerprint: sha256}).strict()]);
export type ProviderResearchArtifact = z.infer<typeof providerResearchArtifactSchema>;
export type ProviderResearchPayload = z.infer<typeof payloadSchema>;

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
  return JSON.stringify(value);
}
export function compileProviderResearchArtifact(input: ProviderResearchPayload): ProviderResearchArtifact {
  const payload = payloadSchema.parse(input);
  return {...payload, fingerprint: createHash("sha256").update(canonical(payload)).digest("hex")};
}
/** Bind the research to the current project and approved plan; never treat it as a match screen. */
export function readProviderResearchArtifact(value: unknown, binding: {projectId: string; planId: string; planFingerprint: string}): ProviderResearchArtifact | null {
  const parsed = providerResearchArtifactSchema.safeParse(value);
  if (!parsed.success) return null;
  const {fingerprint, ...payload} = parsed.data;
  if (payload.projectId !== binding.projectId || payload.planId !== binding.planId || payload.planFingerprint !== binding.planFingerprint) return null;
  return compileProviderResearchArtifact(payload).fingerprint === fingerprint ? parsed.data : null;
}
