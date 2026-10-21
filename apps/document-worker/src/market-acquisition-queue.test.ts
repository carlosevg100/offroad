import type {SupabaseClient} from "@supabase/supabase-js";
import {describe, expect, it} from "vitest";
import {createMarketAcquisitionQueue, MarketAcquisitionTransportError} from "./market-acquisition-queue";

const claim = {claimed: true, jobId: "3a760000-0000-4000-8000-000000000001", leaseId: "3a760000-0000-4000-8000-000000000002", capability: "a".repeat(64),
 attempt: 1, leaseExpiresAt: "2026-10-20T12:02:00.000+00:00", sourceId: "bcb", sourceRevision: 1,
 url: "https://api.bcb.gov.br/dados/serie/bcdata.sgs.432/dados?formato=json&dataInicial=14/09/2026&dataFinal=20/09/2026",
 allowedHosts: ["api.bcb.gov.br", "www.bcb.gov.br"], extension: "json", bucket: "market-reference", objectPath: "bcb/2026/10/3a760000-0000-4000-8000-000000000003.json",
 maxBytes: 1_048_576, contractId: "bcb-sgs-432-endpoint", contractKind: "sgs_daily_json", request: {window: {start: "2026-09-14", end: "2026-09-20"}}};

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
   {...claim, url: "http://api.bcb.gov.br/x"}, {...claim, extra: true}, {...claim, contractKind: "other"}, {...claim, request: {size: 5}},
   {...claim, request: {window: {start: "2026-09-14", end: "2026-09-20"}, extra: 1}}, {...claim, contractKind: "copom_communique_detail", request: {meeting: 281.5}},
   {...claim, contractId: undefined}]) {
   await expect(createMarketAcquisitionQueue(client({worker_claim_market_acquisition_v1: {data: bad}}), "t").claim()).rejects.toThrow();
  }
 });

 it("confirms with the lease, the capability and the bytes themselves", async () => {
  const calls: {name: string; args: Record<string, unknown>}[] = [];
  const answer = {committed: true, replayed: false, acquisitionId: "3a760000-0000-4000-8000-000000000004", versionId: "3a760000-0000-4000-8000-000000000006",
   quality: {status: "quarantined", evaluationId: "3a760000-0000-4000-8000-000000000007"}};
  const queue = createMarketAcquisitionQueue(client({worker_commit_market_version_v1: {data: answer}}, calls), "t");
  const acquiredAt = new Date("2026-10-20T12:00:30.123Z");
  const result = await queue.commit(claim as never, {bytes: Buffer.from("[]"), contentType: "application/json", acquiredAt});
  expect(calls[0]).toEqual({name: "worker_commit_market_version_v1", args: {p_job_id: claim.jobId, p_capability_token: claim.capability, p_lease_id: claim.leaseId,
   p_content: "\\x5b5d", p_content_type: "application/json", p_acquired_at: "2026-10-20T12:00:30.123Z"}});
  expect(result).toEqual({replayed: false, acquisitionId: answer.acquisitionId, versionId: answer.versionId, quality: answer.quality});
  const detail = createMarketAcquisitionQueue(client({worker_commit_market_version_v1: {data: {committed: true, replayed: true,
   acquisitionId: "3a760000-0000-4000-8000-000000000004", meeting: 281, reference: false}}}), "t");
  expect(await detail.commit(claim as never, {bytes: Buffer.from("{}"), contentType: "application/json", acquiredAt})).toMatchObject({meeting: 281, reference: false});
  const extra = createMarketAcquisitionQueue(client({worker_commit_market_version_v1: {data: {...answer, observations: []}}}), "t");
  await expect(extra.commit(claim as never, {bytes: Buffer.from("[]"), contentType: "application/json", acquiredAt})).rejects.toThrow();
 });

 it("folds every refusal of the strict reading into one parse code", async () => {
  for (const message of ["market_parse_json_duplicate_key", "market_parse_communique_text"]) {
   const queue = createMarketAcquisitionQueue(client({worker_commit_market_version_v1: {error: {message}}}), "t");
   expect(await code(queue.commit(claim as never, {bytes: Buffer.from("[]"), contentType: "application/json", acquiredAt: new Date()}))).toBe("market_parse_failed");
  }
  for (const message of ["market_copom_meeting_disagreement", "market_contract_mismatch"]) {
   const queue = createMarketAcquisitionQueue(client({worker_commit_market_version_v1: {error: {message}}}), "t");
   expect(await code(queue.commit(claim as never, {bytes: Buffer.from("[]"), contentType: "application/json", acquiredAt: new Date()}))).toBe(message);
  }
  const odd = createMarketAcquisitionQueue(client({worker_commit_market_version_v1: {error: {message: "market_parse_ with spaces"}}}), "t");
  expect(await code(odd.commit(claim as never, {bytes: Buffer.from("[]"), contentType: "application/json", acquiredAt: new Date()}))).toBe("market_acquisition_transport_failed");
 });

 it("keeps known refusals and hides every other remote message", async () => {
  const known = createMarketAcquisitionQueue(client({worker_renew_market_acquisition_v1: {error: {message: "market_source_not_acquirable"}}}), "t");
  expect(await code(known.renew(claim as never))).toBe("market_source_not_acquirable");
  const unknown = createMarketAcquisitionQueue(client({worker_renew_market_acquisition_v1: {error: {message: "relation private.x does not exist"}}}), "t");
  expect(await code(unknown.renew(claim as never))).toBe("market_acquisition_transport_failed");
 });

 it("lists orphans only in the allocated path shape", async () => {
  const good = "bcb/2026/10/3a760000-0000-4000-8000-000000000005.json";
  expect(await createMarketAcquisitionQueue(client({worker_list_market_orphans_v1: {data: [good]}}), "t").orphans(20)).toEqual([good]);
  await expect(createMarketAcquisitionQueue(client({worker_list_market_orphans_v1: {data: ["tenant/secret.pdf"]}}), "t").orphans(20)).rejects.toThrow();
 });
});
