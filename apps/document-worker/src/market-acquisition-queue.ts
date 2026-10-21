import type {SupabaseClient} from "@supabase/supabase-js";
import {z} from "zod";
import {executionTransportTimeoutMs} from "./execution-queue";

const timestamp = z.iso.datetime({offset: true});
const host = z.string().regex(/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/);

/** worker_claim_market_acquisition_v1: the lease, the capability, the URL, its hosts and the exact object path. */
export const marketAcquisitionClaimSchema = z.object({claimed: z.literal(true), jobId: z.uuid(), leaseId: z.uuid(), capability: z.string().regex(/^[a-f0-9]{64}$/),
 attempt: z.number().int().positive(), leaseExpiresAt: timestamp, sourceId: z.string().regex(/^[a-z0-9][a-z0-9._-]{0,79}$/), sourceRevision: z.number().int().positive(),
 url: z.string().startsWith("https://").max(2000), allowedHosts: z.array(host).min(1).max(8),
 extension: z.enum(["json", "csv", "zip", "xml", "pdf", "txt", "html"]), bucket: z.literal("market-reference"),
 objectPath: z.string().regex(/^[a-z0-9._-]+\/[0-9]{4}\/[0-9]{2}\/[0-9a-f-]{36}\.[a-z0-9]{2,5}$/), maxBytes: z.number().int().positive().max(52_428_800)}).strict();
export type MarketAcquisitionClaim = z.infer<typeof marketAcquisitionClaimSchema>;

const renewalSchema = z.object({renewed: z.literal(true), leaseExpiresAt: timestamp}).strict();
const commitSchema = z.object({committed: z.literal(true), replayed: z.boolean(), acquisitionId: z.uuid()}).strict();
const failSchema = z.object({retryScheduled: z.boolean()}).strict();
const orphansSchema = z.array(z.string().regex(/^[a-z0-9._-]+\/[0-9]{4}\/[0-9]{2}\/[0-9a-f-]{36}\.[a-z0-9]{2,5}$/)).max(100);

/** What the worker reports as the attempt's failure; the database keeps the list it accepts. */
export type MarketAcquisitionFailureCode = "host_not_allowed" | "redirect_not_allowed" | "private_address" | "http_status" | "too_large" | "content_type"
 | "timeout" | "network" | "upload_failed" | "verification_failed" | "transport_paused" | "source_not_acquirable" | "delegation_revoked";
export type MarketAcquisitionReceipt = {finalUrl: string; sha256: string; md5: string; byteSize: number; contentType: string; acquiredAt: Date};

export type MarketAcquisitionQueue = {
 claim(): Promise<MarketAcquisitionClaim | null>;
 renew(c: MarketAcquisitionClaim): Promise<{leaseExpiresAt: string}>;
 commit(c: MarketAcquisitionClaim, receipt: MarketAcquisitionReceipt): Promise<{acquisitionId: string; replayed: boolean}>;
 fail(c: MarketAcquisitionClaim, code: MarketAcquisitionFailureCode, retryable: boolean, detail?: string): Promise<{retryScheduled: boolean}>;
 orphans(limit: number): Promise<string[]>;
};

/** Database refusals the consumer acts on; anything else is a transport failure and carries no remote text. */
export const marketAcquisitionTransportCodes = [
 "market_acquisition_lease_denied", "market_acquisition_transport_paused", "market_source_not_acquirable", "market_delegation_required",
 "market_acquisition_object_mismatch", "market_acquisition_invalid", "market_host_not_allowed", "market_reference_bucket_unsafe",
 "worker_account_binding_required",
] as const;
export type MarketAcquisitionTransportCode = (typeof marketAcquisitionTransportCodes)[number] | "market_acquisition_transport_failed";
export class MarketAcquisitionTransportError extends Error {
 constructor(readonly code: MarketAcquisitionTransportCode) { super(code); this.name = "MarketAcquisitionTransportError"; }
}
const known = new Set<string>(marketAcquisitionTransportCodes);

export function createMarketAcquisitionQueue(client: SupabaseClient, workerToken: string): MarketAcquisitionQueue {
 const rpc = async (name: string, args: Record<string, unknown>) => {
  let response: {data: unknown; error: {message?: unknown} | null};
  try { response = await client.rpc(name, args).abortSignal(AbortSignal.timeout(executionTransportTimeoutMs(0))); }
  catch { throw new MarketAcquisitionTransportError("market_acquisition_transport_failed"); }
  if (response.error) {
   const message = typeof response.error.message === "string" ? response.error.message : "";
   throw new MarketAcquisitionTransportError(known.has(message) ? message as MarketAcquisitionTransportCode : "market_acquisition_transport_failed");
  }
  return response.data;
 };
 const lease = (c: MarketAcquisitionClaim) => ({p_job_id: c.jobId, p_capability_token: c.capability, p_lease_id: c.leaseId});
 return {
  async claim() {
   const data = await rpc("worker_claim_market_acquisition_v1", {p_worker_token: workerToken});
   if (z.object({claimed: z.literal(false)}).strict().safeParse(data).success) return null;
   return marketAcquisitionClaimSchema.parse(data);
  },
  async renew(c) { return renewalSchema.parse(await rpc("worker_renew_market_acquisition_v1", lease(c))); },
  async commit(c, receipt) {
   const answer = commitSchema.parse(await rpc("worker_commit_market_acquisition_v1", {...lease(c), p_final_url: receipt.finalUrl, p_sha256: receipt.sha256,
    p_md5: receipt.md5, p_byte_size: receipt.byteSize, p_content_type: receipt.contentType, p_acquired_at: receipt.acquiredAt.toISOString()}));
   return {acquisitionId: answer.acquisitionId, replayed: answer.replayed};
  },
  async fail(c, code, retryable, detail) {
   return failSchema.parse(await rpc("worker_fail_market_acquisition_v1", {...lease(c), p_code: code, p_retryable: retryable, p_detail: detail?.slice(0, 500) ?? null}));
  },
  async orphans(limit) { return orphansSchema.parse(await rpc("worker_list_market_orphans_v1", {p_worker_token: workerToken, p_limit: limit})); },
 };
}
