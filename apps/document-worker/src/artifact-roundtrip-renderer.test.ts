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
  const disguisedHouse={...identity,manifest:{...(identity.manifest as Record<string,unknown>),template:{templateVersionId:"offroad-house@2026.09.07-v1",fingerprint:"e".repeat(64)}}};
  await expect(renderer(c,disguisedHouse)).rejects.toThrow("template_fingerprint_changed");
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

it("preserves exact financial_model XLSX from a material package instead of rejecting that family",async()=>{
 const {readFile}=await import("node:fs/promises");const artifact=parseVerifiedInstitutionalWorkbookArtifact(JSON.parse(await readFile(new URL("../../../packages/financial-model/src/institutional-workbook-v1.fixture.json",import.meta.url),"utf8")));
 const financialMaterial={...material,kind:"financial_model",artifactFingerprint:artifact!.fingerprint};
 const c={...claim("xlsx"),variant:"financial_model",producer:{kind:"material_package",materials:[financialMaterial],financialModel:artifact,sourceRowId:id(4)}};
 const result=await createArtifactRoundtripRenderer(port().client)(c,c.revision);const snapshot=await readRoundtripSnapshot(result.bytes,"xlsx");
 expect(snapshot.manifest?.logicalManifestFingerprint).toBe(c.revision!.logicalManifestFingerprint);expect(snapshot.entries.some(entry=>entry.role==="input")).toBe(true);
 await expect(createArtifactRoundtripRenderer(port().client)({...c,producer:{...c.producer,materials:[{...financialMaterial,artifactFingerprint:"e".repeat(64)}]}},c.revision)).rejects.toThrow("calculation_divergence");
});
it("replays a stored full financial model under its approved bytes before adding roundtrip names",async()=>{
 const {toXlsxBuffer}=await import("@offroad/financial-model");
 const model={sheets:[{key:"calculations",name:{pt:"Cálculos",en:"Calculations"},widths:[25,20],rows:[{key:"base",cells:[{role:"label" as const,value:"Principal"},{role:"input" as const,value:1250}]},{key:"derived",cells:[{role:"label" as const,value:"Recorded calculation"},{role:"formula" as const,formula:"B1*2"}]}]}],periods:["2026"],deskAssumptions:[]};
 const pt=toXlsxBuffer(model,"pt"),en=toXlsxBuffer(model,"en");
 const financialModel={model,fingerprint:"e".repeat(64),workbooks:{pt:{sha256:roundtripSha256(pt),byteSize:pt.length},en:{sha256:roundtripSha256(en),byteSize:en.length}}};
 const c={...claim("xlsx"),variant:"default",producer:{kind:"work_product",artifactType:"financial_model",sourceRowId:id(4),content:{financialModel}}};
 const result=await createArtifactRoundtripRenderer(port().client)(c,c.revision);const snapshot=await readRoundtripSnapshot(result.bytes,"xlsx");
 expect(snapshot.entries.some(entry=>entry.role==="formula")).toBe(true);expect(snapshot.manifest?.inputs).toEqual([]);expect(snapshot.entries.some(entry=>entry.role==="recorded")).toBe(true);
 await expect(createArtifactRoundtripRenderer(port().client)({...c,producer:{...c.producer,content:{financialModel:{...financialModel,model:{...model,deskAssumptions:["Changed body"]}}}}},c.revision)).rejects.toThrow("calculation_divergence");
});
it("uses the existing decision workbook renderer for an actual fingerprinted work product contract",async()=>{
 const {buildDecisionArtifactContract}=await import("@offroad/case-understanding");
 const contract=buildDecisionArtifactContract({schemaVersion:"2026.09.07-v1",caseId:"synthetic-decision",snapshotFingerprint:"a".repeat(64),asOf:"2026-10-05",status:"draft",release:{state:"internal_only",recipientIds:[]},sources:[],assumptions:[],gaps:[],claims:[{id:"recorded-debt",label:"Recorded debt",value:1250,unit:"BRL",evidenceState:"observed_private",object:{id:"source-result",type:"financial_position",fingerprint:"b".repeat(64),path:"debt"},sourceIds:[],assumptionIds:[],gapIds:[]}],views:[{surface:"workbook",artifactId:"workbook",artifactKind:"xlsx",artifactFingerprint:null,blocks:[{id:"debt",kind:"metric",title:"Recorded debt",claimIds:["recorded-debt"],sourceIds:[],assumptionIds:[],gapIds:[]}]}],identityRequirements:[]});
 const c={...claim("xlsx"),variant:"default",producer:{kind:"work_product",artifactType:"preview_decision_contract",sourceRowId:id(4),content:contract}};
 const result=await createArtifactRoundtripRenderer(port().client)(c,c.revision);const snapshot=await readRoundtripSnapshot(result.bytes,"xlsx");
 expect(snapshot.entries.some(entry=>entry.role==="formula")).toBe(true);expect(snapshot.manifest?.inputs).toEqual([]);expect(snapshot.entries.some(entry=>entry.role==="recorded"&&entry.value?.includes("Recorded debt"))).toBe(true);
});

it("hydrates native material only from the two leased retained bodies and rejects mismatch or expiry",async()=>{
 const packageValue={schemaVersion:"2026.08.29-v1",materials:[material],financialModel:null,materialTruth:{synthetic:true}};
 const stateValue={materials:[material],financialModel:null,materialTruth:{synthetic:true}};
 const encode=(value:unknown)=>new TextEncoder().encode(JSON.stringify(value));
 const packageBytes=encode(packageValue),stateBytes=encode(stateValue);
 const body=(bytes:Uint8Array,path:string)=>({retainedPayloadId:id(30),allocationId:id(31),storage:{bucket:"capital-input-capture",path},sha256:roundtripSha256(bytes),byteLength:bytes.length,storageObjectId:id(32),storageVersion:"exact-synthetic-version",expiresAt:"2100-01-01T00:00:00Z"});
 const producer={kind:"native_material",recipeId:id(33),variants:["credit_memo"],archetypeId:null,packageBody:body(packageBytes,"owned/package.json"),stateBody:body(stateBytes,"owned/state.json")};
 const c={...claim(),producer};const p=port();const download=vi.fn(async(path:string)=>({data:new Blob([path==="owned/package.json"?packageBytes:stateBytes]),error:null}));
 const client={...p.client,storage:{from:vi.fn((bucket:string)=>{expect(bucket).toBe("capital-input-capture");return{download};})}} as unknown as SupabaseClient;
 const result=await createArtifactRoundtripRenderer(client)(c,c.revision);expect((await readRoundtripSnapshot(result.bytes,"docx")).entries[0]?.value).toContain("Base text");expect(download).toHaveBeenCalledTimes(2);
 const badState=encode({...stateValue,materials:[{...material,title:{pt:"Outro",en:"Changed"}}]});
 const changed={...c,producer:{...producer,stateBody:body(badState,"owned/state.json")}};
 download.mockImplementation(async(path:string)=>({data:new Blob([path==="owned/package.json"?packageBytes:badState]),error:null}));
 await expect(createArtifactRoundtripRenderer(client)(changed,changed.revision)).rejects.toThrow("native_body_mismatch");
 await expect(createArtifactRoundtripRenderer(client)({...c,producer:{...producer,packageBody:{...producer.packageBody,expiresAt:"2020-01-01T00:00:00Z"}}},c.revision)).rejects.toThrow("source_revoked");
 download.mockImplementation(async()=>({data:new Blob([new Uint8Array(packageBytes.length)]),error:null}));
 await expect(createArtifactRoundtripRenderer(client)(c,c.revision)).rejects.toThrow("bytes_changed");
});
it("renders an exact immutable template version and rejects swapped body or canonical digest",async()=>{
 const {offroadHouseTemplateDefinition,offroadHousePresentationStructure,presentationTemplateToStored,presentationStructureToStored}=await import("@offroad/case-export");
 const definition=presentationTemplateToStored({...offroadHouseTemplateDefinition,templateKey:"synthetic-client",origin:"client_supplied",colors:{...offroadHouseTemplateDefinition.colors,accent:"112233"}});
 const structure=presentationStructureToStored(offroadHousePresentationStructure);
 const canonicalFingerprintInput=JSON.stringify({definition,structure}),fingerprint=roundtripSha256(canonicalFingerprintInput);
 const c={...claim(),templateBody:{versionId:id(90),fingerprint,definition,structure,canonicalFingerprintInput}};
 const identity={...c.revision!,manifest:{...(c.revision!.manifest as Record<string,unknown>),template:{templateVersionId:id(90),fingerprint}}};
 const result=await createArtifactRoundtripRenderer(port().client)(c,identity);expect(result.templateFingerprint).toBe(fingerprint);
 expect((await extractRoundtripManifest(result.bytes,"docx")).manifest?.revisionId).toBe(identity.id);
 await expect(createArtifactRoundtripRenderer(port().client)({...c,templateBody:{...c.templateBody,definition:{...definition,template_key:"swapped"}}},identity)).rejects.toThrow("template_fingerprint_changed");
 await expect(createArtifactRoundtripRenderer(port().client)({...c,templateBody:{...c.templateBody,canonicalFingerprintInput:"{}"}},identity)).rejects.toThrow("template_fingerprint_changed");
 await expect(createArtifactRoundtripRenderer(port().client)({...c,templateBody:{...c.templateBody,versionId:id(91)}},identity)).rejects.toThrow("template_unavailable");
});
it("checks the actual builtin template fingerprint rather than trusting its version label",async()=>{
 const {houseDocumentTemplate}=await import("@offroad/case-export");const {fingerprintJson}=await import("@offroad/case-understanding");const t=houseDocumentTemplate;
 const fingerprint=fingerprintJson({id:t.id,version:t.version,origin:t.origin,colors:t.colors,fonts:t.fonts,logo:null,logoOnDark:null});const c=claim();
 const identity={...c.revision!,manifest:{...(c.revision!.manifest as Record<string,unknown>),template:{templateVersionId:`${t.id}@${t.version}`,fingerprint}}};
 expect((await createArtifactRoundtripRenderer(port().client)(c,identity)).templateFingerprint).toBe(fingerprint);
});
it("requires the exact pinned logo bytes and current lease before and after Storage",async()=>{
 const {offroadHouseTemplateDefinition,offroadHousePresentationStructure,presentationTemplateToStored,presentationStructureToStored}=await import("@offroad/case-export");
 const logo=new Uint8Array([1,2,3,4]);const definition=presentationTemplateToStored({...offroadHouseTemplateDefinition,logo:{objectPath:"synthetic/logo.png",sha256:roundtripSha256(logo),byteLength:logo.length,contentType:"image/png"}});
 const structure=presentationStructureToStored(offroadHousePresentationStructure),canonicalFingerprintInput=JSON.stringify({definition,structure}),fingerprint=roundtripSha256(canonicalFingerprintInput);
 const c={...claim(),templateBody:{versionId:id(90),fingerprint,definition,structure,canonicalFingerprintInput}};
 const identity={...c.revision!,manifest:{...(c.revision!.manifest as Record<string,unknown>),template:{templateVersionId:id(90),fingerprint}}};
 const p=port();p.download.mockResolvedValue({data:new Blob([logo]),error:null});await createArtifactRoundtripRenderer(p.client)(c,identity);expect(p.from).toHaveBeenCalledWith("brand-templates");expect(p.download).toHaveBeenCalledWith("synthetic/logo.png");
 const corrupt=port();corrupt.download.mockResolvedValue({data:new Blob([new Uint8Array([4,3,2,1])]),error:null});await expect(createArtifactRoundtripRenderer(corrupt.client)(c,identity)).rejects.toThrow("template_logo_changed");
 const revoked=port();revoked.download.mockResolvedValue({data:new Blob([logo]),error:null});revoked.rpc.mockResolvedValueOnce({data:{valid:true},error:null}).mockResolvedValueOnce({data:{valid:false},error:null});await expect(createArtifactRoundtripRenderer(revoked.client)(c,identity)).rejects.toThrow("source_revoked");
});
it("exports the actual native compiler term sheet to PPTX with every structural block bound",async()=>{
 const {buildMaterialCompilerReadyFixture}=await import("./testing/material-compiler-ready-fixture");
 const {bundle}=await buildMaterialCompilerReadyFixture({sessionId:id(70),runId:id(71)});
 const encode=(value:unknown)=>new TextEncoder().encode(JSON.stringify(value));
 const packageBytes=encode(bundle.materialPackage),stateBytes=encode(bundle.caseState);
 const body=(bytes:Uint8Array,path:string)=>({retainedPayloadId:id(72),allocationId:id(73),storage:{bucket:"capital-input-capture",path},sha256:roundtripSha256(bytes),byteLength:bytes.length,storageObjectId:id(74),storageVersion:"exact-synthetic-version",expiresAt:"2100-01-01T00:00:00Z"});
 const c={...claim("pptx"),variant:"term_sheet",producer:{kind:"native_material",recipeId:id(75),variants:["term_sheet"],archetypeId:"other",packageBody:body(packageBytes,"owned/package.json"),stateBody:body(stateBytes,"owned/state.json")}};
 const p=port();p.download.mockImplementation(async(path:string)=>({data:new Blob([path==="owned/package.json"?packageBytes:stateBytes]),error:null}));
 const rendered=await createArtifactRoundtripRenderer(p.client)(c,c.revision);
 const extracted=await extractRoundtripManifest(rendered.bytes,"pptx");expect(extracted.issue).toBeNull();
 expect(extracted.manifest?.blocks.length).toBeGreaterThan(0);
 expect((await readRoundtripSnapshot(rendered.bytes,"pptx")).entries.length).toBe(extracted.manifest?.blocks.length);
});
it("exports the actual native compiler financial model with null archetype only under approved workbook bytes",async()=>{
 const {buildMaterialCompilerReadyFixture}=await import("./testing/material-compiler-ready-fixture");
 const {bundle}=await buildMaterialCompilerReadyFixture({sessionId:id(80),runId:id(81)});
 const encode=(value:unknown)=>new TextEncoder().encode(JSON.stringify(value));
 const packageBytes=encode(bundle.materialPackage),stateBytes=encode(bundle.caseState);
 const body=(bytes:Uint8Array,path:string)=>({retainedPayloadId:id(82),allocationId:id(83),storage:{bucket:"capital-input-capture",path},sha256:roundtripSha256(bytes),byteLength:bytes.length,storageObjectId:id(84),storageVersion:"exact-synthetic-version",expiresAt:"2100-01-01T00:00:00Z"});
 const c={...claim("xlsx"),variant:"financial_model",producer:{kind:"native_material",recipeId:id(85),variants:["financial_model"],archetypeId:null,packageBody:body(packageBytes,"owned/package.json"),stateBody:body(stateBytes,"owned/state.json")}};
 const p=port();p.download.mockImplementation(async(path:string)=>({data:new Blob([path==="owned/package.json"?packageBytes:stateBytes]),error:null}));
 const rendered=await createArtifactRoundtripRenderer(p.client)(c,c.revision);
 const extracted=await extractRoundtripManifest(rendered.bytes,"xlsx");expect(extracted.issue).toBeNull();
 expect(extracted.manifest?.logicalManifestFingerprint).toBe(c.revision!.logicalManifestFingerprint);
 expect((await readRoundtripSnapshot(rendered.bytes,"xlsx")).entries.length).toBeGreaterThan(0);
 const renderedPt=await createArtifactRoundtripRenderer(p.client)({...c,locale:"pt-BR"},c.revision);
 expect((await extractRoundtripManifest(renderedPt.bytes,"xlsx")).issue).toBeNull();
 const changedPackage=structuredClone(bundle.materialPackage) as Record<string,unknown>;
 const changedState=structuredClone(bundle.caseState) as Record<string,unknown>;
 for(const value of [changedPackage,changedState]){
  const model=value.financialModel as {inputs:{amount:string}};
  model.inputs.amount="12345678";
 }
 const changedPackageBytes=encode(changedPackage),changedStateBytes=encode(changedState);
 p.download.mockImplementation(async(path:string)=>({data:new Blob([path==="owned/package.json"?changedPackageBytes:changedStateBytes]),error:null}));
 const changed={...c,producer:{...c.producer,packageBody:body(changedPackageBytes,"owned/package.json"),stateBody:body(changedStateBytes,"owned/state.json")}};
 await expect(createArtifactRoundtripRenderer(p.client)(changed,changed.revision)).rejects.toThrow("calculation_divergence");
 const badPackage=structuredClone(bundle.materialPackage) as Record<string,unknown>;
 const badState=structuredClone(bundle.caseState) as Record<string,unknown>;
 for(const value of [badPackage,badState]) (value.financialModel as {workbooks:{en:{sha256:string}}}).workbooks.en.sha256="e".repeat(64);
 const badPackageBytes=encode(badPackage),badStateBytes=encode(badState);
 p.download.mockImplementation(async(path:string)=>({data:new Blob([path==="owned/package.json"?badPackageBytes:badStateBytes]),error:null}));
 const invalidHash={...c,producer:{...c.producer,packageBody:body(badPackageBytes,"owned/package.json"),stateBody:body(badStateBytes,"owned/state.json")}};
 await expect(createArtifactRoundtripRenderer(p.client)(invalidHash,invalidHash.revision)).rejects.toThrow("calculation_divergence");
});
