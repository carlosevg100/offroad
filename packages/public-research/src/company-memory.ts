import {createHash} from "node:crypto";
import {z} from "zod";

import {publicResearchSubjectSchema, researchSourceSchema, type PublicResearchSubject, type ResearchSource} from "./contracts";

export const publicCompanyMemoryRecordSchema = z.object({
  schemaVersion: z.literal("public-company-memory.v1"),
  companyKey: z.string().regex(/^[a-f0-9]{64}$/),
  subject: publicResearchSubjectSchema,
  queryIds: z.array(z.string().regex(/^[a-f0-9]{64}$/)).min(1).max(60),
  sources: z.array(researchSourceSchema).min(1).max(120),
  storedAt: z.iso.datetime(),
  validUntil: z.iso.datetime(),
  reusePolicy: z.literal("public_company_sources_only"),
}).strict().superRefine((record, context) => {
  if (Date.parse(record.validUntil) <= Date.parse(record.storedAt)) {
    context.addIssue({code: "custom", path: ["validUntil"], message: "validUntil must be after storedAt"});
  }
  if (record.companyKey !== publicCompanyKey(record.subject)) {
    context.addIssue({code: "custom", path: ["companyKey"], message: "companyKey does not match subject"});
  }
});

export type PublicCompanyMemoryRecord = z.infer<typeof publicCompanyMemoryRecordSchema>;

export type PublicCompanyMemory = {
  load(companyKey: string): Promise<PublicCompanyMemoryRecord | null>;
  store(record: PublicCompanyMemoryRecord): Promise<void>;
};

/** A stable public identity key. Uploaded documents, project text and user data are never inputs. */
export function publicCompanyKey(raw: PublicResearchSubject): string {
  const subject = publicResearchSubjectSchema.parse(raw);
  const name = normalizeIdentity(subject.legalName);
  const geographyOrDomain = subject.geography
    ? `geography:${normalizeIdentity(subject.geography)}`
    : subject.website
      ? `domain:${new URL(subject.website).hostname.toLowerCase().replace(/^www\./, "")}`
      : "geography:global";
  return createHash("sha256").update(`${name}|${geographyOrDomain}`).digest("hex");
}

export function createPublicCompanyMemoryRecord(input: {
  subject: PublicResearchSubject;
  queryIds: readonly string[];
  sources: readonly ResearchSource[];
  previous?: PublicCompanyMemoryRecord | null;
  storedAt: Date;
  ttlHours?: number;
}): PublicCompanyMemoryRecord {
  const subject = publicResearchSubjectSchema.parse(input.subject);
  const companyKey = publicCompanyKey(subject);
  const prior = input.previous?.companyKey === companyKey ? input.previous : null;
  const queryIds = [...new Set([...input.queryIds, ...(prior?.queryIds ?? [])])].slice(0, 60);
  const sources = deduplicateSources([...(prior?.sources ?? []), ...input.sources]).slice(-120);
  const ttlHours = Math.min(24 * 90, Math.max(1, input.ttlHours ?? 24 * 30));
  return publicCompanyMemoryRecordSchema.parse({
    schemaVersion: "public-company-memory.v1",
    companyKey,
    subject,
    queryIds,
    sources,
    storedAt: input.storedAt.toISOString(),
    validUntil: new Date(input.storedAt.getTime() + ttlHours * 3_600_000).toISOString(),
    reusePolicy: "public_company_sources_only",
  });
}

export function selectFreshPublicCompanyMemory(input: {
  subject: PublicResearchSubject;
  record: unknown;
  now: Date;
}): PublicCompanyMemoryRecord | null {
  const parsed = publicCompanyMemoryRecordSchema.safeParse(input.record);
  if (!parsed.success) return null;
  if (parsed.data.companyKey !== publicCompanyKey(input.subject)) return null;
  if (Date.parse(parsed.data.validUntil) <= input.now.getTime()) return null;
  return parsed.data;
}

function deduplicateSources(sources: readonly ResearchSource[]): ResearchSource[] {
  return [...new Map(sources.map((source) => [canonicalUrl(source.url), source])).values()];
}

function canonicalUrl(value: string): string {
  const url = new URL(value);
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) {
    if (key.toLowerCase().startsWith("utm_")) url.searchParams.delete(key);
  }
  url.searchParams.sort();
  return url.toString();
}

function normalizeIdentity(value: string): string {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}
