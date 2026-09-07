# Fronteira de claims externos de segurança

Versão: 2026.09.07-v1

Status: controle interno implementado; nenhuma trust root de auditor externo cadastrada e nenhuma
atestação externa vigente registrada.

## Objetivo

Impedir que texto livre, estado técnico interno ou milestone de programa seja apresentado como
certificação, exame SOC 2, pentest aprovado ou auditoria independente. A verdade nasce de objetos
tipados; o texto é somente uma vista canônica.

## Objetos

`SecurityAssuranceStatement` registra claim, estado, escopo completo, fingerprint do escopo,
referência de evidência, emissão e validade. Estados não atestados são `planned`, `in_progress`,
`not_certified` e `not_independently_audited`. `attested` é reservado à decisão do gate.

`SecurityAssuranceEvidence` vincula claim e escopo ao emissor, `trustRootId`, `keyId`, algoritmo
literal `Ed25519`, janela de validade, revogação, referência imutável, hash dos bytes e assinatura
destacada.

`SecurityAssuranceTrustRoot` vive em registro interno governado e fingerprintado, fora do payload da
avaliação. Define emissor, `keyId`, algoritmo literal `Ed25519`, chave pública, claims permitidos,
validade e revogação. A avaliação confere também que o tipo assimétrico real da chave é `ed25519`;
rotular material Ed448 como Ed25519 falha fechado. O registro atual é deliberadamente vazio. Uma
chave, root ou relógio apresentados pelo caller nunca são fonte de confiança.

`SecurityAssuranceMilestone` representa gap assessment, plano de remediação, readiness review,
contratação externa e reteste. Milestone concluído exige receipt opaco emitido pelo resolver para os
bytes da evidência exata; uma lista de IDs, um objeto reconstruído ou uma referência inventada não
servem. O milestone nunca se converte automaticamente em claim externo.

## Gate

Para renderizar `attested`, todas as condições precisam ser verdadeiras:

1. evidence ref existe e resolve para bytes;
2. hash dos bytes corresponde ao fingerprint assinado;
3. referência imutável resolvida corresponde à referência assinada;
4. assinatura Ed25519 é válida contra uma root do registro interno fingerprintado;
5. `keyId`, algoritmo, tipo assimétrico real, emissor e claim são autorizados pela root;
6. root e evidência estão vigentes e não revogadas;
7. emissão ocorreu dentro da validade da root;
8. claim, scope fingerprint e janela de validade coincidem exatamente com o statement.

Qualquer falha produz blocker tipado e rebaixa a vista para `not_certified` ou
`not_independently_audited`. Não existe fallback para texto positivo.

## Renderer e lint

O renderer aceita apenas o statement original e o objeto de decisão que recebeu receipt interno do
gate. Decisão reconstruída ou statement substituído falham fechados. O fingerprint do registro de
trust roots entra na decisão e no seu fingerprint. O caller não passa o registro nem seu relógio. O
registro interno atual não contém roots nem attestations externas; portanto hoje nenhum claim
positivo pode ser emitido.

O scanner de prose é apenas lint de defense in depth. Ele roda somente nos campos narrativos não
tipados do inventário e manda menções de alto risco para revisão; não tenta compreender negação,
tempo verbal, contraste ou verdade. Saídas de claim e milestone não são autenticadas por texto: são
emitidas apenas pelos renderers a partir dos objetos e receipts correspondentes. Não existe
allowlist de frases fornecida pelo caller, nem subtração textual do output final. Estados futuros e
milestones legítimos seguem a rota tipada em vez de depender da regex como se ela fosse NLP.

## Evidência de teste

Os testes cobrem recusa de root autocriada pelo caller, material Ed448 rotulado Ed25519, evidência
ausente, bytes ausentes ou alterados, escopo divergente, validade expirada, evidência revogada,
decision receipt reconstruído, milestone concluído com ID ou receipt inventado, tentativa de
allowlist textual, polaridade mista e prose positiva arbitrária. O caminho `attested` positivo só
poderá ganhar fixture de sucesso quando uma root externa real for governada no registro.

## Limite atual

O controle impede falsa alegação; não cria assurance externo. Onboarding de auditor, custódia da
trust root, ingestão do relatório, política de divulgação e operação contínua pertencem a SEC-03 e
SEC-05 e exigem mudança governada, revisão e evidência real.
