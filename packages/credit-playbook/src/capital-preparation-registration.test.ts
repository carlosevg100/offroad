import {cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join, resolve} from "node:path";
import {describe, expect, it} from "vitest";
import type {CompiledProcedureManifest} from "./procedure-compiler";
import {buildMethodManifest} from "./build-method-manifest";
const root = resolve(import.meta.dirname, "../../..");
function withCandidate(test: (copy: string, component: Record<string, unknown>, write: () => void) => void) {
  const copy = mkdtempSync(join(tmpdir(), "offroad-synthetic-method-registration-"));
  try {
    mkdirSync(join(copy, "packages"));
    for (const name of readdirSync(join(root, "packages"))) {
      if (name === "credit-playbook") cpSync(join(root, "packages", name), join(copy, "packages", name), {recursive: true, filter: p => !/\/(node_modules|dist)(\/|$)/.test(p)});
      else symlinkSync(join(root, "packages", name), join(copy, "packages", name));
    }
    for (const name of ["pnpm-lock.yaml", "tsconfig.base.json"]) cpSync(join(root, name), join(copy, name));
    mkdirSync(join(copy, "apps/document-worker/src"), {recursive: true});
    cpSync(join(root, "apps/document-worker/src/capital-planning-adapter.test.ts"), join(copy, "apps/document-worker/src/capital-planning-adapter.test.ts"));
    const file = join(copy, "packages/credit-playbook/knowledge/procedures/capital/prepare-capital-structure-decision.md");
    const text = readFileSync(file, "utf8"); const block = text.match(/```offroad-procedure\n([\s\S]*?)\n```/)![1]!;
    const composition = JSON.parse(block); const contracts = JSON.parse(readFileSync(join(root, "packages/financial-model/contracts/capital-contract-preparation.json"), "utf8"));
    const {text: _text, ...base} = composition.components[0];
    const component = {...base, id: "capital.synthetic-registration", kind: "rule", authority: "house", statement: "Synthetic registration test; not publication",
      executor: contracts.executor, inputs: contracts.inputs, outputs: contracts.outputs};
    composition.components = [component]; const write = () => writeFileSync(file, text.replace(block, JSON.stringify(composition)));
    write(); test(copy, component, write);
  } finally {rmSync(copy, {recursive: true, force: true});}
}
describe("contract preparation build-owned registration", () => {
  it("registers the preparation executor against its exact contracts and transitive sources", () => withCandidate(copy => {
    const p = buildMethodManifest(copy).provenance.find(p => p.procedure.id === "prepare-capital-structure-decision")! as CompiledProcedureManifest;
    const e = p.components[0]!.executor!;
    expect(e.exportName).toBe("prepareCapitalContractEvidence");
    expect(e.sources.map(s => s.path)).toContain("packages/financial-model/src/capital-contract-output.ts");
    expect(e.sources.map(s => s.path)).toContain("packages/financial-model/contracts/capital-contract-preparation.json");
    expect(p.grantsExecution).toBe(false);
  }));
  it("refuses an authored replacement for the registered preparation output", () => withCandidate((copy, component, write) => {
    component.outputs = {...component.outputs as object, value: {type: "string"}}; write();
    expect(() => buildMethodManifest(copy)).toThrow(/executor contract mismatch/);
  }));
});
