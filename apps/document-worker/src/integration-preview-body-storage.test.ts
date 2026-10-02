/** Unit transport ports only; actual RLS, Storage and broker are CI prerequisites. */
import {createHash,randomUUID} from "node:crypto";
import {describe,it,expect,vi} from "vitest";
import type {SupabaseClient} from "@supabase/supabase-js";
import {createPreviewBodyStorage} from "./integration-preview-body-storage";
function setup(mode:"ok"|"badCanonical"|"badRead"|"replay"|"changedScope"="ok"){
 const bytes=Buffer.from('{"synthetic": true}'),org=randomUUID(),allocationId=randomUUID(),objectId=randomUUID(),retainedId=randomUUID();
 const base={schemaVersion:"capital-retained-body.v1",retentionState:"allocated",allocationId,retainedPayloadId:null,bodyBasisId:randomUUID(),bucket:"capital-input-capture",path:`${org}/${allocationId}/payload.json`,payloadFingerprint:createHash("sha256").update(bytes).digest("hex"),byteLength:bytes.length,storageObjectId:null,storageVersion:null,retainedAt:"2026-10-02T00:00:00Z",uploadExpiresAt:"2026-10-02T01:00:00Z",expiresAt:"2026-10-03T00:00:00Z",purgeAt:"2026-10-02T23:00:00Z",replayed:false};
 const retained={...base,retentionState:"retained",retainedPayloadId:retainedId,storageObjectId:objectId,storageVersion:"unit-physical-version"};
 let reads=0;const upload=vi.fn(async()=>({error:null}));
 const rpc=vi.fn(async(name:string)=>{if(name==="worker_prepare_capital_preview_body_v1")return{error:null,data:{...(mode==="replay"?retained:base),canonicalBody:mode==="badCanonical"?'{}':bytes.toString()}};
  if(name==="worker_commit_capital_preview_body_v1")return{error:null,data:retained};if(name==="worker_read_capital_preview_allocation_v1"){reads++;return{error:null,data:mode==="changedScope"&&reads>1?{...retained,storageVersion:"changed"}:retained};}throw Error("unexpected RPC");});
 const client={rpc,storage:{from:()=>({upload})}}as unknown as SupabaseClient;
 const reader={read:vi.fn(async()=>({bytes:mode==="badRead"?Buffer.from("corrupted"):bytes,objectId,version:"unit-physical-version"}))};
 const store=createPreviewBodyStorage(client,reader,()=>Date.parse("2026-10-02T00:30:00Z"));
 return{run:()=>store.retain({jobId:randomUUID(),capabilityToken:"unit-only"},{runId:randomUUID(),requestId:randomUUID(),kind:"context",body:{}}),rpc,upload,reader,retained};
}
describe("preview closed physical writer / unit ports",()=>{
 it("uploads only SQL canonical bytes and verifies physical proof before returning",async()=>{const f=setup();expect(await f.run()).toEqual(f.retained);expect(f.upload).toHaveBeenCalledOnce();expect(f.reader.read).toHaveBeenCalledTimes(2);expect(f.rpc.mock.calls.map(c=>c[0])).toEqual(["worker_prepare_capital_preview_body_v1","worker_commit_capital_preview_body_v1","worker_read_capital_preview_allocation_v1","worker_read_capital_preview_allocation_v1"]);});
 it("lost-response replay rechecks physical bytes without an upload or a second commit",async()=>{const f=setup("replay");await f.run();expect(f.upload).not.toHaveBeenCalled();expect(f.rpc.mock.calls.some(c=>c[0]==="worker_commit_capital_preview_body_v1")).toBe(false);});
 it.each(["badCanonical","badRead","changedScope"]as const)("denies %s without returning a retained body",async mode=>{const f=setup(mode);await expect(f.run()).rejects.toThrow();if(mode==="badCanonical")expect(f.upload).not.toHaveBeenCalled();});
});
