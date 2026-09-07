# Endgame Program Operating Cadence

Este documento define como o board canônico evolui. Ele não altera estados por si só.

## Uma fonte e um integrador

- `packages/release-governance/src/current-endgame-program.ts` é a fonte machine-readable.
- `docs/build/ENDGAME_PROGRAM_BOARD.md` é gerado por `program-board:render` e não é editado à mão.
- somente o program integrator altera estados, dependencies, findings e capability transitions;
  agentes de frente entregam evidência e proposta de delta para evitar merges concorrentes do board.
- Capability Ledger e Program Board mudam no mesmo PR quando uma tarefa atravessa um gate.

## Cadência por mudança

1. **Antes de implementar:** mover a tarefa para `ready` ou `in_progress`, confirmar dependências,
   owner role, subtarefas, data flow, controles e critérios de aceite.
2. **No PR:** registrar arquivos, testes, findings, containment e rollback. Código local verde permite
   `code_complete`; não permite `gate_passed`.
3. **Após CI:** anexar run imutável e ambiente. Evidência completa permite `evidence_complete`.
4. **No gate:** fechar acceptance e blockers, verificar dependências e registrar a transição no
   Capability Ledger. Somente então usar `gate_passed`.
5. **Após rollout verificado:** confirmar runtime, exposição, observabilidade e rollback. Somente
   capability `live` e exposta pode levar a tarefa a `promoted`.

## Ritmo operacional

- **A cada PR:** atualizar evidências e riscos da tarefa afetada; regenerar e testar o board.
- **Diariamente durante ondas paralelas:** integrador reconcilia branches, bloqueios e próxima fila
  pronta; nenhuma reunião de status é necessária para trabalho sem mudança.
- **A cada merge/deploy:** reconciliar `main`, deployment fingerprint e Capability Ledger.
- **Semanalmente:** revisar critical/high findings, caminho crítico, custo, latência e capacidade de
  teste. Reordenar backlog exige razão registrada, não preferência informal.
- **Antes de founder gate ou promoção externa:** gerar um snapshot imutável do board e do Evidence
  Index e executar o gate integral em staging e no ambiente aplicável.

## Relatório curto de evolução

O integrador reporta somente:

1. capacidades que mudaram com evidência;
2. tarefas em andamento e bloqueadas;
3. findings critical/high abertos;
4. gates e ambientes executados;
5. três próximos movimentos do caminho crítico.

Contagem de commits, linhas, agentes ou testes isoladamente não representa progresso do endgame.
