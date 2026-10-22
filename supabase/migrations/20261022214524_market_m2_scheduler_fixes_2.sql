-- Market reference M2 part 2 (ADR 0023): the series window ends exactly where the contract's exclusive limit
-- does. The contract refuses an end on or after the same month and day ten years later, compared as text, so
-- a window that starts on 29 February may end on 28 February ten years later.
create or replace function private.market_series_window_v1(p_homologated date,p_gap date,p_today date) returns table(window_start date,window_end date)
language sql immutable set search_path='' as $$
 select s,least(p_today-1,case when to_char(s,'MM-DD')='02-29' then make_date(extract(year from s)::int+10,2,28)
  else make_date(extract(year from s)::int+10,extract(month from s)::int,extract(day from s)::int)-1 end)
 from (select greatest(p_homologated,p_gap) s) x;
$$;
