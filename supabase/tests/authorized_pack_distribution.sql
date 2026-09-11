-- Synthetic rollback-only contract for the versioned information pack, its authorized
-- distribution, the in-product qualified contact and the market response. Every command below is
-- the real public RPC under the actual caller's JWT.
begin;

insert into auth.users (id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,is_sso_user,is_anonymous) values
  ('10000000-0000-4000-8000-0000000000d1','authenticated','authenticated','pack-owner@example.invalid','{}','{}',now(),now(),false,false),
  ('10000000-0000-4000-8000-0000000000d2','authenticated','authenticated','pack-analyst@example.invalid','{}','{}',now(),now(),false,false),
  ('10000000-0000-4000-8000-0000000000d3','authenticated','authenticated','pack-financier-a@example.invalid','{}','{}',now(),now(),false,false),
  ('10000000-0000-4000-8000-0000000000d4','authenticated','authenticated','pack-financier-b@example.invalid','{}','{}',now(),now(),false,false);

insert into public.organizations (id,organization_type,name,created_by) values
  ('20000000-0000-4000-8000-0000000000d1','company','Synthetic issuer tenant','10000000-0000-4000-8000-0000000000d1'),
  ('20000000-0000-4000-8000-0000000000d2','capital_provider','Synthetic financier A','10000000-0000-4000-8000-0000000000d3'),
  ('20000000-0000-4000-8000-0000000000d3','capital_provider','Synthetic financier B','10000000-0000-4000-8000-0000000000d4');

insert into public.organization_memberships (organization_id,user_id,role,status,joined_at) values
  ('20000000-0000-4000-8000-0000000000d1','10000000-0000-4000-8000-0000000000d1','owner','active',now()),
  ('20000000-0000-4000-8000-0000000000d1','10000000-0000-4000-8000-0000000000d2','analyst','active',now()),
  ('20000000-0000-4000-8000-0000000000d2','10000000-0000-4000-8000-0000000000d3','owner','active',now()),
  ('20000000-0000-4000-8000-0000000000d3','10000000-0000-4000-8000-0000000000d4','owner','active',now());

insert into public.document_intake_sessions (id,organization_id,started_by,journey,locale,representation_kind,representation_status,representation_verified_by,representation_verified_at)
values ('40000000-0000-4000-8000-0000000000d1','20000000-0000-4000-8000-0000000000d1','10000000-0000-4000-8000-0000000000d1','company','pt-BR','company','verified','10000000-0000-4000-8000-0000000000d1',now());

insert into public.deal_state_objects (
  organization_id, intake_session_id, object_type, object_version, status,
  input_fingerprint, object_fingerprint, payload, dependencies, created_by_kind
) values (
  '20000000-0000-4000-8000-0000000000d1','40000000-0000-4000-8000-0000000000d1',
  'material_artifact', 1, 'pending_confirmation', repeat('a',64), repeat('b',64),
  '{"schemaVersion":"material.v1"}'::jsonb, '[]'::jsonb, 'worker'
);
insert into public.deal_state_objects (
  organization_id, intake_session_id, object_type, object_version, status,
  input_fingerprint, object_fingerprint, payload, dependencies, created_by, created_by_kind
) values (
  '20000000-0000-4000-8000-0000000000d1','40000000-0000-4000-8000-0000000000d1',
  'package_review', 1, 'approved', repeat('a',64), repeat('c',64),
  jsonb_build_object('schemaVersion','2026.08.29-v1','approval', jsonb_build_object(
    'actorId','10000000-0000-4000-8000-0000000000d1','approvedAt',now(),
    'scope','internal_material_package','artifactFingerprint', repeat('b',64)
  )),
  jsonb_build_array(jsonb_build_object('objectType','material_artifact','objectFingerprint',repeat('b',64))),
  '10000000-0000-4000-8000-0000000000d1','user'
);

insert into public.market_distribution_policies (
  version,status,valid_from,mandate_max_age_months,wave_limit,learning_gate_anchor_count,
  methodology_source,approved_by,approved_at
) values (
  'synthetic-distribution-policy-v1','active',current_date - 1,12,2,1,
  'Synthetic policy for the rollback-only distribution contract test.',
  '10000000-0000-4000-8000-0000000000d1',now()
);

insert into public.fund_directory (id,legal_name,short_name,kind,status,claimed_by_organization_id,claimed_at) values
  ('30000000-0000-4000-8000-0000000000d1','Synthetic financier A Ltda','Synthetic financier A','credit_fund','registered','20000000-0000-4000-8000-0000000000d2',now()),
  ('30000000-0000-4000-8000-0000000000d2','Synthetic unclaimed fund Ltda','Synthetic unclaimed fund','credit_fund','mapped',null,null);

-- The exact introduction plan and its contact-free targets already exist in the product; this
-- fixture writes them directly because building them is the job of the matching front.
insert into public.qualified_introduction_plans (
  id,organization_id,intake_session_id,case_fingerprint,material_fingerprint,match_screen_fingerprint,
  wave_limit,identity_policy,status,technical_review_fingerprint,technical_reviewed_by,technical_reviewed_at,
  authorized_by,authorized_at,authorization_snapshot,created_by
) values (
  '60000000-0000-4000-8000-0000000000d1','20000000-0000-4000-8000-0000000000d1','40000000-0000-4000-8000-0000000000d1',
  repeat('a',64),repeat('b',64),repeat('e',64),2,'identified_restricted','authorized',
  repeat('b',64),'10000000-0000-4000-8000-0000000000d1',now(),
  '10000000-0000-4000-8000-0000000000d1',now(),
  jsonb_build_object('identityPolicy','identified_restricted','caseFingerprint',repeat('a',64),
    'materialFingerprint',repeat('b',64),'recipientIds', jsonb_build_array()),
  '10000000-0000-4000-8000-0000000000d1'
);
insert into public.qualified_introduction_targets (
  id,organization_id,intake_session_id,plan_id,match_screen_fingerprint,provider_id,provider_source,
  provider_kind,provider_name,fund_directory_id,mandate_fingerprint,rationale,position,created_by
) values
  ('61000000-0000-4000-8000-0000000000d1','20000000-0000-4000-8000-0000000000d1','40000000-0000-4000-8000-0000000000d1',
   '60000000-0000-4000-8000-0000000000d1',repeat('e',64),'30000000-0000-4000-8000-0000000000d1','directory',
   'credit_fund','Synthetic financier A','30000000-0000-4000-8000-0000000000d1',repeat('f',64),
   'Mandato confirmado para recebiveis com ticket compativel.',1,'10000000-0000-4000-8000-0000000000d1'),
  ('61000000-0000-4000-8000-0000000000d2','20000000-0000-4000-8000-0000000000d1','40000000-0000-4000-8000-0000000000d1',
   '60000000-0000-4000-8000-0000000000d1',repeat('e',64),'30000000-0000-4000-8000-0000000000d2','directory',
   'credit_fund','Synthetic unclaimed fund','30000000-0000-4000-8000-0000000000d2',repeat('f',64),
   'Atuacao historica observada, sem mandato confirmado.',2,'10000000-0000-4000-8000-0000000000d1');

create function pg_temp.as_user(p_user uuid) returns void language sql as $$
  select set_config('request.jwt.claims',jsonb_build_object('sub',p_user,'role','authenticated','aal','aal1')::text,true);
$$;

create function pg_temp.expect_failure(p_sql text, p_message text) returns void language plpgsql as $$
declare rejected boolean := false;
begin
  begin
    execute p_sql;
  exception when others then
    if sqlerrm <> p_message then raise exception 'expected % but got %', p_message, sqlerrm; end if;
    rejected := true;
  end;
  if not rejected then raise exception 'command was not rejected: %', p_sql; end if;
end;
$$;

set local role authenticated;
select pg_temp.as_user('10000000-0000-4000-8000-0000000000d1');

-- 1. One immutable revision from the approved package, with two exact exported files.
do $$
declare
  org constant uuid := '20000000-0000-4000-8000-0000000000d1';
  session_id constant uuid := '40000000-0000-4000-8000-0000000000d1';
  items constant jsonb := jsonb_build_array(
    jsonb_build_object(
      'deliverableId','teaser','format','pdf','artifactFingerprint',repeat('1',64),
      'templateKey','offroad-house','templateVersion','2026.09.07-v1','templateOrigin','offroad_house',
      'sourceResultIds', jsonb_build_array('result-1'),'title','Teaser'
    ),
    jsonb_build_object(
      'deliverableId','indicative_term_sheet','format','docx','artifactFingerprint',repeat('2',64),
      'templateKey','client-identity','templateVersion','2026.09.11-v1','templateOrigin','client_supplied',
      'templateFingerprint',repeat('3',64),'sourceResultIds', jsonb_build_array('result-1'),'title','Term sheet'
    )
  );
  first_result jsonb;
  replay jsonb;
  second_result jsonb;
  revised constant jsonb := jsonb_build_array(
    jsonb_build_object(
      'deliverableId','teaser','format','pdf','artifactFingerprint',repeat('4',64),
      'templateKey','offroad-house','templateVersion','2026.09.07-v1','templateOrigin','offroad_house',
      'sourceResultIds', jsonb_build_array('result-2'),'title','Teaser'
    )
  );
begin
  first_result := public.record_information_pack_revision(org, session_id, items);
  if (first_result ->> 'revision_number')::integer <> 1 or (first_result ->> 'replayed')::boolean then
    raise exception 'first pack revision was not recorded: %', first_result;
  end if;
  if (select count(*) from public.information_pack_items where pack_revision_id = (first_result ->> 'id')::uuid) <> 2 then
    raise exception 'pack revision did not keep its exact exported files';
  end if;

  replay := public.record_information_pack_revision(org, session_id, items);
  if not (replay ->> 'replayed')::boolean or replay ->> 'id' <> first_result ->> 'id' then
    raise exception 'identical pack content created a second revision: %', replay;
  end if;

  second_result := public.record_information_pack_revision(org, session_id, revised);
  if (second_result ->> 'revision_number')::integer <> 2 then
    raise exception 'a changed pack did not open a new revision: %', second_result;
  end if;
  if not exists (
    select 1 from public.information_pack_revisions
    where id = (first_result ->> 'id')::uuid
      and status = 'superseded'
      and superseded_by_id = (second_result ->> 'id')::uuid
      and superseded_at is not null
  ) then
    raise exception 'the previous revision was deleted instead of superseded';
  end if;
  perform set_config('test.revision_two', second_result ->> 'id', true);
  perform set_config('test.fingerprint_two', second_result ->> 'pack_fingerprint', true);
end;
$$;

-- 2. A tenant member has no update privilege at all, and the row itself refuses a content rewrite
-- even for a caller that bypasses both the grant and the policy.
select pg_temp.expect_failure(
  format('update public.information_pack_revisions set manifest = ''{}''::jsonb where id = %L', current_setting('test.revision_two')),
  'permission denied for table information_pack_revisions'
);
set local role postgres;
select pg_temp.expect_failure(
  format('update public.information_pack_revisions set manifest = ''{}''::jsonb where id = %L', current_setting('test.revision_two')),
  'information_pack_revision_is_immutable'
);
select pg_temp.expect_failure(
  format('update public.information_pack_items set title = ''rewritten'' where pack_revision_id = %L', current_setting('test.revision_two')),
  'information_pack_item_is_immutable'
);
set local role authenticated;
select pg_temp.as_user('10000000-0000-4000-8000-0000000000d1');

-- 3. The wave limit of the active policy and the consent record are both required.
select pg_temp.expect_failure(
  format($sql$select public.authorize_pack_distribution(
    '20000000-0000-4000-8000-0000000000d1','40000000-0000-4000-8000-0000000000d1',%L,%L,
    'A companhia autoriza disponibilizar este pacote aos destinatarios nomeados.',
    jsonb_build_array(
      jsonb_build_object('recipientKind','registered_organization','recipientOrganizationId','20000000-0000-4000-8000-0000000000d2','label','A'),
      jsonb_build_object('recipientKind','registered_organization','recipientOrganizationId','20000000-0000-4000-8000-0000000000d3','label','B'),
      jsonb_build_object('recipientKind','directory_entry','recipientDirectoryId','30000000-0000-4000-8000-0000000000d2','label','C')
    ))$sql$, current_setting('test.revision_two'), current_setting('test.fingerprint_two')),
  'pack_distribution_wave_limit_exceeded'
);
select pg_temp.expect_failure(
  format($sql$select public.authorize_pack_distribution(
    '20000000-0000-4000-8000-0000000000d1','40000000-0000-4000-8000-0000000000d1',%L,%L,'curto',
    jsonb_build_array(jsonb_build_object('recipientKind','registered_organization','recipientOrganizationId','20000000-0000-4000-8000-0000000000d2','label','A')))$sql$,
    current_setting('test.revision_two'), current_setting('test.fingerprint_two')),
  'pack_distribution_consent_required'
);
select pg_temp.expect_failure(
  format($sql$select public.authorize_pack_distribution(
    '20000000-0000-4000-8000-0000000000d1','40000000-0000-4000-8000-0000000000d1',%L,%L,
    'A companhia autoriza disponibilizar este pacote aos destinatarios nomeados.',
    jsonb_build_array(jsonb_build_object('recipientKind','registered_organization','recipientOrganizationId','20000000-0000-4000-8000-0000000000d1','label','Self')))$sql$,
    current_setting('test.revision_two'), current_setting('test.fingerprint_two')),
  'pack_distribution_recipient_organization_invalid'
);

-- 4. A share is never written directly: the table has no insert privilege for a tenant member.
select pg_temp.expect_failure(
  format($sql$insert into public.pack_distribution_shares (
    organization_id,intake_session_id,authorization_id,pack_revision_id,position,recipient_kind,
    recipient_organization_id,recipient_label,delivery_state,issuer_identity_disclosed,issuer_display_name,created_by
  ) values ('20000000-0000-4000-8000-0000000000d1','40000000-0000-4000-8000-0000000000d1',
    gen_random_uuid(),%L,1,'registered_organization','20000000-0000-4000-8000-0000000000d2','A','available',
    false,null,'10000000-0000-4000-8000-0000000000d1')$sql$, current_setting('test.revision_two')),
  'permission denied for table pack_distribution_shares'
);

-- 5. The authorized wave: one recipient organization plus one directory entry with no access.
do $$
declare
  result jsonb;
begin
  result := public.authorize_pack_distribution(
    '20000000-0000-4000-8000-0000000000d1','40000000-0000-4000-8000-0000000000d1',
    current_setting('test.revision_two')::uuid, current_setting('test.fingerprint_two'),
    'A companhia autoriza disponibilizar este pacote aos destinatarios nomeados.',
    jsonb_build_array(
      jsonb_build_object('recipientKind','registered_organization','recipientOrganizationId','20000000-0000-4000-8000-0000000000d2','label','Financier A'),
      jsonb_build_object('recipientKind','directory_entry','recipientDirectoryId','30000000-0000-4000-8000-0000000000d2','label','Directory only')
    )
  );
  if (result ->> 'wave_limit')::integer <> 2 or result ->> 'policy_version' <> 'synthetic-distribution-policy-v1' then
    raise exception 'the authorization did not carry the active policy: %', result;
  end if;
  perform set_config('test.authorization', result ->> 'authorization_id', true);
  if not exists (
    select 1 from public.pack_distribution_authorizations
    where id = (result ->> 'authorization_id')::uuid
      and consented_by = '10000000-0000-4000-8000-0000000000d1'
      and consent_basis = 'company_officer'
      and length(trim(consent_statement)) >= 20
  ) then
    raise exception 'the authorization did not persist the consent of the person who authorized it';
  end if;
  if not exists (
    select 1 from public.pack_distribution_shares
    where authorization_id = (result ->> 'authorization_id')::uuid
      and recipient_kind = 'directory_entry'
      and delivery_state = 'not_delivered_no_product_access'
  ) then
    raise exception 'the directory entry was not recorded as undelivered';
  end if;
end;
$$;

do $$
declare share_id uuid;
begin
  select id into strict share_id from public.pack_distribution_shares
  where authorization_id = current_setting('test.authorization')::uuid
    and recipient_kind = 'registered_organization';
  perform set_config('test.share', share_id::text, true);
end;
$$;

-- 6. The recipient organization reads its own share, the exact files, and nothing of the project.
select pg_temp.as_user('10000000-0000-4000-8000-0000000000d3');
do $$
declare
  pack jsonb;
begin
  if (select count(*) from public.pack_distribution_shares) <> 1 then
    raise exception 'the recipient does not see exactly its own share';
  end if;
  if (select count(*) from public.information_pack_revisions) <> 0
    or (select count(*) from public.information_pack_items) <> 0
    or (select count(*) from public.pack_distribution_authorizations) <> 0
    or (select count(*) from public.document_intake_sessions) <> 0
    or (select count(*) from public.qualified_contact_preparations) <> 0 then
    raise exception 'the recipient reached the issuer project tables';
  end if;
  pack := public.read_shared_information_pack(current_setting('test.share')::uuid);
  if jsonb_array_length(pack -> 'items') <> 1 or pack ->> 'issuer_name' is null then
    raise exception 'the identified pack did not reach the recipient: %', pack;
  end if;
  if (select count(*) from public.pack_access_events where access_kind = 'pack_opened') <> 1 then
    raise exception 'the read of a shared pack was not logged';
  end if;
  perform public.open_shared_information_pack_item(
    current_setting('test.share')::uuid,
    (pack -> 'items' -> 0 ->> 'id')::uuid
  );
  if (select count(*) from public.pack_access_events where access_kind = 'item_opened') <> 1 then
    raise exception 'the read of a shared artifact was not logged';
  end if;
end;
$$;

-- 7. Another financier reads nothing at all.
select pg_temp.as_user('10000000-0000-4000-8000-0000000000d4');
do $$
begin
  if (select count(*) from public.pack_distribution_shares) <> 0 then
    raise exception 'a financier outside the wave sees a share';
  end if;
end;
$$;
select pg_temp.expect_failure(
  format('select public.read_shared_information_pack(%L)', current_setting('test.share')),
  'shared_information_pack_not_available'
);

-- 8. Qualified contact: an eligible candidate is introduced inside the product, a research
-- hypothesis never is, and a contact never points at a recipient other than its own.
select pg_temp.as_user('10000000-0000-4000-8000-0000000000d1');
do $$
declare
  eligible_preparation uuid;
  research_preparation uuid;
  released uuid;
begin
  eligible_preparation := public.prepare_qualified_contact(
    '61000000-0000-4000-8000-0000000000d1','eligible',
    'Mandato confirmado, ticket e instrumento compativeis com a estrutura aprovada.',
    current_setting('test.share')::uuid
  );
  research_preparation := public.prepare_qualified_contact(
    '61000000-0000-4000-8000-0000000000d2','hypothesis',
    'Atuacao historica observada; sem mandato confirmado, permanece pesquisa.'
  );
  perform set_config('test.preparation', eligible_preparation::text, true);
  perform set_config('test.research', research_preparation::text, true);
  if exists (
    select 1 from public.qualified_contact_preparations
    where id = research_preparation and (share_id is not null or pack_revision_id is not null)
  ) then
    raise exception 'a research hypothesis received a pack';
  end if;

  released := public.release_qualified_contact(eligible_preparation, current_setting('test.fingerprint_two'));
  if not exists (
    select 1 from public.qualified_contact_preparations
    where id = released and status = 'released'
      and released_by = '10000000-0000-4000-8000-0000000000d1' and released_at is not null
  ) then
    raise exception 'the qualified contact was not recorded as released';
  end if;
  if public.release_qualified_contact(eligible_preparation, current_setting('test.fingerprint_two')) <> released then
    raise exception 'releasing the same qualified contact twice created a second record';
  end if;
end;
$$;
select pg_temp.expect_failure(
  format('select public.release_qualified_contact(%L, %L)', current_setting('test.research'), current_setting('test.fingerprint_two')),
  'research_hypothesis_is_never_introduced'
);
select pg_temp.expect_failure(
  format($sql$select public.prepare_qualified_contact(
    '61000000-0000-4000-8000-0000000000d2','eligible',
    'Tentativa de introduzir um alvo de pesquisa usando o pacote de outro destinatario.', %L)$sql$,
    current_setting('test.share')),
  'qualified_contact_recipient_mismatch'
);
select pg_temp.expect_failure(
  format('select public.release_qualified_contact(%L, %L)', current_setting('test.preparation'), repeat('9',64)),
  'qualified_contact_pack_changed'
);

-- 9. The recipient answers inside the product; the issuer sees it and records its next step.
select pg_temp.as_user('10000000-0000-4000-8000-0000000000d3');
do $$
declare
  first_response uuid;
  correction uuid;
begin
  first_response := public.record_pack_recipient_response(
    p_share_id := current_setting('test.share')::uuid,
    p_response_state := 'needs_information',
    p_note := 'Precisamos do detalhe da carteira por sacado.',
    p_requested_conditions := jsonb_build_array(jsonb_build_object('code','pool_detail_by_debtor')),
    p_term_objections := jsonb_build_array(jsonb_build_object('code','tenor_too_long','note','Prazo acima do mandato.'))
  );
  perform set_config('test.response', first_response::text, true);
  correction := public.record_pack_recipient_response(
    p_share_id := current_setting('test.share')::uuid,
    p_response_state := 'interested',
    p_note := 'Podemos avaliar com o detalhe adicional.',
    p_ticket_amount := 25000000.00,
    p_ticket_currency := 'BRL',
    p_tenor_months := 24,
    p_pricing_basis := 'cdi_plus',
    p_pricing_min := 3.5000,
    p_pricing_max := 4.7500,
    p_supersedes_response_id := first_response
  );
  if correction = first_response then
    raise exception 'the correction replaced the original response instead of superseding it';
  end if;
  if (select count(*) from public.pack_recipient_responses) <> 2 then
    raise exception 'the recipient does not see both of its own responses';
  end if;
  if (select count(*) from public.pack_distribution_next_steps) <> 0 then
    raise exception 'the recipient reached the issuer next steps';
  end if;
end;
$$;
select pg_temp.expect_failure(
  format($sql$select public.record_pack_recipient_response(
    p_share_id := %L, p_response_state := 'declined')$sql$, current_setting('test.share')),
  'new row for relation "pack_recipient_responses" violates check constraint "pack_recipient_responses_decline_is_explained"'
);

select pg_temp.as_user('10000000-0000-4000-8000-0000000000d4');
do $$
begin
  if (select count(*) from public.pack_recipient_responses) <> 0 then
    raise exception 'a financier outside the wave sees another response';
  end if;
end;
$$;

select pg_temp.as_user('10000000-0000-4000-8000-0000000000d1');
do $$
begin
  if (select count(*) from public.pack_recipient_responses where share_id = current_setting('test.share')::uuid) <> 2 then
    raise exception 'the issuer does not see the responses to its own pack';
  end if;
  perform public.record_pack_distribution_next_step(
    current_setting('test.share')::uuid, 'prepare_information_answer',
    'Preparar o detalhe da carteira por sacado na proxima revisao.'
  );
  if (select count(*) from public.pack_distribution_next_steps where share_id = current_setting('test.share')::uuid) <> 1 then
    raise exception 'the issuer next step was not persisted';
  end if;
end;
$$;

-- 10. Revocation closes the door for the recipient that had it.
do $$
begin
  perform public.revoke_pack_distribution(current_setting('test.authorization')::uuid);
end;
$$;
select pg_temp.as_user('10000000-0000-4000-8000-0000000000d3');
do $$
begin
  if (select count(*) from public.pack_distribution_shares) <> 0 then
    raise exception 'a revoked share is still visible to the recipient';
  end if;
end;
$$;
select pg_temp.expect_failure(
  format('select public.read_shared_information_pack(%L)', current_setting('test.share')),
  'shared_information_pack_not_available'
);

-- 11. Under a blind policy the recipient never receives the issuer identity.
set local role postgres;
update public.document_intake_sessions set identity_policy = 'blind_initial'
where id = '40000000-0000-4000-8000-0000000000d1';
set local role authenticated;
select pg_temp.as_user('10000000-0000-4000-8000-0000000000d1');
do $$
declare
  revision jsonb;
  authorization_result jsonb;
  share_id uuid;
begin
  revision := public.record_information_pack_revision(
    '20000000-0000-4000-8000-0000000000d1','40000000-0000-4000-8000-0000000000d1',
    jsonb_build_array(jsonb_build_object(
      'deliverableId','teaser','format','pdf','artifactFingerprint',repeat('5',64),
      'templateKey','offroad-house','templateVersion','2026.09.07-v1','templateOrigin','offroad_house',
      'sourceResultIds', jsonb_build_array('result-3'),'title','Teaser'
    ))
  );
  authorization_result := public.authorize_pack_distribution(
    '20000000-0000-4000-8000-0000000000d1','40000000-0000-4000-8000-0000000000d1',
    (revision ->> 'id')::uuid, revision ->> 'pack_fingerprint',
    'A companhia autoriza disponibilizar este pacote sem revelar sua identidade nesta etapa.',
    jsonb_build_array(jsonb_build_object(
      'recipientKind','registered_organization',
      'recipientOrganizationId','20000000-0000-4000-8000-0000000000d2','label','Financier A'
    ))
  );
  select id into strict share_id from public.pack_distribution_shares
  where authorization_id = (authorization_result ->> 'authorization_id')::uuid;
  if exists (select 1 from public.pack_distribution_shares where id = share_id and issuer_display_name is not null) then
    raise exception 'a blind share carries the issuer identity';
  end if;
  perform set_config('test.blind_share', share_id::text, true);
end;
$$;
select pg_temp.as_user('10000000-0000-4000-8000-0000000000d3');
do $$
declare pack jsonb;
begin
  pack := public.read_shared_information_pack(current_setting('test.blind_share')::uuid);
  if pack ->> 'issuer_name' is not null or pack ->> 'identity_policy' <> 'blind_initial' then
    raise exception 'the blind policy did not hide the issuer identity: %', pack;
  end if;
end;
$$;

-- 12. The answers to the previous revision stay attached to the revision they answered.
select pg_temp.as_user('10000000-0000-4000-8000-0000000000d1');
do $$
begin
  if (select count(*) from public.pack_recipient_responses response
      join public.information_pack_revisions revision
        on revision.organization_id = response.organization_id and revision.id = response.pack_revision_id
      where revision.status = 'superseded') <> 2 then
    raise exception 'the earlier responses stopped referring to the revision they answered';
  end if;
end;
$$;

select 'authorized_pack_distribution_passed' as result;

rollback;
