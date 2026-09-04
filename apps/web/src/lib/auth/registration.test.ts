import {describe, expect, it} from "vitest";

import {
  canContinuePendingRegistration,
  defaultRegistrationJourney,
  registrationSchema,
} from "./registration";

const validRegistration = {
  locale: "pt-BR" as const,
  journey: "company" as const,
  fullName: "Carla Mendes",
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

describe("defaultRegistrationJourney", () => {
  it("starts every new workspace on the side that can begin work", () => {
    expect(defaultRegistrationJourney).toBe("company");
  });

  it("never lands a new account on the capital-provider workspace, which signup no longer offers", () => {
    expect(defaultRegistrationJourney).not.toBe("capital_provider");
  });
});

describe("canContinuePendingRegistration", () => {
  it("continues when the same signup was already started in this browser", () => {
    expect(canContinuePendingRegistration("carla@empresa.com.br", "carla@empresa.com.br")).toBe(true);
  });

  it("continues when Supabase reports that the confirmation was just requested", () => {
    expect(canContinuePendingRegistration(undefined, "carla@empresa.com.br", "over_email_send_rate_limit")).toBe(true);
    expect(canContinuePendingRegistration(undefined, "carla@empresa.com.br", "over_request_rate_limit")).toBe(true);
  });

  it("does not hide unrelated registration errors", () => {
    expect(canContinuePendingRegistration(undefined, "carla@empresa.com.br", "weak_password")).toBe(false);
  });
});
