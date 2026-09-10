import {describe, expect, it} from "vitest";
import {receivablesR01Fixture} from "../../../e2e/support/receivables-r01-fixture";
describe("synthetic R01 browser fixture", () => {
  it("creates a real parsed workbook envelope without seeding results", async () => {
    const fixture = await receivablesR01Fixture();
    expect(fixture.sources).toHaveLength(2);
    expect(fixture.report.candidates[0]?.sheet).toBe("CARTEIRA");
    expect(fixture.report.sourceManifest.fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(fixture)).not.toContain("methodExecution");
  });
});
