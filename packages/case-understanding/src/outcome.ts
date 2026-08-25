import {z} from "zod";

/**
 * The operational state of a case, distinct from a capital provider's credit decision.
 *
 * A transaction may stand economically while the case is still missing documents, materials or
 * an approved mandate screen. This contract prevents a credit conclusion from being presented as
 * operational readiness or as permission to contact a capital provider.
 */

export const caseOutcomeVersion = "2026.08.25-v2";

export const caseOutcomeStateSchema = z.enum([
  "insufficient_information",
  "material_information_gaps",
  "alternatives_under_development",
  "supportable_with_adjustments",
  "ready_for_client_authorized_introduction",
  "requested_configuration_not_supported",
]);
export type CaseOutcomeState = z.infer<typeof caseOutcomeStateSchema>;

export const caseOutcomeInputSchema = z.object({
  informationSufficient: z.boolean(),
  materialGapCount: z.number().int().min(0),
  analysisComplete: z.boolean(),
  structureSupportability: z.enum(["supportable_as_proposed", "supportable_with_adjustments", "not_supported_as_proposed"]).optional(),
  materialsAudit: z.enum(["not_run", "pass", "blocked"]),
  mandateScreeningComplete: z.boolean(),
  /** Platform rollout gate, not a credit approval or client authorization. */
  platformExternalReleaseEnabled: z.boolean(),
  /** Explicit permission from the client to share the approved package with named recipients. */
  clientIntroductionAuthorized: z.boolean(),
  blockers: z.array(z.string()).default([]),
});
export type CaseOutcomeInput = z.infer<typeof caseOutcomeInputSchema>;

export const caseOutcomeSchema = z.object({
  version: z.literal(caseOutcomeVersion),
  state: caseOutcomeStateSchema,
  qualifiedIntroductionAllowed: z.boolean(),
  reasons: z.array(z.string()),
});
export type CaseOutcome = z.infer<typeof caseOutcomeSchema>;

export function deriveCaseOutcome(raw: CaseOutcomeInput): CaseOutcome {
  const input = caseOutcomeInputSchema.parse(raw);
  const reasons = [...input.blockers];

  if (!input.informationSufficient) {
    return outcome("insufficient_information", ["minimum_information_not_satisfied", ...reasons]);
  }

  if (input.structureSupportability === "not_supported_as_proposed") {
    return outcome("requested_configuration_not_supported", ["requested_configuration_not_supported_by_evidence", ...reasons]);
  }

  if (input.materialGapCount > 0 || input.materialsAudit === "blocked") {
    return outcome("material_information_gaps", [
      ...(input.materialGapCount > 0 ? [`${input.materialGapCount}_material_gap${input.materialGapCount === 1 ? "" : "s"}`] : []),
      ...(input.materialsAudit === "blocked" ? ["materials_audit_blocked"] : []),
      ...reasons,
    ]);
  }

  if (input.structureSupportability === "supportable_with_adjustments") {
    return outcome("supportable_with_adjustments", ["adjustments_must_be_resolved", ...reasons]);
  }

  const ready =
    input.analysisComplete &&
    input.structureSupportability === "supportable_as_proposed" &&
    input.materialsAudit === "pass" &&
    input.mandateScreeningComplete &&
    input.platformExternalReleaseEnabled &&
    input.clientIntroductionAuthorized;

  if (ready) return outcome("ready_for_client_authorized_introduction", reasons, true);

  return outcome("alternatives_under_development", [
    ...(!input.analysisComplete ? ["analysis_incomplete"] : []),
    ...(input.structureSupportability === undefined ? ["structure_supportability_pending"] : []),
    ...(input.materialsAudit === "not_run" ? ["materials_audit_pending"] : []),
    ...(!input.mandateScreeningComplete ? ["mandate_screening_pending"] : []),
    ...(!input.platformExternalReleaseEnabled ? ["platform_external_release_disabled"] : []),
    ...(!input.clientIntroductionAuthorized ? ["client_introduction_authorization_pending"] : []),
    ...reasons,
  ]);
}

function outcome(state: CaseOutcomeState, reasons: string[], qualifiedIntroductionAllowed = false): CaseOutcome {
  return {version: caseOutcomeVersion, state, qualifiedIntroductionAllowed, reasons: [...new Set(reasons)]};
}
