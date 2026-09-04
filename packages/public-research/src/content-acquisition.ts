import {createHash} from "node:crypto";
import {lookup} from "node:dns/promises";
import {isIP} from "node:net";
import {z} from "zod";

import {classifyDebtSource} from "./source-registry";

export const publicContentLineageSchema = z.object({
  sourceUrl: z.url(),
  finalUrl: z.url(),
  publisherSourceId: z.string().regex(/^[a-z0-9_]+$/).nullable(),
  publisherAuthorityTier: z.number().int().min(1).max(5).nullable(),
  acquiredBy: z.enum(["direct_https", "firecrawl", "source_pack"]),
  retrievedAt: z.iso.datetime(),
  contentType: z.string().min(1).max(200),
  byteSize: z.number().int().nonnegative(),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
});
export type PublicContentLineage = z.infer<typeof publicContentLineageSchema>;

export type AcquiredPublicContent = {
  lineage: PublicContentLineage;
  content: Uint8Array | string;
};

type ResolveHost = (hostname: string) => Promise<string[]>;

/**
 * Regulators' document servers (CVM's ENET among them) label a PDF or a ZIP as text/html. The
 * bytes decide: a declared text or octet-stream type yields to the file signature, so the
 * document keeps its real type in lineage and the stored file gets the right extension.
 */
export function sniffContentType(declared: string, bytes: Uint8Array): string {
  const generic = /^(?:text\/html|text\/plain|application\/octet-stream)(?:;|$)/i.test(declared);
  if (!generic || bytes.byteLength < 4) return declared;
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) return "application/pdf";
  if (bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) return "application/zip";
  return declared;
}

const allowedContentType = /^(?:text\/[a-z0-9.+-]+|application\/(?:pdf|json|xml|xhtml\+xml|octet-stream|zip)|image\/(?:png|jpeg|webp))(?:;|$)/i;

export function createDirectPublicContentAcquirer(input: {
  fetch?: typeof fetch;
  resolveHost?: ResolveHost;
  now?: () => Date;
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
} = {}) {
  const request = input.fetch ?? fetch;
  const resolveHost = input.resolveHost ?? defaultResolveHost;
  const now = input.now ?? (() => new Date());
  const timeoutMs = Math.max(1_000, Math.min(60_000, input.timeoutMs ?? 15_000));
  const maxBytes = Math.max(1_024, Math.min(50_000_000, input.maxBytes ?? 15_000_000));
  const maxRedirects = Math.max(0, Math.min(5, input.maxRedirects ?? 3));
  return async (raw: {url: string; issuerDomains?: readonly string[]}): Promise<AcquiredPublicContent> => {
    const sourceUrl = await assertPublicHttpsUrl(raw.url, resolveHost);
    let current = sourceUrl;
    for (let redirect = 0; redirect <= maxRedirects; redirect += 1) {
      const response = await request(current, {
        method: "GET", redirect: "manual",
        headers: {Accept: "application/pdf,text/html,text/plain,text/csv,application/json,application/xml;q=0.9,*/*;q=0.5"},
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location || redirect === maxRedirects) throw codedError("public_acquisition_redirect_invalid");
        current = await assertPublicHttpsUrl(new URL(location, current).toString(), resolveHost);
        continue;
      }
      if (!response.ok) throw codedError(`public_acquisition_http_${response.status}`);
      const declaredContentType = (response.headers.get("content-type") ?? "application/octet-stream").trim();
      if (!allowedContentType.test(declaredContentType)) throw codedError("public_acquisition_content_type_rejected");
      const declaredLength = Number(response.headers.get("content-length") ?? "0");
      if (Number.isFinite(declaredLength) && declaredLength > maxBytes) throw codedError("public_acquisition_too_large");
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.byteLength > maxBytes) throw codedError("public_acquisition_too_large");
      const contentType = sniffContentType(declaredContentType, bytes);
      const publisher = classifyDebtSource({url: current, ...(raw.issuerDomains ? {issuerDomains: raw.issuerDomains} : {})});
      return {
        lineage: publicContentLineageSchema.parse({
          sourceUrl, finalUrl: current,
          publisherSourceId: publisher?.id ?? null,
          publisherAuthorityTier: publisher?.authorityTier ?? null,
          acquiredBy: "direct_https", retrievedAt: now().toISOString(), contentType,
          byteSize: bytes.byteLength, contentHash: sha256(bytes),
        }),
        content: bytes,
      };
    }
    throw codedError("public_acquisition_redirect_limit");
  };
}

const firecrawlResponseSchema = z.object({
  success: z.boolean(),
  data: z.object({
    markdown: z.string().default(""),
    metadata: z.object({sourceURL: z.url().optional(), url: z.url().optional()}).passthrough().default({}),
  }).optional(),
  error: z.string().optional(),
});

export function createFirecrawlPublicContentAcquirer(input: {
  apiKey: string;
  fetch?: typeof fetch;
  resolveHost?: ResolveHost;
  now?: () => Date;
  timeoutMs?: number;
  zeroDataRetention?: boolean;
}) {
  const apiKey = z.string().trim().min(8).parse(input.apiKey);
  const request = input.fetch ?? fetch;
  const resolveHost = input.resolveHost ?? defaultResolveHost;
  const now = input.now ?? (() => new Date());
  const timeoutMs = Math.max(5_000, Math.min(60_000, input.timeoutMs ?? 30_000));
  return async (raw: {url: string; issuerDomains?: readonly string[]}): Promise<AcquiredPublicContent> => {
    const sourceUrl = await assertPublicHttpsUrl(raw.url, resolveHost);
    const response = await request("https://api.firecrawl.dev/v2/scrape", {
      method: "POST",
      headers: {Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json"},
      body: JSON.stringify({
        url: sourceUrl, formats: ["markdown"], onlyMainContent: false,
        removeBase64Images: true, blockAds: true, timeout: timeoutMs,
        storeInCache: false,
        ...(input.zeroDataRetention ? {zeroDataRetention: true} : {}),
      }),
      signal: AbortSignal.timeout(timeoutMs + 2_000),
    });
    if (!response.ok) throw codedError(`firecrawl_http_${response.status}`);
    const parsed = firecrawlResponseSchema.parse(await response.json());
    if (!parsed.success || !parsed.data?.markdown.trim()) throw codedError("firecrawl_empty_result");
    const finalUrl = parsed.data.metadata.sourceURL ?? parsed.data.metadata.url ?? sourceUrl;
    await assertPublicHttpsUrl(finalUrl, resolveHost);
    const content = parsed.data.markdown;
    const publisher = classifyDebtSource({url: finalUrl, ...(raw.issuerDomains ? {issuerDomains: raw.issuerDomains} : {})});
    return {
      lineage: publicContentLineageSchema.parse({
        sourceUrl, finalUrl,
        publisherSourceId: publisher?.id ?? null,
        publisherAuthorityTier: publisher?.authorityTier ?? null,
        acquiredBy: "firecrawl", retrievedAt: now().toISOString(),
        contentType: "text/markdown; charset=utf-8",
        byteSize: Buffer.byteLength(content, "utf8"), contentHash: sha256(content),
      }),
      content,
    };
  };
}

export async function assertPublicHttpsUrl(rawUrl: string, resolveHost: ResolveHost = defaultResolveHost): Promise<string> {
  let url: URL;
  try { url = new URL(rawUrl); } catch { throw codedError("public_url_invalid"); }
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) {
    throw codedError("public_url_not_https");
  }
  const hostname = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local")) {
    throw codedError("public_url_private_host");
  }
  const addresses = isIP(hostname) ? [hostname] : await resolveHost(hostname);
  if (addresses.length === 0 || addresses.some(isPrivateOrReservedAddress)) {
    throw codedError("public_url_private_address");
  }
  url.hash = "";
  return url.toString();
}

async function defaultResolveHost(hostname: string): Promise<string[]> {
  return (await lookup(hostname, {all: true, verbatim: true})).map((entry) => entry.address);
}

function isPrivateOrReservedAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [a = 0, b = 0] = address.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224
      || (a === 100 && b >= 64 && b <= 127)
      || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && (b === 0 || b === 168))
      || (a === 198 && (b === 18 || b === 19));
  }
  if (isIP(address) === 6) {
    const normalized = address.toLowerCase();
    if (normalized === "::" || normalized === "::1") return true;
    if (/^(?:fc|fd|fe[89ab])/.test(normalized)) return true;
    if (normalized.startsWith("::ffff:")) return isPrivateOrReservedAddress(normalized.slice(7));
  }
  return isIP(address) === 0;
}

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function codedError(code: string): Error & {code: string} {
  return Object.assign(new Error(code), {code});
}
