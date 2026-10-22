-- Market reference M2 part 2 (ADR 0023): fixes after the first independent review of the scheduler.
-- The list reader keeps the upper date bound of the detail reader; every occurrence is checked against its
-- schedule and its job on insert; the grantor's principal and account stay locked from the check to the
-- commit; a manual request stays inside what the schedule granted and the job is requested by the grantor;
-- the series window and the classification of a quarantine are pure functions; the recovery reads the
-- version's effective quality event and the communiqués of its closure; the reconciliation reports a
-- discovered meeting whose reference communiqué cannot be read; a replay returns the job of the occurrence;
-- the firing takes its instant as an argument behind the worker entry, which keeps the door first.

-- 1. The list reader refuses the dates the detail reader refuses.
create or replace function private.market_parse_copom_list_meetings_v1(p_content bytea,p_size integer)
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
  or (r->>'dataReferencia')>'4098-12-31'
  or json_typeof(r->'titulo')<>'string' then raise exception 'market_parse_communique_fields';end if;
  if prior is not null and (r->'nro_reuniao')::text::int>=prior then raise exception 'market_parse_communique_order';end if;
  prior:=(r->'nro_reuniao')::text::int;
  meeting:=prior;reference_date:=(r->>'dataReferencia')::date;
  return next;
 end loop;
end $$;

-- 2. An occurrence is coherent with its schedule and its job: the contract is the schedule's, the job carries
-- the same contract and request and was requested by the grantor, the hash and the derived columns are the
-- request's, and the key names the kind of occurrence it is.
create function private.guard_market_schedule_occurrence_v1() returns trigger
language plpgsql security definer set search_path='' as $$
declare sc private.market_acquisition_schedules;j private.market_acquisition_jobs;c private.market_endpoint_contracts;begin
 select * into sc from private.market_acquisition_schedules where id=new.schedule_id;
 select * into j from private.market_acquisition_jobs where id=new.job_id;
 select * into c from private.market_endpoint_contracts where id=new.contract_id;
 if sc.id is null or j.id is null or c.id is null or not (new.contract_id=any(sc.contracts)) or c.source_id<>sc.source_id
 or j.contract_id is distinct from new.contract_id or j.request is distinct from new.request or j.source_id<>sc.source_id or j.requested_by<>sc.granted_by
 or new.request_sha256 is distinct from encode(extensions.digest(convert_to(new.request::text,'UTF8'),'sha256'),'hex')
 or new.window_start is distinct from (case when c.kind='sgs_daily_json' then (new.request#>>'{window,start}')::date end)
 or new.meeting is distinct from (case when c.kind='copom_communique_detail' then (new.request->>'meeting')::int end)
 then raise exception 'market_schedule_occurrence_invalid' using errcode='23514';end if;
 if new.occurrence_key ~ '^manual:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
  if new.actor_user_id is null or new.worker_token_id is not null or new.account_user_id is not null then
   raise exception 'market_schedule_occurrence_invalid' using errcode='23514';end if;
 elsif new.actor_user_id is not null or new.worker_token_id is null or new.account_user_id is null
 or not ((new.occurrence_key ~ '^series:\d{4}-\d{2}-\d{2}$' and c.kind='sgs_daily_json')
  or (new.occurrence_key ~ '^list:\d{4}-\d{2}-\d{2}$' and c.kind='copom_communique_list')
  or (new.occurrence_key ~ '^detail:[1-9][0-9]{0,3}:[1-3]$' and c.kind='copom_communique_detail' and split_part(new.occurrence_key,':',2)::int=new.meeting))
 then raise exception 'market_schedule_occurrence_invalid' using errcode='23514';end if;
 return new;
end $$;
create trigger market_schedule_occurrences_integrity before insert on private.market_schedule_occurrences
 for each row execute function private.guard_market_schedule_occurrence_v1();

-- 3. The series window: from the first gap, never before the homologated start, until yesterday and inside
-- the contract's exclusive limit of ten years.
create function private.market_series_window_v1(p_homologated date,p_gap date,p_today date) returns table(window_start date,window_end date)
language sql immutable set search_path='' as $$
 select greatest(p_homologated,p_gap),least(p_today-1,(greatest(p_homologated,p_gap)+interval '10 years')::date-1);
$$;

-- 4. One decision over the whole set of findings of a quarantined version, in the design's precedence.
create function private.market_series_quality_class_v1(p_findings jsonb) returns text
language sql immutable set search_path='' as $$
 with codes as (select distinct f->>'code' code from jsonb_array_elements(coalesce(p_findings,'[]')) f)
 select case
  when not exists(select 1 from codes) or exists(select 1 from codes where code is null or not code=any(array['calendar_gap','no_observation','start_without_anchor',
   'change_without_communique','communique_value_mismatch','communique_direction_mismatch','anchor_value_mismatch','value_out_of_range','before_homologation']))
  then 'unclassified'
  when exists(select 1 from codes where code=any(array['communique_value_mismatch','communique_direction_mismatch','anchor_value_mismatch','value_out_of_range','before_homologation']))
  then 'disagreement'
  when exists(select 1 from codes where code=any(array['start_without_anchor','change_without_communique'])) then 'documentary'
  else 'calendar' end;
$$;

-- 5. The blockers lock the grantor's principal and account first, so a revocation or a block of either
-- waits for the firing or is seen by it, and never lands between the check and the commit.
create or replace function private.market_schedule_blocker_v1(sc private.market_acquisition_schedules,p_worker uuid,p_today date) returns text
language plpgsql volatile security definer set search_path='' as $$
declare s private.market_source_revisions;c private.market_endpoint_contracts;begin
 perform 1 from private.platform_principals p join auth.users u on u.id=p.user_id where p.user_id=sc.granted_by for share of p,u;
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

-- 6. The common enqueue: the request stays inside what the schedule granted, and the job is requested by
-- the grantor; the author of a manual occurrence is recorded on the occurrence and on the job's event.
create or replace function private.enqueue_market_schedule_job_v1(p_schedule uuid,p_key text,p_contract text,p_request jsonb,p_worker uuid,p_account uuid,p_actor uuid) returns uuid
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
 if (c.kind='sgs_daily_json' and (p_request#>>'{window,start}')::date<(sc.params->>'coverageStart')::date)
 or (c.kind='copom_communique_list' and (p_request->>'size')::int is distinct from (sc.params->>'size')::int)
 then raise exception 'market_schedule_request_outside' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('market-source:'||sc.source_id,0));
 blocker:=private.market_schedule_blocker_v1(sc,p_worker,today);
 if blocker is not null then raise exception 'market_schedule_blocked:%',blocker using errcode='42501';end if;
 s:=private.market_source_in_force_v1(sc.source_id);
 if not private.market_url_allowed_v1(url,s.allowed_hosts) then raise exception 'market_schedule_blocked:host_not_allowed' using errcode='42501';end if;
 cmd:=extensions.uuid_generate_v5('6f0d1c7a-2b4e-5d3f-8a91-4c2e7b5d9e10','market-schedule:'||p_schedule::text||':'||p_key);
 insert into private.market_acquisition_jobs(id,command_id,requested_by,reason,source_id,source_revision,url,extension,contract_id,request)
 values(job,cmd,sc.granted_by,'agenda '||p_schedule::text||', '||p_key,s.source_id,s.revision,url,c.extension,c.id,p_request);
 insert into private.market_acquisition_job_events(job_id,event,actor_user_id,command_id,detail)
 values(job,'enqueued',coalesce(p_actor,sc.granted_by),cmd,jsonb_build_object('sourceId',s.source_id,'sourceRevision',s.revision,'contractId',c.id,'schedule',p_schedule,
  'occurrence',p_key,'grantedBy',sc.granted_by));
 insert into private.market_schedule_occurrences(id,schedule_id,occurrence_key,contract_id,request,request_sha256,window_start,meeting,job_id,worker_token_id,account_user_id,actor_user_id)
 values(gen_random_uuid(),p_schedule,p_key,c.id,p_request,encode(extensions.digest(convert_to(p_request::text,'UTF8'),'sha256'),'hex'),
  case when c.kind='sgs_daily_json' then (p_request#>>'{window,start}')::date end,case when c.kind='copom_communique_detail' then (p_request->>'meeting')::int end,
  job,p_worker,p_account,p_actor);
 return job;
end $$;

-- 7. The series. A replay returns the day's job. A succeeded last occurrence is read by its version's
-- effective quality event, under the read locks of the version's closure: a quarantine is classified only
-- through the evaluation of that quarantine; an approved and readable version is no progress; otherwise a
-- communiqué of the closure that cannot be read blocks, and a revoked series is recovered.
create or replace function private.fire_market_series_schedule_v1(sc private.market_acquisition_schedules,p_worker uuid,p_account uuid,p_k timestamptz) returns jsonb
language plpgsql security definer set search_path='' as $$
declare d date:=private.market_sao_paulo_date_v1(p_k);cand record;comm_acq uuid[];g date;sel_versions uuid[];sel_acqs uuid[];hom date;wstart date;wend date;
 anchor private.market_copom_meetings;unavail integer;lastocc private.market_schedule_occurrences;j private.market_acquisition_jobs;ver uuid;
 qe private.market_events;ev private.market_version_evaluations;cls text;periods text[];auto_count integer;manual_at timestamptz;job uuid;
 prior private.market_schedule_occurrences;clos_versions uuid[];clos_acqs uuid[];begin
 select * into prior from private.market_schedule_occurrences where schedule_id=sc.id and occurrence_key='series:'||to_char(d,'YYYY-MM-DD');
 if found then return jsonb_build_object('status','already_fired','jobId',prior.job_id);end if;
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
 select w.window_start,w.window_end into wstart,wend from private.market_series_window_v1(hom,g,d) w;
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
   select coalesce(array_agg(distinct c.version_id),'{}'),coalesce(array_agg(distinct c.acquisition_id) filter (where c.acquisition_id is not null),'{}')
   into clos_versions,clos_acqs from private.market_version_closure_v1(ver) c;
   perform private.lock_market_read_authority_v1(clos_versions,clos_acqs);
   select * into qe from private.market_events e where e.subject_kind='version' and e.subject_id=ver::text and e.event in ('approved','quarantined','revoked','purged')
   order by e.version_ordinal desc limit 1;
   if qe.event is null then
    return jsonb_build_object('status','blocked','reason','series_quality_unclassified','windowStart',wstart);
   elsif qe.event='quarantined' then
    select * into ev from private.market_version_evaluations where version_id=ver and event_sequence=qe.sequence;
    cls:=case when ev.id is null then 'unclassified' else private.market_series_quality_class_v1(ev.findings) end;
    select coalesce(array_agg(distinct f->>'period' order by f->>'period') filter (where f->>'period' is not null),'{}') into periods
    from jsonb_array_elements(coalesce(ev.findings,'[]')) f;
    if cls='unclassified' then return jsonb_build_object('status','blocked','reason','series_quality_unclassified','windowStart',wstart);end if;
    if cls='disagreement' then return jsonb_build_object('status','blocked','reason','series_disagreement','windowStart',wstart,'periods',to_jsonb(periods));end if;
    if cls='documentary' then
     -- Released only by a readable reference that resolves a pending period and is missing from the version.
     if not exists(select 1 from jsonb_array_elements(ev.findings) f join private.market_copom_meetings m
       on ((f->>'code'='start_without_anchor' and m.series_change_date<=(lastocc.request#>>'{window,start}')::date)
        or (f->>'code'='change_without_communique' and m.series_change_date=(f->>'period')::date))
       where f->>'code' in ('start_without_anchor','change_without_communique') and m.reference_acquired_at<=p_k
       and private.market_acquisition_readable_v1(m.reference_acquisition_id)
       and not exists(select 1 from private.market_version_evidence e where e.version_id=ver and e.meeting=m.meeting))
     then return jsonb_build_object('status','blocked','reason','missing_communiques','windowStart',wstart,'periods',to_jsonb(periods));end if;
    end if;
   elsif qe.event='approved' and private.market_version_readable_v1(ver,'consume') then
    return jsonb_build_object('status','blocked','reason','no_progress','windowStart',wstart);
   else
    select min(x.meeting) into unavail from private.market_copom_communique_acquisitions x
    where x.acquisition_id=any(clos_acqs) and not private.market_acquisition_readable_v1(x.acquisition_id);
    if unavail is not null then return jsonb_build_object('status','blocked','reason','communique_unavailable','meeting',unavail);end if;
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

-- 8. The communiqués. The day's list job is returned, fired or replayed. A discovered meeting whose reference
-- communiqué cannot be read is reported and never replaced.
create or replace function private.fire_market_communique_schedule_v1(sc private.market_acquisition_schedules,p_worker uuid,p_account uuid,p_k timestamptz) returns jsonb
language plpgsql security definer set search_path='' as $$
declare d date:=private.market_sao_paulo_date_v1(p_k);list_status text;list_job uuid;prior private.market_schedule_occurrences;lists uuid[];refs uuid[];mt record;
 created jsonb:='[]';blocked jsonb:='[]';inflight jsonb:='[]';attempts integer;job uuid;begin
 select * into prior from private.market_schedule_occurrences where schedule_id=sc.id and occurrence_key='list:'||to_char(d,'YYYY-MM-DD');
 if found then list_status:='already_fired';list_job:=prior.job_id;
 else
  list_job:=private.enqueue_market_schedule_job_v1(sc.id,'list:'||to_char(d,'YYYY-MM-DD'),'bcb-copom-comunicados-lista',jsonb_build_object('size',(sc.params->>'size')::int),p_worker,p_account,null);
  list_status:='fired';
 end if;
 select coalesce(array_agg(distinct l.list_acquisition_id),'{}'),coalesce(array_agg(distinct m.reference_acquisition_id) filter (where m.meeting is not null),'{}')
 into lists,refs from private.market_copom_listings l left join private.market_copom_meetings m on m.meeting=l.meeting
 where m.meeting is null or not private.market_acquisition_readable_v1(m.reference_acquisition_id);
 perform private.lock_market_read_authority_v1('{}',lists||refs);
 for mt in select l.meeting,bool_or(private.market_acquisition_readable_v1(l.list_acquisition_id)) supported,bool_or(m.meeting is not null) recorded
  from private.market_copom_listings l left join private.market_copom_meetings m on m.meeting=l.meeting
  where m.meeting is null or not private.market_acquisition_readable_v1(m.reference_acquisition_id)
  group by l.meeting order by l.meeting loop
  if mt.recorded then
   if jsonb_array_length(blocked)<50 then blocked:=blocked||jsonb_build_object('meeting',mt.meeting,'reason','communique_unavailable');end if;continue;end if;
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
 return jsonb_build_object('status','fired','list',list_status,'listJobId',list_job,'details',created,'inFlight',inflight,'blocked',blocked);
end $$;

-- 9. The firing at an instant, internal; the worker entry keeps the door as its first statement and passes
-- the instant it starts at.
create function private.fire_market_schedules_at_v1(p_worker uuid,p_account uuid,p_k timestamptz) returns jsonb
language plpgsql security definer set search_path='' as $$
declare d date:=private.market_sao_paulo_date_v1(p_k);hm text:=to_char(p_k at time zone 'America/Sao_Paulo','HH24:MI');sc private.market_acquisition_schedules;
 blocker text;acc jsonb:='[]';r jsonb;begin
 for sc in select * from private.market_acquisition_schedules where revoked_at is null order by kind loop
  if not pg_try_advisory_xact_lock(hashtextextended('market-schedule:'||sc.kind,0)) then
   acc:=acc||jsonb_build_object('kind',sc.kind,'status','busy');continue;end if;
  if not exists(select 1 from private.market_acquisition_schedules where id=sc.id and revoked_at is null) then
   acc:=acc||jsonb_build_object('kind',sc.kind,'status','revoked');continue;end if;
  if hm<sc.local_time or (sc.business_days_only and private.market_next_business_day_v1(d-1)<>d) then
   acc:=acc||jsonb_build_object('kind',sc.kind,'status','not_due');continue;end if;
  blocker:=private.market_schedule_blocker_v1(sc,p_worker,d);
  if blocker is not null then acc:=acc||jsonb_build_object('kind',sc.kind,'status','blocked','reason',blocker);continue;end if;
  if not pg_try_advisory_xact_lock(hashtextextended('market-source:'||sc.source_id,0)) then
   acc:=acc||jsonb_build_object('kind',sc.kind,'status','busy');continue;end if;
  blocker:=private.market_schedule_blocker_v1(sc,p_worker,d);
  if blocker is not null then acc:=acc||jsonb_build_object('kind',sc.kind,'status','blocked','reason',blocker);continue;end if;
  if sc.kind='series_432' then r:=private.fire_market_series_schedule_v1(sc,p_worker,p_account,p_k);
  else r:=private.fire_market_communique_schedule_v1(sc,p_worker,p_account,p_k);end if;
  acc:=acc||(jsonb_build_object('kind',sc.kind)||r);
 end loop;
 return jsonb_build_object('schedules',acc);
end $$;

create or replace function private.worker_fire_market_schedules_v1(p_worker_token text) returns jsonb
language plpgsql security definer set search_path='' set lock_timeout='5s' as $$
declare worker uuid;begin
 perform private.market_require_read_committed_v1();
 worker:=private.market_worker_identity_v1(p_worker_token);
 return private.fire_market_schedules_at_v1(worker,auth.uid(),clock_timestamp());
end $$;

do $$declare f record;begin
 for f in select p.oid::regprocedure::text signature from pg_proc p where p.pronamespace='private'::regnamespace and p.proname in (
  'guard_market_schedule_occurrence_v1','market_series_window_v1','market_series_quality_class_v1','fire_market_schedules_at_v1')
 loop
  execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);
 end loop;
end $$;
