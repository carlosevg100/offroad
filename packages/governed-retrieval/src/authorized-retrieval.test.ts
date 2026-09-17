import {describe,expect,it,vi} from "vitest";
import {retrieveGoverned} from "./retrieve";
const request={jobId:"a7770000-0000-4000-9000-000000000001",capability:"c".repeat(64),query:"debt capacity"};
const empty={playbook_version:null,results:[],abstained:true};
describe("authorized production retrieval",()=>{
 it("uses the capability-bound SQL RPC without caller-supplied tenant or chunks",async()=>{
  const call=vi.fn().mockResolvedValue(empty);
  expect(await retrieveGoverned(request,call)).toEqual(empty);
  expect(call).toHaveBeenCalledWith("worker_load_retrieval_context",{p_job_id:request.jobId,p_capability_token:request.capability,p_query:request.query,p_allowed_fund_ids:[],p_precedent_purpose:null,p_limit:20});
 });
 it("propagates authorization denial without returning cached passages",async()=>{
  await expect(retrieveGoverned(request,async()=>{throw new Error("source_rights_denied");})).rejects.toThrow("source_rights_denied");
 });
 it("rejects an oversized query before contacting the database",async()=>{
  const call=vi.fn();await expect(retrieveGoverned({...request,query:"a".repeat(2001)},call)).rejects.toThrow();expect(call).not.toHaveBeenCalled();
 });
 it("rejects malformed or inconsistent responses instead of claiming abstention",async()=>{
  await expect(retrieveGoverned(request,async()=>({...empty,abstained:false}))).rejects.toThrow();
  await expect(retrieveGoverned(request,async()=>({results:"hidden"}))).rejects.toThrow();
 });
 it("preserves permitted SQL citations and scores without reranking",async()=>{
  const result={playbook_version:"v1",results:[{source:"case",id:"chunk",content:"Synthetic authorized passage",citation:{key:"source:1",label:"Synthetic source",anchor:{page:1}},score:0.4}],abstained:false};
  expect(await retrieveGoverned(request,async()=>result)).toEqual(result);
 });
});
