import {createHash} from "node:crypto";
import type {SupabaseClient} from "@supabase/supabase-js";
import {z} from "zod";
import {sleep} from "./sleep";
const claim = z.discriminatedUnion("claimed",[
 z.object({claimed:z.literal(false),remaining:z.number().int().nonnegative()}),
 z.object({claimed:z.literal(true),id:z.uuid(),bucket:z.enum(["opportunity-documents","document-layers","case-artifacts","brand-templates"]),old_path:z.string().min(1),new_path:z.string().min(1),capability:z.string().min(32),sha256:z.string().nullable(),byte_length:z.number().nullable()}),
]);
/** Narrow migration maintenance: bytes never leave authenticated Storage and this process. */
export async function rotateLegacyStorage(supabase: SupabaseClient, workerToken: string, completed: () => void) {
 for (;;) {
  const response = await supabase.rpc("claim_storage_rotation_v1",{p_worker_token:workerToken});
  if (response.error) throw new Error("storage rotation claim denied");
  const item = claim.parse(response.data);
  if (!item.claimed) {
   if (item.remaining===0) return;
   await sleep(1000); continue;
  }
  const bucket = supabase.storage.from(item.bucket);
  const record = async (sha: string, size: number, complete: boolean) => {
   const result = await supabase.rpc("record_storage_rotation_v1",{p_rotation_id:item.id,p_capability:item.capability,p_sha256:sha,p_byte_length:size,p_complete:complete});
   if (result.error) throw new Error("storage rotation integrity or authority check failed");
  };
  const source = await bucket.download(item.old_path);
  let digest = item.sha256;
  let size = item.byte_length;
  if (!source.error && source.data) {
   const bytes = new Uint8Array(await source.data.arrayBuffer());
   digest = createHash("sha256").update(bytes).digest("hex");size=bytes.byteLength;
   // Persist the pre-move digest so an interrupted operation can resume safely.
   await record(digest,size,false);
   const moved = await bucket.move(item.old_path,item.new_path);
   if (moved.error) throw new Error("storage rotation move failed");
  } else if (!digest || size===null) {
   throw new Error("storage rotation source unavailable without integrity receipt");
  }
  const destination = await bucket.download(item.new_path);
  if (destination.error || !destination.data) throw new Error("storage rotation destination unavailable");
  const verified = new Uint8Array(await destination.data.arrayBuffer());
  const verifiedDigest = createHash("sha256").update(verified).digest("hex");
  if (verifiedDigest!==digest || verified.byteLength!==size) throw new Error("storage rotation changed bytes");
  await record(verifiedDigest,verified.byteLength,true);
  completed();
 }
}
