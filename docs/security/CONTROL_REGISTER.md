# Offroad Trust Control Register

Versão: 2026.09.06-v1

Status: catálogo executável e baseline de inventário do repositório criados; estado live e
evidência de operação ainda não concluídos

Escopo: aplicação, APIs, dados, documentos, provedores de IA, delivery pipeline e operação da Offroad

## Regra de leitura

O registro possui duas camadas que não podem ser confundidas:

1. **24 objetivos mestres `TRUST-*`:** expressam o resultado de controle, o risco, o owner funcional,
   a evidência esperada e os mappings de framework.
2. **124 atividades técnicas e operacionais:** os controles `GOV-*`, `IAM-*`, `DATA-*`, `APP-*`,
   `DOC-*`, `AI-*`, `SDLC-*`, `CLOUD-*`, `OPS-*`, `VEND-*` e `PEO-*` do programa de segurança.

A fonte de verdade executável é
`packages/release-governance/src/trust-control-catalogue.ts`. O detalhe das 124 atividades está na
seção 6 de `ENTERPRISE_SECURITY_COMPLIANCE_READINESS_PLAN.md`. O schema de estado, findings,
evidências e gates está em `packages/release-governance/src/trust-controls.ts`.

Um objetivo definido não é um controle implementado. Um controle implementado não é um controle
operando. Nenhum item abaixo autoriza alegação de certificação, exame, pentest ou conformidade.

## Snapshot do catálogo

| Dimensão | Estado em 06/09/2026 |
| --- | --- |
| Objetivos mestres | 24 |
| Atividades vinculadas | 124 |
| Domínios representados | 11 de 11 |
| Frameworks mínimos representados | SOC 2 TSC, ISO/IEC 27001:2022, NIST CSF 2.0 e LGPD |
| Assurance dos mappings | `internal_working_map`; nenhuma validação externa alegada |
| Objetivos ainda sem referência de implementação | 9, expostos como warning |
| Inventário inicial | `CURRENT_STATE_INVENTORY.md`; fonte tipada e validação fail-closed |
| Estado operacional e evidência corrente | parcialmente observados no repositório; live e período de operação ainda não comprovados |
| Critical/high aberto | não pode ser concluído até inventário e triagem live |

## Objetivos mestres

| ID | Domínio | Objetivo resumido | Aplicabilidade |
| --- | --- | --- | --- |
| TRUST-GOV-01 | governance | governança, escopo, risco, papéis e management review | baseline |
| TRUST-GOV-02 | governance | exceções temporárias e verdade das alegações de assurance | baseline |
| TRUST-ID-01 | identity | identidade privilegiada, least privilege e ciclo de acesso | baseline |
| TRUST-ID-02 | identity | SSO, provisioning e sessões enterprise | enterprise |
| TRUST-DATA-01 | data | isolamento de tenant e non-interference em todo caminho | baseline |
| TRUST-DATA-02 | data | classificação, finalidade, região, retenção, export e deleção | baseline |
| TRUST-DATA-03 | data | criptografia, chaves, secrets e rotação | baseline |
| TRUST-DATA-04 | data | direitos, registros, base legal e transferências | conditional |
| TRUST-APP-01 | application | autorização server-side por organização, projeto, objeto e ação | baseline |
| TRUST-APP-02 | application | resistência a abuso de aplicação, API e recursos | baseline |
| TRUST-DOC-01 | documents | intake, quarentena, tipo, malware e limites de documentos | baseline |
| TRUST-DOC-02 | documents | isolamento de parser e neutralização de conteúdo ativo | baseline |
| TRUST-AI-01 | ai | política de provider, modelo, ferramenta e uso de dados | baseline |
| TRUST-AI-02 | ai | contenção de prompt injection, exfiltração e tool misuse | baseline |
| TRUST-AI-03 | ai | mudança de modelo, evals, fallback, rollback e kill switch | baseline |
| TRUST-SDLC-01 | sdlc | mudança, revisão, release, evidência e reversibilidade | baseline |
| TRUST-SDLC-02 | sdlc | vulnerabilidade e supply chain de software | baseline |
| TRUST-CLOUD-01 | cloud | IAM, configuração, rede e hardening de cloud | baseline |
| TRUST-CLOUD-02 | cloud | separação de ambientes e provenance de deploy | baseline |
| TRUST-OPS-01 | operations | logging seguro, detecção, incidente e forensics | baseline |
| TRUST-OPS-02 | operations | backup, restore, continuidade e recuperação | baseline |
| TRUST-OPS-03 | operations | capacidade, contenção e kill switches granulares | baseline |
| TRUST-VENDOR-01 | vendor | seleção, contrato, monitoramento e saída de terceiros | baseline |
| TRUST-PEOPLE-01 | people | pessoas, confidencialidade, treinamento, endpoint e offboarding | baseline |

## Distribuição das atividades

| Família | Quantidade | Objetivo mestre principal |
| --- | ---: | --- |
| GOV | 11 | TRUST-GOV-01/02 |
| IAM | 12 | TRUST-ID-01/02 |
| DATA | 15 | TRUST-DATA-01/02/03/04 e TRUST-OPS-02 |
| APP | 12 | TRUST-APP-01/02, TRUST-DATA-01 e TRUST-AI-03 |
| DOC | 10 | TRUST-DOC-01/02 e TRUST-AI-02 |
| AI | 12 | TRUST-AI-01/02/03 e TRUST-OPS-03 |
| SDLC | 12 | TRUST-SDLC-01/02 |
| CLOUD | 12 | TRUST-CLOUD-01/02 |
| OPS | 12 | TRUST-OPS-01/02/03 e TRUST-GOV-01 |
| VEND | 8 | TRUST-VENDOR-01 |
| PEO | 8 | TRUST-PEOPLE-01 |

## Próximo gate

O catálogo só se torna baseline verificável quando cada atividade recebe:

- owner nominal e backup owner;
- aplicabilidade e justificativa de exclusão, quando houver;
- estado atual comprovado;
- implementação e procedimento de teste;
- evidência opaca, vigente e separada de conteúdo de cliente;
- findings, prazos e responsáveis;
- relação com ativo, fluxo de dados, fornecedor e risco;
- validação externa dos mappings antes de uso formal em auditoria.

O inventário atual é gerado de
`packages/release-governance/src/current-security-inventory.ts` e validado por
`security-current-state.ts`. Ele impede referência ausente, owner ausente, evidência vencida,
ambiente sem classificação, IDs duplicados e material semelhante a segredo. Seu escopo é o estado
observável no repositório; `unknown` e `partial` são mantidos até a coleta live ou contratual.

Até esse preenchimento, o sistema pode dizer que possui um programa e um catálogo desenhados. Não
pode dizer que todos os controles estão implementados, operando ou audit-ready.
