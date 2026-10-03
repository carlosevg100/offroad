import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync,statSync,writeFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {setTimeout as wait} from 'node:timers/promises';
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
/** An operator executes these three bounded SELECTs through MCP. No supplied SQL,
 * credential, actor, receipt or capability can be returned by this bridge. */
export function createMcpReadOnlyBridge(directory){
 const dir=resolve(directory);assert(['/private/tmp/','/tmp/'].some(p=>dir.startsWith(p)));assert(statSync(dir).isDirectory());assert.equal(statSync(dir).mode&0o077,0);
 let sequence=0;
 return async query=>{
  assert(query.startsWith('select jsonb_build_object(')&&!/[;\n]/.test(query.replace(/;$/,'')));
  const kind=query.includes("'label'")?'identity':query.includes("'jobs'")?'effects':null;assert(kind,'closed aggregate only');
  const id=randomUUID(),n=++sequence;
  writeFileSync(resolve(dir,`request-${n}.json`),JSON.stringify({schemaVersion:'stage20-operator-read-request.v1',id,kind,query})+'\n',{mode:0o600,flag:'wx'});
  const response=resolve(dir,`response-${n}.json`),deadline=Date.now()+60000;
  while(!existsSync(response)){assert(Date.now()<deadline,'actual MCP response deadline exceeded');await wait(250);}
  assert.equal(statSync(response).mode&0o077,0);const r=JSON.parse(readFileSync(response,'utf8'));
  assert.deepEqual(Object.keys(r).sort(),['id','result','schemaVersion']);assert.equal(r.schemaVersion,'stage20-operator-read-response.v1');assert.equal(r.id,id);
  const keys=kind==='identity'?['organizationId','workId','label']:['jobs','vault','introductions'];assert.deepEqual(Object.keys(r.result).sort(),keys.sort());
  if(kind==='effects')for(const value of Object.values(r.result))assert(Number.isSafeInteger(value)&&value>=0);
  else{assert(uuid.test(r.result.workId)&&uuid.test(r.result.organizationId));assert(typeof r.result.label==='string'&&/synthetic/i.test(r.result.label));}
  return JSON.stringify(r.result);
 };
}
export function validateMaterialBody(body,headers,bytes,basis,scope){
 assert.equal(headers.get('content-type'),'application/octet-stream');assert(headers.get('cache-control')?.split(',').some(v=>v.trim()==='no-store'));
 assert.equal(headers.get('x-offroad-bundle-fingerprint'),basis.bundleFingerprint);
 for(const key of['x-offroad-allocation-id','x-offroad-object-id'])assert(uuid.test(headers.get(key)));
 assert(/^[a-zA-Z0-9._-]{1,200}$/.test(headers.get('x-offroad-storage-version')??''));assert(bytes.length>0&&bytes.length<=1048576);
 if(scope){for(const[h,k]of[['x-offroad-allocation-id','allocationId'],['x-offroad-object-id','storageObjectId'],['x-offroad-storage-version','storageVersion'],['x-offroad-payload-sha256','payloadFingerprint']])assert.equal(headers.get(h),scope[k]);assert.equal(bytes.length,scope.byteLength);}
 assert.deepEqual(Object.keys(body).sort(),['schemaVersion','materials','financialModel','materialTruth','dataRoom'].sort());assert.equal(body.schemaVersion,'2026.08.29-v1');assert(Array.isArray(body.materials)&&body.materials.length>0);
}

export function validateMaterialScope(value,f){
 assert.deepEqual(Object.keys(value).sort(),['schemaVersion','revisionId','recipeId','bundleFingerprint','scope'].sort());assert.equal(value.schemaVersion,'capital-material-read-scope.v1');assert.equal(value.revisionId,f.revisionId);assert.equal(value.recipeId,f.recipeId);assert(/^[a-f0-9]{64}$/.test(value.bundleFingerprint));
 const s=value.scope;assert.deepEqual(Object.keys(s).sort(),['schemaVersion','organizationId','workId','recipeId','allocationId','retainedPayloadId','kind','payloadFingerprint','byteLength','bucket','path','storageObjectId','storageVersion','expiresAt','purgeAt'].sort());
 assert.equal(s.schemaVersion,'capital-material-body-scope.v1');for(const key of['organizationId','workId','recipeId','retainedPayloadId'])assert.equal(s[key],f[key]);assert.equal(s.kind,'material_package');assert.equal(s.bucket,'capital-input-capture');assert(uuid.test(s.allocationId)&&uuid.test(s.storageObjectId));assert(/^[a-f0-9]{64}$/.test(s.payloadFingerprint));assert(Number.isSafeInteger(s.byteLength)&&s.byteLength>0&&s.byteLength<=1048576);assert(typeof s.path==='string'&&s.path.length>0&&typeof s.storageVersion==='string'&&s.storageVersion.length>0);assert(Number.isFinite(Date.parse(s.expiresAt))&&Date.parse(s.expiresAt)>Date.now());assert(Number.isFinite(Date.parse(s.purgeAt))&&Date.parse(s.purgeAt)>Date.now());return s;
}
