import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {join} from "node:path";

import {describe, expect, it} from "vitest";

import {agingByDebtor, buildReceivablesTape, encumbrances, receivablesDebtors, receivablesTotal} from "./receivables";
import {customers, interim2026} from "./truth";

const assets = join(import.meta.dirname, "..", "..", "assets", "fakeco");
const goldManifest = join(import.meta.dirname, "..", "..", "gold", "fakeco", "manifest.json");

describe("Aurora synthetic receivables (case 03)", () => {
  it("ties the tape to the interim balance sheet and keeps the declared concentration", () => {
    const rows = buildReceivablesTape();
    expect(rows.reduce((sum, row) => sum + row.balance, 0)).toBe(interim2026.receivables);
    expect(receivablesTotal).toBe(interim2026.receivables);
    const aging = agingByDebtor(rows);
    expect(aging[0]!.debtorName).toBe(customers[0].name);
    expect(aging[0]!.total / receivablesTotal).toBeCloseTo(customers[0].share, 3);
    expect(receivablesDebtors()).toHaveLength(45);
    expect(new Set(rows.map((row) => row.receivableId)).size).toBe(rows.length);
  });

  it("places the encumbrances of the debt map on current receivables within the granularity tolerance", () => {
    const rows = buildReceivablesTape();
    for (const entry of encumbrances) {
      const placed = rows.filter((row) => row.contract === entry.contract).reduce((sum, row) => sum + row.balance, 0);
      expect(Math.abs(placed - entry.amount)).toBeLessThanOrEqual(150_000);
      expect(rows.filter((row) => row.contract === entry.contract).every((row) => row.bucket === "current" && row.encumbrance === entry.kind)).toBe(true);
    }
  });

  it("is deterministic and matches the gold manifest hashes of the generated files", () => {
    const first = JSON.stringify(buildReceivablesTape());
    expect(JSON.stringify(buildReceivablesTape())).toBe(first);
    const manifest = JSON.parse(readFileSync(goldManifest, "utf8")) as {documents: Array<{name: string; sha256: string}>};
    for (const name of ["09_Aging_Recebiveis_Jul2026.xlsx", "10_Tape_Duplicatas_Jul2026.csv"]) {
      const entry = manifest.documents.find((document) => document.name === name);
      expect(entry, name).toBeDefined();
      expect(createHash("sha256").update(readFileSync(join(assets, name))).digest("hex")).toBe(entry!.sha256);
    }
  });
});
