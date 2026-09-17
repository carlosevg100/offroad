# Etapa 10: trabalho persistente

## Incremento 10A: fundação e consumidor compatível

A identidade física continua em `capital_projects.id`. `work_contexts` registra finalidade, audiência, prazo, compromisso, estágio e serviços autorizados sem cargo; nesta etapa o único serviço admitido por esse contrato é conversa. `work_dossiers` admite vários vínculos na mesma organização e só é legível com acesso ao trabalho **e** ao dossiê. Vínculo não concede autoridade nem libera conteúdo para o modelo.

Conversa, mensagens, runs e jobs recebem `work_id`. O backfill reconstrói somente a relação com o projeto já instalado. Sessões históricas permanecem. CHECKs e triggers impedem cruzar organização, conversa, execução ou trabalho. Só `work_conversation` admite job sem intake; os demais tipos conservam a exigência e os gates. A exceção de backfill no guard só admite adicionar a identidade derivada da sessão, sem mudar outro campo ou estado.

O consumidor v4 resolve esse novo tipo pela autorização direta do trabalho, conservando revisão, principal delegado, credencial, lease, finalidade e revogação. O consumidor v3 exclui o novo tipo. O worker v4 é implantado antes do incremento que habilita produtores. Não há Temporal.

Uma chamada limitada ao gateway existente produz resposta ou pergunta, sem ferramentas de pesquisa, cálculo, acesso a documentos, alteração de contexto ou efeitos externos. Contexto e transcrição pertencem exclusivamente ao trabalho; resposta é validada e persistida atomicamente com conclusão do job, depois de revalidar autoridade e fingerprint. Falha não persiste conteúdo de exceção do provedor. O contrato não promove um método financeiro nem demonstra qualidade profissional do primeiro procedimento.

## Verificação 10A

- Migração staging `20260917190805`; produção `20260917191714`. Sem fixtures em produção.
- 83 contratos SQL passaram em staging, com rollback. `explicit_execution_brief_approval.sql` passa a aceitar a negação antecipada exata `work_run_mismatch`, conservando a prova de que o dispatch não pode perder sua sessão.
- Seis testes novos do worker: tipo documental exige intake; conversa com identidade exata; identidade cruzada negada antes do modelo; ausência de canal de cargo/ativação; revogação antes de publicar; erro de provedor sem conteúdo em log.
- Tipos regenerados da produção; os dois checkers de inventário conferem superfícies e journal. Advisories de segurança: zero em ambos os ambientes. Índices novos têm cobertura das FKs; índices ainda não usados não são retirados durante o rollout.
- PR 650 mesclada em `2c272c36e938ebfc652937eb76d115594ab392b6`. Main Quality `35265839741`, Security `35265839744` e worker `35265839729` passaram; Vercel Production `6510664206`, ECS `359`, 1/1 tarefa, health atual sem backlog/bloqueio. Recibo externo `foundation-delivery.json`. Esta fundação não fecha a etapa 10.

## Próximo incremento da mesma etapa

Comandos `start_work_v1` e `append_work_turn_v1`, adaptadores das entradas antigas, remoção da pasta/intake automáticos, associação de dossiês, upload posterior e interface. Ainda não iniciada a etapa 11.

## Riscos e contenção

Deploy incompatível: v3 não recebe o novo tipo; v4 só entra depois da migração instalada. Revogação durante o modelo: commit revalida e não publica. Documento por atalho: CHECK exige intake e executor documental mantém aprovação. Vínculo a dossiê: não concede acesso nem ativa retrieval. Execução substantiva sem intake depende do contrato correspondente da etapa 17; o caminho leve não simula essa execução. Matriz de provedores permanece na etapa 16; este incremento conserva classificação restrita e política existente. Rollback suspende novos produtores antes de voltar a um consumidor anterior, preservando jobs e histórico.

## Etapa 10B: entrada de trabalho e continuidade documental

Fundação 10A publicada em `2c272c36e938ebfc652937eb76d115594ab392b6`: main Quality 35265839741, Security 35265839744, worker 35265839729, Vercel 6510664206 e ECS359 conferidos. Novos comandos instalados em staging `20260917194611` e produção `20260917195617`; 84 contratos SQL passaram em staging com rollback, incluindo contexto versionado, dois dossiês, revogação do criador e upload no mesmo trabalho. Sem fixtures de produção.

A entrada web cria trabalho e enfileira conversa atomicamente; pergunta sem anexos não compila plano nem abre intake/pasta. Upload posterior conserva conversa e identidade, cancela jobs que carregavam o contexto anterior e usa os gates documentais. Navegação, renomeação e arquivamento aceitam trabalho sem sessão. Tipos vieram da produção; 13 comandos privados/públicos inventariados, trigger e função de pasta automática retirados. Os checkers conferem 338 versões e os catálogos dos dois ambientes.

A publicação da web compatível precede a consolidação dos adaptadores antigos no incremento 10C. Os E2Es dos motores de pesquisa/preview passam a declarar explicitamente sua história legada com sessão, sem semear resultados ou aprovações; a nova entrada é coberta por `persistent-work.spec.ts`. CI e deploy deste incremento ainda são gates, não conclusão. Etapa 10 continua aberta; etapa 11 não iniciada.

## Incremento 10C: consolidação das entradas e contexto do trabalho

As entradas conversacionais antigas delegam a `start_work_v1`; append e submit usam o mesmo contrato de turno, com negação de replay de mensagem de outro trabalho. O caminho antigo de resposta pronta em `append_advisor_message_v1` é retirado. Pesquisa e case fit sem intake ficam em conversa, com critérios declarados preservados e sem fingir execução financeira. Os motores históricos continuam disponíveis sobre sessões documentais reais e sob os gates existentes.

Entradas documentais explícitas passam por trabalho e depois pelo comando de ingestão, conservando termos e declaração. Retomar onboarding exige capacidade de representação e autoridade atual; `started_by` não concede acesso residual. Entradas públicas estruturadas, sem consumidores web, passam a retornar UUID de trabalho; o assunto declarado fica no dossiê privado, sem criar companhia ou intake.

O contexto opcional permite objetivo, audiência, prazo e momento da decisão; atualização usa revisão esperada. Vários dossiês podem ser associados; vínculo nunca concede acesso nem entrega seu conteúdo ao modelo. A edição é localizada, responsiva e não pede cargo. Os contextos históricos são criados vazios, sem inventar finalidade.

Regressões dos motores legados constroem explicitamente a relação histórica com intake em fixtures transacionais. Não são prova de execução financeira sem documentos. Novos contratos cobrem cada entrada mantida, revogação do criador, replay entre trabalhos e retomada documental. O E2E acrescenta edição de contexto, dois dossiês pela interface e viewport móvel.

Verificação de banco concluída: staging `20260917203501`, `20260917204438`, `20260917204826`; produção `20260917204933`, `20260917204936`, `20260917204939`. SQL dos três carimbos idêntico; 30 definições de função iguais entre ambientes, 85 contratos SQL em staging com rollback, zero advisories de segurança e zero trabalhos antigos sem contexto. Produção negou chamadas não autenticadas sem criar dados descartáveis. Checkers conferem 341 versões de produção e os catálogos de 1.796/1.857 objetos. Tipos regenerados da produção.

Os links `new/company-debt` e `new/origination` redirecionam à conversa; os dois formulários e suas actions foram retirados. As duas RPCs especializadas também preservam brief e identidade, retornam conversa sem intake e mantêm somente os motores históricos sobre contexto documental real. Replay não reabre job e respeita a autoridade e a organização selecionada. Duas migrações adicionais conservam o SQL já aplicado; uma tentativa de sintaxe rejeitada em staging não criou carimbo.

10B publicado: PR 651, main `21a8e5bf0aee4de0343757ef092d1054c2084ca2`, Quality `35271461797`, Security `35271461902`, worker `35271461876`, Vercel `6511611901`, ECS `360`, health atual sem fila bloqueada. PR Quality `35269824006`: 33 E2Es passaram; 16 testes condicionais não executados, sem alegação de qualidade de modelo. Recibo externo `entry-delivery.json`.

Estado de 10C: banco aplicado, código em verificação para publicação; CI e implantação da interface ainda pendentes. Etapa 10 segue aberta, etapa 11 não iniciada.
