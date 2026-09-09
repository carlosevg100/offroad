# Revisão independente da liberação documental

Revisão em 9 de setembro de 2026. Código inspecionado: `643567b307f4ee8e3f484e511a30ffe649c33188`, worktree `.worktrees/documentary-live-diagnostics`, sem alterações locais durante a revisão. O revisor não implementou este marco. Este registro cobre revisão estática e testes locais abaixo, não resultados de produção ou gates reais ainda não inspecionados.

## Parecer

**Aprovação técnica condicional no escopo documental preliminar.** Não identifiquei bloqueio de alta ou média prioridade nos caminhos inspecionados. A ativação continua condicionada aos gates reais de produto e jornada, revisão de suas saídas e publicação da versão correta. Não se certifica capacidade de análise financeira, recomendação de crédito, revisão jurídica, leitura integral ou correção semântica de toda hipótese produzida.

Os três trabalhos são comparação documental preliminar, preparação de reunião e revisão preliminar de oportunidade. Q01 recebe fontes, Q02 produz leitura delimitada e Q03 persiste a entrega privada. Não são três novos métodos financeiros.

## Contratos verificados

- **Autorização:** `supabase/migrations/20260909005423_documentary_execution_scope_binding.sql:2` deriva `documentary_only` da aprovação exata e do plano Q01/Q02/Q03, confere projeto, sessão, run atual e `execution_dispatch_is_current`. Não deriva autoridade somente do texto do pedido. `apps/document-worker/src/case-analysis.ts:794` rejeita projeto/job incompatíveis, escopo documental sem autoridade e execução não primária. `document-work-input.ts:14` é classificador de planejamento, não autorização.
- **Fontes:** `apps/document-worker/src/document-work-input.ts:76` confere documento, SHA, versão e status ready contra o snapshot; o codec vinculado confere envelope, identidade e conteúdo. Trechos têm limites por documento e globais, IDs determinísticos e cobertura incompleta explícita. Arquivos sem trechos não são apresentados como lidos integralmente.
- **Atribuição:** `apps/document-worker/src/document-work-product.ts:35` exige observações idênticas a citações completas, fontes existentes e seções do trabalho; rejeita números novos, cortes parciais e saída vazia sem lacuna. O procedimento canônico `packages/credit-playbook/src/procedures/documentary-work.ts:41` está em versão v2/candidate; o prompt deriva desse procedimento. Hipóteses continuam interpretações e não ganham certificação apenas porque apontam uma fonte.
- **Gravação atômica:** `supabase/migrations/20260909005445_atomic_documentary_execution_commit.sql:2` usa capability vigente, reconfere binding e identidades/fingerprints, e chama persistência do relatório, snapshot, estágios e conclusão na mesma transação. Não há tratamento que absorva falha intermediária e confirme uma gravação parcial. O teste SQL em `supabase/tests/execution_proposal_revision.sql:1182` cobre capability inválida, binding alterado, falha posterior ao relatório com rollback e conclusão não revertida por tentativa tardia de fail. Esse SQL foi lido, não executado por este revisor.
- **Leitura privada atual:** `apps/web/src/lib/advisor/document-work-product-reader.ts:14` usa cliente autenticado, organização/projeto/sessão/run, job exato concluído, manifesto e fingerprint do produto recalculado; verifica fontes atuais e reconfirma binding/sessão ao final. A RPC de leitura em `20260909005407_document_work_product_request_binding.sql:33` exige acesso ao projeto e job concluído. As múltiplas consultas oferecem validação ao ler, não um bloqueio permanente de edições posteriores.
- **Word:** `apps/web/src/app/[locale]/app/projects/[projectId]/work-products/[fingerprint]/docx/route.ts:7` exige workspace autenticado, produto atual e fingerprint da URL. Resposta private/no-store. `apps/web/src/lib/advisor/document-work-product-material.ts:10` projeta o produto persistido, conserva fontes, hashes, hipóteses e limitações, sem nova chamada ao modelo ou tradução. Download privado não equivale a autorização de circulação externa.

## Testes executados pelo revisor

Node 24.19.0, dependências já instaladas, Vitest 4.1.11. Todos concluíram com exit code 0.

| Conjunto | Arquivos | Testes | Resultado |
|---|---:|---:|---|
| Worker: document-work-input, document-work-product, execution-brief-proposal, runtime-schema, queue | 5 | 81 | PASS |
| Worker: case-analysis | 1 | 7 | PASS |
| Web: document-work-product-reader, document-work-product-material, rota Word | 3 | 31 | PASS |
| Total local independente | 9 | 119 | PASS |

Os testes de case-analysis exercitam os três pedidos delimitados, conclusão sem etapa financeira/pesquisa, fonte divergente e escopo incompatível. Os testes de atribuição exercitam fonte inventada, citação não contígua, números novos, negação/garantia invertida, seções incorretas e excesso de input. Reader/rota exercitam erro de consulta, conteúdo alterado, fonte/run/binding divergente e download desatualizado. Uma primeira tentativa com filtro de pacote web inexistente não executou testes; foi corrigida para execução no diretório real da aplicação, com os 31 testes acima passando.

## Limites e evidências ainda necessárias

Não executei SQL, E2E protegido, modelo real, migração, produção, publicação ou gate completo nesta revisão. Os mocks locais demonstram contratos de código, não qualidade do modelo real ou política efetiva de dados do provedor. Não verifiquei saídas ainda não disponibilizadas dos dois gates reais, nem equivalência do SHA efetivamente implantado. A raiz deve anexar identificadores, logs e avaliação das saídas antes de registrar promoção operacional.

A proteção de citações reduz fabricação e cortes locais; não prova que a seleção de uma sentença representa todo o contexto documental. Limites de cobertura, hipóteses, lacunas e status preliminar são parte necessária da entrega. A seleção da sessão mais antiga no reader é consistente com o fluxo atual inspecionado; suporte futuro a múltiplas sessões ativas por projeto precisará de seleção canônica explícita.

Nenhuma alteração de código, commit, push ou consulta de produção foi realizada por este revisor.

## Revisão das seis saídas reais do executor: resultado semântico bloqueante

Artefato inspecionado integralmente: `/private/tmp/offroad-live-executor-34302835300/evidence.json`. Run `34302835300`, tentativa 1, SHA declarado `d1c4e281fbd8c9eec4bba8f30f6e93196703e0c1`, fixture fingerprint `c91155093b12556f890770a0c5e1d6be8f23e49c69aec5bb99b6f4da0f40fd0d`. O próprio artefato declara `synthetic:true`, `scope:actual_executor_only_not_application_e2e` e `promotion:false`. O executor realizou seis chamadas reais e seu score automatizado foi **6/6 PASS**. Esse resultado permanece registrado sem alteração.

**A avaliação semântica independente não aprova a promoção ainda.** A inspeção das seis entregas e dos trechos sintéticos embutidos encontrou conversão de informação não fornecida em inexistência contratual. Prioridade P1 para esta liberação: corrigir antes de ativar a capacidade, pois o erro altera a premissa usada para perguntas e interpretação de proteção de crédito. Não é achado de invasão ou bypass de autorização.

| Saída | Observações/citações | Avaliação qualitativa |
|---|---|---|
| comparison, repetição 1 | Termos, prazos, garantia e periodicidade reproduzem as fontes | Sem bloqueio próprio identificado. Hipóteses causais são especulativas, mas marcadas como possibilidade e acompanhadas de perguntas. |
| comparison, repetição 2 | Termos e lacunas principais reproduzem as fontes | Sem bloqueio próprio identificado; não demonstra superioridade econômica de proposta, e explicita falta de preço. |
| meeting, repetição 1 | Atividade, estoque, expansão e documentos não recebidos preservados | Sem bloqueio próprio identificado; perguntas úteis e sem cálculo ou decisão financeira. |
| meeting, repetição 2 | Mesmas fontes preservadas | Sem bloqueio próprio identificado; mantém financiamento não selecionado e solicita documentos. |
| review, repetição 1 | Observações extrativas corretas | O texto da primeira hipótese é condicional, mas sua pergunta pressupõe ausência de covenant. Perguntas de lacuna sobre adicionar covenant/definir cronograma também devem primeiro confirmar se já existem e pedir os documentos. |
| review, repetição 2 | Observações extrativas corretas | Bloqueio confirmado: hipótese passa de não fornecido para inexistente, repetido como premissa em perguntas. |

Prova exata principal: `runs[5].product.hypotheses[2].text` termina em **“given no leverage covenant exists”**. A fonte `protection` diz **“No leverage covenant or amortization schedule has been provided.”** A fonte não comprova que o contrato não contém covenant. `runs[5].product.hypotheses[0]` também parte de “The absence of a leverage covenant and amortization schedule”; sua pergunta pede proteções que compensariam essa falta. Rotular o bloco como hipótese não transforma essas premissas em informação confirmada.

Na repetição 1, a frase “If the loan is unsecured and lacks a leverage covenant” mantém uma condição explícita, portanto não equivale à afirmação categórica da repetição 2. Entretanto, a pergunta subsequente já fala em compensar “the absence of security and a leverage covenant”, perdendo a condição. A correção deve abranger hipóteses, perguntas e lacunas, não apenas observações ou uma expressão isolada.

Correção mínima recomendada: instrução canônica explícita para distinguir **não recebido/não documentado nos trechos** de **inexistente/inaplicável**, inclusive em perguntas; teste adversarial que preserve estas saídas como negativos; repetir o executor real e revisar novamente as seis entregas. Pergunta apropriada neste caso: “Existe covenant de alavancagem ou cronograma de amortização? Se existir, fornecer os termos para revisão.” Não editar o artefato aprovado pelo score, relaxar o critério, ou trocar ausência por existência presumida. Caso a geração continue perdendo a distinção, limitar a hipótese à lacuna documental até obter uma representação estruturada verificável.

Essa constatação complementa e restringe o parecer estático anterior: os contratos de autorização, atribuição literal e persistência passaram pelos testes locais, mas não bastaram para assegurar preservação semântica das premissas livres. A análise aqui não cobre E2E de aplicação nem certifica o domínio financeiro.

## Nova execução 34304668616: incerteza preservada, entrega incompleta

Workflow concluído com **FAILURE**, SHA `72f4812e88a0fcce1a59ac84b0e2ce5de1ddd482`, tentativa 1. Artefatos baixados pelo revisor em `/private/tmp/offroad-live-executor-34304668616/document-work-product-live/`: `evidence.json` e `summary.md`. Foram inspecionados os cinco produtos e a narrativa rejeitada da sexta chamada, incluindo observações, citações, hipóteses, perguntas, lacunas e fontes. Sem nova execução ou edição dos artefatos.

Resultado automatizado: **5/6 PASS**, seis chamadas, custo conhecido de **US$ 0,14455**, zero chamadas de custo desconhecido. `review`, repetição 1, não produziu produto válido: `document_work_product_unbound_number`. A hipótese rejeitada contém “over the 24-month term”, embora o contrato proíba dígitos em hipóteses e perguntas, inclusive quando o prazo aparece na fonte. A recusa é consistente com o contrato vigente e não deve ser removida para fazer este resultado passar. Isso demonstra falha fechada, mas também falha de entrega nessa repetição.

| Saída | Revisão independente |
|---|---|
| comparison 1 | Observações e citações fiéis; condições de preço/prepagamento continuam desconhecidas. Hipóteses causais são explicitamente condicionais. Sem novo bloqueio semântico identificado. |
| comparison 2 | Preserva termos e lacunas; pergunta pela existência das condições. A hipótese sobre garantia e ausência de colateral permanece condicional, sem confirmar ausência. Sem novo bloqueio semântico identificado. |
| meeting 1 | Preserva documentos não fornecidos sem inferir que não existem. Perguntas de montante, cronograma e dívida permanecem pedidos de informação. Sem novo bloqueio semântico identificado. |
| meeting 2 | Explicita os cenários de documentos existentes mas não compartilhados e solicita confirmação. Sem novo bloqueio semântico identificado. |
| review 1, narrativa rejeitada | Observações fiéis; hipóteses e perguntas preservam condição/existência desconhecida dos covenants e cronograma. Rejeição por dígito em hipótese; não existe produto aprovado desta chamada. |
| review 2 | Hipóteses usam “If”; perguntas e lacunas perguntam se covenant/cronograma existem antes de inferir consequências. Não repete a premissa categórica “given no leverage covenant exists”. Sem novo bloqueio semântico identificado. |

O P1 original permanece no histórico e não foi apagado nem convertido retroativamente em PASS. Nesta nova amostra, a correção de incerteza apresenta evidência favorável: não encontrei sua reincidência categórica. Isso não prova generalização semântica nem encerra todos os critérios de promoção. **Não aprovar ativação com este run:** o próprio gate falhou e a repetição de revisão não entregou produto. O próximo trabalho é melhorar o cumprimento da restrição numérica e obter nova prova completa, mantendo o diagnóstico rejeitado e os critérios atuais. O revisor não autorizou rerun, promoção, publicação ou mudança do guard.
