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
    const file = join(copy, "packages/credit-playbook/knowledge/procedures/capital/prepare-capital-structure-decision.md");
    const text = readFileSync(file, "utf8"); const block = text.match(/```offroad-procedure\n([\s\S]*?)\n```/)![1]!;
    const composition = JSON.parse(block); const contracts = JSON.parse(readFileSync(join(root, "packages/financial-model/contracts/capital-decision-delivery.json"), "utf8"));
    const {text: _text, ...base} = composition.components[0];
    const component = {...base, id: "capital.synthetic-registration", kind: "rule", authority: "house", statement: "Synthetic registration test; not publication",
      executor: contracts.executor, inputs: contracts.inputs, outputs: contracts.outputs};
    composition.components = [component]; const write = () => writeFileSync(file, text.replace(block, JSON.stringify(composition)));
    write(); test(copy, component, write);
  } finally {rmSync(copy, {recursive: true, force: true});}
}
describe("capital executor registration", () => {
  it("binds the actual registered contracts and complete first-party closure without granting execution", () => withCandidate(copy => {
    const p = buildMethodManifest(copy).provenance.find(p => p.procedure.id === "prepare-capital-structure-decision")!;
    expect(p.grantsExecution).toBe(false);
    if (!("components" in p)) throw new Error("Expected compiled candidate");
    const paths = (p as CompiledProcedureManifest).components[0]!.executor!.sources.map(s => s.path);
    expect(paths).toContain("packages/financial-model/src/capital-decision-delivery.ts");
    expect(paths).toContain("packages/financial-core/src/capital-period-cash.ts");
    expect(paths).toContain("packages/financial-model/contracts/capital-decision-delivery.json");
    expect(paths).toContain("packages/financial-model/scripts/generate-capital-contracts.mjs");
  }));
  it("rejects an author's changed contract instead of trusting the same executor label", () => withCandidate((copy, component, write) => {
    component.inputs = {...component.inputs as object, value: {type: "string"}}; write();
    expect(() => buildMethodManifest(copy)).toThrow(/executor contract mismatch/);
  }));
  it("rejects an unregistered export rather than granting arbitrary package execution", () => withCandidate((copy, component, write) => {
    component.executor = {...component.executor as object, exportName: "inventedExecutor"}; write();
    expect(() => buildMethodManifest(copy)).toThrow(/unregistered executor/);
  }));
});
