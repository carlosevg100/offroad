import {describe, expect, it} from "vitest";

import {
  normalizeProfessionalContext,
  professionalContextFormSchema,
  professionalContextStatus,
} from "./professional-context";

const empty = {useForms: [], professionalRoles: [], practiceAreas: [], primaryObjectives: []};

describe("professional context", () => {
  it("keeps every role and area a person holds instead of forcing one", () => {
    const input = professionalContextFormSchema.parse({
      ...empty,
      useForms: ["institutional_work", "independent_practice"],
      professionalRoles: ["banker", "financial_advisor"],
      practiceAreas: ["dcm", "corporate_banking", "structured_finance"],
      primaryObjectives: ["prepare_meetings", "originate_ideas"],
      institutionName: "Banco Exemplo",
    });
    expect(input.professionalRoles).toEqual(["banker", "financial_advisor"]);
    expect(input.practiceAreas).toHaveLength(3);
    expect(professionalContextStatus(input)).toBe("complete");
  });

  it("distinguishes the functions that change the work instead of collapsing them", () => {
    const input = professionalContextFormSchema.parse({
      ...empty,
      useForms: ["institutional_work"],
      professionalRoles: ["credit_analyst", "risk_underwriting"],
      practiceAreas: ["credit", "underwriting", "risk"],
      primaryObjectives: ["analyze_investments"],
    });
    expect(input.professionalRoles).toContain("credit_analyst");
    expect(input.professionalRoles).toContain("risk_underwriting");
  });

  it("keeps incomplete answers useful instead of rejecting them", () => {
    const input = professionalContextFormSchema.parse({...empty, professionalRoles: ["cfo"]});
    expect(professionalContextStatus(input)).toBe("partial");
  });

  it("records an explicit skip so the workspace does not ask again", () => {
    expect(professionalContextStatus(professionalContextFormSchema.parse(empty))).toBe("skipped");
  });

  it("drops an organization name nobody said they work at", () => {
    const input = professionalContextFormSchema.parse({
      ...empty,
      useForms: ["independent_practice"],
      institutionName: "Banco Exemplo",
    });
    expect(normalizeProfessionalContext(input).institutionName).toBeUndefined();
  });

  it("keeps the organization name when the person works at one", () => {
    const input = professionalContextFormSchema.parse({
      ...empty,
      useForms: ["institutional_work"],
      institutionName: "Banco Exemplo",
    });
    expect(normalizeProfessionalContext(input).institutionName).toBe("Banco Exemplo");
  });

  it("rejects a value outside the published vocabulary", () => {
    const parsed = professionalContextFormSchema.safeParse({...empty, professionalRoles: ["chief_vibes_officer"]});
    expect(parsed.success).toBe(false);
  });
});
