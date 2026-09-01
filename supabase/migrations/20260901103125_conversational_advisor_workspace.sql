-- Make the durable capital project, not a wizard page, the entry point for advisory work.
-- The existing intake session remains the evidence/document scope and the existing agent
-- conversation remains the project transcript. This migration only adds governed commands that
-- create and continue both in one transaction; it does not introduce a parallel memory model.

create or replace function private.start_advisor_project_v1(
  p_request_id uuid,
  p_locale text,
  p_project_name text,
  p_entry_job text,
  p_prompt text,
  p_access_basis text,
  p_plan jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  target_organization_id uuid;
  organization_type text;
  normalized_name text := trim(regexp_replace(coalesce(p_project_name, ''), '\s+', ' ', 'g'));
  normalized_prompt text := trim(coalesce(p_prompt, ''));
  project_id uuid;
  session_id uuid;
  conversation_id uuid;
  assistant_message_id uuid := gen_random_uuid();
  assistant_copy text;
  existing_message public.agent_messages;
begin
  if caller_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  select message.* into existing_message
  from public.agent_messages message
  where message.id = p_request_id
    and message.created_by = caller_id;
  if found then
    select session.capital_project_id into project_id
    from public.document_intake_sessions session
    where session.organization_id = existing_message.organization_id
      and session.id = existing_message.intake_session_id;
    return jsonb_build_object(
      'capital_project_id', project_id,
      'intake_session_id', existing_message.intake_session_id,
      'conversation_id', existing_message.conversation_id,
      'message_id', existing_message.id,
      'replayed', true
    );
  end if;

  if p_request_id is null
    or p_locale not in ('pt-BR', 'en-US')
    or char_length(normalized_name) not between 2 and 80
    or char_length(normalized_prompt) not between 2 and 8000
    or p_entry_job not in (
      'company_debt_view', 'origination_thesis', 'capital_planning',
      'structure_from_documents', 'review_existing_operation'
    )
    or p_access_basis not in ('public_information', 'authorized_private')
    or coalesce(jsonb_typeof(p_plan), 'null') <> 'object'
    or p_plan #>> '{job,id}' <> p_entry_job then
    raise exception 'invalid_advisor_project' using errcode = '22023';
  end if;

  select organization.id, organization.organization_type
  into target_organization_id, organization_type
  from public.organizations organization
  join public.organization_memberships membership
    on membership.organization_id = organization.id
  where membership.user_id = caller_id
    and membership.status = 'active'
    and organization.organization_type in ('company', 'originator')
  order by membership.created_at asc
  limit 1;
  if not found then
    raise exception 'workspace_membership_not_found' using errcode = 'P0002';
  end if;

  -- Private-document work relies on the one organization-level confidentiality acceptance.
  -- It deliberately does not assert authority to represent the company before investors.
  if p_access_basis = 'authorized_private' and not exists (
    select 1
    from public.organization_legal_acceptances acceptance
    join public.platform_legal_documents document
      on document.id = acceptance.legal_document_id
    where acceptance.organization_id = target_organization_id
      and acceptance.document_key = 'private_workspace_terms'
      and acceptance.document_version = document.version
      and acceptance.document_hash = document.document_hash
      and document.status = 'active'
  ) then
    raise exception 'private_workspace_terms_required' using errcode = '42501';
  end if;

  insert into public.capital_projects (
    organization_id, project_name, entry_job, access_basis,
    status, current_phase, created_by
  ) values (
    target_organization_id, normalized_name, p_entry_job, p_access_basis,
    'active', 'understand', caller_id
  ) returning id into project_id;

  insert into public.document_intake_sessions (
    organization_id, capital_project_id, started_by, journey, locale,
    project_name, identity_policy, privacy_status,
    representation_kind, representation_status, company_profile
  ) values (
    target_organization_id, project_id, caller_id, organization_type, p_locale,
    normalized_name, 'identified_restricted',
    case when p_access_basis = 'authorized_private' then 'private' else 'public_information' end,
    null, 'not_claimed', '{}'::jsonb
  ) returning id into session_id;

  perform private.record_capital_project_plan(project_id, p_plan);

  insert into public.agent_conversations (
    organization_id, intake_session_id, state, created_by
  ) values (
    target_organization_id, session_id, 'asking', caller_id
  ) returning id into conversation_id;

  insert into public.agent_messages (
    id, organization_id, conversation_id, intake_session_id, role, status,
    content, locale, metadata, created_by
  ) values (
    p_request_id, target_organization_id, conversation_id, session_id,
    'user', 'completed', normalized_prompt, p_locale,
    jsonb_build_object('kind', 'request', 'entryJob', p_entry_job), caller_id
  );

  assistant_copy := case p_locale
    when 'en-US' then
      'Understood. This project will keep the company, evidence, decisions and materials in one context. Add any documents you already have or continue describing the assignment. I will first confirm the company and scope, then show the work plan and the information still needed.'
    else
      'Entendi. Este projeto manterá companhia, evidências, decisões e materiais no mesmo contexto. Anexe o que já tiver ou continue descrevendo o trabalho. Primeiro vou confirmar a companhia e o escopo; depois mostro o plano e o que ainda será necessário.'
  end;

  insert into public.agent_messages (
    id, organization_id, conversation_id, intake_session_id, role, status,
    content, locale, reply_to_message_id, metadata, created_by
  ) values (
    assistant_message_id, target_organization_id, conversation_id, session_id,
    'assistant', 'completed', assistant_copy, p_locale, p_request_id,
    jsonb_build_object('kind', 'guidance', 'nextAction', 'add_context'), caller_id
  );

  return jsonb_build_object(
    'capital_project_id', project_id,
    'intake_session_id', session_id,
    'conversation_id', conversation_id,
    'message_id', p_request_id,
    'replayed', false
  );
exception
  when unique_violation then
    raise exception 'project_name_already_in_use' using errcode = '23505';
end;
$$;

create or replace function public.start_advisor_project_v1(
  p_request_id uuid,
  p_locale text,
  p_project_name text,
  p_entry_job text,
  p_prompt text,
  p_access_basis text,
  p_plan jsonb
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.start_advisor_project_v1(
    p_request_id, p_locale, p_project_name, p_entry_job,
    p_prompt, p_access_basis, p_plan
  );
$$;

revoke all on function private.start_advisor_project_v1(uuid, text, text, text, text, text, jsonb)
  from public, anon, authenticated;
revoke all on function public.start_advisor_project_v1(uuid, text, text, text, text, text, jsonb)
  from public, anon;
grant execute on function private.start_advisor_project_v1(uuid, text, text, text, text, text, jsonb)
  to authenticated;
grant execute on function public.start_advisor_project_v1(uuid, text, text, text, text, text, jsonb)
  to authenticated;

create or replace function private.append_advisor_message_v1(
  p_project_id uuid,
  p_message_id uuid,
  p_locale text,
  p_content text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  project_row public.capital_projects;
  session_row public.document_intake_sessions;
  conversation_row public.agent_conversations;
  existing_message public.agent_messages;
  assistant_message_id uuid := gen_random_uuid();
  normalized_content text := trim(coalesce(p_content, ''));
  document_count integer;
  assistant_copy text;
begin
  if caller_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  select message.* into existing_message
  from public.agent_messages message
  where message.id = p_message_id
    and message.created_by = caller_id;
  if found then
    return jsonb_build_object(
      'message_id', existing_message.id,
      'conversation_id', existing_message.conversation_id,
      'replayed', true
    );
  end if;

  if p_message_id is null
    or p_locale not in ('pt-BR', 'en-US')
    or char_length(normalized_content) not between 1 and 8000 then
    raise exception 'invalid_advisor_message' using errcode = '22023';
  end if;

  select project.* into project_row
  from public.capital_projects project
  join public.organization_memberships membership
    on membership.organization_id = project.organization_id
  where project.id = p_project_id
    and membership.user_id = caller_id
    and membership.status = 'active'
    and project.status <> 'archived'
  for update of project;
  if not found then
    raise exception 'capital_project_not_found' using errcode = 'P0002';
  end if;

  select session.* into strict session_row
  from public.document_intake_sessions session
  where session.organization_id = project_row.organization_id
    and session.capital_project_id = project_row.id
  order by session.created_at asc
  limit 1;

  select conversation.* into conversation_row
  from public.agent_conversations conversation
  where conversation.organization_id = project_row.organization_id
    and conversation.intake_session_id = session_row.id
  for update;
  if not found then
    insert into public.agent_conversations (
      organization_id, intake_session_id, state, created_by
    ) values (
      project_row.organization_id, session_row.id, 'asking', caller_id
    ) returning * into conversation_row;
  end if;

  insert into public.agent_messages (
    id, organization_id, conversation_id, intake_session_id, role, status,
    content, locale, metadata, created_by
  ) values (
    p_message_id, project_row.organization_id, conversation_row.id, session_row.id,
    'user', 'completed', normalized_content, p_locale,
    jsonb_build_object('kind', 'message'), caller_id
  );

  select count(*) into document_count
  from public.source_documents document
  where document.organization_id = project_row.organization_id
    and document.intake_session_id = session_row.id;

  assistant_copy := case
    when session_row.status = 'processing' and p_locale = 'en-US' then
      'Received. The document and evidence checks are already running. I kept your note in the same project context and will use it in the next project update.'
    when session_row.status = 'processing' then
      'Recebi. A leitura e a verificação das evidências já estão em andamento. Mantive sua observação no contexto deste projeto e ela será considerada na próxima devolutiva.'
    when document_count > 0 and p_locale = 'en-US' then
      'Received. The documents are attached to this project. I will use your note with those sources when the analysis starts; you can add more material without restarting the work.'
    when document_count > 0 then
      'Recebi. Os documentos estão vinculados a este projeto. Vou considerar sua observação junto com essas fontes quando a análise começar; você pode complementar o material sem reiniciar o trabalho.'
    when p_locale = 'en-US' then
      'Received. If you already have documents, use the + button to attach them here. Otherwise, continue with the company, the capital need or the transaction you want to examine.'
    else
      'Recebi. Se já houver documentos, use o botão + para anexá-los aqui. Se não houver, continue com a companhia, a necessidade de capital ou a operação que deseja examinar.'
  end;

  insert into public.agent_messages (
    id, organization_id, conversation_id, intake_session_id, role, status,
    content, locale, reply_to_message_id, metadata, created_by
  ) values (
    assistant_message_id, project_row.organization_id, conversation_row.id, session_row.id,
    'assistant', 'completed', assistant_copy, p_locale, p_message_id,
    jsonb_build_object('kind', 'guidance'), caller_id
  );

  update public.agent_conversations
  set state = case when session_row.status = 'processing' then 'analyzing' else 'asking' end,
      updated_at = now()
  where organization_id = project_row.organization_id
    and id = conversation_row.id;
  update public.capital_projects
  set updated_at = now()
  where organization_id = project_row.organization_id
    and id = project_row.id;

  return jsonb_build_object(
    'message_id', p_message_id,
    'assistant_message_id', assistant_message_id,
    'conversation_id', conversation_row.id,
    'replayed', false
  );
end;
$$;

create or replace function public.append_advisor_message_v1(
  p_project_id uuid,
  p_message_id uuid,
  p_locale text,
  p_content text
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.append_advisor_message_v1(p_project_id, p_message_id, p_locale, p_content);
$$;

revoke all on function private.append_advisor_message_v1(uuid, uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.append_advisor_message_v1(uuid, uuid, text, text)
  from public, anon;
grant execute on function private.append_advisor_message_v1(uuid, uuid, text, text)
  to authenticated;
grant execute on function public.append_advisor_message_v1(uuid, uuid, text, text)
  to authenticated;

-- Preparing a private case requires legitimate information rights under the workspace terms,
-- but it is not a representation claim. Representation is collected later by the exact
-- introduction-release gate, tied to the project, materials and recipients being authorized.
create or replace function private.authorize_capital_project_private_work(
  p_project_id uuid,
  p_information_rights_declared boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  project_row public.capital_projects;
begin
  if caller_id is null or not coalesce(p_information_rights_declared, false) then
    raise exception 'private_work_authorization_required' using errcode = '42501';
  end if;

  select project.* into project_row
  from public.capital_projects project
  join public.organization_memberships membership
    on membership.organization_id = project.organization_id
  where project.id = p_project_id
    and membership.user_id = caller_id
    and membership.status = 'active'
    and project.status <> 'archived'
  for update of project;
  if not found then
    raise exception 'capital_project_not_found' using errcode = 'P0002';
  end if;
  if project_row.access_basis = 'authorized_private' then return project_row.id; end if;

  if not exists (
    select 1
    from public.organization_legal_acceptances acceptance
    join public.platform_legal_documents document on document.id = acceptance.legal_document_id
    where acceptance.organization_id = project_row.organization_id
      and acceptance.document_key = 'private_workspace_terms'
      and acceptance.document_version = document.version
      and acceptance.document_hash = document.document_hash
      and document.status = 'active'
  ) then
    raise exception 'private_workspace_terms_required' using errcode = '42501';
  end if;

  update public.capital_projects project
  set access_basis = 'authorized_private',
      private_access_granted_at = now(),
      private_access_granted_by = caller_id,
      updated_at = now()
  where project.organization_id = project_row.organization_id
    and project.id = project_row.id;

  update public.document_intake_sessions session
  set privacy_status = 'private',
      updated_at = now()
  where session.organization_id = project_row.organization_id
    and session.capital_project_id = project_row.id;

  return project_row.id;
end;
$$;

comment on function public.start_advisor_project_v1(uuid, text, text, text, text, text, jsonb) is
  'Creates one durable conversational capital project, backing evidence session, immutable plan and first transcript atomically.';
comment on function public.append_advisor_message_v1(uuid, uuid, text, text) is
  'Appends a user turn and bounded guidance to the durable project conversation without mutating evidence or authorizing distribution.';
comment on function public.authorize_capital_project_private_work(uuid, boolean) is
  'Promotes a public-information project to private preparation after the one-time workspace terms; it does not assert representation authority.';
