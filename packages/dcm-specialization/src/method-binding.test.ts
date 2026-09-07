import {resolve} from "node:path";
import {fileURLToPath} from "node:url";

import {loadMethodLibrary} from "@offroad/credit-playbook";
import {compileTaskGraph} from "@offroad/work-plan";
import {describe, expect, it} from "vitest";

import {compileObjectiveSpecialization} from "./index";
import {bindObjectiveMethods, methodBindingCandidateFromDocument} from "./method-binding";

const here = resolve(fileURLToPath(new URL(".", import.meta.url)));
const library = loadMethodLibrary(
  resolve(here, "../../credit-playbook/knowledge/procedures"),
  resolve(here, "../../credit-playbook/knowledge/reviews"),
);
const methods = library.methods.flatMap((method) => {
  const candidate = methodBindingCandidateFromDocument(method);
  return candidate ? [candidate] : [];
});
const methodRegistryHash = "a".repeat(64);
const graph = compileTaskGraph(["C10", "S04"]);

function specialization(text: string) {
  return compileObjectiveSpecialization({objectiveText: text, taskIds: graph.tasks.map((task) => task.id)});
}

describe("objective method binding", () => {
  it("binds the exact receivables method only when its economic pack is active", () => {
    const compiled = bindObjectiveMethods({
      graph,
      specialization: specialization("Analisar a capacidade de uma carteira de recebíveis"),
      methods,
      methodRegistryHash,
    });
    expect(compiled.binding.status).toBe("partial");
    expect(compiled.binding.specialistTaskIds).toEqual(["R01"]);
    expect(compiled.binding.effectiveTargetTaskIds).toEqual(["C10", "R01", "S04"]);
    expect(compiled.binding.bindings.map((binding) => binding.taskId)).toEqual(["R01"]);
    expect(compiled.binding.bindings.every((binding) => binding.procedure.id === "underwrite-receivables-pool")).toBe(true);
    expect(compiled.binding.bindings.every((binding) => binding.resultContract === "method.underwrite-receivables-pool.v1")).toBe(true);
    expect(compiled.binding.unboundTaskIds.length).toBeGreaterThan(0);
    expect(compiled.graph.tasks.filter((task) => task.procedure).map((task) => task.id)).toEqual(["R01"]);
    expect(compiled.graph.targetTaskIds).toEqual(["C10", "R01", "S04"]);
  });

  it("does not activate a receivables method from a generic capital objective", () => {
    const compiled = bindObjectiveMethods({
      graph,
      specialization: specialization("Comparar alternativas de capital para a companhia"),
      methods,
      methodRegistryHash,
    });
    expect(compiled.binding.status).toBe("blocked");
    expect(compiled.binding.specialistTaskIds).toEqual([]);
    expect(compiled.binding.bindings).toEqual([]);
    expect(compiled.graph.tasks.every((task) => task.procedure === undefined)).toBe(true);
  });

  it("is stable under method-library order permutations", () => {
    const objective = specialization("Analisar recebíveis e borrowing base");
    const first = bindObjectiveMethods({graph, specialization: objective, methods, methodRegistryHash});
    const second = bindObjectiveMethods({graph, specialization: objective, methods: [...methods].reverse(), methodRegistryHash});
    expect(second).toEqual(first);
  });

  it("leaves equal-priority candidates visibly conflicted instead of choosing by array order", () => {
    const original = methods.find((method) => method.procedure.id === "underwrite-receivables-pool")!;
    const conflict = {
      ...structuredClone(original),
      sourcePath: "receivables/conflicting-method.md",
      sourceHash: "b".repeat(64),
      procedure: {...structuredClone(original.procedure), id: "conflicting-receivables-method"},
    };
    const compiled = bindObjectiveMethods({
      graph,
      specialization: specialization("Analisar recebíveis"),
      methods: [...methods, conflict],
      methodRegistryHash,
    });
    expect(compiled.binding.status).toBe("conflicted");
    expect(compiled.binding.conflicts.map((item) => item.taskId)).toEqual(["R01"]);
    expect(compiled.graph.tasks.find((task) => task.id === "R01")?.procedure).toBeUndefined();
  });

  it("rejects a method that names a specialization pack the registry does not hold", () => {
    const original = methods.find((method) => method.procedure.id === "underwrite-receivables-pool")!;
    const invalid = {
      ...structuredClone(original),
      requiredPackIds: ["analysis.unknown-pack"],
    };
    expect(() => bindObjectiveMethods({
      graph,
      specialization: specialization("Analisar recebíveis"),
      methods: [...methods, invalid],
      methodRegistryHash,
    })).toThrow(/unknown depth pack/);
  });
});
