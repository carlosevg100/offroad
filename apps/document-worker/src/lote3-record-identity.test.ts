import {describe, expect, it} from "vitest";
import {withRecordIdentity} from "./lote2-premises";

type Reading = {label: string; amount: string; origin: "document" | "informed"; source: string; anchor: string | null};
const run = (readings: Reading[], sourceIdentifies: boolean) => {
  const missing: string[] = [];
  const {e} = withRecordIdentity({records: readings}, {keyed: [], countable: [sourceIdentifies ? {name: "records", sourceIdentifies: true} : "records"]}, missing);
  return {records: e.records as Reading[], missing};
};
const read = (origin: "document" | "informed", amount = "6"): Reading => ({label: "Lote Rede X", amount, origin, source: "borderô 101", anchor: "linha 3"});
const total = (records: Reading[]) => records.reduce((sum, r) => sum + Number(r.amount), 0);

// Lots (a borderô lists lots), causes and new streams (the source is the item's own document) share the anchored rule.
describe.each([["lots", false], ["causes and added streams", true]] as const)("record identity is immutable across readings: %s (independent review, round 19)", (_name, sourceIdentifies) => {
  it.each([
    [["document", "informed", "document"]],
    [["informed", "document", "document"]],
    [["document", "document", "informed"]],
    [["document", "informed", "document", "informed"]],
    [["informed", "informed", "document", "document"]],
  ] as const)("equal readings in the order %j are one record, never summed", (origins) => {
    const r = run(origins.map((o) => read(o)), sourceIdentifies);
    expect([r.records.length, total(r.records), r.missing]).toEqual([1, 6, []]);
    expect(r.records[0]!.origin).toBe("document");
    expect(r.records[0]!.source).toBe("borderô 101 (também informado na conversa)");
    expect(r.records[0]!.anchor).toBe("linha 3");
  });
  it.each([
    [[["document", "6"], ["informed", "6"], ["document", "7"]], ["records.2.anchor"]],
    [[["informed", "6"], ["document", "6"], ["informed", "7"]], ["records.2.anchor"]],
    [[["document", "6"], ["informed", "6"], ["document", "7"], ["informed", "7"]], ["records.2.anchor"]],
    [[["document", "6"], ["document", "7"], ["informed", "6"], ["informed", "7"]], ["records.2.anchor"]],
  ] as const)("a different value for the same row is asked once, whatever the order: %j", (readings, expected) => {
    const r = run(readings.map(([o, amount]) => read(o, amount)), sourceIdentifies);
    expect(r.missing).toEqual(expected);
    expect(r.records.map((x) => x.amount)).toEqual(["6", "7"]);
  });
});
