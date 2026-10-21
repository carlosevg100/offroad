import type {SupabaseClient} from "@supabase/supabase-js";
import {describe, expect, it} from "vitest";
import {createMarketAcquisitionQueue, MarketAcquisitionTransportError} from "./market-acquisition-queue";

const claim = {claimed: true, jobId: "3a760000-0000-4000-8000-000000000001", leaseId: "3a760000-0000-4000-8000-000000000002", capability: "a".repeat(64),
 attempt: 1, leaseExpiresAt: "2026-10-20T12:02:00.000Z", sourceId: "bcb-sgs-cdi", sourceRevision: 1, url: "https://api.bcb.gov.br/x",
 allowedHosts: ["api.bcb.gov.br"], extension: "json", bucket: "market-reference", objectPath: "bcb-sgs-cdi/2026/10/3a760000-0000-4000-8000-000000000003.json",
 maxBytes: 52_428_800};

function client(answers: Record<string, {data?: unknown; error?: {message: string}}>, calls: {name: string; args: Record<string, unknown>}[] = []) {
 return {rpc(name: string, args: Record<string, unknown>) {
  calls.push({name, args});
  const answer = answers[name] ?? {error: {message: "missing"}};
  return {abortSignal: async () => ({data: answer.data ?? null, error: answer.error ?? null})};
 }} as unknown as SupabaseClient;
}
async function code(promise: Promise<unknown>) {
 try { await promise; } catch (error) { if (error instanceof MarketAcquisitionTransportError) return error.code; throw error; }
 throw new Error("accepted");
}

describe("market acquisition queue", () => {
 it("claims with the worker token and parses the strict claim", async () => {
  const calls: {name: string; args: Record<string, unknown>}[] = [];
  const queue = createMarketAcquisitionQueue(client({worker_claim_market_acquisition_v1: {data: claim}}, calls), "worker-token");
  expect(await queue.claim()).toEqual(claim);
  expect(calls).toEqual([{name: "worker_claim_market_acquisition_v1", args: {p_worker_token: "worker-token"}}]);
  expect(await createMarketAcquisitionQueue(client({worker_claim_market_acquisition_v1: {data: {claimed: false}}}), "t").claim()).toBeNull();
 });

 it("refuses a claim outside the publisher bucket, its path shape or its hosts", async () => {
  for (const bad of [{...claim, bucket: "opportunity-documents"}, {...claim, objectPath: "../tenant/file.json"}, {...claim, allowedHosts: ["API.BCB.GOV.BR"]},
   {...claim, url: "http://api.bcb.gov.br/x"}, {...claim, extra: true}]) {
   await expect(createMarketAcquisitionQueue(client({worker_claim_market_acquisition_v1: {data: bad}}), "t").claim()).rejects.toThrow();
  }
 });

 it("confirms with the lease, the capability and both digests", async () => {
  const calls: {name: string; args: Record<string, unknown>}[] = [];
  const queue = createMarketAcquisitionQueue(client({worker_commit_market_acquisition_v1: {data: {committed: true, replayed: false, acquisitionId: "3a760000-0000-4000-8000-000000000004"}}}, calls), "t");
  const acquiredAt = new Date("2026-10-20T12:00:30.123Z");
  await queue.commit(claim as never, {finalUrl: "https://api.bcb.gov.br/x", sha256: "b".repeat(64), md5: "c".repeat(32), byteSize: 3, contentType: "application/json", acquiredAt});
  expect(calls[0]).toEqual({name: "worker_commit_market_acquisition_v1", args: {p_job_id: claim.jobId, p_capability_token: claim.capability, p_lease_id: claim.leaseId,
   p_final_url: "https://api.bcb.gov.br/x", p_sha256: "b".repeat(64), p_md5: "c".repeat(32), p_byte_size: 3, p_content_type: "application/json",
   p_acquired_at: "2026-10-20T12:00:30.123Z"}});
 });

 it("keeps known refusals and hides every other remote message", async () => {
  const known = createMarketAcquisitionQueue(client({worker_renew_market_acquisition_v1: {error: {message: "market_source_not_acquirable"}}}), "t");
  expect(await code(known.renew(claim as never))).toBe("market_source_not_acquirable");
  const unknown = createMarketAcquisitionQueue(client({worker_renew_market_acquisition_v1: {error: {message: "relation private.x does not exist"}}}), "t");
  expect(await code(unknown.renew(claim as never))).toBe("market_acquisition_transport_failed");
 });

 it("lists orphans only in the allocated path shape", async () => {
  const good = "bcb-sgs-cdi/2026/10/3a760000-0000-4000-8000-000000000005.json";
  expect(await createMarketAcquisitionQueue(client({worker_list_market_orphans_v1: {data: [good]}}), "t").orphans(20)).toEqual([good]);
  await expect(createMarketAcquisitionQueue(client({worker_list_market_orphans_v1: {data: ["tenant/secret.pdf"]}}), "t").orphans(20)).rejects.toThrow();
 });
});
