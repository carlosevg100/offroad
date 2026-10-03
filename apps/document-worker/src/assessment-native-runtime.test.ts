import{createHash}from"node:crypto";
import type{SupabaseClient}from"@supabase/supabase-js";
import{describe,expect,it,vi}from"vitest";
import{createAssessmentNativeRuntime}from"./assessment-native-runtime";
import type{CaseAnalysisJob}from"./queue";
const uuid=(n:number)=>`10000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const job={job_id:uuid(1),organization_id:uuid(2),capability_token:"native-test-capability"}as CaseAnalysisJob;
const publication={url:"https://synthetic.example.invalid/published",title:"Published synthetic source",snippet:"Licensed synthetic bytes",contentHash:"a".repeat(64),provider:"publisher",topic:"company"};
const text=JSON.stringify(publication),fp=createHash("sha256").update(text).digest("hex");
const ref={deliveryId:uuid(3),retainedPayloadId:uuid(4),payloadFingerprint:fp};
const preparation={schemaVersion:"assessment-research-capture.v1",snapshotId:uuid(5),status:"succeeded",sources:[ref]};
const scope={schemaVersion:"capital-public-storage-scope.v1",state:"complete",allocationId:uuid(6),retainedPayloadId:uuid(4),deliveryId:uuid(3),bucket:"capital-input-capture",path:`${job.organization_id}/${uuid(6)}/payload.json`,payloadFingerprint:fp,byteLength:Buffer.byteLength(text),storageObjectId:uuid(7),storageVersion:"v1",retainedAt:"2026-10-01T00:00:00Z",uploadExpiresAt:"2026-10-01T00:01:00Z",purgeAt:"2026-10-01T00:09:00Z",expiresAt:"2026-10-01T00:10:00Z"};
function fixture(){
 const rpc=vi.fn().mockImplementation(async(n:string)=>({data:n==="worker_prepare_assessment_research_v1"?preparation:scope,error:null}));
 const invoke=vi.fn().mockResolvedValue({error:null,data:new Blob([text]),response:new Response(null,{headers:{"content-type":"application/octet-stream","cache-control":"private, no-store","x-offroad-allocation-id":scope.allocationId,"x-offroad-object-id":scope.storageObjectId,"x-offroad-storage-version":scope.storageVersion,"x-offroad-payload-sha256":fp,"x-offroad-byte-length":String(scope.byteLength),"x-offroad-snapshot-id":preparation.snapshotId,"x-offroad-retained-payload-id":ref.retainedPayloadId}})});
 const sdk={rpc,functions:{invoke}}as unknown as SupabaseClient;
 return{rpc,invoke,port:createAssessmentNativeRuntime(sdk,()=>Date.parse("2026-10-01T00:02:00Z")).forJob(job)};
}
describe("native assessment consumed inputs",()=>{
 it("only consumes physical licensed bytes and checks the entire closure again before returning to inference",async()=>{
  const f=fixture(),result=await f.port.publicResearch();expect(result).toMatchObject({status:"succeeded",sourceCount:1,costExposureUsd:0,sources:[{snippet:publication.snippet,url:publication.url}]});
  expect(f.rpc.mock.calls.map(c=>c[0])).toEqual(["worker_prepare_assessment_research_v1","worker_read_assessment_research_source_v1","worker_prepare_assessment_research_v1"]);
  expect(f.invoke.mock.calls[0]?.[1].body).toEqual({kind:"assessment_source",snapshotId:uuid(5),retainedPayloadId:uuid(4)});
 });
 it("captures honest abstention before any model and never fetches an unlicensed URL",async()=>{
  const f=fixture();f.rpc.mockResolvedValue({data:{...preparation,status:"abstained",sources:[]},error:null});expect(await f.port.publicResearch()).toEqual({status:"abstained",sourceCount:0,topicCounts:{},researchRunId:null,costExposureUsd:0,sources:[]});expect(f.invoke).not.toHaveBeenCalled();expect(f.rpc).toHaveBeenCalledTimes(2);
 });
 it("denies rights revocation after physical read without returning a partial summary",async()=>{
  const f=fixture();f.rpc.mockResolvedValueOnce({data:preparation,error:null}).mockResolvedValueOnce({data:scope,error:null}).mockResolvedValueOnce({data:null,error:{code:"42501"}});await expect(f.port.publicResearch()).rejects.toThrow("assessment_capture_denied");expect(f.invoke).toHaveBeenCalledOnce();
 });
 it("does not treat omitted or stale physical sources as zero",async()=>{
  const f=fixture();f.rpc.mockResolvedValueOnce({data:{...preparation,status:"abstained"},error:null});await expect(f.port.publicResearch()).rejects.toThrow();expect(f.invoke).not.toHaveBeenCalled();
  const expired=fixture();expired.rpc.mockResolvedValueOnce({data:preparation,error:null}).mockResolvedValueOnce({data:{...scope,purgeAt:"2026-10-01T00:01:00Z"},error:null});await expect(expired.port.publicResearch()).rejects.toThrow("assessment_research_source_denied");expect(expired.invoke).not.toHaveBeenCalled();
 });
 it("binds the additional institutional context and never falls back to raw loader",async()=>{
  const f=fixture();f.rpc.mockResolvedValue({data:{assessmentInputSnapshotId:uuid(5),currentSources:[],approvedConfigurations:[]},error:null});await f.port.loadInstitutionalContext();expect(f.rpc.mock.calls[0]?.[0]).toBe("worker_load_assessment_institutional_context_v1");
  f.rpc.mockResolvedValue({data:null,error:{code:"42501"}});await expect(f.port.loadInstitutionalContext()).rejects.toThrow("assessment_capture_denied");expect(f.rpc.mock.calls.every(c=>c[0]==="worker_load_assessment_institutional_context_v1")).toBe(true);
 });
});
