import type {SupabaseClient} from "@supabase/supabase-js";
import type {MarketObjectStore} from "./process-market-acquisition";

/**
 * The publisher bucket through the worker account's own Storage session. Uploads are single requests
 * that never overwrite, so Storage records the MD5 of the whole object as its eTag; the database
 * compares it at confirmation. Removal goes through the batch route the sweep also uses.
 */
export function createMarketObjectStore(client: SupabaseClient): MarketObjectStore {
 const bucket = () => client.storage.from("market-reference");
 return {
  async upload(path, bytes, contentType) {
   const {error} = await bucket().upload(path, bytes, {contentType, upsert: false});
   if (error) throw new Error("market_object_upload_failed");
  },
  async remove(paths) {
   const {error} = await bucket().remove(paths);
   if (error) throw new Error("market_object_remove_failed");
  },
 };
}
