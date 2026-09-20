import {createHash} from "node:crypto";
const id = (n: number) => `c1510000-0000-4000-9000-${String(n).padStart(12, "0")}`;
type Entry = {
  decisionId: string; slotKey: string; kind: "hypothesis" | "observation"; fieldPath: string;
  dimensions: {entityId: string; perimeter: string; periodStart: string | null; periodEnd: string; currency: string; unit: string; scale: string; scenario: string; definitionVersionId: string};
  value: {type: "number" | "text" | "list"; value: string | string[]}; observationId: string | null;
  referenceValue: null; referenceDimensions: null; definitionKind: "managerial" | "contractual"; actorId: string; reason: string;
};
/** Synthetic domain operands. 130 + 20 - 121 = 29; restricted 500 stays separate. */
export function adoptedDebtLiquidityFixture() {
  const entries: Entry[] = [];
  const add = (path: string, unit: string, type: Entry["value"]["type"], value: string | string[], opening = false, day?: string) => {
    const n = entries.length + 100;
    const entry: Entry = {decisionId: id(n), slotKey: createHash("sha256").update(path).digest("hex"), kind: "hypothesis", fieldPath: path,
      dimensions: {entityId: id(1), perimeter: "standalone", periodStart: opening ? null : day ?? "2027-01-01", periodEnd: opening ? "2026-12-31" : day ?? "2027-02-28", currency: "BRL", unit, scale: "1", scenario: opening ? "actual" : "house", definitionVersionId: id(n + 1000)},
      value: {type, value}, observationId: null, referenceValue: null, referenceDimensions: null, definitionKind: "managerial", actorId: id(2), reason: "Synthetic explicit adoption for deterministic composition testing"};
    entries.push(entry); return {decisionId: entry.decisionId as string | null, definitionVersionId: entry.dimensions.definitionVersionId, definitionKind: entry.definitionKind, missingReason: null as string | null};
  };
  const openingAvailable = add("liquidity.available_cash", "currency", "number", "130", true);
  const openingRestricted = add("liquidity.restricted_cash", "currency", "number", "500", true);
  const debtId = id(10); const prefix = `debt.${debtId}.`;
  const term = (key: string, value: string) => add(prefix + key, "convention", "text", value);
  const curve = (key: string, unit: string, value: string[]) => add(prefix + key, unit, "list", value);
  const terms = {
    timing: term("timing", "draw_at_period_start_pay_at_period_end"), indexer: term("indexer", "none"),
    indexationTreatment: term("indexationTreatment", "not_applicable"), couponTreatment: term("couponTreatment", "capitalized_principal"),
    couponBase: term("couponBase", "opening_principal"), drawdownAccount: term("drawdownAccount", "available"), paymentAccount: term("paymentAccount", "available"),
    openingPrincipal: add(prefix + "openingPrincipal", "currency", "number", "100", true),
    periodEnds: curve("periodEnds", "date", ["2027-01-31", "2027-02-28"]),
    indexationRates: curve("indexationRates", "ratio", ["0", "0"]), couponRates: curve("couponRates", "ratio", ["0.1", "0.1"]),
    drawdowns: curve("drawdowns", "currency", ["0", "0"]), scheduledPrincipal: curve("scheduledPrincipal", "currency", ["0", "0"]),
    prepayments: curve("prepayments", "currency", ["0", "0"]), repayAll: curve("repayAll", "boolean", ["false", "true"]),
  };
  const cash = add("cash.available.operating_receipts", "currency", "number", "20", false, "2027-01-15");
  const snapshot = {schemaVersion: "contextual-adoption.v1", versionId: id(3), setId: id(4), workId: id(5), purpose: "capital structure decision", contextKey: "debt-liquidity", revision: 1, previousVersionId: null, classification: "working_basis", entries};
  const canonical = JSON.stringify(snapshot);
  const input = {
    envelope: {canonical, fingerprint: createHash("sha256").update(canonical).digest("hex")},
    scope: {workId: snapshot.workId, purpose: snapshot.purpose, versionId: snapshot.versionId},
    entityId: id(1), perimeter: "standalone", currency: "BRL", openingScenario: "actual", scenario: "house", openingDate: "2026-12-31", endDate: "2027-02-28",
    openingAvailable, openingRestricted, instruments: [{id: debtId, terms}],
    operatingEvents: [{id: "receipt", date: "2027-01-15", account: "available", category: "operating_receipts", selection: cash}],
    coverageReason: "Synthetic dated operating cash; financing fees and taxes absent",
  };
  return {synthetic: true as const, input, snapshot};
}
