import {describe,expect,it} from "vitest";
import {compareRoundtrip,extractContributions,verifyRoundtripBase,type RoundtripManifest,type RoundtripSnapshot} from "@offroad/case-export/artifact-roundtrip";
import {applyArtifactManualMappings,assertCapturedRoundtripManifest,unmatchedRoundtripDifferences} from "./artifact-roundtrip-manual-mapping";
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const manifest:RoundtripManifest={schemaVersion:"artifact-roundtrip.2026.09.26-v1",artifactId:id(1),revisionId:id(2),revisionNo:1,logicalManifestFingerprint:"a".repeat(64),format:"docx",variant:"default",exportedAt:"2026-10-05T00:00:00.000Z",blocks:[{blockKey:"thesis",kind:"paragraph",recorded:false,claimIds:["old-claim"],region:{kind:"word",tag:"block:thesis",bookmark:"offroad_thesis"}}],inputs:[],outputs:[],formulas:[]};
const snapshot=(text:string):RoundtripSnapshot=>({manifest,manifestIssue:null,sha256:"b".repeat(64),entries:[{key:"block:thesis",blockKey:"thesis",role:"text",value:text,formula:null,locator:"word/body",claimIds:["old-claim"]}],unmatched:[]});
const base=()=>verifyRoundtripBase(snapshot("Original thesis"),{revisionId:id(2),logicalManifestFingerprint:manifest.logicalManifestFingerprint,sha256:"b".repeat(64)},{artifactId:id(1),revisionId:id(2),revisionNo:1,logicalManifestFingerprint:manifest.logicalManifestFingerprint});
const received:RoundtripSnapshot={manifest:null,manifestIssue:"missing_manifest",sha256:"c".repeat(64),entries:[],unmatched:[{locator:"word/body/p1",value:"Human changed thesis"}]};
function compare(current=snapshot("Original thesis")) {const b=base();return {comparison:compareRoundtrip(b,received,current),base:b,current};}
function matched(current?:RoundtripSnapshot){const input=compare(current);return applyArtifactManualMappings({...input,mappings:[{receivedKey:input.comparison.differences[0]!.key,blockKey:"thesis"}]});}
describe("explicit human artifact correspondence",()=>{
 it("turns loose text into a human proposal only under the exact matching choice and drops old support",()=>{
  const result=matched();expect(result.status).toBe("candidate");expect(result.baseManifest).toBe(manifest);
  expect(result.manifestIssue).toBe("missing_manifest");expect(result.differences[0]).toMatchObject({key:"block:thesis",classification:"edited",received:{claimIds:[]}});
  expect(extractContributions(result,manifest).blockProposals).toEqual([{blockKey:"thesis",content:{text:"Human changed thesis"},claims:[],supportIds:[],detachedClaimIds:["old-claim"]}]);
 });
 it("uses the current head in the three-way result rather than overwriting a concurrent edit",()=>{
  const result=matched({...snapshot("Concurrent thesis"),manifest:{...manifest,revisionId:id(3),revisionNo:2}});
  expect(result.differences[0]?.classification).toBe("conflict");expect(extractContributions(result,manifest).blockProposals).toEqual([]);
  const deleted=matched({...snapshot("Original thesis"),entries:[],manifest:{...manifest,revisionId:id(3),revisionNo:2,blocks:[]}});
  expect(deleted.differences[0]).toMatchObject({classification:"conflict",current:null});
  const already=matched({...snapshot("Human changed thesis"),manifest:{...manifest,revisionId:id(3),revisionNo:2}});
  expect(already.differences[0]?.alreadyPresent).toBe(true);expect(extractContributions(already,manifest).blockProposals).toEqual([]);
 });
 it("preserves exact captured JSON and rejects changed approved bindings or extra received metadata",()=>{
  expect(assertCapturedRoundtripManifest(snapshot("Original thesis"),structuredClone(manifest))).toEqual(manifest);
  expect(()=>assertCapturedRoundtripManifest(snapshot("Original thesis"),{...manifest,exportedAt:"2026-10-06T00:00:00.000Z"})).toThrow("receipt_manifest_changed");
  expect(()=>assertCapturedRoundtripManifest(snapshot("Original thesis"),{...manifest,unreviewed:true})).toThrow("receipt_manifest_changed");
 });
 it("refuses mapping numeric blocks, formulas, unsupported targets and duplicate choices",()=>{
  const input=compare(),mapping={receivedKey:input.comparison.differences[0]!.key,blockKey:"thesis"};
  expect(()=>applyArtifactManualMappings({...input,mappings:[mapping,mapping]})).toThrow("duplicate");
  expect(()=>applyArtifactManualMappings({...input,mappings:[{...mapping,blockKey:"unknown"}]})).toThrow("target_unverified");
  expect(()=>applyArtifactManualMappings({...input,comparison:{...input.comparison,baseManifest:{...manifest,blocks:[{...manifest.blocks[0]!,recorded:true}]}},mappings:[mapping]})).toThrow("recorded");
  expect(()=>applyArtifactManualMappings({...input,comparison:{...input.comparison,differences:input.comparison.differences.map(diff=>({...diff,received:diff.received?{...diff.received,formula:"1+1"}:null}))},mappings:[mapping]})).toThrow("mapping_invalid");
 });
 it("uses canonical text bodies when a legacy export has no physical binding, without changing its manifest",()=>{
  const empty={...snapshot("Original thesis"),entries:[],manifest:{...manifest,blocks:[]}};
  const b=verifyRoundtripBase(empty,{revisionId:id(2),logicalManifestFingerprint:manifest.logicalManifestFingerprint,sha256:empty.sha256},{artifactId:id(1),revisionId:id(2),revisionNo:1,logicalManifestFingerprint:manifest.logicalManifestFingerprint});
  const comparison=compareRoundtrip(b,received,empty);const draft={blockKey:"thesis",kind:"paragraph",content:{text:"Original thesis"},claims:[]};
  const result=applyArtifactManualMappings({comparison,base:b,current:empty,baseBlocks:[draft],currentBlocks:[draft],mappings:[{receivedKey:comparison.differences[0]!.key,blockKey:"thesis"}]});
  expect(result.baseManifest).toBe(empty.manifest);expect(result.baseManifest.blocks).toEqual([]);expect(extractContributions(result,result.baseManifest).blockProposals[0]?.claims).toEqual([]);
 });
 it("keeps first unmatched keys stable for reprocessing and bounds keys even for hostile long locators",()=>{
  const initial=unmatchedRoundtripDifferences(received);expect(initial.map(diff=>diff.key)).toEqual(compare().comparison.differences.map(diff=>diff.key));
  const long={...received,unmatched:[{locator:"x".repeat(10000),value:"Human text"}]};expect(unmatchedRoundtripDifferences(long)[0]!.key.length).toBeLessThanOrEqual(300);
 });
});
