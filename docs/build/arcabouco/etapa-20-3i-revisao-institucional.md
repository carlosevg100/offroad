# Etapa 20 / 3I: revisão humana do conteúdo institucional

Status: migrações instaladas nos dois ambientes e inventário conciliado; CI final, merge e deploys pendentes. Não inicia etapas 21–24.

O resultado institucional que tem binding nativo é lido dos blocos imutáveis e comparado ao envelope persistido. O leitor retorna a revisão exata; cada resultado de comparação recebe sua própria validação. Somente o resultado histórico sem captura conserva o contrato anterior. Resultado capturado sem binding nega leitura, cópia, liberação e revisão direta, inclusive por derivação. O contraponto legado de um resultado nativo e seus derivados ficam bloqueados para impedir recuperação da aprovação histórica.

A pessoa aprova, comenta, solicita ajustes ou revoga a aprovação sobre revisão, fingerprint e audiência exatos. A autoridade vem da sessão, do acesso ao trabalho e das responsabilidades vigentes no banco. Autoaprovação exige regra permitida e declaração explícita. Tentativa repetida após falha de conexão conserva commandId. O ato não publica nem envia materiais e não aprova outro formato ou versão.

Os downloads de financial-results fixam a revisão nativa. A cópia de um workbook em materiais resolve o binding pelo fingerprint exato, sem escolher o resultado mais recente. As duas rotas revalidam depois da renderização. Verificação de bytes e headers usam a mesma revisão; manifesto sem bytes permanece unpinned. Cálculo e hashes PT/EN não mudam.

## Verificação e revisão

- Contrato SQL novo em staging sob BEGIN/ROLLBACK: conteúdo íntegro, declaração obrigatória, replay único, aprovação, revogação, fingerprint divergente, derivado do ancestral legado bloqueado, fonte revogada e replay negado. Sem dados residuais.
- Testes de rotas e binding: 43 passaram; parser e ação: 13 passaram. Gate local completo: 44 tarefas passaram. A CI continua necessária.
- Revisão independente encontrou e fechou dois achados: aprovação herdada por derivado do ancestral legado e atribuição dos bytes à revisão errada. Sem bloqueador estático residual; promoção condicionada ao gate completo e às provas dinâmicas.
- O E2E institucional existente passa a cobrir aprovação do conteúdo, recarga e revogação. Todos os SQLs novos entram automaticamente no job de contratos. As corridas reais de revisão e captura permanecem gates.

## Segurança e recuperação

Controles afetados: IAM-05, APP-04, APP-11, AI-09, SDLC-08 e SDLC-10. Dados: conteúdo financeiro privado e metadados de revisão, sempre no tenant e trabalho autorizados. Abusos cobertos: troca de projeto/revisão, organização injetada, autoaprovação sem declaração, replay após revogação, ancestral como atalho e autoridade perdida durante renderização. Nenhum grant de cliente no helper de conteúdo; lookup público somente authenticated, com verificação de acesso no servidor.

Não reverter para leitores antigos que possam servir o contraponto legado bloqueado. Se o novo fluxo falhar, suspender a capacidade institucional e corrigir por migração aditiva; preservar revisões e atos imutáveis. Captura de catálogo, journal, tipos e funções efetivas somente depois da aplicação real. Fechamento exige CI, main, produção, web e worker no mesmo commit e comprovação de boot.

## Histórico: bloqueio descoberto no E2E de 29/09/2026

CI preliminar `36560374405`, commit `3f40e383`: Quality passou; todos os contratos SQL passaram, assim como oito corridas de autoridade de revisão e doze de projeção/leitura nativa. Banco recusou somente o snapshot antigo de `read_institutional_model_results_v1`, cuja captura corrigida está nesta branch. E2E: 43 passaram, 16 condicionais foram pulados e um falhou em duas tentativas. Aprovação explícita, recarga, revogação e os quatro downloads do primeiro resultado passaram; após adotar o segundo cálculo, não existe o link com revisão nativa exigido pelo teste (`institutional-setup.spec.ts:237`).

Diagnóstico estático confirmado por revisão independente: um novo setup recebe `parent_fingerprint` da configuração anteriormente aprovada. `institutional_configuration_capture_state_v1` recusa `initial_configuration` com pai como `parent_lineage_unclassified`; a ancestralidade e o fechamento não ficam provados, e o escritor v3 conserva o resultado com projeção inelegível. O draft 3I distingue nativo apenas pela existência do binding, portanto esse resultado prospectivo pode recuperar o caminho legado. A causa específica do recibo da CI não foi lida diretamente do banco efêmero; o sintoma foi reproduzido em ambas as tentativas e é consistente com essa cadeia no código.

Não reduzir a exigência do teste para aceitar o legado. Recomendação: antes do corte 3I, corrigir por migração aditiva a prova do setup com pai: validar o próprio snapshot, o pai exato, ausência de ambiguidade e a união das fontes; negar pai ausente ou sem prova. Separadamente, o leitor deve distinguir histórico sem captura de cálculo prospectivo inelegível e negar o fallback de aprovação/download do segundo. Repetir o E2E exigindo revisão nativa no segundo cálculo e os negativos de linhagem/revogação.

Alternativa segura: publicar apenas a contenção da leitura prospectiva inelegível e manter o recálculo governado indisponível até completar a prova. Não recomendada como fechamento de 3I, pois deixa a jornada interrompida.

Responsável: executor desta PR. O fundador respondeu "ok" à correção desta dependência dentro da etapa 20. O registro acima descreve o bloqueio anterior à aplicação em staging. A correção está autorizada; próxima ação é concluir os gates e publicar. PR permanece em draft durante a verificação; não é completion.

## Histórico: correção autorizada em 29/09/2026

O draft não aplicado foi consolidado em `institutional_setup_parent_lineage`, numa transação única. `private.institutional_setup_parent_pins` fixa o pai no contexto entregue ao preparador, com vínculo exato de trabalho, configuração e fingerprint. A persistência usa esse pai mesmo após outra aprovação; replay não o substitui. A ancestralidade valida todos os setups e contribuições em até 128 nós, reunindo as fontes e versões de direitos de cada setup. Não há backfill de prova histórica.

O predicado privado `institutional_revision_missing_native_v1` é compartilhado pela liberação e pelo controle de revisão. O teste negativo chama a RPC de aprovação diretamente sobre uma revisão sem legado nem fontes, que referencia um resultado capturado inelegível: nenhum ato é gravado. Conteúdo e cópia pelo fingerprint também são negados. O motivo exibido usa a mensagem existente de resultado não verificável.

Provas preliminares em staging, sempre BEGIN/ROLLBACK: `institutional_native_human_review.sql` passou com o negativo de aprovação direta e cópia; `institutional_setup_parent_lineage.sql` passou com aprovação interveniente, cadeia setup/contribuição/setup, replay e imutabilidade do pai. O teste de duas sessões foi acrescentado ao checker de concorrência de captura já ligado na CI; ainda precisa executar na base descartável da CI. Gate local completo em andamento. Nenhuma alteração permanente de ambiente nesta rodada.

## Histórico: verificação do candidato c8aa0add e correção adicional

CI `36569372150`: check e segurança passaram; contratos SQL, nove corridas de captura do setup (incluindo aprovação concorrente), demais corridas e funções efetivas passaram. Inventário negou os arquivos e a rota ainda não conciliados e a migração ainda ausente de produção. E2E institucional passou, incluindo o segundo resultado nativo. E2E combinado de execução/modelo falhou nas duas tentativas ao aprovar o segundo setup depois de uma nova versão de fonte.

`approvedConfigurations` é filtrado pela elegibilidade atual das fontes; não pode ser a identidade editorial do pai. Migração aditiva `institutional_setup_parent_identity` captura `setupParent` sob o lock do projeto e valida id, fingerprint, revisão e trabalho. Ausência do campo conserva classificação anterior; null explícito não procura outro pai. Capturas antigas não são reescritas. Prova `institutional_setup_parent_source_change.sql`: antes, falha por perda do pai; depois, passa com pai exato, três versões de fonte, replay e imutabilidade.

A primeira migração foi instalada em staging com carimbo `20260929124911`, com revisão humana e cadeia mista retestadas e advisor de segurança zero. A segunda aplicação está registrada a seguir; produção não alterada e completion pendente.

Staging confirmado em 29/09: `20260929124911` (`institutional_setup_parent_lineage`, md5 `c7665037bbee94957b5fd6c4e5ce3281`) e `20260929131006` (`institutional_setup_parent_identity`, md5 `5845586101b154ce36111581c4df19f0`). Conteúdo dos arquivos idêntico aos statements do journal. A migração adicional passou no teste instalado de troca de fonte. Candidato `1522b34c` publicado para repetir a CI completa.

CI `36573328405`, candidato `1522b34c`: check, segurança, contratos SQL e corridas passaram; inventário/journal continuam pendentes de produção. O E2E combinado avançou por aprovação, recálculo e adoção, com resultado completed. Falhou somente no seletor antigo que exigia URL terminada em `/xlsx` e excluía a query `?revision=`. O teste passa a exigir binding existente, revisão exata na URL, download 200 e header `x-artifact-revision` correspondente; antes da adoção, nega qualquer URL do novo resultado, com ou sem query. Revisão independente aprovou o ajuste. Gate local completo passou novamente.

Prova adicional de fonte exclusiva ancestral: fixture estrutural mantém os bytes em outra sessão do mesmo trabalho; captura filha tem duas fontes e ancestralidade tem três. Após revogação, o snapshot filho continua autorizado, o ancestral perde autorização e a fonte permanece na cadeia. Passou em staging com rollback. Essa prova não é, isoladamente, uma execução do produtor final.

## Histórico: preflight do candidato 9d6dc5ee

`9d6dc5ee`, CI `36576332203`: check e Security `36576332018` passaram. Todos os contratos SQL e testes concorrentes passaram; o job de banco recusa exclusivamente os dois arquivos ainda ausentes do journal de produção e o inventário de migrações/entrypoint ainda não conciliado. Não houve relaxamento desses checkers. E2E continua em execução. As nove funções afetadas em produção foram relidas e conferem com a baseline pré-aplicação.

## Aplicação e conciliação

Migrações instaladas e conferidas em produção (`20260929135457`, `20260929135520`) e staging (`20260929124911`, `20260929131006`), com SQL idêntico nos journals e 14 definições de função iguais entre ambientes. Catálogos conciliados: 2.838 objetos em produção e 2.899 em staging; 14 novos objetos inventariados, nova ação de revisão registrada e tipos regenerados. Os 18 testes do checker passaram; segurança de produção sem alertas. Nenhum dado sintético criado em produção. CI preliminar `36576332203`: check e E2E passaram (44 testes, 16 condicionais não executados); banco recusou somente inventário/journal então pendentes, agora conciliados. Security `36576332018` passou. CI final, merge e deploys ainda pendentes.

Avisos de desempenho são informativos: a tabela nova ainda vazia aparece em `unused_index`; nenhum índice de integridade foi removido. Recuperação permanece por contenção da capacidade e migração aditiva, sem restaurar o caminho legado bloqueado.

Gate local repetido após regeneração e conciliação: 44/44 tarefas aprovadas. A tentativa inicial em sandbox recusou sockets locais usados por sete testes de scripts; repetição com a permissão necessária passou sem alteração de código/teste. Revisor independente confirmou migrações byte a byte e ausência de bloqueador para CI final.

## Estabilidade do teste de formatos

CI `36580381480` passou banco completo, incluindo inventário e journal; Security `36580381257` passou. Check encontrou um timeout de cinco segundos no teste que renderizava quatro formatos duas vezes dentro do mesmo caso. Separado em oito casos idioma/formato, mantendo duas datas e todas as assertions de bytes, fontes, cabeçalhos e RPCs, sem aumentar timeout nem alterar runtime/DDL. Teste focal: 26/26 passaram. Revisão independente aprovou o isolamento; gate local e CI são repetidos antes do merge.

A jornada E2E da mesma CI também passou. Gate local repetido após separação do teste: 44/44 tarefas aprovadas. Somente teste e este registro mudaram; DDL instalado e runtime permanecem os mesmos.
