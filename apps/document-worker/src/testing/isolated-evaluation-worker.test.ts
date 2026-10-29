import {describe, expect, it} from "vitest";
import {readIsolatedEvaluationConfig} from "./isolated-evaluation-worker";
const synthetic = {
  SUPABASE_URL: "https://gjkkjtbfnssdsbmlhmwk.supabase.co", SUPABASE_PUBLISHABLE_KEY: "synthetic-publishable-key",
  OFFROAD_WORKER_EMAIL: "synthetic-worker@example.invalid", OFFROAD_WORKER_PASSWORD: "Synthetic-Password-Only",
  OFFROAD_WORKER_TOKEN: "synthetic-worker-token-only-1234567890", OFFROAD_EVALUATION_ORGANIZATION_ID: "352b1fb7-0b25-467a-91cc-38276a26319a",
  ANTHROPIC_API_KEY: "synthetic-provider-key-only", PROVIDER_CONNECTIONS_JSON: JSON.stringify({anthropic: {accountRef: "synthetic", projectRef: "synthetic", credentialBinding: "synthetic", region: "global"}}),
};
describe("isolated evaluation helper boundary", () => {
  it("accepts only the existing isolated staging URL", () => {
    expect(readIsolatedEvaluationConfig(synthetic).SUPABASE_URL).toBe(synthetic.SUPABASE_URL);
    expect(() => readIsolatedEvaluationConfig({...synthetic, SUPABASE_URL: "https://ifnogpksgdadruooqydi.supabase.co"})).toThrow("isolated_evaluation_configuration_required");
  });
  it("refuses missing credentials and any other provider connection", () => {
    expect(() => readIsolatedEvaluationConfig({...synthetic, OFFROAD_WORKER_PASSWORD: ""})).toThrow("isolated_evaluation_configuration_required");
    expect(() => readIsolatedEvaluationConfig({...synthetic, PROVIDER_CONNECTIONS_JSON: "{}"})).toThrow("isolated_evaluation_connections_required");
    expect(() => readIsolatedEvaluationConfig({...synthetic, PROVIDER_CONNECTIONS_JSON: "not-json"})).toThrow("isolated_evaluation_connections_required");
    const connection = JSON.parse(synthetic.PROVIDER_CONNECTIONS_JSON).anthropic;
    expect(() => readIsolatedEvaluationConfig({...synthetic, PROVIDER_CONNECTIONS_JSON: JSON.stringify({anthropic: connection, openai: connection})})).toThrow("isolated_evaluation_connections_required");
  });
});
