import {createHash} from "node:crypto";
import {afterEach,describe,expect,it,vi} from "vitest";
import {diversifiedReceivablesCase,receivablesParametricScenarios} from "@offroad/receivables-analysis";
import {calculatePinnedMethod} from "./execution-calculation";
import {loadReleasedExecutionProfile} from "./released-method-executor";
import gold from "./released-r01-gold.json";
const identity={methodId:"underwrite-receivables-pool",methodVersion:"2026.09.06-v1",manifestHash:"17ee80ac7cd3ac22b8c0d5d90893cf89ad67eb129ad1fe1b6f26aa3b73d6d090"};
afterEach(()=>vi.restoreAllMocks());
describe("interruptible installed R01 adapter",()=>{
 it("reproduces every recorded gold and stressed result through the isolated thread",async()=>{
  for(const caseInput of [diversifiedReceivablesCase("release-gold"),...receivablesParametricScenarios.map(s=>s.input)]){
   const result=await calculatePinnedMethod(identity,JSON.stringify({currency:"BRL",case:caseInput}),new AbortController().signal);
   expect(result.ok).toBe(true);
   if(result.ok)expect(createHash("sha256").update(result.text).digest("hex")).toBe((gold.results as Record<string,string>)[caseInput.id]);
  }
 },30000);
 it("rejects incomplete R01 input inside the published schema",async()=>{
  expect(await calculatePinnedMethod(identity,'{}',new AbortController().signal)).toEqual({ok:false,reason:"invalid_input"});
 });
 it("does not substitute another release or manifest",async()=>{
  for(const changed of [{methodVersion:"latest"},{manifestHash:"0".repeat(64)},{methodId:"unknown"}])
   await expect(calculatePinnedMethod({...identity,...changed},'{}',new AbortController().signal)).rejects.toThrow("published_method_executor_unavailable");
 });
 it("terminates the real packaged execution when its caller aborts",async()=>{
  const c=new AbortController();const run=calculatePinnedMethod(identity,JSON.stringify({currency:"BRL",case:diversifiedReceivablesCase("abort")}),c.signal);
  c.abort();await expect(run).rejects.toThrow("execution_aborted");
 });
 it("enforces the versioned containment deadline without relying on a caller timer",async()=>{
  const deadline=new AbortController(),spy=vi.spyOn(AbortSignal,"timeout").mockImplementation(()=>deadline.signal);
  const run=calculatePinnedMethod(identity,JSON.stringify({currency:"BRL",case:diversifiedReceivablesCase("deadline")}),new AbortController().signal);
  expect(spy).toHaveBeenCalledWith(loadReleasedExecutionProfile(identity).limits.maxDurationMs);
  deadline.abort();await expect(run).rejects.toThrow("execution_aborted");
 });
 it("refuses work before starting when already cancelled or input exceeds the byte limit",async()=>{
  const c=new AbortController();c.abort();await expect(calculatePinnedMethod(identity,'{}',c.signal)).rejects.toThrow("execution_aborted");
  expect(await calculatePinnedMethod(identity,' '.repeat(8_388_609),new AbortController().signal)).toEqual({ok:false,reason:"invalid_input"});
 });
});
