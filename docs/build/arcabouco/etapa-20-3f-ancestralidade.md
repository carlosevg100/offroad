# Etapa 20 / 3F: integridade da cadeia institucional

Incremento em validação. O 3E fechou na PR 841, main `6c337cf499bf0930011d6e2fa0f3c5f3199d2774`: CI da PR 36481704454 e de main 36483919586 aprovadas; web 6720596648 e worker 492 no mesmo commit, boot conferido diretamente na AWS. Completion externo: outputs/etapa-20-2026-09-27/ETAPA-20-3E-COMPLETION.md.

## Contrato

`private.institutional_configuration_ancestry_v1(uuid,uuid,uuid)` percorre configuração exata, pai por ID do comprovante 3E e raiz capturada no 3D. Confere organização/trabalho, hashes dos corpos, binding, autor/mensagem/resposta, aplicação reconstruída e captura de setup. Devolve nós do descendente até a raiz e versões de fonte/direito em ordem estável; inclui fontes entregues mas não citadas. Não devolve valores financeiros nem texto de resposta. Função privada, sem grant inclusive service_role, sem wrapper público, sem consumidor runtime novo ou alteração da liberação.

`captured_lineage` significa somente integridade histórica. A resposta explicita `authorization: not_evaluated`. Direitos fixados não concedem direito atual: o consumidor futuro precisa revalidar fonte, operações, propósito, prazo e autoridade na transação de uso. O helper de autorização existente continua negando revogação, mesmo quando a cadeia histórica permanece íntegra.

Qualquer elo ausente, origem não suportada, parentesco divergente, ciclo ou mais de 128 nós retorna `unresolved`, sem lista parcial de nós/fontes. Aplicação com campos extras não reproduzíveis pelo contrato canônico também fica unresolved. Não normalizar silenciosamente evidência antiga. O escritor só referencia pai preexistente e as revisões/comprovantes são imutáveis; a detecção de ciclo no resolvedor é defesa adicional, não reparação do histórico.

## Ordem e limites

Revisão independente confirmou este recorte como o menor incremento útil na ordem aprovada. Os RPCs de importação existem, mas não têm chamador de produto; importações continuam explicitamente não comprovadas. A prova de upload/versão e sua integração seguem antes da liberação desses resultados. A reimportação completa permanece na etapa 21, não iniciada. Classificar integridade não ativa execução de cliente nem aprovação ou entrega externa.

## Eval e promoção

Provas SQL sob rollback: raiz capturada; duas contribuições pelo escritor real; fontes não citadas; tenant/trabalho incorretos; mensagem ancestral alterada; comprovante ausente; substituição de pai recusada; raiz histórica e importações; determinismo; 128 nós aceitos e 129 negados sem prova parcial; revogação separada da integridade; nenhum grant de cliente. O contrato entra no conjunto SQL automático da Quality; a suíte de não interferência confere o novo helper. Revisão independente de código favorável; os resultados finais de testes, aplicação e implantação serão registrados, não presumidos.

Controles APP-02/03/04/09/11, DATA-02/03/12. Sem backfill ou DML de cliente. Catálogo/journal e advisors dos dois ambientes precisam conferir antes do fechamento. Reversão de imagem não altera o resultado privado nem enfraquece os gates anteriores. Nenhuma capacidade runtime nova é exigida; web e worker devem ser implantados no commit final mesmo assim. Leitura automática do boot continua indisponível e exige prova direta autenticada até o incremento operacional correspondente.

## Aplicação e verificação

Staging `20260928214244`, produção `20260928214516`, SQL SHA-256 `1ba62d1b1d8cfe262a10a49e54ce71ce5ed4918840c29bf5554699cb50a37aa2`, corpo instalado idêntico. Catálogos 2.808/2.869, journals 412/426, somente uma função nova e zero alterações inesperadas nos objetos anteriores. Produção: 133 revisões preservadas, zero comprovantes artificiais, regra de liberação inalterada. Gate local completo e contrato SQL em staging sob rollback aprovados. Grants de anon/authenticated/service_role negados. A suíte completa de não interferência rodará na CI descartável: execução remota foi recusada pelo auto-review devido a comandos após rollback; não foi contornada. CI, merge e deployments ainda pendentes.
