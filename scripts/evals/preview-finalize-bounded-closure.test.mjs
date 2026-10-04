import {test}from'node:test';import assert from'node:assert/strict';import{readFileSync}from'node:fs';
const source=readFileSync(new URL('../../supabase/pending/capital_preview_finalize_bounded_closure.sql',import.meta.url),'utf8');
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
