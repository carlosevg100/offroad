begin;
\ir support/source_rights_fixture.sql
\ir support/legacy_workspace_capabilities.sql
\ir support/legacy_resource_fixture.sql
select set_config('request.headers','{"x-offroad-workspace":"a11b0000-0000-4000-9000-000000000001"}',true);
select set_config('request.jwt.claim.sub','a11b0000-0000-4000-8000-000000000001',true);
update public.document_intake_sessions set status='review_ready' where id='a11b0000-0000-4000-9000-000000000003';
insert into public.intake_field_candidates(id,organization_id,intake_session_id,source_document_id,extractor_key,field_path,field_group,label,raw_value,normalized_value,value_type,information_class,evidence_rank,source_anchor,confidence,extraction_method,created_by,unit,value_scale,entity_scope,currency)
values('a8880000-0000-4000-9000-000000000020','a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000003','a11b0000-0000-4000-9000-000000000004','synthetic-observation','historical_financials.2025.revenue','historical_financials','Synthetic revenue','R$ 100','"100"','number','audited',1,'{"page":1}',0.99,'native_text','a11b0000-0000-4000-8000-000000000001','currency',1,'consolidated','BRL');
set local role authenticated;
select public.review_intake_candidate('a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000003','a8880000-0000-4000-9000-000000000020','edit','"101"','Synthetic correction');
select public.review_intake_candidate('a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000003','a8880000-0000-4000-9000-000000000020','edit','"102"','Synthetic second correction');
do $$ begin
 if exists(select 1 from public.intake_field_candidates where is_primary) then raise exception 'human contribution promoted to primary'; end if;
 if (select count(*) from public.observations where legacy_record_id='a8880000-0000-4000-9000-000000000020')<>3 then raise exception 'legacy update overwrote history'; end if;
 if not exists(select 1 from public.observations where asserted_value='"100"' and legacy_provenance->>'raw_value'='R$ 100' and verification_state='legacy_unverified') then raise exception 'original source assertion lost'; end if;
 if exists(select 1 from public.observations where not(incomplete_reasons @> array['entity','period','scenario','definition'])) then raise exception 'legacy inferred unknown context'; end if;
 begin perform public.review_intake_candidate('a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000003','a8880000-0000-4000-9000-000000000020','edit','"NaN"'); raise exception 'invalid edited decimal admitted'; exception when invalid_parameter_value then null; end;
end $$;
reset role;
do $$ declare row_value jsonb; n bigint; begin
 select to_jsonb(c) into row_value from public.intake_field_candidates c where c.id='a8880000-0000-4000-9000-000000000020';
 select count(*) into n from public.observations;
 perform private.import_legacy_observation_v1('intake_field_candidates',row_value);
 if (select count(*) from public.observations)<>n then raise exception 'backfill replay duplicated history'; end if;
 if exists(select 1 from (select id,supersedes_id,lag(id) over(order by sequence) as prior from public.observations where legacy_record_id='a8880000-0000-4000-9000-000000000020') h where h.supersedes_id is distinct from h.prior) then raise exception 'same-transaction revision chain is unordered'; end if;
end $$;
-- Deleting the compatibility row cannot erase the source assertion.
delete from public.intake_field_candidates where id='a8880000-0000-4000-9000-000000000020';
do $$ begin if (select count(*) from public.observations where legacy_record_id='a8880000-0000-4000-9000-000000000020')<>3 then raise exception 'projection deletion erased assertions'; end if; end $$;
update private.resource_access_grants set revoked_at=now() where resource_id='a11b0000-0000-4000-9000-000000000002';
set local role authenticated;
do $$ begin if exists(select 1 from public.observations) then raise exception 'revoked creator retained observations'; end if; end $$;
reset role;
-- Deletion detaches only the resource pointer, keeping the historical origin immutable.
delete from public.dossiers where resource_id='a11b0000-0000-4000-9000-000000000003';
do $$ begin
 if (select count(*) from public.observations where dossier_id is null and dossier_reference is not null)<>3 then raise exception 'dossier deletion destroyed history'; end if;
end $$;
set local role authenticated;
do $$ begin if exists(select 1 from public.observations) then raise exception 'orphan history disclosed'; end if; end $$;
reset role;
select 'observation_legacy_history' as test,'PASS' as result;
rollback;
