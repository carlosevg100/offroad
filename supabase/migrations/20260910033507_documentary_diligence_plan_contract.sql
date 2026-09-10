-- Preserve approved v12 and earlier snapshots; add exact v13/diligence method v10.
create or replace function private.is_released_documentary_plan_v12(p_snapshot jsonb, p_entry text)
returns boolean language sql immutable security invoker set search_path='' as $function$
  select private.is_released_documentary_plan_v11(p_snapshot,p_entry) or coalesce(
    p_entry in ('structure_from_documents','review_existing_operation')
    and p_snapshot = ($prior_contract${
  "structure_from_documents": {
    "schemaVersion": "capital-project-plan.v1",
    "compilerVersion": "2026.09.01-v3",
    "registryVersion": "2026.09.09-v12",
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
          "version": "2026.09.09-v9"
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
          "version": "2026.09.09-v9"
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
          "version": "2026.09.09-v9"
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
    "registryVersion": "2026.09.09-v12",
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
          "version": "2026.09.09-v9"
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
          "version": "2026.09.09-v9"
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
          "version": "2026.09.09-v9"
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
}$prior_contract$::jsonb -> p_entry),false);
$function$;
revoke all on function private.is_released_documentary_plan_v12(jsonb,text) from public,anon,authenticated;

create or replace function private.is_released_documentary_plan_v1(p_snapshot jsonb, p_entry text)
returns boolean language sql immutable security invoker set search_path='' as $function$
  select private.is_released_documentary_plan_v12(p_snapshot,p_entry) or coalesce(
    p_entry in ('structure_from_documents','review_existing_operation')
    and p_snapshot = ($documentary_contract${
  "structure_from_documents": {
    "schemaVersion": "capital-project-plan.v1",
    "compilerVersion": "2026.09.01-v3",
    "registryVersion": "2026.09.09-v13",
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
          "version": "2026.09.09-v10"
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
          "version": "2026.09.09-v10"
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
          "version": "2026.09.09-v10"
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
    "registryVersion": "2026.09.09-v13",
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
          "version": "2026.09.09-v10"
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
          "version": "2026.09.09-v10"
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
          "version": "2026.09.09-v10"
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
revoke all on function private.is_released_documentary_plan_v1(jsonb,text) from public,anon,authenticated;
