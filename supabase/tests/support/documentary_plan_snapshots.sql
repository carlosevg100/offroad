-- Generated from the real documentWorkPlanSnapshot compiler; no case-specific data.
create function pg_temp.documentary_plan_fixture(p_entry text) returns jsonb
language sql immutable set search_path='' as $fixture_function$
  select $documentary_contract${
  "structure_from_documents": {
    "schemaVersion": "capital-project-plan.v1",
    "compilerVersion": "2026.09.01-v3",
    "registryVersion": "2026.09.10-v14",
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
          "version": "2026.09.10-v11"
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
          "version": "2026.09.10-v11"
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
          "version": "2026.09.10-v11"
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
    "registryVersion": "2026.09.10-v14",
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
          "version": "2026.09.10-v11"
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
          "version": "2026.09.10-v11"
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
          "version": "2026.09.10-v11"
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
}$documentary_contract$::jsonb -> p_entry;
$fixture_function$;
