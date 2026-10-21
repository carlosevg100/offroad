import {describe, expect, it, vi} from "vitest";
import {MarketFetchError, type MarketFetchResult} from "./market-acquisition-fetch";
import {MarketAcquisitionTransportError, type MarketAcquisitionClaim, type MarketAcquisitionQueue} from "./market-acquisition-queue";
import {processMarketAcquisition, sweepMarketOrphans, type MarketObjectStore} from "./process-market-acquisition";

const claim: MarketAcquisitionClaim = {claimed: true, jobId: "3a750000-0000-4000-8000-000000000001", leaseId: "3a750000-0000-4000-8000-000000000002",
 capability: "a".repeat(64), attempt: 1, leaseExpiresAt: "2026-10-20T12:02:00Z", sourceId: "bcb-sgs-cdi", sourceRevision: 1,
 url: "https://api.bcb.gov.br/x", allowedHosts: ["api.bcb.gov.br"], extension: "json", bucket: "market-reference",
 objectPath: "bcb-sgs-cdi/2026/10/3a750000-0000-4000-8000-000000000003.json", maxBytes: 52_428_800};
const file: MarketFetchResult = {finalUrl: "https://api.bcb.gov.br/x", bytes: Buffer.from("[1]"), sha256: "b".repeat(64), md5: "c".repeat(32), byteSize: 3,
 contentType: "application/json", acquiredAt: new Date("2026-10-20T12:00:30Z")};

function harness(overrides: Partial<MarketAcquisitionQueue> = {}, storeOverrides: Partial<MarketObjectStore> = {}) {
 const queue: MarketAcquisitionQueue = {
  claim: vi.fn(async () => null), renew: vi.fn(async () => ({leaseExpiresAt: "2026-10-20T12:04:00Z"})),
  commit: vi.fn(async () => ({acquisitionId: "3a750000-0000-4000-8000-000000000004", replayed: false})),
  fail: vi.fn(async () => ({retryScheduled: true})), orphans: vi.fn(async () => []), ...overrides};
 const store: MarketObjectStore = {upload: vi.fn(async () => undefined), remove: vi.fn(async () => undefined), ...storeOverrides};
 return {queue, store};
}
const signal = new AbortController().signal;

describe("processMarketAcquisition", () => {
 it("stores the bytes at the allocated path and confirms both digests", async () => {
  const {queue, store} = harness();
  const result = await processMarketAcquisition(claim, queue, store, signal, {fetch: async () => file});
  expect(result).toEqual({status: "committed", acquisitionId: "3a750000-0000-4000-8000-000000000004", replayed: false});
  expect(store.upload).toHaveBeenCalledWith(claim.objectPath, file.bytes, "application/json");
  expect(queue.commit).toHaveBeenCalledWith(claim, file);
  expect(store.remove).not.toHaveBeenCalled();
 });

 it("reports a refused fetch with its code and stores nothing", async () => {
  const {queue, store} = harness();
  const result = await processMarketAcquisition(claim, queue, store, signal, {fetch: async () => { throw new MarketFetchError("redirect_not_allowed", false, "evil.example"); }});
  expect(result).toMatchObject({status: "failed", code: "redirect_not_allowed"});
  expect(queue.fail).toHaveBeenCalledWith(claim, "redirect_not_allowed", false, "redirect_not_allowed: evil.example");
  expect(store.upload).not.toHaveBeenCalled();
 });

 it("removes its bytes when the confirmation refuses the object or the source", async () => {
  for (const [code, failure, retryable] of [["market_acquisition_object_mismatch", "verification_failed", true],
   ["market_source_not_acquirable", "source_not_acquirable", false], ["market_delegation_required", "delegation_revoked", true]] as const) {
   const {queue, store} = harness({commit: vi.fn(async () => { throw new MarketAcquisitionTransportError(code); })});
   const result = await processMarketAcquisition(claim, queue, store, signal, {fetch: async () => file});
   expect(result).toMatchObject({status: "failed", code: failure});
   expect(store.remove).toHaveBeenCalledWith([claim.objectPath]);
   expect(queue.fail).toHaveBeenCalledWith(claim, failure, retryable, undefined);
  }
 });

 it("leaves the path to the sweep when the lease or the transport is gone", async () => {
  for (const code of ["market_acquisition_lease_denied", "market_acquisition_transport_paused", "market_acquisition_transport_failed"] as const) {
   const {queue, store} = harness({commit: vi.fn(async () => { throw new MarketAcquisitionTransportError(code); })});
   expect(await processMarketAcquisition(claim, queue, store, signal, {fetch: async () => file})).toEqual({status: "abandoned", reason: code});
   expect(store.remove).not.toHaveBeenCalled();
   expect(queue.fail).not.toHaveBeenCalled();
  }
 });

 it("stops before storing when a renewal is refused during the fetch", async () => {
  const {queue, store} = harness({renew: vi.fn(async () => { throw new MarketAcquisitionTransportError("market_source_not_acquirable"); })});
  const slow = () => new Promise<MarketFetchResult>((resolve) => setTimeout(() => resolve(file), 30));
  const result = await processMarketAcquisition(claim, queue, store, signal, {fetch: slow, renewEveryMs: 5});
  expect(result).toMatchObject({status: "failed", code: "source_not_acquirable"});
  expect(store.upload).not.toHaveBeenCalled();
 });

 it("reports an upload failure as retryable", async () => {
  const {queue, store} = harness({}, {upload: vi.fn(async () => { throw new Error("409"); })});
  expect(await processMarketAcquisition(claim, queue, store, signal, {fetch: async () => file})).toMatchObject({status: "failed", code: "upload_failed"});
  expect(queue.fail).toHaveBeenCalledWith(claim, "upload_failed", true, undefined);
 });
});

describe("sweepMarketOrphans", () => {
 it("removes exactly the paths the database lists", async () => {
  const paths = ["bcb-sgs-cdi/2026/10/3a750000-0000-4000-8000-000000000005.json"];
  const {queue, store} = harness({orphans: vi.fn(async () => paths)});
  expect(await sweepMarketOrphans(queue, store)).toBe(1);
  expect(store.remove).toHaveBeenCalledWith(paths);
  const empty = harness();
  expect(await sweepMarketOrphans(empty.queue, empty.store)).toBe(0);
  expect(empty.store.remove).not.toHaveBeenCalled();
 });
});
