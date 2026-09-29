# Etapa 20 / 3K: revisão humana de resultados de execução

## Escopo e decisão

O recibo de execução comprova cálculo, não aprovação humana. `private.artifact_revision_release_v1` reconhece execução no manifesto e em toda ancestralidade: revisão consultada só fica `released` com ato ativo sobre organização, trabalho, artefato, revisão, fingerprint e audiência exatos. Conteúdo interno autorizado permanece legível antes da aprovação; audiência externa fica bloqueada. Aprovação de pacote legado não contorna esse contrato. As negações institucionais anteriores permanecem.

A página de execução usa `ArtifactRevisionReview`, com comentário, devolução, aprovação e revogação. A ação `execution-review-actions.ts` resolve organização da sessão, confere o trabalho e a revisão, e delega à RPC atômica. O preparador é o humano original do job, inclusive quando outra pessoa recupera a projeção. O leitor de execução mantém resultado bruto apenas em ausência comprovada de revisão; erro ou incompatibilidade retém o conteúdo. Nenhum novo grant, tabela ou efeito externo.

## Evidência

- `execution_result_human_review.sql`: recibo sem aprovação; preparador original; leitura interna antes de aprovar; autoaprovação exige declaração; aprovação exata; derivado com ato próprio; pacote legado não libera; audiência externa bloqueada/aprovada/revogada; fingerprint errado; fonte revogada. PASS staging em transação integralmente revertida.
- `execution_artifact_recovery.sql`: recovery por sucessor conserva preparador original. PASS staging.
- `institutional_native_human_review.sql`: preservação das negações e aprovação institucional. PASS staging.
- 39 testes web direcionados PASS; testes adicionais de erro sem fallback. Gate local `pnpm check`: 44/44 PASS.
- Jornada `capital-execution-request.spec.ts` ampliada: pendência, declaração, aprovação persistida após reload e revogação.
- Migração `execution_result_human_review`: staging `20260929182221`, produção `20260929182306`; SQL MD5 `3276a2f0260533d74f984eb257401da2`. Definição instalada idêntica nos dois ambientes.
- Catálogos: 2.842 objetos em produção, 2.903 em staging; nenhuma alteração de grants. Checkers: 18 testes e 95 snapshots efetivos conferidos.
- Gates de banco e E2E da CI 36612321209 PASS e Security 36612321465 PASS. O gate web identificou um travessão proibido no título deste documento; corrigido sem alterar comportamento. CI final, merge e deployments ainda pendentes; este documento não declara completion.

## Riscos tratados e limites

IAM-05, DATA-03, APP-02, APP-09 e APP-11: atos sob autoridade atual, fontes completas, revisão imutável e nenhum atalho legado. Revogação de aprovação muda a liberação; não destrói histórico. Revogação de fonte impede leitura e novos atos. Conteúdo profissional, publicação no cofre e liberação para cliente real não são alterados.

A troca de liberação alcança resultados existentes sem fabricar aprovações: continuam internos até ato humano explícito. Ausência real de revisão conserva evidência histórica sem botão de aprovação. Recuperação explícita de projeções permanece no contrato 3A; nenhuma recomputação automática foi acrescentada. Etapa 20 permanece aberta, 21–24 não iniciadas.

Rollback: correção aditiva; não restaurar aprovação por recibo. Se a interface falhar, conter os atos mantendo leitura interna autorizada e a negação externa.
