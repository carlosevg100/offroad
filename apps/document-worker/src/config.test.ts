import {describe, expect, it} from "vitest";
import {providerDataPolicyVersion, type ProviderDataAssurance} from "@offroad/model-gateway";
import {describeConfig, loadConfig} from "./config";

const baseEnv = (): NodeJS.ProcessEnv => ({
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "publishable-key-for-synthetic-test",
  WORKER_ACCOUNT_EMAIL: "worker@example.com",
  WORKER_ACCOUNT_PASSWORD: "synthetic-password-long-enough",
  OFFROAD_WORKER_TOKEN: "synthetic-worker-token-with-thirty-two-characters",
});

function assurance(provider: "anthropic" | "openai"): ProviderDataAssurance {
  return {
    provider,
    policyVersion: providerDataPolicyVersion,
    approvedPurposes: ["document_processing", "case_analysis", "artifact_generation", "evaluation"],
    allowedClassifications: ["confidential", "restricted"],
    trainingUse: "prohibited",
    storage: "no_store",
    reviewedAt: "2026-09-01T12:00:00.000Z",
    validThrough: "2027-03-01T12:00:00.000Z",
  };
}

describe("worker provider data-policy configuration", () => {
  it("keeps enforcement explicit and off by default", () => {
    expect(loadConfig(baseEnv()).ENFORCE_PROVIDER_DATA_POLICY).toBe(false);
  });

  it("refuses boot when enforcement is enabled without assurance for a configured provider", () => {
    expect(() => loadConfig({...baseEnv(), ENFORCE_PROVIDER_DATA_POLICY: "true", ANTHROPIC_API_KEY: "synthetic-anthropic-api-key"}))
      .toThrow(/ANTHROPIC_DATA_ASSURANCE_JSON/);
  });

  it("parses a reviewed assurance but exposes only presence in safe configuration logs", () => {
    const config = loadConfig({
      ...baseEnv(),
      ENFORCE_PROVIDER_DATA_POLICY: "true",
      ANTHROPIC_API_KEY: "synthetic-anthropic-api-key",
      ANTHROPIC_DATA_ASSURANCE_JSON: JSON.stringify(assurance("anthropic")),
    });
    expect(config.ANTHROPIC_DATA_ASSURANCE_JSON?.policyVersion).toBe(providerDataPolicyVersion);
    const described = describeConfig(config);
    expect(described).toMatchObject({providerDataPolicyEnforced: true, anthropicDataAssurance: "present"});
    expect(JSON.stringify(described)).not.toContain("validThrough");
    expect(JSON.stringify(described)).not.toContain("synthetic-anthropic-api-key");
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

  it("rejects ambiguous provider secret objects without printing their contents", () => {
    const ambiguous = JSON.stringify({first: "synthetic-provider-api-key-one", second: "synthetic-provider-api-key-two"});
    expect(() => loadConfig({...baseEnv(), PERPLEXITY_API_KEY: ambiguous}))
      .toThrow("worker configuration is invalid or incomplete: PERPLEXITY_API_KEY");
  });
});
