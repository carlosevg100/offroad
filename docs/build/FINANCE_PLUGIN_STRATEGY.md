# Estratégia para plugins e modelos financeiros externos

## Decisão

A Offroad não será construída como uma instalação dos plugins financeiros da Anthropic nem como
uma sequência de prompts dependente de um único modelo. Ela terá procedimentos próprios,
versionados e avaliados, executados por um gateway que pode usar Anthropic, OpenAI ou outro modelo
aprovado conforme a tarefa e a política de dados.

O repositório público `anthropics/financial-services` será usado como:

1. referência de arquitetura de agentes, skills, comandos e conectores;
2. fonte de padrões de workflow que possam ser adaptados legalmente;
3. benchmark de cobertura e qualidade;
4. conjunto de ideias para integração Office e outputs profissionais.

Não será usado como:

1. fonte de fatos sobre uma companhia ou transação;
2. substituto do playbook de DCM da Offroad;
3. autorização para enviar dados privados a qualquer MCP;
4. prova de corretude financeira;
5. dependência obrigatória do runtime.

## O que vale aproveitar

| Componente externo | Uso na Offroad | Forma de adoção |
| --- | --- | --- |
| Market Researcher | decomposição de pesquisa, cobertura de fontes e síntese citada | comparar com `C02`, `K04` e o source registry; portar apenas padrões superiores |
| Pitch Agent | passagem de análise e modelo para apresentação | benchmark para `A01` a `A11`, mantendo templates e gates próprios |
| Financial Analysis | auditoria de Excel, spreading e modelos de três demonstrações | benchmark para `C03`, `C07`, `C08` e `A05`; cálculos continuam determinísticos |
| Investment Banking | preparação de materiais e coordenação de workflows | aproveitar ergonomia de trabalho, não a orientação M&A como ontologia do produto |
| Connectors MCP | acesso consentido a provedores institucionais | cada conector passa por avaliação de licença, entitlement, retenção, residência e custo |
| Managed-agent cookbooks | padrões de handoff e decomposição | testar contra o Deal Captain limitado por TaskSpecs; não adotar autonomia irrestrita |

## Anthropic e OpenAI

Anthropic publica uma suíte financeira pronta, com plugins de financial analysis, investment
banking, equity research, private equity e outros, além de integrações MCP com provedores. Isso é
mais avançado como pacote vertical pronto.

OpenAI oferece os componentes para construirmos a nossa suíte: Plugins com skills, MCP servers e
UI; Skills versionáveis pela API; Responses API; web search, file search, function calling e remote
MCP. Não foi identificada uma suíte oficial de DCM pronta e equivalente à coleção financeira da
Anthropic. Para a Offroad, isso não é desvantagem estrutural: a especialização deve morar nos
nossos contratos, procedimentos, dados, decisões corrigidas e evals, e não dentro do fornecedor de
modelo.

## Política de execução

1. Toda skill financeira da Offroad declara TaskSpecs autorizados, inputs, outputs, fórmulas,
   evidência mínima, critérios de abstenção e revisão.
2. O Deal Captain seleciona a skill; a skill não amplia o escopo do projeto.
3. O modelo é selecionado por eval de tarefa, não por preferência global.
4. Todo número material é extraído, calculado ou conciliado fora da prosa do modelo.
5. Um output de outro plugin ou agente é candidato a evidência, nunca verdade canônica.
6. MCPs externos recebem apenas o mínimo necessário e somente quando a política de dados permitir.
7. Skills importadas são congeladas por versão, revisadas e testadas antes de uso.
8. Mudanças de prompt, modelo, skill ou conector rodam em shadow e regressão antes de produção.

## Sequência recomendada

1. Clonar a suíte Anthropic apenas em ambiente de pesquisa e inventariar skills e agentes.
2. Mapear cada capacidade contra os TaskSpecs Offroad e marcar `adotar`, `adaptar`, `benchmark` ou
   `descartar`.
3. Escolher três benchmarks iniciais: market research, Excel/model audit e pitch production.
4. Criar gold cases Brasil e EUA para cada benchmark.
5. Rodar Anthropic e OpenAI sobre o mesmo manifest de contexto e os mesmos critérios.
6. Portar para uma skill Offroad somente o que melhorar qualidade medida.
7. Avaliar conectores premium separadamente; nenhum é desbloqueado só porque aparece no plugin.

## Critério de sucesso

O teste não é se a Offroad “usa um plugin de finanças”. O teste é se ela produz uma análise e um
trabalho de DCM melhores, mais consistentes e mais auditáveis que um uso genérico de Claude ou
ChatGPT, mantendo memória do projeto, evidência, decisões, contexto de mercado e continuidade.

## Fontes oficiais consultadas

- Anthropic, `financial-services`: https://github.com/anthropics/financial-services
- Anthropic, anúncio de plugins financeiros: https://claude.com/blog/cowork-plugins-finance
- OpenAI, plataforma de plugins: https://developers.openai.com/
- OpenAI, Skills API: https://developers.openai.com/api/reference/go/resources/skills
- OpenAI, ferramentas da Responses API: https://platform.openai.com/docs/quickstart/make-your-first-api-request
- OpenAI, controles e retenção de dados: https://developers.openai.com/api/docs/guides/your-data
