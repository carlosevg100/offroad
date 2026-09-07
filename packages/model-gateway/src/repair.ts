import type {ValidationIssueDiagnostic} from "./types";

export type RepairValidationSource = "schema" | "deterministic";

/**
 * Builds the exact content-free repair instruction used by the gateway. Keeping this pure and
 * exported lets an evidence verifier independently reconstruct both its hash and the effective
 * prompt from the rejected attempt's persisted diagnostics.
 */
export function buildRepairGuidance(
  source: RepairValidationSource,
  issues: readonly ValidationIssueDiagnostic[],
): string {
  if (source === "schema") {
    const details = issues.slice(0, 5).map((issue) => {
      const path = issue.path || "<root>";
      const allowed = (issue.allowedValues ?? []).slice(0, 20).map((value) => JSON.stringify(value).slice(0, 82));
      return allowed.length > 0
        ? `- ${path}: use exactly one of ${allowed.join(", ")}`
        : `- ${path}: correct schema violation ${issue.code}`;
    });
    return [
      "SCHEMA REPAIR (one bounded retry): your previous JSON did not validate.",
      "Return the entire corrected JSON object. Do not explain the correction and do not repeat the rejected value.",
      ...details,
    ].join("\n").slice(0, 2_000);
  }

  const details = issues.slice(0, 8).map(({path, code}) =>
    `- ${path || "<root>"}: resolve deterministic contract issue ${code}`);
  return [
    "CONTRACT REPAIR (one bounded retry): your previous JSON passed the schema but failed deterministic validation.",
    "Return the entire corrected JSON object. Re-read the supplied source and do not invent evidence.",
    ...details,
  ].join("\n").slice(0, 2_000);
}
