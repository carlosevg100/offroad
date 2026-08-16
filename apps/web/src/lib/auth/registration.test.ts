import {describe, expect, it} from "vitest";

import {registrationSchema} from "./registration";

const validRegistration = {
  locale: "pt-BR" as const,
  journey: "company" as const,
  fullName: "Carla Mendes",
  jobTitle: "CFO",
  email: "carla@empresa.com.br",
  password: "Capital2026",
  confirmPassword: "Capital2026",
};

describe("registrationSchema", () => {
  it.each(["company", "originator", "capital_provider"] as const)("accepts the %s journey", (journey) => {
    expect(registrationSchema.safeParse({...validRegistration, journey}).success).toBe(true);
  });

  it("requires a strong matching password", () => {
    expect(registrationSchema.safeParse({...validRegistration, password: "capital2026", confirmPassword: "capital2026"}).success).toBe(false);
    expect(registrationSchema.safeParse({...validRegistration, confirmPassword: "Different2026"}).success).toBe(false);
  });
});
