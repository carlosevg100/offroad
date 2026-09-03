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

  it("records an explicit skip so the chat does not nag the user", () => {
    const input = professionalContextFormSchema.parse({
      operatingModels: [],
      primaryObjectives: [],
      productFamilies: [],
    });
    expect(professionalContextStatus(input)).toBe("skipped");
  });
});
