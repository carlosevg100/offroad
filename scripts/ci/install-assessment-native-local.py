#!/usr/bin/env python3
"""Install prospective 3V SQL once on the disposable loopback CI database only.
No migration journal is written and this is never a deployment command.
"""
import os,subprocess
from pathlib import Path
from urllib.parse import urlparse
ROOT=Path(__file__).resolve().parents[2]
url=os.environ['DATABASE_URL']
if urlparse(url).hostname not in ('localhost','127.0.0.1','::1'):raise SystemExit('Disposable loopback database required')
files=['assessment_input_capture','assessment_review_projection','assessment_effective_case_input','work_update_native_adoption','assessment_institutional_capture','assessment_research_capture']
query="begin;do $$begin if to_regclass('private.assessment_input_snapshots')is not null then raise exception 'assessment_candidate_already_installed';end if;end$$;\n"+''.join((ROOT/'supabase/pending'/(name+'.sql')).read_text()+'\n' for name in files)+'commit;'
p=subprocess.run(['psql',url,'-X','-v','ON_ERROR_STOP=1'],input=query,text=True,capture_output=True,timeout=90)
if p.returncode:print(p.stderr[-5000:]);raise SystemExit(p.returncode)
print('assessment six prospective drafts: installed once on disposable loopback DB (no journal stamp)')
