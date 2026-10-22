import {describe, expect, it, vi} from "vitest";
import {MarketFetchError, type MarketFetchResult} from "./market-acquisition-fetch";
import {MarketAcquisitionTransportError, type MarketAcquisitionClaim, type MarketAcquisitionQueue} from "./market-acquisition-queue";
import {processMarketAcquisition, sweepMarketOrphans, type MarketObjectStore} from "./process-market-acquisition";

const url = "https://api.bcb.gov.br/dados/serie/bcdata.sgs.432/dados?formato=json&dataInicial=14/09/2026&dataFinal=15/09/2026";
const claim: MarketAcquisitionClaim = {claimed: true, jobId: "3a750000-0000-4000-8000-000000000001", leaseId: "3a750000-0000-4000-8000-000000000002",
 capability: "a".repeat(64), attempt: 1, leaseExpiresAt: "2026-10-20T12:02:00Z", sourceId: "bcb", sourceRevision: 1,
 url, allowedHosts: ["api.bcb.gov.br"], extension: "json", bucket: "market-reference",
 objectPath: "bcb/2026/10/3a750000-0000-4000-8000-000000000003.json", maxBytes: 1_048_576,
 contractId: "bcb-sgs-432-endpoint", contractKind: "sgs_daily_json", request: {window: {start: "2026-09-14", end: "2026-09-15"}}};
const series = Buffer.from('[{"data":"14/09/2026","valor":"15.00"},{"data":"15/09/2026","valor":"15.00"}]');
const file: MarketFetchResult = {finalUrl: url, bytes: series, sha256: "b".repeat(64), md5: "c".repeat(32), byteSize: series.length,
 contentType: "application/json", acquiredAt: new Date("2026-10-20T12:00:30Z")};
const content = {bytes: file.bytes, contentType: file.contentType, acquiredAt: file.acquiredAt};
const committed = {replayed: false, acquisitionId: "3a750000-0000-4000-8000-000000000004", versionId: "3a750000-0000-4000-8000-000000000006",
 quality: {status: "approved" as const, evaluationId: "3a750000-0000-4000-8000-000000000007"}};

function harness(overrides: Partial<MarketAcquisitionQueue> = {}, storeOverrides: Partial<MarketObjectStore> = {}) {
 const queue: MarketAcquisitionQueue = {
  claim: vi.fn(async () => null), renew: vi.fn(async () => ({leaseExpiresAt: "2026-10-20T12:04:00Z"})),
  commit: vi.fn(async () => committed),
  fail: vi.fn(async () => ({retryScheduled: true})), orphans: vi.fn(async () => []), ...overrides};
 const store: MarketObjectStore = {upload: vi.fn(async () => undefined), remove: vi.fn(async () => undefined), ...storeOverrides};
 return {queue, store};
}
const signal = new AbortController().signal;

describe("processMarketAcquisition", () => {
 it("stores the bytes at the allocated path and sends them to the confirmation", async () => {
  const {queue, store} = harness();
  const result = await processMarketAcquisition(claim, queue, store, signal, {fetch: async () => file});
  expect(result).toEqual({status: "committed", ...committed});
  expect(store.upload).toHaveBeenCalledWith(claim.objectPath, file.bytes, "application/json");
  expect(queue.commit).toHaveBeenCalledWith(claim, content);
  expect(store.remove).not.toHaveBeenCalled();
 });

 it("fails definitively, storing nothing, when the bytes do not read under the contract", async () => {
  const detail: MarketAcquisitionClaim = {...claim, contractId: "bcb-copom-comunicados-detalhe", contractKind: "copom_communique_detail", request: {meeting: 281},
   url: "https://www.bcb.gov.br/api/servico/sitebcb/copom/comunicados_detalhes?nro_reuniao=281", allowedHosts: ["www.bcb.gov.br"]};
  for (const [c, bytes, refusal] of [[claim, '[{"data":"16/09/2026","valor":"15.00"}]', "market_parse_outside_window"],
   [claim, '[{"data":"14/09/2026","valor":"15.00","valor":"15.00"}]', "market_parse_json_duplicate_key"],
   [claim, '[{"data":"14/13/2026","valor":"15.00"}]', "market_parse_date"],
   [detail, '{"conteudo":[{"nro_reuniao":281,"dataReferencia":"2026-13-01","titulo":"t","textoComunicado":"x"}]}', "market_parse_communique_date"],
   [detail, '{"conteudo":[{"nro_reuniao":281,"dataReferencia":"4099-01-01","titulo":"t","textoComunicado":"x"}]}', "market_parse_communique_date"],
   [detail, '{"conteudo":[]}', "market_parse_communique_shape"]] as const) {
   const {queue, store} = harness();
   const result = await processMarketAcquisition(c, queue, store, signal, {fetch: async () => ({...file, bytes: Buffer.from(bytes)})});
   expect(result).toMatchObject({status: "failed", code: "parse_failed"});
   expect(queue.fail).toHaveBeenCalledWith(c, "parse_failed", false, refusal);
   expect(store.upload).not.toHaveBeenCalled();
   expect(queue.commit).not.toHaveBeenCalled();
  }
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
   ["market_source_not_acquirable", "source_not_acquirable", false], ["market_delegation_required", "delegation_revoked", true],
   ["market_parse_failed", "parse_failed", false], ["market_contract_mismatch", "verification_failed", false],
   ["market_copom_meeting_disagreement", "meeting_disagreement", false], ["market_copom_meeting_day_collision", "verification_failed", false],
   ["market_copom_list_conflict", "verification_failed", false]] as const) {
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
  const paths = ["bcb/2026/10/3a750000-0000-4000-8000-000000000005.json"];
  const {queue, store} = harness({orphans: vi.fn(async () => paths)});
  expect(await sweepMarketOrphans(queue, store)).toBe(1);
  expect(store.remove).toHaveBeenCalledWith(paths);
  const empty = harness();
  expect(await sweepMarketOrphans(empty.queue, empty.store)).toBe(0);
  expect(empty.store.remove).not.toHaveBeenCalled();
 });
});
