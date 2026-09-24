# Etapa 17 / 5: avaliações governadas

Incremento 5 do contrato de execução da etapa 17 (`etapa-17-execucao.md`, item 5): religar os nove scripts de avaliação contidos pela etapa 16 somente por transporte autorizado, com orçamento, finalidade, audiência, fontes e retenção revalidados a cada envio, reparo e fallback; corrigir a montagem da base do baseline e provar o dry-run completo; remover a barreira incondicional só quando a negação pelo guarda estiver comprovada no caminho inteiro. Sem devolver chaves de provedor aos scripts e sem trocar o guarda por flag.

## Dry-run do baseline (#746)

`run-gold-baseline.ts` montava a base sem turnos, documentos e fontes, então o Zod quebrava antes do ramo de dry-run e o hash nunca cobria os documentos. A base agora é montada completa, e um teste roda o script como processo filho, sem nenhuma chave de provedor no ambiente, e confere que nenhum modelo é chamado, que os dois documentos do caso gc01 entram e que o hash impresso é o do texto renderizado.

## Transporte no banco, instalado fechado

Migração `20260924011837_governed_evaluation_transport.sql`. Avaliação é trabalho de plataforma, não execução de tenant: roda só dentro de uma organização registrada para avaliações, é pedida e lida só por um principal avaliador registrado e chega a um provedor só pelo worker, uma operação declarada, reservada e registrada por vez.

- Principal `evaluator`: pede e lê avaliações e nada mais. Comandos de operador passam a aceitar só fundador ou operador, e a identidade declarada nos ledgers nunca pode ser um avaliador.
- Organizações de avaliação: registradas só pelo comando de operador, ledgeradas, nunca editadas, apagadas ou truncadas; uma organização da qual o fundador não é membro só entra pelo fundador.
- Identidade da avaliação imutável com os bytes exatos de contrato e snapshot; contrato fechado (`governed-evaluation-contract.v1`): finalidade `evaluation`, audiência `evaluation_panel` com caso, versão e script, ferramentas só rotas de provedor somente leitura, orçamento inteiro em microdólares e chamadas com validade, fontes só como hash de conteúdo, sem texto e sem URL.
- Worker: claim, renovação, reserva, liquidação e commit espelham o consumidor de execução. Cada envio, reparo ou fallback é uma operação própria: rota declarada na versão declarada, orçamento restante e a mesma decisão de processamento da etapa 16 com finalidade `evaluation`, registrada antes de qualquer envio. O commit autoriza de novo cada rota usada; sucesso só com todo recibo liquidado, nenhum envio negado e orçamento preservado; senão `partial` com o motivo que o banco deriva (`transport_denied`, `budget_exhausted`, `operation_uncertain`).
- Chave de transporte: uma linha em `platform_capability_releases` instalada com `released=false`; só um comando próprio de operador a abre, e pausar para claims e envios sem deploy, deixando renovação, liquidação e commit aterrissarem o que já foi pago.
- Compatibilidade: as claims existentes (`worker_claim_job`, v2, v4) e a capability legada excluem o novo kind; `bind_job_authority_v1` ganha um ramo que não liga recurso de tenant; o contrato de boot do worker lista a capacidade nova sem retirar nenhuma, então toda imagem implantada continua subindo. As três funções reescritas por inteiro têm guarda de md5 do corpo anterior; as quatro reescritas por texto falham se a âncora não existir.

Provas: `supabase/tests/governed_evaluation_transport.sql` (89 verificações) em staging com rollback e na CI; `scripts/ci/test-evaluation-concurrency.py` com duas sessões reais (reserva segurada contra revogação da garantia, e o inverso), sem sucesso e sem orçamento negativo; o job de banco da CI rodou a suíte inteira existente com a migração antes da aplicação em produção.

Estampas: staging `20260924005113`, produção `20260924011837`, aplicadas pelo executor via MCP. Antes da aplicação: definições atuais das restrições substituídas conferidas (cada nova é superconjunto), md5 dos três corpos reescritos igual à guarda, corpos das funções reescritas por texto iguais ao registro de corpos efetivos. Depois: instrução gravada idêntica ao arquivo (só sem a quebra de linha final), corpos das cinco funções reescritas por texto idênticos aos de staging, chave instalada fechada, capacidade listada no contrato de boot, advisors de segurança zero. Inventário com 57 objetos (17 criados em laço, registrados com a linha do `execute format`); catálogo de produção 2314. Tipos públicos regenerados de produção.

## O que falta para religar os scripts

- Consumidor no worker: fila de avaliação, gateway com a reserva no gancho de elegibilidade (todo reparo e fallback revalida), liquidação por tentativa com custo, commit; primeira família de executor, o baseline generalista.
- Porta de entrada por sessão de avaliador: `request` e `read` ficam hoje só na superfície de operador. O consumidor traz wrappers públicos que tomam o avaliador da sessão (`auth.uid()`), exigem principal avaliador vivo e nunca aceitam o ator como parâmetro.
- Scripts por família, cada um removendo a sua linha de guarda na mesma PR da prova do caminho (gateway com cassete na pilha descartável: pedido, claim, reserva, liquidação, commit e leitura; depois a garantia revogada e zero chamadas).
- Uso real, que depende do fundador: a conta do avaliador (o executor não cria contas), o registro da organização de avaliação, a abertura da chave e o gasto com provedores nas avaliações.
