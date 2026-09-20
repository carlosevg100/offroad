import {createHash} from "node:crypto";
import {adoptedOperatingProjectionFixture} from "./adopted-operating-projection";
import {adoptedFinancingFixture} from "./adopted-financing-costs";

/** Synthetic common basis:130 + operational70 + gross100 - fee5 - repayment242 =53. */
export function adoptedCapitalPeriodFixture() {
  const op = adoptedOperatingProjectionFixture(); const f = adoptedFinancingFixture();
  const snapshot = op.snapshot; snapshot.entries.push(...f.snapshot.entries);
  const template = snapshot.entries[0]!;
  const add = (field: string, unit: string, type: "text" | "list", value: string | string[]) => {
    const n = 7000 + snapshot.entries.length;
    const e = {...structuredClone(template), decisionId: `c1540000-0000-4000-9000-${String(n).padStart(12, "0")}`,
      slotKey: createHash("sha256").update(field).digest("hex"), fieldPath: `capital.${field}`,
      dimensions: {...template.dimensions, periodStart: "2027-01-01", periodEnd: "2027-02-28", scenario: "house", unit,
        definitionVersionId: `c1540000-0000-4000-9000-${String(n + 1000).padStart(12, "0")}`}, value: {type, value}};
    snapshot.entries.push(e); return {decisionId: e.decisionId as string | null, definitionVersionId: e.dimensions.definitionVersionId, definitionKind: e.definitionKind, missingReason: null as string | null};
  };
  const operatingCashAccount = add("operatingCashAccount", "convention", "text", "available");
  const capitalMovementInventory = add("movementInventory", "convention", "text", "declared_complete");
  const capitalMovements = {ids: add("movements.ids", "identity", "list", ["equity", "distribution"]),
    economicIds: add("movements.economicIds", "identity", "list", ["equity", "distribution"]),
    dates: add("movements.dates", "date", "list", ["2027-01-15", "2027-02-15"]), amounts: add("movements.amounts", "currency", "list", ["80", "10"]),
    accounts: add("movements.accounts", "convention", "list", ["available", "available"]),
    kinds: add("movements.kinds", "convention", "list", ["equity_contribution", "distribution"]),
    reasons: add("movements.reasons", "explanation", "list", ["Synthetic proposed equity raise", "Synthetic planned distribution"])};
  const noDebtInventory = add("financingInventory", "convention", "text", "no_debt_or_financing");
  const canonical = JSON.stringify(snapshot); const envelope = {canonical, fingerprint: createHash("sha256").update(canonical).digest("hex")};
  const operating = {...op.input, envelope}; const funding = {kind: "debt" as const, input: {...f.input, operatingEvents: [], envelope}};
  const input = {operating, funding, operatingCashAccount, capitalMovementInventory, capitalMovements};
  return {synthetic: true as const, snapshot, input, noDebt: {kind: "no_debt" as const, inventory: noDebtInventory,
    openingAvailable: f.input.openingAvailable, openingRestricted: f.input.openingRestricted}};
}
