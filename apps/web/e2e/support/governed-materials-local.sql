-- Synthetic local E2E identity and one governed material package, never run against production.
-- The confirmed structure, the approved production plan and the material that depends on it are the
-- rows the governed materials routes read; inserting the material_artifact row projects its legacy
-- artifact revision (stage 19, increment 2b), which the routes resolve as the head. The payload and
-- the source document come from the Playwright spec (the material blocks and a fresh institutional
-- workbook built by the real producer). No trigger or guard is disabled.
begin;
select set_config('request.jwt.claims','{}',true);
select set_config('e2e.material_payload', $payload$__PAYLOAD__$payload$, true);
do $$
declare
 u uuid := 'ab1e0000-0000-4000-8000-000000000001';
 o uuid := 'ab1e0000-0000-4000-9000-000000000001';
 p uuid := 'ab1e0000-0000-4000-9000-000000000002';
 s uuid := 'ab1e0000-0000-4000-9000-000000000003';
 d uuid := 'ab1e0000-0000-4000-9000-000000000004';
 payload jsonb := current_setting('e2e.material_payload')::jsonb;
 fp_option text := encode(extensions.digest('structure-option:'||s::text,'sha256'),'hex');
 fp_decision text := encode(extensions.digest('structure-decision:'||s::text,'sha256'),'hex');
 fp_plan text := encode(extensions.digest('production-plan:'||s::text,'sha256'),'hex');
 fp_material text := encode(extensions.digest('material:'||s::text,'sha256'),'hex');
begin
 insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,is_sso_user,is_anonymous)
 values(u,'authenticated','authenticated','ab1e-materials@example.invalid','{}','{}',now(),now(),false,false);
 insert into public.organizations(id,organization_type,name,created_by) values(o,'originator','Synthetic governed materials',u);
 insert into public.organization_memberships(organization_id,user_id,role,status) values(o,u,'owner','active');
 perform set_config('request.jwt.claim.sub',u::text,true);
 insert into public.capital_projects(id,organization_id,project_name,created_by,private_access_granted_at,private_access_granted_by)
 values(p,o,'Synthetic governed materials',u,now(),u);
 insert into public.document_intake_sessions(id,organization_id,started_by,journey,capital_project_id) values(s,o,u,'originator',p);
 insert into public.source_documents(id,organization_id,intake_session_id,object_path,original_name,mime_type,created_by,processing_status,sha256,sha256_verified_at)
 values(d,o,s,o::text||'/'||s::text||'/synthetic-accounts.xlsx','Synthetic reconciled accounts.xlsx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',u,'ready',repeat('a',64),now());
 insert into public.deal_state_objects(organization_id,intake_session_id,object_type,object_version,status,input_fingerprint,object_fingerprint,payload,dependencies,created_by,created_by_kind,created_at)
 values
  (o,s,'structure_option',1,'pending_confirmation',repeat('1',64),fp_option,'{}','[]',null,'worker','2026-09-20T11:00:00Z'),
  (o,s,'structure_decision',1,'confirmed',repeat('2',64),fp_decision,'{}',
   jsonb_build_array(jsonb_build_object('objectType','structure_option','objectFingerprint',fp_option)),u,'user','2026-09-20T11:10:00Z'),
  (o,s,'production_plan',1,'approved',repeat('3',64),fp_plan,'{"artifacts":["teaser","financial_model","indicative_term_sheet","data_room_index"]}',
   jsonb_build_array(jsonb_build_object('objectType','structure_decision','objectFingerprint',fp_decision)),u,'user','2026-09-20T11:20:00Z'),
  (o,s,'material_artifact',1,'pending_confirmation',repeat('4',64),fp_material,payload,
   jsonb_build_array(jsonb_build_object('objectType','production_plan','objectFingerprint',fp_plan)),null,'worker','2026-09-20T12:00:00Z');
end $$;

update auth.users set instance_id='00000000-0000-0000-0000-000000000000',email_confirmed_at=now(),confirmation_token='',recovery_token='',email_change_token_new='',email_change='',encrypted_password=extensions.crypt('Synthetic-Materials!2026',extensions.gen_salt('bf')),raw_app_meta_data='{"provider":"email","providers":["email"]}' where id='ab1e0000-0000-4000-8000-000000000001';
insert into auth.identities(id,user_id,provider_id,provider,identity_data,created_at,updated_at)
select gen_random_uuid(),id,id::text,'email',jsonb_build_object('sub',id::text,'email',email),now(),now() from auth.users where id='ab1e0000-0000-4000-8000-000000000001';
insert into public.onboarding_progress(organization_id,user_id,journey,current_step,completed_at)
values('ab1e0000-0000-4000-9000-000000000001','ab1e0000-0000-4000-8000-000000000001','originator','complete',now());

-- The synthetic author declares the usage rights of the source through the production command, as
-- an upload does: reading a source (the model route checks the reviewed source before replaying the
-- workbook) requires them. Project access still controls who reads it.
select set_config('request.headers','{"x-offroad-workspace":"ab1e0000-0000-4000-9000-000000000001"}',true);
select set_config('request.jwt.claim.sub','ab1e0000-0000-4000-8000-000000000001',true);
set local role authenticated;
select public.set_source_rights_v1(
 'ab1e0000-0000-4000-9000-000000000004',0,
 array['read','process','store','derive','export'],array['analysis','export'],
 null,null,'ab1e0000-0000-4000-9000-000000000021',
 encode(extensions.digest('Synthetic E2E author declaration of source usage rights.','sha256'),'hex')
);
reset role;
commit;
