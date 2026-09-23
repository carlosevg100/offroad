#!/usr/bin/env python3
"""R01 storage contention: disposable local CI database only, no provider calls."""
import os
import select
import subprocess
import time
from urllib.parse import urlparse

url=os.environ['DATABASE_URL']
if urlparse(url).hostname not in ('localhost','127.0.0.1','::1'):
    raise SystemExit('Integrity concurrency requires the disposable local CI database')
cmd=['psql',url,'-X','-A','-t','-q','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose']
org='20000000-0000-4000-8000-000000000731'
work='30000000-0000-4000-8000-000000000731'
session='10000000-0000-4000-8000-000000000090'
subject='10000000-0000-4000-8000-000000000731'
job='80000000-0000-4000-8000-000000000731'
preparation=f"select private.r01_preparation_authority_v1('{org}','{work}','{session}','{subject}');"

def raw(sql,timeout=15):
    return subprocess.run(cmd,input=sql,text=True,capture_output=True,timeout=timeout)

def run(sql):
    p=raw(sql)
    assert p.returncode==0,p.stderr
    return p.stdout.strip()

def denied(sql,code='40001',message='receivables_history_concurrent_change'):
    p=raw("begin;set local statement_timeout='5s';"+sql+'commit;')
    assert p.returncode!=0 and code in p.stderr and message in p.stderr,p.stderr
    assert '40P01' not in p.stderr and '57014' not in p.stderr,p.stderr

class Held:
    def __init__(self,sql):
        self.buffer=b''
        self.p=subprocess.Popen(cmd,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,bufsize=0)
        try:self.send("\\o /dev/null\nbegin;set local statement_timeout='10s';"+sql)
        except BaseException:
            if self.p.poll() is None:self.p.kill();self.p.wait(timeout=10)
            raise

    def send(self,sql):
        self.p.stdin.write((sql+'\n\\echo R01_INTEGRITY_HELD\n').encode());self.p.stdin.flush()
        deadline=time.monotonic()+15
        seen=[]
        while time.monotonic()<deadline:
            while b'\n' in self.buffer:
                line,self.buffer=self.buffer.split(b'\n',1)
                value=line.decode('utf-8','replace').strip();seen.append(value)
                if value=='R01_INTEGRITY_HELD':return
            if not select.select([self.p.stdout],[],[],max(0,deadline-time.monotonic()))[0]:break
            data=os.read(self.p.stdout.fileno(),65536)
            if not data:break
            self.buffer+=data
        raise AssertionError('Integrity barrier absent: '+str(seen)+repr(self.buffer))

    def end(self,commit=False):
        if self.p.poll() is None:
            self.p.stdin.write(b'commit;\n' if commit else b'rollback;\n');self.p.stdin.close();self.p.stdin=None
            text=self.p.communicate(timeout=15)[0]
            assert self.p.returncode==0,text

    def fail(self,sql,message):
        self.p.stdin.write((sql+'\n').encode());self.p.stdin.close();self.p.stdin=None
        text=self.p.communicate(timeout=15)[0].decode('utf-8','replace')
        assert self.p.returncode!=0 and '40001' in text and message in text,text
        assert '40P01' not in text and '57014' not in text,text

    def __enter__(self):return self
    def __exit__(self,*args):
        if self.p.poll() is None:self.end()

def wait_locked(name,process):
    deadline=time.monotonic()+10
    while time.monotonic()<deadline:
        if run(f"select count(*) from pg_stat_activity where application_name='{name}' and wait_event_type='Lock';")=='1':return
        assert process.poll() is None,'Contender did not wait for the existing lock'
        time.sleep(.05)
    raise AssertionError('Existing lock contention was not observed')

run("begin;\n\\i supabase/tests/support/r01_preparation_setup.sql\ncommit;\n")
assert run("select count(*) from pg_trigger where tgname in ('zzz_fixture_source_rights','zz_synthetic_legacy_workspace_capabilities','zz_synthetic_policy_lease');")=='0', 'Synthetic provisioning trigger survived its setup session'
print('r01_integrity_no_live_fixture_adapters: PASS')
scope=f" where organization_id='{org}' and intake_session_id='{session}'"
patches='private.receivables_method_supplement_patches'
drafts='private.receivables_method_supplement_drafts'
fragments='private.receivables_evidence_fragments'
mutations={
 'patch_update':f'update {patches} set patch=patch'+scope+';',
 'draft_update':f'update {drafts} set draft=draft'+scope+';',
 'fragment_update':f'update {fragments} set compressed_payload=compressed_payload'+scope+';',
 'patch_delete':f'delete from {patches}'+scope+';',
 'draft_delete':f'delete from {drafts}'+scope+';',
 'fragment_delete':f'delete from {fragments}'+scope+';',
}

for label,sql in mutations.items():
    message='receivables_fragment_concurrent_change' if label.startswith('fragment') else 'receivables_history_concurrent_change'
    with Held(preparation):denied(sql,message=message)
    # A patch with a dependent draft still requires child-first cleanup.
    retry=(f'delete from {drafts}'+scope+';' if label=='patch_delete' else '')+sql
    run('begin;'+retry+'rollback;')
    print('r01_integrity_reader_first_'+label+': PASS')

# Real producer: same capability/subject checks and session/dataset lock order as runtime.
writer=f"""do $$declare p jsonb;d jsonb;begin
 select patch into strict p from {patches}{scope};
 select draft into strict d from {drafts}{scope};
 p:=jsonb_set(p,'{{patchId}}','"document-adapter:concurrency"');
 d:=jsonb_set(jsonb_set(d,'{{revision}}',to_jsonb((d->>'revision')::integer+1)),
 '{{appliedPatchIds}}',d->'appliedPatchIds'||'"document-adapter:concurrency"'::jsonb);
 perform set_config('request.jwt.claims','{{"sub":"10000000-0000-4000-8000-000000000732","role":"authenticated","aal":"aal1"}}',true);
 perform private.worker_apply_receivables_method_supplement_patch_v1('{job}',repeat('u',64),p,d);
end $$;"""
with Held(writer):
    for label,sql in mutations.items():
        message='receivables_fragment_concurrent_change' if label.startswith('fragment') else 'receivables_history_concurrent_change'
        denied(sql,message=message)
print('r01_integrity_real_producer_first: PASS')

for label in ['patch_update','draft_update','fragment_update','draft_delete','fragment_delete']:
    with Held(mutations[label]) as mutator:
        contender=subprocess.Popen(cmd,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
        try:
            contender.stdin.write("set application_name='r01_integrity_producer';begin;set local statement_timeout='10s';"+writer+'rollback;\n')
            contender.stdin.close();contender.stdin=None
            wait_locked('r01_integrity_producer',contender);mutator.end()
            _,err=contender.communicate(timeout=15);assert contender.returncode==0,err
        finally:
            if contender.poll() is None:contender.kill();contender.wait(timeout=10)
    print('r01_integrity_mutation_then_producer_'+label+': PASS')

# Explicitly expose the tuple-before-session order that previously allowed a cycle.
for table,label,column,message in [
 (patches,'patch','patch','receivables_history_concurrent_change'),
 (drafts,'draft','draft','receivables_history_concurrent_change'),
 (fragments,'fragment','compressed_payload','receivables_fragment_concurrent_change'),
]:
    with Held(f'select 1 from {table}'+scope+' for update;') as tuple_owner:
        with Held(preparation):
            tuple_owner.fail(f'update {table} set {column}={column}'+scope+';',message)
    print('r01_integrity_tuple_then_preparer_'+label+': PASS')
assert run(f'select count(*) from {patches}'+scope+';')=='1'
assert run(f'select count(*) from {drafts}'+scope+';')=='1'
print('r01_integrity_concurrency: PASS (real producer, both orders, retry and rollback)')
