import {createHash} from "node:crypto";
import {buildDatedDebtCashFlows, buildLiquidityCalendar, financialCoreVersion} from "@offroad/financial-core";
import {resolveAdoptedDebtInputs} from "./adopted-debt-inputs";
export {adoptedDebtLiquidityInputSchema} from "./adopted-debt-inputs";

/** Pure context adapter; the authorized SQL reader remains the source of the envelope. */
export function calculateAdoptedDebtLiquidity(raw: unknown) {
  const {input, instruments, openingAvailable, openingRestricted, operatingEvents, gaps, bindings, used, instrumentBindings, normalization} = resolveAdoptedDebtInputs(raw);
  const debt = gaps.length ? null : buildDatedDebtCashFlows({openingDate: input.openingDate, endDate: input.endDate, currency: input.currency, convention: "draw_at_period_start_pay_at_period_end", instruments});
  const liquidity = debt ? buildLiquidityCalendar({openingDate: input.openingDate, endDate: input.endDate, currency: input.currency,
    convention: "end_of_day_netting", coverage: {status: "partial", reason: `Financing fees and taxes not included. Declared operating coverage: ${input.coverageReason}`},
    openingAvailable, openingRestricted, events: [...operatingEvents, ...debt.events],
  }) : null;
  const payload = {
    schemaVersion: "adopted-debt-liquidity.v2" as const, financialCoreVersion,
    calculationIds: ["financial.dated_debt_cash_flows", "financial.dated_liquidity"] as const,
    scope: input.scope, entityId: input.entityId, perimeter: input.perimeter, currency: input.currency,
    openingDate: input.openingDate, endDate: input.endDate, openingScenario: input.openingScenario, scenario: input.scenario,
    basisFingerprint: input.envelope.fingerprint, status: gaps.length ? "missing_inputs" as const : "partial_composition" as const,
    exclusions: ["financing_fees", "financing_taxes", "all_in_cost"] as const, coverageReason: input.coverageReason,
    classification: [...used.values()].some(e => e.kind === "hypothesis") ? "working_hypothesis" as const : "working_selection" as const,
    debt, liquidity, gaps, bindings, contributions: [...used.values()], numericNormalization: normalization,
    derivedDependencies: debt?.events.map(event => ({eventId: event.id, decisionIds: instrumentBindings.get(event.instrumentId)!})) ?? [],
    grantsExecution: false as const,
  };
  return {...payload, fingerprint: createHash("sha256").update(JSON.stringify(payload)).digest("hex")};
}
