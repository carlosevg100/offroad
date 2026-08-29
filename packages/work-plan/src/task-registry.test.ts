import {describe, expect, it} from "vitest";
import {offroadTaskRegistry, validateOffroadTaskRegistry} from "./task-registry";

describe("Offroad TaskSpec registry", () => {
  it("contains exactly 80 unique, acyclic target tasks", () => {
    expect(offroadTaskRegistry).toHaveLength(80);
    expect(new Set(offroadTaskRegistry.map((task) => task.id)).size).toBe(80);
    expect(() => validateOffroadTaskRegistry()).not.toThrow();
  });

  it("keeps all external effects inside the Market Graph", () => {
    expect(offroadTaskRegistry.filter((task) => task.effect === "external")).toEqual([
      expect.objectContaining({id: "X04", graph: "market", label: "Executar introdução autorizada"}),
    ]);
  });

  it("records post-introduction signals without assigning underwriting or closing to Offroad", () => {
    expect(offroadTaskRegistry.find((task) => task.id === "X11")?.label).toBe("Registrar avanço em underwriting");
    expect(offroadTaskRegistry.find((task) => task.id === "X12")?.label).toBe("Registrar sinal de desembolso");
    expect(offroadTaskRegistry.some((task) => /executar underwriting|executar fechamento/i.test(task.label))).toBe(false);
  });
});
