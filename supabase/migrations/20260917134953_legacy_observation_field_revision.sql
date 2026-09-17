create or replace function private.guard_observation_v1() returns trigger language plpgsql security definer set search_path='' as $$
declare d public.dossiers; e public.entities; v public.definition_versions; m public.metric_definitions; previous public.observations;
begin
 select * into d from public.dossiers where organization_id=new.organization_id and id=new.dossier_id;
 if d.id is null then raise exception 'observation_scope_denied' using errcode='23514'; end if;
 if new.entity_id is not null then
  select * into e from public.entities where id=new.entity_id;
  if e.id is null or (e.organization_id is not null and (e.organization_id<>new.organization_id or e.origin_dossier_id<>new.dossier_id))
  or not exists(select 1 from public.dossier_entity_links l where l.organization_id=new.organization_id and l.dossier_id=new.dossier_id and l.entity_id=e.id and l.withdrawn_at is null and l.valid_from<=clock_timestamp() and (l.valid_until is null or l.valid_until>clock_timestamp()))
  then raise exception 'observation_entity_scope_denied' using errcode='23514'; end if;
 end if;
 if new.definition_version_id is not null then
  select * into v from public.definition_versions where organization_id=new.organization_id and id=new.definition_version_id;
  select * into m from public.metric_definitions where organization_id=new.organization_id and id=v.metric_definition_id;
  if m.dossier_id is distinct from new.dossier_id then raise exception 'observation_definition_scope_denied' using errcode='23514'; end if;
 end if;
 if new.supersedes_id is not null then
  select * into previous from public.observations where organization_id=new.organization_id and id=new.supersedes_id;
  if previous.dossier_id is distinct from new.dossier_id or (previous.field_path is distinct from new.field_path and not coalesce(new.legacy_table is not null and previous.legacy_table=new.legacy_table and previous.legacy_record_id=new.legacy_record_id,false)) then raise exception 'observation_revision_scope_denied' using errcode='23514'; end if;
 end if;
 new.dossier_reference:=new.dossier_id;
 new.incomplete_reasons:=array_remove(array[
  case when new.asserted_value='null'::jsonb or (new.value_type='number' and (jsonb_typeof(new.asserted_value)<>'string' or new.asserted_value#>>'{}' !~ '^-?[0-9]+(\.[0-9]+)?$')) then 'value' end,
  case when new.entity_id is null then 'entity' end,case when nullif(btrim(new.perimeter),'') is null then 'perimeter' end,
  case when new.period_end is null then 'period' end,case when new.currency is null and new.value_type='number' and coalesce(new.unit,'') not in ('ratio','percent','percentage','count','days','months','years') then 'currency' end,
  case when nullif(btrim(new.unit),'') is null and new.value_type='number' then 'unit' end,
  case when new.value_scale is null and new.value_type='number' then 'scale' end,
  case when nullif(btrim(new.scenario),'') is null then 'scenario' end,case when new.definition_version_id is null then 'definition' end,
  case when new.source_version_id is null then 'source' end,case when new.source_rights_version_id is null then 'source_rights' end,
  case when new.source_anchor='{}'::jsonb then 'anchor' end],null);
 return new;
end $$;