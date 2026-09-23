export type ExecutionRequestError = "invalid" | "denied" | "producer_denied" | "method_unavailable" | "basis_denied" | "provenance_denied" | "conflict" | "unavailable";

/** The database names its refusal in the message; the SQLSTATE alone does not separate a
 * missing producer grant from a missing work access. Nothing here retries a refused request. */
export function executionRequestFailure(error: {code?: string; message?: string} | null | undefined): ExecutionRequestError {
  const message = error?.message ?? "";
  const named = (...names: string[]) => names.some(name => message.includes(name));
  if (named("execution_producer_denied")) return "producer_denied";
  if (named("execution_method_unavailable", "execution_profile_ambiguous")) return "method_unavailable";
  if (named("execution_basis_denied", "execution_basis_pin_denied", "execution_basis_decision_denied")) return "basis_denied";
  if (named("execution_payload_provenance_denied", "execution_source_pin_denied", "execution_inputs_denied")) return "provenance_denied";
  if (named("execution_request_conflict") || error?.code === "23505") return "conflict";
  if (named("execution_contract_denied", "execution_budget_expired", "execution_identity_required", "execution_input_limit") || error?.code?.startsWith("22")) return "invalid";
  if (named("execution_access_denied", "execution_subject_required") || error?.code === "42501") return "denied";
  return "unavailable";
}
