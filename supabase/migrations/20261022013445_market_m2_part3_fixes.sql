-- M2 part 3, fixes from the independent review of the implementation: one lock order for the outbox
-- (consumer before row) and for authority (acquisition and source anchors before version states, with
-- revocation writers held to the same order); the governed change of a consumer's filter; relink and
-- version creation over one materialized evidence set; publication over the chain tip of the series
-- across its normalizations, refusing any change without its communiqué, with contract and policy
-- snapshots in the edition.

-- 1. Outbox: the consumer fence before the row, the order disabling uses.
create or replace function private.market_event_for_lease_v1(p_consumer text,p_sequence bigint,p_capability text,p_lease uuid) returns private.market_event_outbox
language plpgsql security definer set search_path='' as $$
declare r private.market_event_outbox;begin
 perform 1 from auth.users where id=auth.uid() and deleted_at is null and (banned_until is null or banned_until<=clock_timestamp()) for share;
 if not found then raise exception 'market_event_lease_denied' using errcode='42501';end if;
 perform 1 from private.market_event_consumers c where c.id=p_consumer and c.state='enabled' for share;
 if not found then raise exception 'market_event_delegation_required' using errcode='42501';end if;
 select * into r from private.market_event_outbox where consumer_id=p_consumer and event_sequence=p_sequence for update;
 if not found or r.status<>'leased' or r.lease_id is distinct from p_lease or p_capability is null or length(p_capability)<32
 or r.capability_sha256 is distinct from extensions.digest(p_capability,'sha256') or r.leased_account_user_id is distinct from auth.uid()
 then raise exception 'market_event_lease_denied' using errcode='42501';end if;
 perform 1 from private.worker_tokens where id=r.leased_by and execution_account_user_id=auth.uid() and status='active' and revoked_at is null for share;
 if not found then raise exception 'market_event_lease_denied' using errcode='42501';end if;
 if not private.market_event_delegation_live_v1(r.leased_by,p_consumer) then raise exception 'market_event_delegation_required' using errcode='42501';end if;
 if r.lease_expires_at<=clock_timestamp() then raise exception 'market_event_lease_denied' using errcode='42501';end if;
 return r;
end $$;

-- 2. The governed change of a consumer's filter: founder, receipt by command, under the exclusive
-- consumers lock, so every event that commits after it is filtered by the new set.
alter table private.market_event_consumer_commands drop constraint market_event_consumer_commands_action_check;
alter table private.market_event_consumer_commands add constraint market_event_consumer_commands_action_check check(action in ('register','disable','update_filter'));

create or replace function private.guard_market_event_consumer_v1() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_op='UPDATE' and old.state='enabled' and new.state='disabled'
 and (to_jsonb(new)-array['state','disabled_by','disabled_at']) is not distinct from (to_jsonb(old)-array['state','disabled_by','disabled_at']) then return new;end if;
 if tg_op='UPDATE' and old.state='enabled' and new.state='enabled' and current_setting('offroad.market_consumer_filter_change',true)='on'
 and (to_jsonb(new)-array['events','subject_kinds','reason']) is not distinct from (to_jsonb(old)-array['events','subject_kinds','reason']) then return new;end if;
 raise exception 'market_event_consumer_immutable' using errcode='23514';
end $$;

create function private.update_market_event_consumer_filter_v1(p_command uuid,p_consumer text,p_events text[],p_subject_kinds text[],p_reason text,p_actor_user_id uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare prior private.market_event_consumer_commands;fp text;begin
 perform private.require_platform_principal_v1(p_actor_user_id,true);
 perform private.market_require_read_committed_v1();
 if p_command is null or p_consumer is null or p_events is null or p_subject_kinds is null or p_reason is null or length(btrim(p_reason))<5
 then raise exception 'market_event_consumer_invalid' using errcode='22023';end if;
 fp:=encode(extensions.digest(convert_to(concat_ws(E'\n','update_filter',p_consumer,array_to_string(array(select x from unnest(p_events) x order by x),','),
  array_to_string(array(select x from unnest(p_subject_kinds) x order by x),','),btrim(p_reason),p_actor_user_id::text),'UTF8'),'sha256'),'hex');
 perform pg_advisory_xact_lock(hashtextextended('platform-command:'||p_command::text,0));
 select * into prior from private.market_event_consumer_commands where command_id=p_command;
 if found then
  if prior.fingerprint<>fp then raise exception 'platform_method_request_reused' using errcode='22023';end if;
  return jsonb_build_object('consumerId',prior.consumer_id,'replayed',true);
 end if;
 perform pg_advisory_xact_lock(hashtextextended('market-event-consumers',0));
 perform set_config('offroad.market_consumer_filter_change','on',true);
 update private.market_event_consumers set events=array(select distinct x from unnest(p_events) x order by x),
  subject_kinds=array(select distinct x from unnest(p_subject_kinds) x order by x),reason=btrim(p_reason) where id=p_consumer and state='enabled';
 if not found then raise exception 'market_event_consumer_not_enabled' using errcode='22023';end if;
 perform set_config('offroad.market_consumer_filter_change','off',true);
 insert into private.market_event_consumer_commands(command_id,consumer_id,action,actor_user_id,fingerprint) values(p_command,p_consumer,'update_filter',p_actor_user_id,fp);
 return jsonb_build_object('consumerId',p_consumer,'replayed',false);
end $$;

-- 3. Authority order. Readers take the acquisition and source anchors first, then the version states.
-- A transaction that revokes or purges an acquisition or a source does it before touching any version,
-- so writers keep the same order and no cycle forms.
create or replace function private.anchor_market_authority_v1() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.subject_kind in ('acquisition','source') and new.event in ('revoked','purged') then
  if exists(select 1 from private.market_events e where e.transaction_id=txid_current() and e.subject_kind='version')
  then raise exception 'market_authority_order' using errcode='55000';end if;
  perform pg_advisory_xact_lock(hashtextextended('market-authority:'||new.subject_kind||':'||new.subject_id,0));
 end if;
 return new;
end $$;

create or replace function private.lock_market_read_authority_v1(p_versions uuid[],p_acquisitions uuid[]) returns void
language plpgsql security definer set search_path='' as $$
declare k text;v uuid;begin
 for k in select distinct key from (
   select 'market-authority:acquisition:'||x::text key from unnest(p_acquisitions) x where x is not null
   union select 'market-authority:source:'||a.source_id from private.market_acquisitions a where a.id=any(p_acquisitions)) z order by 1 loop
  perform pg_advisory_xact_lock_shared(hashtextextended(k,0));
 end loop;
 for v in select distinct x from unnest(p_versions) x where x is not null order by 1 loop
  perform private.lock_market_version_state_v1(v,false);
 end loop;
end $$;

-- 4. Version creation over evidence chosen by its caller when given; the evidence is the one set that is
-- locked, validated, linked and written into the canonical text.
drop function private.create_market_selic_version_v1(uuid,text,uuid,jsonb,date,date,date,uuid,uuid);
create function private.create_market_selic_version_v1(p_acquisition uuid,p_normalization text,p_supersedes uuid,p_observations jsonb,
 p_data_base date,p_window_start date,p_window_end date,p_job uuid,p_actor uuid,p_evidence jsonb default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a private.market_acquisitions;n private.market_normalizations;s private.market_source_revisions;vid uuid:=gen_random_uuid();input jsonb;sha text;
 evidence jsonb;evidence_at timestamptz;q jsonb;begin
 select * into a from private.market_acquisitions where id=p_acquisition;
 select * into n from private.market_normalizations where id=p_normalization;
 select * into s from private.market_source_revisions where source_id=a.source_id and revision=a.source_revision;
 insert into private.market_logical_objects(logical_id,source_id,family,kind,category,keys)
 values(n.logical_id,a.source_id,n.family,'series','observed',n.logical_keys) on conflict (logical_id) do nothing;
 evidence:=coalesce(p_evidence,private.market_evidence_set_v1(p_window_start,p_window_end,p_data_base));
 select greatest(a.acquired_at,coalesce(max((e->>'referenceAcquiredAt')::timestamptz),a.acquired_at)) into evidence_at from jsonb_array_elements(evidence) e;
 input:=jsonb_build_object('sourceRevisionId',s.command_id::text,'seriesContract',jsonb_build_object('id',n.id,'sha256',n.normalization_sha256),'parser',n.parser,
  'qualityPolicy',jsonb_build_object('id',n.quality_policy_id,'version',n.quality_policy_version),'availabilityBasis','observed_at_acquisition',
  'acquisitionIds',jsonb_build_array(a.id::text),'supersedes',p_supersedes::text,
  'links',coalesce((select jsonb_agg(jsonb_build_object('meeting',(e->>'meeting')::int,'referenceDate',e->>'referenceDate','decision',e->>'decision',
    'targetPct',e->>'targetPct','recordSha256',e->>'recordSha256','acquisitionId',e->>'acquisitionId')) from jsonb_array_elements(evidence) e),'[]'),
  'observations',coalesce((select jsonb_agg(jsonb_build_object('periodStart',null,'periodEnd',x->>'period','availableAt',private.market_instant_text_v1(a.acquired_at),
    'acquiredAt',private.market_instant_text_v1(a.acquired_at),'value',x->>'value','unit',n.unit,'scale',n.scale)) from jsonb_array_elements(p_observations) x),'[]'));
 sha:=encode(extensions.digest(convert_to(private.market_canonical_v2_text_v1(input),'UTF8'),'sha256'),'hex');
 insert into private.market_versions(id,logical_id,parser_version,methodology,sha256,license,supersedes,canonical_version,normalization_id,acquisition_id,data_base,window_start,window_end,evidence_available_at)
 values(vid,n.logical_id,n.parser,null,sha,s.license,p_supersedes,'v2',n.id,a.id,p_data_base,p_window_start,p_window_end,evidence_at);
 insert into private.market_version_inputs(version_id,acquisition_id) values(vid,a.id);
 insert into private.market_observations(version_id,period_start,period_end,available_at,acquired_at,value,unit,scale)
 select vid,null,(x->>'period')::date,a.acquired_at,a.acquired_at,(x->>'value')::numeric,n.unit,n.scale from jsonb_array_elements(p_observations) x;
 insert into private.market_version_evidence(version_id,meeting,acquisition_id,record_sha256)
 select vid,(e->>'meeting')::int,(e->>'acquisitionId')::uuid,e->>'recordSha256' from jsonb_array_elements(evidence) e;
 perform private.seal_market_version_v1(vid);
 q:=private.record_market_evaluation_v1(vid,p_data_base,p_job,p_actor);
 return jsonb_build_object('versionId',vid,'quality',q);
end $$;

-- The evidence set for a window and a data-base, in the shape version creation consumes.
create function private.market_evidence_set_v1(p_start date,p_end date,p_data_base date) returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('meeting',x.meeting,'acquisitionId',x.acquisition_id,'recordSha256',x.record_sha256,
  'referenceDate',to_char(m.reference_date,'YYYY-MM-DD'),'decision',m.decision,'targetPct',m.target_pct,'referenceAcquiredAt',x.reference_acquired_at) order by x.meeting),'[]')
 from private.market_select_evidence_v1(p_start,p_end,p_data_base) x join private.market_copom_meetings m on m.meeting=x.meeting;
$$;

-- 5. Relink: the evidence is materialized once; that exact set is locked, validated, compared and written.
create or replace function private.relink_market_version_v1(p_command uuid,p_version uuid,p_actor_user_id uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare prior private.market_relink_commands;v private.market_versions;today date;obs jsonb;same boolean;created jsonb;result jsonb;
 versions uuid[];acquisitions uuid[];src text;evidence jsonb;begin
 perform private.require_platform_principal_v1(p_actor_user_id);
 if p_command is null or p_version is null then raise exception 'market_relink_invalid' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('platform-command:'||p_command::text,0));
 select * into prior from private.market_relink_commands where command_id=p_command;
 if found then
  if prior.version_id<>p_version or prior.actor_user_id<>p_actor_user_id then raise exception 'platform_method_request_reused' using errcode='22023';end if;
  return prior.result||jsonb_build_object('replayed',true);
 end if;
 perform private.market_require_read_committed_v1();
 select * into v from private.market_versions where id=p_version;
 if not found or v.canonical_version<>'v2' then raise exception 'market_relink_invalid' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('market-chain:'||v.acquisition_id::text,0));
 if exists(select 1 from private.market_versions x where x.supersedes=v.id) then raise exception 'market_relink_not_tip' using errcode='55000';end if;
 today:=private.market_sao_paulo_date_v1(clock_timestamp());
 evidence:=private.market_evidence_set_v1(v.window_start,v.window_end,today);
 select array_agg(distinct c.version_id),array_agg(distinct c.acquisition_id) filter (where c.acquisition_id is not null)
 into versions,acquisitions from private.market_version_closure_v1(v.id) c;
 acquisitions:=coalesce(acquisitions,'{}')||coalesce((select array_agg((e->>'acquisitionId')::uuid) from jsonb_array_elements(evidence) e),'{}');
 for src in select distinct a.source_id from private.market_acquisitions a where a.id=any(acquisitions) order by 1 loop
  perform pg_advisory_xact_lock_shared(hashtextextended('market-source:'||src,0));
 end loop;
 perform private.lock_market_read_authority_v1(versions,acquisitions);
 if private.lock_market_version_state_v1(v.id,false)<>'sealed' then raise exception 'market_relink_invalid' using errcode='22023';end if;
 if not private.market_version_readable_v1(v.id,'reprocess')
 or exists(select 1 from unnest(acquisitions) x where not private.market_acquisition_readable_v1(x))
 then raise exception 'market_version_not_readable' using errcode='42501';end if;
 select not exists(
  (select (e->>'meeting')::int,(e->>'acquisitionId')::uuid from jsonb_array_elements(evidence) e)
  except (select meeting,acquisition_id from private.market_version_evidence where version_id=v.id))
 and not exists(
  (select meeting,acquisition_id from private.market_version_evidence where version_id=v.id)
  except (select (e->>'meeting')::int,(e->>'acquisitionId')::uuid from jsonb_array_elements(evidence) e)) into same;
 if same then
  result:=jsonb_build_object('relinked',false,'replayed',false,'versionId',v.id);
 else
  select coalesce(jsonb_agg(jsonb_build_object('period',to_char(period_end,'YYYY-MM-DD'),'value',value::text) order by period_end),'[]') into obs
  from private.market_observations where version_id=v.id;
  created:=private.create_market_selic_version_v1(v.acquisition_id,v.normalization_id,v.id,obs,today,v.window_start,v.window_end,null,p_actor_user_id,evidence);
  result:=jsonb_build_object('relinked',true,'replayed',false,'versionId',created->'versionId','supersedes',v.id,'quality',created->'quality');
 end if;
 insert into private.market_relink_commands(command_id,version_id,actor_user_id,result) values(p_command,p_version,p_actor_user_id,result);
 return result;
end $$;

-- 6. Publication over the chain tip of the series (any normalization of its endpoint and object),
-- refusing a manifest with a change that has no communiqué, and carrying the contract and quality
-- policy as data with their digests.
create function private.market_quality_policy_text_v1(p_id text,p_version text) returns text
language sql immutable set search_path='' as $$
 select case when p_id='bcb-sgs-432-quality' and p_version='v2' then concat_ws(E'\n','market-quality-policy.v1','id:bcb-sgs-432-quality','version:v2',
  'calendar:every civil day from the window start to the earlier of the window end and the data-base',
  'anchor:the first period equals the target of the latest meeting whose series change is on or before the window start',
  'change:a value that differs from the previous day needs a meeting whose series change is that day, in the same direction and at the same rate',
  'hold:an unchanged value on the series change day of a meeting needs a hold decision',
  'range:no value above 100 and no period before the homologated start',
  'availability:only observations and meetings acquired before the limit of the data-base',
  'result:approved without findings, quarantined with any finding, insufficient without observations')
 end;
$$;

create or replace function private.publish_market_odbl_release_v1(p_command uuid,p_code_commit text,p_actor_user_id uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare prior private.market_odbl_releases;prev private.market_odbl_releases;fp text;d date;k timestamptz;lim timestamptz;nz private.market_normalizations;
 ec private.market_endpoint_contracts;src private.market_source_revisions;cand uuid[];versions uuid[];acquisitions uuid[];
 obs jsonb;changes jsonb;alter_ jsonb;payload jsonb;txt text;rid uuid:=gen_random_uuid();num integer;contract_text text;policy_text text;begin
 perform private.require_platform_principal_v1(p_actor_user_id,true);
 if p_command is null or p_code_commit is null or p_code_commit !~ '^[a-f0-9]{40}$' then raise exception 'market_odbl_invalid' using errcode='22023';end if;
 fp:=encode(extensions.digest(convert_to(concat_ws(E'\n','publish',p_code_commit,p_actor_user_id::text),'UTF8'),'sha256'),'hex');
 perform pg_advisory_xact_lock(hashtextextended('platform-command:'||p_command::text,0));
 select * into prior from private.market_odbl_releases where command_id=p_command;
 if found then
  if prior.request_sha256<>fp then raise exception 'platform_method_request_reused' using errcode='22023';end if;
  return jsonb_build_object('releaseNumber',prior.release_number,'sha256',prior.payload_sha256,'replayed',true);
 end if;
 perform private.market_require_read_committed_v1();
 perform pg_advisory_xact_lock(hashtextextended('market-odbl-publication',0));
 -- The newest normalization of the series names the object; versions of every normalization of the same
 -- endpoint and object form the chains.
 select * into strict nz from private.market_normalizations where endpoint_contract_id='bcb-sgs-432-endpoint' order by ordinal desc limit 1;
 select * into strict ec from private.market_endpoint_contracts where id=nz.endpoint_contract_id;
 perform pg_advisory_xact_lock_shared(hashtextextended('market-source:'||ec.source_id,0));
 src:=private.market_source_in_force_v1(ec.source_id);
 if src.source_id is null or not private.market_license_retains_v1(src.license) then raise exception 'market_odbl_source_not_publishable' using errcode='42501';end if;
 k:=clock_timestamp();d:=private.market_sao_paulo_date_v1(k);lim:=private.market_data_base_limit_v1(d);
 -- Per chain, the latest version recorded by K whose evidence was available for D; readability after.
 select array_agg(id) into cand from (select distinct on (v.acquisition_id) v.id from private.market_versions v
  join private.market_normalizations vn on vn.id=v.normalization_id
  where v.canonical_version='v2' and v.logical_id=nz.logical_id and vn.endpoint_contract_id=ec.id and v.recorded_at<=k and v.evidence_available_at<lim
  order by v.acquisition_id,v.recorded_at desc,v.id desc) z;
 select array_agg(distinct c.version_id),array_agg(distinct c.acquisition_id) filter (where c.acquisition_id is not null)
 into versions,acquisitions from unnest(coalesce(cand,'{}')) u(id) cross join lateral private.market_version_closure_v1(u.id) c;
 perform private.lock_market_read_authority_v1(coalesce(versions,'{}'),coalesce(acquisitions,'{}'));
 create temporary table if not exists market_odbl_pick(period date,value numeric,version_id uuid,acquisition_id uuid,acquired_at timestamptz,normalization_id text) on commit drop;
 truncate market_odbl_pick;
 insert into market_odbl_pick
 select distinct on (o.period_end) o.period_end,o.value,v.id,v.acquisition_id,a.acquired_at,v.normalization_id
 from unnest(coalesce(cand,'{}')) u(id) join private.market_versions v on v.id=u.id join private.market_acquisitions a on a.id=v.acquisition_id
 join private.market_observations o on o.version_id=v.id
 where private.market_version_readable_v1(v.id,'consume') and o.period_end>=ec.homologated_from and o.period_end<=d and o.acquired_at<lim
 order by o.period_end,a.acquired_at desc,v.id::text collate "C" desc;
 if not exists(select 1 from market_odbl_pick) then raise exception 'market_odbl_nothing_to_publish' using errcode='55000';end if;
 select coalesce(jsonb_agg(jsonb_build_object('period',to_char(p.period,'YYYY-MM-DD'),'value',private.market_trim_decimal_v1(p.value::text),
  'versionId',p.version_id::text,'acquisitionId',p.acquisition_id::text,'normalization',p.normalization_id) order by p.period),'[]') into obs from market_odbl_pick p;
 -- Every change of the assembled manifest carries the communiqué of its meeting, in the direction and at
 -- the rate of the change; one without it makes the edition refuse.
 select coalesce(jsonb_agg(jsonb_build_object('period',to_char(p.period,'YYYY-MM-DD'),'from',private.market_trim_decimal_v1(q.value::text),
  'to',private.market_trim_decimal_v1(p.value::text),'meeting',m.meeting::text,'referenceDate',to_char(m.reference_date,'YYYY-MM-DD'),'decision',m.decision,
  'targetPct',private.market_trim_decimal_v1(m.target_pct),'recordSha256',m.record_sha256) order by p.period),'[]') into changes
 from market_odbl_pick p join market_odbl_pick q on q.period=p.period-1
 left join private.market_copom_meetings m on m.series_change_date=p.period
 where p.value<>q.value;
 if exists(select 1 from jsonb_array_elements(changes) c where c->>'meeting' is null
  or (c->>'decision')<>(case when (c->>'to')::numeric>(c->>'from')::numeric then 'raise' else 'cut' end)
  or (c->>'targetPct')::numeric<>(c->>'to')::numeric
  or not exists(select 1 from market_odbl_pick p join private.market_version_evidence e on e.version_id=p.version_id
    where p.period=(c->>'period')::date and e.meeting=(c->>'meeting')::int))
 then raise exception 'market_odbl_change_without_communique' using errcode='55000';end if;
 contract_text:=concat_ws(E'\n','market-series-contract.v1','id:'||nz.id,'host:'||ec.host,'path:'||ec.path,'unit:'||nz.unit,'scale:'||nz.scale,
  'convention:'||nz.convention,'parser:'||nz.parser,'license:'||ec.license_evidence,'homologated-from:'||to_char(ec.homologated_from,'YYYY-MM-DD'),
  'max-window-years:'||ec.max_window_years,'calendar:'||nz.calendar);
 if encode(extensions.digest(convert_to(contract_text,'UTF8'),'sha256'),'hex')<>nz.normalization_sha256 then raise exception 'market_odbl_contract_drift' using errcode='55000';end if;
 policy_text:=private.market_quality_policy_text_v1(nz.quality_policy_id,nz.quality_policy_version);
 if policy_text is null then raise exception 'market_odbl_policy_unknown' using errcode='55000';end if;
 select * into prev from private.market_odbl_releases order by release_number desc limit 1;
 num:=coalesce(prev.release_number,0)+1;
 if prev.id is null then
  alter_:=jsonb_build_object('previous',null);
 else
  with ol as (select x->>'period' period,x->>'value' value,x->>'versionId' version_id,x->>'acquisitionId' acquisition_id
    from jsonb_array_elements(prev.payload_text::jsonb->'observations') x),
   nw as (select x->>'period' period,x->>'value' value,x->>'versionId' version_id,x->>'acquisitionId' acquisition_id from jsonb_array_elements(obs) x)
  select jsonb_build_object('previous',jsonb_build_object('release',prev.release_number::text,'sha256',prev.payload_sha256),
   'added',coalesce((select jsonb_agg(n.period order by n.period) from nw n where not exists(select 1 from ol o where o.period=n.period)),'[]'),
   'removed',coalesce((select jsonb_agg(o.period order by o.period) from ol o where not exists(select 1 from nw n where n.period=o.period)),'[]'),
   'corrected',coalesce((select jsonb_agg(jsonb_build_object('period',n.period,'from',o.value,'to',n.value) order by n.period) from nw n join ol o on o.period=n.period
     where o.value<>n.value),'[]'),
   'provenanceChanged',coalesce((select jsonb_agg(n.period order by n.period) from nw n join ol o on o.period=n.period
     where o.value=n.value and (o.version_id<>n.version_id or o.acquisition_id<>n.acquisition_id)),'[]'),
   'rulesChanged',to_jsonb((prev.payload_text::jsonb#>>'{series,contractSha256}') is distinct from nz.normalization_sha256
     or (prev.payload_text::jsonb#>>'{series,qualityPolicy,sha256}') is distinct from encode(extensions.digest(convert_to(policy_text,'UTF8'),'sha256'),'hex')
     or (prev.payload_text::jsonb#>>'{rules,codeCommit}') is distinct from p_code_commit))
  into alter_;
 end if;
 payload:=jsonb_build_object(
  'format','offroad.market-odbl.v1',
  'database','Offroad: base derivada da meta Selic (série SGS 432) com vínculos aos comunicados do Copom',
  'release',num::text,
  'publishedAt',private.market_instant_text_v1(k),
  'license',jsonb_build_object('name','Open Database License (ODbL) v1.0','uri','https://opendatacommons.org/licenses/odbl/1-0/',
   'appliesTo','Esta base derivada, inteira. Qualquer uso público exige atribuição; uma base derivada desta que seja usada publicamente deve ser oferecida sob a ODbL.'),
  'source',jsonb_build_object('name','Banco Central do Brasil: Sistema Gerenciador de Séries Temporais, série 432 (meta Selic), e comunicados do Copom',
   'attribution',coalesce(src.license->>'attribution','Banco Central do Brasil'),'sourceLicense',coalesce(src.license->>'license',''),
   'evidenceIds',coalesce(src.license->'evidenceIds','[]'),'sourceRevision',src.revision::text),
  'attribution','Contém dados do Banco Central do Brasil (série SGS 432 e comunicados do Copom), transformados pela Offroad, disponibilizados sob a Open Database License (ODbL) v1.0.',
  'reading',jsonb_build_object('dataBase',to_char(d,'YYYY-MM-DD'),'knowledgeAt',private.market_instant_text_v1(k),
   'window',jsonb_build_object('start',to_char(ec.homologated_from,'YYYY-MM-DD'),'end',to_char(d,'YYYY-MM-DD'))),
  'series',jsonb_build_object('logicalId',nz.logical_id,'normalization',nz.id,'contractSha256',nz.normalization_sha256,'contractText',contract_text,
   'endpointContract',ec.id,'endpointContractSha256',ec.contract_sha256,'unit',nz.unit,'scale',nz.scale,'convention',nz.convention,'calendar',nz.calendar,'parser',nz.parser,
   'qualityPolicy',jsonb_build_object('id',nz.quality_policy_id,'version',nz.quality_policy_version,'text',policy_text,
    'sha256',encode(extensions.digest(convert_to(policy_text,'UTF8'),'sha256'),'hex'))),
  'rules',jsonb_build_object('codeCommit',p_code_commit,
   'parserAndRules','https://github.com/carlosevg100/offroad/tree/'||p_code_commit||'/packages/market-reference/src',
   'vectors','https://github.com/carlosevg100/offroad/tree/'||p_code_commit||'/packages/market-reference/vectors',
   'database','https://github.com/carlosevg100/offroad/tree/'||p_code_commit||'/supabase/migrations',
   'contracts','https://github.com/carlosevg100/offroad/blob/'||p_code_commit||'/docs/build/market-reference/M2-CONTRATOS.md'),
  'observations',obs,
  'changes',changes,
  'alterations',alter_);
 txt:=private.market_odbl_canonical_v1(payload)||chr(10);
 if octet_length(convert_to(txt,'UTF8'))>2097152 then raise exception 'market_odbl_too_large' using errcode='54000';end if;
 insert into private.market_odbl_releases(id,release_number,command_id,request_sha256,previous_release_id,data_base,knowledge_at,window_start,code_commit,
  payload_text,payload_sha256,byte_size,published_by)
 values(rid,num,p_command,fp,prev.id,d,k,ec.homologated_from,p_code_commit,txt,encode(extensions.digest(convert_to(txt,'UTF8'),'sha256'),'hex'),
  octet_length(convert_to(txt,'UTF8')),p_actor_user_id);
 insert into private.market_odbl_release_dependencies(release_id,version_id,acquisition_id)
 select distinct rid,p.version_id,p.acquisition_id from market_odbl_pick p;
 return jsonb_build_object('releaseNumber',num,'sha256',encode(extensions.digest(convert_to(txt,'UTF8'),'sha256'),'hex'),'replayed',false);
end $$;

do $$declare f record;begin
 for f in select p.oid::regprocedure::text signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='private' and p.proname in ('market_event_for_lease_v1','guard_market_event_consumer_v1','update_market_event_consumer_filter_v1',
  'anchor_market_authority_v1','lock_market_read_authority_v1','create_market_selic_version_v1','market_evidence_set_v1','relink_market_version_v1',
  'market_quality_policy_text_v1','publish_market_odbl_release_v1')
 loop
  execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);
 end loop;
end $$;
