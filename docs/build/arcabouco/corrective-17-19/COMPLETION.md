# Rodada corretiva das etapas 17–19

Estado: fechamento em preparação; CI final e deployments ainda em conferência. Este documento não autoriza a etapa 20.

## O que foi feito

PR 828 mesclada em `e3dcd43b`; PR 831 mesclada em `10c11e14`, contendo integralmente A3/A4/A5. PR 829 fechada como absorvida pela 831. Quality da revisão consolidada 36323882427 inteiramente aprovada; Quality de main e deployment final em conferência.

A1 remove leitura direta de `artifacts`, `artifact_revisions` e `artifact_blocks` por `anon`, `authenticated` e `service_role`; o leitor autorizado permanece o caminho de conteúdo. A2 fecha a leitura quando a ancestralidade ultrapassa a fronteira verificável de 64 vínculos. A3 serializa a conta humana persistida com o commit de execução, inclusive quando o worker usa outra conta. A4 exige fundador ativo e identificado para nova publicação de método, inclusive quando o último fundador foi revogado. A5 impede replay do cadastro do perfil com commit de adaptador diferente.

| Migração | Staging | Produção e arquivo |
|---|---|---|
| artifact_content_access_hardening | 20260927131021 | 20260927131506 |
| execution_human_revocation_serialization | 20260927133553 | 20260927133717 |
| platform_publication_authority_hardening | 20260927133313 | 20260927133737 |

SQL exato dos três arquivos conferido nos dois journals. Nenhum carimbo foi reparado ou SQL reaplicado. Journals: 406 registros em produção, 420 em staging. Catálogos finais: 2.640 e 2.701 objetos, respectivamente, sem diferença inesperada; ambos os checkers de inventário passaram. Advisors de segurança vazios nos dois ambientes. Tipos públicos regenerados de produção idênticos ao arquivo commitado (445.010 caracteres).

Arquivos principais: as três migrações acima, `supabase/tests/artifact_content_authority.sql`, `execution_human_revocation.sql`, `platform_publication_authority.sql`, fixtures compartilhadas e os harnesses `scripts/ci/test-execution-concurrency.py` e `test-platform-method-concurrency.py`. A documentação das ondas 20–24 incorpora os riscos com responsável, incremento e prova; o parágrafo de marca em `AGENTS.md` preserva a decisão Offroad. O checkout original e seus arquivos não commitados foram preservados.

## Eval realizado

| Prova | Resultado e alcance |
|---|---|
| artifact_content_authority.sql | PASS em staging e CI: SELECT direto negado; 64 vínculos completos permitidos; fronteira incompleta negada; múltiplos pais; remoção de citação visual não remove direito herdado; release externo |
| artifact_revision_protocol.sql, artifact_producers.sql, rls_non_interference.sql | PASS em staging e CI; regressão dos produtores e protocolo após retirada dos grants |
| execution_human_revocation.sql | PASS em staging e CI, suspensão e exclusão lógica com contas humana/worker distintas |
| human_revocation_baseline | REPRODUCED na CI descartável: função histórica permitia resultado enquanto suspensão humana ainda não tinha commit |
| human_banned_until_first, human_banned_until_commit_first, human_banned_until_rollback | PASS, espera real entre duas sessões; negação, preservação do resultado anterior/replay negado e rollback permissivo |
| human_deleted_at_first, human_deleted_at_commit_first, human_deleted_at_rollback | PASS, mesmos três casos para exclusão lógica |
| platform_publication_authority.sql | PASS em staging e CI: último fundador revogado, banido e excluído não publica; fundador válido publica com identidade |
| platform_operator_identity.sql, platform_method_publication.sql | PASS em staging e CI: operador/rótulo não substituem fundador, replay exato funciona e adapter commit diferente é negado |
| platform_founder_revoke_revocation_first, platform_founder_revoke_publication_first | PASS, espera real e quantidade de publicações conferida |
| platform_founder_ban_revocation_first, platform_founder_ban_publication_first | PASS, espera real e quantidade de publicações conferida |
| Playwright da revisão consolidada | PASS, 44 jornadas e 16 puladas; casos pulados permanecem fora da prova, sem chamada de modelo pago |
| pnpm check | PASS, 44 tarefas; lint, tipos, testes e build no Node 24.19.0 |
| Checkers | PASS: inventário dos dois ambientes, 16 arquivos recuperados, manifesto de 94 funções; 18 testes do inventário e cinco do histórico |

**Antes/depois em staging.** A1/A2 falharam antes com leitura direta indevida e ancestralidade incompleta aceita; depois passaram. A4/A5 falharam antes com publicação sem fundador ativo e replay de commit divergente aceito; depois passaram. Todos os dados sintéticos ficaram em transações revertidas. A3 tem negativos funcionais em staging e prova concorrente real na CI descartável: não se apresenta o teste de uma sessão em staging como prova de corrida. Persistir o fixture concorrente em staging deixaria registros imutáveis sem caminho legítimo de limpeza.

Provas concorrentes completas: Quality 36323133942, database 108630785523 (A3 e regressões R01); Quality 36323218921, database 108630943027 (A4/A5 e regressões). A primeira tentativa de A3 reproduziu e corrigiu a corrida, mas encontrou colisão entre UUIDs de fixtures; a suíte recebeu prefixos separados e passou inteira. O resultado inicial não foi registrado como CI verde. Revisão independente estática aprovou A1–A5 e os quatro testes concorrentes de publicação.

## O que mudou em produção e como foi verificado

As três fronteiras de autoridade acima estão ativas. SQL do journal, definições instaladas e grants foram lidos dos ambientes vivos. Produção preservou 130 artefatos e 133 revisões, com zero execuções, zero recibos de resultado e zero usuários de fixture. Staging ficou com zero revisões de artefato e zero usuários das novas famílias de fixture.

Páginas `/pt-BR` e `/en-US` responderam 200; `/pt-BR/app` sem sessão respondeu 307 para autenticação. Oito alarmes `offroad-*` estavam OK. Nenhum método real foi publicado ou ativado; nenhuma aprovação histórica recebeu autoria retroativa.

## O que ficou fora e por quê

A6, revalidação da revisão exata após I/O, começa na 20, cobre todas as famílias na 21 e fecha a serialização ponta a ponta na 22. O download determinístico de arquivo guardado é gate do primeiro incremento da 21. Esses dois itens são trabalho explicitamente atribuído às ondas seguintes, não provas já obtidas nesta rodada.

Não houve ensaio com modelo pago, execução real de cliente, aprovação de conteúdo profissional, mudança de contrato de provedor ou retenção. A revisão do acabamento 827/830 não duplica a implementação do Claude. Contas locais ainda existentes e limitações de tradução/identificadores não foram ocultadas por uma afirmação de cobertura universal.

## Riscos abertos e recomendação

Seguir o roteiro corrigido: texto substantivo material e continuação por ID na 20; recibo externo de exportação sem circularidade, base histórica verificável e comparação de três vias na 21; revogação síncrona e limpeza mensurável na 22; classificação individual do legado na 23; prova integrada no commit implantado na 24. Modelos e testes administrativos permanecem; telas aguardam tenant que as exija. Ausência de gate pago não vale como homologação de modelo.

## O que precisa do fundador

Após o fechamento efetivo desta rodada, somente o OK da onda 20 para iniciar sua implementação. Aprovação profissional, liberação de execução real, gasto ou contrato novo continuam atos próprios quando aplicáveis. Não pedir recertificação manual de acessos nem retenção zero como pré-condição técnica.
