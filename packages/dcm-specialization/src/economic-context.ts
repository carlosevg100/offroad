import {createHash} from "node:crypto";
import {
  economicContextCompileRequestSchema,
  type EconomicContextAttribute,
  type EconomicContextCompileRequest,
} from "@offroad/agent-contracts";
import {sectorContextCatalog} from "@offroad/credit-playbook";
import {z} from "zod";

const periodSchema = z.object({start: z.iso.date(), end: z.iso.date()}).strict();
const activationSchema = z.object({
  objectId: z.string(), moduleId: z.string(), moduleVersion: z.string(),
  period: periodSchema.nullable(), attributeFingerprints: z.array(z.string()),
  basis: z.literal("declared_confirmed_references_not_verified"),
}).strict();
const requirementSchema = z.object({
  objectId: z.string(), moduleId: z.string(), requirementId: z.string(),
  period: periodSchema.nullable(), activationFingerprint: z.string(),
  evidenceNeeded: z.array(z.string()), scenarioIds: z.array(z.string()),
  methods: z.array(z.object({id: z.string(), status: z.literal("specified")}).strict()),
  marketCriteriaIds: z.array(z.string()), outputSuggestions: z.array(z.string()),
  evidenceStatus: z.literal("not_examined"),
}).strict();
export const economicContextPlanSchema = z.object({
  schemaVersion: z.literal("economic-context-plan.v1"),
  mode: z.literal("planning_only"),
  intent: economicContextCompileRequestSchema.shape.intent,
  contextFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  catalogFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  targetObjectIds: z.array(z.string()),
  activations: z.array(activationSchema),
  requirements: z.array(requirementSchema),
  gaps: z.array(z.object({
    objectId: z.string(),
    code: z.enum(["context_missing", "attribute_unresolved", "attribute_uncovered", "module_context_incomplete", "non_overlapping_periods", "composition_limit"]),
    dimension: z.string().nullable(), value: z.string().nullable(),
    attributeFingerprint: z.string().nullable(), moduleId: z.string().nullable(),
  }).strict()),
  willExecute: z.literal(false), externalEffectAllowed: z.literal(false),
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
export type EconomicContextPlan = z.infer<typeof economicContextPlanSchema>;

/** Object-scoped planning, never evidence verification or executor registration.
 * Parent relations do not imply shared cash, recourse, contracts or inherited attributes.
 * No user role or locale participates in the economic selection.
 */
export function compileEconomicContext(rawRequest: EconomicContextCompileRequest): EconomicContextPlan {
  const request = economicContextCompileRequestSchema.parse(rawRequest);
  const targetObjectIds = [...request.targetObjectIds].sort();
  const objects = request.context.objects.filter((object) => targetObjectIds.includes(object.id))
    .map((object) => ({...object, attributes: object.attributes.map((attribute) => ({
      ...attribute, evidenceRefs: sorted(attribute.evidenceRefs),
    })).sort((a, b) => compare(stableJson(a), stableJson(b)))}))
    .sort((a, b) => compare(a.id, b.id));
  const activations: EconomicContextPlan["activations"] = [];
  const requirements: EconomicContextPlan["requirements"] = [];
  const gaps: EconomicContextPlan["gaps"] = [];
  for (const object of objects) {
    if (object.attributes.length === 0) gaps.push({objectId: object.id, code: "context_missing", dimension: null, value: null, attributeFingerprint: null, moduleId: null});
    for (const attribute of object.attributes) {
      if (attribute.status !== "confirmed") {
        gaps.push({objectId: object.id, code: "attribute_unresolved", dimension: attribute.dimension, value: attribute.value, attributeFingerprint: hash(attribute), moduleId: null});
      } else if (!sectorContextCatalog.some((module) => module.applicability.some((predicate) => predicate.dimension === attribute.dimension && predicate.value === attribute.value))) {
        gaps.push({objectId: object.id, code: "attribute_uncovered", dimension: attribute.dimension, value: attribute.value, attributeFingerprint: hash(attribute), moduleId: null});
      }
    }
    for (const module of sectorContextCatalog) {
      const applicableRequirements = module.requirements.filter((requirement) => requirement.intents.includes(request.intent));
      if (applicableRequirements.length === 0) continue;
      const groups = module.applicability.map((predicate) => object.attributes.filter((attribute) =>
        attribute.status === "confirmed" && attribute.dimension === predicate.dimension && attribute.value === predicate.value
        // An explicit dispute invalidates this support, even if its older assertion says confirmed.
        // Conservatively drop the whole support instead of inventing a reviewed temporal split.
        && !object.attributes.some((other) => other.status === "conflicting"
          && other.dimension === attribute.dimension && other.value === attribute.value
          && periodsOverlap(attribute.period, other.period)),
      ));
      if (groups.every((group) => group.length === 0)) continue;
      const gap = (code: EconomicContextPlan["gaps"][number]["code"]) => gaps.push({objectId: object.id, code, dimension: null, value: null, attributeFingerprint: null, moduleId: module.id});
      if (groups.some((group) => group.length === 0)) {
        // The catalog declares its specific discriminator. Energy alone
        // cannot justify asking for a solar model, nor transport alone a toll model.
        const discriminatorIndex = module.applicability.findIndex((predicate) => predicate.dimension === module.activationDiscriminator.dimension && predicate.value === module.activationDiscriminator.value);
        if (discriminatorIndex >= 0 && groups[discriminatorIndex]!.length > 0) gap("module_context_incomplete");
        continue;
      }
      // Bound adversarial Cartesian expansion without silently losing any required slice.
      if (groups.reduce((count, group) => count * group.length, 1) > 256) {gap("composition_limit"); continue;}
      const combinations = groups.reduce<EconomicContextAttribute[][]>((prior, group) => prior.flatMap((selection) => group.map((attribute) => [...selection, attribute])), [[]]);
      let compatible = false;
      for (const combination of combinations) {
        const periods = combination.flatMap((attribute) => attribute.period ? [attribute.period] : []);
        const period = periods.length ? {start: periods.map((p) => p.start).sort().at(-1)!, end: periods.map((p) => p.end).sort()[0]!} : null;
        if (period && period.start > period.end) continue;
        compatible = true;
        const activation = {
          objectId: object.id, moduleId: module.id, moduleVersion: module.version,
          period, attributeFingerprints: combination.map(hash).sort(),
          basis: "declared_confirmed_references_not_verified" as const,
        };
        activations.push(activation);
        for (const requirement of applicableRequirements) requirements.push({
          objectId: object.id, moduleId: module.id, requirementId: requirement.id,
          period, activationFingerprint: hash(activation),
          evidenceNeeded: [...requirement.evidenceNeeded].sort(), scenarioIds: [...requirement.scenarioIds].sort(),
          methods: sorted(requirement.methods), marketCriteriaIds: [...requirement.marketCriteriaIds].sort(),
          outputSuggestions: [...requirement.outputSuggestions].sort(), evidenceStatus: "not_examined",
        });
      }
      if (!compatible) gap("non_overlapping_periods");
    }
    const supportedAttributes = new Set(activations.filter((activation) => activation.objectId === object.id).flatMap((activation) => activation.attributeFingerprints));
    for (const attribute of object.attributes.filter((a) => a.status === "confirmed")) {
      const attributeFingerprint = hash(attribute);
      if (!supportedAttributes.has(attributeFingerprint) && !gaps.some((gap) => gap.objectId === object.id && gap.attributeFingerprint === attributeFingerprint)) {
        gaps.push({objectId: object.id, code: "attribute_uncovered", dimension: attribute.dimension, value: attribute.value, attributeFingerprint, moduleId: null});
      }
    }
  }
  const payload = {
    schemaVersion: "economic-context-plan.v1" as const, mode: "planning_only" as const,
    intent: request.intent,
    contextFingerprint: hash({asOf: request.context.asOf, objects}),
    catalogFingerprint: hash(sectorContextCatalog), targetObjectIds,
    activations: sorted(activations), requirements: sorted(requirements), gaps: sorted(gaps),
    willExecute: false as const, externalEffectAllowed: false as const,
  };
  return economicContextPlanSchema.parse({...payload, fingerprint: hash(payload)});
}

function compare(a: string, b: string): number {return a < b ? -1 : a > b ? 1 : 0;}
function periodsOverlap(a: EconomicContextAttribute["period"], b: EconomicContextAttribute["period"]): boolean {
  return !a || !b || (a.start <= b.end && b.start <= a.end);
}
function sorted<T>(values: readonly T[]): T[] {return [...values].sort((a, b) => compare(stableJson(a), stableJson(b)));}
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value !== null && typeof value === "object") return `{${Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => compare(a, b)).map(([key, v]) => `${JSON.stringify(key)}:${stableJson(v)}`).join(",")}}`;
  return JSON.stringify(value);
}
function hash(value: unknown): string {return createHash("sha256").update(stableJson(value)).digest("hex");}
