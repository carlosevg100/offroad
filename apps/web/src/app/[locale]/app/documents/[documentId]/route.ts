import {z} from "zod";
import {createClient} from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: {params: Promise<{locale: string; documentId: string}>}) {
  const {documentId} = await context.params;
  const headers = {"cache-control": "private, no-store", "x-content-type-options": "nosniff"};
  if (!z.uuid().safeParse(documentId).success) return new Response(null, {status: 404, headers});
  const supabase = await createClient();
  if (!supabase) return new Response(null, {status: 503, headers});
  const identity = await supabase.auth.getClaims();
  if (identity.error || !identity.data?.claims.sub) return new Response(null, {status: 401, headers});
  const document = await supabase.from("source_documents").select("id, bucket_id, object_path, original_name").eq("id", documentId).maybeSingle();
  if (document.error || !document.data) return new Response(null, {status: 404, headers});
  const download = await supabase.storage.from(document.data.bucket_id).download(document.data.object_path);
  if (download.error || !download.data) return new Response(null, {status: 404, headers});
  // A revocation during the storage request must not release the downloaded buffer.
  const current = await supabase.from("source_documents").select("id").eq("id", documentId).maybeSingle();
  if (current.error || !current.data) return new Response(null, {status: 404, headers});
  const name = encodeURIComponent(document.data.original_name).replace(/['()*]/g, (value) => `%${value.charCodeAt(0).toString(16)}`);
  return new Response(await download.data.arrayBuffer(), {headers: {
    ...headers,
    "content-type": "application/octet-stream",
    "content-disposition": `attachment; filename*=UTF-8''${name}`,
    "content-security-policy": "sandbox",
  }});
}
