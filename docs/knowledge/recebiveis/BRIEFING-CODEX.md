# Briefing · Vertical de recebíveis: treinamento e testes

Para o agente que vai implementar e operar a primeira vertical do produto. Leia este
documento inteiro antes de qualquer mudança, e depois leia a base de conhecimento na
ordem da seção 3. As regras gerais do repositório em `AGENTS.md` continuam valendo
integralmente; este briefing as especializa para a vertical.

## 1. Onde estamos e o que muda agora

A fase de construção visual e de fluxo está entregue. Começa a fase de **treinamento e
teste do sistema** na primeira vertical: financiamento de empresas por recebíveis. O
objetivo é que o sistema receba um caso real de empresa, com documentos bagunçados e
pedido mal formulado, e produza análise, perguntas e recomendação **no nível de uma
mesa de DCM sênior**, sem inventar um número sequer.

A Offroad senta do lado da companhia cedente, nunca do lado do veículo. O comprador já
existe e já captou; nosso trabalho é análise, preparação e acesso com competição.
Quem esquecer isso escreve o produto errado.

## 2. A arquitetura em cinco camadas, e a regra que não se negocia

| Camada | Função | Executor |
|---|---|---|
| 1 Classificação | Ler o intake e identificar a categoria e a célula da operação | Modelo, guiado pelo catálogo |
| 2 Cálculo | Toda métrica financeira: prazo médio, DSO, concentração, aging, roll rate, perda por safra, diluição, recompra, dívida ajustada, CET | **Código determinístico, nunca modelo** |
| 3 Elegibilidade | Confrontar métricas com critérios de compradores | **Código determinístico** |
| 4 Recomendação | Portas, compradores, ajustes, trajetória | Modelo, restringido pelas camadas 1 a 3 |
| 5 Redação | Material por tipo de comprador | Modelo, sob a doutrina de templates |

**Número é código.** O modelo não calcula, não soma, não interpola. Ele lê o resultado
da camada 2 e escreve sobre ele. Isso é a invariante 4 do `AGENTS.md` (matemática
determinística em `packages/financial-core`) aplicada à vertical. Qualquer atalho aqui
é rejeitado em review.

**Procedência em toda afirmação.** Toda saída numérica ou normativa carrega um de três
estados: **[M]** medido (com âncora em arquivo, aba e linha), **[C]** citado (com
documento, cláusula e data) ou **[E]** estimado (com base e data). Afirmação sem
estado não sai. Critério de fundo sem regulamento no corpus faz o comprador aparecer
como "não avaliado", nunca com critério inventado.

## 3. Ordem de leitura da base de conhecimento

Tudo em `docs/knowledge/recebiveis/`. A ordem importa:

| # | Documento | O que dá |
|---|---|---|
| 1 | `00-PROGRAMA.md` | O enquadramento: lado da mesa, as três consequências, o método |
| 2 | `02-MAPA-DE-CASOS.md` | As 14 categorias com exemplos, as 3 perguntas de triagem, a métrica decisiva de cada categoria |
| 3 | `01-QUEM-COMPRA.md` | As 4 portas, compradores nomeados, critérios de elegibilidade, esteira de 14 etapas, apetite |
| 4 | `03-AS-SOLUCOES.md` | Os formatos de operação e quando cada um serve |
| 5 | `fichas/A1-mercantil-fidc-multicedente.md` | **O manual de mesa da célula núcleo**, 12 partes: título, cessão, preço, tributo, contabilidade, operação, análise, contrato, compradores, playbook. É o padrão de profundidade de tudo |
| 6 | `casos/A1-mercantil-b2b-CASOS.md` | Os 20 casos de treinamento da célula A1, com gabaritos |
| 7 | `10-COMO-TREINAR.md` e `11-TREINAMENTO-001.md` | O método de treinamento, a matriz de 37 células, o formato de gabarito, a disciplina antialucinação |

Referências vivas fora desta pasta: o caso sintético completo da Vertentes (acervo de
21 arquivos, base de 34 mil títulos, gabarito medido) e seus geradores, hoje em
`Offroad Capital/simulacao/` fora do repo, a migrar para `packages/testing-fixtures`
quando a esteira de testes for construída. Os 10 instrumentos existentes em
`packages/credit-playbook` são a semente da camada 3.

## 4. O que construir, em ordem

### Fase 1 · A calculadora da célula A1
Implementar a régua completa da Parte VII da ficha A1 como código tipado e testado,
dentro do padrão de `packages/financial-core` ou como pacote irmão
(`packages/receivables-analytics`): prazo médio ponderado, DSO simples e countback,
concentração por raiz de CNPJ e por grupo, aging nas 7 faixas, roll rate, perda por
safra nas 6 janelas, diluição, recompra e perda ajustada, liquidação pontual,
prorrogação, ponte de dívida ajustada, CET de proposta (com conversão por dentro/por
fora da Parte III.2 da ficha e tarifas por título), advance rate implícito.
**Toda função com testes de igualdade exata contra valores do gabarito da Vertentes.**
Regra de calibração aprendida: a data base é a data da última emissão da base, nunca
posterior.

### Fase 2 · O motor de elegibilidade
Estrutura tipada de critérios por comprador (schema no fim de `01-QUEM-COMPRA.md` e
seção 2 de `11-TREINAMENTO-001.md`), avaliação título a título, e a saída correta:
**elegibilidade é percentual da carteira por comprador, nunca sim ou não**, mais a
lista de incompatíveis com a cláusula exata que barra e o ajuste que destrava.
Semear com os critérios [C] já citados (Multiplica, SB Crédito, RDF) e deixar os [E]
marcados como não avaliados até o corpus de regulamentos entrar.

### Fase 3 · A esteira de casos
Harness que roda um caso (acervo de entrada) de ponta a ponta pelas 5 camadas e
compara com o gabarito: métricas exatas, defeitos encontrados (recall e precisão),
compradores compatíveis, perguntas ancoradas em gatilho. Primeiro caso: a Vertentes,
que implementa o A1-03. Depois, geradores parametrizados para os demais 19 casos do
banco A1, no padrão dos geradores da Vertentes.

### Fase 4 · Interação com o usuário
Ligar as camadas ao fluxo do produto: a classificação alimenta a triagem do intake, a
camada 2 alimenta o painel, as perguntas saem **em lote único, cada uma com o gatilho
medido declarado**, nunca gotejadas, e a companhia jamais é interrogada sobre o que
documento entregue, base ou fonte pública já respondem.

## 5. Critério de aprovação, por fase

| Métrica | Barra |
|---|---|
| Cálculo (camada 2) contra gabarito | Igualdade exata, 100% |
| Classificação de categoria | ≥ 95% nos casos do banco |
| Recall de defeitos plantados | ≥ 90% |
| Precisão de defeitos (não inventar) | ≥ 85% |
| Compradores compatíveis contra gabarito | Igual, com cláusula citada |
| Perguntas | Todas com gatilho medido; zero perguntas respondíveis por documento entregue |
| Procedência | 100% das afirmações numéricas e normativas com [M], [C] ou [E] |

Casos resolvidos viram testes de regressão permanentes. Mudança que melhora um caso e
piora outro não entra.

## 6. Regras de conduta herdadas do produto

1. Linguagem de mercado financeiro institucional, sem jargão decorativo e sem tom de
   LLM. Nunca usar travessão em texto de produto.
2. Sempre enquadramento positivo: dizemos o que garantimos e embasamos, não o que
   caçamos. "Apontamos eventuais discrepâncias ou pontos que mereçam esclarecimento."
3. A empresa nunca é interrogada; a escada de resolução esgota documento e fonte
   pública antes de qualquer pergunta.
4. Privacidade em busca externa: só identificadores públicos saem (nome, CNPJ, CNAE,
   região, contrapartes já públicas). Números de demonstração, saldos, margens,
   carteira e objetivo da operação nunca saem para serviço externo.
5. Fixtures sintéticas sempre rotuladas como sintéticas, invariante 10 do `AGENTS.md`.

## 7. Como reportar

Ao fim de cada fase: o que passou no critério da seção 5 com os números, o que não
passou e por quê, e o que descobriu que contradiz ou refina a base de conhecimento.
Achado que corrige a base vale tanto quanto código: a base é o produto.
