# Etapa 17 / 4C: gates profissionais da execução

Incremento 4 do contrato de execução da etapa 17 (`etapa-17-execucao.md`, item 4) pede provar, no caminho da execução, cadastro e pesquisa sobre a companhia, seleção de método, convenções versionadas, voz, gráficos e teste do MD, sem aprovar parâmetro jurídico ou tributário ausente por default. O método v4 publicado tem bytes imutáveis, então nenhum gate entra no executor: eles envolvem a execução em três pontos que já existem, a base montada no servidor, a ação da web e a leitura. Nenhum gate produz conteúdo profissional novo; catálogos e perguntas vêm do procedimento v4 (N4, T3, R2, R3, Q1 e Q2) e de `reference-data.ts`.

## 4C-3: recibo dos gates no banco

Migração `20260924005237_execution_gate_receipts.sql`.

Base v2 (`execution_contract_basis_v2`): a base v1 com todas as checagens v1 rodando antes, mais um bloco `company` calculado só de linhas persistidas. A entidade dominante é a das decisões fixadas pela base (`adoption_decisions.entity_id`), com empate para o menor id. Cadastrada quer dizer sujeito ativo de um dossiê do trabalho ou de um recurso sob ele, com identificador revisado e vigente, ou a companhia legada do trabalho verificada. Pesquisa lê as execuções de pesquisa registradas para as sessões do trabalho (`recorded` para concluída ou parcial, `abstained` para tentada sem fonte utilizável).

Recibo (`private.execution_gate_receipts`): um por execução, escrito na mesma transação da execução, nunca alterado, apagado ou truncado. O texto guardado é o canônico da casa e o SHA-256 é calculado no banco; uma restrição confere o hash e outra confere que versão e bloqueio batem com o texto.

Produtor v2 (`request_work_execution_v2(contrato, snapshot, gates)`): valida os gates antes de qualquer outra coisa, com lista fechada de chaves em todos os níveis, só tokens e estados enumerados e nenhum texto livre; recusa gates bloqueados (`execution_gates_blocked`), gates de outro método ou versão e contrato que não fixa exatamente uma versão de base (`execution_gates_mismatch`), e só depois de a base v2 conferir o acesso ao trabalho compara o cadastro declarado com o calculado pelo servidor, para que uma recusa nunca revele o cadastro a quem não tem acesso. Em seguida o produtor v1 roda sem mudança; um replay só vale com os mesmos gates, e gates diferentes sob o mesmo pedido são o conflito que o v1 já reporta, nomeando a execução existente. Leitor v2 (`read_work_execution_v2`): a leitura v1 mais o recibo.

Decisões do executor:
- A memória pública de companhias (`private.public_company_source_memory`) não é lida: a própria migração a restringe a uma capacidade viva do worker, e o `stored_at` dela diria a uma organização quando outra pesquisou a mesma companhia. Toda pesquisa do worker, inclusive a que reaproveita a memória, já registra uma execução de pesquisa no projeto.
- "Dossiê do trabalho" inclui o dossiê de uma sessão sob o trabalho, porque a entidade de uma observação precisa estar ligada no dossiê da própria observação, que costuma ser o da sessão.
- O contrato precisa fixar uma única versão de base, que é a única forma de saber que o cadastro foi calculado sobre a mesma base do pedido.
- A memória pública e a leitura estrita de dossiê ficam registradas como alternativas de uma linha, se a decisão mudar.

Provas: `supabase/tests/execution_gates.sql` (39 verificações) executada em staging com rollback e no job de banco da CI: cadastro e pesquisa a partir das linhas, entidade dominante e empate, recusas de gates bloqueados, com texto livre em qualquer nível, com bytes não canônicos, com chave duplicada ou situação repetida, de método ou versão divergentes e de cadastro que o servidor não calcula; membro sem acesso recebe acesso negado e não divergência; nenhuma execução nem recibo depois das recusas; falha forçada no recibo desfaz a execução; recibo com o hash do servidor; leitor v2 com o recibo e v1 inalterado; replay, conflito e nenhum segundo recibo; recibo imutável; só os três wrappers v2 e os gêmeos privados alcançáveis por tenant. Contrato TypeScript `packages/agent-contracts/src/execution-gates.ts` (esquema fechado em todos os níveis; o mesmo fingerprint que o SQL calcula para os mesmos bytes).

Estampas: staging `20260924003703`, produção `20260924005237`, aplicadas pelo executor via MCP antes do merge; corpos das funções idênticos nos dois projetos (md5 conferido). Advisors de segurança zero. Inventário com 13 objetos; catálogo de produção 2257 objetos. O catálogo de staging capturado junto (2375) já carrega os 57 objetos da migração do incremento 5, aplicada em staging por outro trabalho em curso; eles são revisados na PR desse incremento. Tipos públicos regenerados de produção.

## Em aberto neste incremento

- 4C-1, 4C-2 e 4C-5 (código): filtro de voz, gate de convenções, catálogo de situações e seleção de método, rubrica e teste do MD, séries de gráfico. Entram por uma PR de união.
- 4C-4 (web): formulário com as situações, montagem do texto dos gates na ação e detalhe com gates, achados de voz e teste do MD.
