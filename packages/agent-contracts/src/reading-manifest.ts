import {readingStrategySchema} from "@offroad/work-plan";
import {z} from "zod";

/**
 * Retrieval answers "which passages look relevant". Credit work often has to answer a different
 * question: was everything material examined? The reading manifest is the task's own account of
 * what it read and what it did not, so completeness is a fact on the record and not an
 * impression left by a confident paragraph.
 */
export const pageRangeSchema = z.object({
  from: z.number().int().min(1),
  to: z.number().int().min(1),
}).refine((range) => range.to >= range.from, {message: "a page range ends at or after its start"});

export const readingManifestFileSchema = z.object({
  documentId: z.string().uuid(),
  documentVersion: z.number().int().min(1),
  pagesTotal: z.number().int().min(0).nullable(),
  /** Empty with `exhaustive: true` means the whole document, whatever its page count. */
  pagesCovered: z.array(pageRangeSchema).max(500),
  exhaustive: z.boolean(),
  /** Sheets, tables or clauses read, for documents where a page is not the natural unit. */
  sectionsCovered: z.array(z.string().max(120)).max(500),
});

export const readingManifestSchema = z.object({
  schemaVersion: z.literal("reading-manifest.v1"),
  taskSpecId: z.string().regex(/^[A-Z][0-9]{2}$/),
  strategies: z.array(readingStrategySchema).min(1),
  files: z.array(readingManifestFileSchema).max(1000),
  periodsCovered: z.array(z.string().max(40)).max(200),
  dimensionsCovered: z.array(z.string().max(120)).max(200),
  dimensionsNotCovered: z.array(z.object({key: z.string().max(120), reason: z.string().max(300)})).max(200),
  /** Complete: every declared file and dimension examined. Selective: the strategy sampled. */
  completeness: z.enum(["complete", "partial", "selective"]),
}).superRefine((manifest, ctx) => {
  if (manifest.strategies.includes("exhaustive_corpus") && manifest.files.some((file) => !file.exhaustive)) {
    ctx.addIssue({code: z.ZodIssueCode.custom, message: "an exhaustive strategy cannot leave a file partially read"});
  }
  if (manifest.completeness === "complete" && manifest.dimensionsNotCovered.length > 0) {
    ctx.addIssue({code: z.ZodIssueCode.custom, message: "a complete manifest has no uncovered dimension"});
  }
});
export type ReadingManifest = z.infer<typeof readingManifestSchema>;

/**
 * What a manifest still owes. A task that declared exhaustive reading and covered only part of
 * a file, or left a dimension out without a reason, has not finished; it has stopped.
 */
export function readingDebts(manifest: ReadingManifest): string[] {
  const debts: string[] = [];
  for (const file of manifest.files) {
    if (file.exhaustive) continue;
    if (file.pagesTotal !== null && file.pagesCovered.length === 0 && file.sectionsCovered.length === 0) {
      debts.push(`${file.documentId}@${file.documentVersion}: nothing read`);
    }
  }
  for (const gap of manifest.dimensionsNotCovered) {
    if (!gap.reason.trim()) debts.push(`${gap.key}: not covered without a reason`);
  }
  return debts;
}
