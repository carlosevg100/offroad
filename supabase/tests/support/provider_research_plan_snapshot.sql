-- Generated from providerResearchPlanSnapshot. Synthetic plan contract only.
create function pg_temp.provider_research_plan_fixture() returns jsonb
language sql immutable set search_path='' as $plan$
 select $snapshot${
  "schemaVersion": "capital-project-plan.v1",
  "compilerVersion": "2026.09.01-v3",
  "registryVersion": "2026.09.10-v14",
  "job": {
    "id": "company_debt_view",
    "targetTaskIds": [
      "K02"
    ],
    "firstWorkProduct": "provider_research",
    "confirmationGate": "diagnostic",
    "accessPolicy": "public_or_private",
    "inputPolicy": {
      "company": "not_applicable",
      "documents": "not_applicable",
      "capitalIntent": "not_applicable",
      "existingTransaction": "not_applicable",
      "publicResearch": "not_applicable"
    }
  },
  "taskSpecs": [
    {
      "id": "M01",
      "label": "Resolver companhia, grupo, jurisdição e regime de evidência",
      "graph": "case",
      "dependencies": [],
      "executionClass": "extraction",
      "effect": "propose_state",
      "maturity": "specified",
      "readingStrategies": [
        "exhaustive_corpus"
      ],
      "ordinal": 0,
      "batch": 0
    },
    {
      "id": "K01",
      "label": "Atualizar universo de financiadores",
      "graph": "market",
      "dependencies": [
        "M01"
      ],
      "executionClass": "research",
      "effect": "commit",
      "maturity": "specified",
      "readingStrategies": [
        "exact_search",
        "semantic_retrieval"
      ],
      "ordinal": 1,
      "batch": 1
    },
    {
      "id": "K02",
      "label": "Normalizar mandatos",
      "graph": "market",
      "dependencies": [
        "K01"
      ],
      "executionClass": "deterministic",
      "effect": "commit",
      "maturity": "specified",
      "readingStrategies": [
        "structured_query"
      ],
      "ordinal": 2,
      "batch": 2
    }
  ],
  "parallelBatches": [
    [
      "M01"
    ],
    [
      "K01"
    ],
    [
      "K02"
    ]
  ]
}$snapshot$::jsonb;
$plan$;
