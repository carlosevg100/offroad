import {z} from "zod";
import {observationDimensionsSchema, observationValueSchema} from "./observation";

/** A working choice has a purpose and a complete interpretation, never a global official bit. */
export const adoptionDimensionsSchema = observationDimensionsSchema.refine((d) =>
  d.entityId !== null && d.perimeter !== null && d.periodEnd !== null
  && d.unit !== null && d.scale !== null && d.scenario !== null && d.definitionVersionId !== null,
{message: "Resolve the interpretation explicitly before choosing a calculation basis"});

const revisionFields = {
  requestId: z.uuid(),
  workId: z.uuid(),
  purpose: z.string().trim().min(3).max(300),
  contextKey: z.string().trim().min(1).max(160),
  /** Null is an explicit assertion that no revision exists, not an instruction to take latest. */
  expectedVersionId: z.uuid().nullable(),
  reason: z.string().trim().min(5).max(2000),
};

export const adoptObservationForWorkSchema = z.strictObject({
  ...revisionFields,
  observationId: z.uuid(),
});

export const proposeAssumptionRevisionSchema = z.strictObject({
  ...revisionFields,
  fieldPath: z.string().trim().min(1).max(300),
  dimensions: adoptionDimensionsSchema,
  value: observationValueSchema,
  /** A contribution may be original; referencing private evidence preserves its restrictions. */
  referenceObservationId: z.uuid().nullable(),
}).refine((p) => p.value.type !== "number" || p.dimensions.currency !== null
  || ["ratio", "percent", "percentage", "count", "days", "months", "years"].includes(p.dimensions.unit ?? ""),
{message: "A monetary hypothesis requires explicit currency"});

export const adoptionBasisEntrySchema = z.strictObject({
  decisionId: z.uuid(),
  slotKey: z.string().regex(/^[a-f0-9]{64}$/),
  kind: z.enum(["observation", "hypothesis"]),
  fieldPath: z.string().min(1).max(300),
  dimensions: adoptionDimensionsSchema,
  value: observationValueSchema,
  observationId: z.uuid().nullable(),
  referenceValue: observationValueSchema.nullable(),
  referenceDimensions: observationDimensionsSchema.nullable(),
  definitionKind: z.enum(["reported", "managerial", "contractual"]),
  actorId: z.uuid(),
  reason: z.string().min(5).max(2000),
}).refine((e) => e.kind !== "observation" || e.observationId !== null,
{message: "An adopted observation requires its immutable identity"})
  .refine((e) => e.value.type !== "number" || e.dimensions.currency !== null
    || ["ratio", "percent", "percentage", "count", "days", "months", "years"].includes(e.dimensions.unit ?? ""),
  {message: "Monetary basis requires currency"});

export const adoptionBasisSnapshotSchema = z.strictObject({
  schemaVersion: z.literal("contextual-adoption.v1"),
  versionId: z.uuid(),
  setId: z.uuid(),
  workId: z.uuid(),
  purpose: z.string().min(3).max(300),
  contextKey: z.string().min(1).max(160),
  revision: z.number().int().positive(),
  previousVersionId: z.uuid().nullable(),
  classification: z.literal("working_basis"),
  entries: z.array(adoptionBasisEntrySchema).min(1).max(256),
}).refine((b) => new Set(b.entries.map((e) => e.slotKey)).size === b.entries.length,
{message: "A basis cannot select two values for one slot"})
  .refine((b) => new Set(b.entries.map((e) => e.decisionId)).size === b.entries.length,
  {message: "A contribution cannot be repeated under another slot"});

/** The authorized SQL reader supplies the exact immutable JSON bytes and their digest. */
export const adoptionBasisEnvelopeSchema = z.strictObject({
  canonical: z.string().min(2).max(1048576),
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
});

export type AdoptObservationForWork = z.infer<typeof adoptObservationForWorkSchema>;
export type ProposeAssumptionRevision = z.infer<typeof proposeAssumptionRevisionSchema>;
export type AdoptionBasisEntry = z.infer<typeof adoptionBasisEntrySchema>;
export type AdoptionBasisSnapshot = z.infer<typeof adoptionBasisSnapshotSchema>;
export type AdoptionBasisEnvelope = z.infer<typeof adoptionBasisEnvelopeSchema>;
