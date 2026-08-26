# ADR 0014: Workspace do Agente Offroad e pesquisa pública governada

Status: accepted, fundador em 26/08/2026

Data: 2026-08-26

## Contexto

O produto já executa um trilho determinístico de leitura, reconciliação, análise, estruturação,
materiais e matching. Entretanto, a interface ainda apresenta o processo como um conjunto de
formulários. O usuário não vê com precisão o trabalho em andamento, o resultado de cada etapa nem
por que uma nova informação foi solicitada.

Também existe uma lacuna entre evidência enviada pela companhia e contexto público útil. Pesquisa
externa pode enriquecer a compreensão da empresa e do setor, mas não pode introduzir dados privados
em buscadores, transformar notícia em fato financeiro ou operar como um RAG global sem fronteiras.

Por fim, uma interface conversacional só cria valor se puder propor alterações concretas no case.
Conversa sem contrato de mudança produz respostas soltas; alteração automática sem prévia produz um
sistema imprevisível e sem trilha de auditoria.

## Decisão

1. O `processing_runs.stages` continua sendo o event log canônico da execução. O plano visível é
   uma projeção desse log e dos artefatos versionados, não um segundo estado editável.
2. Cada etapa econômica interna do case runner publica eventos `started` e terminais. O evento
   persiste apenas códigos estáveis, duração, uso e fingerprints seguros. Inputs, outputs, mensagens
   de exceção e identidade de fundos não entram no plano público.
3. A projeção agrupa eventos técnicos em tarefas compreensíveis para o cliente. Uma tarefa só aparece
   como concluída quando o trabalho correspondente foi realmente persistido. Estados permitidos:
   `pending`, `running`, `completed`, `blocked` e `failed`.
4. O workspace terá três áreas coordenadas: plano de trabalho, artefato ou dado em foco e conversa
   contextual. Em telas menores, a mesma hierarquia será apresentada em painéis sequenciais.
5. O Agente Offroad não é um agente autônomo paralelo. Ele é uma interface sobre o pipeline
   determinístico, os procedimentos canônicos e os comandos autorizados da aplicação.
6. Toda sugestão que altera o case usa um contrato tipado de mudança com escopo, motivo, evidência,
   impacto, prévia, ator e estado. Nada material é aplicado sem confirmação explícita do usuário ou
   de uma regra previamente aprovada e auditável.
7. Pesquisa pública é uma fonte separada de contexto. Ela nunca substitui documento, fato
   reconciliado, cálculo ou critério de mandato. Cada achado carrega URL canônica, fonte, data de
   publicação ou consulta, trecho, hash, tema e confiança.
8. Nenhum identificador de cliente, documento, valor financeiro não público ou texto privado pode
   ser enviado a um provedor de busca. As consultas são construídas apenas com termos públicos
   aprovados. A política bloqueia a chamada quando não consegue produzir uma consulta segura.
9. A ordem de pesquisa é governada por adaptadores: fontes estruturadas e oficiais quando
   disponíveis, crawler permitido por domínio, mecanismo de busca com citações e fallback aprovado.
   MCP é usado somente para fonte oficial ou interna com contrato e escopo explícitos.
10. Achados públicos entram na análise como `external_context`. Divergências com dados enviados
    geram pergunta ou flag; nunca reescrevem silenciosamente a evidência da companhia.
11. As etapas iniciais da experiência seguem sete marcos: empresa, operação, base inicial,
    entendimento preliminar, esclarecimentos, pacote institucional e direcionamento ao mercado. A
    interface revela somente a próxima ação útil e permite voltar a qualquer etapa já iniciada.
12. Introdução a investidores exige autorização específica e permanece separada de preparação,
    screening e matching. A Offroad não representa decisão de crédito, diligência final ou
    comprometimento de capital.

## Contratos de implementação

- execução real: `@offroad/case-runner` e `processing_runs.stages`;
- projeção do plano: `@offroad/work-plan`;
- evidência e retrieval interno: ADR 0010;
- conhecimento executável: ADR 0013;
- pesquisa pública: adaptadores com allowlist, citações, cache, orçamento e lineage próprios;
- alterações conversacionais: comandos tipados com preview, confirmação, aplicação idempotente e
  reversão quando o domínio permitir.

## Consequências

- a interface deixa de simular atividade e passa a explicar a execução real;
- uma falha de persistência do progresso interrompe o job, evitando trabalho invisível;
- pesquisa externa pode desafiar e contextualizar, mas não contaminar a base probatória;
- o modelo não controla fluxo, autorização, orçamento, publicação ou matching;
- o usuário acompanha o que foi feito, o que falta, o resultado disponível e a próxima ação;
- o rollout ocorrerá em verticais: observabilidade do pipeline, plano visível, pesquisa pública e,
  por último, comandos reversíveis do Agente Offroad.

## Primeira vertical executável, 26/08/2026

A primeira vertical do Agente atua somente sobre o brief declarado da operação. Uma mensagem do
usuário cria atomicamente uma conversa, uma mensagem append-only, uma run e um job. O worker usa
capability efêmera e uma única chamada estreita de modelo para responder, pedir um esclarecimento ou
preparar uma proposta tipada. A mensagem do usuário é registrada como declaração, nunca como fato
reconciliado.

A proposta aceita apenas campos e valores enumerados do brief. Ela carrega fingerprint do estado,
origem, impacto, recomputações e validade. A interface mostra a prévia e exige a ação explícita
`Aceitar e aplicar`; aceitar e aplicar são transições distintas dentro da mesma transação. Estado
alterado, proposta vencida ou sessão terminal tornam a proposta stale. Uma falha desta run auxiliar
não pode falhar o processamento independente do data room.

Esta vertical não escreve materiais, não escolhe financiadores, não aprova crédito, não conduz
diligência e não compromete capital. Novos comandos do Agente devem repetir o mesmo padrão de
contrato estreito, preview, confirmação, aplicação canônica e teste de não interferência.
