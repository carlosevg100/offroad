# Fronteira de confiança do Acceptance Evidence Index

Versão: 2026.09.07-v1

Status: primeiro slice de CTRL-03 implementado como candidate; nenhuma trust root de collector ou
assessor está cadastrada, nenhuma capability foi promovida e não existe ainda collector, storage,
receipt transacional ou índice contínuo.

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

O registro de trust roots vive em `evidence-registry-control-plane.ts`, fora do export público do
package. O registro atual é deliberadamente vazio. Cadastrar uma chave exige mudança de código
revisada; o evaluator não recebe roots do caller. Cada root futura restringirá exatamente trust
domain, tenant, deployment e tipos de evidência permitidos, além de emissor, key ID, validade e
revogação.

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
- gate ID e resultado.

Substituir a frase do claim ou a definição do criterion deixa o fingerprint divergente. Reescrever
o fingerprint invalida a assinatura. Reutilizar a mesma evidência em outro tenant, projeto,
deployment, account, região ou trust domain falha por scope mismatch. Evidência expirada falha pelo
relógio interno mesmo quando o caller tenta enviar uma data retroativa.

## Estado deste slice

O caminho positivo é exercitado apenas pelo evaluator interno com chave efêmera sintética. O
caminho público falha em `attestation_trust_root_missing` porque o control plane real não contém
roots. Isso é deliberado e não deve ser contornado para demonstrar o fluxo.

Ainda não pertencem a este slice:

- onboarding e rotação de chaves reais;
- collector por OIDC/KMS e assinatura de CI/runtime;
- storage privado e retenção de artefatos;
- transaction receipt e compare-and-swap na promoção;
- current registry populado;
- renderer do índice e alertas de expiração/drift;
- integração com Capability Ledger e Endgame Program Board;
- continuous evidence pipeline de SEC-03.

Até essas etapas existirem, CTRL-03 permanece `in_progress` e este código não prova que qualquer
capability esteja testada, live, homologada ou disponível para customer reliance.

## Controles e testes

Controles afetados: `TRUST-GOV-01`, `TRUST-OPS-01`, `TRUST-SDLC-01` e `TRUST-DATA-01`.

Os testes Node 24 cobrem root/verifier/clock injetados pelo caller, claim/criterion/subject
substitution, replay entre tenant/project/deployment/account/region/trust-domain, binding reescrito,
backdating, clock interno inválido, referência de artifact divergente e bytes adulterados. O teste
positivo usa apenas o evaluator interno e uma chave criada durante o próprio teste.
