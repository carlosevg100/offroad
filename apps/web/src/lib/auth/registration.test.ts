import {describe, expect, it, vi} from "vitest";

import {
  canContinuePendingRegistration,
  defaultRegistrationJourney,
  initializeRegistrationWorkspace,
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

describe("atomic registration authority", () => {
  function client() {
    const getUser = vi.fn().mockResolvedValue({data: {user: {
      id: "verified-user", user_metadata: {
        registration_role: "company", full_name: "Synthetic registration", locale: "pt-BR",
        role: "owner", created_by: "untrusted-user", organization_id: "untrusted-organization",
      },
    }}, error: null});
    const rpc = vi.fn().mockResolvedValue({data: "new-organization", error: null});
    const from = vi.fn();
    const supabase = {auth: {getUser}, rpc, from};
    return {getUser, rpc, from, supabase: supabase as unknown as Parameters<typeof initializeRegistrationWorkspace>[0]};
  }

  it("uses one atomic command without forwarding metadata authority", async () => {
    const c = client();
    expect(await initializeRegistrationWorkspace(c.supabase)).toEqual({organizationId: "new-organization", journey: "personal"});
    expect(c.rpc).toHaveBeenCalledExactlyOnceWith("initialize_workspace_v1", {
      p_full_name: "Synthetic registration", p_locale: "pt-BR",
    });
    expect(c.from).not.toHaveBeenCalled();
  });

  it("does not fall back to direct bootstrap when the command is denied", async () => {
    const c = client();
    c.rpc.mockResolvedValue({data: null, error: {code: "42501"}});
    expect(await initializeRegistrationWorkspace(c.supabase)).toEqual({error: "workspace"});
    expect(c.rpc).toHaveBeenCalledTimes(1);
    expect(c.from).not.toHaveBeenCalled();
  });

  it("registers without a market role and ignores forged membership metadata", async () => {
    const c = client();
    c.getUser.mockResolvedValue({data: {user: {id: "verified-user", user_metadata: {
      full_name: "Synthetic registration", locale: "pt-BR", role: "admin", organization_id: "foreign",
    }}}, error: null});
    expect(await initializeRegistrationWorkspace(c.supabase)).toEqual({organizationId: "new-organization", journey: "personal"});
    expect(c.rpc).toHaveBeenCalledExactlyOnceWith("initialize_workspace_v1", {p_full_name: "Synthetic registration", p_locale: "pt-BR"});
  });

  it.each(["workspace_context_required", "workspace_context_denied"])("requires selection after %s", async (message) => {
    const c = client();
    c.rpc.mockResolvedValue({data: null, error: {code: "P0001", message}});
    expect(await initializeRegistrationWorkspace(c.supabase)).toEqual({error: "workspace_selection"});
    expect(c.rpc).toHaveBeenCalledTimes(1);
    expect(c.from).not.toHaveBeenCalled();
  });

  it("requires verified identity before creating authority", async () => {
    const c = client();
    c.getUser.mockResolvedValue({data: {user: null}, error: {message: "expired"}});
    expect(await initializeRegistrationWorkspace(c.supabase)).toEqual({error: "identity"});
    expect(c.rpc).not.toHaveBeenCalled();
  });
});

describe("registrationSchema", () => {
  it.each(["personal", "company", "originator", "capital_provider"] as const)("accepts the %s journey", (journey) => {
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
    expect(defaultRegistrationJourney).toBe("personal");
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
