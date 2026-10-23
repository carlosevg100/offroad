import {describe, expect, it} from "vitest";
import {prepareDebtTablePacket} from "./debt-table-packet";
import {auroraDebtTableBasis} from "./debt-table.test-support";
import {calculateDebtTableEvidence, fichaCalculationExecutorContracts} from "./ficha-executor-contracts";

const question = "Monta a tabela de dívida com tudo que temos.";
describe("debt table packet", () => {
  it("orders what the table establishes for the answer", () => {
    const p = prepareDebtTablePacket({schemaVersion: "debt-table-packet-input.v1", question, analysis: auroraDebtTableBasis().seal()});
    expect(p.status).toBe("prepared_for_human_review");
    expect(p.readings).toEqual({reconciled: true, viewCount: 4, unusedLimits: "10", categoriesNotExamined: [], outsideEveryView: ["fianca"], basketsExceeded: [],
      lowestCrossDefault: {instrumentId: "ccb-bradesco", threshold: "5"}, leverageDefinitions: 2, completenessRequest: true});
    expect(p.result.table!.profile.largestCreditor!.creditor).toBe("Debenturistas");
    expect(p.grantsExecution).toBe(false);
  });
  it("is deterministic and registered as a ficha executor", () => {
    const a = auroraDebtTableBasis().seal();
    expect(prepareDebtTablePacket({schemaVersion: "debt-table-packet-input.v1", question, analysis: a}).fingerprint)
      .toBe(prepareDebtTablePacket({schemaVersion: "debt-table-packet-input.v1", question, analysis: a}).fingerprint);
    expect(calculateDebtTableEvidence(a).status).toBe("partial_composition");
    expect(fichaCalculationExecutorContracts().map((c) => c.name)).toContain("debt-table-evidence");
  });
  it("does not divide by a zero or negative EBITDA", () => {
    const f = auroraDebtTableBasis();
    for (const e of f.entries) if (e.fieldPath.endsWith("leverage.escritura.ebitdaDeduction")) e.value = {type: "number", value: "54"};
    const p = prepareDebtTablePacket({schemaVersion: "debt-table-packet-input.v1", question, analysis: f.seal()});
    expect(p.result.table!.leverage.find((l) => l.viewId === "escritura")!.ratio).toBeNull();
  });
  it("frames the question without a table when a term is missing", () => {
    const f = auroraDebtTableBasis();
    const a = f.seal() as ReturnType<typeof f.seal> & {availableCash: {decisionId: string | null; missingReason: string | null}};
    a.availableCash = {...a.availableCash, decisionId: null, missingReason: "Caixa de 30/jun não confirmado"};
    const p = prepareDebtTablePacket({schemaVersion: "debt-table-packet-input.v1", question, analysis: a});
    expect(p.status).toBe("partial");
    expect(p.result.table!.leverage.every((l) => l.ratio === null)).toBe(true);
    expect(p.gaps.map((g) => g.reason)).toContain("Caixa de 30/jun não confirmado");
  });
});
