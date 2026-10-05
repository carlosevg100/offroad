import {createHash} from "node:crypto";
import type {SupabaseClient} from "@supabase/supabase-js";
import {z} from "zod";
import {quarantineDocumentBindingSchema} from "@offroad/document-intelligence";
import {compareRoundtrip, extractContributions, readRoundtripSnapshot, verifyRoundtripBase, type RoundtripSnapshot, type RoundtripManifest} from "@offroad/case-export/artifact-roundtrip";
import {runGovernedGate, type Scanner} from "./scan";
import {artifactManualMappingsSchema, assertCapturedRoundtripManifest, applyArtifactManualMappings, unmatchedRoundtripDifferences} from "./artifact-roundtrip-manual-mapping";

const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const hex = z.string().regex(/^[a-f0-9]{64}$/);
const storage = z.object({bucket:z.enum(["case-artifacts","opportunity-documents"]),path:z.string().min(1).max(1024)});
const revision = z.object({id:z.uuid(),artifactId:z.uuid(),revisionNo:z.number().int().positive(),manifest:z.unknown(),manifestFingerprint:hex,logicalManifestFingerprint:hex,issuedAt:z.string().min(1)});
const receipt = z.object({id:z.uuid(),revisionId:z.uuid(),logicalManifestFingerprint:hex,sha256:hex,byteLength:z.number().int().positive().max(104857600),format:z.enum(["xlsx","docx","pptx"]),roundtripManifest:z.unknown().refine(value=>value!==null&&typeof value==="object"),storage});
const imported = z.object({id:z.uuid(),artifactId:z.uuid(),expectedHeadRevisionId:z.uuid().optional(),manualMappings:artifactManualMappingsSchema.optional(),source:z.object({versionId:z.uuid(),bucket:z.literal("opportunity-documents"),path:z.string().min(1),sha256:hex,byteLength:z.number().int().positive().max(52428800),binding:quarantineDocumentBindingSchema.optional()}),baseReceipt:receipt.nullable().optional(),headRevision:revision.optional(),headBlocks:z.array(z.unknown()).optional(),headProducer:z.unknown().optional(),headTemplateBody:z.unknown().optional()});
export const artifactRoundtripClaimSchema = z.object({claimed:z.literal(true),taskId:z.uuid(),organizationId:z.uuid(),workId:z.uuid(),operation:z.enum(["export","import","import_scan"]),format:z.enum(["xlsx","docx","pptx","pdf"]),locale:z.enum(["pt-BR","en-US"]),variant:z.string().min(1).optional(),capabilityToken:z.string().min(32),leaseExpiresAt:z.string(),revision:revision.nullable(),blocks:z.array(z.unknown()),producer:z.unknown().optional(),templateBody:z.unknown().optional(),importCandidate:imported.optional()});
export type ArtifactRoundtripClaim = z.infer<typeof artifactRoundtripClaimSchema>;
export type RoundtripRenderer = (claim: ArtifactRoundtripClaim, identity: ArtifactRoundtripClaim["revision"]) => Promise<{bytes:Uint8Array;templateFingerprint:string|null;manifest:RoundtripManifest}>;

/** One leased operation, using the worker's ordinary authenticated identity. No service key,
 * model call, user-supplied URL or computed Office result enters this consumer. */
export async function processArtifactRoundtrip(input:{client:SupabaseClient;workerToken:string;scanner:Scanner|null;render:RoundtripRenderer;signal:AbortSignal}):Promise<"idle"|"completed"> {
 const {client}=input;
 const rpc = async (name:string,args:Record<string,unknown>) => {
  if(input.signal.aborted)throw new Error("artifact_roundtrip_aborted");
  const result=await client.rpc(name,args);if(result.error)throw new Error("artifact_roundtrip_authority_denied");return result.data as unknown;
 };
 const raw=await rpc("worker_claim_artifact_roundtrip_v1",{p_worker_token:input.workerToken});
 if(z.object({claimed:z.literal(false)}).safeParse(raw).success)return "idle";
 let claim=artifactRoundtripClaimSchema.parse(raw);
 const scope={p_task_id:claim.taskId,p_capability_token:claim.capabilityToken};
 const revalidate=async()=>{
  const data=await rpc("worker_revalidate_artifact_roundtrip_v1",scope);
  const checked=z.object({valid:z.literal(true)}).safeParse(data);
  if(!checked.success || Date.parse(claim.leaseExpiresAt)<=Date.now())throw new Error("artifact_roundtrip_source_revoked");
 };
 const read=async(s:z.infer<typeof storage>,expected:{sha256:string;byteLength:number})=>{
  await revalidate();const response=await client.storage.from(s.bucket).download(s.path);
  if(response.error||!response.data||response.data.size!==expected.byteLength)throw new Error("artifact_roundtrip_missing_base");
  const bytes=new Uint8Array(await response.data.arrayBuffer());
  if(bytes.byteLength!==expected.byteLength||hash(bytes)!==expected.sha256)throw new Error("artifact_roundtrip_bytes_changed");
  await revalidate();return bytes;
 };
 try {
  if(claim.operation==="export") {
   await revalidate();const rendered=await input.render(claim,claim.revision);await revalidate();
   const target=z.object({bucket:z.literal("case-artifacts"),path:z.string(),sha256:hex,byteLength:z.number().int().positive()}).parse(await rpc("worker_prepare_artifact_export_storage_v1",{...scope,p_sha256:hash(rendered.bytes),p_byte_length:rendered.bytes.byteLength}));
   const expectedPath=`${claim.organizationId}/${claim.workId}/roundtrip/${claim.taskId}/${hash(rendered.bytes)}.${claim.format}`;
   if(target.path!==expectedPath||target.sha256!==hash(rendered.bytes)||target.byteLength!==rendered.bytes.byteLength)throw new Error("artifact_roundtrip_storage_scope_changed");
   const uploaded=await client.storage.from(target.bucket).upload(target.path,rendered.bytes,{upsert:false,contentType:({xlsx:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",docx:"application/vnd.openxmlformats-officedocument.wordprocessingml.document",pptx:"application/vnd.openxmlformats-officedocument.presentationml.presentation",pdf:"application/pdf"})[claim.format],cacheControl:"0"});
   if(uploaded.error && Number((uploaded.error as {statusCode?:unknown}).statusCode)!==409)throw new Error("artifact_roundtrip_upload_denied");
   const physical=await read(target,{sha256:target.sha256,byteLength:target.byteLength});
   if(hash(physical)!==hash(rendered.bytes))throw new Error("artifact_roundtrip_bytes_changed");
   const objectId=uploaded.data?.id ?? z.object({storageObjectId:z.uuid()}).parse(await rpc("worker_revalidate_artifact_roundtrip_v1",scope)).storageObjectId;
   await rpc("worker_commit_artifact_export_v1",{...scope,p_storage_object_id:objectId,p_template_fingerprint:rendered.templateFingerprint,p_roundtrip_manifest:rendered.manifest});return "completed";
  }
  let importedClaim=imported.parse(claim.importCandidate);
  if(claim.format==="pdf")throw new Error("artifact_roundtrip_pdf_import_denied");
  const receivedBytes=await read({bucket:importedClaim.source.bucket,path:importedClaim.source.path},importedClaim.source);
  if(claim.operation==="import_scan") {
   const binding=quarantineDocumentBindingSchema.parse(importedClaim.source.binding);
   if(binding.operationId!==claim.taskId||binding.organizationId!==claim.organizationId||binding.expectedSha256!==importedClaim.source.sha256||binding.expectedByteSize!==receivedBytes.byteLength)throw new Error("artifact_roundtrip_scan_binding_changed");
   const gate=await runGovernedGate({bytes:receivedBytes,binding,scanner:input.scanner});
   if(!gate.authorization) throw new Error("artifact_roundtrip_invalid_file");
   await rpc("worker_record_artifact_import_quarantine_v1",{...scope,p_receipt:gate.receipt});
   const context=await rpc("worker_revalidate_artifact_roundtrip_v1",scope);
   const refreshed=z.object({valid:z.literal(true),context:artifactRoundtripClaimSchema}).parse(context);
   claim=refreshed.context;importedClaim=imported.parse(claim.importCandidate);
  }
  await revalidate();const received=await readRoundtripSnapshot(receivedBytes,claim.format as "xlsx"|"docx"|"pptx");
  if(!importedClaim.headRevision)throw new Error("artifact_roundtrip_head_unverified");
  if(!importedClaim.baseReceipt) {
   await rpc("worker_commit_artifact_import_comparison_v1",{...scope,p_comparison:{status:"unmatched",manifestIssue:"missing_base",baseRevisionId:null,headRevisionId:importedClaim.headRevision.id,differences:unmatchedRoundtripDifferences(received)},p_contributions:{assumptionChanges:[],blockProposals:[],observations:[],conflicts:[]}});return "completed";
  }
  const baseBytes=await read(importedClaim.baseReceipt.storage,importedClaim.baseReceipt);
  const baseSnapshot=await readRoundtripSnapshot(baseBytes,importedClaim.baseReceipt.format);
  if(!baseSnapshot.manifest)throw new Error("artifact_roundtrip_base_unverified");
  assertCapturedRoundtripManifest(baseSnapshot,importedClaim.baseReceipt.roundtripManifest);
  const base=verifyRoundtripBase(baseSnapshot,{revisionId:importedClaim.baseReceipt.revisionId,logicalManifestFingerprint:importedClaim.baseReceipt.logicalManifestFingerprint,sha256:importedClaim.baseReceipt.sha256},{artifactId:importedClaim.artifactId,revisionId:importedClaim.baseReceipt.revisionId,revisionNo:baseSnapshot.manifest.revisionNo,logicalManifestFingerprint:importedClaim.baseReceipt.logicalManifestFingerprint});
  let current:RoundtripSnapshot=base;
  if(importedClaim.headRevision.id!==importedClaim.baseReceipt.revisionId) {
   const rendered=await input.render({...claim,producer:importedClaim.headProducer,templateBody:importedClaim.headTemplateBody,blocks:importedClaim.headBlocks??[]},importedClaim.headRevision);
   current=await readRoundtripSnapshot(rendered.bytes,importedClaim.baseReceipt.format);
  }
  await revalidate();const comparison=applyArtifactManualMappings({comparison:compareRoundtrip(base,received,current),base,current,mappings:importedClaim.manualMappings??[],baseBlocks:claim.blocks,currentBlocks:importedClaim.headRevision.id===importedClaim.baseReceipt.revisionId?claim.blocks:importedClaim.headBlocks??[]}), contributions=extractContributions(comparison,base.manifest!);
  await rpc("worker_commit_artifact_import_comparison_v1",{...scope,p_comparison:comparison,p_contributions:contributions});return "completed";
 } catch(error) {
  // Authority/revocation failure never becomes a success or permits a later commit.
  const message=error instanceof Error?error.message:"artifact_roundtrip_invalid_file";
  if(message!=="artifact_roundtrip_authority_denied"&&message!=="artifact_roundtrip_source_revoked"&&!input.signal.aborted) {
   await rpc("worker_fail_artifact_roundtrip_v1",{...scope,p_failure_code:message.includes("missing_base")?"missing_base":message.includes("producer")?"unsupported_producer":"invalid_file"}).catch(()=>{});
  }
  throw error;
 }
}
