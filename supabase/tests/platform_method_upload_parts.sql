-- Operator upload of a manifest in parts: parts are stored and checked by md5, a missing part or a
-- text that does not hash to the supplied manifestHash is refused before any candidate is written,
-- and neither the table nor the commands are open to an API role. Everything rolls back.
begin;
set local statement_timeout='60s';

do $$
declare upload uuid:='7c2e0f4a-0000-4000-8000-000000000001';code text;
begin
 if private.put_platform_method_upload_part_v1(upload,0,'{"a":')<>md5('{"a":') then raise exception 'part md5 not returned';end if;
 perform private.put_platform_method_upload_part_v1(upload,1,'1}');
 -- A missing part is refused.
 begin
  perform private.submit_platform_method_candidate_from_parts_v1(gen_random_uuid(),'x-1',upload,3,repeat('0',64),'[]','0000000000000000000000000000000000000000','tester');
  raise exception 'incomplete upload accepted';
 exception when sqlstate '22023' then get stacked diagnostics code=message_text;
  if code<>'platform_method_upload_incomplete' then raise; end if;
 end;
 -- Text that does not hash to the reviewed manifestHash is refused; nothing is derived from the parts.
 begin
  perform private.submit_platform_method_candidate_from_parts_v1(gen_random_uuid(),'x-1',upload,2,repeat('0',64),'[]','0000000000000000000000000000000000000000','tester');
  raise exception 'altered text accepted';
 exception when sqlstate '22023' then get stacked diagnostics code=message_text;
  if code<>'platform_method_upload_hash_mismatch' then raise; end if;
 end;
 if exists(select 1 from private.platform_method_candidates where release_id='x-1') then raise exception 'candidate written'; end if;
 raise notice 'PASS: incomplete and altered uploads are refused before any candidate';
end $$;

do $$ declare f text;
begin
 foreach f in array array['private.put_platform_method_upload_part_v1(uuid,integer,text)',
  'private.submit_platform_method_candidate_from_parts_v1(uuid,text,uuid,integer,text,jsonb,text,text)'] loop
  if has_function_privilege('anon',f,'EXECUTE') or has_function_privilege('authenticated',f,'EXECUTE') or has_function_privilege('service_role',f,'EXECUTE') then
   raise exception 'function exposed: %',f; end if;
 end loop;
 if has_table_privilege('authenticated','private.platform_method_upload_parts','SELECT') or has_table_privilege('service_role','private.platform_method_upload_parts','INSERT') then
  raise exception 'upload parts exposed'; end if;
 raise notice 'PASS: upload commands and parts closed to API roles';
end $$;

select 'platform_method_upload_parts_passed' as result;
rollback;
