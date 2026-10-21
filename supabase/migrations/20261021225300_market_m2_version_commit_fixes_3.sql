-- M2 part 1, review round 2: a communiqué date must leave its next business day inside the national-holiday
-- calendar (to 4099), as in TypeScript; later dates are refused as dates, in the detail and in the list.
create or replace function private.market_parse_copom_detail_v1(p_content bytea,p_meeting integer)
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
 if json_typeof(r->'dataReferencia')<>'string' or not private.market_real_date_any_v1(r->>'dataReferencia') or (r->>'dataReferencia')<'1900-01-01' or (r->>'dataReferencia')>'4098-12-31'
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

create or replace function private.market_parse_copom_list_v1(p_content bytea,p_size integer) returns integer
language plpgsql immutable set search_path='' as $$
declare j json;r json;prior int;n int:=0;begin
 j:=private.market_strict_json_v1(p_content);
 if json_typeof(j)<>'object' or (select count(*) from json_object_keys(j))<>1 or json_typeof(j->'conteudo') is distinct from 'array'
 then raise exception 'market_parse_communique_shape';end if;
 if json_array_length(j->'conteudo') not between 1 and p_size then raise exception 'market_parse_communique_list_size';end if;
 for r in select e from json_array_elements(j->'conteudo') with ordinality x(e,o) order by o loop
  if json_typeof(r)<>'object' or (select string_agg(k,',' order by k collate "C") from json_object_keys(r) k) is distinct from 'dataReferencia,nro_reuniao,titulo'
  or json_typeof(r->'nro_reuniao')<>'number' or (r->'nro_reuniao')::text !~ '^[1-9][0-9]{0,3}$'
  or json_typeof(r->'dataReferencia')<>'string' or not private.market_real_date_any_v1(r->>'dataReferencia') or (r->>'dataReferencia')<'1900-01-01' or (r->>'dataReferencia')>'4098-12-31'
  or json_typeof(r->'titulo')<>'string' then raise exception 'market_parse_communique_fields';end if;
  if prior is not null and (r->'nro_reuniao')::text::int>=prior then raise exception 'market_parse_communique_order';end if;
  prior:=(r->'nro_reuniao')::text::int;n:=n+1;
 end loop;
 return n;
end $$;
