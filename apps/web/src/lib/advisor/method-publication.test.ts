import {describe,expect,it} from "vitest";
import {methodCommandSchema} from "./method-publication";
const id="a5140000-0000-4000-9000-000000000001";
const candidate={action:"submit",locale:"pt-BR",id,title:"Synthetic candidate",baseReleaseId:"r01-2026.09.06-v1",overrides:[],unitId:null,workType:"receivables_underwriting"};
describe("method publication command boundary",()=>{
 it("rejects client-supplied tenant, actor and publication authority",()=>{
  for(const extra of [{organizationId:id},{publishedBy:id},{status:"published"},{canPublish:true}]) expect(methodCommandSchema.safeParse({...candidate,...extra}).success).toBe(false);
 });
 it("requires exact reviewed fingerprint and review identity",()=>{
  const publish={action:"publish",locale:"pt-BR",id,reviewId:id,fingerprint:"a".repeat(64)};
  expect(methodCommandSchema.safeParse(publish).success).toBe(true);
  for(const extra of [{reviewId:null},{fingerprint:"latest"},{fingerprint:null}]) expect(methodCommandSchema.safeParse({...publish,...extra}).success).toBe(false);
 });
 it("requires explicit previous binding to detect concurrent adoption",()=>{
  const bind={action:"bind",locale:"pt-BR",id,bindingId:id,unitId:null,workId:null,workType:"receivables_underwriting"};
  expect(methodCommandSchema.safeParse(bind).success).toBe(false);
  expect(methodCommandSchema.safeParse({...bind,expectedBindingId:null}).success).toBe(true);
 });
});
