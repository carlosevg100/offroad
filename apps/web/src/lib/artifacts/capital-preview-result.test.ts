import {createHash} from "node:crypto";
import {fingerprintJson} from "@offroad/case-understanding";
import {expect,it,vi} from "vitest";
import type {SupabaseClient} from "@supabase/supabase-js";
import type {Database} from "@/types/database";
vi.mock("server-only",()=>({}));
import {readCapitalPreviewResult,resolveCapitalPreviewRows} from "./capital-preview-result";
const id=(n:number)=>`10000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
function fixture(overrides:Record<string,string>={},change?:Record<string,unknown>){
 const body={schemaVersion:"capital-preview-json-body.v1",runId:id(4),taskId:"P01",role:"task_output",artifactType:"preview_debt_ledger",inputFingerprint:"b".repeat(64),content:{output:{state:"complete",ledger_rows:[{balance:12}]}}};
 const text=JSON.stringify(body),sha=createHash("sha256").update(text).digest("hex"),p={schemaVersion:"capital-preview-task-projection.v1",revisionId:id(5),runId:id(4),taskId:"P01",role:"task_output",retainedPayloadId:id(6),semanticFingerprint:fingerprintJson(body),physicalSha256:sha,byteLength:Buffer.byteLength(text)};
 const headers={"content-type":"application/octet-stream","cache-control":"private,no-store","x-offroad-organization-id":id(1),"x-offroad-work-id":id(2),"x-offroad-artifact-id":id(3),"x-offroad-revision-id":id(5),"x-offroad-recipe-id":id(4),"x-offroad-final-fingerprint":p.semanticFingerprint,"x-offroad-payload-sha256":sha,"x-offroad-byte-length":String(p.byteLength),"x-offroad-allocation-id":id(7),"x-offroad-object-id":id(8),"x-offroad-storage-version":"v1",...overrides};
 const invoke=vi.fn().mockResolvedValue({error:null,data:new Blob([change?JSON.stringify({...body,...change}):text]),response:new Response(null,{headers})});
 const basis={projectId:id(2),artifactId:id(3),revisionId:id(5),manifestFingerprint:"c".repeat(64),artifactFingerprint:"d".repeat(64),preparedBy:id(9),viewerId:id(10),workAccess:true,sourceCount:1,status:"draft",approvalActive:false,policy:{assignmentRequired:false,selfApprovalAllowed:false,roles:[]}};
 const rpc=vi.fn().mockResolvedValue({data:basis,error:null});
 return{p,body,invoke,basis,rpc,supabase:{functions:{invoke},rpc}as unknown as SupabaseClient<Database>,input:{organizationId:id(1),workId:id(2),artifactId:id(3),artifactType:"preview_debt_ledger",projection:p}};
}
it("renders only physically verified native preview output",async()=>{const f=fixture();expect(await readCapitalPreviewResult(f.supabase,f.input)).toEqual({ok:true,content:f.body.content});expect(f.invoke).toHaveBeenCalledWith("capital-body-read",{method:"POST",body:{kind:"preview_result",revisionId:id(5)},headers:{"x-offroad-workspace":id(1)},timeout:10000});expect(f.rpc).toHaveBeenCalledTimes(2);expect(f.rpc).toHaveBeenCalledWith("read_capital_project_artifact_review_v2",{p_project_id:id(2),p_artifact_id:id(3),p_revision_id:id(5)});});
for(const k of["x-offroad-organization-id","x-offroad-work-id","x-offroad-artifact-id","x-offroad-revision-id","x-offroad-recipe-id","x-offroad-final-fingerprint","x-offroad-payload-sha256","x-offroad-storage-version","x-offroad-object-id","x-offroad-byte-length"])it(`withholds mismatch ${k}`,async()=>{const f=fixture({[k]:k==="x-offroad-storage-version"?"bad/version":"wrong"});expect(await readCapitalPreviewResult(f.supabase,f.input)).toEqual({ok:false});});
it("never uses projection output as a fallback on denied read",async()=>{const f=fixture();f.invoke.mockResolvedValue({error:new Error("denied"),data:null,response:null});const rows=await resolveCapitalPreviewRows(f.supabase,[{id:id(3),artifact_type:"preview_debt_ledger",schema_version:"capital-preview-task-projection.v1",content:{...f.p,output:{state:"complete"}}}],{organizationId:id(1),workId:id(2)});expect(rows[0].content).toBeNull();expect(rows[0].nativeReadWithheld).toBe(true);expect(f.invoke).not.toHaveBeenCalled();});
it("body marker also closes a mismatched legacy column",async()=>{const f=fixture({"x-offroad-work-id":"wrong"});const rows=await resolveCapitalPreviewRows(f.supabase,[{id:id(3),artifact_type:"preview_debt_ledger",schema_version:"legacy",content:f.p}],{organizationId:id(1),workId:id(2)});expect(rows[0].content).toBeNull();});
it("preserves explicitly nonnative historical rows without a new read",async()=>{const f=fixture();const row={id:id(3),artifact_type:"preview_debt_ledger",schema_version:"preview.v1",content:{output:{state:"complete"}}};expect(await resolveCapitalPreviewRows(f.supabase,[row],{organizationId:id(1),workId:id(2)})).toEqual([row]);expect(f.invoke).not.toHaveBeenCalled();});
it("changed physical bytes fail before JSON display",async()=>{const f=fixture({}, {runId:id(9)});expect(await readCapitalPreviewResult(f.supabase,f.input)).toEqual({ok:false});});
it("wrong semantic fingerprint fails even with valid physical SHA",async()=>{const f=fixture({"x-offroad-final-fingerprint":"a".repeat(64)});f.p.semanticFingerprint="a".repeat(64);expect(await readCapitalPreviewResult(f.supabase,f.input)).toEqual({ok:false});});
function replacePhysical(f:ReturnType<typeof fixture>,body:Record<string,unknown>){
 const text=JSON.stringify(body);f.p.physicalSha256=createHash("sha256").update(text).digest("hex");f.p.byteLength=Buffer.byteLength(text);f.p.semanticFingerprint=fingerprintJson(body);
 const h=new Headers({"content-type":"application/octet-stream","cache-control":"no-store","x-offroad-organization-id":id(1),"x-offroad-work-id":id(2),"x-offroad-artifact-id":id(3),"x-offroad-revision-id":id(5),"x-offroad-recipe-id":id(4),"x-offroad-final-fingerprint":f.p.semanticFingerprint,"x-offroad-payload-sha256":f.p.physicalSha256,"x-offroad-byte-length":String(f.p.byteLength),"x-offroad-allocation-id":id(7),"x-offroad-object-id":id(8),"x-offroad-storage-version":"v1"});
 f.invoke.mockResolvedValue({error:null,data:new Blob([text]),response:new Response(null,{headers:h})});
}
for(const[k,v]of Object.entries({schemaVersion:"capital-preview-json-body.v2",runId:id(9),taskId:"OTHER",role:"decision_contract",artifactType:"preview_scenarios",extraField:true}))it(`valid physical SHA does not excuse wrong preview body ${k}`,async()=>{
 const f=fixture();replacePhysical(f,{...f.body,[k]:v});expect(await readCapitalPreviewResult(f.supabase,f.input)).toEqual({ok:false});
});
it("native decision contract is read from its own physical role and revision",async()=>{
 const f=fixture();f.p.role="decision_contract";f.input.artifactType="preview_decision_contract";
 const contract={schemaVersion:"2026.09.07-v1",state:"draft"};replacePhysical(f,{...f.body,role:"decision_contract",artifactType:"preview_decision_contract",content:contract});
 expect(await readCapitalPreviewResult(f.supabase,f.input)).toEqual({ok:true,content:{contract}});
});

for(const phase of["before","after"])it(`current review denies WORK loss ${phase} physical display`,async()=>{
 const f=fixture();if(phase==="before")f.rpc.mockResolvedValue({data:{...f.basis,workAccess:false},error:null});else f.rpc.mockResolvedValueOnce({data:f.basis,error:null}).mockResolvedValueOnce({data:{...f.basis,workAccess:false},error:null});
 expect(await readCapitalPreviewResult(f.supabase,f.input)).toEqual({ok:false});if(phase==="before")expect(f.invoke).not.toHaveBeenCalled();
});
for(const field of["viewerId","manifestFingerprint","artifactFingerprint","status","approvalActive","policy"])it(`current review identity/state ${field} cannot drift during read`,async()=>{
 const f=fixture(),value=field.endsWith("Fingerprint")?"e".repeat(64):field==="viewerId"?id(11):field==="status"?"confirmed":field==="approvalActive"?true:{...f.basis.policy,selfApprovalAllowed:true};
 f.rpc.mockResolvedValueOnce({data:f.basis,error:null}).mockResolvedValueOnce({data:{...f.basis,[field]:value},error:null});expect(await readCapitalPreviewResult(f.supabase,f.input)).toEqual({ok:false});
});
it("review v2 rejects a replaced target before downloading",async()=>{const f=fixture();f.rpc.mockResolvedValue({data:{...f.basis,revisionId:id(11)},error:null});expect(await readCapitalPreviewResult(f.supabase,f.input)).toEqual({ok:false});expect(f.invoke).not.toHaveBeenCalled();});
