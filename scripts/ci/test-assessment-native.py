#!/usr/bin/env python3
"""3V rollback suites against disposable real Supabase. Never remote targets."""
import os,re,subprocess
from pathlib import Path
from native_canonical_install_state import canonical_group_installed
from urllib.parse import urlparse
ROOT=Path(__file__).resolve().parents[2]
url=os.environ['DATABASE_URL']
if urlparse(url).hostname not in('localhost','127.0.0.1','::1'):raise SystemExit('Assessment evaluation requires disposable local Supabase')
mode=os.environ.get('ASSESSMENT_DRAFT_IN_TRANSACTION','1')
if mode=='1' and canonical_group_installed(ROOT,url,'assessment6'):mode='0'
if mode not in('0','1'):raise SystemExit('ASSESSMENT_DRAFT_IN_TRANSACTION must be 0 or 1')
def expand(path):return re.sub(r'^\\ir (.+)$',lambda m:expand(path.parent/m[1].strip()),path.read_text(),flags=re.M)
drafts=''
if mode=='1':drafts=''.join((ROOT/'supabase/pending'/(n+'.sql')).read_text()+'\n'for n in ['assessment_input_capture','assessment_review_projection','assessment_effective_case_input','work_update_native_adoption','assessment_institutional_capture','assessment_research_capture'])
for name in ['assessment_review_projection','assessment_rejection_and_revision','assessment_public_research_denial','work_update_native_adoption']:
 query=expand(ROOT/'supabase/tests/support'/('assessment_native_'+name+'.sql')).replace('begin;','begin;\n'+drafts,1)
 result=subprocess.run(['psql',url,'-X','-v','ON_ERROR_STOP=1'],input=query,text=True,capture_output=True,timeout=90)
 if result.returncode:
  print(result.stderr[-5000:]);raise SystemExit(result.returncode)
 print(name+': PASS (SQL rollback; not HTTP evidence)')
