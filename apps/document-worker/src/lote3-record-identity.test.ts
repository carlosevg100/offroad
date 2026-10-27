import {describe, expect, it} from "vitest";
import {documentKey, labelKey, normalizedName, repeatedLabels, sameLabel, stableKey, statedLabel, withRecordIdentity} from "./lote2-premises";

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

describe("document tuples are compared by their exact stated strings (independent review, round 22)", () => {
  const at = (anchor: string): Reading => ({label: "Varejo", amount: "6", origin: "document", source: "borderô 101", anchor});
  it.each([
    ["'Clientes-A'!A2", "'Clientes A'!A2"],
    ["linha 3", "LINHA 3"],
    ["linha-3", "linha 3"],
    ["linha 3", "linha 3."],
  ])("%s and %s are two anchors: two records and two keys", (a, b) => {
    for (const sourceIdentifies of [false, true]) {
      const r = run([at(a), at(b)], sourceIdentifies);
      expect([r.records.length, r.missing]).toEqual([2, []]);
    }
    expect(documentKey("conjunto", ["borderô 101", a])).not.toBe(documentKey("conjunto", ["borderô 101", b]));
  });
  it("the same anchor with outer whitespace is one anchor", () => {
    expect(run([at("linha 3"), at("  linha 3 ")], false)).toMatchObject({missing: []});
    expect(run([at("linha 3"), at("  linha 3 ")], false).records.length).toBe(1);
    expect(documentKey("conjunto", [" borderô 101", "linha 3 "])).toBe(documentKey("conjunto", ["borderô 101", "linha 3"]));
    // Serialized as an array: the parts never run into each other.
    expect(documentKey("conjunto", ["a b", "c"])).not.toBe(documentKey("conjunto", ["a", "b c"]));
  });
});

describe("one label equivalence for every comparison, reconciliation and reference (independent review, round 24)", () => {
  const equal = [["Caixa em 30/set", "Caixa  em  30/set"], ["Caixa em 30/set", "Caixa\tem 30/set"], ["Caixa em 30/set", "Caixa\u00a0em 30/set"],
    ["Caixa em 30/set", " CAIXA EM 30/SET "], ["Ação Ltda", "acao ltda"]] as const;
  const different = [["Caixa em 30/set", "Caixa em 30-set"], ["Lote 001", "Lote 1"], ["Rede A.", "Rede A"]] as const;
  it.each(equal)("%j and %j are one label everywhere", (a, b) => {
    expect([labelKey(a) === labelKey(b), statedLabel(a) === statedLabel(b), sameLabel(a, b), normalizedName(a) === normalizedName(b), stableKey(a) === stableKey(b)])
      .toEqual([true, true, true, true, true]);
    expect(repeatedLabels([a, b])).toEqual([2]);
    const r = withRecordIdentity({rows: [{label: a, value: "1", origin: "document", source: "x"}, {label: b, value: "1", origin: "document", source: "y"}]}, {keyed: ["rows"], countable: []}, []);
    expect((r.e.rows as unknown[]).length).toBe(1);
  });
  it.each(different)("%j and %j are two labels everywhere", (a, b) => {
    expect([labelKey(a) === labelKey(b), statedLabel(a) === statedLabel(b), sameLabel(a, b), normalizedName(a) === normalizedName(b), stableKey(a) === stableKey(b)])
      .toEqual([false, false, false, false, false]);
    expect(repeatedLabels([a, b])).toEqual([]);
  });
});
