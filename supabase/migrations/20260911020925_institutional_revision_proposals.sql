-- An edited product workbook becomes a proposed change, never an applied one.
--
-- The v2 workbook is editable on purpose: somebody opens it, moves an assumption and watches the
-- coverage move. That argument had nowhere to go. This is the way back in, and it is deliberately
-- the long way round: the upload produces a proposal with the exact approved and proposed values,
-- the preparer submits it, and only an approver turns it into an assumption change. The approval
-- then runs through the configuration review that every other assumption change runs through, so
-- the recompute, the canonical revision and the supersession of the previous output are the ones
-- that already exist.
--
-- What the record keeps is what a reviewer needs to trust the file: which approved revision it was
-- produced from, the fingerprint of the artifact behind it, the fingerprint of every cell that did
-- not move, and the fingerprint of the bytes themselves so the same file is never reviewed twice.
-- The verification that produced those fingerprints is deterministic and lives in
-- packages/financial-model; this layer refuses anything that no longer matches the current state.

create table private.institutional_revision_proposals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  capital_project_id uuid not null,
  canonical_revision_id uuid not null,
  configuration_id uuid not null,
  configuration_fingerprint text not null check (configuration_fingerprint ~ '^[a-f0-9]{64}$'),
  artifact_fingerprint text not null check (artifact_fingerprint ~ '^[a-f0-9]{64}$'),
  structure_fingerprint text not null check (structure_fingerprint ~ '^[a-f0-9]{64}$'),
  upload_fingerprint text not null check (upload_fingerprint ~ '^[a-f0-9]{64}$'),
  origin text not null default 'imported_workbook' check (origin in ('imported_workbook')),
  changes jsonb not null check (jsonb_typeof(changes) = 'array' and jsonb_array_length(changes) between 1 and 500),
  status text not null default 'proposed' check (status in ('proposed', 'approved', 'rejected')),
  candidate_configuration_id uuid,
  prepared_by uuid not null references auth.users(id) on delete restrict,
  reviewed_by uuid references auth.users(id) on delete restrict,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, capital_project_id, upload_fingerprint),
  constraint institutional_revision_proposal_review_complete
    check ((status in ('approved', 'rejected')) = (reviewed_at is not null and reviewed_by is not null)),
  constraint institutional_revision_proposal_candidate_on_approval
    check ((status = 'approved') = (candidate_configuration_id is not null)),
  foreign key (organization_id, capital_project_id) references public.capital_projects(organization_id, id) on delete cascade,
  foreign key (organization_id, canonical_revision_id) references private.project_canonical_revisions(organization_id, id),
  foreign key (organization_id, configuration_id) references private.institutional_model_configurations(organization_id, id),
  foreign key (organization_id, candidate_configuration_id) references private.institutional_model_configurations(organization_id, id)
);
alter table private.institutional_revision_proposals enable row level security;
alter table private.institutional_revision_proposals force row level security;
create policy institutional_revision_proposals_no_select on private.institutional_revision_proposals for select to authenticated using (false);
create policy institutional_revision_proposals_no_insert on private.institutional_revision_proposals for insert to authenticated with check (false);
create policy institutional_revision_proposals_no_update on private.institutional_revision_proposals for update to authenticated using (false) with check (false);
create policy institutional_revision_proposals_no_delete on private.institutional_revision_proposals for delete to authenticated using (false);
revoke all on private.institutional_revision_proposals from public, anon, authenticated;
create index institutional_revision_proposals_project_idx on private.institutional_revision_proposals(organization_id, capital_project_id, created_at desc);
create index institutional_revision_proposals_revision_idx on private.institutional_revision_proposals(organization_id, canonical_revision_id);
create index institutional_revision_proposals_configuration_idx on private.institutional_revision_proposals(organization_id, configuration_id);
create index institutional_revision_proposals_candidate_idx on private.institutional_revision_proposals(organization_id, candidate_configuration_id) where candidate_configuration_id is not null;
create index institutional_revision_proposals_preparer_idx on private.institutional_revision_proposals(prepared_by);
create index institutional_revision_proposals_reviewer_idx on private.institutional_revision_proposals(reviewed_by) where reviewed_by is not null;
create trigger institutional_revision_proposals_updated before update on private.institutional_revision_proposals for each row execute function private.set_updated_at();
create trigger institutional_revision_proposals_audit after insert or update or delete on private.institutional_revision_proposals for each row execute function private.capture_audit_event();

-- A proposal is reviewed once and never rewritten afterwards.
create function private.guard_institutional_revision_proposal() returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then raise exception 'institutional_revision_proposal_history_immutable'; end if;
  if old.status <> 'proposed'
     or (to_jsonb(new) - array['status', 'candidate_configuration_id', 'reviewed_by', 'reviewed_at', 'updated_at'])
        is distinct from (to_jsonb(old) - array['status', 'candidate_configuration_id', 'reviewed_by', 'reviewed_at', 'updated_at'])
     or new.status not in ('approved', 'rejected') then
    raise exception 'institutional_revision_proposal_immutable';
  end if;
  return new;
end $$;
create trigger institutional_revision_proposal_immutable before update or delete on private.institutional_revision_proposals
  for each row execute function private.guard_institutional_revision_proposal();
revoke all on function private.guard_institutional_revision_proposal() from public, anon, authenticated;

-- Submit: the file must have been produced from the current canonical revision, from the current
-- approved configuration, and from the result that is current right now. Every proposed change
-- must still say what the approved configuration says today, or the file is already outdated.
create function private.submit_institutional_revision_proposal_v1(p_project_id uuid, p_proposal_id uuid, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare p public.capital_projects; c private.institutional_model_configurations; revision private.project_canonical_revisions;
        r private.institutional_model_results; existing private.institutional_revision_proposals; entry jsonb; index integer;
begin
  select * into p from public.capital_projects where id = p_project_id;
  if p.id is null or not private.can_access_capital_project(p.organization_id, p.id) then
    raise exception 'institutional_revision_proposal_forbidden' using errcode = '42501';
  end if;
  perform private.assert_capital_project_review_action(p.organization_id, p.id, 'prepare');
  perform 1 from public.capital_projects where organization_id = p.organization_id and id = p.id for update;
  if p_proposal_id is null or coalesce(jsonb_typeof(p_payload), 'null') <> 'object'
     or coalesce(p_payload ->> 'configurationFingerprint', '') !~ '^[a-f0-9]{64}$'
     or coalesce(p_payload ->> 'artifactFingerprint', '') !~ '^[a-f0-9]{64}$'
     or coalesce(p_payload ->> 'structureFingerprint', '') !~ '^[a-f0-9]{64}$'
     or coalesce(p_payload ->> 'uploadFingerprint', '') !~ '^[a-f0-9]{64}$'
     or coalesce(jsonb_typeof(p_payload -> 'changes'), 'null') <> 'array'
     or jsonb_array_length(p_payload -> 'changes') not between 1 and 500 then
    raise exception 'institutional_revision_proposal_invalid';
  end if;
  select * into existing from private.institutional_revision_proposals
   where organization_id = p.organization_id and capital_project_id = p.id
     and (id = p_proposal_id or upload_fingerprint = p_payload ->> 'uploadFingerprint');
  if existing.id is not null then
    -- The same file, or the same request, never opens a second review.
    return jsonb_build_object('proposalId', existing.id, 'status', existing.status, 'replayed', true);
  end if;
  select * into revision from private.project_canonical_revisions
   where organization_id = p.organization_id and capital_project_id = p.id order by revision_number desc limit 1;
  if revision.id is null then raise exception 'institutional_revision_proposal_revision_missing'; end if;
  select * into c from private.institutional_model_configurations
   where organization_id = p.organization_id and capital_project_id = p.id and status = 'approved'
   order by revision desc limit 1;
  if c.id is null or c.configuration_fingerprint is distinct from p_payload ->> 'configurationFingerprint' then
    raise exception 'institutional_revision_proposal_stale' using errcode = '40001';
  end if;
  select * into r from private.institutional_model_results
   where organization_id = p.organization_id and capital_project_id = p.id
     and canonical_revision_id = revision.id and status = 'completed' and superseded_by is null
   order by created_at desc, id desc limit 1;
  if r.id is null or r.artifact ->> 'fingerprint' is distinct from p_payload ->> 'artifactFingerprint' then
    raise exception 'institutional_revision_proposal_stale' using errcode = '40001';
  end if;
  for entry in select value from jsonb_array_elements(p_payload -> 'changes') loop
    if coalesce(entry ->> 'assumptionId', '') = '' or coalesce(entry ->> 'period', '') = ''
       or coalesce(entry ->> 'approved', '') !~ '^-?\d+(\.\d+)?$' or coalesce(entry ->> 'proposed', '') !~ '^-?\d+(\.\d+)?$'
       or entry ->> 'approved' = entry ->> 'proposed' then
      raise exception 'institutional_revision_proposal_invalid';
    end if;
    select ord - 1 into index from jsonb_array_elements(c.configuration #> '{assumptionBook,assumptions}') with ordinality a(value, ord)
     where value ->> 'id' = entry ->> 'assumptionId';
    if index is null
       or c.configuration #>> array['assumptionBook', 'assumptions', index::text, 'values', entry ->> 'period'] is distinct from entry ->> 'approved' then
      raise exception 'institutional_revision_proposal_stale' using errcode = '40001';
    end if;
  end loop;
  insert into private.institutional_revision_proposals(
    id, organization_id, capital_project_id, canonical_revision_id, configuration_id, configuration_fingerprint,
    artifact_fingerprint, structure_fingerprint, upload_fingerprint, changes, prepared_by)
  values (p_proposal_id, p.organization_id, p.id, revision.id, c.id, c.configuration_fingerprint,
    p_payload ->> 'artifactFingerprint', p_payload ->> 'structureFingerprint', p_payload ->> 'uploadFingerprint',
    p_payload -> 'changes', auth.uid());
  return jsonb_build_object('proposalId', p_proposal_id, 'status', 'proposed', 'replayed', false);
end $$;
create function public.submit_institutional_revision_proposal_v1(p_project_id uuid, p_proposal_id uuid, p_payload jsonb)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.submit_institutional_revision_proposal_v1(p_project_id, p_proposal_id, p_payload);
$$;

-- Review: returning it needs a reviewer or an approver, approving it needs an approver, and the
-- person who prepared it may approve it only when the project allows self-approval. Approving
-- writes the candidate configuration with the proposed values and honest provenance, then hands it
-- to the existing configuration review, which records the new canonical revision and queues the
-- recompute. Nothing about the economics is decided here.
create function private.review_institutional_revision_proposal_v1(
  p_proposal_id uuid, p_decision text, p_expected_structure_fingerprint text, p_request_id uuid, p_locale text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare pr private.institutional_revision_proposals; c private.institutional_model_configurations;
        revision private.project_canonical_revisions; candidate_id uuid := gen_random_uuid();
        config jsonb; entry jsonb; index integer; fingerprint text; calculated jsonb;
begin
  select * into pr from private.institutional_revision_proposals where id = p_proposal_id;
  if pr.id is null or not private.can_access_capital_project(pr.organization_id, pr.capital_project_id) then
    raise exception 'institutional_revision_proposal_forbidden' using errcode = '42501';
  end if;
  if coalesce(p_decision, '') not in ('approved', 'rejected') then raise exception 'institutional_revision_proposal_invalid'; end if;
  perform private.assert_capital_project_review_action(pr.organization_id, pr.capital_project_id,
    case when p_decision = 'approved' then 'approve' else 'return' end, pr.prepared_by);
  perform 1 from public.capital_projects where organization_id = pr.organization_id and id = pr.capital_project_id for update;
  select * into pr from private.institutional_revision_proposals where id = p_proposal_id for update;
  if pr.status <> 'proposed' or pr.structure_fingerprint is distinct from p_expected_structure_fingerprint then
    raise exception 'institutional_revision_proposal_stale' using errcode = '40001';
  end if;
  if p_decision = 'rejected' then
    update private.institutional_revision_proposals set status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now()
     where id = pr.id;
    return jsonb_build_object('proposalId', pr.id, 'status', 'rejected');
  end if;
  if p_request_id is null or coalesce(p_locale, '') not in ('pt-BR', 'en-US') then
    raise exception 'institutional_revision_proposal_invalid';
  end if;
  select * into revision from private.project_canonical_revisions
   where organization_id = pr.organization_id and capital_project_id = pr.capital_project_id
   order by revision_number desc limit 1;
  select * into c from private.institutional_model_configurations
   where organization_id = pr.organization_id and capital_project_id = pr.capital_project_id and status = 'approved'
   order by revision desc limit 1;
  if revision.id is distinct from pr.canonical_revision_id or c.id is distinct from pr.configuration_id
     or c.configuration_fingerprint is distinct from pr.configuration_fingerprint then
    raise exception 'institutional_revision_proposal_stale' using errcode = '40001';
  end if;
  config := c.configuration;
  for entry in select value from jsonb_array_elements(pr.changes) loop
    select ord - 1 into index from jsonb_array_elements(config #> '{assumptionBook,assumptions}') with ordinality a(value, ord)
     where value ->> 'id' = entry ->> 'assumptionId';
    if index is null
       or config #>> array['assumptionBook', 'assumptions', index::text, 'values', entry ->> 'period'] is distinct from entry ->> 'approved' then
      raise exception 'institutional_revision_proposal_stale' using errcode = '40001';
    end if;
    -- The value moves and its provenance moves with it: this is a reviewed scenario premise, not
    -- something the company's documents said.
    config := jsonb_set(config, array['assumptionBook', 'assumptions', index::text],
      (config #> array['assumptionBook', 'assumptions', index::text]) || jsonb_build_object(
        'values', (config #> array['assumptionBook', 'assumptions', index::text, 'values'])
                  || jsonb_build_object(entry ->> 'period', entry ->> 'proposed'),
        'sourceType', 'offroad_scenario', 'evidence', '[]'::jsonb, 'confidence', 'low',
        'rationale', 'Value proposed in the exported workbook and approved in review; an assumption, not a company statement.',
        'methodology', 'Imported from the approved editable workbook; proposal ' || pr.id::text || '.'));
  end loop;
  fingerprint := private.institutional_config_hash(config);
  if exists (select 1 from private.institutional_model_configurations
              where organization_id = pr.organization_id and capital_project_id = pr.capital_project_id
                and configuration_fingerprint = fingerprint) then
    raise exception 'institutional_revision_proposal_duplicate' using errcode = '40001';
  end if;
  insert into private.institutional_model_configurations(
    id, organization_id, capital_project_id, revision, configuration, configuration_fingerprint, parent_fingerprint, status, answer_evidence)
  values (candidate_id, pr.organization_id, pr.capital_project_id,
    (select coalesce(max(revision), 0) + 1 from private.institutional_model_configurations
      where organization_id = pr.organization_id and capital_project_id = pr.capital_project_id),
    config, fingerprint, c.configuration_fingerprint, 'review_required',
    jsonb_build_object('kind', 'imported_workbook_proposal', 'proposalId', pr.id,
      'uploadFingerprint', pr.upload_fingerprint, 'structureFingerprint', pr.structure_fingerprint,
      'artifactFingerprint', pr.artifact_fingerprint, 'changes', pr.changes));
  update private.institutional_revision_proposals
     set status = 'approved', candidate_configuration_id = candidate_id, reviewed_by = auth.uid(), reviewed_at = now()
   where id = pr.id;
  -- The approved proposal now walks the ordinary path: review the candidate, record the canonical
  -- revision, queue the deterministic recompute.
  calculated := private.review_institutional_configuration_and_calculate_v1(
    pr.capital_project_id, candidate_id, c.configuration_fingerprint, 'approved', fingerprint, p_request_id, p_locale);
  return jsonb_build_object('proposalId', pr.id, 'status', 'approved', 'candidateConfigurationId', candidate_id,
    'configurationFingerprint', fingerprint, 'calculation', calculated);
end $$;
create function public.review_institutional_revision_proposal_v1(
  p_proposal_id uuid, p_decision text, p_expected_structure_fingerprint text, p_request_id uuid, p_locale text)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.review_institutional_revision_proposal_v1(p_proposal_id, p_decision, p_expected_structure_fingerprint, p_request_id, p_locale);
$$;

create function private.read_institutional_revision_proposals_v1(p_project_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare org_id uuid; proposals jsonb;
begin
  select organization_id into org_id from public.capital_projects where id = p_project_id;
  if org_id is null or not private.can_access_capital_project(org_id, p_project_id) then
    raise exception 'institutional_revision_proposal_forbidden' using errcode = '42501';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', pr.id, 'status', pr.status, 'origin', pr.origin,
      'canonicalRevisionId', pr.canonical_revision_id, 'configurationId', pr.configuration_id,
      'configurationFingerprint', pr.configuration_fingerprint, 'artifactFingerprint', pr.artifact_fingerprint,
      'structureFingerprint', pr.structure_fingerprint, 'uploadFingerprint', pr.upload_fingerprint,
      'changes', pr.changes, 'candidateConfigurationId', pr.candidate_configuration_id,
      'preparedBy', pr.prepared_by, 'reviewedBy', pr.reviewed_by, 'reviewedAt', pr.reviewed_at, 'createdAt', pr.created_at,
      'callerCanReview', private.capital_project_review_action_allowed(pr.organization_id, pr.capital_project_id, 'approve', pr.prepared_by) is null)
    order by pr.created_at desc, pr.id desc), '[]'::jsonb) into proposals
  from (select * from private.institutional_revision_proposals
         where organization_id = org_id and capital_project_id = p_project_id
         order by created_at desc, id desc limit 24) pr;
  return jsonb_build_object('projectId', p_project_id, 'proposals', proposals);
end $$;
create function public.read_institutional_revision_proposals_v1(p_project_id uuid)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.read_institutional_revision_proposals_v1(p_project_id);
$$;

revoke all on function
  private.submit_institutional_revision_proposal_v1(uuid, uuid, jsonb), public.submit_institutional_revision_proposal_v1(uuid, uuid, jsonb),
  private.review_institutional_revision_proposal_v1(uuid, text, text, uuid, text), public.review_institutional_revision_proposal_v1(uuid, text, text, uuid, text),
  private.read_institutional_revision_proposals_v1(uuid), public.read_institutional_revision_proposals_v1(uuid)
  from public, anon;
grant execute on function
  private.submit_institutional_revision_proposal_v1(uuid, uuid, jsonb), public.submit_institutional_revision_proposal_v1(uuid, uuid, jsonb),
  private.review_institutional_revision_proposal_v1(uuid, text, text, uuid, text), public.review_institutional_revision_proposal_v1(uuid, text, text, uuid, text),
  private.read_institutional_revision_proposals_v1(uuid), public.read_institutional_revision_proposals_v1(uuid)
  to authenticated;
