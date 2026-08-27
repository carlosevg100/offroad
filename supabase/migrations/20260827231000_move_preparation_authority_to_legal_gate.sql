-- The authority declaration belongs to the private-work legal gate, not to project naming.
-- V4 makes that declaration explicit, preserves the narrower distribution boundary and forces a
-- fresh acceptance because the displayed clickwrap has materially changed.

update public.platform_legal_documents
set status = 'superseded'
where document_key = 'private_workspace_terms'
  and status = 'active';

insert into public.platform_legal_documents (
  document_key,
  version,
  locale,
  title,
  rendered_text,
  body_sections,
  acceptance_statement,
  information_rights_statement,
  status,
  effective_at
)
select
  document_key,
  '2026-08-27-v4',
  locale,
  title,
  case locale
    when 'pt-BR' then replace(
      replace(rendered_text, 'Versão 2026-08-27-v3', 'Versão 2026-08-27-v4'),
      '5.1. O usuário confirma que pode disponibilizar as informações enviadas para a análise privada descrita neste Termo e que não utilizará a plataforma para informações obtidas de forma ilícita ou em violação de obrigação de confidencialidade conhecida.',
      '5.1. O usuário confirma que está autorizado a iniciar esta preparação privada em nome da companhia e a disponibilizar as informações enviadas para a análise descrita neste Termo. O usuário não utilizará a plataforma para informações obtidas de forma ilícita ou em violação de obrigação de confidencialidade conhecida.'
    )
    else replace(
      replace(rendered_text, 'Version 2026-08-27-v3', 'Version 2026-08-27-v4'),
      '5.1. The user confirms that they may provide the submitted information for the private analysis described in these Terms and will not use the platform for information obtained unlawfully or in breach of a known confidentiality obligation.',
      '5.1. The user confirms that they are authorized to begin this private preparation on behalf of the company and to provide the submitted information for the analysis described in these Terms. The user will not use the platform for information obtained unlawfully or in breach of a known confidentiality obligation.'
    )
  end,
  body_sections,
  case locale
    when 'pt-BR' then 'Li e concordo com o Termo de Confidencialidade e Autorização de Trabalho Preliminar, versão 2026-08-27-v4.'
    else 'I have read and agree to the Confidentiality and Preliminary Work Authorization Terms, version 2026-08-27-v4.'
  end,
  case locale
    when 'pt-BR' then 'Confirmo que estou autorizado a iniciar esta preparação em nome da companhia e a disponibilizar as informações para esta análise privada.'
    else 'I confirm that I am authorized to begin this preparation on behalf of the company and to provide the information for this private analysis.'
  end,
  'active',
  now()
from public.platform_legal_documents
where document_key = 'private_workspace_terms'
  and version = '2026-08-27-v3';

create or replace function private.accept_private_workspace_terms(
  p_locale text,
  p_signatory_name text,
  p_signatory_title text,
  p_terms_agreed boolean,
  p_information_rights_declared boolean
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
  request_headers jsonb := coalesce(
    nullif(current_setting('request.headers', true), ''),
    '{}'
  )::jsonb;
  client_ip inet;
  user_agent text := left(nullif(request_headers ->> 'user-agent', ''), 1000);
  raw_client_ip text := nullif(
    trim(split_part(coalesce(request_headers ->> 'x-forwarded-for', ''), ',', 1)),
    ''
  );
begin
  if caller_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if p_locale not in ('pt-BR', 'en-US')
    or char_length(trim(coalesce(p_signatory_name, ''))) not between 2 and 160
    or (nullif(trim(coalesce(p_signatory_title, '')), '') is not null
      and char_length(trim(p_signatory_title)) not between 2 and 160)
    or not coalesce(p_terms_agreed, false)
    or not coalesce(p_information_rights_declared, false) then
    raise exception 'invalid_private_workspace_acceptance' using errcode = '22023';
  end if;

  begin
    if raw_client_ip is not null then
      client_ip := raw_client_ip::inet;
    end if;
  exception when invalid_text_representation then
    client_ip := null;
  end;

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
    organization_id,
    legal_document_id,
    document_key,
    document_version,
    document_hash,
    accepted_by,
    signatory_name,
    signatory_title,
    authority_declared,
    information_rights_declared,
    terms_agreed,
    acceptance_statement,
    information_rights_statement,
    acceptance_method,
    accepted_ip,
    accepted_user_agent,
    locale
  ) values (
    target_organization_id,
    legal_document.id,
    legal_document.document_key,
    legal_document.version,
    legal_document.document_hash,
    caller_id,
    trim(p_signatory_name),
    nullif(trim(coalesce(p_signatory_title, '')), ''),
    true,
    true,
    true,
    legal_document.acceptance_statement,
    legal_document.information_rights_statement,
    'clickwrap',
    client_ip,
    user_agent,
    p_locale
  )
  returning id into acceptance_id;

  return acceptance_id;
end;
$$;

comment on column public.organization_legal_acceptances.authority_declared is
  'True when the user explicitly declared authority to begin private preparation on behalf of the company. This is not verification of authority for external distribution.';

