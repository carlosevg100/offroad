#!/usr/bin/env python3
"""Install only on a disposable loopback database; never repair a journal."""
import os,subprocess
from pathlib import Path
from urllib.parse import urlparse
ROOT=Path(__file__).resolve().parents[2]
def validate(env):
 assert env.get('OFFROAD_WORK_REVIEW_DRAFT_INSTALL')=='isolated-loopback-ci','Explicit disposable-stack mode required'
 u=urlparse(env.get('DATABASE_URL',''))
 assert u.scheme in ('postgresql','postgres') and u.hostname in ('localhost','127.0.0.1','::1') and not u.query and not u.fragment,'Disposable loopback database required'
def main():
 validate(os.environ)
 sql='begin;\n'+(ROOT/'supabase/pending/work_review_dashboard.sql').read_text()+'\ncommit;'
 subprocess.run(['psql',os.environ['DATABASE_URL'],'-Xq','-v','ON_ERROR_STOP=1'],input=sql,text=True,cwd=ROOT,check=True)
if __name__=='__main__':main()
