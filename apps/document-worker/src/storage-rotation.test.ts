import {createHash} from "node:crypto";
import type {SupabaseClient} from "@supabase/supabase-js";
import {describe,expect,it,vi} from "vitest";
import {rotateLegacyStorage} from "./storage-rotation";
const sha = createHash("sha256").update("source").digest("hex");
const task = {claimed:true,id:"10000000-0000-4000-8000-000000000001",bucket:"opportunity-documents",old_path:"org/session/old",new_path:"org/session/new",capability:"c".repeat(64),sha256:null as string|null,byte_length:null as number|null};
function fixture(item=task) {
 const items=[item,{claimed:false,remaining:0}];
 const record=vi.fn().mockResolvedValue({error:null});
 const rpc=vi.fn().mockImplementation((name,args)=>name==="claim_storage_rotation_v1"?Promise.resolve({data:items.shift(),error:null}):record(args));
 const download=vi.fn().mockResolvedValue({data:new Blob(["source"]),error:null});
 const move=vi.fn().mockResolvedValue({error:null});
 const from=vi.fn().mockReturnValue({download,move});
 return {client:{rpc,storage:{from}} as unknown as SupabaseClient,rpc,record,download,move,from};
}
describe("legacy storage rotation",()=>{
 it("records the source digest before moving and verifies identical destination bytes",async()=>{
  const f=fixture();const done=vi.fn();await rotateLegacyStorage(f.client,"worker-token",done);
  expect(f.record).toHaveBeenNthCalledWith(1,expect.objectContaining({p_sha256:sha,p_byte_length:6,p_complete:false}));
  expect(f.move).toHaveBeenCalledWith(task.old_path,task.new_path);
  expect(f.record).toHaveBeenNthCalledWith(2,expect.objectContaining({p_sha256:sha,p_byte_length:6,p_complete:true}));expect(done).toHaveBeenCalledOnce();
 });
 it("resumes an interrupted move only against its persisted digest",async()=>{
  const f=fixture({...task,sha256:sha,byte_length:6});f.download.mockResolvedValueOnce({error:{status:404},data:null});
  await rotateLegacyStorage(f.client,"worker-token",vi.fn());expect(f.move).not.toHaveBeenCalled();expect(f.record).toHaveBeenCalledWith(expect.objectContaining({p_complete:true}));
 });
 it("rejects changed destination bytes",async()=>{
  const f=fixture();f.download.mockResolvedValueOnce({data:new Blob(["source"]),error:null}).mockResolvedValueOnce({data:new Blob(["changed"]),error:null});
  await expect(rotateLegacyStorage(f.client,"worker-token",vi.fn())).rejects.toThrow("changed bytes");expect(f.record).toHaveBeenCalledTimes(1);
 });
 it("does not move without a saved integrity and authority receipt",async()=>{
  const f=fixture();f.record.mockResolvedValue({error:{code:"42501"}});
  await expect(rotateLegacyStorage(f.client,"worker-token",vi.fn())).rejects.toThrow("authority check failed");expect(f.move).not.toHaveBeenCalled();
 });
 it("cannot resume a missing source without a digest",async()=>{
  const f=fixture();f.download.mockResolvedValue({error:{status:404},data:null});
  await expect(rotateLegacyStorage(f.client,"worker-token",vi.fn())).rejects.toThrow("without integrity receipt");expect(f.move).not.toHaveBeenCalled();
 });
});
