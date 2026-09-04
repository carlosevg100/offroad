import {createHash} from "node:crypto";

import {z} from "zod";

import type {AcquiredPublicContent, PublicContentLineage} from "./content-acquisition";
import {publicResearchSubjectSchema, researchTopicSchema, type PublicSearchProvider, type ResearchQuery, type ResearchSource} from "./contracts";

/**
 * A source pack is the public information a gold case is allowed to know, acquired once and
 * frozen: URL, acquisition date, hash, version, as-of date and licence for every item. A case
 * that ran against the live internet would change whenever a company changed its site, without
 * a commit changing. In frozen mode the pack is the only public source the rail can see, for the
 * product and for the generalist baseline alike, so the alpha measured comes from what the
 * product does with the information and not from what it managed to fetch.
 */
export const sourcePackLicenceSchema = z.object({
  policy: z.enum(["public_reusable", "licensed_reusable_within_contract", "manual_only", "no_retention"]),
  note: z.string().max(300).optional(),
});

export const sourcePackEntrySchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9_-]{1,79}$/),
  topic: researchTopicSchema,
  title: z.string().trim().min(1).max(500),
  url: z.url(),
  finalUrl: z.url(),
  /** When the bytes were fetched. The pack records it so a reviewer knows what "now" meant. */
  acquiredAt: z.iso.datetime(),
  /** The date the information speaks about, e.g. the quarter end of a filing. */
  asOfDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  version: z.string().trim().min(1).max(80),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  byteSize: z.number().int().nonnegative(),
  contentType: z.string().min(1).max(200),
  publisherSourceId: z.string().regex(/^[a-z0-9_]+$/).nullable(),
  licence: sourcePackLicenceSchema,
  /** Relative path of the stored bytes inside the pack directory; absent when retention is not allowed. */
  path: z.string().min(1).max(300).nullable(),
  country: z.string().regex(/^[A-Z]{2}$/).optional(),
}).superRefine((entry, ctx) => {
  const retainable = entry.licence.policy === "public_reusable" || entry.licence.policy === "licensed_reusable_within_contract";
  if (retainable && entry.path === null) {
    ctx.addIssue({code: "custom", message: "a retainable entry stores its bytes"});
  }
  if (!retainable && entry.path !== null) {
    ctx.addIssue({code: "custom", message: "an entry whose licence forbids retention cannot store bytes"});
  }
});
export type SourcePackEntry = z.infer<typeof sourcePackEntrySchema>;

export const sourcePackSchema = z.object({
  schemaVersion: z.literal("source-pack.v1"),
  caseId: z.string().min(1).max(80),
  subject: publicResearchSubjectSchema,
  frozenAt: z.iso.datetime(),
  entries: z.array(sourcePackEntrySchema).max(200),
}).superRefine((pack, ctx) => {
  const ids = new Set<string>();
  for (const entry of pack.entries) {
    if (ids.has(entry.id)) ctx.addIssue({code: "custom", message: `duplicate entry id ${entry.id}`});
    ids.add(entry.id);
  }
});
export type SourcePack = z.infer<typeof sourcePackSchema>;

export type SourcePackReader = (entry: SourcePackEntry) => Promise<Uint8Array>;

export function sha256Hex(bytes: Uint8Array | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function entrySource(entry: SourcePackEntry): ResearchSource {
  return {
    provider: "source_pack",
    title: entry.title,
    url: entry.url,
    snippet: "",
    publishedAt: entry.asOfDate,
    retrievedAt: entry.acquiredAt,
    contentHash: entry.sha256,
    contentAcquisition: {
      acquiredBy: "source_pack",
      finalUrl: entry.finalUrl,
      retrievedAt: entry.acquiredAt,
      byteSize: entry.byteSize,
      contentHash: entry.sha256,
    },
  } as ResearchSource;
}

/**
 * A search provider that only ever answers from the pack. It costs nothing and never reaches the
 * network; a topic the pack does not cover returns nothing, which is the honest answer.
 */
export function createSourcePackProvider(pack: SourcePack): PublicSearchProvider {
  const frozen = sourcePackSchema.parse(pack);
  return {
    id: "source_pack",
    maxCostUsdPerCall: 0,
    async search(query: ResearchQuery): Promise<ResearchSource[]> {
      return frozen.entries
        .filter((entry) => entry.topic === query.topic)
        .filter((entry) => !query.country || !entry.country || entry.country === query.country)
        .filter((entry) => query.domainAllowlist.length === 0
          || query.domainAllowlist.some((domain) => new URL(entry.finalUrl).hostname.endsWith(domain)))
        .map(entrySource);
    },
  } as PublicSearchProvider;
}

/**
 * A content acquirer that serves the pack's stored bytes and refuses everything else. The
 * bytes are hashed on every read; a pack whose files drifted from its manifest is not a pack.
 */
export function createSourcePackAcquirer(pack: SourcePack, read: SourcePackReader) {
  const frozen = sourcePackSchema.parse(pack);
  const byUrl = new Map<string, SourcePackEntry>();
  for (const entry of frozen.entries) {
    byUrl.set(entry.url, entry);
    byUrl.set(entry.finalUrl, entry);
  }
  return async (raw: {url: string}): Promise<AcquiredPublicContent> => {
    const entry = byUrl.get(raw.url);
    if (!entry) throw Object.assign(new Error(`source pack does not contain ${new URL(raw.url).hostname}`), {code: "source_pack_miss"});
    if (entry.path === null) throw Object.assign(new Error(`source pack entry ${entry.id} is not retained`), {code: "source_pack_not_retained"});
    const content = await read(entry);
    const hash = sha256Hex(content);
    if (hash !== entry.sha256) throw Object.assign(new Error(`source pack entry ${entry.id} drifted from its manifest`), {code: "source_pack_drift"});
    const lineage: PublicContentLineage = {
      sourceUrl: entry.url,
      finalUrl: entry.finalUrl,
      publisherSourceId: entry.publisherSourceId,
      publisherAuthorityTier: null,
      acquiredBy: "source_pack",
      retrievedAt: entry.acquiredAt,
      contentType: entry.contentType,
      byteSize: entry.byteSize,
      contentHash: entry.sha256,
    };
    return {lineage, content};
  };
}

export type SourcePackVerification = {
  ok: boolean;
  drifted: string[];
  missing: string[];
  retainedWithoutLicence: string[];
};

/** Every stored file matches its manifest; every unretained entry has no file to match. */
export async function verifySourcePack(pack: SourcePack, read: SourcePackReader): Promise<SourcePackVerification> {
  const frozen = sourcePackSchema.parse(pack);
  const drifted: string[] = [];
  const missing: string[] = [];
  const retainedWithoutLicence: string[] = [];
  for (const entry of frozen.entries) {
    const retainable = entry.licence.policy === "public_reusable" || entry.licence.policy === "licensed_reusable_within_contract";
    if (!retainable) {
      if (entry.path !== null) retainedWithoutLicence.push(entry.id);
      continue;
    }
    let bytes: Uint8Array;
    try {
      bytes = await read(entry);
    } catch {
      missing.push(entry.id);
      continue;
    }
    if (sha256Hex(bytes) !== entry.sha256 || bytes.byteLength !== entry.byteSize) drifted.push(entry.id);
  }
  return {ok: drifted.length === 0 && missing.length === 0 && retainedWithoutLicence.length === 0, drifted, missing, retainedWithoutLicence};
}

/**
 * Builds a pack entry from a live acquisition, once. This is the only moment a case touches the
 * network; everything after it reads the pack.
 */
export function sourcePackEntryFromAcquisition(input: {
  id: string;
  topic: SourcePackEntry["topic"];
  title: string;
  asOfDate: string;
  version: string;
  licence: SourcePackEntry["licence"];
  acquired: AcquiredPublicContent;
  path: string | null;
  country?: string;
}): SourcePackEntry {
  const {lineage, content} = input.acquired;
  return sourcePackEntrySchema.parse({
    id: input.id,
    topic: input.topic,
    title: input.title,
    url: lineage.sourceUrl,
    finalUrl: lineage.finalUrl,
    acquiredAt: lineage.retrievedAt,
    asOfDate: input.asOfDate,
    version: input.version,
    sha256: sha256Hex(content),
    byteSize: typeof content === "string" ? Buffer.byteLength(content) : content.byteLength,
    contentType: lineage.contentType,
    publisherSourceId: lineage.publisherSourceId,
    licence: input.licence,
    path: input.path,
    ...(input.country ? {country: input.country} : {}),
  });
}
