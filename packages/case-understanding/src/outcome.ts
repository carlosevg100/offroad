import {z} from "zod";

/**
 * The operational state of a case, distinct from the credit opinion on the proposed transaction.
 *
 * A transaction may stand economically while the case is still missing documents, materials or
 * an approved mandate screen. This contract prevents a credit conclusion from being presented as
 * operational readiness or as permission to contact a capital provider.
 */

export const caseOutcomeVersion = "2026.08.24-v1";

export const caseOutcomeStateSchema = z.enum([
  "insufficient_information",
  "material_gaps",
  "structure_under_assessment",
  "conditionally_viable",
  "ready_for_qualified_direction",
  "not_recommended",
]);
export type CaseOutcomeState = z.infer<typeof caseOutcomeStateSchema>;

export const caseOutcomeInputSchema = z.object({
  informationSufficient: z.boolean(),
  materialGapCount: z.number().int().min(0),
  analysisComplete: z.boolean(),
  verdictStanding: z.enum(["stands", "stands_with_conditions", "does_not_stand"]).optional(),
  materialsAudit: z.enum(["not_run", "pass", "blocked"]),
  mandateScreeningComplete: z.boolean(),
  externalReleaseApproved: z.boolean(),
  blockers: z.array(z.string()).default([]),
});
export type CaseOutcomeInput = z.infer<typeof caseOutcomeInputSchema>;

export const caseOutcomeSchema = z.object({
  version: z.literal(caseOutcomeVersion),
  state: caseOutcomeStateSchema,
  externalDirectionAllowed: z.boolean(),
  reasons: z.array(z.string()),
});
export type CaseOutcome = z.infer<typeof caseOutcomeSchema>;

export function deriveCaseOutcome(raw: CaseOutcomeInput): CaseOutcome {
  const input = caseOutcomeInputSchema.parse(raw);
  const reasons = [...input.blockers];

  if (!input.informationSufficient) {
    return outcome("insufficient_information", ["minimum_information_not_satisfied", ...reasons]);
  }

  if (input.verdictStanding === "does_not_stand") {
    return outcome("not_recommended", ["requested_structure_does_not_stand", ...reasons]);
  }

  if (input.materialGapCount > 0 || input.materialsAudit === "blocked") {
    return outcome("material_gaps", [
      ...(input.materialGapCount > 0 ? [`${input.materialGapCount}_material_gap${input.materialGapCount === 1 ? "" : "s"}`] : []),
      ...(input.materialsAudit === "blocked" ? ["materials_audit_blocked"] : []),
      ...reasons,
    ]);
  }

  if (input.verdictStanding === "stands_with_conditions") {
    return outcome("conditionally_viable", ["conditions_must_be_resolved", ...reasons]);
  }

  const ready =
    input.analysisComplete &&
    input.verdictStanding === "stands" &&
    input.materialsAudit === "pass" &&
    input.mandateScreeningComplete &&
    input.externalReleaseApproved;

  if (ready) return outcome("ready_for_qualified_direction", reasons, true);

  return outcome("structure_under_assessment", [
    ...(!input.analysisComplete ? ["analysis_incomplete"] : []),
    ...(input.verdictStanding === undefined ? ["credit_opinion_pending"] : []),
    ...(input.materialsAudit === "not_run" ? ["materials_audit_pending"] : []),
    ...(!input.mandateScreeningComplete ? ["mandate_screening_pending"] : []),
    ...(!input.externalReleaseApproved ? ["external_release_approval_pending"] : []),
    ...reasons,
  ]);
}

function outcome(state: CaseOutcomeState, reasons: string[], externalDirectionAllowed = false): CaseOutcome {
  return {version: caseOutcomeVersion, state, externalDirectionAllowed, reasons: [...new Set(reasons)]};
}

