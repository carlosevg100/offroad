# Plano de implementação do sistema de trabalho agêntico de DCM

## Resultado de produto

A Offroad deve se comportar como um ambiente de trabalho especializado, não como um formulário e
não como um gerador de relatório. O usuário descreve um objetivo ou envia uma pasta. O sistema
entende o contexto existente quando houver, cria um plano visível, executa pesquisa e análise em
paralelo, pede somente o que falta, registra decisões e entrega análises e materiais no mesmo
projeto.

Dois testes definem o produto.

### Caso público

Pedido: "Tenho uma reunião amanhã com uma companhia listada e quero preparar alternativas
estratégicas de endividamento."

O sistema deve:

1. resolver a companhia e recuperar memória interna permitida;
2. se houver histórico relevante, mencioná-lo antes de perguntar;
3. iniciar pesquisa pública da companhia, setor, dívida e mercado em paralelo;
4. perguntar em uma mensagem curta audiência, objetivo da reunião e relacionamento existente;
5. reconstruir negócio, resultados, caixa, dívida, vencimentos, custos, garantias, covenants,
   exposições, plano e eventos estratégicos com fontes e datas;
6. desenvolver e testar alternativas, sem presumir necessidade de captação;
7. conversar sobre a tese; e
8. produzir pitch ou material apenas depois de confirmar direção e audiência.

### Caso privado

Pedido: "Estou assessorando uma companhia e quero financiar uma expansão usando recebíveis", com
arquivos anexados e campos vazios.

O sistema deve:

1. aceitar a pasta como primeira resposta;
2. classificar e extrair os arquivos sem exigir redigitação;
3. pesquisar a companhia em paralelo quando a identidade estiver resolvida e a política permitir;
4. cruzar conteúdo recebido com o mínimo necessário para as decisões aplicáveis;
5. apresentar o entendimento corrigível da companhia, objetivo e operação pretendida;
6. pedir em lotes de até três somente lacunas materiais;
7. analisar qualidade financeira, dívida, capacidade, garantias e alternativas;
8. registrar o que está comprovado, conflitante, assumido ou ainda indisponível;
9. recomendar uma estrutura ou abster-se; e
10. seguir para materiais e mercado apenas após aprovação explícita.

## Arquitetura alvo

```text
Conversa e arquivos
        |
        v
Context builder  -> memória do projeto + memória da companhia + conhecimento + mercado
        |
        v
Deal Captain -> plano revisável -> executores especializados em paralelo
        |                         | pesquisa pública
        |                         | documentos e reconciliação
        |                         | empresa e setor
        |                         | finanças, dívida e capacidade
        |                         | estruturas e mercado
        |                         | materiais
        v
Coverage map -> perguntas de alto valor -> respostas/documentos -> replanejamento
        |
        v
Decision ledger -> verificador independente -> chat + artefatos
        |
        v
Gates de aprovação -> materiais externos -> matching -> introdução autorizada
```

O control plane determina o que pode acontecer. O Deal Captain determina, dentro desse limite, qual
trabalho precisa acontecer agora.

## Objetos canônicos

| Objeto | Função | Regra |
| --- | --- | --- |
| Organization | fronteira de tenant | nenhuma recuperação cruza organização |
| Company | memória durável da companhia | fatos públicos compartilháveis separados de fatos privados |
| Project | objetivo e contexto de um trabalho | uma conversa principal, múltiplos artefatos |
| Evidence | fonte verificável | número material exige âncora ou cálculo determinístico |
| Requirement coverage | suficiência por decisão | `missing`, `partial`, `verified`, `conflicting`, `unavailable` |
| Decision | recomendação institucional corrigível | alternativas, evidência, premissas e incertezas |
| Agent plan | revisão do plano corrente | append-only e ligada ao plano base compilado |
| Work item | unidade executável | especialista, dependências, orçamento, efeito e output |
| Artifact | produto de trabalho | ligado às versões exatas de fatos e decisões |
| Market observation | evidência de mercado | fonte, data, jurisdição, instrumento e recência |

## Frentes de implementação

### F0. Integridade e baseline

Estado: baseline local e ledger de produção reconciliados em 164 versões; o branch remoto antigo
de staging continua isolado e não será promovido por merge.

- corrigir abstenção semântica no gateway;
- executar todos os testes SQL no CI;
- remover seleção arbitrária de organização;
- reconciliar migrations locais, development e staging;
- bloquear deploy de app antes de migration compatível;
- remover fixture de runtime e separar demo de produto;
- acrescentar SAST, dependências, SBOM e scan do worker;
- provar backup e restore.

Saída: um baseline reproduzível e seguro para evoluir.

Diagnóstico atualizado: as cinco versões históricas ausentes foram restauradas e todos os nomes
divergentes foram reconciliados contra o ledger canônico de produção até `20260902175803`. O
branch antigo de staging preserva divergência histórica anterior e, por isso, serve apenas como
banco descartável de validação. A promoção final aplica migrations validadas diretamente sobre o
ledger canônico de produção, sem incorporar o histórico divergente do branch.

### F1. Contratos e memória do trabalho

Estado: implementada, validada e promovida ao banco de produção.

- schemas para plano agêntico, work item, coverage, pergunta e decisão;
- plano e decisões versionados por fingerprint;
- timeline bilíngue derivada de eventos reais;
- aprovação obrigatória para qualquer efeito externo;
- preservação explícita de `null` como abstenção;
- separação entre public cache, company memory e private project memory.
- projeção integral do plano compilado em work items especializados, com rejeição no banco de
  tarefa inventada, dependência externa ao plano ou tentativa cross-project;
- bootstrap do Deal Captain no worker antes da execução dos DAGs públicos e das análises privadas
  preliminar e completa.
- projeção capability-bound da análise em cobertura, perguntas e decisões, com replay idempotente,
  atribuição do responsável pelo projeto e recusa de mais de três perguntas por rodada.

Saída: o sistema sabe o que está fazendo, por que está fazendo e o que falta.

### F2. Deal Captain e replanejamento

Estado: plano tipado, timeline real e projeção analítica implementados; replanejamento por evento e
verificador independente completo continuam como evolução controlada.

- context builder determinístico;
- planner com saída tipada e allowlist de TaskSpecs;
- seleção de trabalhos executáveis por dependência, cobertura e aprovação;
- paralelismo para pesquisa, documentos e contexto;
- replanejamento por evento, preservando trabalho concluído ainda válido;
- limite por plano, tarefa, ferramenta, tempo e custo;
- verifier separado do executor que produziu a recomendação;
- política de falha parcial: um provedor falhar não destrói o projeto.

Saída: plano vivo no mesmo projeto, sem autonomia irrestrita.

### F3. Vertical privada ponta a ponta

Estado: ingestão, análise, cobertura automática e perguntas priorizadas conectadas; falta comprovar
o caso humano completo após a promoção do runtime.

- ligar `structure_from_documents` e `review_existing_operation` à conversa canônica;
- iniciar ingestão ao anexar, sem exigir preenchimento redundante;
- reaproveitar classificação, extração, anchors, reconciliação e financial-core existentes;
- compilar requirement set a partir dos arquétipos aplicáveis;
- atualizar coverage por documento e resposta;
- emitir entendimento preliminar corrigível;
- perguntar no máximo três lacunas materiais;
- gerar diagnóstico e recomendação antes de liberar materiais;
- exibir atividades no chat e abrir artefatos no painel lateral.

Saída: primeiro caso privado real, de upload até recomendação, sem intervenção fora do sistema.

### F4. Qualidade financeira e especialização extrema

Estado: a construir por vertical.

- promover procedimentos de `draft` para `candidate` e `production` por evidência;
- ampliar spreading, debt schedule, liquidez, capital de giro, covenants, garantias, cenários,
  sources and uses, custo total e capacidade;
- procedimentos Brasil e EUA com jurisdição, taxonomia e disclosure próprios;
- análise por setor e tipo de necessidade, não por um único instrumento;
- registrar correções de especialistas como decisão e caso de regressão;
- benchmark cego contra trabalho de bankers experientes.

Saída: qualidade medida por decisão, não por eloquência do texto.

### F5. Research e conhecimento contínuo

Estado: conectores base existem; cobertura institucional ainda incompleta.

- fontes oficiais primeiro: CVM, B3, SEC, EDGAR, sites de RI e documentos de emissão;
- Firecrawl para aquisição e normalização de páginas difíceis;
- Perplexity para descoberta e pesquisa ampla com links, nunca como fonte canônica isolada;
- chamadas, áudio e vídeo convertidos em fontes com timestamp e provenance;
- cadastro de fontes por jurisdição, autoridade, tipo, latência e licença;
- ingestão diária de emissões, preços, termos e eventos materiais;
- deduplicação pública por companhia e documento, sem reutilizar contexto privado;
- TTL e refresh definidos por tipo de dado;
- knowledge evals para atualidade, cobertura e conflito.

Saída: pesquisa rápida, reproduzível e atualizada, sem confundir busca com verdade.

### F6. Modelos e roteamento

Estado: gateway existe; política de tarefa será ampliada.

- modelos pequenos para classificação, idioma e normalização de baixa ambiguidade;
- modelos de raciocínio para planejamento, análise de documentos complexos e estruturação;
- contexto longo para pacotes extensos, sempre com retrieval e manifest, não despejo indiscriminado;
- modelos especializados ou OCR para tabelas, imagens e documentos digitalizados;
- provider fallback apenas quando a política de dados permitir;
- shadow evaluation antes de trocar modelo em produção;
- output tipado, evidence coverage, abstention e custo como gates;
- DPA, retenção zero ou equivalente antes de enviar conteúdo privado.

Saída: melhor modelo por trabalho, sem dependência estrutural de um único fornecedor.

### F7. Interface de trabalho

Estado: shell conversacional existe; convergência incompleta.

- projeto e histórico na esquerda, sem formulários expandidos dentro do menu;
- chat como superfície principal;
- composer com upload e comandos rápidos;
- timeline compacta de atividade real, com nomes compreensíveis ao cliente;
- plano, fontes, análises e arquivos no painel direito;
- artefato abre automaticamente quando fica pronto, sem expulsar o usuário da conversa;
- feedback, correção e aprovação dentro do chat;
- estados de loading, retry, falha parcial e espera por usuário;
- mobile com chat prioritário e painéis em drawers;
- identidade econômica idêntica em pt-BR e en-US.

Saída: comportamento familiar a Codex/Replit, com conteúdo e controles de DCM.

### F8. Market graph e introdução

Estado: infraestrutura existe; dados reais e operação faltam.

- começar com mandatos reais cadastrados e revisados manualmente;
- registrar instrumentos, setores, tickets, moedas, garantias, prazo, retorno, jurisdição,
  restrições, contatos, data e fonte;
- distinguir mandato declarado, comportamento observado e inferência;
- score explicável com filtros duros antes de ranking;
- registrar feedback e outcome para calibrar aderência;
- nunca reutilizar informação confidencial de outro cliente;
- contato apenas com material, destinatário e autorização exatos.

Saída: shortlist defensável e introdução qualificada, não diretório genérico.

### F9. Materiais e execução assistida

Estado: compilers e gates existem; qualidade externa não comprovada.

- teaser, lender memo, modelo financeiro, term sheet e Q&A ligados ao decision ledger;
- consistência determinística de números entre peças;
- templates institucionais por audiência e jurisdição;
- render e inspeção visual automáticos;
- revisão humana registrada quando exigida;
- versionamento e invalidação por mudança material;
- acompanhar dúvidas e andamento depois da introdução sem alegar fechamento.

Saída: pacote editável e apresentável que continua vivo no projeto.

## Provedores por estágio

| Necessidade | Primário | Uso | Não usar como |
| --- | --- | --- | --- |
| Descoberta web | Perplexity | localizar fontes, notícias, comparáveis e perguntas de pesquisa | evidência única para número material |
| Aquisição web | Firecrawl | extrair sites, RI e páginas difíceis com metadata | substituto de fonte oficial |
| Brasil público | CVM, B3, RI, Bacen, Tesouro, ANBIMA pública | fatos regulatórios, demonstrações, emissões, curvas e contexto | base suficiente para mandato privado de financiador |
| EUA público | SEC/EDGAR, FINRA, Treasury/FRED, RI | filings, emissões, curva e macro | substituto de notas e contratos específicos |
| Dados premium | avaliar PitchBook, FactSet, LSEG, S&P, Moody's, Daloopa e similares | acelerar cobertura, comps, ownership, estimates e transações | autoridade superior ao filing original |
| Modelos | OpenAI e Anthropic via gateway | planejamento, síntese, julgamento e verificação por tarefa | calculadora financeira ou policy engine |
| Arquivos | parsers isolados, OCR, LibreOffice, ClamAV | extração e segurança | confirmação automática de veracidade |

ANBIMA gratuita entra quando a API efetivamente cobre uma necessidade do source registry com licença,
campos, histórico e SLA adequados. O Feed pago não é pré-requisito para a vertical privada inicial.

## Métricas de pronto

| Dimensão | Métrica de liberação |
| --- | --- |
| Entendimento | pelo menos 90% das revisões gold classificam companhia, objetivo e restrições corretamente |
| Evidência | 100% dos números materiais têm âncora ou cálculo determinístico |
| Abstenção | zero recomendação forçada quando o gabarito exige `not_ready` |
| Perguntas | no máximo três por rodada e nenhuma já respondida por documento ou memória permitida |
| Pesquisa | fonte oficial priorizada, conflito explícito e data de corte visível |
| Finanças | identidades e fórmulas passam 100%; diferenças de período e unidade nunca são conciliadas silenciosamente |
| Estrutura | alternativa recomendada inclui racional, requisitos, riscos, sensitivities e motivos para rejeitar as demais |
| Material | números consistentes entre memo, modelo, term sheet e apresentação |
| Mercado | todos os matches passam filtros duros e explicam fonte e recência do mandato |
| Segurança | zero acesso cross-tenant; nenhum dado privado enviado fora da allowlist contratual |
| Operação | custo e latência medidos por projeto; falha parcial é recuperável sem reiniciar o caso |
| Usabilidade | usuário acompanha trabalho no chat, corrige e aprova sem mudar para um wizard |

### Vertical pública

- cinco companhias brasileiras e cinco americanas;
- zero afirmações materiais sem evidência persistida;
- abstenção correta em casos com dados insuficientes;
- revisão cega de banker;
- custo, latência e recência medidos.

### Vertical privada

- upload sem campos preenchidos inicia processamento;
- 100% dos números materiais rastreáveis a âncora ou cálculo;
- nenhuma pergunta redundante com os documentos;
- máximo de três perguntas ativas;
- recomendação ou abstenção coerente com coverage;
- nenhum dado cru do arquivo em logs ou telemetry;
- tenant isolation provado em SQL e E2E.

### Materiais

- arquivos abrem e permanecem editáveis;
- números reconciliam entre todas as peças;
- render visual aprovado;
- alteração material invalida versões dependentes.

### Mercado

- mandatos com fonte, data, responsável e política de refresh;
- filtros duros explicam exclusões;
- ranking explica aderência e incerteza;
- nenhuma introdução sem autorização exata.

## Ordem de ataque

1. congelar novas features downstream até reconciliar migrations;
2. concluir F0;
3. aplicar F1 e ligar F2 ao worker;
4. concluir F3 com um caso privado real;
5. promover uma vertical financeira em F4;
6. validar F5 e F6 com custos e fontes reais;
7. consolidar a interface F7;
8. iniciar lender graph real F8 em paralelo, pequeno e manual;
9. liberar F9 e introduções somente após os gates anteriores.

Essa sequência produz o núcleo defensável primeiro: contexto, procedimentos, decisões corrigidas,
evidência e execução específica de DCM. O market graph acrescenta o segundo efeito cumulativo quando
já há estruturas de qualidade para conectar.
