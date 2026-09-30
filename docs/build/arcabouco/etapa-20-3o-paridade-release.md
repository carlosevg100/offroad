# Etapa 20: 3O, paridade do contrato de liberação

## Contrato

`packages/domain-contracts/src/artifact-protocol.ts` exige contexto resolvido para a revisão exata, acesso atual ao trabalho e às fontes, ancestralidade completa e classificação institucional explícita. Ausência, identidade divergente ou flags inválidas bloqueiam. Recibo de execução conserva seu tipo por compatibilidade, mas nunca aprova conteúdo. Execução direta ou herdada e conteúdo institucional nativo exigem ato humano ativo da própria revisão. Contraparte histórica e vínculo nativo ausente permanecem bloqueados. Fatos legados só participam do ramo cuja ancestralidade comum foi comprovada pelo resolvedor.

`review-coverage.ts` contém o helper compartilhado de aprovação exata, revogação e reafirmação cosmética; `review-protocol.ts` reexporta a mesma função sem ciclo de imports em runtime. A cadeia segue o limite SQL de 128 atos visitados. O teste do leitor web fornece contexto explícito para seu cenário legado. Nenhum consumidor de produção chama `releaseState`: os leitores continuam usando a projeção autorizada do banco, corrigida nos incrementos anteriores. Este contrato puro não consulta banco, comprova autoria ou concede acesso; o resolvedor autorizado comprova organização/trabalho, direitos, vínculos e histórico completo.

A projeção gerada `packages/credit-playbook/src/method-runtime-manifest.generated.ts` atualiza os hashes dos arquivos correntes e inclui o novo helper. O verificador de métodos publicados confirmou que releases fixados e suas fontes históricas permanecem imutáveis. Não há nova publicação de método ou alteração de conteúdo profissional.

## Eval e operação

Os novos negativos reproduzem o desvio na baseline: recibo aprovado, fato legado contornando execução, contexto incompleto e classificação institucional ignorados. A correção exige negação e preserva os positivos de aprovação humana exata, legado comprovado e reafirmação cosmética válida. A revisão independente também compara o limite de cadeia com `private.artifact_review_is_active_v1`; testes nas duas bordas impedem aprovação que o SQL recusaria.

Sem DDL, grant, backfill, mudança de provedor ou dados descartáveis em produção. As vinte definições de revisão/adaptadores consultadas têm o mesmo MD5 nos dois ambientes; journals mantêm `execution_result_human_review` nos carimbos próprios de produção `20260929182306` e staging `20260929182221`, com SQL MD5 `3276a2f0260533d74f984eb257401da2`. Catálogo versionado: 2.842 objetos, zero diferenças; checker com 18 testes aprovados. CI, merge, web e worker terão suas provas no completion externo após verificação.

## Segurança e limites

APP-02, APP-08, APP-11, DATA-03, DATA-09. Abuso tratado: interpretar evidência de cálculo ou aprovação histórica como aprovação humana da revisão corrente. Não registrar conteúdo financeiro, identidades de clientes ou credenciais na evidência. Contexto não é payload de autorização de cliente; um futuro consumidor deve resolver e revalidar esses fatos no servidor. Em incidente, conter esse consumidor e corrigir conservando a negação.

O restante da etapa 20 está delimitado em `etapa-20-restante-e-paralelismo.md`. Produtores e adaptadores legados, aplicação atômica de efeitos e interface de regime são entregas próprias, sem aprovação presumida por este ajuste. Propagação após a última consulta pertence à etapa 22. Etapas 21–24 aguardam OK da respectiva onda.
