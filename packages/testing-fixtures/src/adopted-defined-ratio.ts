import {createHash} from "node:crypto";
import {adoptedDebtLiquidityFixture} from "./adopted-debt-liquidity";

/** Synthetic contractual-definition hypothesis. It is not an actual contract or approval. */
export function adoptedDefinedRatioFixture() {
  const base = adoptedDebtLiquidityFixture();
  type Original = typeof base.snapshot.entries[number];
  type Entry = Omit<Original, "dimensions"> & {dimensions: Omit<Original["dimensions"], "currency"> & {currency: string | null}};
  const snapshot = {...base.snapshot, entries: [] as Entry[]};
  const template = structuredClone(base.snapshot.entries[0]!);
  const add = (field: string, value: string, type: "number" | "text", unit: string, periodStart: string | null = null) => {
    const n = 6000 + snapshot.entries.length;
    const e = {...structuredClone(template), decisionId: `c1560000-0000-4000-9000-${String(n).padStart(12, "0")}`,
      slotKey: createHash("sha256").update(field).digest("hex"), fieldPath: `defined_ratio.leverage.${field}`,
      definitionKind: "contractual" as const, dimensions: {...template.dimensions, currency: unit === "currency" ? "BRL" : null,
        unit, periodStart, periodEnd: "2027-12-31", scenario: "house", definitionVersionId: `c1560000-0000-4000-9000-${String(n + 1000).padStart(12, "0")}`},
      value: {type, value}};
    snapshot.entries.push(e);
    return {decisionId: e.decisionId as string | null, definitionVersionId: e.dimensions.definitionVersionId,
      definitionKind: e.definitionKind, missingReason: null as string | null};
  };
  const numerator = {selection: add("numerator", "300", "number", "currency"), periodStart: null as string | null};
  const denominator = {selection: add("denominator", "100", "number", "currency", "2027-01-01"), periodStart: "2027-01-01" as string | null};
  const limit = add("limit", "3", "number", "ratio");
  const comparator = add("comparator", "lte", "text", "convention");
  const convention = add("convention", "positive_denominator_unrounded_comparison", "text", "convention");
  const canonical = JSON.stringify(snapshot);
  const {scope, entityId, perimeter, currency, scenario} = base.input;
  return {synthetic: true as const, snapshot, input: {scope, entityId, perimeter, currency, scenario,
    measurementDate: "2027-12-31", ratioId: "leverage", definitionKind: "contractual" as "contractual" | "managerial",
    numerator, denominator, limit, comparator, convention,
    envelope: {canonical, fingerprint: createHash("sha256").update(canonical).digest("hex")}}};
}
