#!/usr/bin/env python3
"""Native deterministic plan/approval commands against a historical route fixture.
The fixture supplies no native plan/approval/capture rows; the new commands must
produce all of them. This is SQL authority evidence, not physical/compiler proof.
"""
import os,re,subprocess
from pathlib import Path
from urllib.parse import urlparse
ROOT=Path(__file__).resolve().parents[2]
url=os.environ['DATABASE_URL']
assert urlparse(url).hostname in ('localhost','127.0.0.1','::1')
def expand(path):return re.sub(r'^\\ir (.+)$',lambda m:expand(path.parent/m[1].strip()),path.read_text(),flags=re.M)
s=expand(ROOT/'supabase/tests/support/material_production_route_fixture.sql')
old="""  perform public.worker_record_deal_state_object(job_id, claim ->> 'capability_token', p_object_type,
    'pending_confirmation', p_input_fingerprint, p_payload,
    (select value::jsonb from route_proof where label = p_trigger || ':dependencies'));"""
new="""  if p_object_type='production_plan' then
 insert into route_proof values('native_plan',public.worker_prepare_material_production_plan_v1(job_id,claim->>'capability_token',gen_random_uuid())::text);
 else
"""+old+"\nend if;"
assert old in s;s=s.replace(old,new)
# The queue is global. Schedule only this disposable fixture's own job before
# claiming it; do not cancel, rewrite or lease unrelated staging jobs.
s=s.replace("claim jsonb := public.worker_claim_job_v4(repeat('r', 64), 600);", "claim jsonb;")
s=s.replace("begin\n  if not coalesce((claim ->> 'claimed')::boolean, false) or (claim ->> 'job_id')::uuid <> job_id", "begin\n  perform pg_temp.prioritize_material_fixture_job(job_id);\n  claim := public.worker_claim_job_v4(repeat('r', 64), 600);\n  if not coalesce((claim ->> 'claimed')::boolean, false) or (claim ->> 'job_id')::uuid <> job_id",1)
s=s.replace('begin;','begin;\n'+"""create function pg_temp.prioritize_material_fixture_job(p_job uuid) returns void language plpgsql security definer set search_path='' as $$begin
 if not exists(select 1 from public.processing_jobs where id=p_job and organization_id='d5200000-0000-4000-8000-000000000001') then raise exception 'material_fixture_job_scope';end if;
 update public.processing_jobs set available_at=(select coalesce(min(available_at),now())-interval '1 second' from public.processing_jobs) where id=p_job;
end$$;\n""",1)

draft_mode=os.environ.get('MATERIAL_DRAFT_IN_TRANSACTION','0')
assert draft_mode in('0','1'),'MATERIAL_DRAFT_IN_TRANSACTION must be 0 or 1'
if draft_mode=='1':
 def migration_sql(name):
  matches=list((ROOT/'supabase/migrations').glob('*_'+name));assert len(matches)==1,'material_migration_not_unique:'+name;return matches[0].read_text()
 draft=''.join(migration_sql(f) for f in ['material_production_native_capture.sql','material_production_plan_native.sql','material_production_consumer_native.sql','material_production_public_sources.sql','material_production_cutover.sql','material_production_terminal.sql'])
 s=s.replace('begin;','begin;\n'+draft,1)
s+='''
set local role authenticated;select pg_temp.as_owner();
do $$declare p jsonb;r jsonb;r2 jsonb;command uuid:=gen_random_uuid();begin
 select value::jsonb into strict p from route_proof where label='native_plan';
 if public.read_material_production_plan_v1((p->>'workId')::uuid,(p->>'planId')::uuid)->>'planFingerprint'<>p->>'planFingerprint' then raise exception 'native_plan_human_read_mismatch';end if;
 begin perform public.approve_material_production_plan_v1((p->>'workId')::uuid,(p->>'planId')::uuid,repeat('f',64),command);raise exception 'changed_plan_approved';exception when insufficient_privilege then null;end;
 r:=public.approve_material_production_plan_v1((p->>'workId')::uuid,(p->>'planId')::uuid,p->>'planFingerprint',command);
 r2:=public.approve_material_production_plan_v1((p->>'workId')::uuid,(p->>'planId')::uuid,p->>'planFingerprint',command);
 if(r-'replayed')<>(r2-'replayed') or not(r2->>'replayed')::boolean then raise exception 'native_plan_replay_changed';end if;
 insert into route_proof values('native_approval',r::text);
 raise notice 'PASS material_native_plan_server_producer_human_read_approval_exact_replay';
end$$;
reset role;
do $$declare a jsonb;j public.processing_jobs;r public.processing_runs;begin
 select value::jsonb into strict a from route_proof where label='native_approval';
 select * into strict j from public.processing_jobs where id=(a->>'jobId')::uuid;
 select * into strict r from public.processing_runs where id=(a->>'runId')::uuid;
 if j.payload->'model_budget' is distinct from jsonb_build_object('max_cost_usd',3.10,'max_calls',4)
 or (r.budget->>'max_cost_usd')::numeric is distinct from 3.10 or (r.budget->>'case_max_cost_usd')::numeric is distinct from 3.10
 or (r.budget->>'max_calls')::integer is distinct from 4 then raise exception 'native_material_approval_budget_unbounded';end if;
 raise notice 'PASS material_native_actual_approval_effect_has_run_and_job_budget';
end$$;
do $$begin if(select count(*) from private.material_production_plan_approvals where organization_id='d5200000-0000-4000-8000-000000000001')<>1 then raise exception 'native_plan_approval_count';end if;if exists(select 1 from private.case_execution_inputs where organization_id='d5200000-0000-4000-8000-000000000001') then raise exception 'raw_input_copied';end if;raise notice 'PASS material_native_plan_no_raw_input_persistence';end$$;
'''
consumer=expand(ROOT/'supabase/tests/support/material_production_native_consumer.sql')
if os.environ.get('MATERIAL_TERMINAL')=='1' or os.environ.get('MATERIAL_DOMAIN_TERMINAL')=='1':
 consumer=consumer.split('-- Final package follows physically committed state.')[0]
 consumer=consumer.replace("array['calculation_report','case_state']", "array['calculation_report','case_state']" if os.environ.get('MATERIAL_DOMAIN_TERMINAL')=='1' else "array['calculation_report']")
 if os.environ.get('MATERIAL_DOMAIN_TERMINAL')=='1':consumer=consumer.replace("'materialsBlockedBy','[]'::jsonb","'materialsBlockedBy',jsonb_build_array('brief_unavailable')")
 if os.environ.get('MATERIAL_DOMAIN_TERMINAL')!='1':consumer=consumer.replace("'status','succeeded'", "'status','blocked'")
 consumer+=expand(ROOT/'supabase/tests/support/material_production_native_terminal.sql')
if os.environ.get('MATERIAL_TERMINAL')!='1' and os.environ.get('MATERIAL_DOMAIN_TERMINAL')!='1':consumer+=expand(ROOT/'supabase/tests/support/material_production_native_denials.sql')
catalogue=(ROOT/'supabase/tests/material_production_native_capture.sql').read_text().replace('begin;','',1).replace('rollback;','')
s+=consumer+'\n'+expand(ROOT/'supabase/tests/support/material_production_internal_readiness.sql')+'\n'+catalogue+'\nrollback;\n'
fixture_prefix=os.environ.get('MATERIAL_FIXTURE_PREFIX','d5')
assert re.fullmatch('[a-f0-9]{2}',fixture_prefix)and fixture_prefix not in('00','ff')
s=re.sub(r'd5(?=[a-f0-9]{6}-)',fixture_prefix,s)
fixture_tag=os.environ.get('MATERIAL_FIXTURE_TAG','')
assert not fixture_tag or re.fullmatch('[a-f0-9]{12}',fixture_tag)
if fixture_tag:
 s=s.replace('route-owner@',f'material-{fixture_tag}-owner@').replace('route-worker@',f'material-{fixture_tag}-worker@')
 s=s.replace('route-outsider@',f'material-{fixture_tag}-outsider@')
 s=re.sub(r"repeat\('r',\s*64\)","'"+fixture_tag.ljust(64,'0')+"'",s)
p=subprocess.run(['psql',url,'-X','-v','ON_ERROR_STOP=1'],input=s,text=True,capture_output=True,timeout=90)
print(p.stdout[-2000:]);print(p.stderr[-4000:]);raise SystemExit(p.returncode)
