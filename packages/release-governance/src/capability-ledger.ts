import {fingerprintJson} from "@offroad/case-understanding";
import {z} from "zod";
import {capabilityMaturitySchema} from "./operating-controls";

export const capabilityAvailabilitySchema = z.enum(["live", "shadow", "mocked", "specified", "absent"]);
export type CapabilityAvailability = z.infer<typeof capabilityAvailabilitySchema>;

export const capabilityExposureSchema = z.enum(["universal", "allowlisted", "internal", "none"]);
export type CapabilityExposure = z.infer<typeof capabilityExposureSchema>;

export const capabilityCategorySchema = z.enum([
  "workspace", "documents", "intent", "workflow", "execution", "finance", "artifacts",
  "review", "capital", "continuity", "trust", "experience", "gold",
]);
export type CapabilityCategory = z.infer<typeof capabilityCategorySchema>;

export const capabilityAllowedUseSchema = z.enum([
  "internal_design", "internal_validation", "customer_work", "external_material", "external_action",
]);
export type CapabilityAllowedUse = z.infer<typeof capabilityAllowedUseSchema>;

export const capabilityLedgerEntrySchema = z.object({
  capabilityId: z.string().regex(/^[a-z][a-z0-9.-]+$/),
  category: capabilityCategorySchema,
  name: z.string().min(1),
  availability: capabilityAvailabilitySchema,
  exposure: capabilityExposureSchema,
  qualityMaturity: capabilityMaturitySchema,
  exactScope: z.string().min(1),
  specRefs: z.array(z.string().min(1)),
  runtimeRefs: z.array(z.string().min(1)),
  evidenceRefs: z.array(z.string().min(1)),
  fixtureRefs: z.array(z.string().min(1)),
  allowedUses: z.array(capabilityAllowedUseSchema),
  limitations: z.array(z.string().min(1)).min(1),
  verifiedAt: z.string().datetime({offset: true}),
  verificationMethod: z.enum(["repository_inspection", "controlled_execution", "external_assessment"]),
});
export type CapabilityLedgerEntry = z.infer<typeof capabilityLedgerEntrySchema>;

export const capabilityLedgerSchema = z.object({
  ledgerVersion: z.string().min(1),
  baselineCommit: z.string().regex(/^[a-f0-9]{7,40}$/),
  generatedAt: z.string().datetime({offset: true}),
  entries: z.array(capabilityLedgerEntrySchema).min(1),
});
export type CapabilityLedger = z.infer<typeof capabilityLedgerSchema>;

export const capabilityLedgerIssueSchema = z.object({
  code: z.string().min(1),
  capabilityId: capabilityLedgerEntrySchema.shape.capabilityId.nullable(),
});
export type CapabilityLedgerIssue = z.infer<typeof capabilityLedgerIssueSchema>;

export const capabilityLedgerDecisionSchema = z.object({
  valid: z.boolean(),
  ledgerVersion: z.string().min(1),
  entryCount: z.number().int().nonnegative(),
  availabilityCounts: z.record(capabilityAvailabilitySchema, z.number().int().nonnegative()),
  blockers: z.array(capabilityLedgerIssueSchema),
  warnings: z.array(capabilityLedgerIssueSchema),
  ledgerFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
});
export type CapabilityLedgerDecision = z.infer<typeof capabilityLedgerDecisionSchema>;

/**
 * Keeps deployment, exposure and quality separate. A live route can remain unfit for customer
 * reliance; a large specification remains absent from runtime; a fixture cannot masquerade as
 * real evidence. The ledger fails closed when any of those boundaries is blurred.
 */
export function evaluateCapabilityLedger(ledger: CapabilityLedger): CapabilityLedgerDecision {
  const parsed = capabilityLedgerSchema.parse(ledger);
  const blockers: CapabilityLedgerIssue[] = [];
  const warnings: CapabilityLedgerIssue[] = [];
  const seen = new Set<string>();
  const availabilityCounts: Record<CapabilityAvailability, number> = {
    live: 0, shadow: 0, mocked: 0, specified: 0, absent: 0,
  };

  for (const entry of parsed.entries) {
    availabilityCounts[entry.availability] += 1;
    if (seen.has(entry.capabilityId)) blockers.push({code: "duplicate_capability", capabilityId: entry.capabilityId});
    seen.add(entry.capabilityId);

    if (entry.availability === "live") {
      if (entry.runtimeRefs.length === 0) blockers.push({code: "live_capability_runtime_missing", capabilityId: entry.capabilityId});
      if (entry.evidenceRefs.length === 0) blockers.push({code: "live_capability_evidence_missing", capabilityId: entry.capabilityId});
      if (entry.exposure === "none") blockers.push({code: "live_capability_exposure_missing", capabilityId: entry.capabilityId});
    }
    if (entry.availability === "shadow") {
      if (entry.runtimeRefs.length === 0 || entry.evidenceRefs.length === 0) {
        blockers.push({code: "shadow_capability_runtime_or_evidence_missing", capabilityId: entry.capabilityId});
      }
      if (entry.exposure !== "internal") blockers.push({code: "shadow_capability_must_be_internal", capabilityId: entry.capabilityId});
    }
    if (entry.availability === "mocked" && entry.fixtureRefs.length === 0) {
      blockers.push({code: "mocked_capability_fixture_missing", capabilityId: entry.capabilityId});
    }
    if (entry.availability === "specified") {
      if (entry.specRefs.length === 0) blockers.push({code: "specified_capability_spec_missing", capabilityId: entry.capabilityId});
      if (entry.runtimeRefs.length > 0 || entry.allowedUses.length > 0 || entry.exposure !== "none") {
        blockers.push({code: "specified_capability_claims_runtime", capabilityId: entry.capabilityId});
      }
    }
    if (entry.availability === "absent") {
      if (entry.specRefs.length > 0 || entry.runtimeRefs.length > 0 || entry.evidenceRefs.length > 0
        || entry.fixtureRefs.length > 0 || entry.allowedUses.length > 0 || entry.exposure !== "none") {
        blockers.push({code: "absent_capability_has_implementation_claim", capabilityId: entry.capabilityId});
      }
    }

    const externalReliance = entry.allowedUses.includes("external_material") || entry.allowedUses.includes("external_action");
    const customerReliance = externalReliance || entry.allowedUses.includes("customer_work");
    if (customerReliance && (entry.availability !== "live" || entry.qualityMaturity !== "production")) {
      blockers.push({code: "customer_reliance_requires_live_production_scope", capabilityId: entry.capabilityId});
    }
    if (entry.qualityMaturity === "production") {
      if (entry.availability !== "live") blockers.push({code: "production_quality_requires_live_runtime", capabilityId: entry.capabilityId});
      if (entry.verificationMethod !== "controlled_execution" && entry.verificationMethod !== "external_assessment") {
        blockers.push({code: "production_quality_requires_execution_evidence", capabilityId: entry.capabilityId});
      }
    }
    if (entry.qualityMaturity === "implemented" && entry.availability === "live" && entry.allowedUses.length === 0) {
      warnings.push({code: "live_implemented_scope_has_no_allowed_use", capabilityId: entry.capabilityId});
    }
  }

  const payload = {
    valid: blockers.length === 0,
    ledgerVersion: parsed.ledgerVersion,
    entryCount: parsed.entries.length,
    availabilityCounts,
    blockers: stableCapabilityIssues(blockers),
    warnings: stableCapabilityIssues(warnings),
  };
  return capabilityLedgerDecisionSchema.parse({...payload, ledgerFingerprint: fingerprintJson(parsed)});
}

function stableCapabilityIssues(issues: CapabilityLedgerIssue[]): CapabilityLedgerIssue[] {
  return [...new Map(issues
    .sort((left, right) => `${left.capabilityId ?? ""}:${left.code}`.localeCompare(`${right.capabilityId ?? ""}:${right.code}`))
    .map((issue) => [`${issue.capabilityId ?? ""}:${issue.code}`, issue])).values()];
}
