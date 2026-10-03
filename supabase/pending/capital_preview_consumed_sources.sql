-- Draft finite publisher bridge for the 17 installed extractions that the actual
-- Case01 inputs consume. This is NOT the deferred whole-corpus registry43.
-- SourceVersions must represent these extraction bytes themselves; no PDF SHA or
-- simulated input digest can stand in for a verified extraction version. Eligibility is
-- NOT physical capture and cannot admit any model or produce a ready recipe.
set search_path='';
create function private.capital_preview_consumed_corpus_registry_v1() returns jsonb
language sql immutable security definer set search_path='' as $$ select $manifest${"schemaVersion":"ai-review-corpus.v1","caseId":"gc01-analista-ib-camil","extractor":"pdftotext -layout (poppler); índices da CVM filtrados às linhas da Camil; termos de securitização dos CRA do pack v3","entries":[{"file":"01_ITR_1T26_31mai2026.txt","bytes":246448,"sha256":"05c8f9e9f8243b907036953e297873fc20870d3478086ad783393b79b0393c79"},{"file":"02_Proposta_Administracao_AGOE_2026.txt","bytes":399723,"sha256":"ca96a57352632cfa6e5fc7a0523fd2368adb36638b2ee9d9d80698556405aedb"},{"file":"af_11a_emissao.txt","bytes":13030,"sha256":"c943c71ec075ba6bec340d9748a73682c36d0073b5ced861da7e4eecba80b06a"},{"file":"af_13a_emissao.txt","bytes":55570,"sha256":"8d5e0680970867999ed84303ce96facdc16d2beb06c8e6de384f69a5e97b72a0"},{"file":"af_14a_emissao.txt","bytes":55502,"sha256":"4426e92cf59a0dea4f5db2f99e2bfccb730fe249531e0284331677627b77276f"},{"file":"af_15a_emissao.txt","bytes":56989,"sha256":"a3f325db199075f753007adeaa1fd75c01e286066f446f88db3a9c31827e109f"},{"file":"anbima_ettj_2026-09-04.csv","bytes":2934,"sha256":"531e97d7ead363068fc801156d29043024390ee9bc5bc105fb85917c607c9129"},{"file":"bcb_sgs_cdi_diario.json","bytes":124,"sha256":"bc2c8c0e9b36ba9a1a69d74be03e7ce6cd89bc290481e2320c4c745e73fb22bb"},{"file":"ca_notas_comerciais_2026-05-27.txt","bytes":7546,"sha256":"1bd55c5140c81cf51a79daece6f7027aa6b3911c7995da42b65729df71879ebe"},{"file":"ca_operacao_estruturada_2026-05-27.txt","bytes":5647,"sha256":"2ce34d4d08bd978076d72e1ae269a4c4e0aafcccacc7ff57d81eb12ef8cc7487"},{"file":"cra_257_relatorio_mensal_4t25.txt","bytes":21370,"sha256":"5e9494ae097b6a8e28c2edde694477627efc7293793c85b8bb4602b0333c161e"},{"file":"cra_292_termo_securitizacao.txt","bytes":540844,"sha256":"7e62b0be50f133cb0dce4e387f737ad24519d840dd7523d48102e03f1e566e09"},{"file":"escritura_11a_emissao.txt","bytes":174703,"sha256":"478fb2cd6d7f07965b5365cfbf3ae83f1b332a25ca9e536be0507d74431e8c96"},{"file":"escritura_13a_emissao.txt","bytes":298090,"sha256":"063f59f6892d919df3355b9ed6050f35d76c3261c5c6ec5f6e73327fdb474e23"},{"file":"escritura_14a_emissao.txt","bytes":299994,"sha256":"00174dc2087f611d1a8f7884157674f23dc9083f20df2d94090233bbb084fe26"},{"file":"escritura_15a_emissao.txt","bytes":334753,"sha256":"acb1f0aaa8ee908fbb496e11b440907d86acaebec72f698c345b426e88acc970"},{"file":"ri_release_1t26.txt","bytes":266247,"sha256":"be553465ea648a2606b37f6715bbb9bd8b0aff435614f1f5b50d6b17d35efa0a"}]}$manifest$::jsonb; $$;
revoke all on function private.capital_preview_consumed_corpus_registry_v1() from public,anon,authenticated,service_role;
create table private.capital_preview_consumed_bases(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),request_id uuid not null,
 case_id text not null check(case_id='gc01-analista-ib-camil'),case_version text not null check(case_version='2026.09.05-v1'),
 corpus_manifest_fingerprint text not null check(corpus_manifest_fingerprint='2dbedade03f457073905d66f006270a044d2a49fc5671d87280ab0e23f7d230d'),
 binding_fingerprint text not null check(binding_fingerprint~'^[a-f0-9]{64}$'),
 published_by uuid not null references auth.users(id),published_at timestamptz not null,expires_at timestamptz not null check(isfinite(expires_at)),
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 unique(organization_id,id),unique(organization_id,request_id),check(published_at<expires_at));
create index capital_preview_consumed_basis_actor_idx on private.capital_preview_consumed_bases(published_by);
create table private.capital_preview_consumed_basis_sources(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,basis_id uuid not null,file_name text not null,
 source_version_id uuid not null,rights_version_id uuid not null,source_binding_id uuid not null,
 observed_sha256 text not null check(observed_sha256~'^[a-f0-9]{64}$'),byte_length bigint not null check(byte_length between 1 and 1048576),
 source_url text not null,public_payload_fingerprint text not null check(public_payload_fingerprint~'^[a-f0-9]{64}$'),
 license_pins jsonb not null check(jsonb_typeof(license_pins)='array'),dependency_fingerprint text not null check(dependency_fingerprint~'^[a-f0-9]{64}$'),
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 unique(organization_id,id),unique(organization_id,basis_id,file_name),unique(organization_id,basis_id,source_version_id),
 foreign key(organization_id,basis_id)references private.capital_preview_consumed_bases(organization_id,id),
 foreign key(organization_id,source_version_id,rights_version_id)references private.source_rights_versions(organization_id,source_version_id,id),
 foreign key(organization_id,source_binding_id)references public.source_bindings(organization_id,id));
create index capital_preview_consumed_basis_source_version_idx on private.capital_preview_consumed_basis_sources(organization_id,source_version_id,rights_version_id);
create index capital_preview_consumed_basis_source_binding_idx on private.capital_preview_consumed_basis_sources(organization_id,source_binding_id);

create function private.capital_preview_consumed_basis_deadline_v1(p_org uuid,p_basis uuid)
returns timestamptz language plpgsql volatile security definer set search_path='' as $$
declare basis private.capital_preview_consumed_bases;component private.capital_preview_consumed_basis_sources;right_row private.source_rights_versions;
 expected jsonb;proof jsonb;deadline timestamptz;
begin
 select * into basis from private.capital_preview_consumed_bases where organization_id=p_org and id=p_basis;
 if basis.id is null or basis.expires_at<=clock_timestamp() or(select count(*)from private.capital_preview_consumed_basis_sources where organization_id=p_org and basis_id=p_basis)<>17 then return null;end if;
 deadline:=basis.expires_at;
 for component in select * from private.capital_preview_consumed_basis_sources where organization_id=p_org and basis_id=p_basis order by file_name loop
 select e.value into expected from jsonb_array_elements(private.capital_preview_consumed_corpus_registry_v1()->'entries') e where e.value->>'file'=component.file_name;
 if expected is null or expected->>'sha256'<>component.observed_sha256 or(expected->>'bytes')::bigint<>component.byte_length then return null;end if;
 proof:=private.capital_public_license_proof_v1(p_org,component.source_version_id,component.rights_version_id,component.source_binding_id,
 component.source_url,component.public_payload_fingerprint,basis.published_at,component.license_pins,component.dependency_fingerprint);
 if proof is null then return null;end if;
 if not exists(select 1 from public.source_versions v join private.source_version_verifications verified on verified.organization_id=v.organization_id and verified.source_version_id=v.id
 where v.organization_id=p_org and v.id=component.source_version_id and v.declared_sha256=component.observed_sha256 and v.byte_size=component.byte_length
 and verified.observed_sha256=component.observed_sha256 and verified.observed_byte_size=component.byte_length)then return null;end if;
 -- The persisted and current rights are both restrictions. Later permissive
 -- revisions do not enlarge an earlier publication's finite deadline.
 for right_row in select rights.* from private.source_rights_versions rights
 where rights.organization_id=p_org and rights.id in(select(x->>'rightsVersionId')::uuid from jsonb_array_elements(component.license_pins)x)
 union select rights.* from private.source_rights_versions rights where rights.organization_id=p_org and rights.source_version_id in(select(x->>'sourceVersionId')::uuid from jsonb_array_elements(component.license_pins)x)
 and not exists(select 1 from private.source_rights_versions later where later.organization_id=rights.organization_id and later.source_version_id=rights.source_version_id and later.revision>rights.revision)loop
 if right_row.expires_at is null or right_row.store_until is null or not('process'=any(right_row.operations))then return null;end if;
 deadline:=least(deadline,right_row.expires_at,right_row.store_until);
 end loop;
 end loop;
 return case when deadline>clock_timestamp()then deadline end;
end;$$;
revoke all on function private.capital_preview_consumed_basis_deadline_v1(uuid,uuid)from public,anon,authenticated,service_role;

create function private.publish_capital_preview_consumed_basis_v1(p_request_id uuid,p_bindings jsonb,p_expires_at timestamptz)
returns jsonb language plpgsql security definer set search_path='' as $$
declare org uuid;basis private.capital_preview_consumed_bases;version_row public.source_versions;source_row public.sources;
 binding_row public.source_bindings;right_row private.source_rights_versions;entry jsonb;mapping jsonb;proof jsonb;fp text;
 published_at timestamptz:=clock_timestamp();pins jsonb:='[]'::jsonb;deadline timestamptz;
begin
 if auth.uid()is null then raise exception 'capital_preview_publication_denied' using errcode='42501';end if;
 if p_request_id is null or jsonb_typeof(p_bindings)is distinct from 'array' or jsonb_array_length(p_bindings)<>17
 or p_expires_at is null or not isfinite(p_expires_at)or p_expires_at<=published_at
 or exists(select 1 from jsonb_array_elements(p_bindings)x where jsonb_typeof(x)is distinct from 'object'
 or not(x?'file'and x?'sourceVersionId'and x?'sourceBindingId')or exists(select 1 from jsonb_object_keys(x)k where k not in('file','sourceVersionId','sourceBindingId')))
 or(select count(distinct x->>'file')from jsonb_array_elements(p_bindings)x)<>17
 or(select count(distinct x->>'sourceVersionId')from jsonb_array_elements(p_bindings)x)<>17 then raise exception 'capital_preview_basis_invalid' using errcode='22023';end if;
 select organization_id into org from public.source_versions where id=(p_bindings->0->>'sourceVersionId')::uuid;
 if org is null or not exists(select 1 from public.organizations where id=org and organization_type='offroad')
 or not exists(select 1 from private.principals where organization_id=org and user_id=auth.uid()and kind='human'and revoked_at is null)then raise exception 'capital_preview_publication_denied' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('resource-policy:'||org::text,0));
 select encode(extensions.digest(coalesce(jsonb_agg(x order by x->>'file'),'[]'::jsonb)::text,'sha256'),'hex')into fp from jsonb_array_elements(p_bindings)x;
 -- Validate publisher authority and current public rights even on an idempotent
 -- request; request ids are never a surviving permission after revocation.
 for entry in select value from jsonb_array_elements(private.capital_preview_consumed_corpus_registry_v1()->'entries')loop
 select value into mapping from jsonb_array_elements(p_bindings)where value->>'file'=entry->>'file';
 if mapping is null then raise exception 'capital_preview_basis_missing_source' using errcode='42501';end if;
 select * into version_row from public.source_versions where organization_id=org and id=(mapping->>'sourceVersionId')::uuid;
 select * into source_row from public.sources where organization_id=org and id=version_row.source_id;
 select * into binding_row from public.source_bindings where organization_id=org and id=(mapping->>'sourceBindingId')::uuid;
 if version_row.id is null or binding_row.source_version_id is distinct from version_row.id or binding_row.revoked_at is not null
 or version_row.declared_sha256 is distinct from entry->>'sha256' or version_row.byte_size is distinct from(entry->>'bytes')::bigint
 or not private.can_access_resource_v1(org,source_row.origin_resource_id,'manage')or not private.can_access_resource_v1(org,source_row.origin_resource_id,'read')
 or not private.evaluate_resource_policy_v1(org,source_row.origin_resource_id,auth.uid(),'work','publication')
 or not private.can_access_resource_v1(org,binding_row.resource_id,'read')
 or not exists(select 1 from private.source_version_verifications where organization_id=org and source_version_id=version_row.id
 and observed_sha256=entry->>'sha256'and observed_byte_size=(entry->>'bytes')::bigint)then raise exception 'capital_preview_publication_denied' using errcode='42501';end if;
 select * into right_row from private.source_rights_versions where organization_id=org and source_version_id=version_row.id order by revision desc limit 1;
 if right_row.audience is distinct from 'public_raw_reuse'or not('process'=any(right_row.operations))or right_row.expires_at<p_expires_at or right_row.store_until<p_expires_at then raise exception 'capital_preview_publication_denied' using errcode='42501';end if;
 proof:=private.capital_public_license_proof_v1(org,version_row.id,right_row.id,binding_row.id,right_row.public_source_url,right_row.public_payload_sha256,published_at);
 if proof is null then raise exception 'capital_preview_publication_denied' using errcode='42501';end if;
 pins:=pins||jsonb_build_array(jsonb_build_object('file',entry->>'file','version',version_row.id,'right',right_row.id,'binding',binding_row.id,'url',right_row.public_source_url,'payload',right_row.public_payload_sha256,'proof',proof));
 end loop;
 select * into basis from private.capital_preview_consumed_bases where organization_id=org and request_id=p_request_id;
 if basis.id is not null then
 if basis.binding_fingerprint<>fp or basis.expires_at<>p_expires_at then raise exception 'capital_preview_publication_conflict' using errcode='23505';end if;
 else
 insert into private.capital_preview_consumed_bases(organization_id,request_id,case_id,case_version,corpus_manifest_fingerprint,binding_fingerprint,published_by,published_at,expires_at)
 values(org,p_request_id,'gc01-analista-ib-camil','2026.09.05-v1','2dbedade03f457073905d66f006270a044d2a49fc5671d87280ab0e23f7d230d',fp,auth.uid(),published_at,p_expires_at)returning * into basis;
 for mapping in select value from jsonb_array_elements(pins)loop
 select value into entry from jsonb_array_elements(private.capital_preview_consumed_corpus_registry_v1()->'entries')where value->>'file'=mapping->>'file';
 insert into private.capital_preview_consumed_basis_sources(organization_id,basis_id,file_name,source_version_id,rights_version_id,source_binding_id,observed_sha256,byte_length,source_url,public_payload_fingerprint,license_pins,dependency_fingerprint)
 values(org,basis.id,entry->>'file',(mapping->>'version')::uuid,(mapping->>'right')::uuid,(mapping->>'binding')::uuid,entry->>'sha256',(entry->>'bytes')::bigint,mapping->>'url',mapping->>'payload',mapping->'proof'->'pins',mapping->'proof'->>'dependencyFingerprint');
 end loop;
 end if;
 deadline:=private.capital_preview_consumed_basis_deadline_v1(org,basis.id);
 if deadline is null then raise exception 'capital_preview_publication_denied' using errcode='42501';end if;
 return jsonb_build_object('schemaVersion','capital-preview-frozen-basis-publication.v1','state','eligible_not_captured','basisId',basis.id,'caseId',basis.case_id,'caseVersion',basis.case_version,'corpusManifestFingerprint',basis.corpus_manifest_fingerprint,'sourceCount',17,'expiresAt',deadline);
end;$$;
create function public.publish_capital_preview_consumed_basis_v1(p_request_id uuid,p_bindings jsonb,p_expires_at timestamptz)
returns jsonb language sql security invoker set search_path=''as $$select private.publish_capital_preview_consumed_basis_v1(p_request_id,p_bindings,p_expires_at);$$;
revoke all on function private.publish_capital_preview_consumed_basis_v1(uuid,jsonb,timestamptz),public.publish_capital_preview_consumed_basis_v1(uuid,jsonb,timestamptz)from public,anon,authenticated,service_role;
grant execute on function private.publish_capital_preview_consumed_basis_v1(uuid,jsonb,timestamptz),public.publish_capital_preview_consumed_basis_v1(uuid,jsonb,timestamptz)to authenticated;

do $$declare t text;cmd text;begin
 foreach t in array array['capital_preview_consumed_bases','capital_preview_consumed_basis_sources']loop
 execute format('alter table private.%I enable row level security',t);execute format('alter table private.%I force row level security',t);
 execute format('revoke all on private.%I from public,anon,authenticated,service_role',t);
 foreach cmd in array array['select','insert','update','delete']loop execute format('create policy %I on private.%I as restrictive for %s to anon,authenticated %s',t||'_deny_'||cmd,t,cmd,case when cmd='insert'then'with check(false)'when cmd='update'then'using(false)with check(false)'else'using(false)'end);end loop;
 execute format('create trigger %I before update on private.%I for each row execute function private.set_updated_at()',t||'_updated_at',t);
 execute format('create trigger %I before update or delete on private.%I for each row execute function private.reject_source_version_mutation_v1()',t||'_immutable',t);
 execute format('create trigger %I before truncate on private.%I for each statement execute function private.reject_review_history_mutation_v1()',t||'_no_truncate',t);
 execute format('create trigger %I after insert on private.%I for each row execute function private.capture_identity_audit_v1()',t||'_audit',t);
 end loop;
end$$;
