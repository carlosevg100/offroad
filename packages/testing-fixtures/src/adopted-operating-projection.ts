import {createHash} from "node:crypto";
import {adoptedDebtLiquidityFixture} from "./adopted-debt-liquidity";

/** Synthetic accrual-to-cash budget:20 in January,50 in February; no financing. */
export function adoptedOperatingProjectionFixture() {
  const base = adoptedDebtLiquidityFixture(); const snapshot = base.snapshot;
  snapshot.entries = [];
  const template = adoptedDebtLiquidityFixture().snapshot.entries[0]!;
  const add = (field: string, unit: string, type: "number" | "text" | "list", value: string | string[], opening = false) => {
    const n = 3000 + snapshot.entries.length;
    const e = {...structuredClone(template), decisionId: `c1530000-0000-4000-9000-${String(n).padStart(12, "0")}`,
      slotKey: createHash("sha256").update(field + String(opening)).digest("hex"), fieldPath: `operating_projection.${field}`,
      dimensions: {...template.dimensions, periodStart: opening ? null : "2027-01-01", periodEnd: opening ? "2026-12-31" : "2027-02-28",
        scenario: opening ? "actual" : "house", unit, definitionVersionId: `c1530000-0000-4000-9000-${String(n + 1000).padStart(12, "0")}`}, value: {type, value}};
    snapshot.entries.push(e);
    return {decisionId: e.decisionId as string | null, definitionVersionId: e.dimensions.definitionVersionId, definitionKind: e.definitionKind, missingReason: null as string | null};
  };
  const openingWorkingCapital = {receivables: add("workingCapital.receivables", "currency", "number", "30", true),
    inventory: add("workingCapital.inventory", "currency", "number", "20", true), otherOperatingAssets: add("workingCapital.otherOperatingAssets", "currency", "number", "0", true),
    payables: add("workingCapital.payables", "currency", "number", "10", true), otherOperatingLiabilities: add("workingCapital.otherOperatingLiabilities", "currency", "number", "0", true)};
  const closingWorkingCapital = {receivables: add("workingCapital.receivables", "currency", "list", ["45", "30"]),
    inventory: add("workingCapital.inventory", "currency", "list", ["25", "20"]), otherOperatingAssets: add("workingCapital.otherOperatingAssets", "currency", "list", ["0", "0"]),
    payables: add("workingCapital.payables", "currency", "list", ["15", "10"]), otherOperatingLiabilities: add("workingCapital.otherOperatingLiabilities", "currency", "list", ["0", "0"])};
  const costs = {variableOperatingExpense: "90", fixedOperatingExpense: "40", nonCashEbitdaAdjustment: "5", cashTaxesPaid: "8", cashTaxRefunds: "0", maintenanceCapexPaid: "12", growthCapexPaid: "20"};
  const expenses = Object.fromEntries(Object.entries(costs).map(([key, value]) => [key, add(key, "currency", "list", [value, value])])) as Record<keyof typeof costs, ReturnType<typeof add>>;
  const convention = add("convention", "convention", "text", "accrual_ebitda_to_cash_before_financing");
  const periodEnds = add("periodEnds", "date", "list", ["2027-01-31", "2027-02-28"]);
  const revenue = {mode: "drivers" as const, convention: add("revenue.convention", "convention", "text", "drivers"),
    quantities: add("revenue.quantities", "quantity", "list", ["10", "10"]), netUnitPrices: add("revenue.netUnitPrices", "currency", "list", ["20", "20"])};
  const canonical = JSON.stringify(snapshot);
  const {scope, entityId, perimeter, currency, openingScenario, scenario, openingDate, endDate} = base.input;
  return {synthetic: true as const, snapshot, input: {scope, entityId, perimeter, currency, openingScenario, scenario, openingDate, endDate,
    envelope: {canonical, fingerprint: createHash("sha256").update(canonical).digest("hex")},
    openingWorkingCapital, closingWorkingCapital, expenses, convention, periodEnds, revenue}};
}
