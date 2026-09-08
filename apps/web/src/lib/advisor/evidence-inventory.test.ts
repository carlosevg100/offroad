import {describe, expect, it} from "vitest";
import {openEvidenceRequirements} from "./evidence-inventory";

describe("evidence inventory", () => {
  it("does not call an unexamined requirement missing or duplicate an assessed one", () => {
    const output = openEvidenceRequirements([
      {key: "cash", label: "Caixa", materiality: "blocking"},
      {key: "debt", label: "Dívida", materiality: "high"},
    ], [{id: "d", requirement_key: "debt", label: "Dívida", materiality: "high", status: "verified", missing_reason: null}]);
    expect(output).toEqual([{id: "unexamined:cash", label: "Caixa", materiality: "blocking", status: "not_examined", reason: null}]);
  });
  it("preserves all open findings and their reasons, including outside the profile", () => {
    const inputs = Array.from({length: 9}, (_, i) => ({id: `${i}`, requirement_key: `key${i}`, label: `Requirement ${i}`,
      status: i === 8 ? "conflicting" : "partial", materiality: i === 8 ? "blocking" : "high", missing_reason: `Reason ${i}`}));
    const output = openEvidenceRequirements([], inputs);
    expect(output).toHaveLength(9);
    expect(output[0]).toMatchObject({id: "8", status: "conflicting", reason: "Reason 8"});
  });
});
