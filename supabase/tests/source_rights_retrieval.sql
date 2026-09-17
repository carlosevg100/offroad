begin;
\ir support/legacy_workspace_capabilities.sql
\ir support/legacy_resource_fixture.sql
insert into storage.objects(bucket_id,name,owner_id,metadata)
values('opportunity-documents','a11b0000-0000-4000-9000-000000000001/a11b0000-0000-4000-9000-000000000003/synthetic.txt','a11b0000-0000-4000-8000-000000000001','{"size":10}');
select set_config('storage.operation','object.get_authenticated',true);
select set_config('request.headers','{"x-offroad-workspace":"a11b0000-0000-4000-9000-000000000001"}',true);
select set_config('request.jwt.claim.sub','a11b0000-0000-4000-8000-000000000001',true);
set local role authenticated;
do $$ begin
 if exists(select 1 from public.source_versions) or exists(select 1 from public.source_documents) or exists(select 1 from public.case_retrieval_chunks) then raise exception 'unknown source rights disclose content or metadata'; end if;
 if exists(select 1 from public.search_authorized_resources_v1('a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000003','confidential')) then raise exception 'unknown rights entered candidates'; end if;
end $$;
select public.set_source_rights_v1('a11b0000-0000-4000-9000-000000000004',0,array['read','process','store','derive'],array['analysis'],'2099-01-01','2099-01-01','a7770000-0000-4000-9000-000000000001',repeat('a',64));
do $$ begin
 if (select count(*) from public.search_authorized_resources_v1('a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000003','confidential'))<>1 then raise exception 'licensed read did not retrieve'; end if;
 if exists(select 1 from public.search_authorized_resources_v1('a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000003','confidential',12,'export')) then raise exception 'incompatible purpose retrieved'; end if;
 begin perform public.authorize_source_version_download_v1('a11b0000-0000-4000-9000-000000000004'); raise exception 'read right allowed export'; exception when insufficient_privilege then null; end;
 if exists(select 1 from storage.objects where name='a11b0000-0000-4000-9000-000000000001/a11b0000-0000-4000-9000-000000000003/synthetic.txt') then raise exception 'Storage bypassed source export rights'; end if;
 begin perform public.set_source_rights_v1('a11b0000-0000-4000-9000-000000000004',0,array['read'],array['analysis'],null,null,gen_random_uuid(),repeat('a',64)); raise exception 'stale revision overwrote rights'; exception when serialization_failure then null; end;
 begin perform private.source_use_allowed_v1('a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000004','a11b0000-0000-4000-8000-000000000001','read','analysis'); raise exception 'client supplied an arbitrary principal'; exception when insufficient_privilege then null; end;
end $$;
-- A source with wider declared rights cannot erase its narrower dependency.
select public.register_source_version_v1('a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000003',gen_random_uuid(),'a7770000-0000-4000-9000-000000000002','opportunity-documents','a11b0000-0000-4000-9000-000000000001/a11b0000-0000-4000-9000-000000000003/derived.pdf','Synthetic derived source','application/pdf',10,repeat('b',64));
select public.set_source_rights_v1('a7770000-0000-4000-9000-000000000002',0,array['read','process','store','derive','export'],array['analysis','export'],null,null,gen_random_uuid(),repeat('b',64));
select public.add_source_dependency_v1('a7770000-0000-4000-9000-000000000002','a11b0000-0000-4000-9000-000000000004');
do $$ begin
 if not exists(select 1 from public.source_versions where id='a7770000-0000-4000-9000-000000000002') then raise exception 'derived read unexpectedly denied'; end if;
 begin perform public.authorize_source_version_download_v1('a7770000-0000-4000-9000-000000000002'); raise exception 'derivative shed export restriction'; exception when insufficient_privilege then null; end;
 begin perform public.add_source_dependency_v1('a11b0000-0000-4000-9000-000000000004','a7770000-0000-4000-9000-000000000002'); raise exception 'dependency cycle admitted'; exception when check_violation then null; end;
 begin delete from private.resource_dependencies; raise exception 'client removed inherited restriction'; exception when insufficient_privilege then null; end;
end $$;
-- Revocation is a new immutable revision, never a delete followed by fallback to old rights.
select public.set_source_rights_v1('a11b0000-0000-4000-9000-000000000004',1,'{}',array['analysis'],null,null,gen_random_uuid(),repeat('c',64));
do $$ begin
 if exists(select 1 from public.source_versions) or exists(select 1 from public.case_retrieval_chunks) then raise exception 'revoked source or derivative still readable'; end if;
 if exists(select 1 from public.search_authorized_resources_v1('a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000003','confidential')) then raise exception 'revoked source remained in retrieval'; end if;
end $$;
-- Widening the current parent license cannot rewrite the right pinned by a derivative.
select public.set_source_rights_v1('a11b0000-0000-4000-9000-000000000004',2,array['read','process','store','derive','export'],array['analysis','export'],null,null,gen_random_uuid(),repeat('d',64));
do $$ begin
 if not exists(select 1 from storage.objects where name='a11b0000-0000-4000-9000-000000000001/a11b0000-0000-4000-9000-000000000003/synthetic.txt') then raise exception 'explicit export did not permit authorized Storage read'; end if;
 if not exists(select 1 from public.source_versions where id='a7770000-0000-4000-9000-000000000002') then raise exception 'regrant failed to restore permitted derivative read'; end if;
 begin perform public.authorize_source_version_download_v1('a7770000-0000-4000-9000-000000000002'); raise exception 'wider parent revision erased the pinned restriction'; exception when insufficient_privilege then null; end;
end $$;
reset role;
-- Corrupted indexed text is excluded before ranking even if its source is authorized.
update public.case_retrieval_chunks set content='Synthetic confidential altered text' where source_document_id='a11b0000-0000-4000-9000-000000000004';
set local role authenticated;
do $$ begin
 if exists(select 1 from public.search_authorized_resources_v1('a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000003','confidential')) then raise exception 'tampered chunk entered candidates'; end if;
end $$;
reset role;
-- Fixed historical timestamps exercise expiry without a timing-dependent sleep.
insert into private.source_rights_versions(organization_id,source_version_id,revision,operations,purposes,audience,valid_from,expires_at,evidence_kind,evidence_reference,evidence_sha256,created_by)
values('a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000004',4,array['read','process','store','derive'],array['analysis'],'authorized_workspace','2000-01-01','2001-01-01','human_declaration',gen_random_uuid(),repeat('e',64),'a11b0000-0000-4000-8000-000000000001');
set local role authenticated;
do $$ begin
 if exists(select 1 from public.source_versions) then raise exception 'expired source or derivative remained readable'; end if;
end $$;
reset role;
insert into private.source_rights_versions(organization_id,source_version_id,revision,operations,purposes,audience,valid_from,store_until,evidence_kind,evidence_reference,evidence_sha256,created_by)
values('a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000004',5,array['read','process','store','derive'],array['analysis'],'authorized_workspace','2000-01-01','2001-01-01','human_declaration',gen_random_uuid(),repeat('e',64),'a11b0000-0000-4000-8000-000000000001');
set local role authenticated;
do $$ begin
 if exists(select 1 from public.source_versions) then raise exception 'storage deadline did not deny source and derivative'; end if;
end $$;
reset role;
do $$ begin
 if exists(select 1 from private.source_rights_versions r where r.organization_id='a11b0000-0000-4000-9000-000000000001' and not exists(select 1 from private.domain_events e join public.audit_events a on a.id=e.audit_event_id join private.event_outbox o on o.event_id=e.id where e.id=r.id)) then raise exception 'rights append lacks its audit/outbox event'; end if;
end $$;
select set_config('request.jwt.claim.sub','a11b0000-0000-4000-8000-000000000001',true);
set local role authenticated;
-- Two independent parents contribute an intersection, never a union of permissions.
select public.set_source_rights_v1('a11b0000-0000-4000-9000-000000000004',5,array['read','process','store','derive','export'],array['analysis','export'],null,null,gen_random_uuid(),repeat('f',64));
select public.register_source_version_v1('a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000003',gen_random_uuid(),'a7770000-0000-4000-9000-000000000003','opportunity-documents','a11b0000-0000-4000-9000-000000000001/a11b0000-0000-4000-9000-000000000003/second.pdf','Synthetic second source','application/pdf',10,repeat('c',64));
select public.set_source_rights_v1('a7770000-0000-4000-9000-000000000003',0,array['derive'],array['analysis'],null,null,gen_random_uuid(),repeat('c',64));
select public.add_source_dependency_v1('a7770000-0000-4000-9000-000000000002','a7770000-0000-4000-9000-000000000003');
do $$ begin
 if exists(select 1 from public.source_versions where id='a7770000-0000-4000-9000-000000000002') then raise exception 'one permissive parent overrode the other parent restriction'; end if;
 begin perform public.declare_public_source_reuse_v1('a11b0000-0000-4000-9000-000000000004',6,'https://example.invalid/source',repeat('a',64),'2099-01-01','2099-01-01',gen_random_uuid(),repeat('b',64)); raise exception 'tenant manager declared a global public reuse license'; exception when insufficient_privilege then null; end;
end $$;
reset role;
select set_config('request.jwt.claim.sub','a11b0000-0000-4000-8000-000000000002',true);
set local role authenticated;
do $$ begin
 begin perform public.set_source_rights_v1('a11b0000-0000-4000-9000-000000000004',2,array['read'],array['analysis'],null,null,gen_random_uuid(),repeat('a',64)); raise exception 'member granted source license'; exception when insufficient_privilege then null; end;
end $$;
reset role;
select 'source_rights_retrieval' as test,'PASS' as result;
rollback;
