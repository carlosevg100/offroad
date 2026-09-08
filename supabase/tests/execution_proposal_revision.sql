-- Synthetic rollback regression: canonical compiler snapshots exercise the real
-- proposal recorder twice against an existing plan. No approval is inherited.
-- Synthetic rollback-only consent boundary regression. Legacy metadata setup uses the
-- shared fixture helper; the owner calls the real public approval RPC directly.
begin;


insert into auth.users (id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,is_sso_user,is_anonymous)
values ('10000000-0000-4000-8000-000000000901','authenticated','authenticated','approval-owner@example.invalid','{}','{}',now(),now(),false,false);
insert into public.organizations (id,organization_type,name,created_by)
values ('20000000-0000-4000-8000-000000000901','company','Synthetic approval tenant','10000000-0000-4000-8000-000000000901');
insert into public.organization_memberships (organization_id,user_id,role,status,joined_at)
values ('20000000-0000-4000-8000-000000000901','10000000-0000-4000-8000-000000000901','owner','active',now());
insert into public.document_intake_sessions (id,organization_id,started_by,journey,locale)
values ('40000000-0000-4000-8000-000000000901','20000000-0000-4000-8000-000000000901','10000000-0000-4000-8000-000000000901','company','pt-BR');
insert into public.source_documents (id,organization_id,intake_session_id,object_path,original_name,sha256,processing_status,created_by)
values ('50000000-0000-4000-8000-000000000901','20000000-0000-4000-8000-000000000901','40000000-0000-4000-8000-000000000901','20000000-0000-4000-8000-000000000901/40000000-0000-4000-8000-000000000901/source.pdf','synthetic-source.pdf',repeat('a',64),'ready','10000000-0000-4000-8000-000000000901');
insert into public.intake_field_candidates (id,organization_id,intake_session_id,source_document_id,extractor_key,field_path,field_group,label,normalized_value,value_type,information_class,evidence_rank,source_anchor,confidence,extraction_method,created_by)
values ('51000000-0000-4000-8000-000000000901','20000000-0000-4000-8000-000000000901','40000000-0000-4000-8000-000000000901','50000000-0000-4000-8000-000000000901','sector-fact','company.sector','company','Synthetic sector','"energy"','text','company_document',6,'{}',1,'user_entry','10000000-0000-4000-8000-000000000901');
insert into public.processing_runs (id,organization_id,intake_session_id,run_no,trigger,status,pipeline_version,created_by)
values ('70000000-0000-4000-8000-000000000901','20000000-0000-4000-8000-000000000901','40000000-0000-4000-8000-000000000901',1,'manual','queued','approval-fixture-v1','10000000-0000-4000-8000-000000000901');
insert into public.processing_jobs (id,organization_id,intake_session_id,processing_run_id,kind,status,payload)
values ('80000000-0000-4000-8000-000000000901','20000000-0000-4000-8000-000000000901','40000000-0000-4000-8000-000000000901','70000000-0000-4000-8000-000000000901','case_analysis','queued','{"analysis_scope":"full_case"}');

-- Synthetic extraction lineage, not customer data. Original source binding stays explicit.
update public.intake_field_candidates set processing_run_id='70000000-0000-4000-8000-000000000901',
 review_state='edited',is_primary=true,reviewed_by='10000000-0000-4000-8000-000000000901',reviewed_at=now(),anchor_verified=true
where id='51000000-0000-4000-8000-000000000901';
insert into public.processing_jobs(id,organization_id,intake_session_id,processing_run_id,source_document_id,kind,status,payload)
values('81000000-0000-4000-8000-000000000901','20000000-0000-4000-8000-000000000901','40000000-0000-4000-8000-000000000901','70000000-0000-4000-8000-000000000901','50000000-0000-4000-8000-000000000901','document_pipeline','succeeded',jsonb_build_object('document_version',1,'sha256',repeat('a',64)));

do $diag$ declare j uuid; c jsonb; r jsonb; rejected boolean:=false;
  fixture_internal jsonb := $fixture$
{
  "schemaVersion": "execution-brief.v1",
  "planVersion": "capital-project-plan.v1:2026.09.01-v3:2026.09.06-v4:80000000-0000-4000-8000-000000000901",
  "locale": "pt-BR",
  "objective": "Projeto 40000000-0000-4000-8000-000000000901",
  "currentContext": [
    {
      "label": "Pedido e contexto deste projeto",
      "role": "project_context",
      "informationClass": "private"
    },
    {
      "label": "synthetic-source.pdf",
      "role": "provided_documents",
      "informationClass": "private"
    }
  ],
  "proposedDeliverable": "Mapa de alternativas de capital, premissas e consequências",
  "workstreams": [
    {
      "key": "scope",
      "label": "Fixar a necessidade econômica, o montante e o horizonte",
      "purpose": "Separar o uso econômico do instrumento imaginado e tornar explícitos prazo, moeda, flexibilidade e restrições.",
      "sourceTaskIds": [
        "M01",
        "M02",
        "M03",
        "M04",
        "M05",
        "M06"
      ],
      "sources": [
        {
          "key": "project:f6434f71-083b-4c6f-87d9-27701b60397b",
          "label": "Pedido e contexto deste projeto",
          "role": "project_context",
          "status": "available",
          "informationClass": "private",
          "authorized": true
        },
        {
          "key": "50000000-0000-4000-8000-000000000901",
          "label": "synthetic-source.pdf",
          "role": "provided_documents",
          "status": "available",
          "informationClass": "private",
          "authorized": true
        }
      ],
      "analyses": [
        "Separar fatos conhecidos de hipóteses",
        "Definir perguntas que realmente alteram o trabalho"
      ],
      "output": "Perímetro corrigível do trabalho",
      "inclusionReasons": [
        "user_requested",
        "prevents_material_error"
      ],
      "dependencies": []
    },
    {
      "key": "evidence",
      "label": "Validar os dados que dimensionam a necessidade de capital",
      "purpose": "Ler o conjunto aplicável, resolver versões, períodos e unidades, conciliar divergências e tornar lacunas visíveis.",
      "sourceTaskIds": [
        "D01",
        "D02",
        "D03",
        "D04",
        "D05",
        "D06",
        "D07"
      ],
      "sources": [
        {
          "key": "50000000-0000-4000-8000-000000000901",
          "label": "synthetic-source.pdf",
          "role": "provided_documents",
          "status": "available",
          "informationClass": "private",
          "authorized": true
        }
      ],
      "analyses": [
        "Inventário e cobertura dos documentos",
        "Conciliação de números e fontes",
        "Lacunas priorizadas por impacto"
      ],
      "output": "Base conciliada e mapa de cobertura",
      "inclusionReasons": [
        "closes_coverage",
        "resolves_conflict",
        "prevents_material_error"
      ],
      "dependencies": [
        "scope"
      ]
    },
    {
      "key": "credit",
      "label": "Dimensionar capacidade, folga e downside de Projeto 40000000-0000-4000-8000-000000000901",
      "purpose": "Entender negócio e setor, normalizar resultados e projeções, mapear dívida e capital de giro e testar capacidade e downside.",
      "sourceTaskIds": [
        "C01",
        "C02",
        "C03",
        "C04",
        "C05",
        "C06",
        "C07",
        "C08",
        "C09",
        "C10",
        "C11"
      ],
      "sources": [
        {
          "key": "50000000-0000-4000-8000-000000000901",
          "label": "synthetic-source.pdf",
          "role": "provided_documents",
          "status": "available",
          "informationClass": "private",
          "authorized": true
        }
      ],
      "analyses": [
        "Drivers operacionais e qualidade do resultado",
        "Fluxo de caixa, dívida econômica e vencimentos",
        "Cenários, estresses e capacidade de pagamento"
      ],
      "output": "Diagnóstico de crédito com premissas e sensibilidades",
      "inclusionReasons": [
        "tests_hypothesis",
        "closes_coverage",
        "prevents_material_error"
      ],
      "dependencies": [
        "evidence",
        "scope"
      ]
    },
    {
      "key": "structure",
      "label": "Comparar formas de financiar a necessidade econômica",
      "purpose": "Comparar necessidade econômica, instrumentos, custo total, garantias, covenants, fontes e usos e risco de execução.",
      "sourceTaskIds": [
        "S01",
        "S02",
        "S03",
        "S04",
        "S05",
        "S06",
        "S07",
        "S08",
        "S09",
        "S10",
        "S11"
      ],
      "sources": [
        {
          "key": "50000000-0000-4000-8000-000000000901",
          "label": "synthetic-source.pdf",
          "role": "provided_documents",
          "status": "available",
          "informationClass": "private",
          "authorized": true
        }
      ],
      "analyses": [
        "Filtros jurídicos, econômicos e jurisdicionais",
        "Estruturas comparáveis em uma mesma base",
        "Trade-offs, complexidades e condições de viabilidade"
      ],
      "output": "Alternativas comparáveis, recomendação condicionada e próximos testes",
      "inclusionReasons": [
        "user_requested",
        "tests_hypothesis",
        "produces_deliverable"
      ],
      "dependencies": [
        "scope",
        "credit",
        "evidence"
      ]
    }
  ],
  "assumptions": [],
  "checkpoints": [
    {
      "label": "Revisar achados, lacunas e próximos caminhos",
      "afterWorkstreamKey": "structure",
      "kind": "choice"
    }
  ],
  "executionMode": "confirm_before_expensive_work",
  "authority": {
    "evidenceRegime": "private",
    "executionAuthority": "analysis_only",
    "establishedBy": "system_policy"
  },
  "planningContext": {
    "schemaVersion": "sector-planning-context.v1",
    "contextFingerprint": "c4330872b62f3671e98e9b71bfd3f3300fc221477fb3aabef58df8de6250522f",
    "planFingerprint": "e35fbce01640777ba3c568309c52b6be17ea88d1a734bcc7d311677b2977441c",
    "mode": "planning_only",
    "objects": [
      {
        "id": "intake-company:40000000-0000-4000-8000-000000000901",
        "label": "Projeto 40000000-0000-4000-8000-000000000901",
        "attributes": [
          {
            "dimension": "sector",
            "label": "Setor",
            "value": "Energia",
            "status": "confirmed",
            "sources": [
              {
                "label": "Informação revisada pelo usuário",
                "version": "4929ae57761f27ced68173d9d296e2119ae5392bdfa93deee42a67b234001116",
                "anchor": "reviewed_at:2026-09-08T15:42:36.261273Z",
                "basis": "user_review"
              }
            ]
          }
        ],
        "requirements": [],
        "gaps": []
      }
    ]
  },
  "fingerprint": "d96017351f1440d725fb5b1f1aabfa5f481866cc18d6c723f67c1c9eb8035f81"
}
$fixture$::jsonb;
  fixture_visible jsonb := $fixture$
{
  "schemaVersion": "execution-brief.v1",
  "fingerprint": "d96017351f1440d725fb5b1f1aabfa5f481866cc18d6c723f67c1c9eb8035f81",
  "locale": "pt-BR",
  "objective": "Projeto 40000000-0000-4000-8000-000000000901",
  "currentContext": [
    {
      "label": "Pedido e contexto deste projeto",
      "role": "project_context",
      "informationClass": "private"
    },
    {
      "label": "synthetic-source.pdf",
      "role": "provided_documents",
      "informationClass": "private"
    }
  ],
  "proposedDeliverable": "Mapa de alternativas de capital, premissas e consequências",
  "workstreams": [
    {
      "label": "Fixar a necessidade econômica, o montante e o horizonte",
      "purpose": "Separar o uso econômico do instrumento imaginado e tornar explícitos prazo, moeda, flexibilidade e restrições.",
      "sources": [
        {
          "label": "Pedido e contexto deste projeto",
          "status": "available",
          "informationClass": "private"
        },
        {
          "label": "synthetic-source.pdf",
          "status": "available",
          "informationClass": "private"
        }
      ],
      "analyses": [
        "Separar fatos conhecidos de hipóteses",
        "Definir perguntas que realmente alteram o trabalho"
      ],
      "output": "Perímetro corrigível do trabalho",
      "dependencies": []
    },
    {
      "label": "Validar os dados que dimensionam a necessidade de capital",
      "purpose": "Ler o conjunto aplicável, resolver versões, períodos e unidades, conciliar divergências e tornar lacunas visíveis.",
      "sources": [
        {
          "label": "synthetic-source.pdf",
          "status": "available",
          "informationClass": "private"
        }
      ],
      "analyses": [
        "Inventário e cobertura dos documentos",
        "Conciliação de números e fontes",
        "Lacunas priorizadas por impacto"
      ],
      "output": "Base conciliada e mapa de cobertura",
      "dependencies": [
        "Fixar a necessidade econômica, o montante e o horizonte"
      ]
    },
    {
      "label": "Dimensionar capacidade, folga e downside de Projeto 40000000-0000-4000-8000-000000000901",
      "purpose": "Entender negócio e setor, normalizar resultados e projeções, mapear dívida e capital de giro e testar capacidade e downside.",
      "sources": [
        {
          "label": "synthetic-source.pdf",
          "status": "available",
          "informationClass": "private"
        }
      ],
      "analyses": [
        "Drivers operacionais e qualidade do resultado",
        "Fluxo de caixa, dívida econômica e vencimentos",
        "Cenários, estresses e capacidade de pagamento"
      ],
      "output": "Diagnóstico de crédito com premissas e sensibilidades",
      "dependencies": [
        "Validar os dados que dimensionam a necessidade de capital",
        "Fixar a necessidade econômica, o montante e o horizonte"
      ]
    },
    {
      "label": "Comparar formas de financiar a necessidade econômica",
      "purpose": "Comparar necessidade econômica, instrumentos, custo total, garantias, covenants, fontes e usos e risco de execução.",
      "sources": [
        {
          "label": "synthetic-source.pdf",
          "status": "available",
          "informationClass": "private"
        }
      ],
      "analyses": [
        "Filtros jurídicos, econômicos e jurisdicionais",
        "Estruturas comparáveis em uma mesma base",
        "Trade-offs, complexidades e condições de viabilidade"
      ],
      "output": "Alternativas comparáveis, recomendação condicionada e próximos testes",
      "dependencies": [
        "Fixar a necessidade econômica, o montante e o horizonte",
        "Dimensionar capacidade, folga e downside de Projeto 40000000-0000-4000-8000-000000000901",
        "Validar os dados que dimensionam a necessidade de capital"
      ]
    }
  ],
  "assumptions": [],
  "checkpoints": [
    {
      "label": "Revisar achados, lacunas e próximos caminhos",
      "afterWorkstreamKey": "structure",
      "kind": "choice"
    }
  ],
  "executionMode": "confirm_before_expensive_work",
  "planningContext": {
    "schemaVersion": "sector-planning-context.v1",
    "contextFingerprint": "c4330872b62f3671e98e9b71bfd3f3300fc221477fb3aabef58df8de6250522f",
    "planFingerprint": "e35fbce01640777ba3c568309c52b6be17ea88d1a734bcc7d311677b2977441c",
    "mode": "planning_only",
    "objects": [
      {
        "id": "intake-company:40000000-0000-4000-8000-000000000901",
        "label": "Projeto 40000000-0000-4000-8000-000000000901",
        "attributes": [
          {
            "dimension": "sector",
            "label": "Setor",
            "value": "Energia",
            "status": "confirmed",
            "sources": [
              {
                "label": "Informação revisada pelo usuário",
                "version": "4929ae57761f27ced68173d9d296e2119ae5392bdfa93deee42a67b234001116",
                "anchor": "reviewed_at:2026-09-08T15:42:36.261273Z",
                "basis": "user_review"
              }
            ]
          }
        ],
        "requirements": [],
        "gaps": []
      }
    ]
  }
}
$fixture$::jsonb;
  fixture_plan jsonb := $fixture$
{
  "schemaVersion": "capital-project-plan.v1",
  "compilerVersion": "2026.09.01-v3",
  "registryVersion": "2026.09.06-v4",
  "job": {
    "id": "capital_planning",
    "targetTaskIds": [
      "S11"
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
      "id": "M02",
      "label": "Normalizar objetivo",
      "graph": "case",
      "dependencies": [],
      "executionClass": "extraction",
      "effect": "propose_state",
      "maturity": "specified",
      "readingStrategies": [
        "exhaustive_corpus"
      ],
      "ordinal": 1,
      "batch": 0
    },
    {
      "id": "M03",
      "label": "Registrar restrições",
      "graph": "case",
      "dependencies": [
        "M02"
      ],
      "executionClass": "extraction",
      "effect": "propose_state",
      "maturity": "specified",
      "readingStrategies": [
        "exhaustive_corpus"
      ],
      "ordinal": 2,
      "batch": 1
    },
    {
      "id": "M04",
      "label": "Inferir arquétipos candidatos",
      "graph": "case",
      "dependencies": [
        "M01",
        "M02"
      ],
      "executionClass": "judgment",
      "effect": "propose_state",
      "maturity": "specified",
      "readingStrategies": [
        "structured_query",
        "semantic_retrieval"
      ],
      "ordinal": 3,
      "batch": 1
    },
    {
      "id": "M05",
      "label": "Definir entregáveis, idioma e audiência",
      "graph": "case",
      "dependencies": [
        "M02",
        "M03"
      ],
      "executionClass": "deterministic",
      "effect": "propose_state",
      "maturity": "specified",
      "readingStrategies": [
        "structured_query"
      ],
      "ordinal": 4,
      "batch": 2
    },
    {
      "id": "M06",
      "label": "Compilar plano de tarefas",
      "graph": "case",
      "dependencies": [
        "M04",
        "M05"
      ],
      "executionClass": "deterministic",
      "effect": "commit",
      "maturity": "specified",
      "readingStrategies": [
        "structured_query"
      ],
      "ordinal": 5,
      "batch": 3
    },
    {
      "id": "D01",
      "label": "Ingerir e versionar arquivos",
      "graph": "case",
      "dependencies": [
        "M06"
      ],
      "executionClass": "deterministic",
      "effect": "commit",
      "maturity": "specified",
      "readingStrategies": [
        "structured_query"
      ],
      "ordinal": 6,
      "batch": 4
    },
    {
      "id": "D02",
      "label": "Classificar documento",
      "graph": "case",
      "dependencies": [
        "D01"
      ],
      "executionClass": "extraction",
      "effect": "propose_state",
      "maturity": "specified",
      "readingStrategies": [
        "exhaustive_corpus"
      ],
      "ordinal": 7,
      "batch": 5
    },
    {
      "id": "D03",
      "label": "Extrair layout e conteúdo",
      "graph": "case",
      "dependencies": [
        "D02"
      ],
      "executionClass": "extraction",
      "effect": "propose_state",
      "maturity": "specified",
      "readingStrategies": [
        "exhaustive_corpus"
      ],
      "ordinal": 8,
      "batch": 6
    },
    {
      "id": "D04",
      "label": "Extrair candidatos a fatos",
      "graph": "case",
      "dependencies": [
        "D03"
      ],
      "executionClass": "extraction",
      "effect": "propose_state",
      "maturity": "specified",
      "readingStrategies": [
        "exhaustive_corpus"
      ],
      "ordinal": 9,
      "batch": 7
    },
    {
      "id": "D05",
      "label": "Resolver entidade, período e unidade",
      "graph": "case",
      "dependencies": [
        "D04"
      ],
      "executionClass": "deterministic",
      "effect": "propose_state",
      "maturity": "specified",
      "readingStrategies": [
        "structured_query"
      ],
      "ordinal": 10,
      "batch": 8
    },
    {
      "id": "D06",
      "label": "Conciliar fontes",
      "graph": "case",
      "dependencies": [
        "D05"
      ],
      "executionClass": "deterministic",
      "effect": "commit",
      "maturity": "specified",
      "readingStrategies": [
        "structured_query",
        "version_reconciliation"
      ],
      "ordinal": 11,
      "batch": 9
    },
    {
      "id": "D07",
      "label": "Rodar identidades",
      "graph": "case",
      "dependencies": [
        "D06"
      ],
      "executionClass": "deterministic",
      "effect": "propose_state",
      "maturity": "specified",
      "readingStrategies": [
        "structured_query"
      ],
      "ordinal": 12,
      "batch": 10
    },
    {
      "id": "C01",
      "label": "Reconstruir modelo de negócio",
      "graph": "case",
      "dependencies": [
        "D06"
      ],
      "executionClass": "judgment",
      "effect": "propose_state",
      "maturity": "specified",
      "readingStrategies": [
        "structured_query",
        "semantic_retrieval"
      ],
      "ordinal": 13,
      "batch": 10
    },
    {
      "id": "C02",
      "label": "Carregar conhecimento aplicável e pesquisar setor e regulação",
      "graph": "knowledge",
      "dependencies": [
        "M01",
        "M04"
      ],
      "executionClass": "research",
      "effect": "none",
      "maturity": "specified",
      "readingStrategies": [
        "exact_search",
        "semantic_retrieval"
      ],
      "ordinal": 14,
      "batch": 2
    },
    {
      "id": "C03",
      "label": "Construir spreading",
      "graph": "case",
      "dependencies": [
        "D06",
        "D07"
      ],
      "executionClass": "deterministic",
      "effect": "propose_state",
      "maturity": "specified",
      "readingStrategies": [
        "structured_query"
      ],
      "ordinal": 15,
      "batch": 11
    },
    {
      "id": "C04",
      "label": "Analisar qualidade do resultado",
      "graph": "case",
      "dependencies": [
        "C03"
      ],
      "executionClass": "judgment",
      "effect": "propose_state",
      "maturity": "specified",
      "readingStrategies": [
        "structured_query",
        "semantic_retrieval"
      ],
      "ordinal": 16,
      "batch": 12
    },
    {
      "id": "C05",
      "label": "Mapear dívida econômica",
      "graph": "case",
      "dependencies": [
        "D06"
      ],
      "executionClass": "deterministic",
      "effect": "propose_state",
      "maturity": "specified",
      "readingStrategies": [
        "structured_query"
      ],
      "ordinal": 17,
      "batch": 10
    },
    {
      "id": "C06",
      "label": "Analisar capital de giro",
      "graph": "case",
      "dependencies": [
        "D06"
      ],
      "executionClass": "deterministic",
      "effect": "propose_state",
      "maturity": "specified",
      "readingStrategies": [
        "structured_query"
      ],
      "ordinal": 18,
      "batch": 10
    },
    {
      "id": "C07",
      "label": "Normalizar projeções",
      "graph": "case",
      "dependencies": [
        "C03",
        "D06"
      ],
      "executionClass": "deterministic",
      "effect": "propose_state",
      "maturity": "specified",
      "readingStrategies": [
        "structured_query"
      ],
      "ordinal": 19,
      "batch": 12
    },
    {
      "id": "C08",
      "label": "Rodar cenários e estresses",
      "graph": "case",
      "dependencies": [
        "C03",
        "C05",
        "C07"
      ],
      "executionClass": "deterministic",
      "effect": "propose_state",
      "maturity": "specified",
      "readingStrategies": [
        "structured_query"
      ],
      "ordinal": 20,
      "batch": 13
    },
    {
      "id": "C09",
      "label": "Identificar riscos e mitigantes",
      "graph": "case",
      "dependencies": [
        "C01",
        "C02",
        "C03",
        "C04",
        "C05",
        "C06",
        "C07",
        "C08"
      ],
      "executionClass": "judgment",
      "effect": "propose_state",
      "maturity": "specified",
      "readingStrategies": [
        "structured_query",
        "semantic_retrieval"
      ],
      "ordinal": 21,
      "batch": 14
    },
    {
      "id": "C10",
      "label": "Calcular capacidade",
      "graph": "case",
      "dependencies": [
        "C05",
        "C08",
        "C09"
      ],
      "executionClass": "deterministic",
      "effect": "propose_state",
      "maturity": "specified",
      "readingStrategies": [
        "structured_query"
      ],
      "ordinal": 22,
      "batch": 15
    },
    {
      "id": "C11",
      "label": "Compilar tese de estruturação",
      "graph": "case",
      "dependencies": [
        "C09",
        "C10"
      ],
      "executionClass": "judgment",
      "effect": "propose_state",
      "maturity": "specified",
      "readingStrategies": [
        "structured_query",
        "semantic_retrieval"
      ],
      "ordinal": 23,
      "batch": 16
    },
    {
      "id": "S01",
      "label": "Comparar pedido e necessidade",
      "graph": "case",
      "dependencies": [
        "M02",
        "C06",
        "C10"
      ],
      "executionClass": "deterministic",
      "effect": "propose_state",
      "maturity": "specified",
      "readingStrategies": [
        "structured_query"
      ],
      "ordinal": 24,
      "batch": 16
    },
    {
      "id": "S02",
      "label": "Gerar universo de instrumentos",
      "graph": "case",
      "dependencies": [
        "M04",
        "C10"
      ],
      "executionClass": "deterministic",
      "effect": "propose_state",
      "maturity": "specified",
      "readingStrategies": [
        "structured_query"
      ],
      "ordinal": 25,
      "batch": 16
    },
    {
      "id": "S03",
      "label": "Aplicar filtros jurídicos, jurisdicionais e econômicos",
      "graph": "case",
      "dependencies": [
        "S02"
      ],
      "executionClass": "deterministic",
      "effect": "propose_state",
      "maturity": "specified",
      "readingStrategies": [
        "structured_query"
      ],
      "ordinal": 26,
      "batch": 17
    },
    {
      "id": "S04",
      "label": "Mapear garantias e haircuts",
      "graph": "case",
      "dependencies": [
        "D06",
        "C09"
      ],
      "executionClass": "deterministic",
      "effect": "propose_state",
      "maturity": "specified",
      "readingStrategies": [
        "exhaustive_corpus",
        "original_vs_amendment",
        "structured_query"
      ],
      "ordinal": 27,
      "batch": 15
    },
    {
      "id": "S05",
      "label": "Desenhar alternativas",
      "graph": "case",
      "dependencies": [
        "S01",
        "S03",
        "S04"
      ],
      "executionClass": "judgment",
      "effect": "propose_state",
      "maturity": "specified",
      "readingStrategies": [
        "structured_query",
        "semantic_retrieval"
      ],
      "ordinal": 28,
      "batch": 18
    },
    {
      "id": "S06",
      "label": "Pesquisar preço e termos comparáveis",
      "graph": "knowledge",
      "dependencies": [
        "S05"
      ],
      "executionClass": "research",
      "effect": "none",
      "maturity": "specified",
      "readingStrategies": [
        "exact_search",
        "semantic_retrieval"
      ],
      "ordinal": 29,
      "batch": 19
    },
    {
      "id": "S07",
      "label": "Calcular custo total",
      "graph": "case",
      "dependencies": [
        "S05",
        "S06"
      ],
      "executionClass": "deterministic",
      "effect": "propose_state",
      "maturity": "specified",
      "readingStrategies": [
        "structured_query"
      ],
      "ordinal": 30,
      "batch": 20
    },
    {
      "id": "S08",
      "label": "Definir covenants e proteções",
      "graph": "case",
      "dependencies": [
        "C08",
        "S05"
      ],
      "executionClass": "judgment",
      "effect": "propose_state",
      "maturity": "specified",
      "readingStrategies": [
        "exhaustive_corpus",
        "original_vs_amendment",
        "threshold_scan"
      ],
      "ordinal": 31,
      "batch": 19
    },
    {
      "id": "S09",
      "label": "Fechar sources and uses",
      "graph": "case",
      "dependencies": [
        "S05"
      ],
      "executionClass": "deterministic",
      "effect": "propose_state",
      "maturity": "specified",
      "readingStrategies": [
        "structured_query"
      ],
      "ordinal": 32,
      "batch": 19
    },
    {
      "id": "S10",
      "label": "Comparar alternativas",
      "graph": "case",
      "dependencies": [
        "S07",
        "S08",
        "S09"
      ],
      "executionClass": "deterministic",
      "effect": "propose_state",
      "maturity": "specified",
      "readingStrategies": [
        "structured_query"
      ],
      "ordinal": 33,
      "batch": 21
    },
    {
      "id": "S11",
      "label": "Recomendar estrutura-alvo",
      "graph": "case",
      "dependencies": [
        "S10",
        "C11"
      ],
      "executionClass": "judgment",
      "effect": "propose_state",
      "maturity": "specified",
      "readingStrategies": [
        "structured_query",
        "semantic_retrieval"
      ],
      "ordinal": 34,
      "batch": 22
    }
  ],
  "parallelBatches": [
    [
      "M01",
      "M02"
    ],
    [
      "M03",
      "M04"
    ],
    [
      "M05",
      "C02"
    ],
    [
      "M06"
    ],
    [
      "D01"
    ],
    [
      "D02"
    ],
    [
      "D03"
    ],
    [
      "D04"
    ],
    [
      "D05"
    ],
    [
      "D06"
    ],
    [
      "D07",
      "C01",
      "C05",
      "C06"
    ],
    [
      "C03"
    ],
    [
      "C04",
      "C07"
    ],
    [
      "C08"
    ],
    [
      "C09"
    ],
    [
      "C10",
      "S04"
    ],
    [
      "C11",
      "S01",
      "S02"
    ],
    [
      "S03"
    ],
    [
      "S05"
    ],
    [
      "S06",
      "S08",
      "S09"
    ],
    [
      "S07"
    ],
    [
      "S10"
    ],
    [
      "S11"
    ]
  ]
}
$fixture$::jsonb;
 begin
select id into j from public.processing_jobs where organization_id='20000000-0000-4000-8000-000000000901' and kind='execution_brief_proposal';
update public.processing_jobs set status='leased',capability_sha256=extensions.digest(repeat('c',64),'sha256'),lease_expires_at=now()+interval '10 minutes' where id=j;
c:=public.worker_load_execution_brief_proposal_v2(j,repeat('c',64));r:=public.worker_record_execution_brief_proposal_v1(j,repeat('c',64),fixture_internal,fixture_visible,c->>'input_fingerprint',fixture_plan);perform set_config('request.jwt.claims',jsonb_build_object('sub','10000000-0000-4000-8000-000000000901','role','authenticated','aal','aal1')::text,true);
perform public.approve_advisor_execution_brief_v1((c#>>'{project,id}')::uuid,(r->>'execution_brief_id')::uuid,(select brief_fingerprint from public.capital_project_execution_briefs where id=(r->>'execution_brief_id')::uuid),gen_random_uuid());
perform set_config('request.jwt.claims','',true);
if not private.execution_dispatch_is_current('80000000-0000-4000-8000-000000000901',true) then raise exception 'first approval was not current'; end if;

update public.intake_field_candidates set normalized_value='"transport"',reviewed_at=clock_timestamp() where id='51000000-0000-4000-8000-000000000901';
insert into public.processing_jobs(id,organization_id,intake_session_id,processing_run_id,kind,status,payload) values('80000000-0000-4000-8000-000000000902','20000000-0000-4000-8000-000000000901','40000000-0000-4000-8000-000000000901','70000000-0000-4000-8000-000000000901','case_analysis','queued','{"analysis_scope":"full_case"}');
select id into j from public.processing_jobs where payload->>'approval_target_job_id'='80000000-0000-4000-8000-000000000902';
update public.processing_jobs set status='leased',capability_sha256=extensions.digest(repeat('c',64),'sha256'),lease_expires_at=now()+interval '10 minutes' where id=j;
c:=public.worker_load_execution_brief_proposal_v2(j,repeat('c',64));-- Storage/lifecycle regression: change the declared fingerprint only. The
-- compiler hash algorithm is tested separately; SQL must enforce revision lineage.
fixture_internal:=jsonb_set(fixture_internal,'{fingerprint}',to_jsonb(repeat('b',64)));
fixture_visible:=jsonb_set(fixture_visible,'{fingerprint}',to_jsonb(repeat('b',64)));
begin
  perform public.worker_record_execution_brief_proposal_v1(j,repeat('c',64),fixture_internal,fixture_visible,repeat('0',64),null);
exception when serialization_failure then rejected:=true; end;
if not rejected or (select count(*) from public.capital_project_execution_briefs where organization_id='20000000-0000-4000-8000-000000000901')<>1 then raise exception 'stale input inserted revision'; end if;

r:=public.worker_record_execution_brief_proposal_v1(j,repeat('c',64),fixture_internal,fixture_visible,c->>'input_fingerprint',null);
if (select status from public.processing_jobs where id='80000000-0000-4000-8000-000000000902')<>'awaiting_approval' then raise exception 'second target was released without consent'; end if;

 if (select count(*) from public.capital_project_execution_briefs where organization_id='20000000-0000-4000-8000-000000000901')<>2 then raise exception 'expected two revisions'; end if;

if not exists(select 1 from public.capital_project_execution_briefs child join public.capital_project_execution_briefs parent on parent.id=child.parent_brief_id where child.organization_id='20000000-0000-4000-8000-000000000901' and child.brief_version=2 and parent.brief_version=1) then raise exception 'revision parent missing'; end if;

if private.execution_dispatch_is_current('80000000-0000-4000-8000-000000000901',true) or private.execution_dispatch_is_current('80000000-0000-4000-8000-000000000902',true) then raise exception 'new revision inherited consent'; end if;
 end; $diag$;
select 'two revisions, correct parent, no inherited consent' as result; rollback;