import {fingerprintJson} from "@offroad/case-understanding";
import {z} from "zod";
import {
  trustControlDomainSchema,
  trustControlRecordSchema,
  trustEvidenceKindSchema,
  trustEnvironmentSchema,
} from "./trust-controls";

export const trustFrameworkSchema = z.enum([
  "soc2_tsc_2022",
  "iso27001_2022",
  "nist_csf_2_0",
  "lgpd",
  "gdpr",
  "ccpa",
  "contractual",
]);
export type TrustFramework = z.infer<typeof trustFrameworkSchema>;

export const frameworkMappingSchema = z.object({
  framework: trustFrameworkSchema,
  reference: z.string().min(1),
  assurance: z.enum(["internal_working_map", "externally_validated"]),
  validatedBy: z.string().min(1).nullable(),
  validatedAt: z.string().datetime({offset: true}).nullable(),
});
export type FrameworkMapping = z.infer<typeof frameworkMappingSchema>;

export const controlCadenceSchema = z.enum(["event", "continuous", "monthly", "quarterly", "annual"]);
export type ControlCadence = z.infer<typeof controlCadenceSchema>;

export const evidenceExpectationSchema = z.object({
  kind: trustEvidenceKindSchema,
  environments: z.array(trustEnvironmentSchema).min(1),
  cadence: controlCadenceSchema,
});
export type EvidenceExpectation = z.infer<typeof evidenceExpectationSchema>;

export const trustControlDefinitionSchema = z.object({
  controlId: trustControlRecordSchema.shape.controlId,
  domain: trustControlDomainSchema,
  title: z.string().min(1),
  objective: z.string().min(1),
  criticality: z.enum(["critical", "high", "medium"]),
  applicability: z.enum(["baseline", "enterprise", "conditional"]),
  ownerRole: z.string().min(1),
  riskRefs: z.array(z.string().min(1)).min(1),
  frameworkMappings: z.array(frameworkMappingSchema).min(1),
  implementationRefs: z.array(z.string().min(1)),
  testProcedureRefs: z.array(z.string().min(1)).min(1),
  evidenceExpectations: z.array(evidenceExpectationSchema).min(1),
  reviewCadence: controlCadenceSchema,
});
export type TrustControlDefinition = z.infer<typeof trustControlDefinitionSchema>;

export const trustControlActivitySchema = z.object({
  activityId: trustControlRecordSchema.shape.controlId,
  domain: trustControlDomainSchema,
  title: z.string().min(1),
  objectiveControlIds: z.array(trustControlRecordSchema.shape.controlId).min(1),
  sourceRef: z.string().min(1),
});
export type TrustControlActivity = z.infer<typeof trustControlActivitySchema>;

export const trustControlCatalogueSchema = z.object({
  catalogueVersion: z.string().min(1),
  effectiveAt: z.string().datetime({offset: true}),
  scope: z.string().min(1),
  sourceRefs: z.record(trustFrameworkSchema, z.string().url()),
  controls: z.array(trustControlDefinitionSchema).min(1),
  activities: z.array(trustControlActivitySchema).min(1),
});
export type TrustControlCatalogue = z.infer<typeof trustControlCatalogueSchema>;

export const controlRegisterIssueSchema = z.object({
  code: z.string().min(1),
  controlId: trustControlRecordSchema.shape.controlId.nullable(),
});
export type ControlRegisterIssue = z.infer<typeof controlRegisterIssueSchema>;

export const controlRegisterDecisionSchema = z.object({
  complete: z.boolean(),
  catalogueVersion: z.string().min(1),
  controlCount: z.number().int().nonnegative(),
  activityCount: z.number().int().nonnegative(),
  representedDomains: z.array(trustControlDomainSchema),
  representedFrameworks: z.array(trustFrameworkSchema),
  blockers: z.array(controlRegisterIssueSchema),
  warnings: z.array(controlRegisterIssueSchema),
  registerFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
});
export type ControlRegisterDecision = z.infer<typeof controlRegisterDecisionSchema>;

/**
 * Validates the catalogue as an audit-preparation object, not merely a list of security ideas.
 * Mappings remain explicitly provisional until an external assessor validates them.
 */
export function evaluateTrustControlCatalogue(catalogue: TrustControlCatalogue): ControlRegisterDecision {
  const parsed = trustControlCatalogueSchema.parse(catalogue);
  const blockers: ControlRegisterIssue[] = [];
  const warnings: ControlRegisterIssue[] = [];
  const seenControls = new Set<string>();
  const seenActivities = new Set<string>();
  const representedDomains = new Set<z.infer<typeof trustControlDomainSchema>>();
  const representedFrameworks = new Set<TrustFramework>();

  for (const control of parsed.controls) {
    if (seenControls.has(control.controlId)) blockers.push({code: "duplicate_control_definition", controlId: control.controlId});
    seenControls.add(control.controlId);
    representedDomains.add(control.domain);

    const seenMappings = new Set<string>();
    for (const mapping of control.frameworkMappings) {
      representedFrameworks.add(mapping.framework);
      const key = `${mapping.framework}:${mapping.reference}`;
      if (seenMappings.has(key)) warnings.push({code: "duplicate_framework_mapping", controlId: control.controlId});
      seenMappings.add(key);
      if (mapping.assurance === "externally_validated" && (!mapping.validatedBy || !mapping.validatedAt)) {
        blockers.push({code: "external_mapping_validation_evidence_missing", controlId: control.controlId});
      }
      if (mapping.assurance === "internal_working_map" && (mapping.validatedBy || mapping.validatedAt)) {
        blockers.push({code: "working_mapping_must_not_claim_external_validation", controlId: control.controlId});
      }
    }

    if (!control.frameworkMappings.some((mapping) => mapping.framework === "nist_csf_2_0")) {
      blockers.push({code: "nist_mapping_missing", controlId: control.controlId});
    }
    if (!control.frameworkMappings.some((mapping) => mapping.framework === "soc2_tsc_2022")) {
      blockers.push({code: "soc2_mapping_missing", controlId: control.controlId});
    }
    if (!control.frameworkMappings.some((mapping) => mapping.framework === "iso27001_2022")) {
      blockers.push({code: "iso27001_mapping_missing", controlId: control.controlId});
    }
    if (control.implementationRefs.length === 0) warnings.push({code: "implementation_reference_not_yet_bound", controlId: control.controlId});
  }

  const objectivesWithActivities = new Set<string>();
  for (const activity of parsed.activities) {
    if (seenActivities.has(activity.activityId)) blockers.push({code: "duplicate_control_activity", controlId: activity.activityId});
    seenActivities.add(activity.activityId);
    for (const objectiveControlId of activity.objectiveControlIds) {
      if (!seenControls.has(objectiveControlId)) {
        blockers.push({code: `activity_objective_missing:${objectiveControlId}`, controlId: activity.activityId});
      } else {
        objectivesWithActivities.add(objectiveControlId);
      }
    }
  }
  for (const controlId of seenControls) {
    if (!objectivesWithActivities.has(controlId)) blockers.push({code: "control_objective_has_no_activities", controlId});
  }

  for (const domain of trustControlDomainSchema.options) {
    if (!representedDomains.has(domain)) blockers.push({code: `control_domain_missing:${domain}`, controlId: null});
  }
  for (const framework of ["soc2_tsc_2022", "iso27001_2022", "nist_csf_2_0", "lgpd"] as const) {
    if (!representedFrameworks.has(framework)) blockers.push({code: `required_framework_missing:${framework}`, controlId: null});
  }

  const payload = {
    complete: blockers.length === 0,
    catalogueVersion: parsed.catalogueVersion,
    controlCount: parsed.controls.length,
    activityCount: parsed.activities.length,
    representedDomains: [...representedDomains].sort(),
    representedFrameworks: [...representedFrameworks].sort(),
    blockers: stableRegisterIssues(blockers),
    warnings: stableRegisterIssues(warnings),
  };
  return controlRegisterDecisionSchema.parse({...payload, registerFingerprint: fingerprintJson(parsed)});
}

function stableRegisterIssues(issues: ControlRegisterIssue[]): ControlRegisterIssue[] {
  return [...new Map(issues
    .sort((left, right) => `${left.controlId ?? ""}:${left.code}`.localeCompare(`${right.controlId ?? ""}:${right.code}`))
    .map((issue) => [`${issue.controlId ?? ""}:${issue.code}`, issue])).values()];
}
