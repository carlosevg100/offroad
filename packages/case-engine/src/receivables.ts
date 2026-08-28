import {receivablesRouteDefinitions} from "@offroad/credit-playbook";
import {
  analyzeReceivablesPhaseTwo,
  type ReceivablesPhaseTwoInput,
  type ReceivablesPhaseTwoReport,
  type ReceivablesRouteDefinitionInput,
} from "@offroad/receivables-analysis";

/**
 * Compilation boundary: the playbook is the source of truth and the analysis package is the
 * deterministic executor. No second route catalogue is maintained in runtime code.
 */
export const canonicalReceivablesRouteCatalogue: readonly ReceivablesRouteDefinitionInput[] = receivablesRouteDefinitions;

export function analyzeCanonicalReceivablesPhaseTwo(
  input: Omit<ReceivablesPhaseTwoInput, "routes">,
): ReceivablesPhaseTwoReport {
  return analyzeReceivablesPhaseTwo({...input, routes: canonicalReceivablesRouteCatalogue});
}
