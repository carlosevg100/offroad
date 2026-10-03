import "server-only";

import {companyDebtDiagnosticArtifactSchema, type CompanyDebtDiagnosticArtifact} from "@offroad/domain-contracts";
import {loadCapitalProjectReviewBasis, type CapitalProjectReviewBasis} from "./capital-project-review";

import {createHash} from "node:crypto";
import type {SupabaseClient} from "@supabase/supabase-js";
import {z} from "zod";

import type {Database} from "@/types/database";

const uuid = z.uuid();
export const capitalDebtProjectionSchema = z.strictObject({
  schemaVersion: z.literal("capital-debt-projection.v1"),
  revisionId: uuid,
  recipeId: uuid,
  finalFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  physicalSha256: z.string().regex(/^[a-f0-9]{64}$/),
  byteLength: z.number().int().min(1).max(1048576),
});

export function isCapitalDebtProjection(value: unknown): boolean {
  return !!value && typeof value === "object" && !Array.isArray(value)
    && (value as Record<string, unknown>).schemaVersion === "capital-debt-projection.v1";
}

export type CapitalDebtReadResult =
  | {ok: true; content: CompanyDebtDiagnosticArtifact; revisionId: string; recipeId: string; finalFingerprint: string}
  | {ok: false; error: "capital_debt_result_withheld"};

/** Human read under the current workspace and JWT, including after the job lease ends.
 * The Edge reader checks authority before and after reading the exact Storage version.
 * No path, allocation, capability, service key or legacy body is a read fallback.
 * The caller parses the verified JSON with the product contract before rendering it.
 */
export async function readCapitalDebtResult(supabase: SupabaseClient<Database>, input: {
  organizationId: string; projection: unknown;
}): Promise<CapitalDebtReadResult> {
  const withheld = {ok: false, error: "capital_debt_result_withheld"} as const;
  const parsed = capitalDebtProjectionSchema.safeParse(input.projection);
  if (!parsed.success || !uuid.safeParse(input.organizationId).success) return withheld;
  const projection = parsed.data;
  try {
    const result = await supabase.functions.invoke("capital-body-read", {
      method: "POST", body: {kind: "debt_result", revisionId: projection.revisionId},
      headers: {"x-offroad-workspace": input.organizationId}, timeout: 10000,
    });
    if (result.error || !(result.data instanceof Blob) || !result.response) return withheld;
    const headers = result.response.headers;
    if (headers.get("content-type") !== "application/octet-stream"
      || !headers.get("cache-control")?.split(",").some(value => value.trim() === "no-store")
      || headers.get("x-offroad-revision-id") !== projection.revisionId
      || headers.get("x-offroad-recipe-id") !== projection.recipeId
      || headers.get("x-offroad-final-fingerprint") !== projection.finalFingerprint
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
      || (content as Record<string, unknown>).schemaVersion !== "company-debt-diagnostic.v1") return withheld;
    const product = companyDebtDiagnosticArtifactSchema.safeParse(content);
    if (!product.success) return withheld;
    return {ok: true, content: product.data, revisionId: projection.revisionId, recipeId: projection.recipeId,
      finalFingerprint: projection.finalFingerprint};
  } catch {return withheld;}
}

/** Bind the displayed physical product to the exact current human review target.
 * A denied or malformed native projection never falls back to an inline body. */
export async function loadCapitalDebtNativeResult(supabase: SupabaseClient<Database>, input: {
 organizationId:string; workId:string; artifact:{id:string; artifact_fingerprint:string; content:unknown};
}):Promise<{ok:true;content:CompanyDebtDiagnosticArtifact;review:CapitalProjectReviewBasis}|{ok:false;error:"capital_debt_result_withheld"}> {
 const withheld={ok:false,error:"capital_debt_result_withheld"} as const;
 if(!uuid.safeParse(input.workId).success || !uuid.safeParse(input.artifact.id).success
  || !/^[a-f0-9]{64}$/.test(input.artifact.artifact_fingerprint))return withheld;
 const result=await readCapitalDebtResult(supabase,{organizationId:input.organizationId,projection:input.artifact.content});
 if(!result.ok)return withheld;
 // The same exact revision is reauthorized after physical hydration; denied
 // review authority also withholds the result from this human command surface.
 try {
  const review=await loadCapitalProjectReviewBasis(supabase,input.workId,input.artifact.id,result.revisionId);
  if(!review || review.artifactFingerprint!==input.artifact.artifact_fingerprint
   || review.artifactType!=="company_debt_diagnostic" || ["stale","superseded"].includes(review.status))return withheld;
  return {ok:true,content:result.content,review};
 } catch {return withheld;}
}
