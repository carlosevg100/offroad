import {createHash} from "node:crypto";
import type {IncomingMessage} from "node:http";
import {PassThrough} from "node:stream";
import {describe, expect, it} from "vitest";
import {fetchMarketFile, isPublicAddress, MarketFetchError, type PinnedRequest, type ResolveHost} from "./market-acquisition-fetch";

type Reply = {status: number; headers?: Record<string, string>; body?: Buffer | string};
const publicDns: ResolveHost = async () => [{address: "200.218.1.1", family: 4}];
const json = Buffer.from('[{"data":"16/10/2026","valor":"0.055131"}]');

function server(replies: Record<string, Reply>, seen: {url: string; address: string}[] = []): PinnedRequest {
 return async (url, address) => {
  seen.push({url: url.toString(), address});
  const reply = replies[url.toString()];
  if (!reply) throw new Error("unexpected request " + url.toString());
  const stream = new PassThrough() as unknown as IncomingMessage & PassThrough;
  Object.assign(stream, {statusCode: reply.status, headers: reply.headers ?? {}});
  stream.end(reply.body ?? "");
  return stream;
 };
}
const base = {url: "https://api.bcb.gov.br/dados/serie/bcdata.sgs.12/dados?formato=json", allowedHosts: ["api.bcb.gov.br"], extension: "json" as const, maxBytes: 1024};
async function failure(promise: Promise<unknown>): Promise<MarketFetchError> {
 try { await promise; } catch (error) { if (error instanceof MarketFetchError) return error; throw error; }
 throw new Error("fetch accepted");
}

describe("fetchMarketFile", () => {
 it("returns the bytes with both digests, the stored type and the final URL", async () => {
  const seen: {url: string; address: string}[] = [];
  const result = await fetchMarketFile(base, {resolve: publicDns, request: server({[base.url]: {status: 200, headers: {"content-type": "application/json; charset=utf-8"}, body: json}}, seen),
   now: () => new Date("2026-10-20T12:00:00Z")});
  expect(result).toMatchObject({finalUrl: base.url, byteSize: json.length, contentType: "application/json",
   sha256: createHash("sha256").update(json).digest("hex"), md5: createHash("md5").update(json).digest("hex")});
  expect(result.bytes.equals(json)).toBe(true);
  expect(seen).toEqual([{url: base.url, address: "200.218.1.1"}]);
 });

 it("refuses URLs outside the source's hosts before any request", async () => {
  for (const url of ["http://api.bcb.gov.br/x", "https://www.bcb.gov.br/x", "https://api.bcb.gov.br.evil.example/x", "https://user@api.bcb.gov.br/x",
   "https://api.bcb.gov.br:8443/x", "https://200.218.1.1/x", "not a url"]) {
   const error = await failure(fetchMarketFile({...base, url}, {resolve: publicDns, request: server({})}));
   expect(error.code).toBe("host_not_allowed");
   expect(error.retryable).toBe(false);
  }
 });

 it("refuses a host whose DNS answer includes a private or reserved address", async () => {
  for (const address of ["10.0.0.5", "127.0.0.1", "169.254.169.254", "100.64.0.1", "192.168.1.1", "::1", "fd00::1", "::ffff:10.0.0.1"]) {
   const resolve: ResolveHost = async () => [{address: "200.218.1.1", family: 4}, {address, family: address.includes(":") ? 6 : 4}];
   expect((await failure(fetchMarketFile(base, {resolve, request: server({})}))).code).toBe("private_address");
  }
 });

 it("revalidates every redirect against the host list and the address check", async () => {
  const offList = server({[base.url]: {status: 302, headers: {location: "https://evil.example/x"}}});
  expect((await failure(fetchMarketFile(base, {resolve: publicDns, request: offList}))).code).toBe("redirect_not_allowed");
  const downgrade = server({[base.url]: {status: 301, headers: {location: "http://api.bcb.gov.br/x"}}});
  expect((await failure(fetchMarketFile(base, {resolve: publicDns, request: downgrade}))).code).toBe("redirect_not_allowed");
  const loop = server({[base.url]: {status: 302, headers: {location: base.url}}});
  expect((await failure(fetchMarketFile(base, {resolve: publicDns, request: loop, maxRedirects: 2}))).code).toBe("redirect_not_allowed");
  const target = "https://api.bcb.gov.br/final.json";
  const rebinding: ResolveHost = async (host) => [{address: host === "api.bcb.gov.br" ? "200.218.1.1" : "10.0.0.1", family: 4}];
  const relative = server({[base.url]: {status: 302, headers: {location: "/final.json"}}, [target]: {status: 200, headers: {"content-type": "application/json"}, body: json}});
  expect((await fetchMarketFile(base, {resolve: rebinding, request: relative})).finalUrl).toBe(target);
 });

 it("stops at the byte limit, declared or streamed", async () => {
  const big = Buffer.alloc(2048, 0x20);
  const declared = server({[base.url]: {status: 200, headers: {"content-type": "application/json", "content-length": "2048"}, body: big}});
  expect((await failure(fetchMarketFile(base, {resolve: publicDns, request: declared}))).code).toBe("too_large");
  const streamed = server({[base.url]: {status: 200, headers: {"content-type": "application/json"}, body: Buffer.concat([Buffer.from("["), big])}});
  expect((await failure(fetchMarketFile(base, {resolve: publicDns, request: streamed}))).code).toBe("too_large");
 });

 it("refuses a type or a body that does not match the extension", async () => {
  const html = server({[base.url]: {status: 200, headers: {"content-type": "text/html"}, body: "<html></html>"}});
  expect((await failure(fetchMarketFile(base, {resolve: publicDns, request: html}))).code).toBe("content_type");
  const disguised = server({[base.url]: {status: 200, headers: {"content-type": "application/json"}, body: "<html>login</html>"}});
  expect((await failure(fetchMarketFile(base, {resolve: publicDns, request: disguised}))).code).toBe("content_type");
  const empty = server({[base.url]: {status: 200, headers: {"content-type": "application/json"}, body: ""}});
  expect((await failure(fetchMarketFile(base, {resolve: publicDns, request: empty}))).code).toBe("content_type");
  const zipUrl = {...base, extension: "zip" as const};
  const notZip = server({[base.url]: {status: 200, headers: {"content-type": "application/octet-stream"}, body: "plain"}});
  expect((await failure(fetchMarketFile(zipUrl, {resolve: publicDns, request: notZip}))).code).toBe("content_type");
 });

 it("retries server errors and network failures, never client errors", async () => {
  const unavailable = await failure(fetchMarketFile(base, {resolve: publicDns, request: server({[base.url]: {status: 503}})}));
  expect([unavailable.code, unavailable.retryable]).toEqual(["http_status", true]);
  const missing = await failure(fetchMarketFile(base, {resolve: publicDns, request: server({[base.url]: {status: 404}})}));
  expect([missing.code, missing.retryable]).toEqual(["http_status", false]);
  const broken: PinnedRequest = async () => { throw new Error("ECONNRESET"); };
  const network = await failure(fetchMarketFile(base, {resolve: publicDns, request: broken}));
  expect([network.code, network.retryable]).toEqual(["network", true]);
 });

 it("classifies addresses", () => {
  expect(["200.218.1.1", "8.8.8.8", "2606:4700::1111"].every(isPublicAddress)).toBe(true);
  expect(["0.0.0.0", "198.18.0.1", "203.0.113.5", "224.0.0.1", "64:ff9b::a00:1", "2001:db8::1", "fe80::1", "not-an-ip"].some(isPublicAddress)).toBe(false);
 });
});
