# Gate gold do roteador semântico

Estado em 07/09/2026: aprovado no conjunto gold delimitado e classificado como `tested` para
validação interna. Não governa produção e não homologa executores nem qualidade analítica.

Evidência controladora: [run 34096964058](https://github.com/carlosevg100/offroad/actions/runs/34096964058),
executado no commit `919def6a81f88ac9053169ca9950b28b08efa1ad`. Foram 17/17 turnos em
composição, abstenção, profundidade, continuidade, primeiro trabalho, trabalhos esperados,
responsabilidades e perguntas; 6/6 entroncamentos repetidos permaneceram invariantes. A corrida
gerou 29 observações, 31 tentativas de provedor, custo medido de US$ 0,5265 e nenhuma tentativa com
custo desconhecido.

## O problema que este gate resolve

Um classificador semântico pode retornar JSON válido e ainda assim escolher trabalhos diferentes
para o mesmo pedido. Isso é particularmente perigoso porque a variação parece linguagem natural,
mas altera fontes, análises, perguntas, materiais e especialistas acionados.

O gate compara o contrato exato usado pelo worker com 17 turnos canônicos dos cinco casos gold.
Não existe cópia simplificada do prompt ou do schema no harness: ambos vivem em
`@offroad/agent-contracts` e são importados pelo produto e pelo avaliador.

O modelo não é a autoridade final sobre o plano. Ele lê linguagem, objetos, resultado e contexto;
uma política determinística e versionada deriva dos 20 identificadores canônicos a ordem dos
trabalhos, profundidade mínima, continuidade e responsabilidade operacional. Regras explícitas de
alta precisão reconhecem transições como reunião para material, alteração de premissa, pergunta de
origem e revisão. Assim, pequenas variações de prosa não mudam silenciosamente o workflow.

O cargo continua sendo contexto, não autorização. `decision_maker` só é acrescentado quando a
pessoa declara que a decisão é dela; introdução externa continua exigindo autorização específica.

## O que é medido

Todos os 17 turnos rodam uma vez para medir:

- composição escolhida;
- decisão de abster;
- profundidade;
- continuidade;
- primeiro trabalho do plano;
- cobertura dos demais trabalhos e responsabilidades;
- presença ou ausência de pergunta material e aderência ao tema do gabarito.

## Fronteira das perguntas

Este gate mede somente a pergunta que altera o workflow: família de trabalho, ordem, audiência,
forma de entrega ou efeito externo. O roteador não deve interromper um trabalho já identificável
para pedir orçamento, dívida, tape, aging, mandato ou cronograma de capex. Essas são lacunas de
evidência e pertencem ao mapa de cobertura e ao question gate do executor especializado.

Essa separação evita duas falhas opostas: um roteador engessado que pergunta tudo antes de começar
e um executor que simula dados inexistentes. O primeiro inicia o trilho correto; o segundo mostra o
que já consegue fazer, pede apenas o que muda materialmente a análise e registra o que ficou sem
cobertura.

Seis entroncamentos rodam três vezes por padrão:

- instrução incompleta de um sponsor;
- pergunta pontual dentro de um projeto;
- correção explícita do objetivo;
- pedido com efeito externo;
- alteração incremental de premissa;
- pedido ambíguo que exige abstenção.

A estabilidade ignora redação, justificativa e pequenas diferenças de confiança. Ela compara apenas
os valores que mudam o workflow. Uma composição, profundidade, continuidade, primeiro trabalho,
responsabilidade ou decisão de perguntar diferente gera outro fingerprint e reprova invariância.

## Regra de promoção

Composição, abstenção, profundidade, continuidade, primeiro trabalho, responsabilidades,
completude e invariância exigem 100%. Trabalhos complementares e presença e tema da pergunta exigem
pelo menos 93%, o que permite no máximo um erro no conjunto atual. Um resultado verde é necessário,
mas não suficiente: ele não promove o roteador, não libera executor e não autoriza conclusão para
cliente.

## Execução e segurança

O workflow manual `Intent router gold gate` usa apenas prompts sintéticos. As chaves são lidas no
GitHub Actions por credencial AWS OIDC de curta duração, mascaradas antes do processo e nunca
persistidas. O gateway impõe teto de chamadas e de custo. O artefato contém JSON, relatório Markdown,
fingerprints, métricas, custos e logs sem conteúdo de cliente; não contém vídeo nem trace de browser.

Com três repetições, são 29 resultados planejados. O orçamento padrão é US$ 3 e o limite configurável
nunca pode exceder US$ 10. O workflow termina com falha quando qualquer gate não passa, preservando o
relatório para diagnóstico.

## Decisões a partir das corridas reais

Cada resultado real é tratado como medição, não como aprovação. Cada divergência vira
uma de quatro ações: corrigir o gold quando o gabarito estiver errado; melhorar o contrato quando a
intenção estiver subespecificada; separar uma composição quando dois trabalhos legítimos estiverem
colidindo; ou manter a família fora de produção quando o classificador não for estável.
