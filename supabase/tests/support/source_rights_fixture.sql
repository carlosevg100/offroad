-- Synthetic data factory for pre-stage-7 contracts. These tests focus on other boundaries;
-- their documents represent customer-owned inputs with declared rights, not unknown licenses.
-- The caller owns BEGIN/ROLLBACK. Never install this trigger in any migration or production.
-- Source-rights-specific tests deliberately do not include this factory.
create function pg_temp.declare_fixture_source_rights() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 insert into private.source_rights_versions(organization_id,source_version_id,revision,operations,purposes,audience,valid_from,evidence_kind,evidence_reference,evidence_sha256,created_by)
 select new.organization_id,new.id,1,array['read','process','store','derive','export'],array['analysis','retrieval','export'],'authorized_workspace',new.created_at,
 'human_declaration',new.id,encode(extensions.digest('SYNTHETIC DECLARATION: '||new.id::text,'sha256'),'hex'),new.created_by
 where not exists(select 1 from private.source_rights_versions where organization_id=new.organization_id and source_version_id=new.id);
 return new;
end $$;
revoke all on function pg_temp.declare_fixture_source_rights() from public,anon,authenticated,service_role;
create trigger zzz_fixture_source_rights after insert on public.source_versions for each row execute function pg_temp.declare_fixture_source_rights();
