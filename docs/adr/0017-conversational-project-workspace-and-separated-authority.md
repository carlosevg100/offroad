# ADR 0017: Workspace conversacional por projeto e autoridade separada da preparação

Status: accepted, fundador em 01/09/2026

Data: 2026-09-01

## Contexto

A entrada autenticada ainda apresentava capacidades como páginas e formulários distintos. Isso
fragmentava uma única relação de trabalho: uma pergunta sobre uma companhia podia virar análise,
estrutura, teaser, modelo, term sheet e introdução, mas o usuário era obrigado a reiniciar o
contexto em rotas diferentes.

O fluxo também misturava dois direitos diferentes. Aceitar que a Offroad use documentos num
ambiente privado para preparar o trabalho não prova que o usuário representa a companhia perante
terceiros. Exigir representação no início engessava análises legítimas; presumir representação
durante a preparação criava risco jurídico e reputacional.

## Decisão

1. A superfície canônica é um workspace persistente por projeto, inspirado em ambientes de
   trabalho conversacionais: projetos e histórico à esquerda, conversa e composer no centro e
   plano, evidências, tarefas e artefatos no painel de trabalho.
2. As cinco entradas que podem abrir trabalho novo aparecem como sugestões do composer, nunca como
   funis ou formulários. `prepare_materials_and_process` continua dentro de um projeto existente.
3. Texto, URL e documentos podem entrar na mesma mensagem. O projeto é criado e aparece
   imediatamente; pesquisa, extração e análise rodam depois, em tarefas estreitas e observáveis.
4. `capital_projects` é a raiz. `document_intake_sessions` continua sendo o escopo de documentos e
   evidências; `agent_conversations` e `agent_messages` continuam sendo o transcript. Não nasce uma
   segunda memória para a interface conversacional.
5. Cada projeto preserva conversa, plano compilado, anexos, tarefas, artefatos, decisões e versões.
   Uma conversa pode mudar de objetivo ou avançar de fase sem criar outro case.
6. O modelo não controla o workflow. O composer seleciona ou infere um job inicial; o runtime
   executa o subgrafo tipado, incremental e orçado correspondente.
7. O termo de confidencialidade é aceito uma vez por organização e versão material. Novo aceite só
   é exigido quando o documento jurídico ativo mudar materialmente.
8. Trabalho privado exige direito legítimo de usar as informações sob o termo aceito. Isso não
   cria nem altera `representation_status`.
9. Autoridade de representação e distribuição só é coletada em `Introduce`, vinculada ao projeto,
   à versão dos materiais, à política de identificação e aos destinatários exatos.
10. Um clique nunca espera pesquisa ou LLM para navegar. Criação, persistência e feedback visual são
    imediatos; trabalho pesado começa em segundo plano e publica progresso real.

## Consequências

- `/app` deixa de ser dashboard/launcher para originadores e companhias e passa a ser o início
  conversacional;
- rotas antigas podem permanecer somente como compatibilidade temporária, sem links na superfície
  canônica;
- a barra lateral consulta projetos reais e sempre reabre a memória correspondente;
- anexar documentos promove um projeto público para preparação privada sem declarar representação;
- nenhuma mensagem pode fingir análise concluída: execução é mostrada por estado e TaskRuns reais;
- os motores de companhia, originação, documentos, estrutura e materiais tornam-se ferramentas
  internas do mesmo workspace; e
- a autorização de introdução permanece fail-closed e independente da criação, upload, análise ou
  preparação.

