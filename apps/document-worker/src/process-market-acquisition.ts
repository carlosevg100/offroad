import {MarketContractError, parseCommuniqueDetail, parseCommuniqueList, parseSelicTarget, saoPauloDate} from "@offroad/market-reference/m2";
import {fetchMarketFile, MarketFetchError, type MarketFetchDeps, type MarketFetchResult} from "./market-acquisition-fetch";
import {MarketAcquisitionTransportError, type MarketAcquisitionClaim, type MarketAcquisitionFailureCode, type MarketAcquisitionQueue,
 type MarketVersionCommit} from "./market-acquisition-queue";

/**
 * The largest object this consumer stores. Storage records the MD5 of the whole object as its eTag only
 * for a single-request upload; above this size it may split the upload in parts, and the confirmation,
 * which compares that MD5, would refuse it. Larger files need a verified multipart protocol first.
 */
export const MARKET_SINGLE_REQUEST_BYTES = 5 * 1024 * 1024;

/** The publisher bucket, reached only at the exact path the claim allocated. */
export type MarketObjectStore = {
 upload(path: string, bytes: Buffer, contentType: string): Promise<void>;
 remove(paths: string[]): Promise<void>;
};
export type MarketAcquisitionDeps = {fetch?: (claim: MarketAcquisitionClaim) => Promise<MarketFetchResult>; fetchDeps?: MarketFetchDeps; renewEveryMs?: number};
export type MarketAcquisitionResult =
 | ({status: "committed"} & MarketVersionCommit)
 | {status: "failed"; code: MarketAcquisitionFailureCode; retryScheduled: boolean}
 | {status: "abandoned"; reason: string};

/** Database refusals at confirmation, mapped to the failure the attempt reports. */
const commitFailure: Partial<Record<string, {code: MarketAcquisitionFailureCode; retryable: boolean}>> = {
 market_acquisition_object_mismatch: {code: "verification_failed", retryable: true},
 market_source_not_acquirable: {code: "source_not_acquirable", retryable: false},
 market_delegation_required: {code: "delegation_revoked", retryable: true},
 market_host_not_allowed: {code: "host_not_allowed", retryable: false},
 market_acquisition_invalid: {code: "verification_failed", retryable: false},
 market_parse_failed: {code: "parse_failed", retryable: false},
 market_contract_mismatch: {code: "verification_failed", retryable: false},
 market_copom_meeting_disagreement: {code: "verification_failed", retryable: false},
 market_copom_meeting_day_collision: {code: "verification_failed", retryable: false},
};

/**
 * Reads the bytes under the endpoint contract, as the database will, so a file the contract refuses
 * fails early and definitively without being stored. The database reads them again and is the only
 * authority over what is recorded. Returns the refusal code, or null when the bytes read.
 */
export function marketContentRefusal(claim: MarketAcquisitionClaim, bytes: Uint8Array, acquiredAt: Date): string | null {
 try {
  switch (claim.contractKind) {
   case "sgs_daily_json": parseSelicTarget(bytes, claim.request.window, saoPauloDate(acquiredAt.getTime())); break;
   case "copom_communique_detail": parseCommuniqueDetail(bytes, claim.request.meeting); break;
   case "copom_communique_list": parseCommuniqueList(bytes, claim.request.size); break;
  }
  return null;
 } catch (error) {
  // Any other exception while reading is still a file the contract cannot read: definitive, never a stuck lease.
  return error instanceof MarketContractError ? error.code : "market_parse_unexpected";
 }
}

/**
 * One acquisition attempt: fetch the contract URL, read the bytes under the contract, store them at the
 * allocated path and send them to the confirmation, where the database reads them itself. The lease is renewed while the attempt runs; any refusal of the
 * renewal stops the attempt. Bytes are removed when the attempt fails after storing them; when the
 * transport is paused or the lease is gone, the path stays allocated and the sweep removes it later.
 */
export async function processMarketAcquisition(claim: MarketAcquisitionClaim, queue: MarketAcquisitionQueue, store: MarketObjectStore,
 signal: AbortSignal, deps: MarketAcquisitionDeps = {}): Promise<MarketAcquisitionResult> {
 let lost: MarketAcquisitionTransportError | null = null;
 const renewal = setInterval(() => {
  queue.renew(claim).catch((error) => { lost ??= error instanceof MarketAcquisitionTransportError ? error : new MarketAcquisitionTransportError("market_acquisition_transport_failed"); });
 }, deps.renewEveryMs ?? 45_000);
 let stored = false;
 const fail = async (code: MarketAcquisitionFailureCode, retryable: boolean, detail?: string): Promise<MarketAcquisitionResult> => {
  if (stored) await store.remove([claim.objectPath]).catch(() => undefined);
  try { return {status: "failed", code, retryScheduled: (await queue.fail(claim, code, retryable, detail)).retryScheduled}; }
  catch (error) { return {status: "abandoned", reason: error instanceof MarketAcquisitionTransportError ? error.code : "market_acquisition_transport_failed"}; }
 };
 try {
  if (signal.aborted) return {status: "abandoned", reason: "shutdown"};
  let file: MarketFetchResult;
  try {
   file = deps.fetch ? await deps.fetch(claim) : await fetchMarketFile({url: claim.url, allowedHosts: claim.allowedHosts, extension: claim.extension, maxBytes: Math.min(claim.maxBytes, MARKET_SINGLE_REQUEST_BYTES)}, deps.fetchDeps);
  } catch (error) {
   if (error instanceof MarketFetchError) return await fail(error.code, error.retryable, error.message);
   return await fail("network", true);
  }
  const refusal = marketContentRefusal(claim, file.bytes, file.acquiredAt);
  if (refusal) return await fail("parse_failed", false, refusal);
  // A refused renewal ends the attempt before any byte is stored.
  if (lost) {
   const refused: MarketAcquisitionTransportError = lost;
   const mapped = commitFailure[refused.code];
   return mapped ? await fail(mapped.code, mapped.retryable) : {status: "abandoned", reason: refused.code};
  }
  try { await store.upload(claim.objectPath, file.bytes, file.contentType); stored = true; }
  catch { return await fail("upload_failed", true); }
  try {
   return {status: "committed", ...await queue.commit(claim, {bytes: file.bytes, contentType: file.contentType, acquiredAt: file.acquiredAt})};
  } catch (error) {
   const code = error instanceof MarketAcquisitionTransportError ? error.code : "market_acquisition_transport_failed";
   const mapped = commitFailure[code];
   if (mapped) return await fail(mapped.code, mapped.retryable);
   // A paused transport, a lost lease or a transport failure: the confirmation may even have
   // landed. Nothing is removed; a replay or the sweep settles it.
   return {status: "abandoned", reason: code};
  }
 } finally {
  clearInterval(renewal);
 }
}

/** Removes bytes that abandoned attempts left at their allocated paths, a bounded batch at a time. */
export async function sweepMarketOrphans(queue: MarketAcquisitionQueue, store: MarketObjectStore, limit = 20): Promise<number> {
 const paths = await queue.orphans(limit);
 if (paths.length === 0) return 0;
 await store.remove(paths);
 return paths.length;
}
