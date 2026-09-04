/**
 * Freezes the public sources of a gold case.
 *
 *   pnpm --filter @offroad/evals source-pack:build <manifest.json> <output-dir>
 *
 * The manifest lists what the case is allowed to know: id, topic, title, URL, as-of date, version,
 * licence and country per item. This is the only moment a case touches the network. Every
 * retainable item is fetched once, hashed and stored under the output directory; the resulting
 * `source-pack.json` is what the worker reads in frozen mode and what the generalist baseline
 * receives. Items whose licence forbids retention enter the pack as consulted references with
 * no bytes, and items marked `pending` are skipped with a warning until their link is confirmed.
 */
import {mkdirSync, readFileSync, writeFileSync} from "node:fs";
import {join, resolve} from "node:path";

import {
  createDirectPublicContentAcquirer,
  sha256Hex,
  sourcePackEntryFromAcquisition,
  sourcePackSchema,
  type SourcePackEntry,
} from "@offroad/public-research";
import {z} from "zod";

const manifestSchema = z.object({
  caseId: z.string().min(1),
  subject: z.object({legalName: z.string().min(2), website: z.string().url().optional(), sector: z.string().optional(), geography: z.string().optional()}),
  items: z.array(z.object({
    id: z.string().regex(/^[a-z0-9][a-z0-9_-]{1,79}$/),
    topic: z.enum(["identity", "news", "sector", "regulation", "market"]),
    title: z.string().min(1),
    url: z.string().url(),
    asOfDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    version: z.string().min(1),
    licence: z.object({policy: z.enum(["public_reusable", "licensed_reusable_within_contract", "manual_only", "no_retention"]), note: z.string().optional()}),
    country: z.string().regex(/^[A-Z]{2}$/).optional(),
    pending: z.boolean().default(false),
    note: z.string().optional(),
  })).min(1),
});

const extensionFor = (contentType: string): string => {
  if (/pdf/i.test(contentType)) return "pdf";
  if (/zip/i.test(contentType)) return "zip";
  if (/csv/i.test(contentType)) return "csv";
  if (/json/i.test(contentType)) return "json";
  if (/xml/i.test(contentType)) return "xml";
  if (/html/i.test(contentType)) return "html";
  return "bin";
};

async function main(): Promise<void> {
  const [manifestPath, outputDir] = process.argv.slice(2);
  if (!manifestPath || !outputDir) {
    console.error("usage: build-source-pack <manifest.json> <output-dir>");
    process.exit(2);
  }
  const manifest = manifestSchema.parse(JSON.parse(readFileSync(resolve(manifestPath), "utf8")));
  const root = resolve(outputDir);
  mkdirSync(root, {recursive: true});
  const acquire = createDirectPublicContentAcquirer();
  const now = new Date().toISOString();
  const entries: SourcePackEntry[] = [];
  const failures: string[] = [];

  for (const item of manifest.items) {
    if (item.pending) {
      console.warn(`skip ${item.id}: pending (${item.note ?? "link to confirm"})`);
      continue;
    }
    const retainable = item.licence.policy === "public_reusable" || item.licence.policy === "licensed_reusable_within_contract";
    if (!retainable) {
      // Consulted, never fetched by a script: the licence decides, not the convenience.
      entries.push({
        id: item.id, topic: item.topic, title: item.title, url: item.url, finalUrl: item.url,
        acquiredAt: now, asOfDate: item.asOfDate, version: item.version,
        sha256: sha256Hex(""), byteSize: 0, contentType: "manual", publisherSourceId: null,
        licence: item.licence, path: null, ...(item.country ? {country: item.country} : {}),
      });
      console.log(`reference ${item.id}: ${item.licence.policy}, no bytes retained`);
      continue;
    }
    try {
      const acquired = await acquire({url: item.url});
      const file = `${item.id}.${extensionFor(acquired.lineage.contentType)}`;
      const bytes = typeof acquired.content === "string" ? Buffer.from(acquired.content) : Buffer.from(acquired.content);
      writeFileSync(join(root, file), bytes);
      entries.push(sourcePackEntryFromAcquisition({
        id: item.id, topic: item.topic, title: item.title, asOfDate: item.asOfDate, version: item.version,
        licence: item.licence, acquired, path: file, ...(item.country ? {country: item.country} : {}),
      }));
      console.log(`acquired ${item.id}: ${bytes.byteLength} bytes, ${acquired.lineage.contentType}`);
    } catch (error) {
      failures.push(`${item.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const pack = sourcePackSchema.parse({
    schemaVersion: "source-pack.v1",
    caseId: manifest.caseId,
    subject: manifest.subject,
    frozenAt: now,
    entries,
  });
  writeFileSync(join(root, "source-pack.json"), JSON.stringify(pack, null, 2) + "\n");
  console.log(`source pack written: ${entries.length} entries at ${root}`);
  if (failures.length > 0) {
    console.error(`failed to acquire ${failures.length} item(s):\n  ${failures.join("\n  ")}`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
