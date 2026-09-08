import {z} from "zod";

const identifier = z.string().trim().min(1).max(120);
const date = z.iso.date().refine((value) => {
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, "A real calendar date is required.");
export const economicContextDimensionSchema = z.enum(["sector", "subsector", "business_model", "revenue_model", "lifecycle", "recourse", "jurisdiction"]);
export const economicContextAttributeSchema = z.object({
  dimension: economicContextDimensionSchema,
  // Deliberately open vocabulary: the canonical catalog owns supported values.
  value: identifier.nullable(),
  status: z.enum(["confirmed", "proposed", "inferred", "conflicting", "unknown"]),
  evidenceRefs: z.array(z.object({sourceId: identifier, sourceVersion: identifier, anchor: z.string().trim().min(1).max(2_000)}).strict()).max(50),
  // Economic validity period, which may be future relative to knowledge asOf.
  period: z.object({start: date, end: date}).strict().optional(),
}).strict().superRefine((attribute, context) => {
  if (attribute.status === "unknown" && attribute.value !== null) context.addIssue({code: "custom", path: ["value"], message: "Unknown attributes must not assert an activation value."});
  if (attribute.status !== "unknown" && attribute.value === null) context.addIssue({code: "custom", path: ["value"], message: "A declared attribute requires a value."});
  if (attribute.status === "confirmed" && !attribute.evidenceRefs.length) context.addIssue({code: "custom", path: ["evidenceRefs"], message: "Confirmed attributes require source evidence."});
  if (attribute.period && attribute.period.start > attribute.period.end) context.addIssue({code: "custom", path: ["period"], message: "Period start must not follow end."});
  const seen = new Set<string>();
  attribute.evidenceRefs.forEach((reference, index) => {
    const identity = JSON.stringify(reference);
    if (seen.has(identity)) context.addIssue({code: "custom", path: ["evidenceRefs", index], message: "Duplicate source reference."});
    seen.add(identity);
  });
});
export const economicContextObjectSchema = z.object({
  id: identifier,
  type: z.enum(["company", "group", "spv", "asset", "receivables_pool", "contract"]),
  parentObjectId: identifier.optional(),
  attributes: z.array(economicContextAttributeSchema).max(100),
}).strict().superRefine((object, context) => {
  const identities = new Set<string>();
  object.attributes.forEach((attribute, index) => {
    const identity = JSON.stringify([attribute.dimension, attribute.value, attribute.period?.start ?? null, attribute.period?.end ?? null]);
    if (identities.has(identity)) context.addIssue({code: "custom", path: ["attributes", index], message: "Duplicate dimension/value/period identity; consolidate evidence and resolve its status explicitly."});
    identities.add(identity);
  });
});

/** Evidence-backed declarations, not proof of repository authority or financial expertise.
 * Parent links express containment only; attributes are never inherited automatically.
 * Distinct values may coexist (e.g. merchant and contracted revenue). Conflicts are explicit
 * source-review judgments, not inferred solely from a pair of different values.
 */
export const economicContextSchema = z.object({
  schemaVersion: z.literal("economic-context.v1"),
  asOf: date,
  objects: z.array(economicContextObjectSchema).min(1).max(200),
}).strict().superRefine((value, context) => {
  // Aggregate budgets supplement local limits before downstream cloning/fingerprinting.
  let attributeCount = 0;
  let referenceCount = 0;
  let anchorCharacters = 0;
  for (const object of value.objects) {
    attributeCount += object.attributes.length;
    for (const attribute of object.attributes) {
      referenceCount += attribute.evidenceRefs.length;
      for (const reference of attribute.evidenceRefs) anchorCharacters += reference.anchor.length;
    }
  }
  if (attributeCount > 500) context.addIssue({code: "custom", path: ["objects"], message: "Context exceeds 500 attributes."});
  if (referenceCount > 2_000) context.addIssue({code: "custom", path: ["objects"], message: "Context exceeds 2000 evidence references."});
  if (anchorCharacters > 200_000) context.addIssue({code: "custom", path: ["objects"], message: "Context exceeds 200000 anchor characters."});
  const objects = new Map(value.objects.map((object) => [object.id, object]));
  if (objects.size !== value.objects.length) context.addIssue({code: "custom", path: ["objects"], message: "Duplicate object identity."});
  value.objects.forEach((object, index) => {
    if (object.parentObjectId && !objects.has(object.parentObjectId)) context.addIssue({code: "custom", path: ["objects", index, "parentObjectId"], message: "Parent object is outside this context."});
    const seen = new Set<string>([object.id]);
    let parent = object.parentObjectId;
    while (parent && objects.has(parent)) {
      if (seen.has(parent)) {context.addIssue({code: "custom", path: ["objects", index, "parentObjectId"], message: "Cyclic parent chain."}); break;}
      seen.add(parent);
      parent = objects.get(parent)!.parentObjectId;
    }
  });
});
export const economicContextIntentSchema = z.enum(["factual_answer", "contract_review", "financial_analysis", "financing_comparison", "market_matching"]);
export const economicContextCompileRequestSchema = z.object({
  schemaVersion: z.literal("economic-context-compile-request.v1"),
  context: economicContextSchema,
  intent: economicContextIntentSchema,
  targetObjectIds: z.array(identifier).min(1).max(200),
}).strict().superRefine((request, context) => {
  const targets = new Set<string>();
  const objects = new Set(request.context.objects.map((object) => object.id));
  request.targetObjectIds.forEach((id, index) => {
    if (targets.has(id)) context.addIssue({code: "custom", path: ["targetObjectIds", index], message: "Duplicate target."});
    if (!objects.has(id)) context.addIssue({code: "custom", path: ["targetObjectIds", index], message: "Target object is outside this context."});
    targets.add(id);
  });
});
export type EconomicContext = z.infer<typeof economicContextSchema>;
export type EconomicContextAttribute = z.infer<typeof economicContextAttributeSchema>;
export type EconomicContextObject = z.infer<typeof economicContextObjectSchema>;
export type EconomicContextCompileRequest = z.infer<typeof economicContextCompileRequestSchema>;
