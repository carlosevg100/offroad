/** Synthetic unit ports only: SQL/HTTP gates separately prove authority. */
import {createHash,randomUUID} from "node:crypto";
import {describe,it,expect,vi} from "vitest";
import {z} from "zod";
import {capitalS11ArtifactSchema} from "./capital-s11-final";
import {loadCapitalS11RevisionInput,type CapitalS11RevisionInputPorts} from "./capital-s11-revision-input";
import type {CapitalS11RetentionScope} from "./capital-s11-protocol";
function synth(s:Record<string,any>):any{
 if(s.const!==undefined)return s.const;if(s.enum)return s.enum[0];if(s.anyOf)return synth(s.anyOf.find((v:Record<string,unknown>)=>v.type!=="null")??s.anyOf[0]);
 if(s.type==="object")return Object.fromEntries((s.required??[]).map((key:string)=>[key,synth(s.properties[key])]));
 if(s.type==="array")return Array.from({length:s.minItems??0},()=>synth(s.items));
 if(s.type==="string")return s.format==="date"?"2026-10-02":s.format==="uri"?"https://example.invalid/synthetic":s.pattern?"alt_fixture":"x".repeat(Math.max(1,s.minLength??1));
 if(s.type==="number"||s.type==="integer")return s.minimum??0;if(s.type==="boolean")return true;if(s.type==="null")return null;throw new Error("fixture_schema_unsupported");
}
function harness(){
 const job={jobId:randomUUID(),organizationId:randomUUID(),workId:randomUUID(),reviewId:randomUUID(),decisionId:randomUUID(),priorRevisionId:randomUUID()},recipe=randomUUID();
 const physical=new Map<string,{scope:CapitalS11RetentionScope;bytes:Uint8Array;objectId:string;version:string}>();
 const retain=(body:unknown)=>{const allocation=randomUUID(),retained=randomUUID(),bytes=Buffer.from(JSON.stringify(body)),objectId=randomUUID(),version="unit-physical-v1";
 const scope:CapitalS11RetentionScope={schemaVersion:"capital-retained-body.v1",retentionState:"retained",allocationId:allocation,retainedPayloadId:retained,bodyBasisId:randomUUID(),bucket:"capital-input-capture",path:`${job.organizationId}/${allocation}/payload.json`,payloadFingerprint:createHash("sha256").update(bytes).digest("hex"),byteLength:bytes.length,storageObjectId:objectId,storageVersion:version,retainedAt:"2026-10-02T00:00:00Z",uploadExpiresAt:"2026-10-02T00:05:00Z",purgeAt:"2030-01-01T00:00:00Z",expiresAt:"2030-01-02T00:00:00Z",replayed:false};physical.set(retained,{scope,bytes,objectId,version});return scope;};
 const schema=z.toJSONSchema(capitalS11ArtifactSchema);const raw=synth(schema);raw.informationRequests=[synth((schema as any).properties.informationRequests.items)];raw.evidenceCoverage.status="insufficient";raw.directionalRecommendation.status="not_ready";raw.directionalRecommendation.alternativeId=null;
 const prior=retain(capitalS11ArtifactSchema.parse(raw));
 const kinds={M01:"company_scope",M02:"capital_intent",C11:"structuring_thesis",S10:"alternative_comparison"};
 const predecessors=Object.entries(kinds).map(([taskId,artifactType])=>{const scope=retain({schemaVersion:"capital-planning-task.v1",taskId,artifactType,content:{synthetic:true}});return{taskId,retention:scope,projection:{schemaVersion:"capital-s11-task-projection-receipt.v1",recipeId:recipe,taskId,taskRunId:randomUUID(),capitalArtifactId:randomUUID(),artifactFingerprint:"c".repeat(64),artifactVersion:1,retainedPayloadId:scope.retainedPayloadId!,replayed:false}};});
 const source={topic:"identity",provider:"official",retrievedAt:"2026-10-02T00:00:00Z",contentHash:"d".repeat(64),title:"Synthetic source",url:"https://example.invalid/source",snippet:"Synthetic licensed excerpt"};const sourceBody=retain(source),deliveryId=randomUUID();
 const sourceScope={schemaVersion:"capital-public-storage-scope.v1",state:"complete",allocationId:sourceBody.allocationId,retainedPayloadId:sourceBody.retainedPayloadId!,deliveryId,bucket:sourceBody.bucket,path:sourceBody.path,payloadFingerprint:sourceBody.payloadFingerprint,byteLength:sourceBody.byteLength,storageObjectId:sourceBody.storageObjectId,storageVersion:sourceBody.storageVersion,retainedAt:sourceBody.retainedAt,uploadExpiresAt:sourceBody.uploadExpiresAt,expiresAt:sourceBody.expiresAt,purgeAt:sourceBody.purgeAt};
 const grant={schemaVersion:"capital-s11-revision-inputs.v1",...job,priorRecipeId:recipe,predecessorRecipeId:recipe,prior,predecessors,researchStatus:"succeeded",jurisdiction:"BR",jurisdictionNeedsConfirmation:false,strategyFingerprint:"e".repeat(64),sources:[{deliveryId,retainedPayloadId:sourceBody.retainedPayloadId!}],expiresAt:"2030-01-01T00:00:00Z"};
 const ports:CapitalS11RevisionInputPorts={load:vi.fn(async()=>structuredClone(grant)),bodyScope:vi.fn(async ref=>physical.get(ref.retainedPayloadId)!.scope),readBody:vi.fn(async ref=>physical.get(ref.scope.retainedPayloadId!)!),sourceScope:vi.fn(async()=>structuredClone(sourceScope)),readSource:vi.fn(async()=>physical.get(sourceBody.retainedPayloadId!)!)};
 return{job,grant,ports,physical,sourceScope};
}
const now=()=>Date.parse("2026-10-02T01:00:00Z");
describe("S11 human revision physical input unit ports",()=>{
 it("reads the exact original prior and four predecessor bodies without model or search ports",async()=>{const h=harness();const result=await loadCapitalS11RevisionInput(h.job,h.ports,now);expect(result.predecessors.map(x=>x.projection.taskId)).toEqual(["M01","M02","C11","S10"]);expect(result.sources).toHaveLength(1);expect(h.ports.readBody).toHaveBeenCalledTimes(5);});
 it.each(["wrong_job","wrong_root","wrong_order","expired","body_tamper","source_tamper","after_read_revoked"])("denies %s without substituting history",async kind=>{const h=harness();if(kind==="wrong_job")h.grant.jobId=randomUUID();if(kind==="wrong_root")h.grant.predecessorRecipeId=randomUUID();if(kind==="wrong_order")h.grant.predecessors.reverse();if(kind==="expired")h.grant.expiresAt="2026-10-01T00:00:00Z";
 if(kind==="body_tamper")h.ports.readBody=vi.fn(async ref=>({...h.physical.get(ref.scope.retainedPayloadId!)!,bytes:Buffer.from("tampered")}));
 if(kind==="source_tamper")h.ports.readSource=vi.fn(async()=>({bytes:Buffer.from("tampered"),objectId:h.sourceScope.storageObjectId!,version:h.sourceScope.storageVersion!}));
 if(kind==="after_read_revoked"){const old=h.ports.bodyScope;let count=0;h.ports.bodyScope=vi.fn(async ref=>{const scope=await old(ref) as CapitalS11RetentionScope;return++count===2?{...scope,purgeAt:"2026-10-01T00:00:00Z"}:scope;});}
 await expect(loadCapitalS11RevisionInput(h.job,h.ports,now)).rejects.toThrow();});
});
