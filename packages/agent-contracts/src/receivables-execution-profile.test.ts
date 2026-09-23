import {readFileSync,readdirSync} from "node:fs";
import {describe,expect,it} from "vitest";
import {assertContractMatchesExecutionProfile,deriveReceivablesExecutionProfile} from "./execution-profile";
import {executionInputFingerprint as hash} from "./execution-contract";
const locked=JSON.parse(readFileSync(new URL("../../credit-playbook/knowledge/releases/method-release-lock.json",import.meta.url),"utf8")).releases[0];
const source=()=>({schemaVersion:"r01-execution-adapter-source.v1",platformReleaseId:locked.platformReleaseId,artifactHash:locked.artifactHash,
 manifest:structuredClone(locked.provenance),capability:structuredClone(locked.capabilities[0]),executorSources:structuredClone(locked.executorSources)});
const release={id:locked.platformReleaseId,manifestHash:locked.provenance.manifestHash,artifactHash:locked.artifactHash};
const derive=()=>deriveReceivablesExecutionProfile(source(),release);
const contract=()=>{
 const c=JSON.parse(readFileSync(new URL("../test-fixtures/execution-contract.json",import.meta.url),"utf8")).contract,p=derive();
 return {...c,method:structuredClone(p.method),tools:[],allowedEffects:["read_only"],budget:{...c.budget,...p.limits}};
};
describe("exact legacy R01 execution adapter",()=>{
 it("preserves published identities and labels new descriptors and containment separately",()=>{
  const p=derive();
  expect(p.method).toMatchObject({platformReleaseId:release.id,manifestHash:release.manifestHash,baseManifestHash:release.manifestHash,
   executor:{key:"@offroad/receivables-analysis#underwriteReceivablesPool",version:"2026.09.06-v1",sourceClosureHash:locked.provenance.executor.sourceClosureHash}});
  expect(p.originalBudget).toBeNull();expect(p.containment.version).toBe("r01-runtime-containment.2026-09-22.v1");
  expect(p.limits).toEqual({maxCostMicrousd:0,maxModelCalls:0,maxDurationMs:31000});
  expect(p.contractHashAlgorithm).toBe("published-artifact-schema-export-sha256-v1");
  expect(p.method.executor.inputContractHash).toBe(hash(p.descriptors.input));
  expect(p.method.executor.outputContractHash).toBe(hash(p.descriptors.output));
  expect(p.descriptors.input).toEqual({schemaVersion:"published-artifact-schema-export.v1",artifactHash:release.artifactHash,exportName:"receivablesPoolUnderwritingInputSchema"});
  expect(p.grantsExecution).toBe(false);expect(p.tools).toEqual([]);expect(p.allowedEffects).toEqual(["read_only"]);
  expect(Object.isFrozen(p.method.executor)).toBe(true);expect(Object.isFrozen(p.containment)).toBe(true);
 });
 it.each(["method","capability","closure","manifest","provider","tool","effect","missing restriction"])("rejects changed %s even when the caller computes a new manifest hash",change=>{
  const s=source();
  if(change==="method")s.manifest.procedure.version="other";
  if(change==="capability")s.capability.executorVersion="other";
  if(change==="closure")s.executorSources[0].hash="0".repeat(64);
  if(change==="manifest")s.manifest.pendingContent=[];
  if(change==="provider")s.capability.allowedProviderIds=["provider"];
  if(change==="tool")s.capability.allowedToolIds=["tool"];
  if(change==="effect")s.capability.maximumEffect="commit";
  if(change==="missing restriction")delete s.capability.allowedProviderIds;
  const {manifestHash:_ignored,...payload}=s.manifest; s.manifest.manifestHash=hash(payload);
  expect(()=>deriveReceivablesExecutionProfile(s,{...release,manifestHash:s.manifest.manifestHash})).toThrow("execution_r01_source_mismatch");
 });
 it.each(["id","manifestHash","artifactHash"] as const)("rejects a different registered %s",key=>{
  expect(()=>deriveReceivablesExecutionProfile(source(),{...release,[key]:"0".repeat(64)})).toThrow("execution_r01_release_mismatch");
 });
 it("binds only a locally derived profile and refuses serialized caller authority",()=>{
  expect(()=>assertContractMatchesExecutionProfile(contract(),derive())).not.toThrow();
  expect(()=>assertContractMatchesExecutionProfile(contract(),JSON.parse(JSON.stringify(derive())))).toThrow("execution_profile_derivation_required");
 });
 it.each(["input descriptor","output descriptor","cost","calls","duration","tool","effect"])("refuses expanded %s",change=>{
  const c=contract();
  if(change==="input descriptor")c.method.executor.inputContractHash="0".repeat(64);
  if(change==="output descriptor")c.method.executor.outputContractHash="0".repeat(64);
  if(change==="cost")c.budget.maxCostMicrousd=1;
  if(change==="calls")c.budget.maxModelCalls=1;
  if(change==="duration")c.budget.maxDurationMs=31001;
  if(change==="tool")c.tools=[{id:"tool",version:"1",effect:"read_only"}];
  if(change==="effect")c.allowedEffects=["compile_artifact"];
  expect(()=>assertContractMatchesExecutionProfile(c,derive())).toThrow();
 });
});

describe("R01 SQL profile parity",()=>{
 const migrations=new URL("../../../supabase/migrations/",import.meta.url);
 const migration=readdirSync(migrations).find(name=>name.endsWith("_execution_r01_profile_boundary.sql"))!;
 const sql=readFileSync(new URL(migration,migrations),"utf8");
 it("SQL accepts exactly the profile derived from the historical release",()=>{
  const match=sql.match(/\$r01_profile\$([\s\S]*?)\$r01_profile\$/);
  expect(match).not.toBeNull();expect(JSON.parse(match![1]!)).toEqual(derive());
 });
 it("SQL release attestation preserves every published manifest field",()=>{
  const match=sql.match(/\$r01_manifest\$([\s\S]*?)\$r01_manifest\$/);
  expect(match).not.toBeNull();expect(JSON.parse(match![1]!)).toEqual(locked.provenance);
 });
 it("database regression fixture uses the independently derived profile",()=>{
  const test=readFileSync(new URL("../../../supabase/tests/execution_r01_profile.sql",import.meta.url),"utf8");
  const match=test.match(/\$profile\$([\s\S]*?)\$profile\$/);
  expect(match).not.toBeNull();expect(JSON.parse(match![1]!)).toEqual(derive());
 });
});
