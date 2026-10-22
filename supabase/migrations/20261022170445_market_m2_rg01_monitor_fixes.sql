-- Market reference M2, part 6, fix 1: a gap of a relevant meeting is one text joined before it is appended to
-- the array; without the parentheses the array met the separator first and the evaluator refused.
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
 if entries=0 then gaps:=gaps||'series_absent'::text;end if;
 for r in select x from jsonb_array_elements(mrows) x where (x->>'relevant')::boolean loop
  if r->>'state'<>'corroborated' then
   gaps:=gaps||((case r->>'state' when 'missing' then 'communique_missing' when 'awaiting_series' then 'series_pending'
    when 'series_disagreement' then 'series_disagreement' when 'unavailable' then 'communique_unavailable' else 'meeting_disputed' end)||':'||(r->>'endDate'));
  end if;
  if r->>'decision'='raise' and r->>'state'='corroborated' then wit:=wit||(r->>'endDate');end if;
 end loop;
 if cardinality(wit)>0 then result:='fired';
 elsif exists(select 1 from jsonb_array_elements(mrows) x where (x->>'relevant')::boolean and x->>'decision'='raise' and x->>'state'='awaiting_series') then result:='pending_confirmation';
 elsif cardinality(missing)=0 and entries>0 and not exists(select 1 from jsonb_array_elements(mrows) x where (x->>'relevant')::boolean and x->>'state'<>'corroborated') then result:='not_fired';
 else result:='incomplete';end if;
 fresh:=case when entries=0 then 'absent'
  when cardinality(missing)>0 or exists(select 1 from jsonb_array_elements(mrows) x where (x->>'relevant')::boolean
   and (x->>'deadline') collate "C"<d collate "C" and x->>'state'<>'corroborated') then 'stale' else 'current' end;
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
revoke all on function private.market_evaluate_rg01_v1(jsonb) from public,anon,authenticated,service_role;
