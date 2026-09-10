# Workspace analítico do financiador: contrato de capacidades e de tenant

Este documento é o contrato que a migração `financier_analytical_workspace` e a interface do
workspace implementam. Ele diz o que uma organização do tipo `capital_provider` (equipe de
crédito, gestora, analistas de investimento) pode fazer por conta própria, o que continua
fechado e por qual RPC, política ou guard cada regra é aplicada. Base auditada: `220a37f`, com
as definições efetivamente instaladas no branch `staging` em 10 de setembro de 2026.

Regra central: **analisar uma companhia não significa representá-la**. A análise própria do
financiador não autoriza divulgar o caso, originar uma oferta, acessar documentos de outro
tenant, contatar participantes nem declarar aprovação de crédito. Ler documentos compartilhados
não autoriza copiá-los para outro workspace.

## 1. As quatro capacidades

O produto separa quatro capacidades. A organização financiadora recebe a primeira; as outras
três permanecem com as regras que já existiam. A matriz mora no banco, em
`private.organization_has_workspace_capability(organization_type, capability)`, e cada comando
que cria estado a consulta por meio de `private.require_workspace_capability`, que recusa com
`workspace_capability_denied` (SQLSTATE 42501) e o detalhe `capability=<nome>`.

| Capacidade | company | originator | capital_provider | O que autoriza |
|---|---|---|---|---|
| `own_analysis` (análise própria) | sim | sim | sim | criar projetos e pastas, aceitar os termos do workspace, registrar e ler os próprios documentos, responder lacunas, continuar no mesmo projeto |
| `mandate_management` (gestão de mandatos) | não | não | sim | fundos, versões de mandato e contatos da organização |
| `origination_representation` (originação e representação) | sim | sim | não | declarar representação da companhia, declarar a necessidade de capital em nome dela, confirmar o case em oportunidade, entradas públicas de visão de dívida e tese de originação |
| `external_disclosure` (divulgação externa) | sim | sim | não | preparar e autorizar planos de introdução qualificada |

O papel profissional (analista, gestor, comitê) orienta exemplos e tarefas na interface. Ele
nunca substitui membership ativa e permissões no banco.

## 2. Onde cada capacidade é aplicada

### 2.1 Análise própria

| Operação | Mecanismo | Regra |
|---|---|---|
| Ler o workspace exibido | `public.get_workspace_bootstrap` | membership ativa mais antiga; qualquer tipo de organização |
| Criar projeto pela conversa | `public.start_advisor_project_v1`, `start_advisor_project_in_group_v1`, `start_provider_research_project_v1` | `own_analysis` na organização exibida; `origination_thesis` exige além disso `origination_representation` |
| Criar pasta | `public.create_workspace_project_group` | `own_analysis` na organização exibida |
| Renomear, arquivar, ajustar identidade do projeto | `public.manage_workspace_project`, `public.update_workspace_project` | `own_analysis`; a sessão precisa pertencer à organização exibida |
| Aceitar os termos do workspace | `public.accept_private_workspace_terms`, `public.start_financier_analytical_workspace_v1` | durante o onboarding, a jornada `capital_provider` é admitida; fora dele, apenas owner ou admin da organização exibida |
| Promover projeto público a privado | `public.authorize_capital_project_private_work` | exige o aceite dos termos; não altera `representation_kind` nem `representation_status` |
| Registrar e remover documentos | `public.register_intake_document_command`, `public.remove_intake_document_command` | guard `private.intake_session_for_update` (company, originator, capital_provider, offroad); o caminho do objeto precisa começar com `<organização>/<sessão>/`; o projeto precisa estar `authorized_private` (trigger `require_authorized_private_document`) |
| Ler sessões, documentos, recibos, conversa, plano | políticas `document_intake_sessions_select`, `source_documents_select`, `intake_domain_events_select`, `agent_*_select`, `capital_project_*_select` | tipo de organização na lista acima e membership ativa; tabelas filhas usam `private.can_access_intake_session` |
| Responder lacunas e continuar | `public.record_intake_information_command`, `submit_advisor_information_response_v1`, `submit_advisor_turn_v1`, `approve_advisor_execution_brief_v1` | guard analítico ou `private.can_access_capital_project` |
| Processamento determinístico e leitura de linhagem | `begin_intake_processing`, `complete_intake_processing`, `record_document_verification`, `claim_case_brief`, `record_case_model_spend`, `read_processing_model_lineage`, `can_review_intake_claims` | mesma lista de tipos do guard analítico |

### 2.2 Gestão de mandatos

Políticas `funds_all`, `mandate_versions_all`, `provider_contacts_*`: apenas `capital_provider`
e `offroad`. Nada muda. O painel de fundos e mandatos passa a viver em `/app/mandates`, com uma
entrada fixa na navegação do financiador.

### 2.3 Originação e representação

| Operação | Mecanismo | Resultado para o financiador |
|---|---|---|
| Projeto privado com declaração de representação | `public.start_workspace_capital_project_v2` (via `private.start_workspace_project`) | `workspace_capability_denied` |
| Entradas públicas de visão de dívida e tese de originação | `public.start_public_company_debt_view_v1`, `start_public_origination_thesis_v1`, `start_public_onboarding_capital_project` (via `private.start_public_capital_project`) | `workspace_capability_denied` |
| Projeto de tese de originação pela conversa | `public.start_advisor_project_v1` com `origination_thesis` | `workspace_capability_denied` |
| Declarar a necessidade de capital em nome da companhia | `public.record_intake_capital_need_command` | `workspace_capability_denied` |
| Declarar a organização membro como tomadora | `public.set_intake_operation_context_command` | `workspace_capability_denied` |
| Confirmar o case em oportunidade | `public.confirm_document_intake` (wrapper e `confirm_document_intake_base`) | `workspace_capability_denied` |
| Vincular sessão a oportunidade | `public.attach_intake_session_to_opportunity` | `workspace_capability_denied` |
| Autorização, verificação e revogação de assessor | `record_advisor_authorization_command`, `verify_advisor_authorization_command`, `revoke_advisor_authorization_command` | recusa por jornada diferente de `originator`, como já acontecia |

Os comandos que originam usam o guard `private.intake_session_for_origination`, que herda o
guard analítico e acrescenta a lista `company`, `originator`, `offroad` e a exclusão explícita da
jornada `capital_provider`.

### 2.4 Divulgação externa

`public.prepare_qualified_introduction_plan` verifica membership, papel owner ou admin e, agora,
a lista `company`, `originator`, `offroad`. `authorize_qualified_introduction_plan` continua
exigindo `representation_status = 'verified'`, estado que uma sessão de análise própria nunca
alcança porque permanece `not_claimed`.

## 3. Operações permitidas e negadas por tipo de organização

| Operação | company | originator | capital_provider |
|---|---|---|---|
| Conversa inicial, projetos recentes, pastas, navegação do trabalho | sim | sim | sim |
| Projeto privado pela conversa (documentos anexados) | sim | sim | sim, após o aceite dos termos |
| Projeto público pela conversa (`company_debt_view`, `capital_planning`, `review_existing_operation`, `structure_from_documents`) | sim | sim | sim |
| Projeto `origination_thesis` | sim | sim | não |
| Entrada `/app/new/company-debt` e `/app/new/origination` | sim | sim | não; a interface explica em vez de oferecer o botão |
| Projeto legado com declaração de representação (`/app/new`, modo escolha) | sim | sim | não; a interface mostra a entrada analítica |
| Documentos privados: envio, registro, remoção, leitura, download | sim | sim | sim, no próprio tenant |
| Aceite dos termos e direito de uso das informações | sim | sim | sim, com declaração de uso sem representação |
| Fundos, mandatos e contatos | não | não | sim |
| Confirmar oportunidade, declarar necessidade de capital, representar a companhia | sim | sim | não |
| Introdução qualificada | sim (owner ou admin, representação verificada) | sim (idem) | não |

## 4. Regra do tenant único

Bootstrap, criação, upload, leitura e execução precisam concordar sobre a organização.

**Antes**: `get_workspace_bootstrap` exibia a membership ativa mais antiga de qualquer tipo,
enquanto nove criadores escolhiam a membership ativa mais antiga **entre company e originator**
(`start_advisor_project_v1`, `create_workspace_project_group`, `get_workspace_project_setup`,
`manage_workspace_project`, `update_workspace_project`, `start_workspace_project`,
`start_public_capital_project`, `start_onboarding_intake`, `start_public_onboarding_capital_project`).
Um usuário cuja membership mais antiga fosse em uma gestora criaria o projeto, sem aviso, na
organização company seguinte.

**Agora**: um único resolvedor, `private.workspace_membership_v1()`, devolve a membership ativa
mais antiga (desempate pelo id da organização) e é usado pelo bootstrap e por todos os criadores
de workspace. Se a organização exibida não tem a capacidade exigida, o comando recusa com
`workspace_capability_denied`; ele nunca cai para outra membership do mesmo usuário. O upload
usa o caminho `<organização exibida>/<sessão>/...`, e o registro do documento valida esse
prefixo contra a sessão. Leitura e execução seguem as políticas por `organization_id` e
membership.

Os criadores de onboarding (`start_onboarding_intake`, `start_public_onboarding_capital_project`)
continuam resolvendo pela progressão de onboarding aberta mais recente, que é a mesma regra do
`get_onboarding_bootstrap`. O aceite dos termos segue a mesma ordem: progressão de onboarding
aberta primeiro; sem ela, a organização exibida, restrita a owner ou admin.

Limitação conhecida: um usuário com uma progressão de onboarding aberta em uma organização e o
workspace pronto em outra grava o aceite na organização do onboarding. Esse caso não existe no
fluxo do produto de hoje e permanece documentado aqui.

## 5. Termos do workspace e direito de uso das informações

O financiador aceita o mesmo Termo de Confidencialidade e Autorização de Trabalho Preliminar
(`platform_legal_documents`, chave `private_workspace_terms`, versão ativa). A declaração de
direito de uso é diferente: `private.financier_information_rights_statement(locale)` diz que a
organização está autorizada a usar as informações fornecidas na análise privada, sem representar
a companhia analisada e sem divulgar o caso. É esse texto que a interface mostra
(`get_onboarding_bootstrap` e `get_workspace_project_setup` o substituem no campo
`information_rights_statement` para organizações `capital_provider`) e é esse texto que
`organization_legal_acceptances.information_rights_statement` grava. A coluna
`authority_declared` fica nula no aceite do financiador; para company e originator ela continua
`true`, com o enunciado do documento.

A sessão analítica nasce com `representation_status = 'not_claimed'` e `representation_kind`
nulo. `authorize_capital_project_private_work` promove o projeto a privado sem tocar nesses
campos e sem inserir `project_representation_evidence`. A conversão que rotulava qualquer
organização não originadora como companhia já não existe na definição instalada; o teste
`supabase/tests/financier_analytical_workspace.sql` garante que ela não volte.

## 6. Onboarding e entrada do produto

- Onboarding do financiador: depois do contexto profissional, a tela inicial oferece começar a
  análise própria (aceite dos termos e entrada no workspace, sem fundo, mandato ou contato) ou
  cadastrar fundos e mandatos pelo caminho que já existia. A entrada analítica é
  `public.start_financier_analytical_workspace_v1`, que registra o aceite e conclui o onboarding
  em uma transação. Não há declaração de representação nesse caminho.
- `/app`: conversa inicial com exemplos de análise própria, projetos recentes, pastas e
  navegação do trabalho. A navegação leva a fundos e mandatos em `/app/mandates`.
- `/app/new`: sessões do financiador abrem no projeto correspondente; o modo de escolha mostra a
  entrada analítica e explica as operações indisponíveis (visão de dívida por formulário, tese de
  originação, declaração de representação, divulgação) em vez de oferecer um botão que o
  servidor recusaria. O aceite dos termos fica disponível ali para workspaces legados de
  financiadores que concluíram o onboarding pelo mandato.
- Conversa, plano, inventário, perguntas, modelos e materiais são os mesmos dos outros públicos.

## 7. Provas

- `supabase/tests/financier_analytical_workspace.sql`: entrada analítica, aceite sem
  representação, projeto privado, pasta, registro e remoção de documento, resposta, renomeação,
  leitura do próprio estado, promoção a privado sem representação; negativos para anônimo,
  membership revogada, outro tenant, vínculo de arquivo adulterado, troca de organização no
  comando, múltiplas memberships, documento privado sem autorização, originação, representação,
  divulgação e introdução; regressão de company e originator.
- `apps/web/e2e/financier-workspace.spec.ts`: jornada no navegador com um workspace sintético
  convertido para `capital_provider`.
- Vitest: `apps/web/src/lib/workspace/capabilities.test.ts` e
  `apps/web/src/lib/onboarding/state-machine.test.ts`.

## 8. O que este contrato não faz

Não promove pesquisa pública a mandato verificado, não libera R01 como recomendação externa,
não cria um motor separado para financiadores e não abre o corpus privado de um emissor para
quem só recebeu uma oportunidade compartilhada. O cadastro de fundos e mandatos depois de um
onboarding concluído pela análise permanece como trabalho futuro da frente de mandatos.
