import {describe, expect, it} from "vitest";
import {classifyDebtSource, compileDebtResearchStrategy, debtSourceRegistry, inferDebtJurisdiction} from "./source-registry";

describe("debt intelligence source registry", () => {
  it("puts Brazilian official sources ahead of discovery tools for a public company", () => {
    const strategy = compileDebtResearchStrategy({
      work: "origination_thesis",
      jurisdiction: "BR",
      evidenceBasis: "public_information",
    });
    const financials = strategy.tasks.find((task) => task.capability === "financial_statements");
    const comparables = strategy.tasks.find((task) => task.capability === "comparable_transactions");
    expect(financials?.sourceChain[0]).toBe("cvm_open_data");
    expect(financials?.sourceChain).toContain("issuer_ir");
    expect(comparables?.sourceChain).toContain("anbima_data");
    expect(strategy.disabledPaidSources).toContain("pitchbook");
    expect(strategy.activatedSources).not.toContain("perplexity");
    expect(strategy.privateContextInExternalQueries).toBe(false);
  });

  it("uses SEC EDGAR as the first source of record in the United States", () => {
    const strategy = compileDebtResearchStrategy({
      work: "company_debt_view",
      jurisdiction: "US",
      evidenceBasis: "public_information",
    });
    expect(strategy.tasks.find((task) => task.capability === "entity_identity")?.sourceChain[0]).toBe("sec_edgar");
    expect(strategy.tasks.find((task) => task.capability === "debt_book")?.sourceChain[0]).toBe("sec_edgar");
  });

  it("activates a licensed source only when explicitly configured and never outranks a regulator", () => {
    const strategy = compileDebtResearchStrategy({
      work: "company_debt_view",
      jurisdiction: "BR",
      evidenceBasis: "public_information",
      activatedSourceIds: ["pitchbook"],
    });
    const financials = strategy.tasks.find((task) => task.capability === "financial_statements");
    expect(financials?.sourceChain).toContain("pitchbook");
    expect(financials?.sourceChain[0]).toBe("cvm_open_data");
    expect(strategy.disabledPaidSources).not.toContain("pitchbook");
  });

  it("classifies a discovered URL by publisher authority rather than search provider", () => {
    expect(classifyDebtSource({url: "https://dados.cvm.gov.br/dataset/cia_aberta-doc-itr"})?.id).toBe("cvm_open_data");
    expect(classifyDebtSource({url: "https://ri.camil.com.br/resultados", issuerDomains: ["ri.camil.com.br"]})?.id).toBe("issuer_ir");
    expect(classifyDebtSource({url: "http://unsafe.example.com"})).toBeNull();
  });

  it("declares paid connectors as contracts, not silently enabled capabilities", () => {
    const pitchbook = debtSourceRegistry.find((source) => source.id === "pitchbook");
    const firecrawl = debtSourceRegistry.find((source) => source.id === "firecrawl");
    expect(pitchbook).toMatchObject({status: "contract_ready", access: "contracted_api"});
    expect(firecrawl).toMatchObject({retrievalOnly: true, sourceClass: "content_acquisition"});
  });

  it("uses geography or a country domain before locale and marks locale defaults for confirmation", () => {
    expect(inferDebtJurisdiction({locale: "en-US", geography: "Brasil"})).toEqual({
      jurisdiction: "BR", basis: "explicit_geography", needsConfirmation: false,
    });
    expect(inferDebtJurisdiction({locale: "en-US", website: "https://companhia.com.br"}).jurisdiction).toBe("BR");
    expect(inferDebtJurisdiction({locale: "pt-BR"})).toEqual({
      jurisdiction: "BR", basis: "locale_default", needsConfirmation: true,
    });
  });
});
