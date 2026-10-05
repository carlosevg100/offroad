import {readFileSync} from "node:fs";
import {describe,it,expect,vi} from "vitest";
import type {SupabaseClient} from "@supabase/supabase-js";
import {extractRoundtripManifest,readRoundtripSnapshot,roundtripSha256,verifyRoundtripBase,compareRoundtrip} from "@offroad/case-export/artifact-roundtrip";
import {parseVerifiedInstitutionalWorkbookArtifact} from "@offroad/financial-model";
import {materialToDocx} from "@offroad/case-export";
import type {Material} from "@offroad/case-materials";
import {createArtifactRoundtripRenderer} from "./artifact-roundtrip-renderer";
import type {ArtifactRoundtripClaim} from "./artifact-roundtrip-processing";
const id=(n:number)=>`00000000-0000-4000-8000-${n.toString().padStart(12,"0")}`;
const material:Material={kind:"credit_memo",title:{pt:"Sintético",en:"Synthetic"},dependsOn:[],blocks:[{type:"paragraph",text:{pt:"Texto de base",en:"Base text"},supportIds:[]},{type:"table",caption:{pt:"Valores",en:"Values"},head:[{pt:"Métrica",en:"Metric"},{pt:"Valor",en:"Value"}],rows:[["EBITDA","100.25"]]}]};
function claim(format:ArtifactRoundtripClaim["format"]="docx"):ArtifactRoundtripClaim {
 return {claimed:true,taskId:id(1),organizationId:id(2),workId:id(3),operation:"export",format,locale:"en-US",variant:"credit_memo",capabilityToken:"x".repeat(40),leaseExpiresAt:"2100-01-01T00:00:00Z",blocks:[],producer:{kind:"material_package",materials:[material],financialModel:null,sourceRowId:id(4)},
 revision:{id:id(5),artifactId:id(6),revisionNo:1,manifestFingerprint:"a".repeat(64),logicalManifestFingerprint:"b".repeat(64),issuedAt:"2026-10-05T00:00:00Z",manifest:{schemaVersion:"artifact-manifest.2026.09.26-v1",kind:"material",audience:"internal",format:null,bytes:null,method:null,execution:null,inputSnapshot:null,institutionalResult:null,sources:[],claims:[],traces:[],template:null,provenance:{producer:"synthetic",jobId:null,taskRunId:null,messageId:null,capability:null},legacy:null}}};
}
function port(){const rpc=vi.fn().mockResolvedValue({data:{valid:true},error:null});const download=vi.fn();const from=vi.fn(()=>({download}));return {rpc,download,from,client:{rpc,storage:{from}}as unknown as SupabaseClient};}
describe("authorized prospective artifact roundtrip renderer",()=>{
 it("captures positional mapping from fixed producer without inventing historical claims",async()=>{
  const p=port();const c=claim();const result=await createArtifactRoundtripRenderer(p.client)(c,c.revision);
  const snapshot=await readRoundtripSnapshot(result.bytes,"docx");
  expect(snapshot.manifest?.blocks.map(block=>block.blockKey)).toEqual(["export.credit_memo.b0","export.credit_memo.b1"]);
  expect(snapshot.manifest?.blocks.map(block=>block.recorded)).toEqual([false,true]);
  expect(snapshot.manifest?.blocks.every(block=>block.claimIds.length===0)).toBe(true);
  expect(snapshot.entries[0]?.value).toBe("Base text");
  expect(p.download).not.toHaveBeenCalled();expect(p.rpc.mock.calls.every(call=>call[0]==="worker_revalidate_artifact_roundtrip_v1")).toBe(true);
 });
 it("renders a person contribution over its exact parent instead of returning old body",async()=>{
  const p=port();const c=claim();const renderer=createArtifactRoundtripRenderer(p.client);const first=await renderer(c,c.revision);
  const head={...c.revision!,id:id(8),revisionNo:2,logicalManifestFingerprint:"c".repeat(64)};
  const imported={...c,operation:"import"as const,importCandidate:{id:id(9),artifactId:id(6),source:{versionId:id(10),bucket:"opportunity-documents"as const,path:"synthetic",sha256:"d".repeat(64),byteLength:1},headRevision:head,headBlocks:[],headProducer:{kind:"composite",parentRevisionId:id(5),parent:c.producer,importCandidateId:id(9),overlays:[{blockKey:"export.credit_memo.b0",kind:"paragraph",content:{text:"Human contribution"},claims:[]}]}}};
  const second=await renderer(imported,head);const old=await readRoundtripSnapshot(first.bytes,"docx");const current=await readRoundtripSnapshot(second.bytes,"docx");
  expect(current.entries[0]?.value).toBe("Human contribution");expect(old.entries[0]?.value).toBe("Base text");
  const base=verifyRoundtripBase(old,{revisionId:id(5),logicalManifestFingerprint:"b".repeat(64),sha256:old.sha256},{artifactId:id(6),revisionId:id(5),revisionNo:1,logicalManifestFingerprint:"b".repeat(64)});
  expect(compareRoundtrip(base,old,current).differences[0]?.classification).toBe("unchanged");
 });
 it("refuses recorded overlays, unsupported variants and unavailable pinned templates",async()=>{
  const p=port();const c=claim();const renderer=createArtifactRoundtripRenderer(p.client);
  const changed={...c,producer:{kind:"composite",parentRevisionId:id(7),parent:c.producer,importCandidateId:id(9),overlays:[{blockKey:"export.credit_memo.b1",kind:"table",content:{text:"changed output"},claims:[]}]}};
  await expect(renderer(changed,c.revision)).rejects.toThrow("recorded_overlay_denied");
  await expect(renderer({...c,variant:"absent"},c.revision)).rejects.toThrow("variant_unsupported");
  const identity={...c.revision!,manifest:{...(c.revision!.manifest as Record<string,unknown>),template:{templateVersionId:id(12),fingerprint:"e".repeat(64)}}};
  await expect(renderer(c,identity)).rejects.toThrow("template_unavailable");
 });
 it("hashes and revalidates a stored object before and after I/O, without a raw URL",async()=>{
  const bytes=materialToDocx({material,lang:"en",meta:{issuedOn:"2026-10-05"}});const c={...claim(),variant:"default",producer:{kind:"stored",storage:{bucket:"case-artifacts",path:"owned/exact.docx"},sha256:roundtripSha256(bytes),byteLength:bytes.byteLength,sourceFormat:"docx"}};
  const p=port();p.download.mockResolvedValue({data:new Blob([Buffer.from(bytes)]),error:null});
  const result=await createArtifactRoundtripRenderer(p.client)(c,c.revision);
  expect((await extractRoundtripManifest(result.bytes,"docx")).manifest?.revisionId).toBe(id(5));
  expect(p.from).toHaveBeenCalledWith("case-artifacts");expect(p.download).toHaveBeenCalledWith("owned/exact.docx");expect(p.rpc).toHaveBeenCalledTimes(4);
  const denied=port();denied.download.mockResolvedValue({data:new Blob([Buffer.from(bytes)]),error:null});denied.rpc.mockResolvedValueOnce({data:{valid:true},error:null}).mockResolvedValueOnce({data:{valid:false},error:null});
  await expect(createArtifactRoundtripRenderer(denied.client)(c,c.revision)).rejects.toThrow("source_revoked");
  const corrupt=port();corrupt.download.mockResolvedValue({data:new Blob([new Uint8Array(bytes.length)]),error:null});
  await expect(createArtifactRoundtripRenderer(corrupt.client)(c,c.revision)).rejects.toThrow("bytes_changed");
 });
 it("replays the same approved institutional economics in four formats under the SQL logical identity",async()=>{
  const raw:unknown=JSON.parse(readFileSync(new URL("../../../packages/financial-model/src/institutional-workbook-v1.fixture.json",import.meta.url),"utf8"));
  const artifact=parseVerifiedInstitutionalWorkbookArtifact(raw);expect(artifact).not.toBeNull();
  const p=port();const renderer=createArtifactRoundtripRenderer(p.client);
  for(const format of ["xlsx","docx","pptx","pdf"] as const){
   const c={...claim(format),variant:"default",producer:{kind:"institutional",artifact,resultId:id(20),configurationId:artifact!.institutional.activeScenarioId}};
   const result=await renderer(c,c.revision);const extracted=await extractRoundtripManifest(result.bytes,format);
   expect(extracted.issue).toBeNull();expect(extracted.manifest?.logicalManifestFingerprint).toBe("b".repeat(64));
   if(format==="xlsx"){
    const manifest=extracted.manifest!;expect(manifest.inputs.length).toBeGreaterThan(0);expect(manifest.inputs.every(input=>input.configurationId&&input.approved!==undefined)).toBe(true);
    const snapshot=await readRoundtripSnapshot(result.bytes,"xlsx");expect(()=>verifyRoundtripBase(snapshot,{revisionId:id(5),logicalManifestFingerprint:"b".repeat(64),sha256:snapshot.sha256},{artifactId:id(6),revisionId:id(5),revisionNo:1,logicalManifestFingerprint:"b".repeat(64)})).not.toThrow();
   }
  }
 });
 it("refuses recursive ancestry cycles",async()=>{
  const c=claim();const overlay={blockKey:"export.credit_memo.b0",kind:"paragraph",content:{text:"Human"},claims:[]};
  const nested={kind:"composite",parentRevisionId:id(7),parent:{kind:"composite",parentRevisionId:id(7),parent:c.producer,overlays:[overlay],importCandidateId:id(9)},overlays:[overlay],importCandidateId:id(9)};
  await expect(createArtifactRoundtripRenderer(port().client)({...c,producer:nested},c.revision)).rejects.toThrow("ancestry_cycle");
 });
});
