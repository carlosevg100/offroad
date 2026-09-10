export type AdvisorActionError = "invalid" | "denied" | "role" | "duplicate" | "not_found" | "save" | "processing" | "stale";

/** Maps a database command failure to the explanation the project shows. A review-role denial
 * is separate from a generic denial so the person learns which responsibility is missing. */
export function advisorActionError(error: {code?: string; message?: string} | null): AdvisorActionError {
  const message = error?.message ?? "";
  if (error?.code === "40001" || message.includes("stale")) return "stale";
  if (error?.code === "22023" || message.includes("invalid_")) return "invalid";
  if (error?.code === "23505" || message.includes("already_in_use")) return "duplicate";
  if (error?.code === "P0002" || message.includes("not_found")) return "not_found";
  if (error?.code === "55000" || message.includes("in_progress")) return "processing";
  if (message.includes("review_role_required") || message.includes("self_approval_forbidden") || message.includes("review_management_denied")) return "role";
  if (error?.code === "42501" || message.includes("required")) return "denied";
  return "save";
}
