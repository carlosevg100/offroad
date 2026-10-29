import type {ExecutionGateRefusal} from "@offroad/execution-request";

/** Refusals the action names before anything is sent, from the gates it assembles. */
export type {ExecutionGateRefusal};

export type ExecutionRequestError = "invalid" | "stale" | "denied" | "producer_denied" | "method_unavailable" | "basis_denied" | "provenance_denied" | "conflict" | "unavailable"
  | "gates_invalid" | "gates_blocked" | "gates_mismatch" | ExecutionGateRefusal
  /** The quarter close: a prior result it names is missing, not of this work and method, or not completed. */
  | "priors_missing" | "prior_invalid";

/** The database names its refusal in the message; the SQLSTATE alone does not separate a
 * missing producer grant from a missing work access. A contract the server no longer accepts
 * (authority moved, budget window closed) is stale and worth a second attempt; malformed input
 * is not. The gate refusals of the v2 producer are named before the SQLSTATE fallbacks, since
 * they share 22023 and 42501 with plain invalid input and plain denial. Nothing here retries a
 * refused request. */
export function executionRequestFailure(error: {code?: string; message?: string} | null | undefined): ExecutionRequestError {
  const message = error?.message ?? "";
  const named = (...names: string[]) => names.some(name => message.includes(name));
  // The quarter close's prior results, named by the v3 producer before the shared refusals below.
  if (named("quarter_update_prior_rights_denied", "quarter_update_prior_source_unpinned")) return "provenance_denied";
  if (named("quarter_update_prior_fingerprint_mismatch", "quarter_update_prior_input_mismatch")) return "stale";
  if (named("quarter_update_prior_not_found", "quarter_update_prior_method_mismatch", "quarter_update_prior_not_completed")) return "prior_invalid";
  if (named("quarter_update_priors_invalid", "quarter_update_priors_method_denied")) return "invalid";
  // Lote 4: the board material's reviewed results and the folder update's prior inventory, named the same way.
  if (named("board_material_prior_rights_denied", "board_material_prior_source_unpinned", "document_folder_prior_rights_denied", "document_folder_prior_source_unpinned"))
    return "provenance_denied";
  if (named("board_material_prior_fingerprint_mismatch", "board_material_prior_input_mismatch", "board_material_prior_scale_mismatch",
    "document_folder_prior_fingerprint_mismatch", "document_folder_prior_input_mismatch")) return "stale";
  if (named("board_material_prior_not_found", "board_material_prior_method_mismatch", "board_material_prior_not_completed", "board_material_prior_not_released",
    "board_material_prior_scale_unknown", "document_folder_prior_not_found", "document_folder_prior_method_mismatch", "document_folder_prior_not_completed",
    "document_folder_prior_not_released", "board_material_prior_manifest_mismatch", "document_folder_prior_manifest_mismatch")) return "prior_invalid";
  if (named("board_material_priors_invalid", "board_material_prior_scale_invalid", "document_folder_priors_invalid")) return "invalid";
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
