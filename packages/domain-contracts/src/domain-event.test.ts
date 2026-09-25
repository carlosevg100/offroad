import {describe,expect,it} from "vitest";
import {domainEventSchema} from "./domain-event";
const id="a2240000-0000-4000-9000-000000000001";
const event={id,organizationId:id,aggregateKind:"membership",aggregateId:id,aggregateVersion:1,eventVersion:1,actorKind:"system",actorId:null,reason:"changed",effect:"revalidate_authority",correlationId:id};
describe("domain event envelope",()=>{
 it("accepts content-free versioned identity",()=>expect(domainEventSchema.parse(event)).toEqual(event));
 it("accepts policy revalidation without accepting a new effect or protected state",()=>{
  expect(domainEventSchema.safeParse({...event,aggregateKind:"access_policy"}).success).toBe(true);
  expect(domainEventSchema.safeParse({...event,aggregateKind:"access_policy",effect:"grant_access"}).success).toBe(false);
  expect(domainEventSchema.safeParse({...event,aggregateKind:"access_policy",protected_state:{}}).success).toBe(false);
 });
 it.each(["observation", "metric_definition", "adoption_decision", "assumption_version"])("accepts content-free %s before its producer is deployed",(aggregateKind)=>{
  expect(domainEventSchema.safeParse({...event,aggregateKind}).success).toBe(true);
  expect(domainEventSchema.safeParse({...event,aggregateKind,effect:"adopt_observation"}).success).toBe(false);
  expect(domainEventSchema.safeParse({...event,aggregateKind,value:"10"}).success).toBe(false);
 });
 it("rejects unsupported effects, unsafe versions and sensitive payload",()=>{
  for(const patch of [{effect:"send_email"},{aggregateVersion:0},{aggregateVersion:Number.MAX_SAFE_INTEGER+1},{protected_state:{}},{actorKind:"user"}]) expect(domainEventSchema.safeParse({...event,...patch}).success).toBe(false);
 });
});
describe("dependency propagation (stage 18)",()=>{
 const change={...event,reason:"created",effect:"propagate_dependencies"};
 it.each(["source_version","method_release"])("accepts a %s change only with the dependency effect",(aggregateKind)=>{
  expect(domainEventSchema.parse({...change,aggregateKind})).toEqual({...change,aggregateKind});
  expect(domainEventSchema.safeParse({...change,aggregateKind,effect:"revalidate_authority"}).success).toBe(false);
  expect(domainEventSchema.safeParse({...change,aggregateKind,versionNo:2}).success).toBe(false);
 });
 it.each(["adoption_decision","assumption_version"])("accepts %s with either effect: recorded before and after stage 18",(aggregateKind)=>{
  expect(domainEventSchema.safeParse({...change,aggregateKind}).success).toBe(true);
  expect(domainEventSchema.safeParse({...event,aggregateKind}).success).toBe(true);
 });
 it.each(["membership","resource_grant","workspace_capability","commercial_account_link","access_policy","observation","metric_definition"])("never lets an authority or evidence kind (%s) propagate dependencies",(aggregateKind)=>{
  expect(domainEventSchema.safeParse({...change,aggregateKind}).success).toBe(false);
 });
 it("rejects an unknown change kind or effect",()=>{
  expect(domainEventSchema.safeParse({...change,aggregateKind:"execution_result"}).success).toBe(false);
  expect(domainEventSchema.safeParse({...change,aggregateKind:"source_version",effect:"recompute"}).success).toBe(false);
 });
});
