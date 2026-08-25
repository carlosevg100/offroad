# Auditoria técnica do House Playbook completo

Data: 25/08/2026
Fonte auditada: `packages/credit-playbook/knowledge/HOUSE-PLAYBOOK-COMPLETO-v1.md`
Escopo: 11 módulos, 270 entradas, da captura do pedido à introdução qualificada e às referências pós-introdução.

> Registro histórico da auditoria do v1. As correções foram incorporadas ao v2.1 governado. A
> revisão vigente está em `docs/build/HOUSE_PLAYBOOK_V2_REVIEW_2026-08-25.md`.

## 1. Veredito

O arquivo é uma base de conhecimento de mesa forte e substancialmente melhor que o esqueleto
anterior. A sequência de IDs está completa, sem duplicidades e sem referências internas quebradas.
Ele não é, ainda, um conjunto de 270 procedimentos executáveis na densidade do M3.

O conteúdo mistura oito naturezas diferentes:

1. workflows;
2. métodos de análise;
3. cálculos;
4. regras de decisão;
5. lentes setoriais e de comprador;
6. referências de mercado;
7. fragmentos de template;
8. políticas de conduta e controles.

Transformar cada título em uma chamada de modelo produziria exatamente a arquitetura que a
Constituição proíbe. Cada entrada deve continuar identificável, mas sua forma compilada depende da
natureza: função determinística, schema, cálculo, validador, template, referência versionada ou
chamada estreita de modelo.

O snapshot foi incorporado como fonte, catalogado e mantido fora do registry executável. Todas as
270 entradas carregam `readyToCompile: false` até receberem objetivo, produto, procedimento,
saída estruturada, evidência, testes e os campos ampliados exigidos pelo contrato.

## 2. Correções técnicas obrigatórias antes da promoção

### 2.1 Não existe uma única dívida ajustada para todos os usos

`D-24` precisa produzir visões reconciliadas, não um único número:

- dívida financeira bruta e líquida;
- dívida para a definição de covenant vigente;
- obrigações financeiras ajustadas para capacidade de pagamento;
- obrigações quase financeiras e compromissos de caixa;
- contingências e exposições fora de balanço;
- visão específica do comprador ou instrumento.

Parcelamento tributário, arrendamento, risco sacado, coobrigação, cota subordinada, earn-out e
provisão não podem ser somados automaticamente na mesma métrica. Cada inclusão exige convenção,
racional, perímetro e uso downstream.

### 2.2 FIDC é veículo, não instrumento universal nem sinônimo de carteira

O modelo precisa separar:

- ativo ou direito creditório;
- instrumento jurídico que documenta a obrigação;
- estrutura de cessão, financiamento ou securitização;
- veículo investidor, como FIDC;
- gestor, administrador, custodiante, registradora e servicer;
- investidor final e mandato.

`IN-10`, `D-07`, `ES-12`, `ES-44`, `MK-04` e o catálogo de instrumentos devem usar essa taxonomia.
Retenção de cota subordinada ou de risco não significa, por si só, adicionar toda a carteira à
dívida. O sistema precisa medir coobrigação, recompra, first loss, consolidação, derecognition e
perda máxima retida.

### 2.3 CFADS e capacidade precisam de pontes completas

`Q-02` é conceitualmente correto, mas insuficiente como cálculo. O procedimento deve especificar:

- EBITDA reportado e ajustes aceitos e rejeitados;
- itens sem efeito caixa;
- imposto caixa;
- capital de giro por conta e período;
- capex de manutenção e compromissos mínimos;
- pagamentos de arrendamento conforme a convenção;
- distribuições, caixa restrito e fluxos fora do perímetro;
- recorrência e normalização;
- moeda, escala, sinal, período e entidade;
- reconciliação com fluxo de caixa e variação do caixa do balanço.

O produto não é uma fórmula solta. É uma ponte auditável de geração operacional até caixa
disponível para serviço, em histórico, base e downside.

### 2.4 Depreciação não é um piso universal de capex de manutenção

`Q-03` deve tratar depreciação apenas como um dos pontos de referência. Ativos antigos, inflação,
componentização, leasing, ativos totalmente depreciados, software capitalizado e ciclos de
reposição tornam a equivalência inválida. O método precisa usar registro de ativos, idade, plano de
reposição, capacidade utilizada, histórico de manutenção e engenharia do negócio.

### 2.5 A identidade da despesa financeira precisa de uma ponte

`D-25` não pode comparar apenas custo médio vezes dívida média com a linha financeira. A ponte deve
separar:

- juros caixa;
- atualização monetária;
- variação cambial;
- resultado de derivativos;
- fees e custos amortizados;
- juros capitalizados;
- multas e encargos tributários;
- arrendamentos;
- receitas financeiras.

A tolerância é dado versionado por qualidade da base e não um número fixo no texto.

### 2.6 Provisão provável não vira dívida financeira automaticamente

`D-16` deve manter provisões e contingências numa ponte de obrigações e no downside de caixa. A
inclusão em dívida, dívida líquida, covenant ou alavancagem depende da definição utilizada. Misturar
provisão operacional com dívida financeira piora a análise e pode duplicar o efeito no fluxo.

### 2.7 Concentração não transforma automaticamente um crédito em outro

Os 30% de `EMP-03` e `Q-06` devem sair do método fixo e ir para referência versionada. A análise
deve considerar qualidade, prazo, contrato, substituibilidade, margem, histórico e impacto da perda
ou redução do cliente. Concentração alta exige análise da contraparte e estresse, mas não cria uma
equivalência automática entre os dois créditos.

### 2.8 Choques e thresholds vivem em política versionada

O `+300 bps` de `D-27` é cenário de referência, não verdade permanente. O stress policy deve
combinar choque paralelo, curva forward, choque relativo, câmbio, inflação, margem, receita,
capital de giro, ramp-up e não-rolagem. Cada parâmetro carrega fonte, data, dono, validade e regime.

O mesmo vale para 0,5%, 30%, 40%, 1,0x, haircuts, LTV, headroom, meses de reserva e validade de
laudo. O procedimento fixa como usar; o registry de referência fixa o valor vigente.

### 2.9 Material institucional não pode prometer zero surpresa

`MA-07` e `LC-12` devem tratar zero surpresa como métrica de qualidade e objetivo operacional. O
texto não pode afirmar que uma diligência futura não encontrará nada novo. A obrigação da Offroad é
revelar o que conhece, manter rastreabilidade, registrar incerteza e aprender com cada surpresa.

### 2.10 QC de material não é aprovação de crédito

`MA-32` continua necessário, com linguagem precisa. O carimbo aprova a consistência e a liberação
daquela versão do material. Ele não aprova o crédito, não recomenda investimento e não compromete
capital. Autorização da companhia controla divulgação; QC controla qualidade e versão.

### 2.11 A execução atual termina na introdução qualificada

`MK-15` a `MK-18` formam o limite operacional atual. `MK-19` a `MK-28` descrevem NDA, competição,
book, alocação, fechamento, mercado e relacionamento pós-introdução. Permanecem conhecimento útil,
mas não podem ser ativados como execução da plataforma sem decisão explícita de expansão do
produto. O sistema não deve sugerir que negocia, aloca ou fecha a operação.

### 2.12 Afirmação jurídica exige fonte vigente e revisão especializada

Entradas classificadas como `LEI` não podem depender apenas do texto do playbook. O registro precisa
conter norma, dispositivo, URL ou identificador oficial, vigência, data de revisão e responsável.
Fontes iniciais governadas:

- [Lei 6.404 compilada](https://www.planalto.gov.br/ccivil_03/leis/l6404compilada.htm), inclusive o regime de debêntures;
- [Lei 14.430](https://planalto.gov.br/ccivil_03/_ato2019-2022/2022/lei/l14430.htm) para securitização;
- [Resolução CVM 175 consolidada](https://conteudo.cvm.gov.br/legislacao/resolucoes/resol175.html) e Anexo Normativo II para FIDC;
- [alteração do Anexo II pela Resolução CVM 240](https://www.gov.br/cvm/pt-br/assuntos/noticias/2026/cvm-edita-norma-com-ajustes-pontuais-no-anexo-ii-da-resolucao-175-sobre-fidc/) e ofícios circulares vigentes da CVM;
- [CPC 06 (R2)](https://www.cpc.org.br/CPC/Documentos-emitidos/Pronunciamentos/Pronunciamento?Id=37) para arrendamentos;
- normas específicas do instrumento e da garantia aplicáveis ao caso.

O playbook orienta a análise. Ele não substitui aconselhamento jurídico, tributário ou regulatório.

## 3. Diagnóstico por módulo

| Módulo | Situação atual | Forma executável correta | Prioridade |
|---|---|---|---|
| M0 Intake | princípios de UX e listas fortes; estados e produtos incompletos | state machine, sufficiency engine, request planner e question contract | crítica |
| M1 Empresa e setor | boa cobertura horizontal; lentes ainda curtas e sem data contracts | schemas de análise, métricas setoriais e lentes versionadas | alta |
| M2 Números | módulo mais raso diante da importância | cálculos determinísticos, pontes, identidades, exceções e schemas | crítica |
| M3 Dívida | módulo narrativamente mais forte; visões de dívida ainda misturadas | debt ledger, bridges, schedules, covenant views e stress functions | crítica |
| M4 Operação | boa lógica econômica; faltam contratos completos de cálculo | sources and uses, pró-forma, sizing e milestone schedule | crítica |
| M5 Estruturação | cobertura ampla; mistura economia, mercado e direito | alternative generator, constraints, mechanics, legal review e term basis | crítica |
| M6 Pricing | método correto; dados e comparabilidade não especificados | reference registry, comp normalizer, abstention e all-in model | alta |
| M7 Materiais | arquitetura forte; templates ainda precisam ser fechados campo a campo | template compiler, claim audit, cross-material consistency e disclosure gates | crítica |
| M8 Mercado | boa filosofia; taxonomia e fronteira precisam correção | mandate registry, hard filters, explainable ranking e introduction ledger | alta |
| M9 Red flags | bons sinais; falta detector, falso positivo e severidade | rules engine, composite flags, treatment workflow e human mandate decision | alta |
| M10 Linguagem | princípios excelentes; ainda narrativos | linters determinísticos, claim taxonomy, confidentiality and conflict gates | crítica |

## 4. Ordem de implementação

Não é eficiente aprofundar os módulos em ordem numérica pura. A vertical institucional precisa ser
fechada nesta sequência:

1. M10 como controle transversal;
2. M0 como entrada e contrato de interação;
3. M2 e M3 como verdade financeira;
4. M4 e M5 como operação e estrutura;
5. M7 como produto institucional;
6. M9 como proteção e decisão de apresentabilidade;
7. M1 por lente setorial necessária aos gold cases;
8. M6 e M8 como pricing, mandato e introdução.

Cada entrada passa por `source -> draft -> candidate -> production`. Um módulo pode ter itens em
maturidades diferentes. Nenhuma promoção ocorre por contagem ou por conclusão editorial.

## 5. Contrato mínimo de expansão de cada entrada

Antes de virar `draft`, cada item precisa registrar:

1. objetivo e produto;
2. tipo de artefato executável;
3. pré-requisitos e dependências;
4. inputs, evidência, hierarquia e tratamento de conflito;
5. passos com modo determinístico, modelo estreito ou julgamento humano;
6. cálculo, regra ou método detalhado;
7. schema de saída;
8. regras de decisão e reference-data keys;
9. red flags, stop conditions, exceções e estado `not_applicable`;
10. efeito downstream;
11. forma-pergunta do degrau 4, quando aplicável;
12. fronteira da Offroad;
13. testes unitários, gold, adversariais e de aceitação;
14. owner, autoridade, fonte, vigência e revisão exigida;
15. templates associados e fingerprints.

## 6. Biblioteca de casos necessária

Além dos arquétipos corporativos já definidos, a promoção modular exige casos por mecanismo:

- dívida com risco sacado, cessão com regresso, lease e cross-default;
- recebíveis com performados, a performar, recompra, concentração, first loss e cota subordinada;
- grupo com holding, opco, garantias cruzadas e caixa fora do perímetro;
- expansão com giro incremental, atraso de ramp-up e tranche por marco;
- refi com parede de vencimento, covenant apertado e liberação de gravame;
- aquisição com preço, earn-out, dívida assumida e pró-forma combinado;
- operação que não fecha e precisa ser redimensionada ou recusada;
- material PT e EN com identidade econômica;
- mandato expirado, filtro duro e introdução ao contato incorreto;
- sala adversarial com documentos conflitantes, prompt injection e informação ausente.

Cada caso terá gabarito por procedimento, não apenas um resultado final. O objetivo é identificar
qual módulo falhou e por quê.

## 7. Estado de promoção após esta auditoria

- 270 entradas catalogadas como fonte;
- 270 entradas impedidas de compilação automática;
- 11 módulos com ownership, stages, prioridade, reparos e gold cases definidos;
- 20 procedimentos da vertical expansão/capex continuam `candidate` e passam a receber ligação
  explícita às entradas do House Playbook;
- zero nova entrada promovida a `production` apenas com base no texto recebido.

Esse estado é intencional. A arquitetura está pronta para aprofundar conteúdo sem transformar
densidade editorial em falsa confiabilidade operacional.
