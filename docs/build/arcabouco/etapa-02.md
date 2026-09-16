# Etapa 2: identidade e contexto explícito

O contrato aditivo e a retirada da ponte de cadastro estão implementados e instalados. O relatório de completion registra o fechamento somente após a CI de main e web/worker no commit final. Etapas dependentes permanecem fora desta entrega.

## Contrato instalado

`organizations.id` continua sendo o tenant. `workspace_kind` distingue espaço pessoal e institucional; pessoa, companhia analisada e conta comercial não são a mesma coisa. `private.commercial_accounts` e `private.account_organizations` contêm apenas vínculo comercial. Seus vínculos não são consultados pelo motor de acesso. `public.user_workspace_preferences` guarda preferência individual, sem resolver silenciosamente múltiplos vínculos.

`private.workspace_capability_grants` registra habilitações explícitas com revisão otimista. A aplicação recebe quatro capacidades do banco; texto de perfil ou tipo comercial não habilita botões nem comandos. Administração de capacidades exige vínculo administrativo ativo. Ela não concede representação de companhia, acesso a recurso ou autorização de publicação externa.

`initialize_workspace_v1` cria espaço pessoal e proprietário ativo atomicamente, sem CNPJ, cargo ou intake. O bootstrap reconhece espaços pessoais/institucionais sem inventar progresso de onboarding. A seleção por URL preserva duas abas; cookies não escolhem organização. Os comandos antigos de onboarding passam a usar a mesma seleção. Convites para espaços novos não fabricam uma jornada comercial.

As tabelas privadas têm RLS forçada e nenhum acesso direto de usuários. Preferências permitem somente leitura própria com vínculo ativo; escrita ocorre pelo comando validado. Vincular conta comercial exige administração de ambas as organizações e revisão esperada.

## Migrações e verificação

| Contrato | Produção | Staging | MD5 do SQL no journal |
|---|---|---|---|
| `explicit_workspace_context` | `20260916035105` | `20260916032913` | `d0449ef81c06cc9fc4268c38d8966870` |
| `explicit_workspace_replay_authority` | `20260916035119` | `20260916034952` | `0ea5f46340dbc8ed66a3be1ce434f52e` |
| `retire_implicit_workspace_capabilities` | `20260916041917` | `20260916041505` | `06182e535b21e95eb01a950bb6bf71db` |

As três migrações estão aplicadas. Arquivos seguem os carimbos de produção; tipos foram gerados de produção. Inventário revisto: 1.419 objetos em produção e 1.480 em staging. As 61 superfícies exclusivas de staging continuam congeladas. Não houve mudança nas duas memberships nem nos 159 grants existentes, conferidos por contagem e fingerprint. As duas organizações receberam suas contas comerciais, sem vínculo ausente. Advisors de segurança: zero achados em ambos os ambientes.

A comparação global encontrou seis diferenças anteriores nos corpos das funções: cinco são comentários ou linha vazia; `job_failure_class` contém em staging dois ramos individuais já cobertos pelo ramo `IN` idêntico de produção. Não há diferença executável nos contratos desta etapa. Essas diferenças antigas não foram reescritas nem tiveram seus journals alterados.

## Testes executados

- `explicit_workspace_context.sql`: PASS em staging instalado; espaço pessoal, aceite sem cargo/representação, idempotência, convite, vínculo revogado, ambiguidade, preferência, capacidades e conta comercial sem acesso implícito.
- `workspace_replay_authority.sql`: os dois comandos de replay revelavam identificadores a membro sem grant antes da correção. O candidato nega membro sem acesso e contexto errado, preservando replay autorizado. A correção foi aplicada nos dois ambientes.
- `rls_non_interference.sql`: PASS em staging, incluindo negação de acesso direto aos novos metadados.
- Oito regressões SQL: criador, perfil, recursos legados, revogação de jobs, financiador, leitura sem escrita, contexto sem cargo e administração pelo cliente passaram em staging.
- Navegador contra staging: espaço pessoal sem companhia, termos sem representação e sem cargo, duas abas, cookie adulterado, POST direcionado para outro contexto, header interno forjado e largura móvel passaram. Os dados são exclusivamente sintéticos de staging. A identidade do navegador foi revogada, suas sessões removidas e o login bloqueado; a aceitação sintética imutável permanece identificada em staging, sem desativar seu trigger de preservação.
- `workspace-context.spec.ts` integra esses cenários à CI local, incluindo cadastro por OTP. As jornadas antigas usam uma fixture explícita de cliente existente depois de comprovar o novo cadastro pessoal; o helper recusa serviços fora de localhost.

## Transição e retirada

A PR 622 publicou a aplicação compatível no commit `91edc0f152708f8fcd1fabbfff51f343a466eff9`, após Quality 35053933099 e Security 35053933160 verdes. O E2E passou em 31 testes, incluindo o novo cenário de contexto; 16 ensaios opcionais permaneceram desabilitados como na configuração anterior. Vercel 6473612590 e worker 35054695728, revisão ECS 331, publicaram esse commit antes da retirada em produção. A migração final remove os dois helpers baseados em texto comercial, mantém apenas análise própria como fundação e transforma `initialize_professional_onboarding` em adaptador para o cadastro pessoal. As concessões existentes permanecem preservadas.

Após a criação de espaços pessoais, rollback exige uma aplicação que reconheça workspace sem onboarding; uma versão anterior a esse contrato não é alvo válido. Rollback da aplicação não restaura os atalhos de replay, criador, leitura ampla ou cargo no raciocínio. As telas administrativas comerciais continuam adiadas; os contratos e testes permanecem. Não há novo provedor, chamada de modelo ou efeito externo nesta entrega.


## Eval da retirada

`no_implicit_workspace_capabilities.sql` verifica cinco rótulos, habilitação explícita, mudança de rótulo sem mudança de autoridade, cadastro legado sem cargo/intake e remoção dos helpers. Passou antes da aplicação em transação e depois no schema instalado. Os 60 contratos SQL passaram em staging com o candidato e rollback, registrados em `etapa-02-cutover-staging-tests.json`. As suítes históricas provisionam explicitamente suas capacidades de cliente existente por helper temporário, removido pelo rollback; os testes de identidade nova não o incluem. Foi conferida a ausência desse trigger no catálogo após os testes.

Os corpos de seed e cadastro têm hashes iguais nos dois ambientes: `6d9d7de4759f71a8578ea22588434bbe` e `fa5e95fc8e0193460f5cdc30bf660c7c`. Tipos regenerados após a retirada são idênticos. Ambos os checkers de catálogo/journal passaram; advisors de segurança seguem sem achados. Os avisos de desempenho permanecem anteriores ou informativos sobre índices ainda sem uso. Fingerprints de produção preservados: memberships `a6152cee54a077fa80fbe63faeed0e34`; grants `eee56e3686e5bda95667976a235f8128`.
