# Etapa 17 / 3C: adaptador instalado de R01

R01 recebe representação explícita no contrato comum e cálculo interrompível, preservando o manifesto, o código e os resultados históricos. Este incremento instala e verifica o adaptador; o próximo vínculo de banco precisa validar proveniência, contabilidade e produtor antes de permitir que a fila aceite R01. O caminho legado continua ativo sob seus controles existentes.

## Identidade e limites

`deriveReceivablesExecutionProfile` aceita somente o pacote de metadados da release `r01-2026.09.06-v1`, com manifesto `17ee80ac7cd3ac22b8c0d5d90893cf89ad67eb129ad1fe1b6f26aa3b73d6d090` e artefato `25e7fb90c4dcb08f3550d4969762320e2a7592625cc15c8f0a61d6939610edb5`. O hash do pacote cobre manifesto, capability e fontes do executor; o chamador não pode alterar esse conteúdo e legitimá-lo com um hash novo. O build deriva o pacote do ledger publicado e imutável, sem resolver o motor pelo workspace atual.

O manifesto legado não tem orçamento numérico nem contratos tipados de componente. `originalBudget: null` conserva essa ausência. Os hashes novos de entrada/saída são descritores do adaptador: formato `published-artifact-schema-export.v1`, hash do artefato e nome do export de schema. Não representam contratos que teriam sido publicados no passado. Fórmulas permanecem cobertas pela closure do executor, sem inventar componentes individuais.

A política operacional `r01-runtime-containment.2026-09-22.v1` estabelece custo pago zero, zero chamadas e 31.000 ms. Não atribui esses números ao manifesto histórico. A capability fixada é conferida quanto a provedores e ferramentas vazios, providerRequired falso e efeito none; nenhuma ausência vira autorização por default. A thread aplica esse prazo independentemente do timer do chamador, além de abortar por shutdown ou perda de autoridade no processador comum. Limites adicionais: entrada e saída de 8 MiB, heap de 256 MiB e stack de 4 MiB. Nenhum desses limites é promessa de qualidade ou de latência ao usuário.

## Runtime e transição

`loadReleasedExecutionProfile` confere artefato e metadados em cada uso, inclusive após cache do módulo; o boot verifica capital e R01. `calculatePinnedMethod` seleciona somente exports literais dos dois executores instalados, usa programa fixo e passa input como dado. A thread não recebe ambiente, credencial ou capability. Schemas e matemática vêm do binário publicado. `processPinnedExecution` usa o mesmo binding, renovação, settlement e commit para os perfis suportados.

A prova R01 desse processador usa transporte simulado, com cálculo real e bytes canônicos; não equivale a prova de fila ou revogação SQL de R01. `createExecutionQueue` conserva a seleção exclusiva do manifesto de capital. Não há novo perfil no banco, DDL, backfill, concessão, produtor ou alteração dos caminhos de `specialist-method-runtime.ts` e `universal-dispatch-runtime.ts`. Esses caminhos só serão retirados quando seus substitutos completos passarem. A limpeza deste incremento reúne o programa de cálculo e a seleção de perfis, sem criar um segundo processador financeiro.

## Verificação e riscos

Vinte testes do perfil verificam identidade, descritores, origem do orçamento, imutabilidade e recusa de expansão. Seis testes do executor verificam todos os casos R01 registrados, schema, versão indisponível, aborto, prazo próprio e limite de bytes. Dois testes do processador comum verificam settlement/commit dos bytes R01 e recusa após retirada de autoridade. Um teste de empacotamento verifica metadados ausentes/adulterados e artefato adulterado após cache. Regressões de capital, R01, fila e orçamento permanecem obrigatórias. CI e produção pertencem ao completion, sem antecipar aprovação neste documento.

TRUST-APP-01, TRUST-AI-01 e TRUST-SDLC-01: integridade da versão, execução delimitada e ausência de egresso novo. Dados privados continuam no mesmo worker e em sua thread local, sem telemetria de conteúdo. Risco pendente atribuído à engenharia de execução no próximo vínculo de R01: implementar o adaptador SQL com a mesma política acumulada, proveniência dos inputs e produtor, provar revogação/retry no caminho real antes da ativação. Publicação autoritativa das origens derivadas de capital permanece exigida no incremento de artefato/produtor. Etapa 18 e ativação de clientes não integram esta entrega.

Reversão retorna à imagem anterior; não há estado novo de banco a desfazer. Os arquivos de release e carimbos permanecem imutáveis. Web e worker no mesmo commit, check completo, CI e leitura do catálogo/journal sem mudança são requisitos de fechamento.
