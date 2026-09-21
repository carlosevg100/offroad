import {describe, expect, it} from "vitest";
import {describeConfig, loadConfig} from "./config";

const baseEnv = (): NodeJS.ProcessEnv => ({
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "publishable-key-for-synthetic-test",
  WORKER_ACCOUNT_EMAIL: "worker@example.com",
  WORKER_ACCOUNT_PASSWORD: "synthetic-password-long-enough",
  OFFROAD_WORKER_TOKEN: "synthetic-worker-token-with-thirty-two-characters",
});

describe("worker provider data-policy configuration", () => {
  it("cannot disable enforcement through the retired flag", () => {
    const config = loadConfig({...baseEnv(), ENFORCE_PROVIDER_DATA_POLICY: "false"});
    expect(describeConfig(config).providerDataPolicyEnforced).toBe(true);
    expect(config.PROVIDER_CONNECTIONS_JSON).toEqual({});
  });
  it("rejects malformed connection bindings without exposing their values", () => {
    expect(() => loadConfig({...baseEnv(), PROVIDER_CONNECTIONS_JSON: "invalid"})).toThrow(/PROVIDER_CONNECTIONS_JSON/);
  });
  it("logs only provider names, never account or credential references", () => {
    const config = loadConfig({...baseEnv(), PROVIDER_CONNECTIONS_JSON: JSON.stringify({openai: {
      accountRef: "synthetic-account", projectRef: "synthetic-project", credentialBinding: "synthetic-credential-version", region: "global",
    }})});
    const described = describeConfig(config);
    expect(described).toMatchObject({providerDataPolicyEnforced: true, verifiedProviderConnections: "openai"});
    expect(JSON.stringify(described)).not.toContain("synthetic-account");
    expect(JSON.stringify(described)).not.toContain("synthetic-credential-version");
  });

  it("accepts provider keys stored as plaintext or as a one-field Secrets Manager object", () => {
    const config = loadConfig({
      ...baseEnv(),
      PERPLEXITY_API_KEY: "synthetic-perplexity-api-key",
      FIRECRAWL_API_KEY: JSON.stringify({console_field: "synthetic-firecrawl-api-key"}),
      ENABLE_FIRECRAWL: "true",
    });

    expect(config.PERPLEXITY_API_KEY).toBe("synthetic-perplexity-api-key");
    expect(config.FIRECRAWL_API_KEY).toBe("synthetic-firecrawl-api-key");
  });

  it("recovers a provider key pasted into the console object's property field", () => {
    const config = loadConfig({
      ...baseEnv(),
      PERPLEXITY_API_KEY: JSON.stringify({"synthetic-perplexity-api-key": ""}),
    });

    expect(config.PERPLEXITY_API_KEY).toBe("synthetic-perplexity-api-key");
  });

  it("rejects ambiguous provider secret objects without printing their contents", () => {
    const ambiguous = JSON.stringify({first: "synthetic-provider-api-key-one", second: "synthetic-provider-api-key-two"});
    expect(() => loadConfig({...baseEnv(), PERPLEXITY_API_KEY: ambiguous}))
      .toThrow("worker configuration is invalid or incomplete: PERPLEXITY_API_KEY");
  });
});
