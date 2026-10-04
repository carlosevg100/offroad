import {test}from'node:test';import assert from'node:assert/strict';import{readFileSync,existsSync,mkdtempSync,mkdirSync,writeFileSync,rmSync}from'node:fs';
import{createHash}from'node:crypto';import{tmpdir}from'node:os';import{join}from'node:path';import{pathToFileURL}from'node:url';
function readFinalizeSource(root=new URL('../../',import.meta.url)){
 const manifest=new URL('docs/build/schema-history/stage20-native-canonical.json',root);
 if(!existsSync(manifest))return readFileSync(new URL('supabase/pending/capital_preview_finalize_bounded_closure.sql',root),'utf8');
 const entry=JSON.parse(readFileSync(manifest,'utf8')).groups.find(x=>x.group==='preview_finalize_bounded_closure');
 assert(entry&&typeof entry.path==='string'&&/^[a-f0-9]{64}$/.test(entry.sha256),'Canonical finalize source required');
 const file=new URL(entry.path,root);assert(file.href.startsWith(root.href)&&entry.path.endsWith('.sql'),'Canonical finalize path outside repository');
 const bytes=readFileSync(file);assert.equal(createHash('sha256').update(bytes).digest('hex'),entry.sha256,'Canonical finalize source drift');return bytes.toString('utf8');
}
const source=readFinalizeSource();

test('finalize checks a fresh full proof before leaves and after the immutable result write',()=>{
 const body=source.slice(source.indexOf('create or replace function private.worker_finalize'));
 assert.equal((body.match(/private.require_capital_preview_run_proof_v1\(/g)||[]).length,2);
 assert.equal((body.match(/private.require_capital_preview_finalize_leaves_v1\(/g)||[]).length,2);
 assert(body.indexOf('private.require_capital_preview_run_proof_v1')<body.indexOf('insert into private.capital_preview_run_results'));
 assert(body.lastIndexOf('private.require_capital_preview_run_proof_v1')>body.indexOf('insert into private.capital_preview_run_results'));
 assert(!/statement_timeout|set_config|create table|grant execute/i.test(source.replace(/^--.*$/gm,'')));
});
test('leaf substitution retains current physical input, purge, task and final-contract proofs without repeated corpus recursion',()=>{
 const body=source.slice(source.indexOf('create function private.require_capital_preview_finalize_leaves'),source.indexOf('create or replace function private.worker_finalize'));
 for(const clause of ["b.run_id=p_run.id","b.kind='actual_input'","b.semantic_fingerprint=input_pin->>'fingerprint'","x.role='decision_contract'","private.capital_body_physical_receipt_v1","purge.status='pending'","least(a.expires_at,a.purge_at,p_run_deadline)>clock_timestamp()","private.capital_preview_projection_leaf_deadline_v1"])assert(body.includes(clause),clause);
 assert(!body.includes('capital_preview_run_deadline_v1'));assert(!body.includes('capital_preview_allocation_deadline_v1'));
 assert(source.includes('from public,anon,authenticated,service_role;'));
});

test('canonical finalize source remains verifiable after pending retirement and rejects drift',()=>{
 const directory=mkdtempSync(join(tmpdir(),'offroad-preview-canonical-source-'));const root=pathToFileURL(directory+'/');
 try{
  mkdirSync(join(directory,'docs/build/schema-history'),{recursive:true});mkdirSync(join(directory,'supabase/migrations'),{recursive:true});
  const path='supabase/migrations/20260101000000_fixture.sql';const sha256=createHash('sha256').update(source).digest('hex');
  writeFileSync(join(directory,path),source);writeFileSync(join(directory,'docs/build/schema-history/stage20-native-canonical.json'),JSON.stringify({groups:[{group:'preview_finalize_bounded_closure',path,sha256}]}));
  assert.equal(readFinalizeSource(root),source);assert.equal(existsSync(join(directory,'supabase/pending')),false);
  writeFileSync(join(directory,path),source+'\n');assert.throws(()=>readFinalizeSource(root),/Canonical finalize source drift/);
 }finally{rmSync(directory,{recursive:true,force:true});}
});
