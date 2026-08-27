-- Gate 0 for borrower and advisor projects.
--
-- The user can begin work in a private workspace immediately after accepting the
-- confidentiality terms and declaring the relationship to the company. External
-- distribution remains impossible until Offroad has verified that representation
-- and the company has authorized the exact materials, identity policy and recipients.

create table public.platform_legal_documents (
  id uuid primary key default gen_random_uuid(),
  document_key text not null check (document_key ~ '^[a-z0-9_]+$'),
  version text not null check (char_length(trim(version)) between 3 and 80),
  locale text not null check (locale in ('pt-BR', 'en-US')),
  title text not null check (char_length(trim(title)) between 3 and 200),
  rendered_text text not null check (char_length(trim(rendered_text)) between 100 and 20000),
  body_sections jsonb not null check (
    jsonb_typeof(body_sections) = 'array'
    and jsonb_array_length(body_sections) between 1 and 20
  ),
  document_hash text not null check (document_hash ~ '^[0-9a-f]{64}$'),
  status text not null default 'draft' check (status in ('draft', 'active', 'superseded')),
  effective_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (document_key, version, locale)
);

create unique index platform_legal_documents_active_locale_idx
  on public.platform_legal_documents (document_key, locale)
  where status = 'active';

create function private.set_legal_document_hash()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.document_hash := encode(
    extensions.digest(convert_to(new.rendered_text, 'UTF8'), 'sha256'),
    'hex'
  );
  return new;
end;
$$;

create trigger platform_legal_documents_set_hash
before insert or update of rendered_text on public.platform_legal_documents
for each row execute function private.set_legal_document_hash();

revoke all on function private.set_legal_document_hash() from public, anon, authenticated;

alter table public.platform_legal_documents enable row level security;
alter table public.platform_legal_documents force row level security;

create policy platform_legal_documents_active_select
on public.platform_legal_documents
for select
to authenticated
using (status = 'active' and effective_at <= now());

revoke all on public.platform_legal_documents from public, anon, authenticated;
grant select on public.platform_legal_documents to authenticated;
grant select, insert, update, delete on public.platform_legal_documents to service_role;

insert into public.platform_legal_documents (
  document_key, version, locale, title, rendered_text, body_sections, status, effective_at
) values
(
  'private_workspace_terms',
  '2026-08-27-v1',
  'pt-BR',
  'Confidencialidade e autorização de trabalho',
  E'A Offroad manterá as informações deste projeto em ambiente privado e as utilizará exclusivamente para compreender a companhia e a operação, organizar e conciliar informações, analisar alternativas de estrutura, preparar materiais preliminares e identificar internamente potenciais financiadores.\n\nA Offroad poderá utilizar fornecedores de tecnologia necessários ao funcionamento da plataforma, sujeitos a deveres de confidencialidade e segurança.\n\nNenhuma informação, material ou identidade da companhia será compartilhada com investidores ou terceiros para fins de distribuição sem autorização prévia e específica do cliente. Essa autorização indicará os materiais, a política de identidade e os destinatários aprovados.\n\nO cliente permanece no controle, poderá revisar os materiais antes de qualquer abordagem e declara possuir autorização para iniciar este trabalho e disponibilizar as informações enviadas. Este aceite não substitui a verificação de representação exigida antes de qualquer distribuição.',
  '[
    {"heading":"Ambiente privado","body":"As informações deste projeto serão usadas exclusivamente para compreender a companhia e a operação, organizar e conciliar dados, analisar alternativas e preparar materiais preliminares."},
    {"heading":"Uso necessário de tecnologia","body":"Fornecedores de tecnologia necessários ao funcionamento da plataforma poderão processar informações sob deveres de confidencialidade e segurança."},
    {"heading":"Nada sai sem sua autorização","body":"Nenhuma informação, material ou identidade da companhia será compartilhada para fins de distribuição sem uma autorização prévia e específica que identifique materiais, política de identidade e destinatários."},
    {"heading":"Você permanece no controle","body":"Você revisa os materiais antes de qualquer abordagem. Este aceite inicia o trabalho privado e não substitui a verificação de representação exigida antes da distribuição."}
  ]'::jsonb,
  'active',
  now()
),
(
  'private_workspace_terms',
  '2026-08-27-v1',
  'en-US',
  'Confidentiality and work authorization',
  E'Offroad will keep the information for this project in a private environment and use it solely to understand the company and transaction, organize and reconcile information, analyze structuring alternatives, prepare preliminary materials and internally identify potential capital providers.\n\nOffroad may use technology providers required to operate the platform, subject to confidentiality and security obligations.\n\nNo information, material or company identity will be shared with investors or third parties for distribution purposes without the client''s prior and specific authorization. That authorization will identify the approved materials, identity policy and recipients.\n\nThe client remains in control, may review the materials before any outreach and declares that they are authorized to initiate this work and provide the submitted information. This acceptance does not replace the representation verification required before any distribution.',
  '[
    {"heading":"Private environment","body":"Information for this project will be used solely to understand the company and transaction, organize and reconcile data, analyze alternatives and prepare preliminary materials."},
    {"heading":"Necessary use of technology","body":"Technology providers required to operate the platform may process information under confidentiality and security obligations."},
    {"heading":"Nothing leaves without your authorization","body":"No information, material or company identity will be shared for distribution purposes without a prior, specific authorization identifying the materials, identity policy and recipients."},
    {"heading":"You remain in control","body":"You review the materials before any outreach. This acceptance starts the private work and does not replace the representation verification required before distribution."}
  ]'::jsonb,
  'active',
  now()
);

create table public.organization_legal_acceptances (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  legal_document_id uuid not null references public.platform_legal_documents (id),
  document_key text not null,
  document_version text not null,
  document_hash text not null check (document_hash ~ '^[0-9a-f]{64}$'),
  accepted_by uuid not null references auth.users (id),
  signatory_name text not null check (char_length(trim(signatory_name)) between 2 and 160),
  signatory_title text check (signatory_title is null or char_length(trim(signatory_title)) between 2 and 160),
  authority_declared boolean not null check (authority_declared),
  locale text not null check (locale in ('pt-BR', 'en-US')),
  accepted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (organization_id, document_key, document_version),
  unique (organization_id, id)
);

create index organization_legal_acceptances_document_fk_idx
  on public.organization_legal_acceptances (legal_document_id);
create index organization_legal_acceptances_accepted_by_fk_idx
  on public.organization_legal_acceptances (accepted_by);

alter table public.organization_legal_acceptances enable row level security;
alter table public.organization_legal_acceptances force row level security;

create policy organization_legal_acceptances_select
on public.organization_legal_acceptances
for select
to authenticated
using ((select private.is_org_member(organization_id)));

revoke all on public.organization_legal_acceptances from public, anon, authenticated;
grant select on public.organization_legal_acceptances to authenticated;
grant select, insert on public.organization_legal_acceptances to service_role;

create function private.reject_legal_acceptance_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' and current_user in ('postgres', 'service_role') then
    return old;
  end if;
  raise exception 'legal_acceptance_immutable' using errcode = '55000';
end;
$$;

create trigger organization_legal_acceptances_immutable
before update or delete on public.organization_legal_acceptances
for each row execute function private.reject_legal_acceptance_mutation();

revoke all on function private.reject_legal_acceptance_mutation() from public, anon, authenticated;

alter table public.document_intake_sessions
  add column project_name text,
  add column identity_policy text not null default 'identified_restricted'
    check (identity_policy in ('identified_restricted', 'blind_initial')),
  add column privacy_status text not null default 'private'
    check (privacy_status in ('private', 'distribution_authorized')),
  add column representation_kind text
    check (representation_kind is null or representation_kind in ('company', 'advisor')),
  add column representation_status text not null default 'declared'
    check (representation_status in ('declared', 'documented', 'verified', 'rejected', 'revoked')),
  add column representation_verified_by uuid references auth.users (id),
  add column representation_verified_at timestamptz,
  add constraint document_intake_session_project_name_check
    check (project_name is null or char_length(trim(project_name)) between 2 and 80),
  add constraint document_intake_session_representation_verification_check
    check (
      (representation_status = 'verified' and representation_verified_by is not null and representation_verified_at is not null)
      or (representation_status <> 'verified' and representation_verified_by is null and representation_verified_at is null)
    );

create unique index document_intake_sessions_open_project_name_idx
  on public.document_intake_sessions (organization_id, lower(project_name))
  where project_name is not null and status not in ('cancelled');
create index document_intake_sessions_representation_verified_by_fk_idx
  on public.document_intake_sessions (representation_verified_by);

create table public.project_representation_evidence (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  intake_session_id uuid not null,
  representation_kind text not null check (representation_kind in ('company', 'advisor')),
  evidence_type text not null check (evidence_type in (
    'self_declaration', 'corporate_role', 'corporate_registry', 'engagement_letter',
    'mandate', 'company_confirmation', 'power_of_attorney', 'corporate_approval', 'other'
  )),
  evidence_reference text check (evidence_reference is null or char_length(trim(evidence_reference)) between 2 and 1000),
  statement text not null check (char_length(trim(statement)) between 20 and 3000),
  status text not null default 'declared' check (status in ('declared', 'documented', 'verified', 'rejected', 'revoked')),
  submitted_by uuid not null references auth.users (id),
  reviewed_by uuid references auth.users (id),
  reviewed_at timestamptz,
  review_note text check (review_note is null or char_length(trim(review_note)) between 2 and 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, intake_session_id)
    references public.document_intake_sessions (organization_id, id) on delete cascade,
  check (
    (status in ('verified', 'rejected') and reviewed_by is not null and reviewed_at is not null)
    or (status not in ('verified', 'rejected') and reviewed_by is null and reviewed_at is null)
  )
);

create index project_representation_evidence_session_idx
  on public.project_representation_evidence (organization_id, intake_session_id, created_at);
create index project_representation_evidence_submitted_by_fk_idx
  on public.project_representation_evidence (submitted_by);
create index project_representation_evidence_reviewed_by_fk_idx
  on public.project_representation_evidence (reviewed_by);

create trigger project_representation_evidence_set_updated_at
before update on public.project_representation_evidence
for each row execute function private.set_updated_at();
create trigger project_representation_evidence_audit
after insert or update or delete on public.project_representation_evidence
for each row execute function private.capture_audit_event();

alter table public.project_representation_evidence enable row level security;
alter table public.project_representation_evidence force row level security;

create policy project_representation_evidence_select
on public.project_representation_evidence
for select
to authenticated
using ((select private.can_access_intake_session(organization_id, intake_session_id)));

revoke all on public.project_representation_evidence from public, anon, authenticated;
grant select on public.project_representation_evidence to authenticated;
grant select, insert, update on public.project_representation_evidence to service_role;


create function private.accept_private_workspace_terms(
  p_locale text,
  p_signatory_name text,
  p_signatory_title text,
  p_authority_declared boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  target_organization_id uuid;
  legal_document public.platform_legal_documents;
  acceptance_id uuid;
begin
  if caller_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if p_locale not in ('pt-BR', 'en-US')
    or char_length(trim(coalesce(p_signatory_name, ''))) not between 2 and 160
    or (nullif(trim(coalesce(p_signatory_title, '')), '') is not null
      and char_length(trim(p_signatory_title)) not between 2 and 160)
    or not coalesce(p_authority_declared, false) then
    raise exception 'invalid_private_workspace_acceptance' using errcode = '22023';
  end if;

  select progress.organization_id into target_organization_id
  from public.onboarding_progress progress
  join public.organization_memberships membership
    on membership.organization_id = progress.organization_id
   and membership.user_id = caller_id
   and membership.status = 'active'
  where progress.user_id = caller_id
    and progress.completed_at is null
    and progress.journey in ('company', 'originator')
  order by progress.updated_at desc
  limit 1;
  if target_organization_id is null then
    raise exception 'onboarding_progress_not_found' using errcode = 'P0002';
  end if;

  select document.* into legal_document
  from public.platform_legal_documents document
  where document.document_key = 'private_workspace_terms'
    and document.locale = p_locale
    and document.status = 'active'
    and document.effective_at <= now()
  order by document.effective_at desc
  limit 1;
  if not found then
    raise exception 'active_private_workspace_terms_not_found' using errcode = 'P0002';
  end if;

  select acceptance.id into acceptance_id
  from public.organization_legal_acceptances acceptance
  where acceptance.organization_id = target_organization_id
    and acceptance.document_key = legal_document.document_key
    and acceptance.document_version = legal_document.version;

  if acceptance_id is not null then
    return acceptance_id;
  end if;

  insert into public.organization_legal_acceptances (
    organization_id, legal_document_id, document_key, document_version, document_hash,
    accepted_by, signatory_name, signatory_title, authority_declared, locale
  ) values (
    target_organization_id, legal_document.id, legal_document.document_key, legal_document.version,
    legal_document.document_hash, caller_id, trim(p_signatory_name),
    nullif(trim(coalesce(p_signatory_title, '')), ''), true, p_locale
  )
  returning id into acceptance_id;

  return acceptance_id;
end;
$$;

create function public.accept_private_workspace_terms(
  p_locale text,
  p_signatory_name text,
  p_signatory_title text,
  p_authority_declared boolean
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.accept_private_workspace_terms(
    p_locale, p_signatory_name, p_signatory_title, p_authority_declared
  );
$$;

revoke all on function private.accept_private_workspace_terms(text, text, text, boolean)
  from public, anon, authenticated;
revoke all on function public.accept_private_workspace_terms(text, text, text, boolean)
  from public, anon, authenticated;
grant execute on function private.accept_private_workspace_terms(text, text, text, boolean) to authenticated;
grant execute on function public.accept_private_workspace_terms(text, text, text, boolean) to authenticated;

-- Replace the one-argument command. Project identity and representation are now
-- required before a guided intake can be created or resumed.
drop function public.start_onboarding_intake(text);
drop function private.start_onboarding_intake(text);

create function private.start_onboarding_intake(
  p_locale text,
  p_project_name text,
  p_identity_policy text,
  p_representation_declared boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  progress_row public.onboarding_progress;
  session_id uuid;
  normalized_project_name text := trim(regexp_replace(coalesce(p_project_name, ''), '\s+', ' ', 'g'));
  representation_kind text;
begin
  if caller_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if p_locale not in ('pt-BR', 'en-US')
    or char_length(normalized_project_name) not between 2 and 80
    or p_identity_policy not in ('identified_restricted', 'blind_initial')
    or not coalesce(p_representation_declared, false) then
    raise exception 'invalid_private_project_setup' using errcode = '22023';
  end if;

  select progress.* into progress_row
  from public.onboarding_progress progress
  join public.organization_memberships membership
    on membership.organization_id = progress.organization_id
   and membership.user_id = progress.user_id
  join public.organizations organization
    on organization.id = progress.organization_id
  where progress.user_id = caller_id
    and progress.completed_at is null
    and progress.journey in ('company', 'originator')
    and membership.status = 'active'
    and organization.organization_type in ('company', 'originator')
  order by progress.updated_at desc
  limit 1
  for update of progress;
  if not found then
    raise exception 'onboarding_progress_not_found' using errcode = 'P0002';
  end if;

  if not exists (
    select 1
    from public.organization_legal_acceptances acceptance
    join public.platform_legal_documents document on document.id = acceptance.legal_document_id
    where acceptance.organization_id = progress_row.organization_id
      and acceptance.document_key = 'private_workspace_terms'
      and document.status = 'active'
      and acceptance.document_version = document.version
      and acceptance.document_hash = document.document_hash
  ) then
    raise exception 'private_workspace_terms_required' using errcode = '42501';
  end if;

  if coalesce(progress_row.answers ->> 'intake_session_id', '') <> '' then
    select session.id into session_id
    from public.document_intake_sessions session
    where session.organization_id = progress_row.organization_id
      and session.id = (progress_row.answers ->> 'intake_session_id')::uuid
      and session.started_by = caller_id
      and session.status not in ('cancelled', 'confirmed')
    limit 1;
    if session_id is not null then
      return session_id;
    end if;
  end if;

  representation_kind := case progress_row.journey when 'originator' then 'advisor' else 'company' end;

  insert into public.document_intake_sessions (
    organization_id, started_by, journey, locale, project_name, identity_policy,
    privacy_status, representation_kind, representation_status
  ) values (
    progress_row.organization_id, caller_id, progress_row.journey, p_locale,
    normalized_project_name, p_identity_policy, 'private', representation_kind, 'declared'
  ) returning id into session_id;

  insert into public.project_representation_evidence (
    organization_id, intake_session_id, representation_kind, evidence_type,
    statement, status, submitted_by
  ) values (
    progress_row.organization_id, session_id, representation_kind, 'self_declaration',
    case representation_kind
      when 'advisor' then 'The user declares that they are authorized to prepare this project on behalf of the company.'
      else 'The user declares that they represent the company and are authorized to prepare this project.'
    end,
    'declared', caller_id
  );

  update public.onboarding_progress progress
  set current_step = 'organization',
      answers = coalesce(progress.answers, '{}'::jsonb)
        || jsonb_build_object(
          'intake_mode', 'documents',
          'intake_session_id', session_id,
          'guided_milestone', 'company',
          'project_name', normalized_project_name,
          'identity_policy', p_identity_policy
        ),
      updated_at = now()
  where progress.organization_id = progress_row.organization_id
    and progress.user_id = caller_id
    and progress.journey = progress_row.journey;

  return session_id;
exception
  when unique_violation then
    raise exception 'project_name_already_in_use' using errcode = '23505';
end;
$$;

create function public.start_onboarding_intake(
  p_locale text,
  p_project_name text,
  p_identity_policy text,
  p_representation_declared boolean
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.start_onboarding_intake(
    p_locale, p_project_name, p_identity_policy, p_representation_declared
  );
$$;

revoke all on function private.start_onboarding_intake(text, text, text, boolean)
  from public, anon, authenticated;
revoke all on function public.start_onboarding_intake(text, text, text, boolean)
  from public, anon, authenticated;
grant execute on function private.start_onboarding_intake(text, text, text, boolean) to authenticated;
grant execute on function public.start_onboarding_intake(text, text, text, boolean) to authenticated;

comment on function public.start_onboarding_intake(text, text, text, boolean) is
  'Creates a named private project only after the organization terms acceptance and a representation declaration.';

create function private.verify_project_representation(
  p_organization_id uuid,
  p_session_id uuid,
  p_evidence_id uuid,
  p_reviewer_id uuid,
  p_review_note text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare evidence public.project_representation_evidence;
begin
  if p_reviewer_id is null or char_length(trim(coalesce(p_review_note, ''))) < 2 then
    raise exception 'representation_review_details_required' using errcode = '22023';
  end if;
  select row.* into evidence
  from public.project_representation_evidence row
  where row.organization_id = p_organization_id
    and row.intake_session_id = p_session_id
    and row.id = p_evidence_id
  for update;
  if not found then
    raise exception 'representation_evidence_not_found' using errcode = 'P0002';
  end if;

  update public.project_representation_evidence
  set status = 'verified', reviewed_by = p_reviewer_id, reviewed_at = now(), review_note = trim(p_review_note)
  where organization_id = p_organization_id and id = p_evidence_id;

  update public.document_intake_sessions
  set representation_status = 'verified', representation_verified_by = p_reviewer_id,
      representation_verified_at = now(), updated_at = now()
  where organization_id = p_organization_id and id = p_session_id;
end;
$$;

revoke all on function private.verify_project_representation(uuid, uuid, uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function private.verify_project_representation(uuid, uuid, uuid, uuid, text) to service_role;

alter table public.qualified_introduction_plans
  add column identity_policy text not null default 'identified_restricted'
    check (identity_policy in ('identified_restricted', 'blind_initial'));

create or replace function private.authorize_qualified_introduction_plan(
  p_plan_id uuid,
  p_material_fingerprint text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  plan public.qualified_introduction_plans;
  session_row public.document_intake_sessions;
  recipient_count integer;
begin
  select * into plan from public.qualified_introduction_plans row where row.id = p_plan_id for update;
  if not found then raise exception 'qualified_introduction_plan_not_found' using errcode = 'P0002'; end if;
  if not (select private.can_access_intake_session(plan.organization_id, plan.intake_session_id)) then
    raise exception 'qualified_introduction_plan_forbidden' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.organization_memberships membership
    where membership.organization_id = plan.organization_id
      and membership.user_id = (select auth.uid())
      and membership.status = 'active'
      and membership.role in ('owner', 'admin')
  ) then raise exception 'qualified_introduction_authorizer_role_required' using errcode = '42501'; end if;

  select * into session_row
  from public.document_intake_sessions session
  where session.organization_id = plan.organization_id and session.id = plan.intake_session_id
  for update;
  if session_row.representation_status <> 'verified' then
    raise exception 'verified_representation_required' using errcode = '42501';
  end if;
  if session_row.identity_policy is distinct from plan.identity_policy then
    raise exception 'qualified_introduction_identity_policy_changed' using errcode = '22023';
  end if;
  if plan.status <> 'draft' then raise exception 'draft_qualified_introduction_plan_required' using errcode = '22023'; end if;
  if p_material_fingerprint is distinct from plan.material_fingerprint then
    raise exception 'qualified_introduction_material_fingerprint_changed' using errcode = '22023';
  end if;
  if plan.technical_reviewed_by is null
    or plan.technical_reviewed_at is null
    or plan.technical_review_fingerprint is distinct from plan.material_fingerprint then
    raise exception 'qualified_introduction_technical_review_required' using errcode = '22023';
  end if;
  select count(*) into recipient_count from public.qualified_introduction_recipients recipient
  where recipient.organization_id = plan.organization_id and recipient.plan_id = plan.id;
  if recipient_count = 0 or recipient_count > plan.wave_limit then
    raise exception 'qualified_introduction_wave_invalid' using errcode = '22023';
  end if;

  update public.qualified_introduction_plans
  set status = 'authorized', authorized_by = (select auth.uid()), authorized_at = now()
  where id = plan.id;
  update public.document_intake_sessions
  set privacy_status = 'distribution_authorized', updated_at = now()
  where organization_id = plan.organization_id and id = plan.intake_session_id;
  return plan.id;
end;
$$;

comment on table public.organization_legal_acceptances is
  'Append-only exact-version acceptance ledger for organization legal documents.';
comment on table public.project_representation_evidence is
  'Evidence and review trail for company or advisor authority. Declaration enables private preparation; verification gates distribution.';
comment on column public.document_intake_sessions.identity_policy is
  'How the company is identified during the initial authorized distribution.';
comment on column public.document_intake_sessions.privacy_status is
  'Private until an exact qualified-introduction plan is authorized.';


create function private.enforce_qualified_introduction_release()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  plan public.qualified_introduction_plans;
  session_row public.document_intake_sessions;
  recipient public.qualified_introduction_recipients;
begin
  select * into plan
  from public.qualified_introduction_plans row
  where row.organization_id = new.organization_id and row.id = new.plan_id;
  select * into session_row
  from public.document_intake_sessions row
  where row.organization_id = new.organization_id and row.id = new.intake_session_id;
  select * into recipient
  from public.qualified_introduction_recipients row
  where row.organization_id = new.organization_id and row.id = new.recipient_id;

  if plan.id is null
    or plan.status <> 'authorized'
    or plan.intake_session_id <> new.intake_session_id
    or plan.case_fingerprint <> new.case_fingerprint
    or plan.material_fingerprint <> new.material_fingerprint
    or plan.identity_policy <> session_row.identity_policy
    or session_row.representation_status <> 'verified'
    or session_row.privacy_status <> 'distribution_authorized'
    or recipient.id is null
    or recipient.plan_id <> plan.id
    or recipient.fund_directory_id <> new.fund_directory_id
    or recipient.contact_id <> new.contact_id
    or recipient.mandate_fingerprint <> new.mandate_fingerprint
    or coalesce(new.authorization_snapshot ->> 'identityPolicy', '') <> plan.identity_policy
  then
    raise exception 'qualified_introduction_release_gate_failed' using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger qualified_introductions_release_gate
before insert on public.qualified_introductions
for each row execute function private.enforce_qualified_introduction_release();

revoke all on function private.enforce_qualified_introduction_release() from public, anon, authenticated;

create or replace function private.revoke_qualified_introduction_plan(p_plan_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare plan public.qualified_introduction_plans;
begin
  select * into plan from public.qualified_introduction_plans row where row.id = p_plan_id for update;
  if not found then raise exception 'qualified_introduction_plan_not_found' using errcode = 'P0002'; end if;
  if not (select private.can_access_intake_session(plan.organization_id, plan.intake_session_id)) then
    raise exception 'qualified_introduction_plan_forbidden' using errcode = '42501';
  end if;
  if plan.status <> 'authorized' or exists (
    select 1 from public.qualified_introductions introduction
    where introduction.organization_id = plan.organization_id and introduction.plan_id = plan.id
  ) then raise exception 'qualified_introduction_plan_cannot_be_revoked' using errcode = '22023'; end if;

  update public.qualified_introduction_plans
  set status = 'revoked', authorized_by = null, authorized_at = null,
      revoked_by = (select auth.uid()), revoked_at = now()
  where id = plan.id;
  update public.document_intake_sessions
  set privacy_status = 'private', updated_at = now()
  where organization_id = plan.organization_id and id = plan.intake_session_id;
  return plan.id;
end;
$$;
