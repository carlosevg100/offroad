import {z} from "zod";

/** Null means unknown, never a default perimeter, currency or accounting definition. */
export const observationDimensionsSchema = z.strictObject({
  entityId: z.uuid().nullable(),
  perimeter: z.string().trim().min(1).max(300).nullable(),
  periodStart: z.iso.date().nullable(),
  periodEnd: z.iso.date().nullable(),
  currency: z.string().regex(/^[A-Z]{3}$/).nullable(),
  unit: z.string().trim().min(1).max(80).nullable(),
  scale: z.string().regex(/^(?:[1-9]\d*(?:\.\d+)?|0\.\d*[1-9]\d*)$/).nullable(),
  scenario: z.string().trim().min(1).max(160).nullable(),
  definitionVersionId: z.uuid().nullable(),
}).refine((d) => !d.periodStart || !d.periodEnd || d.periodStart <= d.periodEnd, {message: "Period starts after its end"});

export const observationValueSchema = z.discriminatedUnion("type", [
  z.strictObject({type: z.literal("number"), value: z.string().regex(/^-?\d+(?:\.\d+)?$/)}),
  z.strictObject({type: z.literal("text"), value: z.string()}),
  z.strictObject({type: z.literal("date"), value: z.iso.date()}),
  z.strictObject({type: z.literal("boolean"), value: z.boolean()}),
  z.strictObject({type: z.literal("list"), value: z.array(z.string())}),
]);

/** A record of a source assertion; this command cannot adopt, publish or verify itself. */
export const recordObservationSchema = z.strictObject({
  requestId: z.uuid(),
  dossierId: z.uuid(),
  fieldPath: z.string().trim().min(1).max(300),
  dimensions: observationDimensionsSchema,
  value: observationValueSchema,
  sourceVersionId: z.uuid(),
  anchor: z.record(z.string(), z.json()).refine((a) => Object.keys(a).length > 0, {message: "Source anchor required"}),
  supersedesId: z.uuid().nullable(),
});

export type ObservationDimensions = z.infer<typeof observationDimensionsSchema>;
export type RecordObservation = z.infer<typeof recordObservationSchema>;

export const metricDefinitionVersionSchema = z.strictObject({
  kind: z.enum(["reported", "managerial", "contractual"]),
  definition: z.string().trim().min(1).max(20000),
  contractSourceVersionId: z.uuid().nullable(),
  contractAnchor: z.record(z.string(), z.json()).nullable(),
}).refine((v) => v.kind !== "contractual" || (v.contractSourceVersionId !== null && v.contractAnchor !== null && Object.keys(v.contractAnchor).length > 0), {message: "A contractual definition requires its contract version and anchor"});
