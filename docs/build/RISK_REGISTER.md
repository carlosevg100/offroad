# Risk Register

| ID | Risco | Probabilidade | Impacto | Controle atual | Próxima ação | Owner |
|---|---|---:|---:|---|---|---|
| R-001 | conflito de marca/nome digital | média | crítico | identidade centralizada; site `noindex` | clearance jurídico e registral antes de launch | Executivo/Jurídico |
| R-002 | ato regulado apresentado como simples software | média | crítico | limite operacional explícito; ativação futura bloqueada | matriz jurisdição-instrumento-ato-parceiro | Jurídico/Compliance |
| R-003 | vazamento cross-tenant | baixa | crítico | RLS + FORCE RLS em todas as tabelas, FKs compostas, guard de tipo de org, teste de não interferência em CI a cada PR | papéis internos por permissão; revisão externa do threat model | Security/Data |
| R-004 | LLM criar fato ou número material | média | crítico | evidence compiler e math core determinístico definidos | contracts/evals antes de agente com dados reais | AI/Credit |
| R-005 | arquivo hostil executar no pipeline | média | crítico | nada é executado/parseado hoje (apenas hash recalculado no servidor); MIME allowlist no bucket | validação magic bytes, quarentena/malware e worker isolado antes do extrator geral | Security/Platform |
| R-006 | telemetria capturar dado financeiro/PII | média | alto | providers ainda não integrados; allowlist obrigatória | schema registry e negative tests em B12 | Data/Privacy |
| R-007 | dependência de providers sem portabilidade | média | alto | adapters e boundaries definidos | ADR por integração e fixture explícito | Architecture |
| R-008 | ~~repositório vazio sem base para PR~~ | - | - | resolvido em 2026-08-15 (`main` protegida, PRs #1–#49) | - | Engineering |
| R-009 | produção pública antes do clearance de marca | baixa | alto | produção ativa em `offroad.capital` mas `noindex`/`nofollow`; sem divulgação | clearance jurídico (D-001) antes de indexar/anunciar | Product/Platform |
| R-010 | design parecer cópia da Forward/Tier 1 | baixa | alto | tokens do Blueprint e composição product-first original | visual regression + review de originalidade | Design |
| R-011 | complexidade excessiva antes do wedge | média | alto | execução por gates e vertical slice | manter scope de cada PR verificável | Product/TPM |
| R-012 | custos externos sem budget | média | médio | criação paga exige cost confirmation | registrar budget e alertas por provider | Finance/Platform |
| R-013 | adotar dependências recém-publicadas antes da janela de observação | baixa | alto | lockfile fixo; dependabot só minor/patch para toolchain (majors ignorados) | revisar majors como migrações deliberadas | Security/Engineering |
| R-014 | fixture Rede Horizonte confundido com extrator geral | média | alto | conjuntos desconhecidos geram estado vazio honesto (E2E cobre); hash verificado no servidor; sem texto de fixture em produção | extrator geral escreve no mesmo contrato de candidatos; fixtures rotuladas sintéticas | Product/Engineering |
| R-015 | um único projeto Supabase é produção (sem staging) | alta | médio | E2E e testes de RLS rodam em stack local efêmero; nada de teste vai ao projeto | criar projeto/branch de staging antes de dados reais de clientes | Platform |
| R-016 | regenerar o data room quebra o casamento por hash | média | médio | 8 arquivos versionados em `packages/testing-fixtures/assets`, teste recalcula os hashes | atualizar hashes e arquivos juntos (README do fixture) | Engineering |
