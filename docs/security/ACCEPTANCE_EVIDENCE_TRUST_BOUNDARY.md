# Fronteira de confiança do Acceptance Evidence Index

Versão: 2026.09.07-v2

Status: primeiro slice de CTRL-03 implementado como candidate; nenhuma trust root de collector ou
assessor está cadastrada, nenhuma capability foi promovida e não existe ainda collector, storage
durável, receipt real ou índice contínuo.

## Objetivo

Impedir que um registry, um teste, um operador ou um caller transforme uma declaração própria em
evidência de que uma capability, tarefa, controle ou release passou um gate. O evaluator público
aceita somente o registry e bytes resolvidos. Trust roots, relógio, allowlists e identidade de
autoridade não fazem parte desse request.

Este contrato é distinto do gate de claims externos em
`ASSURANCE_CLAIM_TRUST_BOUNDARY.md`. O gate de assurance controla a linguagem SOC 2, ISO, pentest e
auditoria independente; o Acceptance Evidence Index controla evidência para claims internos de
capability, task, control e release. Os dois usam o mesmo princípio: estado declarado não prova a
si próprio e nenhum texto positivo nasce sem uma decisão do control plane.

## Trust root e relógio

O registro de trust roots, manifests canônicos e receipts vive em
`evidence-registry-control-plane.ts`, fora do export público do package. O registro atual é
deliberadamente vazio. Cada root é single-purpose: fixa trust domain, tenant kind/id/projeto,
environment/deployment/account/região, subject/catálogo/revisão, claim, criterion, tipo de
evidência, collector, gate, namespace do artefato, identidade OIDC, validade, revogação e freshness.

O caminho público lê `Date.now()` internamente. Campos extras como `now`, `trustedRoots`,
`allowedCollectors` ou `verifier` tornam o request inválido. O evaluator interno recebe um snapshot
somente para testes determinísticos e para a futura integração do control plane; ele não é exportado
por `@offroad/release-governance`.

## Envelope assinado

Cada atestação Ed25519 vincula no mesmo payload canônico:

- ID, tipo, collector, emissão e expiração da evidência;
- subject completo, incluindo catálogo e revisão imutável;
- fingerprint da definição completa do claim;
- fingerprint da definição completa do criterion;
- trust domain;
- tenant, tipo de tenant e projeto;
- environment, deployment ID, account e região;
- referência content-addressed e SHA-256 dos bytes;
- gate ID e resultado;
- run ID/attempt, identidade OIDC completa e nonce.

Claim, criterion e limitations aceitos vêm do manifest do control plane. O receipt vincula o
fingerprint do registry inteiro, a atestação, os bytes, o primeiro recebimento, o run e o nonce.
Freshness usa esse instante confiável, e emissão anterior demais ao receipt falha. A decisão válida
ainda exige consumo atômico por compare-and-swap antes de qualquer promoção; replay é rejeitado.

## Estado deste slice

O caminho positivo é exercitado apenas pelo evaluator interno com chave, receipt e storage CAS
sintéticos. O caminho público não encontra manifest, root ou receipt porque o control plane real
está vazio. Isso é deliberado e não deve ser contornado para demonstrar o fluxo.

Ainda não pertencem a este slice:

- onboarding e rotação de chaves reais;
- collector por OIDC/KMS e assinatura de CI/runtime;
- storage privado e retenção de artefatos;
- persistência imutável real de receipts e adapter CAS transacional;
- current registry populado;
- renderer do índice e alertas de expiração/drift;
- integração com Capability Ledger e Endgame Program Board;
- continuous evidence pipeline de SEC-03.

Até essas etapas existirem, CTRL-03 permanece `in_progress` e este código não prova que qualquer
capability esteja testada, live, homologada ou disponível para customer reliance.

## Controles e testes

Controles afetados: `TRUST-GOV-01`, `TRUST-OPS-01`, `TRUST-SDLC-01` e `TRUST-DATA-01`.

Os testes Node 24 cobrem injeção pelo caller, canonicalidade de claim/criterion/limitations,
metadata, todos os componentes de scope, subject, collector, gate, workload identity, tipo,
root futura/expirada/revogada, emissão futura, TTL, max-age, receipt tardio/futuro/consumido,
run/nonce divergentes, replay de nonce, CAS de uso único, fingerprint adulterado, input
cíclico/BigInt e scopes incoerentes. Tudo continua sintético, não evidência operacional.
