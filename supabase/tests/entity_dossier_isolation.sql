begin;
\ir support/legacy_workspace_capabilities.sql
\ir support/legacy_resource_fixture.sql
insert into public.organizations(id,organization_type,name,created_by) values('a5550000-0000-4000-9000-000000000001','institutional','Synthetic other dossier tenant','a11b0000-0000-4000-8000-000000000002');
insert into public.organization_memberships(organization_id,user_id,role,status) values('a5550000-0000-4000-9000-000000000001','a11b0000-0000-4000-8000-000000000002','owner','active');
insert into public.capital_projects(id,organization_id,project_name,created_by) values('a5550000-0000-4000-9000-000000000002','a5550000-0000-4000-9000-000000000001','Synthetic same public company','a11b0000-0000-4000-8000-000000000002');
insert into public.entities(id,kind,legal_name,public_proof) values('a5550000-0000-4000-9000-000000000003','legal_entity','Synthetic Homonym','{"registry":"official_registry","sourceUrl":"https://registry.example.invalid/entity","contentHash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","reviewedAt":"2026-01-01T00:00:00Z"}');
insert into public.entity_identifiers(entity_id,namespace,value,review_state,evidence,reviewed_at) values('a5550000-0000-4000-9000-000000000003','BR:CNPJ','00000000000191','reviewed','{"synthetic":true}',now());
select set_config('test.dossier.a',(select id::text from public.dossiers where resource_id='a11b0000-0000-4000-9000-000000000003'),true);
select set_config('test.dossier.b',(select id::text from public.dossiers where resource_id='a5550000-0000-4000-9000-000000000002'),true);
select set_config('request.headers','{"x-offroad-workspace":"a11b0000-0000-4000-9000-000000000001"}',true);
select set_config('request.jwt.claim.sub','a11b0000-0000-4000-8000-000000000001',true);
set local role authenticated;
do $$ declare d uuid:=current_setting('test.dossier.a')::uuid; e1 uuid; e2 uuid; linked uuid; result jsonb; begin
 e1:=public.review_dossier_identity_v1(d,null,'Synthetic Homonym','BR:CNPJ','00000000000272','Synthetic first local review');
 e2:=public.review_dossier_identity_v1(d,null,'Synthetic Homonym','BR:CNPJ','00000000000353','Synthetic second local review');
 if e1=e2 then raise exception 'homonyms merged'; end if;
 perform set_config('test.entity.a',e1::text,true);
 result:=public.resolve_entity_candidate_v1(d,'Synthetic Homonym');
 if jsonb_array_length(result->'candidates')<>3 or result->>'automaticMerge'<>'false' then raise exception 'candidate resolution changed identity'; end if;
 perform public.review_dossier_identity_v1(d,e1,'Synthetic Homonym','BR:CNPJ','00000000000434','Synthetic identifier correction');
 result:=public.resolve_entity_candidate_v1(d,'Synthetic Homonym','BR:CNPJ','00000000000434');
 if result->'candidates'->0->>'match'<>'reviewed_identifier' then raise exception 'same-transaction identifier review invisible'; end if;
 if (select count(*) from public.entity_identifiers where entity_id=e1)<>2 or (select count(*) from public.entity_identifiers where entity_id=e1 and valid_until is null)<>1 then raise exception 'identifier revision overwrote history'; end if;
 begin perform public.review_dossier_identity_v1(d,e1,'Synthetic Homonym','BR:CNPJ','00000000000515',''); raise exception 'unreviewed identifier accepted'; exception when invalid_parameter_value then null; end;
 linked:=public.link_dossier_entity_v1(d,'a5550000-0000-4000-9000-000000000003','subject','{"basis":"standalone","synthetic":true}','2026-01-01','2026-12-31','Synthetic public identity review','a5550000-0000-4000-9000-000000000004');
 if linked<>public.link_dossier_entity_v1(d,'a5550000-0000-4000-9000-000000000003','subject','{"basis":"standalone","synthetic":true}','2026-01-01','2026-12-31','Synthetic public identity review','a5550000-0000-4000-9000-000000000004') then raise exception 'retry duplicated link'; end if;
 result:=public.read_dossier_v1(d);
 if result->'links'->0->'perimeter'->>'basis'<>'standalone' or result->'links'->0->>'validUntil' is null then raise exception 'dated perimeter lost'; end if;
 begin perform public.read_dossier_v1(current_setting('test.dossier.b')::uuid); raise exception 'foreign dossier discovered'; exception when insufficient_privilege then null; end;
 begin insert into public.dossiers(organization_id,resource_id) values('a11b0000-0000-4000-9000-000000000001',gen_random_uuid()); raise exception 'direct dossier write'; exception when insufficient_privilege then null; end;
 if exists(select 1 from public.dossiers where id=current_setting('test.dossier.b')::uuid) then raise exception 'foreign dossier via RLS'; end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub','a11b0000-0000-4000-8000-000000000002',true);
select set_config('request.headers','{"x-offroad-workspace":"a5550000-0000-4000-9000-000000000001"}',true);
set local role authenticated;
-- Same-organization membership does not disclose another member's dossier.
select set_config('request.headers','{"x-offroad-workspace":"a11b0000-0000-4000-9000-000000000001"}',true);
do $$ begin
 begin perform public.read_dossier_v1(current_setting('test.dossier.a')::uuid); raise exception 'same-tenant membership exposed dossier'; exception when insufficient_privilege then null; end;
 if exists(select 1 from public.entities where id=current_setting('test.entity.a')::uuid) then raise exception 'same-tenant membership exposed local entity'; end if;
end $$;
select set_config('request.headers','{"x-offroad-workspace":"a5550000-0000-4000-9000-000000000001"}',true);
select public.link_dossier_entity_v1(current_setting('test.dossier.b')::uuid,'a5550000-0000-4000-9000-000000000003','subject','{"basis":"consolidated"}','2026-01-01',null,'Synthetic independent review','a5550000-0000-4000-9000-000000000005');
do $$ begin
 if exists(select 1 from public.dossiers where id=current_setting('test.dossier.a')::uuid) then raise exception 'common public identifier shared dossier'; end if;
 begin perform public.read_dossier_v1(current_setting('test.dossier.a')::uuid); raise exception 'membership bypassed grant'; exception when insufficient_privilege then null; end;
 begin perform public.resolve_entity_candidate_v1(current_setting('test.dossier.a')::uuid,'Synthetic Homonym'); raise exception 'resolver disclosed hidden dossier'; exception when insufficient_privilege then null; end;
 if (select count(*) from public.entities where legal_name='Synthetic Homonym')<>1 then raise exception 'private local identity leaked'; end if;
 begin perform public.link_dossier_entity_v1(current_setting('test.dossier.b')::uuid,current_setting('test.entity.a')::uuid,'subject','{}',now(),null,'Synthetic cross-tenant attempt',gen_random_uuid()); raise exception 'foreign local entity linked'; exception when insufficient_privilege then null; end;

end $$;
reset role;
do $$ declare before_count bigint; before_audit bigint; begin
 select count(*) into before_count from public.dossiers;
 select count(*) into before_audit from public.audit_events;
 perform private.backfill_dossiers_v1(); perform private.backfill_dossiers_v1();
 if (select count(*) from public.dossiers)<>before_count or (select count(*) from public.audit_events)<>before_audit then raise exception 'backfill not idempotent'; end if;
end $$;
-- Context writes project locally; legacy company mutation also needs the company grant.
insert into public.companies(id,organization_id,legal_name,created_by,jurisdiction_code) values('a5550000-0000-4000-9000-000000000010','a11b0000-0000-4000-9000-000000000001','Synthetic separately authorized company','a11b0000-0000-4000-8000-000000000002','BR');
update public.document_intake_sessions set client_company_id='a5550000-0000-4000-9000-000000000010' where id='a11b0000-0000-4000-9000-000000000003';
select set_config('request.jwt.claim.sub','a11b0000-0000-4000-8000-000000000001',true);
select set_config('request.headers','{"x-offroad-workspace":"a11b0000-0000-4000-9000-000000000001"}',true);
set local role authenticated;
select public.save_project_company_context('a11b0000-0000-4000-9000-000000000003','{"name":"Synthetic local context","description":"Synthetic private dossier profile"}');
do $$ begin
 if public.read_dossier_v1(current_setting('test.dossier.a')::uuid)#>>'{profile,name}'<>'Synthetic local context' then raise exception 'context adapter did not update dossier'; end if;
 begin perform public.save_project_company_profile('a11b0000-0000-4000-9000-000000000003','Unauthorized rename',null,null,'Synthetic forbidden canonical write',null,null); raise exception 'legacy profile bypassed company authority'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.headers','{"x-offroad-workspace":"a5550000-0000-4000-9000-000000000001"}',true);
do $$ begin
 begin perform public.read_dossier_v1(current_setting('test.dossier.a')::uuid); raise exception 'forged workspace read dossier'; exception when insufficient_privilege then null; end;
end $$;
reset role;
-- A founder/creator/administrator has no residual content authority after explicit revocation.
update private.resource_access_grants set revoked_at=now() where resource_id='a11b0000-0000-4000-9000-000000000002';
select set_config('request.jwt.claim.sub','a11b0000-0000-4000-8000-000000000001',true);
select set_config('request.headers','{"x-offroad-workspace":"a11b0000-0000-4000-9000-000000000001"}',true);
set local role authenticated;
do $$ begin
 begin perform public.read_dossier_v1(current_setting('test.dossier.a')::uuid); raise exception 'revoked creator retained dossier'; exception when insufficient_privilege then null; end;
 if exists(select 1 from public.entities where organization_id='a11b0000-0000-4000-9000-000000000001') then raise exception 'revoked creator retained local identity'; end if;
end $$;
reset role;
do $$ begin
 begin insert into public.entities(kind,legal_name) values('legal_entity','Synthetic unproven public entity'); raise exception 'public identity without proof'; exception when check_violation then null; end;
end $$;
do $$ declare body text; begin
 select pg_get_functiondef('private.worker_load_agent_context_before_professional_context_v1(uuid,text)'::regprocedure) into body;
 if position($needle$'related_project_memory', '[]'::jsonb$needle$ in body)=0 or to_regprocedure('private.related_dossier_memory_v1(uuid,text)') is not null then raise exception 'cross-dossier worker memory enabled before explicit execution inputs'; end if;
end $$;
select 'entity_dossier_isolation: PASS' result;
rollback;
