-- Market reference M2, part 1 (ADR 0023; docs/build/market-reference/M2-PARTE-1.md). Pure functions
-- shared by the confirmation, the seal and the tests: canonical instant and decimal, civil dates,
-- national holidays, the data-base limit in São Paulo, the strict JSON reading of acquired bytes,
-- the SGS 432 and Copom communiqué parsers and the market-canonical.v2 text. Each one reproduces the
-- vectors of packages/market-reference/vectors byte for byte; none reads or writes a table.
set search_path='';

-- Instants: RFC 3339 with at most six fractional digits, UTC between 1900-01-01 inclusive and
-- 9999-12-31 exclusive. Hour 24 and second 60, which Postgres would roll over, are refused.
create function private.market_instant_v1(p text) returns timestamptz
language plpgsql stable set search_path='' as $$
declare m text[];t timestamptz;begin
 m:=regexp_match(p,'^([0-9]{4})-([0-9]{2})-([0-9]{2})T([0-9]{2}):([0-9]{2}):([0-9]{2})(\.[0-9]{1,6})?(Z|([+-])([0-9]{2}):([0-9]{2}))$');
 if m is null or m[4]::int>23 or m[5]::int>59 or m[6]::int>59 or (m[8]<>'Z' and (m[10]::int>23 or m[11]::int>59)) then raise exception 'market_instant_invalid';end if;
 if not private.market_real_date_any_v1(m[1]||'-'||m[2]||'-'||m[3]) then raise exception 'market_instant_invalid';end if;
 t:=(m[1]||'-'||m[2]||'-'||m[3]||' '||m[4]||':'||m[5]||':'||m[6]||coalesce(m[7],'')||case when m[8]='Z' then '+00:00' else m[8] end)::timestamptz;
 if t<'1900-01-01T00:00:00Z'::timestamptz or t>='9999-12-31T00:00:00Z'::timestamptz then raise exception 'market_instant_out_of_range';end if;
 return t;
end $$;

create function private.market_instant_text_v1(p timestamptz) returns text
language sql stable set search_path='' as $$
 select to_char(p at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"');
$$;

-- A real calendar date written YYYY-MM-DD (any year with four digits).
create function private.market_real_date_any_v1(p text) returns boolean
language plpgsql immutable set search_path='' as $$
begin
 if p is null or p !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or substr(p,1,4)='0000' then return false;end if;
 return to_char(make_date(substr(p,1,4)::int,substr(p,6,2)::int,substr(p,9,2)::int),'YYYY-MM-DD')=p;
exception when others then return false;
end $$;

-- A civil date of the shared domain: 1900-01-01 to 9999-12-30.
create function private.market_real_date_v1(p text) returns boolean
language sql immutable set search_path='' as $$
 select private.market_real_date_any_v1(p) and p>='1900-01-01' and p<='9999-12-30';
$$;

-- Trimmed decimal: the text of trim_scale(x) for up to 24 integer and 20 fractional digits.
create function private.market_trim_decimal_v1(p text) returns text
language plpgsql immutable set search_path='' as $$
begin
 if p is null or p !~ '^-?[0-9]{1,24}(\.[0-9]{1,20})?$' then raise exception 'canonical_decimal';end if;
 return trim_scale(p::numeric)::text;
end $$;

-- Gregorian Easter (Meeus/Jones/Butcher) and the national banking holidays of financial-core
-- (2026.10.19-v1): fixed dates (20/11 from 2024), Carnival Monday and Tuesday, Good Friday, Corpus Christi.
create function private.market_easter_v1(p_year integer) returns date
language plpgsql immutable set search_path='' as $$
declare a int;b int;c int;d int;e int;f int;g int;h int;i int;k int;l int;m int;mo int;da int;begin
 a:=p_year%19;b:=p_year/100;c:=p_year%100;d:=b/4;e:=b%4;f:=(b+8)/25;g:=(b-f+1)/3;h:=(19*a+b-d-g+15)%30;i:=c/4;k:=c%4;
 l:=(32+2*e+2*i-h-k)%7;m:=(a+11*h+22*l)/451;mo:=(h+l-7*m+114)/31;da:=((h+l-7*m+114)%31)+1;
 return make_date(p_year,mo,da);
end $$;

create function private.market_br_holiday_v1(p date) returns boolean
language sql immutable set search_path='' as $$
 select to_char(p,'MM-DD') in ('01-01','04-21','05-01','09-07','10-12','11-02','11-15','12-25')
  or (to_char(p,'MM-DD')='11-20' and extract(year from p)>=2024)
  or p in (private.market_easter_v1(extract(year from p)::int)-48,private.market_easter_v1(extract(year from p)::int)-47,
   private.market_easter_v1(extract(year from p)::int)-2,private.market_easter_v1(extract(year from p)::int)+60);
$$;

create function private.market_next_business_day_v1(p date) returns date
language plpgsql immutable set search_path='' as $$
declare d date:=p+1;begin
 while extract(isodow from d) in (6,7) or private.market_br_holiday_v1(d) loop d:=d+1;end loop;
 return d;
end $$;

-- The exclusive limit of data-base D: the first instant whose civil date in São Paulo is D+1. A local
-- midnight that falls in a daylight-saving gap is read with the offset before the transition, which is
-- the instant the transition happens.
create function private.market_data_base_limit_v1(p date) returns timestamptz
language sql stable set search_path='' as $$
 select ((p+1)::timestamp at time zone 'America/Sao_Paulo');
$$;

create function private.market_sao_paulo_date_v1(p timestamptz) returns date
language sql stable set search_path='' as $$
 select (p at time zone 'America/Sao_Paulo')::date;
$$;

-- The fingerprint of a series normalization (market-series-contract.v1 of part 0).
create function private.market_series_contract_sha256_v1(p_id text,p_host text,p_path text,p_unit text,p_scale text,p_convention text,
 p_parser text,p_license text,p_homologated_from date,p_max_window_years integer,p_calendar text) returns text
language sql immutable set search_path='' as $$
 select encode(extensions.digest(convert_to(concat_ws(E'\n','market-series-contract.v1','id:'||p_id,'host:'||p_host,'path:'||p_path,'unit:'||p_unit,
  'scale:'||p_scale,'convention:'||p_convention,'parser:'||p_parser,'license:'||p_license,'homologated-from:'||to_char(p_homologated_from,'YYYY-MM-DD'),
  'max-window-years:'||p_max_window_years,'calendar:'||p_calendar),'UTF8'),'sha256'),'hex');
$$;

-- The communiqué record fingerprint (copom-communique-record.v1), lengths in UTF-8 bytes.
create function private.market_communique_record_sha256_v1(p_meeting integer,p_reference text,p_title text,p_text text) returns text
language sql immutable set search_path='' as $$
 select encode(extensions.digest(convert_to(concat_ws(E'\n','copom-communique-record.v1','meeting:'||p_meeting,'reference:'||p_reference,
  'title:'||octet_length(convert_to(p_title,'UTF8'))||':'||p_title,'text:'||octet_length(convert_to(p_text,'UTF8'))||':'||p_text),'UTF8'),'sha256'),'hex');
$$;

-- market-canonical.v2 from the CanonicalV2Input of part 0, with the same refusals.
create function private.market_canonical_v2_text_v1(p jsonb) returns text
language plpgsql stable set search_path='' as $$
declare uuid_re text:='^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';slug_re text:='^[a-z0-9][a-z0-9._-]{0,79}$';sha_re text:='^[a-f0-9]{64}$';
 inputs text[];links text;obs text;x jsonb;n_links int;n_obs int;begin
 if coalesce(p->>'sourceRevisionId','') !~ uuid_re then raise exception 'canonical_source_revision';end if;
 if coalesce(p#>>'{seriesContract,id}','') !~ slug_re or coalesce(p#>>'{seriesContract,sha256}','') !~ sha_re then raise exception 'canonical_series_contract';end if;
 if coalesce(p->>'parser','') !~ slug_re then raise exception 'canonical_parser';end if;
 if coalesce(p#>>'{qualityPolicy,id}','') !~ slug_re or coalesce(p#>>'{qualityPolicy,version}','') !~ slug_re then raise exception 'canonical_quality_policy';end if;
 if p->>'availabilityBasis' is distinct from 'observed_at_acquisition' then raise exception 'canonical_availability';end if;
 if jsonb_typeof(p->'acquisitionIds') is distinct from 'array' or jsonb_array_length(p->'acquisitionIds')=0
 or exists(select 1 from jsonb_array_elements(p->'acquisitionIds') e where jsonb_typeof(e)<>'string' or e#>>'{}' !~ uuid_re) then raise exception 'canonical_inputs';end if;
 select array_agg(e order by e collate "C") into inputs from jsonb_array_elements_text(p->'acquisitionIds') e;
 if (select count(distinct e) from unnest(inputs) e)<>cardinality(inputs) then raise exception 'canonical_inputs_repeated';end if;
 if p->'supersedes' is not null and jsonb_typeof(p->'supersedes')<>'null' and coalesce(p->>'supersedes','') !~ uuid_re then raise exception 'canonical_supersedes';end if;
 for x in select e from jsonb_array_elements(coalesce(p->'links','[]')) e loop
  if jsonb_typeof(x->'meeting') is distinct from 'number' or (x->>'meeting') !~ '^[1-9][0-9]*$' or not private.market_real_date_v1(x->>'referenceDate')
  or coalesce(x->>'decision','') not in ('raise','cut','hold') or coalesce(x->>'recordSha256','') !~ sha_re or coalesce(x->>'acquisitionId','') !~ uuid_re
  then raise exception 'canonical_link';end if;
  perform private.market_trim_decimal_v1(x->>'targetPct');
 end loop;
 select count(*),count(distinct (e->>'meeting')::numeric) into n_links,n_obs from jsonb_array_elements(coalesce(p->'links','[]')) e;
 if n_links<>n_obs then raise exception 'canonical_link_repeated';end if;
 select string_agg(concat_ws('|',e->>'meeting',e->>'referenceDate',e->>'decision',private.market_trim_decimal_v1(e->>'targetPct'),e->>'recordSha256',e->>'acquisitionId'),
  E'\n' order by (e->>'meeting')::numeric) into links from jsonb_array_elements(coalesce(p->'links','[]')) e;
 for x in select e from jsonb_array_elements(coalesce(p->'observations','[]')) e loop
  if not ((jsonb_typeof(x->'periodStart')='null' or private.market_real_date_v1(x->>'periodStart')) and private.market_real_date_v1(x->>'periodEnd')
   and coalesce(x->>'unit','') in ('percent_per_year','percent_per_month','ratio','index_points','currency','basis_points','count') and coalesce(x->>'scale','') ~ '^1(0{1,9})?$')
  then raise exception 'canonical_observation';end if;
  begin
   perform private.market_instant_v1(x->>'availableAt'),private.market_instant_v1(x->>'acquiredAt');
  exception when others then raise exception 'canonical_instant';
  end;
  perform private.market_trim_decimal_v1(x->>'value');
 end loop;
 select count(*),count(distinct (e->>'periodEnd')||'|'||coalesce(e->>'periodStart','null')) into n_links,n_obs from jsonb_array_elements(coalesce(p->'observations','[]')) e;
 if n_links<>n_obs then raise exception 'canonical_period_repeated';end if;
 select string_agg(concat_ws('|',coalesce(e->>'periodStart',''),e->>'periodEnd',private.market_instant_text_v1(private.market_instant_v1(e->>'availableAt')),
  private.market_instant_text_v1(private.market_instant_v1(e->>'acquiredAt')),private.market_trim_decimal_v1(e->>'value'),e->>'unit',e->>'scale'),
  E'\n' order by e->>'periodEnd' collate "C",(e->>'periodStart') is not null,e->>'periodStart' collate "C") into obs from jsonb_array_elements(coalesce(p->'observations','[]')) e;
 return concat_ws(E'\n','market-canonical.v2','source-revision:'||(p->>'sourceRevisionId'),
  'series-contract:'||(p#>>'{seriesContract,id}')||'@'||(p#>>'{seriesContract,sha256}'),'parser:'||(p->>'parser'),
  'quality-policy:'||(p#>>'{qualityPolicy,id}')||'@'||(p#>>'{qualityPolicy,version}'),'availability:observed_at_acquisition',
  'inputs:'||array_to_string(array(select 'a:'||e from unnest(inputs) e),','),'supersedes:'||coalesce(p->>'supersedes','null'),
  'links:'||coalesce(E'\n'||links,''),'observations:'||coalesce(E'\n'||obs,''));
end $$;

-- Strict reading of acquired bytes, the same refusals as strict-json.ts: no BOM, valid UTF-8, RFC 8259,
-- no repeated key in any object, strings of Unicode scalar values without U+0000. The json type (not
-- jsonb) keeps repeated keys so they can be counted; extracting each string makes Postgres refuse
-- U+0000 and lone surrogates.
create function private.market_json_walk_v1(p json) returns void
language plpgsql immutable set search_path='' as $$
declare k text;v json;n int;d int;begin
 case json_typeof(p)
 when 'object' then
  select count(*),count(distinct x) into n,d from json_object_keys(p) x;
  if n<>d then raise exception 'market_parse_json_duplicate_key';end if;
  for k,v in select * from json_each(p) loop perform private.market_json_walk_v1(v);end loop;
 when 'array' then
  for v in select * from json_array_elements(p) loop perform private.market_json_walk_v1(v);end loop;
 when 'string' then
  perform p#>>'{}';
 else null;
 end case;
end $$;

create function private.market_strict_json_v1(p_content bytea) returns json
language plpgsql immutable set search_path='' as $$
declare t text;j json;begin
 if substr(p_content,1,3)=decode('efbbbf','hex') then raise exception 'market_parse_json_bom';end if;
 begin t:=convert_from(p_content,'UTF8');exception when others then raise exception 'market_parse_json_not_utf8';end;
 begin j:=t::json;exception when others then raise exception 'market_parse_json_syntax';end;
 -- Postgres refuses U+0000 (22P05) and a lone surrogate (22P02) only when a string is extracted.
 begin
  perform private.market_json_walk_v1(j);
 exception
  when raise_exception then raise;
  when untranslatable_character then raise exception 'market_parse_json_nul';
  when invalid_text_representation then raise exception 'market_parse_json_lone_surrogate';
 end;
 return j;
end $$;

create function private.market_date_from_br_v1(p text) returns date
language plpgsql immutable set search_path='' as $$
declare iso text;begin
 if p is null or p !~ '^[0-9]{2}/[0-9]{2}/[0-9]{4}$' then return null;end if;
 iso:=substr(p,7,4)||'-'||substr(p,4,2)||'-'||substr(p,1,2);
 if iso<'1900-01-01' or not private.market_real_date_any_v1(iso) then return null;end if;
 return iso::date;
end $$;

-- SGS daily JSON, parser bcb-sgs-daily-json.v2: same order of checks as parseSelicTarget, plus no
-- period after the data-base of the confirmation.
create function private.market_parse_sgs_daily_v1(p_content bytea,p_start date,p_end date,p_data_base date)
returns table(period date,value text)
language plpgsql immutable set search_path='' as $$
declare j json;r json;d date;prior date;i int:=0;begin
 j:=private.market_strict_json_v1(p_content);
 if json_typeof(j)<>'array' then raise exception 'market_parse_not_array';end if;
 if json_array_length(j)=0 then raise exception 'market_parse_empty';end if;
 for r in select e from json_array_elements(j) with ordinality x(e,o) order by o loop
  if json_typeof(r)<>'object' or (select count(*) from json_object_keys(r))<>2
  or json_typeof(r->'data') is distinct from 'string' or json_typeof(r->'valor') is distinct from 'string' then raise exception 'market_parse_row';end if;
  d:=private.market_date_from_br_v1(r->>'data');
  if d is null then raise exception 'market_parse_date';end if;
  if (r->>'valor') !~ '^(0|[1-9][0-9]{0,2})\.[0-9]{2}$' then raise exception 'market_parse_value';end if;
  if d<p_start or d>p_end then raise exception 'market_parse_outside_window';end if;
  if d>p_data_base then raise exception 'market_parse_future_period';end if;
  if prior is not null and d<=prior then
   if d=prior then raise exception 'market_parse_duplicate_period';end if;
   raise exception 'market_parse_unordered';
  end if;
  prior:=d;period:=d;value:=r->>'valor';
  return next;
 end loop;
end $$;

-- Plain text of a communiqué, the algorithm of communiquePlainText: tags to a space (an unclosed `<`
-- stays), one pass of entities (decimal and hexadecimal scalars other than 0 and surrogates, and
-- nbsp, lt, gt, quot, amp; anything else stays literal), zero-width characters removed, the explicit
-- whitespace set collapsed and trimmed.
create function private.market_communique_plain_text_v1(p_html text) returns text
language plpgsql immutable set search_path='' as $$
declare s text:='';rest text:=p_html;o int;c int;m text[];n bigint;ws text:='['||chr(9)||chr(10)||chr(11)||chr(12)||chr(13)||' '||chr(160)||chr(5760)||chr(8192)||'-'||chr(8202)||chr(8232)||chr(8233)||chr(8239)||chr(8287)||chr(12288)||']';begin
 loop
  o:=strpos(rest,'<');
  if o=0 then s:=s||rest;exit;end if;
  c:=strpos(substr(rest,o+1),'>');
  if c=0 then s:=s||rest;exit;end if;
  s:=s||substr(rest,1,o-1)||' ';
  rest:=substr(rest,o+c+1);
 end loop;
 rest:=s;s:='';
 loop
  m:=regexp_match(rest,'^(.*?)&(#([0-9]{1,7})|#[xX]([0-9A-Fa-f]{1,6})|(nbsp|lt|gt|quot|amp));');
  if m is null then s:=s||rest;exit;end if;
  s:=s||m[1];
  if m[3] is not null or m[4] is not null then
   n:=case when m[3] is not null then m[3]::bigint else ('x'||lpad(m[4],8,'0'))::bit(32)::bigint end;
   if n between 1 and 1114111 and n not between 55296 and 57343 then s:=s||chr(n::int);else s:=s||'&'||m[2]||';';end if;
  else
   s:=s||case m[5] when 'nbsp' then ' ' when 'lt' then '<' when 'gt' then '>' when 'quot' then '"' else '&' end;
  end if;
  rest:=substr(rest,length(m[1])+length(m[2])+3);
 end loop;
 s:=regexp_replace(s,'['||chr(8203)||chr(8204)||chr(8205)||chr(65279)||']','','g');
 s:=regexp_replace(s,ws||'+',' ','g');
 return regexp_replace(s,'^'||ws||'+|'||ws||'+$','','g');
end $$;

-- Detail of a Copom communiqué, parser bcb-copom-communique-json.v2.
create function private.market_parse_copom_detail_v1(p_content bytea,p_meeting integer)
returns table(reference_date date,decision text,target_pct text,record_sha256 text,title text,body text,series_change_date date,regulatory_effective_from date)
language plpgsql immutable set search_path='' as $$
declare ws text:='['||chr(9)||chr(10)||chr(11)||chr(12)||chr(13)||' '||chr(160)||chr(5760)||chr(8192)||'-'||chr(8202)||chr(8232)||chr(8233)||chr(8239)||chr(8287)||chr(12288)||']';j json;r json;tokens text[];verbs text[];pct text;plain text;
 c text[];ok boolean:=false;verb text;begin
 j:=private.market_strict_json_v1(p_content);
 if json_typeof(j)<>'object' or (select count(*) from json_object_keys(j))<>1 or json_typeof(j->'conteudo') is distinct from 'array' or json_array_length(j->'conteudo')<>1
 then raise exception 'market_parse_communique_shape';end if;
 r:=j->'conteudo'->0;
 if json_typeof(r)<>'object' or (select string_agg(k,',' order by k collate "C") from json_object_keys(r) k) is distinct from 'dataReferencia,nro_reuniao,textoComunicado,titulo'
 then raise exception 'market_parse_communique_fields';end if;
 if json_typeof(r->'nro_reuniao')<>'number' or (r->'nro_reuniao')::text !~ '^[1-9][0-9]{0,3}$' or (r->'nro_reuniao')::text::int<>p_meeting
 then raise exception 'market_parse_communique_meeting';end if;
 if json_typeof(r->'dataReferencia')<>'string' or not private.market_real_date_any_v1(r->>'dataReferencia') or (r->>'dataReferencia')<'1900-01-01'
 then raise exception 'market_parse_communique_date';end if;
 if json_typeof(r->'titulo')<>'string' or json_typeof(r->'textoComunicado')<>'string' then raise exception 'market_parse_communique_fields';end if;
 title:=r->>'titulo';body:=r->>'textoComunicado';
 select array_agg(x[1]) into tokens from regexp_matches(title,'(?<![0-9,.+'||chr(8722)||'-])([0-9]{1,2},[0-9]{2})'||ws||'*%'||ws||'*a\.a\.','g') x;
 select array_agg(x[1]) into verbs from regexp_matches(title,'Copom (eleva|reduz|mantém)(?![A-Za-z'||chr(192)||'-'||chr(591)||'])','g') x;
 if coalesce(cardinality(tokens),0)<>1 or coalesce(cardinality(verbs),0)<>1 then raise exception 'market_parse_communique_title';end if;
 pct:=tokens[1];
 decision:=case verbs[1] when 'eleva' then 'raise' when 'reduz' then 'cut' else 'hold' end;
 plain:=private.market_communique_plain_text_v1(body);
 for c in select x from regexp_matches(plain,'(?:(?<!não )(?<![^ ])decidiu(?:, por unanimidade,)? (elevar|reduzir|manter)|, (elevando|reduzindo)) a taxa (?:Selic|básica de juros)( em [0-9],[0-9]{2} pontos? percentua(?:l|is),)? (para|em) ([0-9]{1,2},[0-9]{2})% a\.a\.','g') x loop
  verb:=case coalesce(c[1],c[2]) when 'elevar' then 'raise' when 'elevando' then 'raise' when 'reduzir' then 'cut' when 'reduzindo' then 'cut' else 'hold' end;
  if verb=decision and c[5]=pct and ((decision='hold')=(c[4]='em')) and (decision<>'hold' or c[3] is null) then ok:=true;end if;
 end loop;
 if not ok then raise exception 'market_parse_communique_text';end if;
 reference_date:=(r->>'dataReferencia')::date;target_pct:=replace(pct,',','.');
 record_sha256:=private.market_communique_record_sha256_v1(p_meeting,r->>'dataReferencia',title,body);
 series_change_date:=reference_date+1;regulatory_effective_from:=private.market_next_business_day_v1(reference_date);
 return next;
end $$;

-- List of Copom communiqués: discovery only; read strictly so garbage is never receipted as a list.
create function private.market_parse_copom_list_v1(p_content bytea,p_size integer) returns integer
language plpgsql immutable set search_path='' as $$
declare j json;r json;prior int;n int:=0;begin
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
  prior:=(r->'nro_reuniao')::text::int;n:=n+1;
 end loop;
 return n;
end $$;

-- Contracts, Copom meetings, v2 versions with their evidence and evaluations. Every table is closed
-- to the API and immutable; only the confirmation and the relink command write them.

create function private.market_reject_change_v1() returns trigger
language plpgsql set search_path='' as $$
begin raise exception 'market_record_immutable' using errcode='23514';end $$;

-- 1. Endpoint contracts: how bytes are collected. One row per endpoint, never changed.
create table private.market_endpoint_contracts(
 id text primary key check(id ~ '^[a-z0-9][a-z0-9._-]{0,79}$'),
 source_id text not null check(source_id ~ '^[a-z0-9][a-z0-9._-]{0,79}$'),
 kind text not null check(kind in ('sgs_daily_json','copom_communique_list','copom_communique_detail')),
 host text not null check(host ~ '^[a-z0-9.-]+$'),
 path text not null check(path ~ '^/[A-Za-z0-9._/-]+$'),
 extension text not null check(extension='json'),
 max_bytes integer not null check(max_bytes between 1 and 5242880),
 parser text check(parser is null or parser ~ '^[a-z0-9][a-z0-9._-]{0,79}$'),
 license_evidence text not null check(license_evidence ~ '^[a-z0-9][a-z0-9._-]{0,79}$'),
 reproduction_evidence text check(reproduction_evidence is null or reproduction_evidence ~ '^[a-z0-9][a-z0-9._-]{0,79}$'),
 homologated_from date,
 max_window_years integer check(max_window_years between 1 and 10),
 contract_sha256 text not null check(contract_sha256 ~ '^[a-f0-9]{64}$'),
 created_at timestamptz not null default clock_timestamp(),
 check((kind='sgs_daily_json')=(homologated_from is not null and max_window_years is not null and parser is null)),
 check((kind<>'sgs_daily_json')=(parser is not null)));

create function private.market_endpoint_contract_sha256_v1(c private.market_endpoint_contracts) returns text
language sql immutable set search_path='' as $$
 select encode(extensions.digest(convert_to(concat_ws(E'\n','market-endpoint-contract.v1','id:'||c.id,'source:'||c.source_id,'kind:'||c.kind,
  'host:'||c.host,'path:'||c.path,'extension:'||c.extension,'max-bytes:'||c.max_bytes,'parser:'||coalesce(c.parser,'none'),
  'license:'||c.license_evidence,'reproduction:'||coalesce(c.reproduction_evidence,'none'),
  'homologated-from:'||coalesce(to_char(c.homologated_from,'YYYY-MM-DD'),'none'),'max-window-years:'||coalesce(c.max_window_years::text,'none')),'UTF8'),'sha256'),'hex');
$$;

-- 2. Normalizations: how the bytes of a series endpoint are read into one logical object. A new
-- parser is a new row for the same endpoint and object; the newest ordinal reads new acquisitions.
create table private.market_normalizations(
 id text primary key check(id ~ '^[a-z0-9][a-z0-9._-]{0,79}$'),
 endpoint_contract_id text not null references private.market_endpoint_contracts(id),
 ordinal integer not null check(ordinal>0),
 parser text not null check(parser ~ '^[a-z0-9][a-z0-9._-]{0,79}$'),
 logical_id text not null check(logical_id ~ '^market:[a-z0-9._-]+:[a-z0-9._-]+:[a-f0-9]{16}$'),
 family text not null check(family ~ '^[a-z0-9][a-z0-9._-]{0,79}$'),
 logical_keys jsonb not null check(jsonb_typeof(logical_keys)='object'),
 unit text not null check(unit in ('percent_per_year','percent_per_month','ratio','index_points','currency','basis_points','count')),
 scale text not null check(scale ~ '^1(0{1,9})?$'),
 convention text not null check(convention ~ '^[a-z0-9_]{1,40}$'),
 calendar text not null check(length(calendar) between 3 and 120),
 quality_policy_id text not null check(quality_policy_id ~ '^[a-z0-9][a-z0-9._-]{0,79}$'),
 quality_policy_version text not null check(quality_policy_version ~ '^[a-z0-9][a-z0-9._-]{0,79}$'),
 normalization_sha256 text not null check(normalization_sha256 ~ '^[a-f0-9]{64}$'),
 created_at timestamptz not null default clock_timestamp(),
 unique(endpoint_contract_id,ordinal));

do $$
declare e private.market_endpoint_contracts;begin
 insert into private.market_endpoint_contracts(id,source_id,kind,host,path,extension,max_bytes,parser,license_evidence,reproduction_evidence,homologated_from,max_window_years,contract_sha256)
 values('bcb-sgs-432-endpoint','bcb','sgs_daily_json','api.bcb.gov.br','/dados/serie/bcdata.sgs.432/dados','json',5242880,null,'bcb-catalog-meta-selic-432',null,'2021-01-14',10,repeat('0',64)),
  ('bcb-copom-comunicados-lista','bcb','copom_communique_list','www.bcb.gov.br','/api/servico/sitebcb/copom/comunicados','json',1048576,'bcb-copom-communique-list-json.v1',
   'bcb-catalog-atas-comunicados-copom','bcb-site-termos-de-uso',null,null,repeat('0',64)),
  ('bcb-copom-comunicados-detalhe','bcb','copom_communique_detail','www.bcb.gov.br','/api/servico/sitebcb/copom/comunicados_detalhes','json',262144,'bcb-copom-communique-json.v2',
   'bcb-catalog-atas-comunicados-copom','bcb-site-termos-de-uso',null,null,repeat('0',64));
 for e in select * from private.market_endpoint_contracts loop
  update private.market_endpoint_contracts set contract_sha256=private.market_endpoint_contract_sha256_v1(e) where id=e.id;
 end loop;
 insert into private.market_normalizations(id,endpoint_contract_id,ordinal,parser,logical_id,family,logical_keys,unit,scale,convention,calendar,quality_policy_id,quality_policy_version,normalization_sha256)
 values('bcb-sgs-432','bcb-sgs-432-endpoint',1,'bcb-sgs-daily-json.v2','market:bcb:sgs:102a1aa7f870cb05','sgs','{"code":"432"}','percent_per_year','1','meta_copom',
  'financial-core.brazilian-national-holidays@2026.10.19-v1','bcb-sgs-432-quality','v2',
  private.market_series_contract_sha256_v1('bcb-sgs-432','api.bcb.gov.br','/dados/serie/bcdata.sgs.432/dados','percent_per_year','1','meta_copom',
   'bcb-sgs-daily-json.v2','bcb-catalog-meta-selic-432','2021-01-14',10,'financial-core.brazilian-national-holidays@2026.10.19-v1'));
 -- The normalization's fingerprint is the series contract of part 0; the canonical bytes do not move.
 if (select normalization_sha256 from private.market_normalizations where id='bcb-sgs-432')<>'eb892dc221c7b11d2ec37cf0ca8b0965584256498cd776ddc1811975a4e70aee'
 then raise exception 'market_normalization_fingerprint_drift';end if;
end $$;

create trigger market_endpoint_contracts_immutable before update or delete on private.market_endpoint_contracts for each row execute function private.market_reject_change_v1();
create trigger market_normalizations_immutable before update or delete on private.market_normalizations for each row execute function private.market_reject_change_v1();

-- 3. The URL of an endpoint for a request, the same text the TypeScript contract builds. The window
-- of the series is inclusive, inside the homologated period, shorter than ten years and, at enqueue,
-- not after the São Paulo date of the enqueue (p_today; null skips that check at confirmation).
create function private.market_contract_url_v1(p_contract text,p_request jsonb,p_today date) returns text
language plpgsql stable set search_path='' as $$
declare c private.market_endpoint_contracts;s text;e text;n text;begin
 select * into c from private.market_endpoint_contracts where id=p_contract;
 if not found then raise exception 'market_contract_unknown' using errcode='22023';end if;
 if p_request is null or jsonb_typeof(p_request)<>'object' then raise exception 'market_request_invalid' using errcode='22023';end if;
 if c.kind='sgs_daily_json' then
  if (select array_agg(k order by k) from jsonb_object_keys(p_request) k) is distinct from array['window'] or jsonb_typeof(p_request->'window')<>'object'
  or (select array_agg(k order by k collate "C") from jsonb_object_keys(p_request->'window') k) is distinct from array['end','start']::text[]
  or jsonb_typeof(p_request#>'{window,start}')<>'string' or jsonb_typeof(p_request#>'{window,end}')<>'string' then raise exception 'market_request_invalid' using errcode='22023';end if;
  s:=p_request#>>'{window,start}';e:=p_request#>>'{window,end}';
  if not private.market_real_date_v1(s) or not private.market_real_date_v1(e) then raise exception 'market_window_date_invalid' using errcode='22023';end if;
  if e<s then raise exception 'market_window_reversed' using errcode='22023';end if;
  if s<to_char(c.homologated_from,'YYYY-MM-DD') then raise exception 'market_window_before_homologation' using errcode='22023';end if;
  if e>=(substr(s,1,4)::int+c.max_window_years)::text||substr(s,5) then raise exception 'market_window_too_long' using errcode='22023';end if;
  if p_today is not null and e::date>p_today then raise exception 'market_window_in_future' using errcode='22023';end if;
  return 'https://'||c.host||c.path||'?formato=json&dataInicial='||to_char(s::date,'DD/MM/YYYY')||'&dataFinal='||to_char(e::date,'DD/MM/YYYY');
 elsif c.kind='copom_communique_list' then
  if (select array_agg(k) from jsonb_object_keys(p_request) k) is distinct from array['size'] or jsonb_typeof(p_request->'size')<>'number' then raise exception 'market_request_invalid' using errcode='22023';end if;
  n:=(p_request->'size')::text;
  if n !~ '^[1-9][0-9]{0,2}$' or n::int>100 then raise exception 'market_communique_list_size' using errcode='22023';end if;
  return 'https://'||c.host||c.path||'?quantidade='||n;
 else
  if (select array_agg(k) from jsonb_object_keys(p_request) k) is distinct from array['meeting'] or jsonb_typeof(p_request->'meeting')<>'number' then raise exception 'market_request_invalid' using errcode='22023';end if;
  n:=(p_request->'meeting')::text;
  if n !~ '^[1-9][0-9]{0,3}$' then raise exception 'market_communique_meeting' using errcode='22023';end if;
  return 'https://'||c.host||c.path||'?nro_reuniao='||n;
 end if;
end $$;

-- 4. Jobs remember their contract and request; a new job without them is refused.
alter table private.market_acquisition_jobs
 add column contract_id text references private.market_endpoint_contracts(id),
 add column request jsonb check(request is null or jsonb_typeof(request)='object'),
 add constraint market_acquisition_jobs_contract_pair check((contract_id is null)=(request is null));
create index market_acquisition_jobs_contract on private.market_acquisition_jobs(contract_id);

-- 5. Copom communiqués: every acquisition of a detail, and one authority row per meeting that fixes
-- its date, decision, rate and reference acquisition. The meeting's primary key serializes two first
-- acquisitions; the unique date refuses two meetings on one day.
create table private.market_copom_communique_acquisitions(
 acquisition_id uuid primary key references private.market_acquisitions(id),
 meeting integer not null check(meeting between 1 and 9999),
 reference_date date not null,
 decision text not null check(decision in ('raise','cut','hold')),
 target_pct text not null check(target_pct ~ '^[0-9]{1,2}\.[0-9]{2}$'),
 record_sha256 text not null check(record_sha256 ~ '^[a-f0-9]{64}$'),
 title text not null,
 body text not null,
 parser text not null check(parser ~ '^[a-z0-9][a-z0-9._-]{0,79}$'),
 series_change_date date not null check(series_change_date=reference_date+1),
 regulatory_effective_from date not null check(regulatory_effective_from>reference_date),
 recorded_at timestamptz not null default clock_timestamp());
create index market_copom_communique_acquisitions_meeting on private.market_copom_communique_acquisitions(meeting);

create table private.market_copom_meetings(
 meeting integer primary key check(meeting between 1 and 9999),
 reference_date date not null unique,
 decision text not null check(decision in ('raise','cut','hold')),
 target_pct text not null check(target_pct ~ '^[0-9]{1,2}\.[0-9]{2}$'),
 reference_acquisition_id uuid not null unique references private.market_copom_communique_acquisitions(acquisition_id),
 reference_acquired_at timestamptz not null,
 record_sha256 text not null check(record_sha256 ~ '^[a-f0-9]{64}$'),
 series_change_date date not null unique check(series_change_date=reference_date+1),
 created_at timestamptz not null default clock_timestamp());

create trigger market_copom_communique_acquisitions_immutable before update or delete on private.market_copom_communique_acquisitions for each row execute function private.market_reject_change_v1();
create trigger market_copom_meetings_immutable before update or delete on private.market_copom_meetings for each row execute function private.market_reject_change_v1();

-- 6. v2 versions: the normalization, the acquisition they read, the data-base whose evidence they
-- sealed and the instant all of it was available.
alter table private.market_versions
 add column canonical_version text not null default 'v1' check(canonical_version in ('v1','v2')),
 add column normalization_id text references private.market_normalizations(id),
 add column acquisition_id uuid references private.market_acquisitions(id),
 add column data_base date,
 add column window_start date,
 add column window_end date,
 add column evidence_available_at timestamptz,
 add constraint market_versions_v2_fields check((canonical_version='v2')=(normalization_id is not null and acquisition_id is not null and data_base is not null
  and window_start is not null and window_end is not null and evidence_available_at is not null)),
 add constraint market_versions_v2_window check(window_end is null or (window_start<=window_end and window_end<=data_base));
create unique index market_versions_v2_root on private.market_versions(acquisition_id) where supersedes is null and canonical_version='v2';
create unique index market_versions_single_successor on private.market_versions(supersedes) where supersedes is not null;
create index market_versions_normalization on private.market_versions(normalization_id);
create index market_versions_acquisition on private.market_versions(acquisition_id);

-- The job, if any, that collected an acquisition under a contract.
create function private.market_acquisition_contract_v1(p_acquisition uuid) returns text
language sql stable security definer set search_path='' as $$
 select j.contract_id from private.market_acquisitions a join private.market_acquisition_jobs j on j.id=a.processing_job_id where a.id=p_acquisition;
$$;

-- Gates on every version insert, whoever the writer: an acquisition collected under a contract is read
-- only by a v2 version of a normalization of that endpoint and object; successors of v2 are v2 of the
-- same acquisition and object, recorded strictly later, one per predecessor.
create function private.guard_market_version_v2_v1() returns trigger
language plpgsql security definer set search_path='' as $$
declare n private.market_normalizations;prior private.market_versions;pn private.market_normalizations;a private.market_acquisitions;contract text;begin
 if new.supersedes is not null then
  select * into prior from private.market_versions where id=new.supersedes;
  if prior.canonical_version='v2' and new.canonical_version<>'v2' then raise exception 'market_version_v2_required' using errcode='22023';end if;
 end if;
 if new.canonical_version='v1' then return new;end if;
 new.recorded_at:=clock_timestamp();
 select * into n from private.market_normalizations where id=new.normalization_id;
 select * into a from private.market_acquisitions where id=new.acquisition_id;
 contract:=private.market_acquisition_contract_v1(new.acquisition_id);
 if n.id is null or a.id is null or contract is distinct from n.endpoint_contract_id or new.logical_id<>n.logical_id or new.parser_version<>n.parser
 or new.methodology is not null or a.source_id<>split_part(new.logical_id,':',2)
 or not exists(select 1 from private.market_logical_objects o where o.logical_id=new.logical_id and o.category='observed')
 then raise exception 'market_version_v2_invalid' using errcode='22023';end if;
 if new.recorded_at<a.acquired_at or new.evidence_available_at<a.acquired_at then raise exception 'market_version_before_acquisition' using errcode='22023';end if;
 if new.supersedes is not null then
  select * into pn from private.market_normalizations where id=prior.normalization_id;
  if prior.canonical_version<>'v2' or prior.acquisition_id<>new.acquisition_id or prior.logical_id<>new.logical_id
  or pn.endpoint_contract_id<>n.endpoint_contract_id or prior.recorded_at>=new.recorded_at then raise exception 'market_version_successor_invalid' using errcode='22023';end if;
 end if;
 return new;
end $$;
create trigger market_versions_v2_gate before insert on private.market_versions for each row execute function private.guard_market_version_v2_v1();

-- An input of a v1 version never reads an acquisition collected under a contract; a v2 version has
-- exactly its own acquisition.
create function private.guard_market_version_input_v2_v1() returns trigger
language plpgsql security definer set search_path='' as $$
declare v private.market_versions;begin
 select * into v from private.market_versions where id=new.version_id;
 if v.canonical_version='v1' and new.acquisition_id is not null and private.market_acquisition_contract_v1(new.acquisition_id) is not null
 then raise exception 'market_version_v2_required' using errcode='22023';end if;
 if v.canonical_version='v2' and new.acquisition_id is distinct from v.acquisition_id then raise exception 'market_version_v2_invalid' using errcode='22023';end if;
 return new;
end $$;
create trigger market_version_inputs_v2_gate before insert on private.market_version_inputs for each row execute function private.guard_market_version_input_v2_v1();

-- 7. Evidence: the fixed set of Copom meetings a v2 version was evaluated with, each by its reference
-- acquisition. Content of the version: enters only while it is open.
create table private.market_version_evidence(
 version_id uuid not null references private.market_versions(id),
 meeting integer not null references private.market_copom_meetings(meeting),
 acquisition_id uuid not null references private.market_copom_communique_acquisitions(acquisition_id),
 record_sha256 text not null check(record_sha256 ~ '^[a-f0-9]{64}$'),
 primary key(version_id,meeting));
create index market_version_evidence_acquisition on private.market_version_evidence(acquisition_id);

create function private.guard_market_version_evidence_v1() returns trigger
language plpgsql security definer set search_path='' as $$
declare v private.market_versions;m private.market_copom_meetings;begin
 select * into v from private.market_versions where id=new.version_id;
 select * into m from private.market_copom_meetings where meeting=new.meeting;
 if v.canonical_version is distinct from 'v2' or m.reference_acquisition_id is distinct from new.acquisition_id or m.record_sha256 is distinct from new.record_sha256
 or m.reference_acquired_at>=private.market_data_base_limit_v1(v.data_base) then raise exception 'market_version_evidence_invalid' using errcode='22023';end if;
 return new;
end $$;
create trigger market_version_evidence_open before insert on private.market_version_evidence for each row execute function private.guard_market_version_open_v1();
create trigger market_version_evidence_gate before insert on private.market_version_evidence for each row execute function private.guard_market_version_evidence_v1();
create trigger market_version_evidence_immutable before update or delete on private.market_version_evidence for each row execute function private.market_reject_change_v1();

-- 8. Evaluations: the result of the quality policy for a version and a data-base, tied to its event.
create table private.market_version_evaluations(
 id uuid primary key,
 version_id uuid not null references private.market_versions(id),
 data_base date not null,
 policy_id text not null,
 policy_version text not null,
 status text not null check(status in ('approved','quarantined')),
 result text not null check(result in ('approved','quarantined','insufficient')),
 findings jsonb not null check(jsonb_typeof(findings)='array'),
 anchor_meeting integer,
 event_sequence bigint not null unique references private.market_events(sequence),
 evaluated_at timestamptz not null default clock_timestamp(),
 check((status='approved')=(result='approved')));
create index market_version_evaluations_version on private.market_version_evaluations(version_id);
create trigger market_version_evaluations_immutable before update or delete on private.market_version_evaluations for each row execute function private.market_reject_change_v1();

-- 9. Receipts: the original answer of a confirmation and of a relink command, returned on replay.
create table private.market_version_commits(
 job_id uuid primary key references private.market_acquisition_jobs(id),
 lease_id uuid not null,
 account_user_id uuid not null references auth.users(id),
 capability_sha256 bytea not null,
 contract_id text not null references private.market_endpoint_contracts(id),
 parser text not null,
 quality_policy text,
 fingerprint text not null check(fingerprint ~ '^[a-f0-9]{64}$'),
 acquisition_id uuid not null unique references private.market_acquisitions(id),
 version_id uuid references private.market_versions(id),
 result jsonb not null,
 committed_at timestamptz not null default clock_timestamp());
create index market_version_commits_account on private.market_version_commits(account_user_id);
create index market_version_commits_version on private.market_version_commits(version_id);
create trigger market_version_commits_immutable before update or delete on private.market_version_commits for each row execute function private.market_reject_change_v1();

create table private.market_relink_commands(
 command_id uuid primary key,
 version_id uuid not null references private.market_versions(id),
 actor_user_id uuid not null references auth.users(id),
 result jsonb not null,
 created_at timestamptz not null default clock_timestamp());
create index market_relink_commands_version on private.market_relink_commands(version_id);
create index market_relink_commands_actor on private.market_relink_commands(actor_user_id);
create trigger market_relink_commands_immutable before update or delete on private.market_relink_commands for each row execute function private.market_reject_change_v1();

do $$ declare t text;begin
 foreach t in array array['market_endpoint_contracts','market_normalizations','market_copom_communique_acquisitions','market_copom_meetings',
  'market_version_evidence','market_version_evaluations','market_version_commits','market_relink_commands'] loop
  execute format('alter table private.%I enable row level security',t);
  execute format('alter table private.%I force row level security',t);
  execute format('create policy %I on private.%I as restrictive for all to public using(false) with check(false)',t||'_deny',t);
  execute format('revoke all on private.%I from public,anon,authenticated,service_role',t);
  execute format('create trigger %I before truncate on private.%I for each statement execute function private.guard_platform_ledger_truncate_v1()',t||'_truncate_guard',t);
 end loop;
end $$;

-- 10. The CanonicalV2Input of a stored v2 version, built only from its rows; the seal compares its
-- SHA-256 with the version's fingerprint.
create function private.market_version_canonical_v2_input_v1(p_version uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object(
  'sourceRevisionId',(select s.command_id::text from private.market_acquisitions a
    join private.market_source_revisions s on s.source_id=a.source_id and s.revision=a.source_revision where a.id=v.acquisition_id),
  'seriesContract',jsonb_build_object('id',n.id,'sha256',n.normalization_sha256),
  'parser',v.parser_version,
  'qualityPolicy',jsonb_build_object('id',n.quality_policy_id,'version',n.quality_policy_version),
  'availabilityBasis','observed_at_acquisition',
  'acquisitionIds',coalesce((select jsonb_agg(i.acquisition_id::text) from private.market_version_inputs i where i.version_id=v.id),'[]'),
  'supersedes',v.supersedes::text,
  'links',coalesce((select jsonb_agg(jsonb_build_object('meeting',m.meeting,'referenceDate',to_char(m.reference_date,'YYYY-MM-DD'),'decision',m.decision,
    'targetPct',m.target_pct,'recordSha256',e.record_sha256,'acquisitionId',e.acquisition_id::text))
    from private.market_version_evidence e join private.market_copom_meetings m on m.meeting=e.meeting where e.version_id=v.id),'[]'),
  'observations',coalesce((select jsonb_agg(jsonb_build_object('periodStart',to_char(o.period_start,'YYYY-MM-DD'),'periodEnd',to_char(o.period_end,'YYYY-MM-DD'),
    'availableAt',private.market_instant_text_v1(o.available_at),'acquiredAt',private.market_instant_text_v1(o.acquired_at),'value',o.value::text,'unit',o.unit,'scale',o.scale))
    from private.market_observations o where o.version_id=v.id),'[]'))
 from private.market_versions v join private.market_normalizations n on n.id=v.normalization_id where v.id=p_version;
$$;

-- The seal: v1 keeps its canonical text; v2 rebuilds the input from the rows and checks that the
-- version reads exactly its acquisition, with the normalization's unit and scale, inside its window,
-- available at the acquisition and with its evidence available before the version's data-base.
create or replace function private.guard_market_version_seal_v1() returns trigger
language plpgsql security definer set search_path='' as $$
declare v private.market_versions;lo private.market_logical_objects;n_obs integer;n_in integer;dep uuid;n private.market_normalizations;a private.market_acquisitions;begin
 if private.lock_market_version_state_v1(new.version_id,true)<>'open' then raise exception 'market_version_closed' using errcode='23514';end if;
 for dep in select i.dependency_version_id from private.market_version_inputs i where i.version_id=new.version_id and i.dependency_version_id is not null order by 1 loop
  if private.lock_market_version_state_v1(dep,false)<>'sealed' then raise exception 'market_version_dependency_invalid' using errcode='22023';end if;
 end loop;
 select * into v from private.market_versions where id=new.version_id;
 select * into lo from private.market_logical_objects where logical_id=v.logical_id;
 select count(*) into n_obs from private.market_observations where version_id=new.version_id;
 select count(*) into n_in from private.market_version_inputs where version_id=new.version_id;
 if n_obs=0 or n_in=0 or new.observation_count<>n_obs or new.input_count<>n_in then raise exception 'market_version_seal_counts' using errcode='22023';end if;
 if v.canonical_version='v2' then
  select * into n from private.market_normalizations where id=v.normalization_id;
  select * into a from private.market_acquisitions where id=v.acquisition_id;
  if n_in<>1 or not exists(select 1 from private.market_version_inputs i where i.version_id=v.id and i.acquisition_id=v.acquisition_id)
  or exists(select 1 from private.market_observations o where o.version_id=v.id and (o.unit<>n.unit or o.scale<>n.scale or o.period_start is not null
   or o.period_end<v.window_start or o.period_end>v.window_end or o.acquired_at<>a.acquired_at or o.available_at<>a.acquired_at))
  or v.evidence_available_at<>greatest(a.acquired_at,coalesce((select max(m.reference_acquired_at) from private.market_version_evidence e
   join private.market_copom_meetings m on m.meeting=e.meeting where e.version_id=v.id),a.acquired_at))
  or a.acquired_at>=private.market_data_base_limit_v1(v.data_base)
  then raise exception 'market_version_v2_content_invalid' using errcode='22023';end if;
  if encode(extensions.digest(convert_to(private.market_canonical_v2_text_v1(private.market_version_canonical_v2_input_v1(v.id)),'UTF8'),'sha256'),'hex')<>v.sha256 then
   raise exception 'market_version_fingerprint_mismatch' using errcode='22023';end if;
 elsif encode(extensions.digest(convert_to(private.market_version_canonical_v1(new.version_id),'UTF8'),'sha256'),'hex')<>v.sha256 then
  raise exception 'market_version_fingerprint_mismatch' using errcode='22023';
 end if;
 if lo.category in ('observed','consensus','document_fact') then
  if exists(select 1 from private.market_version_inputs i join private.market_acquisitions x on x.id=i.acquisition_id
   join private.market_source_revisions s on s.source_id=x.source_id and s.revision=x.source_revision
   where i.version_id=new.version_id and s.license<>v.license) then raise exception 'market_version_license_mismatch' using errcode='22023';end if;
  if exists(select 1 from private.market_observations o where o.version_id=new.version_id and not exists(
   select 1 from private.market_version_inputs i join private.market_acquisitions x on x.id=i.acquisition_id where i.version_id=new.version_id and x.acquired_at=o.acquired_at))
  then raise exception 'market_observation_acquisition_mismatch' using errcode='22023';end if;
 else
  if exists(select 1 from private.market_version_inputs i join private.market_versions d on d.id=i.dependency_version_id
   where i.version_id=new.version_id and (d.license<>v.license or not private.market_version_quality_approved_v1(d.id)
    or not exists(select 1 from private.market_observations x where x.version_id=d.id)))
  then raise exception 'market_version_dependency_invalid' using errcode='22023';end if;
  if exists(select 1 from private.market_observations o, private.market_version_inputs i
   where o.version_id=new.version_id and i.version_id=new.version_id and (
    o.available_at<(select max(x.available_at) from private.market_observations x where x.version_id=i.dependency_version_id)
    or o.acquired_at<(select max(x.acquired_at) from private.market_observations x where x.version_id=i.dependency_version_id)))
  then raise exception 'market_derived_dates_before_dependencies' using errcode='22023';end if;
 end if;
 return new;
end $$;

-- 11. Evidence for a window and a data-base: the anchor meeting (latest series change on or before the
-- start) and every meeting whose series change falls in (start, end], each by its reference acquisition,
-- only if that acquisition is before the data-base limit.
create function private.market_select_evidence_v1(p_start date,p_end date,p_data_base date)
returns table(meeting integer,acquisition_id uuid,record_sha256 text,reference_acquired_at timestamptz)
language sql stable security definer set search_path='' as $$
 with eligible as (select * from private.market_copom_meetings m where m.reference_acquired_at<private.market_data_base_limit_v1(p_data_base))
 (select e.meeting,e.reference_acquisition_id,e.record_sha256,e.reference_acquired_at from eligible e where e.series_change_date<=p_start order by e.series_change_date desc limit 1)
 union all
 select e.meeting,e.reference_acquisition_id,e.record_sha256,e.reference_acquired_at from eligible e where e.series_change_date>p_start and e.series_change_date<=p_end;
$$;

-- 12. Quality policy bcb-sgs-432-quality v2 over a sealed version and a data-base (the algorithm of
-- evaluateSelicTarget, on the version's own evidence).
create function private.market_evaluate_selic_v1(p_version uuid,p_data_base date) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v private.market_versions;homologated date;last date;lim timestamptz;findings jsonb:='[]';n_links int:=0;
 anchor_meeting int;anchor_pct numeric;o record;prior_period date;prior_value numeric;c_meeting int;c_decision text;c_pct numeric;
 n_obs int:=0;step int;last_seen date;begin
 select * into v from private.market_versions where id=p_version;
 select ec.homologated_from into homologated from private.market_normalizations n join private.market_endpoint_contracts ec on ec.id=n.endpoint_contract_id where n.id=v.normalization_id;
 last:=least(v.window_end,p_data_base);lim:=private.market_data_base_limit_v1(p_data_base);
 select m.meeting,m.target_pct::numeric into anchor_meeting,anchor_pct from private.market_version_evidence e join private.market_copom_meetings m on m.meeting=e.meeting
 where e.version_id=v.id and m.reference_acquired_at<lim and m.series_change_date<=v.window_start order by m.series_change_date desc limit 1;
 for o in select period_end as period,value from private.market_observations where version_id=v.id and period_end>=v.window_start and period_end<=last
  and acquired_at<lim and available_at<lim order by period_end loop
  n_obs:=n_obs+1;
  if n_obs=1 then
   if o.period<>v.window_start then findings:=findings||jsonb_build_object('code','calendar_gap','period',to_char(v.window_start,'YYYY-MM-DD'));
   elsif anchor_meeting is null then findings:=findings||jsonb_build_object('code','start_without_anchor','period',to_char(o.period,'YYYY-MM-DD'));
   elsif anchor_pct<>o.value then findings:=findings||jsonb_build_object('code','anchor_value_mismatch','period',to_char(o.period,'YYYY-MM-DD'),'meeting',anchor_meeting);
   end if;
  end if;
  if o.period<homologated then findings:=findings||jsonb_build_object('code','before_homologation','period',to_char(o.period,'YYYY-MM-DD'));end if;
  if o.value>100 then findings:=findings||jsonb_build_object('code','value_out_of_range','period',to_char(o.period,'YYYY-MM-DD'));end if;
  if prior_period is not null and prior_period+1<>o.period then findings:=findings||jsonb_build_object('code','calendar_gap','period',to_char(prior_period+1,'YYYY-MM-DD'));end if;
  c_meeting:=null;c_decision:=null;c_pct:=null;
  if prior_period is not null then
   select m.meeting,m.decision,m.target_pct::numeric into c_meeting,c_decision,c_pct from private.market_version_evidence e join private.market_copom_meetings m on m.meeting=e.meeting
   where e.version_id=v.id and m.reference_acquired_at<lim and m.series_change_date=o.period;
  end if;
  if c_meeting is not null and c_pct<>o.value then
   findings:=findings||jsonb_build_object('code','communique_value_mismatch','period',to_char(o.period,'YYYY-MM-DD'),'meeting',c_meeting);end if;
  if prior_period is not null and prior_period+1=o.period then
   step:=sign(o.value-prior_value)::int;
   if step=0 then
    if c_meeting is not null and c_decision<>'hold' then findings:=findings||jsonb_build_object('code','communique_direction_mismatch','period',to_char(o.period,'YYYY-MM-DD'),'meeting',c_meeting);end if;
   elsif c_meeting is null then
    findings:=findings||jsonb_build_object('code','change_without_communique','period',to_char(o.period,'YYYY-MM-DD'),'from',prior_value::text,'to',o.value::text);
   elsif c_decision<>(case when step>0 then 'raise' else 'cut' end) then
    findings:=findings||jsonb_build_object('code','communique_direction_mismatch','period',to_char(o.period,'YYYY-MM-DD'),'meeting',c_meeting);
   elsif c_pct=o.value then n_links:=n_links+1;
   end if;
  end if;
  prior_period:=o.period;prior_value:=o.value;last_seen:=o.period;
 end loop;
 if n_obs=0 then
  return jsonb_build_object('result','insufficient','status','quarantined','findings',jsonb_build_array(jsonb_build_object('code','no_observation')),'links',0,'anchorMeeting',null);
 end if;
 if last_seen<last then findings:=findings||jsonb_build_object('code','calendar_gap','period',to_char(last_seen+1,'YYYY-MM-DD'));end if;
 return jsonb_build_object('result',case when jsonb_array_length(findings)=0 then 'approved' else 'quarantined' end,
  'status',case when jsonb_array_length(findings)=0 then 'approved' else 'quarantined' end,'findings',findings,'links',n_links,'anchorMeeting',anchor_meeting);
end $$;

-- Records an evaluation as a quality event of the version and its row.
create function private.record_market_evaluation_v1(p_version uuid,p_data_base date,p_job uuid,p_actor uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare ev jsonb;seq bigint;eval_id uuid:=gen_random_uuid();n private.market_normalizations;begin
 select x.* into n from private.market_normalizations x join private.market_versions v on v.normalization_id=x.id where v.id=p_version;
 ev:=private.market_evaluate_selic_v1(p_version,p_data_base);
 insert into private.market_events(subject_kind,subject_id,event,reason,actor_user_id,processing_job_id)
 values('version',p_version::text,ev->>'status','quality '||n.quality_policy_id||'@'||n.quality_policy_version||' for '||to_char(p_data_base,'YYYY-MM-DD')||': '||(ev->>'result')
  ||' with '||jsonb_array_length(ev->'findings')||' finding(s)',p_actor,case when p_actor is null then p_job end)
 returning sequence into seq;
 insert into private.market_version_evaluations(id,version_id,data_base,policy_id,policy_version,status,result,findings,anchor_meeting,event_sequence)
 values(eval_id,p_version,p_data_base,n.quality_policy_id,n.quality_policy_version,ev->>'status',ev->>'result',ev->'findings',(ev->>'anchorMeeting')::int,seq);
 return jsonb_build_object('status',ev->>'status','evaluationId',eval_id);
end $$;

-- 13. Creates, seals and evaluates a v2 version of an acquisition for a data-base, with the evidence
-- available for it. Observations come from the parse of the acquired bytes (or, for a relink, from the
-- predecessor) as [{period,value}].
create function private.create_market_selic_version_v1(p_acquisition uuid,p_normalization text,p_supersedes uuid,p_observations jsonb,
 p_data_base date,p_window_start date,p_window_end date,p_job uuid,p_actor uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a private.market_acquisitions;n private.market_normalizations;s private.market_source_revisions;vid uuid:=gen_random_uuid();input jsonb;sha text;
 evidence jsonb;evidence_at timestamptz;q jsonb;begin
 select * into a from private.market_acquisitions where id=p_acquisition;
 select * into n from private.market_normalizations where id=p_normalization;
 select * into s from private.market_source_revisions where source_id=a.source_id and revision=a.source_revision;
 insert into private.market_logical_objects(logical_id,source_id,family,kind,category,keys)
 values(n.logical_id,a.source_id,n.family,'series','observed',n.logical_keys) on conflict (logical_id) do nothing;
 -- The evidence is chosen once and both the canonical text and the rows are built from it.
 select coalesce(jsonb_agg(jsonb_build_object('meeting',x.meeting,'acquisitionId',x.acquisition_id,'recordSha256',x.record_sha256,
  'referenceDate',to_char(m.reference_date,'YYYY-MM-DD'),'decision',m.decision,'targetPct',m.target_pct,'referenceAcquiredAt',x.reference_acquired_at)),'[]')
 into evidence from private.market_select_evidence_v1(p_window_start,p_window_end,p_data_base) x join private.market_copom_meetings m on m.meeting=x.meeting;
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

-- 14. Enqueue by contract. The database builds the URL; the free-URL enqueue refuses everything.
create function private.market_source_cites_contract_v1(p_license jsonb,c private.market_endpoint_contracts) returns boolean
language sql immutable set search_path='' as $$
 select coalesce(p_license->'evidenceIds' ? c.license_evidence,false) and (c.reproduction_evidence is null or coalesce(p_license->'evidenceIds' ? c.reproduction_evidence,false));
$$;

create function private.enqueue_market_contract_acquisition_v1(p_command uuid,p_contract_id text,p_request jsonb,p_reason text,p_actor_user_id uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare prior private.market_acquisition_jobs;c private.market_endpoint_contracts;s private.market_source_revisions;job uuid:=gen_random_uuid();url text;begin
 perform private.require_platform_principal_v1(p_actor_user_id);
 if p_command is null or p_contract_id is null or p_request is null or p_reason is null then raise exception 'market_acquisition_invalid' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('platform-command:'||p_command::text,0));
 select * into prior from private.market_acquisition_jobs where command_id=p_command;
 if found then
  if prior.contract_id is distinct from p_contract_id or prior.request is distinct from p_request or prior.requested_by<>p_actor_user_id or prior.reason<>btrim(p_reason)
  then raise exception 'platform_method_request_reused' using errcode='22023';end if;
  return jsonb_build_object('jobId',prior.id,'replayed',true);
 end if;
 if private.market_publisher_organization_v1() is null then raise exception 'market_publisher_required' using errcode='42501';end if;
 select * into c from private.market_endpoint_contracts where id=p_contract_id;
 if not found then raise exception 'market_contract_unknown' using errcode='22023';end if;
 url:=private.market_contract_url_v1(c.id,p_request,private.market_sao_paulo_date_v1(clock_timestamp()));
 perform pg_advisory_xact_lock(hashtextextended('market-source:'||c.source_id,0));
 s:=private.market_source_in_force_v1(c.source_id);
 if s.source_id is null or not private.market_source_acquirable_v1(c.source_id,private.market_sao_paulo_date_v1(clock_timestamp()))
 then raise exception 'market_source_not_acquirable' using errcode='42501';end if;
 if not private.market_url_allowed_v1(url,s.allowed_hosts) then raise exception 'market_host_not_allowed' using errcode='42501';end if;
 if not private.market_source_cites_contract_v1(s.license,c) then raise exception 'market_contract_evidence_missing' using errcode='42501';end if;
 insert into private.market_acquisition_jobs(id,command_id,requested_by,reason,source_id,source_revision,url,extension,contract_id,request)
 values(job,p_command,p_actor_user_id,btrim(p_reason),s.source_id,s.revision,url,c.extension,c.id,p_request);
 insert into private.market_acquisition_job_events(job_id,event,actor_user_id,command_id,detail)
 values(job,'enqueued',p_actor_user_id,p_command,jsonb_build_object('sourceId',s.source_id,'sourceRevision',s.revision,'contractId',c.id));
 return jsonb_build_object('jobId',job,'replayed',false);
end $$;

create or replace function private.enqueue_market_acquisition_v1(p_command uuid,p_source_id text,p_url text,p_extension text,p_reason text,p_actor_user_id uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
begin raise exception 'market_enqueue_requires_contract' using errcode='42501';end $$;

-- A new job carries a contract, a request and the URL the database built for them.
create or replace function private.guard_market_acquisition_job_v1() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_op='INSERT' then
  if new.status<>'queued' or new.attempts<>0 or new.allocation_id is not null or new.acquisition_id is not null or new.last_error is not null
  or new.contract_id is null or new.url is distinct from private.market_contract_url_v1(new.contract_id,new.request,null)
  or new.extension is distinct from (select c.extension from private.market_endpoint_contracts c where c.id=new.contract_id)
  or new.source_id is distinct from (select c.source_id from private.market_endpoint_contracts c where c.id=new.contract_id)
  then raise exception 'market_acquisition_job_invalid' using errcode='23514';end if;
  return new;
 end if;
 if tg_op<>'UPDATE'
 or (to_jsonb(new)-array['status','attempts','available_at','allocation_id','leased_by','leased_account_user_id','lease_id','leased_at','lease_expires_at',
     'capability_sha256','acquisition_id','last_error','updated_at'])
  is distinct from (to_jsonb(old)-array['status','attempts','available_at','allocation_id','leased_by','leased_account_user_id','lease_id','leased_at','lease_expires_at',
     'capability_sha256','acquisition_id','last_error','updated_at'])
 or new.attempts<old.attempts
 or old.status in ('succeeded','failed','cancelled')
 or not ((old.status='queued' and new.status in ('queued','leased','failed','cancelled'))
  or (old.status='leased' and new.status in ('leased','queued','succeeded','failed','cancelled')))
 then raise exception 'market_acquisition_job_invalid' using errcode='23514';end if;
 new.updated_at:=clock_timestamp();
 return new;
end $$;

-- 15. Claim: only contract jobs; the worker receives contract, kind, request and the endpoint's limit.
create or replace function private.worker_claim_market_acquisition_v1(p_worker_token text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare worker uuid;j private.market_acquisition_jobs;s private.market_source_revisions;c private.market_endpoint_contracts;cap text;lease uuid;alloc uuid;path text;t timestamptz;begin
 worker:=private.market_worker_identity_v1(p_worker_token);
 if not private.market_acquisition_transport_released_v1() then return jsonb_build_object('claimed',false);end if;
 loop
  t:=clock_timestamp();
  select * into j from private.market_acquisition_jobs x
  where ((x.status='queued' and x.available_at<=t) or (x.status='leased' and x.lease_expires_at<=t)) and x.contract_id is not null
  and exists(select 1 from private.market_acquisition_delegations d where d.worker_token_id=worker and d.source_id=x.source_id and d.revoked_at is null)
  order by x.available_at,x.created_at,x.id limit 1 for update skip locked;
  if not found then return jsonb_build_object('claimed',false);end if;
  if j.attempts>=j.max_attempts then
   update private.market_acquisition_jobs set status='failed',lease_id=null,leased_by=null,leased_account_user_id=null,leased_at=null,lease_expires_at=null,
    capability_sha256=null,last_error=jsonb_build_object('code','attempts_exhausted') where id=j.id;
   insert into private.market_acquisition_job_events(job_id,event,detail) values(j.id,'exhausted',jsonb_build_object('attempts',j.attempts));
   continue;
  end if;
  select * into c from private.market_endpoint_contracts where id=j.contract_id;
  s:=private.market_source_in_force_v1(j.source_id);
  if not private.market_source_gate_v1(j.source_id,j.source_revision) or not private.market_url_allowed_v1(j.url,s.allowed_hosts)
  or not private.market_source_cites_contract_v1(s.license,c) then
   update private.market_acquisition_jobs set status='failed',lease_id=null,leased_by=null,leased_account_user_id=null,leased_at=null,lease_expires_at=null,
    capability_sha256=null,last_error=jsonb_build_object('code','source_not_acquirable') where id=j.id;
   insert into private.market_acquisition_job_events(job_id,event,detail) values(j.id,'source_withdrawn',jsonb_build_object('sourceRevision',j.source_revision));
   continue;
  end if;
  if not private.market_delegation_live_v1(worker,j.source_id) then return jsonb_build_object('claimed',false);end if;
  exit;
 end loop;
 if not private.market_reference_bucket_safe_v1() then raise exception 'market_reference_bucket_unsafe' using errcode='55000';end if;
 cap:=encode(extensions.gen_random_bytes(32),'hex');lease:=gen_random_uuid();alloc:=gen_random_uuid();t:=clock_timestamp();
 path:=j.source_id||'/'||to_char(t at time zone 'UTC','YYYY')||'/'||to_char(t at time zone 'UTC','MM')||'/'||alloc::text||'.'||j.extension;
 insert into private.market_acquisition_allocations(id,job_id,lease_id,object_path,worker_token_id,leased_account_user_id,capability_sha256)
 values(alloc,j.id,lease,path,worker,auth.uid(),extensions.digest(cap,'sha256'));
 update private.market_acquisition_jobs set status='leased',attempts=attempts+1,allocation_id=alloc,leased_by=worker,leased_account_user_id=auth.uid(),
  lease_id=lease,leased_at=t,lease_expires_at=t+interval '120 seconds',capability_sha256=extensions.digest(cap,'sha256') where id=j.id returning * into j;
 insert into private.market_acquisition_job_events(job_id,event,worker_token_id,lease_id,detail) values(j.id,'claimed',worker,lease,jsonb_build_object('attempt',j.attempts,'objectPath',path));
 return jsonb_build_object('claimed',true,'jobId',j.id,'leaseId',lease,'capability',cap,'attempt',j.attempts,'leaseExpiresAt',j.lease_expires_at,
  'sourceId',j.source_id,'sourceRevision',j.source_revision,'url',j.url,'allowedHosts',to_jsonb(s.allowed_hosts),'extension',j.extension,
  'contractId',c.id,'contractKind',c.kind,'request',j.request,'bucket','market-reference','objectPath',path,'maxBytes',c.max_bytes);
end $$;

-- 16. The fingerprint of a confirmation (market-commit.v1).
create function private.market_commit_fingerprint_v1(p_job uuid,p_lease uuid,p_content_sha256 text,p_content_type text,p_acquired_at timestamptz,
 p_contract text,p_parser text,p_policy text) returns text
language sql stable set search_path='' as $$
 select encode(extensions.digest(convert_to(concat_ws(E'\n','market-commit.v1','job:'||p_job,'lease:'||p_lease,'content-sha256:'||p_content_sha256,
  'content-type:'||octet_length(convert_to(p_content_type,'UTF8'))||':'||p_content_type,'acquired-at:'||private.market_instant_text_v1(p_acquired_at),
  'contract:'||p_contract,'parser:'||p_parser,'quality-policy:'||coalesce(p_policy,'none')),'UTF8'),'sha256'),'hex');
$$;

-- 17. The single confirmation: receipt, strict reading of the bytes by the database, version,
-- evidence, seal and evaluation, or the communiqué and its meeting, in one transaction.
create function private.worker_commit_market_version_v1(p_job_id uuid,p_capability_token text,p_lease_id uuid,p_content bytea,p_content_type text,p_acquired_at timestamptz) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j private.market_acquisition_jobs;a private.market_acquisition_allocations;s private.market_source_revisions;c private.market_endpoint_contracts;
 n private.market_normalizations;o storage.objects;r private.market_version_commits;sha text;md5hex text;parser text;policy text;fp text;today date;
 obs jsonb;created jsonb;result jsonb;d record;m private.market_copom_meetings;is_reference boolean:=false;version_id uuid;begin
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
  insert into private.market_copom_communique_acquisitions(acquisition_id,meeting,reference_date,decision,target_pct,record_sha256,title,body,parser,series_change_date,regulatory_effective_from)
  values(a.id,(j.request->>'meeting')::int,d.reference_date,d.decision,d.target_pct,d.record_sha256,d.title,d.body,parser,d.series_change_date,d.regulatory_effective_from);
  begin
   insert into private.market_copom_meetings(meeting,reference_date,decision,target_pct,reference_acquisition_id,reference_acquired_at,record_sha256,series_change_date)
   values((j.request->>'meeting')::int,d.reference_date,d.decision,d.target_pct,a.id,p_acquired_at,d.record_sha256,d.series_change_date)
   on conflict (meeting) do nothing;
  exception when unique_violation then raise exception 'market_copom_meeting_day_collision' using errcode='23505';
  end;
  select * into m from private.market_copom_meetings where meeting=(j.request->>'meeting')::int for update;
  if m.reference_date<>d.reference_date or m.decision<>d.decision or m.target_pct<>d.target_pct then raise exception 'market_copom_meeting_disagreement' using errcode='23514';end if;
  is_reference:=m.reference_acquisition_id=a.id;
  result:=jsonb_build_object('committed',true,'replayed',false,'acquisitionId',a.id,'meeting',m.meeting,'reference',is_reference);
 else
  parser:=c.parser;
  perform private.market_parse_copom_list_v1(p_content,(j.request->>'size')::int);
  result:=jsonb_build_object('committed',true,'replayed',false,'acquisitionId',a.id);
 end if;
 -- The waits above (meeting row, unique keys, locks) do not extend the lease.
 if j.lease_expires_at<=clock_timestamp() then raise exception 'market_acquisition_lease_denied' using errcode='42501';end if;
 fp:=private.market_commit_fingerprint_v1(j.id,p_lease_id,sha,p_content_type,p_acquired_at,c.id,parser,policy);
 update private.market_acquisition_jobs set status='succeeded',acquisition_id=a.id,lease_id=null,leased_by=null,leased_account_user_id=null,leased_at=null,
  lease_expires_at=null,capability_sha256=null where id=j.id;
 insert into private.market_acquisition_job_events(job_id,event,worker_token_id,lease_id,detail)
 values(j.id,'committed',j.leased_by,p_lease_id,jsonb_build_object('acquisitionId',a.id,'fingerprint',fp));
 insert into private.market_version_commits(job_id,lease_id,account_user_id,capability_sha256,contract_id,parser,quality_policy,fingerprint,acquisition_id,version_id,result)
 values(j.id,p_lease_id,auth.uid(),j.capability_sha256,c.id,parser,policy,fp,a.id,version_id,result);
 return result;
end $$;

create function public.worker_commit_market_version_v1(p_job_id uuid,p_capability_token text,p_lease_id uuid,p_content bytea,p_content_type text,p_acquired_at timestamptz) returns jsonb
language sql security invoker set search_path='' as $$select private.worker_commit_market_version_v1(p_job_id,p_capability_token,p_lease_id,p_content,p_content_type,p_acquired_at);$$;

-- The confirmation without bytes and version is closed.
create or replace function private.worker_commit_market_acquisition_v1(p_job_id uuid,p_capability_token text,p_lease_id uuid,p_final_url text,p_sha256 text,p_md5 text,
 p_byte_size bigint,p_content_type text,p_acquired_at timestamptz) returns jsonb
language plpgsql security definer set search_path='' as $$
begin raise exception 'market_commit_superseded' using errcode='42501';end $$;

-- 18. Failures: a refused redirect and a structural parse failure are definitive, whatever the caller says.
create or replace function private.worker_fail_market_acquisition_v1(p_job_id uuid,p_capability_token text,p_lease_id uuid,p_code text,p_retryable boolean,p_detail text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j private.market_acquisition_jobs;retry boolean;begin
 if p_code is null or p_code not in ('host_not_allowed','redirect_not_allowed','private_address','http_status','too_large','content_type','timeout','network',
  'upload_failed','verification_failed','transport_paused','source_not_acquirable','delegation_revoked','parse_failed') or p_retryable is null or (p_detail is not null and length(p_detail)>500)
 then raise exception 'market_acquisition_invalid' using errcode='22023';end if;
 j:=private.market_acquisition_for_lease_v1(p_job_id,p_capability_token,p_lease_id);
 retry:=p_retryable and p_code not in ('host_not_allowed','redirect_not_allowed','private_address','source_not_acquirable','parse_failed') and j.attempts<j.max_attempts;
 update private.market_acquisition_jobs set status=case when retry then 'queued' else 'failed' end,
  available_at=case when retry then clock_timestamp()+make_interval(secs=>30*j.attempts) else available_at end,
  lease_id=null,leased_by=null,leased_account_user_id=null,leased_at=null,lease_expires_at=null,capability_sha256=null,
  last_error=jsonb_build_object('code',p_code,'detail',p_detail) where id=j.id;
 insert into private.market_acquisition_job_events(job_id,event,worker_token_id,lease_id,detail)
 values(j.id,case when retry then 'retry_scheduled' else 'failed' end,j.leased_by,p_lease_id,jsonb_build_object('code',p_code,'detail',p_detail));
 return jsonb_build_object('retryScheduled',retry);
end $$;

-- 19. Relink: new evidence makes a new version of the same acquisition. The command's receipt is
-- returned on every repetition; the chain of an acquisition is serialized and only its tip is relinked.
create function private.relink_market_version_v1(p_command uuid,p_version uuid,p_actor_user_id uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare prior private.market_relink_commands;v private.market_versions;today date;obs jsonb;same boolean;created jsonb;result jsonb;begin
 perform private.require_platform_principal_v1(p_actor_user_id);
 if p_command is null or p_version is null then raise exception 'market_relink_invalid' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('platform-command:'||p_command::text,0));
 select * into prior from private.market_relink_commands where command_id=p_command;
 if found then
  if prior.version_id<>p_version or prior.actor_user_id<>p_actor_user_id then raise exception 'platform_method_request_reused' using errcode='22023';end if;
  return prior.result||jsonb_build_object('replayed',true);
 end if;
 select * into v from private.market_versions where id=p_version;
 if not found or v.canonical_version<>'v2' then raise exception 'market_relink_invalid' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('market-chain:'||v.acquisition_id::text,0));
 if exists(select 1 from private.market_versions x where x.supersedes=v.id) then raise exception 'market_relink_not_tip' using errcode='55000';end if;
 if private.lock_market_version_state_v1(v.id,false)<>'sealed' then raise exception 'market_relink_invalid' using errcode='22023';end if;
 today:=private.market_sao_paulo_date_v1(clock_timestamp());
 select not exists(
  (select meeting,acquisition_id from private.market_select_evidence_v1(v.window_start,v.window_end,today))
  except (select meeting,acquisition_id from private.market_version_evidence where version_id=v.id))
 and not exists(
  (select meeting,acquisition_id from private.market_version_evidence where version_id=v.id)
  except (select meeting,acquisition_id from private.market_select_evidence_v1(v.window_start,v.window_end,today))) into same;
 if same then
  result:=jsonb_build_object('relinked',false,'replayed',false,'versionId',v.id);
 else
  select coalesce(jsonb_agg(jsonb_build_object('period',to_char(period_end,'YYYY-MM-DD'),'value',value::text) order by period_end),'[]') into obs
  from private.market_observations where version_id=v.id;
  created:=private.create_market_selic_version_v1(v.acquisition_id,v.normalization_id,v.id,obs,today,v.window_start,v.window_end,null,p_actor_user_id);
  result:=jsonb_build_object('relinked',true,'replayed',false,'versionId',created->'versionId','supersedes',v.id,'quality',created->'quality');
 end if;
 insert into private.market_relink_commands(command_id,version_id,actor_user_id,result) values(p_command,p_version,p_actor_user_id,result);
 return result;
end $$;

-- 20. Grants: everything private is closed; the worker reaches the new confirmation through its public
-- wrapper as authenticated, like the other lease steps.
do $$declare f record;begin
 for f in select p.oid::regprocedure::text signature,p.proname,n.nspname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where (n.nspname='private' and p.proname in ('market_instant_v1','market_instant_text_v1','market_real_date_any_v1','market_real_date_v1','market_trim_decimal_v1',
  'market_easter_v1','market_br_holiday_v1','market_next_business_day_v1','market_data_base_limit_v1','market_sao_paulo_date_v1','market_series_contract_sha256_v1',
  'market_communique_record_sha256_v1','market_canonical_v2_text_v1','market_json_walk_v1','market_strict_json_v1','market_date_from_br_v1','market_parse_sgs_daily_v1',
  'market_communique_plain_text_v1','market_parse_copom_detail_v1','market_parse_copom_list_v1','market_reject_change_v1','market_endpoint_contract_sha256_v1',
  'market_contract_url_v1','market_acquisition_contract_v1','guard_market_version_v2_v1','guard_market_version_input_v2_v1','guard_market_version_evidence_v1',
  'market_version_canonical_v2_input_v1','guard_market_version_seal_v1','market_select_evidence_v1','market_evaluate_selic_v1','record_market_evaluation_v1',
  'create_market_selic_version_v1','market_source_cites_contract_v1','enqueue_market_contract_acquisition_v1','enqueue_market_acquisition_v1',
  'guard_market_acquisition_job_v1','worker_claim_market_acquisition_v1','market_commit_fingerprint_v1','worker_commit_market_version_v1',
  'worker_commit_market_acquisition_v1','worker_fail_market_acquisition_v1','relink_market_version_v1'))
 or (n.nspname='public' and p.proname='worker_commit_market_version_v1')
 loop
  execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);
  if f.proname in ('worker_claim_market_acquisition_v1','worker_commit_market_version_v1','worker_commit_market_acquisition_v1','worker_fail_market_acquisition_v1') then
   execute format('grant execute on function %s to authenticated',f.signature);
  end if;
 end loop;
end $$;

-- 21. Boot contract: the database announces the version confirmation before any image requires it.
do $$declare body text;begin
 select pg_get_functiondef('public.worker_runtime_schema_contract_v1()'::regprocedure) into body;
 if position('market-version-commit.v1' in body)>0 then raise exception 'market_capability_already_registered';end if;
 if position('market-acquisition-consumer.v1' in body)=0 then raise exception 'runtime_capability_anchor_missing';end if;
 body:=replace(body,'market-acquisition-consumer.v1','market-acquisition-consumer.v1","market-version-commit.v1');
 execute body;
end $$;

comment on table private.market_endpoint_contracts is 'How market bytes are collected (ADR 0023, M2): one immutable row per endpoint; the database builds every URL from it.';
comment on table private.market_normalizations is 'How the bytes of a series endpoint are read into one logical object; a new parser is a new row for the same endpoint and object.';
comment on table private.market_copom_meetings is 'One authority row per Copom meeting: date, decision, rate and the reference acquisition that is evidence for versions.';
comment on table private.market_version_evidence is 'The fixed set of Copom meetings a v2 version was evaluated with, sealed in its canonical text.';
comment on table private.market_version_evaluations is 'Quality results of v2 versions for a data-base, each tied to its event.';
comment on table private.market_version_commits is 'Receipts of version confirmations, returned unchanged on replay.';
comment on table private.market_relink_commands is 'Receipts of relink commands, returned unchanged on repetition.';
