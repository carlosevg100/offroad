# Revisão do inventário de segurança por onda

Em 14 de setembro de 2026, o fundador autorizou a revisão do inventário pela onda de execução, substituindo a janela fixa de sete dias. A onda 1 abrange a Etapa 0 e as correções 1A, 1B e 1C. O aceite do fundador encerra a onda atual; uma onda seguinte depende de novo OK. Esta política rege a atualidade da revisão do inventário, não amplia o escopo de execução autorizado.

## Contrato de revisão

O inventário e seu contrato canônico registram `waveId`, `reviewCadence: per_wave`, `waveStatus` e `materialChangeState`. O contrato canônico fica fora do payload recebido pelo avaliador. A onda precisa estar reconhecida, aberta e com a revisão das mudanças materiais concluída. Onda fechada, identificador divergente ou `review_required` bloqueiam a validação. `reviewDueAt` é nulo quando não há prazo temporal aprovado; uma data declarada continua sujeita à comparação canônica e ao relógio real. Não se inventa nova data para fazer o teste passar.

A política de onda não renova fatos. Antes do relatório de fechamento, o responsável técnico reconcilia o inventário com as mudanças entregues, coleta novas evidências pertinentes e registra o resultado. O fechamento técnico arquiva a revisão final identificada pela onda e encerra a autorização de execução no processo. O registro histórico fechado não habilita execução posterior. Não se faz um merge isolado de canônico `closed` deixando o snapshot atual e seus consumidores inconsistentes. Depois do OK da próxima onda, a renovação do snapshot ativo, contrato e manifesto ocorre atomicamente, com nova identidade e evidências pertinentes, preservando a revisão anterior fechada no histórico. Até esse OK, nenhuma nova onda fica autorizada: a validação técnica de um snapshot não constitui autorização de execução. Trocar somente o identificador ou a data no payload é recusado pelo fingerprint e pela autoridade canônica. Os testes negativos exercitam registros fechados e desconhecidos sem exigir que o snapshot ativo seja substituído por uma onda futura ainda não autorizada.

## Mudança material durante a onda

Alteração de autorização, RLS, identidade privilegiada, fluxo de dados, armazenamento, modelo/provedor/recurso, credenciais, infraestrutura, dependências de implantação ou premissa material de segurança exige revisão antes de usar o inventário como prova atual. O responsável pela mudança marca `materialChangeState: review_required`, identifica o impacto, revisa fontes e controles afetados e registra evidência. Somente uma revisão concluída permite restaurar `reviewed` no contrato e no inventário. Mudança na sequência aprovada deve ser reportada ao fundador antes de ocorrer.

O hash do snapshot detecta adulteração do payload em relação ao conteúdo canônico; hashes de arquivos e autoridade de coleta vinculam as evidências. Esses mecanismos não detectam automaticamente toda mudança remota. A identificação de alterações materiais é também uma responsabilidade do processo de mudança e de fechamento da onda. Ausência de alerta automático não comprova ausência de mudança.

## Validade da evidência

| Classe | Regra |
|---|---|
| Arquivo de repositório | `immutable`, commit e hash verificáveis; representa aquele conteúdo versionado |
| Contrato ou snapshot temporal externo | `time_bound`, coleta e expiração explícitas; expiração continua bloqueando pelo relógio real |
| Observação operacional revisada na onda | Pode usar `wave_bound`, vinculada à onda canônica, `validThrough: null` e sem fingerprint de commit; bytes, coletor e autoridade continuam fixados |

Uma observação não equivale a certificação nem atestado de permissões efetivas. A observação AWS de 14 de setembro registra consultas somente de leitura ao repositório e à API do GitHub, feitas pelo Codex com a sessão existente. Permissões IAM efetivas permanecem desconhecidas. Não se reclassifica contrato ou snapshot externo como observação para remover expiração. Evidência `wave_bound` de outra onda é recusada, mesmo se o restante do payload tentar declarar uma nova onda.

## Evidência técnica

Os testes de `packages/release-governance/src/security-current-state.test.ts` verificam onda fechada, onda desconhecida, mudança material pendente, renovação fabricada, recusa de remoção da expiração de contratos/snapshots e expiração temporal ainda efetiva. Permanecem as verificações de relógio interno, captura futura, hash de conteúdo, origem, coletor, manifesto canônico e proibição de converter observação em fato atestado.

Esta política não registra uma aprovação de conteúdo do primeiro procedimento nem um OK de onda futuro. Os dois atos continuam pertencendo ao fundador.
