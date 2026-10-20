import {createHash} from "node:crypto";
import {lookup} from "node:dns/promises";
import {request as httpsRequest} from "node:https";
import type {IncomingMessage} from "node:http";
import {isIP} from "node:net";

/** The failure codes the database accepts from an acquisition attempt. */
export type MarketFetchFailureCode = "host_not_allowed" | "redirect_not_allowed" | "private_address" | "http_status" | "too_large"
 | "content_type" | "timeout" | "network";
export class MarketFetchError extends Error {
 constructor(readonly code: MarketFetchFailureCode, readonly retryable: boolean, detail?: string) {
  super(detail ? `${code}: ${detail}` : code); this.name = "MarketFetchError";
 }
}

export type MarketExtension = "json" | "csv" | "zip" | "xml" | "pdf" | "txt" | "html";
export type MarketFetchRequest = {url: string; allowedHosts: readonly string[]; extension: MarketExtension; maxBytes: number};
export type MarketFetchResult = {finalUrl: string; bytes: Buffer; sha256: string; md5: string; byteSize: number; contentType: string; acquiredAt: Date};

/** One HTTPS exchange to a host already resolved to a vetted address: the caller never lets the network choose another. */
export type PinnedRequest = (url: URL, address: string, family: 4 | 6, signal: AbortSignal) => Promise<IncomingMessage>;
export type ResolveHost = (hostname: string) => Promise<{address: string; family: 4 | 6}[]>;
export type MarketFetchDeps = {resolve?: ResolveHost; request?: PinnedRequest; now?: () => Date; timeoutMs?: number; maxRedirects?: number};

/** The single content type stored for each extension, and the declared types a server may use for it. */
const storedType: Record<MarketExtension, string> = {json: "application/json", csv: "text/csv", zip: "application/zip", xml: "application/xml",
 pdf: "application/pdf", txt: "text/plain", html: "text/html"};
const acceptedTypes: Record<MarketExtension, readonly string[]> = {
 json: ["application/json", "text/json"],
 csv: ["text/csv", "application/csv", "text/plain"],
 zip: ["application/zip", "application/x-zip-compressed", "application/octet-stream"],
 xml: ["application/xml", "text/xml"],
 pdf: ["application/pdf"],
 txt: ["text/plain"],
 html: ["text/html"],
};

/**
 * Fetches one public file under the source's own hosts. Every hop is checked before any byte moves:
 * https on port 443, no user information, a host from the list, and every DNS answer public; the
 * connection then goes to the vetted address only, so a second resolution cannot redirect it. A
 * redirect is followed manually and checked the same way. The body is streamed under the byte limit
 * and both digests are taken from the bytes that will be stored.
 */
export async function fetchMarketFile(request: MarketFetchRequest, deps: MarketFetchDeps = {}): Promise<MarketFetchResult> {
 const resolve = deps.resolve ?? defaultResolve;
 const send = deps.request ?? defaultPinnedRequest;
 const now = deps.now ?? (() => new Date());
 const maxRedirects = deps.maxRedirects ?? 3;
 const signal = AbortSignal.timeout(deps.timeoutMs ?? 60_000);
 const hosts = new Set(request.allowedHosts.map((host) => host.toLowerCase()));
 let url = vetUrl(request.url, hosts, "host_not_allowed");
 try {
  for (let hop = 0; ; hop++) {
   const {address, family} = await vetAddress(url.hostname, resolve);
   const response = await send(url, address, family, signal);
   const status = response.statusCode ?? 0;
   if (status >= 300 && status < 400 && response.headers.location) {
    response.resume();
    if (hop >= maxRedirects) throw new MarketFetchError("redirect_not_allowed", false, "too many redirects");
    url = vetUrl(new URL(response.headers.location, url).toString(), hosts, "redirect_not_allowed");
    continue;
   }
   if (status !== 200) {
    response.resume();
    throw new MarketFetchError("http_status", status >= 500 || status === 429, String(status));
   }
   const declared = String(response.headers["content-type"] ?? "").split(";")[0]!.trim().toLowerCase();
   if (!acceptedTypes[request.extension].includes(declared)) { response.resume(); throw new MarketFetchError("content_type", false, declared || "missing"); }
   const length = Number(response.headers["content-length"]);
   if (Number.isFinite(length) && length > request.maxBytes) { response.resume(); throw new MarketFetchError("too_large", false); }
   const bytes = await readCapped(response, request.maxBytes);
   if (bytes.length === 0 || !signatureMatches(request.extension, bytes)) throw new MarketFetchError("content_type", false, "body does not match the extension");
   return {finalUrl: url.toString(), bytes, sha256: digest("sha256", bytes), md5: digest("md5", bytes), byteSize: bytes.length,
    contentType: storedType[request.extension], acquiredAt: now()};
  }
 } catch (error) {
  if (error instanceof MarketFetchError) throw error;
  if (signal.aborted) throw new MarketFetchError("timeout", true);
  throw new MarketFetchError("network", true);
 }
}

function vetUrl(raw: string, hosts: Set<string>, code: "host_not_allowed" | "redirect_not_allowed"): URL {
 let url: URL;
 try { url = new URL(raw); } catch { throw new MarketFetchError(code, false, "invalid URL"); }
 if (url.protocol !== "https:" || url.username || url.password || (url.port !== "" && url.port !== "443") || !hosts.has(url.hostname)) {
  throw new MarketFetchError(code, false, url.hostname);
 }
 url.hash = "";
 return url;
}

async function vetAddress(hostname: string, resolve: ResolveHost): Promise<{address: string; family: 4 | 6}> {
 if (isIP(hostname) !== 0) throw new MarketFetchError("private_address", false, "literal address");
 let answers: {address: string; family: 4 | 6}[];
 try { answers = await resolve(hostname); } catch { throw new MarketFetchError("network", true, "dns"); }
 if (answers.length === 0 || answers.some((a) => !isPublicAddress(a.address))) throw new MarketFetchError("private_address", false, hostname);
 return answers[0]!;
}

/** True only for globally routable unicast addresses. */
export function isPublicAddress(address: string): boolean {
 const kind = isIP(address);
 if (kind === 4) {
  const [a = 0, b = 0, c = 0] = address.split(".").map(Number);
  return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254)
   || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 192 && b === 0 && (c === 0 || c === 2))
   || (a === 192 && b === 88 && c === 99) || (a === 198 && (b === 18 || b === 19)) || (a === 198 && b === 51 && c === 100)
   || (a === 203 && b === 0 && c === 113));
 }
 if (kind === 6) {
  const v = address.toLowerCase();
  if (v.startsWith("::ffff:")) return isPublicAddress(v.slice(7));
  if (v === "::" || v === "::1" || v.startsWith("64:ff9b:") || v.startsWith("2001:db8") || v.startsWith("2002:") || v.startsWith("2001:0:")) return false;
  return /^[23]/.test(v);
 }
 return false;
}

async function readCapped(response: IncomingMessage, maxBytes: number): Promise<Buffer> {
 const chunks: Buffer[] = [];
 let total = 0;
 for await (const chunk of response) {
  const buffer = chunk as Buffer;
  total += buffer.length;
  if (total > maxBytes) { response.destroy(); throw new MarketFetchError("too_large", false); }
  chunks.push(buffer);
 }
 return Buffer.concat(chunks, total);
}

function signatureMatches(extension: MarketExtension, bytes: Buffer): boolean {
 const head = bytes.subarray(0, 1024).toString("latin1").replace(/^﻿|^\xEF\xBB\xBF/, "").trimStart();
 switch (extension) {
  case "zip": return bytes.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
  case "pdf": return bytes.subarray(0, 5).toString("latin1") === "%PDF-";
  case "json": return head.startsWith("{") || head.startsWith("[");
  case "xml": return head.startsWith("<");
  case "html": return /^<(!doctype html|html|head|body)/i.test(head);
  case "csv": case "txt": return !bytes.subarray(0, 4096).includes(0);
 }
}

function digest(algorithm: "sha256" | "md5", bytes: Buffer): string {
 return createHash(algorithm).update(bytes).digest("hex");
}

async function defaultResolve(hostname: string): Promise<{address: string; family: 4 | 6}[]> {
 return (await lookup(hostname, {all: true, verbatim: true})).map((entry) => ({address: entry.address, family: entry.family === 6 ? 6 : 4}));
}

/** HTTPS to the vetted address, with the host name kept for SNI, certificate validation and the Host header. */
const defaultPinnedRequest: PinnedRequest = (url, address, family, signal) => new Promise((resolve, reject) => {
 const req = httpsRequest({protocol: "https:", hostname: url.hostname, servername: url.hostname, port: 443, path: `${url.pathname}${url.search}`,
  method: "GET", signal, headers: {"accept": "*/*", "accept-encoding": "identity", "user-agent": "Offroad market reference (+https://offroad.capital)"},
  // Node may ask for every address (autoSelectFamily); either way it receives the vetted one only.
  lookup: ((_host: string, options: {all?: boolean}, callback: (...args: unknown[]) => void) =>
   options?.all ? callback(null, [{address, family}]) : callback(null, address, family)) as never}, resolve);
 req.on("error", reject);
 req.end();
});
