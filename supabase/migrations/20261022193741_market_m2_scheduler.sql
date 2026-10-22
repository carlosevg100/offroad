-- Market reference M2, part 2 (ADR 0023; docs/build/market-reference/M2-PARTE-2.md): the scheduler. Schedules
-- granted by a founder or operator, occurrences with their identity, the communiqué list that records what it
-- discovered, the conflict between lists and details serialized per meeting, the common enqueue under the source
-- lock, and the worker's firing entry. Nothing here grants a schedule or opens the transport: the scheduler stays
-- off until the acts of part 4.

-- 1. Schedules, occurrences and the meetings each list discovered.
create table private.market_acquisition_schedules(
 id uuid primary key,
 kind text not null check(kind in ('series_432','copom_communiques')),
 source_id text not null,
 contracts text[] not null,
 params jsonb not null check(jsonb_typeof(params)='object'),
 local_time text not null check(local_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
 business_days_only boolean not null,
 reason text not null check(length(btrim(reason)) between 10 and 1000),
 granted_by uuid not null references auth.users(id),
 command_id uuid not null unique,
 fingerprint text not null check(fingerprint ~ '^[a-f0-9]{64}$'),
 granted_at timestamptz not null default clock_timestamp(),
 revoked_at timestamptz,
 revoked_by uuid references auth.users(id),
 revoke_command_id uuid unique,
 revoke_reason text check(revoke_reason is null or length(btrim(revoke_reason)) between 10 and 1000),
 check((revoked_at is null)=(revoked_by is null) and (revoked_at is null)=(revoke_command_id is null) and (revoked_at is null)=(revoke_reason is null)),
 check((kind='series_432' and contracts=array['bcb-sgs-432-endpoint']::text[])
  or (kind='copom_communiques' and contracts=array['bcb-copom-comunicados-lista','bcb-copom-comunicados-detalhe']::text[])));
create unique index market_acquisition_schedules_active on private.market_acquisition_schedules(kind) where revoked_at is null;
create index market_acquisition_schedules_granted_by on private.market_acquisition_schedules(granted_by);
create index market_acquisition_schedules_revoked_by on private.market_acquisition_schedules(revoked_by);

create table private.market_schedule_occurrences(
 id uuid primary key,
 schedule_id uuid not null references private.market_acquisition_schedules(id),
 occurrence_key text not null check(occurrence_key ~ '^(series:[0-9]{4}-[0-9]{2}-[0-9]{2}|list:[0-9]{4}-[0-9]{2}-[0-9]{2}|detail:[1-9][0-9]{0,3}:[1-3]|manual:[0-9a-f-]{36})$'),
 contract_id text not null references private.market_endpoint_contracts(id),
 request jsonb not null,
 request_sha256 text not null check(request_sha256 ~ '^[a-f0-9]{64}$'),
 window_start date,
 meeting integer check(meeting between 1 and 9999),
 job_id uuid not null unique references private.market_acquisition_jobs(id),
 worker_token_id uuid references private.worker_tokens(id),
 account_user_id uuid references auth.users(id),
 actor_user_id uuid references auth.users(id),
 created_at timestamptz not null default clock_timestamp(),
 unique(schedule_id,occurrence_key),
 check((worker_token_id is null)=(account_user_id is null) and (worker_token_id is null)<>(actor_user_id is null)),
 check((contract_id='bcb-sgs-432-endpoint')=(window_start is not null) and (contract_id='bcb-copom-comunicados-detalhe')=(meeting is not null)));
create index market_schedule_occurrences_window on private.market_schedule_occurrences(schedule_id,window_start,created_at) where window_start is not null;
create index market_schedule_occurrences_meeting on private.market_schedule_occurrences(schedule_id,meeting) where meeting is not null;
create index market_schedule_occurrences_contract on private.market_schedule_occurrences(contract_id);
create index market_schedule_occurrences_worker on private.market_schedule_occurrences(worker_token_id);
create index market_schedule_occurrences_account on private.market_schedule_occurrences(account_user_id);
create index market_schedule_occurrences_actor on private.market_schedule_occurrences(actor_user_id);

create table private.market_copom_listings(
 list_acquisition_id uuid not null references private.market_acquisitions(id),
 meeting integer not null check(meeting between 1 and 9999),
 reference_date date not null,
 primary key(list_acquisition_id,meeting));
create index market_copom_listings_meeting on private.market_copom_listings(meeting);

-- A schedule changes only once, by its revocation; occurrences and listings never change.
create function private.guard_market_acquisition_schedule_v1() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_op='UPDATE' and old.revoked_at is null and new.revoked_at is not null
 and (to_jsonb(new)-array['revoked_at','revoked_by','revoke_command_id','revoke_reason'])=(to_jsonb(old)-array['revoked_at','revoked_by','revoke_command_id','revoke_reason'])
 then return new;end if;
 raise exception 'market_schedule_immutable' using errcode='23514';
end $$;
create trigger market_acquisition_schedules_guard before update or delete on private.market_acquisition_schedules for each row execute function private.guard_market_acquisition_schedule_v1();
create trigger market_schedule_occurrences_immutable before update or delete on private.market_schedule_occurrences for each row execute function private.market_reject_change_v1();
create trigger market_copom_listings_immutable before update or delete on private.market_copom_listings for each row execute function private.market_reject_change_v1();

-- 2. The strict list reader returns the meetings it validated; the count reads them.
create function private.market_parse_copom_list_meetings_v1(p_content bytea,p_size integer)
returns table(meeting integer,reference_date date)
language plpgsql immutable set search_path='' as $$
declare j json;r json;prior int;begin
 j:=private.market_strict_json_v1(p_content);
 if json_typeof(j)<>'object' or (select count(*) from json_object_keys(j))<>1 or json_typeof(j->'conteudo') is distinct from 'array'
 then raise exception 'market_parse_communique_shape';end if;
 if json_array_length(j->'conteudo') not between 1 and p_size then raise exception 'market_parse_communique_list_size';end if;
 for r in select e from json_array_elements(j->'conteudo') with ordinality x(e,o) order by o loop
  if json_typeof(r)<>'object' or (select string_agg(k,',' order by k collate "C") from json_object_keys(r) k) is distinct from 'dataReferencia,nro_reuniao,titulo'
  or json_typeof(r->'nro_reuniao')<>'number' or (r->'nro_reuniao')::text !~ '^[1-9][0-9]{0,3}$'
  or json_typeof(r->'dataReferencia')<>'string' or not private.market_real_date_any_v1(r->>'dataReferencia') or (r->>'dataReferencia')<'1900-01-01'
  or json_typeof(r->'titulo')<>'string' then raise exception 'market_parse_communique_fields';end if;
  if prior is not null and (r->'nro_reuniao')::text::int>=prior then raise exception 'market_parse_communique_order';end if;
  prior:=(r->'nro_reuniao')::text::int;
  meeting:=prior;reference_date:=(r->>'dataReferencia')::date;
  return next;
 end loop;
end $$;

create or replace function private.market_parse_copom_list_v1(p_content bytea,p_size integer) returns integer
language sql immutable set search_path='' as $$
 select count(*)::integer from private.market_parse_copom_list_meetings_v1(p_content,p_size);
$$;

-- 3. The confirmation records what a list discovered and serializes the date of each meeting between lists
-- and details: the meeting locks are taken in ascending order before any comparison.
create or replace function private.worker_commit_market_version_v1(p_job_id uuid,p_capability_token text,p_lease_id uuid,p_content bytea,p_content_type text,p_acquired_at timestamptz) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j private.market_acquisition_jobs;a private.market_acquisition_allocations;s private.market_source_revisions;c private.market_endpoint_contracts;
 n private.market_normalizations;o storage.objects;r private.market_version_commits;sha text;md5hex text;parser text;policy text;fp text;today date;
 obs jsonb;created jsonb;result jsonb;d record;m private.market_copom_meetings;is_reference boolean:=false;version_id uuid;lm record;listed integer;begin perform private.market_require_read_committed_v1();
 perform 1 from auth.users where id=auth.uid() and deleted_at is null and (banned_until is null or banned_until<=clock_timestamp()) for share;
 if not found then raise exception 'market_acquisition_lease_denied' using errcode='42501';end if;
 select * into j from private.market_acquisition_jobs where id=p_job_id for update;
 if not found or j.contract_id is null then raise exception 'market_acquisition_lease_denied' using errcode='42501';end if;
 if p_content is null or p_content_type is null or p_acquired_at is null then raise exception 'market_acquisition_invalid' using errcode='22023';end if;
 sha:=encode(extensions.digest(p_content,'sha256'),'hex');
 -- Replay: the original answer, to the account and capability of the attempt that confirmed it.
 select * into r from private.market_version_commits where job_id=j.id;
 if found then
  if r.lease_id is distinct from p_lease_id or r.account_user_id is distinct from auth.uid() or p_capability_token is null
  or r.capability_sha256 is distinct from extensions.digest(p_capability_token,'sha256')
  or r.fingerprint is distinct from private.market_commit_fingerprint_v1(j.id,p_lease_id,sha,p_content_type,p_acquired_at,r.contract_id,r.parser,r.quality_policy)
  or not exists(select 1 from private.market_acquisition_allocations x join private.worker_tokens w on w.id=x.worker_token_id
   where x.id=r.acquisition_id and w.execution_account_user_id=auth.uid() and w.status='active' and w.revoked_at is null)
  then raise exception 'market_acquisition_lease_denied' using errcode='42501';end if;
  return r.result||jsonb_build_object('replayed',true);
 end if;
 j:=private.market_acquisition_for_lease_v1(p_job_id,p_capability_token,p_lease_id);
 perform private.market_attempt_current_v1(j);
 select * into strict a from private.market_acquisition_allocations where id=j.allocation_id and lease_id=j.lease_id;
 select * into c from private.market_endpoint_contracts where id=j.contract_id;
 s:=private.market_source_in_force_v1(j.source_id);
 if octet_length(p_content)>c.max_bytes or octet_length(p_content)=0 or p_acquired_at<j.leased_at or p_acquired_at>clock_timestamp()
 or not private.market_extension_content_type_v1(c.extension,p_content_type) then raise exception 'market_acquisition_invalid' using errcode='22023';end if;
 if private.market_contract_url_v1(c.id,j.request,null)<>j.url or not private.market_url_allowed_v1(j.url,s.allowed_hosts)
 or not private.market_source_cites_contract_v1(s.license,c) then raise exception 'market_contract_mismatch' using errcode='42501';end if;
 md5hex:=md5(p_content);
 select * into o from storage.objects where bucket_id=a.bucket_id and name=a.object_path for share;
 if not found or (o.metadata->>'size')::bigint is distinct from octet_length(p_content)::bigint or o.metadata->>'mimetype' is distinct from p_content_type
 or o.metadata->>'eTag' is distinct from '"'||md5hex||'"'
 or (to_jsonb(o)->>'is_versioned')::boolean is true or (to_jsonb(o)->>'is_delete_marker')::boolean is true or to_jsonb(o)->>'archived_at' is not null
 then raise exception 'market_acquisition_object_mismatch' using errcode='55000';end if;
 insert into private.market_acquisitions(id,publisher_organization_id,source_id,source_revision,url,final_url,acquired_at,sha256,byte_size,content_type,object_path,processing_job_id)
 values(a.id,private.market_publisher_organization_v1(),j.source_id,j.source_revision,j.url,j.url,p_acquired_at,sha,octet_length(p_content),p_content_type,a.object_path,j.id);
 today:=private.market_sao_paulo_date_v1(clock_timestamp());
 if c.kind='sgs_daily_json' then
  select * into n from private.market_normalizations where endpoint_contract_id=c.id order by ordinal desc limit 1;
  parser:=n.parser;policy:=n.quality_policy_id||'@'||n.quality_policy_version;
  select coalesce(jsonb_agg(jsonb_build_object('period',to_char(x.period,'YYYY-MM-DD'),'value',x.value) order by x.period),'[]') into obs
  from private.market_parse_sgs_daily_v1(p_content,(j.request#>>'{window,start}')::date,(j.request#>>'{window,end}')::date,today) x;
  created:=private.create_market_selic_version_v1(a.id,n.id,null,obs,today,(j.request#>>'{window,start}')::date,
   least((j.request#>>'{window,end}')::date,today),j.id,null);
  version_id:=(created->>'versionId')::uuid;
  result:=jsonb_build_object('committed',true,'replayed',false,'acquisitionId',a.id,'versionId',version_id,'quality',created->'quality');
 elsif c.kind='copom_communique_detail' then
  parser:=c.parser;
  select * into d from private.market_parse_copom_detail_v1(p_content,(j.request->>'meeting')::int);
  -- The meeting is serialized with every list that names it; a date different from a readable listing refuses.
  perform pg_advisory_xact_lock(hashtextextended('market-copom-meeting:'||(j.request->>'meeting'),0));
  if exists(select 1 from private.market_copom_listings l where l.meeting=(j.request->>'meeting')::int and l.reference_date<>d.reference_date
   and private.market_acquisition_readable_v1(l.list_acquisition_id)) then raise exception 'market_copom_list_conflict' using errcode='23514';end if;
  insert into private.market_copom_communique_acquisitions(acquisition_id,meeting,reference_date,decision,target_pct,record_sha256,title,body,parser,series_change_date,regulatory_effective_from)
  values(a.id,(j.request->>'meeting')::int,d.reference_date,d.decision,d.target_pct,d.record_sha256,d.title,d.body,parser,d.series_change_date,d.regulatory_effective_from);
  begin
   insert into private.market_copom_meetings(meeting,reference_date,decision,target_pct,reference_acquisition_id,reference_acquired_at,record_sha256,series_change_date)
   values((j.request->>'meeting')::int,d.reference_date,d.decision,d.target_pct,a.id,p_acquired_at,d.record_sha256,d.series_change_date)
   on conflict (meeting) do nothing;
  exception when unique_violation then raise exception 'market_copom_meeting_day_collision' using errcode='23505';
  end;
  select * into m from private.market_copom_meetings where meeting=(j.request->>'meeting')::int for update;
  if m.reference_date<>d.reference_date or m.decision<>d.decision or m.target_pct::numeric<>d.target_pct::numeric then raise exception 'market_copom_meeting_disagreement' using errcode='23514';end if;
  is_reference:=m.reference_acquisition_id=a.id;
  result:=jsonb_build_object('committed',true,'replayed',false,'acquisitionId',a.id,'meeting',m.meeting,'reference',is_reference);
 else
  parser:=c.parser;
  -- Every listed meeting is locked in ascending order, then compared with readable listings and with the
  -- reference communiqué, then recorded.
  listed:=0;
  for lm in select x.meeting,x.reference_date from private.market_parse_copom_list_meetings_v1(p_content,(j.request->>'size')::int) x order by x.meeting loop
   perform pg_advisory_xact_lock(hashtextextended('market-copom-meeting:'||lm.meeting::text,0));
   listed:=listed+1;
  end loop;
  if exists(select 1 from private.market_parse_copom_list_meetings_v1(p_content,(j.request->>'size')::int) x
   where exists(select 1 from private.market_copom_listings l where l.meeting=x.meeting and l.reference_date<>x.reference_date and private.market_acquisition_readable_v1(l.list_acquisition_id))
   or exists(select 1 from private.market_copom_meetings mm where mm.meeting=x.meeting and mm.reference_date<>x.reference_date))
  then raise exception 'market_copom_list_conflict' using errcode='23514';end if;
  insert into private.market_copom_listings(list_acquisition_id,meeting,reference_date)
  select a.id,x.meeting,x.reference_date from private.market_parse_copom_list_meetings_v1(p_content,(j.request->>'size')::int) x;
  result:=jsonb_build_object('committed',true,'replayed',false,'acquisitionId',a.id,'listed',listed);
 end if;
 fp:=private.market_commit_fingerprint_v1(j.id,p_lease_id,sha,p_content_type,p_acquired_at,c.id,parser,policy);
 update private.market_acquisition_jobs set status='succeeded',acquisition_id=a.id,lease_id=null,leased_by=null,leased_account_user_id=null,leased_at=null,
  lease_expires_at=null,capability_sha256=null where id=j.id;
 insert into private.market_acquisition_job_events(job_id,event,worker_token_id,lease_id,detail)
 values(j.id,'committed',j.leased_by,p_lease_id,jsonb_build_object('acquisitionId',a.id,'fingerprint',fp));
 insert into private.market_version_commits(job_id,lease_id,account_user_id,capability_sha256,contract_id,parser,quality_policy,fingerprint,acquisition_id,version_id,result)
 values(j.id,p_lease_id,auth.uid(),j.capability_sha256,c.id,parser,policy,fp,a.id,version_id,result);
 -- No wait (meeting row, unique keys, foreign keys, locks) extends the lease: the deadline is read
 -- after the last write, and an expired lease rolls the whole confirmation back.
 if j.lease_expires_at<=clock_timestamp() then raise exception 'market_acquisition_lease_denied' using errcode='42501';end if;
 return result;
end $$;

-- 4. Grant and revoke a schedule: founder or operator, with a receipt.
create function private.grant_market_acquisition_schedule_v1(p_command uuid,p_kind text,p_params jsonb,p_local_time text,p_business_days_only boolean,p_reason text,p_actor uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare prior private.market_acquisition_schedules;fp text;contracts text[];src text;hom date;sid uuid:=gen_random_uuid();begin
 perform private.market_require_read_committed_v1();
 perform private.require_platform_principal_v1(p_actor);
 if p_command is null or p_kind is null or p_params is null or jsonb_typeof(p_params)<>'object' or p_local_time is null or p_business_days_only is null or p_reason is null
 or p_local_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or length(btrim(p_reason)) not between 10 and 1000
 then raise exception 'market_schedule_invalid' using errcode='22023';end if;
 if p_kind='series_432' then
  contracts:=array['bcb-sgs-432-endpoint'];
  select homologated_from into hom from private.market_endpoint_contracts where id='bcb-sgs-432-endpoint';
  if (select array_agg(k) from jsonb_object_keys(p_params) k) is distinct from array['coverageStart'] or jsonb_typeof(p_params->'coverageStart')<>'string'
  or not private.market_real_date_v1(p_params->>'coverageStart') or (p_params->>'coverageStart')::date<hom
  or (p_params->>'coverageStart')::date>private.market_sao_paulo_date_v1(clock_timestamp())
  then raise exception 'market_schedule_invalid' using errcode='22023';end if;
 elsif p_kind='copom_communiques' then
  contracts:=array['bcb-copom-comunicados-lista','bcb-copom-comunicados-detalhe'];
  if (select array_agg(k) from jsonb_object_keys(p_params) k) is distinct from array['size'] or jsonb_typeof(p_params->'size')<>'number'
  or (p_params->'size')::text !~ '^[1-9][0-9]{1,2}$' or (p_params->>'size')::int not between 10 and 100
  then raise exception 'market_schedule_invalid' using errcode='22023';end if;
 else raise exception 'market_schedule_invalid' using errcode='22023';end if;
 select min(source_id) into src from private.market_endpoint_contracts where id=any(contracts);
 if src is null or (select count(*) from private.market_endpoint_contracts where id=any(contracts))<>cardinality(contracts)
 or exists(select 1 from private.market_endpoint_contracts where id=any(contracts) and source_id<>src)
 then raise exception 'market_schedule_invalid' using errcode='22023';end if;
 fp:=encode(extensions.digest(convert_to(concat_ws(E'\n','grant',p_kind,p_params::text,p_local_time,p_business_days_only::text,btrim(p_reason),p_actor::text),'UTF8'),'sha256'),'hex');
 perform pg_advisory_xact_lock(hashtextextended('platform-command:'||p_command::text,0));
 select * into prior from private.market_acquisition_schedules where command_id=p_command;
 if found then
  if prior.fingerprint<>fp then raise exception 'platform_method_request_reused' using errcode='22023';end if;
  return jsonb_build_object('scheduleId',prior.id,'replayed',true);
 end if;
 perform pg_advisory_xact_lock(hashtextextended('market-schedule:'||p_kind,0));
 if exists(select 1 from private.market_acquisition_schedules where kind=p_kind and revoked_at is null) then raise exception 'market_schedule_active_exists' using errcode='23505';end if;
 insert into private.market_acquisition_schedules(id,kind,source_id,contracts,params,local_time,business_days_only,reason,granted_by,command_id,fingerprint)
 values(sid,p_kind,src,contracts,p_params,p_local_time,p_business_days_only,btrim(p_reason),p_actor,p_command,fp);
 return jsonb_build_object('scheduleId',sid,'replayed',false);
end $$;

create function private.revoke_market_acquisition_schedule_v1(p_command uuid,p_schedule uuid,p_reason text,p_actor uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare sc private.market_acquisition_schedules;begin
 perform private.market_require_read_committed_v1();
 perform private.require_platform_principal_v1(p_actor);
 if p_command is null or p_schedule is null or p_reason is null or length(btrim(p_reason)) not between 10 and 1000 then raise exception 'market_schedule_invalid' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('platform-command:'||p_command::text,0));
 select * into sc from private.market_acquisition_schedules where revoke_command_id=p_command;
 if found then
  if sc.id<>p_schedule or sc.revoke_reason<>btrim(p_reason) or sc.revoked_by<>p_actor then raise exception 'platform_method_request_reused' using errcode='22023';end if;
  return jsonb_build_object('scheduleId',sc.id,'replayed',true);
 end if;
 select * into sc from private.market_acquisition_schedules where id=p_schedule;
 if not found then raise exception 'market_schedule_unknown' using errcode='22023';end if;
 -- The revocation waits for a firing in flight; a firing that starts later does not find the schedule active.
 perform pg_advisory_xact_lock(hashtextextended('market-schedule:'||sc.kind,0));
 update private.market_acquisition_schedules set revoked_at=clock_timestamp(),revoked_by=p_actor,revoke_command_id=p_command,revoke_reason=btrim(p_reason)
 where id=p_schedule and revoked_at is null;
 if not found then raise exception 'market_schedule_revoked' using errcode='22023';end if;
 return jsonb_build_object('scheduleId',p_schedule,'replayed',false);
end $$;

-- 5. Why a schedule cannot fire now, or null: grantor, delegation, transport, source, host and evidence.
create function private.market_schedule_blocker_v1(sc private.market_acquisition_schedules,p_worker uuid,p_today date) returns text
language plpgsql stable security definer set search_path='' as $$
declare s private.market_source_revisions;c private.market_endpoint_contracts;begin
 if not private.platform_principal_live_v1(sc.granted_by) then return 'grantor_inactive';end if;
 if p_worker is not null and not private.market_delegation_live_v1(p_worker,sc.source_id) then return 'delegation_missing';end if;
 if not private.market_acquisition_transport_released_v1() then return 'transport_paused';end if;
 if private.market_publisher_organization_v1() is null then return 'publisher_missing';end if;
 s:=private.market_source_in_force_v1(sc.source_id);
 if s.source_id is null or not private.market_source_acquirable_v1(sc.source_id,p_today) then return 'source_not_acquirable';end if;
 for c in select * from private.market_endpoint_contracts where id=any(sc.contracts) order by id loop
  if c.source_id<>sc.source_id then return 'contract_source_mismatch';end if;
  if not (c.host=any(s.allowed_hosts)) then return 'host_not_allowed';end if;
  if not private.market_source_cites_contract_v1(s.license,c) then return 'contract_evidence_missing';end if;
 end loop;
 return null;
end $$;

-- 6. The common enqueue of a schedule, for the firing and the manual occurrence: under the exclusive source
-- lock every check is made before anything is written; the occurrence and its job are written together, and the
-- job's command is derived from the occurrence so a replay finds the same job.
create function private.enqueue_market_schedule_job_v1(p_schedule uuid,p_key text,p_contract text,p_request jsonb,p_worker uuid,p_account uuid,p_actor uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare sc private.market_acquisition_schedules;c private.market_endpoint_contracts;s private.market_source_revisions;prior private.market_schedule_occurrences;
 url text;job uuid:=gen_random_uuid();cmd uuid;today date:=private.market_sao_paulo_date_v1(clock_timestamp());blocker text;begin
 select * into prior from private.market_schedule_occurrences where schedule_id=p_schedule and occurrence_key=p_key;
 if found then
  if prior.contract_id<>p_contract or prior.request<>p_request then raise exception 'market_schedule_occurrence_reused' using errcode='22023';end if;
  return prior.job_id;
 end if;
 select * into sc from private.market_acquisition_schedules where id=p_schedule and revoked_at is null;
 if not found then raise exception 'market_schedule_revoked' using errcode='22023';end if;
 if not (p_contract=any(sc.contracts)) then raise exception 'market_schedule_contract' using errcode='42501';end if;
 select * into strict c from private.market_endpoint_contracts where id=p_contract;
 url:=private.market_contract_url_v1(c.id,p_request,today);
 perform pg_advisory_xact_lock(hashtextextended('market-source:'||sc.source_id,0));
 blocker:=private.market_schedule_blocker_v1(sc,p_worker,today);
 if blocker is not null then raise exception 'market_schedule_blocked:%',blocker using errcode='42501';end if;
 s:=private.market_source_in_force_v1(sc.source_id);
 if not private.market_url_allowed_v1(url,s.allowed_hosts) then raise exception 'market_schedule_blocked:host_not_allowed' using errcode='42501';end if;
 cmd:=extensions.uuid_generate_v5('6f0d1c7a-2b4e-5d3f-8a91-4c2e7b5d9e10','market-schedule:'||p_schedule::text||':'||p_key);
 insert into private.market_acquisition_jobs(id,command_id,requested_by,reason,source_id,source_revision,url,extension,contract_id,request)
 values(job,cmd,coalesce(p_actor,sc.granted_by),'agenda '||p_schedule::text||', '||p_key,s.source_id,s.revision,url,c.extension,c.id,p_request);
 insert into private.market_acquisition_job_events(job_id,event,actor_user_id,command_id,detail)
 values(job,'enqueued',coalesce(p_actor,sc.granted_by),cmd,jsonb_build_object('sourceId',s.source_id,'sourceRevision',s.revision,'contractId',c.id,'schedule',p_schedule,'occurrence',p_key));
 insert into private.market_schedule_occurrences(id,schedule_id,occurrence_key,contract_id,request,request_sha256,window_start,meeting,job_id,worker_token_id,account_user_id,actor_user_id)
 values(gen_random_uuid(),p_schedule,p_key,c.id,p_request,encode(extensions.digest(convert_to(p_request::text,'UTF8'),'sha256'),'hex'),
  case when c.kind='sgs_daily_json' then (p_request#>>'{window,start}')::date end,case when c.kind='copom_communique_detail' then (p_request->>'meeting')::int end,
  job,p_worker,p_account,p_actor);
 return job;
end $$;

-- 7. The manual occurrence: a new collection the operator asks for explicitly, through the same checks.
create function private.record_market_schedule_occurrence_v1(p_command uuid,p_schedule uuid,p_contract text,p_request jsonb,p_actor uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare sc private.market_acquisition_schedules;job uuid;begin
 perform private.market_require_read_committed_v1();
 perform private.require_platform_principal_v1(p_actor);
 if p_command is null or p_schedule is null or p_contract is null or p_request is null then raise exception 'market_schedule_invalid' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('platform-command:'||p_command::text,0));
 select * into sc from private.market_acquisition_schedules where id=p_schedule;
 if not found then raise exception 'market_schedule_unknown' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('market-schedule:'||sc.kind,0));
 if exists(select 1 from private.market_schedule_occurrences where schedule_id=p_schedule and occurrence_key='manual:'||p_command::text and actor_user_id<>p_actor)
 then raise exception 'platform_method_request_reused' using errcode='22023';end if;
 job:=private.enqueue_market_schedule_job_v1(p_schedule,'manual:'||p_command::text,p_contract,p_request,null,null,p_actor);
 return jsonb_build_object('jobId',job,'occurrence','manual:'||p_command::text);
end $$;

-- 8. The series: coverage under the reading protocol of the monitor, the window inside the contract, the
-- documentary anchor, unavailable communiqués, and recovery by the outcome of the last occurrence.
create function private.fire_market_series_schedule_v1(sc private.market_acquisition_schedules,p_worker uuid,p_account uuid,p_k timestamptz) returns jsonb
language plpgsql security definer set search_path='' as $$
declare d date:=private.market_sao_paulo_date_v1(p_k);cand record;comm_acq uuid[];g date;sel_versions uuid[];sel_acqs uuid[];hom date;wstart date;wend date;
 anchor private.market_copom_meetings;unavail integer;lastocc private.market_schedule_occurrences;j private.market_acquisition_jobs;ver uuid;
 ev private.market_version_evaluations;codes text[];periods text[];auto_count integer;manual_at timestamptz;job uuid;
 known text[]:=array['calendar_gap','no_observation','start_without_anchor','change_without_communique','communique_value_mismatch',
  'communique_direction_mismatch','anchor_value_mismatch','value_out_of_range','before_homologation'];begin
 if exists(select 1 from private.market_schedule_occurrences where schedule_id=sc.id and occurrence_key='series:'||to_char(d,'YYYY-MM-DD'))
 then return jsonb_build_object('status','already_fired');end if;
 select homologated_from into hom from private.market_endpoint_contracts where id='bcb-sgs-432-endpoint';
 select * into cand from private.market_selic_candidates_v1(d,p_k);
 select coalesce(array_agg(reference_acquisition_id),'{}') into comm_acq from private.market_copom_meetings where reference_acquired_at<=p_k;
 perform private.lock_market_read_authority_v1(cand.versions,cand.acquisitions||comm_acq);
 -- Coverage in one statement: the first day without an observation, and what the reading depended on.
 with sel as (select z.* from private.market_selic_selection_v1(d,p_k) z where z.period<=d-1),
 days as (select x::date as dy from generate_series(greatest((sc.params->>'coverageStart')::date,hom),d-1,interval '1 day') x)
 select (select min(dy) from days where dy not in (select s.period from sel s)),
  coalesce((select array_agg(distinct c.version_id) from (select distinct version_id from sel) v cross join lateral private.market_version_closure_v1(v.version_id) c where c.version_id is not null),'{}'),
  coalesce((select array_agg(distinct c.acquisition_id) from (select distinct version_id from sel) v cross join lateral private.market_version_closure_v1(v.version_id) c where c.acquisition_id is not null),'{}')
 into g,sel_versions,sel_acqs;
 if exists(select 1 from unnest(sel_versions) x where not x=any(cand.versions)) or exists(select 1 from unnest(sel_acqs) x where not x=any(cand.acquisitions||comm_acq))
 then return jsonb_build_object('status','retry');end if;
 if g is null then return jsonb_build_object('status','covered');end if;
 wstart:=greatest(hom,g);
 wend:=least(d-1,((wstart+interval '10 years')::date)-1);
 select * into anchor from private.market_copom_meetings where series_change_date<=wstart and reference_acquired_at<=p_k order by series_change_date desc limit 1;
 if not found then return jsonb_build_object('status','blocked','reason','anchor_missing','windowStart',wstart);end if;
 -- A communiqué the window would reuse whose reference is unreadable cannot be replaced in M2.
 select min(m.meeting) into unavail from private.market_copom_meetings m
 where m.reference_acquired_at<=p_k and (m.meeting=anchor.meeting or m.series_change_date between wstart+1 and wend)
 and not private.market_acquisition_readable_v1(m.reference_acquisition_id);
 if unavail is not null then return jsonb_build_object('status','blocked','reason','communique_unavailable','meeting',unavail);end if;
 select max(created_at) into manual_at from private.market_schedule_occurrences where schedule_id=sc.id and occurrence_key like 'manual:%' and window_start=wstart;
 select * into lastocc from private.market_schedule_occurrences where schedule_id=sc.id and window_start=wstart order by created_at desc,id desc limit 1;
 if found then
  select * into j from private.market_acquisition_jobs where id=lastocc.job_id;
  if j.status in ('queued','leased') then return jsonb_build_object('status','in_flight','windowStart',wstart);end if;
  if j.status='cancelled' then return jsonb_build_object('status','blocked','reason','series_cancelled','windowStart',wstart);end if;
  if j.status='succeeded' then
   select version_id into ver from private.market_version_commits where job_id=j.id;
   select * into ev from private.market_version_evaluations where version_id=ver order by evaluated_at desc,id desc limit 1;
   if ev.id is null or ev.status='quarantined' then
    select coalesce(array_agg(distinct f->>'code'),'{}'),coalesce(array_agg(distinct f->>'period') filter (where f->>'period' is not null),'{}')
    into codes,periods from jsonb_array_elements(coalesce(ev.findings,'[]')) f;
    if ev.id is null or cardinality(codes)=0 or exists(select 1 from unnest(codes) x where not x=any(known)) then
     return jsonb_build_object('status','blocked','reason','series_quality_unclassified','windowStart',wstart);end if;
    if codes && array['communique_value_mismatch','communique_direction_mismatch','anchor_value_mismatch','value_out_of_range','before_homologation'] then
     return jsonb_build_object('status','blocked','reason','series_disagreement','windowStart',wstart,'periods',to_jsonb(periods));end if;
    if codes && array['start_without_anchor','change_without_communique'] then
     -- Released only by a readable reference that resolves a pending period and is missing from the version.
     if not exists(select 1 from jsonb_array_elements(ev.findings) f join private.market_copom_meetings m
       on ((f->>'code'='start_without_anchor' and m.series_change_date<=(lastocc.request#>>'{window,start}')::date)
        or (f->>'code'='change_without_communique' and m.series_change_date=(f->>'period')::date))
       where f->>'code' in ('start_without_anchor','change_without_communique') and m.reference_acquired_at<=p_k
       and private.market_acquisition_readable_v1(m.reference_acquisition_id)
       and not exists(select 1 from private.market_version_evidence e where e.version_id=ver and e.meeting=m.meeting))
     then return jsonb_build_object('status','blocked','reason','missing_communiques','windowStart',wstart,'periods',to_jsonb(periods));end if;
    end if;
   elsif private.market_version_readable_v1(ver,'consume') then
    return jsonb_build_object('status','blocked','reason','no_progress','windowStart',wstart);
   end if;
  end if;
 end if;
 select count(*) into auto_count from private.market_schedule_occurrences
 where schedule_id=sc.id and window_start=wstart and occurrence_key like 'series:%' and (manual_at is null or created_at>manual_at);
 if auto_count>=3 then return jsonb_build_object('status','blocked','reason','series_budget','windowStart',wstart);end if;
 job:=private.enqueue_market_schedule_job_v1(sc.id,'series:'||to_char(d,'YYYY-MM-DD'),'bcb-sgs-432-endpoint',
  jsonb_build_object('window',jsonb_build_object('start',to_char(wstart,'YYYY-MM-DD'),'end',to_char(wend,'YYYY-MM-DD'))),p_worker,p_account,null);
 return jsonb_build_object('status','fired','jobId',job,'windowStart',wstart,'windowEnd',wend);
end $$;

-- 9. The communiqués: the daily list, then details for discovered meetings without a reference, at most ten
-- created per firing, the blocked ones reported without taking the batch.
create function private.fire_market_communique_schedule_v1(sc private.market_acquisition_schedules,p_worker uuid,p_account uuid,p_k timestamptz) returns jsonb
language plpgsql security definer set search_path='' as $$
declare d date:=private.market_sao_paulo_date_v1(p_k);list_status text;lists uuid[];mt record;created jsonb:='[]';blocked jsonb:='[]';inflight jsonb:='[]';
 attempts integer;job uuid;begin
 if exists(select 1 from private.market_schedule_occurrences where schedule_id=sc.id and occurrence_key='list:'||to_char(d,'YYYY-MM-DD')) then list_status:='already_fired';
 else
  job:=private.enqueue_market_schedule_job_v1(sc.id,'list:'||to_char(d,'YYYY-MM-DD'),'bcb-copom-comunicados-lista',jsonb_build_object('size',(sc.params->>'size')::int),p_worker,p_account,null);
  list_status:='fired';
 end if;
 select coalesce(array_agg(distinct list_acquisition_id),'{}') into lists from private.market_copom_listings l
 where not exists(select 1 from private.market_copom_meetings m where m.meeting=l.meeting);
 perform private.lock_market_read_authority_v1('{}',lists);
 for mt in select l.meeting,bool_or(private.market_acquisition_readable_v1(l.list_acquisition_id)) supported
  from private.market_copom_listings l where not exists(select 1 from private.market_copom_meetings m where m.meeting=l.meeting)
  group by l.meeting order by l.meeting loop
  if not mt.supported then
   if jsonb_array_length(blocked)<50 then blocked:=blocked||jsonb_build_object('meeting',mt.meeting,'reason','listing_unavailable');end if;continue;end if;
  if exists(select 1 from private.market_acquisition_jobs j where j.contract_id='bcb-copom-comunicados-detalhe' and j.request->>'meeting'=mt.meeting::text and j.status in ('queued','leased')) then
   if jsonb_array_length(inflight)<50 then inflight:=inflight||to_jsonb(mt.meeting);end if;continue;end if;
  if exists(select 1 from private.market_acquisition_jobs j where j.contract_id='bcb-copom-comunicados-detalhe' and j.request->>'meeting'=mt.meeting::text
   and j.status='failed' and j.last_error->>'code'='meeting_disagreement') then
   if jsonb_array_length(blocked)<50 then blocked:=blocked||jsonb_build_object('meeting',mt.meeting,'reason','meeting_disputed');end if;continue;end if;
  if exists(select 1 from private.market_acquisition_jobs j where j.contract_id='bcb-copom-comunicados-detalhe' and j.request->>'meeting'=mt.meeting::text and j.status='cancelled') then
   if jsonb_array_length(blocked)<50 then blocked:=blocked||jsonb_build_object('meeting',mt.meeting,'reason','detail_cancelled');end if;continue;end if;
  select count(*) into attempts from private.market_schedule_occurrences where schedule_id=sc.id and occurrence_key like 'detail:'||mt.meeting::text||':%';
  if attempts>=3 then
   if jsonb_array_length(blocked)<50 then blocked:=blocked||jsonb_build_object('meeting',mt.meeting,'reason','detail_failures');end if;continue;end if;
  if jsonb_array_length(created)>=10 then continue;end if;
  job:=private.enqueue_market_schedule_job_v1(sc.id,'detail:'||mt.meeting::text||':'||(attempts+1)::text,'bcb-copom-comunicados-detalhe',
   jsonb_build_object('meeting',mt.meeting),p_worker,p_account,null);
  created:=created||jsonb_build_object('meeting',mt.meeting,'jobId',job);
 end loop;
 return jsonb_build_object('status','fired','list',list_status,'details',created,'inFlight',inflight,'blocked',blocked);
end $$;

-- 10. The firing: the door first, waits bounded from the start by the function's lock timeout, the worker's
-- identity, then each active schedule under its try-lock, inside its hours, with nothing blocking it, under the
-- try-lock of its source.
create function private.worker_fire_market_schedules_v1(p_worker_token text) returns jsonb
language plpgsql security definer set search_path='' set lock_timeout='5s' as $$
declare worker uuid;k timestamptz;d date;hm text;sc private.market_acquisition_schedules;blocker text;acc jsonb:='[]';r jsonb;begin
 perform private.market_require_read_committed_v1();
 worker:=private.market_worker_identity_v1(p_worker_token);
 k:=clock_timestamp();d:=private.market_sao_paulo_date_v1(k);hm:=to_char(k at time zone 'America/Sao_Paulo','HH24:MI');
 for sc in select * from private.market_acquisition_schedules where revoked_at is null order by kind loop
  if not pg_try_advisory_xact_lock(hashtextextended('market-schedule:'||sc.kind,0)) then
   acc:=acc||jsonb_build_object('kind',sc.kind,'status','busy');continue;end if;
  if not exists(select 1 from private.market_acquisition_schedules where id=sc.id and revoked_at is null) then
   acc:=acc||jsonb_build_object('kind',sc.kind,'status','revoked');continue;end if;
  if hm<sc.local_time or (sc.business_days_only and private.market_next_business_day_v1(d-1)<>d) then
   acc:=acc||jsonb_build_object('kind',sc.kind,'status','not_due');continue;end if;
  blocker:=private.market_schedule_blocker_v1(sc,worker,d);
  if blocker is not null then acc:=acc||jsonb_build_object('kind',sc.kind,'status','blocked','reason',blocker);continue;end if;
  if not pg_try_advisory_xact_lock(hashtextextended('market-source:'||sc.source_id,0)) then
   acc:=acc||jsonb_build_object('kind',sc.kind,'status','busy');continue;end if;
  blocker:=private.market_schedule_blocker_v1(sc,worker,d);
  if blocker is not null then acc:=acc||jsonb_build_object('kind',sc.kind,'status','blocked','reason',blocker);continue;end if;
  if sc.kind='series_432' then r:=private.fire_market_series_schedule_v1(sc,worker,auth.uid(),k);
  else r:=private.fire_market_communique_schedule_v1(sc,worker,auth.uid(),k);end if;
  acc:=acc||(jsonb_build_object('kind',sc.kind)||r);
 end loop;
 return jsonb_build_object('schedules',acc);
end $$;

create function public.worker_fire_market_schedules_v1(p_worker_token text) returns jsonb
language sql security invoker set search_path='' as $$select private.worker_fire_market_schedules_v1(p_worker_token);$$;

-- 11. Closed surfaces, grants and the capability.
do $$ declare t text;begin
 foreach t in array array['market_acquisition_schedules','market_schedule_occurrences','market_copom_listings'] loop
  execute format('alter table private.%I enable row level security',t);
  execute format('alter table private.%I force row level security',t);
  execute format('create policy %I on private.%I as restrictive for all to public using(false) with check(false)',t||'_deny',t);
  execute format('revoke all on private.%I from public,anon,authenticated,service_role',t);
  execute format('create trigger %I before truncate on private.%I for each statement execute function private.guard_platform_ledger_truncate_v1()',t||'_truncate_guard',t);
 end loop;
end $$;

do $$declare f record;begin
 for f in select p.oid::regprocedure::text signature,p.proname,n.nspname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where (n.nspname='private' and p.proname in ('guard_market_acquisition_schedule_v1','market_parse_copom_list_meetings_v1','market_parse_copom_list_v1',
  'worker_commit_market_version_v1','grant_market_acquisition_schedule_v1','revoke_market_acquisition_schedule_v1','market_schedule_blocker_v1',
  'enqueue_market_schedule_job_v1','record_market_schedule_occurrence_v1','fire_market_series_schedule_v1','fire_market_communique_schedule_v1',
  'worker_fire_market_schedules_v1'))
 or (n.nspname='public' and p.proname='worker_fire_market_schedules_v1')
 loop
  execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);
  if f.proname in ('worker_fire_market_schedules_v1','worker_commit_market_version_v1') then
   execute format('grant execute on function %s to authenticated',f.signature);
  end if;
 end loop;
end $$;

-- Boot contract: the database announces the scheduler before any image requires it.
do $$declare body text;begin
 select pg_get_functiondef('public.worker_runtime_schema_contract_v1()'::regprocedure) into body;
 if position('market-acquisition-scheduler.v1' in body)>0 then raise exception 'market_capability_already_registered';end if;
 if position('market-regime-monitor.v1' in body)=0 then raise exception 'runtime_capability_anchor_missing';end if;
 body:=replace(body,'market-regime-monitor.v1','market-regime-monitor.v1","market-acquisition-scheduler.v1');
 execute body;
end $$;

comment on table private.market_schedule_occurrences is 'Market scheduler (ADR 0023, M2 part 2): every job the scheduler created, with the identity that makes a replay find it; internal, never shown to a tenant.';
