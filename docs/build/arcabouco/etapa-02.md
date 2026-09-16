# Etapa 2: identidade e contexto explícito

Esta é a publicação aditiva da etapa, ainda não seu fechamento. O contrato de pronto inclui retirar a ponte de cadastro legado depois que a aplicação nova estiver implantada, CI de main e web/worker no mesmo commit. Etapas dependentes permanecem fora desta entrega.

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

As duas migrações estão aplicadas. Arquivos seguem os carimbos de produção; tipos foram gerados de produção. Inventário revisto: 1.421 objetos em produção e 1.482 em staging. As 61 superfícies exclusivas de staging continuam congeladas. Não houve mudança nas duas memberships nem nos 159 grants existentes, conferidos por contagem e fingerprint. As duas organizações receberam suas contas comerciais, sem vínculo ausente. Advisors de segurança: zero achados em ambos os ambientes.

A comparação global encontrou seis diferenças anteriores nos corpos das funções: cinco são comentários ou linha vazia; `job_failure_class` contém em staging dois ramos individuais já cobertos pelo ramo `IN` idêntico de produção. Não há diferença executável nos contratos desta etapa. Essas diferenças antigas não foram reescritas nem tiveram seus journals alterados.

## Testes executados

- `explicit_workspace_context.sql`: PASS em staging instalado; espaço pessoal, aceite sem cargo/representação, idempotência, convite, vínculo revogado, ambiguidade, preferência, capacidades e conta comercial sem acesso implícito.
- `workspace_replay_authority.sql`: os dois comandos de replay revelavam identificadores a membro sem grant antes da correção. O candidato nega membro sem acesso e contexto errado, preservando replay autorizado. A correção foi aplicada nos dois ambientes.
- `rls_non_interference.sql`: PASS em staging, incluindo negação de acesso direto aos novos metadados.
- Oito regressões SQL: criador, perfil, recursos legados, revogação de jobs, financiador, leitura sem escrita, contexto sem cargo e administração pelo cliente passaram em staging.
- Navegador contra staging: espaço pessoal sem companhia, termos sem representação e sem cargo, duas abas, cookie adulterado, POST direcionado para outro contexto, header interno forjado e largura móvel passaram. Os dados são exclusivamente sintéticos de staging. A identidade do navegador foi revogada, suas sessões removidas e o login bloqueado; a aceitação sintética imutável permanece identificada em staging, sem desativar seu trigger de preservação.
- `workspace-context.spec.ts` integra esses cenários à CI local, incluindo cadastro por OTP. As jornadas antigas usam uma fixture explícita de cliente existente depois de comprovar o novo cadastro pessoal; o helper recusa serviços fora de localhost.

## Transição e retirada

O seed temporário preserva somente durante a troca da aplicação as capacidades que o cadastro antigo atribuía. O próximo incremento desta mesma etapa retira essa derivação para organizações novas e transforma `initialize_professional_onboarding` em adaptador para o cadastro pessoal. Dados e concessões existentes são preservados. Não é permitido encerrar a etapa com essa ponte ativa.

Após a criação de espaços pessoais, rollback exige uma aplicação que reconheça workspace sem onboarding; uma versão anterior a esse contrato não é alvo válido. Rollback da aplicação não restaura os atalhos de replay, criador, leitura ampla ou cargo no raciocínio. As telas administrativas comerciais continuam adiadas; os contratos e testes permanecem. Não há novo provedor, chamada de modelo ou efeito externo nesta entrega.
