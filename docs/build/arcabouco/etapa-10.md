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
- CI e deploy do incremento: registrar após merge. Esta fundação não fecha a etapa 10.

## Próximo incremento da mesma etapa

Comandos `start_work_v1` e `append_work_turn_v1`, adaptadores das entradas antigas, remoção da pasta/intake automáticos, associação de dossiês, upload posterior e interface. Ainda não iniciada a etapa 11.

## Riscos e contenção

Deploy incompatível: v3 não recebe o novo tipo; v4 só entra depois da migração instalada. Revogação durante o modelo: commit revalida e não publica. Documento por atalho: CHECK exige intake e executor documental mantém aprovação. Vínculo a dossiê: não concede acesso nem ativa retrieval. Execução substantiva sem intake depende do contrato correspondente da etapa 17; o caminho leve não simula essa execução. Matriz de provedores permanece na etapa 16; este incremento conserva classificação restrita e política existente. Rollback suspende novos produtores antes de voltar a um consumidor anterior, preservando jobs e histórico.
