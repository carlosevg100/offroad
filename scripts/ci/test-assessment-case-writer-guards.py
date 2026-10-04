#!/usr/bin/env python3
"""Rollback proof of v1 case-writer denial before capture and after denial.
Uses the maintained synthetic material-route lease. Empty institutional context
is only a transport negative baseline, never a nonempty/physical-source proof.
"""
import os,re,runpy,subprocess
from urllib.parse import urlparse
from pathlib import Path
from native_canonical_install_state import canonical_group_installed
from unittest.mock import patch
ROOT=Path(__file__).resolve().parents[2]
url=os.environ['DATABASE_URL']
if urlparse(url).hostname not in ('localhost','127.0.0.1','::1'):raise SystemExit('Assessment evaluation requires disposable local Supabase')
mode=os.environ.get('ASSESSMENT_DRAFT_IN_TRANSACTION','1')
if mode=='1' and canonical_group_installed(ROOT,url,'assessment6'):mode='0'
if mode not in ('0','1'):raise SystemExit('ASSESSMENT_DRAFT_IN_TRANSACTION must be 0 or 1')
# Obtain the maintained real case fixture without executing its test subprocess.
class Captured:
 returncode=0
 stdout=''
 stderr=''
fixture=[]
def capture(*args,**kwargs):
 fixture.append(kwargs['input']);return Captured()
# Capture the canonical d5 template, then remap the complete concatenated
# fixture once. The prior physical SDK deliberately retains its own d5 rows.
with patch.dict(os.environ,{'MATERIAL_FIXTURE_PREFIX':'d5','MATERIAL_FIXTURE_TAG':''}), patch.object(subprocess,'run',capture):
 try:runpy.run_path(str(ROOT/'scripts/ci/test-material-production-plan-native.py'))
 except SystemExit as e:assert e.code==0
assert len(fixture)==1
s=fixture[0]
# Dead-hold scenarios have their independent material gate; this focused gate
# starts directly at the current capability-bound case-writer negatives.
start=s.index('-- Dead hold 1, rolled back afterwards:')
end_marker='rollback to savepoint dead_after_newer_brief;'
end=s.index(end_marker,start)+len(end_marker)
assert 'savepoint dead_after_edit;'in s[start:end] and 'savepoint dead_after_newer_brief;'in s[start:end]
s=s[:start]+"-- Independent dead-hold scenarios execute in the separate material route gate.\n"+s[end:]
drafts='' if mode=='0' else ''.join((ROOT/'supabase/pending'/(n+'.sql')).read_text()+'\n'for n in ['assessment_input_capture','assessment_review_projection','assessment_effective_case_input','work_update_native_adoption','assessment_institutional_capture','assessment_research_capture'])
if mode=='1':s=s.replace('begin;','begin;\n'+drafts,1)
needle="insert into route_proof values('native_claim',claim::text);"
assert s.count(needle)==1
s=s.replace(needle,needle+"\nbegin perform public.worker_record_agent_assessment_v1(job,claim->>'capability_token','{}');raise exception 'v1_case_before_capture_accepted';exception when insufficient_privilege then if sqlerrm<>'assessment_native_writer_required'then raise;end if;end;\nbegin perform public.worker_load_assessment_institutional_context_v1(job,repeat('x',64));raise exception 'wrong_capture_capability_accepted';exception when insufficient_privilege then null;end;\nbegin perform public.worker_record_agent_assessment_v1(job,claim->>'capability_token','{}');raise exception 'v1_case_after_capture_denial_accepted';exception when insufficient_privilege then if sqlerrm<>'assessment_native_writer_required'then raise;end if;end;\nraise notice 'PASS assessment_case_v1_42501_before_capture_after_denial_same_cap';\ninsert into route_proof values('assessment_institutional',public.worker_load_assessment_institutional_context_v1(job,claim->>'capability_token')::text);\n",1)
# This gate owns only the genuine case lease and assessment ports. The separate
# material gate proves material capture; do not execute its body fixture here.
material_start=s.index(" begin perform public.worker_freeze_case_input(job,claim->>'capability_token','{}');")
material_end=s.index('end$$;',material_start)
s=s[:material_start]+""" a:=public.worker_load_assessment_retrieval_v2(job,claim->>'capability_token','assessment synthetic uncited query', '{}',null,20);
 if jsonb_typeof(a) is distinct from 'object' or jsonb_typeof(a->'results') is distinct from 'array'
  or not(a ? 'playbook_version') or (a->>'abstained')::boolean is distinct from (jsonb_array_length(a->'results')=0)
 then raise exception 'assessment_retrieval_delivered_contract_changed';end if;
 raise notice 'PASS assessment_retrieval_canonical_context_captured';
"""+s[material_end:]
s=s[:s.index('-- Actual upload policy under the genuine lease/capability.')]+"\nrollback;"
prefix=os.environ.get('ASSESSMENT_INSTITUTIONAL_FIXTURE_PREFIX','a6')
assert re.fullmatch('[a-f0-9]{2}',prefix) and prefix not in('00','ff','d5')
s=re.sub(r'd5(?=[a-f0-9]{6}-)',prefix,s)
tag='assessment-case-writer-'+prefix
for person in ('owner','worker','outsider'):s=s.replace('route-'+person+'@',tag+'-'+person+'@')
s=re.sub(r"repeat\('r',\s*64\)","'"+(prefix+'3v-native-institutional').ljust(64,'0')+"'",s)
assert not re.search(r'd5[a-f0-9]{6}-',s),'unmapped shared fixture identity'
result=subprocess.run(['psql',os.environ['DATABASE_URL'],'-X','-v','ON_ERROR_STOP=1'],input=s,text=True,capture_output=True,timeout=90)
print(result.stdout[-1500:]);print(result.stderr[-12000:]);raise SystemExit(result.returncode)
