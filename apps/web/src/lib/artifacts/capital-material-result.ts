import "server-only";

import {createHash} from "node:crypto";
import type {SupabaseClient} from "@supabase/supabase-js";
import {z} from "zod";

import type {Database} from "@/types/database";

const uuid = z.uuid();
export const capitalMaterialProjectionSchema = z.strictObject({
  schemaVersion: z.literal("capital-material-projection.v1"),
  revisionId: uuid,
  recipeId: uuid,
  bundleFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  physicalSha256: z.string().regex(/^[a-f0-9]{64}$/),
  byteLength: z.number().int().min(1).max(1048576),
});

export function isCapitalMaterialProjection(value: unknown): boolean {
  return !!value && typeof value === "object" && !Array.isArray(value)
    && (value as Record<string, unknown>).schemaVersion === "capital-material-projection.v1";
}

export type CapitalMaterialReadResult =
  | {ok: true; content: unknown; revisionId: string; recipeId: string; bundleFingerprint: string}
  | {ok: false; error: "capital_material_result_withheld"};

/** Human read under the current workspace and JWT, including after the job lease ends.
 * The Edge reader checks authority before and after reading the exact Storage version.
 * No path, allocation, capability, service key or legacy body is a read fallback.
 * The caller parses the verified JSON with the product contract before rendering it.
 */
export async function readCapitalMaterialResult(supabase: SupabaseClient<Database>, input: {
  organizationId: string; workId: string; projection: unknown;
}): Promise<CapitalMaterialReadResult> {
  const withheld = {ok: false, error: "capital_material_result_withheld"} as const;
  const parsed = capitalMaterialProjectionSchema.safeParse(input.projection);
  if (!parsed.success || !uuid.safeParse(input.organizationId).success || !uuid.safeParse(input.workId).success) return withheld;
  const projection = parsed.data;
  try {
    const result = await supabase.functions.invoke("capital-body-read", {
      method: "POST", body: {kind: "material_result", revisionId: projection.revisionId},
      headers: {"x-offroad-workspace": input.organizationId}, timeout: 10000,
    });
    if (result.error || !(result.data instanceof Blob) || !result.response) return withheld;
    const headers = result.response.headers;
    if (headers.get("content-type") !== "application/octet-stream"
      || !headers.get("cache-control")?.split(",").some(value => value.trim() === "no-store")
      || headers.get("x-offroad-work-id") !== input.workId
      || headers.get("x-offroad-revision-id") !== projection.revisionId
      || headers.get("x-offroad-recipe-id") !== projection.recipeId
      || headers.get("x-offroad-bundle-fingerprint") !== projection.bundleFingerprint
      || !uuid.safeParse(headers.get("x-offroad-allocation-id")).success
      || !uuid.safeParse(headers.get("x-offroad-object-id")).success
      || !/^[a-zA-Z0-9._-]{1,200}$/.test(headers.get("x-offroad-storage-version") ?? "")
      || headers.get("x-offroad-payload-sha256") !== projection.physicalSha256
      || headers.get("x-offroad-byte-length") !== String(projection.byteLength)
      || result.data.size !== projection.byteLength) return withheld;
    const bytes = new Uint8Array(await result.data.arrayBuffer());
    if (bytes.byteLength !== projection.byteLength
      || createHash("sha256").update(bytes).digest("hex") !== projection.physicalSha256) return withheld;
    const content: unknown = JSON.parse(new TextDecoder("utf-8", {fatal: true}).decode(bytes));
    if (!content || typeof content !== "object" || Array.isArray(content)
      || (content as Record<string, unknown>).schemaVersion !== "2026.08.29-v1") return withheld;
    return {ok: true, content, revisionId: projection.revisionId, recipeId: projection.recipeId,
      bundleFingerprint: projection.bundleFingerprint};
  } catch {return withheld;}
}
