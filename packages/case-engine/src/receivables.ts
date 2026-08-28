import {receivablesFactResolutionDefinitions, receivablesRouteDefinitions} from "@offroad/credit-playbook";
import {
  analyzeReceivablesPhaseTwo,
  analyzeReceivablesPhaseTwoB,
  resolveReceivablesContractFacts,
  type ReceivablesFactObservation,
  type ReceivablesFactResolutionReport,
  type ReceivablesPhaseTwoInput,
  type ReceivablesPhaseTwoBInput,
  type ReceivablesPhaseTwoBReport,
  type ReceivablesPhaseTwoReport,
  type ReceivablesRouteDefinitionInput,
} from "@offroad/receivables-analysis";
import {
  resolveReceivablesProviderMandate,
  type ReceivablesProviderMandate,
} from "@offroad/fund-mandate";

/**
 * Compilation boundary: the playbook is the source of truth and the analysis package is the
 * deterministic executor. No second route catalogue is maintained in runtime code.
 */
export const canonicalReceivablesRouteCatalogue: readonly ReceivablesRouteDefinitionInput[] = receivablesRouteDefinitions;

export const canonicalReceivablesFactResolutionCatalogue = receivablesFactResolutionDefinitions;

export function resolveCanonicalReceivablesContractFacts(input: {
  asOf: string;
  observations: readonly ReceivablesFactObservation[];
}): ReceivablesFactResolutionReport {
  return resolveReceivablesContractFacts({
    ...input,
    definitions: canonicalReceivablesFactResolutionCatalogue,
  });
}

export function analyzeCanonicalReceivablesPhaseTwo(
  input: Omit<ReceivablesPhaseTwoInput, "routes">,
): ReceivablesPhaseTwoReport {
  return analyzeReceivablesPhaseTwo({...input, routes: canonicalReceivablesRouteCatalogue});
}

/** Compiles versioned provider-program mandates into the deterministic Phase 2B executor. */
export function analyzeCanonicalReceivablesProviderFit(
  input: Omit<ReceivablesPhaseTwoBInput, "mandates"> & {mandates: readonly ReceivablesProviderMandate[]},
): ReceivablesPhaseTwoBReport {
  return analyzeReceivablesPhaseTwoB({
    ...input,
    mandates: input.mandates.map((mandate) => resolveReceivablesProviderMandate(mandate, input.asOf)),
  });
}
