import {readFileSync, readdirSync} from "node:fs";
import {join} from "node:path";
import {capitalStructureMethodId, receivablesPoolMethodId} from "@offroad/credit-playbook";
import {describe, expect, it} from "vitest";

import {catalogues, namesFor} from "./work-update-names.test-support";

/** Every procedure of the credit playbook, as its frontmatter declares it. */
function procedures(): Map<string, {pt: string; en: string}> {
  const root = join(import.meta.dirname, "../../../../../packages/credit-playbook/knowledge/procedures");
  const found = new Map<string, {pt: string; en: string}>();
  for (const family of readdirSync(root, {withFileTypes: true}).filter((entry) => entry.isDirectory())) {
    for (const file of readdirSync(join(root, family.name)).filter((name) => name.endsWith(".md"))) {
      const text = readFileSync(join(root, family.name, file), "utf8");
      const field = (name: string) => text.match(new RegExp(`^${name}: (.+)$`, "m"))?.[1]?.trim();
      const id = field("id");
      const titlePt = field("title_pt");
      const titleEn = field("title_en");
      if (id && titlePt && titleEn) found.set(id, {pt: titlePt, en: titleEn});
    }
  }
  return found;
}

describe("names of the work's update section", () => {
  it("names a method by the house release title, else by the published catalogue in each language, else neutrally", () => {
    for (const locale of ["pt-BR", "en-US"] as const) {
      const names = namesFor(locale);
      expect(names.method({methodId: capitalStructureMethodId, houseTitle: "  Estrutura de capital da casa  "})).toBe("Estrutura de capital da casa");
      expect(names.method({methodId: capitalStructureMethodId, houseTitle: null})).toBe(catalogues[locale].App.workUpdateNames.methods[capitalStructureMethodId]);
      expect(names.method({methodId: "house-method-without-title", houseTitle: null})).toBe(catalogues[locale].App.workUpdateNames.unnamedMethod);
      expect(names.method({methodId: "methods.unnamedMethod", houseTitle: null})).toBe(catalogues[locale].App.workUpdateNames.unnamedMethod);
      expect(names.method(null)).toBe(catalogues[locale].App.workUpdateNames.unnamedMethod);
    }
    expect(namesFor("pt-BR").method({methodId: capitalStructureMethodId, houseTitle: null})).toBe("Preparar alternativas de estrutura de capital para uma decisão");
    expect(namesFor("en-US").method({methodId: receivablesPoolMethodId, houseTitle: null})).toBe("Reconcile and test the capacity of a receivables pool");
  });

  it("names a premise by its metric as the basis names it, else by the adopted definition, and never by the field path", () => {
    const names = namesFor("pt-BR");
    expect(names.premise({fieldPath: "liquidity.available_cash", definition: "Synthetic explicit liquidity.available_cash definition"})).toBe("Caixa disponível");
    expect(names.premise({fieldPath: "financials.net_debt", definition: null})).toBe("Dívida líquida");
    expect(namesFor("en-US").premise({fieldPath: "financials.ebitda", definition: null})).toBe("EBITDA");
    expect(names.premise({fieldPath: "capital.covenant_headroom", definition: "Folga do covenant de alavancagem\nconforme a escritura"})).toBe("Folga do covenant de alavancagem");
    expect(names.premise({fieldPath: "capital.covenant_headroom", definition: "Definição de capital.covenant_headroom"})).toBeNull();
    expect(names.premise({fieldPath: "capital.covenant_headroom", definition: "   "})).toBeNull();
    expect(names.premise({fieldPath: "capital.covenant_headroom", definition: "x".repeat(200)})).toHaveLength(120);
    expect(names.premise(null)).toBeNull();
  });

  it("counts executions that share one name", () => {
    expect(namesFor("pt-BR").repeated("Estrutura", 1)).toBe("Estrutura");
    expect(namesFor("pt-BR").repeated("Estrutura", 3)).toBe("Estrutura (3 execuções)");
    expect(namesFor("en-US").repeated("Structure", 2)).toBe("Structure (2 executions)");
  });

  it("keeps the method titles equal to the published procedures, for every released method", () => {
    const published = procedures();
    for (const locale of ["pt-BR", "en-US"] as const) {
      const titles = catalogues[locale].App.workUpdateNames.methods;
      expect(Object.keys(titles)).toEqual(expect.arrayContaining([capitalStructureMethodId, receivablesPoolMethodId]));
      for (const [methodId, title] of Object.entries(titles)) {
        expect(published.get(methodId), methodId).toBeDefined();
        expect(title).toBe(published.get(methodId)?.[locale === "pt-BR" ? "pt" : "en"]);
      }
    }
  });
});
