import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {describe, expect, it} from "vitest";
import {buildMethodManifest} from "./build-method-manifest";
import {referenceDataRegistry, unresolvedReferenceData} from "./reference-data";
const root = resolve(import.meta.dirname, "../../..");
const source = readFileSync(resolve(root, "packages/credit-playbook/knowledge/procedures/capital/prepare-capital-structure-decision.md"), "utf8");
const authoring = readFileSync(resolve(root, "packages/credit-playbook/knowledge/AUTHORING.md"), "utf8");

describe("capital professional approval conditions", () => {
  it("ships the corrected expert narrative in the compiled component", () => {
    const manifest = buildMethodManifest(root).provenance.find(p => p.procedure.id === "prepare-capital-structure-decision")!;
    expect(manifest.schemaVersion).toBe("compiled-procedure-manifest.v1");
    const compiled = JSON.stringify(manifest);
    for (const text of ["Nenhum vermelho", "resíduo em lote", "padrão calibrado", "Critérios genéricos não são entrega", "policy.capital.iof", "revisão especializada", "Legal. Entendi os principais pontos", "histórico financeiro recente da companhia e projeções"])
      expect(compiled).toContain(text);
    expect(compiled).not.toMatch(/Vermelho indica ruptura|até duas questões substantivas|travessões retóricos|one to five requests/);
  });
  it("keeps company research before use and the conceptual exception in source and authoring", () => {
    for (const text of [source, authoring]) {
      expect(text).toMatch(/cadastro/i);
      expect(text).toMatch(/pesquisa/);
      expect(text).toMatch(/exceção conceitual|exceção para pergunta conceitual/);
      expect(text).not.toMatch(/Sem base específica, apresentar critérios e alternativas conceituais|respondível sem companhia identificada|[—–]/);
    }
  });
  it("records all-in prerequisites as drafts that await the founder's review, never as approved values", () => {
    const keys = ["policy.capital.iof", "policy.capital.anbima-b3-conventions", "policy.capital.tax-regime"];
    for (const key of keys) {
      expect(source).toContain(key);
      const entry = referenceDataRegistry.find(e => e.key === key)!;
      expect(entry).toMatchObject({status: "draft", asOf: "2026-09-24", version: "2026.09.24-v1", validUntil: null});
      expect(entry.value).not.toBeNull();
      expect(entry.source?.observedBy).toMatch(/aguardando revisão do fundador/);
      expect(entry.owner.length).toBeGreaterThan(5);
      expect(entry.scope).toContain("all-in");
    }
    expect(unresolvedReferenceData(keys).map(e => e.key)).toEqual(keys);
  });
});
