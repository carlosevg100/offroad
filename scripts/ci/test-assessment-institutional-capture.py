#!/usr/bin/env python3
"""Rollback SQL proof using the real approved material case producer/lease.
Local PG interfaces are not an HTTP/physical Storage proof.
"""
import os,runpy,subprocess
from urllib.parse import urlparse
from pathlib import Path
from unittest.mock import patch
ROOT=Path(__file__).resolve().parents[2]
url=os.environ['DATABASE_URL']
if urlparse(url).hostname not in ('localhost','127.0.0.1','::1'):raise SystemExit('Assessment evaluation requires disposable local Supabase')
mode=os.environ.get('ASSESSMENT_DRAFT_IN_TRANSACTION','1')
if mode not in ('0','1'):raise SystemExit('ASSESSMENT_DRAFT_IN_TRANSACTION must be 0 or 1')
# Obtain the maintained real case fixture without executing its test subprocess.
class Captured:
 returncode=0
 stdout=''
 stderr=''
fixture=[]
def capture(*args,**kwargs):
 fixture.append(kwargs['input']);return Captured()
with patch.object(subprocess,'run',capture):
 try:runpy.run_path(str(ROOT/'scripts/ci/test-material-production-plan-native.py'))
 except SystemExit as e:assert e.code==0
assert len(fixture)==1
s=fixture[0]
drafts='' if mode=='0' else ''.join((ROOT/'supabase/pending'/(n+'.sql')).read_text()+'\n'for n in ['assessment_input_capture','assessment_review_projection','assessment_effective_case_input','work_update_native_adoption','assessment_institutional_capture','assessment_research_capture'])
if mode=='1':s=s.replace('begin;','begin;\n'+drafts,1)
# Real initial configuration producer and human approval before the final case
# lease. The support file inserts input documents/facts only, never outputs.
setup=(ROOT/'supabase/tests/support/assessment_institutional_nonempty.sql').read_text()
marker='reset role;\ndo $$declare job uuid;begin\n select(value::jsonb'
assert s.count(marker)==1
s=s.replace(marker,setup+'\n'+marker,1)
needle="insert into route_proof values('native_claim',claim::text);"
assert s.count(needle)==1
s=s.replace(needle,needle+"\ninsert into route_proof values('assessment_institutional',public.worker_load_assessment_institutional_context_v1(job,claim->>'capability_token')::text);\n",1)
s=s[:s.index('-- Actual upload policy under the genuine lease/capability.')]+(ROOT/'supabase/tests/support/assessment_native_assessment_institutional_capture.sql').read_text()+'\nrollback;'
result=subprocess.run(['psql',os.environ['DATABASE_URL'],'-X','-v','ON_ERROR_STOP=1'],input=s,text=True,capture_output=True,timeout=90)
print(result.stdout[-1500:]);print(result.stderr[-3500:]);raise SystemExit(result.returncode)
