import {calculateLeverage, financialCoreVersion} from "@offroad/financial-core";
import {readContextualBasis, type AdoptionBasisEnvelope, type AdoptionBasisScope} from "@offroad/reconciliation";

/** Deterministic preview over two explicitly selected inputs of one immutable working basis.
 * Source eligibility is checked by the SQL reader before this pure calculation is called.
 */
export function calculateAdoptedLeverage(input: {
  envelope: AdoptionBasisEnvelope; scope: AdoptionBasisScope;
  netDebtDecisionId: string; ebitdaDecisionId: string;
}) {
  const basis = readContextualBasis(input.envelope, input.scope);
  const debt = basis.entries.find((entry) => entry.decisionId === input.netDebtDecisionId);
  const ebitda = basis.entries.find((entry) => entry.decisionId === input.ebitdaDecisionId);
  if (!debt || !ebitda || debt.decisionId === ebitda.decisionId || debt.value.type !== "number" || ebitda.value.type !== "number") throw new Error("adoption_calculation_inputs_required");
  for (const dimension of ["entityId", "perimeter", "periodEnd", "currency", "scenario"] as const) {
    if (debt.dimensions[dimension] !== ebitda.dimensions[dimension]) throw new Error("adoption_calculation_context_mismatch");
  }
  if (!debt.dimensions.currency || !["currency", "money", debt.dimensions.currency].includes(debt.dimensions.unit ?? "")
    || debt.dimensions.unit !== ebitda.dimensions.unit) throw new Error("adoption_calculation_units_required");
  if (ebitda.dimensions.periodStart === null) throw new Error("adoption_calculation_flow_period_required");
  const calculation = calculateLeverage(debt.value.value, ebitda.value.value);
  return {
    ...calculation,
    engineVersion: financialCoreVersion,
    basisVersionId: basis.versionId,
    basisFingerprint: input.envelope.fingerprint,
    classification: basis.entries.some((entry) => entry.kind === "hypothesis") ? "working_hypothesis" as const : "working_selection" as const,
    inputs: [debt, ebitda].map((entry) => ({decisionId: entry.decisionId, observationId: entry.observationId, definitionVersionId: entry.dimensions.definitionVersionId, value: entry.value.value})),
  };
}
