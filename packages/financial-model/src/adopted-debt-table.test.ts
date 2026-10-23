import {describe, expect, it} from "vitest";
import {calculateAdoptedDebtTable} from "./adopted-debt-table";
import {auroraDebtTableBasis} from "./debt-table.test-support";

describe("debt table from adopted contract terms", () => {
  it("reads every term from its own adoption and reproduces the ficha", () => {
    const r = calculateAdoptedDebtTable(auroraDebtTableBasis().seal());
    expect(r.status).toBe("partial_composition");
    expect(r.gaps).toEqual([]);
    expect(r.table!.reconciliation.status).toBe("exact");
    expect(r.table!.views.map(v => v.total)).toEqual(["130", "131.8", "138", "144"]);
    expect(r.table!.negativePledgeBaskets[0]).toMatchObject({occupied: "12", remaining: "3"});
    expect(Number(r.table!.leverage[0]!.ratio).toFixed(2)).toBe("2.02");
    expect(r.contributions.length).toBe(r.bindings.filter(b => b.decisionId).length);
    expect(r.fingerprint).toMatch(/^[a-f0-9]{64}$/);
  });
  it("returns the gap instead of a table when a term is not adopted", () => {
    const f = auroraDebtTableBasis();
    const input = f.seal() as ReturnType<typeof f.seal> & {instruments: {terms: Record<string, unknown>}[]};
    input.instruments[1]!.terms.principal = {decisionId: null, definitionVersionId: (input.instruments[1]!.terms.principal as {definitionVersionId: string}).definitionVersionId,
      definitionKind: "managerial", missingReason: "Saldo do principal não confirmado"};
    const r = calculateAdoptedDebtTable(input);
    expect(r.status).toBe("missing_inputs");
    expect(r.table).toBeNull();
    expect(r.gaps).toEqual([{operand: expect.stringContaining("instrument.ccb-bradesco.principal"), reason: "Saldo do principal não confirmado"}]);
  });
  it("refuses a term read in another context", () => {
    const f = auroraDebtTableBasis();
    f.entries.find(e => e.fieldPath.endsWith("instrument.finame.principal"))!.dimensions.scenario = "adverse";
    expect(() => calculateAdoptedDebtTable(f.seal())).toThrow("analysis_basis_context_mismatch");
  });
});
