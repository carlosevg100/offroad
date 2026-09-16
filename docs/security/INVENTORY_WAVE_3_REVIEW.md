# Abertura da onda 3: política comum de acesso

O fundador aprovou a onda 2 e autorizou seguir em 16/09/2026. A onda 3 executa a etapa 3: política comum, grupos, barreiras e delegação limitada; telas administrativas continuam adiadas. A etapa 5 não está incluída neste aceite.

Baseline main `9b6ccf981827f97236107c4d0f64096213a1e2e9`, web e worker publicados, ECS 335. A observação AWS foi recolhida novamente por leitura com a sessão existente. Quatro alarmes OK, sem destinatário configurado; permissões IAM gerais não foram atestadas. A negação OIDC registrada continua explicitamente histórica.

Renovação atômica do snapshot, manifesto, autoridade de coleta e fingerprint: `wave-3`, cadência por onda. As 54 evidências e os 18 gaps mantêm escopo; os hashes de repositório foram recalculados contra o commit de main. O inventário final da onda 2 está preservado em `history/wave-2-delivered-inventory.md`. A alteração de política da etapa 3 exigirá nova revisão material antes de seu merge.

Controles: TRUST-GOV-02, TRUST-ID-01, TRUST-DATA-01, TRUST-SDLC-01. Testes de onda anterior e futura continuam negativos. Sem DDL, novo provedor, segredo ou concessão. Rollback não reutiliza a identidade de uma onda encerrada como autorização corrente.
