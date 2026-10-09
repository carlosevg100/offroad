import {readFileSync} from "node:fs";
import {describe, expect, it} from "vitest";
import {fichaCalculationExecutorContracts} from "./ficha-executor-contracts";

describe("ficha calculation contracts fixed by executable schemas", () => {
  it.each(fichaCalculationExecutorContracts())("pins generated $name to the exact input and output validation schemas", ({name, ...contract}) => {
    expect(readFileSync(new URL(`../contracts/${name}.json`, import.meta.url), "utf8")).toBe(JSON.stringify(contract) + "\n");
    expect(contract.executor.version).toBe("2026.10.07-v1");
    expect(contract.validationSchemas.output).toMatchObject({type: "object", additionalProperties: false});
  });
  it("requires real typed operands and immutable dependencies rather than an opaque calculated payload", () => {
    for (const c of fichaCalculationExecutorContracts()) {
      expect(c.outputs.value.type).toBe("object");
      if (c.outputs.value.type !== "object") throw new Error("object expected");
      for (const name of ["scope", "basisFingerprint", "bindings", "contributions", "derivedDependencies", "gaps", "fingerprint"])
        expect(c.outputs.value.fields[name]?.required).toBe(true);
      const json = JSON.stringify(c.validationSchemas.output);
      expect(json).not.toContain('"additionalProperties":true');
      expect(json).not.toContain('"payloadJson"');
      expect(json).toContain('"operands"');
    }
  });
});
