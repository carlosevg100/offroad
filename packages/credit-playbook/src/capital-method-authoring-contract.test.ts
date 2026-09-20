import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {describe, expect, it} from "vitest";
import {compileMethodDocument, methodMayRunInStaging} from "./procedure-markdown";
import {compileProcedure, procedureOutputFieldSchema} from "./procedure-contract";
import {buildMethodManifest} from "./build-method-manifest";

const root = resolve(import.meta.dirname, "../../..");
const path = "capital/prepare-capital-structure-decision.md";
const source = readFileSync(resolve(root, "packages/credit-playbook/knowledge/procedures", path), "utf8");
const contracts = JSON.parse(readFileSync(resolve(root, "packages/financial-model/contracts/capital-decision-delivery.json"), "utf8"));
describe("professional candidate authoring contract", () => {
  it("keeps the documented output names identical to the actual typed executor output", () => {
    const method = compileMethodDocument(source, path);
    expect(method.procedure.output.fields.map(f => f.id)).toEqual(Object.keys(contracts.outputs.value.fields));
  });
  it("represents required null values without treating them as optional missing fields", () => {
    const method = compileMethodDocument(source, path); const schema = compileProcedure(method.procedure).outputSchema;
    expect(schema).toMatchObject({properties: {humanDecision: {type: "null"}, recommendation: {type: ["object", "null"]}}});
    expect(schema.required).toContain("humanDecision"); expect(schema.required).toContain("recommendation");
  });
  it("compiles the actual registered rule but does not publish or run the incomplete candidate", () => {
    const method = compileMethodDocument(source, path);
    expect(method.procedure.maturity).toBe("candidate"); expect(methodMayRunInStaging(method)).toBe(false);
    expect(method.procedure.implementation).toBeUndefined(); expect(method.frontmatter.task_specs).toEqual([]);
    const p = buildMethodManifest(root).provenance.find(p => p.procedure.id === method.procedure.id)!;
    expect(p).toMatchObject({grantsExecution: false, authoringStatus: "incomplete"});
    expect(method.composition!.components.find(c => c.id === "capital.decision-delivery")).toMatchObject({executor: contracts.executor});
  });
  it("supports nullable enum descriptors while retaining null in the generated enum", () => {
    const changed = source.replace('status (enum, required)', 'status (enum|null, required)');
    const schema = compileProcedure(compileMethodDocument(changed, path).procedure).outputSchema;
    expect(schema).toMatchObject({properties: {status: {type: ["string", "null"], enum: ["framed", "partial", "prepared_for_human_review", null]}}});
  });
  it("refuses unsafe output field names without changing existing snake case fields", () => {
    const base = {type: "string", required: true, description: "Synthetic field"};
    for (const id of ["constructor", "prototype", "__proto__", "has/slash"]) expect(procedureOutputFieldSchema.safeParse({...base, id}).success).toBe(false);
    const old = procedureOutputFieldSchema.parse({...base, id: "evidence_links"}); expect(old.nullable).toBeUndefined();
    expect(procedureOutputFieldSchema.safeParse({...base, id: "workId"}).success).toBe(true);
  });
  it("does not treat the expanded professional text or calculated examples as founder approval", () => {
    const method = compileMethodDocument(source, path);
    expect(method.procedure.owner.approvedAt).toBeUndefined(); expect(method.procedure.testRuns.gold).toEqual([]);
    expect(() => compileMethodDocument(source.replace("maturity: candidate", "maturity: production"), path)).toThrow(/approval/);
    expect(method.composition!.pendingContent.length).toBeGreaterThan(0);
  });
});
