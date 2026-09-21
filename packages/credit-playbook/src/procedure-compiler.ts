import {createHash} from "node:crypto";
import {procedureCompositionSchema, type ProcedureComposition, type MethodComponent} from "./method-component";
import type {MethodDocument} from "./procedure-markdown";

export const componentCompilerVersion = "2026.09.20-v7";
export type CompilerSource = {path: string; content: string};
export type RegisteredMethodExecutor = {
  module: string;
  exportName: string;
  version: string;
  inputContractHash: string;
  outputContractHash: string;
  /** Build-owned transitive source closure, not a fingerprint supplied by the author. */
  sources: CompilerSource[];
};
export type ProcedureCompilerContext = {
  compilerSources: CompilerSource[];
  executors: RegisteredMethodExecutor[];
  evidence: CompilerSource[];
};

export function stableMethodJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableMethodJson).join(",")}]`;
  if (value !== null && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, entry]) => `${JSON.stringify(key)}:${stableMethodJson(entry)}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
}
export function methodContentHash(value: unknown): string {
  return createHash("sha256").update(stableMethodJson(value)).digest("hex");
}
export function pinMethodSources(sources: readonly CompilerSource[]) {
  if (!sources.length) throw new Error("source bytes are required");
  const seen = new Set<string>();
  return [...sources].sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0).map((source) => {
    if (!source.path || source.path.startsWith("/") || source.path.split("/").includes("..") || seen.has(source.path)) throw new Error("source paths must be unique repository-relative paths");
    seen.add(source.path);
    return {path: source.path, hash: createHash("sha256").update(source.content).digest("hex")};
  });
}
const effectRank = {none: 0, propose_state: 1, commit: 2, external: 3} as const;

/** Build-time compilation only. This function neither publishes nor runs a method. */
export function compileProcedureComposition(document: MethodDocument, raw: unknown, context: ProcedureCompilerContext) {
  const composition = procedureCompositionSchema.parse(raw);
  const components = new Map<string, MethodComponent>();
  for (const component of composition.components) {
    if (components.has(component.id)) throw new Error(`duplicate component ${component.id}`);
    components.set(component.id, component);
  }
  const order: string[] = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string) => {
    if (visiting.has(id)) throw new Error(`cyclic dependency ${id}`);
    if (visited.has(id)) return;
    const component = components.get(id);
    if (!component) throw new Error(`missing dependency ${id}`);
    visiting.add(id);
    const refs = [...component.dependencies, ...(component.kind === "workflow" ? component.steps : [])];
    for (const ref of refs) {
      const target = components.get(ref.id);
      if (!target) throw new Error(`missing dependency ${ref.id}`);
      if (target.version !== ref.version) throw new Error(`dependency version mismatch ${ref.id}`);
      visit(ref.id);
    }
    visiting.delete(id); visited.add(id); order.push(id);
  };
  for (const id of [...components.keys()].sort()) visit(id);
  const executorKeys = new Set<string>();
  for (const executor of context.executors) {
    const key = `${executor.module}#${executor.exportName}@${executor.version}`;
    if (executorKeys.has(key)) throw new Error(`ambiguous executor ${key}`);
    executorKeys.add(key);
  }
  const evidencePins = context.evidence.length ? pinMethodSources(context.evidence) : [];
  const evidenceByPath = new Map(evidencePins.map((pin) => [pin.path, pin]));
  let modelCalls = 0; let duration = 0; let cost = 0;
  const compiled = order.map((id) => {
    const component = components.get(id)!;
    for (const tool of component.tools) if (!composition.allowedTools.includes(tool)) throw new Error(`undeclared tool ${tool}`);
    if (effectRank[component.effect] > effectRank[composition.maximumEffect]) throw new Error(`effect exceeds manifest for ${id}`);
    if (component.budget.maxModelCalls > composition.budget.maxModelCalls || component.budget.maxDurationMs > composition.budget.maxDurationMs || component.budget.maxCostMinorUnits > composition.budget.maxCostMinorUnits) throw new Error(`component budgets exceed procedure budget: ${id}`);
    if (component.budget.currency !== composition.budget.currency) throw new Error(`budget currency mismatch ${id}`);
    if (component.kind !== "workflow") {
      modelCalls += component.budget.maxModelCalls; duration += component.budget.maxDurationMs; cost += component.budget.maxCostMinorUnits;
    }
    const evidence = component.evidence.map((path) => {
      const pin = evidenceByPath.get(path);
      if (!pin) throw new Error(`missing evidence bytes ${path}`);
      return pin;
    });
    let executor = null;
    if ("executor" in component) {
      const ref = component.executor;
      const registered = context.executors.find((entry) => entry.module === ref.module && entry.exportName === ref.exportName && entry.version === ref.version);
      if (!registered) throw new Error(`unregistered executor ${ref.module}#${ref.exportName}@${ref.version}`);
      if (registered.inputContractHash !== methodContentHash(component.inputs) || registered.outputContractHash !== methodContentHash(component.outputs)) throw new Error(`executor contract mismatch ${id}`);
      const sources = pinMethodSources(registered.sources);
      executor = {...ref, sources, hash: methodContentHash({ref, sources, inputContractHash: registered.inputContractHash, outputContractHash: registered.outputContractHash})};
    }
    return {component, componentHash: methodContentHash(component), executor, evidence};
  });
  if (modelCalls > composition.budget.maxModelCalls || duration > composition.budget.maxDurationMs || cost > composition.budget.maxCostMinorUnits) throw new Error("component budgets exceed procedure budget");
  for (const parent of components.values()) {
    if (parent.kind !== "workflow") continue;
    const closure = new Set<string>();
    const collect = (id: string) => {
      if (closure.has(id)) return;
      closure.add(id);
      const child = components.get(id)!;
      for (const ref of [...child.dependencies, ...(child.kind === "workflow" ? child.steps : [])]) collect(ref.id);
    };
    for (const ref of [...parent.dependencies, ...parent.steps]) collect(ref.id);
    let calls = 0; let ms = 0; let minorUnits = 0;
    for (const id of closure) {
      const child = components.get(id)!;
      if (child.tools.some((tool) => !parent.tools.includes(tool)) || effectRank[child.effect] > effectRank[parent.effect]) throw new Error(`workflow policy excludes child ${id}`);
      if (child.kind !== "workflow") {calls += child.budget.maxModelCalls; ms += child.budget.maxDurationMs; minorUnits += child.budget.maxCostMinorUnits;}
    }
    if (calls > parent.budget.maxModelCalls || ms > parent.budget.maxDurationMs || minorUnits > parent.budget.maxCostMinorUnits) throw new Error(`workflow budgets exclude children ${parent.id}`);
  }
  const compilerSources = pinMethodSources(context.compilerSources);
  const payload = {
    schemaVersion: "compiled-procedure-manifest.v1" as const,
    procedure: {id: document.procedure.id, version: document.procedure.version, maturity: document.procedure.maturity},
    source: {path: document.sourcePath, hash: document.sourceHash},
    compiler: {version: componentCompilerVersion, sources: compilerSources, hash: methodContentHash(compilerSources)},
    authoringStatus: composition.authoringStatus,
    pendingContent: composition.pendingContent,
    /** Stage 14 owns human publication. Even a valid manifest cannot authorize itself. */
    grantsExecution: false as const,
    budget: composition.budget, allowedTools: composition.allowedTools, maximumEffect: composition.maximumEffect,
    components: compiled,
  };
  return {...payload, manifestHash: methodContentHash(payload)};
}
export type CompiledProcedureManifest = ReturnType<typeof compileProcedureComposition>;

/** Legacy documents remain readable. Missing typed implementations are disclosed, not invented. */
export function adaptLegacyMethodDocument(document: MethodDocument) {
  return {
    schemaVersion: "legacy-procedure-adapter.v1" as const,
    procedure: document.procedure,
    source: {path: document.sourcePath, hash: document.sourceHash},
    implementation: document.procedure.implementation ?? null,
    grantsExecution: false as const,
    compositionStatus: "legacy_contract" as const,
    pendingContent: ["typed component contracts require explicit authorship"],
    adapterHash: methodContentHash({procedure: document.procedure, sourceHash: document.sourceHash}),
  };
}

/** Explicit fenced JSON lives alongside the narrative. Ordinary prose is never executed. */
export function readProcedureComposition(text: string): ProcedureComposition | null {
  // A line scanner is linear in source length; no backtracking over author-controlled whitespace.
  let opened = false;
  let closed = false;
  const body: string[] = [];
  for (const line of text.split("\n")) {
    const marker = line.trim();
    if (marker.startsWith("```offroad-procedure")) {
      if (marker !== "```offroad-procedure") throw new Error("malformed procedure composition block");
      if (opened) throw new Error("exactly one procedure composition block is allowed");
      opened = true;
    } else if (opened && !closed && marker === "```") {
      closed = true;
    } else if (opened && !closed) {
      body.push(line);
    }
  }
  if (!opened) return null;
  if (!closed) throw new Error("malformed procedure composition block");
  return procedureCompositionSchema.parse(JSON.parse(body.join("\n")));
}
