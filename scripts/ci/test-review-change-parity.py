#!/usr/bin/env python3
"""Compare the SQL mirror against the domain contract's shared change fixtures."""
import json
import os
import re
import subprocess
from pathlib import Path
from urllib.parse import urlparse

url = os.environ['DATABASE_URL']
if urlparse(url).hostname not in ('localhost', '127.0.0.1', '::1'):
    raise SystemExit('Review parity runs only against the disposable local CI database')
root = Path(__file__).resolve().parents[2]
fixtures = json.loads((root / 'packages/domain-contracts/src/fixtures/review-change-cases.json').read_text())
payload = json.dumps(fixtures).replace("'", "''")
sql = f"""begin;
do $test$
declare fixture jsonb; actual jsonb;
begin
 for fixture in select value from jsonb_array_elements('{payload}'::jsonb) loop
  actual:=private.artifact_review_change_report_v1(fixture->'previous',fixture->'next');
  if actual->>'outcome' is distinct from fixture->>'outcome'
   or (fixture->>'reason' is not null and not (actual->'reasons' ? (fixture->>'reason')))
  then raise exception 'review change parity: %: %',fixture->>'name',actual; end if;
  raise notice 'PASS: review change parity: %',fixture->>'name';
 end loop;
end $test$;
rollback;
"""
def expand(path):
    return re.sub(r'^\\ir (.+)$', lambda m: expand(path.parent / m[1].strip()), path.read_text(), flags=re.M)

roles = json.loads((root / 'packages/domain-contracts/src/fixtures/review-authorization.json').read_text())
role_payload = json.dumps(roles).replace("'", "''")
setup = expand(root / 'supabase/tests/support/artifact_revision_setup.sql')
sql += "begin;\n" + setup + f"""
do $roles$
declare fixture jsonb;r jsonb;m jsonb;b jsonb;sv uuid;denial text;role_name text;author uuid;
 actor uuid:='a11b0000-0000-4000-8000-000000000001';other uuid:='a11b0000-0000-4000-8000-000000000002';
 org uuid:='a11b0000-0000-4000-9000-000000000001';work uuid:='a11b0000-0000-4000-9000-000000000002';
begin
 for fixture in select value from jsonb_array_elements('{role_payload}') loop
  begin
   perform pg_temp.act_as(actor);
   perform public.grant_resource_access_v1(work,other,'work');
   author:=case when (fixture->>'samePerson')::boolean then actor else other end;
   sv:=pg_temp.source_version('review-authorization-parity',null);
   perform pg_temp.act_as(author);
   m:=pg_temp.manifest('answer','internal',jsonb_build_array(pg_temp.source_ref(sv)),'[]');
   b:=jsonb_build_array(pg_temp.block('paragraph','paragraph','{{"text":"Synthetic parity recommendation"}}'));
   set local role authenticated;
   r:=public.create_artifact_revision_v1(work,'answer','synthetic-role-parity','internal',m,b,'[]',null,null);
   reset role;
   perform pg_temp.act_as(actor);
   for role_name in select jsonb_array_elements_text(fixture->'roles') loop
    perform public.set_capital_project_review_assignment_v1(work,actor,role_name,true);
   end loop;
   insert into public.capital_project_review_policies(organization_id,capital_project_id,assignment_required,self_approval)
    values(org,work,case when (fixture->>'assignmentRequired')::boolean then 'required' else 'not_required' end,
     case when (fixture->>'selfApprovalAllowed')::boolean then 'allowed' else 'forbidden' end)
    on conflict(organization_id,capital_project_id) do update set assignment_required=excluded.assignment_required,self_approval=excluded.self_approval;
   if not (fixture->>'sourceAccess')::boolean then
    insert into private.source_rights_versions(organization_id,source_version_id,revision,operations,purposes,audience,valid_from,evidence_kind,evidence_reference,evidence_sha256,created_by)
     select org,sv,max(revision)+1,array['process'],array['analysis'],'authorized_workspace',now(),'human_declaration',sv,repeat('a',64),actor
     from private.source_rights_versions where organization_id=org and source_version_id=sv;
   end if;
   denial:=null;
   begin
    set local role authenticated;
    perform public.review_artifact_revision_v1((r->>'revision_id')::uuid,r->>'manifest_fingerprint','approve',null,null,(fixture->>'declared')::boolean,gen_random_uuid());
    reset role;
   exception when others then denial:=sqlerrm;
   end;
   if ((denial is null) is distinct from (fixture->>'allowed')::boolean) or (denial is not null and denial is distinct from fixture->>'reason')
   then raise exception 'review authorization parity failed: %: %',fixture->>'name',denial; end if;
   raise notice 'PASS: review authorization parity: %',fixture->>'name';
   raise sqlstate 'PZ001' using message='synthetic case rollback';
  exception when sqlstate 'PZ001' then null;
  end;
 end loop;
end $roles$;
rollback;
"""
result = subprocess.run(['psql', url, '-X', '-v', 'ON_ERROR_STOP=1', '-q'], input=sql, text=True, capture_output=True, timeout=30)
print(result.stdout, end='')
print(result.stderr, end='')
raise SystemExit(result.returncode)
