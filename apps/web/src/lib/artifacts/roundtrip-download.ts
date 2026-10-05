import "server-only";
import {z} from "zod";
import type {SupabaseClient} from "@supabase/supabase-js";
import type {Database} from "@/types/database";
import {artifactImportRpc} from "./artifact-import";
import {importNoStore} from "./artifact-import-request";
/** Runs only after the delivery's own gates. No old download route returns unreceipted bytes. */
export async function serveRoundtripDownload(request: Request, input: {supabase: SupabaseClient<Database>; locale: string; artifactId: string; revisionId: string; format: string; variant: string}) {
  const url = new URL(request.url);
  if (url.searchParams.get("exportContext") === "1") return Response.json({artifactId: input.artifactId, revisionId: input.revisionId, locale: input.locale, format: input.format, variant: input.variant}, {headers: importNoStore});
  const result = await artifactImportRpc(input.supabase)("list_artifact_export_receipts_v1", {p_artifact_id: input.artifactId});
  const parsed = z.object({artifactId: z.uuid(), receipts: z.array(z.object({id: z.uuid(), revisionId: z.uuid(), format: z.string(), locale: z.string(), variant: z.string()}))}).safeParse(result.data);
  if (result.error || !parsed.success || parsed.data.artifactId !== input.artifactId) return Response.json({ok: false}, {status: 403, headers: importNoStore});
  const receipt = parsed.data.receipts.find(receipt => receipt.revisionId === input.revisionId && receipt.format === input.format && receipt.locale === input.locale && receipt.variant === input.variant);
  if (!receipt) return Response.json({ok: false, error: "export_required"}, {status: 409, headers: importNoStore});
  const query = new URLSearchParams({receiptId: receipt.id});
  const workspace = url.searchParams.get("workspace");if (workspace) query.set("workspace", workspace);
  // Next may normalize request.url to its internal listener. Keep the browser origin and cookies.
  const location = `/${input.locale}/app/artifacts/${input.artifactId}/exports?${query}`;
  return new Response(null, {status: 303, headers: {...importNoStore, location}});
}
