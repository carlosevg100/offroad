import {createHash} from "node:crypto";
import {z} from "zod";

/** Contracts of the market reference layer (ADR 0023). Every market number the product uses is a
 * version of a logical object acquired by the Offroad publisher, with its licence regime, three
 * information dates and a typed reference that a tenant receives through a delivery receipt. These
 * contracts never grant access: the database checks rights on every read. */
export const marketObjectsVersion = "2026.10.20-v1";

const hash = z.string().regex(/^[a-f0-9]{64}$/);
const date = z.iso.date();
const instant = z.iso.datetime({offset: true});
const slug = z.string().regex(/^[a-z0-9][a-z0-9._-]{0,79}$/);
const text = z.string().trim().min(1).max(500);

/** Operations and outputs a right may allow; a right restricts an existing authorization and never grants one. */
export const marketOperations = ["read", "process", "derive", "export", "display"] as const;
export const marketOutputs = ["screen", "result", "material", "download"] as const;

/** A versioned instrument of a supplier's terms (a policy, a contract annex), in force for a window. */
export const policyInstrumentSchema = z.strictObject({
  instrument: text, version: z.string().trim().min(1).max(40), evidenceId: slug, sha256: hash,
  effectiveFrom: date, effectiveUntil: date.nullable(),
}).refine((p) => p.effectiveUntil === null || p.effectiveUntil >= p.effectiveFrom, "A policy ends after it starts");

/** Open licence (ODbL datasets): attribution travels with every object and every result that uses it. */
export const openLicenseSchema = z.strictObject({
  kind: z.literal("open"), license: z.literal("ODbL-1.0"), attribution: text, evidenceIds: z.array(slug).min(1),
  /** Whether an adopted value and its derivatives may stay in a tenant's immutable history. */
  retainAdoptedValues: z.boolean(),
  /** Days the publisher may keep raw and normalized content; null when the licence sets no limit. */
  storeDays: z.number().int().positive().nullable(),
});

/** One entitlement of a contracted source: product, audience, operations and outputs, in a window. */
export const entitlementSchema = z.strictObject({
  product: slug, audience: z.enum(["offroad_internal", "all_tenants", "listed_tenants"]),
  operations: z.array(z.enum(marketOperations)).min(1), outputs: z.array(z.enum(marketOutputs)),
  validFrom: date, validUntil: date.nullable(), retainAdoptedValues: z.boolean(), storeDays: z.number().int().positive().nullable(),
});
export const contractedLicenseSchema = z.strictObject({
  kind: z.literal("contracted"), provider: slug, contractReference: text,
  entitlements: z.array(entitlementSchema).min(1), policies: z.array(policyInstrumentSchema).min(1),
});
export const marketLicenseSchema = z.discriminatedUnion("kind", [openLicenseSchema, contractedLicenseSchema]);
export type MarketLicense = z.infer<typeof marketLicenseSchema>;

/** The supplier policies in force on a date: one per instrument, the latest that has started and not ended. */
export function policiesInForce(policies: ReadonlyArray<z.infer<typeof policyInstrumentSchema>>, on: string) {
  const byInstrument = new Map<string, z.infer<typeof policyInstrumentSchema>>();
  for (const p of policies) {
    if (p.effectiveFrom > on || (p.effectiveUntil !== null && p.effectiveUntil < on)) continue;
    const current = byInstrument.get(p.instrument);
    if (!current || p.effectiveFrom > current.effectiveFrom) byInstrument.set(p.instrument, p);
  }
  return [...byInstrument.values()].sort((a, b) => a.instrument < b.instrument ? -1 : 1);
}

/** Whether a licence allows an operation for an output on a date; a contracted licence needs an entitlement in force. */
export function licenseAllows(license: MarketLicense, use: {operation: (typeof marketOperations)[number]; output: (typeof marketOutputs)[number] | null; on: string; product: string}) {
  if (license.kind === "open") return true;
  return license.entitlements.some((e) => e.product === use.product && e.validFrom <= use.on && (e.validUntil === null || e.validUntil >= use.on)
    && e.operations.includes(use.operation) && (use.output === null || e.outputs.includes(use.output)));
}

/** Kinds of objects and the epistemic category of their numbers; categories never mix. */
export const marketObjectKinds = ["series", "curve", "precedent", "company_fact"] as const;
export const marketCategories = ["observed", "consensus", "consensus_scenario", "implied_curve", "document_fact"] as const;

/** The logical identity of an object: source, family and the economic keys that make it unique
 * (for Focus: indicator, horizon, statistic, base; for an issue: offering id, series, tranche). */
export const logicalIdentitySchema = z.strictObject({
  source: slug, family: slug, kind: z.enum(marketObjectKinds), category: z.enum(marketCategories),
  keys: z.record(z.string().regex(/^[a-zA-Z][a-zA-Z0-9]{0,39}$/), z.string().trim().min(1).max(120)),
});
export type LogicalIdentity = z.infer<typeof logicalIdentitySchema>;

/** Deterministic logical id: `market:<source>:<family>:<sha256 of the canonical keys, 16 hex>`. */
export function logicalId(raw: unknown) {
  const identity = logicalIdentitySchema.parse(raw);
  const canonical = JSON.stringify([identity.kind, identity.category, Object.keys(identity.keys).sort().map((k) => [k, identity.keys[k]])]);
  return `market:${identity.source}:${identity.family}:${createHash("sha256").update(canonical).digest("hex").slice(0, 16)}`;
}

/** One acquisition: the bytes exactly as received. */
export const acquisitionSchema = z.strictObject({
  id: z.uuid(), source: slug, url: z.url({protocol: /^https$/}), finalUrl: z.url({protocol: /^https$/}),
  acquiredAt: instant, sha256: hash, byteSize: z.number().int().positive(), contentType: z.string().min(3).max(120),
});

/** A normalized version: which acquisitions, parser, methodology and parameters produced it. */
export const normalizedVersionSchema = z.strictObject({
  id: z.uuid(), logicalId: z.string().regex(/^market:[a-z0-9._-]+:[a-z0-9._-]+:[a-f0-9]{16}$/),
  acquisitionIds: z.array(z.uuid()).min(1), parserVersion: slug,
  methodology: z.strictObject({id: slug, version: slug, parameters: z.record(z.string(), z.string())}).nullable(),
  dependencyVersionIds: z.array(z.uuid()), sha256: hash, license: marketLicenseSchema,
  supersedes: z.uuid().nullable(),
});

/** One observation with its three dates: the economic period, when the source made it public and
 * when the Offroad acquired it. */
export const marketObservationSchema = z.strictObject({
  versionId: z.uuid(), periodStart: date.nullable(), periodEnd: date, availableAt: instant, acquiredAt: instant,
  value: z.string().regex(/^-?\d{1,24}(?:\.\d{1,20})?$/), unit: z.enum(["percent_per_year", "percent_per_month", "ratio", "index_points", "currency", "basis_points", "count"]),
  scale: z.string().regex(/^1(?:0{1,9})?$/),
});
export type MarketObservation = z.infer<typeof marketObservationSchema>;

/** What an execution with data date `asOf` may read: only what the source had published by then and
 * the Offroad had acquired by then, the latest revision per period. No look-ahead. */
export function observationsAvailableAsOf(observations: readonly MarketObservation[], asOf: string) {
  const cutoff = `${asOf}T23:59:59.999Z`;
  const best = new Map<string, MarketObservation>();
  for (const o of observations) {
    if (o.periodEnd > asOf || o.availableAt > cutoff || o.acquiredAt > cutoff) continue;
    const key = `${o.periodStart ?? ""}|${o.periodEnd}`, prior = best.get(key);
    if (!prior || o.availableAt > prior.availableAt) best.set(key, o);
  }
  return [...best.values()].sort((a, b) => a.periodEnd < b.periodEnd ? -1 : a.periodEnd > b.periodEnd ? 1 : 0);
}

/** Freshness of an object on a date: current within the source's maximum age, stale beyond it.
 * Quality, freshness and right are three separate states. */
export function freshness(latestAvailableAt: string | null, now: string, maximumAgeHours: number): "current" | "stale" | "absent" {
  if (latestAvailableAt === null) return "absent";
  return (Date.parse(now) - Date.parse(latestAvailableAt)) / 3_600_000 <= maximumAgeHours ? "current" : "stale";
}

/** The typed reference a tenant receives: the publisher's version and right, through a delivery
 * receipt in the tenant's own organization. The database resolves and checks it on every read. */
export const marketReferenceSchema = z.strictObject({
  schemaVersion: z.literal("market-reference.v1"),
  deliveryId: z.uuid(), logicalId: normalizedVersionSchema.shape.logicalId, versionId: z.uuid(), versionSha256: hash,
  rightsVersionId: z.uuid(), category: z.enum(marketCategories),
});
export type MarketReference = z.infer<typeof marketReferenceSchema>;
