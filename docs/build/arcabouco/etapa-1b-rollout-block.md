# Etapa 1B — bloqueio de promoção, 15/09/2026

**Status: não concluída. Promoção interrompida; produção permanece na 1A.**

## O que foi feito

- PR 618 em rascunho, branch `fix/wave1-explicit-resource-access`; commits `62336fc5`, `42e1512c` e `f79cb340`. Nada desta PR foi mesclado.
- Staging recebeu `20260915195255_explicit_legacy_resource_access`, `20260915195930_resource_access_foreign_key_indexes` e `20260915201024_require_work_for_legacy_mutations`; carimbos conferidos ao vivo.
- Recursos e concessões revogáveis, autoridade humana dos jobs, administração de pessoas/acessos e seleção explícita da organização estão no candidato. A antecipação restrita da seleção de organização foi aprovada pelo fundador.

## Eval realizado

- `pnpm check`: lint, tipos, testes e build passaram, 43 tarefas. As 54 suítes SQL anteriores passaram contra staging instalado; `read_grant_cannot_mutate_legacy.sql` também passou após reproduzir a escrita indevida e aplicar a correção.
- HTTP real de Storage: membro sem concessão e link anônimo antigo retornavam 200; após a correção/rotação retornaram 400. Concessão explícita devolveu 200; revogação voltou a 400. Hash e 36 bytes do canário foram preservados.
- Navegador contra staging: administrador concede/revoga, download acompanha a autorização, membro sem poder administrativo é negado e duas abas mantêm organizações independentes. A revisão visual final após refinamento de estilos ainda está pendente.
- Supabase security advisor: zero lints. A CI inicial `35016064653` passou no quality check e nas suítes SQL; falhou no inventário ainda não promovido e em dois testes de navegador. As duas causas foram corrigidas: código de negação esperado e identidade sintética incompleta. As rodadas seguintes não constituem completion até todos os gates passarem.

## Produção: falha e rollback conferidos

A primeira migração foi recusada por `private.guard_execution_approval_queue()` com `execution_brief_approval_required`. A migração seguinte não foi tentada. O gatilho exige despacho vigente ao atualizar qualquer job cujo status seja `succeeded`, inclusive uma atualização que só preenche metadados de autorização. Há 12 jobs históricos concluídos nessa condição. Aprovação corrente e legitimidade de um registro histórico são verificações diferentes.

A consulta posterior confirmou `to_regclass('private.access_resources') IS NULL` e zero entradas das três migrações no journal de produção. Os 111 objetos privados não foram movidos. Web e worker continuam no commit publicado da 1A; não há implantação de 1B. Nenhum dado descartável foi criado em produção.

## Proposta concreta e opções

**Recomendação:** uma migração preparatória, anterior à migração principal em produção, corrige o gatilho exclusivamente para atualizações dos quatro metadados de autorização e `updated_at` em jobs já terminais, sem mudança de status, identidade, payload ou qualquer outro campo. Depois, a migração principal original pode ser reaplicada, mantendo seu texto imutável. O arquivo proposto é `proposed-terminal-job-authority-backfill.sql`, fora do diretório de migrações.

O ensaio da proposta foi feito em transação com rollback em staging: atualização de metadados passou; recolocar o job na fila sem aprovação e mudar seu payload foram negados. A proposta não foi aplicada persistentemente. Sua transformação em migração exige incluir o teste na CI e conferir a ordem de replay antes da promoção.

A outra opção segura é manter a produção na 1A e adiar a promoção da 1B. Desativar o gatilho, apagar os jobs históricos ou inventar aprovações não são propostas.

## Fora da entrega e próximo passo

Permanecem pendentes a correção preparatória, CI integral verde, inventário/journal de produção, merge, rotação real dos 111 objetos e deploy de web/worker no commit mesclado. A 1C não foi iniciada. Codex é responsável pela retomada da PR 618 após a orientação sobre este bloqueio; não há auto-merge autorizado pelo estado atual.

A pausa cumpre a regra do fundador: “Se travar, pare e reporte.” Este documento é relatório de bloqueio, não completion nem etapa “quase pronta”.

## Limpeza e conciliação

Os objetos sintéticos foram removidos pela API de Storage; usuários, organizações, recursos e token de worker de staging foram removidos. Contagens finais do namespace `a11f`: zero em todas essas classes. O servidor local de verificação foi parado.

A comparação de corpos de funções também identificou seis diferenças históricas fora da alteração 1B: quatro apenas em comentários, uma em linha em branco e uma com dois ramos redundantes de classificação de falha já cobertos pelo ramo seguinte. Foram conciliadas semanticamente por diff; nenhuma dessas funções foi alterada para esconder a diferença. Elas não são a causa deste bloqueio.
