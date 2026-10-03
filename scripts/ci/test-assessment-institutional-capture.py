#!/usr/bin/env python3
"""Rollback SQL proof using the real approved material case producer/lease.
Local PG interfaces are not an HTTP/physical Storage proof.
The two isolated dead-hold subscenarios belong to the separate material route
suite: their no-active-turn premise is false after real institutional approval
queues its calculation. This fixture runs the current deterministic consumer
against the actual public loader before settling that turn via public writers.
"""
import os,re,runpy,subprocess,json,shlex,tempfile
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
# Capture the canonical d5 template, then remap the complete concatenated
# fixture once. The prior physical SDK deliberately retains its own d5 rows.
with patch.dict(os.environ,{'MATERIAL_FIXTURE_PREFIX':'d5','MATERIAL_FIXTURE_TAG':''}), patch.object(subprocess,'run',capture):
 try:runpy.run_path(str(ROOT/'scripts/ci/test-material-production-plan-native.py'))
 except SystemExit as e:assert e.code==0
assert len(fixture)==1
s=fixture[0]
# Do not fake-finish the legitimate calculation turn just to reuse historical
# dead-hold scenarios. Their standalone material SQL gate remains unchanged.
start=s.index('-- Dead hold 1, rolled back afterwards:')
end_marker='rollback to savepoint dead_after_newer_brief;'
end=s.index(end_marker,start)+len(end_marker)
assert 'savepoint dead_after_edit;'in s[start:end] and 'savepoint dead_after_newer_brief;'in s[start:end]
s=s[:start]+"-- Institutional capture fixture executes its real queued calculation turn;\n-- independent dead-hold scenarios execute in the separate material route gate.\n"+s[end:]
drafts='' if mode=='0' else ''.join((ROOT/'supabase/pending'/(n+'.sql')).read_text()+'\n'for n in ['assessment_input_capture','assessment_review_projection','assessment_effective_case_input','work_update_native_adoption','assessment_institutional_capture','assessment_research_capture'])
if mode=='1':s=s.replace('begin;','begin;\n'+drafts,1)
# Publish both source rights and the real initial configuration/human approval
# before structure/plan approval fix their input and source closures. The support
# file supplies synthetic inputs; native rows arise only from current commands.
setup=(ROOT/'supabase/tests/support/assessment_institutional_nonempty.sql').read_text()
marker='-- 2. Structure confirmed, with the decision the structure form records.'
assert s.count(marker)==1
s=s.replace(marker,setup+'\n'+marker,1)
needle="insert into route_proof values('native_claim',claim::text);"
assert s.count(needle)==1
s=s.replace(needle,needle+"\nbegin perform public.worker_record_agent_assessment_v1(job,claim->>'capability_token','{}');raise exception 'v1_case_before_capture_accepted';exception when insufficient_privilege then if sqlerrm<>'assessment_native_writer_required'then raise;end if;end;\nbegin perform public.worker_load_assessment_institutional_context_v1(job,repeat('x',64));raise exception 'wrong_capture_capability_accepted';exception when insufficient_privilege then null;end;\nbegin perform public.worker_record_agent_assessment_v1(job,claim->>'capability_token','{}');raise exception 'v1_case_after_capture_denial_accepted';exception when insufficient_privilege then if sqlerrm<>'assessment_native_writer_required'then raise;end if;end;\nraise notice 'PASS assessment_case_v1_42501_before_capture_after_denial_same_cap';\ninsert into route_proof values('assessment_institutional',public.worker_load_assessment_institutional_context_v1(job,claim->>'capability_token')::text);\n",1)
s=s[:s.index('-- Actual upload policy under the genuine lease/capability.')]+(ROOT/'supabase/tests/support/assessment_native_assessment_institutional_capture.sql').read_text()+'\nrollback;'
prefix=os.environ.get('ASSESSMENT_INSTITUTIONAL_FIXTURE_PREFIX','a6')
assert re.fullmatch('[a-f0-9]{2}',prefix) and prefix not in('00','ff','d5')
s=re.sub(r'd5(?=[a-f0-9]{6}-)',prefix,s)
tag='assessment-institutional-'+prefix
for person in ('owner','worker','outsider'):s=s.replace('route-'+person+'@',tag+'-'+person+'@')
s=re.sub(r"repeat\('r',\s*64\)","'"+(prefix+'3v-native-institutional').ljust(64,'0')+"'",s)
assert not re.search(r'd5[a-f0-9]{6}-',s),'unmapped shared fixture identity'
# The SQL transaction cannot expose uncommitted context over another HTTP/DB
# connection. Relay the actual public loader result to the current deterministic
# consumer, then deliver its exact write payload back to the public SQL command.
# No receipt/ack is simulated; the Node consumer stops at its transport boundary.
with tempfile.TemporaryDirectory(prefix='offroad-assessment-institutional-calc-') as directory:
 tmp=Path(directory);context_path=tmp/'context.json';result_path=tmp/'result.json';entry=tmp/'consumer.mjs'
 for path in(context_path,result_path):path.touch(mode=0o600)
 source=r"""
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,statSync} from 'node:fs';
import {processInstitutionalModelResult} from './src/institutional-model-runtime';
const [contextPath,resultPath]=process.argv.slice(2);
assert.equal(Number(process.versions.node.split('.')[0]),24);
assert.equal(statSync(contextPath).mode&0o077,0);assert.equal(statSync(resultPath).mode&0o077,0);
const {job,context}=JSON.parse(readFileSync(contextPath,'utf8'));
assert.equal(job.kind,'agent_operation_brief');assert.equal(job.payload.message_id,context.modelResultRequest.id);
assert.equal(context.approvedConfigurations.length,1);
assert.equal(context.modelResultRequest.status,'queued');
assert.ok(context.inputSnapshot?.id);assert.ok(context.inputSnapshot?.fingerprint);
class DeferredWrite extends Error{}
let writes=0;
try{await processInstitutionalModelResult({job,queue:{loadInstitutionalModelContext:async()=>context,recordInstitutionalModelResult:async(actualJob,result)=>{
 assert.equal(actualJob,job);assert.equal(result.status,'completed');assert.deepEqual(result.inputSnapshot,context.inputSnapshot);
 writes++;writeFileSync(resultPath,JSON.stringify(result),{mode:0o600});throw new DeferredWrite();
}}});throw new Error('actual_consumer_did_not_prepare_write');}catch(error){if(!(error instanceof DeferredWrite))throw error;}
assert.equal(writes,1);
"""
 bundler=r"""import {createRequire} from 'node:module';
const requireWorker=createRequire(WORKER_PACKAGE);
const {build}=requireWorker('esbuild');
await build({stdin:{contents:SOURCE,resolveDir:WORKER_DIR,sourcefile:'assessment-institutional-current-consumer.js',loader:'js'},outfile:OUTPUT,
 bundle:true,platform:'node',format:'esm',target:'node24',logLevel:'silent',plugins:[{name:'external-third-party',setup(b){
 b.onResolve({filter:/^[^.\/]/},async args=>{if(args.path.startsWith('@offroad/')||args.pluginData?.externalized)return null;
 const resolved=await b.resolve(args.path,{resolveDir:args.resolveDir,kind:args.kind,pluginData:{externalized:true}});
 if(resolved.errors.length)throw new Error('dependency_resolution_failed');return{path:resolved.path,external:true};});}}]});
"""
 worker=ROOT/'apps/document-worker'
 for name,value in [('WORKER_PACKAGE',str(worker/'package.json')),('WORKER_DIR',str(worker)),('SOURCE',source),('OUTPUT',str(entry))]:bundler=bundler.replace(name,json.dumps(value))
 built=subprocess.run(['node','--input-type=module'],input=bundler,text=True,capture_output=True,timeout=60)
 if built.returncode:raise SystemExit('assessment_actual_institutional_consumer_bundle_failed')
 relay=r"""\pset format unaligned
\pset tuples_only on
select jsonb_build_object('job',current_setting('test.setup_calculation_claim')::jsonb,'context',current_setting('test.setup_calculation_context')::jsonb)
\g CONTEXT_PATH
\! node NODE_ENTRY CONTEXT_ARG RESULT_ARG
\if :SHELL_ERROR
\quit 3
\endif
\set setup_calculation_result `cat RESULT_ARG`
\pset tuples_only off
\pset format aligned
"""
 for name,value in [('CONTEXT_PATH',str(context_path)),('NODE_ENTRY',shlex.quote(str(entry))),('CONTEXT_ARG',shlex.quote(str(context_path))),('RESULT_ARG',shlex.quote(str(result_path)))]:relay=relay.replace(name,value)
 assert s.count('__ASSESSMENT_CALCULATION_RELAY__')==1
 s=s.replace('__ASSESSMENT_CALCULATION_RELAY__',relay)
 result=subprocess.run(['psql',os.environ['DATABASE_URL'],'-X','-v','ON_ERROR_STOP=1'],input=s,text=True,capture_output=True,timeout=90)
 print(result.stdout[-1500:]);print(result.stderr[-12000:]);raise SystemExit(result.returncode)
