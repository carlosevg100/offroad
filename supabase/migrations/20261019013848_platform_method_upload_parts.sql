-- Operator channel for publishing a method whose manifest text exceeds one administrative statement.
-- The operator sends the compiler's manifest text in ordered parts; the command rebuilds the exact
-- bundle the publication tool prepares (manifest, manifestText, components, evidence, sourceCommit)
-- and hands it to submit_platform_method_candidate_v1, which keeps every integrity check: the text
-- must hash to the manifestHash. Parts are deleted in the same transaction. Nothing here publishes,
-- attests or releases a method.
set local lock_timeout='5s';

create table private.platform_method_upload_parts(
 upload_id uuid not null,
 part_no integer not null check (part_no between 0 and 255),
 content text not null check (octet_length(content) between 1 and 65536),
 created_at timestamptz not null default clock_timestamp(),
 primary key (upload_id,part_no)
);
alter table private.platform_method_upload_parts enable row level security;
alter table private.platform_method_upload_parts force row level security;
revoke all on table private.platform_method_upload_parts from public,anon,authenticated,service_role;

create function private.put_platform_method_upload_part_v1(p_upload uuid,p_part integer,p_content text) returns text
language plpgsql security invoker set search_path='' as $$
begin
 perform private.require_platform_method_operator_v1();
 if p_upload is null or p_part is null or p_content is null then raise exception 'platform_method_upload_invalid' using errcode='22023';end if;
 insert into private.platform_method_upload_parts(upload_id,part_no,content) values(p_upload,p_part,p_content)
 on conflict (upload_id,part_no) do update set content=excluded.content,created_at=clock_timestamp();
 return md5(p_content);
end $$;
revoke all on function private.put_platform_method_upload_part_v1(uuid,integer,text) from public,anon,authenticated,service_role;

create function private.submit_platform_method_candidate_from_parts_v1(p_id uuid,p_release_id text,p_upload uuid,p_part_count integer,p_manifest_hash text,p_evidence jsonb,p_source_commit text,p_author text) returns text
language plpgsql security invoker set search_path='' as $$
declare mt text;manifest jsonb;fp text;
begin
 perform private.require_platform_method_operator_v1();
 if p_part_count is null or p_part_count<1 or p_part_count<>(select count(*) from private.platform_method_upload_parts where upload_id=p_upload)
 or exists(select 1 from generate_series(0,p_part_count-1) g where not exists(select 1 from private.platform_method_upload_parts x where x.upload_id=p_upload and x.part_no=g))
 then raise exception 'platform_method_upload_incomplete' using errcode='22023';end if;
 select string_agg(content,'' order by part_no) into mt from private.platform_method_upload_parts where upload_id=p_upload;
 -- The reviewed manifestHash is supplied, never derived from the parts: any altered byte is refused.
 if p_manifest_hash is null or encode(extensions.digest(mt,'sha256'),'hex') is distinct from p_manifest_hash then
  raise exception 'platform_method_upload_hash_mismatch' using errcode='22023';end if;
 manifest:=mt::jsonb||jsonb_build_object('manifestHash',p_manifest_hash);
 fp:=private.submit_platform_method_candidate_v1(p_id,p_release_id,jsonb_build_object(
  'manifest',manifest,'manifestText',mt,
  'components',(select jsonb_agg(x->'component' order by ord) from jsonb_array_elements(manifest->'components') with ordinality t(x,ord)),
  'evidence',p_evidence,'sourceCommit',p_source_commit),p_author);
 delete from private.platform_method_upload_parts where upload_id=p_upload;
 return fp;
end $$;
revoke all on function private.submit_platform_method_candidate_from_parts_v1(uuid,text,uuid,integer,text,jsonb,text,text) from public,anon,authenticated,service_role;
