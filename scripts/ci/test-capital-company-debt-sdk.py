#!/usr/bin/env python3
"""Portable real local Supabase DEBT initial+human-return SDK gate.
Run after canonical migrations + native DEBT/review forward + Edge function are
installed in an isolated stack. Fixtures cannot target staging/production.
The owner of CI starts/stops/reset the stack; this script does not deploy/reset.
"""
import os, subprocess, sys
from pathlib import Path
from urllib.parse import urlparse
ROOT=Path(__file__).resolve().parents[2]

def checked_local(value, protocol):
    parsed=urlparse(value)
    assert parsed.scheme==protocol and parsed.hostname in ('localhost','127.0.0.1','::1'), 'Isolated loopback stack required'
    assert not parsed.query and not parsed.fragment, 'Target query/fragment forbidden'
    if protocol=='http':
        assert not parsed.username and not parsed.password and parsed.path in ('','/'), 'Closed local API root required'
    else:
        assert parsed.path not in ('','/'), 'Explicit local database required'
    return parsed

def validate(env):
    checked_local(env.get('DATABASE_URL',''),'postgresql')
    checked_local(env.get('OFFROAD_E2E_API_URL',''),'http')
    key=env.get('OFFROAD_E2E_PUBLISHABLE_KEY','')
    assert key and not key.startswith('sb_secret_'), 'Publishable key required'
    assert not any(env.get(k) for k in ('DEBT_FIXTURE_CONTINUATION','DEBT_FIXTURE_RENDERER','DEBT_FIXTURE_AFTER_RENDERER','DEBT_FIXTURE_SECOND_AFTER_RENDERER','DEBT_FIXTURE_REVISION_RENDERER_CONTINUATION','BRIEF_UI_FIXTURE','BRIEF_UI_NAMESPACE','BRIEF_DRAFT_IN_TRANSACTION')), 'SDK bootstrap must not fabricate native bodies or install draft DDL'

def main():
    if len(sys.argv)==2 and sys.argv[1]=='--self-test':
        for env in (
            {'DATABASE_URL':'postgresql://example.org/db','OFFROAD_E2E_API_URL':'http://127.0.0.1:54321','OFFROAD_E2E_PUBLISHABLE_KEY':'sb_publishable_fixture'},
            {'DATABASE_URL':'postgresql://127.0.0.1:54322/postgres','OFFROAD_E2E_API_URL':'https://project.supabase.co','OFFROAD_E2E_PUBLISHABLE_KEY':'sb_publishable_fixture'},
            {'DATABASE_URL':'postgresql://127.0.0.1:54322/postgres','OFFROAD_E2E_API_URL':'http://127.0.0.1:54321','OFFROAD_E2E_PUBLISHABLE_KEY':'sb_secret_forbidden'},
            {'DATABASE_URL':'postgresql://127.0.0.1:54322/postgres','OFFROAD_E2E_API_URL':'http://127.0.0.1:54321','OFFROAD_E2E_PUBLISHABLE_KEY':'sb_publishable_fixture','DEBT_FIXTURE_RENDERER':'fixture.ts'},
        ):
            try:validate(env)
            except AssertionError:pass
            else:raise AssertionError('Unsafe local gate target admitted')
        print('capital_company-debt_portable_sdk_target_guards: PASS (no SQL/HTTP)')
        return
    assert len(sys.argv)==1, 'No positional target overrides'
    env=os.environ.copy();validate(env) # before Node, SQL, Auth or fixture work
    env['DEBT_HTTP_FIXTURE']='1';env.setdefault('DEBT_HTTP_NAMESPACE','a8820001')
    loaders=sorted((ROOT/'node_modules/.pnpm').glob('tsx@*/node_modules/tsx/dist/loader.mjs'))
    assert len(loaders)==1, 'One configured TS runtime required'
    # Compile and parse the actual current schema+graders before seeding anything.
    subprocess.run(['pnpm','exec','tsc','-p','apps/document-worker/scripts/tsconfig-capital-company-debt-sdk-eval.json'],cwd=ROOT,env=env,check=True)
    sdk=['node','--import',str(loaders[0]),str(ROOT/'apps/document-worker/scripts/capital-company-debt-native-sdk-eval.ts')]
    subprocess.run(sdk+['--self-test'],cwd=ROOT,env=env,check=True)
    subprocess.run([sys.executable,str(ROOT/'scripts/ci/test-capital-company-debt-native.py')],cwd=ROOT,env=env,check=True)
    subprocess.run(sdk,cwd=ROOT,env=env,check=True)

if __name__=='__main__':main()
