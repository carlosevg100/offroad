import {describe,expect,it,vi} from "vitest";
import type {SupabaseClient} from "@supabase/supabase-js";
import type {Database} from "@/types/database";
import {artifactReadFixture,artifactRpc} from "./artifact-read.test-support";
vi.mock("server-only",()=>({}));
import {readInstitutionalWorkbookBinding} from "./institutional-binding";
const work="10000000-0000-4000-8000-000000000001";
const result="20000000-0000-4000-8000-000000000001";
const revision="30000000-0000-4000-8000-000000000001";
const fingerprint="a".repeat(64);
const native=(overrides:Partial<Parameters<typeof artifactReadFixture>[0]>={})=>artifactReadFixture({workId:work,revisionId:revision,kind:"model_result",subject:`institutional-native:${result}`,institutionalResult:{id:result,configurationFingerprint:fingerprint},...overrides});
function client(data:unknown,reads=[native()],error:unknown=null){return {rpc:vi.fn(artifactRpc(reads,()=>({data,error})))} as unknown as SupabaseClient<Database>;}
describe("institutional copied workbook authority",()=>{
 it("allows legacy only when the authoritative lookup explicitly reports legacy",async()=>{
  expect(await readInstitutionalWorkbookBinding(client({state:"legacy"}),work,fingerprint)).toEqual({ok:true,native:null});
 });
 it.each([null,{}, {state:"native",resultId:result}])("fails closed for invalid answers %j",async data=>{
  expect(await readInstitutionalWorkbookBinding(client(data),work,fingerprint)).toEqual({ok:false});
 });
 it("does not turn permission denial into a historical fallback",async()=>{
  expect(await readInstitutionalWorkbookBinding(client({state:"legacy"},[],{code:"42501"}),work,fingerprint)).toEqual({ok:false});
 });
 it("returns the exact independently authorized native revision",async()=>{
  const answer=await readInstitutionalWorkbookBinding(client({state:"native",resultId:result,revisionId:revision}),work,fingerprint);
  expect(answer.ok&&answer.native?.revision.id).toBe(revision);
 });
 it.each([
  {workId:"40000000-0000-4000-8000-000000000001"},
  {subject:"institutional-workbook"},
  {institutionalResult:{id:"50000000-0000-4000-8000-000000000001",configurationFingerprint:fingerprint}},
  {release:"blocked" as const},
  {restriction:{kind:"source_rights" as const,linkIds:[],unresolvedRevisionIds:[]}},
 ])("rejects mismatched or revoked native authority %j",async override=>{
  expect(await readInstitutionalWorkbookBinding(client({state:"native",resultId:result,revisionId:revision},[native(override)]),work,fingerprint)).toEqual({ok:false});
 });
});
