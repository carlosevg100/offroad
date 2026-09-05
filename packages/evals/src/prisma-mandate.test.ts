import {readFileSync} from "node:fs";
import {join} from "node:path";

import {assessMandateFit, resolveMandate, type Mandate} from "@offroad/fund-mandate";
import {describe, expect, it} from "vitest";

const file = join(import.meta.dirname, "..", "..", "testing-fixtures", "assets", "prisma", "mandate.json");

describe("Prisma synthetic mandate (case 04)", () => {
  it("is labeled synthetic, resolves with the ticket divergence shown, and excludes the Cogna request on the ticket alone", () => {
    const mandate = JSON.parse(readFileSync(file, "utf8")) as Mandate & {label: string};
    expect(mandate.label).toMatch(/FIXTURE SINTÉTICA/);
    const resolved = resolveMandate(mandate, {asOf: "2026-09-04"});
    expect(resolved.divergences).toEqual(["ticket"]);
    const fit = assessMandateFit(resolved, {amount: "1800000000", termMonths: 84, sector: "educação", geography: "BR", instruments: ["debenture"], collateral: ["quirografario"], leverage: "0.98"});
    expect(fit.verdict).toBe("excluded");
    expect(fit.exclusions.map((criterion) => criterion.id)).toEqual(["ticket"]);
    expect(fit.criteria.find((criterion) => criterion.id === "dscr")?.outcome).toBe("unknown");
  });
});
