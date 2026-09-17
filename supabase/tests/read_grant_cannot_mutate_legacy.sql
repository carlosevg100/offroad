begin;
\ir support/source_rights_fixture.sql
\ir support/legacy_workspace_capabilities.sql
\ir support/legacy_resource_fixture.sql
set local role authenticated;
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims','{"sub":"a11b0000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}',true);
select public.grant_resource_access_v1('a11b0000-0000-4000-9000-000000000002','a11b0000-0000-4000-8000-000000000002','read');
insert into public.soundings(id,organization_id,intake_session_id,target_amount,cdi_pct,created_by)
values('a11b0000-0000-4000-9000-000000000030','a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000003',1000000,10.5,'a11b0000-0000-4000-8000-000000000001');
select set_config('request.jwt.claims','{"sub":"a11b0000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal1"}',true);
do $$ declare affected integer; begin
 if (select count(*) from public.soundings where id='a11b0000-0000-4000-9000-000000000030')<>1 then raise exception 'explicit reader cannot read sounding'; end if;
 update public.soundings set target_amount=2000000 where id='a11b0000-0000-4000-9000-000000000030';
 get diagnostics affected=row_count;
 if affected<>0 then raise exception 'read grant allowed sounding update'; end if;
 delete from public.soundings where id='a11b0000-0000-4000-9000-000000000030';
 get diagnostics affected=row_count;
 if affected<>0 then raise exception 'read grant allowed sounding deletion'; end if;
 begin
  insert into public.soundings(organization_id,intake_session_id,target_amount,cdi_pct,created_by)
  values('a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000003',1000000,10.5,'a11b0000-0000-4000-8000-000000000002');
  raise exception 'read grant allowed sounding insertion';
 exception when insufficient_privilege then null; end;
 begin
  insert into public.intake_field_candidates(organization_id,intake_session_id,extractor_key,field_path,field_group,label,normalized_value,value_type,information_class,evidence_rank,source_anchor,confidence,extraction_method,created_by)
  values('a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000003','synthetic-denied','company.legal_name','company','Synthetic','"x"','text','company_document',6,'{}',0.5,'user_entry','a11b0000-0000-4000-8000-000000000002');
  raise exception 'read grant allowed candidate insertion';
 exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claims','{"sub":"a11b0000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}',true);
select public.grant_resource_access_v1('a11b0000-0000-4000-9000-000000000002','a11b0000-0000-4000-8000-000000000002','work');
select set_config('request.jwt.claims','{"sub":"a11b0000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal1"}',true);
do $$ declare affected integer; begin
 update public.soundings set target_amount=2000000 where id='a11b0000-0000-4000-9000-000000000030';
 get diagnostics affected=row_count;
 if affected<>1 then raise exception 'explicit work grant did not allow update'; end if;
end $$;
reset role;
do $$ begin
 if exists(select 1 from pg_policies where schemaname='public' and cmd in ('INSERT','UPDATE','DELETE')
 and tablename in ('extraction_feedback','intake_field_candidates','intake_issues','sounding_events','sounding_investors','soundings')
 and (coalesce(qual,'')||coalesce(with_check,'')) like '%private.can_access_intake_session(%') then raise exception 'legacy read helper remains a direct write path'; end if;
end $$;
rollback;
