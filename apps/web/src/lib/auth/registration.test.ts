import {describe, expect, it} from "vitest";

import {registrationSchema} from "./registration";

const validRegistration = {
  locale: "pt-BR" as const,
  journey: "company" as const,
  fullName: "Carla Mendes",
  jobTitle: "CFO",
  email: "carla@empresa.com.br",
  password: "Capital@",
  confirmPassword: "Capital@",
};

describe("registrationSchema", () => {
  it.each(["company", "originator", "capital_provider"] as const)("accepts the %s journey", (journey) => {
    expect(registrationSchema.safeParse({...validRegistration, journey}).success).toBe(true);
  });

  it("requires a strong matching password", () => {
    expect(registrationSchema.safeParse({...validRegistration, password: "capital@26", confirmPassword: "capital@26"}).success).toBe(false);
    expect(registrationSchema.safeParse({...validRegistration, password: "Capital26", confirmPassword: "Capital26"}).success).toBe(false);
    expect(registrationSchema.safeParse({...validRegistration, password: "Capitalá", confirmPassword: "Capitalá"}).success).toBe(false);
    expect(registrationSchema.safeParse({...validRegistration, password: "Cap@26", confirmPassword: "Cap@26"}).success).toBe(false);
    expect(registrationSchema.safeParse({...validRegistration, confirmPassword: "Different@26"}).success).toBe(false);
  });
});
