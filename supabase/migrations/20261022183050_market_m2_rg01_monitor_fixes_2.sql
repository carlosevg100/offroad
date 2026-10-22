-- Market reference M2, part 6, fix 2 (independent review of the implementation, round 1). Freshness and the
-- negative result follow decision 5 and section 5 literally (a missing calendar or an empty selection does not
-- decide them); the snapshot keeps the selection's entries and the full dependency closure, and reads the
-- communiqués available before the data-base limit; an evaluation re-reads its declaration under the regime
-- lock; the monitor's event entry checks its handler and the original effect on replay; the operator read
-- shows the incident's support, the series values of each witness and the next deadline.
create or replace function private.market_evaluate_rg01_v1(s jsonb) returns jsonb
language plpgsql immutable set search_path='' as $$
declare d text:=s->>'dataBase';cyc jsonb:=s#>'{declaration,cycle}';last_dec text;m jsonb;c jsonb;st text;p numeric;n numeric;t numeric;ok boolean;
 mrows jsonb:='[]';r jsonb;gaps text[]:='{}';wit text[]:='{}';contra text[]:='{}';missing int[];result text;fresh text;entries int:=(s->>'selectionEntries')::int;
 total numeric:=0;step numeric;first_row jsonb;last_row jsonb;dd text;lines text[];txt text;has_base_issue boolean;begin
 select max(x) into last_dec from jsonb_array_elements_text(cyc->'decisions') x;
 select coalesce(array_agg(y::int order by y::int),'{}') into missing from jsonb_array_elements_text(s->'calendarYearsRequired') y
  where not (s->'calendarYearsPresent') @> jsonb_build_array(y::int);
 for m in select x from jsonb_array_elements(s->'meetings') x order by x->>'endDate' collate "C" loop
  c:=case when jsonb_typeof(m->'communique')='object' then m->'communique' end;
  if c is not null and (c->>'disputed')::boolean then st:='disputed';
  elsif c is not null and not (c->>'readable')::boolean then st:='unavailable';
  elsif c is null then st:='missing';
  elsif jsonb_typeof(m->'previous') is distinct from 'string' or jsonb_typeof(m->'change') is distinct from 'string' then st:='awaiting_series';
  else
   p:=(m->>'previous')::numeric;n:=(m->>'change')::numeric;t:=(c->>'targetPct')::numeric;
   ok:=(case c->>'decision' when 'raise' then n>p when 'cut' then n<p else n=p end) and n=t;
   st:=case when ok then 'corroborated' else 'series_disagreement' end;
  end if;
  mrows:=mrows||jsonb_build_array(jsonb_build_object('endDate',m->>'endDate','state',st,
   'deadline',to_char(private.market_freshness_deadline_v1((m->>'endDate')::date),'YYYY-MM-DD'),
   'relevant',(m->>'endDate') collate "C">last_dec collate "C" and (m->>'endDate') collate "C"<=d collate "C",
   'baseline',(cyc->'decisions') ? (m->>'endDate'),'decision',c->>'decision','previous',m->'previous','change',m->'change'));
 end loop;
 gaps:=gaps||(select coalesce(array_agg('calendar_missing:'||y),'{}') from unnest(missing) y);
 for r in select x from jsonb_array_elements(mrows) x where (x->>'relevant')::boolean loop
  if r->>'state'<>'corroborated' then
   gaps:=gaps||((case r->>'state' when 'missing' then 'communique_missing' when 'awaiting_series' then 'series_pending'
    when 'series_disagreement' then 'series_disagreement' when 'unavailable' then 'communique_unavailable' else 'meeting_disputed' end)||':'||(r->>'endDate'));
  end if;
  if r->>'decision'='raise' and r->>'state'='corroborated' then wit:=wit||(r->>'endDate');end if;
 end loop;
 if cardinality(wit)>0 then result:='fired';
 elsif exists(select 1 from jsonb_array_elements(mrows) x where (x->>'relevant')::boolean and x->>'decision'='raise' and x->>'state'='awaiting_series') then result:='pending_confirmation';
 elsif cardinality(missing)=0 and not exists(select 1 from jsonb_array_elements(mrows) x where (x->>'relevant')::boolean and x->>'state'<>'corroborated') then result:='not_fired';
 else result:='incomplete';end if;
 -- Decision 5, in this order: a relevant meeting past its deadline and not corroborated; no observation; current.
 fresh:=case when exists(select 1 from jsonb_array_elements(mrows) x where (x->>'relevant')::boolean
   and (x->>'deadline') collate "C"<d collate "C" and x->>'state'<>'corroborated') then 'stale' when entries=0 then 'absent' else 'current' end;
 -- Baseline.
 for dd in select x from jsonb_array_elements_text(cyc->'decisions') x loop
  select x into r from jsonb_array_elements(mrows) x where x->>'endDate'=dd and (x->>'baseline')::boolean;
  if r is null or r->>'state'<>'corroborated' or r->>'decision' is distinct from 'cut' then contra:=contra||('baseline_meeting:'||dd);end if;
 end loop;
 if jsonb_array_length(cyc->'decisions')<>(cyc->>'cuts')::int then contra:=contra||'baseline_count'::text;end if;
 has_base_issue:=exists(select 1 from unnest(contra) x where x like 'baseline_meeting:%');
 if not has_base_issue then
  select x into first_row from jsonb_array_elements(mrows) x where x->>'endDate'=cyc->'decisions'->>0;
  if (first_row->>'previous')::numeric<>(cyc->>'fromPct')::numeric then contra:=contra||'baseline_from'::text;end if;
  for dd in select x from jsonb_array_elements_text(cyc->'decisions') x loop
   select x into r from jsonb_array_elements(mrows) x where x->>'endDate'=dd;
   step:=((r->>'previous')::numeric-(r->>'change')::numeric)*100;total:=total+step;
   if step<>(cyc->>'stepBps')::numeric then contra:=contra||('baseline_step:'||dd);end if;
  end loop;
  select x into last_row from jsonb_array_elements(mrows) x where x->>'endDate'=cyc->'decisions'->>(jsonb_array_length(cyc->'decisions')-1);
  if (last_row->>'change')::numeric<>(cyc->>'finalPct')::numeric then contra:=contra||'baseline_final'::text;end if;
  if -total<>(cyc->>'cumulativeBps')::numeric then contra:=contra||'baseline_cumulative'::text;end if;
 end if;
 select coalesce(array_agg(x order by x collate "C"),'{}') into gaps from unnest(gaps) x;
 select coalesce(array_agg(x order by x collate "C"),'{}') into contra from unnest(contra) x;
 lines:=array['market-rg01-state.v1','declaration:'||(s#>>'{declaration,id}'),'result:'||result,'freshness:'||fresh,'primary:'||coalesce(wit[1],'')]
  ||(select coalesce(array_agg('witness:'||w order by o),'{}') from unnest(wit) with ordinality u(w,o))
  ||(select coalesce(array_agg('meeting:'||(x->>'endDate')||'|'||(x->>'state') order by o),'{}') from jsonb_array_elements(mrows) with ordinality u(x,o)
     where (x->>'relevant')::boolean or (x->>'baseline')::boolean)
  ||(select coalesce(array_agg('gap:'||g order by g collate "C"),'{}') from unnest(gaps) g)
  ||(select coalesce(array_agg('baseline:'||b order by b collate "C"),'{}') from unnest(contra) b)
  ||array['entries:'||(s->>'entriesSha256')];
 txt:=array_to_string(lines,E'\n');
 return jsonb_build_object('result',result,'freshness',fresh,'primaryWitness',to_jsonb(wit[1]),'witnesses',to_jsonb(wit),
  'meetings',(select coalesce(jsonb_agg(jsonb_build_object('endDate',x->>'endDate','state',x->>'state','deadline',x->>'deadline',
    'relevant',(x->>'relevant')::boolean,'baseline',(x->>'baseline')::boolean) order by o),'[]') from jsonb_array_elements(mrows) with ordinality u(x,o)),
  'gaps',to_jsonb(gaps),'baselineContradictions',to_jsonb(contra),'stateText',txt,
  'stateSha256',encode(extensions.digest(convert_to(txt,'UTF8'),'sha256'),'hex'));
end $$;
create or replace function private.market_rg01_snapshot_v1(p_declaration uuid,p_data_base date,p_knowledge timestamptz) returns jsonb
language sql stable security definer set search_path='' as $$
 with decl as (select * from private.market_regime_declarations where id=p_declaration),
 pj as (select projection_text::jsonb p from decl),
 cyc as (select p->'easingCycle' c from pj),
 dec_dates as (select x::date d from cyc,jsonb_array_elements_text(c->'copomDecisions') x),
 first_dec as (select min(d) d from dec_dates),
 nz as (select * from private.market_normalizations where endpoint_contract_id='bcb-sgs-432-endpoint' order by ordinal desc limit 1),
 ec as (select e.* from private.market_endpoint_contracts e join nz on e.id=nz.endpoint_contract_id),
 sel as (select * from private.market_selic_selection_v1(p_data_base,p_knowledge)),
 years as (select generate_series(extract(year from (select (c->>'startedOn')::date from cyc))::int,extract(year from p_data_base)::int) y),
 cal as (select distinct on (r.year) r.year,r.revision,r.meetings from private.market_copom_calendar_revisions r
  where r.year in (select y from years) and r.recorded_at<=p_knowledge order by r.year,r.revision desc),
 cal_meetings as (select (m->>'secondDay')::date end_date from cal,jsonb_array_elements(cal.meetings) m),
 comm as (select * from private.market_copom_meetings where reference_acquired_at<=p_knowledge and reference_acquired_at<private.market_data_base_limit_v1(p_data_base)),
 ends as (
  select end_date,'ordinary'::text kind from cal_meetings where end_date>=(select d from first_dec) and end_date<=p_data_base
  union select d,'ordinary' from dec_dates where d<=p_data_base
  union select c.reference_date,'extraordinary' from comm c where c.reference_date>=(select d from first_dec) and c.reference_date<=p_data_base
   and c.reference_date not in (select end_date from cal_meetings) and c.reference_date not in (select d from dec_dates)),
 clo as (select c.version_id,c.acquisition_id from (select distinct version_id from sel) s cross join lateral private.market_version_closure_v1(s.version_id) c),
 mt as (select e.end_date,e.kind,c.meeting,c.decision,c.target_pct,c.reference_acquisition_id,c.record_sha256,
   (select s.value from sel s where s.period=e.end_date) prev,(select s.value from sel s where s.period=e.end_date+1) chg
  from ends e left join comm c on c.reference_date=e.end_date)
 select jsonb_build_object(
  'dataBase',to_char(p_data_base,'YYYY-MM-DD'),
  'knowledgeAt',private.market_instant_text_v1(p_knowledge),
  'declaration',(select jsonb_build_object('id',d.id::text,'sha256',d.projection_sha256,'rule',d.rule,'regimeId',d.regime_id,'triggerId',d.trigger_id,
   'cycle',jsonb_build_object('decisions',c->'copomDecisions','fromPct',c->>'fromPct','finalPct',(select p->>'selicTargetPct' from pj),
    'stepBps',(c->>'stepBps')::int,'cuts',(c->>'cuts')::int,'cumulativeBps',(c->>'cumulativeBps')::int)) from decl d,cyc),
  'calendarYearsRequired',(select jsonb_agg(y order by y) from years),
  'calendarYearsPresent',coalesce((select jsonb_agg(year order by year) from cal),'[]'),
  'calendarRevisions',coalesce((select jsonb_agg(jsonb_build_object('year',year,'revision',revision) order by year) from cal),'[]'),
  'rules',jsonb_build_object('evaluator','market-rg01.v1','freshness','market-freshness.v1','holidays',(select calendar from nz)),
  'selectionEntries',(select count(*) from sel),
  'selection',coalesce((select jsonb_agg(jsonb_build_object('period',to_char(s.period,'YYYY-MM-DD'),'value',private.market_trim_decimal_v1(s.value::text),
   'versionId',s.version_id::text,'acquisitionId',s.acquisition_id::text) order by s.period) from sel s),'[]'),
  'entriesSha256',encode(extensions.digest(convert_to(coalesce((select string_agg(to_char(s.period,'YYYY-MM-DD')||'|'||s.version_id::text,E'\n' order by s.period) from sel s),''),'UTF8'),'sha256'),'hex'),
  'lastCoveredPeriod',(select to_char(max(s.period),'YYYY-MM-DD') from sel s),
  'manifestSha256',private.market_manifest_sha256_v1((select logical_id from nz),p_data_base,p_knowledge,(select homologated_from from ec),p_data_base,
   (select array_agg(to_char(s.period,'YYYY-MM-DD')||'|'||s.version_id::text order by s.period) from sel s)),
  'meetings',coalesce((select jsonb_agg(jsonb_build_object('endDate',to_char(m.end_date,'YYYY-MM-DD'),'kind',m.kind,
    'communique',case when m.meeting is null then null else jsonb_build_object('meeting',m.meeting,'decision',m.decision,'targetPct',m.target_pct,
     'readable',private.market_acquisition_readable_v1(m.reference_acquisition_id),
     'disputed',exists(select 1 from private.market_acquisition_jobs j where j.contract_id='bcb-copom-comunicados-detalhe' and j.status='failed'
      and j.last_error->>'code'='meeting_disagreement' and j.request->>'meeting'=m.meeting::text and j.updated_at<=p_knowledge
      and j.updated_at<private.market_data_base_limit_v1(p_data_base)),
     'acquisitionId',m.reference_acquisition_id::text,'recordSha256',m.record_sha256) end,
    'previous',case when m.prev is null then null else private.market_trim_decimal_v1(m.prev::text) end,
    'change',case when m.chg is null then null else private.market_trim_decimal_v1(m.chg::text) end) order by m.end_date) from mt m),'[]'),
  'requests',coalesce((select jsonb_agg(q.key order by q.key collate "C") from private.market_rg01_requests q,decl d
   where q.regime_id=d.regime_id and q.trigger_id=d.trigger_id and q.satisfied_by is null),'[]'),
  'dependencies',jsonb_build_object(
   'versions',coalesce((select jsonb_agg(distinct x) from (select s.version_id::text x from sel s union select c.version_id::text from clo c where c.version_id is not null) z),'[]'),
   'acquisitions',coalesce((select jsonb_agg(distinct x) from (select s.acquisition_id::text x from sel s union select c.acquisition_id::text from clo c where c.acquisition_id is not null
    union select m.reference_acquisition_id::text from mt m where m.reference_acquisition_id is not null) z),'[]')));
$$;
create or replace function private.run_market_rg01_v1(p_declaration uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare dl private.market_regime_declarations;k timestamptz;d date;cand record;comm_acq uuid[];snap jsonb;ev jsonb;eid uuid;prev_ev private.market_regime_evaluations;
 reused boolean;keys text[];w text;inc private.market_regime_incidents;new_witness boolean:=false;cur text;rev integer;support text;begin
 perform private.market_require_read_committed_v1();
 select * into dl from private.market_regime_declarations where id=p_declaration and active;
 if not found then raise exception 'market_regime_declaration_inactive' using errcode='22023';end if;
 if dl.rule<>'market-rg01.v1' then raise exception 'market_regime_rule_unsupported' using errcode='22023';end if;
 if not pg_try_advisory_xact_lock(hashtextextended('market-regime:'||dl.regime_id||':'||dl.trigger_id,0)) then return jsonb_build_object('status','busy');end if;
 -- A declaration superseded between the first read and the lock is not evaluated: the next cycle reads the active one.
 if not exists(select 1 from private.market_regime_declarations where id=dl.id and active) then return jsonb_build_object('status','superseded');end if;
 if not exists(select 1 from private.market_rg01_requests where regime_id=dl.regime_id and trigger_id=dl.trigger_id and satisfied_by is null)
 then return jsonb_build_object('status','idle');end if;
 k:=clock_timestamp();d:=private.market_sao_paulo_date_v1(k);
 select * into cand from private.market_selic_candidates_v1(d,k);
 select coalesce(array_agg(reference_acquisition_id),'{}') into comm_acq from private.market_copom_meetings where reference_acquired_at<=k and reference_acquired_at<private.market_data_base_limit_v1(d);
 perform private.lock_market_read_authority_v1(cand.versions,cand.acquisitions||comm_acq);
 snap:=private.market_rg01_snapshot_v1(dl.id,d,k);
 if exists(select 1 from jsonb_array_elements_text(snap#>'{dependencies,versions}') x where not x::uuid=any(cand.versions))
 or exists(select 1 from jsonb_array_elements_text(snap#>'{dependencies,acquisitions}') x where not x::uuid=any(cand.acquisitions||comm_acq))
 then return jsonb_build_object('status','retry');end if;
 ev:=private.market_evaluate_rg01_v1(snap);
 select coalesce(array_agg(x),'{}') into keys from jsonb_array_elements_text(snap->'requests') x;
 select * into prev_ev from private.market_regime_evaluations where regime_id=dl.regime_id and trigger_id=dl.trigger_id order by created_at desc,id desc limit 1;
 reused:=prev_ev.id is not null and prev_ev.state_sha256=ev->>'stateSha256' and prev_ev.declaration_id=dl.id;
 if reused then eid:=prev_ev.id;
 else
  eid:=gen_random_uuid();
  insert into private.market_regime_evaluations(id,declaration_id,regime_id,trigger_id,data_base,knowledge_at,snapshot,evaluation,audit_sha256,state_sha256,result,freshness)
  values(eid,dl.id,dl.regime_id,dl.trigger_id,d,k,snap,ev,encode(extensions.digest(convert_to(snap::text,'UTF8'),'sha256'),'hex'),ev->>'stateSha256',ev->>'result',ev->>'freshness');
  -- Incident: opened by the first witness; every evaluation registers new witnesses and refreshes the
  -- support of every registered one.
  select * into inc from private.market_regime_incidents where regime_id=dl.regime_id and trigger_id=dl.trigger_id;
  if not found and jsonb_array_length(ev->'witnesses')>0 then
   insert into private.market_regime_incidents(regime_id,trigger_id,opened_by_evaluation,review_due_on,review_state,review_revision)
   values(dl.regime_id,dl.trigger_id,eid,private.market_business_day_after_v1(d,((dl.projection_text::jsonb)->>'reviewDeadlineBusinessDays')::int),'open',0)
   returning * into inc;
  end if;
  if inc.regime_id is not null then
   for w in select x from jsonb_array_elements_text(ev->'witnesses') x loop
    if not exists(select 1 from private.market_regime_witnesses where regime_id=dl.regime_id and trigger_id=dl.trigger_id and meeting_end=w::date) then
     insert into private.market_regime_witnesses(regime_id,trigger_id,meeting_end,first_seen_evaluation) values(dl.regime_id,dl.trigger_id,w::date,eid);
     new_witness:=new_witness or inc.opened_by_evaluation<>eid;
    end if;
   end loop;
   for w,cur,rev in select x.meeting_end::text,(select s.support from private.market_regime_witness_support s where s.regime_id=x.regime_id and s.trigger_id=x.trigger_id
     and s.meeting_end=x.meeting_end order by s.revision desc limit 1),(select coalesce(max(s.revision),0) from private.market_regime_witness_support s
     where s.regime_id=x.regime_id and s.trigger_id=x.trigger_id and s.meeting_end=x.meeting_end)
    from private.market_regime_witnesses x where x.regime_id=dl.regime_id and x.trigger_id=dl.trigger_id order by x.meeting_end loop
    support:=case when (ev->'witnesses') ? w then 'supported' else 'unavailable' end;
    if cur is distinct from support then
     insert into private.market_regime_witness_support(regime_id,trigger_id,meeting_end,revision,evaluation_id,support) values(dl.regime_id,dl.trigger_id,w::date,rev+1,eid,support);
    end if;
   end loop;
   -- A new supported witness after a dismissal reopens the review, with a new deadline.
   if new_witness and inc.review_state='dismissed' then
    update private.market_regime_incidents set review_state='open',review_revision=review_revision+1,
     review_due_on=private.market_business_day_after_v1(d,((dl.projection_text::jsonb)->>'reviewDeadlineBusinessDays')::int)
    where regime_id=dl.regime_id and trigger_id=dl.trigger_id returning * into inc;
    insert into private.market_regime_dispositions(id,regime_id,trigger_id,from_state,to_state,revision_after,reason,evaluation_id)
    values(gen_random_uuid(),dl.regime_id,dl.trigger_id,'dismissed','open',inc.review_revision,'Nova testemunha comprovada depois da dispensa',eid);
   end if;
  end if;
 end if;
 update private.market_rg01_requests set satisfied_by=eid,satisfied_at=clock_timestamp()
 where regime_id=dl.regime_id and trigger_id=dl.trigger_id and key=any(keys) and satisfied_by is null;
 insert into private.market_rg01_runs(id,regime_id,trigger_id,evaluation_id,reused,request_keys) values(gen_random_uuid(),dl.regime_id,dl.trigger_id,eid,reused,keys);
 return jsonb_build_object('status','evaluated','evaluationId',eid,'reused',reused,'result',ev->>'result','freshness',ev->>'freshness','requests',to_jsonb(keys));
end $$;
create or replace function private.worker_run_rg01_event_v1(p_consumer text,p_sequence bigint,p_capability text,p_lease uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r private.market_event_outbox;rc private.market_event_receipts;effect jsonb;sha text;deadline timestamptz;v_key text:='event:'||p_consumer||':'||p_sequence::text;begin
 perform private.market_require_read_committed_v1();
 if not exists(select 1 from private.market_event_consumers where id=p_consumer and handler='rg01') then raise exception 'market_event_handler_mismatch' using errcode='42501';end if;
 select * into rc from private.market_event_receipts where consumer_id=p_consumer and event_sequence=p_sequence;
 if found then
  if rc.effect is distinct from jsonb_build_object('handler','rg01','request',v_key) then raise exception 'market_event_handler_mismatch' using errcode='42501';end if;
  if rc.lease_id is distinct from p_lease or rc.account_user_id is distinct from auth.uid() or p_capability is null
  or rc.capability_sha256 is distinct from extensions.digest(p_capability,'sha256')
  or not exists(select 1 from private.worker_tokens w where w.id=rc.worker_token_id and w.execution_account_user_id=auth.uid() and w.status='active' and w.revoked_at is null)
  then raise exception 'market_event_lease_denied' using errcode='42501';end if;
  return jsonb_build_object('completed',true,'replayed',true);
 end if;
 r:=private.market_event_for_lease_v1(p_consumer,p_sequence,p_capability,p_lease);
 if not exists(select 1 from private.market_event_consumers where id=p_consumer and handler='rg01' and state='enabled') then raise exception 'market_event_handler_mismatch' using errcode='42501';end if;
 insert into private.market_rg01_requests(regime_id,trigger_id,key)
 select regime_id,trigger_id,v_key from private.market_regime_declarations where active on conflict do nothing;
 effect:=jsonb_build_object('handler','rg01','request',v_key);
 sha:=encode(extensions.digest(convert_to(effect::text,'UTF8'),'sha256'),'hex');
 deadline:=r.lease_expires_at;
 insert into private.market_event_receipts(consumer_id,event_sequence,lease_id,worker_token_id,account_user_id,capability_sha256,effect,effect_sha256)
 values(p_consumer,p_sequence,p_lease,r.leased_by,auth.uid(),r.capability_sha256,effect,sha);
 update private.market_event_outbox set status='completed',completed_at=clock_timestamp(),lease_id=null,leased_by=null,leased_account_user_id=null,
  lease_expires_at=null,capability_sha256=null,last_error=null where consumer_id=p_consumer and event_sequence=p_sequence;
 if deadline<=clock_timestamp() then raise exception 'market_event_lease_denied' using errcode='42501';end if;
 return jsonb_build_object('completed',true,'replayed',false,'request',v_key);
end $$;
create or replace function private.market_regime_incident_v1(p_regime text,p_trigger text,p_actor uuid) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare dl private.market_regime_declarations;le private.market_regime_evaluations;begin
 perform private.require_platform_principal_v1(p_actor);
 select * into dl from private.market_regime_declarations where regime_id=p_regime and trigger_id=p_trigger and active;
 select * into le from private.market_regime_evaluations where regime_id=p_regime and trigger_id=p_trigger order by created_at desc,id desc limit 1;
 return jsonb_build_object(
  'declaration',case when dl.id is null then null else jsonb_build_object('id',dl.id,'policyId',dl.policy_id,'policyVersion',dl.policy_version,'sha256',dl.projection_sha256,
   'referenceStatus','draft','decidedBy',(dl.projection_text::jsonb)->>'decidedBy','trigger',(dl.projection_text::jsonb)->'trigger') end,
  'incident',(select jsonb_build_object('reviewState',i.review_state,'reviewRevision',i.review_revision,'openedAt',private.market_instant_text_v1(i.opened_at),
   'reviewDueOn',to_char(i.review_due_on,'YYYY-MM-DD'),
   'support',case when exists(select 1 from private.market_regime_witnesses w where w.regime_id=i.regime_id and w.trigger_id=i.trigger_id
     and (select s.support from private.market_regime_witness_support s where s.regime_id=w.regime_id and s.trigger_id=w.trigger_id and s.meeting_end=w.meeting_end order by s.revision desc limit 1)='supported')
    then 'supported' else 'unavailable' end,
   'dispositions',coalesce((select jsonb_agg(jsonb_build_object('from',x.from_state,'to',x.to_state,'revision',x.revision_after,'reason',x.reason,
     'actor',x.actor_user_id,'automatic',x.command_id is null,'at',private.market_instant_text_v1(x.recorded_at)) order by x.recorded_at,x.revision_after)
     from private.market_regime_dispositions x where x.regime_id=i.regime_id and x.trigger_id=i.trigger_id),'[]'),
   'witnesses',coalesce((select jsonb_agg(jsonb_build_object('meetingEnd',to_char(w.meeting_end,'YYYY-MM-DD'),
     'support',(select s.support from private.market_regime_witness_support s where s.regime_id=w.regime_id and s.trigger_id=w.trigger_id and s.meeting_end=w.meeting_end order by s.revision desc limit 1),
     'meeting',(select jsonb_build_object('meeting',m.meeting,'decision',m.decision,'targetPct',m.target_pct,'seriesChangeDate',to_char(m.series_change_date,'YYYY-MM-DD'),
       'acquisitionId',m.reference_acquisition_id,'recordSha256',m.record_sha256) from private.market_copom_meetings m where m.reference_date=w.meeting_end),
     'series',(select jsonb_build_object('evaluationId',le.id,'previous',x->'previous','change',x->'change')
       from jsonb_array_elements(le.snapshot->'meetings') x where x->>'endDate'=to_char(w.meeting_end,'YYYY-MM-DD'))) order by w.meeting_end)
     from private.market_regime_witnesses w where w.regime_id=i.regime_id and w.trigger_id=i.trigger_id),'[]'))
   from private.market_regime_incidents i where i.regime_id=p_regime and i.trigger_id=p_trigger),
  'lastEvaluation',(select jsonb_build_object('id',e.id,'dataBase',to_char(e.data_base,'YYYY-MM-DD'),'knowledgeAt',private.market_instant_text_v1(e.knowledge_at),
   'result',e.result,'freshness',e.freshness,'gaps',e.evaluation->'gaps','witnesses',e.evaluation->'witnesses','baselineContradictions',e.evaluation->'baselineContradictions',
   'auditSha256',e.audit_sha256) from private.market_regime_evaluations e where e.regime_id=p_regime and e.trigger_id=p_trigger order by e.created_at desc,e.id desc limit 1),
  'nextDeadline',(select to_char(min(private.market_freshness_deadline_v1(x.end_date)),'YYYY-MM-DD') from (
    select (mt->>'secondDay')::date end_date from private.market_copom_calendar_revisions r,jsonb_array_elements(r.meetings) mt
    where r.revision=(select max(r2.revision) from private.market_copom_calendar_revisions r2 where r2.year=r.year)
    union select reference_date from private.market_copom_meetings) x
   where dl.id is not null and x.end_date>(select max(y::date) from jsonb_array_elements_text((dl.projection_text::jsonb)#>'{easingCycle,copomDecisions}') y)
   and private.market_freshness_deadline_v1(x.end_date)>=private.market_sao_paulo_date_v1(clock_timestamp())),
  'lastRunAt',(select private.market_instant_text_v1(max(r.ran_at)) from private.market_rg01_runs r where r.regime_id=p_regime and r.trigger_id=p_trigger),
  'pendingRequests',coalesce((select jsonb_agg(q.key order by q.key collate "C") from private.market_rg01_requests q where q.regime_id=p_regime and q.trigger_id=p_trigger and q.satisfied_by is null),'[]'),
  'blockedRows',coalesce((select jsonb_agg(o.event_sequence order by o.event_sequence) from private.market_event_outbox o join private.market_event_consumers c on c.id=o.consumer_id
   where c.handler='rg01' and o.status='blocked'),'[]'));
end $$;
