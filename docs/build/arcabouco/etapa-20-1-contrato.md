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
