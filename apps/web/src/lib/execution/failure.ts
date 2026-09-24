/** Refusals the action names before anything is sent, from the gates it assembles. */
export type ExecutionGateRefusal =
  | "company_unregistered"
  | "situation_required"
  | "situation_unknown"
  | "method_not_applicable"
  | "selection_invalid"
  | "voice_blocked";

export type ExecutionRequestError = "invalid" | "stale" | "denied" | "producer_denied" | "method_unavailable" | "basis_denied" | "provenance_denied" | "conflict" | "unavailable"
  | "gates_invalid" | "gates_blocked" | "gates_mismatch" | ExecutionGateRefusal;

/** The database names its refusal in the message; the SQLSTATE alone does not separate a
 * missing producer grant from a missing work access. A contract the server no longer accepts
 * (authority moved, budget window closed) is stale and worth a second attempt; malformed input
 * is not. The gate refusals of the v2 producer are named before the SQLSTATE fallbacks, since
 * they share 22023 and 42501 with plain invalid input and plain denial. Nothing here retries a
 * refused request. */
export function executionRequestFailure(error: {code?: string; message?: string} | null | undefined): ExecutionRequestError {
  const message = error?.message ?? "";
  const named = (...names: string[]) => names.some(name => message.includes(name));
  if (named("execution_producer_denied")) return "producer_denied";
  if (named("execution_method_unavailable", "execution_profile_ambiguous")) return "method_unavailable";
  if (named("execution_gates_invalid")) return "gates_invalid";
  if (named("execution_gates_blocked")) return "gates_blocked";
  if (named("execution_gates_mismatch")) return "gates_mismatch";
  if (named("execution_basis_denied", "execution_basis_pin_denied", "execution_basis_decision_denied")) return "basis_denied";
  if (named("execution_payload_provenance_denied", "execution_source_pin_denied", "execution_inputs_denied")) return "provenance_denied";
  if (named("execution_request_conflict") || error?.code === "23505") return "conflict";
  if (named("execution_contract_denied", "execution_budget_expired")) return "stale";
  if (named("execution_identity_required", "execution_input_limit") || error?.code?.startsWith("22") || error?.code === "23514") return "invalid";
  if (named("execution_access_denied", "execution_subject_required") || error?.code === "42501") return "denied";
  return "unavailable";
}
