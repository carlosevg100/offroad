import {describe, expect, it} from "vitest";

import {prepareWorkerDebtResearch} from "./debt-research-runtime";

describe("worker debt research runtime", () => {
  it("puts the jurisdiction-specific official provider before complementary discovery", () => {
    const prepared = prepareWorkerDebtResearch({
      work: "company_debt_view",
      locale: "pt-BR",
      subject: {legalName: "Camil Alimentos", website: "https://ri.camil.com.br"},
      discoveryProviders: [{id: "perplexity", maxCostUsdPerCall: 0.005, search: async () => []}],
      officialProviderFactory: ({jurisdiction}) => ({
        id: "official", continueAfterSuccess: true,
        search: async () => [],
        maxCostUsdPerCall: jurisdiction === "BR" ? 0 : 1,
      }),
      evidenceBasis: "public_information",
    });
    expect(prepared.strategy.jurisdiction).toBe("BR");
    expect(prepared.providers.map((provider) => provider.id)).toEqual(["official", "perplexity"]);
    expect(prepared.providers[0]?.maxCostUsdPerCall).toBe(0);
    expect(prepared.strategy.tasks.find((task) => task.capability === "financial_statements")?.sourceChain[0])
      .toBe("cvm_open_data");
  });
});
