# Autoria de procedimentos da Offroad

Este molde permite escrever a biblioteca profissional em paralelo à construção do arcabouço. O primeiro trabalho é **alternativas de estrutura de capital para uma decisão**; comparar propostas é o segundo. O [esqueleto do primeiro procedimento](procedures/capital/prepare-capital-structure-decision.md) é candidato, não publicado e sem execução habilitada.

## Como começar

1. Copie o esqueleto para `knowledge/procedures/<domínio>/<id>.md`; mantenha este guia fora dessa árvore, pois o carregador compila todos os seus arquivos Markdown.
2. Escreva a pergunta de decisão, o produto e a suficiência por entrega antes dos passos. Indique o que se consegue responder com o material já disponível e o que falta para a próxima decisão.
3. Preencha as regras com definição, fundamento, exceção e resultado esperado. Não transforme experiência profissional em limiar numérico sem fundamento e versão.
4. Registre exemplos bons, contraexemplos e resultados de referência. Separe casos a construir de testes efetivamente executados.
5. Revise o conteúdo financeiro com a Offroad. O fundador aprova o conteúdo do primeiro procedimento; o aceite de cada onda é separado. Uma edição de Markdown nunca representa essas aprovações.

## Formato que funciona hoje

O contrato existente é `src/procedure-contract.ts`; `src/procedure-markdown.ts` faz a compilação. Use frontmatter de linhas `chave: valor`, listas simples `[a, b]` e seções `#` com os nomes do esqueleto. Esse parser não é YAML completo: não use objetos aninhados, blocos multilinha ou aspas como delimitadores. Não crie chaves de frontmatter; o schema rejeita chaves desconhecidas. Omita `legal_review_required` quando não for aplicável: a coerção booleana atual não interpreta o texto `false` como falso.

| Campo | Como preencher |
|---|---|
| `id`, `version` | Identificador estável e versão `AAAA.MM.DD-vN`; aumentar a versão ao alterar o conteúdo submetido à revisão |
| `maturity` | `draft` durante escrita aberta; `candidate` para proposta estruturada; nunca aumentar por conta de o arquivo compilar |
| `title_pt`, `title_en` | Mesma finalidade e economia nos dois idiomas |
| `role` | Namespace técnico existente, por exemplo `credit_structuring`; não cargo do usuário nem autorização |
| `blueprint_stage` | Metadado legado de 1 a 12 exigido pelo parser; não etapa do plano aprovado nem porta obrigatória de intake |
| `owner_role` | Função responsável pela autoria; não confere poder de publicação ou acesso |
| `effective_date` | Data de referência editorial; não comprova vigência operacional |
| `authorities` | Classes efetivamente fundamentadas: `LEI`, `DEF`, `CASA`, `MERCADO`, `HEURÍSTICA` |
| `dependencies` | IDs já existentes na biblioteca; descreva composição futura no corpo quando ainda não estiver contratada |
| `task_specs`, `calculation_ids`, `templates` | Somente vínculos reais e verificados; deixe vazios no esqueleto |
| `max_model_calls`, `model_purpose`, `allowed_tools` | Orçamento técnico aprovado; zero e listas vazias nesta entrega sem executor |

Não declare `implementation_*`, `result_contract`, `persistence_*`, `capability_*`, runs ou aprovação antes de existirem. `approved_by`, `approved_at` e `approval_source` registram aprovação real, juntos; não use nomes, datas ou IDs ilustrativos nesses campos.

As seções obrigatórias e suas listas estão no esqueleto. Cada passo usa `1. [deterministic|model_assisted|human_judgment] Título :: instrução ; instrução`, opcionalmente `| tools: id-real | evidence: entrada`. Cada saída usa `campo (string|number|decimal_string|boolean|date|enum|object|array, required|optional): descrição`; enum admite `| values: valor1, valor2`. Para dinheiro e medidas calculadas, preferir `decimal_string` com unidade, período e definição registrados na estrutura correspondente.

O compilador atual lê objetivo, produto, passos, outputs, evidência, testes, gatilhos, julgamentos, exceções e condições de parada; retorna inputs e perguntas como metadados. Seções editoriais adicionais e a prosa de `Cálculos determinísticos` não viram código executável. Escreva ali a especificação para implementação; a Etapa 13 dará contratos tipados aos componentes. Compilar o texto hoje não demonstra essa implementação.

## Molde de conteúdo profissional

| Bloco | Conteúdo exigido do autor |
|---|---|
| Decisão e destinatário | Pergunta concreta, data-base, horizonte, público autorizado, finalidade e decisão que a entrega permite tomar |
| Suficiência | Entradas mínimas por entrega, substitutos aceitos, efeito da ausência, condições para entrega parcial e pergunta que resolve a lacuna |
| Observação e definição | Fonte/versão/âncora, entidade, escopo, moeda, unidade, período, definição e direito de uso; preservar observações conflitantes e adoção justificada |
| Hipóteses | Autor, fonte, racional, faixa, horizonte, sensibilidade e responsável pela adoção; separar guidance, hipótese Offroad e cenário solicitado |
| Narrativa | O que interpretar e explicar com evidência; nunca atribuir ao modelo cálculo, permissão ou publicação |
| Fórmula | Identidade, versão, domínio, operandos, unidades, datas, convenção, arredondamento, resultado, trace e exemplos calculáveis; executor financeiro real será associado pela engenharia |
| Regra | Condição, consequência, autoridade, fonte datada, exceções e revisão; distinguir definição contratual, política da casa e hipótese analítica |
| Workflow | Ordem e dependências, suficiência por passo, retomada, invalidação e efeitos permitidos; a fila atual executa antes da futura continuidade com Temporal |
| Template | Estrutura semântica da entrega, campos, evidências, ressalvas pertinentes e revisão; aparência não substitui conteúdo |
| Qualidade | Invariantes, tolerâncias fundamentadas, testes negativos, critérios de aceitação e exemplos em que a conclusão deve mudar |

Para cada regra ou fórmula, registre no corpo: **ID proposto; finalidade; fonte e versão; entradas; resultado esperado; ausência/incompatibilidade; exceções; pontos de ajuste; invariantes; casos de teste**. Nomes propostos não são exports nem ferramentas disponíveis. A Etapa 13 transforma essa especificação em componentes e a publicação posterior fixa as versões no manifesto.

## Limites comuns a todos os procedimentos

- O papel no trabalho altera perspectiva e apresentação quando solicitado. Cargo, senioridade ou perfil cadastral não diminuem profundidade, evidência, cálculo ou atenção às lacunas.
- A pergunta pode existir antes da companhia identificada. Não exigir intake para aconselhar; vincular entidade e dossiê quando houver evidência suficiente para análise específica.
- Fonte recebida para análise não é publicação no cofre. Publicação humana segue a autoridade do produto; a prosa do método não concede acesso.
- O administrador do cliente gere pessoas, perfis e acessos no produto. A autoria não exige recertificação do fundador nem intervenção operacional da Offroad.
- Retenção segue a política aplicada pelo gateway. Na Etapa 16 registrar não treinamento e retenção limitada nas combinações elegíveis de provedor, modelo e recurso. Retenção zero é evolução comercial futura, não pré-condição da autoria.
- Contribuições e revisões preservam o original, autoria e justificativa. Derivados herdam restrições. Recomendar não publica, contrata, contata terceiro nem muda dado oficial.
- Oficina profissional e casos sintéticos preparam a validação técnica. Ensaios com usuários, Office nativo, novos conectores, intercâmbio entre organizações e Temporal ficam fora desta onda.

## O que entregar para revisão do conteúdo

Entregue o Markdown versionado, fontes verificáveis com data e direito de uso, definições/formulações, casos de referência com resultado esperado, conflitos conhecidos e decisões editoriais em aberto. O primeiro procedimento deve comparar alternativas de estrutura com o estado atual e com a opção de adiar/não contratar quando pertinente, sobre a mesma base e o mesmo horizonte. Comparar propostas recebidas será outro procedimento.

Validação de formato: `pnpm --filter @offroad/credit-playbook test`. O teste da biblioteca compila os arquivos e verifica vínculos; não certifica qualidade financeira. Execução e publicação exigem os gates das respectivas etapas, a aprovação real do conteúdo e a evidência técnica. A autoria pode começar imediatamente a partir deste esqueleto.
