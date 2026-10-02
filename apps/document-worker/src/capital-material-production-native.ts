/** Prospective 3S bundle. Physical Storage ports and native SQL receipts are
 * mandatory; a legacy writer or a caller-created precursor cannot substitute. */
import {createHash} from 'node:crypto';
import {z} from 'zod';
import {materialInternalReadiness} from './capital-material-readiness';
const id=z.uuid(), fp=z.string().regex(/^[a-f0-9]{64}$/), time=z.iso.datetime({offset:true});
export const capitalMaterialBodyKindSchema=z.enum(['context','calculation_report','case_state','material_package']);
export const capitalMaterialBodyScopeSchema=z.strictObject({schemaVersion:z.literal('capital-material-body-scope.v1'),organizationId:id,workId:id,recipeId:id,allocationId:id,retainedPayloadId:id.nullable(),kind:capitalMaterialBodyKindSchema,payloadFingerprint:fp,byteLength:z.number().int().positive().max(1048576),bucket:z.literal('capital-input-capture'),path:z.string(),storageObjectId:id.nullable(),storageVersion:z.string().min(1).nullable(),expiresAt:time,purgeAt:time});
export const capitalMaterialCaptureSchema=z.strictObject({schemaVersion:z.literal('capital-material-capture.v1'),state:z.literal('ready'),recipeId:id,jobId:id,organizationId:id,workId:id,productionPlanId:id,productionPlanVersion:z.number().int().positive(),productionPlanFingerprint:fp,inputFingerprint:fp,contextFingerprint:fp,sourceClosureFingerprint:fp,calculationVersion:z.string().min(1),rendererVersion:z.literal('capital-material-package.v1'),context:capitalMaterialBodyScopeSchema});
export const capitalMaterialCommitSchema=z.strictObject({schemaVersion:z.literal('capital-material-commit.v1'),recipeId:id,workId:id,productionPlanId:id,materialObjectId:id,revisionId:id,reportRetainedPayloadId:id,stateRetainedPayloadId:id,packageRetainedPayloadId:id,bundleFingerprint:fp,replayed:z.boolean()});
export const capitalMaterialSourceSealSchema=z.strictObject({schemaVersion:z.literal('capital-material-source-seal.v1'),recipeId:id,sourceFingerprint:fp,deliveryIds:z.array(id).max(1000),researchStatus:z.enum(['succeeded','partial','abstained'])});
export type MaterialResearchInput={deliveryIds:string[];researchStatus:'succeeded'|'partial'|'abstained'};
export const capitalMaterialTerminalSchema=z.strictObject({schemaVersion:z.literal('capital-material-terminal.v1'),recipeId:id,reportRetainedPayloadId:id,reportStatus:z.enum(['failed','blocked','succeeded']),reason:z.enum(['compiler_failed','compiler_blocked','domain_material_blocked']),caseStateRetainedPayloadId:id.nullable(),replayed:z.boolean()}).refine(v=>v.reason==='domain_material_blocked'?v.reportStatus==='succeeded'&&v.caseStateRetainedPayloadId!==null:v.caseStateRetainedPayloadId===null&&(v.reason==='compiler_failed'?v.reportStatus==='failed':v.reportStatus==='blocked'));
export const capitalMaterialTerminalRecoverySchema=z.strictObject({schemaVersion:z.literal('capital-material-terminal-recovery.v1'),authorizedJobId:id,capture:capitalMaterialCaptureSchema,report:capitalMaterialBodyScopeSchema,caseState:capitalMaterialBodyScopeSchema.nullable(),terminal:capitalMaterialTerminalSchema});
export type MaterialCapture=z.infer<typeof capitalMaterialCaptureSchema>;
export type MaterialBodyScope=z.infer<typeof capitalMaterialBodyScopeSchema>;
export type MaterialBundle={calculationReport:Record<string,unknown>;caseState:Record<string,unknown>;materialPackage:Record<string,unknown>};
export type PreparedMaterialBody={scope:unknown;canonicalBody:string};
export const capitalMaterialRecoverySchema=z.strictObject({schemaVersion:z.literal('capital-material-recovery.v1'),state:z.enum(['commit','committed']),authorizedJobId:id,capture:capitalMaterialCaptureSchema,outputs:z.array(capitalMaterialBodyScopeSchema).length(3),commit:capitalMaterialCommitSchema.nullable()});
export interface CapitalMaterialProductionPorts {
 capture(requestId:string):Promise<{receipt:unknown;canonicalBody:string}>;
 retain(scope:MaterialBodyScope,canonicalBytes:Uint8Array):Promise<unknown>;
 sealContext(recipeId:string,contextRetainedPayloadId:string):Promise<unknown>;
 sealSources(recipeId:string,input:MaterialResearchInput):Promise<unknown>;
 revalidate(recipe:MaterialCapture):Promise<unknown>;
 prepareOutput(input:{recipeId:string;kind:Exclude<MaterialBodyScope['kind'],'context'>;body:Record<string,unknown>}):Promise<PreparedMaterialBody>;
 commit(input:{recipeId:string;outputs:MaterialBodyScope[]}):Promise<unknown>;
 recordTerminal(recipeId:string,reportRetainedPayloadId:string,caseStateRetainedPayloadId:string|null):Promise<unknown>;
 recover():Promise<unknown|null>;
 read(scope:MaterialBodyScope):Promise<{scope:unknown;bytes:Uint8Array}>;
}
const sha=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const equal=(a:unknown,b:unknown):boolean=>{
 if(a===b)return true;
 if(!a||!b||typeof a!=='object'||typeof b!=='object'||Array.isArray(a)!==Array.isArray(b))return false;
 const ak=Object.keys(a).sort(),bk=Object.keys(b).sort();
 return ak.length===bk.length&&ak.every((k,i)=>k===bk[i]&&equal((a as Record<string,unknown>)[k],(b as Record<string,unknown>)[k]));
};
function denied(code:string):never{throw new Error(code);}
function validateScope(scope:MaterialBodyScope,capture:MaterialCapture,now:number,retained:boolean){
 if(scope.organizationId!==capture.organizationId||scope.workId!==capture.workId||scope.recipeId!==capture.recipeId||scope.path!==`${scope.organizationId}/${scope.allocationId}/payload.json`||Math.min(Date.parse(scope.expiresAt),Date.parse(scope.purgeAt))<=now)denied('capital_material_scope_denied');
 if(scope.kind!=='context'&&(Date.parse(scope.expiresAt)>Date.parse(capture.context.expiresAt)||Date.parse(scope.purgeAt)>Date.parse(capture.context.purgeAt)))denied('capital_material_retention_extended');
 if(retained&&(!scope.retainedPayloadId||!scope.storageObjectId||!scope.storageVersion))denied('capital_material_physical_receipt_required');
}
function validateBytes(scope:MaterialBodyScope,bytes:Uint8Array){if(bytes.byteLength!==scope.byteLength||sha(bytes)!==scope.payloadFingerprint)denied('capital_material_physical_bytes_changed');}
/** Recovery consumes already-retained calculation outputs; it never invokes the
 * compiler, model, price fetcher, template resolver, or mutable context loader. */
export function createCapitalMaterialProducer(input:{jobId:string;workId:string;ports:CapitalMaterialProductionPorts;now?:()=>number}){
 id.parse(input.jobId);id.parse(input.workId);const now=input.now??Date.now;let started=false;
 const p=input.ports;
 for(const name of ['capture','retain','sealContext','sealSources','revalidate','prepareOutput','commit','recordTerminal','recover','read'] as const)if(typeof p[name]!=='function')denied('capital_material_native_port_required');
 const validateCapture=(value:unknown,recovered=false)=>{const c=capitalMaterialCaptureSchema.parse(value);if((!recovered&&c.jobId!==input.jobId)||c.workId!==input.workId||c.context.kind!=='context'||c.context.payloadFingerprint!==c.contextFingerprint)denied('capital_material_capture_denied');validateScope(c.context,c,now(),false);return c;};
 const current=async(c:MaterialCapture)=>{if(!equal(capitalMaterialCaptureSchema.parse(await p.revalidate(c)),c))denied('capital_material_inputs_changed');};
 const finish=async(c:MaterialCapture,outputs:MaterialBodyScope[])=>{
  for(const s of outputs)validateScope(s,c,now(),true);
  if(new Set(outputs.map(s=>s.kind)).size!==3||outputs.some(s=>s.kind==='context'))denied('capital_material_bundle_incomplete');
  await current(c);const receipt=capitalMaterialCommitSchema.parse(await p.commit({recipeId:c.recipeId,outputs}));
  const byKind=new Map(outputs.map(s=>[s.kind,s.retainedPayloadId]));
  if(receipt.recipeId!==c.recipeId||receipt.workId!==c.workId||receipt.productionPlanId!==c.productionPlanId||receipt.reportRetainedPayloadId!==byKind.get('calculation_report')||receipt.stateRetainedPayloadId!==byKind.get('case_state')||receipt.packageRetainedPayloadId!==byKind.get('material_package'))denied('capital_material_commit_binding_changed');
  return receipt;
 };
 return Object.freeze({run:async(requestId:string,compile:(context:Record<string,unknown>,capture:MaterialCapture,sealResearch:(research:MaterialResearchInput)=>Promise<void>)=>Promise<MaterialBundle>)=>{
  if(started)denied('capital_material_producer_already_started');started=true;id.parse(requestId);
  const recovery=await p.recover();
  if(recovery!==null){
   if(typeof recovery==='object'&&'schemaVersion'in recovery&&recovery.schemaVersion==='capital-material-terminal-recovery.v1'){
    const g=capitalMaterialTerminalRecoverySchema.parse(recovery);if(g.authorizedJobId!==input.jobId)denied('capital_material_recovery_job_denied');const c=validateCapture(g.capture,true);await current(c);validateScope(g.report,c,now(),true);
    if(g.report.kind!=='calculation_report'||g.terminal.recipeId!==c.recipeId||g.terminal.reportRetainedPayloadId!==g.report.retainedPayloadId)denied('capital_material_terminal_binding_changed');
    if((g.terminal.reason==='domain_material_blocked')!==(g.caseState!==null)||(g.caseState!==null&&(g.caseState.kind!=='case_state'||g.caseState.retainedPayloadId!==g.terminal.caseStateRetainedPayloadId)))denied('capital_material_terminal_binding_changed');
    for(const s of [c.context,g.report,...(g.caseState?[g.caseState]:[])]){validateScope(s,c,now(),true);const physical=await p.read(s);if(!equal(capitalMaterialBodyScopeSchema.parse(physical.scope),s))denied('capital_material_recovery_scope_changed');validateBytes(s,physical.bytes);}
    const terminal=capitalMaterialTerminalSchema.parse(await p.recordTerminal(c.recipeId,g.report.retainedPayloadId!,g.caseState?.retainedPayloadId??null));if(!equal({...terminal,replayed:true},{...g.terminal,replayed:true}))denied('capital_material_terminal_binding_changed');return terminal;
   }
   const g=capitalMaterialRecoverySchema.parse(recovery);if(g.authorizedJobId!==input.jobId)denied('capital_material_recovery_job_denied');const c=validateCapture(g.capture,true);await current(c);
   for(const scope of [c.context,...g.outputs]){validateScope(scope,c,now(),true);const physical=await p.read(scope);if(!equal(capitalMaterialBodyScopeSchema.parse(physical.scope),scope))denied('capital_material_recovery_scope_changed');validateBytes(scope,physical.bytes);JSON.parse(Buffer.from(physical.bytes).toString('utf8'));}
   // Even an already-committed response is rechecked by the native command.
   return finish(c,g.outputs);
  }
  const captured=await p.capture(requestId),c=validateCapture(captured.receipt),bytes=Buffer.from(captured.canonicalBody,'utf8');validateBytes(c.context,bytes);
  const context=z.record(z.string(),z.unknown()).parse(JSON.parse(captured.canonicalBody));
  const retained=capitalMaterialBodyScopeSchema.parse(await p.retain(c.context,bytes));validateScope(retained,c,now(),true);
  if(!equal({...retained,retainedPayloadId:null,storageObjectId:null,storageVersion:null},c.context))denied('capital_material_context_retention_changed');
  const sealed=validateCapture(await p.sealContext(c.recipeId,retained.retainedPayloadId!));
  if(!equal({...sealed,context:c.context},c)||!equal(sealed.context,retained))denied('capital_material_seal_changed');
  await current(sealed);let active=sealed,researchSealed=false;
  const sealResearch=async(research:MaterialResearchInput)=>{
   if(researchSealed)denied('capital_material_research_already_sealed');
   if(new Set(research.deliveryIds).size!==research.deliveryIds.length||(research.researchStatus==='abstained')!==(research.deliveryIds.length===0))denied('capital_material_research_invalid');
   const receipt=capitalMaterialSourceSealSchema.parse(await p.sealSources(active.recipeId,research));
   if(receipt.recipeId!==active.recipeId||receipt.researchStatus!==research.researchStatus||!equal([...receipt.deliveryIds].sort(),[...research.deliveryIds].sort()))denied('capital_material_source_seal_changed');
   const tightened=validateCapture(await p.revalidate(active));
   const oldScope=active.context,newScope=tightened.context;
   if(!equal({...tightened,context:oldScope},active)||!equal({...newScope,expiresAt:oldScope.expiresAt,purgeAt:oldScope.purgeAt},oldScope)||Date.parse(newScope.expiresAt)>Date.parse(oldScope.expiresAt)||Date.parse(newScope.purgeAt)>Date.parse(oldScope.purgeAt))denied('capital_material_source_seal_changed');
   active=tightened;researchSealed=true;
  };
  const bundle=await compile(structuredClone(context),structuredClone(sealed),sealResearch);
  if(!researchSealed)denied('capital_material_source_seal_required');
  const terminalStatus=bundle.calculationReport.status;
  const compilerTerminal=terminalStatus==='failed'||terminalStatus==='blocked';
  const domainTerminal=!compilerTerminal&&terminalStatus==='succeeded'&&!materialInternalReadiness(bundle.caseState,bundle.materialPackage);
  const bodies=[['calculation_report',bundle.calculationReport],['case_state',bundle.caseState],['material_package',bundle.materialPackage]] as const;
  const outputs:MaterialBodyScope[]=[];
  for(const [kind,body] of bodies){await current(active);const prepared=await p.prepareOutput({recipeId:active.recipeId,kind,body});const scope=capitalMaterialBodyScopeSchema.parse(prepared.scope);validateScope(scope,active,now(),false);if(scope.kind!==kind)denied('capital_material_output_kind_changed');const canonical=Buffer.from(prepared.canonicalBody,'utf8');validateBytes(scope,canonical);if(!equal(JSON.parse(prepared.canonicalBody),body))denied('capital_material_canonical_product_changed');const output=capitalMaterialBodyScopeSchema.parse(await p.retain(scope,canonical));validateScope(output,active,now(),true);if(!equal({...output,retainedPayloadId:null,storageObjectId:null,storageVersion:null},scope))denied('capital_material_output_retention_changed');outputs.push(output);if(compilerTerminal&&kind==='calculation_report'||domainTerminal&&kind==='case_state'){await current(active);const reportId=outputs.find(s=>s.kind==='calculation_report')!.retainedPayloadId!;const stateId=domainTerminal?output.retainedPayloadId:null;const r=capitalMaterialTerminalSchema.parse(await p.recordTerminal(active.recipeId,reportId,stateId));if(r.recipeId!==active.recipeId||r.reportRetainedPayloadId!==reportId||r.reportStatus!==terminalStatus||r.caseStateRetainedPayloadId!==stateId||r.reason!==(domainTerminal?'domain_material_blocked':terminalStatus==='failed'?'compiler_failed':'compiler_blocked'))denied('capital_material_terminal_binding_changed');return r;}}
  return finish(active,outputs);
 }});
}
