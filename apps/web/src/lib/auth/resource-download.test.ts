import {describe,expect,it,vi} from "vitest";
import type {SupabaseClient} from "@supabase/supabase-js";
import type {Database} from "@/types/database";
import {resourceStillReadable} from "./resource-download";
describe("private download final authorization",()=>{
 it.each([{data:{id:"resource"},error:null,allowed:true},{data:null,error:null,allowed:false},{data:{id:"resource"},error:{code:"42501"},allowed:false}])("checks live RLS before returning bytes: $allowed",async({data,error,allowed})=>{
  const query={select:vi.fn(),eq:vi.fn(),maybeSingle:vi.fn().mockResolvedValue({data,error})};query.select.mockReturnValue(query);query.eq.mockReturnValue(query);
  const from=vi.fn().mockReturnValue(query);
  const rpc=vi.fn().mockResolvedValue({data:{allowed:true,capabilities:["read"],policyVersion:1},error:null});
  expect(await resourceStillReadable({from,rpc} as unknown as SupabaseClient<Database>,"organization","resource","project")).toBe(allowed);
  expect(from).toHaveBeenCalledWith("capital_projects");expect(query.eq).toHaveBeenCalledWith("organization_id","organization");expect(query.eq).toHaveBeenCalledWith("id","resource");
 });
 it.each([{data:{allowed:false,capabilities:[]},error:null},{data:{allowed:true,capabilities:["read"],policyVersion:1},error:{code:"42501"}},{data:{allowed:true,resourceName:"hidden"},error:null}])("refuses export denial, RPC failure and malformed capability despite readable RLS",async (decision)=>{
  const query={select:vi.fn(),eq:vi.fn(),maybeSingle:vi.fn().mockResolvedValue({data:{id:"resource"},error:null})};query.select.mockReturnValue(query);query.eq.mockReturnValue(query);
  const rpc=vi.fn().mockResolvedValue(decision);
  expect(await resourceStillReadable({from:()=>query,rpc} as unknown as SupabaseClient<Database>,"organization","resource","project")).toBe(false);
  expect(rpc).toHaveBeenCalledWith("explain_my_access_v1",{p_resource_id:"resource",p_action:"read",p_purpose:"export"});
 });
});
