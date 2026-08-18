import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {dirname, join} from "node:path";
import {fileURLToPath} from "node:url";

import {describe, expect, it} from "vitest";

import {buildRedeHorizonteDocumentIntake, redeHorizonteFileHashes, redeHorizonteRequiredFiles} from "./document-intake";

const assetsDirectory = join(dirname(fileURLToPath(import.meta.url)), "..", "assets", "rede-horizonte");

describe("Rede Horizonte document-first intake fixture", () => {
  const result = buildRedeHorizonteDocumentIntake(redeHorizonteRequiredFiles.map((original_name, index) => ({id: `document-${index}`, original_name, sha256: redeHorizonteFileHashes[original_name]})));
  const value = (path: string) => result.candidates.find((candidate) => candidate.fieldPath === path && candidate.isPrimary)?.normalizedValue;

  it("reconciles the mandatory transaction and leverage facts", () => {
    expect(result.fixtureMatched).toBe(true);
    expect(value("transaction.requested_amount")).toBe(54_000_000);
    expect(value("transaction.expansion_debt")).toBe(35_000_000);
    expect(value("transaction.refinancing")).toBe(19_000_000);
    expect(value("historical_financials.2025.gross_debt")).toBe(65_000_000);
    expect(value("interim_financials.2026_07.gross_debt")).toBe(68_000_000);
    expect(value("collateral.total_capacity")).toBe(53_760_000);
    expect(value("leverage.pre_transaction_net_debt_ebitda")).toBeCloseTo(1.78, 2);
    expect(value("leverage.post_transaction_net_debt_ebitda")).toBeCloseTo(2.87, 2);
  });

  it("preserves the R$49m versus approximately R$50m conflict", () => {
    const values = result.candidates.filter((candidate) => candidate.fieldPath === "project.total_cost").map((candidate) => candidate.normalizedValue);
    expect(values).toEqual(expect.arrayContaining([49_000_000, 50_000_000]));
    expect(result.issues.some((issue) => issue.type === "conflict" && issue.fieldPath === "project.total_cost")).toBe(true);
  });

  it("keeps accounting stock distinct from eligible collateral", () => {
    expect(value("collateral.inventory_accounting")).toBe(32_600_000);
    expect(value("collateral.inventory_gross_base")).toBe(29_700_000);
    expect(value("collateral.inventory_eligible")).toBe(18_800_000);
  });

  it("surfaces missing documents rather than inventing their contents", () => {
    const partial = buildRedeHorizonteDocumentIntake([{id: "one", original_name: redeHorizonteRequiredFiles[0], sha256: redeHorizonteFileHashes[redeHorizonteRequiredFiles[0]]}]);
    expect(partial.fixtureMatched).toBe(false);
    expect(partial.missingFiles).toHaveLength(7);
    expect(partial.issues.filter((issue) => issue.title.startsWith("Documento esperado não recebido"))).toHaveLength(7);
  });

  it("refuses a same-name file when its content hash differs", () => {
    const mismatched = buildRedeHorizonteDocumentIntake(redeHorizonteRequiredFiles.map((original_name, index) => ({id: `document-${index}`, original_name, sha256: index === 0 ? "0".repeat(64) : redeHorizonteFileHashes[original_name]})));
    expect(mismatched.fixtureMatched).toBe(false);
    expect(mismatched.candidates.some((candidate) => candidate.sourceName === redeHorizonteRequiredFiles[0])).toBe(false);
  });

  it("keeps unknown document sets safe and free of fixture-specific claims", () => {
    const unknown = buildRedeHorizonteDocumentIntake([{id: "unknown", original_name: "outro-balancete.xlsx", sha256: "f".repeat(64)}]);
    expect(unknown.candidates).toEqual([]);
    expect(unknown.missingFiles).toEqual([]);
    expect(unknown.issues).toHaveLength(1);
    expect(unknown.issues[0]?.description).toContain("nenhum campo foi proposto");
  });

  it("matches the versioned synthetic data room byte for byte", () => {
    for (const name of redeHorizonteRequiredFiles) {
      const digest = createHash("sha256").update(readFileSync(join(assetsDirectory, name))).digest("hex");
      expect(digest, name).toBe(redeHorizonteFileHashes[name]);
    }
  });
});
