# Etapa 20: entregas restantes e execução em paralelo

Baseline conferida em 30/09/2026: `adbaa636a4b44ecde1a549fa315c5f7693cf2a2e`. O 3N está fechado com completion, CI e web/worker em produção. As vinte definições de revisão e adaptadores consultadas ao vivo têm o mesmo corpo em staging e produção. Os journals conservam `execution_result_human_review` com SQL MD5 `3276a2f0260533d74f984eb257401da2` nos carimbos próprios de cada ambiente. Este documento enumera o escopo restante; não declara as entregas prontas.

O fundador aprovou a execução paralela dentro das ondas com "ok. segue assim", após a explicação de que implementação de nova onda aguarda seu OK. Etapas 21–24 continuam com essa condição. Preparação documental das dependências pode avançar; aceite nunca é antecipado.

## Resultado da conferência

Fundação de atos, política, fontes, contestação, reafirmação e reassociação já existe e tem testes SQL e concorrência na CI. Institucional nativo e execução já exigem aprovação humana da revisão exata. Downloads revalidam autoridade depois de geração/Storage. Aproveitar esses contratos; implementar seus consumidores e os adaptadores restantes.

Lacunas reais: produtores legados registram envelopes sem conteúdo/fontes completos; confirmação e conversa continuam nos comandos antigos; pacote escreve estado e fila em duas chamadas; decisão do trabalho registra efeitos declarados sem aplicá-los; regime e reassociação ainda não têm os consumidores completos; a divergência do contrato puro de release foi corrigida e publicada no 3O/main `089e70a7d51a`. Não converter estado histórico confirmado em aprovação presumida.

## Dez pacotes de entrega restantes

Estes pacotes cobrem o escopo remanescente. São dez entregas planejadas, não uma garantia de dez PRs: se uma exceder tamanho revisável, dividir o pacote preservando seus critérios e declarar a divisão no mapa. Um achado novo registra causa, critério afetado e impacto; não amplia silenciosamente o escopo por novas letras.

| Pacote | Entrega e arquivos principais | Dependência / esforço |
| --- | --- | --- |
| 3O | Reconciliar `packages/domain-contracts/src/artifact-protocol.ts` com aprovação humana exata e revogação de `review-protocol.ts`; recibo de cálculo não aprova. Testes negativos antes/depois. Publicar este mapa. | Base atual / P |
| 3P | Regime no componente existente: RPCs v2 de leitura e configuração, `lib/advisor/project-review-context.ts`, `projects/[projectId]/review-actions.ts`, `components/advisor/project-review-roles.tsx`, mensagens PT/EN. Mostrar política efetiva/projeto/organização; manter v1 durante transição. Pendências e reassociação ficam no 3W. Preservar o contexto v1 usado por brief/setup em `projects/[projectId]/page.tsx` até o corte pertinente. | 3O; contrato v2 fixado / M |
| 3Q | Capturar insumos realmente usados nos produtores de análise pública, incluindo `worker_record_capital_project_artifact` e seu caminho no worker; revisão com conteúdo, pinos, direitos e recibo de fontes completo. Recuperação/replay sem recomputar. Sem mudar release desta família. | Base atual; contrato de captura / G |
| 3R | Cortar confirmação e conversa dessa família: `decide_capital_project_artifact`, três `request_*_revision_v1`, `submit_advisor_artifact_revision_turn_v1`, `projects/[projectId]/actions.ts`, `app/advisor-actions.ts`, `advisor-project.tsx` e formulário de revisão. Alvo explícito, preparador original, declaração, ato e projeção atômicos. | 3P + 3Q / G |
| 3S | Capturar material e plano efetivamente consumidos pelos produtores de `deal_state_objects`/produtos de material: componentes e revisões exatos, fontes indiretas, direitos, conteúdo e recuperação. Sem liberar pacote por captura. | Base atual; contrato de captura / G |
| 3T | Aprovação de pacote atômica nas duas portas: ações e superfícies de projeto e oportunidade, `private-materials-work.tsx`, `private-material-artifacts.ts`, `record_deal_state_object`, disparo `material_package_approved` e `enforce_external_material_operating_controls_v1`. Revisão + decisão + projeção + fila em uma operação; manter os gates externos próprios. | 3P + 3S / G |
| 3U | Projeções de autorização de brief e aprovação de configuração/proposta institucional: `approve_advisor_execution_brief_v1`, produtores de brief, `institutional_model_configurations`, `institutional_revision_proposals` e ações correspondentes. Recibo da base exata e efeito aplicado uma vez, sem duplicar fila ou cálculo. | Base atual + regime; respeitar travas existentes / G |
| 3V | Captura da proposta do assessment e integração de `confirm_assessment`/`freeze_assessment`; adoção por `adopt_work_update_v1` com decisão e recibos de marcos. Worker preserva decisão humana aprovada/rejeitada. Rejeição pode congelar sem executar. | Base atual + 3P; recibos específicos comprovados / G |
| 3W | Leitor enumerador autorizado de decisões e pendências, sem SELECT de cliente; histórico autorizado e relato/contestação no produto; revisão comum com autores, mudança, `reaffirm` e razões; pendências e ação de `reassign_pending_review_v1` no componente existente. Nenhum seletor livre de efeitos operacionais. | Contratos de 3P e cortes pertinentes; integração após 3R/3T/3U/3V / G |
| 3X | Conferir os cinco escritores/projeções e todo o pronto da 20; jornada integrada com duas pessoas, revisão material/cosmética, reassociação, revogação e ausência de efeitos externos; R01/procedimento 1; catálogo/journals, CI e produção no commit final. Completion da etapa. | Todos os pacotes anteriores / M |

## Paralelismo e donos

- Frente banco: um responsável pelos contratos SQL, recibos, adaptadores e ordem de travas. Captura 3Q e 3S pode ser preparada em paralelo quando produtores/arquivos não se sobrepõem; integração SQL é única.
- Frente interface: prepara componentes e testes sobre entradas/retornos fixados. Conversa, pacote e regime têm arquivos isolados; `projects/[projectId]/page.tsx`, `actions.ts`, mensagens e tipos gerados são incorporados pelo integrador.
- Frente eval: implementa negativos pelos endpoints antigos e novos, fixtures por escritor e jornadas enquanto as outras frentes implementam. Revisor independente não aprova seu próprio código sem segunda leitura independente.
- Integrador: controla baseline, arquivos compartilhados, migrações, catálogo/journal, merge, deploy e completion. O próximo trabalho local independente pode avançar durante a CI; corte e publicação de dependente aguardam a entrega da base.

Nenhum agente paralelo altera banco remoto, grants, journal, branch compartilhada ou faz merge/deploy. Uma migração por vez em staging e produção; arquivo coincide com journal de produção. Revalidar toda PR na base final integrada, sem usar CI verde de ancestral como prova do commit publicado.

## Pronto por pacote

Código e documentação atualizados; negativos de acesso/tenant, fonte, alvo exato, replay e revogação pertinentes passando; revisão independente; gate local e CI completos. Onde houver DDL: teste seguro em staging, aplicação nos dois ambientes, SQL e definição efetiva conferidos, tipos e inventário conciliados, advisors registrados. Merge em main, web e worker no mesmo commit, boot e produção verificados, completion no formato combinado. Sem fixture descartável em produção.

Em 3Q/3S fixar o snapshot na leitura dos insumos e fechar o recibo no commit do produtor; provar que preserva conteúdo e identidade econômica, incluindo fontes indiretas não citadas. Um conjunto vazio só é válido quando o produtor prova zero fontes governadas, nunca pela ausência de evidence[]. Em 3R/3T provar negação pelas duas portas antigas, sem caminho de contorno. Em 3U/3V injetar falha depois do efeito e provar rollback conjunto, replay sem duplicação, autoria e data exatas. Em 3W a classificação e a permissão vêm do servidor; a interface não autoriza por cargo nem por membership.

As cinco famílias de projeção são despacho de execução, decisão de artefato, pacote, configuração/proposta institucional e adoção. Configuração e proposta são duas origens da mesma família; todas são conferidas individualmente.

## Critérios finais com destino explícito

| Critério pendente | Pacotes responsáveis |
| --- | --- |
| Cinco escritores projetados com autor, data, base e efeito originais; backfill linha a linha só quando há prova | 3R, 3T, 3U, 3V; conferência 3X |
| Aprovação exata, declaração e fonte autorizada em cada endpoint antigo | 3R, 3T, 3U; negativos da frente eval |
| Conversa não escolhe a candidata mais recente; base ambígua vira pergunta sem job | 3R |
| Efeito de decisão aplicado e congelamento humano respeitado pelo worker | 3U, 3V |
| Relato não publica, autoriza introdução nem enfileira; aprovação sem efeito externo | 3W; contagens explícitas 3X |
| Regime visível, responsáveis distintos, cosmética reafirmada, material exige ato novo, reassociação preserva história | 3P, 3W; jornada 3X |
| Revogação durante geração/Storage e ausência de atalho após o corte | Aproveitar 3L–3N; regressão por família 3X |
| E2E completo em staging, separado da CI local; produção sem dados descartáveis | 3X |

## Riscos e resposta

Conteúdo ou fontes históricas sem prova permanecem restritos; usar captura prospectiva e recuperação explícita, nunca contexto atual como se fosse passado. Regime v2 preserva assinaturas, respostas e campos solicitados pelos consumidores v1 até o deploy; testar as duas ordens de concorrência v1/v2 e alinhar corpos completos se a ordem row/advisory de travas divergir. Não preservar uma inversão de travas apenas por ser caminho antigo. O parser estrito continua compatível; os helpers antigos só mudam junto ao corte da família. Registro de efeito não significa efeito executado: adaptador aplica efeito e ato na mesma transação. Preservar ordem de travas de jobs/sessões/trabalho e testar as duas ordens de concorrência.

Divergência remota não conciliável, migração sem arquivo ou reprodução exigida que não funciona mantém a regra de parada: reportar provas e opções antes de prosseguir. Mudança posterior à última consulta e propagação completa de retenção/revogação pertencem à 22, não são promessa da 20.

## Ondas seguintes

21 e 22 podem desenvolver frentes independentes depois do OK da onda e estabilização dos contratos necessários. 23 prepara inventário/testes antes de apagar caminhos comprovadamente substituídos. 24 prepara a matriz de evidência durante a construção; seu aceite depende de 0–23. Nenhuma dessas preparações reduz o pronto ou autoriza execução funcional de nova onda.
