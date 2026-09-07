# Gate gold do roteador semântico

Estado em 07/09/2026: implementado, ainda não executado com modelo real. Não governa produção.

## O problema que este gate resolve

Um classificador semântico pode retornar JSON válido e ainda assim escolher trabalhos diferentes
para o mesmo pedido. Isso é particularmente perigoso porque a variação parece linguagem natural,
mas altera fontes, análises, perguntas, materiais e especialistas acionados.

O gate compara o contrato exato usado pelo worker com 16 turnos canônicos dos cinco casos gold.
Não existe cópia simplificada do prompt ou do schema no harness: ambos vivem em
`@offroad/agent-contracts` e são importados pelo produto e pelo avaliador.

## O que é medido

Todos os 16 turnos rodam uma vez para medir:

- composição escolhida;
- decisão de abster;
- profundidade;
- continuidade;
- primeiro trabalho do plano;
- cobertura dos demais trabalhos e responsabilidades;
- presença ou ausência de pergunta material e aderência ao tema do gabarito.

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

Composição, abstenção, profundidade, continuidade, primeiro trabalho, completude e invariância
exigem 100%. Trabalhos complementares, responsabilidades e presença da pergunta exigem pelo menos
93%, o que permite no máximo um erro no conjunto atual. Um resultado verde é necessário, mas não
suficiente: ele não promove o roteador, não libera executor e não autoriza conclusão para cliente.

## Execução e segurança

O workflow manual `Intent router gold gate` usa apenas prompts sintéticos. As chaves são lidas no
GitHub Actions por credencial AWS OIDC de curta duração, mascaradas antes do processo e nunca
persistidas. O gateway impõe teto de chamadas e de custo. O artefato contém JSON, relatório Markdown,
fingerprints, métricas, custos e logs sem conteúdo de cliente; não contém vídeo nem trace de browser.

Com três repetições, são 28 resultados planejados. O orçamento padrão é US$ 3 e o limite configurável
nunca pode exceder US$ 10. O workflow termina com falha quando qualquer gate não passa, preservando o
relatório para diagnóstico.

## Próxima decisão após a primeira corrida

O primeiro resultado real deve ser tratado como medição, não como aprovação. Cada divergência vira
uma de quatro ações: corrigir o gold quando o gabarito estiver errado; melhorar o contrato quando a
intenção estiver subespecificada; separar uma composição quando dois trabalhos legítimos estiverem
colidindo; ou manter a família fora de produção quando o classificador não for estável.
