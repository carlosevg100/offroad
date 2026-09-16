import {describe, expect, it, vi} from "vitest";
import type {SupabaseClient} from "@supabase/supabase-js";
import type {DocumentJob} from "./queue";
import {createJobStorageClient} from "./job-storage";
const scope = {source_bucket:"opportunity-documents",source_path:"org/session/document",layer_bucket:"document-layers",layer_path:"org/session/job.json"};
const job = {job_id:"job",capability_token:"capability",payload:{download_url:"https://untrusted.invalid"}} as unknown as DocumentJob;
function fixture() {
 const rpc = vi.fn().mockResolvedValue({data:scope,error:null});
 const download = vi.fn().mockResolvedValue({data:new Blob(["source"]),error:null});
 const upload = vi.fn().mockResolvedValue({error:null});
 const from = vi.fn().mockReturnValue({download,upload});
 const client = createJobStorageClient({rpc,storage:{from}} as unknown as SupabaseClient);
 return {client,rpc,download,upload,from};
}
describe("leased job storage authority",()=>{
 it("uses server-resolved paths instead of payload URLs",async()=>{
  const f=fixture();expect(new TextDecoder().decode(await f.client.download(job))).toBe("source");
  expect(f.download).toHaveBeenCalledWith(scope.source_path);expect(f.rpc).toHaveBeenCalledTimes(2);
 });
 it("does not return bytes when authority is revoked during download",async()=>{
  const f=fixture();f.rpc.mockResolvedValueOnce({data:scope,error:null}).mockResolvedValueOnce({error:{code:"42501"}});
  await expect(f.client.download(job)).rejects.toThrow("authorization denied");
 });
 it("never opens storage after an initial denial",async()=>{
  const f=fixture();f.rpc.mockResolvedValue({error:{code:"42501"}});
  await expect(f.client.download(job)).rejects.toThrow("authorization denied");expect(f.from).not.toHaveBeenCalled();
 });
 it("refuses a scope with another bucket",async()=>{
  const f=fixture();f.rpc.mockResolvedValue({data:{...scope,source_bucket:"other"},error:null});
  await expect(f.client.download(job)).rejects.toThrow();expect(f.from).not.toHaveBeenCalled();
 });
 it("does not report layer success after revocation",async()=>{
  const f=fixture();f.rpc.mockResolvedValueOnce({data:scope,error:null}).mockResolvedValueOnce({error:{code:"42501"}});
  await expect(f.client.uploadLayer(job,new Uint8Array([1]))).rejects.toThrow("authorization denied");
 });
 it("reuses identical layer bytes on retry without enabling overwrite",async()=>{
  const f=fixture();f.upload.mockResolvedValue({error:{statusCode:"409"}});
  await f.client.uploadLayer(job,new TextEncoder().encode("source"));
  expect(f.upload.mock.calls[0]?.[2]).toEqual({contentType:"application/json",upsert:false});
  expect(f.rpc).toHaveBeenCalledTimes(2);
 });
 it("rejects conflicting bytes at an existing layer path",async()=>{
  const f=fixture();f.upload.mockResolvedValue({error:{statusCode:"409"}});
  await expect(f.client.uploadLayer(job,new TextEncoder().encode("different"))).rejects.toThrow("immutable bytes conflict");
 });
 it("rechecks revocation after reading an idempotent layer",async()=>{
  const f=fixture();f.upload.mockResolvedValue({error:{statusCode:"409"}});
  f.rpc.mockResolvedValueOnce({data:scope,error:null}).mockResolvedValueOnce({error:{code:"42501"}});
  await expect(f.client.uploadLayer(job,new TextEncoder().encode("source"))).rejects.toThrow("authorization denied");
 });

});
