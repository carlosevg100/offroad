# Motor de profundidade combinável para DCM

Status: arquitetura executável implementada; packs econômicos aguardam especificação, casos e
acreditação por escopo

## 1. Problema que este motor resolve

A Offroad precisa cobrir um universo amplo de trabalhos sem produzir análise genérica e sem criar
um produto diferente para cada combinação de setor, instrumento e necessidade.

O motor resolve isso compilando especializações pequenas, versionadas e testáveis. O caso não
escolhe uma “jornada fechada”. Ele ativa uma combinação de contexto econômico, domínio técnico e
função profissional. A combinação define o plano, a cobertura esperada, os cálculos, os termos, os
disconfirmers e os gates aplicáveis.

## 2. Unidade de trabalho

Os seis cards da entrada são atalhos. A unidade real é um `job` dentro de um projeto persistente.
O job pode ser entender uma companhia, preparar uma reunião, planejar capital, estruturar a partir
de documentos, revisar uma operação ou preparar materiais. Novos jobs podem ser adicionados sem
criar outro produto ou outro cérebro da companhia.

O mesmo projeto pode manter branches paralelos. Exemplo:

```text
questão: vencimentos relevantes nos próximos 18 meses
  ├─ branch A: refinance bilateral
  ├─ branch B: debênture com alongamento
  ├─ branch C: amend-and-extend e reorganização de garantias
  └─ branch D: liquidez preventiva sem refinance imediato
```

Os branches usam a mesma Company Truth. Premissas, cenários, decisões e materiais continuam
separados até combinação ou encerramento explícito.

## 3. Eixos independentes

O enquadramento deve preservar, separadamente:

1. **situação econômica observada:** o que está acontecendo;
2. **objetivo de capital:** o que se pretende mudar;
3. **uso dos recursos:** onde entra dinheiro novo, se houver;
4. **fonte de pagamento e capacidade:** o que sustenta o serviço da dívida;
5. **instrumento e família de capital:** uma alternativa, não o problema;
6. **risco e executabilidade:** termos, proteções, mercado e contingência.

Uma parede de vencimentos não significa automaticamente debênture. Uma expansão não significa
automaticamente recebíveis. Uma operação de recebíveis pode financiar giro, capex ou aquisição.

## 4. Funções profissionais

Função muda o ângulo, a linguagem e o work product, sem limitar o universo econômico:

| Grupo | Funções representativas | Ênfase de trabalho |
| --- | --- | --- |
| liderança | CEO, fundador, conselho, acionista | decisão, trade-offs e implicações estratégicas |
| finanças da companhia | CFO, tesouraria, FP&A, controladoria | caixa, capital, alternativas e preparação |
| banking e DCM | DCM, corporate banker, relationship manager, investment banker | tese, originação, estrutura e pitch |
| structured finance | structured finance e project finance | alocação de risco, fonte de pagamento e termos |
| distribuição | syndicate e distribuição | investibilidade, mercado, timing e demanda |
| assessoria | debt advisor e assessor independente | reconstrução, alternativas, pacote e processo |
| crédito | analista de crédito | reconstrução, riscos, capacidade, proteções e memo |
| risco | underwriter e risco de crédito | downside, políticas, exceções e condições |
| capital | gestor, CIO, comitê, originador, special situations | mandato, retorno, proteção e decisão |
| execução | jurídico, operações e middle office | documentação, condições e fechamento |

## 5. Depth packs

Cada pack pertence a uma dimensão:

```text
core
economic_situation
capital_objective
instrument
sector
analysis_domain
professional_function
jurisdiction
market_execution
```

Cada manifesto declara obrigatoriamente:

- id, versão e owner;
- gatilhos de ativação e jobs suportados;
- funções profissionais relevantes;
- requirements e impacto de decisão de cada um;
- evidência aceitável;
- procedimentos e cálculos determinísticos;
- termos da estrutura e critérios de mercado;
- disconfirmers e quality gates;
- dependências e incompatibilidades;
- maturidade e provas de promoção.

Exemplo de compilação:

```text
core.dcm
+ situation.maturity_concentration
+ objective.refinance_and_extend
+ sector.retail
+ instrument.debenture
+ analysis.covenants
+ function.dcm_origination
+ jurisdiction.br
```

O compilador:

- recusa pack sem núcleo;
- recusa id duplicado, dependência ausente e incompatibilidade;
- recusa duas definições conflitantes do mesmo requirement;
- combina requisitos sobrepostos e preserva a linhagem de todos os packs;
- aplica a maior materialidade ao requisito compartilhado;
- produz fingerprint determinístico do perfil compilado.

## 6. Coverage map

O perfil compilado cria o mapa de tudo que deveria ser examinado naquela decisão. Nenhuma dimensão
é omitida por silêncio. O estado inicial é `not_examined`.

| Estado | Significado |
| --- | --- |
| `not_examined` | esperado, mas ainda não analisado |
| `insufficient_evidence` | analisado; a base não sustenta uma resposta |
| `covered` | analisado e sustentado por evidência rastreável |
| `conflicting` | evidências materiais divergem |
| `not_applicable` | inaplicabilidade analisada e explicada |
| `deferred` | adiado conscientemente, com impacto registrado |

Uma dimensão bloqueadora aberta impede `decisionReady`. Uma dimensão não bloqueadora aberta não
desaparece: ela é exibida como limitação. `complete` só existe quando todas as dimensões estão
`covered` ou `not_applicable`.

O painel deve mostrar por domínio:

- o que foi analisado;
- qual evidência sustenta a leitura;
- o que está faltando ou conflitante;
- qual decisão aquela lacuna pode mudar;
- qual é a próxima melhor forma de resolvê-la.

## 7. Fluxo de execução

1. recuperar contexto autorizado quando houver;
2. resolver companhia, decisão, audiência e regime de evidência;
3. inventariar e ler documentos antes de perguntar;
4. classificar situação, objetivos, usos, fontes de pagamento e alternativas já propostas;
5. selecionar os packs candidatos com justificativa e evidência de ativação;
6. compilar o perfil de especialização e o coverage map;
7. construir o DAG de pesquisa, extração, conciliação, cálculo e julgamento;
8. executar tarefas independentes em paralelo;
9. atualizar cobertura, conflitos e materialidade após cada resultado;
10. pedir no máximo três pontos que mais alteram a próxima decisão;
11. apresentar análise, alternativas, implicações e limitações, sem conclusão artificial;
12. registrar escolha do usuário, replanejar branches e compilar work products governados.

## 8. Maturidade e promoção

| Maturidade | O que significa | Uso permitido |
| --- | --- | --- |
| `specified` | coverage, regras e fronteiras descritas | planejamento e identificação de lacunas |
| `implemented` | procedimentos e cálculos conectados | execução interna e fixtures |
| `tested` | integração, gold e adversarial verdes | shadow e revisão especialista |
| `production` | benchmark, revisão e evidência completas | uso no escopo exato acreditado |

Um pack de produção exige, no mínimo:

- dois gold cases com respostas materialmente distintas;
- caso adversarial;
- benchmark cego contra o melhor modelo generalista;
- revisão especialista registrada;
- dependências também acreditadas;
- nenhum cálculo crítico delegado a texto livre;
- versão e fingerprint exatos.

## 9. Teste de sobrevivência

O baseline é o melhor modelo generalista disponível com os mesmos documentos e objetivo. A
Offroad precisa demonstrar superioridade material em cobertura, rastreabilidade, reconciliação,
profundidade, discriminação entre alternativas, completude de termos, matching e impacto na
decisão.

O outcome é um objeto auditável, não copy de marketing:

- insight material não óbvio encontrado;
- erro evitado;
- estrutura alterada;
- pitch melhorado;
- tempo relevante economizado;
- mandato apoiado;
- caminho de execução melhorado;
- provedor de capital melhor identificado.

Cada observação declara se foi confirmada pelo usuário, observada externamente, medida pelo sistema
ou apenas estimada. Uma estimativa isolada não aprova o pack.

## 10. Ordem de implementação

### Wave 0: fundação, concluída neste slice

- taxonomia de situações, objetivos e usos;
- funções profissionais granulares;
- schema e compilador de depth packs;
- coverage map com omissão explícita;
- gate de maturidade;
- contrato de impacto e teste de sobrevivência;
- onboarding PT-BR/EN-US e persistência preparados para as novas funções.

### Wave 1: Pareto econômico

- núcleo DCM transversal;
- refinance, liability management, liquidez e capital de giro;
- capex e expansão, aquisição e reorganização de garantias;
- dívida, vencimentos, covenant, garantia, business plan e downside;
- bilateral, CCB, debênture, nota comercial, FIDC/cessão e club/sindicado no Brasil;
- revolver, term loan, ABL, private credit, unitranche e syndicated loan nos Estados Unidos.

### Wave 2: profundidade de setor e mercado

- setores ordenados por volume real e risco observado;
- comparáveis e pricing com validade;
- critérios discriminantes de capital-provider fit;
- feedback de mercado que atualiza mandato sem contaminar fatos privados.

### Wave 3: work products e impacto

- coverage map completo no painel do projeto;
- memo, pitch, modelo e term sheet compilados do mesmo snapshot;
- comparação cega contínua contra generalistas;
- captura de outcome em casos reais;
- promoção ou regressão automática de pack por evidência.

## 11. Critério de aceite

Esta camada só está concluída quando um revisor consegue responder, para qualquer output material:

1. quais packs foram ativados e por quê;
2. o que deveria ter sido analisado;
3. o que foi coberto, omitido, adiado ou ficou conflitante;
4. quais fatos, cálculos e procedimentos sustentam cada leitura;
5. quais alternativas foram afastadas e por quê;
6. o que o usuário decidiu e como o plano mudou;
7. qual valor observável a Offroad adicionou sobre o baseline generalista.
