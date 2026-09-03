import {describe, expect, it} from "vitest";

import {professionalContextFormSchema, professionalContextStatus} from "./professional-context";

describe("professional capability context", () => {
  it("accepts a complete institutional profile", () => {
    const input = professionalContextFormSchema.parse({
      affiliationKind: "bank",
      professionalRole: "dcm_banker",
      institutionName: "Banco Exemplo",
      teamName: "DCM",
      operatingModels: ["balance_sheet_lending", "structuring", "distribution"],
      primaryObjectives: ["prepare_meetings", "originate_ideas", "structure_transactions"],
      productFamilies: ["bilateral_credit", "capital_markets"],
      capabilityNotes: "Atuação local e offshore.",
    });
    expect(professionalContextStatus(input)).toBe("complete");
  });

  it("keeps incomplete answers useful instead of rejecting them", () => {
    const input = professionalContextFormSchema.parse({
      professionalRole: "advisor",
      operatingModels: [],
      primaryObjectives: ["structure_transactions"],
      productFamilies: [],
    });
    expect(professionalContextStatus(input)).toBe("partial");
  });

  it("preserves credit, risk and execution functions instead of collapsing them into analyst", () => {
    for (const professionalRole of [
      "credit_analyst",
      "risk_underwriter",
      "investment_committee",
      "legal_structuring",
      "syndicate_distribution",
    ] as const) {
      const input = professionalContextFormSchema.parse({
        professionalRole,
        operatingModels: ["investing"],
        primaryObjectives: ["analyze_investments"],
        productFamilies: [],
      });
      expect(input.professionalRole).toBe(professionalRole);
    }
  });

  it("records an explicit skip so the chat does not nag the user", () => {
    const input = professionalContextFormSchema.parse({
      operatingModels: [],
      primaryObjectives: [],
      productFamilies: [],
    });
    expect(professionalContextStatus(input)).toBe("skipped");
  });
});
