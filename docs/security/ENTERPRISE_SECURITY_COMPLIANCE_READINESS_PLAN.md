# Programa de Segurança, Privacidade e Readiness Enterprise

Versão: 1.1 · 6 de setembro de 2026
Status: programa canônico subordinado ao `OFFROAD_ENDGAME_EXECUTION_BLUEPRINT.md`
Data-base da última inspeção: 5 de setembro de 2026
Baseline técnico inspecionado: `57f296e`; precisa ser atualizado antes de fechar SEC-001 a SEC-015
Escopo: Offroad web, APIs, banco, storage, worker de documentos, CI/CD, infraestrutura, provedores de IA e operação humana

Este programa começa no Release 0 e bloqueia todos os releases aplicáveis. O Release 7 consolida
integrações enterprise e avaliações externas; ele não inaugura segurança. Em conflito, prevalece a
regra que preserve maior confidencialidade, integridade, disponibilidade, segregação, privacidade
ou evidência, até decisão formal de risco registrada.

## 1. Objetivo

Construir a Offroad desde agora para que possa:

1. passar por uma auditoria SOC 2 Type II no escopo contratado;
2. obter certificação ISO/IEC 27001:2022 para o ISMS da plataforma;
3. cumprir LGPD desde o início e ficar preparada para GDPR e CCPA quando aplicáveis;
4. passar por pentest independente sem achados críticos ou altos em aberto;
5. responder com evidência, e não promessa, à diligência de bancos, gestoras, assessores e companhias;
6. preservar confidencialidade, integridade, disponibilidade e segregação de dados financeiros;
7. governar os riscos específicos de IA, documentos hostis e decisões financeiras assistidas por modelos.

O resultado procurado não é um conjunto de badges. É um sistema de controles que funciona continuamente e deixa evidência suficiente para um terceiro independente verificar.

## 2. O que significa “100% passável”

### 2.1 SOC 2

SOC 2 não possui uma lista universal em que toda empresa recebe uma nota de 100%. A auditoria examina uma descrição de sistema e controles escolhidos contra os Trust Services Criteria.

Meta Offroad de readiness:

- Security: integral;
- Availability: integral;
- Confidentiality: integral;
- Processing Integrity: integral, porque extração, cálculo, conciliação e linhagem são parte material do produto;
- Privacy: controles preparados e mapeados desde o início; inclusão formal na primeira auditoria será decidida com o auditor após o gap assessment jurídico-operacional.

Gate de sucesso: nenhuma exceção material não tratada, população completa de evidências, testes de desenho e operação aprovados e período de observação concluído.

### 2.2 ISO/IEC 27001

A meta não é “implementar cegamente os 93 controles”. É cumprir as cláusulas 4 a 10, realizar avaliação de riscos, produzir a Statement of Applicability e implementar todo controle considerado aplicável, com justificativa verificável para inclusões e exclusões.

Gate de sucesso: auditoria interna concluída, revisão de gestão realizada, não conformidades corrigidas e auditoria externa de certificação aprovada.

### 2.3 Pentest

Gate de sucesso:

- zero achado crítico aberto;
- zero achado alto aberto;
- médios com tratamento, owner e prazo aprovado;
- reteste independente comprovando a correção;
- cobertura de aplicação, API, autenticação, autorização, multi-tenancy, storage, upload/parsers, CI/CD, cloud e superfícies de IA.

### 2.4 Privacidade

Conformidade legal não é certificação. O gate é manter inventário de tratamento, bases legais, contratos, direitos, retenção, transferências, incidentes e evidências operacionais consistentes com LGPD e, quando aplicáveis, GDPR e CCPA.

## 3. Escopo de auditoria proposto

### 3.1 Dentro do escopo

- aplicação web e APIs da Offroad;
- Supabase Auth, Postgres, RLS, Storage e backups;
- Vercel e seu processo de publicação;
- GitHub, branches, Actions, artefatos e supply chain;
- AWS IAM, ECR, ECS Fargate, Secrets Manager e CloudWatch;
- worker de documentos, ClamAV, OCR, LibreOffice e parsers;
- gateway de modelos e provedores OpenAI, Anthropic e Perplexity;
- Firecrawl e demais fontes externas que recebam ou produzam dados;
- Sentry, PostHog, Resend e demais subprocessadores;
- laptops, identidades administrativas e acesso de pessoas;
- desenvolvimento, suporte, incidentes, continuidade e encerramento de clientes;
- dados públicos, privados, pessoais, financeiros e derivados;
- outputs, evidências, premissas, cálculos, versões e trilhas de decisão.

### 3.2 Fora do escopo, salvo mudança do produto

- diligência jurídica final;
- distribuição, bookbuilding, liquidação ou execução de operação financeira;
- infraestrutura interna de clientes;
- informações que permaneçam exclusivamente no ambiente do cliente e nunca sejam acessadas pela Offroad.

### 3.3 Fronteiras que precisam ser congeladas antes da auditoria

- entidade jurídica auditada;
- ambientes production, staging e development;
- regiões onde dados ficam armazenados e processados;
- lista de subprocessadores e fluxos internacionais;
- responsabilidades compartilhadas de Supabase, AWS, Vercel e modelos;
- funções humanas incluídas no ISMS;
- política de uso de dados para treinamento, retenção e suporte.

## 4. Estado atual observado

Legenda:

- `comprovado`: código, configuração ou teste observado;
- `parcial`: existe uma parte, mas não fecha o controle;
- `não comprovado`: não foi encontrada evidência suficiente no repositório;
- `externo`: exige confirmação fora do repositório.

| Domínio | Estado observado | Classificação | Gap principal |
| --- | --- | --- | --- |
| RLS e segregação | testes de não interferência, FORCE RLS, grants mínimos e comandos privados | comprovado/parcial | auditoria live completa, revisão de todas as funções privilegiadas e teste externo de BOLA/IDOR |
| Segurança de código | CodeQL, dependency review, Trivy, SBOM e scans semanais | parcial | 16 alertas CodeQL abertos classificados como altos; CI atual publica alertas, mas não prova que foram triados |
| Dependências | lockfile, Dependabot e dependency review | comprovado/parcial | SLA formal por severidade, inventário de exceções e assinatura/proveniência de artefatos |
| Worker hostil | usuário sem privilégios, ClamAV, contêiner, parser isolado e imagem escaneada | comprovado/parcial | egress enforcement comprovado, root filesystem read-only no task runtime, seccomp/capabilities, limites anti-DoS e pentest de arquivos |
| Secrets | GitHub OIDC para AWS e Secrets Manager no deploy/worker | comprovado/parcial | rotação, inventário, break-glass, teste de exposição e confirmação de que não há credenciais humanas permanentes |
| Autenticação | e-mail confirmado, rotação de refresh token, senha mínima, rate limits locais | parcial | MFA desligado; política enterprise, step-up, session timeout, SSO/SAML e ciclo de vida ainda ausentes |
| Autorização | vínculo por organização/projeto e RLS | comprovado/parcial | RBAC empresarial explícito, least privilege por função, recertificação periódica e acesso de suporte |
| Deploy | branch protegida, checks obrigatórios e deploy AWS por OIDC | comprovado/parcial | zero aprovação humana obrigatória, commits não assinados, status checks não estritos e segregação formal de funções |
| Headers web | HSTS da Vercel, nosniff, deny frame, referrer e permissions policy | parcial | CSP efetiva, relatório de violações, política de cookies e testes automáticos de headers |
| Telemetria | scrub de PII, allowlist de tags, replay/autocapture limitado | comprovado/parcial | DPA, retenção, acesso, exclusão, teste DLP e revisão de todas as superfícies de logs |
| Política de modelos | gateway, fail-closed previsto, `store:false` e classes/finalidades | parcial | DPA/ZDR/assurance vigente por provedor e enforcement ativo em staging/produção |
| Backup e recuperação | capacidades gerenciadas presumidas pelos provedores | não comprovado | política, RPO/RTO, export seguro, restore drill e evidência periódica |
| Continuidade | nenhum programa completo encontrado | não comprovado | BCP, DR, dependências críticas, runbooks, tabletop e teste técnico |
| Incidentes | erros operacionais e observabilidade existem | parcial | plano formal de incidente de segurança, severidade, contatos, preservação de evidência e exercícios |
| Gestão de fornecedores | riscos de providers aparecem no risk register | parcial | cadastro, tiering, due diligence, DPA, renovação, subprocessor notice e exit plan |
| Privacidade | minimização de telemetria e alguns controles técnicos | parcial | RoPA, bases legais, notices, direitos, retenção, RIPD/DPIA e transferências internacionais |
| Segurança organizacional | risk register técnico existente | parcial | ISMS, políticas aprovadas, owners, treinamento, onboarding/offboarding e auditoria interna |
| Segurança física/endpoints | não encontrada | não comprovado | inventário de endpoints, criptografia, MDM, patching, EDR, tela/bloqueio e descarte seguro |
| Pentest | não encontrado | não comprovado | escopo, fornecedor independente, execução, correção e reteste |
| Segurança de IA | prompt injection e proveniência reconhecidos no risk register | parcial | threat model específico, adversariais contínuos, exfiltração, tool authorization e red team independente |

### 4.1 Constatações imediatas que impedem readiness

1. Alertas CodeQL altos abertos não foram todos corrigidos ou encerrados com justificativa formal.
2. MFA/TOTP está desabilitado no arquivo de configuração e não há política de step-up homologada.
3. Não há pacote completo de políticas e registros exigidos por um ISMS.
4. Não há restore drill, BCP/DR testado ou RTO/RPO aprovado.
5. Não há pentest independente.
6. Não há inventário contratual comprovado de DPA, ZDR, retenção e transferências de cada provedor.
7. Não há ciclo documentado de joiner, mover e leaver, nem recertificação de acessos.
8. O repositório é público; isso não é necessariamente um problema, mas exige análise formal de exposição, segregação absoluta de secrets e revisão de artefatos gerados.
9. A proteção de `main` não exige aprovação de outro revisor e não exige assinatura de commit.
10. O CLI Supabase observado está em `2.75.0`, abaixo da versão disponível `2.116.0`; upgrades precisam seguir processo controlado e teste de regressão.
11. A CSP não foi observada nos headers de produção.
12. Configurações live de AWS, Supabase, Vercel e SaaS não foram integralmente verificadas nesta baseline e devem ser coletadas por APIs read-only.

## 5. Arquitetura do programa de controles

Um único registro de controles deve mapear cada controle Offroad para:

- SOC 2 Trust Services Criteria;
- ISO/IEC 27001 cláusulas e Annex A;
- NIST CSF 2.0;
- LGPD/GDPR/CCPA quando aplicável;
- exigências contratuais de clientes regulados;
- risco do `RISK_REGISTER.md`;
- implementação técnica;
- procedimento humano;
- evidência e sua localização;
- owner e backup owner;
- frequência;
- ambiente;
- status e exceção;
- teste automático ou manual;
- última e próxima execução.

Estados permitidos:

```text
not_designed -> designed -> implemented -> operating -> evidenced -> independently_tested
                                      \-> exception_open -> remediated -> retested
```

Nenhum controle pode ser chamado de `operating` apenas porque existe código.

O registro agora possui uma primeira forma executável em duas camadas:

- 24 objetivos mestres `TRUST-*`, com risco, owner funcional, evidência esperada e mappings;
- 124 atividades abaixo, preservando os IDs detalhados desta seção e vinculadas aos objetivos.

`docs/security/CONTROL_REGISTER.md` é a vista humana. A fonte executável está em
`packages/release-governance/src/trust-control-catalogue.ts`; o gate está em
`packages/release-governance/src/control-register.ts`. Todos os mappings continuam marcados como
`internal_working_map` até validação por assessor/auditor. Estado atual, owner nominal e população
de evidência ainda precisam ser preenchidos; portanto SEC-001 permanece em execução.

## 6. Catálogo técnico e operacional de controles

### GOV - Governança e ISMS

| ID | Controle alvo | Implementação e evidência mínima |
| --- | --- | --- |
| GOV-01 | Escopo do ISMS | documento de escopo, fronteiras, ambientes, pessoas, fornecedores e exclusões aprovado |
| GOV-02 | Política de segurança | política versionada, aprovação executiva anual, aceite pelos colaboradores |
| GOV-03 | Metodologia de risco | escala, apetite, critérios de aceite, tratamento e revisão trimestral |
| GOV-04 | Registro de riscos | owner, impacto, probabilidade, controles, plano, vencimento e risco residual |
| GOV-05 | Statement of Applicability | cada controle ISO aplicável ou excluído, justificativa, owner e evidência |
| GOV-06 | Papéis e segregação | RACI de segurança, privacidade, engenharia, incidentes e continuidade |
| GOV-07 | Exceções | aprovação temporária, compensating control, validade e revisão |
| GOV-08 | Objetivos e métricas | KPIs/KRIs, tolerâncias, tendência e revisão mensal |
| GOV-09 | Auditoria interna | plano anual, independência, findings e follow-up |
| GOV-10 | Management review | ata com riscos, incidentes, métricas, mudanças e decisões |
| GOV-11 | Melhoria contínua | CAPA para incidentes, auditorias, pentests e falhas de controle |

### IAM - Identidade, autenticação e autorização

| ID | Controle alvo | Implementação e teste |
| --- | --- | --- |
| IAM-01 | MFA administrativo obrigatório | MFA phishing-resistant quando disponível; TOTP mínimo; teste de bypass negativo |
| IAM-02 | MFA enterprise configurável | política por organização e step-up para download, exportação, convite, role change e ações externas |
| IAM-03 | SSO SAML/OIDC | domain verification, IdP-initiated e SP-initiated, fallback protegido e logs |
| IAM-04 | SCIM/JIT | criação, alteração, suspensão e remoção automatizadas; teste de deprovisioning |
| IAM-05 | RBAC | owner, admin, member, viewer e funções de suporte com matriz deny-by-default |
| IAM-06 | Recertificação | revisão trimestral de acessos internos e semestral por admin do cliente |
| IAM-07 | Joiner/mover/leaver | tickets e evidência; desligamento revoga sessões, tokens e grupos no SLA |
| IAM-08 | Sessões | timeout, idle timeout, rotação, device/session view e revogação |
| IAM-09 | Acesso privilegiado | contas nominativas, temporárias, aprovadas, registradas e sem compartilhamento |
| IAM-10 | Break-glass | duas contas protegidas, uso alertado, teste trimestral e credenciais seladas |
| IAM-11 | Suporte | acesso just-in-time, escopo por tenant, motivo, expiração e visibilidade ao cliente |
| IAM-12 | Service identities | workload identity, rotação, least privilege e proibição de service-role no cliente |

### DATA - Dados, privacidade e criptografia

| ID | Controle alvo | Implementação e teste |
| --- | --- | --- |
| DATA-01 | Classificação | public, internal, confidential, restricted; rótulo em documento, chunk, artifact, log e chamada de modelo |
| DATA-02 | Inventário/linhagem | mapa de coleta, storage, processamento, saída, compartilhamento, retenção e exclusão |
| DATA-03 | Tenant isolation | organização/projeto em todas as chaves; RLS/FORCE RLS; teste cross-tenant por CRUD, RPC, view, storage e retrieval |
| DATA-04 | Criptografia em trânsito | TLS moderno, validação de certificado, HSTS e bloqueio de downgrade |
| DATA-05 | Criptografia em repouso | provedor, algoritmo, key ownership, rotação e evidência por sistema |
| DATA-06 | Chaves | KMS/Vault/Secrets Manager, separação de ambiente, rotação e audit trail |
| DATA-07 | Retenção | política por classe e contrato; jobs de expiração testados e legal hold separado |
| DATA-08 | Exclusão | account/org/project deletion com fila, confirmação, tombstone, propagação e certificado de conclusão |
| DATA-09 | Exportação | export autorizado, íntegro, criptografado, auditado e com expiração |
| DATA-10 | Backup | escopo, frequência, criptografia, imutabilidade quando viável e monitoramento de falha |
| DATA-11 | Restauração | restore isolado, validação de integridade, RPO/RTO medidos e relatório trimestral |
| DATA-12 | DLP/logging | proibição de conteúdo financeiro/PII em logs; testes canário e scans de amostra |
| DATA-13 | Produção fora de não-produção | dados reais proibidos em dev/test; fixtures sintéticas; exceção formal e mascaramento |
| DATA-14 | Residência e transferência | país/região por sistema; mecanismo LGPD/GDPR; divulgação ao cliente |
| DATA-15 | Direitos do titular | acesso, correção, eliminação, oposição e portabilidade com autenticação e SLA |

### APP - Aplicação, API, banco e storage

| ID | Controle alvo | Implementação e teste |
| --- | --- | --- |
| APP-01 | Threat model | ativos, trust boundaries, STRIDE/abuse cases, multi-tenant, uploads, LLM e efeitos externos |
| APP-02 | Autorização server-side | nenhuma decisão baseada em metadata editável; object/function-level authorization em toda rota |
| APP-03 | RLS current-state | teste no banco real, views `security_invoker`, funções privilegiadas privadas, EXECUTE revogado de PUBLIC |
| APP-04 | Validação de entrada | schemas, limites de tamanho/quantidade, canonicalização e rejeição segura |
| APP-05 | Saída e browser | escaping contextual, CSP com nonces/hashes, Trusted Types se aplicável e sem HTML arbitrário |
| APP-06 | CSRF/CORS/redirect | allowlists exatas, SameSite adequado, origin validation e testes de open redirect |
| APP-07 | Rate limiting | login, OTP, upload, chat, export, research, model calls e RPCs por IP/user/org |
| APP-08 | Storage | bucket privado, signed URL curta, ownership, MIME + magic bytes, path isolation e no overwrite indevido |
| APP-09 | Funções privilegiadas | inventário de `SECURITY DEFINER`, owner mínimo, `search_path` fixo, auth check e teste de abuso |
| APP-10 | Denial of service | quotas, timeouts, concurrency, decompression bomb, regex worst-case, page/row/cell limits |
| APP-11 | Imutabilidade/linhagem | manifests, hashes, versionamento e invalidation graph testados contra adulteração |
| APP-12 | Admin plane | separado da superfície tenant, MFA/step-up e logs invioláveis |

### DOC - Upload e processamento de documentos hostis

| ID | Controle alvo | Implementação e teste |
| --- | --- | --- |
| DOC-01 | Quarentena | upload entra inacessível ao parser até hash, tamanho, tipo e malware passarem |
| DOC-02 | Detecção de tipo | magic bytes e estrutura real, nunca apenas extensão ou MIME do cliente |
| DOC-03 | Malware | ClamAV fail-closed, assinatura atual, health check e alerta de update vencido |
| DOC-04 | Sandbox | processo sem root, rootfs read-only, capabilities removidas, tmp efêmero e limites de recursos |
| DOC-05 | Egress | deny-by-default; somente endpoints explicitamente necessários; evidência de security group/network policy |
| DOC-06 | Parser hardening | versões pinadas, timeout, memória, recursion, archive depth e crash isolation |
| DOC-07 | Conteúdo ativo | macros, JavaScript, links, arquivos embutidos e fórmulas externas neutralizados |
| DOC-08 | Prompt injection | documento tratado como dado; instruções internas nunca alteram política, tool access ou destinatários |
| DOC-09 | Proveniência | hash original, parser/version, transformações, páginas/abas e trecho citável |
| DOC-10 | Adversariais | corpus com zip bombs, PDFs malformados, polyglots, macros, fórmulas, prompt injection e Unicode malicioso |

### AI - Segurança e governança de IA

| ID | Controle alvo | Implementação e teste |
| --- | --- | --- |
| AI-01 | Registro de sistemas de IA | modelo, versão, finalidade, owner, dados permitidos, região, retenção e risco |
| AI-02 | Provider assurance | DPA, treinamento, retenção/ZDR, subprocessadores, validade e finalidade por chamada |
| AI-03 | Routing fail-closed | fallback nunca recebe classe mais sensível nem política mais permissiva |
| AI-04 | Tool authorization | modelo propõe; control plane autoriza; efeitos externos exigem escopo e confirmação exatos |
| AI-05 | Prompt/data separation | system policy imutável, fontes delimitadas, provenance e precedence formal |
| AI-06 | Exfiltração | testes com dados canário, cross-tenant retrieval, indirect injection e malicious tool output |
| AI-07 | Model logging | sem prompt/documento bruto; IDs, versão, custo, latência, policy decision e trace seguro |
| AI-08 | Output integrity | claims materiais com evidência; cálculos críticos determinísticos; cobertura e incerteza explícitas |
| AI-09 | Human oversight | níveis de autonomia, ações proibidas, revisão quando material e registro de override |
| AI-10 | Mudança de modelo | evals, regressão, shadow, aprovação e rollback antes de trocar versão/provider |
| AI-11 | Abuse monitoring | padrões de extração, enumeração, jailbreak, flooding e tentativa de acesso indevido |
| AI-12 | Kill switch | revogação por provider, ferramenta, tipo de tarefa, tenant e sistema inteiro testada |

### SDLC - Engenharia e supply chain

| ID | Controle alvo | Implementação e teste |
| --- | --- | --- |
| SDLC-01 | Branch protection | PR obrigatório, checks strict, aprovação independente, stale dismissal e code owners sensíveis |
| SDLC-02 | Assinatura/proveniência | commits/tags de release assinados ou attestations verificáveis; imagem por digest |
| SDLC-03 | SAST | CodeQL bloqueia novo high/critical; backlog atual triado com justificativa revisável |
| SDLC-04 | SCA | dependency review, Dependabot, SBOM, SLA e exceções com vencimento |
| SDLC-05 | Secret scanning | push protection, scan histórico e atual, canary e playbook de rotação |
| SDLC-06 | Container/IaC | scan de imagem e configuração; base mínima; assinatura; ECR scan contínuo |
| SDLC-07 | Segurança de testes | testes não usam secrets de produção nem dados reais; artefatos têm retenção e acesso mínimos |
| SDLC-08 | Revisão de migrations | RLS, grants, views, functions, search path e rollback verificados local e staging |
| SDLC-09 | Ambientes | contas/projetos separados; promoção controlada; nenhuma escrita de teste em produção |
| SDLC-10 | Releases | versionamento, change ticket, aprovador, evidência, rollback e post-deploy verification |
| SDLC-11 | Vulnerability SLA | critical 24h, high 7d, medium 30d, low 90d, com exceção baseada em risco |
| SDLC-12 | Secure coding | treinamento anual e padrões para auth, RLS, arquivos, regex, URLs, SSRF e LLM tools |

### CLOUD - Infraestrutura e configuração

| ID | Controle alvo | Implementação e teste |
| --- | --- | --- |
| CLOUD-01 | Inventário cloud | contas, projetos, recursos, região, owner, criticidade e tags |
| CLOUD-02 | Conta raiz AWS | MFA forte, sem access key, uso monitorado e credencial protegida |
| CLOUD-03 | IAM AWS | roles por workload, OIDC, permission boundaries e Access Analyzer |
| CLOUD-04 | Detecção AWS | CloudTrail, log validation, GuardDuty, Security Hub/Config conforme escopo e alertas |
| CLOUD-05 | Rede ECS | subnets, SG mínimo, sem inbound, egress controlado e VPC endpoints quando cabível |
| CLOUD-06 | ECS hardening | read-only rootfs, non-root, no privileged, dropped capabilities, exec desabilitado/controlado |
| CLOUD-07 | ECR | scan-on-push/continuous, imutabilidade de tag, lifecycle e deploy por digest |
| CLOUD-08 | Secrets Manager | rotação, resource policies, acesso por task role e alarme de leitura anômala |
| CLOUD-09 | Supabase | network restrictions, PITR/backups, SSL enforcement, advisors, Auth e audit logs |
| CLOUD-10 | Vercel | MFA/SSO, membros mínimos, deploy protection, logs, env separation e DPA |
| CLOUD-11 | DNS/TLS | registrar protegido, MFA, DNS changes auditados, certificados e renovação monitorados |
| CLOUD-12 | Config drift | snapshot periódico de configurações live comparado ao baseline aprovado |

### OPS - Observabilidade, incidentes e continuidade

| ID | Controle alvo | Implementação e evidência |
| --- | --- | --- |
| OPS-01 | Logs de segurança | auth, admin, policy denial, data export/delete, provider routing e access changes centralizados |
| OPS-02 | Alertas | cobertura, severidade, on-call, teste e ausência de alert fatigue |
| OPS-03 | Incident response | prepare, detect, contain, eradicate, recover, notify e postmortem |
| OPS-04 | Classificação | Sev 0–3, gatilhos de privacidade, cliente, regulador e jurídico |
| OPS-05 | Tabletop | cenário cross-tenant, credential theft, ransomware/provider outage e model exfiltration |
| OPS-06 | Forensics | relógios, retenção, integridade, chain of custody e acesso restrito |
| OPS-07 | BCP | processos críticos, pessoas, fornecedores, workarounds e comunicação |
| OPS-08 | DR | arquitetura de recuperação, dependências, runbook, RPO/RTO e teste |
| OPS-09 | Resilience | timeout, retry bounded, circuit breaker, queue recovery e idempotência |
| OPS-10 | Capacity | limites, orçamento, storage, database connections, model quotas e alertas |
| OPS-11 | Status/comunicação | templates internos e externos, single source e aprovação |
| OPS-12 | Postmortem | sem culpa, causa, impacto, timeline, ação, owner e validação de eficácia |

### VEND - Terceiros e subprocessadores

| ID | Controle alvo | Implementação e evidência |
| --- | --- | --- |
| VEND-01 | Inventário | serviço, dado, finalidade, região, criticidade, owner, contrato e renovação |
| VEND-02 | Tiering | critical/high/medium/low por acesso, substituibilidade e impacto |
| VEND-03 | Due diligence | SOC/ISO, pentest, privacy, incidents, BCP, financial health e subprocessor chain |
| VEND-04 | Contrato | DPA, confidencialidade, segurança, incident SLA, audit rights, deletion e exit assistance |
| VEND-05 | Monitoramento | revisão anual ou por mudança/incidente; assurance não pode vencer silenciosamente |
| VEND-06 | Mudança | novo subprocessor, nova região ou nova retenção exige risk review antes da ativação |
| VEND-07 | Concentração | falha combinada de Supabase/AWS/Vercel/modelos e alternativas realistas |
| VEND-08 | Saída | export, migração, revogação, eliminação e comprovação de término |

### PEOPLE/PHYS - Pessoas, endpoints e físico

| ID | Controle alvo | Implementação e evidência |
| --- | --- | --- |
| PEO-01 | Termos | confidencialidade, propriedade intelectual, segurança e privacidade assinadas |
| PEO-02 | Verificação | background screening proporcional, onde legal e necessário |
| PEO-03 | Treinamento | onboarding e anual; phishing, dados financeiros, incidentes e IA |
| PEO-04 | Endpoint | inventário, criptografia, MDM, patching, EDR, screen lock e remote wipe |
| PEO-05 | Trabalho remoto | rede, privacidade visual, impressão, armazenamento local e viagem |
| PEO-06 | Offboarding | devolução, wipe, revogação e confirmação pelo owner |
| PEO-07 | Mídia | proibição/controle de mídia removível e descarte seguro |
| PEO-08 | Escritório/provedores | herdar e documentar controles físicos de cloud; proteger qualquer local próprio |

## 7. Plano de pentest e security assessment

### 7.1 Preparação interna

Antes de contratar o pentest:

1. resolver ou classificar todos os alertas SAST atuais;
2. congelar escopo e arquitetura;
3. entregar contas de teste em pelo menos três tenants independentes;
4. fornecer documentação de rotas, roles, RLS, uploads e integrações;
5. habilitar ambiente de staging equivalente sem dados reais;
6. configurar contatos e regras de engajamento;
7. preparar logging para detectar o teste sem bloquear indevidamente;
8. fazer varredura interna de baseline e corrigir o óbvio.

### 7.2 Escopo obrigatório

- unauthenticated e authenticated web/API;
- signup, confirmação, recovery, MFA, sessões e convite;
- horizontal e vertical privilege escalation;
- BOLA/IDOR por organização, projeto, documento, artifact, chat, job e RPC;
- RLS bypass, views, functions e signed URLs;
- upload, MIME confusion, polyglot, macro, archive bomb, parser exploitation e malware bypass;
- SSRF em pesquisa, crawler, URLs, redirects e parsers;
- injection: SQL, command, template, CSV/formula, XSS e header;
- CSRF, CORS, clickjacking, open redirect e cache poisoning;
- race condition e idempotency abuse;
- rate limits, resource exhaustion e regex DoS;
- secrets, source maps, logs, errors e metadata leakage;
- cloud IAM, ECS, ECR, Secrets Manager, Vercel e Supabase configuration review;
- CI/CD e dependency confusion;
- prompt injection direta/indireta, data exfiltration, cross-tenant retrieval, tool misuse e fallback policy downgrade.

### 7.3 Método e entregáveis

- OWASP ASVS nível 2 como baseline da aplicação;
- OWASP API Security Top 10 para APIs;
- OWASP Top 10 for LLM Applications para IA;
- revisão manual além de scanners;
- relatório executivo e técnico;
- evidência reproduzível sem expor dados reais;
- severidade CVSS mais contexto de negócio;
- plano de correção;
- reteste formal;
- carta de atestação compartilhável sob NDA.

## 8. Backlog por fase

### Fase S0 - Contenção imediata e baseline verificável (0-30 dias)

Gate: nenhum risco crítico conhecido sem owner; nenhum high de código sem triagem; inventário inicial completo.

- [ ] SEC-001 concluir o registro mestre de controles com mappings SOC/ISO/NIST/LGPD; catálogo
  executável com 24 objetivos e 124 atividades criado, faltando owner nominal, current state,
  evidência e validação externa dos mappings;
- [ ] SEC-002 criar charter do ISMS, escopo, RACI e política de exceções;
- [ ] SEC-003 triagem linha a linha dos 16 alertas CodeQL abertos;
- [ ] SEC-004 corrigir achados reais e documentar falsos positivos com aprovação;
- [ ] SEC-005 fazer novo high/critical bloquear PR;
- [ ] SEC-006 ativar secret scanning push protection e validar histórico;
- [x] SEC-007 criar baseline inicial de ambientes, ativos, dados, identidades e fornecedores a
  partir do repositório; `CURRENT_STATE_INVENTORY.md` e sua fonte tipada registram 6 ambientes,
  8 sistemas, 7 classes de dados, 8 stores, 25 fluxos, 11 identidades, 17 vendors, 8 claims
  canônicos e 18 gaps obrigatórios. O gate confiável confirma o remote autorizado, resolve o commit
  real contido em `origin/main`, resolve cada referência nesse objeto Git e vincula observações
  locais a bytes, SHA-256 e metadados de origem e autoridade allowlisted. O status dos claims é
  derivado; remover ou reclassificar coverage/gaps falha fechado. A completude live continua aberta
  em SEC-008 e não é inferida desta baseline. Claims externos de SOC 2, ISO, pentest e auditoria
  agora usam objetos, escopo, evidência assinada, validade, revogação e trust root separados; sem
  esses elementos o renderer emite somente estado não certificado/não atestado. Milestones também
  são tipados e nunca promovem um claim automaticamente. A fronteira está documentada em
  `ASSURANCE_CLAIM_TRUST_BOUNDARY.md`;
- [ ] SEC-008 coletar configuração live read-only de AWS, Supabase, Vercel, GitHub, Sentry e PostHog;
- [ ] SEC-009 fechar DPA/ZDR/retention/region de OpenAI, Anthropic, Perplexity e Firecrawl;
- [ ] SEC-010 ativar enforcement fail-closed de provider policy primeiro em staging;
- [ ] SEC-011 definir classificação dos dados e vincular ao gateway/model calls;
- [ ] SEC-012 publicar política interna de segurança, acesso, incidentes e uso aceitável;
- [ ] SEC-013 definir SLA de vulnerabilidades e processo de exceção;
- [ ] SEC-014 atualizar Supabase CLI em PR controlado e validar migrations/tests;
- [ ] SEC-015 criar threat model v1, incluindo IA e documentos hostis.

### Fase S1 - Identidade, tenant e proteção da aplicação (15-60 dias)

Gate: MFA para privilegiados, autorização empresarial, RLS live e abuso cross-tenant aprovados.

- [ ] SEC-101 habilitar TOTP/WebAuthn suportado e exigir AAL2 para administradores;
- [ ] SEC-102 implementar step-up nas ações sensíveis;
- [ ] SEC-103 implementar session inventory, revocation e timeouts;
- [ ] SEC-104 criar RBAC canônico e testes por permissão;
- [ ] SEC-105 criar suporte JIT com expiração e tenant-visible audit;
- [ ] SEC-106 revisar todas as views e funções privilegiadas no schema atual;
- [ ] SEC-107 rodar RLS/advisors contra produção e staging em modo read-only/test-safe;
- [ ] SEC-108 expandir non-interference para Storage, RPC, retrieval, exports e artifacts;
- [ ] SEC-109 implementar CSP inicialmente em report-only, corrigir e promover para enforce;
- [ ] SEC-110 implementar rate limit por usuário/org e quotas de workload;
- [ ] SEC-111 endurecer URLs, redirects, SSRF e downloads;
- [ ] SEC-112 criar SSO SAML/OIDC enterprise e domínio verificado;
- [ ] SEC-113 implementar SCIM/JIT ou contrato claro de provisioning manual inicial.

### Fase S2 - Dados, privacidade e ciclo de vida (30-90 dias)

Gate: todo dado tem classe, finalidade, retenção, região, owner e caminho de exclusão testado.

- [ ] SEC-201 produzir RoPA e mapa de fluxo de dados;
- [ ] SEC-202 definir controlador/operador por fluxo e template de DPA;
- [ ] SEC-203 implementar registro e notice de subprocessadores;
- [ ] SEC-204 criar política de retenção por objeto e tenant override contratual;
- [ ] SEC-205 implementar delete/export de usuário, projeto e organização;
- [ ] SEC-206 executar teste de propagação de exclusão por todos os subprocessadores;
- [ ] SEC-207 implantar DLP/testes canário em logs, traces e analytics;
- [ ] SEC-208 documentar transferências internacionais LGPD e, quando aplicável, GDPR;
- [ ] SEC-209 criar processo de direitos do titular e simular uma solicitação;
- [ ] SEC-210 realizar RIPD/DPIA dos fluxos de maior risco;
- [ ] SEC-211 criar privacy notice e política de cookies coerentes com telemetria real;
- [ ] SEC-212 testar que dados de produção nunca entram em dev/test.

### Fase S3 - Cloud, operação, incidentes e resiliência (45-120 dias)

Gate: observabilidade de segurança ativa, restore aprovado e tabletop concluído.

- [ ] SEC-301 hardening de AWS root/IAM/CloudTrail/GuardDuty/Security Hub/Config conforme gap live;
- [ ] SEC-302 hardening de ECS/ECR por digest, imagem imutável, rootfs read-only e egress;
- [ ] SEC-303 hardening do Supabase: network restrictions, backups/PITR, Auth e advisors;
- [ ] SEC-304 hardening de Vercel, registrar/DNS e contas SaaS;
- [ ] SEC-305 centralizar eventos de segurança e alertas com runbooks;
- [ ] SEC-306 definir RPO/RTO por componente e aprovar impacto;
- [ ] SEC-307 executar restore drill de Postgres e Storage em ambiente isolado;
- [ ] SEC-308 testar reconstrução do worker e web a partir de código/infra documentada;
- [ ] SEC-309 criar BCP/DR e mapa de dependências críticas;
- [ ] SEC-310 realizar tabletop cross-tenant/data breach;
- [ ] SEC-311 realizar tabletop outage de Supabase/model provider;
- [ ] SEC-312 executar kill switch de provider, ferramenta e tenant;
- [ ] SEC-313 provar rotação de um secret sem indisponibilidade material.

### Fase S4 - Secure SDLC e evidência contínua (60-150 dias)

Gate: cada controle material produz evidência automaticamente ou por procedimento calendarizado.

- [ ] SEC-401 checks de segurança estritos e backlog zero de critical/high;
- [ ] SEC-402 aprovação independente e CODEOWNERS para auth, migrations, gateway e deploy;
- [ ] SEC-403 provenance/assinatura de releases e imagens;
- [ ] SEC-404 inventário SBOM por release e política de CVE;
- [ ] SEC-405 quarterly access review com evidência;
- [ ] SEC-406 monthly vulnerability review;
- [ ] SEC-407 annual secure development and privacy training;
- [ ] SEC-408 change management ligado a PR, CI, deploy e rollback;
- [ ] SEC-409 portal de evidências/readiness dashboard;
- [ ] SEC-410 auditoria interna do sistema de controles;
- [ ] SEC-411 management review com ações e owners;
- [ ] SEC-412 monitoramento de drift de configuração live.

### Fase S5 - Assessment e pentest independentes (90-180 dias)

Gate: readiness externo aprovado; pentest sem critical/high após reteste.

- [ ] SEC-501 selecionar firma de pentest com experiência em SaaS multi-tenant e IA;
- [ ] SEC-502 executar pentest completo e cloud configuration review;
- [ ] SEC-503 corrigir findings e fazer reteste;
- [ ] SEC-504 contratar SOC 2 readiness assessment;
- [ ] SEC-505 contratar ISO 27001 gap assessment;
- [ ] SEC-506 corrigir gaps de desenho antes de iniciar período de observação;
- [ ] SEC-507 fechar auditoria interna ISO e management review;
- [ ] SEC-508 congelar system description, scope e control population.

### Fase S6 - Auditorias formais (após controles operarem)

Gate final: relatórios/certificação emitidos sem ressalva material.

- [ ] SEC-601 iniciar período de observação SOC 2 Type II;
- [ ] SEC-602 acompanhar amostras e exceções mensalmente;
- [ ] SEC-603 realizar auditoria ISO 27001 Stage 1;
- [ ] SEC-604 corrigir readiness/document gaps do Stage 1;
- [ ] SEC-605 realizar ISO 27001 Stage 2;
- [ ] SEC-606 concluir exame SOC 2 Type II;
- [ ] SEC-607 preparar resposta comercial e distribuição controlada dos relatórios;
- [ ] SEC-608 manter surveillance, recertificação, pentest e SOC anual.

## 9. Evidências mínimas por cadência

### Contínuas ou por evento

- PR, reviewer, checks, build e deploy;
- logs de autenticação e mudança de permissão;
- bloqueios de provider policy;
- scans de código, dependência, secret e imagem;
- incidentes e alerts;
- criação, acesso, exportação e exclusão de dados;
- mudanças de subprocessador, região ou modelo;
- backup success/failure.

### Mensais

- vulnerabilidades e SLA;
- uptime/SLO e capacidade;
- access anomalies;
- fornecedor assurance vencendo;
- exceções e riscos vencidos;
- restore/backup monitoring;
- security metrics.

### Trimestrais

- recertificação de acessos privilegiados;
- restore drill alternado;
- tabletop ou technical control exercise;
- risk register review;
- evidence sampling;
- vendor critical review.

### Anuais

- políticas e treinamento;
- auditoria interna;
- management review;
- pentest independente;
- BCP/DR completo;
- revisão de escopo, SoA e risk methodology;
- SOC 2 e manutenção ISO conforme calendário.

## 10. Artefatos que precisam existir

```text
docs/security/
  00_ISMS_CHARTER.md
  01_SCOPE_AND_BOUNDARIES.md
  02_CONTROL_REGISTER.csv
  03_STATEMENT_OF_APPLICABILITY.md
  04_RISK_METHODOLOGY.md
  05_RISK_REGISTER.md
  06_ASSET_AND_DATA_INVENTORY.csv
  07_VENDOR_REGISTER.csv
  08_DATA_FLOW_AND_SUBPROCESSORS.md
  09_PRIVACY_ROPA.csv
  10_ACCESS_CONTROL_POLICY.md
  11_SECURE_DEVELOPMENT_POLICY.md
  12_VULNERABILITY_MANAGEMENT_POLICY.md
  13_INCIDENT_RESPONSE_PLAN.md
  14_BCP_DR_PLAN.md
  15_RETENTION_AND_DELETION_POLICY.md
  16_AI_GOVERNANCE_POLICY.md
  17_PENTEST_SCOPE_AND_ROE.md
  runbooks/
  evidence-index/
  audits/
```

Políticas públicas e internas devem ser separadas. Evidência contendo arquitetura sensível, findings ou dados de cliente nunca deve ficar no repositório público.

## 11. Dependências externas

| Trabalho | Pode ser feito internamente | Terceiro necessário |
| --- | --- | --- |
| Implementar controles técnicos | sim | não, salvo especialidade pontual |
| Criar ISMS e evidências | sim | consultoria opcional |
| Opinar sobre conformidade jurídica | não integralmente | advogado de privacidade/regulatório |
| Pentest independente | não | empresa independente |
| SOC 2 Type II | não | firma de CPA/auditor habilitado |
| ISO 27001 | não | organismo certificador acreditado |
| Automação de evidência | sim | plataforma GRC opcional |
| SSO/SCIM | sim | IdP/broker opcional conforme estratégia |

## 12. Decisões executivas necessárias

Estas decisões não impedem começar S0, mas precisam ser encerradas antes do scope freeze:

1. entidade jurídica que assinará contratos e será auditada;
2. mercados prioritários nos próximos 12 meses: Brasil, EUA, UE;
3. primeiro ICP enterprise: banco, gestora, assessor ou companhia;
4. categorias formais da primeira auditoria SOC 2;
5. compromisso comercial de disponibilidade e RPO/RTO;
6. política de residência e transferência de dados;
7. uso permitido de dados por modelos e subprocessadores;
8. prazo padrão de retenção e opções enterprise;
9. modelo de suporte e possibilidade de acesso humano a tenant;
10. orçamento para jurídico, pentest, auditoria e certificação.

## 13. Gates de homologação

### Gate A - Foundation ready

- escopo, inventário, RACI e risk methodology aprovados;
- nenhum critical/high sem owner e prazo;
- provider/data map completo;
- políticas mínimas publicadas.

### Gate B - Technical ready

- MFA/admin, RBAC, RLS, CSP, rate limiting, DLP e hardening implantados;
- cross-tenant suite e AI adversarial suite verdes;
- no critical/high SAST/SCA/container findings.

### Gate C - Operational ready

- controles operaram por pelo menos um ciclo relevante;
- acessos revisados;
- incident/tabletop executado;
- restore dentro de RPO/RTO;
- fornecedor e privacy processes testados.

### Gate D - Independently ready

- pentest e reteste aprovados;
- SOC readiness sem design gap material;
- ISO gap assessment e auditoria interna encerrados.

### Gate E - Audit ready

- população de evidências completa;
- system description e SoA congelados;
- management review concluída;
- nenhum finding vencido;
- auditor formal aceita iniciar exame/certificação.

## 14. Métricas que o board deve acompanhar

- critical/high vulnerabilities abertas e idade;
- percentagem de controles `operating`, `evidenced` e `independently_tested`;
- cobertura MFA de contas privilegiadas e enterprise;
- tempo de revogação no offboarding;
- acessos privilegiados temporários versus permanentes;
- cross-tenant tests e regressões;
- backup success e último restore aprovado;
- RPO/RTO observado;
- incidentes por severidade e MTTR;
- percentagem de providers com assurance vigente;
- percentagem de dados com classe, retenção e região;
- pedidos de titular dentro do SLA;
- findings de pentest abertos;
- exceções vencidas;
- mudanças de produção com aprovação, rollback e evidência.

## 15. Primeiro sprint recomendado

O primeiro sprint de segurança deve produzir capacidade, não documentação vazia:

1. criar control register e inventário inicial;
2. triagem dos 16 alertas CodeQL;
3. fazer achado novo high/critical bloquear merge;
4. ativar MFA administrativo e definir step-up;
5. verificar live config de AWS, Supabase, Vercel e GitHub;
6. fechar a matriz de dados e contratos dos quatro providers externos;
7. criar threat model de tenant, documentos e IA;
8. definir e testar RPO/RTO preliminares;
9. preparar escopo técnico do pentest;
10. converter os resultados em backlog com owner, esforço e dependência.

Estado em 07/09/2026: o item 1 possui agora o catálogo e a baseline de inventário do repositório.
Owners nominais, configuração live, contratos, retenção, regiões e operação ao longo do tempo
continuam abertos e aparecem como gaps, não como controles concluídos.

## 16. Fontes normativas e técnicas

- AICPA Trust Services Criteria e SOC 2;
- ISO/IEC 27001:2022 e ISO/IEC 27002:2022;
- NIST Cybersecurity Framework 2.0;
- OWASP ASVS, API Security Top 10 e Top 10 for LLM Applications;
- LGPD, regulamentações e guias da ANPD;
- GDPR e orientação da Comissão Europeia/EDPB quando aplicável;
- CCPA/CPRA e orientação da CPPA quando aplicável;
- Resolução CMN 4.893 e exigências contratuais dos clientes regulados;
- documentação corrente de segurança e responsabilidade compartilhada dos provedores.

## 17. Regra de verdade

Em materiais comerciais e de procurement, a Offroad só poderá declarar:

- `designed for`: quando o controle foi desenhado, mas ainda não opera;
- `implemented`: quando está implantado e testado internamente;
- `operating`: quando há evidência durante o período definido;
- `independently tested`: quando um terceiro testou;
- `SOC 2 Type II examined` ou `ISO/IEC 27001 certified`: somente após emissão formal e dentro do escopo exato.

Nunca usar “SOC 2 compliant”, “ISO compliant”, “GDPR certified” ou badge antes da evidência correspondente.
