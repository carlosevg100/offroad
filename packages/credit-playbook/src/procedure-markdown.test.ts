import {join} from "node:path";

import {offroadTaskRegistry} from "@offroad/work-plan";
import {describe, expect, it} from "vitest";

import {institutionalHouseProcedureIdSet} from "./procedures/registry";
import {MethodCompileError, assertTaskHasProductionMethod, compileMethodDocument, loadMethodLibrary} from "./procedure-markdown";
import {referenceDataRegistry} from "./reference-data";

const root = join(import.meta.dirname, "..", "knowledge", "procedures");
const taskIds = new Set(offroadTaskRegistry.map((task) => task.id));
const referenceKeys = new Set(referenceDataRegistry.map((entry) => entry.key));

describe("method library in markdown", () => {
  const library = loadMethodLibrary(root);

  it("compiles every method into the canonical procedure contract", () => {
    expect(library.methods.length).toBeGreaterThanOrEqual(3);
    for (const method of library.methods) {
      expect(method.procedure.id).toBe(method.frontmatter.id);
      expect(method.procedure.procedure.length).toBeGreaterThan(0);
      expect(method.procedure.output.fields.length).toBeGreaterThan(0);
      expect(method.procedure.tests.gold.length).toBeGreaterThan(0);
    }
  });

  it("binds only to TaskSpecs, house procedures and reference keys that exist", () => {
    for (const method of library.methods) {
      for (const taskId of method.frontmatter.task_specs) expect(taskIds.has(taskId), `${method.procedure.id} -> ${taskId}`).toBe(true);
      for (const houseId of method.frontmatter.house_procedure_ids) expect(institutionalHouseProcedureIdSet.has(houseId), `${method.procedure.id} -> ${houseId}`).toBe(true);
      for (const key of method.frontmatter.reference_data_keys) expect(referenceKeys.has(key), `${method.procedure.id} -> ${key}`).toBe(true);
      for (const dependency of method.frontmatter.dependencies) expect(library.methods.some((other) => other.procedure.id === dependency), `${method.procedure.id} -> ${dependency}`).toBe(true);
    }
  });

  it("hashes the library from the bytes of every file, so a wording change is a new library", () => {
    const again = loadMethodLibrary(root);
    expect(again.libraryHash).toBe(library.libraryHash);
    expect(library.libraryHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("refuses a method that skips a required section or malforms a step", () => {
    const text = `---\nid: broken-method\nversion: 2026.09.05-v1\nmaturity: draft\ntitle_pt: X\ntitle_en: X\nrole: financial_analysis\nblueprint_stage: 4\nowner_role: Head\neffective_date: 2026-09-05\n---\n\n# Objetivo\nx\n\n# Produto\ny\n\n# Quando ativar\n- sempre\n\n# Sequência operacional\n1. passo sem modo\n\n# Outputs\n- out (string, required): o\n\n# Testes\n## Unit\n- u\n## Gold\n- g\n## Adversarial\n- a\n## Aceitação\n- ok\n\n# Evidência\n## Hierarquia\n- h\n## Regras\n- r\n`;
    expect(() => compileMethodDocument(text, "broken.md")).toThrow(MethodCompileError);
    const fixedStep = text.replace("1. passo sem modo", "1. [deterministic] Passo :: faz");
    expect(() => compileMethodDocument(fixedStep, "broken.md")).not.toThrow();
    expect(() => compileMethodDocument(fixedStep.replace("# Testes", "# Provas"), "broken.md")).toThrow(/Testes/);
  });

  it("does not let a task run on a candidate method, whatever its prose says", () => {
    expect(() => assertTaskHasProductionMethod("C05", library.methods)).toThrow(/none is in production/);
    expect(() => assertTaskHasProductionMethod("K09", library.methods)).toThrow(/no method bound/);
  });
});
