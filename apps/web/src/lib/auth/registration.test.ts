import {describe, expect, it} from "vitest";

import {
  canContinuePendingRegistration,
  registrationJourneyForEntryPath,
  registrationSchema,
} from "./registration";

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

describe("registrationJourneyForEntryPath", () => {
  it("keeps company and advisor as refinements of the origination path", () => {
    expect(registrationJourneyForEntryPath("origination", "company")).toBe("company");
    expect(registrationJourneyForEntryPath("origination", "originator")).toBe("originator");
  });

  it("maps the capital path directly and rejects unknown paths", () => {
    expect(registrationJourneyForEntryPath("capital_provider", "")).toBe("capital_provider");
    expect(registrationJourneyForEntryPath("unknown", "company")).toBeNull();
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
