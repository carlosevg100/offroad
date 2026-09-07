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

`SecurityAssuranceEvidence` vincula claim e escopo ao emissor, trust root, janela de validade,
revogação, referência imutável, hash dos bytes e assinatura Ed25519 destacada.

`SecurityAssuranceTrustRoot` é configuração governada separadamente do claim e da evidência. Define
emissor, chave pública, claims permitidos, validade e revogação. Uma chave apresentada pelo próprio
payload nunca é fonte de confiança.

`SecurityAssuranceMilestone` representa gap assessment, plano de remediação, readiness review,
contratação externa e reteste. Milestone concluído exige evidência resolvida, mas nunca se converte
automaticamente em claim externo.

## Gate

Para renderizar `attested`, todas as condições precisam ser verdadeiras:

1. evidence ref existe e resolve para bytes;
2. hash dos bytes corresponde ao fingerprint assinado;
3. referência imutável resolvida corresponde à referência assinada;
4. assinatura Ed25519 é válida contra uma trust root pré-configurada;
5. emissor e tipo de claim são autorizados pela root;
6. root e evidência estão vigentes e não revogadas;
7. emissão ocorreu dentro da validade da root;
8. claim, scope fingerprint e janela de validade coincidem exatamente com o statement.

Qualquer falha produz blocker tipado e rebaixa a vista para `not_certified` ou
`not_independently_audited`. Não existe fallback para texto positivo.

## Renderer e lint

O renderer aceita apenas o statement original e o receipt imutável produzido pelo gate. Decisão
reconstruída ou statement substituído falham fechados. O inventário atual passa um registro vazio de
trust roots e evidências externas; portanto hoje nenhum claim positivo pode ser emitido.

O scanner de prose é apenas defense in depth. Ele não tenta compreender negação, tempo verbal,
contraste ou verdade. Remove exclusivamente frases produzidas pelos renderers canônicos e manda
qualquer outra menção de alto risco para revisão. Isso inclui frases aparentemente negativas,
futuras ou de milestone escritas manualmente. Essa política elimina a dependência de uma regex que
pretenda funcionar como NLP.

## Evidência de teste

Os testes cobrem atestação válida e as recusas por evidência ausente, bytes ausentes ou alterados,
escopo divergente, validade expirada, evidência revogada, root ausente ou revogada, assinatura
adulterada, decision receipt reconstruído, milestone concluído sem evidência, polaridade mista e
prose positiva arbitrária.

## Limite atual

O controle impede falsa alegação; não cria assurance externo. Onboarding de auditor, custódia da
trust root, ingestão do relatório, política de divulgação e operação contínua pertencem a SEC-03 e
SEC-05 e exigem mudança governada, revisão e evidência real.
