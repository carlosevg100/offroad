-- Stage 18, increment 3A left two domain event identifiers derived from an md5 digest cast to uuid:
-- the procedure aggregate (private.method_procedure_aggregate_v1) and the event id of a published
-- platform release (private.capture_method_release_event_v1). An md5 digest carries no RFC 9562
-- version or variant, and the worker's event contract (packages/domain-contracts, z.uuid) refuses
-- such identifiers: every method_release event would be claimed, refused as invalid_contract five
-- times and blocked under the outbox alarm. The local end-to-end journey showed it
-- (outbox.poll.failed, invalid_contract). Both become name-based UUIDs (version 5, URL namespace),
-- still deterministic. No method_release event exists in staging or production, so no stored aggregate
-- changes identity.
set search_path='';

-- Both functions are restated from the bodies pinned here: a parallel change stops this migration
-- instead of being overwritten. A stored method_release event would change identity: stop too.
do $$begin
 if (select md5(prosrc) from pg_proc where oid='private.method_procedure_aggregate_v1(text)'::regprocedure)<>'c385240bf53c47f44b546355726380fb'
 then raise exception 'method_procedure_aggregate_contract_changed';end if;
 if (select md5(prosrc) from pg_proc where oid='private.capture_method_release_event_v1()'::regprocedure)<>'6439eb716df8dde6a98e386ede1a4185'
 then raise exception 'method_release_event_contract_changed';end if;
 if exists(select 1 from private.domain_events where aggregate_kind='method_release') then raise exception 'method_release_events_exist';end if;
end $$;

-- The procedure of a method release as a stable aggregate id: a version 5 UUID of its method id.
create or replace function private.method_procedure_aggregate_v1(p_method_id text) returns uuid
language sql immutable set search_path='' as $$ select extensions.uuid_generate_v5(extensions.uuid_ns_url(),'offroad:procedure:'||p_method_id); $$;

-- The event of one published platform release for one organization: a version 5 UUID, so a
-- repeated delivery of the same publication is the same event.
create function private.platform_method_release_event_id_v1(p_release text,p_org uuid) returns uuid
language sql immutable set search_path='' as $$ select extensions.uuid_generate_v5(extensions.uuid_ns_url(),'offroad:platform-method-release:'||p_release||':'||p_org::text); $$;
revoke all on function private.platform_method_release_event_id_v1(text,uuid) from public,anon,authenticated,service_role;

-- Restated from 20260925180927_work_dependency_events.sql; the only change is the event id of a
-- platform release. create or replace keeps the owner, the grants and the two triggers.
create or replace function private.capture_method_release_event_v1() returns trigger
language plpgsql security definer set search_path='' as $$
declare org uuid;method text;
begin
 if tg_table_name='platform_method_releases' then
  for org in select distinct m.organization_id from private.execution_manifests m
   join private.platform_method_releases r on r.id=m.platform_release_id
   where r.method_id=new.method_id order by m.organization_id loop
   perform private.append_domain_event_v1(private.platform_method_release_event_id_v1(new.id,org),org,'method_release',
    private.method_procedure_aggregate_v1(new.method_id),'created',jsonb_build_object('source',tg_table_name,'record_id',new.id,'methodId',new.method_id));
  end loop;
 elsif tg_table_name='method_releases' then
  if new.status<>'published' or old.status='published' then return new; end if;
  select b.method_id into method from private.platform_method_releases b where b.id=new.base_release_id;
  if method is null then raise exception 'method_release_procedure_missing' using errcode='23514'; end if;
  perform private.append_domain_event_v1(new.id,new.organization_id,'method_release',private.method_procedure_aggregate_v1(method),'changed',
   jsonb_build_object('source',tg_table_name,'record_id',new.id,'methodId',method));
 else
  raise exception 'dependency_event_source_unknown' using errcode='23514';
 end if;
 return new;
end $$;
