# Sistema de workflows expert: plano de fechamento (5 de setembro de 2026)

Decisão do fundador em 4 de setembro de 2026, à noite: não começa teste real no produto agora.
A infraestrutura conceitual melhorou, mas o sistema expert não está ligado de ponta a ponta. Este
documento converte o game plan dele em plano de trabalho com inventário medido, ordem, gates e
o que já foi entregue na primeira onda.

## 1. Inventário medido no código (4 de setembro de 2026)

| Componente | Estado medido | Onde |
| --- | --- | --- |
| Atlas de intenções | documentado | `docs/product/CANONICAL_INTENT_WORKFLOW_ATLAS.md` |
| TaskSpecs | 80, todos `specified`, nenhum com método vinculado | `packages/work-plan/src/task-registry.ts` |
| Procedimentos canônicos | 224, todos `candidate`, 0 com evidência de implementação | `packages/credit-playbook/src/procedures/*.ts` |
| Procedimentos da casa referenciados | 252 ids em 11 módulos, fonte única em um arquivo | `packages/credit-playbook/knowledge/HOUSE-PLAYBOOK-COMPLETO-v2.md` |
| Depth packs | 17 `implemented`, 0 revisados, 0 gold, 0 adversariais, 0 baseline; 88 ids de procedimento e 30 cálculos referenciados | `packages/credit-playbook/src/depth-packs/registry.ts` |
| Parâmetros de metodologia e mercado | 71, todos `required_missing` | `packages/credit-playbook/src/reference-data.ts` |
| Roteador por intenção | só sombra; produção nasce dos seis entry jobs | `apps/document-worker/src/intent-shadow.ts`, `packages/work-plan/src/capital-jobs.ts` |
| Gabaritos econômicos | Caso 01 em v0.4 (auditado, escrituras lidas, ainda rascunho); casos 02 a 05 sem gabarito | `docs/product/gold-cases/` |
| Baseline generalista | Caso 01 executado uma vez (Opus 5, US$ 5,75) | `docs/product/gold-cases/runs/gc01/baseline/` |

Os packs alimentam requisitos de cobertura; as instruções compiladas dos procedimentos ainda não
estão vinculadas aos executores. O hash do registro entra no manifesto, mas isso não prova que
cada task execute aquele método.

## 2. Os nove passos, na ordem do fundador

1. **Corrigir a verdade econômica.** GC01 v0.3 e v0.4 feitos (auditoria de onze pontos; escrituras
   no pack resolvem covenant e custo de saída). Faltam: termos de securitização dos CRA, gabaritos
   02 a 05, fixtures gerenciais de Camil, Aurora e Prisma, revisão independente.
2. **Biblioteca canônica de métodos.** Um arquivo Markdown por método, com frontmatter estruturado
   e seções fixas, compilado para o contrato canônico. Entregue nesta onda: formato, compilador,
   testes e os três primeiros métodos do Caso 01. Falta: auditar os 224 candidatos (manter, fundir,
   aprofundar, eliminar), migrar os necessários aos cinco casos, preencher os 71 parâmetros com
   fonte e dono.
3. **Conectar método a executor.** Entregue nesta onda: a TaskSpec aceita `procedure` (id e
   versão) e o gate `assertTaskPromotable` recusa produção sem método em produção com evidência de
   implementação; o método declara `task_specs`, `calculation_ids`, `gold_cases` e chaves de
   parâmetro, e o teste prova que tudo existe. Falta: executor, ferramentas autorizadas, inputs,
   output schema e testes de promoção registrados task a task; nenhum executor improvisa.
4. **Router e compilador em produção controlada.** Depende de 2 e 3 e da régua dos 16 turnos gold.
5. **Núcleo econômico determinístico.** Spreading, ledger de dívida, juros e IPCA capitalizado ou
   pago, forecast, CFADS, DSCR, ICR, alavancagem pelas definições literais, garantias, before/after,
   linhagem de cada número.
6. **Workflow conversacional persistente.** Estados reais do chat, do pedido à edição incremental.
7. **Outputs reais.** Modelo editável, mapa de dívida, comparação, estrutura indicativa, memo,
   pitch, board deck, teaser, term sheet, matching.
8. **Homologação por workflow.** Unit, dois casos gold, adversariais, comparação com o melhor
   generalista, vinte execuções de consistência sobre objetos canônicos, revisão especializada,
   PT-BR e EN, custo e latência, nenhuma afirmação material sem trace.
9. **Só então o teste real.** Gates: cinco casos completos sem branch essencial em `deferred`;
   router ativo e homologado; todo procedimento ativado em `production`; 100% dos números materiais
   rastreáveis; mesmo input, mesmo estado econômico; arquivos gerados e editáveis; o sistema mostra o
   que analisou e o que não analisou; vantagem material documentada sobre o generalista.

## 3. Consistência: identidade econômica, não redação

Para o mesmo prompt, histórico, fontes, data-base, metodologia, procedimentos e modelos, ficam
idênticos: fatos, definições, números, premissas, cálculos, lacunas, coverage map, alternativas,
motivos, ranking, estrutura e materiais derivados. Exige fingerprint da execução, extração e
cálculos determinísticos, fatos e claims persistidos como objetos versionados, snapshot aprovado
reutilizado quando nada muda, invalidação seletiva, prosa gerada dos objetos e um teste de vinte
execuções que compara objetos canônicos. Temperatura zero não resolve.

## 4. Formato de método (fonte humana, compilada)

Arquivo em `packages/credit-playbook/knowledge/procedures/<área>/<método>.md`. Frontmatter com
id, versão, maturidade, títulos, papel, estágio, dono, aprovador, data, ids do playbook,
autoridades, chaves de parâmetro, `task_specs`, `calculation_ids`, `gold_cases`, dependências.
Seções fixas: Objetivo, Produto, Quando ativar, Quando não ativar, Inputs mínimos e substitutos,
Sequência operacional (cada passo com modo `deterministic`, `model_assisted` ou `human_judgment`,
ferramentas e evidência), Cálculos determinísticos, Julgamentos permitidos, Perguntas que mudam o
trabalho, Red flags, Stop conditions, Outputs (campo, tipo, obrigatoriedade), Exemplos (Bom, Ruim),
Testes (Unit, Gold, Adversarial, Aceitação), Evidência (Hierarquia, Regras). O compilador
(`procedure-markdown.ts`) rejeita seção ausente ou passo sem modo, valida contra
`canonicalProcedureSchema`, e o teste prova que toda referência (TaskSpec, procedimento da casa,
chave de parâmetro, dependência) existe. O hash da biblioteca muda com qualquer byte.

Composição: intenção → trabalho principal, objeto, decisão, audiência → necessidade econômica,
instrumento, setor, análise, jurisdição → DAG de métodos homologados → fatos, premissas, cálculos,
claims, coverage map → chat, modelo, memo, apresentação, matching. Catálogo amplo, Pareto
homologado em profundidade, composição confiável, abstenção explícita onde a casa não é expert.

## 5. Próxima onda (ordem de ataque)

1. Termos de securitização dos CRA da Camil e comprovação da quitação dos CRA de referência; GC01
   v0.5 com custo de saída completo (taxa de referência do make-whole).
2. Métodos do Caso 01 restantes: conciliar demonstrações, cronograma de juros e IPCA capitalizado
   versus pago, dívida líquida por definição, cenários declarados, custo de saída por série,
   before/after de refinanciamento, plano de reunião. Cada um com testes gold ligados ao gabarito.
3. Executor por método: um executor determinístico por método financeiro do Caso 01, ligado ao
   `financial-core`, com `implementation` preenchido; a primeira promoção a `production` passa pelo
   gate.
4. Gabarito 02 (CFO Camil) a partir do 01 mais fixtures gerenciais sintéticas e declaradas.
5. Parâmetros: os que os métodos do Caso 01 citam recebem valor proposto, fonte, dono e status
   `draft`; aprovação nomeada antes de `approved`.
