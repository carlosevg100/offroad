import {z} from "zod";
import {artifactReviewContextSchema} from "./institutional-review";
import {materialPackageReviewBasisSchema} from "./material-package-review";

const reviewSchema = artifactReviewContextSchema.extend({
  artifact: z.strictObject({id: z.uuid(), workId: z.uuid(), kind: z.literal("work_product"), subject: z.literal("Material production package")}),
  release: z.enum(["internal", "blocked"]),
});
export const materialPackageReviewContextSchema = materialPackageReviewBasisSchema.extend({review: reviewSchema});
export type MaterialPackageReviewContext = z.infer<typeof materialPackageReviewContextSchema>;

/** Resolve the exact human review basis; permanent metadata never supplies substance. */
export function parseMaterialPackageReviewContext(value: unknown, expected: {
  workId: string; revisionId: string; recipeId: string; bundleFingerprint: string; materialObjectId: string;
}): MaterialPackageReviewContext | null {
  const parsed = materialPackageReviewContextSchema.safeParse(value);
  if (!parsed.success) return null;
  const b = parsed.data, r = b.review;
  if (b.workId !== expected.workId || b.revisionId !== expected.revisionId || b.recipeId !== expected.recipeId
    || b.bundleFingerprint !== expected.bundleFingerprint || b.materialObjectId !== expected.materialObjectId
    || r.artifact.workId !== b.workId || r.revisionId !== b.revisionId || r.snapshot.revision.id !== b.revisionId
    || r.snapshot.revision.manifestFingerprint !== b.manifestFingerprint || r.snapshot.revision.audience !== "internal"
    || r.preparedBy !== b.preparedBy || r.freshness !== "current"
    || new Set(b.activeApprovalReviewIds).size !== b.activeApprovalReviewIds.length
    || b.activeApprovalReviewIds.some(id => !r.reviews.some(v => v.id === id && (v.act === "approve" || v.act === "reaffirm")
      && v.target.revisionId === b.revisionId && v.target.workId === b.workId
      && v.target.artifactId === r.artifact.id && v.target.manifestFingerprint === b.manifestFingerprint && v.target.audience === "internal"))) return null;
  return b;
}
