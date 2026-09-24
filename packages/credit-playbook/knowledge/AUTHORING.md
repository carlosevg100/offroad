# Autoria de procedimentos da Offroad

Este molde permite escrever a biblioteca profissional em paralelo à construção do arcabouço. O primeiro trabalho é **alternativas de estrutura de capital para uma decisão**; comparar propostas é o segundo. O [esqueleto do primeiro procedimento](procedures/capital/prepare-capital-structure-decision.md) é candidato com composição técnica em elaboração, não publicado e sem execução habilitada.

## Como começar

1. Copie o esqueleto para `knowledge/procedures/<domínio>/<id>.md`; mantenha este guia fora dessa árvore, pois o carregador compila todos os seus arquivos Markdown.
2. Escreva a pergunta de decisão, o produto e a suficiência por entrega antes dos passos. Indique o que se consegue responder com o material já disponível e o que falta para a próxima decisão.
3. Preencha as regras com definição, fundamento, exceção e resultado esperado. Não transforme experiência profissional em limiar numérico sem fundamento e versão.
4. Registre exemplos bons, contraexemplos e resultados de referência. Separe casos a construir de testes efetivamente executados.
5. Revise o conteúdo financeiro com a Offroad. O fundador aprova o conteúdo do primeiro procedimento; o aceite de cada onda é separado. Uma edição de Markdown nunca representa essas aprovações.

## Formato que funciona hoje

O contrato existente é `src/procedure-contract.ts`; `src/procedure-markdown.ts` faz a compilação. Use frontmatter de linhas `chave: valor`, listas simples `[a, b]` e seções `#` com os nomes do esqueleto. Esse parser não é YAML completo: não use objetos aninhados, blocos multilinha ou aspas como delimitadores. Não crie chaves de frontmatter; o schema rejeita chaves desconhecidas. `legal_review_required` aceita `true` e `false`; outras grafias e chaves repetidas são recusadas.

| Campo | Como preencher |
|---|---|
| `id`, `version` | Identificador estável e versão `AAAA.MM.DD-vN`; aumentar a versão ao alterar o conteúdo submetido à revisão |
| `maturity` | `draft` durante escrita aberta; `candidate` para proposta estruturada; nunca aumentar por conta de o arquivo compilar |
| `title_pt`, `title_en` | Mesma finalidade e economia nos dois idiomas |
| `role` | Namespace técnico existente, por exemplo `credit_structuring`; não cargo do usuário nem autorização |
| `blueprint_stage` | Metadado legado inteiro positivo, sem teto universal de 12; não etapa do plano aprovado nem porta obrigatória de intake |
| `owner_role` | Função responsável pela autoria; não confere poder de publicação ou acesso |
| `effective_date` | Data de referência editorial; não comprova vigência operacional |
| `authorities` | Classes efetivamente fundamentadas: `LEI`, `DEF`, `CASA`, `MERCADO`, `HEURÍSTICA` |
| `dependencies` | IDs já existentes na biblioteca; descreva composição futura no corpo quando ainda não estiver contratada |
| `task_specs`, `calculation_ids`, `templates` | Somente vínculos reais e verificados; deixe vazios no esqueleto |
| `max_model_calls`, `model_purpose`, `allowed_tools` | Orçamento técnico aprovado; zero e listas vazias nesta entrega sem executor |

Não declare `implementation_*`, `result_contract`, `persistence_*`, `capability_*`, runs ou aprovação antes de existirem. `approved_by`, `approved_at` e `approval_source` registram aprovação real, juntos; não use nomes, datas ou IDs ilustrativos nesses campos.

As seções obrigatórias e suas listas estão no esqueleto. Cada passo usa `1. [deterministic|model_assisted|human_judgment] Título :: instrução ; instrução`, opcionalmente `| tools: id-real | evidence: entrada`. Cada saída usa `campo (string|number|decimal_string|boolean|date|enum|object|array, required|optional): descrição`; enum admite `| values: valor1, valor2`. Para dinheiro e medidas calculadas, preferir `decimal_string` com unidade, período e definição registrados na estrutura correspondente.

O compilador atual lê objetivo, produto, passos, outputs, evidência, testes, gatilhos, julgamentos, exceções e condições de parada; retorna inputs e perguntas como metadados. Seções editoriais adicionais e a prosa de `Cálculos determinísticos` não viram código executável. Escreva ali a especificação para implementação; o bloco tipado descrito abaixo fixa o contrato dos componentes. Compilar o texto hoje não demonstra essa implementação.

## Molde de conteúdo profissional

| Bloco | Conteúdo exigido do autor |
|---|---|
| Decisão e destinatário | Pergunta concreta, data-base, horizonte, público autorizado, finalidade e decisão que a entrega permite tomar |
| Suficiência | Entradas mínimas por entrega, substitutos aceitos, efeito da ausência, condições para entrega parcial e pergunta que resolve a lacuna |
| Observação e definição | Fonte/versão/âncora, entidade, escopo, moeda, unidade, período, definição e direito de uso; preservar observações conflitantes e adoção justificada |
| Hipóteses | Autor, fonte, racional, faixa, horizonte, sensibilidade e responsável pela adoção; separar guidance, hipótese Offroad e cenário solicitado |
| Narrativa | Decisão por trás do pedido; árvore do estado de conhecimento; suficiência por conclusão; desafio de premissas; voz com fato, leitura e recomendação. Profundidade por conhecimento, nunca por cargo ou turno. Nunca atribuir ao modelo cálculo, permissão ou publicação. |
| Fórmula | Identidade, versão, domínio, operandos, unidades, datas, convenção, arredondamento, resultado, trace e exemplos calculáveis; executor financeiro real será associado pela engenharia |
| Regra | Definições por dialeto e pontes; seleção de métodos; administração, banco e estresse; módulos pelos oito eixos; memória privada e mercado agregado com comparabilidade/confiança; prioridades de negociação. Registrar condição, consequência, autoridade, fonte, exceções e revisão. |
| Workflow | Ordem e dependências, suficiência por passo, retomada, invalidação e efeitos permitidos; a fila atual executa antes da futura continuidade com Temporal |
| Template | Leitura e próximo ato; peças com pergunta, conclusão, apoio e origem; estados de conhecimento; tela com leitura e evidência selecionável; famílias do atlas, regras de gráfico e composição por audiência autorizada. |
| Qualidade | Teste do MD antes de toda entrega, com dez perguntas e retorno ao ponto reprovado; checks automáticos e julgamento profissional separados; casos negativos, estado versus turno/cargo, voz, peças, privacidade e provas reais, sem transferir aprovação de outra versão. |

Para cada regra ou fórmula, registre no corpo: **ID proposto; finalidade; fonte e versão; entradas; resultado esperado; ausência/incompatibilidade; exceções; pontos de ajuste; invariantes; casos de teste**. Nomes propostos não são exports nem ferramentas disponíveis. A Etapa 13 transforma essa especificação em componentes e a publicação posterior fixa as versões no manifesto.


## Biblioteca de expertise comum: aplicação dos quatro blocos

A biblioteca de expertise é a fonte profissional comum a todos os procedimentos. Ela vive no repositório privado `carlosevg100/offroad-expertise`, pasta `biblioteca-expertise-2026-09/`, e o repositório público a referencia apenas por hash em `knowledge/sources/biblioteca-expertise.lock.json` (verificar com `python3 scripts/expertise-lock.py verify` a partir de um clone local). Começar pelo LEIA-ME.md e ler atlas, árvore, registro de definições, métodos, módulos, memória/mercado e ficha narrada nessa ordem. Mudança na biblioteca exige nova versão do lock; um caminho de workspace não substitui essa dependência fixada.

Os blocos [Narrativa, Template, Regra e Qualidade](procedures/capital/prepare-capital-structure-decision.md#narrativa) são a especificação editorial desta revisão. Em cada novo procedimento, declarar a decisão particular, aplicar o tronco geral e selecionar métodos, módulos e peças pertinentes com justificativa; não exigir métricas irrelevantes. O primeiro procedimento usa alternativas de estrutura de capital, mas nenhuma regra comum depende de existir proposta do Itaú ou de uma sequência fixa de turnos; o cadastro da companhia precede o uso e dispara pesquisa, com exceção de perguntas conceituais. Comparar propostas permanece outro procedimento.

A aprovação da expertise não prova implementação. Associar requisitos a componentes e avaliações reais sem mudar cálculos ou governança por edição editorial. As fórmulas, o workflow técnico e os comandos de publicação deste molde permanecem como estavam. O exemplo é gabarito de comportamento; seus valores não são parâmetros de produção. A voz e a composição seguem o atlas v3 quando houver divergência com exemplos anteriores. Registrar conflitos e a resolução aplicada.

## Limites comuns a todos os procedimentos

- O papel no trabalho altera perspectiva e apresentação quando solicitado. Cargo, senioridade ou perfil cadastral não diminuem profundidade, evidência, cálculo ou atenção às lacunas.
- O cadastro precede o uso e dispara pesquisa sobre a companhia. O sistema recupera esse contexto e nunca diz que não conhece a companhia. Sem companhia é exceção conceitual. Sem base, reconhecer o pedido, enquadrar “boa em relação a quê” e pedir o resíduo em lote, cada pedido com motivo. Critérios genéricos não são entrega.
- Fonte recebida para análise não é publicação no cofre. Publicação humana segue a autoridade do produto; a prosa do método não concede acesso.
- O administrador do cliente gere pessoas, perfis e acessos no produto. A autoria não exige recertificação do fundador nem intervenção operacional da Offroad.
- Retenção segue a política aplicada pelo gateway. Na Etapa 16 registrar não treinamento e retenção limitada nas combinações elegíveis de provedor, modelo e recurso. Retenção zero é evolução comercial futura, não pré-condição da autoria.
- Contribuições e revisões preservam o original, autoria e justificativa. Derivados herdam restrições. Recomendar não publica, contrata, contata terceiro nem muda dado oficial.
- Oficina profissional e casos sintéticos preparam a validação técnica. Ensaios com usuários, Office nativo, novos conectores, intercâmbio entre organizações e Temporal ficam fora desta onda.

## O que entregar para revisão do conteúdo

Entregue o Markdown versionado, fontes verificáveis com data e direito de uso, definições/formulações, casos de referência com resultado esperado, conflitos conhecidos e decisões editoriais em aberto. O primeiro procedimento deve comparar alternativas de estrutura com o estado atual e com a opção de adiar/não contratar quando pertinente, sobre a mesma base e o mesmo horizonte. Comparar propostas recebidas será outro procedimento.

Validação de formato: `pnpm --filter @offroad/credit-playbook test`. O teste da biblioteca compila os arquivos e verifica vínculos; não certifica qualidade financeira. Execução e publicação exigem os gates das respectivas etapas, a aprovação real do conteúdo e a evidência técnica. A autoria pode começar imediatamente a partir deste esqueleto.


## Contrato tipado e geração do manifesto (etapa 13)

O bloco `offroad-procedure` em `prepare-capital-structure-decision.md` é o molde operacional
atual. Seu JSON é validado por `procedureCompositionSchema` e `methodComponentSchema`.
A narrativa permanece legível; somente o bloco tipado declara componentes compiláveis.
Não colocar instruções executáveis dentro de texto de fonte, exemplo ou nota editorial.

Cada componente declara ID e versão, entradas e saídas recursivamente tipadas, dependências
por ID/versão, ferramentas, efeito máximo, orçamento, direitos herdados, competências,
invariantes e pontos permitidos de alteração. Competência é propriedade do método;
nenhum campo descreve cargo, senioridade ou privilégio da pessoa.

| Tipo | Conteúdo e requisito |
| --- | --- |
| `narrative` | Texto editorial; sem ferramenta, modelo ou efeito |
| `formula` | Expressão, unidade, período, arredondamento, trace e executor registrado em financial-core; zero chamadas de modelo |
| `rule` | Regra versionada, autoridade e executor registrado |
| `workflow` | Sequência determinística ou grafo de dependências com referências versionadas |
| `template` | Corpo Markdown/JSON; sem execução implícita |
| `quality_gate` | Executor e consequência explícita: bloqueio ou lacuna divulgada |

Objetos especificam os campos e arrays especificam os itens. Valores monetários e índices
financeiros usam `decimal_string`; não há cálculo financeiro em ponto flutuante ou em modelo.
Cada executor precisa de módulo/export, versão, contratos correspondentes e bytes de sua
implementação registrados pela engenharia. Uma função citada em prosa não vira executor.
Evidências referenciadas precisam existir; o compilador fixa seus hashes, não fabrica aprovações.

Os orçamentos são explícitos em chamadas de modelo, duração e custo em unidades menores de
uma moeda declarada. Não há teto universal de três chamadas. A soma conservadora dos
componentes executáveis precisa caber no orçamento do procedimento; a execução ainda aplicará
sua própria política. Workflows não multiplicam o orçamento de suas dependências.

Direito de uso acompanha a fonte e seus derivados. Lei, definição contratual, rastreabilidade,
verificação, barreiras de acesso e matemática determinística são invariantes protegidas.
Alterações permitidas se limitam a narrativa, template e hipóteses tipadas, sempre com racional;
não podem conceder acesso ou remover invariantes. Composição/publicação é etapa 14.

Use `authoringStatus: incomplete` e liste `pendingContent` enquanto faltar conteúdo.
`ready_for_review` exige ausência de pendências e continua sem significar aprovação.
Compilar nunca concede execução. O primeiro procedimento mantém candidato com executor de domínio registrado, sem vínculo de
tarefa autorizada ou aprovação. A composição contratual e as avaliações profissionais integradas
continuam pendentes; motores e exemplos unitários não equivalem a publicação.

Após alterar fontes, executar `pnpm --filter @offroad/credit-playbook manifest:generate`.
A CI recompila e compara os bytes de `method-runtime-manifest.generated.ts`; esse arquivo
não deve ser editado manualmente. O manifesto fixa fontes, compilador, componentes, fechamento
das dependências dos executores e evidências. IDs/hash de roteamento e aprovação de R01 são
preservados. Os onze documentos anteriores usam adaptador explícito, sem inventar componentes
completos, republicar conteúdo ou mudar seu estado de liberação.

Os registries institucionais históricos continuam necessários aos consumidores atuais e não
são cópias equivalentes dos doze documentos Markdown; sua remoção sem equivalência apagaria
conhecimento referenciado. A duplicação manual do manifesto de roteamento foi retirada.

## Descritores de saída e contratos reais da etapa15

A seção Outputs admite nomes reais como workId, tipo null e união explícita object|null.
Required distingue presença do campo: um campo requerido pode ser nulo quando seu contrato
permitir, sem ser confundido com ausência ou zero. Nomes de protótipo são recusados.
Os componentes tipados conservam campos e itens recursivamente; o resumo de Outputs não
substitui os schemas de validação do executor. A compilação confere os contratos registrados.

No primeiro procedimento, engenharia gera os contratos a partir dos schemas efetivos com
`node packages/financial-model/scripts/generate-capital-contracts.mjs`; testes comparam o artefato
aos schemas e negam divergência. O bloco técnico no Markdown deve acompanhar essa versão,
sem alterar seu contrato para acomodar texto. O autor profissional escreve regras, exceções,
suficiência, fundamentos e casos. Registro técnico não é aprovação profissional.

Dicionários por período ou mês usam o tipo estrutural map com values tipado recursivamente.
Não é um objeto livre: cada valor é validado; chaves vazias, excessivas ou de protótipo são
recusadas. O formato específico das chaves e outros refinamentos continuam no schema real
fixado do executor. Campos fixos e dicionários abertos não são misturados na mesma projeção.

## Condições aprovadas em 21 de setembro de 2026

Nenhum vermelho em gráficos; ruptura por linha, rótulo e número. Travessão proibido em qualquer texto entregue. Resíduo em lote com motivo; turno 1 da ficha 1 para cofre vazio é padrão calibrado. Cadastro e pesquisa precedem uso, com exceção conceitual sem companhia. IOF, ANBIMA/B3 e regime tributário são dados versionados com fonte, data e dono no registry existente, sob revisão especializada; sem valores aprovados, vigentes e aplicáveis não há cálculo all-in.
