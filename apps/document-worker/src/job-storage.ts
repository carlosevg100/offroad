import type {SupabaseClient} from "@supabase/supabase-js";
import {z} from "zod";
import type {DocumentJob} from "./queue";

const storageScope = z.object({
  source_bucket: z.literal("opportunity-documents"),
  source_path: z.string().min(1),
  layer_bucket: z.literal("document-layers"),
  layer_path: z.string().min(1),
});

/** Uses the signed-in worker account; every Storage operation rechecks the leased job. */
export function createJobStorageClient(supabase: SupabaseClient) {
  const authorize = async (job: DocumentJob) => {
    const result = await supabase.rpc("worker_authorize_document_storage_v1", {
      p_job_id: job.job_id,
      p_capability_token: job.capability_token,
    });
    if (result.error) throw new Error("document storage authorization denied");
    return storageScope.parse(result.data);
  };
  return {
    async download(job: DocumentJob): Promise<Uint8Array> {
      const scope = await authorize(job);
      const result = await supabase.storage.from(scope.source_bucket).download(scope.source_path);
      if (result.error || !result.data) throw new Error("document storage read denied");
      // Do not hand bytes to a parser if access changed while they were in transit.
      await authorize(job);
      return new Uint8Array(await result.data.arrayBuffer());
    },
    async uploadLayer(job: DocumentJob, body: Uint8Array): Promise<void> {
      const scope = await authorize(job);
      const result = await supabase.storage.from(scope.layer_bucket).upload(scope.layer_path, Buffer.from(body), {
        contentType: "application/json", upsert: true,
      });
      if (result.error) throw new Error("document layer storage write denied");
      await authorize(job);
    },
  };
}
