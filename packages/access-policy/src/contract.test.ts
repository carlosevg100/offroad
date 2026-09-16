import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";
import {accessAdministration,accessExplanationSchema,accessGroupCommandSchema,accessGroupMemberCommandSchema,informationBarrierCommandSchema,policyConformanceVectorSchema,policyPrincipalSchema} from "./index";
const id="a3310000-0000-4000-8000-000000000001";
describe("PostgreSQL policy contract",()=>{
 it("never infers administration from a role or malformed server response",()=>{
  for(const value of [undefined,null,{role:"owner"},{canAdminister:"true"},{canAdminister:true,role:"admin"}])expect(accessAdministration(value)).toEqual({canAdminister:false});
  expect(accessAdministration({canAdminister:true})).toEqual({canAdminister:true});
 });
 it("accepts content-free denial and rejects hidden-object explanations",()=>{
  expect(accessExplanationSchema.parse({allowed:false,capabilities:[]})).toEqual({allowed:false,capabilities:[]});
  for(const patch of [{resourceId:id},{reason:"barrier"},{capabilities:["read"]},{policyVersion:1}])expect(accessExplanationSchema.safeParse({allowed:false,capabilities:[],...patch}).success).toBe(false);
 });
 it("rejects nested groups, organization spoofing and delegated group membership",()=>{
  expect(accessGroupCommandSchema.safeParse({id:null,name:"Desk",parentGroupId:id}).success).toBe(false);
  expect(accessGroupCommandSchema.safeParse({id:null,name:"Desk",organizationId:id}).success).toBe(false);
  expect(accessGroupMemberCommandSchema.safeParse({groupId:id,principalId:id}).success).toBe(false);
 });
 it("requires one barrier subject and bounded delegated identity",()=>{
  expect(informationBarrierCommandSchema.safeParse({id:null,resourceId:id,name:"Desk",members:[{userId:id,groupId:id,effect:"allow"}]}).success).toBe(false);
  const worker={kind:"worker",id,organizationId:id,humanPrincipalId:id,processingJobId:id,resourceId:id,workerTokenId:id,accountUserId:id,expiresAt:"2026-09-17T12:00:00Z"};
  expect(policyPrincipalSchema.safeParse(worker).success).toBe(true);
  for(const key of ["humanPrincipalId","processingJobId","resourceId","expiresAt","workerTokenId","accountUserId"]){const invalid:Record<string,unknown>={...worker};delete invalid[key];expect(policyPrincipalSchema.safeParse(invalid).success).toBe(false);}
 });
 it("keeps SQL conformance cases identical to the typed fixture",()=>{
  const vectors=JSON.parse(readFileSync(new URL("../fixtures/conformance.json",import.meta.url),"utf8")) as unknown[];
  const parsed=vectors.map(v=>policyConformanceVectorSchema.parse(v));
  expect(new Set(parsed.map(v=>v.id)).size).toBe(parsed.length);
  const sql=readFileSync(new URL("../../../supabase/tests/support/resource_policy_vectors.sql",import.meta.url),"utf8");
  const encoded=sql.match(/\$vectors\$([\s\S]*?)\$vectors\$/)?.[1];
  expect(JSON.parse(encoded??"null")).toEqual(parsed);
 });
});
