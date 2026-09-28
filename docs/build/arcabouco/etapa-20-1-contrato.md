# Etapa 20, incremento 1: contrato de revisão e decisão

Implementação autorizada pelo OK de onda de 27/09/2026. Base: `85191003`. Este incremento é aditivo: não cria tabela, RPC ou rota e não troca o leitor de release da etapa 19. A substituição acontece nos incrementos 2 e 3, com migrações e negativos SQL próprios. Não é fechamento da etapa 20.

## Contrato implementado

`packages/domain-contracts/src/review-protocol.ts` declara atos imutáveis, alvo exato (organização, trabalho, artefato, revisão, manifesto e audiência), regime de revisão, base e efeitos de decisão, relato e precedência. Aprovação não cobre outra revisão mesmo com bytes iguais. Reafirmação exige base de aprovação viva e alteração cosmética; revogação é ato separado. Papel não substitui leitura da fonte e autoaprovação exige política e declaração no ato.

A classificação em `artifact-protocol.ts` passa a negar equivalência de narrativa alterada, suporte de afirmações alterado, base/linhagem alterada e bytes sem prova. A lista cosmética é restrita à ordem de blocos com conteúdo idêntico e referência tipada de template sem alteração de bytes; qualquer chave `layout` ou `style` em conteúdo livre continua sendo conteúdo. Hash informado igual não encobre JSON divergente. Não há interpretação por modelo.

Decisão concorrente conserva todas as posições até resolução que referencie todas. A base inclui `decisions: [{decisionId, revision, fingerprint}]`, distinta de `assessments` (proposta do robô), para viabilizar resolução verificável. Histórico de outra organização, trabalho ou chave, histórico incompleto e referência divergente são recusados. Relato não pode gerar efeito operacional; envio externo e publicação no cofre não constam do contrato de efeitos.

## Verificação e limites

Testes de domínio cobrem negativa de fonte, segregação, autoaprovação declarada, alvo exato, revogação, reafirmação, três decisões concorrentes, resolução parcial e completa, referências divergentes, relato e efeitos. `fixtures/review-authorization.json` e `fixtures/review-change-cases.json` são sintéticos, compartilháveis com o espelho SQL do incremento 2; ainda não são prova de paridade SQL.

Os contratos não autorizam clientes por si: a persistência obterá identidade, política, fontes e fingerprint do banco sob travas. Nenhuma aprovação histórica é reatribuída. No incremento 2, o leitor calculará release pelos atos exatos; no 3, os caminhos legados projetarão os atos; no 4, a interface e as provas de revogação após I/O serão integradas.

Controles: APP-04 (validação), APP-11 (imutabilidade/linhagem), IAM-05 (segregação), AI-09 (ato humano), SDLC-08/10 (promoção por gates). Sem dados reais, sem migração e sem chamada paga neste incremento. Rollback do contrato não altera dados; a API de aprovação ainda não o consome.

Revisão independente do contrato concluída em 27/09: o caso de primeira decisão marcada contestada foi identificado, recusado e coberto por negativo. Cadeias sucessivas de reafirmação, revogação intermediária, ciclos e bases de outro trabalho/artefato/audiência foram acrescentadas. 129 testes de domínio passaram. A primeira execução do gate completo encontrou a projeção gerada desatualizada; `manifest:generate` a reconciliou, sem alterar os locks de releases publicados. A repetição completa de `pnpm check` passou: lint, tipos, testes e build; 44 tarefas no build. O gate editorial também corrigiu a pontuação das novas notas antes da publicação.

## Verificação após publicação, 27/09/2026

- O que foi feito: PR 835 mesclada em `35c9c7b730b80f2985a2e8a784b433ab76395233`; contrato, testes e fixtures descritos acima. Nenhuma migração neste incremento.
- Eval: Quality da PR `36332856760` e de main `36333893489` verdes, incluindo banco e Playwright; Security de main `36333893618` verde. Os 129 testes de domínio passaram. Verificação local completa registrada acima.
- Produção: Vercel `6694877965`, sucesso às 16:37:50 UTC; páginas públicas em português e inglês HTTP 200. Worker run `36333893439` verde; tarefa `d17a2f2c24034a0fa6f9648ad58d2994`, definição 486, imagem `35c9c7b730b8`, RUNNING. Serviço com uma tarefa desejada, uma rodando, zero pendentes, rollout COMPLETED. Boot às 16:42:13.938 UTC, política de provedor ativa; 24 capacidades e dois executores conferidos nos logs autenticados. Nenhum dado descartável em produção.
- Fora: persistência, adaptação dos escritores e jornada visual pertencem aos incrementos 2 a 4. Este registro fecha o incremento 1, não a etapa 20.
- Riscos: paridade SQL e serialização da autoridade serão comprovadas no incremento 2; revogação durante download começa no incremento 4. Não estão sendo declaradas prontas por testes de domínio.
- Próximo ato do fundador: nenhum para continuar a etapa 20 já autorizada. A etapa 21 aguarda o OK de sua própria onda.
