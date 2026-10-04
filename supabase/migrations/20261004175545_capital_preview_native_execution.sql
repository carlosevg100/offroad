BEGIN;
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

-- Closed observed request policy for the two actual paid preview boundaries.
-- This pure registry is not a processing grant. Input bytes must be derived by
-- the native boundary command from its physically retained request, never caller budget claims.
set search_path='';
create function private.capital_preview_dispatch_policy_v1(p_boundary text,p_model text,p_input_bytes bigint)
returns jsonb language plpgsql immutable security definer set search_path=''as $$
declare provider text;effort text;system_sha text;system_bytes bigint;schema_fp text;schema_bytes bigint;output_tokens bigint;timeout_ms bigint;
 pricing_wire text;tuple jsonb;wire text;output_rate bigint;bound bigint;
begin
 if p_boundary is null or p_boundary not in('questions','synthesis')or p_model is null or p_model not in('claude-sonnet-5','gpt-5.6-terra')
 or p_input_bytes is null or p_input_bytes not between 1 and 100000 then raise exception 'capital_preview_policy_invalid'using errcode='22023';end if;
 provider:=case when p_model='claude-sonnet-5'then'anthropic'else'openai'end;
 effort:=case when p_boundary='questions'then'low'else'medium'end;
 system_sha:=case when p_boundary='questions'then'a3508e2274b4346bf9376a2d39d9fcf26ff08c3230a6261b8a00e6a342fe8976'else'735cd41c4bed59b528c1d13782316a92f54a85305e61dd3e195e305ff031b468'end;
 system_bytes:=case when p_boundary='questions'then 1064 else 1176 end;
 schema_fp:=case when p_boundary='questions'then'b594c9bd033252269569fa0f18ae6a56898e66a0fc5a0d1488fbfbda982a2fba'else'e29b92a530dd7aaae1eca548ab307950299146897a70b9ccf69d146796efb3d0'end;
 schema_bytes:=case when p_boundary='questions'then 935 else 865 end;
 output_tokens:=case when p_boundary='questions'then 2000 else 6000 end;
 timeout_ms:=case when p_boundary='questions'then 60000 else 120000 end;
 output_rate:=case when p_model='claude-sonnet-5'then 10000000 else 12000000 end;
 pricing_wire:=case when p_model='claude-sonnet-5'then'{"cacheWrite":2.5,"cachedInput":0.2,"input":2,"longContext":null,"output":10}'else'{"cacheWrite":2.5,"cachedInput":0.2,"input":2,"longContext":{"aboveInputTokens":272000,"inputMultiplier":2,"outputMultiplier":1.5},"output":12}'end;
 tuple:=jsonb_build_array('capital-preview-dispatch-policy.v1',p_boundary,provider,p_model,effort,system_sha,system_bytes,schema_fp,schema_bytes,output_tokens,timeout_ms);
 select '['||string_agg(x.value::text,','order by x.ordinality)||','||pricing_wire||']'into wire from jsonb_array_elements(tuple)with ordinality x(value,ordinality);
 -- Logical JSON schemas exceed actual strict provider schemas (731/638B).
 -- Byte-to-token upper bound + framing + 10 percent headroom; no fake cache discount.
 bound:=ceil(((p_input_bytes+system_bytes+schema_bytes+1024)::numeric*2500000+output_tokens::numeric*output_rate)*11/10000000)::bigint;
 return jsonb_build_object('policyFingerprint',encode(extensions.digest(wire,'sha256'),'hex'),'taskId',case when p_boundary='questions'then'A01'else'A02'end,
 'task',case when p_boundary='questions'then'preview_questions'else'preview_synthesis'end,'schemaName',case when p_boundary='questions'then'preview_questions_output'else'preview_synthesis_output'end,
 'maxOutputTokens',output_tokens,'timeoutMs',timeout_ms,'serverBoundMicroUsd',bound);
end;$$;
revoke all on function private.capital_preview_dispatch_policy_v1(text,text,bigint)from public,anon,authenticated,service_role;

-- Draft finite preview run and its two paid boundary recipes. Requires S11's
-- shared base-authority fingerprint and the finite 17-source publication bridge.
-- No raw context/input/output is stored in any row below.
set search_path='';
create function private.capital_preview_workflow_v1(p_composition text)returns jsonb language sql immutable security definer set search_path=''as $$select ('{"prepare_meeting":{"workflow":{"id":"refinance-liability-management.meeting_plan","version":"2026.09.07-v1","fingerprint":"41f394506a226c18c996724d4fe8aaccafb945950d9348ecdbc62fcb66ecebbc"},"steps":[{"taskId":"C05","methodId":"build-debt-ledger","methodVersion":"2026.09.05-v15","executorKey":"integration-preview.build-debt-ledger","artifactType":"preview_debt_ledger","dependencies":[]},{"taskId":"D07","methodId":"reconcile-financial-statements","methodVersion":"2026.09.05-v9","executorKey":"integration-preview.reconcile-financial-statements","artifactType":"preview_financial_statements","dependencies":[]},{"taskId":"C09","methodId":"reconcile-covenant-definitions","methodVersion":"2026.09.05-v14","executorKey":"integration-preview.reconcile-covenant-definitions","artifactType":"preview_covenants","dependencies":["C05","D07"]},{"taskId":"C10","methodId":"diagnose-maturity-wall","methodVersion":"2026.09.05-v8","executorKey":"integration-preview.diagnose-maturity-wall","artifactType":"preview_maturity_wall","dependencies":["C05"]},{"taskId":"C07","methodId":"build-interest-and-indexation-schedule","methodVersion":"2026.09.05-v7","executorKey":"integration-preview.build-interest-and-indexation-schedule","artifactType":"preview_interest_schedule","dependencies":["C05"]},{"taskId":"S07","methodId":"estimate-exit-cost-by-series","methodVersion":"2026.09.05-v8","executorKey":"integration-preview.estimate-exit-cost-by-series","artifactType":"preview_exit_costs","dependencies":["C05","C07"]},{"taskId":"C08","methodId":"declare-scenarios","methodVersion":"2026.09.05-v6","executorKey":"integration-preview.declare-scenarios","artifactType":"preview_scenarios","dependencies":["C05","C10"]},{"taskId":"S10","methodId":"compare-refinancing-before-after","methodVersion":"2026.09.05-v7","executorKey":"integration-preview.compare-refinancing-before-after","artifactType":"preview_alternatives","dependencies":["C05","C09","C10","S07","C08"]},{"taskId":"A01","methodId":"plan-meeting-brief","methodVersion":"2026.09.05-v7","executorKey":"integration-preview.plan-meeting-brief","artifactType":"preview_meeting_brief","dependencies":["C05","D07","C09","C10","C07","S07","C08","S10"]}]},"prepare_material":{"workflow":{"id":"refinance-liability-management.material","version":"2026.09.07-v1","fingerprint":"a0c3ee4ee72690be7ced68b739e2afa65770628f35fda6df3d2d29d407a4f245"},"steps":[{"taskId":"C05","methodId":"build-debt-ledger","methodVersion":"2026.09.05-v15","executorKey":"integration-preview.build-debt-ledger","artifactType":"preview_debt_ledger","dependencies":[]},{"taskId":"D07","methodId":"reconcile-financial-statements","methodVersion":"2026.09.05-v9","executorKey":"integration-preview.reconcile-financial-statements","artifactType":"preview_financial_statements","dependencies":[]},{"taskId":"C09","methodId":"reconcile-covenant-definitions","methodVersion":"2026.09.05-v14","executorKey":"integration-preview.reconcile-covenant-definitions","artifactType":"preview_covenants","dependencies":["C05","D07"]},{"taskId":"C10","methodId":"diagnose-maturity-wall","methodVersion":"2026.09.05-v8","executorKey":"integration-preview.diagnose-maturity-wall","artifactType":"preview_maturity_wall","dependencies":["C05"]},{"taskId":"C07","methodId":"build-interest-and-indexation-schedule","methodVersion":"2026.09.05-v7","executorKey":"integration-preview.build-interest-and-indexation-schedule","artifactType":"preview_interest_schedule","dependencies":["C05"]},{"taskId":"S07","methodId":"estimate-exit-cost-by-series","methodVersion":"2026.09.05-v8","executorKey":"integration-preview.estimate-exit-cost-by-series","artifactType":"preview_exit_costs","dependencies":["C05","C07"]},{"taskId":"C08","methodId":"declare-scenarios","methodVersion":"2026.09.05-v6","executorKey":"integration-preview.declare-scenarios","artifactType":"preview_scenarios","dependencies":["C05","C10"]},{"taskId":"S10","methodId":"compare-refinancing-before-after","methodVersion":"2026.09.05-v7","executorKey":"integration-preview.compare-refinancing-before-after","artifactType":"preview_alternatives","dependencies":["C05","C09","C10","S07","C08"]},{"taskId":"A01","methodId":"plan-meeting-brief","methodVersion":"2026.09.05-v7","executorKey":"integration-preview.plan-meeting-brief","artifactType":"preview_meeting_brief","dependencies":["C05","D07","C09","C10","C07","S07","C08","S10"]},{"taskId":"A02","methodId":"write-meeting-synthesis","methodVersion":"2026.09.05-v1","executorKey":"integration-preview.write-meeting-synthesis","artifactType":"preview_material","dependencies":["C05","D07","C09","C10","C07","S07","C08","S10","A01"]}]},"change_premise":{"workflow":{"id":"refinance-liability-management.meeting_plan","version":"2026.09.07-v1","fingerprint":"41f394506a226c18c996724d4fe8aaccafb945950d9348ecdbc62fcb66ecebbc"},"steps":[{"taskId":"C05","methodId":"build-debt-ledger","methodVersion":"2026.09.05-v15","executorKey":"integration-preview.build-debt-ledger","artifactType":"preview_debt_ledger","dependencies":[]},{"taskId":"D07","methodId":"reconcile-financial-statements","methodVersion":"2026.09.05-v9","executorKey":"integration-preview.reconcile-financial-statements","artifactType":"preview_financial_statements","dependencies":[]},{"taskId":"C09","methodId":"reconcile-covenant-definitions","methodVersion":"2026.09.05-v14","executorKey":"integration-preview.reconcile-covenant-definitions","artifactType":"preview_covenants","dependencies":["C05","D07"]},{"taskId":"C10","methodId":"diagnose-maturity-wall","methodVersion":"2026.09.05-v8","executorKey":"integration-preview.diagnose-maturity-wall","artifactType":"preview_maturity_wall","dependencies":["C05"]},{"taskId":"C07","methodId":"build-interest-and-indexation-schedule","methodVersion":"2026.09.05-v7","executorKey":"integration-preview.build-interest-and-indexation-schedule","artifactType":"preview_interest_schedule","dependencies":["C05"]},{"taskId":"S07","methodId":"estimate-exit-cost-by-series","methodVersion":"2026.09.05-v8","executorKey":"integration-preview.estimate-exit-cost-by-series","artifactType":"preview_exit_costs","dependencies":["C05","C07"]},{"taskId":"C08","methodId":"declare-scenarios","methodVersion":"2026.09.05-v6","executorKey":"integration-preview.declare-scenarios","artifactType":"preview_scenarios","dependencies":["C05","C10"]},{"taskId":"S10","methodId":"compare-refinancing-before-after","methodVersion":"2026.09.05-v7","executorKey":"integration-preview.compare-refinancing-before-after","artifactType":"preview_alternatives","dependencies":["C05","C09","C10","S07","C08"]},{"taskId":"A01","methodId":"plan-meeting-brief","methodVersion":"2026.09.05-v7","executorKey":"integration-preview.plan-meeting-brief","artifactType":"preview_meeting_brief","dependencies":["C05","D07","C09","C10","C07","S07","C08","S10"]}]},"deepen":{"workflow":{"id":"refinance-liability-management.meeting_plan","version":"2026.09.07-v1","fingerprint":"41f394506a226c18c996724d4fe8aaccafb945950d9348ecdbc62fcb66ecebbc"},"steps":[{"taskId":"C05","methodId":"build-debt-ledger","methodVersion":"2026.09.05-v15","executorKey":"integration-preview.build-debt-ledger","artifactType":"preview_debt_ledger","dependencies":[]},{"taskId":"D07","methodId":"reconcile-financial-statements","methodVersion":"2026.09.05-v9","executorKey":"integration-preview.reconcile-financial-statements","artifactType":"preview_financial_statements","dependencies":[]},{"taskId":"C09","methodId":"reconcile-covenant-definitions","methodVersion":"2026.09.05-v14","executorKey":"integration-preview.reconcile-covenant-definitions","artifactType":"preview_covenants","dependencies":["C05","D07"]},{"taskId":"C10","methodId":"diagnose-maturity-wall","methodVersion":"2026.09.05-v8","executorKey":"integration-preview.diagnose-maturity-wall","artifactType":"preview_maturity_wall","dependencies":["C05"]},{"taskId":"C07","methodId":"build-interest-and-indexation-schedule","methodVersion":"2026.09.05-v7","executorKey":"integration-preview.build-interest-and-indexation-schedule","artifactType":"preview_interest_schedule","dependencies":["C05"]},{"taskId":"S07","methodId":"estimate-exit-cost-by-series","methodVersion":"2026.09.05-v8","executorKey":"integration-preview.estimate-exit-cost-by-series","artifactType":"preview_exit_costs","dependencies":["C05","C07"]},{"taskId":"C08","methodId":"declare-scenarios","methodVersion":"2026.09.05-v6","executorKey":"integration-preview.declare-scenarios","artifactType":"preview_scenarios","dependencies":["C05","C10"]},{"taskId":"S10","methodId":"compare-refinancing-before-after","methodVersion":"2026.09.05-v7","executorKey":"integration-preview.compare-refinancing-before-after","artifactType":"preview_alternatives","dependencies":["C05","C09","C10","S07","C08"]},{"taskId":"A01","methodId":"plan-meeting-brief","methodVersion":"2026.09.05-v7","executorKey":"integration-preview.plan-meeting-brief","artifactType":"preview_meeting_brief","dependencies":["C05","D07","C09","C10","C07","S07","C08","S10"]}]},"prepare_decision":{"workflow":{"id":"refinance-liability-management.material","version":"2026.09.07-v1","fingerprint":"a0c3ee4ee72690be7ced68b739e2afa65770628f35fda6df3d2d29d407a4f245"},"steps":[{"taskId":"C05","methodId":"build-debt-ledger","methodVersion":"2026.09.05-v15","executorKey":"integration-preview.build-debt-ledger","artifactType":"preview_debt_ledger","dependencies":[]},{"taskId":"D07","methodId":"reconcile-financial-statements","methodVersion":"2026.09.05-v9","executorKey":"integration-preview.reconcile-financial-statements","artifactType":"preview_financial_statements","dependencies":[]},{"taskId":"C09","methodId":"reconcile-covenant-definitions","methodVersion":"2026.09.05-v14","executorKey":"integration-preview.reconcile-covenant-definitions","artifactType":"preview_covenants","dependencies":["C05","D07"]},{"taskId":"C10","methodId":"diagnose-maturity-wall","methodVersion":"2026.09.05-v8","executorKey":"integration-preview.diagnose-maturity-wall","artifactType":"preview_maturity_wall","dependencies":["C05"]},{"taskId":"C07","methodId":"build-interest-and-indexation-schedule","methodVersion":"2026.09.05-v7","executorKey":"integration-preview.build-interest-and-indexation-schedule","artifactType":"preview_interest_schedule","dependencies":["C05"]},{"taskId":"S07","methodId":"estimate-exit-cost-by-series","methodVersion":"2026.09.05-v8","executorKey":"integration-preview.estimate-exit-cost-by-series","artifactType":"preview_exit_costs","dependencies":["C05","C07"]},{"taskId":"C08","methodId":"declare-scenarios","methodVersion":"2026.09.05-v6","executorKey":"integration-preview.declare-scenarios","artifactType":"preview_scenarios","dependencies":["C05","C10"]},{"taskId":"S10","methodId":"compare-refinancing-before-after","methodVersion":"2026.09.05-v7","executorKey":"integration-preview.compare-refinancing-before-after","artifactType":"preview_alternatives","dependencies":["C05","C09","C10","S07","C08"]},{"taskId":"A01","methodId":"plan-meeting-brief","methodVersion":"2026.09.05-v7","executorKey":"integration-preview.plan-meeting-brief","artifactType":"preview_meeting_brief","dependencies":["C05","D07","C09","C10","C07","S07","C08","S10"]},{"taskId":"A02","methodId":"write-meeting-synthesis","methodVersion":"2026.09.05-v1","executorKey":"integration-preview.write-meeting-synthesis","artifactType":"preview_material","dependencies":["C05","D07","C09","C10","C07","S07","C08","S10","A01"]}]}}'::jsonb)->p_composition;$$;
create table private.capital_preview_runs(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),
 work_id uuid not null,job_id uuid not null,plan_id uuid not null,brief_id uuid not null,session_id uuid not null,
 human_subject_id uuid not null references auth.users(id),worker_account_id uuid not null references auth.users(id),
 publisher_organization_id uuid not null,basis_id uuid not null,composition text not null check(composition in('prepare_meeting','prepare_material','change_premise','deepen','prepare_decision')),
 plan_fingerprint text not null,context_fingerprint text not null,base_authority_fingerprint text not null,workflow_fingerprint text not null,
 consumed_basis_fingerprint text,retention_policy_id uuid not null references private.capital_public_retention_policies(id),
 effective_budget_micro_usd bigint not null check(effective_budget_micro_usd between 1 and 600000),effective_max_dispatches integer not null check(effective_max_dispatches between 1 and 4),
 captured_at timestamptz not null,expires_at timestamptz not null check(isfinite(expires_at)),
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 unique(organization_id,id),unique(organization_id,work_id,id),unique(organization_id,job_id),unique(organization_id,work_id,plan_id,brief_id),
 foreign key(organization_id,work_id)references public.capital_projects(organization_id,id),
 foreign key(organization_id,job_id)references public.processing_jobs(organization_id,id),
 foreign key(organization_id,plan_id)references public.capital_project_plans(organization_id,id),
 foreign key(publisher_organization_id,basis_id)references private.capital_preview_consumed_bases(organization_id,id));
create index capital_preview_run_work_idx on private.capital_preview_runs(organization_id,work_id);
create index capital_preview_run_plan_idx on private.capital_preview_runs(organization_id,plan_id);
create index capital_preview_run_publisher_idx on private.capital_preview_runs(publisher_organization_id,basis_id);
create index capital_preview_run_human_idx on private.capital_preview_runs(human_subject_id);
create index capital_preview_run_worker_idx on private.capital_preview_runs(worker_account_id);
create index capital_preview_run_policy_idx on private.capital_preview_runs(retention_policy_id);

create table private.capital_preview_recipes(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,work_id uuid not null,run_id uuid not null,job_id uuid not null,
 plan_id uuid not null,plan_task_id uuid not null,boundary text not null check(boundary in('questions','synthesis')),
 human_subject_id uuid not null references auth.users(id),worker_account_id uuid not null references auth.users(id),
 renderer_version text not null,retention_policy_id uuid not null references private.capital_public_retention_policies(id),
 expires_at timestamptz not null check(isfinite(expires_at)),created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 unique(organization_id,id),unique(organization_id,work_id,id),unique(organization_id,run_id,boundary),
 foreign key(organization_id,work_id,run_id)references private.capital_preview_runs(organization_id,work_id,id),
 foreign key(organization_id,job_id)references public.processing_jobs(organization_id,id),
 foreign key(organization_id,plan_task_id)references public.capital_project_plan_tasks(organization_id,id),
 check(renderer_version='capital-preview-renderer.'||boundary||'.v1'));
create index capital_preview_recipe_run_idx on private.capital_preview_recipes(organization_id,work_id,run_id);
create index capital_preview_recipe_job_idx on private.capital_preview_recipes(organization_id,job_id);
create index capital_preview_recipe_task_idx on private.capital_preview_recipes(organization_id,plan_task_id);
create index capital_preview_recipe_human_idx on private.capital_preview_recipes(human_subject_id);
create index capital_preview_recipe_worker_idx on private.capital_preview_recipes(worker_account_id);
create index capital_preview_recipe_policy_idx on private.capital_preview_recipes(retention_policy_id);
create table private.capital_preview_body_bases(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,work_id uuid not null,run_id uuid not null,recipe_id uuid,
 kind text not null check(kind in('context','source','actual_input','model_input','accepted_parsed','task_output','decision_contract')),
 file_name text,task_id text,task_run_id uuid,accepted_invocation_id uuid,semantic_fingerprint text,
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 unique(organization_id,id),unique(organization_id,work_id,id),
 foreign key(organization_id,work_id,run_id)references private.capital_preview_runs(organization_id,work_id,id),
 foreign key(organization_id,recipe_id)references private.capital_preview_recipes(organization_id,id),
 foreign key(organization_id,task_run_id)references public.capital_project_task_runs(organization_id,id),
 check((kind='source')=(file_name is not null)),check((kind in('actual_input','task_output','decision_contract'))=(task_id is not null)),
 check((kind in('model_input','accepted_parsed'))=(recipe_id is not null)),check((kind='accepted_parsed')=(accepted_invocation_id is not null)));
create unique index capital_preview_body_identity_idx on private.capital_preview_body_bases(organization_id,run_id,kind,coalesce(recipe_id,'00000000-0000-0000-0000-000000000000'::uuid),coalesce(file_name,''),coalesce(task_id,''),coalesce(task_run_id,'00000000-0000-0000-0000-000000000000'::uuid));
create index capital_preview_basis_run_idx on private.capital_preview_body_bases(organization_id,work_id,run_id);
create index capital_preview_basis_recipe_idx on private.capital_preview_body_bases(organization_id,recipe_id);
create index capital_preview_basis_task_run_idx on private.capital_preview_body_bases(organization_id,task_run_id);
create index capital_preview_basis_accepted_idx on private.capital_preview_body_bases(organization_id,accepted_invocation_id);
alter table private.capital_public_payload_allocations add column preview_body_basis_id uuid,
 add constraint capital_preview_allocation_basis_fk foreign key(organization_id,preview_body_basis_id)references private.capital_preview_body_bases(organization_id,id);
create index capital_preview_allocation_basis_idx on private.capital_public_payload_allocations(organization_id,preview_body_basis_id);
create unique index capital_preview_allocation_request_idx on private.capital_public_payload_allocations(organization_id,job_id,request_id)where content_kind='preview_body';
-- Preserve all installed origin families, including 3S/C11. A separate exclusive
-- check ensures a preview basis cannot be smuggled into any previous family.
do $$declare d text;other_origins text;begin
 select pg_get_constraintdef(oid)into strict d from pg_constraint where conrelid='private.capital_public_payload_allocations'::regclass and conname='capital_public_payload_allocations_content_kind_check';
 execute 'alter table private.capital_public_payload_allocations drop constraint capital_public_payload_allocations_content_kind_check';
 execute 'alter table private.capital_public_payload_allocations add constraint capital_public_payload_allocations_content_kind_check check(('||substring(d from 8 for length(d)-8)||') or content_kind=''preview_body'')';
 select pg_get_constraintdef(oid)into strict d from pg_constraint where conrelid='private.capital_public_payload_allocations'::regclass and conname='capital_allocations_kind_invariant';
 execute 'alter table private.capital_public_payload_allocations drop constraint capital_allocations_kind_invariant';
 select string_agg(quote_ident(attname),','order by attname)into other_origins from pg_attribute where attrelid='private.capital_public_payload_allocations'::regclass and attnum>0 and not attisdropped and attname<>'preview_body_basis_id'and(attname like '%body_basis_id'or attname in('body_basis_id','delivery_id','license_id','licensing_organization_id'));
 if other_origins is null then raise exception 'capital_preview_existing_origins_missing';end if;
 execute 'alter table private.capital_public_payload_allocations add constraint capital_allocations_kind_invariant check((preview_body_basis_id is null and ('||substring(d from 8 for length(d)-8)||')) or(content_kind=''preview_body'' and preview_body_basis_id is not null and num_nonnulls('||other_origins||')=0))';
end$$;
alter table private.capital_public_payload_allocations add constraint capital_preview_exclusive_basis check((content_kind='preview_body')=(preview_body_basis_id is not null));
create table private.capital_preview_recipe_seals(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,recipe_id uuid not null,plan_task_id uuid not null,input_retained_payload_id uuid not null,
 consumed_basis_fingerprint text not null check(consumed_basis_fingerprint ~ '^[a-f0-9]{64}$'),
 reconstruction_fingerprint text not null,prompt_fingerprint text not null,primary_request_fingerprint text not null,fallback_request_fingerprint text not null,
 input_bytes bigint not null check(input_bytes between 1 and 100000),effective_budget_micro_usd bigint not null check(effective_budget_micro_usd between 1 and 600000),
 effective_max_dispatches integer not null check(effective_max_dispatches between 1 and 2),
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 unique(organization_id,id),unique(organization_id,recipe_id),
 foreign key(organization_id,recipe_id)references private.capital_preview_recipes(organization_id,id),
 foreign key(organization_id,plan_task_id)references public.capital_project_plan_tasks(organization_id,id),
 foreign key(organization_id,input_retained_payload_id)references private.capital_public_retained_payloads(organization_id,id));
create index capital_preview_seal_recipe_idx on private.capital_preview_recipe_seals(organization_id,recipe_id);
create index capital_preview_seal_task_idx on private.capital_preview_recipe_seals(organization_id,plan_task_id);
create index capital_preview_seal_retained_idx on private.capital_preview_recipe_seals(organization_id,input_retained_payload_id);
create table private.capital_preview_execution_failures(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,recipe_id uuid not null,
 reason text not null check(reason in('model_attempts_exhausted','processing_denied','budget_denied','accepted_body_unavailable')),
 outcome_ids uuid[]not null,created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 unique(organization_id,id),unique(organization_id,recipe_id),foreign key(organization_id,recipe_id)references private.capital_preview_recipes(organization_id,id));
create index capital_preview_failure_recipe_idx on private.capital_preview_execution_failures(organization_id,recipe_id);

create function private.capital_preview_run_deadline_v1(p_org uuid,p_run uuid,p_subject uuid,p_require_captured boolean default true)
returns timestamptz language plpgsql volatile security definer set search_path=''as $$
declare r private.capital_preview_runs;deadline timestamptz;physical_deadline timestamptz;source_row record;
begin
 select * into r from private.capital_preview_runs where organization_id=p_org and id=p_run;
 if r.id is null or not private.capital_body_subject_allowed_v1(p_org,r.work_id,p_subject)
 or not private.capital_body_subject_allowed_v1(p_org,r.work_id,r.human_subject_id)
 or r.base_authority_fingerprint is distinct from private.capital_s11_base_authority_fingerprint_v1(p_org,r.job_id,r.session_id,r.brief_id,r.plan_id,r.human_subject_id,r.captured_at)then return null;end if;
 physical_deadline:=private.capital_preview_consumed_basis_deadline_v1(r.publisher_organization_id,r.basis_id);
 if physical_deadline is null then return null;end if;
 deadline:=least(r.expires_at,physical_deadline);
 if deadline is null or deadline<=clock_timestamp()then return null;end if;
 if p_require_captured then
 if not exists(select 1 from private.capital_preview_body_bases b join private.capital_public_payload_allocations a on(a.organization_id,a.preview_body_basis_id)=(b.organization_id,b.id)
 join private.capital_public_retained_payloads physical on(physical.organization_id,physical.allocation_id)=(a.organization_id,a.id)
 where b.organization_id=p_org and b.run_id=r.id and b.kind='context'and a.payload_fingerprint=r.context_fingerprint and private.capital_body_physical_receipt_v1(p_org,physical.id))then return null;end if;
 for source_row in select entry.value from jsonb_array_elements(private.capital_preview_consumed_corpus_registry_v1()->'entries')entry loop
 if not exists(select 1 from private.capital_preview_body_bases b join private.capital_public_payload_allocations a on(a.organization_id,a.preview_body_basis_id)=(b.organization_id,b.id)
 join private.capital_public_retained_payloads physical on(physical.organization_id,physical.allocation_id)=(a.organization_id,a.id)
 where b.organization_id=p_org and b.run_id=r.id and b.kind='source'and b.file_name=source_row.value->>'file' and private.capital_body_physical_receipt_v1(p_org,physical.id)
 and least(a.expires_at,a.purge_at)>clock_timestamp())then return null;end if;
 end loop;
 select min(least(a.expires_at,a.purge_at))into physical_deadline from private.capital_preview_body_bases b
 join private.capital_public_payload_allocations a on(a.organization_id,a.preview_body_basis_id)=(b.organization_id,b.id)
 join private.capital_public_retained_payloads physical on(physical.organization_id,physical.allocation_id)=(a.organization_id,a.id)
 where b.organization_id=p_org and b.run_id=r.id and b.kind in('context','source');
 if physical_deadline is null or physical_deadline<=clock_timestamp()then return null;end if;
 deadline:=least(deadline,physical_deadline);
 end if;
 return deadline;
end;$$;
create function private.capital_preview_recipe_deadline_v1(p_org uuid,p_recipe uuid,p_subject uuid)returns timestamptz
language sql volatile security definer set search_path=''as $$select private.capital_preview_run_deadline_v1(p_org,r.run_id,p_subject,true)from private.capital_preview_recipes r where r.organization_id=p_org and r.id=p_recipe;$$;
create function private.require_capital_preview_run_v1(p_job_id uuid,p_capability_token text,p_run_id uuid,p_require_captured boolean default true)
returns private.capital_preview_runs language plpgsql volatile security definer set search_path=''as $$
declare j public.processing_jobs:=private.capital_public_capture_job_v1(p_job_id,p_capability_token);r private.capital_preview_runs;
begin
 if not pg_try_advisory_xact_lock(hashtextextended('capital-preview-run:'||j.organization_id::text||':'||p_run_id::text,0))then raise exception 'capital_capture_retry'using errcode='40001';end if;
 select * into r from private.capital_preview_runs where organization_id=j.organization_id and job_id=j.id and id=p_run_id;
 if r.id is null or r.worker_account_id<>auth.uid()or r.human_subject_id<>j.authorization_subject_id or r.work_id<>coalesce(j.work_id,(j.payload->>'capital_project_id')::uuid)
 or r.plan_id::text is distinct from j.payload->>'capital_project_plan_id' or r.brief_id::text is distinct from j.payload->>'capital_project_brief_id'
 or private.capital_preview_run_deadline_v1(r.organization_id,r.id,j.authorization_subject_id,p_require_captured)is null then raise exception 'capital_preview_denied'using errcode='42501';end if;
 return r;
end;$$;
create function private.require_capital_preview_recipe_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid)
returns private.capital_preview_recipes language plpgsql volatile security definer set search_path=''as $$
declare j public.processing_jobs:=private.capital_public_capture_job_v1(p_job_id,p_capability_token);r private.capital_preview_recipes;run private.capital_preview_runs;dep text;task public.capital_project_plan_tasks;
begin
 select * into r from private.capital_preview_recipes where organization_id=j.organization_id and job_id=j.id and id=p_recipe_id;
 if r.id is null then raise exception 'capital_preview_denied'using errcode='42501';end if;
 run:=private.require_capital_preview_run_v1(j.id,p_capability_token,r.run_id,true);
 if r.human_subject_id<>j.authorization_subject_id or r.worker_account_id<>auth.uid()or not exists(select 1 from private.capital_preview_recipe_seals s
 where s.organization_id=r.organization_id and s.recipe_id=r.id and s.plan_task_id=r.plan_task_id
 and private.capital_body_physical_receipt_v1(r.organization_id,s.input_retained_payload_id))then raise exception 'capital_preview_denied'using errcode='42501';end if;
 select *into strict task from public.capital_project_plan_tasks where organization_id=r.organization_id and id=r.plan_task_id;
 foreach dep in array task.dependencies loop
 if private.capital_preview_projection_deadline_v1(r.organization_id,r.run_id,r.human_subject_id,dep)is null then raise exception 'capital_preview_parent_denied'using errcode='42501';end if;
 end loop;
 return r;
end;$$;

create function private.worker_prepare_capital_preview_run_v1(p_job_id uuid,p_capability_token text,p_publisher_org uuid,p_basis_id uuid)
returns jsonb language plpgsql security definer set search_path=''as $$
declare j public.processing_jobs:=private.capital_public_capture_job_v1(p_job_id,p_capability_token);r private.capital_preview_runs;c jsonb;policy private.capital_public_retention_policies;
 stamp timestamptz:=clock_timestamp();deadline timestamptz;budget bigint;calls integer;context_scope jsonb;context_allocation uuid;
begin
 select *into r from private.capital_preview_runs where organization_id=j.organization_id and job_id=j.id;
 if r.id is not null then
  if r.publisher_organization_id is distinct from p_publisher_org or r.basis_id is distinct from p_basis_id then raise exception 'capital_preview_context_conflict'using errcode='23505';end if;
  perform private.require_capital_preview_run_v1(j.id,p_capability_token,r.id,false);
  select a.id into context_allocation from private.capital_preview_body_bases b
   join private.capital_public_payload_allocations a on a.organization_id=b.organization_id and a.preview_body_basis_id=b.id
   join private.capital_public_retained_payloads physical on physical.organization_id=a.organization_id and physical.allocation_id=a.id
   where b.organization_id=r.organization_id and b.run_id=r.id and b.kind='context';
  if context_allocation is not null then
   context_scope:=private.worker_read_capital_preview_allocation_v1(j.id,p_capability_token,context_allocation);
   return jsonb_build_object('schemaVersion','capital-preview-base.v1','runId',r.id,'jobId',j.id,'organizationId',j.organization_id,'workId',r.work_id,'planId',r.plan_id,'briefId',r.brief_id,'planFingerprint',r.plan_fingerprint,'composition',r.composition,'workflowFingerprint',r.workflow_fingerprint,'contextFingerprint',r.context_fingerprint,'canonicalContext',null,'contextScope',context_scope,'expiresAt',r.expires_at);
  end if;
 end if;
 c:=private.worker_load_capital_project_context_v6(j.id,p_capability_token);
 if c->>'mode'is distinct from'integration_preview'or c#>>'{preview,caseId}'is distinct from'gc01-analista-ib-camil'
 or c#>'{preview,workflow}'is distinct from private.capital_preview_workflow_v1(c#>>'{preview,composition}')->'workflow'
 or jsonb_array_length(coalesce(c->'prior_artifacts','[]'))<>0 then raise exception 'capital_preview_historical_basis_unavailable'using errcode='42501';end if;
 deadline:=private.capital_preview_consumed_basis_deadline_v1(p_publisher_org,p_basis_id);
 if deadline is null then raise exception 'capital_preview_published_sources_required'using errcode='42501';end if;
 select p.*into policy from private.capital_public_retention_policies p join private.capital_public_retention_controls ctl on ctl.policy_id=p.id where ctl.singleton and ctl.enabled;
 if policy.id is null or not private.capital_public_retention_healthy_v1(j.leased_by,policy.id)then raise exception 'capital_preview_retention_denied'using errcode='42501';end if;
 if jsonb_typeof(j.payload#>'{model_budget,max_cost_usd}')is distinct from'number'or jsonb_typeof(j.payload#>'{model_budget,max_calls}')is distinct from'number'then raise exception 'capital_preview_budget_denied'using errcode='42501';end if;
 budget:=least(600000,floor((j.payload#>>'{model_budget,max_cost_usd}')::numeric*1000000));calls:=least(4,(j.payload#>>'{model_budget,max_calls}')::integer);
 if budget<=0 or calls<=0 then raise exception 'capital_preview_budget_denied'using errcode='42501';end if;
 select *into r from private.capital_preview_runs where organization_id=j.organization_id and job_id=j.id;
 if r.id is null then
 insert into private.capital_preview_runs(organization_id,work_id,job_id,plan_id,brief_id,session_id,human_subject_id,worker_account_id,publisher_organization_id,basis_id,composition,plan_fingerprint,context_fingerprint,base_authority_fingerprint,workflow_fingerprint,retention_policy_id,effective_budget_micro_usd,effective_max_dispatches,captured_at,expires_at)
 values(j.organization_id,(j.payload->>'capital_project_id')::uuid,j.id,(j.payload->>'capital_project_plan_id')::uuid,(j.payload->>'capital_project_brief_id')::uuid,j.intake_session_id,j.authorization_subject_id,auth.uid(),p_publisher_org,p_basis_id,c#>>'{preview,composition}',c#>>'{plan,fingerprint}',encode(extensions.digest(c::text,'sha256'),'hex'),
 private.capital_s11_base_authority_fingerprint_v1(j.organization_id,j.id,j.intake_session_id,(j.payload->>'capital_project_brief_id')::uuid,(j.payload->>'capital_project_plan_id')::uuid,j.authorization_subject_id,stamp),c#>>'{preview,workflow,fingerprint}',policy.id,budget,calls,stamp,least(deadline,stamp+interval'1 hour'))returning *into r;
 elsif r.publisher_organization_id<>p_publisher_org or r.basis_id<>p_basis_id or r.context_fingerprint<>encode(extensions.digest(c::text,'sha256'),'hex')then raise exception 'capital_preview_context_conflict'using errcode='23505';end if;
 perform private.require_capital_preview_run_v1(j.id,p_capability_token,r.id,false);
 return jsonb_build_object('schemaVersion','capital-preview-base.v1','runId',r.id,'jobId',j.id,'organizationId',j.organization_id,'workId',r.work_id,'planId',r.plan_id,'briefId',r.brief_id,'planFingerprint',r.plan_fingerprint,'composition',r.composition,'workflowFingerprint',r.workflow_fingerprint,'contextFingerprint',r.context_fingerprint,'canonicalContext',c::text,'expiresAt',r.expires_at);
end;$$;

create function private.capital_preview_allocation_deadline_v1(p_org uuid,p_allocation uuid,p_subject uuid)
returns timestamptz language plpgsql volatile security definer set search_path=''as $$
declare a private.capital_public_payload_allocations;b private.capital_preview_body_bases;deadline timestamptz;
begin
 select *into a from private.capital_public_payload_allocations where organization_id=p_org and id=p_allocation and content_kind='preview_body';
 select *into b from private.capital_preview_body_bases where organization_id=p_org and id=a.preview_body_basis_id;
 if b.id is null then return null;end if;
 deadline:=private.capital_preview_run_deadline_v1(p_org,b.run_id,p_subject,b.kind not in('context','source'));
 if deadline is null or least(a.expires_at,a.purge_at,deadline)<=clock_timestamp()or not exists(select 1 from private.capital_public_payload_purge_queue q where q.organization_id=p_org and q.allocation_id=a.id and q.status='pending')then return null;end if;
 return least(deadline,a.expires_at);
end;$$;
create function private.capital_preview_body_dto_v1(p_org uuid,p_allocation uuid,p_deadline timestamptz,p_replayed boolean)
returns jsonb language plpgsql security definer set search_path=''as $$
declare a private.capital_public_payload_allocations;r private.capital_public_retained_payloads;margin integer;
begin
 select *into strict a from private.capital_public_payload_allocations where organization_id=p_org and id=p_allocation and content_kind='preview_body';
 select *into r from private.capital_public_retained_payloads where organization_id=p_org and allocation_id=a.id;
 select purge_margin_seconds into strict margin from private.capital_public_retention_policies where id=a.policy_id;
 return jsonb_build_object('schemaVersion','capital-retained-body.v1','retentionState',case when r.id is null then'allocated'else'retained'end,
 'allocationId',a.id,'retainedPayloadId',r.id,'bodyBasisId',a.preview_body_basis_id,'bucket',a.bucket_id,'path',a.object_path,'payloadFingerprint',a.payload_fingerprint,'byteLength',a.byte_length,
 'storageObjectId',r.storage_object_id,'storageVersion',r.storage_version,'retainedAt',a.retained_at,'uploadExpiresAt',a.upload_expires_at,'expiresAt',least(a.expires_at,p_deadline),
 'purgeAt',least(a.purge_at,p_deadline-make_interval(secs=>margin)),'replayed',p_replayed);
end;$$;
create function private.worker_prepare_capital_preview_body_v1(p_job_id uuid,p_capability_token text,p_run_id uuid,p_request_id uuid,p_kind text,p_body jsonb,
 p_recipe_id uuid default null,p_file_name text default null,p_task_id text default null,p_task_run_id uuid default null,p_accepted_invocation_id uuid default null,p_semantic_fingerprint text default null)
returns jsonb language plpgsql security definer set search_path=''as $$
declare j public.processing_jobs:=private.capital_public_capture_job_v1(p_job_id,p_capability_token);r private.capital_preview_runs;
 b private.capital_preview_body_bases;a private.capital_public_payload_allocations;policy private.capital_public_retention_policies;body jsonb:=p_body;
 deadline timestamptz;stamp timestamptz:=clock_timestamp();fp text;bytes bigint;entry jsonb;accepted record;recipe private.capital_preview_recipes;
begin
 r:=private.require_capital_preview_run_v1(j.id,p_capability_token,p_run_id,p_kind not in('context','source'));
 if p_request_id is null or p_kind is null or p_kind not in('context','source','actual_input','model_input','accepted_parsed','task_output','decision_contract')or jsonb_typeof(p_body)is distinct from'object'then raise exception 'capital_preview_body_invalid'using errcode='22023';end if;
 if (p_kind in('context','source','actual_input','task_output','decision_contract')and p_recipe_id is not null)
 or(p_kind<>'source'and p_file_name is not null)or(p_kind not in('actual_input','task_output','decision_contract')and p_task_id is not null)
 or(p_kind not in('task_output','decision_contract')and p_task_run_id is not null)or(p_kind<>'accepted_parsed'and p_accepted_invocation_id is not null)
 or(p_kind in('context','source','model_input')and p_semantic_fingerprint is not null)then raise exception 'capital_preview_body_scope_invalid'using errcode='22023';end if;
 -- Exact replay uses the frozen caller body only after current run authority,
 -- natural scope and physical fingerprint are compared. Never re-read a context
 -- polluted by the artifacts produced after its initial capture.
 select allocation.*into a from private.capital_public_payload_allocations allocation join private.capital_preview_body_bases existing on(existing.organization_id,existing.id)=(allocation.organization_id,allocation.preview_body_basis_id)
 where allocation.organization_id=r.organization_id and existing.run_id=r.id and existing.kind=p_kind and existing.recipe_id is not distinct from p_recipe_id and existing.file_name is not distinct from p_file_name and existing.task_id is not distinct from p_task_id and existing.task_run_id is not distinct from p_task_run_id;
 if a.id is not null then
  select*into b from private.capital_preview_body_bases where organization_id=r.organization_id and id=a.preview_body_basis_id;
  if b.accepted_invocation_id is distinct from p_accepted_invocation_id or b.semantic_fingerprint is distinct from p_semantic_fingerprint or a.payload_fingerprint is distinct from encode(extensions.digest(p_body::text,'sha256'),'hex')or a.byte_length is distinct from octet_length(p_body::text)then raise exception 'capital_preview_body_conflict'using errcode='23505';end if;
  deadline:=private.capital_preview_allocation_deadline_v1(r.organization_id,a.id,r.human_subject_id);
  if deadline is null then raise exception 'capital_preview_retention_denied'using errcode='42501';end if;
  return private.capital_preview_body_dto_v1(r.organization_id,a.id,deadline,true)||jsonb_build_object('canonicalBody',p_body::text);
 end if;
 if p_kind='context'then
 body:=private.worker_load_capital_project_context_v6(j.id,p_capability_token);
 if encode(extensions.digest(body::text,'sha256'),'hex')<>r.context_fingerprint then raise exception 'capital_preview_context_changed'using errcode='40001';end if;
 elsif p_kind='source'then
 select value into entry from jsonb_array_elements(private.capital_preview_consumed_corpus_registry_v1()->'entries')where value->>'file'=p_file_name;
 if entry is null or p_body-array['schemaVersion','file','bytesBase64']<>'{}'::jsonb or p_body->>'schemaVersion'is distinct from'capital-preview-extraction.v1'
 or p_body->>'file'is distinct from p_file_name or jsonb_typeof(p_body->'bytesBase64')is distinct from'string'or p_body->>'bytesBase64'!~'^[A-Za-z0-9+/]*={0,2}$'
 or encode(extensions.digest(decode(p_body->>'bytesBase64','base64'),'sha256'),'hex')<>entry->>'sha256'or octet_length(decode(p_body->>'bytesBase64','base64'))<>(entry->>'bytes')::bigint then raise exception 'capital_preview_source_bytes_denied'using errcode='42501';end if;
 elsif p_kind in('actual_input','task_output','decision_contract')then
 if p_task_id is null or not exists(select 1 from public.capital_project_plan_tasks pt where pt.organization_id=j.organization_id and pt.plan_id=r.plan_id and pt.task_id=p_task_id)
 or(p_kind<>'actual_input'and not exists(select 1 from public.capital_project_task_runs tr join public.capital_project_plan_tasks pt on(pt.organization_id,pt.id)=(tr.organization_id,tr.plan_task_id)
 where tr.organization_id=j.organization_id and tr.id=p_task_run_id and tr.processing_job_id=j.id and tr.capital_project_id=r.work_id and tr.plan_id=r.plan_id and pt.task_id=p_task_id and tr.status='running'))then raise exception 'capital_preview_task_denied'using errcode='42501';end if;
 if p_semantic_fingerprint is null or p_semantic_fingerprint!~'^[a-f0-9]{64}$'then raise exception 'capital_preview_body_invalid'using errcode='22023';end if;
 elsif p_kind in('model_input','accepted_parsed')then
 select *into recipe from private.capital_preview_recipes where organization_id=r.organization_id and run_id=r.id and id=p_recipe_id;
 if recipe.id is null then raise exception 'capital_preview_boundary_denied'using errcode='42501';end if;
 if p_kind='accepted_parsed'then
 select *into accepted from private.capital_preview_accepted_invocations where organization_id=r.organization_id and recipe_id=recipe.id and id=p_accepted_invocation_id;
 if accepted.id is null or accepted.output_fingerprint is distinct from p_semantic_fingerprint then raise exception 'capital_preview_accepted_denied'using errcode='42501';end if;
 else
 if p_body-array['schemaVersion','boundary','input']<>'{}'::jsonb or p_body->>'schemaVersion'is distinct from'capital-preview-model-input.v1'or p_body->>'boundary'is distinct from recipe.boundary
 or jsonb_typeof(p_body->'input')is distinct from'array'or jsonb_array_length(p_body->'input')=0
 or exists(select 1 from jsonb_array_elements(p_body->'input')part where part-array['type','text']<>'{}'::jsonb or part->>'type'is distinct from'text'or jsonb_typeof(part->'text')is distinct from'string')then raise exception 'capital_preview_input_invalid'using errcode='22023';end if;
 end if;
 end if;
 select *into strict policy from private.capital_public_retention_policies where id=r.retention_policy_id;
 deadline:=private.capital_preview_run_deadline_v1(r.organization_id,r.id,r.human_subject_id,p_kind not in('context','source'));
 if deadline is null or deadline-make_interval(secs=>policy.purge_margin_seconds)<=stamp or not private.capital_public_retention_healthy_v1(j.leased_by,policy.id)then raise exception 'capital_preview_retention_denied'using errcode='42501';end if;
 fp:=encode(extensions.digest(body::text,'sha256'),'hex');bytes:=octet_length(body::text);if bytes not between 1 and 1048576 then raise exception 'capital_preview_body_invalid'using errcode='22023';end if;
 select allocation.*into a from private.capital_public_payload_allocations allocation join private.capital_preview_body_bases existing on(existing.organization_id,existing.id)=(allocation.organization_id,allocation.preview_body_basis_id)where allocation.organization_id=r.organization_id and allocation.job_id=j.id and allocation.content_kind='preview_body'and(existing.run_id,existing.kind,existing.recipe_id,existing.file_name,existing.task_id,existing.task_run_id)is not distinct from(r.id,p_kind,p_recipe_id,p_file_name,p_task_id,p_task_run_id);
 if a.id is not null then
 select *into b from private.capital_preview_body_bases where organization_id=r.organization_id and id=a.preview_body_basis_id;
 if (b.run_id,b.kind,b.recipe_id,b.file_name,b.task_id,b.task_run_id,b.accepted_invocation_id,b.semantic_fingerprint) is distinct from(r.id,p_kind,p_recipe_id,p_file_name,p_task_id,p_task_run_id,p_accepted_invocation_id,p_semantic_fingerprint)
 or a.payload_fingerprint<>fp or a.byte_length<>bytes then raise exception 'capital_preview_body_conflict'using errcode='23505';end if;
 else
 insert into private.capital_preview_body_bases(organization_id,work_id,run_id,recipe_id,kind,file_name,task_id,task_run_id,accepted_invocation_id,semantic_fingerprint)
 values(r.organization_id,r.work_id,r.id,p_recipe_id,p_kind,p_file_name,p_task_id,p_task_run_id,p_accepted_invocation_id,p_semantic_fingerprint)returning *into b;
 insert into private.capital_public_payload_allocations(id,organization_id,request_id,job_id,worker_token_id,worker_account_id,capability_sha256,policy_id,payload_fingerprint,byte_length,object_path,retained_at,expires_at,purge_at,upload_expires_at,preview_body_basis_id,content_kind)
 values(b.id,r.organization_id,p_request_id,j.id,j.leased_by,auth.uid(),j.capability_sha256,policy.id,fp,bytes,r.organization_id::text||'/'||b.id::text||'/payload.json',stamp,deadline,deadline-make_interval(secs=>policy.purge_margin_seconds),least(stamp+interval'5 minutes',deadline-make_interval(secs=>policy.purge_margin_seconds)),b.id,'preview_body')returning *into a;
 insert into private.capital_public_payload_purge_queue(organization_id,allocation_id,next_check_at,effective_purge_at)values(r.organization_id,a.id,least(a.upload_expires_at,a.purge_at),a.purge_at);
 end if;
 if private.capital_preview_allocation_deadline_v1(r.organization_id,a.id,r.human_subject_id)is null then raise exception 'capital_preview_retention_denied'using errcode='42501';end if;
 return private.capital_preview_body_dto_v1(r.organization_id,a.id,deadline,true)||jsonb_build_object('canonicalBody',body::text);
end;$$;
create function private.worker_commit_capital_preview_body_v1(p_job_id uuid,p_capability_token text,p_allocation_id uuid,p_storage_object_id uuid,
 p_storage_version text,p_verified_sha256 text,p_verified_size bigint) returns jsonb
language plpgsql security definer set search_path='' as $$
declare job public.processing_jobs:=private.capital_public_capture_job_v1(p_job_id,p_capability_token);
 allocation private.capital_public_payload_allocations;basis private.capital_preview_body_bases;receipt private.capital_public_retained_payloads;
 object_row storage.objects;deadline timestamptz;margin integer;replayed boolean:=false;result_dto jsonb;
begin
 select * into allocation from private.capital_public_payload_allocations where organization_id=job.organization_id and job_id=job.id and id=p_allocation_id and content_kind='preview_body';
 if not found or not private.capital_public_allocation_job_current_v1(allocation.id) then raise exception 'capital_body_retention_denied' using errcode='42501';end if;
 if p_storage_object_id is null or coalesce(length(p_storage_version),0) not between 1 and 1024 or p_verified_sha256 is distinct from allocation.payload_fingerprint or p_verified_size is distinct from allocation.byte_length then
 raise exception 'capital_body_proof_invalid' using errcode='22023';end if;
 deadline:=private.capital_preview_allocation_deadline_v1(job.organization_id,allocation.id,job.authorization_subject_id);
 select purge_margin_seconds into strict margin from private.capital_public_retention_policies where id=allocation.policy_id;
 if deadline is null or least(allocation.purge_at,deadline-make_interval(secs=>margin))<=clock_timestamp()
 or not private.capital_public_retention_healthy_v1(job.leased_by,allocation.policy_id) then raise exception 'capital_body_retention_denied' using errcode='42501';end if;
 perform private.require_capital_body_retention_ready_v1(allocation.policy_id,job.organization_id,allocation.id);
 begin
 perform 1 from private.capital_public_payload_purge_queue where organization_id=job.organization_id and allocation_id=allocation.id and status='pending' for share nowait;
 if not found then raise exception 'capital_body_retention_denied' using errcode='42501';end if;
 select * into object_row from storage.objects where id=p_storage_object_id and bucket_id=allocation.bucket_id and name=allocation.object_path for share nowait;
 exception when lock_not_available then raise exception 'capital_capture_retry' using errcode='40001';end;
 if object_row.id is null or object_row.version is distinct from p_storage_version or object_row.metadata->>'size' is distinct from allocation.byte_length::text
 or object_row.metadata->>'mimetype' is distinct from 'application/json' or (to_jsonb(object_row)->>'is_versioned')::boolean is true
 or (to_jsonb(object_row)->>'is_delete_marker')::boolean is true or to_jsonb(object_row)->>'archived_at' is not null or not private.capital_public_capture_bucket_safe_v1() then
 raise exception 'capital_body_proof_invalid' using errcode='22023';end if;
 if not pg_try_advisory_xact_lock(hashtextextended('capital-body-request:'||job.organization_id::text||':'||job.id::text||':'||allocation.request_id::text,0)) then raise exception 'capital_capture_retry' using errcode='40001';end if;
 select * into receipt from private.capital_public_retained_payloads where organization_id=job.organization_id and allocation_id=allocation.id;
 if found then
 if receipt.storage_object_id<>p_storage_object_id or receipt.storage_version<>p_storage_version or receipt.verified_sha256<>p_verified_sha256 or receipt.verified_size<>p_verified_size then
 raise exception 'capital_body_proof_conflict' using errcode='23505';end if;
 replayed:=true;
 else
 if allocation.upload_expires_at<=clock_timestamp() then raise exception 'capital_body_upload_expired' using errcode='42501';end if;
 if not private.capital_public_capture_clock_current_v1(job.id,p_capability_token) then raise exception 'capital_capture_denied' using errcode='42501';end if;
 insert into private.capital_public_retained_payloads(organization_id,allocation_id,storage_object_id,storage_version,verified_sha256,verified_size,verified_by)
 values(job.organization_id,allocation.id,p_storage_object_id,p_storage_version,p_verified_sha256,p_verified_size,auth.uid()) returning * into receipt;
 update private.capital_public_payload_purge_queue set next_check_at=least(allocation.purge_at,deadline-make_interval(secs=>margin)),
 effective_purge_at=least(effective_purge_at,allocation.purge_at,deadline-make_interval(secs=>margin)),updated_at=clock_timestamp()
 where organization_id=job.organization_id and allocation_id=allocation.id;
 end if;
 perform private.require_capital_body_retention_ready_v1(allocation.policy_id,job.organization_id,allocation.id);
 if not private.capital_public_capture_clock_current_v1(job.id,p_capability_token)
 then raise exception 'capital_capture_denied' using errcode='42501';end if;
 result_dto:=private.capital_preview_body_dto_v1(job.organization_id,allocation.id,deadline,replayed);
 if not private.capital_public_capture_clock_current_v1(job.id,p_capability_token) then raise exception 'capital_capture_denied' using errcode='42501';end if;
 return result_dto;
end; $$;

create function private.worker_read_capital_preview_allocation_v1(p_job_id uuid,p_capability_token text,p_allocation_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare job public.processing_jobs:=private.capital_public_capture_job_v1(p_job_id,p_capability_token);
 allocation private.capital_public_payload_allocations;receipt private.capital_public_retained_payloads;
 physical_object storage.objects;deadline timestamptz;checked_deadline timestamptz;margin integer;result_dto jsonb;
begin
 if p_allocation_id is null then raise exception 'capital_body_read_invalid' using errcode='22023';end if;
 select a.* into allocation from private.capital_public_payload_allocations a
 where a.organization_id=job.organization_id and a.job_id=job.id and a.id=p_allocation_id and a.content_kind='preview_body';
 if not found or not private.capital_public_allocation_job_current_v1(allocation.id)
 or not private.capital_public_retention_healthy_v1(allocation.worker_token_id,allocation.policy_id)
 or not private.capital_public_capture_bucket_safe_v1() then raise exception 'capital_body_read_denied' using errcode='42501';end if;
 deadline:=private.capital_preview_allocation_deadline_v1(job.organization_id,allocation.id,job.authorization_subject_id);
 select purge_margin_seconds into strict margin from private.capital_public_retention_policies where id=allocation.policy_id;
 if deadline is null or least(allocation.purge_at,deadline-make_interval(secs=>margin))<=clock_timestamp() then
 raise exception 'capital_body_read_denied' using errcode='42501';end if;
 perform private.require_capital_body_retention_ready_v1(allocation.policy_id,job.organization_id,allocation.id);
 begin
 perform 1 from private.capital_public_payload_purge_queue q
 where q.organization_id=job.organization_id and q.allocation_id=allocation.id and q.status='pending' for share nowait;
 if not found then raise exception 'capital_body_read_denied' using errcode='42501';end if;
 select o.* into physical_object from storage.objects o where o.bucket_id=allocation.bucket_id and o.name=allocation.object_path for share nowait;
 exception when lock_not_available then raise exception 'capital_capture_retry' using errcode='40001';end;
 if physical_object.id is null or coalesce(length(physical_object.version),0) not between 1 and 1024
 or physical_object.metadata->>'size' is distinct from allocation.byte_length::text
 or physical_object.metadata->>'mimetype' is distinct from 'application/json'
 or (to_jsonb(physical_object)->>'is_versioned')::boolean is true
 or (to_jsonb(physical_object)->>'is_delete_marker')::boolean is true
 or to_jsonb(physical_object)->>'archived_at' is not null then raise exception 'capital_body_read_denied' using errcode='42501';end if;
 select r.* into receipt from private.capital_public_retained_payloads r
 where r.organization_id=job.organization_id and r.allocation_id=allocation.id;
 if receipt.id is null then
 if allocation.upload_expires_at<=clock_timestamp() then raise exception 'capital_body_upload_expired' using errcode='42501';end if;
 else
 if receipt.storage_object_id is distinct from physical_object.id or receipt.storage_version is distinct from physical_object.version
 or receipt.verified_sha256 is distinct from allocation.payload_fingerprint or receipt.verified_size is distinct from allocation.byte_length
 or not private.capital_body_physical_receipt_v1(job.organization_id,receipt.id) then raise exception 'capital_body_read_denied' using errcode='42501';end if;
 end if;
 result_dto:=private.capital_preview_body_dto_v1(job.organization_id,allocation.id,deadline,true)
 ||jsonb_build_object('storageObjectId',physical_object.id,'storageVersion',physical_object.version);
 -- No caller-supplied path/version/hash or storage header authorizes this scope.
 -- Re-run current rights and clock after constructing it, so an elapsed lease
 -- cannot escape through a slow closure/metadata lookup before either server gate.
 checked_deadline:=private.capital_preview_allocation_deadline_v1(job.organization_id,allocation.id,job.authorization_subject_id);
 if checked_deadline is null then raise exception 'capital_body_read_denied' using errcode='42501';end if;
 if checked_deadline is distinct from deadline then raise exception 'capital_capture_retry' using errcode='40001';end if;
 perform private.require_capital_body_retention_ready_v1(allocation.policy_id,job.organization_id,allocation.id);
 if not private.capital_public_capture_clock_current_v1(job.id,p_capability_token)
 or least(allocation.purge_at,deadline-make_interval(secs=>margin))<=clock_timestamp()
 or (receipt.id is null and allocation.upload_expires_at<=clock_timestamp()) then
 raise exception 'capital_body_read_denied' using errcode='42501';end if;
 return result_dto;
end; $$;


create function private.capital_preview_storage_allowed_v1(p_allocation uuid,p_mode text)returns boolean
language plpgsql volatile security definer set search_path=''as $$
declare a private.capital_public_payload_allocations;deadline timestamptz;subject uuid;margin integer;
begin
 if auth.uid()is null or p_mode is distinct from'upload'or not private.capital_body_storage_job_authority_v1(p_allocation)or not private.capital_public_capture_bucket_safe_v1()then return false;end if;
 select *into a from private.capital_public_payload_allocations where id=p_allocation and content_kind='preview_body';
 if a.id is null or not private.capital_public_allocation_job_current_v1(a.id)or not private.capital_public_retention_healthy_v1(a.worker_token_id,a.policy_id)
 or a.upload_expires_at<=clock_timestamp()or exists(select 1 from private.capital_public_retained_payloads where organization_id=a.organization_id and allocation_id=a.id)then return false;end if;
 select authorization_subject_id into subject from public.processing_jobs where organization_id=a.organization_id and id=a.job_id;
 deadline:=private.capital_preview_allocation_deadline_v1(a.organization_id,a.id,subject);
 select purge_margin_seconds into strict margin from private.capital_public_retention_policies where id=a.policy_id;
 return deadline is not null and least(a.purge_at,deadline-make_interval(secs=>margin))>clock_timestamp()
 and private.capital_body_retention_healthy_v1(a.policy_id,a.organization_id,a.id);
end;$$;
alter function private.capital_capture_allocation_deadline_v2(uuid,uuid)rename to capital_capture_allocation_deadline_pre_preview_v2;
create function private.capital_capture_allocation_deadline_v2(p_org uuid,p_allocation uuid)returns timestamptz
language plpgsql volatile security definer set search_path=''as $$
declare a private.capital_public_payload_allocations;subject uuid;
begin
 select *into a from private.capital_public_payload_allocations where organization_id=p_org and id=p_allocation;
 if a.content_kind is distinct from'preview_body'then return private.capital_capture_allocation_deadline_pre_preview_v2(p_org,p_allocation);end if;
 select r.human_subject_id into subject from private.capital_preview_body_bases b join private.capital_preview_runs r on(r.organization_id,r.id)=(b.organization_id,b.run_id)where(b.organization_id,b.id)=(p_org,a.preview_body_basis_id);
 return private.capital_preview_allocation_deadline_v1(p_org,p_allocation,subject);
end;$$;
alter function private.worker_can_access_capital_public_payload_v1(text,text,text) rename to worker_can_access_capital_public_payload_pre_preview_v1;
create function private.worker_can_access_capital_public_payload_v1(p_bucket text,p_path text,p_mode text)
returns boolean language plpgsql volatile security definer set search_path='' as $$
declare a private.capital_public_payload_allocations;
begin
 -- Purge resolves the genuine leased janitor scope before kind dispatch.
 if p_mode in('purge','purge_select') then return private.worker_can_access_capital_public_payload_pre_preview_v1(p_bucket,p_path,p_mode);end if;
 select * into a from private.capital_public_payload_allocations where bucket_id=p_bucket and object_path=p_path;
 if a.content_kind is distinct from 'preview_body' then return private.worker_can_access_capital_public_payload_pre_preview_v1(p_bucket,p_path,p_mode);end if;
 if exists(select 1 from storage.objects o where o.bucket_id=p_bucket and o.name=p_path and((to_jsonb(o)->>'is_versioned')::boolean is true or(to_jsonb(o)->>'is_delete_marker')::boolean is true or to_jsonb(o)->>'archived_at' is not null)) then return false;end if;
 return private.capital_preview_storage_allowed_v1(a.id,p_mode);
end$$;
revoke all on function private.worker_can_access_capital_public_payload_v1(text,text,text),private.capital_preview_storage_allowed_v1(uuid,text),private.worker_can_access_capital_public_payload_pre_preview_v1(text,text,text) from public,anon,authenticated,service_role;
grant execute on function private.worker_can_access_capital_public_payload_v1(text,text,text) to authenticated;
-- Policy expressions retain function OIDs across RENAME. Rebind them to the
-- current dispatch rather than granting clients the historical implementation.
do $$declare p record;ddl text;begin
 for p in select * from pg_policies where schemaname='storage' and tablename='objects' and(coalesce(qual,'') like '%worker_can_access_capital_public_payload_pre_preview_v1%' or coalesce(with_check,'') like '%worker_can_access_capital_public_payload_pre_preview_v1%') loop
 ddl:=format('alter policy %I on storage.objects',p.policyname);
 if p.qual is not null then ddl:=ddl||' using ('||replace(p.qual,'worker_can_access_capital_public_payload_pre_preview_v1','worker_can_access_capital_public_payload_v1')||')';end if;
 if p.with_check is not null then ddl:=ddl||' with check ('||replace(p.with_check,'worker_can_access_capital_public_payload_pre_preview_v1','worker_can_access_capital_public_payload_v1')||')';end if;
 execute ddl;
 end loop;
end$$;
-- Catalog-wide exclusive body reference closes coexistence with every installed
-- origin family without replacing its own constraints.
do $$declare fields text;begin
 select string_agg(quote_ident(attname),','order by attnum)into fields from pg_attribute where attrelid='private.capital_public_payload_allocations'::regclass and not attisdropped and(attname='body_basis_id'or attname like '%\_body_basis_id'escape'\');
 execute 'alter table private.capital_public_payload_allocations add constraint capital_preview_one_basis check(content_kind<>''preview_body''or num_nonnulls('||fields||')=1)';
end$$;
do $$declare t text;cmd text;begin
 foreach t in array array['capital_preview_runs','capital_preview_recipes','capital_preview_body_bases','capital_preview_recipe_seals','capital_preview_execution_failures']loop
 execute format('alter table private.%I enable row level security',t);execute format('alter table private.%I force row level security',t);
 execute format('revoke all on private.%I from public,anon,authenticated,service_role',t);
 foreach cmd in array array['select','insert','update','delete']loop execute format('create policy %I on private.%I as restrictive for %s to anon,authenticated %s',t||'_deny_'||cmd,t,cmd,case when cmd='insert'then'with check(false)'when cmd='update'then'using(false)with check(false)'else'using(false)'end);end loop;
 execute format('create trigger %I before update on private.%I for each row execute function private.set_updated_at()',t||'_updated_at',t);
 execute format('create trigger %I before update or delete on private.%I for each row execute function private.reject_source_version_mutation_v1()',t||'_immutable',t);
 execute format('create trigger %I before truncate on private.%I for each statement execute function private.reject_review_history_mutation_v1()',t||'_no_truncate',t);
 execute format('create trigger %I after insert on private.%I for each row execute function private.capture_identity_audit_v1()',t||'_audit',t);
 end loop;
end$$;

create function private.worker_prepare_capital_preview_boundary_v1(p_job_id uuid,p_capability_token text,p_run_id uuid,p_boundary text)
returns jsonb language plpgsql security definer set search_path=''as $$
declare run private.capital_preview_runs:=private.require_capital_preview_run_v1(p_job_id,p_capability_token,p_run_id,true);
 r private.capital_preview_recipes;task public.capital_project_plan_tasks;
begin
 if p_boundary is null or p_boundary not in('questions','synthesis')then raise exception 'capital_preview_boundary_invalid'using errcode='22023';end if;
 select *into task from public.capital_project_plan_tasks where organization_id=run.organization_id and plan_id=run.plan_id and task_id=case when p_boundary='questions'then'A01'else'A02'end;
 if task.id is null then raise exception 'capital_preview_boundary_denied'using errcode='42501';end if;
 -- Before either paid boundary, every declared parent is a real succeeded run
 -- with an observed physical native task output in this same run and plan.
 if exists(select 1 from unnest(task.dependencies)parent where not exists(select 1 from public.capital_project_task_runs tr
 join public.capital_project_plan_tasks pt on(pt.organization_id,pt.id)=(tr.organization_id,tr.plan_task_id)
 join private.capital_preview_body_bases b on(b.organization_id,b.task_run_id)=(tr.organization_id,tr.id)
 join private.capital_public_payload_allocations a on(a.organization_id,a.preview_body_basis_id)=(b.organization_id,b.id)
 join private.capital_public_retained_payloads physical on(physical.organization_id,physical.allocation_id)=(a.organization_id,a.id)
 where tr.organization_id=run.organization_id and tr.processing_job_id=run.job_id and tr.plan_id=run.plan_id and pt.task_id=parent
 and tr.status='succeeded'and b.run_id=run.id and b.kind='task_output'and private.capital_body_physical_receipt_v1(run.organization_id,physical.id)
 and private.capital_preview_allocation_deadline_v1(run.organization_id,a.id,run.human_subject_id)is not null))then raise exception 'capital_preview_parents_required'using errcode='42501';end if;
 select *into r from private.capital_preview_recipes where organization_id=run.organization_id and run_id=run.id and boundary=p_boundary;
 if r.id is null then
 insert into private.capital_preview_recipes(organization_id,work_id,run_id,job_id,plan_id,plan_task_id,boundary,human_subject_id,worker_account_id,renderer_version,retention_policy_id,expires_at)
 values(run.organization_id,run.work_id,run.id,run.job_id,run.plan_id,task.id,p_boundary,run.human_subject_id,run.worker_account_id,'capital-preview-renderer.'||p_boundary||'.v1',run.retention_policy_id,run.expires_at)returning *into r;
 end if;
 return jsonb_build_object('schemaVersion','capital-preview-boundary-base.v1','recipeId',r.id,'boundaryId',r.id,'runId',run.id,'boundary',p_boundary,'planTaskId',r.plan_task_id,'expiresAt',r.expires_at);
end;$$;
create function private.worker_seal_capital_preview_boundary_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_input_retained_payload_id uuid,p_model_input jsonb,p_pins jsonb,p_consumed_basis_fingerprint text)
returns jsonb language plpgsql security definer set search_path=''as $$
declare j public.processing_jobs:=private.capital_public_capture_job_v1(p_job_id,p_capability_token);r private.capital_preview_recipes;run private.capital_preview_runs;s private.capital_preview_recipe_seals;
 a private.capital_public_payload_allocations;b private.capital_preview_body_bases;input_bytes bigint;max_dispatches integer;
 keys text[]:=array['reconstructionFingerprint','promptFingerprint','primaryRequestFingerprint','fallbackRequestFingerprint'];
begin
 select *into r from private.capital_preview_recipes where organization_id=j.organization_id and job_id=j.id and id=p_recipe_id;
 if r.id is null then raise exception 'capital_preview_boundary_denied'using errcode='42501';end if;
 run:=private.require_capital_preview_run_v1(j.id,p_capability_token,r.run_id,true);
 if jsonb_typeof(p_pins)is distinct from'object'or p_pins-keys<>'{}'::jsonb or not(p_pins?&keys)
 or exists(select 1 from unnest(keys)k where jsonb_typeof(p_pins->k)is distinct from'string'or p_pins->>k!~'^[a-f0-9]{64}$')
 or p_consumed_basis_fingerprint is null or p_consumed_basis_fingerprint!~'^[a-f0-9]{64}$'then raise exception 'capital_preview_pins_invalid'using errcode='22023';end if;
 select allocation.*into a from private.capital_public_retained_payloads retained join private.capital_public_payload_allocations allocation on(allocation.organization_id,allocation.id)=(retained.organization_id,retained.allocation_id)
 where retained.organization_id=j.organization_id and retained.id=p_input_retained_payload_id;
 select *into b from private.capital_preview_body_bases where organization_id=j.organization_id and id=a.preview_body_basis_id;
 if b.run_id is distinct from run.id or b.recipe_id is distinct from r.id or b.kind is distinct from'model_input'
 or a.payload_fingerprint is distinct from encode(extensions.digest(p_model_input::text,'sha256'),'hex')or a.byte_length is distinct from octet_length(p_model_input::text)
 or not private.capital_body_physical_receipt_v1(j.organization_id,p_input_retained_payload_id)
 or private.capital_preview_allocation_deadline_v1(j.organization_id,a.id,j.authorization_subject_id)is null then raise exception 'capital_preview_input_denied'using errcode='42501';end if;
 select sum(octet_length(part->>'text'))into input_bytes from jsonb_array_elements(p_model_input->'input')part;
 if input_bytes not between 1 and 100000 then raise exception 'capital_preview_input_invalid'using errcode='22023';end if;
 max_dispatches:=least(run.effective_max_dispatches,case when r.boundary='synthesis'then 1 else 2 end);
 select *into s from private.capital_preview_recipe_seals where organization_id=j.organization_id and recipe_id=r.id;
 if s.id is null then
 insert into private.capital_preview_recipe_seals(organization_id,recipe_id,plan_task_id,input_retained_payload_id,consumed_basis_fingerprint,reconstruction_fingerprint,prompt_fingerprint,primary_request_fingerprint,fallback_request_fingerprint,input_bytes,effective_budget_micro_usd,effective_max_dispatches)
 values(j.organization_id,r.id,r.plan_task_id,p_input_retained_payload_id,p_consumed_basis_fingerprint,p_pins->>'reconstructionFingerprint',p_pins->>'promptFingerprint',p_pins->>'primaryRequestFingerprint',p_pins->>'fallbackRequestFingerprint',input_bytes,run.effective_budget_micro_usd,max_dispatches)returning *into s;
 elsif(s.input_retained_payload_id,s.consumed_basis_fingerprint,s.reconstruction_fingerprint,s.prompt_fingerprint,s.primary_request_fingerprint,s.fallback_request_fingerprint,s.input_bytes)is distinct from(p_input_retained_payload_id,p_consumed_basis_fingerprint,p_pins->>'reconstructionFingerprint',p_pins->>'promptFingerprint',p_pins->>'primaryRequestFingerprint',p_pins->>'fallbackRequestFingerprint',input_bytes)then raise exception 'capital_preview_seal_conflict'using errcode='23505';end if;
 perform private.require_capital_preview_recipe_v1(j.id,p_capability_token,r.id);
 return jsonb_build_object('schemaVersion','capital-preview-boundary-receipt.v1','state','ready','recipeId',r.id,'boundaryId',r.id,'boundary',r.boundary,'jobId',j.id,'organizationId',j.organization_id,'workId',r.work_id,'planId',r.plan_id,'planTaskId',r.plan_task_id,'rendererVersion',r.renderer_version,
 'reconstructionFingerprint',s.reconstruction_fingerprint,'promptFingerprint',s.prompt_fingerprint,'primaryRequestFingerprint',s.primary_request_fingerprint,'fallbackRequestFingerprint',s.fallback_request_fingerprint,'inputRetainedPayloadId',s.input_retained_payload_id,'consumedBasisFingerprint',s.consumed_basis_fingerprint,
 'operationalBudget',jsonb_build_object('maxExposureMicroUsd',s.effective_budget_micro_usd,'maxDispatches',s.effective_max_dispatches),'expiresAt',r.expires_at);
end;$$;

revoke all on function private.capital_capture_allocation_deadline_v2(uuid,uuid),private.capital_capture_allocation_deadline_pre_preview_v2(uuid,uuid)from public,anon,authenticated,service_role;

-- DRAFT. Paid boundary recipes are actual A01/A02 plan tasks, not invented
-- TaskRuns. Each boundary has one operation; both share the physical run budget.
-- No model call or JSON output is authorized by a DTO alone.
set search_path='';
create table private.capital_preview_operations (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),
 work_id uuid not null,job_id uuid not null,recipe_id uuid not null,plan_task_id uuid not null,
 worker_account_id uuid not null references auth.users(id),human_subject_id uuid not null references auth.users(id),
 root_attempt_id uuid not null,renderer_version text not null check(renderer_version in('capital-preview-renderer.questions.v1','capital-preview-renderer.synthesis.v1')),
 max_dispatches integer not null default 2 check(max_dispatches between 1 and 2),max_exposure_micro_usd bigint not null default 600000 check(max_exposure_micro_usd between 1 and 600000),
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 unique(organization_id,id),unique(organization_id,recipe_id),unique(organization_id,work_id,job_id,id),
 foreign key(organization_id,work_id,recipe_id) references private.capital_preview_recipes(organization_id,work_id,id),
 foreign key(organization_id,job_id) references public.processing_jobs(organization_id,id),
 foreign key(organization_id,plan_task_id) references public.capital_project_plan_tasks(organization_id,id)
);
create table private.capital_preview_gateway_attempts (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),work_id uuid not null,job_id uuid not null,
 operation_id uuid not null,recipe_id uuid not null,invocation_id uuid not null,worker_account_id uuid not null references auth.users(id),human_subject_id uuid not null references auth.users(id),
 previous_attempt_id uuid,root_attempt_id uuid not null,used_provider_fallback boolean not null,
 request_fingerprint text not null check(request_fingerprint~'^[a-f0-9]{64}$'),input_fingerprint text not null check(input_fingerprint~'^[a-f0-9]{64}$'),prompt_fingerprint text not null check(prompt_fingerprint~'^[a-f0-9]{64}$'),
 attempt_metadata jsonb not null,route jsonb not null,resources text[] not null check(resources=array['inference','prompt_cache','schema_cache']::text[]),
 purpose text not null check(purpose='case_analysis'),model text not null check(model in ('claude-sonnet-5','gpt-5.6-terra')),
 processing_decision_id uuid not null,allowed boolean not null,renderer_policy_fingerprint text not null check(renderer_policy_fingerprint~'^[a-f0-9]{64}$'),
 reservation_micro_usd bigint not null check(reservation_micro_usd between 0 and 600000),server_reservation_micro_usd bigint not null check(server_reservation_micro_usd between reservation_micro_usd and 600000),
 captured_at timestamptz not null,created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 unique(organization_id,id),unique(organization_id,invocation_id),unique(organization_id,operation_id,used_provider_fallback),unique(organization_id,work_id,job_id,operation_id,id),
 foreign key(organization_id,work_id,job_id,operation_id) references private.capital_preview_operations(organization_id,work_id,job_id,id),
 foreign key(organization_id,work_id,recipe_id) references private.capital_preview_recipes(organization_id,work_id,id),
 foreign key(organization_id,processing_decision_id) references private.processing_eligibility_decisions(organization_id,id),
 foreign key(organization_id,previous_attempt_id) references private.capital_preview_gateway_attempts(organization_id,id),
 foreign key(organization_id,root_attempt_id) references private.capital_preview_gateway_attempts(organization_id,id) deferrable initially deferred,
 check((not used_provider_fallback and previous_attempt_id is null and root_attempt_id=id and model='claude-sonnet-5')
 or(used_provider_fallback and previous_attempt_id is not null and root_attempt_id<>id and model='gpt-5.6-terra'))
);
alter table private.capital_preview_operations add constraint capital_preview_operation_root_fk
 foreign key(organization_id,work_id,job_id,id,root_attempt_id) references private.capital_preview_gateway_attempts(organization_id,work_id,job_id,operation_id,id) deferrable initially deferred;
create table private.capital_preview_input_dispatches (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),work_id uuid not null,job_id uuid not null,
 operation_id uuid not null,attempt_id uuid not null,invocation_id uuid not null,dispatch_claim_id uuid not null default gen_random_uuid(),
 worker_account_id uuid not null references auth.users(id),human_subject_id uuid not null references auth.users(id),
 request_fingerprint text not null check(request_fingerprint~'^[a-f0-9]{64}$'),reservation_micro_usd bigint not null,server_reservation_micro_usd bigint not null,
 claimed_at timestamptz not null,created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 unique(organization_id,id),unique(organization_id,attempt_id),unique(organization_id,invocation_id),unique(organization_id,dispatch_claim_id),
 unique(organization_id,work_id,job_id,operation_id,attempt_id,id),
 foreign key(organization_id,work_id,job_id,operation_id,attempt_id) references private.capital_preview_gateway_attempts(organization_id,work_id,job_id,operation_id,id),
 check(reservation_micro_usd between 0 and 600000 and server_reservation_micro_usd between reservation_micro_usd and 600000)
);
create table private.capital_preview_attempt_outcomes (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),work_id uuid not null,job_id uuid not null,
 operation_id uuid not null,attempt_id uuid not null,input_receipt_id uuid not null,invocation_id uuid not null,
 worker_account_id uuid not null references auth.users(id),human_subject_id uuid not null references auth.users(id),
 observation jsonb not null,outcome text not null check(outcome in ('accepted','invalid_output','provider_error','timeout','refusal')),
 outcome_fingerprint text not null check(outcome_fingerprint~'^[a-f0-9]{64}$'),cost_micro_usd bigint,server_exposure_micro_usd bigint not null,
 recorded_at timestamptz not null,created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 unique(organization_id,id),unique(organization_id,attempt_id),unique(organization_id,input_receipt_id),unique(organization_id,invocation_id),
 foreign key(organization_id,work_id,job_id,operation_id,attempt_id,input_receipt_id) references private.capital_preview_input_dispatches(organization_id,work_id,job_id,operation_id,attempt_id,id),
 check(cost_micro_usd is null or cost_micro_usd between 0 and 9007199254740991),check(server_exposure_micro_usd between 0 and 9007199254740991)
);
create unique index capital_preview_outcomes_one_accepted on private.capital_preview_attempt_outcomes(organization_id,operation_id) where outcome='accepted';
create table private.capital_preview_accepted_invocations (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),work_id uuid not null,job_id uuid not null,recipe_id uuid not null,
 input_receipt_id uuid not null,invocation_id uuid not null,output_fingerprint text not null check(output_fingerprint~'^[a-f0-9]{64}$'),accepted_identity jsonb not null,
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 unique(organization_id,id),unique(organization_id,work_id,id),unique(organization_id,input_receipt_id),unique(organization_id,recipe_id),
 foreign key(organization_id,work_id,recipe_id) references private.capital_preview_recipes(organization_id,work_id,id),
 foreign key(organization_id,input_receipt_id) references private.capital_preview_input_dispatches(organization_id,id),
 foreign key(organization_id,job_id) references public.processing_jobs(organization_id,id)
);
-- Cover every composite FK and principal lookup; append-only audit has no raw bodies.
create index capital_preview_operation_recipe_idx on private.capital_preview_operations(organization_id,work_id,recipe_id);
create index capital_preview_operation_job_idx on private.capital_preview_operations(organization_id,job_id);
create index capital_preview_operation_execution_plan_idx on private.capital_preview_operations(organization_id,plan_task_id);
create index capital_preview_operation_root_idx on private.capital_preview_operations(organization_id,work_id,job_id,id,root_attempt_id);
create index capital_preview_attempt_op_idx on private.capital_preview_gateway_attempts(organization_id,work_id,job_id,operation_id);
create index capital_preview_attempt_recipe_idx on private.capital_preview_gateway_attempts(organization_id,work_id,recipe_id);
create index capital_preview_attempt_decision_idx on private.capital_preview_gateway_attempts(organization_id,processing_decision_id);
create index capital_preview_attempt_previous_idx on private.capital_preview_gateway_attempts(organization_id,previous_attempt_id);
create index capital_preview_attempt_root_idx on private.capital_preview_gateway_attempts(organization_id,root_attempt_id);
create index capital_preview_dispatch_attempt_idx on private.capital_preview_input_dispatches(organization_id,work_id,job_id,operation_id,attempt_id);
create index capital_preview_outcome_input_idx on private.capital_preview_attempt_outcomes(organization_id,work_id,job_id,operation_id,attempt_id,input_receipt_id);
create index capital_preview_accepted_recipe_idx on private.capital_preview_accepted_invocations(organization_id,work_id,recipe_id);
create index capital_preview_accepted_job_idx on private.capital_preview_accepted_invocations(organization_id,job_id);
do $$declare t text;begin
 foreach t in array array['capital_preview_operations','capital_preview_gateway_attempts','capital_preview_input_dispatches','capital_preview_attempt_outcomes','capital_preview_accepted_invocations'] loop
 execute format('alter table private.%I enable row level security',t);execute format('alter table private.%I force row level security',t);
 execute format('revoke all on private.%I from public,anon,authenticated,service_role',t);
 execute format('create policy deny_clients_select on private.%I as restrictive for select to anon,authenticated using(false)',t);
 execute format('create policy deny_clients_insert on private.%I as restrictive for insert to anon,authenticated with check(false)',t);
 execute format('create policy deny_clients_update on private.%I as restrictive for update to anon,authenticated using(false) with check(false)',t);
 execute format('create policy deny_clients_delete on private.%I as restrictive for delete to anon,authenticated using(false)',t);
 execute format('create trigger %I before update or delete on private.%I for each row execute function private.reject_source_version_mutation_v1()',t||'_immutable',t);
 execute format('create trigger %I before truncate on private.%I for each statement execute function private.reject_review_history_mutation_v1()',t||'_no_truncate',t);
 execute format('create trigger %I before update on private.%I for each row execute function private.set_updated_at()',t||'_updated_at',t);
 execute format('create trigger %I after insert or update or delete on private.%I for each row execute function private.capture_audit_event()',t||'_audit',t);
 if t<>'capital_preview_accepted_invocations' then
 execute format('create index %I on private.%I(worker_account_id)',t||'_worker_idx',t);execute format('create index %I on private.%I(human_subject_id)',t||'_subject_idx',t);
 end if;
 end loop;
end;$$;

-- Separate closed registry; existing contribution fingerprint function is unchanged.
create function private.capital_preview_attempt_outcome_fingerprint_v1(p_outcome jsonb)
returns text language plpgsql immutable security definer set search_path='' as $$
declare keys text[]:=array['schemaVersion','fingerprintVersion','outcomeFingerprint','invocationId','task','provider','configuredModel','schemaName',
 'adapterInputVersion','requestFingerprint','inputFingerprint','promptFingerprint','previousInvocationId','retryOrdinal','isSameModelRepair',
 'usedProviderFallback','processingDecisionId','inputAttestationReceiptId','fromCassette','outcome','failureCode','outputFingerprintVersion',
 'outputFingerprint','reportedModel','validationIssueCodeFingerprint','reservationMicroUsd','costMicroUsd','exposureMicroUsd','costStatus',
 'inputTokens','outputTokens','cachedInputTokens','latencyMillis'];
 key text;number_value numeric;wire text;tuple jsonb;kind text;status text;
begin
 if jsonb_typeof(p_outcome) is distinct from 'object' or octet_length(p_outcome::text)>8192
 or not(p_outcome?&keys) or p_outcome-keys<>'{}'::jsonb
 or p_outcome->>'schemaVersion' is distinct from 'gateway-attempt-outcome.v1'
 or p_outcome->>'fingerprintVersion' is distinct from 'gateway-attempt-outcome-fingerprint.v1'
 or p_outcome->>'task' is null or p_outcome->>'task' not in ('preview_questions','preview_synthesis')
 or p_outcome->>'provider' is distinct from (case when p_outcome->>'configuredModel'='claude-sonnet-5' then 'anthropic' else 'openai' end)
 or p_outcome->>'configuredModel' is null or p_outcome->>'configuredModel' not in ('claude-sonnet-5','gpt-5.6-terra')
 or p_outcome->>'schemaName' is distinct from (case when p_outcome->>'task'='preview_questions' then 'preview_questions_output' else 'preview_synthesis_output' end)
 or p_outcome->>'adapterInputVersion' is distinct from 'gateway-adapter-input.v1' then
 raise exception 'capital_preview_outcome_invalid' using errcode='22023';end if;
 foreach key in array array['outcomeFingerprint','requestFingerprint','inputFingerprint','promptFingerprint'] loop
 if jsonb_typeof(p_outcome->key) is distinct from 'string' or p_outcome->>key !~ '^[a-f0-9]{64}$' then
 raise exception 'capital_preview_outcome_invalid' using errcode='22023';end if;end loop;
 foreach key in array array['invocationId','processingDecisionId','inputAttestationReceiptId'] loop
 if jsonb_typeof(p_outcome->key) is distinct from 'string' or p_outcome->>key !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' then
 raise exception 'capital_preview_outcome_invalid' using errcode='22023';end if;end loop;
 if p_outcome->'previousInvocationId'<>'null'::jsonb and(jsonb_typeof(p_outcome->'previousInvocationId') is distinct from 'string'
 or p_outcome->>'previousInvocationId'!~'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$') then
 raise exception 'capital_preview_outcome_invalid' using errcode='22023';end if;
 foreach key in array array['isSameModelRepair','usedProviderFallback','fromCassette'] loop
 if jsonb_typeof(p_outcome->key) is distinct from 'boolean' then raise exception 'capital_preview_outcome_invalid' using errcode='22023';end if;end loop;
 if p_outcome->>'isSameModelRepair'<>'false' or p_outcome->>'fromCassette'<>'false' or p_outcome->>'retryOrdinal'<>'0'
 or((p_outcome->>'usedProviderFallback')::boolean and p_outcome->'previousInvocationId'='null'::jsonb)
 or(not(p_outcome->>'usedProviderFallback')::boolean and p_outcome->'previousInvocationId'<>'null'::jsonb) then
 raise exception 'capital_preview_outcome_invalid' using errcode='22023';end if;
 foreach key in array array['retryOrdinal','reservationMicroUsd','costMicroUsd','exposureMicroUsd','inputTokens','outputTokens','cachedInputTokens','latencyMillis'] loop
 if p_outcome->key='null'::jsonb and key in ('costMicroUsd','inputTokens','outputTokens','cachedInputTokens') then continue;end if;
 if jsonb_typeof(p_outcome->key) is distinct from 'number' then raise exception 'capital_preview_outcome_invalid' using errcode='22023';end if;
 number_value:=(p_outcome->>key)::numeric;
 if number_value<0 or number_value>9007199254740991 or trunc(number_value)<>number_value or scale(number_value)<>0 then raise exception 'capital_preview_outcome_invalid' using errcode='22023';end if;
 end loop;
 kind:=p_outcome->>'outcome';status:=p_outcome->>'costStatus';
 if kind is null or kind not in ('accepted','invalid_output','provider_error','timeout','refusal') or status is null or status not in ('measured','unknown') then
 raise exception 'capital_preview_outcome_invalid' using errcode='22023';end if;
 if(status='unknown' and exists(select 1 from unnest(array['costMicroUsd','inputTokens','outputTokens','cachedInputTokens']) k where p_outcome->k<>'null'::jsonb))
 or(status='measured' and exists(select 1 from unnest(array['costMicroUsd','inputTokens','outputTokens','cachedInputTokens']) k where p_outcome->k='null'::jsonb))
 or(kind in ('provider_error','timeout') and status<>'unknown')
 or(p_outcome->>'exposureMicroUsd')::numeric<>greatest((p_outcome->>'reservationMicroUsd')::numeric,coalesce((p_outcome->>'costMicroUsd')::numeric,(p_outcome->>'reservationMicroUsd')::numeric)) then
 raise exception 'capital_preview_outcome_invalid' using errcode='22023';end if;
 if kind='accepted' then
 if p_outcome->'failureCode'<>'null'::jsonb or p_outcome->>'outputFingerprintVersion' is distinct from 'gateway-parsed-output.v1'
 or jsonb_typeof(p_outcome->'outputFingerprint') is distinct from 'string' or p_outcome->>'outputFingerprint'!~'^[a-f0-9]{64}$'
 or p_outcome->>'reportedModel' is distinct from p_outcome->>'configuredModel' or p_outcome->'validationIssueCodeFingerprint'<>'null'::jsonb then
 raise exception 'capital_preview_outcome_invalid' using errcode='22023';end if;
 else
 if p_outcome->'outputFingerprintVersion'<>'null'::jsonb or p_outcome->'outputFingerprint'<>'null'::jsonb or p_outcome->'reportedModel'<>'null'::jsonb
 or jsonb_typeof(p_outcome->'failureCode') is distinct from 'string'
 or(kind='invalid_output' and p_outcome->>'failureCode' not in ('schema_invalid','deterministic_invalid','output_truncated'))
 or(kind='provider_error' and p_outcome->>'failureCode'<>'provider_failure')
 or(kind='timeout' and p_outcome->>'failureCode'<>'provider_timeout')
 or(kind='refusal' and p_outcome->>'failureCode'<>'provider_refusal') then raise exception 'capital_preview_outcome_invalid' using errcode='22023';end if;
 if kind='invalid_output' then
 if p_outcome->'validationIssueCodeFingerprint'<>'null'::jsonb and(jsonb_typeof(p_outcome->'validationIssueCodeFingerprint') is distinct from 'string'
 or p_outcome->>'validationIssueCodeFingerprint'!~'^[a-f0-9]{64}$') then raise exception 'capital_preview_outcome_invalid' using errcode='22023';end if;
 if p_outcome->>'failureCode' in ('schema_invalid','deterministic_invalid') and p_outcome->'validationIssueCodeFingerprint'='null'::jsonb then
 raise exception 'capital_preview_outcome_invalid' using errcode='22023';end if;
 elsif p_outcome->'validationIssueCodeFingerprint'<>'null'::jsonb then raise exception 'capital_preview_outcome_invalid' using errcode='22023';end if;
 end if;
 tuple:=jsonb_build_array(p_outcome->'fingerprintVersion',p_outcome->'invocationId',p_outcome->'task',p_outcome->'provider',p_outcome->'configuredModel',
 p_outcome->'schemaName',p_outcome->'adapterInputVersion',p_outcome->'requestFingerprint',p_outcome->'inputFingerprint',p_outcome->'promptFingerprint',
 p_outcome->'previousInvocationId',p_outcome->'retryOrdinal',p_outcome->'isSameModelRepair',p_outcome->'usedProviderFallback',p_outcome->'processingDecisionId',
 p_outcome->'inputAttestationReceiptId',p_outcome->'fromCassette',p_outcome->'outcome',p_outcome->'failureCode',p_outcome->'outputFingerprintVersion',
 p_outcome->'outputFingerprint',p_outcome->'reportedModel',p_outcome->'validationIssueCodeFingerprint',p_outcome->'reservationMicroUsd',p_outcome->'costMicroUsd',
 p_outcome->'exposureMicroUsd',p_outcome->'costStatus',p_outcome->'inputTokens',p_outcome->'outputTokens',p_outcome->'cachedInputTokens',p_outcome->'latencyMillis');
 select '['||string_agg(case when jsonb_typeof(x.value)='number' then ((x.value::text)::numeric)::bigint::text else x.value::text end,',' order by x.ordinality)||']'
 into wire from jsonb_array_elements(tuple) with ordinality x(value,ordinality);
 return encode(extensions.digest(wire,'sha256'),'hex');
end; $$;

-- Closed ASCII registry, independently verified against shared Node serialization.
-- Schema pin refers to actual logical Zod schema; physical SHA remains separate.
create function private.lock_capital_preview_operation_v1(p_org uuid,p_recipe uuid)
returns void language plpgsql security definer set search_path='' as $$begin
 if not pg_try_advisory_xact_lock(hashtextextended('capital-preview-run:'||p_org::text||':'||coalesce((select run_id::text from private.capital_preview_recipes where organization_id=p_org and id=p_recipe),p_recipe::text),0)) then
 raise exception 'capital_capture_retry' using errcode='40001';end if;
end;$$;
create function private.capital_preview_attempt_assurances_current_v1(p_job public.processing_jobs,p_attempt private.capital_preview_gateway_attempts)
returns void language plpgsql security definer set search_path='' as $$
declare decision_row private.processing_eligibility_decisions;assurance_row private.provider_processing_assurances;
 assurance_uuid uuid;seen text[]:='{}';matches integer;
begin
 if p_attempt.organization_id<>p_job.organization_id or p_attempt.job_id<>p_job.id or not p_attempt.allowed
 or p_attempt.worker_account_id<>auth.uid() or p_attempt.human_subject_id<>p_job.authorization_subject_id then raise exception 'capital_preview_processing_denied' using errcode='42501';end if;
 if not pg_try_advisory_xact_lock_shared(hashtextextended('provider-processing-assurances',0)) then raise exception 'capital_capture_retry' using errcode='40001';end if;
 select * into decision_row from private.processing_eligibility_decisions where organization_id=p_job.organization_id and job_id=p_job.id and id=p_attempt.processing_decision_id;
 if decision_row.id is null or not decision_row.allowed or decision_row.route is distinct from p_attempt.route
 or decision_row.classification is distinct from 'restricted' or decision_row.purpose is distinct from 'case_analysis'
 or decision_row.policy_version is distinct from 'offroad-provider-retention-v2' or decision_row.resources is distinct from p_attempt.resources
 or cardinality(decision_row.assurance_ids)<>3 or(select count(distinct x) from unnest(decision_row.assurance_ids)x)<>3 then
 raise exception 'capital_preview_processing_denied' using errcode='42501';end if;
 for assurance_uuid in select x from unnest(decision_row.assurance_ids)x order by x loop
 begin select * into assurance_row from private.provider_processing_assurances where id=assurance_uuid for share nowait;
 exception when lock_not_available then raise exception 'capital_capture_retry' using errcode='40001';end;
 if assurance_row.id is null or assurance_row.revoked_at is not null or assurance_row.reviewed_at>clock_timestamp()
 or assurance_row.valid_through<=clock_timestamp() or assurance_row.provider is distinct from p_attempt.route->>'provider'
 or assurance_row.account_ref is distinct from p_attempt.route->>'accountRef' or assurance_row.project_ref is distinct from p_attempt.route->>'projectRef'
 or assurance_row.credential_binding is distinct from p_attempt.route->>'credentialBinding' or assurance_row.endpoint is distinct from p_attempt.route->>'endpoint'
 or assurance_row.region is distinct from p_attempt.route->>'region' or(assurance_row.document->'models' ? p_attempt.model)is distinct from true
 or assurance_row.resource not in ('inference','prompt_cache','schema_cache') or assurance_row.resource=any(seen)
 or assurance_row.document->>'eligibility' is distinct from 'supported' or assurance_row.document->>'trainingUse' is distinct from 'prohibited'
 or(assurance_row.document->'purposes' ? 'case_analysis')is distinct from true or(assurance_row.document->'classifications' ? 'restricted')is distinct from true
 or(assurance_row.document->'rights' ? 'process')is distinct from true then raise exception 'capital_preview_processing_denied' using errcode='42501';end if;
 select count(*) into matches from private.provider_processing_assurances a where a.revoked_at is null
 and(a.provider,a.account_ref,a.project_ref,a.credential_binding,a.endpoint,a.region,a.resource)
 is not distinct from(assurance_row.provider,assurance_row.account_ref,assurance_row.project_ref,assurance_row.credential_binding,assurance_row.endpoint,assurance_row.region,assurance_row.resource)
 and a.document->'models' ? p_attempt.model;
 if matches<>1 then raise exception 'capital_preview_processing_denied' using errcode='42501';end if;
 seen:=array_append(seen,assurance_row.resource);
 end loop;
end;$$;
create function private.capital_preview_attempt_current_v1(p_job_id uuid,p_capability_token text,p_attempt private.capital_preview_gateway_attempts)
returns private.capital_preview_recipes language plpgsql security definer set search_path='' as $$
declare recipe private.capital_preview_recipes;job public.processing_jobs;op private.capital_preview_operations;seal private.capital_preview_recipe_seals;prior private.capital_preview_gateway_attempts;
begin
 recipe:=private.require_capital_preview_recipe_v1(p_job_id,p_capability_token,p_attempt.recipe_id);
 if exists(select 1 from private.capital_preview_execution_failures where organization_id=recipe.organization_id and recipe_id=recipe.id) then raise exception 'capital_preview_execution_failed_terminal' using errcode='42501';end if;
 job:=private.capital_public_capture_job_v1(p_job_id,p_capability_token);
 perform private.lock_capital_preview_operation_v1(recipe.organization_id,recipe.id);
 select * into op from private.capital_preview_operations where organization_id=recipe.organization_id and id=p_attempt.operation_id;
 select * into seal from private.capital_preview_recipe_seals where organization_id=recipe.organization_id and recipe_id=recipe.id;
 if op.id is null or seal.recipe_id is null or p_attempt.job_id<>recipe.job_id or p_attempt.work_id<>recipe.work_id
 or p_attempt.worker_account_id<>auth.uid() or p_attempt.human_subject_id<>job.authorization_subject_id
 or op.recipe_id<>recipe.id or op.job_id<>job.id or op.worker_account_id<>auth.uid() or op.human_subject_id<>job.authorization_subject_id
 or op.plan_task_id<>seal.plan_task_id or op.root_attempt_id<>p_attempt.root_attempt_id
 or p_attempt.input_fingerprint<>seal.reconstruction_fingerprint or p_attempt.prompt_fingerprint<>seal.prompt_fingerprint
 or p_attempt.request_fingerprint<>(case when p_attempt.used_provider_fallback then seal.fallback_request_fingerprint else seal.primary_request_fingerprint end) then
 raise exception 'capital_preview_processing_denied' using errcode='42501';end if;
 if not exists(select 1 from public.capital_project_plan_tasks pt where pt.organization_id=recipe.organization_id and pt.id=seal.plan_task_id
 and pt.plan_id=recipe.plan_id and pt.task_id=case when recipe.boundary='questions'then'A01'else'A02'end) then
 raise exception 'capital_preview_plan_task_denied' using errcode='42501';end if;
 if p_attempt.previous_attempt_id is not null then
 select * into prior from private.capital_preview_gateway_attempts where organization_id=recipe.organization_id and id=p_attempt.previous_attempt_id;
 if prior.id is null or prior.operation_id<>op.id or prior.used_provider_fallback or prior.root_attempt_id<>p_attempt.root_attempt_id
 or prior.worker_account_id<>auth.uid() or prior.human_subject_id<>job.authorization_subject_id then raise exception 'capital_preview_processing_denied' using errcode='42501';end if;
 if prior.allowed then
 perform private.capital_preview_attempt_assurances_current_v1(job,prior);
 if not exists(select 1 from private.capital_preview_attempt_outcomes o where o.organization_id=recipe.organization_id and o.attempt_id=prior.id and o.outcome<>'accepted') then
 raise exception 'capital_preview_processing_denied' using errcode='42501';end if;
 end if;
 end if;
 if p_attempt.allowed then perform private.capital_preview_attempt_assurances_current_v1(job,p_attempt);end if;
 return recipe;
end;$$;

create function private.capital_preview_attempt_dto_v1(p_attempt private.capital_preview_gateway_attempts,p_replayed boolean)
returns jsonb language sql security definer set search_path='' as $$
 select jsonb_build_object('schemaVersion','capital-body-processing-decision.v2','allowed',p_attempt.allowed,'policyVersion',d.policy_version,
 'assuranceId',null,'assuranceIds',to_jsonb(d.assurance_ids),'decisionId',d.id,'classification',d.classification,'reasons',to_jsonb(d.reasons),
 'attemptReceiptId',p_attempt.id,'invocationId',p_attempt.invocation_id,'requestFingerprint',p_attempt.request_fingerprint,
 'eligibilityFingerprint',encode(extensions.digest(jsonb_build_object('decision',d.id,'recipe',p_attempt.recipe_id,'policy',p_attempt.renderer_policy_fingerprint)::text,'sha256'),'hex'),
 'replayed',p_replayed,'operationId',p_attempt.operation_id,'rootAttemptReceiptId',p_attempt.root_attempt_id)
 from private.processing_eligibility_decisions d where d.organization_id=p_attempt.organization_id and d.id=p_attempt.processing_decision_id;
$$;
create function private.worker_authorize_capital_preview_processing_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_attempt jsonb,p_route jsonb,p_resources text[],p_purpose text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare recipe private.capital_preview_recipes:=private.require_capital_preview_recipe_v1(p_job_id,p_capability_token,p_recipe_id);
 job public.processing_jobs:=private.capital_public_capture_job_v1(p_job_id,p_capability_token);seal private.capital_preview_recipe_seals;
 op private.capital_preview_operations;a private.capital_preview_gateway_attempts;prior private.capital_preview_gateway_attempts;
 fallback boolean;invocation uuid;prior_invocation uuid;new_attempt_id uuid:=gen_random_uuid();model text;policy jsonb;decision jsonb;
 observed bigint;server_reserve bigint;stamp timestamptz:=clock_timestamp();deadline timestamptz;replayed boolean:=false;
begin
 perform private.lock_capital_preview_operation_v1(recipe.organization_id,recipe.id);
 if exists(select 1 from private.capital_preview_execution_failures where organization_id=recipe.organization_id and recipe_id=recipe.id) then raise exception 'capital_preview_quality_failed_terminal' using errcode='42501';end if;
 select * into strict seal from private.capital_preview_recipe_seals where organization_id=recipe.organization_id and recipe_id=recipe.id;
 if not exists(select 1 from public.capital_project_plan_tasks pt where pt.organization_id=recipe.organization_id and pt.id=seal.plan_task_id
 and pt.plan_id=recipe.plan_id and pt.task_id=case when recipe.boundary='questions'then'A01'else'A02'end) then
 raise exception 'capital_preview_plan_task_denied' using errcode='42501';end if;
 if jsonb_typeof(p_attempt)is distinct from 'object' or octet_length(p_attempt::text)>4096
 or not(p_attempt?&array['adapterInputVersion','task','schemaName','requestFingerprint','inputFingerprint','promptFingerprint','invocationId','retryOrdinal','isSameModelRepair','usedProviderFallback','reservationUsd'])
 or p_attempt-array['adapterInputVersion','task','schemaName','requestFingerprint','inputFingerprint','promptFingerprint','invocationId','retryOrdinal','isSameModelRepair','usedProviderFallback','reservationUsd','previousInvocationId']<>'{}'::jsonb
 or p_attempt->>'adapterInputVersion'is distinct from 'gateway-adapter-input.v1' or p_attempt->>'task'is distinct from (case when recipe.boundary='questions'then'preview_questions'else'preview_synthesis'end)
 or p_attempt->>'schemaName'is distinct from (case when recipe.boundary='questions'then'preview_questions_output'else'preview_synthesis_output'end)
 or exists(select 1 from unnest(array['requestFingerprint','inputFingerprint','promptFingerprint'])k where jsonb_typeof(p_attempt->k)is distinct from 'string' or p_attempt->>k !~'^[a-f0-9]{64}$')
 or jsonb_typeof(p_attempt->'invocationId')is distinct from 'string' or p_attempt->>'invocationId'!~'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
 or jsonb_typeof(p_attempt->'retryOrdinal')is distinct from 'number' or p_attempt->>'retryOrdinal'is distinct from '0'
 or jsonb_typeof(p_attempt->'isSameModelRepair')is distinct from 'boolean' or p_attempt->>'isSameModelRepair'is distinct from 'false'
 or jsonb_typeof(p_attempt->'usedProviderFallback')is distinct from 'boolean' or jsonb_typeof(p_attempt->'reservationUsd')is distinct from 'number'
 or(p_attempt->>'reservationUsd')::numeric not between 0 and 0.6
 or p_resources is null or cardinality(p_resources)<>3 or not(p_resources@>array['inference','prompt_cache','schema_cache']::text[]) or p_purpose is distinct from 'case_analysis' then
 raise exception 'capital_preview_processing_invalid' using errcode='22023';end if;
 invocation:=(p_attempt->>'invocationId')::uuid;fallback:=(p_attempt->>'usedProviderFallback')::boolean;
 if(fallback and(jsonb_typeof(p_attempt->'previousInvocationId')is distinct from 'string' or p_attempt->>'previousInvocationId'!~'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'))
 or(not fallback and p_attempt?'previousInvocationId')then raise exception 'capital_preview_processing_invalid' using errcode='22023';end if;
 if fallback then prior_invocation:=(p_attempt->>'previousInvocationId')::uuid;end if;
 model:=case when fallback then 'gpt-5.6-terra' else 'claude-sonnet-5' end;
 if jsonb_typeof(p_route)is distinct from 'object' or p_route->>'provider'is distinct from (case when fallback then 'openai' else 'anthropic' end) or p_route->>'model'is distinct from model
 or p_route->>'endpoint'is distinct from (case when fallback then 'https://api.openai.com/v1/responses' else 'https://api.anthropic.com/v1/messages' end) then raise exception 'capital_preview_processing_invalid' using errcode='22023';end if;
 if p_attempt->>'inputFingerprint'is distinct from seal.reconstruction_fingerprint or p_attempt->>'promptFingerprint'is distinct from seal.prompt_fingerprint
 or p_attempt->>'requestFingerprint'is distinct from (case when fallback then seal.fallback_request_fingerprint else seal.primary_request_fingerprint end) then
 raise exception 'capital_preview_processing_denied' using errcode='42501';end if;
 if exists(select 1 from private.capital_body_invocation_inputs x where x.organization_id=recipe.organization_id and x.invocation_id=invocation)
 or exists(select 1 from private.capital_body_gateway_attempts x where x.organization_id=recipe.organization_id and x.invocation_id=invocation) then
 raise exception 'capital_preview_processing_denied' using errcode='42501';end if;
 policy:=private.capital_preview_dispatch_policy_v1(recipe.boundary,model,seal.input_bytes);observed:=ceil((p_attempt->>'reservationUsd')::numeric*1000000)::bigint;
 server_reserve:=greatest(observed,(policy->>'serverBoundMicroUsd')::bigint);
 select * into op from private.capital_preview_operations where organization_id=recipe.organization_id and recipe_id=recipe.id;
 select * into a from private.capital_preview_gateway_attempts where organization_id=recipe.organization_id and invocation_id=invocation;
 if a.id is not null then
 if op.id is null or a.operation_id<>op.id or a.recipe_id<>recipe.id or a.attempt_metadata is distinct from p_attempt or a.route is distinct from p_route
 or a.reservation_micro_usd<>observed or a.server_reservation_micro_usd<>server_reserve or a.renderer_policy_fingerprint<>policy->>'policyFingerprint' then
 raise exception 'capital_preview_processing_conflict' using errcode='23505';end if;
 perform private.capital_preview_attempt_current_v1(p_job_id,p_capability_token,a);replayed:=true;
 else
 if op.id is null then
 if fallback then raise exception 'capital_preview_processing_denied' using errcode='42501';end if;
 insert into private.capital_preview_operations(organization_id,work_id,job_id,recipe_id,plan_task_id,worker_account_id,human_subject_id,root_attempt_id,renderer_version,max_dispatches,max_exposure_micro_usd)
 values(recipe.organization_id,recipe.work_id,job.id,recipe.id,seal.plan_task_id,auth.uid(),job.authorization_subject_id,new_attempt_id,recipe.renderer_version,seal.effective_max_dispatches,seal.effective_budget_micro_usd) returning * into op;
 elsif not fallback then raise exception 'capital_preview_processing_denied' using errcode='42501';
 end if;
 if op.job_id<>job.id or op.worker_account_id<>auth.uid() or op.human_subject_id<>job.authorization_subject_id or op.plan_task_id<>seal.plan_task_id then raise exception 'capital_preview_processing_denied' using errcode='42501';end if;
 if fallback then
 select * into prior from private.capital_preview_gateway_attempts where organization_id=recipe.organization_id and invocation_id=prior_invocation;
 if prior.id is null or prior.operation_id<>op.id or prior.used_provider_fallback or prior.id<>op.root_attempt_id
 or exists(select 1 from private.capital_preview_attempt_outcomes o where o.organization_id=recipe.organization_id and o.operation_id=op.id and o.outcome='accepted') then raise exception 'capital_preview_processing_denied' using errcode='42501';end if;
 perform private.capital_preview_attempt_current_v1(p_job_id,p_capability_token,prior);
 if prior.allowed and not exists(select 1 from private.capital_preview_attempt_outcomes o where o.organization_id=recipe.organization_id and o.attempt_id=prior.id and o.outcome<>'accepted') then
 raise exception 'capital_preview_processing_denied' using errcode='42501';end if;
 end if;
 deadline:=private.capital_preview_recipe_deadline_v1(recipe.organization_id,recipe.id,job.authorization_subject_id);
 if deadline is null or deadline<=clock_timestamp() then raise exception 'capital_preview_processing_denied' using errcode='42501';end if;
 decision:=private.provider_processing_decision_with_body_limit_v1(job,p_route,array['inference','prompt_cache','schema_cache'],p_purpose,least(deadline,recipe.expires_at));
 insert into private.capital_preview_gateway_attempts(id,organization_id,work_id,job_id,operation_id,recipe_id,invocation_id,worker_account_id,human_subject_id,
 previous_attempt_id,root_attempt_id,used_provider_fallback,request_fingerprint,input_fingerprint,prompt_fingerprint,attempt_metadata,route,resources,purpose,model,
 processing_decision_id,allowed,renderer_policy_fingerprint,reservation_micro_usd,server_reservation_micro_usd,captured_at)
 values(new_attempt_id,recipe.organization_id,recipe.work_id,job.id,op.id,recipe.id,invocation,auth.uid(),job.authorization_subject_id,
 case when fallback then prior.id else null end,op.root_attempt_id,fallback,p_attempt->>'requestFingerprint',p_attempt->>'inputFingerprint',p_attempt->>'promptFingerprint',p_attempt,p_route,
 array['inference','prompt_cache','schema_cache'],'case_analysis',model,(decision->>'decisionId')::uuid,(decision->>'allowed')::boolean,policy->>'policyFingerprint',observed,server_reserve,stamp) returning * into a;
 end if;
 perform private.require_capital_preview_recipe_v1(p_job_id,p_capability_token,recipe.id);
 return private.capital_preview_attempt_dto_v1(a,replayed);
end;$$;

create function private.worker_record_capital_preview_input_v1(p_job_id uuid,p_capability_token text,p_attempt_receipt_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare job public.processing_jobs:=private.capital_public_capture_job_v1(p_job_id,p_capability_token);a private.capital_preview_gateway_attempts;
 recipe private.capital_preview_recipes;op private.capital_preview_operations;claim private.capital_preview_input_dispatches;exposure numeric;sends integer;boundary_sends integer;run_max_calls integer;fresh boolean:=false;
 policy jsonb;eligibility jsonb;deadline timestamptz;
begin
 select * into a from private.capital_preview_gateway_attempts where organization_id=job.organization_id and job_id=job.id and id=p_attempt_receipt_id;
 if a.id is null or not a.allowed then raise exception 'capital_preview_processing_denied' using errcode='42501';end if;
 recipe:=private.capital_preview_attempt_current_v1(p_job_id,p_capability_token,a);
 select * into strict op from private.capital_preview_operations where organization_id=job.organization_id and id=a.operation_id;
 policy:=private.capital_preview_dispatch_policy_v1(recipe.boundary,a.model,(select input_bytes from private.capital_preview_recipe_seals where organization_id=recipe.organization_id and recipe_id=recipe.id));
 if a.renderer_policy_fingerprint<>policy->>'policyFingerprint' or a.server_reservation_micro_usd<>greatest(a.reservation_micro_usd,(policy->>'serverBoundMicroUsd')::bigint)then raise exception 'capital_preview_processing_denied' using errcode='42501';end if;
 select * into claim from private.capital_preview_input_dispatches where organization_id=job.organization_id and attempt_id=a.id;
 if claim.id is null then
 if exists(select 1 from private.capital_preview_attempt_outcomes where organization_id=job.organization_id and operation_id=op.id and outcome='accepted')then raise exception 'capital_preview_processing_denied' using errcode='42501';end if;
 select count(*),coalesce(sum(greatest(d.server_reservation_micro_usd,coalesce(o.cost_micro_usd,d.server_reservation_micro_usd))),0) into sends,exposure
 from private.capital_preview_input_dispatches d left join private.capital_preview_attempt_outcomes o on o.organization_id=d.organization_id and o.input_receipt_id=d.id
 where d.organization_id=job.organization_id and d.operation_id in(select operation.id from private.capital_preview_operations operation
 join private.capital_preview_recipes r on r.organization_id=operation.organization_id and r.id=operation.recipe_id
 where r.organization_id=recipe.organization_id and r.run_id=recipe.run_id);
 select count(*) into boundary_sends from private.capital_preview_input_dispatches where organization_id=job.organization_id and operation_id=op.id;
 select effective_max_dispatches into strict run_max_calls from private.capital_preview_runs where organization_id=recipe.organization_id and id=recipe.run_id;
 if boundary_sends>=op.max_dispatches or sends>=run_max_calls or exposure+a.server_reservation_micro_usd>op.max_exposure_micro_usd then raise exception 'capital_preview_budget_denied' using errcode='42501';end if;
 -- Re-evaluate provider TTL at the one actual send grant. Replay does not reset it.
 deadline:=private.capital_preview_recipe_deadline_v1(recipe.organization_id,recipe.id,job.authorization_subject_id);
 eligibility:=private.resolve_capital_body_processing_v1(job,a.route,a.resources,a.purpose,least(deadline,recipe.expires_at));
 if eligibility->>'allowed'is distinct from 'true' then raise exception 'capital_preview_processing_denied' using errcode='42501';end if;
 insert into private.capital_preview_input_dispatches(organization_id,work_id,job_id,operation_id,attempt_id,invocation_id,worker_account_id,human_subject_id,
 request_fingerprint,reservation_micro_usd,server_reservation_micro_usd,claimed_at)
 values(job.organization_id,a.work_id,job.id,op.id,a.id,a.invocation_id,auth.uid(),job.authorization_subject_id,a.request_fingerprint,a.reservation_micro_usd,a.server_reservation_micro_usd,clock_timestamp())returning * into claim;fresh:=true;
 end if;
 if claim.operation_id<>op.id or claim.invocation_id<>a.invocation_id or claim.worker_account_id<>auth.uid() or claim.human_subject_id<>job.authorization_subject_id
 or claim.request_fingerprint<>a.request_fingerprint then raise exception 'capital_preview_processing_conflict' using errcode='23505';end if;
 perform private.capital_preview_attempt_current_v1(p_job_id,p_capability_token,a);
 return jsonb_build_object('schemaVersion','capital-body-input-dispatch.v3','receiptId',claim.id,'invocationId',a.invocation_id,'requestFingerprint',a.request_fingerprint,
 'operationId',op.id,'attemptReceiptId',a.id,'rootAttemptReceiptId',op.root_attempt_id,'dispatchClaimId',claim.dispatch_claim_id,
 'rendererPolicyFingerprint',a.renderer_policy_fingerprint,'reservationMicroUsd',a.reservation_micro_usd,'serverReservationMicroUsd',claim.server_reservation_micro_usd,
 'dispatchAllowed',fresh,'replayed',not fresh);
end;$$;

create function private.worker_record_capital_preview_attempt_outcome_v1(p_job_id uuid,p_capability_token text,p_attempt_receipt_id uuid,p_outcome jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare job public.processing_jobs:=private.capital_public_capture_job_v1(p_job_id,p_capability_token);a private.capital_preview_gateway_attempts;prior private.capital_preview_gateway_attempts;
 recipe private.capital_preview_recipes;op private.capital_preview_operations;claim private.capital_preview_input_dispatches;recorded private.capital_preview_attempt_outcomes;
 common_fp text;replayed boolean:=false;
begin
 common_fp:=private.capital_preview_attempt_outcome_fingerprint_v1(p_outcome);
 if common_fp is distinct from p_outcome->>'outcomeFingerprint'then raise exception 'capital_preview_outcome_invalid' using errcode='22023';end if;
 select * into a from private.capital_preview_gateway_attempts where organization_id=job.organization_id and job_id=job.id and id=p_attempt_receipt_id;
 if a.id is null or not a.allowed then raise exception 'capital_preview_processing_denied' using errcode='42501';end if;
 recipe:=private.capital_preview_attempt_current_v1(p_job_id,p_capability_token,a);
 select * into strict op from private.capital_preview_operations where organization_id=job.organization_id and id=a.operation_id;
 select * into claim from private.capital_preview_input_dispatches where organization_id=job.organization_id and attempt_id=a.id;
 select * into prior from private.capital_preview_gateway_attempts where organization_id=job.organization_id and id=a.previous_attempt_id;
 if claim.id is null or claim.operation_id<>op.id or claim.worker_account_id<>auth.uid() or claim.human_subject_id<>job.authorization_subject_id
 or(p_outcome->>'invocationId',p_outcome->>'task',p_outcome->>'provider',p_outcome->>'configuredModel',p_outcome->>'schemaName',p_outcome->>'adapterInputVersion',
 p_outcome->>'requestFingerprint',p_outcome->>'inputFingerprint',p_outcome->>'promptFingerprint',p_outcome->>'previousInvocationId',p_outcome->>'retryOrdinal',
 p_outcome->>'isSameModelRepair',p_outcome->>'usedProviderFallback',p_outcome->>'processingDecisionId',p_outcome->>'inputAttestationReceiptId')
 is distinct from(a.invocation_id::text,(case when recipe.boundary='questions'then'preview_questions'else'preview_synthesis'end)::text,(a.route->>'provider')::text,a.model,(case when recipe.boundary='questions'then'preview_questions_output'else'preview_synthesis_output'end)::text,'gateway-adapter-input.v1'::text,
 a.request_fingerprint,a.input_fingerprint,a.prompt_fingerprint,prior.invocation_id::text,'0'::text,'false'::text,a.used_provider_fallback::text,a.processing_decision_id::text,claim.id::text)
 or(p_outcome->>'reservationMicroUsd')::bigint<>a.reservation_micro_usd then raise exception 'capital_preview_outcome_denied' using errcode='42501';end if;
 select * into recorded from private.capital_preview_attempt_outcomes where organization_id=job.organization_id and attempt_id=a.id;
 if recorded.id is not null then
 if recorded.observation is distinct from p_outcome or recorded.outcome_fingerprint<>common_fp or recorded.input_receipt_id<>claim.id then raise exception 'capital_preview_outcome_conflict' using errcode='23505';end if;
 replayed:=true;
 else
 insert into private.capital_preview_attempt_outcomes(organization_id,work_id,job_id,operation_id,attempt_id,input_receipt_id,invocation_id,worker_account_id,human_subject_id,
 observation,outcome,outcome_fingerprint,cost_micro_usd,server_exposure_micro_usd,recorded_at)
 values(job.organization_id,a.work_id,job.id,op.id,a.id,claim.id,a.invocation_id,auth.uid(),job.authorization_subject_id,p_outcome,p_outcome->>'outcome',common_fp,
 (p_outcome->>'costMicroUsd')::bigint,greatest(claim.server_reservation_micro_usd,coalesce((p_outcome->>'costMicroUsd')::bigint,claim.server_reservation_micro_usd)),clock_timestamp())returning * into recorded;
 end if;
 perform private.capital_preview_attempt_current_v1(p_job_id,p_capability_token,a);
 return jsonb_build_object('schemaVersion','capital-body-attempt-outcome-receipt.v1','receiptId',recorded.id,'operationId',op.id,'attemptReceiptId',a.id,'inputReceiptId',claim.id,
 'rootAttemptReceiptId',op.root_attempt_id,'invocationId',a.invocation_id,'requestFingerprint',a.request_fingerprint,'fingerprintVersion','gateway-attempt-outcome-fingerprint.v1',
 'outcomeFingerprint',recorded.outcome_fingerprint,'outcome',recorded.outcome,'failureCode',recorded.observation->'failureCode','replayed',replayed);
end;$$;
create function private.worker_record_capital_preview_accepted_v1(p_job_id uuid,p_capability_token text,p_input_receipt_id uuid,p_accepted jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare job public.processing_jobs:=private.capital_public_capture_job_v1(p_job_id,p_capability_token);a private.capital_preview_gateway_attempts;
 recipe private.capital_preview_recipes;claim private.capital_preview_input_dispatches;outcome_row private.capital_preview_attempt_outcomes;accepted private.capital_preview_accepted_invocations;
 keys text[]:=array['schemaVersion','invocationId','adapterInputVersion','adapterRequestFingerprint','outputFingerprintVersion','outputFingerprint','inputFingerprint','promptFingerprint',
 'provider','configuredModel','reportedModel','schemaName','retryOrdinal','isSameModelRepair','usedProviderFallback','fromCassette','inputAttestationReceiptId'];
begin
 select * into claim from private.capital_preview_input_dispatches where organization_id=job.organization_id and job_id=job.id and id=p_input_receipt_id;
 if claim.id is null or claim.worker_account_id<>auth.uid() or claim.human_subject_id<>job.authorization_subject_id then raise exception 'capital_preview_accepted_denied' using errcode='42501';end if;
 select * into strict a from private.capital_preview_gateway_attempts where organization_id=job.organization_id and id=claim.attempt_id;
 recipe:=private.capital_preview_attempt_current_v1(p_job_id,p_capability_token,a);
 select * into outcome_row from private.capital_preview_attempt_outcomes where organization_id=job.organization_id and input_receipt_id=claim.id;
 if outcome_row.id is null or outcome_row.outcome<>'accepted' then raise exception 'capital_preview_accepted_denied' using errcode='42501';end if;
 if jsonb_typeof(p_accepted)is distinct from 'object' or not(p_accepted?&keys) or p_accepted-keys<>'{}'::jsonb or octet_length(p_accepted::text)>4096
 or p_accepted->>'schemaVersion'is distinct from 'gateway-accepted-invocation.v1'
 or p_accepted->>'adapterInputVersion'is distinct from 'gateway-adapter-input.v1' or p_accepted->>'outputFingerprintVersion'is distinct from 'gateway-parsed-output.v1'
 or p_accepted->>'provider'is distinct from a.route->>'provider' or p_accepted->>'configuredModel'is distinct from a.model or p_accepted->>'reportedModel'is distinct from a.model
 or p_accepted->>'schemaName'is distinct from (case when recipe.boundary='questions'then'preview_questions_output'else'preview_synthesis_output'end) or p_accepted->>'invocationId'is distinct from a.invocation_id::text
 or p_accepted->>'inputAttestationReceiptId'is distinct from claim.id::text or p_accepted->>'adapterRequestFingerprint'is distinct from a.request_fingerprint
 or p_accepted->>'inputFingerprint'is distinct from a.input_fingerprint or p_accepted->>'promptFingerprint'is distinct from a.prompt_fingerprint
 or p_accepted->>'outputFingerprint'is distinct from outcome_row.observation->>'outputFingerprint'
 or jsonb_typeof(p_accepted->'retryOrdinal')is distinct from 'number' or p_accepted->>'retryOrdinal'is distinct from '0'
 or jsonb_typeof(p_accepted->'isSameModelRepair')is distinct from 'boolean' or p_accepted->>'isSameModelRepair'is distinct from 'false'
 or jsonb_typeof(p_accepted->'fromCassette')is distinct from 'boolean' or p_accepted->>'fromCassette'is distinct from 'false'
 or jsonb_typeof(p_accepted->'usedProviderFallback')is distinct from 'boolean' or p_accepted->>'usedProviderFallback'is distinct from a.used_provider_fallback::text
 then raise exception 'capital_preview_accepted_invalid' using errcode='22023';end if;
 select * into accepted from private.capital_preview_accepted_invocations where organization_id=job.organization_id and recipe_id=recipe.id;
 if accepted.id is not null then
 if accepted.input_receipt_id<>claim.id or accepted.accepted_identity is distinct from p_accepted then raise exception 'capital_preview_accepted_conflict' using errcode='23505';end if;
 else
 insert into private.capital_preview_accepted_invocations(organization_id,work_id,job_id,recipe_id,input_receipt_id,invocation_id,output_fingerprint,accepted_identity)
 values(job.organization_id,a.work_id,job.id,recipe.id,claim.id,a.invocation_id,p_accepted->>'outputFingerprint',p_accepted)returning * into accepted;
 end if;
 perform private.capital_preview_attempt_current_v1(p_job_id,p_capability_token,a);
 return jsonb_build_object('acceptedInvocationId',accepted.id,'inputReceiptId',claim.id,'invocationId',accepted.invocation_id,'outputFingerprint',accepted.output_fingerprint);
end;$$;

-- Both orders forbid the old body-input endpoint from supplying a receipt for a
-- native invocation. The trigger also closes the same-job legacy path after seal.
create function private.guard_capital_preview_legacy_input_v1() returns trigger
language plpgsql security definer set search_path='' as $$
declare recipe private.capital_preview_recipes;
begin
 select * into recipe from private.capital_preview_recipes where organization_id=new.organization_id and job_id=new.job_id;
 if recipe.id is not null then
 if not pg_try_advisory_xact_lock(hashtextextended('capital-preview-run:'||recipe.organization_id::text||':'||recipe.run_id::text,0)) then raise exception 'capital_capture_retry' using errcode='40001';end if;
 if exists(select 1 from private.capital_preview_recipe_seals s join private.capital_preview_recipes r on(r.organization_id,r.id)=(s.organization_id,s.recipe_id)where r.organization_id=new.organization_id and r.job_id=new.job_id)then raise exception 'capital_preview_legacy_input_denied' using errcode='42501';end if;
 end if;
 if exists(select 1 from private.capital_preview_gateway_attempts where organization_id=new.organization_id and invocation_id=new.invocation_id)then raise exception 'capital_preview_legacy_input_denied' using errcode='42501';end if;
 return new;
end;$$;
create trigger capital_preview_legacy_input_guard before insert on private.capital_body_invocation_inputs for each row execute function private.guard_capital_preview_legacy_input_v1();

create function public.worker_authorize_capital_preview_processing_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_attempt jsonb,p_route jsonb,p_resources text[],p_purpose text)
returns jsonb language sql security invoker set search_path='' as $$select private.worker_authorize_capital_preview_processing_v1(p_job_id,p_capability_token,p_recipe_id,p_attempt,p_route,p_resources,p_purpose);$$;
create function public.worker_record_capital_preview_input_v1(p_job_id uuid,p_capability_token text,p_attempt_receipt_id uuid)
returns jsonb language sql security invoker set search_path='' as $$select private.worker_record_capital_preview_input_v1(p_job_id,p_capability_token,p_attempt_receipt_id);$$;
create function public.worker_record_capital_preview_attempt_outcome_v1(p_job_id uuid,p_capability_token text,p_attempt_receipt_id uuid,p_outcome jsonb)
returns jsonb language sql security invoker set search_path='' as $$select private.worker_record_capital_preview_attempt_outcome_v1(p_job_id,p_capability_token,p_attempt_receipt_id,p_outcome);$$;
create function public.worker_record_capital_preview_accepted_v1(p_job_id uuid,p_capability_token text,p_input_receipt_id uuid,p_accepted jsonb)
returns jsonb language sql security invoker set search_path='' as $$select private.worker_record_capital_preview_accepted_v1(p_job_id,p_capability_token,p_input_receipt_id,p_accepted);$$;
do $$declare f record;begin
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private'
 and p.proname in ('capital_preview_attempt_outcome_fingerprint_v1','capital_preview_dispatch_policy_v1','lock_capital_preview_operation_v1','capital_preview_attempt_assurances_current_v1',
 'capital_preview_attempt_current_v1','capital_preview_attempt_dto_v1','guard_capital_preview_legacy_input_v1') loop execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);end loop;
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('private','public')
 and p.proname in ('worker_authorize_capital_preview_processing_v1','worker_record_capital_preview_input_v1','worker_record_capital_preview_attempt_outcome_v1','worker_record_capital_preview_accepted_v1')loop
 execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);execute format('grant execute on function %s to authenticated',f.signature);end loop;
end;$$;

-- Forward preview projection protocol; assemble after consumed sources,
-- dispatch policy, consumption and execution ledger. No remote apply performed.
set search_path='';
create table private.capital_preview_task_projections(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,work_id uuid not null,run_id uuid not null,
 task_id text not null,task_run_id uuid not null,role text not null check(role in('task_output','decision_contract')),
 capital_artifact_id uuid not null,retained_payload_id uuid not null,semantic_fingerprint text not null check(semantic_fingerprint~'^[a-f0-9]{64}$'),
 artifact_fingerprint text not null check(artifact_fingerprint~'^[a-f0-9]{64}$'),artifact_version integer not null check(artifact_version>0),
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 unique(organization_id,id),unique(organization_id,run_id,task_id,role),unique(organization_id,capital_artifact_id),
 foreign key(organization_id,work_id,run_id)references private.capital_preview_runs(organization_id,work_id,id),
 foreign key(organization_id,task_run_id)references public.capital_project_task_runs(organization_id,id),
 foreign key(organization_id,capital_artifact_id)references public.capital_project_artifacts(organization_id,id)deferrable initially deferred,
 foreign key(organization_id,retained_payload_id)references private.capital_public_retained_payloads(organization_id,id));
create index capital_preview_projection_run_idx on private.capital_preview_task_projections(organization_id,work_id,run_id);
create index capital_preview_projection_task_idx on private.capital_preview_task_projections(organization_id,task_run_id);
create index capital_preview_projection_retained_idx on private.capital_preview_task_projections(organization_id,retained_payload_id);
alter table private.capital_preview_task_projections enable row level security;
alter table private.capital_preview_task_projections force row level security;
create policy preview_projection_select on private.capital_preview_task_projections for select using(false);
create policy preview_projection_insert on private.capital_preview_task_projections for insert with check(false);
create policy preview_projection_update on private.capital_preview_task_projections for update using(false)with check(false);
create policy preview_projection_delete on private.capital_preview_task_projections for delete using(false);
revoke all on private.capital_preview_task_projections from public,anon,authenticated,service_role;
create trigger preview_projection_immutable before update or delete on private.capital_preview_task_projections for each row execute function private.reject_source_version_mutation_v1();
create trigger preview_projection_no_truncate before truncate on private.capital_preview_task_projections for each statement execute function private.reject_review_history_mutation_v1();
create trigger preview_projection_audit after insert on private.capital_preview_task_projections for each row execute function private.capture_identity_audit_v1();

alter table private.capital_preview_body_bases add constraint capital_preview_accepted_body_fk foreign key(organization_id,accepted_invocation_id)references private.capital_preview_accepted_invocations(organization_id,id);
-- Low-level closure deliberately never calls recipe/release, avoiding cycles.
create function private.capital_preview_projection_deadline_v1(p_org uuid,p_run uuid,p_subject uuid,p_task text)
returns timestamptz language plpgsql volatile security definer set search_path=''as $$
declare x private.capital_preview_task_projections;a private.capital_public_payload_allocations;deadline timestamptz;
begin
 select *into x from private.capital_preview_task_projections where organization_id=p_org and run_id=p_run and task_id=p_task and role='task_output';
 if x.id is null or not exists(select 1 from public.capital_project_task_runs tr join public.capital_project_artifacts c on(c.organization_id,c.id)=(tr.organization_id,x.capital_artifact_id)
 where tr.organization_id=p_org and tr.id=x.task_run_id and tr.status='succeeded'and tr.output_fingerprint=x.artifact_fingerprint and c.artifact_fingerprint=x.artifact_fingerprint and c.status not in('stale','superseded'))then return null;end if;
 select allocation.*into a from private.capital_public_retained_payloads retained join private.capital_public_payload_allocations allocation on(allocation.organization_id,allocation.id)=(retained.organization_id,retained.allocation_id)where retained.organization_id=p_org and retained.id=x.retained_payload_id;
 deadline:=private.capital_preview_run_deadline_v1(p_org,p_run,p_subject,true);
 if deadline is null or not private.capital_body_physical_receipt_v1(p_org,x.retained_payload_id)or not exists(select 1 from private.capital_public_payload_purge_queue q where q.organization_id=p_org and q.allocation_id=a.id and q.status='pending')then return null;end if;
 deadline:=least(deadline,a.expires_at,a.purge_at);if deadline<=clock_timestamp()then return null;end if;return deadline;
end;$$;
create table private.capital_preview_native_bindings(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,work_id uuid not null,run_id uuid not null,
 projection_id uuid not null,capital_artifact_id uuid not null,revision_id uuid not null,retained_payload_id uuid not null,final_fingerprint text not null check(final_fingerprint~'^[a-f0-9]{64}$'),
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 unique(organization_id,id),unique(organization_id,projection_id),unique(organization_id,revision_id),
 foreign key(organization_id,work_id,run_id)references private.capital_preview_runs(organization_id,work_id,id),
 foreign key(organization_id,projection_id)references private.capital_preview_task_projections(organization_id,id),
 foreign key(organization_id,capital_artifact_id)references public.capital_project_artifacts(organization_id,id)deferrable initially deferred,
 foreign key(organization_id,revision_id)references public.artifact_revisions(organization_id,id)deferrable initially deferred,
 foreign key(organization_id,retained_payload_id)references private.capital_public_retained_payloads(organization_id,id));
create index preview_binding_work_idx on private.capital_preview_native_bindings(organization_id,work_id,run_id);
create index preview_binding_projection_idx on private.capital_preview_native_bindings(organization_id,projection_id);
create index preview_binding_artifact_idx on private.capital_preview_native_bindings(organization_id,capital_artifact_id);
create index preview_binding_retained_idx on private.capital_preview_native_bindings(organization_id,retained_payload_id);
alter table private.capital_preview_native_bindings enable row level security;
alter table private.capital_preview_native_bindings force row level security;
create policy preview_binding_select on private.capital_preview_native_bindings for select using(false);
create policy preview_binding_insert on private.capital_preview_native_bindings for insert with check(false);
create policy preview_binding_update on private.capital_preview_native_bindings for update using(false)with check(false);
create policy preview_binding_delete on private.capital_preview_native_bindings for delete using(false);
revoke all on private.capital_preview_native_bindings from public,anon,authenticated,service_role;
create trigger preview_binding_immutable before update or delete on private.capital_preview_native_bindings for each row execute function private.reject_source_version_mutation_v1();
create trigger preview_binding_no_truncate before truncate on private.capital_preview_native_bindings for each statement execute function private.reject_review_history_mutation_v1();
create trigger preview_binding_audit after insert on private.capital_preview_native_bindings for each row execute function private.capture_identity_audit_v1();
create function private.capital_preview_native_read_allowed_v1(p_org uuid,p_revision uuid,p_actor uuid)returns boolean language plpgsql volatile security definer set search_path=''as $$
declare binding private.capital_preview_native_bindings;projection private.capital_preview_task_projections;deadline timestamptz;
begin
 select*into binding from private.capital_preview_native_bindings where organization_id=p_org and revision_id=p_revision;
 if binding.id is null then return true;end if;
 select*into projection from private.capital_preview_task_projections where organization_id=p_org and id=binding.projection_id;
 deadline:=private.capital_preview_projection_deadline_v1(p_org,binding.run_id,p_actor,projection.task_id);
 if deadline is null or not private.capital_body_subject_allowed_v1(p_org,binding.work_id,p_actor)or not exists(select 1 from public.artifact_revisions revision join public.artifacts artifact on(artifact.organization_id,artifact.id)=(revision.organization_id,revision.artifact_id)
 where revision.organization_id=p_org and revision.id=p_revision and artifact.head_revision_id=revision.id and artifact.work_id=binding.work_id)then return false;end if;
 return private.capital_body_physical_receipt_v1(p_org,binding.retained_payload_id)and private.capital_preview_allocation_deadline_v1(p_org,(select allocation_id from private.capital_public_retained_payloads where organization_id=p_org and id=binding.retained_payload_id),p_actor)is not null;
end;$$;
create function private.read_capital_preview_result_body_v1(p_revision_id uuid)returns jsonb language plpgsql volatile security definer set search_path=''as $$
declare binding private.capital_preview_native_bindings;revision public.artifact_revisions;allocation private.capital_public_payload_allocations;deadline timestamptz;result jsonb;
begin
 select*into binding from private.capital_preview_native_bindings where revision_id=p_revision_id;
 select*into revision from public.artifact_revisions where id=p_revision_id;
 if binding.id is null or revision.id is null or private.artifact_revision_release_v1(revision)='blocked'or not private.capital_preview_native_read_allowed_v1(binding.organization_id,p_revision_id,auth.uid())then raise exception 'capital_preview_human_read_denied'using errcode='42501';end if;
 select a.*into strict allocation from private.capital_public_retained_payloads q join private.capital_public_payload_allocations a on(a.organization_id,a.id)=(q.organization_id,q.allocation_id)where q.organization_id=binding.organization_id and q.id=binding.retained_payload_id;
 deadline:=private.capital_preview_allocation_deadline_v1(binding.organization_id,allocation.id,auth.uid());
 -- This envelope's recipeId is the complete finite RUN, never a paid boundary.
 result:=jsonb_build_object('schemaVersion','capital-preview-read-scope.v1','workId',binding.work_id,'artifactId',binding.capital_artifact_id,'revisionId',binding.revision_id,'recipeId',binding.run_id,'finalFingerprint',binding.final_fingerprint,'retention',private.capital_preview_body_dto_v1(binding.organization_id,allocation.id,deadline,true));
 if private.artifact_revision_release_v1(revision)='blocked'or not private.capital_preview_native_read_allowed_v1(binding.organization_id,p_revision_id,auth.uid())then raise exception 'capital_preview_human_read_denied'using errcode='42501';end if;return result;
end;$$;
create function public.read_capital_preview_result_body_v1(p_revision_id uuid)returns jsonb language sql security invoker set search_path=''as $$select private.read_capital_preview_result_body_v1(p_revision_id);$$;
-- Exact native bridge replaces the legacy projector only for preview CPA.
alter function private.project_legacy_artifact_revision_v1(text,uuid,uuid)rename to project_legacy_artifact_revision_pre_preview_v1;
create function private.project_legacy_artifact_revision_v1(p_table text,p_org uuid,p_row uuid)returns integer language plpgsql security definer set search_path=''as $$
begin
 if p_table='capital_project_artifacts'and exists(select 1 from private.capital_preview_task_projections where organization_id=p_org and capital_artifact_id=p_row)then return 0;end if;
 return private.project_legacy_artifact_revision_pre_preview_v1(p_table,p_org,p_row);end;$$;
revoke all on function private.project_legacy_artifact_revision_pre_preview_v1(text,uuid,uuid)from public,anon,authenticated,service_role;
alter function private.artifact_revision_release_v1(public.artifact_revisions)rename to artifact_revision_release_pre_preview_v1;
create function private.artifact_revision_release_v1(p_revision public.artifact_revisions)returns text language plpgsql volatile security definer set search_path=''as $$
begin
 if not private.capital_preview_native_read_allowed_v1(p_revision.organization_id,p_revision.id,auth.uid())then return'blocked';end if;
 return private.artifact_revision_release_pre_preview_v1(p_revision);end;$$;
revoke all on function private.artifact_revision_release_pre_preview_v1(public.artifact_revisions)from public,anon,authenticated,service_role;

create function private.worker_commit_capital_preview_task_v1(p_job_id uuid,p_capability_token text,p_run_id uuid,p_task_run_id uuid,p_retained_payload_id uuid,p_role text)
returns jsonb language plpgsql security definer set search_path=''as $$
declare j public.processing_jobs:=private.capital_public_capture_job_v1(p_job_id,p_capability_token);r private.capital_preview_runs;
 tr public.capital_project_task_runs;pt public.capital_project_plan_tasks;b private.capital_preview_body_bases;a private.capital_public_payload_allocations;
 x private.capital_preview_task_projections;dep text;dx private.capital_preview_task_projections;deps jsonb:='[]';projection jsonb;fp text;aid uuid:=gen_random_uuid();rid uuid:=gen_random_uuid();version integer;typ text;manifest jsonb;revision_result jsonb;
begin
 r:=private.require_capital_preview_run_v1(j.id,p_capability_token,p_run_id,true);
 select *into tr from public.capital_project_task_runs where organization_id=j.organization_id and id=p_task_run_id for update;
 select *into pt from public.capital_project_plan_tasks where organization_id=j.organization_id and id=tr.plan_task_id;
 if tr.id is null or tr.processing_job_id<>j.id or tr.capital_project_id<>r.work_id or tr.plan_id<>r.plan_id or p_role not in('task_output','decision_contract')then raise exception 'capital_preview_task_denied'using errcode='42501';end if;
 select allocation.*into a from private.capital_public_retained_payloads retained join private.capital_public_payload_allocations allocation on(allocation.organization_id,allocation.id)=(retained.organization_id,retained.allocation_id)where retained.organization_id=j.organization_id and retained.id=p_retained_payload_id;
 select *into b from private.capital_preview_body_bases where organization_id=j.organization_id and id=a.preview_body_basis_id;
 if b.run_id is distinct from r.id or b.task_run_id is distinct from tr.id or b.task_id is distinct from pt.task_id or b.kind is distinct from p_role
 or private.capital_preview_allocation_deadline_v1(j.organization_id,a.id,j.authorization_subject_id)is null or not private.capital_body_physical_receipt_v1(j.organization_id,p_retained_payload_id)then raise exception 'capital_preview_task_body_denied'using errcode='42501';end if;
 select *into x from private.capital_preview_task_projections where organization_id=j.organization_id and run_id=r.id and task_id=pt.task_id and role=p_role;
 if x.id is null then
 if tr.status<>'running'then raise exception 'capital_preview_task_denied'using errcode='42501';end if;
 foreach dep in array pt.dependencies loop
 if private.capital_preview_projection_deadline_v1(j.organization_id,r.id,j.authorization_subject_id,dep)is null then raise exception 'capital_preview_parent_denied'using errcode='42501';end if;
 select *into strict dx from private.capital_preview_task_projections where organization_id=j.organization_id and run_id=r.id and task_id=dep and role='task_output';
 deps:=deps||jsonb_build_array(jsonb_build_object('artifactId',dx.capital_artifact_id,'artifactFingerprint',dx.artifact_fingerprint));end loop;
 if exists(select 1 from private.capital_preview_recipes rr join private.capital_preview_recipe_seals ss on(ss.organization_id,ss.recipe_id)=(rr.organization_id,rr.id)where rr.organization_id=j.organization_id and rr.run_id=r.id and rr.plan_task_id=pt.id)and not exists(select 1 from private.capital_preview_recipes recipe join private.capital_preview_accepted_invocations accepted on(accepted.organization_id,accepted.recipe_id)=(recipe.organization_id,recipe.id)
 join private.capital_preview_body_bases parsed on(parsed.organization_id,parsed.accepted_invocation_id)=(accepted.organization_id,accepted.id)
 join private.capital_public_payload_allocations allocation on(allocation.organization_id,allocation.preview_body_basis_id)=(parsed.organization_id,parsed.id)
 join private.capital_public_retained_payloads retained on(retained.organization_id,retained.allocation_id)=(allocation.organization_id,allocation.id)
 where recipe.organization_id=j.organization_id and recipe.run_id=r.id and recipe.plan_task_id=pt.id and parsed.kind='accepted_parsed'and private.capital_body_physical_receipt_v1(j.organization_id,retained.id)
 and private.capital_preview_allocation_deadline_v1(j.organization_id,allocation.id,j.authorization_subject_id)is not null)then raise exception 'capital_preview_paid_parent_required'using errcode='42501';end if;
 typ:=case when p_role='decision_contract'then'preview_decision_contract'else(select step->>'artifactType'from jsonb_array_elements(private.capital_preview_workflow_v1(r.composition)->'steps')step where step->>'taskId'=pt.task_id)end;
 if typ is null or typ=''then raise exception 'capital_preview_output_type_missing'using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('capital-artifact:'||r.work_id::text||':'||typ,0));
 select coalesce(max(artifact_version),0)+1 into version from public.capital_project_artifacts where organization_id=j.organization_id and capital_project_id=r.work_id and artifact_type=typ;
 projection:=jsonb_build_object('schemaVersion','capital-preview-task-projection.v1','revisionId',rid,'runId',r.id,'taskId',pt.task_id,'role',p_role,'retainedPayloadId',p_retained_payload_id,'semanticFingerprint',b.semantic_fingerprint,'physicalSha256',a.payload_fingerprint,'byteLength',a.byte_length);
 fp:=encode(extensions.digest(projection::text,'sha256'),'hex');
 insert into private.capital_preview_task_projections(organization_id,work_id,run_id,task_id,task_run_id,role,capital_artifact_id,retained_payload_id,semantic_fingerprint,artifact_fingerprint,artifact_version)
 values(j.organization_id,r.work_id,r.id,pt.task_id,tr.id,p_role,aid,p_retained_payload_id,b.semantic_fingerprint,fp,version)returning*into x;
 insert into private.capital_preview_native_bindings(organization_id,work_id,run_id,projection_id,capital_artifact_id,revision_id,retained_payload_id,final_fingerprint)values(r.organization_id,r.work_id,r.id,x.id,aid,rid,p_retained_payload_id,b.semantic_fingerprint);
 manifest:=jsonb_build_object('schemaVersion','artifact-manifest.2026.09.26-v1','kind','work_product','audience','internal','format','json',
 'bytes',jsonb_build_object('sha256',a.payload_fingerprint,'byteLength',a.byte_length,'storage',jsonb_build_object('bucket',a.bucket_id,'path',a.object_path)),
 'method',null,'execution',null,'inputSnapshot',jsonb_build_object('fingerprint',tr.input_fingerprint),'institutionalResult',null,'sources','[]'::jsonb,'claims','[]'::jsonb,
 'traces',jsonb_build_array('capital-preview-run:'||r.id::text,'capital-preview-task:'||tr.id::text),'template',null,'provenance',jsonb_build_object('producer','capital-preview-native-producer.v1','jobId',j.id,'taskRunId',tr.id,'messageId',null,'capability',null),'legacy',null);
 revision_result:=private.create_artifact_revision_v1(r.organization_id,r.work_id,'work_product','Preview '||typ,'internal','worker',manifest,jsonb_build_array(jsonb_build_object('key','preview-result','kind','section','content',projection,'claims','[]'::jsonb)),'[]',a.payload_fingerprint,a.byte_length,null,null,r.human_subject_id,rid,true);
 insert into public.capital_project_artifacts(id,organization_id,capital_project_id,plan_id,task_run_id,artifact_type,schema_version,artifact_version,status,input_fingerprint,artifact_fingerprint,content,evidence_refs,dependencies,processing_job_id,created_by_kind)
 values(aid,j.organization_id,r.work_id,r.plan_id,tr.id,typ,'capital-preview-task-projection.v1',version,'draft',tr.input_fingerprint,fp,projection,'[]',deps,j.id,'worker');
 else
 if(x.task_run_id,x.retained_payload_id,x.semantic_fingerprint)is distinct from(tr.id,p_retained_payload_id,b.semantic_fingerprint)then raise exception 'capital_preview_task_conflict'using errcode='23505';end if;
 end if;
 if not private.capital_public_capture_clock_current_v1(j.id,p_capability_token)or private.capital_preview_allocation_deadline_v1(j.organization_id,a.id,j.authorization_subject_id)is null then raise exception 'capital_preview_task_denied'using errcode='42501';end if;
 return jsonb_build_object('schemaVersion','capital-preview-task-commit.v1','runId',r.id,'taskId',pt.task_id,'taskRunId',tr.id,'role',p_role,'capitalArtifactId',x.capital_artifact_id,'artifactFingerprint',x.artifact_fingerprint,'artifactVersion',x.artifact_version,'retainedPayloadId',x.retained_payload_id,'semanticFingerprint',x.semantic_fingerprint,'replayed',x.capital_artifact_id<>aid);
end;$$;
create function private.worker_revalidate_capital_preview_boundary_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid)
returns jsonb language plpgsql security definer set search_path=''as $$
declare r private.capital_preview_recipes:=private.require_capital_preview_recipe_v1(p_job_id,p_capability_token,p_recipe_id);s private.capital_preview_recipe_seals;pt public.capital_project_plan_tasks;dep text;
begin
 select *into strict s from private.capital_preview_recipe_seals where organization_id=r.organization_id and recipe_id=r.id;
 select *into strict pt from public.capital_project_plan_tasks where organization_id=r.organization_id and id=r.plan_task_id;
 foreach dep in array pt.dependencies loop
 if private.capital_preview_projection_deadline_v1(r.organization_id,r.run_id,r.human_subject_id,dep)is null then raise exception 'capital_preview_parent_denied'using errcode='42501';end if;
 end loop;
 return jsonb_build_object('schemaVersion','capital-preview-boundary-receipt.v1','state','ready','recipeId',r.id,'boundaryId',r.id,'boundary',r.boundary,'jobId',r.job_id,'organizationId',r.organization_id,'workId',r.work_id,'planId',r.plan_id,'planTaskId',r.plan_task_id,'rendererVersion',r.renderer_version,
 'reconstructionFingerprint',s.reconstruction_fingerprint,'promptFingerprint',s.prompt_fingerprint,'primaryRequestFingerprint',s.primary_request_fingerprint,'fallbackRequestFingerprint',s.fallback_request_fingerprint,'inputRetainedPayloadId',s.input_retained_payload_id,'consumedBasisFingerprint',s.consumed_basis_fingerprint,
 'operationalBudget',jsonb_build_object('maxExposureMicroUsd',s.effective_budget_micro_usd,'maxDispatches',s.effective_max_dispatches),'expiresAt',r.expires_at);
end;$$;
create function private.worker_recover_capital_preview_accepted_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid)
returns jsonb language plpgsql security definer set search_path=''as $$
declare r private.capital_preview_recipes:=private.require_capital_preview_recipe_v1(p_job_id,p_capability_token,p_recipe_id);accepted private.capital_preview_accepted_invocations;retained private.capital_public_retained_payloads;a private.capital_public_payload_allocations;
begin
 perform private.worker_revalidate_capital_preview_boundary_v1(p_job_id,p_capability_token,r.id);
 if exists(select 1 from private.capital_preview_execution_failures where organization_id=r.organization_id and recipe_id=r.id)then raise exception 'capital_preview_execution_failed_terminal'using errcode='42501';end if;
 select*into accepted from private.capital_preview_accepted_invocations where organization_id=r.organization_id and recipe_id=r.id;
 if accepted.id is null then return null;end if;
 select physical.*into retained from private.capital_public_retained_payloads physical join private.capital_public_payload_allocations allocation on(allocation.organization_id,allocation.id)=(physical.organization_id,physical.allocation_id)
 join private.capital_preview_body_bases b on(b.organization_id,b.id)=(allocation.organization_id,allocation.preview_body_basis_id)
 where b.organization_id=r.organization_id and b.run_id=r.run_id and b.recipe_id=r.id and b.kind='accepted_parsed'and b.accepted_invocation_id=accepted.id order by b.created_at limit 1;
 if retained.id is null then raise exception 'capital_preview_accepted_body_unavailable'using errcode='42501';end if;
 select*into strict a from private.capital_public_payload_allocations where organization_id=r.organization_id and id=retained.allocation_id;
 return jsonb_build_object('binding',jsonb_build_object('recipeId',r.id,'boundaryId',r.id,'invocationId',accepted.invocation_id,'inputReceiptId',accepted.input_receipt_id,'outputFingerprint',accepted.output_fingerprint),
 'scope',private.worker_read_capital_preview_allocation_v1(p_job_id,p_capability_token,a.id));
end;$$;
-- Public invoker wrappers expose only exact commands; private read/closure cores
-- remain unavailable, so an absent projection is never a substitute for denial.
create function public.worker_prepare_capital_preview_run_v1(p_job_id uuid,p_capability_token text,p_publisher_org uuid,p_basis_id uuid)returns jsonb language sql security invoker set search_path=''as $$select private.worker_prepare_capital_preview_run_v1(p_job_id,p_capability_token,p_publisher_org,p_basis_id);$$;
create function public.worker_prepare_capital_preview_body_v1(p_job_id uuid,p_capability_token text,p_run_id uuid,p_request_id uuid,p_kind text,p_body jsonb,p_recipe_id uuid default null,p_file_name text default null,p_task_id text default null,p_task_run_id uuid default null,p_accepted_invocation_id uuid default null,p_semantic_fingerprint text default null)returns jsonb language sql security invoker set search_path=''as $$select private.worker_prepare_capital_preview_body_v1(p_job_id,p_capability_token,p_run_id,p_request_id,p_kind,p_body,p_recipe_id,p_file_name,p_task_id,p_task_run_id,p_accepted_invocation_id,p_semantic_fingerprint);$$;
create function public.worker_commit_capital_preview_body_v1(p_job_id uuid,p_capability_token text,p_allocation_id uuid,p_storage_object_id uuid,p_storage_version text,p_verified_sha256 text,p_verified_size bigint)returns jsonb language sql security invoker set search_path=''as $$select private.worker_commit_capital_preview_body_v1(p_job_id,p_capability_token,p_allocation_id,p_storage_object_id,p_storage_version,p_verified_sha256,p_verified_size);$$;
create function public.worker_read_capital_preview_allocation_v1(p_job_id uuid,p_capability_token text,p_allocation_id uuid)returns jsonb language sql security invoker set search_path=''as $$select private.worker_read_capital_preview_allocation_v1(p_job_id,p_capability_token,p_allocation_id);$$;
create function public.worker_prepare_capital_preview_boundary_v1(p_job_id uuid,p_capability_token text,p_run_id uuid,p_boundary text)returns jsonb language sql security invoker set search_path=''as $$select private.worker_prepare_capital_preview_boundary_v1(p_job_id,p_capability_token,p_run_id,p_boundary);$$;
create function public.worker_seal_capital_preview_boundary_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_input_retained_payload_id uuid,p_model_input jsonb,p_pins jsonb,p_consumed_basis_fingerprint text)returns jsonb language sql security invoker set search_path=''as $$select private.worker_seal_capital_preview_boundary_v1(p_job_id,p_capability_token,p_recipe_id,p_input_retained_payload_id,p_model_input,p_pins,p_consumed_basis_fingerprint);$$;
create function public.worker_revalidate_capital_preview_boundary_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid)returns jsonb language sql security invoker set search_path=''as $$select private.worker_revalidate_capital_preview_boundary_v1(p_job_id,p_capability_token,p_recipe_id);$$;
create function public.worker_recover_capital_preview_accepted_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid)returns jsonb language sql security invoker set search_path=''as $$select private.worker_recover_capital_preview_accepted_v1(p_job_id,p_capability_token,p_recipe_id);$$;
create function public.worker_commit_capital_preview_task_v1(p_job_id uuid,p_capability_token text,p_run_id uuid,p_task_run_id uuid,p_retained_payload_id uuid,p_role text)returns jsonb language sql security invoker set search_path=''as $$select private.worker_commit_capital_preview_task_v1(p_job_id,p_capability_token,p_run_id,p_task_run_id,p_retained_payload_id,p_role);$$;
create function private.worker_record_capital_preview_execution_failure_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path=''as $$
declare r private.capital_preview_recipes:=private.require_capital_preview_recipe_v1(p_job_id,p_capability_token,p_recipe_id);seal private.capital_preview_recipe_seals;run private.capital_preview_runs;old private.capital_preview_execution_failures;
 ids uuid[];calls integer;boundary_calls integer;exposure bigint;bound bigint;proof boolean:=false;replayed boolean:=false;
begin
 perform private.lock_capital_preview_operation_v1(r.organization_id,r.id);
 select*into strict seal from private.capital_preview_recipe_seals where organization_id=r.organization_id and recipe_id=r.id;
 select*into strict run from private.capital_preview_runs where organization_id=r.organization_id and id=r.run_id;
 select coalesce(array_agg(o.id order by o.id),'{}'::uuid[])into ids from private.capital_preview_attempt_outcomes o join private.capital_preview_gateway_attempts a on(a.organization_id,a.id)=(o.organization_id,o.attempt_id)where a.organization_id=r.organization_id and a.recipe_id=r.id;
 select count(*),coalesce(sum(greatest(d.server_reservation_micro_usd,coalesce(o.cost_micro_usd,d.server_reservation_micro_usd))),0)into calls,exposure from private.capital_preview_input_dispatches d join private.capital_preview_operations operation on(operation.organization_id,operation.id)=(d.organization_id,d.operation_id)
 join private.capital_preview_recipes recipe on(recipe.organization_id,recipe.id)=(operation.organization_id,operation.recipe_id)left join private.capital_preview_attempt_outcomes o on(o.organization_id,o.input_receipt_id)=(d.organization_id,d.id)where recipe.organization_id=r.organization_id and recipe.run_id=r.run_id;
 select count(*)into boundary_calls from private.capital_preview_input_dispatches d join private.capital_preview_operations op on(op.organization_id,op.id)=(d.organization_id,d.operation_id)where op.organization_id=r.organization_id and op.recipe_id=r.id;
 bound:=(private.capital_preview_dispatch_policy_v1(r.boundary,'gpt-5.6-terra',seal.input_bytes)->>'serverBoundMicroUsd')::bigint;
 if boundary_calls=0 then bound:=least(bound,(private.capital_preview_dispatch_policy_v1(r.boundary,'claude-sonnet-5',seal.input_bytes)->>'serverBoundMicroUsd')::bigint);end if;
 if p_reason='accepted_body_unavailable'then
 proof:=exists(select 1 from private.capital_preview_accepted_invocations where organization_id=r.organization_id and recipe_id=r.id)and not exists(select 1 from private.capital_preview_body_bases b join private.capital_public_payload_allocations a on(a.organization_id,a.preview_body_basis_id)=(b.organization_id,b.id)join private.capital_public_retained_payloads q on(q.organization_id,q.allocation_id)=(a.organization_id,a.id)where b.organization_id=r.organization_id and b.recipe_id=r.id and b.kind='accepted_parsed'and private.capital_body_physical_receipt_v1(q.organization_id,q.id));
 elsif not exists(select 1 from private.capital_preview_accepted_invocations where organization_id=r.organization_id and recipe_id=r.id)and not exists(select 1 from private.capital_preview_attempt_outcomes o join private.capital_preview_gateway_attempts a on(a.organization_id,a.id)=(o.organization_id,o.attempt_id)where a.organization_id=r.organization_id and a.recipe_id=r.id and o.outcome='accepted')then
 if p_reason='processing_denied'then proof:=cardinality(ids)=0 and(select count(distinct used_provider_fallback)from private.capital_preview_gateway_attempts where organization_id=r.organization_id and recipe_id=r.id and not allowed)=2;
 elsif p_reason='budget_denied'then proof:=calls>=run.effective_max_dispatches or boundary_calls>=seal.effective_max_dispatches or exposure+bound>run.effective_budget_micro_usd;
 elsif p_reason='model_attempts_exhausted'then proof:=cardinality(ids)>0 and(boundary_calls>=seal.effective_max_dispatches or calls>=run.effective_max_dispatches or exposure+bound>run.effective_budget_micro_usd or exists(select 1 from private.capital_preview_gateway_attempts a join private.capital_preview_attempt_outcomes o on(o.organization_id,o.attempt_id)=(a.organization_id,a.id)where a.organization_id=r.organization_id and a.recipe_id=r.id and a.used_provider_fallback and o.outcome<>'accepted'));end if;
 end if;
 if proof is distinct from true then raise exception 'capital_preview_failure_proof_denied'using errcode='42501';end if;
 select*into old from private.capital_preview_execution_failures where organization_id=r.organization_id and recipe_id=r.id;
 if old.id is not null then if(old.reason,old.outcome_ids)is distinct from(p_reason,ids)then raise exception 'capital_preview_failure_conflict'using errcode='23505';end if;replayed:=true;
 else insert into private.capital_preview_execution_failures(organization_id,recipe_id,reason,outcome_ids)values(r.organization_id,r.id,p_reason,ids);end if;
 if not private.capital_public_capture_clock_current_v1(p_job_id,p_capability_token)then raise exception 'capital_preview_denied'using errcode='42501';end if;
 return jsonb_build_object('schemaVersion','capital-preview-boundary-failure.v1','recipeId',r.id,'boundaryId',r.id,'reason',p_reason,'replayed',replayed);
end;$$;
create function public.worker_record_capital_preview_execution_failure_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_reason text)returns jsonb language sql security invoker set search_path=''as $$select private.worker_record_capital_preview_execution_failure_v1(p_job_id,p_capability_token,p_recipe_id,p_reason);$$;

create table private.capital_preview_run_results(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,run_id uuid not null,
 consumed_basis_fingerprint text not null check(consumed_basis_fingerprint~'^[a-f0-9]{64}$'),
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 unique(organization_id,id),unique(organization_id,run_id),foreign key(organization_id,run_id)references private.capital_preview_runs(organization_id,id));
create index capital_preview_result_run_idx on private.capital_preview_run_results(organization_id,run_id);
alter table private.capital_preview_run_results enable row level security;
alter table private.capital_preview_run_results force row level security;
create policy preview_result_select on private.capital_preview_run_results for select using(false);
create policy preview_result_insert on private.capital_preview_run_results for insert with check(false);
create policy preview_result_update on private.capital_preview_run_results for update using(false)with check(false);
create policy preview_result_delete on private.capital_preview_run_results for delete using(false);
revoke all on private.capital_preview_run_results from public,anon,authenticated,service_role;
create trigger preview_result_immutable before update or delete on private.capital_preview_run_results for each row execute function private.reject_source_version_mutation_v1();
create trigger preview_result_no_truncate before truncate on private.capital_preview_run_results for each statement execute function private.reject_review_history_mutation_v1();
create trigger preview_result_audit after insert on private.capital_preview_run_results for each row execute function private.capture_identity_audit_v1();
create function private.capital_preview_usage_v1(p_org uuid,p_run uuid,p_recipe uuid default null)returns jsonb language sql stable security definer set search_path=''as $$
 select jsonb_build_object('modelCalls',count(*),'costUsd',coalesce(sum(o.cost_micro_usd),0)::numeric/1000000,'unknownCostCalls',count(*)filter(where o.cost_micro_usd is null),
 'latencyMs',coalesce(sum((o.observation->>'latencyMillis')::bigint),0))from private.capital_preview_input_dispatches d
 join private.capital_preview_operations op on(op.organization_id,op.id)=(d.organization_id,d.operation_id)
 join private.capital_preview_recipes r on(r.organization_id,r.id)=(op.organization_id,op.recipe_id)
 left join private.capital_preview_attempt_outcomes o on(o.organization_id,o.input_receipt_id)=(d.organization_id,d.id)
 where r.organization_id=p_org and r.run_id=p_run and(p_recipe is null or r.id=p_recipe);
$$;
create function private.worker_capital_preview_boundary_usage_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid)returns jsonb language plpgsql security definer set search_path=''as $$
declare r private.capital_preview_recipes:=private.require_capital_preview_recipe_v1(p_job_id,p_capability_token,p_recipe_id);model text;
begin
 perform private.worker_revalidate_capital_preview_boundary_v1(p_job_id,p_capability_token,r.id);
 select a.accepted_identity->>'reportedModel'into model from private.capital_preview_accepted_invocations a where a.organization_id=r.organization_id and a.recipe_id=r.id;
 if model is null then raise exception 'capital_preview_accepted_required'using errcode='42501';end if;
 return private.capital_preview_usage_v1(r.organization_id,r.run_id,r.id)||jsonb_build_object('model',model);
end;$$;
create function private.worker_finish_capital_preview_task_v1(p_job_id uuid,p_capability_token text,p_run_id uuid,p_task_run_id uuid)returns jsonb language plpgsql security definer set search_path=''as $$
declare r private.capital_preview_runs:=private.require_capital_preview_run_v1(p_job_id,p_capability_token,p_run_id,true);tr public.capital_project_task_runs;x private.capital_preview_task_projections;
begin
 select*into tr from public.capital_project_task_runs where organization_id=r.organization_id and id=p_task_run_id for update;
 select*into x from private.capital_preview_task_projections where organization_id=r.organization_id and run_id=r.id and task_run_id=tr.id and role='task_output';
 if x.id is null or tr.processing_job_id<>r.job_id or tr.status not in('running','succeeded')then raise exception 'capital_preview_task_denied'using errcode='42501';end if;
 if x.task_id=(private.capital_preview_workflow_v1(r.composition)->'steps'-> -1 ->>'taskId')and not exists(select 1 from private.capital_preview_task_projections contract where contract.organization_id=r.organization_id and contract.run_id=r.id and contract.task_run_id=tr.id and contract.role='decision_contract'and private.capital_body_physical_receipt_v1(r.organization_id,contract.retained_payload_id))then raise exception 'capital_preview_contract_missing'using errcode='42501';end if;
 if exists(select 1 from private.capital_preview_recipes recipe join private.capital_preview_execution_failures f on(f.organization_id,f.recipe_id)=(recipe.organization_id,recipe.id)where recipe.organization_id=r.organization_id and recipe.run_id=r.id and recipe.plan_task_id=tr.plan_task_id)then raise exception 'capital_preview_execution_failed_terminal'using errcode='42501';end if;
 update public.capital_project_task_runs set status='succeeded',completed_at=coalesce(completed_at,clock_timestamp()),output_reference=jsonb_build_object('type','capital_project_artifact','id',x.capital_artifact_id),output_fingerprint=x.artifact_fingerprint,
 quality_results=jsonb_build_array(jsonb_build_object('id','bounded_output','passed',true)),usage='{}',error=null where organization_id=r.organization_id and id=tr.id;
 if private.capital_preview_projection_deadline_v1(r.organization_id,r.id,r.human_subject_id,x.task_id)is null then raise exception 'capital_preview_task_denied'using errcode='42501';end if;
 return jsonb_build_object('finished',true);
end;$$;
create function private.worker_finalize_capital_preview_run_v1(p_job_id uuid,p_capability_token text,p_run_id uuid,p_consumed_basis jsonb)returns jsonb language plpgsql security definer set search_path=''as $$
declare r private.capital_preview_runs:=private.require_capital_preview_run_v1(p_job_id,p_capability_token,p_run_id,true);step jsonb;input_pin jsonb;old private.capital_preview_run_results;last_task text;
begin
 if jsonb_typeof(p_consumed_basis)is distinct from'object'or p_consumed_basis->>'schemaVersion'is distinct from'capital-preview-consumed-basis.v1'or p_consumed_basis->>'composition'is distinct from r.composition or jsonb_typeof(p_consumed_basis->'fingerprint')is distinct from'string'or p_consumed_basis->>'fingerprint'!~'^[a-f0-9]{64}$'
 or p_consumed_basis-array['schemaVersion','composition','inputFingerprints','anchors','entries','fingerprint']<>'{}'::jsonb or jsonb_typeof(p_consumed_basis->'inputFingerprints')is distinct from'array'or jsonb_typeof(p_consumed_basis->'anchors')is distinct from'array'
 or p_consumed_basis->'entries'is distinct from private.capital_preview_consumed_corpus_registry_v1()->'entries'
 or jsonb_array_length(p_consumed_basis->'inputFingerprints')<>jsonb_array_length(private.capital_preview_workflow_v1(r.composition)->'steps')then raise exception 'capital_preview_final_basis_denied'using errcode='42501';end if;
 for step in select value from jsonb_array_elements(private.capital_preview_workflow_v1(r.composition)->'steps')loop
 last_task:=step->>'taskId';if private.capital_preview_projection_deadline_v1(r.organization_id,r.id,r.human_subject_id,last_task)is null then raise exception 'capital_preview_result_incomplete'using errcode='42501';end if;
 select value into input_pin from jsonb_array_elements(p_consumed_basis->'inputFingerprints')where value->>'taskId'=last_task;
 if input_pin is null or not exists(select 1 from private.capital_preview_body_bases b join private.capital_public_payload_allocations a on(a.organization_id,a.preview_body_basis_id)=(b.organization_id,b.id)join private.capital_public_retained_payloads q on(q.organization_id,q.allocation_id)=(a.organization_id,a.id)
 where b.organization_id=r.organization_id and b.run_id=r.id and b.task_id=last_task and b.kind='actual_input'and b.semantic_fingerprint=input_pin->>'fingerprint'and private.capital_body_physical_receipt_v1(r.organization_id,q.id)and private.capital_preview_allocation_deadline_v1(r.organization_id,a.id,r.human_subject_id)is not null)then raise exception 'capital_preview_actual_input_missing'using errcode='42501';end if;
 end loop;
 if not exists(select 1 from private.capital_preview_task_projections x join private.capital_public_retained_payloads q on(q.organization_id,q.id)=(x.organization_id,x.retained_payload_id)join private.capital_public_payload_allocations a on(a.organization_id,a.id)=(q.organization_id,q.allocation_id)
 where x.organization_id=r.organization_id and x.run_id=r.id and x.task_id=last_task and x.role='decision_contract'and private.capital_body_physical_receipt_v1(r.organization_id,q.id)and private.capital_preview_allocation_deadline_v1(r.organization_id,a.id,r.human_subject_id)is not null)then raise exception 'capital_preview_contract_missing'using errcode='42501';end if;
 select*into old from private.capital_preview_run_results where organization_id=r.organization_id and run_id=r.id;
 if old.id is null then insert into private.capital_preview_run_results(organization_id,run_id,consumed_basis_fingerprint)values(r.organization_id,r.id,p_consumed_basis->>'fingerprint');
 elsif old.consumed_basis_fingerprint<>p_consumed_basis->>'fingerprint'then raise exception 'capital_preview_final_basis_conflict'using errcode='23505';end if;
 return jsonb_build_object('completed',true,'runId',r.id);
end;$$;
create function private.worker_recover_capital_preview_run_v1(p_job_id uuid,p_capability_token text,p_run_id uuid)returns jsonb language plpgsql security definer set search_path=''as $$
declare r private.capital_preview_runs:=private.require_capital_preview_run_v1(p_job_id,p_capability_token,p_run_id,false);result private.capital_preview_run_results;refs jsonb:='[]';x private.capital_preview_task_projections;last_task text;expected integer;
begin
 select*into result from private.capital_preview_run_results where organization_id=r.organization_id and run_id=r.id;
 if result.id is null and not exists(select 1 from private.capital_preview_task_projections where organization_id=r.organization_id and run_id=r.id)then return jsonb_build_object('state','absent');end if;
 perform private.require_capital_preview_run_v1(p_job_id,p_capability_token,r.id,true);
 expected:=jsonb_array_length(private.capital_preview_workflow_v1(r.composition)->'steps')+1;
 for x in select*from private.capital_preview_task_projections where organization_id=r.organization_id and run_id=r.id order by task_id,role loop
 if not exists(select 1 from public.capital_project_task_runs t join public.capital_project_artifacts c on(c.organization_id,c.id)=(t.organization_id,x.capital_artifact_id)where t.organization_id=x.organization_id and t.id=x.task_run_id and t.processing_job_id=p_job_id and t.status in('running','succeeded')and c.artifact_fingerprint=x.artifact_fingerprint and c.task_run_id=t.id)or not private.capital_body_physical_receipt_v1(r.organization_id,x.retained_payload_id)then raise exception 'capital_preview_recovery_denied'using errcode='42501';end if;
 refs:=refs||jsonb_build_array(jsonb_build_object('taskId',x.task_id,'role',x.role,'capitalArtifactId',x.capital_artifact_id,'artifactFingerprint',x.artifact_fingerprint,'taskRunId',x.task_run_id,'status',(select status from public.capital_project_task_runs where organization_id=x.organization_id and id=x.task_run_id),'semanticFingerprint',x.semantic_fingerprint,
 'scope',(select private.worker_read_capital_preview_allocation_v1(p_job_id,p_capability_token,q.allocation_id)from private.capital_public_retained_payloads q where q.organization_id=r.organization_id and q.id=x.retained_payload_id)));
 end loop;
 if result.id is null then return jsonb_build_object('state','partial','runId',r.id,'refs',refs,'usage',private.capital_preview_usage_v1(r.organization_id,r.id));end if;
 if jsonb_array_length(refs)<>expected then raise exception 'capital_preview_recovery_incomplete'using errcode='42501';end if;
 return jsonb_build_object('state','completed','runId',r.id,'refs',refs,'consumedBasisFingerprint',result.consumed_basis_fingerprint,'usage',private.capital_preview_usage_v1(r.organization_id,r.id));
end;$$;
create function public.worker_finish_capital_preview_task_v1(p_job_id uuid,p_capability_token text,p_run_id uuid,p_task_run_id uuid)returns jsonb language sql security invoker set search_path=''as $$select private.worker_finish_capital_preview_task_v1(p_job_id,p_capability_token,p_run_id,p_task_run_id);$$;
create function public.worker_finalize_capital_preview_run_v1(p_job_id uuid,p_capability_token text,p_run_id uuid,p_consumed_basis jsonb)returns jsonb language sql security invoker set search_path=''as $$select private.worker_finalize_capital_preview_run_v1(p_job_id,p_capability_token,p_run_id,p_consumed_basis);$$;
create function public.worker_recover_capital_preview_run_v1(p_job_id uuid,p_capability_token text,p_run_id uuid)returns jsonb language sql security invoker set search_path=''as $$select private.worker_recover_capital_preview_run_v1(p_job_id,p_capability_token,p_run_id);$$;
create function public.worker_capital_preview_boundary_usage_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid)returns jsonb language sql security invoker set search_path=''as $$select private.worker_capital_preview_boundary_usage_v1(p_job_id,p_capability_token,p_recipe_id);$$;

create function private.guard_capital_preview_native_writer_v1()returns trigger language plpgsql security definer set search_path=''as $$
declare j public.processing_jobs;x private.capital_preview_task_projections;b private.capital_preview_native_bindings;
begin
 select*into j from public.processing_jobs where organization_id=new.organization_id and id=new.processing_job_id;
 if j.payload->>'analysis_scope'is distinct from'integration_preview'then return new;end if;
 if tg_table_name='capital_project_artifacts'then
 select*into x from private.capital_preview_task_projections where organization_id=new.organization_id and capital_artifact_id=new.id;
 select*into b from private.capital_preview_native_bindings where organization_id=new.organization_id and capital_artifact_id=new.id;
 if x.id is null or b.id is null or new.content is distinct from jsonb_build_object('schemaVersion','capital-preview-task-projection.v1','revisionId',b.revision_id,'runId',x.run_id,'taskId',x.task_id,'role',x.role,'retainedPayloadId',x.retained_payload_id,'semanticFingerprint',x.semantic_fingerprint,
 'physicalSha256',(select a.payload_fingerprint from private.capital_public_retained_payloads q join private.capital_public_payload_allocations a on(a.organization_id,a.id)=(q.organization_id,q.allocation_id)where q.organization_id=x.organization_id and q.id=x.retained_payload_id),
 'byteLength',(select a.byte_length from private.capital_public_retained_payloads q join private.capital_public_payload_allocations a on(a.organization_id,a.id)=(q.organization_id,q.allocation_id)where q.organization_id=x.organization_id and q.id=x.retained_payload_id))or new.artifact_fingerprint is distinct from x.artifact_fingerprint or new.task_run_id is distinct from x.task_run_id or new.schema_version is distinct from'capital-preview-task-projection.v1'then raise exception 'capital_preview_native_projection_required'using errcode='42501';end if;
 elsif new.status='succeeded'then
 if exists(select 1 from private.capital_preview_runs run join public.capital_project_plan_tasks pt on(pt.organization_id,pt.id)=(new.organization_id,new.plan_task_id)where run.organization_id=new.organization_id and run.job_id=new.processing_job_id and pt.task_id=(private.capital_preview_workflow_v1(run.composition)->'steps'-> -1 ->>'taskId')and not exists(select 1 from private.capital_preview_task_projections contract where contract.organization_id=run.organization_id and contract.run_id=run.id and contract.task_run_id=new.id and contract.role='decision_contract'and private.capital_body_physical_receipt_v1(run.organization_id,contract.retained_payload_id)))then raise exception 'capital_preview_contract_missing'using errcode='42501';end if;
 select*into x from private.capital_preview_task_projections where organization_id=new.organization_id and task_run_id=new.id and role='task_output';
 if x.id is null or new.output_reference is distinct from jsonb_build_object('type','capital_project_artifact','id',x.capital_artifact_id)or new.output_fingerprint is distinct from x.artifact_fingerprint or new.usage<>'{}'::jsonb or new.error is not null or new.quality_results is distinct from jsonb_build_array(jsonb_build_object('id','bounded_output','passed',true))then raise exception 'capital_preview_native_completion_required'using errcode='42501';end if;
 end if;return new;
end;$$;
create trigger preview_native_artifact_guard before insert or update of content,artifact_fingerprint,task_run_id on public.capital_project_artifacts for each row execute function private.guard_capital_preview_native_writer_v1();
create trigger preview_native_task_guard before update of status,output_reference,output_fingerprint on public.capital_project_task_runs for each row execute function private.guard_capital_preview_native_writer_v1();
alter function private.artifact_review_sources_allowed_v1(uuid,uuid,uuid)rename to artifact_review_sources_allowed_pre_preview_v1;
create function private.artifact_review_sources_allowed_v1(p_org uuid,p_revision uuid,p_subject uuid)returns boolean language plpgsql volatile security definer set search_path=''as $$
begin
 if not private.capital_preview_native_read_allowed_v1(p_org,p_revision,p_subject)then return false;end if;
 return private.artifact_review_sources_allowed_pre_preview_v1(p_org,p_revision,p_subject);end;$$;
revoke all on function private.artifact_review_sources_allowed_pre_preview_v1(uuid,uuid,uuid)from public,anon,authenticated,service_role;

-- Locate the original substance core explicitly, preserving all wrappers.
do $$declare def text;matches integer;needle text:='if not has_substance then raise exception ''review_substance_required''';begin
 select count(*),max(pg_get_functiondef(p.oid))into matches,def from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private'and p.proname like 'review_artifact_revision%'and p.proargtypes='2950 25 25 2950 25 16 2950 2950'::oidvector and position(needle in p.prosrc)>0;
 if matches<>1 then raise exception 'capital_preview_review_substance_core_ambiguous';end if;
 execute replace(def,needle,'if not has_substance and exists(select 1 from private.capital_preview_native_bindings where(organization_id,revision_id)=(org,r.id)) then has_substance:=private.capital_preview_native_read_allowed_v1(org,r.id,actor);end if; '||needle);
end;$$;
revoke all on function private.artifact_revision_release_v1(public.artifact_revisions),private.artifact_review_sources_allowed_v1(uuid,uuid,uuid),private.project_legacy_artifact_revision_v1(text,uuid,uuid)from public,anon,authenticated,service_role;

do $$declare f record;begin
 for f in select p.oid::regprocedure signature,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in('public','private')and p.proname like '%capital_preview%'loop
 execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);
 if f.proname in('read_capital_preview_result_body_v1','worker_finish_capital_preview_task_v1','worker_finalize_capital_preview_run_v1','worker_recover_capital_preview_run_v1','worker_capital_preview_boundary_usage_v1','worker_record_capital_preview_execution_failure_v1','publish_capital_preview_consumed_basis_v1','worker_prepare_capital_preview_run_v1','worker_prepare_capital_preview_body_v1','worker_commit_capital_preview_body_v1','worker_read_capital_preview_allocation_v1','worker_prepare_capital_preview_boundary_v1','worker_seal_capital_preview_boundary_v1','worker_revalidate_capital_preview_boundary_v1','worker_recover_capital_preview_accepted_v1','worker_commit_capital_preview_task_v1','worker_authorize_capital_preview_processing_v1','worker_record_capital_preview_input_v1','worker_record_capital_preview_attempt_outcome_v1','worker_record_capital_preview_accepted_v1')then execute format('grant execute on function %s to authenticated',f.signature);end if;
 end loop;
end;$$;

create function private.worker_lookup_capital_preview_boundary_v1(p_job_id uuid,p_capability_token text,p_run_id uuid,p_boundary text)returns jsonb language plpgsql security definer set search_path=''as $$
declare r private.capital_preview_runs:=private.require_capital_preview_run_v1(p_job_id,p_capability_token,p_run_id,true);recipe private.capital_preview_recipes;begin
 if p_boundary not in('questions','synthesis')then raise exception 'capital_preview_boundary_invalid'using errcode='22023';end if;
 select*into recipe from private.capital_preview_recipes where organization_id=r.organization_id and run_id=r.id and boundary=p_boundary;
 if recipe.id is null then raise exception 'capital_preview_boundary_unavailable'using errcode='42501';end if;
 perform private.require_capital_preview_recipe_v1(p_job_id,p_capability_token,recipe.id);return jsonb_build_object('recipeId',recipe.id);end;$$;
create function public.worker_lookup_capital_preview_boundary_v1(p_job_id uuid,p_capability_token text,p_run_id uuid,p_boundary text)returns jsonb language sql security invoker set search_path=''as $$select private.worker_lookup_capital_preview_boundary_v1(p_job_id,p_capability_token,p_run_id,p_boundary);$$;
revoke all on function private.worker_lookup_capital_preview_boundary_v1(uuid,text,uuid,text),public.worker_lookup_capital_preview_boundary_v1(uuid,text,uuid,text)from public,anon,authenticated,service_role;
grant execute on function private.worker_lookup_capital_preview_boundary_v1(uuid,text,uuid,text),public.worker_lookup_capital_preview_boundary_v1(uuid,text,uuid,text)to authenticated;

-- Human review resolves the actual private CPA↔revision bridge. A generated
-- preview never gains an approval merely because the body is physically ready.
create function private.read_capital_preview_review_basis_v1(p_project_id uuid,p_artifact_id uuid,p_revision_id uuid)returns jsonb language plpgsql volatile security definer set search_path=''as $$
declare org uuid;actor uuid:=auth.uid();binding private.capital_preview_native_bindings;run private.capital_preview_runs;c public.capital_project_artifacts;revision public.artifact_revisions;active boolean;begin
 select organization_id into org from public.capital_projects where id=p_project_id and status<>'archived';
 if org is null or not private.can_access_resource_v1(org,p_project_id,'read')then raise exception 'capital_artifact_review_denied'using errcode='42501';end if;
 select*into binding from private.capital_preview_native_bindings where organization_id=org and work_id=p_project_id and capital_artifact_id=p_artifact_id and revision_id=p_revision_id;
 select*into run from private.capital_preview_runs where organization_id=org and id=binding.run_id;
 select*into c from public.capital_project_artifacts where organization_id=org and id=p_artifact_id and capital_project_id=p_project_id;
 select*into revision from public.artifact_revisions where organization_id=org and id=p_revision_id;
 if binding.id is null or run.id is null or c.id is null or revision.id is null or not private.capital_preview_native_read_allowed_v1(org,revision.id,actor)then raise exception 'capital_artifact_review_basis_unproven'using errcode='42501';end if;
 active:=private.capital_artifact_approval_active_v2(org,revision.id);
 return jsonb_build_object('projectId',p_project_id,'artifactId',c.id,'revisionId',revision.id,'manifestFingerprint',revision.manifest_fingerprint,'artifactFingerprint',c.artifact_fingerprint,'artifactType',c.artifact_type,'artifactVersion',c.artifact_version,'preparedBy',run.human_subject_id,'viewerId',actor,'workAccess',private.can_access_resource_v1(org,p_project_id,'work'),'policy',private.review_policy_snapshot_v1(org,p_project_id,actor),'status',case when c.status in('confirmed','approved')and not active then 'pending_confirmation'else c.status end,'approvalActive',active,'sourceCount',17);
end;$$;
alter function private.read_capital_project_artifact_review_v2(uuid,uuid,uuid)rename to read_capital_project_artifact_review_before_preview_v2;
create function private.read_capital_project_artifact_review_v2(p_project_id uuid,p_artifact_id uuid,p_revision_id uuid)returns jsonb language plpgsql volatile security definer set search_path=''as $$begin
 if exists(select 1 from private.capital_preview_native_bindings where work_id=p_project_id and capital_artifact_id=p_artifact_id and revision_id=p_revision_id)then return private.read_capital_preview_review_basis_v1(p_project_id,p_artifact_id,p_revision_id);end if;
 return private.read_capital_project_artifact_review_before_preview_v2(p_project_id,p_artifact_id,p_revision_id);end;$$;
revoke all on function private.read_capital_preview_review_basis_v1(uuid,uuid,uuid),private.read_capital_project_artifact_review_before_preview_v2(uuid,uuid,uuid),private.read_capital_project_artifact_review_v2(uuid,uuid,uuid)from public,anon,authenticated,service_role;
grant execute on function private.read_capital_project_artifact_review_v2(uuid,uuid,uuid)to authenticated;

COMMIT;
