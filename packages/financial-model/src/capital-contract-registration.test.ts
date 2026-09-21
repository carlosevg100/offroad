import {readFileSync} from "node:fs";
import {describe, expect, it} from "vitest";
import {matchesMethodValue, methodDataContractFromJsonSchema} from "@offroad/credit-playbook";
import {capitalContractPreparationFixture} from "@offroad/testing-fixtures/capital-structure-decision";
import {capitalContractPreparationExecutorContracts} from "./capital-executor-contracts";
import {capitalContractPreparationOutputSchema, prepareCapitalContractEvidence} from "./capital-contract-preparation";
describe("contract preparation registration", () => {
  it("pins contracts generated from actual validated preparation schemas", () => {
    expect(readFileSync(new URL("../contracts/capital-contract-preparation.json", import.meta.url), "utf8"))
      .toBe(JSON.stringify(capitalContractPreparationExecutorContracts()) + "\n");
  });
  it("matches actual source-bound inputs and traced outputs with typed maps", () => {
    const input = capitalContractPreparationFixture(); const result = prepareCapitalContractEvidence(input);
    const c = capitalContractPreparationExecutorContracts();
    expect(matchesMethodValue(c.inputs.value, input)).toBe(true); expect(matchesMethodValue(c.outputs.value, result)).toBe(true);
    expect(result.interest!.trace.calculations.length).toBeGreaterThan(0); expect(result.covenants!.trace.calculations.length).toBeGreaterThan(0);
  });
  it("refuses incomplete traces floating money and fabricated authority in the output", () => {
    const r = prepareCapitalContractEvidence(capitalContractPreparationFixture());
    expect(capitalContractPreparationOutputSchema.safeParse({...r, grantsExecution: true}).success).toBe(false);
    expect(capitalContractPreparationOutputSchema.safeParse({...r, interest: {...r.interest, trace: {}}}).success).toBe(false);
    const raw = JSON.parse(JSON.stringify(r)); raw.covenants.covenants[0].netDebtByDefinition.value = 150;
    expect(capitalContractPreparationOutputSchema.safeParse(raw).success).toBe(false);
  });
  it("projects safe integer literals while refusing arbitrary binary floating values", () => {
    const p = (value: unknown) => methodDataContractFromJsonSchema("test.contract", "2026.09.20-v1", value).value;
    expect(p({type: "number", const: 12})).toEqual({type: "integer"});
    for (const value of [{type: "number"}, {type: "number", const: 0.1}, {type: "number", const: 1e20}]) expect(() => p(value)).toThrow();
  });
});
