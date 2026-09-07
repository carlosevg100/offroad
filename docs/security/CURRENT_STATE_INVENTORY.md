# Inventário atual de segurança da Offroad

Versão: `2026.09.07-sec01-v1`

Baseline: `carlosevg100/offroad@b2e389757995859cf6a0b250e051d83ba0b53163`, evidência até 2026-09-07T09:43:00.000-03:00, revisão até 2026-09-14T09:43:00.000-03:00

Fingerprint: `167d19e3fdf03edc62f16d3430a840b937d4a07d23e11a5225b7fa5349022877`

Status: baseline estrutural do repositório. Não é certificação, exame independente, pentest ou prova de operação contínua.

## Como ler

Repository-observed current state for the Offroad application, delivery path, worker, data platforms and known external integrations.

`verified` significa apenas que a afirmação delimitada possui evidência referenciada. `partial` e `unknown` preservam lacunas abertas. Integração observada em código não comprova ativação live nem termos contratuais.

- Repository evidence does not attest to complete live configuration, contract terms or control operation over time.
- Functional owner roles are recorded, but named primary and backup assignments are not evidenced.
- Vendor contract, retention, region and training-use statements remain unknown without current evidence.
- Environment and data-class references are independent scope unions, not a Cartesian authorization matrix; that matrix remains an explicit critical gap.
- The deployed worker configuration omits provider-data-policy enforcement and enables Firecrawl while zero-data-retention is false.
- Asset discovery is incomplete; missing boundaries are named in SG-ASSET-DISCOVERY rather than silently treated as absent.
- This inventory is not evidence of SOC 2 examination, ISO certification, penetration testing or regulatory compliance.

## Resumo

| Dimensão | Quantidade |
| --- | ---: |
| Ambientes | 6 |
| Sistemas | 7 |
| Data stores | 7 |
| Fluxos | 13 |
| Identidades e service roles | 9 |
| Vendors e subprocessadores | 13 |
| Lacunas abertas | 17 |
| Inventário estruturalmente válido | sim |
| Assurance ready | não |

## Ambientes

| ID | Ambiente | Classe | Dados de cliente | Região | Estado | Owner | Lacunas |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ENV-PRODUCTION | Production | production | allowed | Supabase and AWS are documented as sa-east-1; other provider regions require verification. | partial | Platform engineering owner / backup: Security operations owner / functional_role_only | `SG-LIVE-CONFIG`, `SG-REGION-MAP`, `SG-SCHEMA-BEFORE-CODE`, `SG-ENV-DATA-MAPPING` |
| ENV-STAGING | Staging | non_production_isolated | prohibited | Unknown until live verification. | partial | Platform engineering owner / backup: Data security owner / functional_role_only | `SG-LIVE-CONFIG`, `SG-ENV-SEPARATION`, `SG-ENV-DATA-MAPPING` |
| ENV-PREVIEW | Vercel preview | non_production_connected | unknown | Unknown until live verification. | unknown | Web platform owner / backup: Platform engineering owner / functional_role_only | `SG-LIVE-CONFIG`, `SG-ENV-SEPARATION`, `SG-ENV-DATA-MAPPING` |
| ENV-CI | CI | ci_ephemeral | prohibited | GitHub-hosted runner location is not fixed here. | partial | Engineering governance owner / backup: Product security owner / functional_role_only | `SG-ENV-SEPARATION`, `SG-VENDOR-ASSURANCE`, `SG-ENV-DATA-MAPPING` |
| ENV-DEVELOPMENT | Developer environment | local_development | prohibited | unknown | unknown | Engineering governance owner / backup: Product security owner / functional_role_only | `SG-ENDPOINTS`, `SG-ENV-SEPARATION`, `SG-ENV-DATA-MAPPING` |
| ENV-EXTERNAL | External service boundary | external_service | unknown | unknown | unknown | Vendor risk owner / backup: Privacy owner / functional_role_only | `SG-VENDOR-ASSURANCE`, `SG-REGION-MAP`, `SG-PROVIDER-ASSURANCE`, `SG-ENV-DATA-MAPPING` |

## Classes de dados

| Classe | Regra de tratamento | Ambientes permitidos | Uso externo requer aprovação | Estado | Owner | Lacunas |
| --- | --- | --- | --- | --- | --- | --- |
| public | Use only for the declared task and retain source provenance. | `ENV-PRODUCTION`, `ENV-STAGING`, `ENV-PREVIEW`, `ENV-CI`, `ENV-DEVELOPMENT`, `ENV-EXTERNAL` | não | partial | Data governance owner / backup: AI governance owner / functional_role_only | `SG-DATA-LIFECYCLE` |
| internal_operational | Restrict by role and purpose; do not place in public artifacts. | `ENV-PRODUCTION`, `ENV-STAGING`, `ENV-CI`, `ENV-DEVELOPMENT` | sim | partial | Data governance owner / backup: Platform engineering owner / functional_role_only | `SG-DATA-LIFECYCLE` |
| personal_data | Process only for a documented purpose with rights and lifecycle controls. | `ENV-PRODUCTION` | sim | partial | Privacy owner / backup: Data governance owner / functional_role_only | `SG-DATA-LIFECYCLE`, `SG-PRIVACY-RECORDS` |
| customer_confidential | Keep tenant-scoped and route externally only through an approved data-policy decision. | `ENV-PRODUCTION` | sim | partial | Data security owner / backup: Privacy owner / functional_role_only | `SG-DATA-LIFECYCLE`, `SG-PROVIDER-ASSURANCE` |
| restricted_financial | Apply customer-confidential controls plus explicit task authorization and traceability. | `ENV-PRODUCTION` | sim | partial | Data security owner / backup: Credit product owner / functional_role_only | `SG-DATA-LIFECYCLE`, `SG-PROVIDER-ASSURANCE` |
| credential_secret | Never commit or log values; use managed stores and rotate on suspected exposure. | `ENV-PRODUCTION`, `ENV-CI`, `ENV-DEVELOPMENT` | sim | partial | Platform security owner / backup: Security operations owner / functional_role_only | `SG-PRIVILEGED-ACCESS` |
| security_evidence | Protect integrity, access, retention and separation from customer content. | `ENV-PRODUCTION`, `ENV-STAGING`, `ENV-CI`, `ENV-DEVELOPMENT` | sim | partial | Security governance owner / backup: Engineering governance owner / functional_role_only | `SG-DATA-LIFECYCLE` |

## Sistemas

| ID | Sistema | Tipo | Ambientes | Dados | Vendors | Estado | Owner | Lacunas |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| SYS-WEB | Offroad web application | application | `ENV-PRODUCTION`, `ENV-PREVIEW`, `ENV-DEVELOPMENT`, `ENV-CI` | `public`, `internal_operational`, `personal_data`, `customer_confidential`, `restricted_financial` | `VEN-VERCEL`, `VEN-SUPABASE`, `VEN-SENTRY`, `VEN-POSTHOG`, `VEN-GOOGLE-FONTS` | partial | Web platform owner / backup: Application security owner / functional_role_only | `SG-LIVE-CONFIG`, `SG-TELEMETRY-ASSURANCE`, `SG-OWNER-ASSIGNMENT`, `SG-ASSET-DISCOVERY` |
| SYS-SUPABASE | Supabase data platform | database_platform | `ENV-PRODUCTION`, `ENV-STAGING`, `ENV-DEVELOPMENT`, `ENV-CI` | `internal_operational`, `personal_data`, `customer_confidential`, `restricted_financial`, `credential_secret`, `security_evidence` | `VEN-SUPABASE` | partial | Data platform owner / backup: Data security owner / functional_role_only | `SG-LIVE-CONFIG`, `SG-BACKUP-RESTORE`, `SG-DATA-LIFECYCLE`, `SG-SCHEMA-BEFORE-CODE`, `SG-ENV-SEPARATION`, `SG-PRIVACY-RECORDS`, `SG-OWNER-ASSIGNMENT` |
| SYS-WORKER | Document and case worker | worker | `ENV-PRODUCTION`, `ENV-DEVELOPMENT`, `ENV-CI` | `public`, `internal_operational`, `customer_confidential`, `restricted_financial`, `credential_secret`, `security_evidence` | `VEN-AWS`, `VEN-SUPABASE`, `VEN-ANTHROPIC`, `VEN-OPENAI`, `VEN-PERPLEXITY`, `VEN-FIRECRAWL` | partial | Document platform owner / backup: Platform engineering owner / functional_role_only | `SG-LIVE-CONFIG`, `SG-PROVIDER-ASSURANCE`, `SG-SCHEMA-BEFORE-CODE`, `SG-OWNER-ASSIGNMENT`, `SG-LOGGING-CONTENT-SAFETY`, `SG-ASSET-DISCOVERY` |
| SYS-GITHUB | GitHub source and delivery control plane | delivery_pipeline | `ENV-CI`, `ENV-EXTERNAL` | `public`, `internal_operational`, `credential_secret`, `security_evidence` | `VEN-GITHUB`, `VEN-SHEETJS-CDN` | partial | Engineering governance owner / backup: Product security owner / functional_role_only | `SG-LIVE-CONFIG`, `SG-PRIVILEGED-ACCESS`, `SG-DEPLOY-DIAGNOSTICS`, `SG-SCHEMA-BEFORE-CODE`, `SG-VENDOR-ASSURANCE`, `SG-OWNER-ASSIGNMENT`, `SG-ASSET-DISCOVERY` |
| SYS-OBSERVABILITY | Application observability | observability | `ENV-PRODUCTION`, `ENV-PREVIEW`, `ENV-DEVELOPMENT`, `ENV-EXTERNAL` | `internal_operational`, `personal_data`, `security_evidence` | `VEN-SENTRY`, `VEN-POSTHOG` | unknown | Security operations owner / backup: Web platform owner / functional_role_only | `SG-LIVE-CONFIG`, `SG-TELEMETRY-ASSURANCE`, `SG-OWNER-ASSIGNMENT` |
| SYS-AUTH-EMAIL | Authentication email delivery | email | `ENV-PRODUCTION`, `ENV-EXTERNAL` | `personal_data`, `internal_operational` | `VEN-SUPABASE`, `VEN-SMTP-UNKNOWN` | unknown | Identity owner / backup: Privacy owner / functional_role_only | `SG-LIVE-CONFIG`, `SG-VENDOR-ASSURANCE`, `SG-PRIVACY-RECORDS`, `SG-OWNER-ASSIGNMENT` |
| SYS-ENDPOINTS | Developer and administrator endpoints | developer_endpoint | `ENV-DEVELOPMENT`, `ENV-EXTERNAL` | `internal_operational`, `credential_secret`, `security_evidence` | nenhum | unknown | People operations owner / backup: Product security owner / functional_role_only | `SG-ENDPOINTS`, `SG-PRIVILEGED-ACCESS`, `SG-OWNER-ASSIGNMENT` |

## Data stores

| ID | Store | Sistema | Dados | Retenção | Backup | Estado | Boundary | Lacunas |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| STORE-POSTGRES | Supabase Postgres | SYS-SUPABASE | `internal_operational`, `personal_data`, `customer_confidential`, `restricted_financial`, `security_evidence` | unknown | provider_managed_unverified | partial | Organization and project policies plus private database commands; live completeness is unverified. | `SG-DATA-LIFECYCLE`, `SG-BACKUP-RESTORE`, `SG-LIVE-CONFIG`, `SG-PRIVACY-RECORDS` |
| STORE-OBJECTS | Supabase private object storage | SYS-SUPABASE | `customer_confidential`, `restricted_financial`, `security_evidence` | unknown | provider_managed_unverified | partial | Private buckets and signed URLs are observed in code; complete live policy state is unverified. | `SG-DATA-LIFECYCLE`, `SG-BACKUP-RESTORE`, `SG-LIVE-CONFIG` |
| STORE-CLOUDWATCH | Worker operational logs | SYS-WORKER | `internal_operational`, `security_evidence` | unknown | unknown | partial | Logs are intended to exclude customer content, but direct error-message paths are not comprehensively governed or tested. | `SG-LIVE-CONFIG`, `SG-DATA-LIFECYCLE`, `SG-LOGGING-CONTENT-SAFETY` |
| STORE-TELEMETRY | External application telemetry | SYS-OBSERVABILITY | `internal_operational`, `personal_data`, `security_evidence` | unknown | unknown | unknown | Client code applies allowlisting and scrubbing; activation, access and retention are unverified. | `SG-TELEMETRY-ASSURANCE`, `SG-LIVE-CONFIG`, `SG-DATA-LIFECYCLE` |
| STORE-SOURCE | GitHub source and CI artifacts | SYS-GITHUB | `public`, `internal_operational`, `security_evidence` | partial | provider_managed_unverified | partial | Repository is documented as public; customer data and secret values are prohibited. | `SG-VENDOR-ASSURANCE`, `SG-DATA-LIFECYCLE` |
| STORE-AWS-SECRETS | AWS Secrets Manager | SYS-WORKER | `credential_secret` | unknown | provider_managed_unverified | partial | Named secret references are injected into the worker task; secret values are intentionally absent from this inventory. | `SG-LIVE-CONFIG`, `SG-DATA-LIFECYCLE`, `SG-PRIVILEGED-ACCESS` |
| STORE-ECR | Worker container registry | SYS-WORKER | `internal_operational`, `security_evidence` | unknown | provider_managed_unverified | partial | A named ECR repository receives immutable worker images and a mutable latest tag; effective live access and retention are unverified. | `SG-LIVE-CONFIG`, `SG-DATA-LIFECYCLE`, `SG-VENDOR-ASSURANCE` |

## Fluxos de dados

| ID | Fluxo | Origem | Destino | Dados | Direção | Boundary de autorização | Estado | Lacunas |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| FLOW-WEB-DATA | Web application to Supabase | SYS-WEB | SYS-SUPABASE | `internal_operational`, `personal_data`, `customer_confidential`, `restricted_financial` | internal | Publishable client plus authenticated session; database and storage policies remain authoritative. | partial | `SG-LIVE-CONFIG`, `SG-ENV-SEPARATION` |
| FLOW-UPLOAD | Browser document upload | SYS-WEB | SYS-SUPABASE | `customer_confidential`, `restricted_financial` | outbound | Tenant-scoped object path and storage policy; worker access uses a separate signed URL. | partial | `SG-LIVE-CONFIG`, `SG-DATA-LIFECYCLE` |
| FLOW-DATA-WORKER | Supabase job and document access to worker | SYS-SUPABASE | SYS-WORKER | `internal_operational`, `customer_confidential`, `restricted_financial`, `security_evidence` | internal | Worker credential claims; per-job capability authorizes subsequent commands. | partial | `SG-LIVE-CONFIG` |
| FLOW-WORKER-ANTHROPIC | Worker to Anthropic | SYS-WORKER | VEN-ANTHROPIC | `public`, `customer_confidential`, `restricted_financial` | outbound | Gateway model allowlist, task policy, budget and optional data-assurance enforcement. | partial | `SG-PROVIDER-ASSURANCE`, `SG-LIVE-CONFIG` |
| FLOW-WORKER-OPENAI | Worker to OpenAI | SYS-WORKER | VEN-OPENAI | `public`, `customer_confidential`, `restricted_financial` | outbound | Gateway policy and per-job capability boundary. | partial | `SG-PROVIDER-ASSURANCE`, `SG-LIVE-CONFIG` |
| FLOW-WORKER-RESEARCH | Worker public research | SYS-WORKER | VEN-PERPLEXITY | `public` | outbound | Research router, source registry, public-source constraint and job budget. | partial | `SG-VENDOR-ASSURANCE`, `SG-LIVE-CONFIG` |
| FLOW-WORKER-FIRECRAWL | Worker public content acquisition | SYS-WORKER | VEN-FIRECRAWL | `public` | outbound | Public-source router, explicit activation flag, provider credential and job budget. | partial | `SG-PROVIDER-ASSURANCE`, `SG-VENDOR-ASSURANCE`, `SG-LIVE-CONFIG` |
| FLOW-WEB-TELEMETRY | Web telemetry | SYS-WEB | SYS-OBSERVABILITY | `internal_operational`, `personal_data`, `security_evidence` | outbound | SDK activation plus event allowlist and scrubbing. | unknown | `SG-TELEMETRY-ASSURANCE`, `SG-LIVE-CONFIG` |
| FLOW-AUTH-EMAIL | Authentication email delivery | SYS-SUPABASE | VEN-SMTP-UNKNOWN | `personal_data`, `internal_operational` | outbound | Supabase Auth delivery integration; provider and current live configuration are not captured. | unknown | `SG-VENDOR-ASSURANCE`, `SG-LIVE-CONFIG`, `SG-PRIVACY-RECORDS` |
| FLOW-GITHUB-AWS | GitHub deployment to AWS | SYS-GITHUB | VEN-AWS | `internal_operational`, `credential_secret`, `security_evidence` | outbound | Named AWS role and no stored AWS key in the workflow. | partial | `SG-LIVE-CONFIG`, `SG-PRIVILEGED-ACCESS`, `SG-DEPLOY-DIAGNOSTICS`, `SG-SCHEMA-BEFORE-CODE` |
| FLOW-GITHUB-VERCEL | GitHub source to Vercel | SYS-GITHUB | VEN-VERCEL | `public`, `internal_operational`, `security_evidence` | outbound | Provider-managed source integration; live permissions and provenance require verification. | unknown | `SG-LIVE-CONFIG`, `SG-VENDOR-ASSURANCE` |
| FLOW-SHEETJS-SUPPLY | SheetJS package acquisition | VEN-SHEETJS-CDN | SYS-GITHUB | `public`, `internal_operational` | inbound | Pinned package URL and lockfile integrity; vendor assurance and availability are not verified. | partial | `SG-VENDOR-ASSURANCE`, `SG-ASSET-DISCOVERY` |
| FLOW-MATERIAL-GOOGLE-FONTS | Generated material to Google Fonts | SYS-WEB | VEN-GOOGLE-FONTS | `public`, `internal_operational`, `personal_data` | outbound | No repository-enforced allowlist, self-hosting or privacy contract is proven. | partial | `SG-VENDOR-ASSURANCE`, `SG-REGION-MAP`, `SG-TELEMETRY-ASSURANCE`, `SG-ASSET-DISCOVERY` |

## Identidades e service roles

| ID | Identidade | Tipo | Sistema | Privilégio | Autenticação | Ciclo | Estado | Lacunas |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ID-END-USER | Authenticated end user | end_user | SYS-SUPABASE | tenant_scoped | Supabase Auth session after email verification; MFA and enterprise lifecycle are not proven. | partial | partial | `SG-PRIVILEGED-ACCESS` |
| ID-ANON-ROLE | Supabase anonymous role | database_role | SYS-SUPABASE | public | Unauthenticated role; sensitive operations are expected to be denied by grants and policies. | defined | partial | `SG-LIVE-CONFIG` |
| ID-AUTH-ROLE | Supabase authenticated role | database_role | SYS-SUPABASE | tenant_scoped | JWT-backed role constrained by organization, project and object policies. | defined | partial | `SG-LIVE-CONFIG` |
| ID-WORKER-ACCOUNT | Dedicated worker account | service_role | SYS-WORKER | workload_scoped | Dedicated account plus worker claim credential and per-job capability. | partial | partial | `SG-PRIVILEGED-ACCESS`, `SG-LIVE-CONFIG` |
| ID-GITHUB-OIDC | GitHub deployment OIDC principal | oidc_principal | SYS-GITHUB | workload_scoped | GitHub OIDC exchanged for a short-lived AWS session. | defined | partial | `SG-LIVE-CONFIG`, `SG-DEPLOY-DIAGNOSTICS` |
| ID-AWS-WORKER-ROLES | ECS execution and task roles | service_role | SYS-WORKER | workload_scoped | Named task execution and runtime roles; effective permissions require live verification. | partial | partial | `SG-LIVE-CONFIG`, `SG-PRIVILEGED-ACCESS`, `SG-DEPLOY-DIAGNOSTICS` |
| ID-PRIVILEGED-HUMANS | Privileged human administrators | human_role | SYS-GITHUB | privileged | Actual people, factors, grants and recertification are not inventoried in repository evidence. | unknown | unknown | `SG-PRIVILEGED-ACCESS`, `SG-ENDPOINTS` |
| ID-PROVIDER-CREDENTIALS | Worker provider credentials | api_credential | SYS-WORKER | workload_scoped | Named provider secrets are injected from AWS Secrets Manager; values and effective grants are not captured. | unknown | partial | `SG-PRIVILEGED-ACCESS`, `SG-LIVE-CONFIG` |
| ID-VERCEL-SOURCE-INTEGRATION | Vercel source integration | api_credential | SYS-GITHUB | unknown | Provider-managed source/deploy identity; credential form, grants and lifecycle are unresolved. | unknown | unknown | `SG-PRIVILEGED-ACCESS`, `SG-LIVE-CONFIG`, `SG-VENDOR-ASSURANCE` |

## Vendors e subprocessadores

| ID | Vendor | Papel | Ativação observada | Contrato | Retenção | Training use | Região | Estado | Lacunas |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| VEN-SUPABASE | Supabase | processor | observed_in_code | unknown | unknown | not_applicable | partial | partial | `SG-VENDOR-ASSURANCE`, `SG-BACKUP-RESTORE`, `SG-REGION-MAP` |
| VEN-AWS | Amazon Web Services | infrastructure | observed_in_deployment_config | unknown | unknown | not_applicable | partial | partial | `SG-VENDOR-ASSURANCE`, `SG-LIVE-CONFIG`, `SG-REGION-MAP`, `SG-DEPLOY-DIAGNOSTICS` |
| VEN-VERCEL | Vercel | infrastructure | observed_in_code | unknown | unknown | not_applicable | unknown | unknown | `SG-VENDOR-ASSURANCE`, `SG-LIVE-CONFIG`, `SG-REGION-MAP` |
| VEN-GITHUB | GitHub | development | observed_in_code | unknown | partial | not_applicable | unknown | partial | `SG-VENDOR-ASSURANCE`, `SG-PRIVILEGED-ACCESS`, `SG-REGION-MAP` |
| VEN-ANTHROPIC | Anthropic | subprocessor | observed_in_deployment_config | unknown | unknown | unknown | unknown | unknown | `SG-PROVIDER-ASSURANCE`, `SG-VENDOR-ASSURANCE`, `SG-REGION-MAP` |
| VEN-OPENAI | OpenAI | subprocessor | observed_in_deployment_config | unknown | unknown | unknown | unknown | unknown | `SG-PROVIDER-ASSURANCE`, `SG-VENDOR-ASSURANCE`, `SG-REGION-MAP` |
| VEN-PERPLEXITY | Perplexity | subprocessor | observed_in_deployment_config | unknown | unknown | unknown | unknown | unknown | `SG-VENDOR-ASSURANCE`, `SG-REGION-MAP` |
| VEN-FIRECRAWL | Firecrawl | subprocessor | observed_in_deployment_config | unknown | partial | unknown | unknown | unknown | `SG-PROVIDER-ASSURANCE`, `SG-VENDOR-ASSURANCE`, `SG-REGION-MAP` |
| VEN-SENTRY | Sentry | subprocessor | observed_in_code | unknown | unknown | not_applicable | unknown | unknown | `SG-TELEMETRY-ASSURANCE`, `SG-VENDOR-ASSURANCE`, `SG-REGION-MAP` |
| VEN-POSTHOG | PostHog | subprocessor | observed_in_code | unknown | unknown | not_applicable | unknown | unknown | `SG-TELEMETRY-ASSURANCE`, `SG-VENDOR-ASSURANCE`, `SG-REGION-MAP` |
| VEN-SMTP-UNKNOWN | Authentication email provider (unresolved) | unknown | unknown | unknown | unknown | not_applicable | unknown | unknown | `SG-VENDOR-ASSURANCE`, `SG-LIVE-CONFIG`, `SG-REGION-MAP` |
| VEN-SHEETJS-CDN | SheetJS CDN | supply_chain | observed_in_code | unknown | unknown | not_applicable | unknown | partial | `SG-VENDOR-ASSURANCE`, `SG-REGION-MAP`, `SG-ASSET-DISCOVERY` |
| VEN-GOOGLE-FONTS | Google Fonts | subprocessor | observed_in_code | unknown | unknown | not_applicable | unknown | partial | `SG-VENDOR-ASSURANCE`, `SG-REGION-MAP`, `SG-TELEMETRY-ASSURANCE`, `SG-ASSET-DISCOVERY` |

## Lacunas abertas

| ID | Severidade | Lacuna | Owner | Controles | Próxima ação |
| --- | --- | --- | --- | --- | --- |
| SG-LIVE-CONFIG | critical | Live configuration snapshot missing | Cloud security owner / backup: Security governance owner / functional_role_only | `TRUST-CLOUD-01`, `TRUST-CLOUD-02`, `TRUST-OPS-01` | Collect read-only, dated configuration snapshots from each material platform and attach time-bound evidence. |
| SG-ENV-SEPARATION | critical | Environment separation not fully proven | Platform engineering owner / backup: Data security owner / functional_role_only | `TRUST-CLOUD-02`, `TRUST-DATA-01` | Verify credentials, connectivity, data policy and non-interference for every lower environment. |
| SG-DATA-LIFECYCLE | critical | Data retention, export and deletion lifecycle incomplete | Data governance owner / backup: Privacy owner / functional_role_only | `TRUST-DATA-02`, `TRUST-DATA-04` | Define retention by data class and prove export, legal hold and deletion propagation. |
| SG-BACKUP-RESTORE | critical | Backup and restore not exercised | Reliability owner / backup: Data platform owner / functional_role_only | `TRUST-OPS-02`, `TRUST-VENDOR-01` | Approve preliminary RPO and RTO, capture settings and execute an isolated restore drill. |
| SG-VENDOR-ASSURANCE | high | Vendor and subprocessor assurance incomplete | Vendor risk owner / backup: Privacy owner / functional_role_only | `TRUST-VENDOR-01`, `TRUST-DATA-04` | Collect current contract, DPA, retention, region, incident, notice and exit evidence for every material vendor. |
| SG-PROVIDER-ASSURANCE | critical | Provider data-policy enforcement is disabled in deployment configuration | AI governance owner / backup: Privacy owner / functional_role_only | `TRUST-AI-01`, `TRUST-DATA-04`, `TRUST-VENDOR-01` | Set and prove fail-closed provider assurance for non-public model routes; separately review Firecrawl retention before promotion because live acquisition is enabled while zero-data-retention is false. |
| SG-TELEMETRY-ASSURANCE | high | Telemetry activation and handling not live-verified | Security operations owner / backup: Privacy owner / functional_role_only | `TRUST-OPS-01`, `TRUST-DATA-04`, `TRUST-VENDOR-01` | Verify activation and capture access, retention, region, DPA and privacy-safe event tests. |
| SG-PRIVILEGED-ACCESS | critical | Privileged identity inventory and recertification missing | Identity owner / backup: Security governance owner / functional_role_only | `TRUST-ID-01`, `TRUST-DATA-03`, `TRUST-PEOPLE-01` | Record named identities, factors, grants, last use, approval, expiry and periodic recertification. |
| SG-ENDPOINTS | high | Endpoint security baseline absent | People operations owner / backup: Product security owner / functional_role_only | `TRUST-PEOPLE-01`, `TRUST-ID-01`, `TRUST-DATA-03` | Inventory endpoints and prove encryption, screen lock, patching, protection, recovery and disposal. |
| SG-REGION-MAP | high | Complete residency and transfer map missing | Privacy owner / backup: Vendor risk owner / functional_role_only | `TRUST-DATA-04`, `TRUST-VENDOR-01`, `TRUST-CLOUD-01` | Confirm processing and storage locations, transfer mechanisms and subprocessor paths. |
| SG-PRIVACY-RECORDS | high | Privacy records and rights operations incomplete | Privacy owner / backup: Data governance owner / functional_role_only | `TRUST-DATA-04`, `TRUST-DATA-02` | Create the processing record, legal-basis map, notices, rights workflow and transfer assessment. |
| SG-OWNER-ASSIGNMENT | critical | Named control ownership not assigned | Executive security owner / backup: Security governance owner / functional_role_only | `TRUST-GOV-01`, `TRUST-GOV-02` | Assign named primary and backup people to every functional owner role and record acceptance and review cadence. |
| SG-DEPLOY-DIAGNOSTICS | high | Worker rollout role lacks required failure diagnostics | Cloud security owner / backup: Security operations owner / functional_role_only | `TRUST-CLOUD-01`, `TRUST-OPS-01`, `TRUST-SDLC-01` | Add only the scoped read actions required for safe rollout diagnostics, then prove success and denial outside the intended resources. |
| SG-SCHEMA-BEFORE-CODE | critical | Hosted schema is not orchestrated before worker code | Platform engineering owner / backup: Engineering governance owner / functional_role_only | `TRUST-CLOUD-02`, `TRUST-SDLC-01`, `TRUST-OPS-03` | Create a fail-closed release dependency that proves required hosted migrations and runtime contract before a worker image can roll out. |
| SG-ENV-DATA-MAPPING | critical | Environment-by-data-class matrix is not inventoried | Data security owner / backup: Security governance owner / functional_role_only | `TRUST-DATA-01`, `TRUST-DATA-02`, `TRUST-CLOUD-02` | Record and verify the allowed, prohibited or conditional data classes for each system and flow in each environment before treating the two scope lists as a routing policy. |
| SG-LOGGING-CONTENT-SAFETY | high | Worker logging is not comprehensively content-safe | Security operations owner / backup: Platform engineering owner / functional_role_only | `TRUST-OPS-01`, `TRUST-DATA-02`, `TRUST-APP-02` | Route operational logs through a typed allowlisted logger and test every failure path against prompts, document text, signed URLs, personal data and financial values. |
| SG-ASSET-DISCOVERY | high | Security asset and external dependency discovery is incomplete | Security governance owner / backup: Platform security owner / functional_role_only | `TRUST-GOV-02`, `TRUST-SDLC-02`, `TRUST-VENDOR-01` | Inventory Secrets Manager, ECR and container artifacts, provider credentials, Vercel source integration, browser CDNs and external fonts before claiming external-boundary completeness. |

## Governança e rastreabilidade por objeto

| ID | Owner | Backup | Evidências | Controles |
| --- | --- | --- | --- | --- |
| ENV-PRODUCTION | Platform engineering owner | Security operations owner | `SEV-AGENTS-SCOPE`, `SEV-WORKER-TASK` | `TRUST-CLOUD-01`, `TRUST-CLOUD-02`, `TRUST-DATA-02` |
| ENV-STAGING | Platform engineering owner | Data security owner | `SEV-AGENTS-SCOPE`, `SEV-QUALITY-WORKFLOW` | `TRUST-CLOUD-01`, `TRUST-CLOUD-02`, `TRUST-DATA-01` |
| ENV-PREVIEW | Web platform owner | Platform engineering owner | `SEV-AGENTS-SCOPE` | `TRUST-CLOUD-02`, `TRUST-DATA-02` |
| ENV-CI | Engineering governance owner | Product security owner | `SEV-QUALITY-WORKFLOW`, `SEV-SECURITY-WORKFLOW` | `TRUST-SDLC-01`, `TRUST-SDLC-02`, `TRUST-CLOUD-02` |
| ENV-DEVELOPMENT | Engineering governance owner | Product security owner | `SEV-AGENTS-SCOPE`, `SEV-ENV-NAMES` | `TRUST-CLOUD-02`, `TRUST-PEOPLE-01`, `TRUST-DATA-03` |
| ENV-EXTERNAL | Vendor risk owner | Privacy owner | `SEV-SECURITY-PLAN`, `SEV-MODEL-DATA-POLICY` | `TRUST-VENDOR-01`, `TRUST-AI-01`, `TRUST-DATA-04` |
| public | Data governance owner | AI governance owner | `SEV-PUBLIC-RESEARCH`, `SEV-MODEL-DATA-POLICY` | `TRUST-DATA-02`, `TRUST-AI-01` |
| internal_operational | Data governance owner | Platform engineering owner | `SEV-WORKER-RUNTIME`, `SEV-SUPABASE-CONFIG` | `TRUST-DATA-02`, `TRUST-DATA-03` |
| personal_data | Privacy owner | Data governance owner | `SEV-SUPABASE-CONFIG`, `SEV-SECURITY-PLAN` | `TRUST-DATA-02`, `TRUST-DATA-04` |
| customer_confidential | Data security owner | Privacy owner | `SEV-RLS-TEST`, `SEV-MODEL-DATA-POLICY` | `TRUST-DATA-01`, `TRUST-DATA-02`, `TRUST-AI-01` |
| restricted_financial | Data security owner | Credit product owner | `SEV-RLS-TEST`, `SEV-MODEL-DATA-POLICY` | `TRUST-DATA-01`, `TRUST-DATA-02`, `TRUST-AI-01` |
| credential_secret | Platform security owner | Security operations owner | `SEV-ENV-NAMES`, `SEV-DEPLOY-WORKER`, `SEV-WORKER-CONFIG` | `TRUST-DATA-03`, `TRUST-ID-01` |
| security_evidence | Security governance owner | Engineering governance owner | `SEV-SECURITY-WORKFLOW`, `SEV-SECURITY-PLAN` | `TRUST-GOV-02`, `TRUST-OPS-01`, `TRUST-SDLC-01` |
| SYS-WEB | Web platform owner | Application security owner | `SEV-AGENTS-SCOPE`, `SEV-WEB-DEPENDENCIES`, `SEV-WEB-UPLOAD` | `TRUST-APP-01`, `TRUST-APP-02`, `TRUST-DATA-01` |
| SYS-SUPABASE | Data platform owner | Data security owner | `SEV-SUPABASE-CONFIG`, `SEV-RLS-TEST`, `SEV-AGENTS-SCOPE` | `TRUST-DATA-01`, `TRUST-APP-01`, `TRUST-OPS-02` |
| SYS-WORKER | Document platform owner | Platform engineering owner | `SEV-WORKER-TASK`, `SEV-WORKER-RUNTIME`, `SEV-WORKER-CONFIG` | `TRUST-DOC-01`, `TRUST-DOC-02`, `TRUST-AI-01`, `TRUST-CLOUD-01` |
| SYS-GITHUB | Engineering governance owner | Product security owner | `SEV-QUALITY-WORKFLOW`, `SEV-SECURITY-WORKFLOW`, `SEV-DEPLOY-WORKER` | `TRUST-SDLC-01`, `TRUST-SDLC-02`, `TRUST-DATA-03` |
| SYS-OBSERVABILITY | Security operations owner | Web platform owner | `SEV-WEB-OBSERVABILITY`, `SEV-ENV-NAMES` | `TRUST-OPS-01`, `TRUST-DATA-04`, `TRUST-VENDOR-01` |
| SYS-AUTH-EMAIL | Identity owner | Privacy owner | `SEV-SUPABASE-CONFIG`, `SEV-SECURITY-PLAN` | `TRUST-ID-01`, `TRUST-DATA-04`, `TRUST-VENDOR-01` |
| SYS-ENDPOINTS | People operations owner | Product security owner | `SEV-AGENTS-SCOPE`, `SEV-SECURITY-PLAN` | `TRUST-PEOPLE-01`, `TRUST-ID-01`, `TRUST-DATA-03` |
| STORE-POSTGRES | Data platform owner | Data security owner | `SEV-RLS-TEST`, `SEV-SUPABASE-CONFIG` | `TRUST-DATA-01`, `TRUST-DATA-02`, `TRUST-OPS-02` |
| STORE-OBJECTS | Data platform owner | Document platform owner | `SEV-WEB-UPLOAD`, `SEV-RLS-TEST` | `TRUST-DATA-01`, `TRUST-DATA-02`, `TRUST-OPS-02` |
| STORE-CLOUDWATCH | Security operations owner | Platform engineering owner | `SEV-WORKER-TASK`, `SEV-WORKER-RUNTIME` | `TRUST-OPS-01`, `TRUST-DATA-02`, `TRUST-CLOUD-01` |
| STORE-TELEMETRY | Security operations owner | Privacy owner | `SEV-WEB-OBSERVABILITY`, `SEV-ENV-NAMES` | `TRUST-OPS-01`, `TRUST-DATA-04`, `TRUST-VENDOR-01` |
| STORE-SOURCE | Engineering governance owner | Product security owner | `SEV-AGENTS-SCOPE`, `SEV-SECURITY-WORKFLOW` | `TRUST-SDLC-01`, `TRUST-SDLC-02`, `TRUST-DATA-03` |
| STORE-AWS-SECRETS | Cloud security owner | Platform security owner | `SEV-WORKER-TASK`, `SEV-DEPLOY-WORKER` | `TRUST-DATA-03`, `TRUST-ID-01`, `TRUST-CLOUD-01` |
| STORE-ECR | Platform engineering owner | Product security owner | `SEV-DEPLOY-WORKER`, `SEV-WORKER-TASK` | `TRUST-CLOUD-01`, `TRUST-SDLC-01`, `TRUST-SDLC-02` |
| FLOW-WEB-DATA | Application security owner | Data security owner | `SEV-RLS-TEST`, `SEV-WEB-UPLOAD` | `TRUST-APP-01`, `TRUST-DATA-01` |
| FLOW-UPLOAD | Document platform owner | Data security owner | `SEV-WEB-UPLOAD`, `SEV-RLS-TEST` | `TRUST-DATA-01`, `TRUST-DOC-01` |
| FLOW-DATA-WORKER | Data security owner | Document platform owner | `SEV-WORKER-RUNTIME`, `SEV-RLS-TEST` | `TRUST-DATA-01`, `TRUST-APP-01`, `TRUST-DATA-03` |
| FLOW-WORKER-ANTHROPIC | AI governance owner | Data security owner | `SEV-WORKER-RUNTIME`, `SEV-MODEL-DATA-POLICY`, `SEV-MODEL-POLICY` | `TRUST-AI-01`, `TRUST-AI-03`, `TRUST-DATA-04` |
| FLOW-WORKER-OPENAI | AI governance owner | Data security owner | `SEV-MODEL-POLICY`, `SEV-MODEL-DATA-POLICY` | `TRUST-AI-01`, `TRUST-AI-03`, `TRUST-DATA-04` |
| FLOW-WORKER-RESEARCH | Research platform owner | AI governance owner | `SEV-PUBLIC-RESEARCH`, `SEV-WORKER-RUNTIME` | `TRUST-AI-01`, `TRUST-VENDOR-01` |
| FLOW-WORKER-FIRECRAWL | Research platform owner | AI governance owner | `SEV-PUBLIC-RESEARCH`, `SEV-WORKER-RUNTIME`, `SEV-ENV-NAMES` | `TRUST-AI-01`, `TRUST-VENDOR-01` |
| FLOW-WEB-TELEMETRY | Security operations owner | Privacy owner | `SEV-WEB-OBSERVABILITY`, `SEV-ENV-NAMES` | `TRUST-OPS-01`, `TRUST-DATA-04`, `TRUST-VENDOR-01` |
| FLOW-AUTH-EMAIL | Identity owner | Privacy owner | `SEV-SUPABASE-CONFIG`, `SEV-SECURITY-PLAN` | `TRUST-ID-01`, `TRUST-DATA-04`, `TRUST-VENDOR-01` |
| FLOW-GITHUB-AWS | Platform engineering owner | Engineering governance owner | `SEV-DEPLOY-WORKER`, `SEV-WORKER-TASK` | `TRUST-DATA-03`, `TRUST-CLOUD-01`, `TRUST-SDLC-01` |
| FLOW-GITHUB-VERCEL | Web platform owner | Engineering governance owner | `SEV-AGENTS-SCOPE`, `SEV-WEB-DEPENDENCIES` | `TRUST-CLOUD-02`, `TRUST-SDLC-01`, `TRUST-VENDOR-01` |
| FLOW-SHEETJS-SUPPLY | Product security owner | Engineering governance owner | `SEV-WEB-DEPENDENCIES`, `SEV-LOCKFILE` | `TRUST-SDLC-02`, `TRUST-VENDOR-01` |
| FLOW-MATERIAL-GOOGLE-FONTS | Web platform owner | Privacy owner | `SEV-CASE-RENDER` | `TRUST-VENDOR-01`, `TRUST-DATA-04`, `TRUST-SDLC-02` |
| ID-END-USER | Identity owner | Application security owner | `SEV-SUPABASE-CONFIG`, `SEV-RLS-TEST` | `TRUST-ID-01`, `TRUST-APP-01` |
| ID-ANON-ROLE | Data security owner | Data platform owner | `SEV-RLS-TEST` | `TRUST-DATA-01`, `TRUST-APP-01` |
| ID-AUTH-ROLE | Data security owner | Data platform owner | `SEV-RLS-TEST` | `TRUST-DATA-01`, `TRUST-APP-01` |
| ID-WORKER-ACCOUNT | Platform engineering owner | Data security owner | `SEV-WORKER-RUNTIME`, `SEV-WORKER-CONFIG` | `TRUST-ID-01`, `TRUST-APP-01`, `TRUST-DATA-03` |
| ID-GITHUB-OIDC | Platform engineering owner | Engineering governance owner | `SEV-DEPLOY-WORKER` | `TRUST-DATA-03`, `TRUST-CLOUD-01`, `TRUST-SDLC-01` |
| ID-AWS-WORKER-ROLES | Cloud security owner | Platform engineering owner | `SEV-WORKER-TASK` | `TRUST-ID-01`, `TRUST-CLOUD-01`, `TRUST-DATA-03` |
| ID-PRIVILEGED-HUMANS | Identity owner | Security governance owner | `SEV-CODEOWNERS`, `SEV-SECURITY-PLAN` | `TRUST-ID-01`, `TRUST-PEOPLE-01` |
| ID-PROVIDER-CREDENTIALS | Platform security owner | AI governance owner | `SEV-WORKER-TASK`, `SEV-DEPLOY-WORKER` | `TRUST-ID-01`, `TRUST-DATA-03`, `TRUST-AI-01` |
| ID-VERCEL-SOURCE-INTEGRATION | Web platform owner | Engineering governance owner | `SEV-AGENTS-SCOPE` | `TRUST-ID-01`, `TRUST-CLOUD-02`, `TRUST-SDLC-01` |
| VEN-SUPABASE | Vendor risk owner | Data platform owner | `SEV-AGENTS-SCOPE`, `SEV-SUPABASE-CONFIG` | `TRUST-VENDOR-01`, `TRUST-DATA-02`, `TRUST-OPS-02` |
| VEN-AWS | Vendor risk owner | Cloud security owner | `SEV-WORKER-TASK`, `SEV-DEPLOY-WORKER` | `TRUST-VENDOR-01`, `TRUST-CLOUD-01`, `TRUST-DATA-03` |
| VEN-VERCEL | Vendor risk owner | Web platform owner | `SEV-AGENTS-SCOPE`, `SEV-WEB-DEPENDENCIES` | `TRUST-VENDOR-01`, `TRUST-CLOUD-02`, `TRUST-DATA-04` |
| VEN-GITHUB | Vendor risk owner | Engineering governance owner | `SEV-QUALITY-WORKFLOW`, `SEV-SECURITY-WORKFLOW` | `TRUST-VENDOR-01`, `TRUST-SDLC-01`, `TRUST-SDLC-02` |
| VEN-ANTHROPIC | Vendor risk owner | AI governance owner | `SEV-WORKER-TASK`, `SEV-MODEL-DATA-POLICY` | `TRUST-AI-01`, `TRUST-VENDOR-01`, `TRUST-DATA-04` |
| VEN-OPENAI | Vendor risk owner | AI governance owner | `SEV-WORKER-TASK`, `SEV-MODEL-DATA-POLICY`, `SEV-MODEL-POLICY` | `TRUST-AI-01`, `TRUST-VENDOR-01`, `TRUST-DATA-04` |
| VEN-PERPLEXITY | Vendor risk owner | Research platform owner | `SEV-WORKER-TASK`, `SEV-PUBLIC-RESEARCH` | `TRUST-AI-01`, `TRUST-VENDOR-01` |
| VEN-FIRECRAWL | Vendor risk owner | Research platform owner | `SEV-WORKER-TASK`, `SEV-PUBLIC-RESEARCH`, `SEV-ENV-NAMES` | `TRUST-AI-01`, `TRUST-VENDOR-01` |
| VEN-SENTRY | Vendor risk owner | Security operations owner | `SEV-WEB-OBSERVABILITY`, `SEV-ENV-NAMES` | `TRUST-OPS-01`, `TRUST-VENDOR-01`, `TRUST-DATA-04` |
| VEN-POSTHOG | Vendor risk owner | Privacy owner | `SEV-WEB-OBSERVABILITY`, `SEV-ENV-NAMES` | `TRUST-OPS-01`, `TRUST-VENDOR-01`, `TRUST-DATA-04` |
| VEN-SMTP-UNKNOWN | Vendor risk owner | Identity owner | `SEV-SECURITY-PLAN`, `SEV-SUPABASE-CONFIG` | `TRUST-VENDOR-01`, `TRUST-DATA-04`, `TRUST-ID-01` |
| VEN-SHEETJS-CDN | Vendor risk owner | Product security owner | `SEV-WEB-DEPENDENCIES`, `SEV-LOCKFILE` | `TRUST-VENDOR-01`, `TRUST-SDLC-02` |
| VEN-GOOGLE-FONTS | Vendor risk owner | Privacy owner | `SEV-CASE-RENDER` | `TRUST-VENDOR-01`, `TRUST-DATA-04`, `TRUST-SDLC-02` |

## Evidências da baseline

| ID | Tipo | Referência | Capturada | Freshness | Descrição |
| --- | --- | --- | --- | --- | --- |
| SEV-AGENTS-SCOPE | repository_file | `carlosevg100/offroad@b2e389757995859cf6a0b250e051d83ba0b53163:AGENTS.md` | 2026-09-07T09:43:00.000-03:00 | immutable @ b2e389757995859cf6a0b250e051d83ba0b53163 | Repository operating rules and observed deployment boundaries. |
| SEV-SECURITY-PLAN | design_reference | `carlosevg100/offroad@b2e389757995859cf6a0b250e051d83ba0b53163:docs/security/ENTERPRISE_SECURITY_COMPLIANCE_READINESS_PLAN.md` | 2026-09-07T09:43:00.000-03:00 | immutable @ b2e389757995859cf6a0b250e051d83ba0b53163 | Security readiness design reference; this is not proof of current operation. |
| SEV-ENV-NAMES | configuration | `carlosevg100/offroad@b2e389757995859cf6a0b250e051d83ba0b53163:.env.example` | 2026-09-07T09:43:00.000-03:00 | immutable @ b2e389757995859cf6a0b250e051d83ba0b53163 | Configuration names and secret-store expectations without secret values. |
| SEV-WORKER-TASK | configuration | `carlosevg100/offroad@b2e389757995859cf6a0b250e051d83ba0b53163:apps/document-worker/task-definition.json` | 2026-09-07T09:43:00.000-03:00 | immutable @ b2e389757995859cf6a0b250e051d83ba0b53163 | Worker runtime, role names, provider switches and secret references by name. |
| SEV-WORKER-RUNTIME | repository_file | `carlosevg100/offroad@b2e389757995859cf6a0b250e051d83ba0b53163:apps/document-worker/src/main.ts` | 2026-09-07T09:43:00.000-03:00 | immutable @ b2e389757995859cf6a0b250e051d83ba0b53163 | Worker authentication, capability use, logging and provider wiring. |
| SEV-WORKER-CONFIG | repository_file | `carlosevg100/offroad@b2e389757995859cf6a0b250e051d83ba0b53163:apps/document-worker/src/config.ts` | 2026-09-07T09:43:00.000-03:00 | immutable @ b2e389757995859cf6a0b250e051d83ba0b53163 | Fail-closed worker configuration and safe configuration description. |
| SEV-DEPLOY-WORKER | configuration | `carlosevg100/offroad@b2e389757995859cf6a0b250e051d83ba0b53163:.github/workflows/deploy-worker.yml` | 2026-09-07T09:43:00.000-03:00 | immutable @ b2e389757995859cf6a0b250e051d83ba0b53163 | OIDC-based worker build and deployment workflow. |
| SEV-QUALITY-WORKFLOW | configuration | `carlosevg100/offroad@b2e389757995859cf6a0b250e051d83ba0b53163:.github/workflows/quality.yml` | 2026-09-07T09:43:00.000-03:00 | immutable @ b2e389757995859cf6a0b250e051d83ba0b53163 | Quality, database and application test workflow definition. |
| SEV-CODEOWNERS | configuration | `carlosevg100/offroad@b2e389757995859cf6a0b250e051d83ba0b53163:.github/CODEOWNERS` | 2026-09-07T09:43:00.000-03:00 | immutable @ b2e389757995859cf6a0b250e051d83ba0b53163 | Repository ownership boundary; live privileged grants and factors remain outside this file. |
| SEV-SECURITY-WORKFLOW | configuration | `carlosevg100/offroad@b2e389757995859cf6a0b250e051d83ba0b53163:.github/workflows/security.yml` | 2026-09-07T09:43:00.000-03:00 | immutable @ b2e389757995859cf6a0b250e051d83ba0b53163 | CodeQL, dependency review, repository scan, SBOM and image scan workflow. |
| SEV-SUPABASE-CONFIG | configuration | `carlosevg100/offroad@b2e389757995859cf6a0b250e051d83ba0b53163:supabase/config.toml` | 2026-09-07T09:43:00.000-03:00 | immutable @ b2e389757995859cf6a0b250e051d83ba0b53163 | Local Supabase Auth, database and storage baseline. |
| SEV-RLS-TEST | automated_test | `carlosevg100/offroad@b2e389757995859cf6a0b250e051d83ba0b53163:supabase/tests/rls_non_interference.sql` | 2026-09-07T09:43:00.000-03:00 | immutable @ b2e389757995859cf6a0b250e051d83ba0b53163 | Tenant non-interference and authorization regression suite. |
| SEV-MODEL-DATA-POLICY | repository_file | `carlosevg100/offroad@b2e389757995859cf6a0b250e051d83ba0b53163:packages/model-gateway/src/data-policy.ts` | 2026-09-07T09:43:00.000-03:00 | immutable @ b2e389757995859cf6a0b250e051d83ba0b53163 | Provider data policy contract and fail-closed evaluator implementation. |
| SEV-MODEL-DATA-POLICY-TEST | automated_test | `carlosevg100/offroad@b2e389757995859cf6a0b250e051d83ba0b53163:packages/model-gateway/src/index.test.ts` | 2026-09-07T09:43:00.000-03:00 | immutable @ b2e389757995859cf6a0b250e051d83ba0b53163 | Regression tests for provider data-policy decisions. |
| SEV-MODEL-POLICY | configuration | `carlosevg100/offroad@b2e389757995859cf6a0b250e051d83ba0b53163:packages/model-gateway/src/policy.ts` | 2026-09-07T09:43:00.000-03:00 | immutable @ b2e389757995859cf6a0b250e051d83ba0b53163 | Model routing, allowlist, fallback and workload limits. |
| SEV-PUBLIC-RESEARCH | repository_file | `carlosevg100/offroad@b2e389757995859cf6a0b250e051d83ba0b53163:packages/public-research/src/source-registry.ts` | 2026-09-07T09:43:00.000-03:00 | immutable @ b2e389757995859cf6a0b250e051d83ba0b53163 | Known public research providers and activation configuration. |
| SEV-WEB-OBSERVABILITY | configuration | `carlosevg100/offroad@b2e389757995859cf6a0b250e051d83ba0b53163:apps/web/src/instrumentation-client.ts` | 2026-09-07T09:43:00.000-03:00 | immutable @ b2e389757995859cf6a0b250e051d83ba0b53163 | Conditional Sentry and PostHog configuration with privacy restrictions. |
| SEV-WEB-UPLOAD | repository_file | `carlosevg100/offroad@b2e389757995859cf6a0b250e051d83ba0b53163:apps/web/src/lib/intake/upload-client.ts` | 2026-09-07T09:43:00.000-03:00 | immutable @ b2e389757995859cf6a0b250e051d83ba0b53163 | Browser-to-private-storage document upload path. |
| SEV-WEB-DEPENDENCIES | repository_file | `carlosevg100/offroad@b2e389757995859cf6a0b250e051d83ba0b53163:apps/web/package.json` | 2026-09-07T09:43:00.000-03:00 | immutable @ b2e389757995859cf6a0b250e051d83ba0b53163 | Web runtime and direct software dependencies. |
| SEV-LOCKFILE | configuration | `carlosevg100/offroad@b2e389757995859cf6a0b250e051d83ba0b53163:pnpm-lock.yaml` | 2026-09-07T09:43:00.000-03:00 | immutable @ b2e389757995859cf6a0b250e051d83ba0b53163 | Pinned dependency resolution, including external package sources. |
| SEV-CASE-RENDER | repository_file | `carlosevg100/offroad@b2e389757995859cf6a0b250e051d83ba0b53163:packages/case-render/src/html.ts` | 2026-09-07T09:43:00.000-03:00 | immutable @ b2e389757995859cf6a0b250e051d83ba0b53163 | Generated HTML material and its external font-loading boundary. |
| SEV-ROLLOUT-ORDER | repository_file | `carlosevg100/offroad@b2e389757995859cf6a0b250e051d83ba0b53163:docs/build/ACCEPTANCE_EVIDENCE.md` | 2026-09-07T09:43:00.000-03:00 | immutable @ b2e389757995859cf6a0b250e051d83ba0b53163 | Recorded rollout where hosted migrations had to be reconciled before the worker could safely continue. |
| SEV-AWS-DEPLOY-ROLE-SNAPSHOT | external_snapshot | `docs/security/evidence/aws-worker-rollout-diagnostics-2026-09-07.json` | 2026-09-07T09:20:00.000-03:00 | válida até 2026-09-14T09:20:00.000-03:00 | Read-only IAM inspection confirmed that rollout diagnostic actions used by the workflow are absent from the deploy role. Hash: sha256:db46a68df98bc8c3f8038238708d5dc542b973f2a9184e6b265c4e5c522dd5d0. Collector: manual-read-only-policy-inspection@1 (authorized cloud administrator). |

## Resultado do validador

Nenhum blocker estrutural.

Nenhum warning estrutural.

A existência desta vista não fecha as lacunas listadas. Evidência live, contratos, owners nominais e operação ao longo do tempo precisam ser coletados em tarefas posteriores.
