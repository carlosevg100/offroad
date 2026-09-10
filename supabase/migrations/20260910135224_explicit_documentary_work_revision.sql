-- Admit only the exact current compiler snapshots across all existing entry jobs. Preserve
-- previously accepted documentary plans byte-for-byte through the historical predicate.
do $migration$
declare definition text:=pg_get_functiondef('private.is_released_documentary_plan_v1(jsonb,text)'::regprocedure);
begin
  execute replace(definition,'FUNCTION private.is_released_documentary_plan_v1(', 'FUNCTION private.is_released_documentary_plan_before_revision(');
end;
$migration$;
revoke all on function private.is_released_documentary_plan_before_revision(jsonb,text) from public,anon,authenticated;
create or replace function private.is_released_documentary_plan_v1(p_snapshot jsonb,p_entry text)
returns boolean language sql immutable security invoker set search_path='' as $function$
  select private.is_released_documentary_plan_before_revision(p_snapshot,p_entry) or coalesce(
    p_snapshot=($documentary_contract${
  "company_debt_view": {
    "schemaVersion": "capital-project-plan.v1",
    "compilerVersion": "2026.09.01-v3",
    "registryVersion": "2026.09.10-v15",
    "job": {
      "id": "company_debt_view",
      "targetTaskIds": [
        "Q03"
      ],
      "firstWorkProduct": "company_debt_diagnostic",
      "confirmationGate": "diagnostic",
      "accessPolicy": "public_or_private",
      "inputPolicy": {
        "company": "required",
        "documents": "optional",
        "capitalIntent": "optional",
        "existingTransaction": "not_applicable",
        "publicResearch": "required"
      }
    },
    "taskSpecs": [
      {
        "id": "Q01",
        "label": "Verificar fontes autorizadas e cobertura documental",
        "graph": "case",
        "dependencies": [],
        "executionClass": "deterministic",
        "effect": "none",
        "maturity": "specified",
        "procedure": {
          "id": "documentary-work-pipeline",
          "version": "2026.09.10-v12"
        },
        "readingStrategies": [
          "structured_query"
        ],
        "ordinal": 0,
        "batch": 0
      },
      {
        "id": "Q02",
        "label": "Organizar observações documentais, hipóteses e lacunas",
        "graph": "case",
        "dependencies": [
          "Q01"
        ],
        "executionClass": "judgment",
        "effect": "none",
        "maturity": "specified",
        "procedure": {
          "id": "documentary-work-pipeline",
          "version": "2026.09.10-v12"
        },
        "readingStrategies": [
          "structured_query",
          "semantic_retrieval"
        ],
        "ordinal": 1,
        "batch": 1
      },
      {
        "id": "Q03",
        "label": "Publicar leitura documental preliminar privada",
        "graph": "case",
        "dependencies": [
          "Q02"
        ],
        "executionClass": "compilation",
        "effect": "commit",
        "maturity": "specified",
        "procedure": {
          "id": "documentary-work-pipeline",
          "version": "2026.09.10-v12"
        },
        "readingStrategies": [
          "structured_query"
        ],
        "ordinal": 2,
        "batch": 2
      }
    ],
    "parallelBatches": [
      [
        "Q01"
      ],
      [
        "Q02"
      ],
      [
        "Q03"
      ]
    ]
  },
  "origination_thesis": {
    "schemaVersion": "capital-project-plan.v1",
    "compilerVersion": "2026.09.01-v3",
    "registryVersion": "2026.09.10-v15",
    "job": {
      "id": "origination_thesis",
      "targetTaskIds": [
        "Q03"
      ],
      "firstWorkProduct": "meeting_brief",
      "confirmationGate": "preliminary_understanding",
      "accessPolicy": "public_or_private",
      "inputPolicy": {
        "company": "required",
        "documents": "optional",
        "capitalIntent": "optional",
        "existingTransaction": "not_applicable",
        "publicResearch": "required"
      }
    },
    "taskSpecs": [
      {
        "id": "Q01",
        "label": "Verificar fontes autorizadas e cobertura documental",
        "graph": "case",
        "dependencies": [],
        "executionClass": "deterministic",
        "effect": "none",
        "maturity": "specified",
        "procedure": {
          "id": "documentary-work-pipeline",
          "version": "2026.09.10-v12"
        },
        "readingStrategies": [
          "structured_query"
        ],
        "ordinal": 0,
        "batch": 0
      },
      {
        "id": "Q02",
        "label": "Organizar observações documentais, hipóteses e lacunas",
        "graph": "case",
        "dependencies": [
          "Q01"
        ],
        "executionClass": "judgment",
        "effect": "none",
        "maturity": "specified",
        "procedure": {
          "id": "documentary-work-pipeline",
          "version": "2026.09.10-v12"
        },
        "readingStrategies": [
          "structured_query",
          "semantic_retrieval"
        ],
        "ordinal": 1,
        "batch": 1
      },
      {
        "id": "Q03",
        "label": "Publicar leitura documental preliminar privada",
        "graph": "case",
        "dependencies": [
          "Q02"
        ],
        "executionClass": "compilation",
        "effect": "commit",
        "maturity": "specified",
        "procedure": {
          "id": "documentary-work-pipeline",
          "version": "2026.09.10-v12"
        },
        "readingStrategies": [
          "structured_query"
        ],
        "ordinal": 2,
        "batch": 2
      }
    ],
    "parallelBatches": [
      [
        "Q01"
      ],
      [
        "Q02"
      ],
      [
        "Q03"
      ]
    ]
  },
  "capital_planning": {
    "schemaVersion": "capital-project-plan.v1",
    "compilerVersion": "2026.09.01-v3",
    "registryVersion": "2026.09.10-v15",
    "job": {
      "id": "capital_planning",
      "targetTaskIds": [
        "Q03"
      ],
      "firstWorkProduct": "alternative_map",
      "confirmationGate": "structure",
      "accessPolicy": "public_or_private",
      "inputPolicy": {
        "company": "required",
        "documents": "optional",
        "capitalIntent": "required",
        "existingTransaction": "not_applicable",
        "publicResearch": "allowed"
      }
    },
    "taskSpecs": [
      {
        "id": "Q01",
        "label": "Verificar fontes autorizadas e cobertura documental",
        "graph": "case",
        "dependencies": [],
        "executionClass": "deterministic",
        "effect": "none",
        "maturity": "specified",
        "procedure": {
          "id": "documentary-work-pipeline",
          "version": "2026.09.10-v12"
        },
        "readingStrategies": [
          "structured_query"
        ],
        "ordinal": 0,
        "batch": 0
      },
      {
        "id": "Q02",
        "label": "Organizar observações documentais, hipóteses e lacunas",
        "graph": "case",
        "dependencies": [
          "Q01"
        ],
        "executionClass": "judgment",
        "effect": "none",
        "maturity": "specified",
        "procedure": {
          "id": "documentary-work-pipeline",
          "version": "2026.09.10-v12"
        },
        "readingStrategies": [
          "structured_query",
          "semantic_retrieval"
        ],
        "ordinal": 1,
        "batch": 1
      },
      {
        "id": "Q03",
        "label": "Publicar leitura documental preliminar privada",
        "graph": "case",
        "dependencies": [
          "Q02"
        ],
        "executionClass": "compilation",
        "effect": "commit",
        "maturity": "specified",
        "procedure": {
          "id": "documentary-work-pipeline",
          "version": "2026.09.10-v12"
        },
        "readingStrategies": [
          "structured_query"
        ],
        "ordinal": 2,
        "batch": 2
      }
    ],
    "parallelBatches": [
      [
        "Q01"
      ],
      [
        "Q02"
      ],
      [
        "Q03"
      ]
    ]
  },
  "structure_from_documents": {
    "schemaVersion": "capital-project-plan.v1",
    "compilerVersion": "2026.09.01-v3",
    "registryVersion": "2026.09.10-v15",
    "job": {
      "id": "structure_from_documents",
      "targetTaskIds": [
        "Q03"
      ],
      "firstWorkProduct": "diagnostic_recommendation",
      "confirmationGate": "structure",
      "accessPolicy": "private_required",
      "inputPolicy": {
        "company": "inferable",
        "documents": "required",
        "capitalIntent": "inferable",
        "existingTransaction": "optional",
        "publicResearch": "required"
      }
    },
    "taskSpecs": [
      {
        "id": "Q01",
        "label": "Verificar fontes autorizadas e cobertura documental",
        "graph": "case",
        "dependencies": [],
        "executionClass": "deterministic",
        "effect": "none",
        "maturity": "specified",
        "procedure": {
          "id": "documentary-work-pipeline",
          "version": "2026.09.10-v12"
        },
        "readingStrategies": [
          "structured_query"
        ],
        "ordinal": 0,
        "batch": 0
      },
      {
        "id": "Q02",
        "label": "Organizar observações documentais, hipóteses e lacunas",
        "graph": "case",
        "dependencies": [
          "Q01"
        ],
        "executionClass": "judgment",
        "effect": "none",
        "maturity": "specified",
        "procedure": {
          "id": "documentary-work-pipeline",
          "version": "2026.09.10-v12"
        },
        "readingStrategies": [
          "structured_query",
          "semantic_retrieval"
        ],
        "ordinal": 1,
        "batch": 1
      },
      {
        "id": "Q03",
        "label": "Publicar leitura documental preliminar privada",
        "graph": "case",
        "dependencies": [
          "Q02"
        ],
        "executionClass": "compilation",
        "effect": "commit",
        "maturity": "specified",
        "procedure": {
          "id": "documentary-work-pipeline",
          "version": "2026.09.10-v12"
        },
        "readingStrategies": [
          "structured_query"
        ],
        "ordinal": 2,
        "batch": 2
      }
    ],
    "parallelBatches": [
      [
        "Q01"
      ],
      [
        "Q02"
      ],
      [
        "Q03"
      ]
    ]
  },
  "review_existing_operation": {
    "schemaVersion": "capital-project-plan.v1",
    "compilerVersion": "2026.09.01-v3",
    "registryVersion": "2026.09.10-v15",
    "job": {
      "id": "review_existing_operation",
      "targetTaskIds": [
        "Q03"
      ],
      "firstWorkProduct": "operation_review",
      "confirmationGate": "structure",
      "accessPolicy": "private_required",
      "inputPolicy": {
        "company": "inferable",
        "documents": "required",
        "capitalIntent": "optional",
        "existingTransaction": "required",
        "publicResearch": "allowed"
      }
    },
    "taskSpecs": [
      {
        "id": "Q01",
        "label": "Verificar fontes autorizadas e cobertura documental",
        "graph": "case",
        "dependencies": [],
        "executionClass": "deterministic",
        "effect": "none",
        "maturity": "specified",
        "procedure": {
          "id": "documentary-work-pipeline",
          "version": "2026.09.10-v12"
        },
        "readingStrategies": [
          "structured_query"
        ],
        "ordinal": 0,
        "batch": 0
      },
      {
        "id": "Q02",
        "label": "Organizar observações documentais, hipóteses e lacunas",
        "graph": "case",
        "dependencies": [
          "Q01"
        ],
        "executionClass": "judgment",
        "effect": "none",
        "maturity": "specified",
        "procedure": {
          "id": "documentary-work-pipeline",
          "version": "2026.09.10-v12"
        },
        "readingStrategies": [
          "structured_query",
          "semantic_retrieval"
        ],
        "ordinal": 1,
        "batch": 1
      },
      {
        "id": "Q03",
        "label": "Publicar leitura documental preliminar privada",
        "graph": "case",
        "dependencies": [
          "Q02"
        ],
        "executionClass": "compilation",
        "effect": "commit",
        "maturity": "specified",
        "procedure": {
          "id": "documentary-work-pipeline",
          "version": "2026.09.10-v12"
        },
        "readingStrategies": [
          "structured_query"
        ],
        "ordinal": 2,
        "batch": 2
      }
    ],
    "parallelBatches": [
      [
        "Q01"
      ],
      [
        "Q02"
      ],
      [
        "Q03"
      ]
    ]
  },
  "prepare_materials_and_process": {
    "schemaVersion": "capital-project-plan.v1",
    "compilerVersion": "2026.09.01-v3",
    "registryVersion": "2026.09.10-v15",
    "job": {
      "id": "prepare_materials_and_process",
      "targetTaskIds": [
        "Q03"
      ],
      "firstWorkProduct": "production_plan",
      "confirmationGate": "production_plan",
      "accessPolicy": "existing_project",
      "inputPolicy": {
        "company": "existing_project",
        "documents": "existing_project",
        "capitalIntent": "existing_project",
        "existingTransaction": "existing_project",
        "publicResearch": "allowed"
      }
    },
    "taskSpecs": [
      {
        "id": "Q01",
        "label": "Verificar fontes autorizadas e cobertura documental",
        "graph": "case",
        "dependencies": [],
        "executionClass": "deterministic",
        "effect": "none",
        "maturity": "specified",
        "procedure": {
          "id": "documentary-work-pipeline",
          "version": "2026.09.10-v12"
        },
        "readingStrategies": [
          "structured_query"
        ],
        "ordinal": 0,
        "batch": 0
      },
      {
        "id": "Q02",
        "label": "Organizar observações documentais, hipóteses e lacunas",
        "graph": "case",
        "dependencies": [
          "Q01"
        ],
        "executionClass": "judgment",
        "effect": "none",
        "maturity": "specified",
        "procedure": {
          "id": "documentary-work-pipeline",
          "version": "2026.09.10-v12"
        },
        "readingStrategies": [
          "structured_query",
          "semantic_retrieval"
        ],
        "ordinal": 1,
        "batch": 1
      },
      {
        "id": "Q03",
        "label": "Publicar leitura documental preliminar privada",
        "graph": "case",
        "dependencies": [
          "Q02"
        ],
        "executionClass": "compilation",
        "effect": "commit",
        "maturity": "specified",
        "procedure": {
          "id": "documentary-work-pipeline",
          "version": "2026.09.10-v12"
        },
        "readingStrategies": [
          "structured_query"
        ],
        "ordinal": 2,
        "batch": 2
      }
    ],
    "parallelBatches": [
      [
        "Q01"
      ],
      [
        "Q02"
      ],
      [
        "Q03"
      ]
    ]
  }
}$documentary_contract$::jsonb -> p_entry),false);
$function$;

-- An explicit new work request keeps the project, source versions and prior results. It selects
-- only an exact released documentary graph and queues a fresh, unapproved Execution Brief.
-- No model, approval inheritance, source deletion or external release occurs in this command.
create function private.request_documentary_work_revision_v1(
  p_project_id uuid, p_execution_brief_id uuid, p_expected_fingerprint text,
  p_message_id uuid, p_locale text, p_content text, p_plan jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  caller_id uuid := (select auth.uid());
  project_row public.capital_projects;
  session_row public.document_intake_sessions;
  brief_row public.capital_project_execution_briefs;
  message_row public.agent_messages;
  conversation_id uuid;
  plan_id uuid;
  result jsonb;
  request_time timestamptz;
  content text := trim(coalesce(p_content,''));
begin
  if caller_id is null then raise exception 'authentication_required' using errcode='42501'; end if;
  if p_message_id is null or p_execution_brief_id is null or p_locale not in ('pt-BR','en-US')
    or p_expected_fingerprint is null or p_expected_fingerprint !~ '^[a-f0-9]{64}$' or char_length(content) not between 3 and 8000 then
    raise exception 'invalid_documentary_work_revision' using errcode='22023';
  end if;
  select p.* into project_row from public.capital_projects p
    join public.organization_memberships m on m.organization_id=p.organization_id
    where p.id=p_project_id and m.user_id=caller_id and m.status='active' and p.status<>'archived' for update of p;
  if not found then raise exception 'capital_project_not_found' using errcode='P0002'; end if;
  if project_row.access_basis<>'authorized_private' or not private.is_released_documentary_plan_v1(p_plan,project_row.entry_job) then
    raise exception 'documentary_work_scope_invalid' using errcode='42501';
  end if;
  select s.* into strict session_row from public.document_intake_sessions s
    where s.organization_id=project_row.organization_id and s.capital_project_id=p_project_id
    order by s.created_at asc limit 1 for update;
  -- A committed command remains replayable after the successor brief has appeared. Compare
  -- every semantic input first; a reused UUID is never authority to alter a different request.
  select m.* into message_row from public.agent_messages m where m.id=p_message_id;
  if found then
    if message_row.organization_id=project_row.organization_id and message_row.intake_session_id=session_row.id
      and message_row.created_by=caller_id and message_row.content=content and message_row.locale=p_locale
      and message_row.metadata->>'kind'='execution_brief_edit'
      and message_row.metadata->>'workRequestRevision'='true'
      and message_row.metadata->>'executionBriefId'=p_execution_brief_id::text
      and message_row.metadata->>'expectedBriefFingerprint'=p_expected_fingerprint
      and message_row.metadata->>'requestedPlanFingerprint'=encode(extensions.digest(convert_to(p_plan::text,'utf8'),'sha256'),'hex') then
      return message_row.metadata->'commandResult'||jsonb_build_object('replayed',true);
    end if;
    raise exception 'documentary_revision_message_already_in_use' using errcode='23505';
  end if;
  perform 1 from public.capital_project_plans p where p.organization_id=project_row.organization_id
    and p.capital_project_id=p_project_id and p.status='active' for update;
  select b.* into brief_row from public.capital_project_execution_briefs b
    where b.organization_id=project_row.organization_id and b.capital_project_id=p_project_id
    order by b.brief_version desc limit 1;
  if brief_row.id is distinct from p_execution_brief_id or brief_row.brief_fingerprint is distinct from p_expected_fingerprint then
    raise exception 'execution_brief_edit_stale' using errcode='40001';
  end if;
  if exists(select 1 from public.processing_jobs j where j.organization_id=project_row.organization_id
    and j.intake_session_id=session_row.id and j.status in ('queued','leased')) then
    raise exception 'advisor_message_in_progress' using errcode='55000';
  end if;
  if not exists(select 1 from public.preliminary_understandings u where u.organization_id=project_row.organization_id
      and u.intake_session_id=session_row.id and u.status='confirmed')
    or not exists(select 1 from public.source_documents d where d.organization_id=project_row.organization_id and d.intake_session_id=session_row.id)
    or exists(select 1 from public.source_documents d where d.organization_id=project_row.organization_id
      and d.intake_session_id=session_row.id and d.processing_status<>'ready') then
    raise exception 'documentary_revision_inputs_not_ready' using errcode='55000';
  end if;
  if not exists(select 1 from public.organizations o join public.organization_rollout_policies r on r.organization_id=o.id
    where o.id=project_row.organization_id and o.pipeline_enabled and r.state in ('canary','active')) then
    raise exception 'documentary_revision_pipeline_unavailable' using errcode='55000';
  end if;
  select c.id into conversation_id from public.agent_conversations c
    where c.organization_id=project_row.organization_id and c.intake_session_id=session_row.id;
  if conversation_id is null then raise exception 'advisor_conversation_not_found' using errcode='P0002'; end if;
  plan_id := private.record_capital_project_plan(p_project_id,p_plan);
  -- The canonical recorder deduplicates exact snapshots, including historical graphs. Returning
  -- to one is explicit here: restore its active pointer, never its former brief approval.
  if exists(select 1 from public.capital_project_plans p where p.id=plan_id and p.status='superseded') then
    update public.capital_project_plans set status='superseded',updated_at=now()
      where organization_id=project_row.organization_id and capital_project_id=p_project_id and status='active';
    update public.capital_project_plans set status='active',updated_at=now()
      where id=plan_id and organization_id=project_row.organization_id and capital_project_id=p_project_id;
  end if;
  if not exists(select 1 from public.capital_project_plans p where p.id=plan_id and p.status='active') then
    raise exception 'documentary_revision_plan_unavailable' using errcode='40001';
  end if;
  request_time:=greatest(clock_timestamp(),coalesce((select max(m.created_at)+interval '1 microsecond'
    from public.agent_messages m where m.organization_id=project_row.organization_id and m.intake_session_id=session_row.id),'-infinity'::timestamptz));
  insert into public.agent_messages(id,organization_id,conversation_id,intake_session_id,role,status,content,locale,metadata,created_by,created_at)
    values(p_message_id,project_row.organization_id,conversation_id,session_row.id,'user','completed',content,p_locale,
      jsonb_build_object('kind','execution_brief_edit','workRequestRevision',true,'executionBriefId',brief_row.id,
        'expectedBriefFingerprint',brief_row.brief_fingerprint,'expectedBriefVersion',brief_row.brief_version,
        'requestedPlanFingerprint',encode(extensions.digest(convert_to(p_plan::text,'utf8'),'sha256'),'hex')),caller_id,request_time);
  insert into public.capital_project_execution_brief_events(organization_id,capital_project_id,execution_brief_id,event_type,actor_type,actor_user_id,event_payload)
    values(project_row.organization_id,p_project_id,brief_row.id,'edit_requested','user',caller_id,
      jsonb_build_object('messageId',p_message_id,'expectedFingerprint',brief_row.brief_fingerprint,'expectedVersion',brief_row.brief_version,
        'requestFingerprint',encode(extensions.digest(convert_to(content,'utf8'),'sha256'),'hex'),'workRequestRevision',true));
  -- Reuse every ready document under the same pipeline contract. This existing command enforces
  -- monthly budgets, tenant membership and the canonical approval-holding trigger atomically.
  result:=private.begin_processing_run(project_row.organization_id,session_row.id,'manual','[]'::jsonb,session_row.pipeline_version,'{}'::jsonb);
  result:=result||jsonb_build_object('message_id',p_message_id,'plan_id',plan_id,'replayed',false);
  update public.agent_messages set metadata=metadata||jsonb_build_object('commandResult',result)
    where id=p_message_id and organization_id=project_row.organization_id;
  return result;
end;
$$;
create function public.request_documentary_work_revision_v1(
  p_project_id uuid,p_execution_brief_id uuid,p_expected_fingerprint text,p_message_id uuid,p_locale text,p_content text,p_plan jsonb
) returns jsonb language sql security invoker set search_path='' as $$
  select private.request_documentary_work_revision_v1(p_project_id,p_execution_brief_id,p_expected_fingerprint,p_message_id,p_locale,p_content,p_plan);
$$;
revoke all on function private.request_documentary_work_revision_v1(uuid,uuid,text,uuid,text,text,jsonb),public.request_documentary_work_revision_v1(uuid,uuid,text,uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function private.request_documentary_work_revision_v1(uuid,uuid,text,uuid,text,text,jsonb),public.request_documentary_work_revision_v1(uuid,uuid,text,uuid,text,text,jsonb) to authenticated;

-- Keep every existing loader extension (including provider research); replace only the work
-- request when an explicitly bound, immutable revision belongs to this exact active plan.
do $migration$
declare definition text;
begin
  definition:=pg_get_functiondef('private.worker_load_execution_brief_proposal_v3(uuid,text)'::regprocedure);
  execute replace(definition,'FUNCTION private.worker_load_execution_brief_proposal_v3(', 'FUNCTION private.worker_load_proposal_before_work_revision(');
end;
$migration$;
revoke all on function private.worker_load_proposal_before_work_revision(uuid,text) from public,anon,authenticated;
create or replace function private.worker_load_execution_brief_proposal_v3(p_job_id uuid,p_capability_token text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  j public.processing_jobs:=private.job_for_capability(p_job_id,p_capability_token);
  base jsonb:=private.worker_load_proposal_before_work_revision(p_job_id,p_capability_token);
  request jsonb;
begin
  select jsonb_build_object('message_id',m.id,'text',m.content) into request from public.agent_messages m
    where m.organization_id=j.organization_id and m.intake_session_id=j.intake_session_id and m.role='user' and m.status='completed'
      and m.metadata->>'kind'='execution_brief_edit' and m.metadata->>'workRequestRevision'='true'
      and m.metadata->>'requestedPlanFingerprint'=encode(extensions.digest(convert_to((base->'plan')::text,'utf8'),'sha256'),'hex')
    order by m.created_at desc,m.id desc limit 1;
  return case when request is null then base else base||jsonb_build_object('initial_work_request',request) end;
end;
$$;

-- An unapproved new brief must not inherit completed work through a reused plan_id. Documentary
-- progress always reads the exact dispatch job/run/attempt, even before approval is granted.
do $migration$
declare definition text; needle text;
begin
  definition:=pg_get_functiondef('private.read_capital_project_execution_brief_progress_v1(uuid)'::regprocedure);
  needle:='if not found or private.document_work_request_binding_v1(d.processing_job_id)->>''executionScope'' is distinct from ''documentary_only'' then return base; end if;';
  if position(needle in definition)=0 then raise exception 'documentary progress guard drift'; end if;
  execute replace(definition,needle,'if not found or not exists (
    select 1 from public.capital_project_plans p join public.capital_project_execution_briefs b
      on b.organization_id=p.organization_id and b.plan_id=p.id
    where p.organization_id=d.organization_id and p.id=d.plan_id and b.id=p_execution_brief_id
      and private.is_released_documentary_plan_v1(p.snapshot,p.entry_job)
      and b.internal_snapshot->>''planVersion'' like ''document-work-plan.v1:%''
  ) then return base; end if;');
end;
$migration$;
