import {z} from "zod";

/** Logical source, exact byte identity and authorized use are distinct identifiers. */
export const sourceVersionReferenceSchema = z.object({
  sourceId: z.uuid(),
  sourceVersionId: z.uuid(),
  organizationId: z.uuid(),
  version: z.number().int().positive(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  byteSize: z.number().int().nonnegative().nullable(),
  verification: z.enum(["legacy_unverified", "pending_verification", "verified"]),
}).strict().superRefine((value, context) => {
  if (value.verification === "verified" && (value.sha256 === null || value.byteSize === null)) {
    context.addIssue({code: "custom", message: "Verified bytes require hash and size"});
  }
});
export type SourceVersionReference = z.infer<typeof sourceVersionReferenceSchema>;

/** A locator is never an access grant; the download RPC checks export before and after I/O. */
export const sourceVersionDownloadSchema = z.object({
  id: z.uuid(),
  bucket_id: z.literal("opportunity-documents"),
  object_path: z.string().min(1),
  original_name: z.string().min(1),
});
