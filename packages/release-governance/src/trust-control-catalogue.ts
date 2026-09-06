import type {TrustControlActivity, TrustControlCatalogue, TrustControlDefinition, TrustFramework} from "./control-register";
import type {TrustControlDomain, TrustEvidenceKind, TrustEnvironment} from "./trust-controls";

const frameworkSources: Record<TrustFramework, string> = {
  soc2_tsc_2022: "https://www.aicpa-cima.com/resources/download/2017-trust-services-criteria-with-revised-points-of-focus-2022",
  iso27001_2022: "https://www.iso.org/standard/27001",
  nist_csf_2_0: "https://www.nist.gov/publications/nist-cybersecurity-framework-csf-20",
  lgpd: "https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709compilado.htm",
  gdpr: "https://eur-lex.europa.eu/eli/reg/2016/679/oj",
  ccpa: "https://oag.ca.gov/privacy/ccpa",
  contractual: "https://offroad.capital/security",
};

type DefinitionInput = Pick<TrustControlDefinition,
  "controlId" | "domain" | "title" | "objective" | "criticality" | "applicability" | "ownerRole"
  | "riskRefs" | "implementationRefs" | "testProcedureRefs" | "reviewCadence"> & {
  soc2: string;
  iso: string;
  nist: string;
  lgpd?: string;
  evidence: Array<{kind: TrustEvidenceKind; environments: TrustEnvironment[]; cadence: TrustControlDefinition["reviewCadence"]}>;
};

function definition(input: DefinitionInput): TrustControlDefinition {
  const frameworkMappings: TrustControlDefinition["frameworkMappings"] = [
    workingMapping("soc2_tsc_2022", input.soc2),
    workingMapping("iso27001_2022", input.iso),
    workingMapping("nist_csf_2_0", input.nist),
  ];
  if (input.lgpd) frameworkMappings.push(workingMapping("lgpd", input.lgpd));
  return {
    controlId: input.controlId,
    domain: input.domain,
    title: input.title,
    objective: input.objective,
    criticality: input.criticality,
    applicability: input.applicability,
    ownerRole: input.ownerRole,
    riskRefs: input.riskRefs,
    frameworkMappings,
    implementationRefs: input.implementationRefs,
    testProcedureRefs: input.testProcedureRefs,
    evidenceExpectations: input.evidence,
    reviewCadence: input.reviewCadence,
  };
}

function workingMapping(framework: TrustFramework, reference: string): TrustControlDefinition["frameworkMappings"][number] {
  return {framework, reference, assurance: "internal_working_map", validatedBy: null, validatedAt: null};
}

const governanceEvidence: DefinitionInput["evidence"] = [
  {kind: "design", environments: ["governance"], cadence: "annual"},
  {kind: "operating_record", environments: ["governance"], cadence: "quarterly"},
];
const technicalEvidence: DefinitionInput["evidence"] = [
  {kind: "automated_test", environments: ["staging"], cadence: "event"},
  {kind: "configuration_snapshot", environments: ["production"], cadence: "monthly"},
];

const controls: TrustControlDefinition[] = [
  definition({
    controlId: "TRUST-GOV-01", domain: "governance", title: "Security governance and risk management",
    objective: "Define scope, accountable roles, risk appetite, risk assessment and management review for the Offroad trust program.",
    criticality: "critical", applicability: "baseline", ownerRole: "Executive security owner",
    riskRefs: ["RISK-GOVERNANCE-GAP", "RISK-UNOWNED-SECURITY"], soc2: "CC1, CC3, CC4", iso: "Clauses 4-10; Annex A 5.1, 5.2, 5.4", nist: "GV.OC, GV.RM, GV.RR, GV.PO",
    implementationRefs: ["docs/security/ENTERPRISE_SECURITY_COMPLIANCE_READINESS_PLAN.md"], testProcedureRefs: ["PROC-GOV-QUARTERLY-REVIEW"], evidence: governanceEvidence, reviewCadence: "quarterly",
  }),
  definition({
    controlId: "TRUST-GOV-02", domain: "governance", title: "Control exceptions and assurance claims",
    objective: "Keep exceptions time-bounded and prevent internal implementation states from being presented as external assurance.",
    criticality: "high", applicability: "baseline", ownerRole: "Security governance owner",
    riskRefs: ["RISK-SILENT-EXCEPTION", "RISK-FALSE-ASSURANCE"], soc2: "CC3, CC4, CC5", iso: "Clauses 6.1, 9.1, 10.1", nist: "GV.RM, GV.OV",
    implementationRefs: ["packages/release-governance/src/trust-controls.ts"], testProcedureRefs: ["TEST-TRUST-ASSURANCE-CLAIM"], evidence: governanceEvidence, reviewCadence: "monthly",
  }),
  definition({
    controlId: "TRUST-ID-01", domain: "identity", title: "Privileged identity and access lifecycle",
    objective: "Require strong authentication, least privilege, timely deprovisioning and review for privileged access.",
    criticality: "critical", applicability: "baseline", ownerRole: "Identity owner",
    riskRefs: ["RISK-ACCOUNT-TAKEOVER", "RISK-ORPHANED-ACCESS"], soc2: "CC6.1-CC6.3", iso: "Annex A 5.15-5.18, 8.2, 8.5", nist: "PR.AA", lgpd: "Articles 46-49",
    implementationRefs: [], testProcedureRefs: ["PROC-PRIVILEGED-ACCESS-REVIEW", "TEST-AAL2-ENFORCEMENT"], evidence: technicalEvidence, reviewCadence: "quarterly",
  }),
  definition({
    controlId: "TRUST-ID-02", domain: "identity", title: "Enterprise federation and provisioning",
    objective: "Support verified-domain SSO and governed provisioning, deprovisioning and session control for enterprise tenants.",
    criticality: "high", applicability: "enterprise", ownerRole: "Enterprise identity owner",
    riskRefs: ["RISK-ENTERPRISE-IDENTITY-DRIFT"], soc2: "CC6.1-CC6.3", iso: "Annex A 5.16-5.18, 8.5", nist: "PR.AA",
    implementationRefs: [], testProcedureRefs: ["TEST-SSO-SCIM-LIFECYCLE"], evidence: technicalEvidence, reviewCadence: "quarterly",
  }),
  definition({
    controlId: "TRUST-DATA-01", domain: "data", title: "Tenant isolation and non-interference",
    objective: "Prevent one organization from reading, changing, retrieving or exporting another organization\'s data through every data path.",
    criticality: "critical", applicability: "baseline", ownerRole: "Data security owner",
    riskRefs: ["RISK-CROSS-TENANT-DISCLOSURE", "RISK-BOLA-IDOR"], soc2: "CC6.1, CC6.3, C1.1", iso: "Annex A 5.15, 8.3, 8.11", nist: "PR.AA, PR.DS", lgpd: "Articles 46-49",
    implementationRefs: ["supabase/tests/rls_non_interference.sql"], testProcedureRefs: ["TEST-RLS-NON-INTERFERENCE", "TEST-STORAGE-EXPORT-NON-INTERFERENCE"], evidence: technicalEvidence, reviewCadence: "event",
  }),
  definition({
    controlId: "TRUST-DATA-02", domain: "data", title: "Data classification and lifecycle",
    objective: "Bind each data class to purpose, region, retention, legal hold, export and verifiable deletion behavior.",
    criticality: "critical", applicability: "baseline", ownerRole: "Data governance owner",
    riskRefs: ["RISK-UNBOUNDED-RETENTION", "RISK-DATA-MISUSE"], soc2: "CC6.5, C1.1-C1.2, P4-P5", iso: "Annex A 5.9, 5.12-5.14, 8.10-8.12", nist: "ID.AM, PR.DS", lgpd: "Articles 6, 15-18, 37, 46",
    implementationRefs: ["packages/model-gateway/src/data-policy.ts"], testProcedureRefs: ["TEST-DATA-POLICY-BY-CLASS", "TEST-DELETION-PROPAGATION"], evidence: technicalEvidence, reviewCadence: "event",
  }),
  definition({
    controlId: "TRUST-DATA-03", domain: "data", title: "Cryptography and secret management",
    objective: "Protect data and credentials in transit, at rest and during rotation using scoped workload identities and managed secrets.",
    criticality: "critical", applicability: "baseline", ownerRole: "Platform security owner",
    riskRefs: ["RISK-SECRET-EXPOSURE", "RISK-KEY-COMPROMISE"], soc2: "CC6.1, CC6.6, CC6.7", iso: "Annex A 5.17, 8.24", nist: "PR.AA, PR.DS", lgpd: "Articles 46-49",
    implementationRefs: [".github/workflows/deploy-worker.yml"], testProcedureRefs: ["TEST-SECRET-SCAN", "EXERCISE-SECRET-ROTATION"], evidence: technicalEvidence, reviewCadence: "quarterly",
  }),
  definition({
    controlId: "TRUST-DATA-04", domain: "data", title: "Privacy rights, records and transfers",
    objective: "Maintain treatment records, legal basis, rights handling, transfer safeguards and privacy impact assessments.",
    criticality: "high", applicability: "conditional", ownerRole: "Privacy owner",
    riskRefs: ["RISK-UNLAWFUL-PROCESSING", "RISK-UNFULFILLED-DATA-RIGHT"], soc2: "P1-P8", iso: "Annex A 5.31, 5.34", nist: "GV.OC, GV.RM", lgpd: "Articles 7, 9, 18, 33, 37, 38, 46-48",
    implementationRefs: [], testProcedureRefs: ["EXERCISE-DATA-SUBJECT-REQUEST", "PROC-DPIA-REVIEW"], evidence: governanceEvidence, reviewCadence: "quarterly",
  }),
  definition({
    controlId: "TRUST-APP-01", domain: "application", title: "Server-side authorization",
    objective: "Enforce organization, project, object and action authority on the server independently of model or client claims.",
    criticality: "critical", applicability: "baseline", ownerRole: "Application security owner",
    riskRefs: ["RISK-AUTHORIZATION-BYPASS", "RISK-CLIENT-TRUST"], soc2: "CC6.1-CC6.3", iso: "Annex A 5.15, 8.3, 8.26", nist: "PR.AA", lgpd: "Articles 46-49",
    implementationRefs: ["supabase/tests/rls_non_interference.sql"], testProcedureRefs: ["TEST-SERVER-AUTHORIZATION-MATRIX"], evidence: technicalEvidence, reviewCadence: "event",
  }),
  definition({
    controlId: "TRUST-APP-02", domain: "application", title: "Application and API abuse resistance",
    objective: "Protect application and API surfaces from injection, SSRF, CSRF, unsafe redirects, exhaustion and sensitive error disclosure.",
    criticality: "critical", applicability: "baseline", ownerRole: "Application security owner",
    riskRefs: ["RISK-INJECTION", "RISK-SSRF", "RISK-RESOURCE-EXHAUSTION"], soc2: "CC6.6, CC7.1, CC7.2", iso: "Annex A 8.20, 8.25, 8.26", nist: "PR.PS, DE.CM",
    implementationRefs: [".github/workflows/security.yml"], testProcedureRefs: ["TEST-OWASP-API-ASVS", "TEST-RATE-LIMITS"], evidence: technicalEvidence, reviewCadence: "event",
  }),
  definition({
    controlId: "TRUST-DOC-01", domain: "documents", title: "Hostile document intake",
    objective: "Quarantine uploads, validate type, scan malware and enforce size, expansion and processing limits before trusted use.",
    criticality: "critical", applicability: "baseline", ownerRole: "Document platform owner",
    riskRefs: ["RISK-MALICIOUS-UPLOAD", "RISK-ARCHIVE-BOMB", "RISK-POLYGLOT"], soc2: "CC6.6, CC7.1", iso: "Annex A 8.7, 8.26", nist: "PR.PS, DE.CM",
    implementationRefs: [], testProcedureRefs: ["TEST-HOSTILE-FILE-CORPUS", "TEST-QUARANTINE-FAIL-CLOSED"], evidence: technicalEvidence, reviewCadence: "event",
  }),
  definition({
    controlId: "TRUST-DOC-02", domain: "documents", title: "Parser isolation and active-content neutralization",
    objective: "Run parsers without privilege or uncontrolled egress and neutralize macros, scripts, external formulas and embedded payloads.",
    criticality: "critical", applicability: "baseline", ownerRole: "Document platform owner",
    riskRefs: ["RISK-PARSER-ESCAPE", "RISK-ACTIVE-CONTENT", "RISK-FORMULA-INJECTION"], soc2: "CC6.6, CC7.1", iso: "Annex A 8.7, 8.19, 8.22", nist: "PR.PS, PR.IR",
    implementationRefs: [], testProcedureRefs: ["TEST-PARSER-SANDBOX", "TEST-ACTIVE-CONTENT-NEUTRALIZATION"], evidence: technicalEvidence, reviewCadence: "event",
  }),
  definition({
    controlId: "TRUST-AI-01", domain: "ai", title: "Provider and data-use policy",
    objective: "Allow each provider, model and tool only for approved purpose, data class, region, retention and training posture.",
    criticality: "critical", applicability: "baseline", ownerRole: "AI governance owner",
    riskRefs: ["RISK-PROVIDER-DATA-MISUSE", "RISK-FALLBACK-DOWNGRADE"], soc2: "CC6.1, CC9.2, C1.1", iso: "Annex A 5.19-5.23, 5.31", nist: "GV.SC, PR.DS", lgpd: "Articles 33, 37, 46",
    implementationRefs: ["packages/model-gateway/src/policy.ts", "packages/model-gateway/src/data-policy.ts"], testProcedureRefs: ["TEST-PROVIDER-POLICY-FAIL-CLOSED"], evidence: technicalEvidence, reviewCadence: "event",
  }),
  definition({
    controlId: "TRUST-AI-02", domain: "ai", title: "Prompt injection and exfiltration containment",
    objective: "Treat retrieved content and tool output as untrusted data that cannot change authority, policy, destination or tool permissions.",
    criticality: "critical", applicability: "baseline", ownerRole: "AI security owner",
    riskRefs: ["RISK-PROMPT-INJECTION", "RISK-CONTEXT-EXFILTRATION", "RISK-TOOL-MISUSE"], soc2: "CC6.1, CC6.6, CC7.1", iso: "Annex A 8.3, 8.12, 8.26", nist: "PR.DS, PR.PS, DE.CM",
    implementationRefs: ["packages/governed-retrieval/src/schema.ts"], testProcedureRefs: ["TEST-AI-ADVERSARIAL-CORPUS", "TEST-CANARY-EXFILTRATION"], evidence: technicalEvidence, reviewCadence: "event",
  }),
  definition({
    controlId: "TRUST-AI-03", domain: "ai", title: "Model change, evaluation and fallback governance",
    objective: "Require scoped evaluation, shadow or canary evidence, rollback and protection-preserving fallback for every model change.",
    criticality: "high", applicability: "baseline", ownerRole: "AI reliability owner",
    riskRefs: ["RISK-MODEL-REGRESSION", "RISK-FALLBACK-DOWNGRADE"], soc2: "CC7.2, CC8.1, PI1.1", iso: "Annex A 8.25, 8.29, 8.32", nist: "ID.IM, PR.PS, DE.CM",
    implementationRefs: ["packages/release-governance/src/promotion.ts", "packages/release-governance/src/comparison.ts"], testProcedureRefs: ["TEST-MODEL-REGRESSION", "TEST-PROVIDER-FAILOVER-BOUNDARIES"], evidence: technicalEvidence, reviewCadence: "event",
  }),
  definition({
    controlId: "TRUST-SDLC-01", domain: "sdlc", title: "Secure change and release governance",
    objective: "Make sensitive changes reviewable, testable, attributable, reversible and tied to control evidence before promotion.",
    criticality: "critical", applicability: "baseline", ownerRole: "Engineering governance owner",
    riskRefs: ["RISK-UNREVIEWED-CHANGE", "RISK-UNSAFE-DEPLOY"], soc2: "CC8.1", iso: "Annex A 8.25, 8.29, 8.31, 8.32", nist: "PR.PS, ID.IM",
    implementationRefs: [".github/workflows/quality.yml", ".github/pull_request_template.md", "AGENTS.md"], testProcedureRefs: ["TEST-RELEASE-TRUST-GATE", "PROC-SENSITIVE-CODE-REVIEW"], evidence: technicalEvidence, reviewCadence: "event",
  }),
  definition({
    controlId: "TRUST-SDLC-02", domain: "sdlc", title: "Vulnerability and software supply-chain management",
    objective: "Discover, prioritize and remediate code, dependency, container, secret and infrastructure risk with provenance and SLA.",
    criticality: "high", applicability: "baseline", ownerRole: "Product security owner",
    riskRefs: ["RISK-KNOWN-VULNERABILITY", "RISK-SUPPLY-CHAIN"], soc2: "CC7.1, CC7.2, CC8.1", iso: "Annex A 8.8, 8.9, 8.19, 8.30", nist: "ID.RA, PR.PS, DE.CM",
    implementationRefs: [".github/workflows/security.yml"], testProcedureRefs: ["TEST-SAST-SCA-SECRET-CONTAINER-IAC", "PROC-VULNERABILITY-SLA"], evidence: technicalEvidence, reviewCadence: "monthly",
  }),
  definition({
    controlId: "TRUST-CLOUD-01", domain: "cloud", title: "Cloud identity and configuration hardening",
    objective: "Enforce least privilege, account protections, configuration baselines, network boundaries and monitored drift across cloud services.",
    criticality: "critical", applicability: "baseline", ownerRole: "Cloud security owner",
    riskRefs: ["RISK-CLOUD-MISCONFIGURATION", "RISK-EXCESSIVE-IAM"], soc2: "CC6.1, CC6.6, CC7.1", iso: "Annex A 5.23, 8.2, 8.9, 8.20", nist: "PR.AA, PR.PS, DE.CM",
    implementationRefs: [".github/workflows/deploy-worker.yml"], testProcedureRefs: ["PROC-CLOUD-CONFIG-REVIEW", "TEST-IAM-LEAST-PRIVILEGE"], evidence: technicalEvidence, reviewCadence: "monthly",
  }),
  definition({
    controlId: "TRUST-CLOUD-02", domain: "cloud", title: "Environment separation and deployment provenance",
    objective: "Prevent production data or credentials from crossing into lower environments and make deployed artifacts immutable and attributable.",
    criticality: "critical", applicability: "baseline", ownerRole: "Platform engineering owner",
    riskRefs: ["RISK-ENVIRONMENT-CROSSOVER", "RISK-UNTRUSTED-ARTIFACT"], soc2: "CC6.1, CC8.1", iso: "Annex A 8.22, 8.31, 8.32", nist: "PR.DS, PR.PS",
    implementationRefs: [".github/workflows/deploy-worker.yml", ".github/workflows/quality.yml"], testProcedureRefs: ["TEST-NO-PRODUCTION-DATA-IN-LOWER-ENV", "TEST-DEPLOY-PROVENANCE"], evidence: technicalEvidence, reviewCadence: "event",
  }),
  definition({
    controlId: "TRUST-OPS-01", domain: "operations", title: "Security logging, detection and incident response",
    objective: "Capture privacy-safe security events, detect abnormal behavior and execute owned incident procedures with preserved evidence.",
    criticality: "critical", applicability: "baseline", ownerRole: "Security operations owner",
    riskRefs: ["RISK-UNDETECTED-INCIDENT", "RISK-INADEQUATE-RESPONSE"], soc2: "CC7.2-CC7.5", iso: "Annex A 5.24-5.28, 8.15-8.16", nist: "DE.CM, DE.AE, RS.MA, RS.AN", lgpd: "Articles 46-48",
    implementationRefs: [], testProcedureRefs: ["EXERCISE-SECURITY-INCIDENT", "TEST-SENSITIVE-TELEMETRY-CANARY"], evidence: technicalEvidence, reviewCadence: "continuous",
  }),
  definition({
    controlId: "TRUST-OPS-02", domain: "operations", title: "Backup, recovery and continuity",
    objective: "Define service objectives and prove recoverability of data, storage, web and workers through isolated exercises.",
    criticality: "critical", applicability: "baseline", ownerRole: "Reliability owner",
    riskRefs: ["RISK-IRRECOVERABLE-LOSS", "RISK-PROLONGED-OUTAGE"], soc2: "A1.2-A1.3, CC7.4", iso: "Annex A 5.29-5.30, 8.13-8.14", nist: "PR.IR, RC.RP",
    implementationRefs: [], testProcedureRefs: ["EXERCISE-POSTGRES-STORAGE-RESTORE", "EXERCISE-SERVICE-RECONSTRUCTION"], evidence: technicalEvidence, reviewCadence: "quarterly",
  }),
  definition({
    controlId: "TRUST-OPS-03", domain: "operations", title: "Capacity, containment and kill switches",
    objective: "Bound workload cost and resource use and stop a tenant, provider, tool or effect without disabling unrelated safe work.",
    criticality: "critical", applicability: "baseline", ownerRole: "Reliability owner",
    riskRefs: ["RISK-RESOURCE-EXHAUSTION", "RISK-UNCONTAINED-EFFECT"], soc2: "A1.1-A1.3, CC7.3-CC7.4", iso: "Annex A 8.6, 8.14, 8.20", nist: "PR.IR, RS.MI",
    implementationRefs: ["packages/model-gateway/src/policy.ts"], testProcedureRefs: ["TEST-WORKLOAD-BUDGET", "EXERCISE-SCOPED-KILL-SWITCH"], evidence: technicalEvidence, reviewCadence: "quarterly",
  }),
  definition({
    controlId: "TRUST-VENDOR-01", domain: "vendor", title: "Vendor and subprocessor lifecycle",
    objective: "Assess, contract, monitor and offboard vendors by data access, criticality, retention, region and incident obligations.",
    criticality: "high", applicability: "baseline", ownerRole: "Vendor risk owner",
    riskRefs: ["RISK-SUBPROCESSOR-FAILURE", "RISK-CONTRACTUAL-DATA-GAP"], soc2: "CC9.2, C1.1", iso: "Annex A 5.19-5.23", nist: "GV.SC", lgpd: "Articles 33, 37, 39, 46-48",
    implementationRefs: [], testProcedureRefs: ["PROC-VENDOR-DUE-DILIGENCE", "PROC-SUBPROCESSOR-REVIEW"], evidence: governanceEvidence, reviewCadence: "quarterly",
  }),
  definition({
    controlId: "TRUST-PEOPLE-01", domain: "people", title: "Personnel security and awareness",
    objective: "Apply confidentiality, role-based training, joiner-mover-leaver controls and recurring access review to every in-scope person.",
    criticality: "high", applicability: "baseline", ownerRole: "People operations owner",
    riskRefs: ["RISK-INSIDER-MISUSE", "RISK-UNTRAINED-ACCESS"], soc2: "CC1.4, CC2.2, CC6.2", iso: "Annex A 6.1-6.6", nist: "PR.AT, PR.AA", lgpd: "Articles 46-50",
    implementationRefs: [], testProcedureRefs: ["PROC-JOINER-MOVER-LEAVER", "PROC-SECURITY-TRAINING"], evidence: governanceEvidence, reviewCadence: "quarterly",
  }),
];

type ActivityGroupInput = {
  prefix: string;
  domain: TrustControlDomain;
  titles: string[];
  defaultObjectiveControlIds: string[];
  objectiveOverrides?: Record<number, string[]>;
};

function activityGroup(input: ActivityGroupInput): TrustControlActivity[] {
  return input.titles.map((title, index) => ({
    activityId: `${input.prefix}-${String(index + 1).padStart(2, "0")}`,
    domain: input.domain,
    title,
    objectiveControlIds: input.objectiveOverrides?.[index + 1] ?? input.defaultObjectiveControlIds,
    sourceRef: "docs/security/ENTERPRISE_SECURITY_COMPLIANCE_READINESS_PLAN.md#6-catálogo-técnico-e-operacional-de-controles",
  }));
}

const activities: TrustControlActivity[] = [
  ...activityGroup({
    prefix: "GOV", domain: "governance", defaultObjectiveControlIds: ["TRUST-GOV-01"],
    objectiveOverrides: {7: ["TRUST-GOV-02"]},
    titles: ["Escopo do ISMS", "Política de segurança", "Metodologia de risco", "Registro de riscos", "Statement of Applicability", "Papéis e segregação", "Exceções", "Objetivos e métricas", "Auditoria interna", "Management review", "Melhoria contínua"],
  }),
  ...activityGroup({
    prefix: "IAM", domain: "identity", defaultObjectiveControlIds: ["TRUST-ID-01"],
    objectiveOverrides: {2: ["TRUST-ID-02"], 3: ["TRUST-ID-02"], 4: ["TRUST-ID-02"]},
    titles: ["MFA administrativo obrigatório", "MFA enterprise configurável", "SSO SAML/OIDC", "SCIM/JIT", "RBAC", "Recertificação", "Joiner/mover/leaver", "Sessões", "Acesso privilegiado", "Break-glass", "Suporte", "Service identities"],
  }),
  ...activityGroup({
    prefix: "DATA", domain: "data", defaultObjectiveControlIds: ["TRUST-DATA-02"],
    objectiveOverrides: {
      3: ["TRUST-DATA-01"], 4: ["TRUST-DATA-03"], 5: ["TRUST-DATA-03"], 6: ["TRUST-DATA-03"],
      10: ["TRUST-OPS-02"], 11: ["TRUST-OPS-02"], 14: ["TRUST-DATA-04"], 15: ["TRUST-DATA-04"],
    },
    titles: ["Classificação", "Inventário/linhagem", "Tenant isolation", "Criptografia em trânsito", "Criptografia em repouso", "Chaves", "Retenção", "Exclusão", "Exportação", "Backup", "Restauração", "DLP/logging", "Produção fora de não-produção", "Residência e transferência", "Direitos do titular"],
  }),
  ...activityGroup({
    prefix: "APP", domain: "application", defaultObjectiveControlIds: ["TRUST-APP-02"],
    objectiveOverrides: {
      1: ["TRUST-APP-02", "TRUST-GOV-01"], 2: ["TRUST-APP-01"], 3: ["TRUST-APP-01", "TRUST-DATA-01"],
      8: ["TRUST-APP-01", "TRUST-DATA-01"], 9: ["TRUST-APP-01"], 11: ["TRUST-AI-03"], 12: ["TRUST-APP-01", "TRUST-ID-01"],
    },
    titles: ["Threat model", "Autorização server-side", "RLS current-state", "Validação de entrada", "Saída e browser", "CSRF/CORS/redirect", "Rate limiting", "Storage", "Funções privilegiadas", "Denial of service", "Imutabilidade/linhagem", "Admin plane"],
  }),
  ...activityGroup({
    prefix: "DOC", domain: "documents", defaultObjectiveControlIds: ["TRUST-DOC-01"],
    objectiveOverrides: {
      4: ["TRUST-DOC-02"], 5: ["TRUST-DOC-02"], 6: ["TRUST-DOC-02"], 7: ["TRUST-DOC-02"],
      8: ["TRUST-AI-02"], 9: ["TRUST-DOC-02"], 10: ["TRUST-DOC-01", "TRUST-DOC-02", "TRUST-AI-02"],
    },
    titles: ["Quarentena", "Detecção de tipo", "Malware", "Sandbox", "Egress", "Parser hardening", "Conteúdo ativo", "Prompt injection", "Proveniência", "Adversariais"],
  }),
  ...activityGroup({
    prefix: "AI", domain: "ai", defaultObjectiveControlIds: ["TRUST-AI-01"],
    objectiveOverrides: {
      3: ["TRUST-AI-03"], 4: ["TRUST-AI-02"], 5: ["TRUST-AI-02"], 6: ["TRUST-AI-02"],
      7: ["TRUST-AI-01"], 8: ["TRUST-AI-03"], 9: ["TRUST-AI-03"], 10: ["TRUST-AI-03"],
      11: ["TRUST-AI-02"], 12: ["TRUST-AI-03", "TRUST-OPS-03"],
    },
    titles: ["Registro de sistemas de IA", "Provider assurance", "Routing fail-closed", "Tool authorization", "Prompt/data separation", "Exfiltração", "Model logging", "Output integrity", "Human oversight", "Mudança de modelo", "Abuse monitoring", "Kill switch"],
  }),
  ...activityGroup({
    prefix: "SDLC", domain: "sdlc", defaultObjectiveControlIds: ["TRUST-SDLC-01"],
    objectiveOverrides: {2: ["TRUST-SDLC-02"], 3: ["TRUST-SDLC-02"], 4: ["TRUST-SDLC-02"], 5: ["TRUST-SDLC-02"], 6: ["TRUST-SDLC-02"], 11: ["TRUST-SDLC-02"], 12: ["TRUST-SDLC-02"]},
    titles: ["Branch protection", "Assinatura/proveniência", "SAST", "SCA", "Secret scanning", "Container/IaC", "Segurança de testes", "Revisão de migrations", "Ambientes", "Releases", "Vulnerability SLA", "Secure coding"],
  }),
  ...activityGroup({
    prefix: "CLOUD", domain: "cloud", defaultObjectiveControlIds: ["TRUST-CLOUD-01"],
    objectiveOverrides: {7: ["TRUST-CLOUD-02"], 10: ["TRUST-CLOUD-02"], 12: ["TRUST-CLOUD-02"]},
    titles: ["Inventário cloud", "Conta raiz AWS", "IAM AWS", "Detecção AWS", "Rede ECS", "ECS hardening", "ECR", "Secrets Manager", "Supabase", "Vercel", "DNS/TLS", "Config drift"],
  }),
  ...activityGroup({
    prefix: "OPS", domain: "operations", defaultObjectiveControlIds: ["TRUST-OPS-01"],
    objectiveOverrides: {
      5: ["TRUST-OPS-01", "TRUST-OPS-02"], 7: ["TRUST-OPS-02"], 8: ["TRUST-OPS-02"],
      9: ["TRUST-OPS-02"], 10: ["TRUST-OPS-03"], 11: ["TRUST-OPS-01"], 12: ["TRUST-OPS-01", "TRUST-GOV-01"],
    },
    titles: ["Logs de segurança", "Alertas", "Incident response", "Classificação", "Tabletop", "Forensics", "BCP", "DR", "Resilience", "Capacity", "Status/comunicação", "Postmortem"],
  }),
  ...activityGroup({
    prefix: "VEND", domain: "vendor", defaultObjectiveControlIds: ["TRUST-VENDOR-01"],
    titles: ["Inventário", "Tiering", "Due diligence", "Contrato", "Monitoramento", "Mudança", "Concentração", "Saída"],
  }),
  ...activityGroup({
    prefix: "PEO", domain: "people", defaultObjectiveControlIds: ["TRUST-PEOPLE-01"],
    titles: ["Termos", "Verificação", "Treinamento", "Endpoint", "Trabalho remoto", "Offboarding", "Mídia", "Escritório/provedores"],
  }),
];

export const masterTrustControlCatalogue: TrustControlCatalogue = {
  catalogueVersion: "2026.09.06-v1",
  effectiveAt: "2026-09-06T12:00:00.000Z",
  scope: "Offroad application, APIs, data stores, document workers, AI providers, delivery pipeline and operating organization",
  sourceRefs: frameworkSources,
  controls,
  activities,
};

export const trustControlIdsByDomain = Object.freeze(controls.reduce<Record<TrustControlDomain, string[]>>((result, control) => {
  result[control.domain].push(control.controlId);
  return result;
}, {
  governance: [], identity: [], data: [], application: [], documents: [], ai: [], sdlc: [], cloud: [], operations: [], vendor: [], people: [],
}));
