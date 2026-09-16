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
  freshness: "immutable" | "time_bound" | "wave_bound";
  waveId: string | null;
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
  inventoryFingerprint: "bcdcd5bbf2059816416bb517fec066449e97b04dfc462d3c90eeffecabc54f9a",
  generatedAt: "2026-09-16T22:26:29.355Z",
  evidenceCutoff: "2026-09-16T22:26:29.355Z",
  reviewDueAt: null,
  reviewCadence: "per_wave",
  waveId: "wave-5",
  waveStatus: "open",
  materialChangeState: "reviewed",
} as const;

const evidenceManifest = [
  {
    "evidenceId": "SEV-AGENTS-SCOPE",
    "kind": "repository_file",
    "ref": "AGENTS.md",
    "capturedAt": "2026-09-16T22:26:29.355Z",
    "freshness": "immutable",
    "validThrough": null,
    "immutableFingerprint": "3ccc8bcd4c399f984cd399daadf063f1e54638d7",
    "contentFingerprint": "sha256:f7a9e7d4f985042198374319b689f4659fbe035ef39775ac84963cd231e7a113",
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null
  },
  {
    "evidenceId": "SEV-SECURITY-PLAN",
    "kind": "design_reference",
    "ref": "docs/security/ENTERPRISE_SECURITY_COMPLIANCE_READINESS_PLAN.md",
    "capturedAt": "2026-09-16T22:26:29.355Z",
    "freshness": "immutable",
    "validThrough": null,
    "immutableFingerprint": "3ccc8bcd4c399f984cd399daadf063f1e54638d7",
    "contentFingerprint": "sha256:66dfb5d88ec405dba6540ccaae091db1fbc03f5b2f6ac0f727595117813efd3b",
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null
  },
  {
    "evidenceId": "SEV-ENV-NAMES",
    "kind": "configuration",
    "ref": ".env.example",
    "capturedAt": "2026-09-16T22:26:29.355Z",
    "freshness": "immutable",
    "validThrough": null,
    "immutableFingerprint": "3ccc8bcd4c399f984cd399daadf063f1e54638d7",
    "contentFingerprint": "sha256:a46f64be02956d05f01fb5368291c03d3eee2940972037b606ed2ee376a4204f",
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null
  },
  {
    "evidenceId": "SEV-WORKER-TASK",
    "kind": "configuration",
    "ref": "apps/document-worker/task-definition.json",
    "capturedAt": "2026-09-16T22:26:29.355Z",
    "freshness": "immutable",
    "validThrough": null,
    "immutableFingerprint": "3ccc8bcd4c399f984cd399daadf063f1e54638d7",
    "contentFingerprint": "sha256:16ff863671513d999fafce3b5d6fd47f7f6117139ff03a2708b1d7f454d56e51",
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null
  },
  {
    "evidenceId": "SEV-WORKER-RUNTIME",
    "kind": "repository_file",
    "ref": "apps/document-worker/src/main.ts",
    "capturedAt": "2026-09-16T22:26:29.355Z",
    "freshness": "immutable",
    "validThrough": null,
    "immutableFingerprint": "3ccc8bcd4c399f984cd399daadf063f1e54638d7",
    "contentFingerprint": "sha256:cdd9ffd119dc3bdad04ae175eea0e9be319728d6e11606e0c62b3a48ab5f0d08",
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null
  },
  {
    "evidenceId": "SEV-WORKER-CONFIG",
    "kind": "repository_file",
    "ref": "apps/document-worker/src/config.ts",
    "capturedAt": "2026-09-16T22:26:29.355Z",
    "freshness": "immutable",
    "validThrough": null,
    "immutableFingerprint": "3ccc8bcd4c399f984cd399daadf063f1e54638d7",
    "contentFingerprint": "sha256:956e4f51ac3eaed214a4e8c5d51aa87c8b5a44f301bb4078a3438f3a6235591a",
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null
  },
  {
    "evidenceId": "SEV-DEPLOY-WORKER",
    "kind": "configuration",
    "ref": ".github/workflows/deploy-worker.yml",
    "capturedAt": "2026-09-16T22:26:29.355Z",
    "freshness": "immutable",
    "validThrough": null,
    "immutableFingerprint": "3ccc8bcd4c399f984cd399daadf063f1e54638d7",
    "contentFingerprint": "sha256:91f4f8a66ba7b49ab4dfda0e35a26fe33865f2e6a846d89d93350761dc70b501",
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null
  },
  {
    "evidenceId": "SEV-EVAL-EXTRACTION",
    "kind": "configuration",
    "ref": ".github/workflows/measure-extraction.yml",
    "capturedAt": "2026-09-16T22:26:29.355Z",
    "freshness": "immutable",
    "validThrough": null,
    "immutableFingerprint": "3ccc8bcd4c399f984cd399daadf063f1e54638d7",
    "contentFingerprint": "sha256:41da24524f28ec5a220eeaf88fdb31483968fe3be5791c92e1a70e8f093154dc",
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null
  },
  {
    "evidenceId": "SEV-EVAL-INTENT",
    "kind": "configuration",
    "ref": ".github/workflows/intent-router-gold.yml",
    "capturedAt": "2026-09-16T22:26:29.355Z",
    "freshness": "immutable",
    "validThrough": null,
    "immutableFingerprint": "3ccc8bcd4c399f984cd399daadf063f1e54638d7",
    "contentFingerprint": "sha256:f01f91770063d9a939f4c95d7e689de27f0754b4ab0c0a6058143113c206bccb",
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null
  },
  {
    "evidenceId": "SEV-EVAL-CLASSIFICATION",
    "kind": "configuration",
    "ref": ".github/workflows/measure-classification.yml",
    "capturedAt": "2026-09-16T22:26:29.355Z",
    "freshness": "immutable",
    "validThrough": null,
    "immutableFingerprint": "3ccc8bcd4c399f984cd399daadf063f1e54638d7",
    "contentFingerprint": "sha256:de9c38e47d635aea1224aa9eee9dbadfac537d52d1bb7365abb172e91428b8b0",
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null
  },
  {
    "evidenceId": "SEV-EVAL-GOLD",
    "kind": "configuration",
    "ref": ".github/workflows/gold-baseline.yml",
    "capturedAt": "2026-09-16T22:26:29.355Z",
    "freshness": "immutable",
    "validThrough": null,
    "immutableFingerprint": "3ccc8bcd4c399f984cd399daadf063f1e54638d7",
    "contentFingerprint": "sha256:43cae31f6b37655cf150ae2a44ab07c3267a240c08403d3020b6236229f9f27e",
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null
  },
  {
    "evidenceId": "SEV-EVAL-PROBE",
    "kind": "configuration",
    "ref": ".github/workflows/probe-structured-output.yml",
    "capturedAt": "2026-09-16T22:26:29.355Z",
    "freshness": "immutable",
    "validThrough": null,
    "immutableFingerprint": "3ccc8bcd4c399f984cd399daadf063f1e54638d7",
    "contentFingerprint": "sha256:be99868be6efc016e72eea9b92c70d04111dc1c3984b2e589d078ac049fd76e3",
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null
  },
  {
    "evidenceId": "SEV-EVAL-CODEX",
    "kind": "configuration",
    "ref": ".github/workflows/codex-review.yml",
    "capturedAt": "2026-09-16T22:26:29.355Z",
    "freshness": "immutable",
    "validThrough": null,
    "immutableFingerprint": "3ccc8bcd4c399f984cd399daadf063f1e54638d7",
    "contentFingerprint": "sha256:a723b8b394f3fdc064257054760c3e6ebfc6bed36014a4321e1a7bf228a52ff3",
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null
  },
  {
    "evidenceId": "SEV-EVAL-LIVE-GATE",
    "kind": "configuration",
    "ref": ".github/workflows/live-preview-gate.yml",
    "capturedAt": "2026-09-16T22:26:29.355Z",
    "freshness": "immutable",
    "validThrough": null,
    "immutableFingerprint": "3ccc8bcd4c399f984cd399daadf063f1e54638d7",
    "contentFingerprint": "sha256:77f009aa244ca9ada95f9730b3468d85ae0cee0b2d6f442e860bc206051c65d0",
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null
  },
  {
    "evidenceId": "SEV-QUALITY-WORKFLOW",
    "kind": "configuration",
    "ref": ".github/workflows/quality.yml",
    "capturedAt": "2026-09-16T22:26:29.355Z",
    "freshness": "immutable",
    "validThrough": null,
    "immutableFingerprint": "3ccc8bcd4c399f984cd399daadf063f1e54638d7",
    "contentFingerprint": "sha256:3c5f7ace69562266f04a36230d539288526e930669f91a803f46560ac7de297b",
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null
  },
  {
    "evidenceId": "SEV-CODEOWNERS",
    "kind": "configuration",
    "ref": ".github/CODEOWNERS",
    "capturedAt": "2026-09-16T22:26:29.355Z",
    "freshness": "immutable",
    "validThrough": null,
    "immutableFingerprint": "3ccc8bcd4c399f984cd399daadf063f1e54638d7",
    "contentFingerprint": "sha256:857ea6d9e85324e9d745ed26c74dd66700677bc80ab3e49f4ca2bffa121d2bc4",
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null
  },
  {
    "evidenceId": "SEV-SECURITY-WORKFLOW",
    "kind": "configuration",
    "ref": ".github/workflows/security.yml",
    "capturedAt": "2026-09-16T22:26:29.355Z",
    "freshness": "immutable",
    "validThrough": null,
    "immutableFingerprint": "3ccc8bcd4c399f984cd399daadf063f1e54638d7",
    "contentFingerprint": "sha256:e9470928fac9f56fe8f4743ca6e93fba4122cff8887288dd45ab23b3ec6fe0f0",
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null
  },
  {
    "evidenceId": "SEV-SUPABASE-CONFIG",
    "kind": "configuration",
    "ref": "supabase/config.toml",
    "capturedAt": "2026-09-16T22:26:29.355Z",
    "freshness": "immutable",
    "validThrough": null,
    "immutableFingerprint": "3ccc8bcd4c399f984cd399daadf063f1e54638d7",
    "contentFingerprint": "sha256:921710e1efde338a5b3c90fa3c7db4a2a21cec3a476eb0ed87e6c630bcdb3404",
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null
  },
  {
    "evidenceId": "SEV-RLS-TEST",
    "kind": "automated_test",
    "ref": "supabase/tests/rls_non_interference.sql",
    "capturedAt": "2026-09-16T22:26:29.355Z",
    "freshness": "immutable",
    "validThrough": null,
    "immutableFingerprint": "3ccc8bcd4c399f984cd399daadf063f1e54638d7",
    "contentFingerprint": "sha256:1f9aa37c88890b4109dc403e6aa2f3bfef19b0e256f1a52bacd4ae260b50792b",
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null
  },
  {
    "evidenceId": "SEV-MODEL-DATA-POLICY",
    "kind": "repository_file",
    "ref": "packages/model-gateway/src/data-policy.ts",
    "capturedAt": "2026-09-16T22:26:29.355Z",
    "freshness": "immutable",
    "validThrough": null,
    "immutableFingerprint": "3ccc8bcd4c399f984cd399daadf063f1e54638d7",
    "contentFingerprint": "sha256:10fbb047ff892af41e2eaa69a94bd7a8d81896732eb20abc38a71346abe961ea",
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null
  },
  {
    "evidenceId": "SEV-MODEL-DATA-POLICY-TEST",
    "kind": "automated_test",
    "ref": "packages/model-gateway/src/index.test.ts",
    "capturedAt": "2026-09-16T22:26:29.355Z",
    "freshness": "immutable",
    "validThrough": null,
    "immutableFingerprint": "3ccc8bcd4c399f984cd399daadf063f1e54638d7",
    "contentFingerprint": "sha256:ba1ce0acd1b18b16777323f36ef148b9ba49ff779f0be72aba4ae7655f7390a2",
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null
  },
  {
    "evidenceId": "SEV-MODEL-POLICY",
    "kind": "configuration",
    "ref": "packages/model-gateway/src/policy.ts",
    "capturedAt": "2026-09-16T22:26:29.355Z",
    "freshness": "immutable",
    "validThrough": null,
    "immutableFingerprint": "3ccc8bcd4c399f984cd399daadf063f1e54638d7",
    "contentFingerprint": "sha256:4bd5d315e33e25b3b526742b7298cbde8305519cdcc59f64e14bb1884af9dcb9",
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null
  },
  {
    "evidenceId": "SEV-PUBLIC-RESEARCH",
    "kind": "repository_file",
    "ref": "packages/public-research/src/source-registry.ts",
    "capturedAt": "2026-09-16T22:26:29.355Z",
    "freshness": "immutable",
    "validThrough": null,
    "immutableFingerprint": "3ccc8bcd4c399f984cd399daadf063f1e54638d7",
    "contentFingerprint": "sha256:b4a4ab4c4879135f6d287b4d5c0ff1d2be8e9a6cb8333cbaed19616d366d86b2",
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null
  },
  {
    "evidenceId": "SEV-WEB-OBSERVABILITY",
    "kind": "configuration",
    "ref": "apps/web/src/instrumentation-client.ts",
    "capturedAt": "2026-09-16T22:26:29.355Z",
    "freshness": "immutable",
    "validThrough": null,
    "immutableFingerprint": "3ccc8bcd4c399f984cd399daadf063f1e54638d7",
    "contentFingerprint": "sha256:579d1f33c30b57cd2c46916b67821813d4f3f15dbe184db56dfa632c615d0742",
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null
  },
  {
    "evidenceId": "SEV-WEB-UPLOAD",
    "kind": "repository_file",
    "ref": "apps/web/src/lib/intake/upload-client.ts",
    "capturedAt": "2026-09-16T22:26:29.355Z",
    "freshness": "immutable",
    "validThrough": null,
    "immutableFingerprint": "3ccc8bcd4c399f984cd399daadf063f1e54638d7",
    "contentFingerprint": "sha256:29574865f9ac4f3e9a52d7621f4e93218ea650b9247509b35fee2f150e92376a",
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null
  },
  {
    "evidenceId": "SEV-WEB-DEPENDENCIES",
    "kind": "repository_file",
    "ref": "apps/web/package.json",
    "capturedAt": "2026-09-16T22:26:29.355Z",
    "freshness": "immutable",
    "validThrough": null,
    "immutableFingerprint": "3ccc8bcd4c399f984cd399daadf063f1e54638d7",
    "contentFingerprint": "sha256:63b25851432f1a244c56c299808c80133192e4b176e14bc330019d843deb8a12",
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null
  },
  {
    "evidenceId": "SEV-LOCKFILE",
    "kind": "configuration",
    "ref": "pnpm-lock.yaml",
    "capturedAt": "2026-09-16T22:26:29.355Z",
    "freshness": "immutable",
    "validThrough": null,
    "immutableFingerprint": "3ccc8bcd4c399f984cd399daadf063f1e54638d7",
    "contentFingerprint": "sha256:56decf61204b42485eb75c14d4f2bde2d12d4b455e4eb831e228c38bd7172e54",
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null
  },
  {
    "evidenceId": "SEV-CASE-RENDER",
    "kind": "repository_file",
    "ref": "packages/case-render/src/html.ts",
    "capturedAt": "2026-09-16T22:26:29.355Z",
    "freshness": "immutable",
    "validThrough": null,
    "immutableFingerprint": "3ccc8bcd4c399f984cd399daadf063f1e54638d7",
    "contentFingerprint": "sha256:9227e1db4e54a0c0fa66502027dc234cc7ced8cf8f9b2ba26c71ca21d15a64b9",
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null
  },
  {
    "evidenceId": "SEV-ROLLOUT-ORDER",
    "kind": "repository_file",
    "ref": "docs/build/ACCEPTANCE_EVIDENCE.md",
    "capturedAt": "2026-09-16T22:26:29.355Z",
    "freshness": "immutable",
    "validThrough": null,
    "immutableFingerprint": "3ccc8bcd4c399f984cd399daadf063f1e54638d7",
    "contentFingerprint": "sha256:673e7c8f00aa21621e937d8a25c0a4a76bb56de15f116908e2841f2bdc63316e",
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null
  },
  {
    "evidenceId": "SEV-AWS-DEPLOY-ROLE-SNAPSHOT",
    "kind": "operator_observation",
    "ref": "docs/security/evidence/aws-worker-rollout-diagnostics-wave-5.json",
    "capturedAt": "2026-09-16T22:26:29.355Z",
    "freshness": "wave_bound",
    "validThrough": null,
    "immutableFingerprint": null,
    "contentFingerprint": "sha256:f807913e283688f17c8a8460b2559afa05934670c27f7aebb83c39539c5fe9c4",
    "authorityRef": "AUTH-OPERATOR-OBSERVATION-ONLY",
    "collector": {
      "name": "codex-read-only-delivery-observation",
      "version": "2",
      "principalClass": "repository automation using existing GitHub and temporary AWS console-authenticated CLI sessions"
    },
    "waveId": "wave-5"
  },
  {
    "evidenceId": "SEV-EVAL-DOCUMENT-WORK",
    "kind": "configuration",
    "ref": ".github/workflows/document-work-product-live.yml",
    "capturedAt": "2026-09-16T22:26:29.355Z",
    "freshness": "immutable",
    "waveId": null,
    "validThrough": null,
    "immutableFingerprint": "3ccc8bcd4c399f984cd399daadf063f1e54638d7",
    "contentFingerprint": "sha256:80e8f93ed6ab2b393f701d13663eda6eec7511eeae2d354967226020e2cb01e3",
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null
  },
  {
    "evidenceId": "SEV-EVAL-DOCUMENT-CONTINUATION",
    "kind": "configuration",
    "ref": ".github/workflows/document-work-product-continuation.yml",
    "capturedAt": "2026-09-16T22:26:29.355Z",
    "freshness": "immutable",
    "waveId": null,
    "validThrough": null,
    "immutableFingerprint": "3ccc8bcd4c399f984cd399daadf063f1e54638d7",
    "contentFingerprint": "sha256:62b7512adff8d6d21ddcb0f9e4aa6cf1004281236bfa07d20cd637ced6585eab",
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null
  },
  {
    "evidenceId": "SEV-CI-SCANNER",
    "kind": "configuration",
    "ref": ".github/workflows/documentary-scanner.yml",
    "capturedAt": "2026-09-16T22:26:29.355Z",
    "freshness": "immutable",
    "waveId": null,
    "validThrough": null,
    "immutableFingerprint": "3ccc8bcd4c399f984cd399daadf063f1e54638d7",
    "contentFingerprint": "sha256:3085403912d5f15249ce980defb260229757eedbb5540857b7a3b25857315804",
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null
  },
  {
    "evidenceId": "SEV-CI-SCANNER-START",
    "kind": "repository_file",
    "ref": "scripts/ci/start-documentary-scanner.sh",
    "capturedAt": "2026-09-16T22:26:29.355Z",
    "freshness": "immutable",
    "waveId": null,
    "validThrough": null,
    "immutableFingerprint": "3ccc8bcd4c399f984cd399daadf063f1e54638d7",
    "contentFingerprint": "sha256:dc5d650377450a162c74a062e3780aae7997b516d5b1aff58187aadbb4ac8b77",
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null
  },
  {
    "evidenceId": "SEV-DEPLOY-BOOT-PROOF",
    "kind": "repository_file",
    "ref": "scripts/ci/verify-worker-boot-flag.py",
    "capturedAt": "2026-09-16T22:26:29.355Z",
    "freshness": "immutable",
    "waveId": null,
    "validThrough": null,
    "immutableFingerprint": "3ccc8bcd4c399f984cd399daadf063f1e54638d7",
    "contentFingerprint": "sha256:75de84d2a98dd1ae86fc097b5e3e2b3a096723b2102641a431448d64066584d0",
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null
  },
  {
    "evidenceId": "SEV-ORG-AUTHORITY-SQL",
    "kind": "repository_file",
    "ref": "supabase/migrations/20260815014649_platform_foundation.sql",
    "capturedAt": "2026-09-16T22:26:29.355Z",
    "freshness": "immutable",
    "waveId": null,
    "validThrough": null,
    "immutableFingerprint": "3ccc8bcd4c399f984cd399daadf063f1e54638d7",
    "contentFingerprint": "sha256:ff4f010fe53984acfc2974fe1427f650c16cce5ec403066b6bcea4e3bf02ac1f",
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null
  },
  {
    "evidenceId": "SEV-PROJECT-ACCESS-SQL",
    "kind": "repository_file",
    "ref": "supabase/migrations/20260901035248_universal_capital_projects.sql",
    "capturedAt": "2026-09-16T22:26:29.355Z",
    "freshness": "immutable",
    "waveId": null,
    "validThrough": null,
    "immutableFingerprint": "3ccc8bcd4c399f984cd399daadf063f1e54638d7",
    "contentFingerprint": "sha256:af51e2995af8a4d346c135dac7196cc0265be174b7f048ba80b5ca8c8abb5009",
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null
  },
  {
    "evidenceId": "SEV-INTAKE-ACCESS-SQL",
    "kind": "repository_file",
    "ref": "supabase/migrations/20260817202038_document_first_intake.sql",
    "capturedAt": "2026-09-16T22:26:29.355Z",
    "freshness": "immutable",
    "waveId": null,
    "validThrough": null,
    "immutableFingerprint": "3ccc8bcd4c399f984cd399daadf063f1e54638d7",
    "contentFingerprint": "sha256:b44555d38f1b5521bfce7cc7aa841f5df08e7f5b1e5e39beb9df8ebefe272f2f",
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null
  },
  {
    "evidenceId": "SEV-DEBT-VIEW-PROMPT",
    "kind": "repository_file",
    "ref": "apps/document-worker/src/company-debt-view.ts",
    "capturedAt": "2026-09-16T22:26:29.355Z",
    "freshness": "immutable",
    "waveId": null,
    "validThrough": null,
    "immutableFingerprint": "3ccc8bcd4c399f984cd399daadf063f1e54638d7",
    "contentFingerprint": "sha256:ebbf0f321e82c2d8e2d4d5e489c4eed9e5f3cbed46f1a7b1047a39f817d037d3",
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null
  },
  {
    "evidenceId": "SEV-ORIGINATION-PROMPT",
    "kind": "repository_file",
    "ref": "apps/document-worker/src/origination-thesis.ts",
    "capturedAt": "2026-09-16T22:26:29.355Z",
    "freshness": "immutable",
    "waveId": null,
    "validThrough": null,
    "immutableFingerprint": "3ccc8bcd4c399f984cd399daadf063f1e54638d7",
    "contentFingerprint": "sha256:6d87f5fe670e5b2712b76b131d68f44426b8a78bc9d370d0f4a3729787898e6b",
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null
  },
  {
    "evidenceId": "SEV-CAPITAL-PLANNING-PROMPT",
    "kind": "repository_file",
    "ref": "apps/document-worker/src/capital-planning.ts",
    "capturedAt": "2026-09-16T22:26:29.355Z",
    "freshness": "immutable",
    "waveId": null,
    "validThrough": null,
    "immutableFingerprint": "3ccc8bcd4c399f984cd399daadf063f1e54638d7",
    "contentFingerprint": "sha256:e28bc9eaeb6a58550e77c76100c99110ec17c9ca1cff3829a802326c4dccb66c",
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null
  },
  {
    "evidenceId": "SEV-CREATOR-REMEDIATION",
    "kind": "repository_file",
    "ref": "docs/build/arcabouco/etapa-1a.md",
    "freshness": "immutable",
    "validThrough": null,
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null,
    "capturedAt": "2026-09-16T22:26:29.355Z",
    "immutableFingerprint": "3ccc8bcd4c399f984cd399daadf063f1e54638d7",
    "contentFingerprint": "sha256:7e075a11e01f60a09f12d5c86719fe4549ad15b198637950659c91aacfb1dcc2"
  },
  {
    "evidenceId": "SEV-ACCESS-REMEDIATION",
    "kind": "repository_file",
    "ref": "docs/build/arcabouco/etapa-1b.md",
    "freshness": "immutable",
    "validThrough": null,
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null,
    "capturedAt": "2026-09-16T22:26:29.355Z",
    "immutableFingerprint": "3ccc8bcd4c399f984cd399daadf063f1e54638d7",
    "contentFingerprint": "sha256:c82442998969807e6025c1d15a087f8cf4a9481bbbff21ad91d0423bbdaa7013"
  },
  {
    "evidenceId": "SEV-PROFILE-REMEDIATION",
    "kind": "repository_file",
    "ref": "docs/build/arcabouco/etapa-1c.md",
    "freshness": "immutable",
    "validThrough": null,
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null,
    "capturedAt": "2026-09-16T22:26:29.355Z",
    "immutableFingerprint": "3ccc8bcd4c399f984cd399daadf063f1e54638d7",
    "contentFingerprint": "sha256:4ff37a2476e10d5ebc00a404cd15a4ebf0ead3fd3478d8c3406f0df59349ed4f"
  },
  {
    "evidenceId": "SEV-CREATOR-REGRESSION",
    "kind": "automated_test",
    "ref": "supabase/tests/creator_authority_revocation.sql",
    "freshness": "immutable",
    "validThrough": null,
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null,
    "capturedAt": "2026-09-16T22:26:29.355Z",
    "immutableFingerprint": "3ccc8bcd4c399f984cd399daadf063f1e54638d7",
    "contentFingerprint": "sha256:76682edf1b62c40b8294628d7b26afea28f93de87900e036ba13f27e4d717fef"
  },
  {
    "evidenceId": "SEV-ACCESS-REGRESSION",
    "kind": "automated_test",
    "ref": "supabase/tests/legacy_access_revocation.sql",
    "freshness": "immutable",
    "validThrough": null,
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null,
    "capturedAt": "2026-09-16T22:26:29.355Z",
    "immutableFingerprint": "3ccc8bcd4c399f984cd399daadf063f1e54638d7",
    "contentFingerprint": "sha256:11fa4e2ad4fa1335b787f6aeb5f06b1f880fa1f646c43bda192bb974b6df8d3e"
  },
  {
    "evidenceId": "SEV-PROFILE-REGRESSION",
    "kind": "automated_test",
    "ref": "supabase/tests/role_free_reasoning_context.sql",
    "freshness": "immutable",
    "validThrough": null,
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null,
    "capturedAt": "2026-09-16T22:26:29.355Z",
    "immutableFingerprint": "3ccc8bcd4c399f984cd399daadf063f1e54638d7",
    "contentFingerprint": "sha256:b0b536748c65802e952053a3ce8b96bec65f2b68dbe0ee72673fcff7daa72e03"
  },
  {
    "evidenceId": "SEV-WORKSPACE-IDENTITY",
    "kind": "repository_file",
    "ref": "supabase/migrations/20260916035105_explicit_workspace_context.sql",
    "capturedAt": "2026-09-16T22:26:29.355Z",
    "freshness": "immutable",
    "validThrough": null,
    "immutableFingerprint": "3ccc8bcd4c399f984cd399daadf063f1e54638d7",
    "contentFingerprint": "sha256:b08a8a77b3969db59a3982ce754c4fbef1472911541f273af3f405d849eecbe6",
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null
  },
  {
    "evidenceId": "SEV-WORKSPACE-CONTEXT-REGRESSION",
    "kind": "automated_test",
    "ref": "supabase/tests/explicit_workspace_context.sql",
    "capturedAt": "2026-09-16T22:26:29.355Z",
    "freshness": "immutable",
    "validThrough": null,
    "immutableFingerprint": "3ccc8bcd4c399f984cd399daadf063f1e54638d7",
    "contentFingerprint": "sha256:a93f58ee06876a9f5a823d0067f1761afbc43f87fb6bc06b576730cb536c1b84",
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null
  },
  {
    "evidenceId": "SEV-OUTBOX-SCHEMA",
    "kind": "repository_file",
    "ref": "supabase/migrations/20260916102242_reconcile_domain_event_audit_outbox.sql",
    "capturedAt": "2026-09-16T22:26:29.355Z",
    "freshness": "immutable",
    "validThrough": null,
    "immutableFingerprint": "3ccc8bcd4c399f984cd399daadf063f1e54638d7",
    "contentFingerprint": "sha256:ee55e0a30bd6dfdb3dc533fa93570106c12082fb4753de8415fe20511a4807e7",
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null
  },
  {
    "evidenceId": "SEV-OUTBOX-CONSUMER",
    "kind": "repository_file",
    "ref": "apps/document-worker/src/event-outbox.ts",
    "capturedAt": "2026-09-16T22:26:29.355Z",
    "freshness": "immutable",
    "validThrough": null,
    "immutableFingerprint": "3ccc8bcd4c399f984cd399daadf063f1e54638d7",
    "contentFingerprint": "sha256:d759d383e4782bf11023aa2eb6f1701062acb4b81d8ceb3ada92957e03cbc782",
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null
  },
  {
    "evidenceId": "SEV-OUTBOX-REVOCATION",
    "kind": "automated_test",
    "ref": "supabase/tests/domain_event_outbox_revocation.sql",
    "capturedAt": "2026-09-16T22:26:29.355Z",
    "freshness": "immutable",
    "validThrough": null,
    "immutableFingerprint": "3ccc8bcd4c399f984cd399daadf063f1e54638d7",
    "contentFingerprint": "sha256:1410fdbfc552aa5a57df7c91e12a6eb8e43b02730442a67eb784cad023490977",
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null
  },
  {
    "evidenceId": "SEV-OUTBOX-CONTRACT",
    "kind": "automated_test",
    "ref": "supabase/tests/domain_event_outbox.sql",
    "capturedAt": "2026-09-16T22:26:29.355Z",
    "freshness": "immutable",
    "validThrough": null,
    "immutableFingerprint": "3ccc8bcd4c399f984cd399daadf063f1e54638d7",
    "contentFingerprint": "sha256:bec2f808a4e140db98934d832886f53d2b0bd09138914233a77be4b51fa90db5",
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null
  },
  {
    "evidenceId": "SEV-OUTBOX-MONITORING",
    "kind": "configuration",
    "ref": "apps/document-worker/monitoring/event-outbox-alarms.json",
    "capturedAt": "2026-09-16T22:26:29.355Z",
    "freshness": "immutable",
    "validThrough": null,
    "immutableFingerprint": "3ccc8bcd4c399f984cd399daadf063f1e54638d7",
    "contentFingerprint": "sha256:6e50808edfa37589077f86949869208ee09636aa370deba47cf717ab083eee18",
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null
  },
  {
    "evidenceId": "SEV-POLICY-SCHEMA",
    "kind": "repository_file",
    "ref": "supabase/migrations/20260916163753_resource_policy_and_barriers.sql",
    "freshness": "immutable",
    "validThrough": null,
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null,
    "capturedAt": "2026-09-16T22:26:29.355Z",
    "immutableFingerprint": "3ccc8bcd4c399f984cd399daadf063f1e54638d7",
    "contentFingerprint": "sha256:7168630924055ee0d3293756e128bad1c188dfb21f412245512520bf44f042d0"
  },
  {
    "evidenceId": "SEV-POLICY-RESOURCE-BOUND",
    "kind": "repository_file",
    "ref": "supabase/migrations/20260916163756_bound_policy_grants_to_resource.sql",
    "freshness": "immutable",
    "validThrough": null,
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null,
    "capturedAt": "2026-09-16T22:26:29.355Z",
    "immutableFingerprint": "3ccc8bcd4c399f984cd399daadf063f1e54638d7",
    "contentFingerprint": "sha256:d5d5d5367fb45ac6538fe44ef4f552f6a67bfbc07cf4ac3c6a1e4cb2a10639a9"
  },
  {
    "evidenceId": "SEV-POLICY-BARRIERS",
    "kind": "automated_test",
    "ref": "supabase/tests/resource_policy_barriers.sql",
    "freshness": "immutable",
    "validThrough": null,
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null,
    "capturedAt": "2026-09-16T22:26:29.355Z",
    "immutableFingerprint": "3ccc8bcd4c399f984cd399daadf063f1e54638d7",
    "contentFingerprint": "sha256:b620fb7e757402a8b580226dce53e998ad56fa1cb4252e5a9f294324010d008c"
  },
  {
    "evidenceId": "SEV-POLICY-DELEGATION",
    "kind": "automated_test",
    "ref": "supabase/tests/resource_policy_delegation.sql",
    "freshness": "immutable",
    "validThrough": null,
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null,
    "capturedAt": "2026-09-16T22:26:29.355Z",
    "immutableFingerprint": "3ccc8bcd4c399f984cd399daadf063f1e54638d7",
    "contentFingerprint": "sha256:9da0136cad8c3261c3d816fe8ebe80de420e1cc0196f737d06312f7b906ceac1"
  },
  {
    "evidenceId": "SEV-POLICY-ISOLATION",
    "kind": "automated_test",
    "ref": "supabase/tests/resource_policy_isolation.sql",
    "freshness": "immutable",
    "validThrough": null,
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null,
    "capturedAt": "2026-09-16T22:26:29.355Z",
    "immutableFingerprint": "3ccc8bcd4c399f984cd399daadf063f1e54638d7",
    "contentFingerprint": "sha256:5c3313ba8cd4a328f32c4cddb917d2070a69f4d8bad210a1bfbba9166aa80d50"
  },
  {
    "evidenceId": "SEV-POLICY-EVENT-ONCE",
    "kind": "automated_test",
    "ref": "supabase/tests/resource_policy_event_once.sql",
    "freshness": "immutable",
    "validThrough": null,
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null,
    "capturedAt": "2026-09-16T22:26:29.355Z",
    "immutableFingerprint": "3ccc8bcd4c399f984cd399daadf063f1e54638d7",
    "contentFingerprint": "sha256:e290ae4fdd503a49821fa8025a81ebae0f547370566e80e56deecec2ff451855"
  },
  {
    "evidenceId": "SEV-POLICY-TYPED-CONTRACT",
    "kind": "automated_test",
    "ref": "packages/access-policy/src/contract.test.ts",
    "freshness": "immutable",
    "validThrough": null,
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null,
    "capturedAt": "2026-09-16T22:26:29.355Z",
    "immutableFingerprint": "3ccc8bcd4c399f984cd399daadf063f1e54638d7",
    "contentFingerprint": "sha256:c2d33b1df1dca7e9c4d2df28d11df319b1b355812d1984bd79afeb0609a45230"
  },
  {
    "evidenceId": "SEV-POLICY-EXPORT",
    "kind": "repository_file",
    "ref": "apps/web/src/lib/auth/resource-download.ts",
    "freshness": "immutable",
    "validThrough": null,
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null,
    "capturedAt": "2026-09-16T22:26:29.355Z",
    "immutableFingerprint": "3ccc8bcd4c399f984cd399daadf063f1e54638d7",
    "contentFingerprint": "sha256:e6852d04ecb63d920419a5090fe7ce6a756ac90718036116beb4d2b578aa546f"
  },
  {
    "evidenceId": "SEV-POLICY-INSTALLED-EVAL",
    "kind": "repository_file",
    "ref": "docs/build/arcabouco/etapa-03-installed-eval.json",
    "freshness": "immutable",
    "validThrough": null,
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null,
    "capturedAt": "2026-09-16T22:26:29.355Z",
    "immutableFingerprint": "3ccc8bcd4c399f984cd399daadf063f1e54638d7",
    "contentFingerprint": "sha256:5c07190f4b99be7704046d2dea5a9d20420c60bf716d02b740877d0131fddea6"
  },
  {
    "evidenceId": "SEV-DOSSIER-SCHEMA",
    "kind": "repository_file",
    "ref": "supabase/migrations/20260916190600_entity_and_dossier_identity.sql",
    "freshness": "immutable",
    "validThrough": null,
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null,
    "capturedAt": "2026-09-16T22:26:29.355Z",
    "immutableFingerprint": "3ccc8bcd4c399f984cd399daadf063f1e54638d7",
    "contentFingerprint": "sha256:3bcd9e093e645bf3aa25861402fcc7252baa492e0663ad759362521d1ebb9bc6"
  },
  {
    "evidenceId": "SEV-DOSSIER-ISOLATION",
    "kind": "automated_test",
    "ref": "supabase/tests/entity_dossier_isolation.sql",
    "freshness": "immutable",
    "validThrough": null,
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null,
    "capturedAt": "2026-09-16T22:26:29.355Z",
    "immutableFingerprint": "3ccc8bcd4c399f984cd399daadf063f1e54638d7",
    "contentFingerprint": "sha256:503fe50b5fafbe0e529cbd548304ff2cff215fcc64dd31f7d247b5ba1fbefd83"
  },
  {
    "evidenceId": "SEV-DOSSIER-PUBLIC-CACHE",
    "kind": "automated_test",
    "ref": "supabase/tests/public_research_public_cache.sql",
    "freshness": "immutable",
    "validThrough": null,
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null,
    "capturedAt": "2026-09-16T22:26:29.355Z",
    "immutableFingerprint": "3ccc8bcd4c399f984cd399daadf063f1e54638d7",
    "contentFingerprint": "sha256:fdaa2d468369d695177279ac1ed430bfac96e112637d5d371d81e6bc1877b091"
  },
  {
    "evidenceId": "SEV-DOSSIER-CONTRACT",
    "kind": "automated_test",
    "ref": "packages/domain-contracts/src/entity-dossier.test.ts",
    "freshness": "immutable",
    "validThrough": null,
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null,
    "capturedAt": "2026-09-16T22:26:29.355Z",
    "immutableFingerprint": "3ccc8bcd4c399f984cd399daadf063f1e54638d7",
    "contentFingerprint": "sha256:ada44f941a3755c75f886f6af7aa0cbbbda1099cf7f344f46061e3e89eca4881"
  },
  {
    "evidenceId": "SEV-DOSSIER-WORKER",
    "kind": "automated_test",
    "ref": "apps/document-worker/src/public-company-memory.test.ts",
    "freshness": "immutable",
    "validThrough": null,
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null,
    "capturedAt": "2026-09-16T22:26:29.355Z",
    "immutableFingerprint": "3ccc8bcd4c399f984cd399daadf063f1e54638d7",
    "contentFingerprint": "sha256:f3abc18325d76d1dd79b822b3ed401dd71b45f4932d805e75a9575a8f30081e0"
  },
  {
    "evidenceId": "SEV-DOSSIER-INSTALLED-EVAL",
    "kind": "repository_file",
    "ref": "docs/build/arcabouco/etapa-05-installed-eval.json",
    "freshness": "immutable",
    "validThrough": null,
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null,
    "capturedAt": "2026-09-16T22:26:29.355Z",
    "immutableFingerprint": "3ccc8bcd4c399f984cd399daadf063f1e54638d7",
    "contentFingerprint": "sha256:bc759ef33186f584f075e8c8edf5139682d09583072c20f79046da016da23008"
  },
  {
    "evidenceId": "SEV-DOSSIER-INSTALLATION",
    "kind": "repository_file",
    "ref": "docs/build/arcabouco/etapa-05-installation.json",
    "freshness": "immutable",
    "validThrough": null,
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null,
    "capturedAt": "2026-09-16T22:26:29.355Z",
    "immutableFingerprint": "3ccc8bcd4c399f984cd399daadf063f1e54638d7",
    "contentFingerprint": "sha256:75ada12c33519b35c86b9148219cafe7e38b972bb6c7b8b3863a697b294119c9"
  },
  {
    "evidenceId": "SEV-SOURCE-PDF-STRUCTURE",
    "kind": "repository_file",
    "ref": "packages/document-intelligence/src/pdf-structure.ts",
    "freshness": "immutable",
    "validThrough": null,
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null,
    "capturedAt": "2026-09-16T22:26:29.355Z",
    "immutableFingerprint": "3ccc8bcd4c399f984cd399daadf063f1e54638d7",
    "contentFingerprint": "sha256:335c901d9fe561cffbc730860a6fe08b7d3321e739417466ddbd0fc3bcf607f1"
  },
  {
    "evidenceId": "SEV-SOURCE-PDF-REGRESSION",
    "kind": "automated_test",
    "ref": "packages/document-intelligence/src/pdf-structure.test.ts",
    "freshness": "immutable",
    "validThrough": null,
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null,
    "capturedAt": "2026-09-16T22:26:29.355Z",
    "immutableFingerprint": "3ccc8bcd4c399f984cd399daadf063f1e54638d7",
    "contentFingerprint": "sha256:65d3935daae0bf9cb917e2a5887312cbd8cbea2dff329e402a90d8471e9bb749"
  },
  {
    "evidenceId": "SEV-SOURCE-E2E",
    "kind": "repository_file",
    "ref": "apps/web/e2e/support/source-verification.ts",
    "freshness": "immutable",
    "validThrough": null,
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null,
    "capturedAt": "2026-09-16T22:26:29.355Z",
    "immutableFingerprint": "3ccc8bcd4c399f984cd399daadf063f1e54638d7",
    "contentFingerprint": "sha256:875e6683d08764314b20edf96572e86d7cefda9a0b9d57699d56ce90fd5d2bb4"
  },
  {
    "evidenceId": "SEV-SOURCE-SCHEMA",
    "kind": "repository_file",
    "ref": "supabase/migrations/20260916212202_logical_sources_and_versions.sql",
    "freshness": "immutable",
    "validThrough": null,
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null,
    "capturedAt": "2026-09-16T22:26:29.355Z",
    "immutableFingerprint": "3ccc8bcd4c399f984cd399daadf063f1e54638d7",
    "contentFingerprint": "sha256:904c16abd195c676c5d9c9cf6350bc968fe8c9b1bcd29e4705f68355243d08a0"
  },
  {
    "evidenceId": "SEV-SOURCE-LEGACY-INSERT",
    "kind": "repository_file",
    "ref": "supabase/migrations/20260916212209_source_identity_legacy_insert_default.sql",
    "freshness": "immutable",
    "validThrough": null,
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null,
    "capturedAt": "2026-09-16T22:26:29.355Z",
    "immutableFingerprint": "3ccc8bcd4c399f984cd399daadf063f1e54638d7",
    "contentFingerprint": "sha256:df14f140ee22f1c2185b950eb14dc95447a3edda72905c91952c2d6f8727120e"
  },
  {
    "evidenceId": "SEV-SOURCE-ISOLATION",
    "kind": "automated_test",
    "ref": "supabase/tests/source_version_identity.sql",
    "freshness": "immutable",
    "validThrough": null,
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null,
    "capturedAt": "2026-09-16T22:26:29.355Z",
    "immutableFingerprint": "3ccc8bcd4c399f984cd399daadf063f1e54638d7",
    "contentFingerprint": "sha256:7125db320affe3cb24871d32336b684cd0e332545fd91c9d52ac7a32dc28e204"
  },
  {
    "evidenceId": "SEV-SOURCE-CONTRACT",
    "kind": "automated_test",
    "ref": "packages/domain-contracts/src/source-version.test.ts",
    "freshness": "immutable",
    "validThrough": null,
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null,
    "capturedAt": "2026-09-16T22:26:29.355Z",
    "immutableFingerprint": "3ccc8bcd4c399f984cd399daadf063f1e54638d7",
    "contentFingerprint": "sha256:a236e7a66ce1d5ab3255ab2cff97444c14ba238ca647a9dc85229f46934c09c2"
  },
  {
    "evidenceId": "SEV-SOURCE-JOB",
    "kind": "automated_test",
    "ref": "apps/document-worker/src/source-version.test.ts",
    "freshness": "immutable",
    "validThrough": null,
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null,
    "capturedAt": "2026-09-16T22:26:29.355Z",
    "immutableFingerprint": "3ccc8bcd4c399f984cd399daadf063f1e54638d7",
    "contentFingerprint": "sha256:49894bf468edfc6a1b641e6fe5adc54aa2a4ab8c52d10c7d69b0e141adfae3c6"
  },
  {
    "evidenceId": "SEV-SOURCE-STORAGE",
    "kind": "automated_test",
    "ref": "apps/document-worker/src/job-storage.test.ts",
    "freshness": "immutable",
    "validThrough": null,
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null,
    "capturedAt": "2026-09-16T22:26:29.355Z",
    "immutableFingerprint": "3ccc8bcd4c399f984cd399daadf063f1e54638d7",
    "contentFingerprint": "sha256:fdd1cc379287c87fb6e55f0a23248c04f4d33b7ffff8367c5a976c59f6fd5d06"
  },
  {
    "evidenceId": "SEV-SOURCE-DOWNLOAD",
    "kind": "automated_test",
    "ref": "apps/web/src/app/[locale]/app/documents/[documentId]/route.test.ts",
    "freshness": "immutable",
    "validThrough": null,
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null,
    "capturedAt": "2026-09-16T22:26:29.355Z",
    "immutableFingerprint": "3ccc8bcd4c399f984cd399daadf063f1e54638d7",
    "contentFingerprint": "sha256:7fa9e7558d9b8529adff924bdab3f9aaacb847870a17f5f90a75250b7ff842c3"
  },
  {
    "evidenceId": "SEV-SOURCE-INSTALLED-EVAL",
    "kind": "repository_file",
    "ref": "docs/build/arcabouco/etapa-06-installed-eval.json",
    "freshness": "immutable",
    "validThrough": null,
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null,
    "capturedAt": "2026-09-16T22:26:29.355Z",
    "immutableFingerprint": "3ccc8bcd4c399f984cd399daadf063f1e54638d7",
    "contentFingerprint": "sha256:c4d2d2760a41b4ba3b2bda3c19a3524a4d4018928b57e625079dba7cf36bcf82"
  },
  {
    "evidenceId": "SEV-SOURCE-INSTALLATION",
    "kind": "repository_file",
    "ref": "docs/build/arcabouco/etapa-06-installation.json",
    "freshness": "immutable",
    "validThrough": null,
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null,
    "capturedAt": "2026-09-16T22:26:29.355Z",
    "immutableFingerprint": "3ccc8bcd4c399f984cd399daadf063f1e54638d7",
    "contentFingerprint": "sha256:86144c7c22834d8ff854b4fa84241cdfd20f2b2c1eb06a402619b2f6c04013bd"
  },
  {
    "evidenceId": "SEV-SOURCE-BEFORE",
    "kind": "repository_file",
    "ref": "docs/build/arcabouco/source-verification-before.json",
    "freshness": "immutable",
    "validThrough": null,
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null,
    "capturedAt": "2026-09-16T22:26:29.355Z",
    "immutableFingerprint": "3ccc8bcd4c399f984cd399daadf063f1e54638d7",
    "contentFingerprint": "sha256:97d7d0f536f3a76a00b4bb91f204240736f83ec08b31741206ec2d71037b9174"
  },
  {
    "evidenceId": "SEV-SOURCE-BEFORE-SQL",
    "kind": "repository_file",
    "ref": "docs/build/arcabouco/source-verification-before.sql",
    "freshness": "immutable",
    "validThrough": null,
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null,
    "capturedAt": "2026-09-16T22:26:29.355Z",
    "immutableFingerprint": "3ccc8bcd4c399f984cd399daadf063f1e54638d7",
    "contentFingerprint": "sha256:e1f6d930abb82b3f8f918fc5c5edc0e8b3024532e5b4d5d3d851c4a97f7f03ad"
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
      "SEV-POLICY-TYPED-CONTRACT",
      "SEV-POLICY-EXPORT",
      "SEV-WORKSPACE-IDENTITY",
      "SEV-WORKSPACE-CONTEXT-REGRESSION",
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
      "SEV-SOURCE-SCHEMA",
      "SEV-SOURCE-LEGACY-INSERT",
      "SEV-SOURCE-ISOLATION",
      "SEV-SOURCE-INSTALLED-EVAL",
      "SEV-SOURCE-INSTALLATION",
      "SEV-SOURCE-BEFORE",
      "SEV-SOURCE-BEFORE-SQL",
      "SEV-DOSSIER-SCHEMA",
      "SEV-DOSSIER-ISOLATION",
      "SEV-DOSSIER-INSTALLED-EVAL",
      "SEV-DOSSIER-INSTALLATION",
      "SEV-POLICY-SCHEMA",
      "SEV-POLICY-RESOURCE-BOUND",
      "SEV-POLICY-BARRIERS",
      "SEV-POLICY-ISOLATION",
      "SEV-POLICY-INSTALLED-EVAL",
      "SEV-WORKSPACE-IDENTITY",
      "SEV-OUTBOX-SCHEMA",
      "SEV-OUTBOX-CONTRACT",
      "SEV-OUTBOX-REVOCATION",
      "SEV-CREATOR-REMEDIATION",
      "SEV-ACCESS-REMEDIATION",
      "SEV-CREATOR-REGRESSION",
      "SEV-ACCESS-REGRESSION",
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
      "SEV-SOURCE-JOB",
      "SEV-SOURCE-STORAGE",
      "SEV-SOURCE-PDF-STRUCTURE",
      "SEV-SOURCE-PDF-REGRESSION",
      "SEV-SOURCE-E2E",
      "SEV-DOSSIER-WORKER",
      "SEV-DOSSIER-PUBLIC-CACHE",
      "SEV-POLICY-DELEGATION",
      "SEV-POLICY-EVENT-ONCE",
      "SEV-OUTBOX-CONSUMER",
      "SEV-OUTBOX-CONTRACT",
      "SEV-OUTBOX-REVOCATION",
      "SEV-PROFILE-REMEDIATION",
      "SEV-PROFILE-REGRESSION",
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
      "SEV-EVAL-LIVE-GATE",
      "SEV-EVAL-DOCUMENT-WORK",
      "SEV-EVAL-DOCUMENT-CONTINUATION",
      "SEV-DEPLOY-BOOT-PROOF",
      "SEV-CI-SCANNER",
      "SEV-CI-SCANNER-START"
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
      "SEV-SOURCE-SCHEMA",
      "SEV-SOURCE-ISOLATION",
      "SEV-DOSSIER-SCHEMA",
      "SEV-DOSSIER-ISOLATION",
      "SEV-POLICY-SCHEMA",
      "SEV-POLICY-BARRIERS",
      "SEV-POLICY-ISOLATION",
      "SEV-OUTBOX-SCHEMA",
      "SEV-ACCESS-REMEDIATION",
      "SEV-PROFILE-REMEDIATION",
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
      "SEV-SOURCE-STORAGE",
      "SEV-SOURCE-ISOLATION",
      "SEV-POLICY-SCHEMA",
      "SEV-POLICY-EXPORT",
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
      "SEV-OUTBOX-MONITORING",
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
  "FLOW-CI-SCANNER-PACKAGES": {
    "evidenceRefs": [
      "SEV-CI-SCANNER",
      "SEV-CI-SCANNER-START"
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
  "FLOW-CI-SCANNER-DEFINITIONS": {
    "evidenceRefs": [
      "SEV-CI-SCANNER-START"
    ],
    "gapRefs": [
      "SG-VENDOR-ASSURANCE",
      "SG-ASSET-DISCOVERY"
    ],
    "controlIds": [
      "TRUST-DOC-01",
      "TRUST-SDLC-02",
      "TRUST-VENDOR-01"
    ]
  },
  "FLOW-GITHUB-WORKER-DIAGNOSTICS": {
    "evidenceRefs": [
      "SEV-DEPLOY-WORKER",
      "SEV-DEPLOY-BOOT-PROOF",
      "SEV-AWS-DEPLOY-ROLE-SNAPSHOT"
    ],
    "gapRefs": [
      "SG-DEPLOY-DIAGNOSTICS",
      "SG-LOGGING-CONTENT-SAFETY"
    ],
    "controlIds": [
      "TRUST-CLOUD-01",
      "TRUST-OPS-01",
      "TRUST-DATA-02"
    ]
  },
  "FLOW-WEB-DATA": {
    "evidenceRefs": [
      "SEV-SOURCE-CONTRACT",
      "SEV-SOURCE-ISOLATION",
      "SEV-SOURCE-DOWNLOAD",
      "SEV-DOSSIER-CONTRACT",
      "SEV-DOSSIER-ISOLATION",
      "SEV-POLICY-SCHEMA",
      "SEV-POLICY-TYPED-CONTRACT",
      "SEV-POLICY-EXPORT",
      "SEV-CREATOR-REMEDIATION",
      "SEV-ACCESS-REMEDIATION",
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
      "SEV-SOURCE-JOB",
      "SEV-SOURCE-STORAGE",
      "SEV-DOSSIER-WORKER",
      "SEV-DOSSIER-PUBLIC-CACHE",
      "SEV-POLICY-DELEGATION",
      "SEV-POLICY-EVENT-ONCE",
      "SEV-OUTBOX-SCHEMA",
      "SEV-OUTBOX-CONSUMER",
      "SEV-OUTBOX-REVOCATION",
      "SEV-ACCESS-REMEDIATION",
      "SEV-PROFILE-REMEDIATION",
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
      "SEV-PROFILE-REMEDIATION",
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
      "SEV-PROFILE-REMEDIATION",
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
      "SEV-WORKER-TASK",
      "SEV-DEPLOY-BOOT-PROOF"
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
      "SEV-EVAL-LIVE-GATE",
      "SEV-EVAL-DOCUMENT-WORK",
      "SEV-EVAL-DOCUMENT-CONTINUATION"
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
      "SEV-EVAL-LIVE-GATE",
      "SEV-EVAL-DOCUMENT-WORK",
      "SEV-EVAL-DOCUMENT-CONTINUATION"
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
      "SEV-EVAL-CODEX",
      "SEV-EVAL-DOCUMENT-WORK"
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
  "ID-CI-CLAMD": {
    "evidenceRefs": [
      "SEV-CI-SCANNER-START"
    ],
    "gapRefs": [
      "SG-ASSET-DISCOVERY"
    ],
    "controlIds": [
      "TRUST-DOC-01",
      "TRUST-ID-01",
      "TRUST-CLOUD-02"
    ]
  },
  "ID-END-USER": {
    "evidenceRefs": [
      "SEV-CREATOR-REMEDIATION",
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
      "SEV-SOURCE-ISOLATION",
      "SEV-DOSSIER-PUBLIC-CACHE",
      "SEV-POLICY-SCHEMA",
      "SEV-POLICY-DELEGATION",
      "SEV-OUTBOX-CONTRACT",
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
      "SEV-EVAL-LIVE-GATE",
      "SEV-EVAL-DOCUMENT-WORK",
      "SEV-EVAL-DOCUMENT-CONTINUATION"
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
  "VEN-UBUNTU-PACKAGES": {
    "evidenceRefs": [
      "SEV-CI-SCANNER-START"
    ],
    "gapRefs": [
      "SG-VENDOR-ASSURANCE",
      "SG-ASSET-DISCOVERY",
      "SG-REGION-MAP"
    ],
    "controlIds": [
      "TRUST-SDLC-02",
      "TRUST-VENDOR-01"
    ]
  },
  "VEN-CLAMAV-DEFINITIONS": {
    "evidenceRefs": [
      "SEV-CI-SCANNER-START"
    ],
    "gapRefs": [
      "SG-VENDOR-ASSURANCE",
      "SG-ASSET-DISCOVERY",
      "SG-REGION-MAP"
    ],
    "controlIds": [
      "TRUST-SDLC-02",
      "TRUST-VENDOR-01"
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
      "SEV-EVAL-LIVE-GATE",
      "SEV-EVAL-DOCUMENT-WORK",
      "SEV-EVAL-DOCUMENT-CONTINUATION"
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
      "SEV-EVAL-LIVE-GATE",
      "SEV-EVAL-DOCUMENT-WORK",
      "SEV-EVAL-DOCUMENT-CONTINUATION"
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
      "SEV-EVAL-CODEX",
      "SEV-EVAL-DOCUMENT-WORK"
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
      "VEN-UBUNTU-PACKAGES",
      "VEN-CLAMAV-DEFINITIONS",
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
      "VEN-PLAYWRIGHT-DOWNLOADS",
      "FLOW-CI-SCANNER-PACKAGES",
      "FLOW-CI-SCANNER-DEFINITIONS"
    ],
    "evidenceRefs": [
      "SEV-SECURITY-PLAN",
      "SEV-CI-SCANNER-START"
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
      "VEN-UBUNTU-PACKAGES",
      "VEN-CLAMAV-DEFINITIONS",
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
      "VEN-AWS",
      "FLOW-GITHUB-WORKER-DIAGNOSTICS"
    ],
    "evidenceRefs": [
      "SEV-DEPLOY-WORKER",
      "SEV-AWS-DEPLOY-ROLE-SNAPSHOT",
      "SEV-DEPLOY-BOOT-PROOF"
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
      "STORE-CLOUDWATCH",
      "FLOW-GITHUB-WORKER-DIAGNOSTICS"
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
      "VEN-PLAYWRIGHT-DOWNLOADS",
      "FLOW-CI-SCANNER-PACKAGES",
      "FLOW-CI-SCANNER-DEFINITIONS",
      "VEN-UBUNTU-PACKAGES",
      "VEN-CLAMAV-DEFINITIONS",
      "ID-CI-CLAMD"
    ],
    "evidenceRefs": [
      "SEV-WEB-DEPENDENCIES",
      "SEV-WORKER-TASK",
      "SEV-EVAL-GOLD",
      "SEV-EVAL-LIVE-GATE",
      "SEV-QUALITY-WORKFLOW",
      "SEV-SECURITY-WORKFLOW",
      "SEV-LOCKFILE",
      "SEV-SECURITY-PLAN",
      "SEV-CI-SCANNER-START"
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
