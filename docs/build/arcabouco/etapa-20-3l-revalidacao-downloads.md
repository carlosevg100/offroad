# Etapa 20 / 3L: revalidação dos downloads de materiais

## Escopo

Antes de entregar HTML, DOCX, PDF, PPTX ou XLSX, reler a revisão exata usada na geração e exigir autoridade ainda válida. O helper `renderedRevisionStillAuthorized` em `apps/web/src/lib/artifacts/artifact-route.ts` chama `read_artifact_revision_v1` com o ID original, nunca o head. Confere artefato, trabalho, tipo, assunto, número de revisão, fingerprint, hash de conteúdo, audiência, liberação e atualidade. Resposta recusada, inválida, erro ou exceção retém os bytes. Avanço do head não troca a revisão histórica ainda autorizada.

Consumidores: `material-download.ts` (DOCX/PDF/PPTX), `materials/[sessionId]/[kind]/route.ts` (HTML) e `model/[sessionId]/route.ts` (XLSX). Mantêm acesso à sessão, verificação de bytes, no-store e, no Excel institucional, a revalidação própria da revisão nativa. Ambas as autoridades são necessárias. O leitor final fica depois da geração e antes da resposta.

Este é um incremento da preparação dos materiais prevista no agrupamento vigente da etapa 20. Não troca gates legados nem concede aprovação; não inicia 21–24. Não há DDL, grants, tipos públicos, backfill, conteúdo profissional ou nova integração. Migração não se aplica. Nenhuma chamada de modelo ou gasto de provedor foi acrescentado.

## Eval e publicação

- Antes: cinco testes novos retornaram HTTP 200 indevido após revogar a autoridade de fonte, preservando o acesso à sessão (HTML/DOCX/PDF/PPTX/XLSX).
- Depois: 53 testes direcionados PASS, incluindo 26 novos. Cobrem fonte e aprovação revogadas durante geração nos cinco formatos, erro e exceção, manifesto/conteúdo/identidade divergentes, mudança de audiência/atualidade, resposta malformada e avanço do head sem troca de revisão. Bytes e cabeçalhos não são entregues na recusa.
- `artifact_revision_protocol.sql`: PASS em staging sob BEGIN/ROLLBACK, comprovando que o leitor instalado nega fontes restritas e mantém revisões imutáveis. Nenhum dado sintético em produção.
- Journals live preservados: último carimbo produção `20260929182306`, staging `20260929182221`. A correção usa as RPCs existentes.
- Gate local `pnpm check`: PASS, 44/44 tarefas; web 1.111 testes, evals 272. Restrição inicial de socket da sandbox resolvida executando o mesmo gate com acesso local, sem mudar testes. Revisão independente sem bloqueador estático. CI, merge e deployments pendentes; este documento não declara completion.

## Riscos e limites

APP-02, APP-08 e APP-11: revalidar autoridade da revisão depois do trabalho de geração, preservando o pin dos bytes. O intervalo entre última leitura e entrega não é uma transação distribuída; revogação posterior à consulta não recolhe bytes já entregues. Serialização integral segue na etapa 22. Esta prova também não transforma fontes legadas não registradas em linhagem comprovada: captura de fontes e adaptadores de aprovação de materiais continuam na etapa 20.

Recusa conserva mensagem existente e resposta privada sem cache; não cai em leitura legada. Se houver indisponibilidade da RPC, corrigir mantendo a recusa. Não reverter para emissão baseada apenas no acesso ao projeto.
