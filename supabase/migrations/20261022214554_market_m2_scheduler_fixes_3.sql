-- Market reference M2 part 2 (ADR 0023): fixes after the second independent review of the scheduler.
-- The quality decision of the last version is its last approval or quarantine, whatever happened to the
-- version later: a quarantine that was revoked keeps blocking as the quarantine it was, and only an approved
-- version that lost its readability is recovered through the communiqués of its closure. An occurrence is
-- bound to the job whose command derives from its schedule and key, and its request stays inside what the
-- schedule granted.

create or replace function private.guard_market_schedule_occurrence_v1() returns trigger
language plpgsql security definer set search_path='' as $$
declare sc private.market_acquisition_schedules;j private.market_acquisition_jobs;c private.market_endpoint_contracts;begin
 select * into sc from private.market_acquisition_schedules where id=new.schedule_id;
 select * into j from private.market_acquisition_jobs where id=new.job_id;
 select * into c from private.market_endpoint_contracts where id=new.contract_id;
 if sc.id is null or j.id is null or c.id is null or not (new.contract_id=any(sc.contracts)) or c.source_id<>sc.source_id
 or j.contract_id is distinct from new.contract_id or j.request is distinct from new.request or j.source_id<>sc.source_id or j.requested_by<>sc.granted_by
 or j.command_id is distinct from extensions.uuid_generate_v5('6f0d1c7a-2b4e-5d3f-8a91-4c2e7b5d9e10','market-schedule:'||new.schedule_id::text||':'||new.occurrence_key)
 or new.request_sha256 is distinct from encode(extensions.digest(convert_to(new.request::text,'UTF8'),'sha256'),'hex')
 or new.window_start is distinct from (case when c.kind='sgs_daily_json' then (new.request#>>'{window,start}')::date end)
 or new.meeting is distinct from (case when c.kind='copom_communique_detail' then (new.request->>'meeting')::int end)
 or (c.kind='sgs_daily_json' and new.window_start<(sc.params->>'coverageStart')::date)
 or (c.kind='copom_communique_list' and (new.request->>'size')::int is distinct from (sc.params->>'size')::int)
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

create or replace function private.fire_market_series_schedule_v1(sc private.market_acquisition_schedules,p_worker uuid,p_account uuid,p_k timestamptz) returns jsonb
language plpgsql security definer set search_path='' as $$
declare d date:=private.market_sao_paulo_date_v1(p_k);cand record;comm_acq uuid[];g date;sel_versions uuid[];sel_acqs uuid[];hom date;wstart date;wend date;
 anchor private.market_copom_meetings;unavail integer;lastocc private.market_schedule_occurrences;j private.market_acquisition_jobs;ver uuid;
 qq private.market_events;ev private.market_version_evaluations;cls text;periods text[];auto_count integer;manual_at timestamptz;job uuid;
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
   -- The quality decision is the last approval or quarantine, in the version's canonical order; a later
   -- revocation or purge does not erase it.
   select * into qq from private.market_events e where e.subject_kind='version' and e.subject_id=ver::text and e.event in ('approved','quarantined')
   order by e.version_ordinal desc limit 1;
   if qq.event is null then
    return jsonb_build_object('status','blocked','reason','series_quality_unclassified','windowStart',wstart);
   elsif qq.event='quarantined' then
    select * into ev from private.market_version_evaluations where version_id=ver and event_sequence=qq.sequence;
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
   elsif private.market_version_readable_v1(ver,'consume') then
    return jsonb_build_object('status','blocked','reason','no_progress','windowStart',wstart);
   else
    -- An approved version that lost its readability: a communiqué of its closure that cannot be read is not
    -- replaced in M2; a revoked series alone is recovered.
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
