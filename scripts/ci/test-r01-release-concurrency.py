#!/usr/bin/env python3
"""Two real sessions, disposable CI database only; never production/staging."""
import os
import select
import subprocess
import time
from urllib.parse import urlparse

url=os.environ['DATABASE_URL']
if urlparse(url).hostname not in ('localhost','127.0.0.1','::1'):
    raise SystemExit('Release concurrency requires the disposable local CI database')
cmd=['psql',url,'-X','-A','-t','-q','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose']
org='a417b000-0000-4000-9000-000000000001'
actor='a417b000-0000-4000-8000-000000000001'
work='a417b000-0000-4000-9000-000000000002'
key='finance.receivables-released-analysis'
predicate=f"select private.receivables_analytical_release_enabled('{org}');"
pause=f"insert into private.receivables_analytical_release_grants(organization_id,enabled,granted_by) values('{org}',false,'Synthetic concurrency fixture');"
policy=f"select pg_advisory_xact_lock_shared(hashtextextended('resource-policy:{org}',0));"
revoke=f"select set_config('request.jwt.claim.sub','{actor}',true);select private.revoke_resource_access_v1('{work}','{actor}');"

def raw(sql,timeout=15):
    return subprocess.run(cmd,input=sql,text=True,capture_output=True,timeout=timeout)

def run(sql):
    p=raw(sql)
    assert p.returncode==0,p.stderr
    return p.stdout.strip()

def denied(sql,code='40001',message='receivables_release_concurrent_change'):
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
        self.p.stdin.write((sql+'\n\\echo R01_RELEASE_HELD\n').encode());self.p.stdin.flush()
        deadline=time.monotonic()+15
        seen=[]
        while time.monotonic()<deadline:
            while b'\n' in self.buffer:
                line,self.buffer=self.buffer.split(b'\n',1)
                value=line.decode('utf-8','replace').strip();seen.append(value)
                if value=='R01_RELEASE_HELD':return
            if not select.select([self.p.stdout],[],[],max(0,deadline-time.monotonic()))[0]:break
            data=os.read(self.p.stdout.fileno(),65536)
            if not data:break
            self.buffer+=data
        raise AssertionError('Release barrier absent: '+str(seen)+repr(self.buffer))

    def end(self,commit=False):
        if self.p.poll() is None:
            self.p.stdin.write(b'commit;\n' if commit else b'rollback;\n');self.p.stdin.close();self.p.stdin=None
            text=self.p.communicate(timeout=15)[0]
            assert self.p.returncode==0,text

    def fail(self,sql):
        self.p.stdin.write((sql+'\n').encode());self.p.stdin.close();self.p.stdin=None
        text=self.p.communicate(timeout=15)[0].decode('utf-8','replace')
        assert self.p.returncode!=0 and '40001' in text and 'receivables_release_concurrent_change' in text,text
        assert '40P01' not in text and '57014' not in text,text

    def __enter__(self):return self
    def __exit__(self,*args):
        if self.p.poll() is None:self.end()

def reset():
    run(f"delete from private.receivables_analytical_release_grants where organization_id='{org}';update private.platform_capability_releases set released=true where capability_key='{key}';")

def wait_locked(name,process):
    deadline=time.monotonic()+10
    while time.monotonic()<deadline:
        if run(f"select count(*) from pg_stat_activity where application_name='{name}' and wait_event_type='Lock';")=='1':return
        assert process.poll() is None,'Contender did not wait for the existing lock'
        time.sleep(.05)
    raise AssertionError('Existing lock contention was not observed')

run(f"""begin;
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,is_sso_user,is_anonymous)
values('{actor}','authenticated','authenticated','r01-release-race@example.invalid','{{}}','{{}}',now(),now(),false,false);
insert into public.organizations(id,organization_type,name,created_by) values('{org}','originator','Synthetic release race','{actor}');
insert into public.organization_memberships(organization_id,user_id,role,status) values('{org}','{actor}','owner','active');
select set_config('request.jwt.claim.sub','{actor}',true);
insert into public.capital_projects(id,organization_id,project_name,created_by,private_access_granted_at,private_access_granted_by) values('{work}','{org}','Synthetic release race','{actor}',now(),'{actor}');
insert into private.platform_capability_releases(capability_key,released,exposure,method_id,method_version,method_maturity,approved_by,approved_at,approval_source)
values('synthetic-r01-other',true,'universal','synthetic-r01-other','1.0.0','tested','Synthetic approver',current_date,'Synthetic disposable fixture');
commit;""")
reset();assert run(predicate)=='t'
assert run('begin read only;'+predicate+'rollback;')=='t'
print('r01_release_read_only_transaction: PASS')

# The missing-row case: a first pause cannot pass an active read transaction.
with Held(predicate) as reader:
    denied(pause)
    assert run(f"select count(*) from private.receivables_analytical_release_grants where organization_id='{org}';")=='0'
    reader.end(commit=True)
run(pause);assert run(predicate)=='f';reset()
print('r01_pause_first_insert_reader_first: PASS')

# Writer first: conflict is retryable, then the fresh snapshot sees the pause.
with Held(pause) as writer:
    denied(predicate)
    writer.end(commit=True)
assert run(predicate)=='f';reset()
print('r01_pause_first_insert_writer_first: PASS')

# A rolled-back administrative operation must not leave a false pause.
with Held(pause):denied(predicate)
assert run(predicate)=='t'
print('r01_pause_rollback: PASS')

mutations={
 'pause_update':f"update private.receivables_analytical_release_grants set enabled=false where organization_id='{org}';",
 'pause_delete':f"delete from private.receivables_analytical_release_grants where organization_id='{org}';",
 'capability_update':f"update private.platform_capability_releases set released=false where capability_key='{key}';",
 'capability_delete':f"delete from private.platform_capability_releases where capability_key='{key}';",
 'capability_key_out':f"update private.platform_capability_releases set capability_key='synthetic-r01-other' where capability_key='{key}';",
 'capability_key_in':f"update private.platform_capability_releases set capability_key='{key}' where capability_key='synthetic-r01-other';",
 'capability_insert':f"insert into private.platform_capability_releases select * from private.platform_capability_releases where capability_key='{key}';",
}
for label,sql in mutations.items():
    if label.startswith('pause_'):run(pause.replace('false','true'))
    with Held(predicate):denied(sql)
    reset()
    print('r01_release_'+label+': PASS')

for label,expected in [('pause_update','f'),('pause_delete','t'),('capability_update','f')]:
    if label=='pause_update':run(pause.replace('false','true'))
    elif label=='pause_delete':run(pause)
    with Held(mutations[label]) as writer:
        denied(predicate);writer.end(commit=True)
    assert run(predicate)==expected
    reset()
    print('r01_release_writer_first_'+label+': PASS')

with Held(pause):
    run("update private.platform_capability_releases set released=false where capability_key='synthetic-r01-other';")
assert run("select released from private.platform_capability_releases where capability_key='synthetic-r01-other';")=='f'
print('r01_release_unrelated_capability_progresses: PASS')

with Held(predicate) as first:
    with Held(predicate):first.fail(mutations['capability_update'])
assert run(predicate)=='t'
print('r01_release_shared_upgrade_retries: PASS')

# Since correction 3O the platform ledgers refuse truncation, so a cascade from the capability release table is
# refused outright before any serialization: a stronger barrier than the advisory. The grants table keeps the
# serialized truncate of 3K.
refused=raw('begin;truncate private.platform_capability_releases cascade;rollback;')
assert refused.returncode!=0 and 'platform_ledger_immutable' in refused.stderr,refused.stderr
assert run(predicate)=='t'
print('r01_release_truncate_platform_capability_releases_refused: PASS')
for table in ['receivables_analytical_release_grants']:
    with Held(f'truncate private.{table} cascade;'):denied(predicate)
    assert run(predicate)=='t'
    # TRUNCATE first needs an AccessExclusiveLock, before any trigger can execute.
    # Prove that normal table locking serializes this order; then roll it all back.
    with Held(predicate) as reader:
        writer=subprocess.Popen(cmd,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
        try:
            writer.stdin.write(f"set application_name='r01_truncate_contender';begin;set local statement_timeout='10s';truncate private.{table} cascade;rollback;\n")
            writer.stdin.close();writer.stdin=None
            wait_locked('r01_truncate_contender',writer);reader.end(commit=True)
            _,err=writer.communicate(timeout=15);assert writer.returncode==0,err
        finally:
            if writer.poll() is None:writer.kill();writer.wait(timeout=10)
    assert run(predicate)=='t'
    print('r01_release_truncate_'+table+': PASS')

# Real policy revocation after pause: reader holds policy, writer holds release.
# The reader fails fast at release instead of closing a wait cycle.
with Held(policy) as reader:
    writer=subprocess.Popen(cmd,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
    try:
        writer.stdin.write("set application_name='r01_pause_revoke_contender';begin;set local statement_timeout='10s';"+pause+revoke+'rollback;\n')
        writer.stdin.close();writer.stdin=None
        wait_locked('r01_pause_revoke_contender',writer);reader.fail(predicate)
        _,err=writer.communicate(timeout=15);assert writer.returncode==0,err
    finally:
        if writer.poll() is None:writer.kill();writer.wait(timeout=10)
assert run(predicate)=='t'
print('r01_pause_then_policy_revocation: PASS')

with Held(predicate):denied(revoke+pause)
assert run(f"select private.evaluate_resource_policy_v1('{org}','{work}','{actor}','work','analysis');")=='t'
print('r01_policy_revocation_then_pause_rolls_back: PASS')

for isolation in ['repeatable read','serializable']:
    for sql in [predicate,pause]:
        p=raw(f'begin isolation level {isolation};'+sql+'rollback;')
        assert p.returncode!=0 and '25000' in p.stderr and 'receivables_release_isolation_unsupported' in p.stderr,p.stderr
    print('r01_release_isolation_'+isolation.replace(' ','_')+': PASS')
assert run(predicate)=='t'
print('r01_release_concurrency: PASS (real sessions, both orders, rollback and existing lock contention)')
