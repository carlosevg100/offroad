/** Refusals named before anything is sent, from the gates a request assembles. */
export type ExecutionGateRefusal =
  | "company_unregistered"
  | "situation_required"
  | "situation_unknown"
  | "method_not_applicable"
  | "selection_invalid"
  | "voice_blocked";
