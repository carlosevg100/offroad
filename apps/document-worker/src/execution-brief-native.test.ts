import {describe,it,expect,vi} from "vitest";
import {produceCapturedExecutionBrief,type ExecutionBriefNativeProduct} from "./execution-brief-native";
const jobId="10000000-0000-4000-8000-000000000001",workId="10000000-0000-4000-8000-000000000002",requestId="10000000-0000-4000-8000-000000000003";
const capture={schemaVersion:"execution-brief-input-capture.v1",captureId:requestId,producerJobId:jobId,workId,inputFingerprint:"a".repeat(64),contextFingerprint:"b".repeat(64),context:{documents:[{id:requestId,name:"Synthetic source"}]},sourceCount:1};
const product={internal:{fingerprint:"c".repeat(64)},visible:{fingerprint:"c".repeat(64)}} as ExecutionBriefNativeProduct;
describe("captured deterministic execution brief",()=>{
 it("captures before compilation and records the exact server identity",async()=>{
  const calls:string[]=[];const record=vi.fn(async()=>{calls.push("record");return {ok:true};});
  await expect(produceCapturedExecutionBrief({jobId,workId,requestId,port:{capture:async()=>{calls.push("capture");return capture;},record},compile:context=>{calls.push("compile");expect(context).toEqual(capture.context);return product;}})).resolves.toEqual({ok:true});
  expect(calls).toEqual(["capture","compile","record"]);expect(record).toHaveBeenCalledWith(capture,product);
 });
 it.each([{producerJobId:workId},{workId:jobId}])("denies crossed scope before compilation",async(change)=>{
  const compile=vi.fn(()=>product),record=vi.fn();
  await expect(produceCapturedExecutionBrief({jobId,workId,requestId,port:{capture:async()=>({...capture,...change}),record},compile})).rejects.toThrow("execution_brief_capture_scope_mismatch");expect(compile).not.toHaveBeenCalled();expect(record).not.toHaveBeenCalled();
 });
 it("does not invent an empty source receipt when capture fails",async()=>{
  const compile=vi.fn(()=>product),record=vi.fn();await expect(produceCapturedExecutionBrief({jobId,workId,requestId,port:{capture:async()=>{throw new Error("execution_brief_source_denied");},record},compile})).rejects.toThrow("execution_brief_source_denied");expect(record).not.toHaveBeenCalled();expect(compile).not.toHaveBeenCalled();
 });
 it("rejects caller-supplied authority fields in a purported capture",async()=>{
  const record=vi.fn();await expect(produceCapturedExecutionBrief({jobId,workId,requestId,port:{capture:async()=>({...capture,publisherId:jobId}),record},compile:()=>product})).rejects.toThrow();expect(record).not.toHaveBeenCalled();
 });
 it("preserves captured context even when compiler mutates its local inputs",async()=>{
  const record=vi.fn();await produceCapturedExecutionBrief({jobId,workId,requestId,port:{capture:async()=>capture,record},compile:context=>{context.documents=[];return product;}});expect(capture.context.documents).toHaveLength(1);expect(record.mock.calls[0]?.[0].context).toEqual(capture.context);
 });
 it("propagates a changed-rights rejection from the recording transaction",async()=>{
  await expect(produceCapturedExecutionBrief({jobId,workId,requestId,port:{capture:async()=>capture,record:async()=>{throw new Error("execution_brief_capture_sources_changed");}},compile:()=>product})).rejects.toThrow("execution_brief_capture_sources_changed");
 });
 it("denies divergent internal and visible fingerprints before recording",async()=>{
  const record=vi.fn();await expect(produceCapturedExecutionBrief({jobId,workId,requestId,port:{capture:async()=>capture,record},compile:()=>({...product,visible:{...product.visible,fingerprint:"d".repeat(64)}})})).rejects.toThrow("execution_brief_capture_product_mismatch");expect(record).not.toHaveBeenCalled();
 });
});
