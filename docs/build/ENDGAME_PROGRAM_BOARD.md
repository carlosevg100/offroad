# Endgame Program Board

> Vista gerada de `current-endgame-program.ts`. Não editar manualmente. O objeto TypeScript é a fonte canônica machine-readable.

Atualizado em: 2026-09-07T15:03:56.000-03:00
Baseline: `main@2a96d0125d9ace1929a5bbf5d18739bbf28d4eda`
Capability Ledger: `2026.09.07-v16@0978740d3d1c88573daab16ddf0fbabec9910475`
Fingerprint do board: `c77f23f014a5ea011af8ce09c7131f309e6d3aacfc803a692f0c1a1433ea22ef`

## Leitura executiva

Este quadro mede gates comprovados, não volume de código. `Gate passed` exige dependências encerradas, critérios aceitos com evidência e nenhum bloqueador aberto. Se a tarefa declara uma transição, ela precisa ser válida e, quando registrada, já estar refletida no Capability Ledger. `Promovido` exige transição registrada, runtime live e exposição diferente de `none`.

## Reconciliação do baseline

| Finding | Severidade | Estado | Responsável | Descrição |
|---|---|---|---|---|
| PF-NO-CUSTOMER-RELIANCE | high | open | Capability governance owner | Nenhuma capability do ledger atual autoriza customer_work, external_material ou external_action; o produto permanece em validação interna. |
| PF-ENDGAME-INCOMPLETE | high | open | Program integrator | Dispatcher universal, data room arbitrário, modelo institucional, template suite, journeys G2-G8, rede real de capital e assurance externo não estão promovidos. |
| PF-SECURITY-SNAPSHOT-STALE | medium | open | Security program owner | O inventário SEC-01 é uma base válida, porém está fixado em b2e3897 e não representa mudanças posteriores da main; precisa de refresh governado antes de servir como current state do baseline 2a96d01. |
| PF-FOUNDATIONS-NOT-PROMOTION | high | open | Capability governance owner | SEC-01, VLT-02 e a fundação Office possuem código e testes delimitados, mas não fornecem evidência operacional ou autorização para uso de cliente, material externo ou claim de assurance. |

## Sequência de releases

### R0

| ID | Estado | Resultado | Capabilities vinculadas | Dependências | Bloqueadores abertos |
|---|---|---|---|---|---|
| CTRL-01 | Em implementação | Baseline único de código, PRs, deploy, banco, ledger e documentos, sem claims conflitantes. | sem vínculo | sem dependência | sem blocker |
| CTRL-02 | Code complete | Fonte machine-readable com tarefas, dependências, owners, aceite, evidência, bloqueadores e transições de maturidade. | sem vínculo | sem dependência | sem blocker |
| CTRL-03 | Backlog | Cada claim de capacidade resolve a evidência vigente, ambiente, gate e validade. | sem vínculo | CTRL-01, CTRL-02 | sem blocker |
| SEC-01 | Code complete | Um snapshot validado e conservador representa ambientes, sistemas, dados, fluxos, identities, vendors, evidências, gaps e claims externos sem inferir operação live. | trust.security-current-state-inventory | CTRL-01 | BL-SEC01-LIVE-EVIDENCE, BL-SEC01-REFRESH |
| SEC-02 | Backlog | Tenancy, documentos, IA, tools, exports, effects, supply chain e insider access têm ameaças e controles. | sem vínculo | SEC-01 | sem blocker |
| SEC-03 | Backlog | PR, testes, deploy, acessos, providers, exports, vulnerabilities, backup e incidentes geram evidência contínua. | sem vínculo | CTRL-03, SEC-01 | sem blocker |

### R1

| ID | Estado | Resultado | Capabilities vinculadas | Dependências | Bloqueadores abertos |
|---|---|---|---|---|---|
| RT-01 | Em implementação | Intenção, objeto, trabalho, entrega, audiência e continuidade resolvidos sem cargo como regra. | intent.semantic-envelope-shadow, gold.intent-router-stability-gate | CTRL-02 | sem blocker |
| RT-02 | Backlog | Contexto autorizado e objetos existentes são recuperados, classificados e reaproveitados somente quando relevantes. | sem vínculo | RT-01 | sem blocker |
| RT-03 | Backlog | O produto solicitado define o terminal e muda o grafo antes da execução. | workflow.objective-plan-core | RT-01 | sem blocker |
| RT-04 | Backlog | Necessidade, análise, instrumento, setor e jurisdição compõem profundidade sem soluções fragmentadas. | workflow.composable-specialization-shadow, workflow.specialist-method-binding-shadow | RT-01, RT-03 | sem blocker |
| RT-05 | Backlog | Cada TaskSpec conhece procedure, executor, schemas, ferramentas, dados, efeitos, maturidade e evidência. | workflow.taskspec-library | CTRL-03 | sem blocker |
| RT-06 | Backlog | Nenhum plano ativa tarefa sem capability, evidência, autoridade, provider e tool policy compatíveis. | workflow.preflight-capability-gate, workflow.objective-preflight-shadow | RT-02, RT-04, RT-05 | sem blocker |
| RT-07 | Backlog | Grafo mínimo executa tarefas allowlisted, idempotentes, observáveis e fail-closed. | workflow.universal-dispatch-candidate-shadow, execution.general-specialist-runtime | RT-06 | sem blocker |
| RT-08 | Backlog | Gaps materiais guiam perguntas, respostas atualizam objetos e só descendentes inválidos são recalculados. | sem vínculo | RT-02, RT-07 | sem blocker |
| RT-09 | Backlog | Seis pedidos estruturalmente distintos percorrem o runtime sem identidade Case 01. | sem vínculo | RT-07, RT-08 | sem blocker |

### R2

| ID | Estado | Resultado | Capabilities vinculadas | Dependências | Bloqueadores abertos |
|---|---|---|---|---|---|
| VLT-01 | Backlog | Todo arquivo, versão, hash, origem, classe, parser, coverage e derivado possui identidade governada. | sem vínculo | RT-02 | sem blocker |
| VLT-02 | Code complete | Os formatos hoje allowlisted só chegam ao parser após scanner clean, inspeção limitada e receipt vinculado aos bytes e ao escopo exatos. | documents.governed-quarantine-shadow | VLT-01 | BL-VLT02-PERSISTENCE, BL-VLT02-RUNTIME, BL-VLT02-CONTAINERS |
| VLT-03 | Backlog | O sistema escolhe leitura exata, exaustiva, tabular, cláusula, OCR, planilha ou híbrida conforme o trabalho. | sem vínculo | VLT-02 | sem blocker |
| VLT-04 | Backlog | Cada fato resolve documento, versão, anchor, período, unidade, moeda, perímetro e rank. | sem vínculo | VLT-03 | sem blocker |
| VLT-05 | Backlog | Períodos, moedas, escalas, conceitos, EBITDA, dívida, caixa e covenant são conciliados com exceções explícitas. | sem vínculo | VLT-04 | sem blocker |
| VLT-06 | Backlog | O sistema declara o que buscou, encontrou, não leu, não encontrou e como isso altera a decisão. | sem vínculo | VLT-03, VLT-04, VLT-05 | sem blocker |

### R3

| ID | Estado | Resultado | Capabilities vinculadas | Dependências | Bloqueadores abertos |
|---|---|---|---|---|---|
| FIN-01 | Backlog | Chat, modelo, estrutura, materiais e matching compartilham a mesma identidade econômica. | sem vínculo | VLT-05 | sem blocker |
| FIN-02 | Backlog | DRE, balanço, fluxo, notas, dívida, segmentos e ajustes fecham historicamente. | sem vínculo | FIN-01 | sem blocker |
| FIN-03 | Backlog | Toda premissa é editável, justificada, versionada e ligada aos descendentes que altera. | sem vínculo | FIN-01 | sem blocker |
| FIN-04 | Backlog | Drivers operacionais fecham DRE, balanço, caixa, CFADS e debt service. | sem vínculo | FIN-02, FIN-03 | sem blocker |
| FIN-05 | Backlog | Principal, moeda, indexador, spread, juros, amortização, IPCA, hedge e pré-pagamento são modelados por instrumento. | sem vínculo | FIN-02, FIN-03 | sem blocker |
| FIN-06 | Backlog | Base, management, conservative, downside, reverse stress e break-even medem liquidez e cobertura. | sem vínculo | FIN-04, FIN-05 | sem blocker |
| FIN-07 | Backlog | Alternativas e no-action case são comparados por economia, risco, termos, execução e contingência. | sem vínculo | FIN-04, FIN-05, FIN-06 | sem blocker |

### R4

| ID | Estado | Resultado | Capabilities vinculadas | Dependências | Bloqueadores abertos |
|---|---|---|---|---|---|
| MAT-01 | Code complete | PPTX editável e decision workbook do Caso 01 são construídos de forma determinística, inspecionados, vinculados ao manifest e mantidos apenas para validação interna. | artifacts.governed-office-foundation | CTRL-01 | BL-MAT01-REAL-GATE |
| MAT-02 | Backlog | Workbook institucional é renderizado no worker, inspecionado, armazenado e baixado por manifest imutável. | sem vínculo | MAT-01, FIN-04 | sem blocker |
| MAT-03 | Backlog | Nenhuma superfície chama placeholder, JSON interno ou export improvisado de material pronto. | sem vínculo | MAT-01, MAT-02 | sem blocker |
| MAT-04 | Backlog | Slides, páginas e sheets recebem inspeção automática, comparação e receipt antes de release. | sem vínculo | MAT-01, MAT-02 | sem blocker |
| MAT-05 | Backlog | DOCX nativo e templates ingeridos preservam estilo suportado, com fallback honesto. | sem vínculo | MAT-03, MAT-04 | sem blocker |

### R5

| ID | Estado | Resultado | Capabilities vinculadas | Dependências | Bloqueadores abertos |
|---|---|---|---|---|---|
| WFI-01 | Backlog | Refinance e liability management possui coverage, procedure, schemas, executor, gold, adversarial, revisão e gate próprios. | sem vínculo | RT-07, FIN-07 | sem blocker |
| WFI-02 | Backlog | Board e capital structure possui coverage, procedure, schemas, executor, gold, adversarial, revisão e gate próprios. | sem vínculo | WFI-01, RT-07 | sem blocker |
| WFI-03 | Backlog | Liquidez e capital de giro possui coverage, procedure, schemas, executor, gold, adversarial, revisão e gate próprios. | sem vínculo | WFI-01, RT-07 | sem blocker |
| WFI-04 | Backlog | Capex finance possui coverage, procedure, schemas, executor, gold, adversarial, revisão e gate próprios. | sem vínculo | WFI-01, RT-07 | sem blocker |
| WFI-05 | Backlog | Recebíveis e FIDC possui coverage, procedure, schemas, executor, gold, adversarial, revisão e gate próprios. | sem vínculo | WFI-01, RT-07 | sem blocker |
| WFI-06 | Backlog | Investor underwriting possui coverage, procedure, schemas, executor, gold, adversarial, revisão e gate próprios. | sem vínculo | WFI-01, RT-07 | sem blocker |
| WFI-07 | Backlog | Covenant, contrato e waterfall possui coverage, procedure, schemas, executor, gold, adversarial, revisão e gate próprios. | sem vínculo | WFI-01, RT-07 | sem blocker |
| WFI-08 | Backlog | Acquisition finance possui coverage, procedure, schemas, executor, gold, adversarial, revisão e gate próprios. | sem vínculo | WFI-01, RT-07 | sem blocker |
| WFI-09 | Backlog | Project finance possui coverage, procedure, schemas, executor, gold, adversarial, revisão e gate próprios. | sem vínculo | WFI-01, RT-07 | sem blocker |
| WFI-10 | Backlog | Instrumentos Brasil possui coverage, procedure, schemas, executor, gold, adversarial, revisão e gate próprios. | sem vínculo | WFI-01, RT-07 | sem blocker |
| WFI-11 | Backlog | Instrumentos EUA possui coverage, procedure, schemas, executor, gold, adversarial, revisão e gate próprios. | sem vínculo | WFI-01, RT-07 | sem blocker |
| WFI-12 | Backlog | Cross-border possui coverage, procedure, schemas, executor, gold, adversarial, revisão e gate próprios. | sem vínculo | WFI-01, RT-07 | sem blocker |
| WFI-13 | Backlog | Sector packs prioritários possui coverage, procedure, schemas, executor, gold, adversarial, revisão e gate próprios. | sem vínculo | WFI-01, RT-07 | sem blocker |
| WFI-14 | Backlog | O runtime geral só avança depois que todos os packs Pareto possuem gates próprios e integração conjunta. | sem vínculo | WFI-01, WFI-02, WFI-03, WFI-04, WFI-05, WFI-06, WFI-07, WFI-08, WFI-09, WFI-10, WFI-11, WFI-12, WFI-13 | sem blocker |

### R6

| ID | Estado | Resultado | Capabilities vinculadas | Dependências | Bloqueadores abertos |
|---|---|---|---|---|---|
| JNY-01 | Backlog | Banker: pedido a estruturação funciona como projeto contínuo, não como resposta isolada. | sem vínculo | WFI-01, MAT-05 | sem blocker |
| JNY-02 | Backlog | CFO: conselho a operação funciona como projeto contínuo, não como resposta isolada. | sem vínculo | WFI-02, MAT-05 | sem blocker |
| JNY-03 | Backlog | Assessor: documentos a capital funciona como projeto contínuo, não como resposta isolada. | sem vínculo | WFI-05, MAT-05 | sem blocker |
| JNY-04 | Backlog | Investidor: underwriting a decisão funciona como projeto contínuo, não como resposta isolada. | sem vínculo | WFI-06, MAT-02 | sem blocker |
| JNY-05 | Backlog | Contrato: documento a risco funciona como projeto contínuo, não como resposta isolada. | sem vínculo | WFI-07, VLT-06 | sem blocker |
| JNY-06 | Backlog | Atualização incremental funciona como projeto contínuo, não como resposta isolada. | sem vínculo | RT-08, MAT-04 | sem blocker |
| JNY-07 | Backlog | Project finance longitudinal funciona como projeto contínuo, não como resposta isolada. | sem vínculo | WFI-09, MAT-05 | sem blocker |
| JNY-08 | Backlog | Operação a conexão qualificada funciona como projeto contínuo, não como resposta isolada. | sem vínculo | WFI-06, CAP-02 | sem blocker |
| JNY-09 | Backlog | A capability longitudinal G2-G8 só avança após todas as jornadas e variantes obrigatórias passarem. | sem vínculo | JNY-01, JNY-02, JNY-03, JNY-04, JNY-05, JNY-06, JNY-07, JNY-08 | sem blocker |
| CAP-01 | Backlog | Mandatos têm fonte, data, validade, ticket, setor, instrumento, retorno, restrições, confiança e consentimento. | sem vínculo | VLT-04 | sem blocker |
| CAP-02 | Backlog | Hard filters, fit, non-fit, unknown, exclusões e informação que muda ranking são discriminados. | sem vínculo | CAP-01, FIN-07 | sem blocker |
| CAP-03 | Backlog | Disclosure, destinatário, material e introdução exigem autorização exata e permanecem auditáveis. | sem vínculo | CAP-02, MAT-05 | sem blocker |

### R7

| ID | Estado | Resultado | Capabilities vinculadas | Dependências | Bloqueadores abertos |
|---|---|---|---|---|---|
| SEC-04 | Backlog | MFA, step-up, RBAC/ABAC, support JIT, SSO/SAML e SCIM operam com least privilege. | sem vínculo | SEC-02, SEC-03 | sem blocker |
| SEC-05 | Backlog | Restore, BCP/DR, IR, pentest/retest e readiness SOC 2/ISO são comprovados externamente no escopo exato. | sem vínculo | SEC-03, SEC-04, PRD-03 | sem blocker |
| PRD-01 | Backlog | Disponibilidade, latência, custo, contenção e recovery são medidos por família de trabalho. | sem vínculo | RT-09, JNY-01 | sem blocker |
| PRD-02 | Backlog | Capabilities são promovidas por allowlist, cohort, kill switch e rollback verificado. | sem vínculo | PRD-01, CTRL-03 | sem blocker |
| PRD-03 | Backlog | G1-G8 e work products passam revisão técnica, visual, de interação, segurança e continuidade. | sem vínculo | JNY-01, JNY-02, JNY-03, JNY-04, JNY-05, JNY-06, JNY-07, JNY-08, PRD-02 | sem blocker |

## Próxima onda controlada

### CTRL-01: Reconciliar o estado real

Estado: **Em implementação** · owner: Program integrator

Subtarefas:

- [x] CTRL-01.01: Fixar origin/main e inventariar PRs/deploys (done)
- [x] CTRL-01.02: Comparar ledger, Build State, blueprint e evidências (done)
- [x] CTRL-01.03: Registrar divergências e corrigir claims (done)
- [ ] CTRL-01.04: Congelar o baseline reconciliado (pending)

Critérios de aceite:

- CTRL-01.AC01: Commit, ledger, PRs e ambientes têm referências verificáveis · **passed** · EV-MAIN-2A96, EV-LEDGER-V16
- CTRL-01.AC02: Toda divergência material aparece como finding com owner · **passed** · EV-CAPABILITY-LEDGER
- CTRL-01.AC03: Nenhuma capacidade é promovida pela reconciliação · **passed** · EV-CAPABILITY-LEDGER

### RT-01: Intent Envelope universal

Estado: **Em implementação** · owner: Intent and work-control engineer

Subtarefas:

- [ ] RT-01.01: Consolidar núcleo inferível e contexto governado (in_progress)
- [ ] RT-01.02: Bloquear inferência de autoridade e evidence regime (pending)
- [ ] RT-01.03: Cobrir intenção sem companhia (pending)
- [ ] RT-01.04: Ampliar corpus gold e adversarial (pending)

Critérios de aceite:

- RT-01.AC01: Paráfrases preservam identidade de workflow · **passed** · EV-INTENT-GATE
- RT-01.AC02: Intenções economicamente diferentes não colapsam · **pending**
- RT-01.AC03: Autoridade nunca é inferida · **pending**

Capabilities relacionadas: `intent.semantic-envelope-shadow`, `gold.intent-router-stability-gate`.

Transição planejada: `intent.semantic-envelope-shadow` · implemented → tested (planned).

## Evidence Index

| ID | Tipo | Ambiente | Referência |
|---|---|---|---|
| EV-MAIN-2A96 | repository | repository | https://github.com/carlosevg100/offroad/commit/2a96d0125d9ace1929a5bbf5d18739bbf28d4eda |
| EV-LEDGER-V16 | repository | repository | https://github.com/carlosevg100/offroad/commit/0978740d3d1c88573daab16ddf0fbabec9910475 |
| EV-CAPABILITY-LEDGER | document | repository | docs/build/CAPABILITY_LEDGER.md |
| EV-BLUEPRINT | document | repository | docs/build/OFFROAD_ENDGAME_EXECUTION_BLUEPRINT.md |
| EV-SECURITY-PLAN | document | repository | docs/security/ENTERPRISE_SECURITY_COMPLIANCE_READINESS_PLAN.md |
| EV-PR529 | pull_request | ci | https://github.com/carlosevg100/offroad/pull/529 |
| EV-SEC01-INVENTORY | document | repository | docs/security/CURRENT_STATE_INVENTORY.md |
| EV-SEC01-TESTS | test | repository | packages/release-governance/src/security-current-state.test.ts; packages/release-governance/src/security-assurance-statements.test.ts |
| EV-PR537 | pull_request | ci | https://github.com/carlosevg100/offroad/pull/537 |
| EV-VLT02-BOUNDARY | document | repository | docs/build/VLT02_GOVERNED_QUARANTINE_BOUNDARY.md |
| EV-VLT02-TESTS | test | repository | packages/document-intelligence/src/governed-document-quarantine.test.ts; apps/document-worker/src/pipeline.test.ts |
| EV-PR522 | pull_request | ci | https://github.com/carlosevg100/offroad/pull/522 |
| EV-MAT-FOUNDATION | pull_request | ci | https://github.com/carlosevg100/offroad/pull/525 |
| EV-MAT-DETERMINISM | pull_request | ci | https://github.com/carlosevg100/offroad/pull/534 |
| EV-INTENT-GATE | ci_run | ci | https://github.com/carlosevg100/offroad/actions/runs/34096964058 |
| EV-CTRL02-LOCAL-GATE | test | repository | packages/release-governance/src/endgame-program-board.test.ts |

