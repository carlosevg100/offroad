import {describe,expect,it,vi} from "vitest";
import type {SupabaseClient} from "@supabase/supabase-js";
import {createEventOutboxConsumer} from "./event-outbox";
const id="a2240000-0000-4000-9000-000000000001";
const event={id,organizationId:id,aggregateKind:"membership",aggregateId:id,aggregateVersion:1,eventVersion:1,actorKind:"system",actorId:null,reason:"changed",effect:"revalidate_authority",correlationId:id};
const claim={claimed:true,outboxId:id,capability:"a".repeat(64),event,blockedCount:0,oldestPendingSeconds:0};
function setup(results: unknown[]) {
 const rpc=vi.fn(); for(const result of results) rpc.mockResolvedValueOnce(result);
 const log=vi.fn(); return {rpc,log,consumer:createEventOutboxConsumer({rpc} as unknown as SupabaseClient,"private-worker-token",log)};
}
describe("durable event outbox consumer",()=>{
 it.each(["observation", "metric_definition", "adoption_decision", "assumption_version"])("acknowledges %s through the existing capability without exposing content",async(aggregateKind)=>{
  const {consumer,rpc,log}=setup([{data:{...claim,event:{...event,aggregateKind}},error:null},{data:{completed:true,replayed:false,appliedCount:0},error:null}]);
  expect(await consumer.poll()).toBe(true);
  expect(rpc).toHaveBeenNthCalledWith(2,"complete_event_outbox_v1",{p_worker_token:"private-worker-token",p_outbox_id:id,p_capability:"a".repeat(64)});
  expect(JSON.stringify(log.mock.calls)).not.toMatch(/private-worker-token|aaaaaaaa|protected_state/);
 });
 it.each(["source_version","method_release","assumption_version","institutional_configuration"])("acknowledges a %s change whose dependency effect the database applies in the same completion",async(aggregateKind)=>{
  const change={...event,aggregateKind,reason:"created",effect:"propagate_dependencies"};
  const {consumer,rpc,log}=setup([{data:{...claim,event:change},error:null},{data:{completed:true,replayed:false,appliedCount:0},error:null}]);
  expect(await consumer.poll()).toBe(true);
  expect(rpc).toHaveBeenCalledTimes(2);
  expect(rpc).toHaveBeenNthCalledWith(2,"complete_event_outbox_v1",{p_worker_token:"private-worker-token",p_outbox_id:id,p_capability:"a".repeat(64)});
  expect(log).toHaveBeenCalledWith("outbox.processed",{eventId:id,completed:true,replayed:false,appliedCount:0});
 });
 it("leaves an unacknowledged dependency effect to the lease instead of retrying it in memory",async()=>{
  const change={...event,aggregateKind:"source_version",reason:"created",effect:"propagate_dependencies"};
  const {consumer,rpc,log}=setup([{data:{...claim,event:change},error:null},{data:{completed:false,replayed:false,appliedCount:1},error:null}]);
  expect(await consumer.poll()).toBe(true);
  expect(rpc).toHaveBeenCalledTimes(2);
  expect(log).toHaveBeenCalledWith("outbox.processed",{eventId:id,completed:false,replayed:false,appliedCount:1});
 });
 it("rejects a change kind that does not carry the dependency effect",async()=>{
  const {consumer,rpc,log}=setup([{data:{...claim,event:{...event,aggregateKind:"source_version"}},error:null}]);
  await consumer.poll();expect(rpc).toHaveBeenCalledTimes(1);expect(log).toHaveBeenCalledWith("outbox.poll.failed",{reason:"invalid_contract"});
 });
 it("retries an ambiguous completion with the identical capability",async()=>{
  const {consumer,rpc,log}=setup([{data:claim,error:null},{data:null,error:{message:"sensitive failure"}},{data:{completed:true,replayed:true,appliedCount:1},error:null}]);
  await consumer.poll(); expect(rpc).toHaveBeenCalledTimes(3);expect(rpc.mock.calls[1]).toEqual(rpc.mock.calls[2]);
  expect(log).toHaveBeenCalledWith("outbox.processed",{eventId:id,completed:true,replayed:true,appliedCount:1});
  expect(JSON.stringify(log.mock.calls)).not.toMatch(/sensitive failure|private-worker-token|aaaaaaaa/);
 });
 it("rejects financial or protected fields before any completion",async()=>{
  const {consumer,rpc,log}=setup([{data:{...claim,event:{...event,protected_state:{balance:100}}},error:null}]);
  await consumer.poll();expect(rpc).toHaveBeenCalledTimes(1);expect(log).toHaveBeenCalledWith("outbox.poll.failed",{reason:"invalid_contract"});
 });
 it("raises an alarm for blocked work even when no event is claimable",async()=>{
  const {consumer,rpc,log}=setup([{data:{claimed:false,blockedCount:1,oldestPendingSeconds:400},error:null}]);
  await consumer.poll();expect(rpc).toHaveBeenCalledTimes(1);expect(log).toHaveBeenCalledWith("outbox.backlog.failed",{blockedCount:1,oldestPendingSeconds:400});
 });
 it("bounds retries and leaves recovery to the durable lease",async()=>{
  const {consumer,rpc,log}=setup([{data:claim,error:null},{data:null,error:{}},{data:null,error:{}}]);
  await consumer.poll();expect(rpc).toHaveBeenCalledTimes(3);expect(log).toHaveBeenCalledWith("outbox.complete.failed",{eventId:id,reason:"completion_unconfirmed"});
 });
});
