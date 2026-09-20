import {createHash} from "node:crypto";
import {adoptedDebtLiquidityFixture} from "./adopted-debt-liquidity";

/** Synthetic: 130 + 20 + 100 - 5 - 200*1.1*1.1 = 3. */
export function adoptedFinancingFixture() {
  const base = adoptedDebtLiquidityFixture();
  const snapshot = base.snapshot; const instrumentId = base.input.instruments[0]!.id;
  snapshot.entries.find(e => e.fieldPath.endsWith(".drawdowns"))!.value.value = ["100", "0"];
  const add = (name: string, unit: string, type: "text" | "list", value: string | string[]) => {
    const n = 1000 + snapshot.entries.length;
    const entry = {...structuredClone(snapshot.entries[0]!), decisionId: `c1520000-0000-4000-9000-${String(n).padStart(12, "0")}`,
      slotKey: createHash("sha256").update(name).digest("hex"), fieldPath: `financing.${instrumentId}.${name}`,
      dimensions: {...snapshot.entries[0]!.dimensions, periodStart: "2027-01-01", periodEnd: "2027-02-28", scenario: "house", unit,
        definitionVersionId: `c1520000-0000-4000-9000-${String(n + 1000).padStart(12, "0")}`}, value: {type, value}};
    snapshot.entries.push(entry);
    return {decisionId: entry.decisionId as string | null, definitionVersionId: entry.dimensions.definitionVersionId,
      definitionKind: entry.definitionKind, missingReason: null as string | null};
  };
  const financing = [{instrumentId,
    drawConvention: add("drawConvention", "convention", "text", "gross_cash_before_withholding"),
    assessments: {
      origination_fee: add("origination_fee.assessment", "convention", "text", "specified"),
      recurring_fee: add("recurring_fee.assessment", "convention", "text", "not_applicable"),
      tax: add("tax.assessment", "convention", "text", "zero"),
      other: add("other.assessment", "convention", "text", "not_applicable"),
    }, charges: {
      chargeIds: add("chargeIds", "identity", "list", ["fee"]), economicIds: add("economicIds", "identity", "list", ["fee"]),
      categories: add("categories", "convention", "list", ["origination_fee"]),
      periods: add("periods", "date", "list", ["2027-01-31"]), dates: add("dates", "date", "list", ["2027-01-01"]),
      amounts: add("amounts", "currency", "list", ["5"]), treatments: add("treatments", "convention", "list", ["withheld_from_gross_draw"]),
      accounts: add("accounts", "convention", "list", ["available"]),
    },
  }];
  const canonical = JSON.stringify(snapshot);
  return {synthetic: true as const, snapshot, input: {...base.input, financing,
    envelope: {canonical, fingerprint: createHash("sha256").update(canonical).digest("hex")}}};
}
