import {createHash} from "node:crypto";
import {describe, expect, it, vi} from "vitest";
import type {SupabaseClient} from "@supabase/supabase-js";
import type {RoundtripManifest} from "@offroad/case-export/artifact-roundtrip";
import {processArtifactRoundtrip, type ArtifactRoundtripClaim} from "./artifact-roundtrip-processing";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const bytes = new Uint8Array([1, 2, 3]);
const sha = createHash("sha256").update(bytes).digest("hex");
const manifest: RoundtripManifest = {schemaVersion: "artifact-roundtrip.2026.09.26-v1", artifactId: id(6), revisionId: id(5), revisionNo: 1, logicalManifestFingerprint: "b".repeat(64), format: "docx", exportedAt: "2026-10-05T00:00:00.000Z", variant: "default", blocks: [], inputs: [], outputs: [], formulas: []};
const claim: ArtifactRoundtripClaim = {claimed: true, taskId: id(1), organizationId: id(2), workId: id(3), operation: "export", format: "docx", locale: "en-US", variant: "default", capabilityToken: "x".repeat(40), leaseExpiresAt: "2100-01-01T00:00:00Z", blocks: [], revision: {id: id(5), artifactId: id(6), revisionNo: 1, manifest: {}, manifestFingerprint: "a".repeat(64), logicalManifestFingerprint: "b".repeat(64), issuedAt: manifest.exportedAt}};

function port() {
  let validations = 0;
  const rpc = vi.fn(async (name: string): Promise<{error: null; data: unknown}> => ({error: null, data: name === "worker_claim_artifact_roundtrip_v1" ? claim : name === "worker_revalidate_artifact_roundtrip_v1" ? (validations++, {valid: true, storageObjectId: id(7)}) : name === "worker_prepare_artifact_export_storage_v1" ? {bucket: "case-artifacts", path: `${id(2)}/${id(3)}/roundtrip/${id(1)}/${sha}.docx`, sha256: sha, byteLength: bytes.length} : {completed: true}}));
  const upload = vi.fn().mockResolvedValue({data: {id: id(7)}, error: null});
  const download = vi.fn().mockResolvedValue({data: new Blob([bytes]), error: null});
  const from = vi.fn(() => ({upload, download}));
  const render = vi.fn().mockResolvedValue({bytes, manifest, templateFingerprint: null});
  const client = {rpc, storage: {from}} as unknown as SupabaseClient;
  return {rpc, upload, download, render, client, validations: () => validations, run: () => processArtifactRoundtrip({client, render, workerToken: "worker", scanner: null, signal: new AbortController().signal})};
}

describe("leased artifact roundtrip processor boundaries", () => {
  it("commits only after authenticated physical byte verification, without overwrite", async () => {
    const p = port(); expect(await p.run()).toBe("completed");
    expect(p.upload.mock.calls[0]?.[2]).toMatchObject({upsert: false, cacheControl: "0"});
    expect(p.validations()).toBeGreaterThanOrEqual(4);
    expect(p.rpc).toHaveBeenLastCalledWith("worker_commit_artifact_export_v1", expect.objectContaining({p_storage_object_id: id(7), p_roundtrip_manifest: manifest}));
  });
  it("denies changed physical bytes and never commits a receipt", async () => {
    const p = port(); p.download.mockResolvedValue({data: new Blob([new Uint8Array([3, 2, 1])]), error: null});
    await expect(p.run()).rejects.toThrow("bytes_changed");
    expect(p.rpc.mock.calls.some(([name]) => name === "worker_commit_artifact_export_v1")).toBe(false);
  });
  it("denies revocation after I/O and never commits or downgrades it to a successful task", async () => {
    const p = port(); p.download.mockImplementation(async () => {
      p.rpc.mockImplementation(async () => ({data: {valid: false}, error: null}));
      return {data: new Blob([bytes]), error: null};
    });
    await expect(p.run()).rejects.toThrow("source_revoked");
    expect(p.rpc.mock.calls.some(([name]) => name === "worker_commit_artifact_export_v1" || name === "worker_fail_artifact_roundtrip_v1")).toBe(false);
  });
  it("does not accept a different object on upload conflict", async () => {
    const p = port(); p.upload.mockResolvedValue({data: null, error: {statusCode: "409"}});
    p.download.mockResolvedValue({data: new Blob([new Uint8Array([3, 2, 1])]), error: null});
    await expect(p.run()).rejects.toThrow("bytes_changed");
    expect(p.rpc.mock.calls.some(([name]) => name === "worker_commit_artifact_export_v1")).toBe(false);
  });
  it("refuses a target outside the exact leased path before uploading", async () => {
    const p = port(); const previous = p.rpc.getMockImplementation()!;
    p.rpc.mockImplementation(async name => name === "worker_prepare_artifact_export_storage_v1" ? {error: null, data: {bucket: "case-artifacts", path: "other-tenant/file.docx", sha256: sha, byteLength: 3}} : previous(name));
    await expect(p.run()).rejects.toThrow("storage_scope_changed"); expect(p.upload).not.toHaveBeenCalled();
  });
  it("aborts before claiming any authority", async () => {
    const p = port(); const controller = new AbortController(); controller.abort();
    await expect(processArtifactRoundtrip({client: p.client, render: p.render, workerToken: "worker", scanner: null, signal: controller.signal})).rejects.toThrow("aborted");
    expect(p.rpc).not.toHaveBeenCalled();
  });
});

async function importPort(options:{clean?:boolean;withoutScanner?:boolean;wrongBinding?:boolean;changedReceipt?:boolean;revokeAfterScan?:boolean}={}) {
  const {materialToDocx}=await import("@offroad/case-export");
  const {embedRoundtripManifest}=await import("@offroad/case-export/artifact-roundtrip");
  const office=await embedRoundtripManifest(materialToDocx({material:{kind:"credit_memo",title:{pt:"Sintético",en:"Synthetic"},dependsOn:[],blocks:[{type:"paragraph",text:{pt:"Texto governado",en:"Governed text"},supportIds:[]}]},lang:"en",meta:{issuedOn:"2026-10-05"}}),manifest);
  const digest=createHash("sha256").update(office).digest("hex");
  const source={versionId:id(10),bucket:"opportunity-documents"as const,path:"synthetic/received.docx",sha256:digest,byteLength:office.length,binding:{organizationId:options.wrongBinding?id(99):claim.organizationId,sourceDocumentId:id(10),documentVersion:1,expectedSha256:digest,expectedByteSize:office.length,originalName:"synthetic.docx",declaredMediaType:"application/vnd.openxmlformats-officedocument.wordprocessingml.document",operationId:claim.taskId}};
  const scanned:ArtifactRoundtripClaim={...claim,operation:"import",importCandidate:{id:id(11),artifactId:id(6),source,baseReceipt:{id:id(12),revisionId:id(5),logicalManifestFingerprint:manifest.logicalManifestFingerprint,sha256:digest,byteLength:office.length,format:"docx",roundtripManifest:options.changedReceipt?{...manifest,variant:"changed"}:manifest,storage:{bucket:"case-artifacts",path:"synthetic/base.docx"}},headRevision:claim.revision!}};
  const initial:ArtifactRoundtripClaim={...claim,operation:"import_scan",revision:null,blocks:[],importCandidate:{id:id(11),artifactId:id(6),source}};
  let quarantined=false,revoked=false;
  const rpc=vi.fn(async(name:string,_args?:Record<string,unknown>):Promise<{data:unknown;error:null}>=>{
    if(name==="worker_claim_artifact_roundtrip_v1")return {data:initial,error:null};
    if(name==="worker_record_artifact_import_quarantine_v1"){quarantined=true;return {data:{status:"clean"},error:null};}
    if(name==="worker_revalidate_artifact_roundtrip_v1")return {data:{valid:!revoked,context:quarantined?scanned:initial},error:null};
    return {data:{completed:true},error:null};
  });
  const download=vi.fn().mockResolvedValue({data:new Blob([Buffer.from(office)]),error:null});
  const client={rpc,storage:{from:vi.fn(()=>({download}))}}as unknown as SupabaseClient;
  const scan=vi.fn(async()=>{if(options.revokeAfterScan)revoked=true;return {clean:options.clean!==false};});
  const render=vi.fn();
  return {rpc,download,scan,run:()=>processArtifactRoundtrip({client,workerToken:"worker",scanner:options.withoutScanner?null:{name:"synthetic-scanner",scan},render,signal:new AbortController().signal})};
}
describe("scanned import and captured SQL context integration",()=>{
  it("parses only after the clean receipt and refreshed import context, preserving the captured manifest",async()=>{
    const p=await importPort();expect(await p.run()).toBe("completed");expect(p.scan).toHaveBeenCalledOnce();
    const names=p.rpc.mock.calls.map(([name])=>name);expect(names.indexOf("worker_record_artifact_import_quarantine_v1")).toBeLessThan(names.indexOf("worker_commit_artifact_import_comparison_v1"));
    const committed=p.rpc.mock.calls.find(([name])=>name==="worker_commit_artifact_import_comparison_v1");expect(committed?.[1]?.p_comparison).toMatchObject({status:"candidate",baseManifest:manifest});
  });
  it.each([{withoutScanner:true},{clean:false}])("denies unavailable or infected scanner before any comparison %#",async options=>{
    const p=await importPort(options);await expect(p.run()).rejects.toThrow("invalid_file");expect(p.rpc.mock.calls.some(([name])=>name==="worker_record_artifact_import_quarantine_v1"||name==="worker_commit_artifact_import_comparison_v1")).toBe(false);
  });
  it("denies a substituted organization in the scan binding before scanning",async()=>{
    const p=await importPort({wrongBinding:true});await expect(p.run()).rejects.toThrow("scan_binding_changed");expect(p.scan).not.toHaveBeenCalled();
  });
  it("denies captured manifest substitution even when base bytes and SHA are intact",async()=>{
    const p=await importPort({changedReceipt:true});await expect(p.run()).rejects.toThrow("receipt_manifest_changed");expect(p.rpc.mock.calls.some(([name])=>name==="worker_commit_artifact_import_comparison_v1")).toBe(false);
  });
  it("denies revocation during scanning before parsing or committing comparison",async()=>{
    const p=await importPort({revokeAfterScan:true});await expect(p.run()).rejects.toThrow();expect(p.rpc.mock.calls.some(([name])=>name==="worker_commit_artifact_import_comparison_v1")).toBe(false);
  });
});
