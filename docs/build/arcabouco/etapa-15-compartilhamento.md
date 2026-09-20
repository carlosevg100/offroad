# Etapa 15: ordem observável de publicação na jornada compartilhada

## Problema e decisão

A jornada clicava em publicar no navegador A e imediatamente consultava o compartilhado
no navegador B. O clique não comprova conclusão da ação. O trace da falha histórica mostrou
B terminando a leitura antes da resposta de A; isoladamente isso não determina o instante
do commit. O teste também assumia que A venceria uma publicação concorrente sem comprovar
essa ordem. Fixar a sincronização pelas evidências visíveis do produto, mantendo a disputa
real simultânea no gate SQL existente `scripts/ci/test-contribution-concurrency.py`.

## Implementação e provas exigidas

Em `apps/web/e2e/work-contributions.spec.ts`, `expectPublished` exige o canal compartilhado
selecionado e a ação de propor alteração na versão correta. A publicação permanece uma ação
real do produto, com banco local sintético e dois usuários autenticados independentes.

O passo `before publication completes, an early shared read has no revision` segura
somente a requisição POST da promoção da revisão escolhida, antes de atingir o servidor.
A consulta de B termina, a revisão está ausente na tela e o banco tem zero promoções.
`after observable publication, the second reader sees the persisted revision` libera a
requisição, aguarda A, consulta novamente por B e exige exatamente uma promoção no banco.
As duas provas são anexadas como JSON ao relatório Playwright, sem bodies ou credenciais.
Não é necessário induzir uma CI vermelha: a asserção negativa explicita o estado que tornava
falsa a antiga expectativa de visibilidade imediata.

A jornada segue com canais privados, conflito base/atual/candidata, preservação das duas
contribuições, rebase, histórico, desktop/mobile e revogação efetiva. Retry deste arquivo é
zero; timeouts globais permanecem inalterados. A liberação da requisição fica em `finally`.

## Entrega e limites

Check local integral antes do push; descoberta Playwright e tipagem locais. A máquina local
não possui Docker; a reprodução com banco, OTP e navegadores reais roda no stack isolado da
CI, obrigatório antes do merge. Resultado pendente não equivale a pronto. Nenhuma migração,
backfill, nova rota, permissão ou mudança do runtime; os controles de isolamento e revogação
existentes continuam exigidos. A evidência apoia SEC-104 (testes por permissão) e SEC-408 (registro de mudança),
sem declarar concluídos esses controles amplos ou alterar seu desenho. Nenhum provedor ou retenção afetado.

Após merge, confirmar CI de main, web e worker no mesmo commit, smoke de rotas e saúde, sem
dados descartáveis em produção. Completion externo registra IDs, horários e resultado real.
Rollback é reversão desta mudança de teste, sem efeito em dados. A etapa 15 permanece aberta;
próximo recorte é composição de projeções, liquidez e custos. Esta correção não promete
sincronização em tempo real entre navegadores nem altera o produto para passar no teste.

## Referências técnicas

- Next.js instalado: `apps/web/node_modules/next/dist/docs/01-app/02-guides/server-actions.md`.
- [Interceptação de requisições no Playwright](https://playwright.dev/docs/api/class-page#page-route).
- [Asserções observáveis no Playwright](https://playwright.dev/docs/test-assertions).
- [Changelog Supabase](https://supabase.com/changelog): consultado em 20/09/2026;
  sem mudança de CLI, stack, Auth ou schema neste incremento.
