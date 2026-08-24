import {z} from "zod";

export const retrievalSourceSchema = z.enum([
  "case",
  "house_playbook",
  "mandate_note",
  "precedent",
]);
export type RetrievalSource = z.infer<typeof retrievalSourceSchema>;

export const citationSchema = z.object({
  key: z.string().min(1).max(240),
  label: z.string().min(1).max(500),
  anchor: z.record(z.string(), z.unknown()),
  sourceDocumentId: z.string().min(1).optional(),
}).strict();
export type RetrievalCitation = z.infer<typeof citationSchema>;

const common = {
  id: z.string().min(1),
  content: z.string().trim().min(1).max(12_000),
  contentHash: z.string().regex(/^[0-9a-f]{64}$/),
  citation: citationSchema,
  locale: z.enum(["pt-BR", "en-US", "mixed"]).default("mixed"),
  tags: z.array(z.string().min(1).max(100)).max(50).default([]),
};

export const caseChunkSchema = z.object({
  ...common,
  source: z.literal("case"),
  organizationId: z.string().min(1),
  intakeSessionId: z.string().min(1),
  opportunityId: z.string().min(1).optional(),
  sourceDocumentId: z.string().min(1),
  documentVersion: z.number().int().positive(),
}).strict();

export const playbookChunkSchema = z.object({
  ...common,
  source: z.literal("house_playbook"),
  playbookVersion: z.string().min(1),
  governanceStatus: z.literal("approved"),
}).strict();

export const mandateNoteChunkSchema = z.object({
  ...common,
  source: z.literal("mandate_note"),
  fundId: z.string().min(1),
  mandateVersionId: z.string().min(1).optional(),
  observedAt: z.iso.date(),
  embedding: z.array(z.number().finite()).min(2).optional(),
}).strict();

export const precedentChunkSchema = z.object({
  ...common,
  source: z.literal("precedent"),
  precedentId: z.string().min(1),
  authorization: z.literal("granted"),
  anonymization: z.literal("approved"),
  governance: z.literal("approved"),
  authorizedPurposes: z.array(z.string().min(1)).min(1),
}).strict();

export const governedChunkSchema = z.discriminatedUnion("source", [
  caseChunkSchema,
  playbookChunkSchema,
  mandateNoteChunkSchema,
  precedentChunkSchema,
]);
export type GovernedChunk = z.infer<typeof governedChunkSchema>;
export type CaseChunk = z.infer<typeof caseChunkSchema>;
export type PlaybookChunk = z.infer<typeof playbookChunkSchema>;
export type MandateNoteChunk = z.infer<typeof mandateNoteChunkSchema>;
export type PrecedentChunk = z.infer<typeof precedentChunkSchema>;

export const retrievalRequestSchema = z.object({
  query: z.string().trim().min(2).max(2_000),
  organizationId: z.string().min(1),
  intakeSessionId: z.string().min(1).optional(),
  opportunityId: z.string().min(1).optional(),
  playbookVersion: z.string().min(1),
  allowedFundIds: z.array(z.string().min(1)).max(1_000).default([]),
  precedentPurpose: z.string().min(1).optional(),
  queryEmbedding: z.array(z.number().finite()).min(2).optional(),
  limit: z.number().int().min(1).max(50).default(12),
  minScore: z.number().min(0).max(1).default(0.05),
}).strict();
export type RetrievalRequest = z.infer<typeof retrievalRequestSchema>;

export type RetrievedChunk = {
  chunk: GovernedChunk;
  score: number;
  citation: RetrievalCitation;
};

export type RetrievalResult = {
  requestFingerprint: string;
  retrieved: RetrievedChunk[];
  citations: RetrievalCitation[];
  abstained: boolean;
  abstentionReason?: "no_governed_evidence" | "scope_not_established";
  excluded: Record<"scope" | "version" | "mandate" | "governance" | "relevance", number>;
};
