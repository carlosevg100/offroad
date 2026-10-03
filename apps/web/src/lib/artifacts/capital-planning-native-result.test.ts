import {createHash} from "node:crypto";
import type {SupabaseClient} from "@supabase/supabase-js";
import {describe,it,expect,vi} from "vitest";
vi.mock("server-only",()=>({}));
import type {Database} from "@/types/database";
import {loadCapitalPlanningNativeResult} from "./capital-planning-native-result";
const id=(n:number)=>`10000000-0000-4000-8000-${n.toString().padStart(12,"0")}`;
const sentence="A evidência disponível requer reconciliação documental antes de comparar condições econômicas ou recomendar uma estrutura.";
const content={schemaVersion:"capital-planning-map.v1",asOfDate:"2026-10-02",company:{name:"Synthetic",website:null},
 executiveRead:sentence,understoodNeed:{objective:sentence,constraints:[],assumptionsToConfirm:[sentence]},
 evidenceCoverage:{status:"insufficient",supported:[],notYetSupported:[sentence]},alternatives:[],comparison:[],
 directionalRecommendation:{status:"not_ready",alternativeId:null,rationale:sentence,conditionsBeforeConfirmation:[sentence]},
 informationRequests:[{request:sentence,whyItMatters:sentence,decisionImpact:sentence,acceptableEvidence:["PDF"]}],
 questions:Array.from({length:2},()=>({question:sentence,whyItMatters:sentence,answerChanges:sentence})),unknowns:[sentence],
 sources:[],researchStatus:"partial",scopeBoundary:sentence,provenance:{provider:"anthropic",model:"claude-sonnet-5",executorVersion:"2026.10.02-v1"}};
const text=JSON.stringify(content),sha=createHash("sha256").update(text).digest("hex");
const projection={schemaVersion:"capital-s11-projection.v1",revisionId:id(3),recipeId:id(4),finalFingerprint:"a".repeat(64),physicalSha256:sha,byteLength:Buffer.byteLength(text)};
const basis={projectId:id(2),artifactId:id(5),revisionId:id(3),artifactFingerprint:"b".repeat(64),manifestFingerprint:"c".repeat(64),
 artifactType:"alternative_map",preparedBy:id(1),viewerId:id(1),workAccess:true,sourceCount:1,status:"pending_confirmation",approvalActive:false,
 policy:{assignmentRequired:false,selfApprovalAllowed:false,roles:[]}};
const input={organizationId:id(1),workId:id(2),artifact:{id:id(5),artifact_fingerprint:basis.artifactFingerprint,content:projection}};
const denied={ok:false,error:"capital_s11_result_withheld"};
function fixture(review:unknown=basis,error:unknown=null){
 const invoke=vi.fn().mockResolvedValue({data:new Blob([text]),error:null,response:new Response(null,{headers:{
  "content-type":"application/octet-stream","cache-control":"private, no-store","x-offroad-revision-id":id(3),"x-offroad-recipe-id":id(4),
  "x-offroad-final-fingerprint":projection.finalFingerprint,"x-offroad-allocation-id":id(6),"x-offroad-object-id":id(7),"x-offroad-storage-version":"version-1",
  "x-offroad-payload-sha256":sha,"x-offroad-byte-length":String(projection.byteLength)}})});
 const rpc=vi.fn().mockResolvedValue({data:review,error});
 return{invoke,rpc,supabase:{functions:{invoke},rpc} as unknown as SupabaseClient<Database>};
}
describe("actual S11 physical product and exact human review",()=>{
 it("uses the real s11_result endpoint then binds the full product to its exact v2 target",async()=>{
  const f=fixture();expect(await loadCapitalPlanningNativeResult(f.supabase,input)).toEqual({ok:true,content,review:basis});
  expect(f.invoke).toHaveBeenCalledWith("capital-body-read",expect.objectContaining({body:{kind:"s11_result",revisionId:id(3)}}));
  expect(f.rpc).toHaveBeenCalledWith("read_capital_project_artifact_review_v2",{p_project_id:id(2),p_artifact_id:id(5),p_revision_id:id(3)});
 });
 it.each([null,{...basis,artifactFingerprint:"d".repeat(64)},{...basis,revisionId:id(7)},{...basis,artifactType:"meeting_brief"},
  {...basis,status:"stale"},{...basis,status:"superseded"}])("withholds changed or missing human authority (%j)",async review=>{
  const f=fixture(review);expect(await loadCapitalPlanningNativeResult(f.supabase,input)).toEqual(denied);
 });
 it("rechecks authority after bytes and refuses revocation without historical fallback",async()=>{
  const f=fixture(basis,{code:"42501"});expect(await loadCapitalPlanningNativeResult(f.supabase,input)).toEqual(denied);
 });
 it("keeps approved current receipts available for an explicit human return",async()=>{
  const review={...basis,status:"confirmed",approvalActive:true};const f=fixture(review);
  expect(await loadCapitalPlanningNativeResult(f.supabase,input)).toEqual({ok:true,content,review});
 });
 it("withholds native transport and review exceptions",async()=>{
  const f=fixture();f.rpc.mockRejectedValue(new Error("private transport"));expect(await loadCapitalPlanningNativeResult(f.supabase,input)).toEqual(denied);
 });
});
