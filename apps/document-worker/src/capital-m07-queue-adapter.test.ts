/** SDK unit fixtures only. SQL/Storage integration requires the live worker gates. */
import {createHash,randomUUID} from "node:crypto";
import {describe,it,expect,vi} from "vitest";
import type {SupabaseClient} from "@supabase/supabase-js";
import {createCapitalM07QueueAdapter} from "./capital-m07-queue-adapter";
import type {CapitalProjectAnalysisJob} from "./queue";
const transport=vi.hoisted(()=>({read:vi.fn(),deliver:vi.fn()}));
vi.mock("./capital-body-read-client",()=>({readCapitalCaptureBytes:transport.read}));
vi.mock("./capital-public-capture-adapter",()=>({openCapitalPublicCaptureAdapter:async()=>({deliver:transport.deliver})}));
function fixture(){
 const org=randomUUID(),jobId=randomUUID(),workId=randomUUID(),planId=randomUUID(),allocationId=randomUUID(),recipeId=randomUUID();
 const canonicalBody=JSON.stringify({syntheticContext:"only the retained bytes are authoritative"}),bytes=Buffer.from(canonicalBody),digest=createHash("sha256").update(bytes).digest("hex");
 const allocated={schemaVersion:"capital-retained-body.v1",retentionState:"allocated",allocationId,retainedPayloadId:null,bodyBasisId:randomUUID(),bucket:"capital-input-capture",path:`${org}/${allocationId}/payload.json`,
  payloadFingerprint:digest,byteLength:bytes.length,storageObjectId:null,storageVersion:null,retainedAt:"2026-10-02T00:00:00Z",uploadExpiresAt:"2026-10-02T12:30:00Z",expiresAt:"2026-10-03T00:00:00Z",purgeAt:"2026-10-02T23:00:00Z",replayed:false};
 const retained={...allocated,retentionState:"retained",retainedPayloadId:randomUUID(),storageObjectId:randomUUID(),storageVersion:"synthetic-version"};let committed=false;
 transport.read.mockReset();transport.read.mockResolvedValue({bytes,objectId:retained.storageObjectId,version:retained.storageVersion});transport.deliver.mockReset();
 const upload=vi.fn(async(_path:string,_bytes:Uint8Array,_options:unknown)=>({error:null}));const rpc=vi.fn(async(name:string)=>{
  const data=name==="worker_prepare_capital_m07_recipe_v1"?{schemaVersion:"capital-m07-base-context.v1",recipeId,jobId,organizationId:org,workId,planId,planFingerprint:"a".repeat(64),asOfDate:"2026-10-02",locale:"pt-BR",contextFingerprint:digest,canonicalContext:canonicalBody,expiresAt:allocated.expiresAt}
   :name==="worker_prepare_capital_m07_context_v1"?{...allocated,canonicalBody}
   :name==="worker_commit_capital_m07_body_v1"?(committed=true,retained)
   :name==="worker_read_capital_m07_allocation_v1"?(committed?retained:allocated):null;
  return{data,error:null};});
 const client={rpc,storage:{from:()=>({upload})}} as unknown as SupabaseClient;
 const job={job_id:jobId,organization_id:org,capability_token:"synthetic-capability",payload:{capital_project_id:workId,capital_project_plan_id:planId}} as CapitalProjectAnalysisJob;
 return{adapter:createCapitalM07QueueAdapter(client,job,()=>Date.parse("2026-10-02T12:00:00Z")),rpc,upload,retained,allocated,bytes};
}
describe("native M07 SDK adapter with synthetic unit transport",()=>{
 it("retains and rereads the server context before exposing it",async()=>{const f=fixture(),result=await f.adapter.begin();expect(result.context).toEqual({syntheticContext:"only the retained bytes are authoritative"});expect(f.upload).toHaveBeenCalledOnce();expect(f.upload.mock.calls[0]?.[2]).toMatchObject({upsert:false,cacheControl:"0"});expect(transport.read).toHaveBeenCalled();expect(f.rpc.mock.calls.map(call=>call[0])).toContain("worker_commit_capital_m07_body_v1");});
 it("rejects a physical context body differing from the allocation",async()=>{const f=fixture();transport.read.mockResolvedValue({bytes:Buffer.from("different"),objectId:randomUUID(),version:"synthetic"});await expect(f.adapter.begin()).rejects.toThrow("storage_mismatch");expect(f.rpc.mock.calls.map(call=>call[0])).not.toContain("worker_commit_capital_m07_body_v1");});
 it("rejects an absent publication without sending a model or promoting a recipe",async()=>{const f=fixture();await f.adapter.begin();transport.deliver.mockResolvedValue({state:"unresolved",reasons:["publication_missing"]});await expect(f.adapter.captureSources([{provider:"official",topic:"identity",title:"Synthetic",url:"https://example.test/source",snippet:"synthetic",publishedAt:null,retrievedAt:"2026-10-02T00:00:00Z",contentHash:"b".repeat(64)}])).rejects.toMatchObject({code:"capital_m07_published_source_required"});expect(transport.deliver.mock.calls[0]![0]).not.toHaveProperty("origin");expect(f.rpc.mock.calls.map(call=>call[0])).not.toContain("worker_finalize_capital_m07_recipe_v1");expect(f.rpc.mock.calls.map(call=>call[0])).not.toContain("worker_authorize_capital_m07_processing_v1");});
 it("uses retained published payload and its reference without rewriting source identity",async()=>{const f=fixture();await f.adapter.begin();const deliveryId=randomUUID(),retainedPayloadId=randomUUID(),source={provider:"official" as const,topic:"identity" as const,title:"Synthetic",url:"https://example.test/source",snippet:"synthetic",publishedAt:null,retrievedAt:"2026-10-02T00:00:00Z",contentHash:"b".repeat(64)};transport.deliver.mockResolvedValue({state:"retained",deliveryId,retention:{retainedPayloadId},payload:{...source,publishedAt:undefined}});const result=await f.adapter.captureSources([source]);expect(result).toEqual([{deliveryId,retainedPayloadId,source}]);expect(transport.deliver.mock.calls[0]![0].payload).not.toHaveProperty("publishedAt");});
});
