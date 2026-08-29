# Auditoria do produto contra o fluxo canônico

> Data: 29 de agosto de 2026.
>
> Referência: [`../product/PRODUCT_WORKFLOW.md`](../product/PRODUCT_WORKFLOW.md).
>
> Esta auditoria separa infraestrutura existente de experiência comprovadamente
> utilizável. Código, schemas e procedimentos internos não equivalem a uma etapa
> pronta para o cliente.

## 1. Conclusão executiva

O sistema contém uma base técnica valiosa: workspace privado, intake, documentos
com procedência, pipeline governado, conciliação e cálculos determinísticos,
playbooks, contratos de materiais, matching e controles de introdução. O problema
central não é ausência total de tecnologia. É a falta de uma jornada única que
transforme essa infraestrutura na sequência aprovada pelo fundador.

Hoje, o caminho observado tende a saltar de intake e processamento para análises
internas. Faltam, como superfícies conectadas do produto:

1. a base de entendimento apresentada e confirmada pelo cliente;
2. o loop completo de findings e esclarecimentos;
3. a comparação e aprovação de alternativas de estrutura;
4. o plano de produção específico do caso;
5. a produção comprovada de todos os arquivos institucionais;
6. a revisão integrada pela companhia; e
7. o matching final explicado e autorizado.

Por isso, uma execução cara do motor não representa um teste ponta a ponta. Ela
mede apenas uma parte da inteligência interna e pode consumir modelos antes de
existir a decisão que justificaria o trabalho.

## 2. Estado por etapa

| Etapa | Estado | Evidência existente | Gap para o produto canônico |
|---|---|---|---|
| 0. Ambiente privado | Parcialmente live | Confidencialidade, projeto privado, trilha de aceite e identidade do projeto existem no onboarding | Comprovação de poderes precisa permanecer como gate anterior ao mercado, com estado claro e sem bloquear o preparo; confirmar que todos os caminhos antigos foram removidos |
| 1. Intake guiado | Parcialmente live | Jornada guiada, arquétipos e escadas de informação existem no playbook e na interface | Nem toda solicitação mostra, de forma consistente, razão, decisão dependente, substitutos, possibilidade de avanço e consequência; os três horizontes de informação ainda não formam um contrato único na UI |
| 2. Recebimento e organização | Live na infraestrutura, parcial na experiência | Upload privado, hash, classificação, extração e camadas de evidência existem | A visão de cobertura e organização ainda precisa ser apresentada como plano vivo do caso, sem sugerir upload em massa ou processamento completo a cada arquivo |
| 3. Entendimento profundo | Parcial interno | Case engine, procedimentos setoriais, reconciliação, financial core e pesquisa governada possuem componentes | Não há uma visão canônica, versionada e confirmável pelo cliente que una companhia, setor, operação, números, dívida, projeto e pesquisa pública antes da estruturação |
| 4. Cross-check e findings | Gap crítico | Existem candidatos, pendências, evidências, conflitos e estados internos em diferentes pacotes | Falta uma superfície única com as sete classes aprovadas, evidência, impacto, razão e ação; o cliente ainda não confirma nem corrige uma base factual consolidada |
| 5. Esclarecimentos | Parcial | O M0 compila solicitações e limita lotes ativos; há conceitos de próxima melhor solicitação | Falta o loop ponta a ponta que atualiza apenas dependências afetadas, recalcula gates e retorna ao cliente um entendimento atualizado até suficiência para estruturar |
| 6. Estruturação | Parcial interno | Playbook, instrumentos, receivables vertical, financial core e case engine suportam análises e alternativas candidatas | Falta uma experiência de comparação, trade-offs, impacto, screening anônimo e aprovação da estrutura pelo cliente; hoje a base aprovada para produção não é um objeto de produto claro |
| 7. Plano de produção | Ausente como produto | Existem templates e contratos genéricos | Não existe um plano específico do caso, visível e versionado, listando artefatos, seções, fontes, hipóteses, dependências e status |
| 8. Produção institucional | Parcial e não comprovada ponta a ponta | Há schemas, renderizadores e rotas candidatas para memo, term sheet, data room e modelo | O teste observado não produziu pacote real. É necessário comprovar geração dedicada de modelo, teaser, memo, term sheet e data room a partir da base e estrutura aprovadas, sem fixture, stub ou texto genérico |
| 9. QA e aprovação | Parcial interno | Fingerprints, manifests, rastreabilidade e algumas validações cruzadas existem | Falta revisão integrada pela companhia, comentários, comparação de versões, regeneração seletiva e aprovação explícita do pacote como uma unidade consistente |
| 10. Matching em duas fases | Parcial interno | Catálogo amplo de provedores, mandate truth, elegibilidade e matching têm contratos e componentes | O screening anônimo e a shortlist final não estão conectados à estrutura e aos materiais aprovados; dados reais de mandato podem estar ausentes, desatualizados ou ainda não comprovados na experiência |
| 11. Introdução qualificada | Infraestrutura parcial | Gates, registros e fronteiras de qualified introduction existem em decisões e pacotes | Falta provar a jornada real com autorização exata de destinatário, material e versão, além do acompanhamento das perguntas, sem ultrapassar a fronteira DCM |

## 3. O que preservar

- isolamento por organização, RLS e storage privado;
- hashes, originais imutáveis e procedência;
- financial core determinístico;
- procedimentos canônicos e skills compiladas;
- contratos de evidence compiler, reconciliação e findings;
- limites de no máximo cinco solicitações ativas;
- tipologia ampla de provedores, sem reduzir recebíveis a FIDC;
- fronteira de introdução qualificada; e
- worker e filas como infraestrutura determinística.

## 4. O que adaptar

### Onboarding

O onboarding atual deve terminar no intake guiado e na primeira base de
informações. Ele não deve fingir que todo o produto possui apenas três passos nem
comprimir entendimento, estrutura, produção e mercado numa mesma etapa.

### Pipeline interno

O pipeline deve persistir snapshots entre decisões. Um snapshot não pode ser
sobrescrito por uma nova interpretação sem versão e delta. Os principais objetos
passam a ser:

- `understanding_snapshot`;
- `finding_register`;
- `clarification_batch`;
- `structure_option`;
- `structure_decision`;
- `production_plan`;
- `material_artifact`;
- `package_review`;
- `match_screen`; e
- `release_authorization`.

Os nomes são conceituais. O desenho físico precisa respeitar o schema existente,
RLS e as ADRs.

### Execução por modelos

O modelo deve receber tarefas estreitas. Absorver documentos, construir uma
análise completa, propor estrutura, redigir materiais e fazer matching numa única
execução é caro, difícil de avaliar e incompatível com os gates do produto.

## 5. O que mover ou remover

- remover qualquer caminho antigo que permita pular confidencialidade, intake ou
  confirmação;
- remover percentuais fixos que não derivem do estado real;
- mover produção de materiais para depois da decisão de estrutura;
- mover matching identificado para depois da aprovação do pacote;
- manter screening de mercado prévio apenas anônimo;
- remover auto-advance provocado por upload ou conclusão interna;
- remover linguagem interna, nomes de engine e estados técnicos da interface;
- remover chamadas caras que não produzam um objeto necessário ao próximo gate; e
- remover qualquer claim de material pronto quando existir somente schema,
  prompt, JSON ou renderer não alimentado pelo caso real.

## 6. Ordem de implementação recomendada

### Bloco A: contrato de estado

1. mapear os estados existentes para os estados canônicos;
2. definir transições, retornos e gates;
3. impedir avanço automático; e
4. fazer a interface derivar progresso do estado real.

### Bloco B: base confirmada

1. consolidar o `understanding_snapshot`;
2. implementar as sete classes de findings;
3. exibir fonte, impacto e razão;
4. permitir correção, confirmação e complemento; e
5. fechar o loop incremental de esclarecimentos.

### Bloco C: decisão de estrutura

1. gerar alternativas comparáveis a partir da base confirmada;
2. calcular impactos de forma determinística;
3. realizar screening anônimo quando houver dados válidos;
4. registrar ajustes e aprovação; e
5. reabrir lacunas quando a estrutura exigir nova informação.

### Bloco D: produção real

1. gerar o plano específico do caso;
2. fechar os templates na vertical durante sua execução;
3. produzir os cinco artefatos reais;
4. validar identidade econômica e procedência; e
5. implementar comentários, versões e aprovação do pacote.

### Bloco E: mercado

1. gerar shortlist apenas com mandato governado;
2. explicar aderência e objeções;
3. obter autorização individual de material e destinatário; e
4. registrar a introdução qualificada.

## 7. Regra para novos testes pagos

Até os blocos A e B estarem integrados, novos runs completos em produção não são
testes ponta a ponta e devem permanecer suspensos.

Cada execução paga precisa declarar antes de começar:

- objeto de produto esperado;
- etapa e gate atendidos;
- arquivos e versões de entrada;
- modelo, limite de custo e fallback;
- critério de sucesso;
- resultado persistido; e
- avaliação posterior de qualidade e custo.

Produção de materiais só deve consumir orçamento depois de existir uma estrutura
confirmada. Matching identificado só deve consumir orçamento depois de existir um
pacote aprovado.

## 8. Critério para declarar pronto para teste oficial

O produto estará pronto para um novo caso oficial quando:

1. a sequência do `PRODUCT_WORKFLOW.md` estiver representada por estados reais;
2. não houver caminho legado concorrente;
3. o cliente puder ver e corrigir o entendimento;
4. findings e esclarecimentos atualizarem apenas as dependências afetadas;
5. alternativas exigirem confirmação antes dos materiais;
6. o plano de produção for específico do caso;
7. os cinco artefatos forem arquivos reais e coerentes;
8. a companhia puder revisar e aprovar o pacote;
9. o matching tiver dados de mandato rastreáveis; e
10. a introdução exigir autorização exata de versão e destinatário.

Antes disso, os testes devem ser por bloco, com gold cases e orçamento controlado.
