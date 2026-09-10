-- Admit only release-pinned documentary compiler snapshots. Plan persistence grants no
-- execution authority. Approval, capability, source and tenant gates remain unchanged.
create function private.is_released_documentary_plan_v1(p_snapshot jsonb, p_entry text)
returns boolean language sql immutable security invoker set search_path='' as $function$
  select coalesce(p_entry in ('structure_from_documents','review_existing_operation')
    and p_snapshot = ($documentary_contract${
  "structure_from_documents": {
    "schemaVersion": "capital-project-plan.v1",
    "compilerVersion": "2026.09.01-v3",
    "registryVersion": "2026.09.09-v9",
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
          "version": "2026.09.09-v6"
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
          "version": "2026.09.09-v6"
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
          "version": "2026.09.09-v6"
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
    "registryVersion": "2026.09.09-v9",
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
          "version": "2026.09.09-v6"
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
          "version": "2026.09.09-v6"
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
          "version": "2026.09.09-v6"
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
}$documentary_contract$::jsonb -> p_entry), false);
$function$;
revoke all on function private.is_released_documentary_plan_v1(jsonb,text) from public,anon,authenticated;

-- Retain both recorders' user/actor checks, membership, atomicity, idempotence and persistence.
-- Refuse definition drift instead of accidentally removing a security predicate.
do $migration$
declare signature text; definition text; needle text; replacement text;
begin
  foreach signature in array array[
    'private.record_capital_project_plan(uuid,jsonb)',
    'private.record_execution_proposal_plan_as_actor(uuid,jsonb,uuid)'
  ] loop
    definition := pg_get_functiondef(signature::regprocedure);
    needle := '  caller_id uuid :=';
    if position(needle in definition)=0 then raise exception 'documentary plan actor declaration drift'; end if;
    definition := replace(definition, needle, '  documentary boolean := false;' || chr(10) || needle);
    needle := '  if p_snapshot ->> ''schemaVersion'' <> ''capital-project-plan.v1''';
    if position(needle in definition)=0 then raise exception 'documentary plan validation entry drift'; end if;
    definition := replace(definition, needle,
      '  documentary := private.is_released_documentary_plan_v1(p_snapshot, project_row.entry_job);' || chr(10) || chr(10) || needle);
    needle := 'or exists (select 1 from unnest(task_ids) id where not (id = any(allowed_task_ids)))';
    replacement := 'or (not documentary and exists (select 1 from unnest(task_ids) id where not (id = any(allowed_task_ids))))';
    if position(needle in definition)=0 then raise exception 'documentary plan task guard drift'; end if;
    definition := replace(definition, needle, replacement);
    needle := '  if project_row.entry_job = ''origination_thesis''';
    if position(needle in definition)=0 then raise exception 'documentary plan target guard drift'; end if;
    definition := replace(definition, needle, '  if documentary then' || chr(10) || '    null;' || chr(10) || '  elsif project_row.entry_job = ''origination_thesis''');
    execute definition;
  end loop;
end;
$migration$;
-- Neither recorder becomes a client-callable bypass around the existing governed commands.
revoke all on function private.record_capital_project_plan(uuid,jsonb) from public,anon,authenticated;
revoke all on function private.record_execution_proposal_plan_as_actor(uuid,jsonb,uuid) from public,anon,authenticated;
