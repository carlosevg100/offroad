import {describe, expect, it, vi} from "vitest";
import type {SupabaseClient} from "@supabase/supabase-js";
import {retentionMatrixVersion} from "@offroad/model-gateway";
import {createProviderProcessingAuthorizer} from "./provider-processing";
import type {ClaimedJob} from "./queue";

const job = {job_id: "a7160000-0000-4000-9000-000000000001", capability_token: "synthetic-capability-only"} as ClaimedJob;
const connections = {openai: {accountRef: "synthetic-account", projectRef: "synthetic-project", credentialBinding: "synthetic-version", region: "global"}};
const request = {provider: "openai" as const, model: "gpt-5.6-terra", resources: ["inference" as const], purpose: "case_analysis" as const};
describe("worker provider-processing authority", () => {
  it("cannot self attest when the account binding is unknown", async () => {
    const rpc = vi.fn();
    const authorize = createProviderProcessingAuthorizer({rpc} as unknown as SupabaseClient, job, {});
    expect((await authorize(request)).allowed).toBe(false); expect(rpc).not.toHaveBeenCalled();
  });
  it("revalidates the job on each call, without asking the worker for a source classification", async () => {
    const rpc = vi.fn().mockResolvedValue({data: {allowed: true, policyVersion: retentionMatrixVersion, assuranceId: null, reasons: []}, error: null});
    const authorize = createProviderProcessingAuthorizer({rpc} as unknown as SupabaseClient, job, connections);
    await authorize(request);
    rpc.mockResolvedValue({data: {allowed: false, policyVersion: retentionMatrixVersion, assuranceId: null, reasons: ["processing_resource_ineligible:inference"]}, error: null});
    expect((await authorize(request)).allowed).toBe(false); expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc.mock.calls[0]?.[1]).toEqual({p_job_id: job.job_id, p_capability_token: job.capability_token,
      p_route: {...connections.openai, provider: "openai", model: "gpt-5.6-terra", endpoint: "https://api.openai.com/v1/responses"},
      p_resources: ["inference"], p_purpose: "case_analysis"});
  });
  it("rejects unavailable or malformed authority without logging provider or database contents", async () => {
    for (const response of [{data: null, error: {message: "do not disclose"}}, {data: {allowed: true}, error: null}]) {
      const rpc = vi.fn().mockResolvedValue(response);
      await expect(createProviderProcessingAuthorizer({rpc} as unknown as SupabaseClient, job, connections)(request)).rejects.toThrow(/^processing_authority_/);
    }
  });
});
