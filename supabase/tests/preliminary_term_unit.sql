-- Synthetic duration provenance. This transaction never queues or calls a provider.
begin;
insert into auth.users(id,email,raw_user_meta_data,email_confirmed_at)
 values('a4600000-0000-4000-8000-000000000001','term-unit-owner@example.invalid','{"full_name":"Synthetic duration owner"}',now());
insert into public.organizations(id,organization_type,name,created_by)
 values('a4600000-0000-4000-9000-000000000001','offroad','Synthetic duration institution','a4600000-0000-4000-8000-000000000001');
insert into public.organization_memberships(organization_id,user_id,role,status)
 values('a4600000-0000-4000-9000-000000000001','a4600000-0000-4000-8000-000000000001','owner','active');
insert into private.workspace_capability_grants(organization_id,capability,enabled,basis,granted_by)
 values('a4600000-0000-4000-9000-000000000001','own_analysis',true,'explicit_administration',null);
select set_config('request.jwt.claim.sub','a4600000-0000-4000-8000-000000000001',true);
select set_config('request.headers','{"x-offroad-workspace":"a4600000-0000-4000-9000-000000000001"}',true);
set local role authenticated;
select public.accept_private_workspace_terms('pt-BR','Synthetic duration owner','',true,true);
reset role;
create function pg_temp.term_case(p_label text,p_months integer,p_days integer,p_source_unit text,p_quote text) returns uuid
language plpgsql as $$
declare w uuid; s uuid; r uuid; d uuid; payload jsonb;
begin
 w:=(public.start_work_v1(gen_random_uuid(),'pt-BR','Synthetic duration '||p_label,'Read the documented duration','structure_from_documents','authorized_private',null,null,false)->>'workId')::uuid;
 s:=public.prepare_work_document_intake_v1(w,'pt-BR');
 insert into public.processing_runs(organization_id,intake_session_id,run_no,trigger,pipeline_version,created_by)
 values('a4600000-0000-4000-9000-000000000001',s,1,'manual','synthetic-duration-fixture',auth.uid()) returning id into r;
 update public.document_intake_sessions set status='review_ready',current_run_id=r where id=s;
 insert into public.source_documents(organization_id,intake_session_id,object_path,original_name,mime_type,created_by,processing_status)
 values('a4600000-0000-4000-9000-000000000001',s,'a4600000-0000-4000-9000-000000000001/'||s::text||'/synthetic-term.txt','Synthetic term','text/plain',auth.uid(),'ready') returning id into d;
 if p_source_unit is not null then
  insert into public.intake_field_candidates(organization_id,intake_session_id,source_document_id,processing_run_id,extractor_key,field_path,field_group,label,raw_value,normalized_value,value_type,unit,information_class,evidence_rank,source_anchor,confidence,extraction_method,anchor_verified,created_by)
  values('a4600000-0000-4000-9000-000000000001',s,d,r,'synthetic-term','transaction.desired_term_months','transaction','Duration',p_quote,to_jsonb(coalesce(p_days,p_months)),'number',p_source_unit,'company_document',3,jsonb_build_object('quote',p_quote),0.99,'native_text',true,auth.uid());
 end if;
 payload:=jsonb_build_object('schemaVersion','2026.08.31-v1','caseId',s,'locale','pt-BR','summary','Synthetic duration readout',
  'company',jsonb_build_object('name','Synthetic company','companySummary','Synthetic documentary context'),
  'operation',jsonb_build_object('archetypeId','working_capital','objective','Synthetic receivables','requestedTermMonths',p_months,'requestedTermDays',p_days,'currency','BRL','operationSummary','Synthetic duration'),
  'basis',jsonb_build_object('preliminaryDocumentCount',1,'userDeclared',true));
 insert into public.preliminary_understandings(organization_id,intake_session_id,processing_run_id,object_version,status,input_fingerprint,object_fingerprint,payload)
 values('a4600000-0000-4000-9000-000000000001',s,r,1,'pending_confirmation',repeat('a',64),encode(extensions.digest(payload::text,'sha256'),'hex'),payload);
 return w;
end $$;
select set_config('test.bad_term',pg_temp.term_case('legacy day count',120,null,'days','Prazo de até 120 dias.')::text,true);
select set_config('test.day_term',pg_temp.term_case('day count',null,120,'days','Prazo de até 120 dias.')::text,true);
select set_config('test.month_term',pg_temp.term_case('month count',18,null,'months','Prazo de 18 meses.')::text,true);
select set_config('test.false_unit',pg_temp.term_case('false month label',120,null,'months','Prazo de até 120 dias.')::text,true);
select set_config('test.unproved_term',pg_temp.term_case('missing unit evidence',120,null,null,null)::text,true);
set local role authenticated;
do $$ declare w uuid; f text; sid uuid; begin
 foreach w in array array[current_setting('test.bad_term')::uuid,current_setting('test.false_unit')::uuid,current_setting('test.unproved_term')::uuid] loop
  select u.object_fingerprint,s.id into f,sid from public.preliminary_understandings u join public.document_intake_sessions s on s.id=u.intake_session_id and s.organization_id=u.organization_id where s.capital_project_id=w;
  begin
   perform public.decide_advisor_preliminary_v1(w,f,'confirmed',null);
   raise exception 'Unproved month projection accepted';
  exception when invalid_parameter_value then
   if sqlerrm<>'preliminary_term_unit_unconfirmed' then raise;end if;
  end;
  if (select requested_term_months from public.document_intake_sessions where id=sid) is not null or (select status from public.preliminary_understandings where intake_session_id=sid)<>'pending_confirmation' then raise exception 'Refused duration changed canonical memory';end if;
 end loop;
 foreach w in array array[current_setting('test.day_term')::uuid,current_setting('test.month_term')::uuid] loop
  select u.object_fingerprint,s.id into f,sid from public.preliminary_understandings u join public.document_intake_sessions s on s.id=u.intake_session_id and s.organization_id=u.organization_id where s.capital_project_id=w;
  perform public.decide_advisor_preliminary_v1(w,f,'confirmed',null);
  if w=current_setting('test.day_term')::uuid and (select requested_term_months from public.document_intake_sessions where id=sid) is not null then raise exception 'Documentary days became months';end if;
  if w=current_setting('test.month_term')::uuid and (select requested_term_months from public.document_intake_sessions where id=sid) is distinct from 18 then raise exception 'Verified month count lost';end if;
 end loop;
end $$;
reset role;
select 'preliminary_term_unit: PASS' result;
rollback;
