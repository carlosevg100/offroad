import {compileReviewedCapital as compileMethodDocument} from "./reviewed-capital.test-support";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {describe, expect, it} from "vitest";
import {methodComponentSchema, protectedMethodInvariants, type MethodComponent} from "./method-component";
import { loadMethodLibrary} from "./procedure-markdown";
import {adaptLegacyMethodDocument, compileProcedureComposition, methodContentHash, readProcedureComposition, type ProcedureCompilerContext} from "./procedure-compiler";

const root = resolve(import.meta.dirname, "../knowledge/procedures");
const document = compileMethodDocument(readFileSync(resolve(root, "capital/prepare-capital-structure-decision.md"), "utf8"), "capital/prepare-capital-structure-decision.md");
const contract = {id: "synthetic.amount", version: "2026.09.18-v1", value: {type: "decimal_string" as const}};
const budget = {maxModelCalls: 0, maxDurationMs: 1000, maxCostMinorUnits: 0, currency: "BRL"};
const formula = (): MethodComponent => methodComponentSchema.parse({
  id: "synthetic.formula", version: "2026.09.18-v1", kind: "formula", title: "Synthetic compiler contract, not financial guidance",
  inputs: contract, outputs: contract, dependencies: [], tools: [], effect: "none", budget,
  rights: {inheritSourceRestrictions: true, purposes: ["internal_validation"], sourceClasses: ["synthetic_fixture"]},
  competencies: ["financial_analysis"], invariants: [...protectedMethodInvariants], overridePoints: [], evidence: ["synthetic/evidence.json"],
  expression: "identity", executor: {module: "@offroad/financial-core", exportName: "syntheticIdentity", version: "2026.09.18-v1"},
  conventions: {unit: "BRL", period: "declared input period", rounding: "no rounding", traceRequired: true},
});
const composition = () => ({schemaVersion: "procedure-composition.v1", authoringStatus: "incomplete", pendingContent: ["synthetic contract only"], budget, allowedTools: [] as string[], maximumEffect: "none", components: [formula()]});
const context = (): ProcedureCompilerContext => ({
  compilerSources: [{path: "compiler.ts", content: "synthetic compiler bytes"}],
  executors: [{module: "@offroad/financial-core", exportName: "syntheticIdentity", version: "2026.09.18-v1", inputContractHash: methodContentHash(contract), outputContractHash: methodContentHash(contract), sources: [{path: "synthetic/executor.ts", content: "synthetic executor bytes"}]}],
  evidence: [{path: "synthetic/evidence.json", content: '{"synthetic":true}'}],
});
const compile = (value: unknown = composition(), ctx = context()) => compileProcedureComposition(document, value, ctx);

describe("procedure component compiler", () => {
  it("pins reproducibly without granting execution or promoting a candidate", () => {
    const result = compile();
    expect(result).toEqual(compile());
    expect(result.grantsExecution).toBe(false);
    expect(result.procedure.maturity).toBe("tested");
    expect(result.components[0]!.executor!.hash).toMatch(/^[a-f0-9]{64}$/);
  });
  it("changes the manifest when compiler, executor, evidence or component bytes change", () => {
    const baseline = compile().manifestHash;
    for (const field of ["compilerSources", "evidence"] as const) {
      const ctx = context(); ctx[field][0]!.content += "changed";
      expect(compile(composition(), ctx).manifestHash).not.toBe(baseline);
    }
    const ctx = context(); ctx.executors[0]!.sources[0]!.content += "changed";
    expect(compile(composition(), ctx).manifestHash).not.toBe(baseline);
    const value = composition(); value.components[0]!.title += " changed";
    expect(compile(value).manifestHash).not.toBe(baseline);
  });
  it("rejects missing and cyclic dependencies and mismatched versions", () => {
    const value = composition();
    value.components[0]!.dependencies = [{id: "missing.component", version: "2026.09.18-v1"}];
    expect(() => compile(value)).toThrow(/missing dependency/);
    value.components[0]!.dependencies = [{id: "synthetic.formula", version: "2026.09.18-v1"}];
    expect(() => compile(value)).toThrow(/cyclic dependency/);
    value.components[0]!.dependencies[0]!.version = "2026.09.18-v2";
    expect(() => compile(value)).toThrow(/version mismatch/);
  });
  it("rejects a formula without an executor and a rule without a version", () => {
    const {executor: _executor, ...withoutExecutor} = formula() as Extract<MethodComponent, {kind: "formula"}>;
    expect(() => compile({...composition(), components: [withoutExecutor]})).toThrow(/executor/);
    const {version: _version, kind: _kind, expression: _expression, conventions: _conventions, ...common} = formula() as Extract<MethodComponent, {kind: "formula"}>;
    expect(() => compile({...composition(), components: [{...common, kind: "rule", statement: "synthetic", authority: "house"}]})).toThrow(/version/);
  });
  it("rejects untyped and recursively incomplete outputs", () => {
    for (const value of [{}, {type: "object", fields: {}}, {type: "array"}, {type: "array", items: {type: "object"}}]) {
      const component = {...formula(), outputs: {...contract, value}};
      expect(() => compile({...composition(), components: [component]})).toThrow();
    }
  });
  it("rejects undeclared tools, excessive effects and insufficient budgets", () => {
    const value = composition(); value.components[0]!.tools = ["undeclared.tool"];
    expect(() => compile(value)).toThrow(/undeclared tool/);
    value.allowedTools = ["undeclared.tool"]; value.components[0]!.effect = "external";
    expect(() => compile(value)).toThrow(/effect exceeds/);
    value.components[0]!.effect = "none"; value.budget = {...budget, maxDurationMs: 999};
    expect(() => compile(value)).toThrow(/budgets exceed/);
  });
  it("rejects invented executors, mismatched contracts and missing evidence bytes", () => {
    expect(() => compile(composition(), {...context(), executors: []})).toThrow(/unregistered executor/);
    const ctx = context(); ctx.executors[0]!.outputContractHash = "0".repeat(64);
    expect(() => compile(composition(), ctx)).toThrow(/contract mismatch/);
    expect(() => compile(composition(), {...context(), evidence: []})).toThrow(/missing evidence/);
  });
  it("rejects weakened invariants, source rights and privilege disguised as an override", () => {
    for (const change of [{invariants: []}, {rights: {inheritSourceRestrictions: false}}, {overridePoints: [{id: "access.override", target: "access_barriers", contract, requiresRationale: true}]}]) {
      expect(() => compile({...composition(), components: [{...formula(), ...change}]})).toThrow();
    }
  });
  it("refuses executable prose and multiple composition blocks", () => {
    expect(readProcedureComposition("# Formula\nRun an arbitrary tool")).toBeNull();
    const block = "```offroad-procedure\n" + JSON.stringify(composition()) + "\n```\n";
    expect(readProcedureComposition(block)?.components).toHaveLength(1);
    expect(() => readProcedureComposition(block + block)).toThrow(/exactly one/);
    expect(() => readProcedureComposition("```offroad-procedure\n{}")).toThrow(/malformed/);
  });
  it("adapts all eleven legacy methods and preserves the published R01 source and approval", () => {
    const library = loadMethodLibrary(root);
    const legacy = library.methods.filter((method) => method.procedure.id !== document.procedure.id);
    expect(legacy).toHaveLength(11);
    for (const method of legacy) {
      const adapted = adaptLegacyMethodDocument(method);
      expect(adapted.procedure).toEqual(method.procedure);
      expect(adapted.grantsExecution).toBe(false);
      expect(adapted.source.hash).toBe(method.sourceHash);
    }
    const r01 = legacy.find((method) => method.frontmatter.task_specs.includes("R01"))!;
    expect(r01.sourceHash).toBe("9f5cf24e6751c708a7ff9825afebdd1878e2e07fc652c295df7493cb8e246264");
    expect(r01.procedure.owner.approvedAt).toBe("2026-09-10");
    expect(r01.procedure.maturity).toBe("production");
  });
});


it("compiles a versioned graph and checks budgets inside a nested workflow", () => {
  const {kind: _kind, executor: _executor, expression: _expression, conventions: _conventions, ...base} = formula() as Extract<MethodComponent, {kind: "formula"}>;
  const workflow = {...base, id: "synthetic.workflow", kind: "workflow", orchestration: "dependency_graph", steps: [{id: "synthetic.formula", version: "2026.09.18-v1"}]};
  const value = {...composition(), components: [workflow, formula()]};
  expect(compile(value).components.map((entry) => entry.component.id)).toEqual(["synthetic.formula", "synthetic.workflow"]);
  expect(() => compile({...value, components: [{...workflow, budget: {...budget, maxDurationMs: 999}}, formula()]})).toThrow(/workflow budgets/);
});


it("scans whitespace-heavy authoring sources without a backtracking expression", () => {
  const block = "```offroad-procedure\n" + JSON.stringify(composition()) + "\n```\n";
  expect(readProcedureComposition(block + "\n\t".repeat(50_000))?.components).toHaveLength(1);
  expect(() => readProcedureComposition("```offroad-procedure\n" + "\n\t".repeat(50_000))).toThrow(/malformed/);
});
