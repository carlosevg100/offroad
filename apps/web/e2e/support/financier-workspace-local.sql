-- Local Playwright setup only. It writes the rows the product cannot create today, because
-- signup always registers a company organization (`defaultRegistrationJourney`) and there is no
-- product path that turns a workspace into a capital_provider one. No policy, grant, check
-- constraint or trigger is disabled here, and every authorization the journey needs is still
-- decided by the database when the browser and the RPC calls run.
--
-- Modes: `workspace` converts the synthetic account into a financier workspace and returns its
-- organization id; `other_tenant` gives a second synthetic account its own financier tenant;
-- `information_request` opens one gap inside a project so the answer and the stale answer can be
-- exercised; `revoke` revokes the membership of the synthetic account.
begin;
select set_config('e2e.financier_mode', :'mode', true);
select set_config('e2e.financier_email', :'email', true);
select set_config('e2e.financier_project', :'project', true);

do $$
declare
  mode text := current_setting('e2e.financier_mode');
  target_email text := current_setting('e2e.financier_email');
  actor uuid;
  org uuid;
  request_id uuid;
begin
  if target_email not like 'e2e-financier-%@example.com' then
    raise exception 'Synthetic E2E account required';
  end if;
  select id into strict actor from auth.users where email = target_email;

  if mode = 'workspace' then
    select id into strict org from public.organizations where created_by = actor;
    update public.organizations
    set organization_type = 'capital_provider', name = 'Gestora sintética de crédito', updated_at = now()
    where id = org;
    update public.onboarding_progress
    set journey = 'capital_provider',
        current_step = 'organization',
        answers = '{}'::jsonb,
        completed_at = null,
        updated_at = now()
    where organization_id = org and user_id = actor;
    perform set_config('e2e.financier_result', org::text, true);

  elsif mode = 'other_tenant' then
    update auth.users set email_confirmed_at = coalesce(email_confirmed_at, now()) where id = actor;
    insert into public.organizations (organization_type, name, country_code, created_by)
    values ('capital_provider', 'Outro fundo sintético', 'BR', actor)
    returning id into org;
    insert into public.organization_memberships (organization_id, user_id, role, status, joined_at)
    values (org, actor, 'owner', 'active', now());
    perform set_config('e2e.financier_result', org::text, true);

  elsif mode = 'information_request' then
    select id into strict org from public.organizations where created_by = actor;
    insert into public.capital_project_information_requests (
      organization_id, capital_project_id, requirement_key, question, why_it_matters,
      decision_impact, acceptable_evidence, answer_kind, priority,
      information_gain, materiality, answerability, status
    ) values (
      org, current_setting('e2e.financier_project')::uuid, 'financier.committee_date',
      'Qual é a data do comitê que vai receber esta leitura?',
      'A data do comitê define o que precisa estar pronto e o que fica registrado como pendência.',
      'Sem a data, a ordem das verificações fica sem prioridade.',
      array['Mensagem da equipe'], 'text', 'high_value', 0.5, 0.5, 0.9, 'open'
    ) returning id into request_id;
    perform set_config('e2e.financier_result', request_id::text, true);

  elsif mode = 'revoke' then
    select id into strict org from public.organizations where created_by = actor;
    update public.organization_memberships
    set status = 'revoked'
    where organization_id = org and user_id = actor;
    perform set_config('e2e.financier_result', org::text, true);

  else
    raise exception 'unknown financier setup mode %', mode;
  end if;
end $$;

select current_setting('e2e.financier_result', true);
commit;
