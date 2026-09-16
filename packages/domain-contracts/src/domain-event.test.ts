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
 it("rejects unsupported effects, unsafe versions and sensitive payload",()=>{
  for(const patch of [{effect:"send_email"},{aggregateVersion:0},{aggregateVersion:Number.MAX_SAFE_INTEGER+1},{protected_state:{}},{actorKind:"user"}]) expect(domainEventSchema.safeParse({...event,...patch}).success).toBe(false);
 });
});
