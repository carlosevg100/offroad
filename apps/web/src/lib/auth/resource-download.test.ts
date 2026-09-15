import {describe,expect,it,vi} from "vitest";
import type {SupabaseClient} from "@supabase/supabase-js";
import type {Database} from "@/types/database";
import {resourceStillReadable} from "./resource-download";
describe("private download final authorization",()=>{
 it.each([{data:{id:"resource"},error:null,allowed:true},{data:null,error:null,allowed:false},{data:{id:"resource"},error:{code:"42501"},allowed:false}])("checks live RLS before returning bytes: $allowed",async({data,error,allowed})=>{
  const query={select:vi.fn(),eq:vi.fn(),maybeSingle:vi.fn().mockResolvedValue({data,error})};query.select.mockReturnValue(query);query.eq.mockReturnValue(query);
  const from=vi.fn().mockReturnValue(query);
  expect(await resourceStillReadable({from} as unknown as SupabaseClient<Database>,"organization","resource","project")).toBe(allowed);
  expect(from).toHaveBeenCalledWith("capital_projects");expect(query.eq).toHaveBeenCalledWith("organization_id","organization");expect(query.eq).toHaveBeenCalledWith("id","resource");
 });
});
