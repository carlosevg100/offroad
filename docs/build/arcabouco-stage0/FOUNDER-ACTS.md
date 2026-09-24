# Atos do fundador e pontos de bloqueio

Primeira onda autorizada: 0, 1A, 1B e 1C. Aprovação do roteiro não autoriza ondas seguintes. Este registro incorpora as instruções de 14/09/2026; não declara entrega técnica concluída.

| Ato exclusivo do fundador | O que receberá para decidir | Quando bloqueia | O que continua independentemente |
| --- | --- | --- | --- |
| Aprovar conteúdo do primeiro procedimento | Procedimento, definições, fórmulas/regras, casos, resultados, revisão e limites de cobertura | Publicação e conclusão da Etapa 15; ativação do procedimento na 17 | Autoria, compilador, implementação determinística e testes do candidato |
| Dar OK por onda | Relatórios de completion e evidências de produção de cada etapa da onda | Início de qualquer etapa da onda seguinte | Correções e verificações necessárias para concluir a onda autorizada, observada a regra de parada |

## Correção expressa do fundador nesta retomada

- **1B:** backfill automático. Quem criou o projeto mantém acesso mediante concessão revogável; o administrador ativo da organização passa a administrar os projetos dela. Não reativar identidades já revogadas nem manter privilégio residual por `created_by`. Depois do backfill, o administrador de cada cliente cadastra pessoas, perfis e acessos no produto, sem intervenção da Offroad. Recertificação pelo fundador não é requisito.
- **16:** documentar e verificar as condições atuais de cada provedor, conta, modelo e recurso: não treinamento com o dado e retenção limitada, com os prazos e exceções efetivamente comprovados. Retenção zero é evolução comercial futura; sua ausência não bloqueia a construção. A matriz continua negando combinações incompatíveis ou desconhecidas e revalidando fallback. Esta decisão não atesta condições contratuais ainda não verificadas.
- Publicadores do cofre são designados pela administração autorizada de cada organização, no produto. Regras de retenção são implementadas e documentadas no roteiro; não constituem uma aprovação separada obrigatória do fundador. Publicação continua humana e descarte continua sujeito à política versionada e verificada.
- A regra de parada para bloqueios permanece. Esclarecer um conflito concreto de execução não cria um terceiro ato recorrente do fundador.

## Ajustes incorporados ao roteiro

- Marco visível após a Etapa 1: percurso corrigido, sem pergunta/cargo modulando qualidade, e demonstração dos acessos permitidos/negados com as correções implantadas.
- Marco após a Etapa 12: contribuição utilizada no trabalho, candidata ao cofre e publicação humana da versão escolhida, preservando a distinção entre rascunho e oficial.
- Marco após a Etapa 17: primeiro procedimento publicado executa sob manifesto fixado e entrega resultado persistido e revisável.
- `packages/credit-playbook/knowledge/AUTHORING.md` e `packages/credit-playbook/knowledge/procedures/capital/prepare-capital-structure-decision.md` pertencem à Etapa 0 desta primeira onda. Estão preparados no commit `935c50be845642ef40cf84ef394cf609ed09181d`, publicado em main pela PR 614 (`8ae3772c`), com `pnpm check` completo e testes de compilação e bloqueio de promoção aprovados; verificação dos deploys de produção ainda pendente. Não representam publicação do procedimento.
- Modelos, comandos e testes de 2, 3 e 22 permanecem. Suas telas administrativas ficam para quando houver tenant que as exija; isso não retira o seletor de contexto necessário para evitar operação no tenant errado.
- Etapas 15 e 17 registram tempo até a primeira resposta útil: início no recebimento do pedido, fim no primeiro conteúdo que avança a decisão e não apenas confirma recebimento. Registrar separadamente tempo até resultado verificado/final, cenário e condições de execução; não colocar conteúdo financeiro ou PII na telemetria.
- Toda etapa termina com PR mesclada, migrações conciliadas/aplicadas, CI e deploys de web/worker no commit entregue, além da verificação em produção. Critério pendente mantém a etapa não pronta.

## Autoridade permanente de execução, 21/09/2026

Decisões técnicas e de governança dentro do roteiro e da onda aprovados pertencem ao executor, com revisão independente de um segundo agente: contenções, suspensões, adaptações, correções, testes, migrações e deploys. Essas decisões já estão autorizadas e não exigem confirmação adicional do fundador. Revisões automáticas devem considerar esta autorização; não se cria um terceiro ato recorrente do fundador. Isto não dispensa gates técnicos, revisão independente, evidência ou controles da plataforma de execução.

Acionar o fundador somente para conteúdo profissional de procedimento novo, OK por onda, gasto ou contrato novo, efeito externo (envio a terceiro ou publicação pública), afrouxamento da política de dados de cliente e liberação de execução para cliente real. Publicar código e implantar os incrementos aprovados fazem parte da execução técnica já autorizada; não equivalem à distribuição externa de material de cliente.

Aplicação expressa nesta data: suspender os nove scripts históricos de avaliação com acesso direto a provedores, testar que nenhum construtor real desses scripts é alcançado sem a barreira e concluir a etapa 16. A religação pelo transporte governado pertence à etapa 17, com autoridade, elegibilidade e revogação revalidadas a cada tentativa. Esclarecer um conflito concreto de execução não cria um terceiro ato recorrente do fundador. Bloqueios técnicos são reportados com provas e opções; escolhas técnicas já autorizadas são resolvidas pelo executor e seu revisor independente.

## Instrução do fundador, 23/09/2026

Registro verbatim da mensagem do fundador ao executor, depois da auditoria independente da etapa 17: "então agora vc assume no lugar do codex... faz as correcoes necessarias .. finaliza a etapa 17 como deve ser .. e fica pronto para a 18 .." A instrução cobre a conclusão da etapa 17 (correções da auditoria, incrementos 3M, 4, 5 e 6) e a preparação da 18; não libera execução para cliente real nem cria um terceiro ato recorrente. Aprovações atribuídas ao fundador dentro dos incrementos técnicos (autorização da 17 após a 16, aplicação da 2B, antecipação da proveniência em 3B) são decisões do executor sob a autoridade permanente de 21/09/2026, e os documentos correspondentes passam a dizer isso.

## Instruções do fundador, 24/09/2026

Registro verbatim das mensagens do fundador ao executor depois do fechamento da etapa 17.

Primeira: "eu nao vou testar nada ate todas as etapas estarem perfeitamente incorporadas. .. ainda falta oq ? a etapa 18 ?? o q mais ??"

Segunda, sobre os valores de convenção (IOF, ANBIMA/B3, regime tributário): "vc eh expert e tem todo knowledge disponivel .. faca de acordo com o melhor e depois eu reviso oq vc implementou .."

Terceira:

> tira esse negocio de atetatcoes do sistema.. ja foi feito .. e pronto .. nao precisa fazer too mes .. depois vemos isso
>
> Alarmes .. claor q conta signed tem permissao .. eu estou logado nela.. take over my web borwser via python e faca oq tem q fazer ..  imagino q esses alarmos disparam os agentes sentinelas que olham e corrigem isso .. .certo ..
>
> cada vez q um usuario fizer uma solicitacao vai gastar 60 usd ?????? nao to entendeo ..  isso eh inviavel certo ?? tem algo errado ai ..
>
> preparado, aguardando sua revisão .. nao soh esse tema de iof, anbima etc ... isso vale para tudo .. vc vai escrever da forma completa e mais tecnica e profissional e assertiva possivel .. em linha com oq fizemos no case 1 la..

Leitura do executor:

- Parâmetros de referência: o executor prepara os 75 parâmetros do cadastro, com texto profissional completo no padrão do caso 1, fonte e data; entram como rascunho e só passam a valer no cálculo depois da revisão e aprovação do fundador, que continua sendo o ato de aprovação do conteúdo profissional.
- Atestações de provedor: a conferência de 21/09/2026 deixa de vencer por prazo. A verificação por provedor, conta, modelo e recurso continua exigida para qualquer combinação nova.
- Alarmes: instalação pela sessão do fundador na AWS, sem alteração de permissões de segurança pelo executor.
- Custo: o teste de referência cola o data room inteiro em cada pergunta; corrigir o tamanho do teste, a reserva por chamada e a tabela de preços.
- Etapa 18: não iniciada; aguarda o OK expresso do fundador.

## OK da etapa 18, 24/09/2026

Registro verbatim da mensagem do fundador ao executor, com a captura de tela da inscrição do alarme ainda pendente: "finish this .. and 17 and start 18 .."

Leitura do executor:

- É o OK expresso da onda da etapa 18, pelo roteiro aprovado. As decisões técnicas da etapa seguem a autoridade permanente de execução de 21/09/2026; aprovar conteúdo profissional e liberar execução para cliente real continuam atos do fundador e não decorrem deste OK.
- "finish this": a inscrição de e-mail do fundador no tópico dos alarmes estava pendente. O executor confirmou a inscrição pela sessão do fundador (link de confirmação da AWS lido na caixa do fundador, verificado contra o tópico da Offroad e usado pela API da conta) e disparou um alarme de teste; a AWS registrou a notificação enviada e o e-mail chegou à caixa do fundador. Nenhuma permissão de segurança foi alterada.
- "and 17": concluir os trabalhos abertos depois do fechamento da etapa 17 (correção do motor de preço, consistência dos parâmetros e guia de revisão, reserva de custo de produção, limpeza de ambientes de trabalho).

