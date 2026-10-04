import {test}from'node:test';import assert from'node:assert/strict';import{randomUUID}from'node:crypto';import{mkdtempSync,chmodSync,readFileSync,writeFileSync,existsSync,rmSync}from'node:fs';import{join}from'node:path';import{createMcpReadOnlyBridge,validateMaterialBody}from'./stage20-material-review-adapter.mjs';
test('material physical ABI never accepts preview or missing version/header',()=>{
 const b={schemaVersion:'2026.08.29-v1',materials:[{}],financialModel:null,materialTruth:null,dataRoom:null},bytes=Buffer.from(JSON.stringify(b)),basis={bundleFingerprint:'a'.repeat(64)};
 const h=new Headers({'content-type':'application/octet-stream','cache-control':'no-store','x-offroad-bundle-fingerprint':basis.bundleFingerprint,'x-offroad-allocation-id':randomUUID(),'x-offroad-object-id':randomUUID(),'x-offroad-storage-version':'version-real'});validateMaterialBody(b,h,bytes,basis);
 for(const key of['content-type','cache-control','x-offroad-bundle-fingerprint','x-offroad-allocation-id','x-offroad-object-id','x-offroad-storage-version']){const bad=new Headers(h);bad.delete(key);assert.throws(()=>validateMaterialBody(b,bad,bytes,basis));}
 assert.throws(()=>validateMaterialBody({...b,accepted:true},h,bytes,basis));assert.throws(()=>validateMaterialBody({...b,schemaVersion:'capital-preview-json-body.v1'},h,bytes,basis));
});
test('MCP checkpoint cannot confer authority and requires actual exact aggregate response',async()=>{
 const dir=mkdtempSync('/tmp/offroad-review-operator-');chmodSync(dir,0o700);
 try{const reader=createMcpReadOnlyBridge(dir);await assert.rejects(()=>reader('delete from public.capital_projects;'));const pending=reader("select jsonb_build_object('jobs',0,'vault',0,'introductions',0);");assert(existsSync(join(dir,'request-1.json')));const request=JSON.parse(readFileSync(join(dir,'request-1.json')));writeFileSync(join(dir,'response-1.json'),JSON.stringify({schemaVersion:'stage20-operator-read-response.v1',id:request.id,result:{jobs:0,vault:0,introductions:0}}),{mode:0o600});assert.deepEqual(JSON.parse(await pending),{jobs:0,vault:0,introductions:0});}finally{rmSync(dir,{recursive:true});}
});

test('material scope binds current retained object, recipe and TTL without any grant flag',async()=>{
 const{validateMaterialScope}=await import('./stage20-material-review-adapter.mjs');const f={revisionId:randomUUID(),recipeId:randomUUID(),organizationId:randomUUID(),workId:randomUUID(),retainedPayloadId:randomUUID()};
 const scope={schemaVersion:'capital-material-body-scope.v1',organizationId:f.organizationId,workId:f.workId,recipeId:f.recipeId,allocationId:randomUUID(),retainedPayloadId:f.retainedPayloadId,kind:'material_package',payloadFingerprint:'a'.repeat(64),byteLength:123,bucket:'capital-input-capture',path:'synthetic/exact',storageObjectId:randomUUID(),storageVersion:'physical-1',expiresAt:new Date(Date.now()+60000).toISOString(),purgeAt:new Date(Date.now()+120000).toISOString()};
 const v={schemaVersion:'capital-material-read-scope.v1',revisionId:f.revisionId,recipeId:f.recipeId,bundleFingerprint:'b'.repeat(64),scope};assert.equal(validateMaterialScope(v,f),scope);
 for(const key of['workId','organizationId','recipeId','retainedPayloadId'])assert.throws(()=>validateMaterialScope({...v,scope:{...scope,[key]:randomUUID()}},f));
 assert.throws(()=>validateMaterialScope({...v,scope:{...scope,expiresAt:'2000-01-01T00:00:00Z'}},f));assert.throws(()=>validateMaterialScope({...v,accepted:true},f));assert.throws(()=>validateMaterialScope({...v,scope:{...scope,kind:'context'}},f));
});

test('private JSON reads validate the opened descriptor and reject symlinks, hardlinks and broad modes',async()=>{
 const fs=(await import('node:fs')).default;
 const {readPrivateJsonFile}=await import('./stage20-material-review-adapter.mjs');
 const dir=fs.mkdtempSync('/tmp/offroad-review-fd-');fs.chmodSync(dir,0o700);
 try{
  const path=join(dir,'fixture.json');fs.writeFileSync(path,JSON.stringify({synthetic:true}),{mode:0o600});
  assert.deepEqual(readPrivateJsonFile(path),{synthetic:true});
  const link=join(dir,'link.json');fs.symlinkSync(path,link);assert.throws(()=>readPrivateJsonFile(link),error=>error.code==='ELOOP');
  const hard=join(dir,'hard.json');fs.linkSync(path,hard);assert.throws(()=>readPrivateJsonFile(path),/private regular file required/);fs.unlinkSync(hard);
  fs.chmodSync(path,0o644);assert.throws(()=>readPrivateJsonFile(path),/file must be private/);fs.chmodSync(path,0o600);
  assert.throws(()=>readPrivateJsonFile(dir),/private regular file required/);
  fs.writeFileSync(path,'');assert.throws(()=>readPrivateJsonFile(path),/bounded private file required/);
  fs.writeFileSync(path,' '.repeat(1048577));assert.throws(()=>readPrivateJsonFile(path),/bounded private file required/);
 }finally{fs.rmSync(dir,{recursive:true});}
});

test('pathname replacement after validation never redirects a descriptor read to substituted file data',async t=>{
 const fs=(await import('node:fs')).default;
 const {readPrivateJsonFile}=await import('./stage20-material-review-adapter.mjs');
 const dir=fs.mkdtempSync('/tmp/offroad-review-fd-race-');fs.chmodSync(dir,0o700);
 const path=join(dir,'fixture.json'),original=fs.readFileSync;
 fs.writeFileSync(path,JSON.stringify({value:'original-authorized-inode'}),{mode:0o600});
 let actuallyRead;
 t.mock.method(fs,'readFileSync',(descriptor,encoding)=>{
  assert.equal(typeof descriptor,'number','reader must not reopen the checked pathname');
  fs.renameSync(path,path+'.original');fs.writeFileSync(path,JSON.stringify({value:'substituted-private-data'}),{mode:0o600});
  actuallyRead=original(descriptor,encoding);return actuallyRead;
 });
 try{
  let answer;
  try{answer=readPrivateJsonFile(path);}catch(error){assert.match(error.message,/private file changed while reading/);}
  assert.equal(JSON.parse(actuallyRead).value,'original-authorized-inode');
  if(answer)assert.equal(answer.value,'original-authorized-inode');
 }finally{t.mock.restoreAll();fs.rmSync(dir,{recursive:true});}
});

test('MCP response symlink is denied rather than read after a private pathname stat',async()=>{
 const fs=(await import('node:fs')).default;
 const dir=fs.mkdtempSync('/tmp/offroad-review-bridge-race-');fs.chmodSync(dir,0o700);
 try{
  const reader=createMcpReadOnlyBridge(dir),pending=reader("select jsonb_build_object('jobs',0,'vault',0,'introductions',0);");
  const request=JSON.parse(fs.readFileSync(join(dir,'request-1.json'))),target=join(dir,'substituted.json');
  fs.writeFileSync(target,JSON.stringify({schemaVersion:'stage20-operator-read-response.v1',id:request.id,result:{jobs:0,vault:0,introductions:0}}),{mode:0o600});
  fs.symlinkSync(target,join(dir,'response-1.json'));
  await assert.rejects(pending,error=>error.code==='ELOOP');
 }finally{fs.rmSync(dir,{recursive:true});}
});
