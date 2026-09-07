/**
 * Reviewed security inventory contracts.
 *
 * These manifests are deliberately outside the caller-controlled inventory payload. Factories
 * return defensive copies so current-state declarations cannot rewrite the evaluator's authority,
 * evidence identity, entity coverage, or gap targeting contracts at runtime.
 */

export type CanonicalSecurityEvidenceManifestEntry = {
  evidenceId: string;
  kind: "repository_file" | "automated_test" | "configuration" | "external_snapshot" | "contract_record" | "operator_observation" | "design_reference";
  ref: string;
  capturedAt: string;
  freshness: "immutable" | "time_bound";
  validThrough: string | null;
  immutableFingerprint: string | null;
  contentFingerprint: `sha256:${string}`;
  authorityRef: "AUTH-TRUSTED-GIT-BASELINE" | "AUTH-OPERATOR-OBSERVATION-ONLY";
  collector: {name: string; version: string; principalClass: string} | null;
};

export type CanonicalSecurityEntityRelationship = {
  evidenceRefs: string[];
  gapRefs: string[];
  controlIds: string[];
};

export type CanonicalSecurityGapRelationship = {
  severity: "critical" | "high" | "medium" | "low";
  targetRefs: string[];
  evidenceRefs: string[];
  controlIds: string[];
};

/**
 * Identity of the complete reviewed inventory snapshot. Unlike the narrower evidence and
 * relationship catalogues below, this fingerprint covers every parsed field that can reach the
 * human-readable inventory: semantic topology, assurance states, owners, narratives and baseline
 * dates. A runtime caller may present a snapshot, but cannot redefine this trust root.
 */
const inventorySnapshotContract = {
  inventoryFingerprint: "952bd4d11e01f617778bcca6e47b7bc3a739869b062bd030d5b6f258bd9a522d",
  generatedAt: "2026-09-07T09:43:00.000-03:00",
  evidenceCutoff: "2026-09-07T09:43:00.000-03:00",
  reviewDueAt: "2026-09-14T09:43:00.000-03:00",
  maximumReviewWindowMs: 7 * 24 * 60 * 60 * 1000,
} as const;

const evidenceManifest = [
  {
    "evidenceId": "SEV-AGENTS-SCOPE",
    "kind": "repository_file",
    "ref": "AGENTS.md",
    "capturedAt": "2026-09-07T09:43:00.000-03:00",
    "freshness": "immutable",
    "validThrough": null,
    "immutableFingerprint": "b2e389757995859cf6a0b250e051d83ba0b53163",
    "contentFingerprint": "sha256:acd472c3e4b9fe20ddec3961b7113bd94cfd47d6286962988414a1c392501ddd",
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null
  },
  {
    "evidenceId": "SEV-SECURITY-PLAN",
    "kind": "design_reference",
    "ref": "docs/security/ENTERPRISE_SECURITY_COMPLIANCE_READINESS_PLAN.md",
    "capturedAt": "2026-09-07T09:43:00.000-03:00",
    "freshness": "immutable",
    "validThrough": null,
    "immutableFingerprint": "b2e389757995859cf6a0b250e051d83ba0b53163",
    "contentFingerprint": "sha256:113cd5ec4d2c194718b4445d1f54f17e6def847d6e6fde32592685c83b9bb2d5",
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null
  },
  {
    "evidenceId": "SEV-ENV-NAMES",
    "kind": "configuration",
    "ref": ".env.example",
    "capturedAt": "2026-09-07T09:43:00.000-03:00",
    "freshness": "immutable",
    "validThrough": null,
    "immutableFingerprint": "b2e389757995859cf6a0b250e051d83ba0b53163",
    "contentFingerprint": "sha256:b4bc582b5fb4fe6608c4b9bbf48e362d46620e427c5a77428127268aaaee82af",
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null
  },
  {
    "evidenceId": "SEV-WORKER-TASK",
    "kind": "configuration",
    "ref": "apps/document-worker/task-definition.json",
    "capturedAt": "2026-09-07T09:43:00.000-03:00",
    "freshness": "immutable",
    "validThrough": null,
    "immutableFingerprint": "b2e389757995859cf6a0b250e051d83ba0b53163",
    "contentFingerprint": "sha256:0543611c87c156b861b807641247a23dcb99a19023b20913f8dffff951c987d3",
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null
  },
  {
    "evidenceId": "SEV-WORKER-RUNTIME",
    "kind": "repository_file",
    "ref": "apps/document-worker/src/main.ts",
    "capturedAt": "2026-09-07T09:43:00.000-03:00",
    "freshness": "immutable",
    "validThrough": null,
    "immutableFingerprint": "b2e389757995859cf6a0b250e051d83ba0b53163",
    "contentFingerprint": "sha256:45283403d0b4276eab21e17beaf7d7a5cab8a0a1396942a29614f3c9d53051dc",
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null
  },
  {
    "evidenceId": "SEV-WORKER-CONFIG",
    "kind": "repository_file",
    "ref": "apps/document-worker/src/config.ts",
    "capturedAt": "2026-09-07T09:43:00.000-03:00",
    "freshness": "immutable",
    "validThrough": null,
    "immutableFingerprint": "b2e389757995859cf6a0b250e051d83ba0b53163",
    "contentFingerprint": "sha256:f7032b56f70c698834ae5837edfaff589d6983ec54f0c9ae86141757eba95a0c",
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null
  },
  {
    "evidenceId": "SEV-DEPLOY-WORKER",
    "kind": "configuration",
    "ref": ".github/workflows/deploy-worker.yml",
    "capturedAt": "2026-09-07T09:43:00.000-03:00",
    "freshness": "immutable",
    "validThrough": null,
    "immutableFingerprint": "b2e389757995859cf6a0b250e051d83ba0b53163",
    "contentFingerprint": "sha256:5020eba9f5815790f0d451b3aac14fc9c2008c9110ebf47273f4f5bcefe26e54",
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null
  },
  {
    "evidenceId": "SEV-EVAL-EXTRACTION",
    "kind": "configuration",
    "ref": ".github/workflows/measure-extraction.yml",
    "capturedAt": "2026-09-07T09:43:00.000-03:00",
    "freshness": "immutable",
    "validThrough": null,
    "immutableFingerprint": "b2e389757995859cf6a0b250e051d83ba0b53163",
    "contentFingerprint": "sha256:aea104a1eb0f29392c62f03cbe4033a3d9e0c8f2b92e06628b0c080c8afea7e8",
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null
  },
  {
    "evidenceId": "SEV-EVAL-INTENT",
    "kind": "configuration",
    "ref": ".github/workflows/intent-router-gold.yml",
    "capturedAt": "2026-09-07T09:43:00.000-03:00",
    "freshness": "immutable",
    "validThrough": null,
    "immutableFingerprint": "b2e389757995859cf6a0b250e051d83ba0b53163",
    "contentFingerprint": "sha256:a464d49e2ecefd8cf0e526509b4dbc8c212834141232b8b8bc46f2284c4b04f3",
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null
  },
  {
    "evidenceId": "SEV-EVAL-CLASSIFICATION",
    "kind": "configuration",
    "ref": ".github/workflows/measure-classification.yml",
    "capturedAt": "2026-09-07T09:43:00.000-03:00",
    "freshness": "immutable",
    "validThrough": null,
    "immutableFingerprint": "b2e389757995859cf6a0b250e051d83ba0b53163",
    "contentFingerprint": "sha256:7bf8e071b53800aba9868922410b3e3044b6bba2de69f34d868e111324527b31",
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null
  },
  {
    "evidenceId": "SEV-EVAL-GOLD",
    "kind": "configuration",
    "ref": ".github/workflows/gold-baseline.yml",
    "capturedAt": "2026-09-07T09:43:00.000-03:00",
    "freshness": "immutable",
    "validThrough": null,
    "immutableFingerprint": "b2e389757995859cf6a0b250e051d83ba0b53163",
    "contentFingerprint": "sha256:cc098860b8b50676623d334b9833c523c9de6f210add3dd4eac2cc10ece53f34",
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null
  },
  {
    "evidenceId": "SEV-EVAL-PROBE",
    "kind": "configuration",
    "ref": ".github/workflows/probe-structured-output.yml",
    "capturedAt": "2026-09-07T09:43:00.000-03:00",
    "freshness": "immutable",
    "validThrough": null,
    "immutableFingerprint": "b2e389757995859cf6a0b250e051d83ba0b53163",
    "contentFingerprint": "sha256:8dd7a57cfe40d9b65ede721667101579af5555153bf32acd1201c0abc8f3e393",
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null
  },
  {
    "evidenceId": "SEV-EVAL-CODEX",
    "kind": "configuration",
    "ref": ".github/workflows/codex-review.yml",
    "capturedAt": "2026-09-07T09:43:00.000-03:00",
    "freshness": "immutable",
    "validThrough": null,
    "immutableFingerprint": "b2e389757995859cf6a0b250e051d83ba0b53163",
    "contentFingerprint": "sha256:5b25049ba14fefb2542d99e224a728976cb0b76ea739a8a76d838ddc5d15ef0d",
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null
  },
  {
    "evidenceId": "SEV-EVAL-LIVE-GATE",
    "kind": "configuration",
    "ref": ".github/workflows/live-preview-gate.yml",
    "capturedAt": "2026-09-07T09:43:00.000-03:00",
    "freshness": "immutable",
    "validThrough": null,
    "immutableFingerprint": "b2e389757995859cf6a0b250e051d83ba0b53163",
    "contentFingerprint": "sha256:62927bab96374eebefae9ce7524c3b6016f01d9e25b993673fea7ceb6387f58a",
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null
  },
  {
    "evidenceId": "SEV-QUALITY-WORKFLOW",
    "kind": "configuration",
    "ref": ".github/workflows/quality.yml",
    "capturedAt": "2026-09-07T09:43:00.000-03:00",
    "freshness": "immutable",
    "validThrough": null,
    "immutableFingerprint": "b2e389757995859cf6a0b250e051d83ba0b53163",
    "contentFingerprint": "sha256:d08c79ee455a30ab3699a43b7eb9240c4e0eae1334c0153eaa6c5b9bfd0b27fd",
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null
  },
  {
    "evidenceId": "SEV-CODEOWNERS",
    "kind": "configuration",
    "ref": ".github/CODEOWNERS",
    "capturedAt": "2026-09-07T09:43:00.000-03:00",
    "freshness": "immutable",
    "validThrough": null,
    "immutableFingerprint": "b2e389757995859cf6a0b250e051d83ba0b53163",
    "contentFingerprint": "sha256:857ea6d9e85324e9d745ed26c74dd66700677bc80ab3e49f4ca2bffa121d2bc4",
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null
  },
  {
    "evidenceId": "SEV-SECURITY-WORKFLOW",
    "kind": "configuration",
    "ref": ".github/workflows/security.yml",
    "capturedAt": "2026-09-07T09:43:00.000-03:00",
    "freshness": "immutable",
    "validThrough": null,
    "immutableFingerprint": "b2e389757995859cf6a0b250e051d83ba0b53163",
    "contentFingerprint": "sha256:e9470928fac9f56fe8f4743ca6e93fba4122cff8887288dd45ab23b3ec6fe0f0",
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null
  },
  {
    "evidenceId": "SEV-SUPABASE-CONFIG",
    "kind": "configuration",
    "ref": "supabase/config.toml",
    "capturedAt": "2026-09-07T09:43:00.000-03:00",
    "freshness": "immutable",
    "validThrough": null,
    "immutableFingerprint": "b2e389757995859cf6a0b250e051d83ba0b53163",
    "contentFingerprint": "sha256:66f742c8286d7bccb365044a9ac9d80a4babc1a6c953d439631ce537dfae7093",
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null
  },
  {
    "evidenceId": "SEV-RLS-TEST",
    "kind": "automated_test",
    "ref": "supabase/tests/rls_non_interference.sql",
    "capturedAt": "2026-09-07T09:43:00.000-03:00",
    "freshness": "immutable",
    "validThrough": null,
    "immutableFingerprint": "b2e389757995859cf6a0b250e051d83ba0b53163",
    "contentFingerprint": "sha256:4d1fbeaf9b358efbb9480eba8f6a4ecdc30b660d94902cd86da0c58c3dde2850",
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null
  },
  {
    "evidenceId": "SEV-MODEL-DATA-POLICY",
    "kind": "repository_file",
    "ref": "packages/model-gateway/src/data-policy.ts",
    "capturedAt": "2026-09-07T09:43:00.000-03:00",
    "freshness": "immutable",
    "validThrough": null,
    "immutableFingerprint": "b2e389757995859cf6a0b250e051d83ba0b53163",
    "contentFingerprint": "sha256:10fbb047ff892af41e2eaa69a94bd7a8d81896732eb20abc38a71346abe961ea",
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null
  },
  {
    "evidenceId": "SEV-MODEL-DATA-POLICY-TEST",
    "kind": "automated_test",
    "ref": "packages/model-gateway/src/index.test.ts",
    "capturedAt": "2026-09-07T09:43:00.000-03:00",
    "freshness": "immutable",
    "validThrough": null,
    "immutableFingerprint": "b2e389757995859cf6a0b250e051d83ba0b53163",
    "contentFingerprint": "sha256:db2079b346706fd697df1956d1df03ec7123a12ef3db0e4ca75a27a9b662442d",
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null
  },
  {
    "evidenceId": "SEV-MODEL-POLICY",
    "kind": "configuration",
    "ref": "packages/model-gateway/src/policy.ts",
    "capturedAt": "2026-09-07T09:43:00.000-03:00",
    "freshness": "immutable",
    "validThrough": null,
    "immutableFingerprint": "b2e389757995859cf6a0b250e051d83ba0b53163",
    "contentFingerprint": "sha256:00e273614ff42837f6aba595c472f973d022d226992c2339aa22c7f228b14898",
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null
  },
  {
    "evidenceId": "SEV-PUBLIC-RESEARCH",
    "kind": "repository_file",
    "ref": "packages/public-research/src/source-registry.ts",
    "capturedAt": "2026-09-07T09:43:00.000-03:00",
    "freshness": "immutable",
    "validThrough": null,
    "immutableFingerprint": "b2e389757995859cf6a0b250e051d83ba0b53163",
    "contentFingerprint": "sha256:b4a4ab4c4879135f6d287b4d5c0ff1d2be8e9a6cb8333cbaed19616d366d86b2",
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null
  },
  {
    "evidenceId": "SEV-WEB-OBSERVABILITY",
    "kind": "configuration",
    "ref": "apps/web/src/instrumentation-client.ts",
    "capturedAt": "2026-09-07T09:43:00.000-03:00",
    "freshness": "immutable",
    "validThrough": null,
    "immutableFingerprint": "b2e389757995859cf6a0b250e051d83ba0b53163",
    "contentFingerprint": "sha256:579d1f33c30b57cd2c46916b67821813d4f3f15dbe184db56dfa632c615d0742",
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null
  },
  {
    "evidenceId": "SEV-WEB-UPLOAD",
    "kind": "repository_file",
    "ref": "apps/web/src/lib/intake/upload-client.ts",
    "capturedAt": "2026-09-07T09:43:00.000-03:00",
    "freshness": "immutable",
    "validThrough": null,
    "immutableFingerprint": "b2e389757995859cf6a0b250e051d83ba0b53163",
    "contentFingerprint": "sha256:29574865f9ac4f3e9a52d7621f4e93218ea650b9247509b35fee2f150e92376a",
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null
  },
  {
    "evidenceId": "SEV-WEB-DEPENDENCIES",
    "kind": "repository_file",
    "ref": "apps/web/package.json",
    "capturedAt": "2026-09-07T09:43:00.000-03:00",
    "freshness": "immutable",
    "validThrough": null,
    "immutableFingerprint": "b2e389757995859cf6a0b250e051d83ba0b53163",
    "contentFingerprint": "sha256:bf993d19ffec9479e618ecb63611759556bca327d82ea8eb5100240bb2632fcc",
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null
  },
  {
    "evidenceId": "SEV-LOCKFILE",
    "kind": "configuration",
    "ref": "pnpm-lock.yaml",
    "capturedAt": "2026-09-07T09:43:00.000-03:00",
    "freshness": "immutable",
    "validThrough": null,
    "immutableFingerprint": "b2e389757995859cf6a0b250e051d83ba0b53163",
    "contentFingerprint": "sha256:d5decfb97c5ecc4162e6486a8178873ea181e6a451e0a1bb3778876b6a61557c",
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null
  },
  {
    "evidenceId": "SEV-CASE-RENDER",
    "kind": "repository_file",
    "ref": "packages/case-render/src/html.ts",
    "capturedAt": "2026-09-07T09:43:00.000-03:00",
    "freshness": "immutable",
    "validThrough": null,
    "immutableFingerprint": "b2e389757995859cf6a0b250e051d83ba0b53163",
    "contentFingerprint": "sha256:9227e1db4e54a0c0fa66502027dc234cc7ced8cf8f9b2ba26c71ca21d15a64b9",
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null
  },
  {
    "evidenceId": "SEV-ROLLOUT-ORDER",
    "kind": "repository_file",
    "ref": "docs/build/ACCEPTANCE_EVIDENCE.md",
    "capturedAt": "2026-09-07T09:43:00.000-03:00",
    "freshness": "immutable",
    "validThrough": null,
    "immutableFingerprint": "b2e389757995859cf6a0b250e051d83ba0b53163",
    "contentFingerprint": "sha256:a13b5778edf4cf661dc48776a882ddc6c62e391ebe9d3f0b73fa1255d92fd69e",
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null
  },
  {
    "evidenceId": "SEV-AWS-DEPLOY-ROLE-SNAPSHOT",
    "kind": "operator_observation",
    "ref": "docs/security/evidence/aws-worker-rollout-diagnostics-2026-09-07.json",
    "capturedAt": "2026-09-07T09:20:00.000-03:00",
    "freshness": "time_bound",
    "validThrough": "2026-09-14T09:20:00.000-03:00",
    "immutableFingerprint": null,
    "contentFingerprint": "sha256:eee921b75a3b879cd6790163cb370efe7294fec808fee95bc0e0bd492babbf8b",
    "authorityRef": "AUTH-OPERATOR-OBSERVATION-ONLY",
    "collector": {
      "name": "operator-authored-observation",
      "version": "1",
      "principalClass": "authorized cloud administrator"
    }
  }
] satisfies CanonicalSecurityEvidenceManifestEntry[];

const entityRelationships = {
  "ENV-PRODUCTION": {
    "evidenceRefs": [
      "SEV-AGENTS-SCOPE",
      "SEV-WORKER-TASK"
    ],
    "gapRefs": [
      "SG-LIVE-CONFIG",
      "SG-REGION-MAP",
      "SG-SCHEMA-BEFORE-CODE",
      "SG-ENV-DATA-MAPPING"
    ],
    "controlIds": [
      "TRUST-CLOUD-01",
      "TRUST-CLOUD-02",
      "TRUST-DATA-02"
    ]
  },
  "ENV-STAGING": {
    "evidenceRefs": [
      "SEV-AGENTS-SCOPE",
      "SEV-QUALITY-WORKFLOW"
    ],
    "gapRefs": [
      "SG-LIVE-CONFIG",
      "SG-ENV-SEPARATION",
      "SG-ENV-DATA-MAPPING"
    ],
    "controlIds": [
      "TRUST-CLOUD-01",
      "TRUST-CLOUD-02",
      "TRUST-DATA-01"
    ]
  },
  "ENV-PREVIEW": {
    "evidenceRefs": [
      "SEV-AGENTS-SCOPE"
    ],
    "gapRefs": [
      "SG-LIVE-CONFIG",
      "SG-ENV-SEPARATION",
      "SG-ENV-DATA-MAPPING"
    ],
    "controlIds": [
      "TRUST-CLOUD-02",
      "TRUST-DATA-02"
    ]
  },
  "ENV-CI": {
    "evidenceRefs": [
      "SEV-QUALITY-WORKFLOW",
      "SEV-SECURITY-WORKFLOW",
      "SEV-EVAL-GOLD",
      "SEV-EVAL-LIVE-GATE"
    ],
    "gapRefs": [
      "SG-LIVE-CONFIG",
      "SG-ENV-SEPARATION",
      "SG-VENDOR-ASSURANCE",
      "SG-PROVIDER-ASSURANCE",
      "SG-PRIVILEGED-ACCESS",
      "SG-ASSET-DISCOVERY",
      "SG-ENV-DATA-MAPPING"
    ],
    "controlIds": [
      "TRUST-SDLC-01",
      "TRUST-SDLC-02",
      "TRUST-CLOUD-02",
      "TRUST-AI-01",
      "TRUST-DATA-03"
    ]
  },
  "ENV-DEVELOPMENT": {
    "evidenceRefs": [
      "SEV-AGENTS-SCOPE",
      "SEV-ENV-NAMES"
    ],
    "gapRefs": [
      "SG-ENDPOINTS",
      "SG-ENV-SEPARATION",
      "SG-ENV-DATA-MAPPING"
    ],
    "controlIds": [
      "TRUST-CLOUD-02",
      "TRUST-PEOPLE-01",
      "TRUST-DATA-03"
    ]
  },
  "ENV-EXTERNAL": {
    "evidenceRefs": [
      "SEV-SECURITY-PLAN",
      "SEV-MODEL-DATA-POLICY"
    ],
    "gapRefs": [
      "SG-VENDOR-ASSURANCE",
      "SG-REGION-MAP",
      "SG-PROVIDER-ASSURANCE",
      "SG-ENV-DATA-MAPPING"
    ],
    "controlIds": [
      "TRUST-VENDOR-01",
      "TRUST-AI-01",
      "TRUST-DATA-04"
    ]
  },
  "public": {
    "evidenceRefs": [
      "SEV-PUBLIC-RESEARCH",
      "SEV-MODEL-DATA-POLICY"
    ],
    "gapRefs": [
      "SG-DATA-LIFECYCLE"
    ],
    "controlIds": [
      "TRUST-DATA-02",
      "TRUST-AI-01"
    ]
  },
  "internal_operational": {
    "evidenceRefs": [
      "SEV-WORKER-RUNTIME",
      "SEV-SUPABASE-CONFIG"
    ],
    "gapRefs": [
      "SG-DATA-LIFECYCLE"
    ],
    "controlIds": [
      "TRUST-DATA-02",
      "TRUST-DATA-03"
    ]
  },
  "personal_data": {
    "evidenceRefs": [
      "SEV-SUPABASE-CONFIG",
      "SEV-SECURITY-PLAN"
    ],
    "gapRefs": [
      "SG-DATA-LIFECYCLE",
      "SG-PRIVACY-RECORDS"
    ],
    "controlIds": [
      "TRUST-DATA-02",
      "TRUST-DATA-04"
    ]
  },
  "customer_confidential": {
    "evidenceRefs": [
      "SEV-RLS-TEST",
      "SEV-MODEL-DATA-POLICY"
    ],
    "gapRefs": [
      "SG-DATA-LIFECYCLE",
      "SG-PROVIDER-ASSURANCE"
    ],
    "controlIds": [
      "TRUST-DATA-01",
      "TRUST-DATA-02",
      "TRUST-AI-01"
    ]
  },
  "restricted_financial": {
    "evidenceRefs": [
      "SEV-RLS-TEST",
      "SEV-MODEL-DATA-POLICY"
    ],
    "gapRefs": [
      "SG-DATA-LIFECYCLE",
      "SG-PROVIDER-ASSURANCE"
    ],
    "controlIds": [
      "TRUST-DATA-01",
      "TRUST-DATA-02",
      "TRUST-AI-01"
    ]
  },
  "credential_secret": {
    "evidenceRefs": [
      "SEV-ENV-NAMES",
      "SEV-DEPLOY-WORKER",
      "SEV-WORKER-CONFIG"
    ],
    "gapRefs": [
      "SG-PRIVILEGED-ACCESS"
    ],
    "controlIds": [
      "TRUST-DATA-03",
      "TRUST-ID-01"
    ]
  },
  "security_evidence": {
    "evidenceRefs": [
      "SEV-SECURITY-WORKFLOW",
      "SEV-SECURITY-PLAN"
    ],
    "gapRefs": [
      "SG-DATA-LIFECYCLE"
    ],
    "controlIds": [
      "TRUST-GOV-02",
      "TRUST-OPS-01",
      "TRUST-SDLC-01"
    ]
  },
  "SYS-WEB": {
    "evidenceRefs": [
      "SEV-AGENTS-SCOPE",
      "SEV-WEB-DEPENDENCIES",
      "SEV-WEB-UPLOAD"
    ],
    "gapRefs": [
      "SG-LIVE-CONFIG",
      "SG-TELEMETRY-ASSURANCE",
      "SG-OWNER-ASSIGNMENT",
      "SG-ASSET-DISCOVERY"
    ],
    "controlIds": [
      "TRUST-APP-01",
      "TRUST-APP-02",
      "TRUST-DATA-01"
    ]
  },
  "SYS-SUPABASE": {
    "evidenceRefs": [
      "SEV-SUPABASE-CONFIG",
      "SEV-RLS-TEST",
      "SEV-AGENTS-SCOPE"
    ],
    "gapRefs": [
      "SG-LIVE-CONFIG",
      "SG-BACKUP-RESTORE",
      "SG-DATA-LIFECYCLE",
      "SG-SCHEMA-BEFORE-CODE",
      "SG-ENV-SEPARATION",
      "SG-PRIVACY-RECORDS",
      "SG-OWNER-ASSIGNMENT"
    ],
    "controlIds": [
      "TRUST-DATA-01",
      "TRUST-APP-01",
      "TRUST-OPS-02"
    ]
  },
  "SYS-WORKER": {
    "evidenceRefs": [
      "SEV-WORKER-TASK",
      "SEV-WORKER-RUNTIME",
      "SEV-WORKER-CONFIG"
    ],
    "gapRefs": [
      "SG-LIVE-CONFIG",
      "SG-PROVIDER-ASSURANCE",
      "SG-SCHEMA-BEFORE-CODE",
      "SG-OWNER-ASSIGNMENT",
      "SG-LOGGING-CONTENT-SAFETY",
      "SG-ASSET-DISCOVERY"
    ],
    "controlIds": [
      "TRUST-DOC-01",
      "TRUST-DOC-02",
      "TRUST-AI-01",
      "TRUST-CLOUD-01"
    ]
  },
  "SYS-GITHUB": {
    "evidenceRefs": [
      "SEV-QUALITY-WORKFLOW",
      "SEV-SECURITY-WORKFLOW",
      "SEV-DEPLOY-WORKER",
      "SEV-EVAL-EXTRACTION",
      "SEV-EVAL-INTENT",
      "SEV-EVAL-CLASSIFICATION",
      "SEV-EVAL-GOLD",
      "SEV-EVAL-PROBE",
      "SEV-EVAL-CODEX",
      "SEV-EVAL-LIVE-GATE"
    ],
    "gapRefs": [
      "SG-LIVE-CONFIG",
      "SG-PRIVILEGED-ACCESS",
      "SG-PROVIDER-ASSURANCE",
      "SG-DEPLOY-DIAGNOSTICS",
      "SG-SCHEMA-BEFORE-CODE",
      "SG-VENDOR-ASSURANCE",
      "SG-OWNER-ASSIGNMENT",
      "SG-ASSET-DISCOVERY"
    ],
    "controlIds": [
      "TRUST-SDLC-01",
      "TRUST-SDLC-02",
      "TRUST-DATA-03",
      "TRUST-AI-01"
    ]
  },
  "SYS-CODEX-CI": {
    "evidenceRefs": [
      "SEV-EVAL-CODEX"
    ],
    "gapRefs": [
      "SG-CODEX-CI-AGENT-BOUNDARY"
    ],
    "controlIds": [
      "TRUST-AI-01",
      "TRUST-AI-02",
      "TRUST-DATA-03",
      "TRUST-SDLC-01",
      "TRUST-CLOUD-02"
    ]
  },
  "SYS-OBSERVABILITY": {
    "evidenceRefs": [
      "SEV-WEB-OBSERVABILITY",
      "SEV-ENV-NAMES"
    ],
    "gapRefs": [
      "SG-LIVE-CONFIG",
      "SG-TELEMETRY-ASSURANCE",
      "SG-OWNER-ASSIGNMENT"
    ],
    "controlIds": [
      "TRUST-OPS-01",
      "TRUST-DATA-04",
      "TRUST-VENDOR-01"
    ]
  },
  "SYS-AUTH-EMAIL": {
    "evidenceRefs": [
      "SEV-SUPABASE-CONFIG",
      "SEV-SECURITY-PLAN"
    ],
    "gapRefs": [
      "SG-LIVE-CONFIG",
      "SG-VENDOR-ASSURANCE",
      "SG-PRIVACY-RECORDS",
      "SG-OWNER-ASSIGNMENT"
    ],
    "controlIds": [
      "TRUST-ID-01",
      "TRUST-DATA-04",
      "TRUST-VENDOR-01"
    ]
  },
  "SYS-ENDPOINTS": {
    "evidenceRefs": [
      "SEV-AGENTS-SCOPE",
      "SEV-SECURITY-PLAN"
    ],
    "gapRefs": [
      "SG-ENDPOINTS",
      "SG-PRIVILEGED-ACCESS",
      "SG-OWNER-ASSIGNMENT"
    ],
    "controlIds": [
      "TRUST-PEOPLE-01",
      "TRUST-ID-01",
      "TRUST-DATA-03"
    ]
  },
  "STORE-POSTGRES": {
    "evidenceRefs": [
      "SEV-RLS-TEST",
      "SEV-SUPABASE-CONFIG"
    ],
    "gapRefs": [
      "SG-DATA-LIFECYCLE",
      "SG-BACKUP-RESTORE",
      "SG-LIVE-CONFIG",
      "SG-PRIVACY-RECORDS"
    ],
    "controlIds": [
      "TRUST-DATA-01",
      "TRUST-DATA-02",
      "TRUST-OPS-02"
    ]
  },
  "STORE-OBJECTS": {
    "evidenceRefs": [
      "SEV-WEB-UPLOAD",
      "SEV-RLS-TEST"
    ],
    "gapRefs": [
      "SG-DATA-LIFECYCLE",
      "SG-BACKUP-RESTORE",
      "SG-LIVE-CONFIG"
    ],
    "controlIds": [
      "TRUST-DATA-01",
      "TRUST-DATA-02",
      "TRUST-OPS-02"
    ]
  },
  "STORE-CLOUDWATCH": {
    "evidenceRefs": [
      "SEV-WORKER-TASK",
      "SEV-WORKER-RUNTIME"
    ],
    "gapRefs": [
      "SG-LIVE-CONFIG",
      "SG-DATA-LIFECYCLE",
      "SG-LOGGING-CONTENT-SAFETY"
    ],
    "controlIds": [
      "TRUST-OPS-01",
      "TRUST-DATA-02",
      "TRUST-CLOUD-01"
    ]
  },
  "STORE-TELEMETRY": {
    "evidenceRefs": [
      "SEV-WEB-OBSERVABILITY",
      "SEV-ENV-NAMES"
    ],
    "gapRefs": [
      "SG-TELEMETRY-ASSURANCE",
      "SG-LIVE-CONFIG",
      "SG-DATA-LIFECYCLE"
    ],
    "controlIds": [
      "TRUST-OPS-01",
      "TRUST-DATA-04",
      "TRUST-VENDOR-01"
    ]
  },
  "STORE-SOURCE": {
    "evidenceRefs": [
      "SEV-AGENTS-SCOPE",
      "SEV-SECURITY-WORKFLOW",
      "SEV-EVAL-CODEX"
    ],
    "gapRefs": [
      "SG-VENDOR-ASSURANCE",
      "SG-DATA-LIFECYCLE",
      "SG-CODEX-CI-AGENT-BOUNDARY"
    ],
    "controlIds": [
      "TRUST-SDLC-01",
      "TRUST-SDLC-02",
      "TRUST-DATA-03"
    ]
  },
  "STORE-AWS-SECRETS": {
    "evidenceRefs": [
      "SEV-WORKER-TASK",
      "SEV-DEPLOY-WORKER",
      "SEV-EVAL-GOLD",
      "SEV-EVAL-LIVE-GATE"
    ],
    "gapRefs": [
      "SG-LIVE-CONFIG",
      "SG-DATA-LIFECYCLE",
      "SG-PRIVILEGED-ACCESS",
      "SG-ASSET-DISCOVERY"
    ],
    "controlIds": [
      "TRUST-DATA-03",
      "TRUST-ID-01",
      "TRUST-CLOUD-01",
      "TRUST-GOV-02"
    ]
  },
  "STORE-ECR": {
    "evidenceRefs": [
      "SEV-DEPLOY-WORKER",
      "SEV-WORKER-TASK"
    ],
    "gapRefs": [
      "SG-LIVE-CONFIG",
      "SG-DATA-LIFECYCLE",
      "SG-VENDOR-ASSURANCE"
    ],
    "controlIds": [
      "TRUST-CLOUD-01",
      "TRUST-SDLC-01",
      "TRUST-SDLC-02"
    ]
  },
  "STORE-CODEX-RUNNER": {
    "evidenceRefs": [
      "SEV-EVAL-CODEX"
    ],
    "gapRefs": [
      "SG-CODEX-CI-AGENT-BOUNDARY"
    ],
    "controlIds": [
      "TRUST-AI-02",
      "TRUST-DATA-03",
      "TRUST-SDLC-01",
      "TRUST-OPS-01"
    ]
  },
  "FLOW-WEB-DATA": {
    "evidenceRefs": [
      "SEV-RLS-TEST",
      "SEV-WEB-UPLOAD"
    ],
    "gapRefs": [
      "SG-LIVE-CONFIG",
      "SG-ENV-SEPARATION"
    ],
    "controlIds": [
      "TRUST-APP-01",
      "TRUST-DATA-01"
    ]
  },
  "FLOW-UPLOAD": {
    "evidenceRefs": [
      "SEV-WEB-UPLOAD",
      "SEV-RLS-TEST"
    ],
    "gapRefs": [
      "SG-LIVE-CONFIG",
      "SG-DATA-LIFECYCLE"
    ],
    "controlIds": [
      "TRUST-DATA-01",
      "TRUST-DOC-01"
    ]
  },
  "FLOW-DATA-WORKER": {
    "evidenceRefs": [
      "SEV-WORKER-RUNTIME",
      "SEV-RLS-TEST"
    ],
    "gapRefs": [
      "SG-LIVE-CONFIG"
    ],
    "controlIds": [
      "TRUST-DATA-01",
      "TRUST-APP-01",
      "TRUST-DATA-03"
    ]
  },
  "FLOW-WORKER-ANTHROPIC": {
    "evidenceRefs": [
      "SEV-WORKER-RUNTIME",
      "SEV-MODEL-DATA-POLICY",
      "SEV-MODEL-POLICY"
    ],
    "gapRefs": [
      "SG-PROVIDER-ASSURANCE",
      "SG-LIVE-CONFIG"
    ],
    "controlIds": [
      "TRUST-AI-01",
      "TRUST-AI-03",
      "TRUST-DATA-04"
    ]
  },
  "FLOW-WORKER-OPENAI": {
    "evidenceRefs": [
      "SEV-MODEL-POLICY",
      "SEV-MODEL-DATA-POLICY"
    ],
    "gapRefs": [
      "SG-PROVIDER-ASSURANCE",
      "SG-LIVE-CONFIG"
    ],
    "controlIds": [
      "TRUST-AI-01",
      "TRUST-AI-03",
      "TRUST-DATA-04"
    ]
  },
  "FLOW-WORKER-RESEARCH": {
    "evidenceRefs": [
      "SEV-PUBLIC-RESEARCH",
      "SEV-WORKER-RUNTIME"
    ],
    "gapRefs": [
      "SG-VENDOR-ASSURANCE",
      "SG-LIVE-CONFIG"
    ],
    "controlIds": [
      "TRUST-AI-01",
      "TRUST-VENDOR-01"
    ]
  },
  "FLOW-WORKER-FIRECRAWL": {
    "evidenceRefs": [
      "SEV-PUBLIC-RESEARCH",
      "SEV-WORKER-RUNTIME",
      "SEV-ENV-NAMES"
    ],
    "gapRefs": [
      "SG-PROVIDER-ASSURANCE",
      "SG-VENDOR-ASSURANCE",
      "SG-LIVE-CONFIG"
    ],
    "controlIds": [
      "TRUST-AI-01",
      "TRUST-VENDOR-01"
    ]
  },
  "FLOW-WEB-TELEMETRY": {
    "evidenceRefs": [
      "SEV-WEB-OBSERVABILITY",
      "SEV-ENV-NAMES"
    ],
    "gapRefs": [
      "SG-TELEMETRY-ASSURANCE",
      "SG-LIVE-CONFIG"
    ],
    "controlIds": [
      "TRUST-OPS-01",
      "TRUST-DATA-04",
      "TRUST-VENDOR-01"
    ]
  },
  "FLOW-AUTH-EMAIL": {
    "evidenceRefs": [
      "SEV-SUPABASE-CONFIG",
      "SEV-SECURITY-PLAN"
    ],
    "gapRefs": [
      "SG-VENDOR-ASSURANCE",
      "SG-LIVE-CONFIG",
      "SG-PRIVACY-RECORDS"
    ],
    "controlIds": [
      "TRUST-ID-01",
      "TRUST-DATA-04",
      "TRUST-VENDOR-01"
    ]
  },
  "FLOW-GITHUB-AWS": {
    "evidenceRefs": [
      "SEV-DEPLOY-WORKER",
      "SEV-WORKER-TASK"
    ],
    "gapRefs": [
      "SG-LIVE-CONFIG",
      "SG-PRIVILEGED-ACCESS",
      "SG-DEPLOY-DIAGNOSTICS",
      "SG-SCHEMA-BEFORE-CODE"
    ],
    "controlIds": [
      "TRUST-DATA-03",
      "TRUST-CLOUD-01",
      "TRUST-SDLC-01"
    ]
  },
  "FLOW-GITHUB-EVAL-SECRETS": {
    "evidenceRefs": [
      "SEV-EVAL-EXTRACTION",
      "SEV-EVAL-INTENT",
      "SEV-EVAL-CLASSIFICATION",
      "SEV-EVAL-GOLD",
      "SEV-EVAL-PROBE",
      "SEV-EVAL-CODEX",
      "SEV-EVAL-LIVE-GATE"
    ],
    "gapRefs": [
      "SG-LIVE-CONFIG",
      "SG-PRIVILEGED-ACCESS",
      "SG-PROVIDER-ASSURANCE",
      "SG-ASSET-DISCOVERY"
    ],
    "controlIds": [
      "TRUST-ID-01",
      "TRUST-DATA-03",
      "TRUST-AI-01",
      "TRUST-SDLC-01"
    ]
  },
  "FLOW-GITHUB-EVAL-ANTHROPIC": {
    "evidenceRefs": [
      "SEV-EVAL-EXTRACTION",
      "SEV-EVAL-INTENT",
      "SEV-EVAL-CLASSIFICATION",
      "SEV-EVAL-GOLD",
      "SEV-EVAL-PROBE",
      "SEV-EVAL-LIVE-GATE"
    ],
    "gapRefs": [
      "SG-LIVE-CONFIG",
      "SG-PROVIDER-ASSURANCE",
      "SG-VENDOR-ASSURANCE",
      "SG-ASSET-DISCOVERY"
    ],
    "controlIds": [
      "TRUST-AI-01",
      "TRUST-AI-03",
      "TRUST-DATA-04",
      "TRUST-SDLC-01"
    ]
  },
  "FLOW-GITHUB-EVAL-OPENAI": {
    "evidenceRefs": [
      "SEV-EVAL-EXTRACTION",
      "SEV-EVAL-INTENT",
      "SEV-EVAL-CLASSIFICATION",
      "SEV-EVAL-GOLD",
      "SEV-EVAL-CODEX"
    ],
    "gapRefs": [
      "SG-LIVE-CONFIG",
      "SG-PROVIDER-ASSURANCE",
      "SG-VENDOR-ASSURANCE",
      "SG-ASSET-DISCOVERY"
    ],
    "controlIds": [
      "TRUST-AI-01",
      "TRUST-AI-03",
      "TRUST-DATA-04",
      "TRUST-SDLC-01"
    ]
  },
  "FLOW-GITHUB-EVAL-PERPLEXITY": {
    "evidenceRefs": [
      "SEV-EVAL-LIVE-GATE"
    ],
    "gapRefs": [
      "SG-LIVE-CONFIG",
      "SG-PROVIDER-ASSURANCE",
      "SG-VENDOR-ASSURANCE",
      "SG-ASSET-DISCOVERY"
    ],
    "controlIds": [
      "TRUST-AI-01",
      "TRUST-VENDOR-01",
      "TRUST-DATA-04",
      "TRUST-SDLC-01"
    ]
  },
  "FLOW-GITHUB-VERCEL": {
    "evidenceRefs": [
      "SEV-AGENTS-SCOPE",
      "SEV-WEB-DEPENDENCIES"
    ],
    "gapRefs": [
      "SG-LIVE-CONFIG",
      "SG-VENDOR-ASSURANCE"
    ],
    "controlIds": [
      "TRUST-CLOUD-02",
      "TRUST-SDLC-01",
      "TRUST-VENDOR-01"
    ]
  },
  "FLOW-SHEETJS-SUPPLY": {
    "evidenceRefs": [
      "SEV-WEB-DEPENDENCIES",
      "SEV-LOCKFILE"
    ],
    "gapRefs": [
      "SG-VENDOR-ASSURANCE",
      "SG-ASSET-DISCOVERY"
    ],
    "controlIds": [
      "TRUST-SDLC-02",
      "TRUST-VENDOR-01"
    ]
  },
  "FLOW-MATERIAL-GOOGLE-FONTS": {
    "evidenceRefs": [
      "SEV-CASE-RENDER"
    ],
    "gapRefs": [
      "SG-VENDOR-ASSURANCE",
      "SG-REGION-MAP",
      "SG-TELEMETRY-ASSURANCE",
      "SG-ASSET-DISCOVERY"
    ],
    "controlIds": [
      "TRUST-VENDOR-01",
      "TRUST-DATA-04",
      "TRUST-SDLC-02"
    ]
  },
  "FLOW-GITHUB-CODEX": {
    "evidenceRefs": [
      "SEV-EVAL-CODEX"
    ],
    "gapRefs": [
      "SG-CODEX-CI-AGENT-BOUNDARY"
    ],
    "controlIds": [
      "TRUST-AI-02",
      "TRUST-SDLC-01",
      "TRUST-CLOUD-02"
    ]
  },
  "FLOW-CODEX-AWS-SECRETS": {
    "evidenceRefs": [
      "SEV-EVAL-CODEX"
    ],
    "gapRefs": [
      "SG-CODEX-CI-AGENT-BOUNDARY"
    ],
    "controlIds": [
      "TRUST-ID-01",
      "TRUST-DATA-03",
      "TRUST-AI-02"
    ]
  },
  "FLOW-CODEX-SOURCE": {
    "evidenceRefs": [
      "SEV-EVAL-CODEX"
    ],
    "gapRefs": [
      "SG-CODEX-CI-AGENT-BOUNDARY"
    ],
    "controlIds": [
      "TRUST-AI-02",
      "TRUST-DATA-03",
      "TRUST-SDLC-01",
      "TRUST-OPS-01"
    ]
  },
  "FLOW-CODEX-OPENAI": {
    "evidenceRefs": [
      "SEV-EVAL-CODEX"
    ],
    "gapRefs": [
      "SG-CODEX-CI-AGENT-BOUNDARY"
    ],
    "controlIds": [
      "TRUST-AI-01",
      "TRUST-AI-02",
      "TRUST-DATA-04"
    ]
  },
  "FLOW-NPM-SUPPLY": {
    "evidenceRefs": [
      "SEV-LOCKFILE",
      "SEV-EVAL-CODEX"
    ],
    "gapRefs": [
      "SG-ASSET-DISCOVERY"
    ],
    "controlIds": [
      "TRUST-SDLC-02",
      "TRUST-VENDOR-01"
    ]
  },
  "FLOW-GITHUB-ACTIONS-SUPPLY": {
    "evidenceRefs": [
      "SEV-QUALITY-WORKFLOW",
      "SEV-SECURITY-WORKFLOW",
      "SEV-EVAL-CODEX"
    ],
    "gapRefs": [
      "SG-ASSET-DISCOVERY"
    ],
    "controlIds": [
      "TRUST-SDLC-02",
      "TRUST-VENDOR-01"
    ]
  },
  "FLOW-SUPABASE-LOCAL-IMAGES": {
    "evidenceRefs": [
      "SEV-QUALITY-WORKFLOW",
      "SEV-SUPABASE-CONFIG"
    ],
    "gapRefs": [
      "SG-ASSET-DISCOVERY"
    ],
    "controlIds": [
      "TRUST-SDLC-02",
      "TRUST-CLOUD-02",
      "TRUST-VENDOR-01"
    ]
  },
  "FLOW-PLAYWRIGHT-BROWSERS": {
    "evidenceRefs": [
      "SEV-LOCKFILE",
      "SEV-QUALITY-WORKFLOW"
    ],
    "gapRefs": [
      "SG-ASSET-DISCOVERY"
    ],
    "controlIds": [
      "TRUST-SDLC-02",
      "TRUST-VENDOR-01"
    ]
  },
  "ID-END-USER": {
    "evidenceRefs": [
      "SEV-SUPABASE-CONFIG",
      "SEV-RLS-TEST"
    ],
    "gapRefs": [
      "SG-PRIVILEGED-ACCESS"
    ],
    "controlIds": [
      "TRUST-ID-01",
      "TRUST-APP-01"
    ]
  },
  "ID-ANON-ROLE": {
    "evidenceRefs": [
      "SEV-RLS-TEST"
    ],
    "gapRefs": [
      "SG-LIVE-CONFIG"
    ],
    "controlIds": [
      "TRUST-DATA-01",
      "TRUST-APP-01"
    ]
  },
  "ID-AUTH-ROLE": {
    "evidenceRefs": [
      "SEV-RLS-TEST"
    ],
    "gapRefs": [
      "SG-LIVE-CONFIG"
    ],
    "controlIds": [
      "TRUST-DATA-01",
      "TRUST-APP-01"
    ]
  },
  "ID-WORKER-ACCOUNT": {
    "evidenceRefs": [
      "SEV-WORKER-RUNTIME",
      "SEV-WORKER-CONFIG"
    ],
    "gapRefs": [
      "SG-PRIVILEGED-ACCESS",
      "SG-LIVE-CONFIG"
    ],
    "controlIds": [
      "TRUST-ID-01",
      "TRUST-APP-01",
      "TRUST-DATA-03"
    ]
  },
  "ID-GITHUB-OIDC": {
    "evidenceRefs": [
      "SEV-DEPLOY-WORKER"
    ],
    "gapRefs": [
      "SG-LIVE-CONFIG",
      "SG-DEPLOY-DIAGNOSTICS"
    ],
    "controlIds": [
      "TRUST-DATA-03",
      "TRUST-CLOUD-01",
      "TRUST-SDLC-01"
    ]
  },
  "ID-GITHUB-EVALS-OIDC": {
    "evidenceRefs": [
      "SEV-EVAL-EXTRACTION",
      "SEV-EVAL-INTENT",
      "SEV-EVAL-CLASSIFICATION",
      "SEV-EVAL-GOLD",
      "SEV-EVAL-PROBE",
      "SEV-EVAL-CODEX",
      "SEV-EVAL-LIVE-GATE"
    ],
    "gapRefs": [
      "SG-LIVE-CONFIG",
      "SG-PRIVILEGED-ACCESS",
      "SG-PROVIDER-ASSURANCE",
      "SG-ASSET-DISCOVERY"
    ],
    "controlIds": [
      "TRUST-ID-01",
      "TRUST-DATA-03",
      "TRUST-AI-01",
      "TRUST-SDLC-01"
    ]
  },
  "ID-AWS-WORKER-ROLES": {
    "evidenceRefs": [
      "SEV-WORKER-TASK"
    ],
    "gapRefs": [
      "SG-LIVE-CONFIG",
      "SG-PRIVILEGED-ACCESS",
      "SG-DEPLOY-DIAGNOSTICS"
    ],
    "controlIds": [
      "TRUST-ID-01",
      "TRUST-CLOUD-01",
      "TRUST-DATA-03"
    ]
  },
  "ID-PRIVILEGED-HUMANS": {
    "evidenceRefs": [
      "SEV-CODEOWNERS",
      "SEV-SECURITY-PLAN"
    ],
    "gapRefs": [
      "SG-PRIVILEGED-ACCESS",
      "SG-ENDPOINTS"
    ],
    "controlIds": [
      "TRUST-ID-01",
      "TRUST-PEOPLE-01"
    ]
  },
  "ID-PROVIDER-CREDENTIALS": {
    "evidenceRefs": [
      "SEV-WORKER-TASK",
      "SEV-DEPLOY-WORKER"
    ],
    "gapRefs": [
      "SG-PRIVILEGED-ACCESS",
      "SG-LIVE-CONFIG"
    ],
    "controlIds": [
      "TRUST-ID-01",
      "TRUST-DATA-03",
      "TRUST-AI-01"
    ]
  },
  "ID-VERCEL-SOURCE-INTEGRATION": {
    "evidenceRefs": [
      "SEV-AGENTS-SCOPE"
    ],
    "gapRefs": [
      "SG-PRIVILEGED-ACCESS",
      "SG-LIVE-CONFIG",
      "SG-VENDOR-ASSURANCE"
    ],
    "controlIds": [
      "TRUST-ID-01",
      "TRUST-CLOUD-02",
      "TRUST-SDLC-01"
    ]
  },
  "ID-CODEX-CI": {
    "evidenceRefs": [
      "SEV-EVAL-CODEX"
    ],
    "gapRefs": [
      "SG-CODEX-CI-AGENT-BOUNDARY"
    ],
    "controlIds": [
      "TRUST-AI-02",
      "TRUST-ID-01",
      "TRUST-DATA-03",
      "TRUST-CLOUD-02"
    ]
  },
  "VEN-SUPABASE": {
    "evidenceRefs": [
      "SEV-AGENTS-SCOPE",
      "SEV-SUPABASE-CONFIG"
    ],
    "gapRefs": [
      "SG-VENDOR-ASSURANCE",
      "SG-BACKUP-RESTORE",
      "SG-REGION-MAP"
    ],
    "controlIds": [
      "TRUST-VENDOR-01",
      "TRUST-DATA-02",
      "TRUST-OPS-02"
    ]
  },
  "VEN-AWS": {
    "evidenceRefs": [
      "SEV-WORKER-TASK",
      "SEV-DEPLOY-WORKER",
      "SEV-EVAL-GOLD",
      "SEV-EVAL-LIVE-GATE"
    ],
    "gapRefs": [
      "SG-VENDOR-ASSURANCE",
      "SG-LIVE-CONFIG",
      "SG-REGION-MAP",
      "SG-DEPLOY-DIAGNOSTICS",
      "SG-PRIVILEGED-ACCESS",
      "SG-ASSET-DISCOVERY"
    ],
    "controlIds": [
      "TRUST-VENDOR-01",
      "TRUST-CLOUD-01",
      "TRUST-DATA-03",
      "TRUST-AI-01"
    ]
  },
  "VEN-VERCEL": {
    "evidenceRefs": [
      "SEV-AGENTS-SCOPE",
      "SEV-WEB-DEPENDENCIES"
    ],
    "gapRefs": [
      "SG-VENDOR-ASSURANCE",
      "SG-LIVE-CONFIG",
      "SG-REGION-MAP"
    ],
    "controlIds": [
      "TRUST-VENDOR-01",
      "TRUST-CLOUD-02",
      "TRUST-DATA-04"
    ]
  },
  "VEN-GITHUB": {
    "evidenceRefs": [
      "SEV-QUALITY-WORKFLOW",
      "SEV-SECURITY-WORKFLOW"
    ],
    "gapRefs": [
      "SG-VENDOR-ASSURANCE",
      "SG-PRIVILEGED-ACCESS",
      "SG-REGION-MAP"
    ],
    "controlIds": [
      "TRUST-VENDOR-01",
      "TRUST-SDLC-01",
      "TRUST-SDLC-02"
    ]
  },
  "VEN-ANTHROPIC": {
    "evidenceRefs": [
      "SEV-WORKER-TASK",
      "SEV-MODEL-DATA-POLICY",
      "SEV-EVAL-EXTRACTION",
      "SEV-EVAL-INTENT",
      "SEV-EVAL-CLASSIFICATION",
      "SEV-EVAL-GOLD",
      "SEV-EVAL-PROBE",
      "SEV-EVAL-LIVE-GATE"
    ],
    "gapRefs": [
      "SG-PROVIDER-ASSURANCE",
      "SG-VENDOR-ASSURANCE",
      "SG-REGION-MAP",
      "SG-ASSET-DISCOVERY"
    ],
    "controlIds": [
      "TRUST-AI-01",
      "TRUST-VENDOR-01",
      "TRUST-DATA-04",
      "TRUST-SDLC-01"
    ]
  },
  "VEN-OPENAI": {
    "evidenceRefs": [
      "SEV-WORKER-TASK",
      "SEV-MODEL-DATA-POLICY",
      "SEV-MODEL-POLICY",
      "SEV-EVAL-EXTRACTION",
      "SEV-EVAL-INTENT",
      "SEV-EVAL-CLASSIFICATION",
      "SEV-EVAL-GOLD",
      "SEV-EVAL-CODEX"
    ],
    "gapRefs": [
      "SG-PROVIDER-ASSURANCE",
      "SG-VENDOR-ASSURANCE",
      "SG-REGION-MAP",
      "SG-ASSET-DISCOVERY"
    ],
    "controlIds": [
      "TRUST-AI-01",
      "TRUST-VENDOR-01",
      "TRUST-DATA-04",
      "TRUST-SDLC-01"
    ]
  },
  "VEN-PERPLEXITY": {
    "evidenceRefs": [
      "SEV-WORKER-TASK",
      "SEV-PUBLIC-RESEARCH",
      "SEV-EVAL-LIVE-GATE"
    ],
    "gapRefs": [
      "SG-PROVIDER-ASSURANCE",
      "SG-VENDOR-ASSURANCE",
      "SG-REGION-MAP",
      "SG-ASSET-DISCOVERY"
    ],
    "controlIds": [
      "TRUST-AI-01",
      "TRUST-VENDOR-01",
      "TRUST-DATA-04",
      "TRUST-SDLC-01"
    ]
  },
  "VEN-FIRECRAWL": {
    "evidenceRefs": [
      "SEV-WORKER-TASK",
      "SEV-PUBLIC-RESEARCH",
      "SEV-ENV-NAMES"
    ],
    "gapRefs": [
      "SG-PROVIDER-ASSURANCE",
      "SG-VENDOR-ASSURANCE",
      "SG-REGION-MAP"
    ],
    "controlIds": [
      "TRUST-AI-01",
      "TRUST-VENDOR-01"
    ]
  },
  "VEN-SENTRY": {
    "evidenceRefs": [
      "SEV-WEB-OBSERVABILITY",
      "SEV-ENV-NAMES"
    ],
    "gapRefs": [
      "SG-TELEMETRY-ASSURANCE",
      "SG-VENDOR-ASSURANCE",
      "SG-REGION-MAP"
    ],
    "controlIds": [
      "TRUST-OPS-01",
      "TRUST-VENDOR-01",
      "TRUST-DATA-04"
    ]
  },
  "VEN-POSTHOG": {
    "evidenceRefs": [
      "SEV-WEB-OBSERVABILITY",
      "SEV-ENV-NAMES"
    ],
    "gapRefs": [
      "SG-TELEMETRY-ASSURANCE",
      "SG-VENDOR-ASSURANCE",
      "SG-REGION-MAP"
    ],
    "controlIds": [
      "TRUST-OPS-01",
      "TRUST-VENDOR-01",
      "TRUST-DATA-04"
    ]
  },
  "VEN-SMTP-UNKNOWN": {
    "evidenceRefs": [
      "SEV-SECURITY-PLAN",
      "SEV-SUPABASE-CONFIG"
    ],
    "gapRefs": [
      "SG-VENDOR-ASSURANCE",
      "SG-LIVE-CONFIG",
      "SG-REGION-MAP"
    ],
    "controlIds": [
      "TRUST-VENDOR-01",
      "TRUST-DATA-04",
      "TRUST-ID-01"
    ]
  },
  "VEN-SHEETJS-CDN": {
    "evidenceRefs": [
      "SEV-WEB-DEPENDENCIES",
      "SEV-LOCKFILE"
    ],
    "gapRefs": [
      "SG-VENDOR-ASSURANCE",
      "SG-REGION-MAP",
      "SG-ASSET-DISCOVERY"
    ],
    "controlIds": [
      "TRUST-VENDOR-01",
      "TRUST-SDLC-02"
    ]
  },
  "VEN-GOOGLE-FONTS": {
    "evidenceRefs": [
      "SEV-CASE-RENDER"
    ],
    "gapRefs": [
      "SG-VENDOR-ASSURANCE",
      "SG-REGION-MAP",
      "SG-TELEMETRY-ASSURANCE",
      "SG-ASSET-DISCOVERY"
    ],
    "controlIds": [
      "TRUST-VENDOR-01",
      "TRUST-DATA-04",
      "TRUST-SDLC-02"
    ]
  },
  "VEN-NPM-REGISTRY": {
    "evidenceRefs": [
      "SEV-LOCKFILE",
      "SEV-EVAL-CODEX"
    ],
    "gapRefs": [
      "SG-VENDOR-ASSURANCE",
      "SG-REGION-MAP",
      "SG-ASSET-DISCOVERY"
    ],
    "controlIds": [
      "TRUST-SDLC-02",
      "TRUST-VENDOR-01"
    ]
  },
  "VEN-GITHUB-ACTIONS": {
    "evidenceRefs": [
      "SEV-QUALITY-WORKFLOW",
      "SEV-SECURITY-WORKFLOW",
      "SEV-EVAL-CODEX"
    ],
    "gapRefs": [
      "SG-VENDOR-ASSURANCE",
      "SG-REGION-MAP",
      "SG-ASSET-DISCOVERY"
    ],
    "controlIds": [
      "TRUST-SDLC-02",
      "TRUST-VENDOR-01"
    ]
  },
  "VEN-SUPABASE-LOCAL-IMAGES": {
    "evidenceRefs": [
      "SEV-QUALITY-WORKFLOW",
      "SEV-SUPABASE-CONFIG"
    ],
    "gapRefs": [
      "SG-VENDOR-ASSURANCE",
      "SG-REGION-MAP",
      "SG-ASSET-DISCOVERY"
    ],
    "controlIds": [
      "TRUST-SDLC-02",
      "TRUST-CLOUD-02",
      "TRUST-VENDOR-01"
    ]
  },
  "VEN-PLAYWRIGHT-DOWNLOADS": {
    "evidenceRefs": [
      "SEV-LOCKFILE",
      "SEV-QUALITY-WORKFLOW"
    ],
    "gapRefs": [
      "SG-VENDOR-ASSURANCE",
      "SG-REGION-MAP",
      "SG-ASSET-DISCOVERY"
    ],
    "controlIds": [
      "TRUST-SDLC-02",
      "TRUST-VENDOR-01"
    ]
  }
} satisfies Record<string, CanonicalSecurityEntityRelationship>;

const gapRelationships = {
  "SG-LIVE-CONFIG": {
    "severity": "critical",
    "targetRefs": [
      "ENV-PRODUCTION",
      "ENV-STAGING",
      "ENV-PREVIEW",
      "ENV-CI",
      "SYS-WEB",
      "SYS-SUPABASE",
      "SYS-WORKER",
      "SYS-GITHUB",
      "SYS-OBSERVABILITY",
      "SYS-AUTH-EMAIL",
      "STORE-POSTGRES",
      "STORE-OBJECTS",
      "STORE-CLOUDWATCH",
      "STORE-TELEMETRY",
      "STORE-AWS-SECRETS",
      "STORE-ECR",
      "FLOW-WEB-DATA",
      "FLOW-UPLOAD",
      "FLOW-DATA-WORKER",
      "FLOW-WORKER-ANTHROPIC",
      "FLOW-WORKER-OPENAI",
      "FLOW-WORKER-RESEARCH",
      "FLOW-WORKER-FIRECRAWL",
      "FLOW-WEB-TELEMETRY",
      "FLOW-AUTH-EMAIL",
      "FLOW-GITHUB-AWS",
      "FLOW-GITHUB-EVAL-SECRETS",
      "FLOW-GITHUB-EVAL-ANTHROPIC",
      "FLOW-GITHUB-EVAL-OPENAI",
      "FLOW-GITHUB-EVAL-PERPLEXITY",
      "FLOW-GITHUB-VERCEL",
      "ID-ANON-ROLE",
      "ID-AUTH-ROLE",
      "ID-WORKER-ACCOUNT",
      "ID-GITHUB-OIDC",
      "ID-GITHUB-EVALS-OIDC",
      "ID-AWS-WORKER-ROLES",
      "ID-PROVIDER-CREDENTIALS",
      "ID-VERCEL-SOURCE-INTEGRATION",
      "VEN-AWS",
      "VEN-VERCEL",
      "VEN-SMTP-UNKNOWN"
    ],
    "evidenceRefs": [
      "SEV-SECURITY-PLAN"
    ],
    "controlIds": [
      "TRUST-CLOUD-01",
      "TRUST-CLOUD-02",
      "TRUST-OPS-01"
    ]
  },
  "SG-ENV-SEPARATION": {
    "severity": "critical",
    "targetRefs": [
      "ENV-STAGING",
      "ENV-PREVIEW",
      "ENV-CI",
      "ENV-DEVELOPMENT",
      "SYS-SUPABASE",
      "FLOW-WEB-DATA"
    ],
    "evidenceRefs": [
      "SEV-AGENTS-SCOPE",
      "SEV-SECURITY-PLAN"
    ],
    "controlIds": [
      "TRUST-CLOUD-02",
      "TRUST-DATA-01"
    ]
  },
  "SG-DATA-LIFECYCLE": {
    "severity": "critical",
    "targetRefs": [
      "public",
      "internal_operational",
      "personal_data",
      "customer_confidential",
      "restricted_financial",
      "security_evidence",
      "SYS-SUPABASE",
      "STORE-POSTGRES",
      "STORE-OBJECTS",
      "STORE-CLOUDWATCH",
      "STORE-TELEMETRY",
      "STORE-SOURCE",
      "STORE-AWS-SECRETS",
      "STORE-ECR",
      "FLOW-UPLOAD"
    ],
    "evidenceRefs": [
      "SEV-SECURITY-PLAN"
    ],
    "controlIds": [
      "TRUST-DATA-02",
      "TRUST-DATA-04"
    ]
  },
  "SG-BACKUP-RESTORE": {
    "severity": "critical",
    "targetRefs": [
      "SYS-SUPABASE",
      "STORE-POSTGRES",
      "STORE-OBJECTS",
      "VEN-SUPABASE"
    ],
    "evidenceRefs": [
      "SEV-SECURITY-PLAN"
    ],
    "controlIds": [
      "TRUST-OPS-02",
      "TRUST-VENDOR-01"
    ]
  },
  "SG-VENDOR-ASSURANCE": {
    "severity": "high",
    "targetRefs": [
      "ENV-CI",
      "ENV-EXTERNAL",
      "SYS-GITHUB",
      "SYS-AUTH-EMAIL",
      "STORE-SOURCE",
      "STORE-ECR",
      "FLOW-WORKER-RESEARCH",
      "FLOW-WORKER-FIRECRAWL",
      "FLOW-GITHUB-EVAL-ANTHROPIC",
      "FLOW-GITHUB-EVAL-OPENAI",
      "FLOW-GITHUB-EVAL-PERPLEXITY",
      "FLOW-AUTH-EMAIL",
      "FLOW-GITHUB-VERCEL",
      "FLOW-SHEETJS-SUPPLY",
      "FLOW-MATERIAL-GOOGLE-FONTS",
      "ID-VERCEL-SOURCE-INTEGRATION",
      "VEN-SUPABASE",
      "VEN-AWS",
      "VEN-VERCEL",
      "VEN-GITHUB",
      "VEN-ANTHROPIC",
      "VEN-OPENAI",
      "VEN-PERPLEXITY",
      "VEN-FIRECRAWL",
      "VEN-SENTRY",
      "VEN-POSTHOG",
      "VEN-SMTP-UNKNOWN",
      "VEN-SHEETJS-CDN",
      "VEN-GOOGLE-FONTS",
      "VEN-NPM-REGISTRY",
      "VEN-GITHUB-ACTIONS",
      "VEN-SUPABASE-LOCAL-IMAGES",
      "VEN-PLAYWRIGHT-DOWNLOADS"
    ],
    "evidenceRefs": [
      "SEV-SECURITY-PLAN"
    ],
    "controlIds": [
      "TRUST-VENDOR-01",
      "TRUST-DATA-04"
    ]
  },
  "SG-PROVIDER-ASSURANCE": {
    "severity": "critical",
    "targetRefs": [
      "ENV-CI",
      "ENV-EXTERNAL",
      "customer_confidential",
      "restricted_financial",
      "SYS-WORKER",
      "SYS-GITHUB",
      "FLOW-WORKER-ANTHROPIC",
      "FLOW-WORKER-OPENAI",
      "FLOW-WORKER-FIRECRAWL",
      "FLOW-GITHUB-EVAL-SECRETS",
      "FLOW-GITHUB-EVAL-ANTHROPIC",
      "FLOW-GITHUB-EVAL-OPENAI",
      "FLOW-GITHUB-EVAL-PERPLEXITY",
      "ID-GITHUB-EVALS-OIDC",
      "VEN-ANTHROPIC",
      "VEN-OPENAI",
      "VEN-PERPLEXITY",
      "VEN-FIRECRAWL"
    ],
    "evidenceRefs": [
      "SEV-MODEL-DATA-POLICY",
      "SEV-MODEL-DATA-POLICY-TEST",
      "SEV-WORKER-CONFIG",
      "SEV-WORKER-TASK",
      "SEV-EVAL-GOLD",
      "SEV-EVAL-LIVE-GATE"
    ],
    "controlIds": [
      "TRUST-AI-01",
      "TRUST-DATA-04",
      "TRUST-VENDOR-01"
    ]
  },
  "SG-TELEMETRY-ASSURANCE": {
    "severity": "high",
    "targetRefs": [
      "SYS-WEB",
      "SYS-OBSERVABILITY",
      "STORE-TELEMETRY",
      "FLOW-WEB-TELEMETRY",
      "FLOW-MATERIAL-GOOGLE-FONTS",
      "VEN-SENTRY",
      "VEN-POSTHOG",
      "VEN-GOOGLE-FONTS"
    ],
    "evidenceRefs": [
      "SEV-WEB-OBSERVABILITY",
      "SEV-ENV-NAMES",
      "SEV-SECURITY-PLAN"
    ],
    "controlIds": [
      "TRUST-OPS-01",
      "TRUST-DATA-04",
      "TRUST-VENDOR-01"
    ]
  },
  "SG-PRIVILEGED-ACCESS": {
    "severity": "critical",
    "targetRefs": [
      "ENV-CI",
      "credential_secret",
      "SYS-GITHUB",
      "SYS-ENDPOINTS",
      "STORE-AWS-SECRETS",
      "FLOW-GITHUB-AWS",
      "FLOW-GITHUB-EVAL-SECRETS",
      "ID-END-USER",
      "ID-WORKER-ACCOUNT",
      "ID-GITHUB-EVALS-OIDC",
      "ID-AWS-WORKER-ROLES",
      "ID-PRIVILEGED-HUMANS",
      "ID-PROVIDER-CREDENTIALS",
      "ID-VERCEL-SOURCE-INTEGRATION",
      "VEN-GITHUB",
      "VEN-AWS"
    ],
    "evidenceRefs": [
      "SEV-SECURITY-PLAN",
      "SEV-DEPLOY-WORKER",
      "SEV-EVAL-GOLD",
      "SEV-EVAL-LIVE-GATE"
    ],
    "controlIds": [
      "TRUST-ID-01",
      "TRUST-DATA-03",
      "TRUST-PEOPLE-01"
    ]
  },
  "SG-ENDPOINTS": {
    "severity": "high",
    "targetRefs": [
      "ENV-DEVELOPMENT",
      "SYS-ENDPOINTS",
      "ID-PRIVILEGED-HUMANS"
    ],
    "evidenceRefs": [
      "SEV-SECURITY-PLAN"
    ],
    "controlIds": [
      "TRUST-PEOPLE-01",
      "TRUST-ID-01",
      "TRUST-DATA-03"
    ]
  },
  "SG-REGION-MAP": {
    "severity": "high",
    "targetRefs": [
      "ENV-PRODUCTION",
      "ENV-EXTERNAL",
      "FLOW-MATERIAL-GOOGLE-FONTS",
      "VEN-SUPABASE",
      "VEN-AWS",
      "VEN-VERCEL",
      "VEN-GITHUB",
      "VEN-ANTHROPIC",
      "VEN-OPENAI",
      "VEN-PERPLEXITY",
      "VEN-FIRECRAWL",
      "VEN-SENTRY",
      "VEN-POSTHOG",
      "VEN-SMTP-UNKNOWN",
      "VEN-SHEETJS-CDN",
      "VEN-GOOGLE-FONTS",
      "VEN-NPM-REGISTRY",
      "VEN-GITHUB-ACTIONS",
      "VEN-SUPABASE-LOCAL-IMAGES",
      "VEN-PLAYWRIGHT-DOWNLOADS"
    ],
    "evidenceRefs": [
      "SEV-SECURITY-PLAN",
      "SEV-WORKER-TASK"
    ],
    "controlIds": [
      "TRUST-DATA-04",
      "TRUST-VENDOR-01",
      "TRUST-CLOUD-01"
    ]
  },
  "SG-PRIVACY-RECORDS": {
    "severity": "high",
    "targetRefs": [
      "personal_data",
      "SYS-SUPABASE",
      "SYS-AUTH-EMAIL",
      "STORE-POSTGRES",
      "FLOW-AUTH-EMAIL"
    ],
    "evidenceRefs": [
      "SEV-SECURITY-PLAN"
    ],
    "controlIds": [
      "TRUST-DATA-04",
      "TRUST-DATA-02"
    ]
  },
  "SG-OWNER-ASSIGNMENT": {
    "severity": "critical",
    "targetRefs": [
      "SYS-WEB",
      "SYS-SUPABASE",
      "SYS-WORKER",
      "SYS-GITHUB",
      "SYS-OBSERVABILITY",
      "SYS-AUTH-EMAIL",
      "SYS-ENDPOINTS"
    ],
    "evidenceRefs": [
      "SEV-SECURITY-PLAN"
    ],
    "controlIds": [
      "TRUST-GOV-01",
      "TRUST-GOV-02"
    ]
  },
  "SG-DEPLOY-DIAGNOSTICS": {
    "severity": "high",
    "targetRefs": [
      "SYS-GITHUB",
      "FLOW-GITHUB-AWS",
      "ID-GITHUB-OIDC",
      "ID-AWS-WORKER-ROLES",
      "VEN-AWS"
    ],
    "evidenceRefs": [
      "SEV-DEPLOY-WORKER",
      "SEV-AWS-DEPLOY-ROLE-SNAPSHOT"
    ],
    "controlIds": [
      "TRUST-CLOUD-01",
      "TRUST-OPS-01",
      "TRUST-SDLC-01"
    ]
  },
  "SG-CODEX-CI-AGENT-BOUNDARY": {
    "severity": "critical",
    "targetRefs": [
      "SYS-CODEX-CI",
      "STORE-CODEX-RUNNER",
      "STORE-SOURCE",
      "FLOW-GITHUB-CODEX",
      "FLOW-CODEX-AWS-SECRETS",
      "FLOW-CODEX-SOURCE",
      "FLOW-CODEX-OPENAI",
      "ID-CODEX-CI"
    ],
    "evidenceRefs": [
      "SEV-EVAL-CODEX"
    ],
    "controlIds": [
      "TRUST-AI-01",
      "TRUST-AI-02",
      "TRUST-DATA-03",
      "TRUST-SDLC-01",
      "TRUST-CLOUD-02",
      "TRUST-OPS-01"
    ]
  },
  "SG-SCHEMA-BEFORE-CODE": {
    "severity": "critical",
    "targetRefs": [
      "ENV-PRODUCTION",
      "SYS-GITHUB",
      "SYS-SUPABASE",
      "SYS-WORKER",
      "FLOW-GITHUB-AWS"
    ],
    "evidenceRefs": [
      "SEV-ROLLOUT-ORDER",
      "SEV-DEPLOY-WORKER"
    ],
    "controlIds": [
      "TRUST-CLOUD-02",
      "TRUST-SDLC-01",
      "TRUST-OPS-03"
    ]
  },
  "SG-ENV-DATA-MAPPING": {
    "severity": "critical",
    "targetRefs": [
      "ENV-PRODUCTION",
      "ENV-STAGING",
      "ENV-PREVIEW",
      "ENV-CI",
      "ENV-DEVELOPMENT",
      "ENV-EXTERNAL"
    ],
    "evidenceRefs": [
      "SEV-AGENTS-SCOPE",
      "SEV-SECURITY-PLAN"
    ],
    "controlIds": [
      "TRUST-DATA-01",
      "TRUST-DATA-02",
      "TRUST-CLOUD-02"
    ]
  },
  "SG-LOGGING-CONTENT-SAFETY": {
    "severity": "high",
    "targetRefs": [
      "SYS-WORKER",
      "STORE-CLOUDWATCH"
    ],
    "evidenceRefs": [
      "SEV-WORKER-RUNTIME",
      "SEV-WORKER-CONFIG"
    ],
    "controlIds": [
      "TRUST-OPS-01",
      "TRUST-DATA-02",
      "TRUST-APP-02"
    ]
  },
  "SG-ASSET-DISCOVERY": {
    "severity": "high",
    "targetRefs": [
      "ENV-CI",
      "SYS-WEB",
      "SYS-WORKER",
      "SYS-GITHUB",
      "STORE-AWS-SECRETS",
      "FLOW-GITHUB-EVAL-SECRETS",
      "FLOW-GITHUB-EVAL-ANTHROPIC",
      "FLOW-GITHUB-EVAL-OPENAI",
      "FLOW-GITHUB-EVAL-PERPLEXITY",
      "ID-GITHUB-EVALS-OIDC",
      "FLOW-SHEETJS-SUPPLY",
      "FLOW-MATERIAL-GOOGLE-FONTS",
      "FLOW-NPM-SUPPLY",
      "FLOW-GITHUB-ACTIONS-SUPPLY",
      "FLOW-SUPABASE-LOCAL-IMAGES",
      "FLOW-PLAYWRIGHT-BROWSERS",
      "VEN-AWS",
      "VEN-ANTHROPIC",
      "VEN-OPENAI",
      "VEN-PERPLEXITY",
      "VEN-SHEETJS-CDN",
      "VEN-GOOGLE-FONTS",
      "VEN-NPM-REGISTRY",
      "VEN-GITHUB-ACTIONS",
      "VEN-SUPABASE-LOCAL-IMAGES",
      "VEN-PLAYWRIGHT-DOWNLOADS"
    ],
    "evidenceRefs": [
      "SEV-WEB-DEPENDENCIES",
      "SEV-WORKER-TASK",
      "SEV-EVAL-GOLD",
      "SEV-EVAL-LIVE-GATE",
      "SEV-QUALITY-WORKFLOW",
      "SEV-SECURITY-WORKFLOW",
      "SEV-LOCKFILE",
      "SEV-SECURITY-PLAN"
    ],
    "controlIds": [
      "TRUST-GOV-02",
      "TRUST-SDLC-02",
      "TRUST-VENDOR-01",
      "TRUST-AI-01",
      "TRUST-DATA-03"
    ]
  }
} satisfies Record<string, CanonicalSecurityGapRelationship>;

export function createCanonicalSecurityEvidenceManifest(): CanonicalSecurityEvidenceManifestEntry[] {
  return structuredClone(evidenceManifest);
}

export function createCanonicalSecurityEntityRelationships(): Record<string, CanonicalSecurityEntityRelationship> {
  return structuredClone(entityRelationships);
}

export function createCanonicalSecurityGapRelationships(): Record<string, CanonicalSecurityGapRelationship> {
  return structuredClone(gapRelationships);
}

export function createCanonicalSecurityInventorySnapshotContract() {
  return structuredClone(inventorySnapshotContract);
}
