import assert from "node:assert/strict";
import {createHash,randomUUID}from"node:crypto";
import {readFile,writeFile,stat}from"node:fs/promises";
import {createClient,type SupabaseClient}from"@supabase/supabase-js";
import {z}from"zod";
import{createArtifactRoundtripRenderer}from"../src/artifact-roundtrip-renderer";
import{processArtifactRoundtrip}from"../src/artifact-roundtrip-processing";
import{createRetentionWorker}from"../src/retention-worker";
const uuid=z.uuid();
const schema=z.object({environment:z.enum(["local","staging"]),projectRef:z.string(),apiUrl:z.url(),publishableKey:z.string(),organizationId:uuid,workId:uuid,actorId:uuid,workerId:uuid,actorEmail:z.email(),workerEmail:z.email(),password:z.string().min(20),workerToken:z.string().min(32)}).passthrough();
let phase="target_validation";
async function main(){
 const path=process.env.OFFROAD_LIFECYCLE_FIXTURE_FILE;if(!path)throw new Error("fixture_required");
 const mode=process.argv[2];if(!["prepare","configure","held","release","purge"].includes(mode??""))throw new Error("phase_required");
 const permissions=await stat(path);if(permissions.mode&0o077)throw new Error("private_fixture_required");
 const raw=JSON.parse(await readFile(path,"utf8")),f=schema.parse(raw),url=new URL(f.apiUrl);
 if(f.projectRef==="ifnogpksgdadruooqydi"||url.hostname.includes("ifnogpksgdadruooqydi")||f.publishableKey.startsWith("sb_secret_")||url.username||url.password||url.search||url.hash)throw new Error("production_or_privileged_target_forbidden");
 if(f.environment==="staging"&&(f.projectRef!=="gjkkjtbfnssdsbmlhmwk"||url.hostname!==`${f.projectRef}.supabase.co`||process.env.OFFROAD_STAGING_PROJECT_REF!==f.projectRef))throw new Error("staging_allowlist_required");
 if(f.environment==="local"&&!["localhost","127.0.0.1"].includes(url.hostname))throw new Error("local_target_required");
 if(f.publishableKey.split(".").length===3&&JSON.parse(Buffer.from(f.publishableKey.split(".")[1]!,"base64url").toString()).role!=="anon")throw new Error("privileged_key_forbidden");
 const owner=createClient(f.apiUrl,f.publishableKey,{auth:{persistSession:false},global:{headers:{"x-offroad-workspace":f.organizationId}}});
 const worker=createClient(f.apiUrl,f.publishableKey,{auth:{persistSession:false},global:{fetch:async(input,init)=>{
  // A staging evaluation must never delete another work's object, even if its queue is older.
  if(init?.method?.toUpperCase()==="DELETE"&&String(input).includes("/storage/v1/object/")){
   const expected=z.object({storage:z.object({bucket:z.literal("case-artifacts"),path:z.string()})}).parse(raw.receipt);
   assert.equal(new URL(String(input)).pathname,`/storage/v1/object/${expected.storage.bucket}`);
   assert.deepEqual(JSON.parse(String(init.body)).prefixes,[expected.storage.path]);
  }
  return fetch(input,init);
 }}});
 phase="ordinary_authenticated_identities";
 const sessions=await Promise.all([owner.auth.signInWithPassword({email:f.actorEmail,password:f.password}),worker.auth.signInWithPassword({email:f.workerEmail,password:f.password})]);
 if(sessions.some(s=>s.error))process.stdout.write(JSON.stringify({diagnostic:"authentication_status",results:sessions.map(s=>({status:s.error?.status,code:s.error?.code,hasUser:Boolean(s.data.user)}))})+"\n");
 assert.equal(sessions[0]?.data.user?.id,f.actorId);assert.equal(sessions[1]?.data.user?.id,f.workerId);
 async function rpc(client:SupabaseClient,name:string,args:Record<string,unknown>){const r=await client.rpc(name,args);if(r.error)throw new Error(`rpc_${name}_${r.error.code??"transport"}`);return r.data;}
 if(mode==="prepare"){
  phase="human_source_free_revision";
  const manifest={schemaVersion:"artifact-manifest.2026.09.26-v1",kind:"answer",audience:"internal",format:"json",bytes:null,method:null,execution:null,inputSnapshot:null,institutionalResult:null,sources:[],claims:[],traces:[],template:null,provenance:{producer:"synthetic-lifecycle-eval",jobId:null,taskRunId:null,messageId:null,capability:null},legacy:null};
  const revision=await rpc(owner,"create_artifact_revision_v1",{p_work:f.workId,p_kind:"answer",p_subject:"synthetic-retention-canary",p_audience:"internal",p_manifest:manifest,p_blocks:[{blockKey:"synthetic.text",kind:"paragraph",content:{text:"Synthetic retained explanation"},claims:[]}],p_links:[],p_content_sha256:null,p_byte_length:null});
  phase="exact_human_review";
  await rpc(owner,"review_artifact_revision_v1",{p_revision_id:revision.revision_id,p_expected_fingerprint:revision.manifest_fingerprint,p_act:"approve",p_block_id:null,p_note:"Synthetic exact human review; no customer data",p_self_approval_declared:true,p_command_id:randomUUID()});
  phase="office_export_request";
  const task=await rpc(owner,"request_artifact_export_v1",{p_revision_id:revision.revision_id,p_format:"docx",p_locale:"pt-BR",p_command_id:randomUUID(),p_variant:"default"});
  phase="real_renderer_upload_and_receipt";
  assert.equal(await processArtifactRoundtrip({client:worker,workerToken:f.workerToken,scanner:{name:"export_does_not_use_scanner",scan:async()=>{throw new Error("unexpected_import_scan");}},render:createArtifactRoundtripRenderer(worker),signal:AbortSignal.timeout(120000)}),"completed");
  const completed=await rpc(owner,"read_artifact_roundtrip_task_v1",{p_task_id:task.taskId});assert.equal(completed.status,"completed");
  const receipt=await rpc(owner,"read_artifact_export_receipt_v1",{p_receipt_id:completed.receiptId});
  const downloaded=await owner.storage.from(receipt.storage.bucket).download(receipt.storage.path);assert.ok(downloaded.data);assert.equal(downloaded.error,null);
  assert.equal(createHash("sha256").update(Buffer.from(await downloaded.data.arrayBuffer())).digest("hex"),receipt.sha256);
  await writeFile(path,JSON.stringify({...raw,revision,task,receipt}),{mode:0o600});
 }else if(mode==="configure"){
  phase="explicit_client_retention_and_hold";
  const rule=await rpc(owner,"set_retention_rule_v1",{p_resource_id:f.workId,p_mode:"expire",p_expires_at:new Date(Date.now()+5000).toISOString(),p_basis_reference:randomUUID()});
  const hold=await rpc(owner,"place_legal_hold_v1",{p_resource_id:f.workId,p_basis_reference:randomUUID()});
  await writeFile(path,JSON.stringify({...raw,rule,hold}),{mode:0o600});
 }else if(mode==="release"){
  phase="explicit_hold_release";
  assert.equal(await rpc(owner,"release_legal_hold_v1",{p_hold_id:uuid.parse(raw.hold),p_basis_reference:randomUUID()}),true);
 }else{
  const receipt=z.object({id:uuid,storage:z.object({bucket:z.literal("case-artifacts"),path:z.string()}),sha256:z.string().regex(/^[a-f0-9]{64}$/)}).parse(raw.receipt);
  const logs:Array<{event:string;detail?:Record<string,unknown>}>=[];
  const retention=createRetentionWorker(worker,f.workerToken,(event,detail)=>logs.push({event,detail}));
  phase=mode==="held"?"held_bytes_no_authority":"leased_exact_physical_erasure";
  if(mode==="held"){
   assert.equal(await retention.poll(),false);
   assert.equal((await owner.rpc("read_artifact_export_receipt_v1",{p_receipt_id:receipt.id})).error?.code,"42501");
   assert.equal((await owner.storage.from(receipt.storage.bucket).download(receipt.storage.path)).data,null);
   assert.ok(logs.some(x=>x.event==="retention.health"));
   const denied=await worker.storage.from(receipt.storage.bucket).remove([receipt.storage.path]);
   assert.ok(denied.error||!denied.data?.length);
   assert.equal((await worker.storage.from(receipt.storage.bucket).download(receipt.storage.path)).data,null);
  }else{
   assert.equal(await retention.poll(),true);
   assert.ok(logs.some(x=>x.event==="retention.completed"));
   assert.equal((await owner.storage.from(receipt.storage.bucket).download(receipt.storage.path)).data,null);
  }
 }
 await Promise.all([owner.auth.signOut(),worker.auth.signOut()]);
 process.stdout.write(JSON.stringify({eval:"lifecycle_sdk",phase:mode,result:"PASS",environment:f.environment})+"\n");
}
main().catch(error=>{const message=error instanceof Error?error.message:"";const rpc=/^rpc_([a-z0-9_]+)_([A-Z0-9]{5}|transport)$/.exec(message);process.stderr.write(JSON.stringify({eval:"lifecycle_sdk",result:"FAIL",phase,rpc:rpc?.[1],code:rpc?.[2]})+"\n");process.exitCode=1;});
