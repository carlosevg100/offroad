-- M2 part 3: the publication manifest is a value materialized once, not a temporary table, so the
-- function is statically checkable and leaves nothing behind in the session.
create or replace function private.publish_market_odbl_release_v1(p_command uuid,p_code_commit text,p_actor_user_id uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare prior private.market_odbl_releases;prev private.market_odbl_releases;fp text;d date;k timestamptz;lim timestamptz;nz private.market_normalizations;
 ec private.market_endpoint_contracts;src private.market_source_revisions;cand uuid[];versions uuid[];acquisitions uuid[];
 obs jsonb;changes jsonb;alter_ jsonb;payload jsonb;txt text;rid uuid:=gen_random_uuid();num integer;contract_text text;policy_text text;nd private.market_normalizations;defs jsonb:='[]';pick jsonb;begin
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
 -- The newest normalization of the series names the object and the endpoint; versions of every normalization of the same
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
 -- The manifest is materialized once, as a value, and every later step reads that same set.
 select coalesce(jsonb_agg(jsonb_build_object('period',z.period_end,'value',z.value,'version_id',z.id,'acquisition_id',z.acquisition_id,
  'acquired_at',z.acquired_at,'normalization_id',z.normalization_id) order by z.period_end),'[]') into pick
 from (select distinct on (o.period_end) o.period_end,o.value,v.id,v.acquisition_id,a.acquired_at,v.normalization_id
  from unnest(coalesce(cand,'{}')) u(id) join private.market_versions v on v.id=u.id join private.market_acquisitions a on a.id=v.acquisition_id
  join private.market_observations o on o.version_id=v.id
  where private.market_version_readable_v1(v.id,'consume') and o.period_end>=ec.homologated_from and o.period_end<=d and o.acquired_at<lim
  order by o.period_end,a.acquired_at desc,v.id::text collate "C" desc) z;
 if jsonb_array_length(pick)=0 then raise exception 'market_odbl_nothing_to_publish' using errcode='55000';end if;
 select coalesce(jsonb_agg(jsonb_build_object('period',to_char(p.period,'YYYY-MM-DD'),'value',private.market_trim_decimal_v1(p.value::text),
  'versionId',p.version_id::text,'acquisitionId',p.acquisition_id::text,'normalization',p.normalization_id) order by p.period),'[]') into obs from jsonb_to_recordset(pick) as p(period date,value numeric,version_id uuid,acquisition_id uuid,acquired_at timestamptz,normalization_id text);
 -- Every change of the assembled manifest carries the communiqué of its meeting, in the direction and at
 -- the rate of the change; one without it makes the edition refuse.
 select coalesce(jsonb_agg(jsonb_build_object('period',to_char(p.period,'YYYY-MM-DD'),'from',private.market_trim_decimal_v1(q.value::text),
  'to',private.market_trim_decimal_v1(p.value::text),'meeting',m.meeting::text,'referenceDate',to_char(m.reference_date,'YYYY-MM-DD'),'decision',m.decision,
  'targetPct',private.market_trim_decimal_v1(m.target_pct),'recordSha256',m.record_sha256) order by p.period),'[]') into changes
 from jsonb_to_recordset(pick) as p(period date,value numeric,version_id uuid,acquisition_id uuid,acquired_at timestamptz,normalization_id text) join jsonb_to_recordset(pick) as q(period date,value numeric) on q.period=p.period-1
 left join private.market_copom_meetings m on m.series_change_date=p.period
 where p.value<>q.value;
 if exists(select 1 from jsonb_array_elements(changes) c where c->>'meeting' is null
  or (c->>'decision')<>(case when (c->>'to')::numeric>(c->>'from')::numeric then 'raise' else 'cut' end)
  or (c->>'targetPct')::numeric<>(c->>'to')::numeric
  or not exists(select 1 from jsonb_to_recordset(pick) as p(period date,value numeric,version_id uuid,acquisition_id uuid,acquired_at timestamptz,normalization_id text) join private.market_version_evidence e on e.version_id=p.version_id
    where p.period=(c->>'period')::date and e.meeting=(c->>'meeting')::int))
 then raise exception 'market_odbl_change_without_communique' using errcode='55000';end if;
 -- Each normalization the manifest actually uses is described as data, its contract text rebuilt and
 -- checked against its digest, and its quality policy text with its own digest.
 for nd in select x.* from private.market_normalizations x where x.id in (select distinct p.normalization_id from jsonb_to_recordset(pick) as p(period date,value numeric,version_id uuid,acquisition_id uuid,acquired_at timestamptz,normalization_id text)) order by x.id collate "C" loop
  contract_text:=concat_ws(E'\n','market-series-contract.v1','id:'||nd.id,'host:'||ec.host,'path:'||ec.path,'unit:'||nd.unit,'scale:'||nd.scale,
   'convention:'||nd.convention,'parser:'||nd.parser,'license:'||ec.license_evidence,'homologated-from:'||to_char(ec.homologated_from,'YYYY-MM-DD'),
   'max-window-years:'||ec.max_window_years,'calendar:'||nd.calendar);
  if encode(extensions.digest(convert_to(contract_text,'UTF8'),'sha256'),'hex')<>nd.normalization_sha256 then raise exception 'market_odbl_contract_drift' using errcode='55000';end if;
  policy_text:=private.market_quality_policy_text_v1(nd.quality_policy_id,nd.quality_policy_version);
  if policy_text is null then raise exception 'market_odbl_policy_unknown' using errcode='55000';end if;
  defs:=defs||jsonb_build_array(jsonb_build_object('id',nd.id,'contractSha256',nd.normalization_sha256,'contractText',contract_text,
   'unit',nd.unit,'scale',nd.scale,'convention',nd.convention,'calendar',nd.calendar,'parser',nd.parser,
   'qualityPolicy',jsonb_build_object('id',nd.quality_policy_id,'version',nd.quality_policy_version,'text',policy_text,
    'sha256',encode(extensions.digest(convert_to(policy_text,'UTF8'),'sha256'),'hex'))));
 end loop;
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
   'rulesChanged',to_jsonb((prev.payload_text::jsonb#>'{series,normalizations}') is distinct from defs
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
  'series',jsonb_build_object('logicalId',nz.logical_id,'endpointContract',ec.id,'endpointContractSha256',ec.contract_sha256,'normalizations',defs),
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
 select distinct rid,p.version_id,p.acquisition_id from jsonb_to_recordset(pick) as p(period date,value numeric,version_id uuid,acquisition_id uuid,acquired_at timestamptz,normalization_id text);
 return jsonb_build_object('releaseNumber',num,'sha256',encode(extensions.digest(convert_to(txt,'UTF8'),'sha256'),'hex'),'replayed',false);
end $$;
revoke all on function private.publish_market_odbl_release_v1(uuid,text,uuid) from public,anon,authenticated,service_role;
