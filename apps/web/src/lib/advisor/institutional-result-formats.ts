import type {DeliverableContext, DeliverableType} from "@offroad/case-export/deliverable-formats";

import type {InstitutionalModelResult} from "./institutional-model-results";

/** An approved financial result is three deliverables at once: the model, the memo and the deck. */
export const institutionalResultDeliverableTypes: readonly DeliverableType[] = ["financial_model", "financial_memo", "executive_presentation"];

/**
 * Translate the state of an approved financial result into the shared format policy's context.
 * The same function runs on the surface that lists the files and in the route that produces them,
 * so a copied link cannot reach a format the surface never offered.
 */
export function institutionalResultDeliverableContext(
  result: InstitutionalModelResult,
  overrides: {accessCurrent?: boolean; reproduction?: DeliverableContext["reproduction"]} = {},
): DeliverableContext {
  const artifact = result.status === "completed" ? result.artifact : null;
  return {
    resultState: result.status === "completed" && artifact ? "current"
      : result.status === "stale" ? "superseded"
      : result.status === "queued" ? "preparing"
      : "unavailable",
    accessCurrent: overrides.accessCurrent ?? true,
    // The workbook replay is the reproduction check; until it runs, the verified artifact stands.
    reproduction: overrides.reproduction ?? (artifact ? "approved" : "not_applicable"),
    // The workbook contract exists only with a verified artifact: typed sheets, units and periods.
    tabularContract: artifact !== null,
    narrativeStructure: (artifact?.institutional.scenarios.length ?? 0) > 0,
  };
}
