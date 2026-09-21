import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {describe, expect, it} from "vitest";
import {buildMethodManifest} from "./build-method-manifest";
import {compileMethodDocument} from "./procedure-markdown";
import {compileProcedureComposition, methodContentHash, type CompiledProcedureManifest} from "./procedure-compiler";

const root = resolve(import.meta.dirname, "../../..");
const path = "capital/prepare-capital-structure-decision.md";
const read = (path: string) => ({path, content: readFileSync(resolve(root, path), "utf8")});
const document = compileMethodDocument(read(`packages/credit-playbook/knowledge/procedures/${path}`).content, path);
function manifest(): CompiledProcedureManifest {
  const p = buildMethodManifest(root).provenance.find(p => p.procedure.id === document.procedure.id)!;
  if (p.schemaVersion !== "compiled-procedure-manifest.v1" || !("components" in p)) throw new Error("Typed composition required");
  return p as CompiledProcedureManifest;
}
const contracts = JSON.parse(read("packages/financial-model/contracts/capital-procedure-packet-v2.json").content);

describe("authored integrated capital procedure", () => {
  it("binds the full contractual packet and its transitive calculation sources", () => {
    const p = manifest();
    const component = p.components.find(c => c.component.id === "capital.procedure-packet")!;
    expect(component.component.inputs).toEqual(contracts.inputs);
    expect(component.component.outputs).toEqual(contracts.outputs);
    expect(component.executor).toMatchObject(contracts.executor);
    for (const file of ["capital-procedure-packet-v2.ts", "capital-contract-preparation-v2.ts", "capital-contract-adoptions.ts"])
      expect(component.executor!.sources.map(s => s.path)).toContain(`packages/financial-model/src/${file}`);
  });
  it("pins executed run receipts while retaining the missing final review and approval", () => {
    const p = manifest();
    const evidence = p.components.flatMap(c => c.evidence);
    expect(evidence).toHaveLength(3);
    for (const pin of evidence) expect(pin.hash).toBe(createHash("sha256").update(read(pin.path).content).digest("hex"));
    expect(p).toMatchObject({authoringStatus: "incomplete", grantsExecution: false});
    expect(document.procedure.testRuns.gold).toEqual(["capital-structure-decision-2026-09-21-v3-gold"]);
    expect(document.procedure.owner.approvedAt).toBeUndefined();
  });
  it("changes manifest identity for changed evidence and refuses missing evidence bytes", () => {
    const p = manifest();
    const component = p.components.find(c => c.component.id === "capital.procedure-packet")!;
    const context = {compilerSources: p.compiler.sources.map(s => read(s.path)),
      executors: [{...contracts.executor, inputContractHash: methodContentHash(contracts.inputs),
        outputContractHash: methodContentHash(contracts.outputs), sources: component.executor!.sources.map(s => read(s.path))}],
      evidence: component.evidence.map(s => read(s.path))};
    const original = compileProcedureComposition(document, document.composition, context);
    const changed = compileProcedureComposition(document, document.composition,
      {...context, evidence: context.evidence.map((s, i) => i === 0 ? {...s, content: s.content + "\n// changed test evidence\n"} : s)});
    expect(methodContentHash(changed)).not.toBe(methodContentHash(original));
    expect(() => compileProcedureComposition(document, document.composition, {...context, evidence: []})).toThrow(/missing evidence bytes/);
  });
});
