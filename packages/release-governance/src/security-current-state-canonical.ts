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
  inventoryFingerprint: "e1d935f20c99d56e846302b81996e69d5f2a2c521cc9c43c014deaf6a237003c",
  generatedAt: "2026-09-19T12:15:21.922Z",
  evidenceCutoff: "2026-09-19T12:15:21.922Z",
  reviewDueAt: null,
  reviewCadence: "per_wave",
  waveId: "wave-12",
  waveStatus: "open",
  materialChangeState: "reviewed",
} as const;

const evidenceManifest = [
  {
    "evidenceId": "SEV-AGENTS-SCOPE",
    "kind": "repository_file",
    "ref": "AGENTS.md",
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "freshness": "immutable",
    "validThrough": null,
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
    "contentFingerprint": "sha256:f7a9e7d4f985042198374319b689f4659fbe035ef39775ac84963cd231e7a113",
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null
  },
  {
    "evidenceId": "SEV-SECURITY-PLAN",
    "kind": "design_reference",
    "ref": "docs/security/ENTERPRISE_SECURITY_COMPLIANCE_READINESS_PLAN.md",
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "freshness": "immutable",
    "validThrough": null,
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
    "contentFingerprint": "sha256:66dfb5d88ec405dba6540ccaae091db1fbc03f5b2f6ac0f727595117813efd3b",
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null
  },
  {
    "evidenceId": "SEV-ENV-NAMES",
    "kind": "configuration",
    "ref": ".env.example",
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "freshness": "immutable",
    "validThrough": null,
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
    "contentFingerprint": "sha256:a46f64be02956d05f01fb5368291c03d3eee2940972037b606ed2ee376a4204f",
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null
  },
  {
    "evidenceId": "SEV-WORKER-TASK",
    "kind": "configuration",
    "ref": "apps/document-worker/task-definition.json",
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "freshness": "immutable",
    "validThrough": null,
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
    "contentFingerprint": "sha256:16ff863671513d999fafce3b5d6fd47f7f6117139ff03a2708b1d7f454d56e51",
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null
  },
  {
    "evidenceId": "SEV-WORKER-RUNTIME",
    "kind": "repository_file",
    "ref": "apps/document-worker/src/main.ts",
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "freshness": "immutable",
    "validThrough": null,
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
    "contentFingerprint": "sha256:82d0072e30320925b0ad0d6d109827e988b851c1b77150fc70289968a69961da",
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null
  },
  {
    "evidenceId": "SEV-WORKER-CONFIG",
    "kind": "repository_file",
    "ref": "apps/document-worker/src/config.ts",
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "freshness": "immutable",
    "validThrough": null,
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
    "contentFingerprint": "sha256:956e4f51ac3eaed214a4e8c5d51aa87c8b5a44f301bb4078a3438f3a6235591a",
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null
  },
  {
    "evidenceId": "SEV-DEPLOY-WORKER",
    "kind": "configuration",
    "ref": ".github/workflows/deploy-worker.yml",
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "freshness": "immutable",
    "validThrough": null,
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
    "contentFingerprint": "sha256:91f4f8a66ba7b49ab4dfda0e35a26fe33865f2e6a846d89d93350761dc70b501",
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null
  },
  {
    "evidenceId": "SEV-EVAL-EXTRACTION",
    "kind": "configuration",
    "ref": ".github/workflows/measure-extraction.yml",
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "freshness": "immutable",
    "validThrough": null,
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
    "contentFingerprint": "sha256:41da24524f28ec5a220eeaf88fdb31483968fe3be5791c92e1a70e8f093154dc",
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null
  },
  {
    "evidenceId": "SEV-EVAL-INTENT",
    "kind": "configuration",
    "ref": ".github/workflows/intent-router-gold.yml",
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "freshness": "immutable",
    "validThrough": null,
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
    "contentFingerprint": "sha256:f01f91770063d9a939f4c95d7e689de27f0754b4ab0c0a6058143113c206bccb",
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null
  },
  {
    "evidenceId": "SEV-EVAL-CLASSIFICATION",
    "kind": "configuration",
    "ref": ".github/workflows/measure-classification.yml",
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "freshness": "immutable",
    "validThrough": null,
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
    "contentFingerprint": "sha256:de9c38e47d635aea1224aa9eee9dbadfac537d52d1bb7365abb172e91428b8b0",
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null
  },
  {
    "evidenceId": "SEV-EVAL-GOLD",
    "kind": "configuration",
    "ref": ".github/workflows/gold-baseline.yml",
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "freshness": "immutable",
    "validThrough": null,
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
    "contentFingerprint": "sha256:43cae31f6b37655cf150ae2a44ab07c3267a240c08403d3020b6236229f9f27e",
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null
  },
  {
    "evidenceId": "SEV-EVAL-PROBE",
    "kind": "configuration",
    "ref": ".github/workflows/probe-structured-output.yml",
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "freshness": "immutable",
    "validThrough": null,
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
    "contentFingerprint": "sha256:be99868be6efc016e72eea9b92c70d04111dc1c3984b2e589d078ac049fd76e3",
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null
  },
  {
    "evidenceId": "SEV-EVAL-CODEX",
    "kind": "configuration",
    "ref": ".github/workflows/codex-review.yml",
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "freshness": "immutable",
    "validThrough": null,
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
    "contentFingerprint": "sha256:a723b8b394f3fdc064257054760c3e6ebfc6bed36014a4321e1a7bf228a52ff3",
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null
  },
  {
    "evidenceId": "SEV-EVAL-LIVE-GATE",
    "kind": "configuration",
    "ref": ".github/workflows/live-preview-gate.yml",
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "freshness": "immutable",
    "validThrough": null,
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
    "contentFingerprint": "sha256:77f009aa244ca9ada95f9730b3468d85ae0cee0b2d6f442e860bc206051c65d0",
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null
  },
  {
    "evidenceId": "SEV-QUALITY-WORKFLOW",
    "kind": "configuration",
    "ref": ".github/workflows/quality.yml",
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "freshness": "immutable",
    "validThrough": null,
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
    "contentFingerprint": "sha256:c918f0b0789a97e1a702b47f77ebc81682da44dc7831eed8e5a0439a30730cb5",
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null
  },
  {
    "evidenceId": "SEV-CODEOWNERS",
    "kind": "configuration",
    "ref": ".github/CODEOWNERS",
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "freshness": "immutable",
    "validThrough": null,
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
    "contentFingerprint": "sha256:857ea6d9e85324e9d745ed26c74dd66700677bc80ab3e49f4ca2bffa121d2bc4",
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null
  },
  {
    "evidenceId": "SEV-SECURITY-WORKFLOW",
    "kind": "configuration",
    "ref": ".github/workflows/security.yml",
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "freshness": "immutable",
    "validThrough": null,
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
    "contentFingerprint": "sha256:e9470928fac9f56fe8f4743ca6e93fba4122cff8887288dd45ab23b3ec6fe0f0",
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null
  },
  {
    "evidenceId": "SEV-SUPABASE-CONFIG",
    "kind": "configuration",
    "ref": "supabase/config.toml",
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "freshness": "immutable",
    "validThrough": null,
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
    "contentFingerprint": "sha256:921710e1efde338a5b3c90fa3c7db4a2a21cec3a476eb0ed87e6c630bcdb3404",
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null
  },
  {
    "evidenceId": "SEV-RLS-TEST",
    "kind": "automated_test",
    "ref": "supabase/tests/rls_non_interference.sql",
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "freshness": "immutable",
    "validThrough": null,
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
    "contentFingerprint": "sha256:5824f92783c8db983753640a470a67b4fb720f94a2ce0261c488befa69272e12",
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null
  },
  {
    "evidenceId": "SEV-MODEL-DATA-POLICY",
    "kind": "repository_file",
    "ref": "packages/model-gateway/src/data-policy.ts",
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "freshness": "immutable",
    "validThrough": null,
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
    "contentFingerprint": "sha256:10fbb047ff892af41e2eaa69a94bd7a8d81896732eb20abc38a71346abe961ea",
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null
  },
  {
    "evidenceId": "SEV-MODEL-DATA-POLICY-TEST",
    "kind": "automated_test",
    "ref": "packages/model-gateway/src/index.test.ts",
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "freshness": "immutable",
    "validThrough": null,
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
    "contentFingerprint": "sha256:ba1ce0acd1b18b16777323f36ef148b9ba49ff779f0be72aba4ae7655f7390a2",
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null
  },
  {
    "evidenceId": "SEV-MODEL-POLICY",
    "kind": "configuration",
    "ref": "packages/model-gateway/src/policy.ts",
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "freshness": "immutable",
    "validThrough": null,
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
    "contentFingerprint": "sha256:4bd5d315e33e25b3b526742b7298cbde8305519cdcc59f64e14bb1884af9dcb9",
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null
  },
  {
    "evidenceId": "SEV-PUBLIC-RESEARCH",
    "kind": "repository_file",
    "ref": "packages/public-research/src/source-registry.ts",
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "freshness": "immutable",
    "validThrough": null,
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
    "contentFingerprint": "sha256:56f24bfadfad898f0c6477b191e259d83822fd7741dd1a3af217a6efeab777a4",
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null
  },
  {
    "evidenceId": "SEV-WEB-OBSERVABILITY",
    "kind": "configuration",
    "ref": "apps/web/src/instrumentation-client.ts",
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "freshness": "immutable",
    "validThrough": null,
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
    "contentFingerprint": "sha256:579d1f33c30b57cd2c46916b67821813d4f3f15dbe184db56dfa632c615d0742",
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null
  },
  {
    "evidenceId": "SEV-WEB-UPLOAD",
    "kind": "repository_file",
    "ref": "apps/web/src/lib/intake/upload-client.ts",
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "freshness": "immutable",
    "validThrough": null,
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
    "contentFingerprint": "sha256:29574865f9ac4f3e9a52d7621f4e93218ea650b9247509b35fee2f150e92376a",
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null
  },
  {
    "evidenceId": "SEV-WEB-DEPENDENCIES",
    "kind": "repository_file",
    "ref": "apps/web/package.json",
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "freshness": "immutable",
    "validThrough": null,
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
    "contentFingerprint": "sha256:63b25851432f1a244c56c299808c80133192e4b176e14bc330019d843deb8a12",
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null
  },
  {
    "evidenceId": "SEV-LOCKFILE",
    "kind": "configuration",
    "ref": "pnpm-lock.yaml",
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "freshness": "immutable",
    "validThrough": null,
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
    "contentFingerprint": "sha256:9c58538e770b8ae181c088a42ba33a5456fbbc112eda3188b9898c084464df5b",
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null
  },
  {
    "evidenceId": "SEV-CASE-RENDER",
    "kind": "repository_file",
    "ref": "packages/case-render/src/html.ts",
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "freshness": "immutable",
    "validThrough": null,
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
    "contentFingerprint": "sha256:9227e1db4e54a0c0fa66502027dc234cc7ced8cf8f9b2ba26c71ca21d15a64b9",
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null
  },
  {
    "evidenceId": "SEV-ROLLOUT-ORDER",
    "kind": "repository_file",
    "ref": "docs/build/ACCEPTANCE_EVIDENCE.md",
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "freshness": "immutable",
    "validThrough": null,
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
    "contentFingerprint": "sha256:750f1e393b4852c11c5828ed17e052da4528562f47b036fecd715710279b3722",
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null
  },
  {
    "evidenceId": "SEV-AWS-DEPLOY-ROLE-SNAPSHOT",
    "kind": "operator_observation",
    "ref": "docs/security/evidence/aws-worker-rollout-diagnostics-wave-12.json",
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "freshness": "wave_bound",
    "validThrough": null,
    "immutableFingerprint": null,
    "contentFingerprint": "sha256:2f4f8043ea319f8186ac2d63372c2a2b8799cafb191c4837ca86c48c7e53f11a",
    "authorityRef": "AUTH-OPERATOR-OBSERVATION-ONLY",
    "collector": {
      "name": "codex-read-only-delivery-observation",
      "version": "2",
      "principalClass": "repository automation using existing GitHub and temporary AWS console-authenticated CLI sessions"
    },
    "waveId": "wave-12"
  },
  {
    "evidenceId": "SEV-EVAL-DOCUMENT-WORK",
    "kind": "configuration",
    "ref": ".github/workflows/document-work-product-live.yml",
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "freshness": "immutable",
    "waveId": null,
    "validThrough": null,
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
    "contentFingerprint": "sha256:80e8f93ed6ab2b393f701d13663eda6eec7511eeae2d354967226020e2cb01e3",
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null
  },
  {
    "evidenceId": "SEV-EVAL-DOCUMENT-CONTINUATION",
    "kind": "configuration",
    "ref": ".github/workflows/document-work-product-continuation.yml",
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "freshness": "immutable",
    "waveId": null,
    "validThrough": null,
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
    "contentFingerprint": "sha256:62b7512adff8d6d21ddcb0f9e4aa6cf1004281236bfa07d20cd637ced6585eab",
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null
  },
  {
    "evidenceId": "SEV-CI-SCANNER",
    "kind": "configuration",
    "ref": ".github/workflows/documentary-scanner.yml",
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "freshness": "immutable",
    "waveId": null,
    "validThrough": null,
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
    "contentFingerprint": "sha256:3085403912d5f15249ce980defb260229757eedbb5540857b7a3b25857315804",
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null
  },
  {
    "evidenceId": "SEV-CI-SCANNER-START",
    "kind": "repository_file",
    "ref": "scripts/ci/start-documentary-scanner.sh",
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "freshness": "immutable",
    "waveId": null,
    "validThrough": null,
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
    "contentFingerprint": "sha256:dc5d650377450a162c74a062e3780aae7997b516d5b1aff58187aadbb4ac8b77",
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null
  },
  {
    "evidenceId": "SEV-DEPLOY-BOOT-PROOF",
    "kind": "repository_file",
    "ref": "scripts/ci/verify-worker-boot-flag.py",
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "freshness": "immutable",
    "waveId": null,
    "validThrough": null,
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
    "contentFingerprint": "sha256:75de84d2a98dd1ae86fc097b5e3e2b3a096723b2102641a431448d64066584d0",
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null
  },
  {
    "evidenceId": "SEV-ORG-AUTHORITY-SQL",
    "kind": "repository_file",
    "ref": "supabase/migrations/20260815014649_platform_foundation.sql",
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "freshness": "immutable",
    "waveId": null,
    "validThrough": null,
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
    "contentFingerprint": "sha256:ff4f010fe53984acfc2974fe1427f650c16cce5ec403066b6bcea4e3bf02ac1f",
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null
  },
  {
    "evidenceId": "SEV-PROJECT-ACCESS-SQL",
    "kind": "repository_file",
    "ref": "supabase/migrations/20260901035248_universal_capital_projects.sql",
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "freshness": "immutable",
    "waveId": null,
    "validThrough": null,
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
    "contentFingerprint": "sha256:af51e2995af8a4d346c135dac7196cc0265be174b7f048ba80b5ca8c8abb5009",
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null
  },
  {
    "evidenceId": "SEV-INTAKE-ACCESS-SQL",
    "kind": "repository_file",
    "ref": "supabase/migrations/20260817202038_document_first_intake.sql",
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "freshness": "immutable",
    "waveId": null,
    "validThrough": null,
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
    "contentFingerprint": "sha256:b44555d38f1b5521bfce7cc7aa841f5df08e7f5b1e5e39beb9df8ebefe272f2f",
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null
  },
  {
    "evidenceId": "SEV-DEBT-VIEW-PROMPT",
    "kind": "repository_file",
    "ref": "apps/document-worker/src/company-debt-view.ts",
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "freshness": "immutable",
    "waveId": null,
    "validThrough": null,
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
    "contentFingerprint": "sha256:ebbf0f321e82c2d8e2d4d5e489c4eed9e5f3cbed46f1a7b1047a39f817d037d3",
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null
  },
  {
    "evidenceId": "SEV-ORIGINATION-PROMPT",
    "kind": "repository_file",
    "ref": "apps/document-worker/src/origination-thesis.ts",
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "freshness": "immutable",
    "waveId": null,
    "validThrough": null,
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
    "contentFingerprint": "sha256:6d87f5fe670e5b2712b76b131d68f44426b8a78bc9d370d0f4a3729787898e6b",
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null
  },
  {
    "evidenceId": "SEV-CAPITAL-PLANNING-PROMPT",
    "kind": "repository_file",
    "ref": "apps/document-worker/src/capital-planning.ts",
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "freshness": "immutable",
    "waveId": null,
    "validThrough": null,
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
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
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
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
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
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
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
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
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
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
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
    "contentFingerprint": "sha256:35976f7776f61cd9060d23880df9f153cc6cad20b7bb0e095e8dc47dde0f5294"
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
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
    "contentFingerprint": "sha256:2d8208a5a5d18e80fef883809b765e556b5c4cdf3d00460c051512a9c43b0ff4"
  },
  {
    "evidenceId": "SEV-WORKSPACE-IDENTITY",
    "kind": "repository_file",
    "ref": "supabase/migrations/20260916035105_explicit_workspace_context.sql",
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "freshness": "immutable",
    "validThrough": null,
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
    "contentFingerprint": "sha256:b08a8a77b3969db59a3982ce754c4fbef1472911541f273af3f405d849eecbe6",
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null
  },
  {
    "evidenceId": "SEV-WORKSPACE-CONTEXT-REGRESSION",
    "kind": "automated_test",
    "ref": "supabase/tests/explicit_workspace_context.sql",
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "freshness": "immutable",
    "validThrough": null,
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
    "contentFingerprint": "sha256:a93f58ee06876a9f5a823d0067f1761afbc43f87fb6bc06b576730cb536c1b84",
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null
  },
  {
    "evidenceId": "SEV-OUTBOX-SCHEMA",
    "kind": "repository_file",
    "ref": "supabase/migrations/20260916102242_reconcile_domain_event_audit_outbox.sql",
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "freshness": "immutable",
    "validThrough": null,
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
    "contentFingerprint": "sha256:ee55e0a30bd6dfdb3dc533fa93570106c12082fb4753de8415fe20511a4807e7",
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null
  },
  {
    "evidenceId": "SEV-OUTBOX-CONSUMER",
    "kind": "repository_file",
    "ref": "apps/document-worker/src/event-outbox.ts",
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "freshness": "immutable",
    "validThrough": null,
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
    "contentFingerprint": "sha256:d759d383e4782bf11023aa2eb6f1701062acb4b81d8ceb3ada92957e03cbc782",
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null
  },
  {
    "evidenceId": "SEV-OUTBOX-REVOCATION",
    "kind": "automated_test",
    "ref": "supabase/tests/domain_event_outbox_revocation.sql",
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "freshness": "immutable",
    "validThrough": null,
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
    "contentFingerprint": "sha256:1d5820da1987b7140467f80e53b6eb163b4b7439f783d64092d7fadfc1548f42",
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null
  },
  {
    "evidenceId": "SEV-OUTBOX-CONTRACT",
    "kind": "automated_test",
    "ref": "supabase/tests/domain_event_outbox.sql",
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "freshness": "immutable",
    "validThrough": null,
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
    "contentFingerprint": "sha256:bec2f808a4e140db98934d832886f53d2b0bd09138914233a77be4b51fa90db5",
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null
  },
  {
    "evidenceId": "SEV-OUTBOX-MONITORING",
    "kind": "configuration",
    "ref": "apps/document-worker/monitoring/event-outbox-alarms.json",
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "freshness": "immutable",
    "validThrough": null,
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
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
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
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
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
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
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
    "contentFingerprint": "sha256:e2e762cea70308a5458870646b8708a1fe3d5aa68114409402cbcd5099054c3f"
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
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
    "contentFingerprint": "sha256:c44a2d28484fc5b9637885950da2c22fddd8eabac73d1ce1ad5b2c9cb3502c24"
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
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
    "contentFingerprint": "sha256:3971f6b391f4c11440648985bf3d1c50a5a22668703e4f6db39281e6ae48e642"
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
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
    "contentFingerprint": "sha256:ac0248732b87f47835558f56f8c40c7e98818d9b58508a503e58eb43defb6b02"
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
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
    "contentFingerprint": "sha256:0f4d51ed241d4094ab19b3d966d00c9037bfba0ba6e7e9148672b1fdd88c11e9"
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
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
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
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
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
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
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
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
    "contentFingerprint": "sha256:af3080ed96c4a5fc21cd425171fffebca6e95e0efefd1a660ad0cde4d0530ae2"
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
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
    "contentFingerprint": "sha256:426b375bd065a9575ab1dd3c759af3cd30d5abac58cbefef40ae0729d8858a31"
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
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
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
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
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
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
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
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
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
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
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
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
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
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
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
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
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
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
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
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
    "contentFingerprint": "sha256:eea6b7b8f34d4963b8ed6cdb2a1277dd583c7657c550e6f8f547d1a4756996e9"
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
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
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
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
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
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
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
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
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
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
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
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
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
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
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
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
    "contentFingerprint": "sha256:e1f6d930abb82b3f8f918fc5c5edc0e8b3024532e5b4d5d3d851c4a97f7f03ad"
  },
  {
    "evidenceId": "SEV-RIGHTS-SCHEMA",
    "kind": "repository_file",
    "ref": "supabase/migrations/20260917025326_source_rights_and_authorized_retrieval.sql",
    "freshness": "immutable",
    "validThrough": null,
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null,
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
    "contentFingerprint": "sha256:3d56ff2850b0242652e39158c9e343d99e9069a0988a5cc80431bb270bdf05db"
  },
  {
    "evidenceId": "SEV-RIGHTS-RETRIEVAL",
    "kind": "automated_test",
    "ref": "supabase/tests/source_rights_retrieval.sql",
    "freshness": "immutable",
    "validThrough": null,
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null,
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
    "contentFingerprint": "sha256:f7f3157ed0de6ead062bfc82071607125a7ffffcebcbb88209a26e7193e44d63"
  },
  {
    "evidenceId": "SEV-RIGHTS-DEADLINE",
    "kind": "automated_test",
    "ref": "supabase/tests/source_rights_deadline.sql",
    "freshness": "immutable",
    "validThrough": null,
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null,
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
    "contentFingerprint": "sha256:aaf9c46f79c30e70059c5326fc348a87baa0b577d6c00b733dbdace2c221fdff"
  },
  {
    "evidenceId": "SEV-RIGHTS-DELIVERY",
    "kind": "automated_test",
    "ref": "supabase/tests/source_rights_retrieval_delivery.sql",
    "freshness": "immutable",
    "validThrough": null,
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null,
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
    "contentFingerprint": "sha256:a86e3537a85222061dce4a18b507372a716f8a7cac351a62fee22af6bc161651"
  },
  {
    "evidenceId": "SEV-RIGHTS-SCOPE",
    "kind": "automated_test",
    "ref": "supabase/tests/source_rights_search_isolation.sql",
    "freshness": "immutable",
    "validThrough": null,
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null,
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
    "contentFingerprint": "sha256:3e31f22d37e7c0d7ab3962a00797b6eb0cf2dcbe3c95d4e0ed90a4e520fece52"
  },
  {
    "evidenceId": "SEV-RIGHTS-JOB",
    "kind": "automated_test",
    "ref": "supabase/tests/source_rights_worker_revocation.sql",
    "freshness": "immutable",
    "validThrough": null,
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null,
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
    "contentFingerprint": "sha256:849329ddde8e25757eb77b6331b88b8d3c0e71152ef71797a2b7fb61b1d71346"
  },
  {
    "evidenceId": "SEV-RIGHTS-PERFORMANCE",
    "kind": "automated_test",
    "ref": "supabase/tests/source_rights_performance.sql",
    "freshness": "immutable",
    "validThrough": null,
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null,
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
    "contentFingerprint": "sha256:2d9866a7c47c18e4b79256a3e925aaeaad0101c2677214a3374d5bbf03c23a8a"
  },
  {
    "evidenceId": "SEV-RIGHTS-PUBLIC-CACHE",
    "kind": "automated_test",
    "ref": "supabase/tests/public_research_public_cache.sql",
    "freshness": "immutable",
    "validThrough": null,
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null,
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
    "contentFingerprint": "sha256:426b375bd065a9575ab1dd3c759af3cd30d5abac58cbefef40ae0729d8858a31"
  },
  {
    "evidenceId": "SEV-RIGHTS-ADAPTER",
    "kind": "repository_file",
    "ref": "packages/governed-retrieval/src/retrieve.ts",
    "freshness": "immutable",
    "validThrough": null,
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null,
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
    "contentFingerprint": "sha256:e8448801f312afa11d47b03645be212d9973a77635c26093a0d350cbd7c6ad55"
  },
  {
    "evidenceId": "SEV-RIGHTS-ADAPTER-EVAL",
    "kind": "automated_test",
    "ref": "packages/governed-retrieval/src/authorized-retrieval.test.ts",
    "freshness": "immutable",
    "validThrough": null,
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null,
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
    "contentFingerprint": "sha256:910f87ef8c4041a6bf3a32b5981e45fc2bf176b73fdb98042fdb6f55440664e7"
  },
  {
    "evidenceId": "SEV-RIGHTS-REGISTRY",
    "kind": "repository_file",
    "ref": "packages/public-research/src/source-registry.ts",
    "freshness": "immutable",
    "validThrough": null,
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null,
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
    "contentFingerprint": "sha256:56f24bfadfad898f0c6477b191e259d83822fd7741dd1a3af217a6efeab777a4"
  },
  {
    "evidenceId": "SEV-RIGHTS-INSTALLATION",
    "kind": "repository_file",
    "ref": "docs/build/arcabouco/etapa-07-installation.json",
    "freshness": "immutable",
    "validThrough": null,
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null,
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
    "contentFingerprint": "sha256:e0d16162725bb92d272128f97a1dd26e79edc33d9b2679df27364dbf7479baad"
  },
  {
    "evidenceId": "SEV-RIGHTS-INSTALLED-EVAL",
    "kind": "repository_file",
    "ref": "docs/build/arcabouco/etapa-07-installed-eval.json",
    "freshness": "immutable",
    "validThrough": null,
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null,
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
    "contentFingerprint": "sha256:3d50d9ee2e4e4ff201a0330db73bb021669cdeb30a2042308a333d3a95e1fd05"
  },
  {
    "evidenceId": "SEV-OBS-SCHEMA",
    "kind": "repository_file",
    "ref": "supabase/migrations/20260917134931_observations_metric_definitions.sql",
    "freshness": "immutable",
    "validThrough": null,
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null,
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
    "contentFingerprint": "sha256:cff918a835fac622ee8dfd42e42a172ff5e81d2e8e673230d1a383d1f586b267"
  },
  {
    "evidenceId": "SEV-OBS-AUTHORITY",
    "kind": "repository_file",
    "ref": "supabase/migrations/20260917134939_observation_commands_work_authority.sql",
    "freshness": "immutable",
    "validThrough": null,
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null,
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
    "contentFingerprint": "sha256:6e7f7f2b84f941b4a5e70ebfab70be58308419d4856780779c00a0754138a868"
  },
  {
    "evidenceId": "SEV-OBS-VALUES",
    "kind": "repository_file",
    "ref": "supabase/migrations/20260917134946_observation_value_shape_validation.sql",
    "freshness": "immutable",
    "validThrough": null,
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null,
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
    "contentFingerprint": "sha256:c4d7e0d65d577a152d6cb37d0d054b9bf614349fc5afb9622809f3211d99e894"
  },
  {
    "evidenceId": "SEV-OBS-DIMENSIONS",
    "kind": "repository_file",
    "ref": "supabase/migrations/20260917135001_observation_dimension_shape_validation.sql",
    "freshness": "immutable",
    "validThrough": null,
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null,
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
    "contentFingerprint": "sha256:e6eb980367d2f764b1b3bff14dbf450259a176f1f17799e55acee867161c5e1c"
  },
  {
    "evidenceId": "SEV-OBS-DOSSIER",
    "kind": "repository_file",
    "ref": "supabase/migrations/20260917134924_opportunity_observation_dossier_scope.sql",
    "freshness": "immutable",
    "validThrough": null,
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null,
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
    "contentFingerprint": "sha256:680363a3730f5ac81c2636d152111afc275ca9fcf77d62d7c1374536e7fdef2a"
  },
  {
    "evidenceId": "SEV-OBS-REVISION",
    "kind": "repository_file",
    "ref": "supabase/migrations/20260917134953_legacy_observation_field_revision.sql",
    "freshness": "immutable",
    "validThrough": null,
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null,
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
    "contentFingerprint": "sha256:2da688c447abe4778fa7ba77d5767841f79de2e82b0a0f1503066ec6b9ff96c8"
  },
  {
    "evidenceId": "SEV-OBS-CONTRACT",
    "kind": "automated_test",
    "ref": "supabase/tests/observation_definition_contract.sql",
    "freshness": "immutable",
    "validThrough": null,
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null,
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
    "contentFingerprint": "sha256:c5749d6efb4f58271d16143c4ed5ed9beb2b0f3acd78cdddecf1a3cdf59aba53"
  },
  {
    "evidenceId": "SEV-OBS-HISTORY",
    "kind": "automated_test",
    "ref": "supabase/tests/observation_legacy_history.sql",
    "freshness": "immutable",
    "validThrough": null,
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null,
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
    "contentFingerprint": "sha256:1f9bbd5b875148532f2b56c08867d605fa2d843bfb2cb7c7dd8fd3c6338c4727"
  },
  {
    "evidenceId": "SEV-OBS-PINNED",
    "kind": "automated_test",
    "ref": "supabase/tests/observation_pinned_rights.sql",
    "freshness": "immutable",
    "validThrough": null,
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null,
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
    "contentFingerprint": "sha256:3c5a1881764a3d6e49c418d398b1d90ff5098573da8f686f600461d94bf080fc"
  },
  {
    "evidenceId": "SEV-OBS-READING",
    "kind": "repository_file",
    "ref": "packages/reconciliation/src/facts.ts",
    "freshness": "immutable",
    "validThrough": null,
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null,
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
    "contentFingerprint": "sha256:0231c716051a2583bcfedf46e32c587cb0605b98626054a8692cad553ff1a3e9"
  },
  {
    "evidenceId": "SEV-OBS-READING-EVAL",
    "kind": "automated_test",
    "ref": "packages/reconciliation/src/scope.test.ts",
    "freshness": "immutable",
    "validThrough": null,
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null,
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
    "contentFingerprint": "sha256:e41e92b21e1872202f1d31888a744eb8c79700414dc9078e27ef84b90eb32927"
  },
  {
    "evidenceId": "SEV-OBS-DECIMAL",
    "kind": "automated_test",
    "ref": "apps/web/src/lib/intake/format.test.ts",
    "freshness": "immutable",
    "validThrough": null,
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null,
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
    "contentFingerprint": "sha256:4c6675c05a349f9b8e570ed91edf7b83c7094f5e77ca4d366a4759fbe53b8537"
  },
  {
    "evidenceId": "SEV-OBS-INSTALLATION",
    "kind": "repository_file",
    "ref": "docs/build/arcabouco/etapa-08-installation.json",
    "freshness": "immutable",
    "validThrough": null,
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null,
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
    "contentFingerprint": "sha256:84fb6d52ab50bc63137aebf5690c0706c1a73d30dd2d4260bd991554ad9be63a"
  },
  {
    "evidenceId": "SEV-OBS-INSTALLED-EVAL",
    "kind": "repository_file",
    "ref": "docs/build/arcabouco/etapa-08-installed-eval.json",
    "freshness": "immutable",
    "validThrough": null,
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null,
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
    "contentFingerprint": "sha256:8e9d62d190fa51ce5f9abab37a3a9db2575af4b47f4e218f02cdefcec9528c32"
  },
  {
    "evidenceId": "SEV-ADOPT-SCHEMA",
    "kind": "repository_file",
    "ref": "supabase/migrations/20260917160856_contextual_adoptions_and_assumptions.sql",
    "freshness": "immutable",
    "validThrough": null,
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null,
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
    "contentFingerprint": "sha256:93af28a6bbea2a574499901898bd34eb2735d911bb1c57dd52c09b869cec9261"
  },
  {
    "evidenceId": "SEV-ADOPT-BINDING",
    "kind": "repository_file",
    "ref": "supabase/migrations/20260917160902_contextual_adoption_execution_bindings.sql",
    "freshness": "immutable",
    "validThrough": null,
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null,
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
    "contentFingerprint": "sha256:ea7b0c8d1da94be2d1c3cf146271066912f8569eb6c2e51677e72c69251f9c90"
  },
  {
    "evidenceId": "SEV-ADOPT-RIGHTS",
    "kind": "repository_file",
    "ref": "supabase/migrations/20260917160915_contextual_adoption_dependency_revalidation.sql",
    "freshness": "immutable",
    "validThrough": null,
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null,
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
    "contentFingerprint": "sha256:b1387e2489bd546911de581703460bc92560fa53c0e3a2cf77a1895b19e9f18b"
  },
  {
    "evidenceId": "SEV-ADOPT-IDENTITY",
    "kind": "repository_file",
    "ref": "supabase/migrations/20260917160926_contextual_adoption_identity_command.sql",
    "freshness": "immutable",
    "validThrough": null,
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null,
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
    "contentFingerprint": "sha256:0501ee8e73d8c9d2c39b176628953c85b37c8088280f0edf230bf8269f58e920"
  },
  {
    "evidenceId": "SEV-ADOPT-CONTRACT",
    "kind": "repository_file",
    "ref": "packages/domain-contracts/src/contextual-adoption.ts",
    "freshness": "immutable",
    "validThrough": null,
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null,
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
    "contentFingerprint": "sha256:bbe50f847a84fdfce427e507836798df1ee0f8ccc7ec761d2d580ef3c58096b2"
  },
  {
    "evidenceId": "SEV-ADOPT-SQL",
    "kind": "automated_test",
    "ref": "supabase/tests/contextual_adoption.sql",
    "freshness": "immutable",
    "validThrough": null,
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null,
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
    "contentFingerprint": "sha256:64ba6264a517c5aea013a923f5254d3fcb1af03ddddbdc16fc930e7d617f833f"
  },
  {
    "evidenceId": "SEV-ADOPT-DEPENDENCIES",
    "kind": "automated_test",
    "ref": "supabase/tests/contextual_adoption_dependencies.sql",
    "freshness": "immutable",
    "validThrough": null,
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null,
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
    "contentFingerprint": "sha256:5522ccc67644eb9e6f391b781458eab6514e5e187ffbceb9331aafd1e002c077"
  },
  {
    "evidenceId": "SEV-ADOPT-EXECUTION",
    "kind": "automated_test",
    "ref": "supabase/tests/contextual_adoption_execution.sql",
    "freshness": "immutable",
    "validThrough": null,
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null,
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
    "contentFingerprint": "sha256:e93a447004c1e46daa128e925840e9d16bb55cc7761c636771c624b1730af42f"
  },
  {
    "evidenceId": "SEV-ADOPT-CONCURRENCY",
    "kind": "automated_test",
    "ref": "scripts/ci/test-adoption-concurrency.py",
    "freshness": "immutable",
    "validThrough": null,
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null,
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
    "contentFingerprint": "sha256:707f295ebd08b484efcc79ed99a0659be7f9a403fbb6a4ffa547f57bd25c5827"
  },
  {
    "evidenceId": "SEV-ADOPT-DIFF",
    "kind": "automated_test",
    "ref": "packages/case-understanding/src/adoption-difference.test.ts",
    "freshness": "immutable",
    "validThrough": null,
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null,
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
    "contentFingerprint": "sha256:6bd7c182c87aa7c2dad9b7810462403d32b8538c3ad9420e8f3d007166b0c426"
  },
  {
    "evidenceId": "SEV-ADOPT-MATH",
    "kind": "automated_test",
    "ref": "packages/financial-model/src/adopted-basis.test.ts",
    "freshness": "immutable",
    "validThrough": null,
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null,
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
    "contentFingerprint": "sha256:e4ec43849cafe0df3bf4e506e4dee85bf2cd98f4a8eeb9fb4e8a4a10036525d8"
  },
  {
    "evidenceId": "SEV-ADOPT-SELECTION",
    "kind": "automated_test",
    "ref": "packages/financial-model/src/institutional-input.test.ts",
    "freshness": "immutable",
    "validThrough": null,
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null,
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
    "contentFingerprint": "sha256:20d7c807ec70dc5351cf6bcaafd6d6af39b3aca5b22b825418db776070c5caaa"
  },
  {
    "evidenceId": "SEV-ADOPT-E2E",
    "kind": "automated_test",
    "ref": "apps/web/e2e/contextual-adoption.spec.ts",
    "freshness": "immutable",
    "validThrough": null,
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null,
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
    "contentFingerprint": "sha256:75d8fbe3e7f67c05b21de60d78eb9f3dd83cef229b2dd1b0ad14a268337984f8"
  },
  {
    "evidenceId": "SEV-ADOPT-INSTALLATION",
    "kind": "repository_file",
    "ref": "docs/build/arcabouco/etapa-09-installation.json",
    "freshness": "immutable",
    "validThrough": null,
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null,
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
    "contentFingerprint": "sha256:5672314fd4ae66b6d5e96e409ffd5cbcf5c69f7f716e2f7ac92e8dbb853b581f"
  },
  {
    "evidenceId": "SEV-ADOPT-INSTALLED-EVAL",
    "kind": "repository_file",
    "ref": "docs/build/arcabouco/etapa-09-installed-eval.json",
    "freshness": "immutable",
    "validThrough": null,
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null,
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
    "contentFingerprint": "sha256:373f37771955a5d7b2862afe7656cc0a508b26e76ec970be72d51462d1870c5c"
  },
  {
    "evidenceId": "SEV-WORK-STORAGE",
    "kind": "repository_file",
    "ref": "supabase/migrations/20260917191714_persistent_work_without_intake.sql",
    "freshness": "immutable",
    "validThrough": null,
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null,
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
    "contentFingerprint": "sha256:c18be7b94cc817d767668ab64629a3fe449b25849a30a1ebb49c761e31e9350c"
  },
  {
    "evidenceId": "SEV-WORK-COMMANDS",
    "kind": "repository_file",
    "ref": "supabase/migrations/20260917195617_persistent_work_commands.sql",
    "freshness": "immutable",
    "validThrough": null,
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null,
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
    "contentFingerprint": "sha256:e183a780009f50c99d875639da8b7828f483c92f7348df1ef6d0fa55e109dfa6"
  },
  {
    "evidenceId": "SEV-WORK-LEGACY",
    "kind": "repository_file",
    "ref": "supabase/migrations/20260917204933_persistent_work_legacy_adapters.sql",
    "freshness": "immutable",
    "validThrough": null,
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null,
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
    "contentFingerprint": "sha256:ab1eb1c4cac2670acce1adba7b96d25458e27ee2a33804baff1560d8e5a93dc1"
  },
  {
    "evidenceId": "SEV-WORK-SPECIALIZED",
    "kind": "repository_file",
    "ref": "supabase/migrations/20260917204936_persistent_work_specialized_adapters.sql",
    "freshness": "immutable",
    "validThrough": null,
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null,
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
    "contentFingerprint": "sha256:7d13e7140b5f679f5415e168bf5c5e1aa2b96ac19ad3fa0dc15ccd66ad5e981a"
  },
  {
    "evidenceId": "SEV-WORK-REPLAY",
    "kind": "repository_file",
    "ref": "supabase/migrations/20260917204939_persistent_work_specialized_replay_scope.sql",
    "freshness": "immutable",
    "validThrough": null,
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null,
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
    "contentFingerprint": "sha256:36877258623a9737186fc3fa9969fe21257cc1761e2d2350278a49a60ba5fac1"
  },
  {
    "evidenceId": "SEV-WORK-STORAGE-SQL",
    "kind": "automated_test",
    "ref": "supabase/tests/persistent_work_storage.sql",
    "freshness": "immutable",
    "validThrough": null,
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null,
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
    "contentFingerprint": "sha256:203e5b156a1fc70761b58310ab9dea7451b0b606761697445581d0ed97674852"
  },
  {
    "evidenceId": "SEV-WORK-ENTRY-SQL",
    "kind": "automated_test",
    "ref": "supabase/tests/persistent_work_without_intake.sql",
    "freshness": "immutable",
    "validThrough": null,
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null,
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
    "contentFingerprint": "sha256:3217617abd8a5639f017595ae21abbe5193f73e20a01d349b13ff4aa40f625a4"
  },
  {
    "evidenceId": "SEV-WORK-LEGACY-SQL",
    "kind": "automated_test",
    "ref": "supabase/tests/persistent_work_legacy_adapters.sql",
    "freshness": "immutable",
    "validThrough": null,
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null,
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
    "contentFingerprint": "sha256:6bc7c7f716324dbec7622d624fa3d011bc271cc6a6849f66a3d7098d130a9590"
  },
  {
    "evidenceId": "SEV-WORK-RUNTIME",
    "kind": "repository_file",
    "ref": "apps/document-worker/src/work-conversation.ts",
    "freshness": "immutable",
    "validThrough": null,
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null,
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
    "contentFingerprint": "sha256:c311155753cbab647c01fb7ded53e4bc5e2eed1b1fe010eb8a7586d6253536bd"
  },
  {
    "evidenceId": "SEV-WORK-RUNTIME-TEST",
    "kind": "automated_test",
    "ref": "apps/document-worker/src/work-conversation.test.ts",
    "freshness": "immutable",
    "validThrough": null,
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null,
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
    "contentFingerprint": "sha256:3e115d7efb401ae43a41a87354580f6fd7d5ce3aa0c14332aa5c0eb9a6b2f9e5"
  },
  {
    "evidenceId": "SEV-WORK-COMPILE",
    "kind": "automated_test",
    "ref": "packages/work-plan/src/advisor-starting-plan.test.ts",
    "freshness": "immutable",
    "validThrough": null,
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null,
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
    "contentFingerprint": "sha256:ff21fcca5e93a90b089e833defbf7a7db7066129201358a3269962e061e22cb6"
  },
  {
    "evidenceId": "SEV-WORK-CONTEXT",
    "kind": "repository_file",
    "ref": "apps/web/src/app/[locale]/app/work-context-actions.ts",
    "freshness": "immutable",
    "validThrough": null,
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null,
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
    "contentFingerprint": "sha256:34f6ec9a05b14d88b202f3d07ce7c2f28c35d759c725b83abd978e92cb4c2f96"
  },
  {
    "evidenceId": "SEV-WORK-WEB",
    "kind": "repository_file",
    "ref": "apps/web/src/app/[locale]/app/advisor-actions.ts",
    "freshness": "immutable",
    "validThrough": null,
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null,
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
    "contentFingerprint": "sha256:6307e34a849a8eae8e41beaa4493e1d2edc5d29a646911fe264c036d00e02eaf"
  },
  {
    "evidenceId": "SEV-WORK-E2E",
    "kind": "automated_test",
    "ref": "apps/web/e2e/persistent-work.spec.ts",
    "freshness": "immutable",
    "validThrough": null,
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null,
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
    "contentFingerprint": "sha256:bb8d3f8df3cae7571c1304597d8bf28019901ed906ec0a0a70b8e5638042ff97"
  },
  {
    "evidenceId": "SEV-WORK-AUTH-REPLAY",
    "kind": "automated_test",
    "ref": "supabase/tests/workspace_replay_authority.sql",
    "freshness": "immutable",
    "validThrough": null,
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null,
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
    "contentFingerprint": "sha256:36e9cf9a50b15f960f36ab3fe4666d1d0acaa6b3de7ef8e5b44869c27320e8a3"
  },
  {
    "evidenceId": "SEV-CONTRIBUTION-AUDIT",
    "kind": "repository_file",
    "ref": "supabase/migrations/20260918010613_work_contribution_dependency_audit.sql",
    "freshness": "immutable",
    "validThrough": null,
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null,
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
    "contentFingerprint": "sha256:184897deb1e9b8423d5d59c72ad23d381dec54cdbd34914eab0f9d44295b3c73"
  },
  {
    "evidenceId": "SEV-CONTRIBUTION-SCHEMA",
    "kind": "repository_file",
    "ref": "supabase/migrations/20260918002400_work_contributions_and_channels.sql",
    "freshness": "immutable",
    "validThrough": null,
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null,
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
    "contentFingerprint": "sha256:20f92edcac0ec3a2d0fe135909a4d0751ae5f82e6b4fd74a2eba2af6e954944b"
  },
  {
    "evidenceId": "SEV-CONTRIBUTION-INTEGRITY",
    "kind": "repository_file",
    "ref": "supabase/migrations/20260918002404_work_contribution_command_integrity.sql",
    "freshness": "immutable",
    "validThrough": null,
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null,
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
    "contentFingerprint": "sha256:833901953fb71034e4bea48d6657fb0e192b0d35cc4fea387022f661864b88eb"
  },
  {
    "evidenceId": "SEV-CONTRIBUTION-ISOLATION",
    "kind": "automated_test",
    "ref": "supabase/tests/work_contribution_isolation.sql",
    "freshness": "immutable",
    "validThrough": null,
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null,
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
    "contentFingerprint": "sha256:00cff068b2aed7c7d3d0753465033a930ffb73bf4cde41db9e563df9b06c93b4"
  },
  {
    "evidenceId": "SEV-CONTRIBUTION-RIGHTS",
    "kind": "automated_test",
    "ref": "supabase/tests/work_contribution_rights.sql",
    "freshness": "immutable",
    "validThrough": null,
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null,
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
    "contentFingerprint": "sha256:6de87bee6e276780315ee1fdfcd069d4d01972689fca3939a18af649cdf6453e"
  },
  {
    "evidenceId": "SEV-CONTRIBUTION-CONCURRENCY",
    "kind": "automated_test",
    "ref": "scripts/ci/test-contribution-concurrency.py",
    "freshness": "immutable",
    "validThrough": null,
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null,
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
    "contentFingerprint": "sha256:eb4d8df23ca1a768bff46506023ef12f51ebeeef26e2de760c8e6f6666fb3ca5"
  },
  {
    "evidenceId": "SEV-CONTRIBUTION-E2E",
    "kind": "automated_test",
    "ref": "apps/web/e2e/work-contributions.spec.ts",
    "freshness": "immutable",
    "validThrough": null,
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null,
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
    "contentFingerprint": "sha256:88f7c1a78bffb245fce98afe7af58d24c28e40a4d1765c6883948443429f69cb"
  },
  {
    "evidenceId": "SEV-CONTRIBUTION-ACTIONS",
    "kind": "repository_file",
    "ref": "apps/web/src/app/[locale]/app/work-contribution-actions.ts",
    "freshness": "immutable",
    "validThrough": null,
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null,
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
    "contentFingerprint": "sha256:1b81036b2a0291c15a8003c364efc6bbc4fc377a8ecfc07299bbbb8ab8c22d01"
  },
  {
    "evidenceId": "SEV-CONTRIBUTION-PROTOCOL",
    "kind": "automated_test",
    "ref": "apps/web/src/lib/advisor/work-contributions.test.ts",
    "freshness": "immutable",
    "validThrough": null,
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null,
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
    "contentFingerprint": "sha256:0fa31344aeac83def127aeca9cf28a62a7e0cdd151e5080aa170e129a4c8ceac"
  },
  {
    "evidenceId": "SEV-VAULT-WORKER-AUTHORITY",
    "kind": "automated_test",
    "ref": "apps/document-worker/src/case-analysis.test.ts",
    "freshness": "immutable",
    "validThrough": null,
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null,
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
    "contentFingerprint": "sha256:3a1501456fb81c0027ac646fe2cc51aef7379bcd7d1762fcca365ec9a38611d6"
  },
  {
    "evidenceId": "SEV-VAULT-LEGACY-GRANTS",
    "kind": "repository_file",
    "ref": "supabase/migrations/20260918111441_vault_legacy_worker_grants.sql",
    "freshness": "immutable",
    "validThrough": null,
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null,
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
    "contentFingerprint": "sha256:de3993e4792905f0c9b0b2935c4b371a8373fd9f58f3b9f87648490602de3f72"
  },
  {
    "evidenceId": "SEV-VAULT-LEGACY-NEGATIVE",
    "kind": "automated_test",
    "ref": "supabase/tests/vault_legacy_publication_evidence.sql",
    "freshness": "immutable",
    "validThrough": null,
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null,
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
    "contentFingerprint": "sha256:c8a729db9d038814b5dc9c66608d60f8d38298569e7e8f274171ca338a73857b"
  },
  {
    "evidenceId": "SEV-VAULT-SCHEMA",
    "kind": "repository_file",
    "ref": "supabase/migrations/20260918105943_human_vault_publication.sql",
    "freshness": "immutable",
    "validThrough": null,
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null,
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
    "contentFingerprint": "sha256:d739a0d9eb144d5946f9af51b3a73f24a1f8e9508550e85d5c2a3503af2016b1"
  },
  {
    "evidenceId": "SEV-VAULT-EXPORT",
    "kind": "automated_test",
    "ref": "supabase/tests/vault_export_authority.sql",
    "freshness": "immutable",
    "validThrough": null,
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null,
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
    "contentFingerprint": "sha256:f428c6cc280d37e58567de643eb794aeb828a37ceb648ebdb20d1a738016dab1"
  },
  {
    "evidenceId": "SEV-VAULT-LEGACY",
    "kind": "repository_file",
    "ref": "supabase/migrations/20260918105952_vault_legacy_publication_evidence.sql",
    "freshness": "immutable",
    "validThrough": null,
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null,
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
    "contentFingerprint": "sha256:f7605da2d24f2ed0588364f7037ebf6a6838e924bdb7f3337ddf72b2be5514a3"
  },
  {
    "evidenceId": "SEV-VAULT-RECEIPTS",
    "kind": "repository_file",
    "ref": "supabase/migrations/20260918105956_vault_publication_receipts.sql",
    "freshness": "immutable",
    "validThrough": null,
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null,
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
    "contentFingerprint": "sha256:6040a0527bdc0ad0f42ae91de719569609523c9b846d0628dcc072739e4ef6f0"
  },
  {
    "evidenceId": "SEV-VAULT-HUMAN",
    "kind": "automated_test",
    "ref": "supabase/tests/human_vault_publication.sql",
    "freshness": "immutable",
    "validThrough": null,
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null,
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
    "contentFingerprint": "sha256:b25b8b4e334c0cbcd322777f0b14b00d91d7b5dc4dc789a9b11af2a5e7995491"
  },
  {
    "evidenceId": "SEV-VAULT-ISOLATION",
    "kind": "automated_test",
    "ref": "supabase/tests/vault_scope_isolation.sql",
    "freshness": "immutable",
    "validThrough": null,
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null,
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
    "contentFingerprint": "sha256:fd7887f4f768eff8c3073514f997c7d60d88718239fa39830c287b041372727b"
  },
  {
    "evidenceId": "SEV-VAULT-DERIVED",
    "kind": "automated_test",
    "ref": "supabase/tests/vault_derived_rights.sql",
    "freshness": "immutable",
    "validThrough": null,
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null,
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
    "contentFingerprint": "sha256:d10041692553ae2b7dab82e63d1eb6d914db51bdf6f85a76d3688a893e8e5910"
  },
  {
    "evidenceId": "SEV-VAULT-CONCURRENCY",
    "kind": "automated_test",
    "ref": "scripts/ci/test-vault-publication-concurrency.py",
    "freshness": "immutable",
    "validThrough": null,
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null,
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
    "contentFingerprint": "sha256:dd2e462c13e0e9ad7c894822cd43f435e43f6ebdbe5c5575dfa978708671dd62"
  },
  {
    "evidenceId": "SEV-VAULT-E2E",
    "kind": "automated_test",
    "ref": "apps/web/e2e/vault-publication.spec.ts",
    "freshness": "immutable",
    "validThrough": null,
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null,
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
    "contentFingerprint": "sha256:ea5a7cf7085a0af85470c8b240016352766323afa220881b82652411f8579995"
  },
  {
    "evidenceId": "SEV-VAULT-ACTIONS",
    "kind": "repository_file",
    "ref": "apps/web/src/app/[locale]/app/vault/actions.ts",
    "freshness": "immutable",
    "validThrough": null,
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null,
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
    "contentFingerprint": "sha256:995f4f0a3cc3a24ed5a340d818d51ccdc14b35f3be338f4e33f3a6932353178d"
  },
  {
    "evidenceId": "SEV-VAULT-PROTOCOL",
    "kind": "automated_test",
    "ref": "apps/web/src/lib/advisor/vault.test.ts",
    "freshness": "immutable",
    "validThrough": null,
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null,
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
    "contentFingerprint": "sha256:be4e96bd23e54de66bb71ebf1c071369844bac6735f182a13a399cffc3f697c2"
  },
  {
    "evidenceId": "SEV-PROCEDURE-COMPONENTS",
    "kind": "repository_file",
    "ref": "packages/credit-playbook/src/method-component.ts",
    "freshness": "immutable",
    "validThrough": null,
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null,
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
    "contentFingerprint": "sha256:50a0dc0769ce9bd9d6f909f2a7242d69ed63bcd00e62850772b007ee37dd74e0"
  },
  {
    "evidenceId": "SEV-PROCEDURE-COMPILER",
    "kind": "repository_file",
    "ref": "packages/credit-playbook/src/procedure-compiler.ts",
    "freshness": "immutable",
    "validThrough": null,
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null,
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
    "contentFingerprint": "sha256:f33177013196299df7c1345ed030b4af548fc815978b0c8ca639936620d8e93a"
  },
  {
    "evidenceId": "SEV-PROCEDURE-NEGATIVES",
    "kind": "automated_test",
    "ref": "packages/credit-playbook/src/procedure-compiler.test.ts",
    "freshness": "immutable",
    "validThrough": null,
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null,
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
    "contentFingerprint": "sha256:b3a91ebf67deb43717832441c6dcc75172752bab00adc86b29eaa48a70cb5db4"
  },
  {
    "evidenceId": "SEV-PROCEDURE-BUILD",
    "kind": "repository_file",
    "ref": "packages/credit-playbook/src/build-method-manifest.ts",
    "freshness": "immutable",
    "validThrough": null,
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null,
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
    "contentFingerprint": "sha256:38dacf680a45fc8e55dc2a862fa8cf950e6b34d626b485a85bc088b997decaec"
  },
  {
    "evidenceId": "SEV-PROCEDURE-PROJECTION",
    "kind": "repository_file",
    "ref": "packages/credit-playbook/src/method-runtime-manifest.generated.ts",
    "freshness": "immutable",
    "validThrough": null,
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null,
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
    "contentFingerprint": "sha256:92a8dfcc0cbfb03146c4ff01663fd22ada0e1ccc073f2ee391954ddfd6346e2e"
  },
  {
    "evidenceId": "SEV-PROCEDURE-PROJECTION-TEST",
    "kind": "automated_test",
    "ref": "packages/credit-playbook/src/method-runtime-manifest.test.ts",
    "freshness": "immutable",
    "validThrough": null,
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null,
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
    "contentFingerprint": "sha256:b60192d67138336b8065036a997e8856b0f93039436aacf6a3412663cc2a1be7"
  },
  {
    "evidenceId": "SEV-PROCEDURE-WORKER",
    "kind": "repository_file",
    "ref": "apps/document-worker/src/specialist-method-runtime.ts",
    "freshness": "immutable",
    "validThrough": null,
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null,
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
    "contentFingerprint": "sha256:f78d1cdd9cda9554b6218fae28cfb28ff8722bd26c3226c7df6ae5c76a562eff"
  },
  {
    "evidenceId": "SEV-PROCEDURE-WORKER-TEST",
    "kind": "automated_test",
    "ref": "apps/document-worker/src/specialist-method-runtime.test.ts",
    "freshness": "immutable",
    "validThrough": null,
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null,
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
    "contentFingerprint": "sha256:9d289205308eabfda853d36d094ee9f1cf7aa3b47b086db61e1cafdb52c78efa"
  },
  {
    "evidenceId": "SEV-PROCEDURE-AUTHORING",
    "kind": "repository_file",
    "ref": "packages/credit-playbook/knowledge/AUTHORING.md",
    "freshness": "immutable",
    "validThrough": null,
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null,
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
    "contentFingerprint": "sha256:e46ceb1fe888bd61b3b49e9e8d17f2c0ac8fc2d7f5ec2aac1b47eb1e66108638"
  },
  {
    "evidenceId": "SEV-PROCEDURE-CANDIDATE",
    "kind": "automated_test",
    "ref": "packages/credit-playbook/src/capital-structure-authoring.test.ts",
    "freshness": "immutable",
    "validThrough": null,
    "authorityRef": "AUTH-TRUSTED-GIT-BASELINE",
    "collector": null,
    "waveId": null,
    "capturedAt": "2026-09-19T12:15:21.922Z",
    "immutableFingerprint": "80ff92054531884d85096d0ee8debd5d867aed79",
    "contentFingerprint": "sha256:1bc0973ac1e33873ba06da195e0f38ffbf9a4306c4fecce21e2944fc8aa0ae7a"
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
      "SEV-VAULT-LEGACY-GRANTS",
      "SEV-VAULT-SCHEMA",
      "SEV-VAULT-LEGACY",
      "SEV-VAULT-RECEIPTS",
      "SEV-CONTRIBUTION-AUDIT",
      "SEV-CONTRIBUTION-SCHEMA",
      "SEV-CONTRIBUTION-INTEGRITY",
      "SEV-WORK-STORAGE",
      "SEV-WORK-COMMANDS",
      "SEV-WORK-LEGACY",
      "SEV-WORK-SPECIALIZED",
      "SEV-WORK-REPLAY",
      "SEV-ADOPT-SCHEMA",
      "SEV-ADOPT-BINDING",
      "SEV-ADOPT-RIGHTS",
      "SEV-ADOPT-SQL",
      "SEV-ADOPT-EXECUTION",
      "SEV-ADOPT-INSTALLATION",
      "SEV-ADOPT-INSTALLED-EVAL",
      "SEV-OBS-SCHEMA",
      "SEV-OBS-AUTHORITY",
      "SEV-OBS-VALUES",
      "SEV-OBS-DIMENSIONS",
      "SEV-OBS-DOSSIER",
      "SEV-OBS-CONTRACT",
      "SEV-OBS-HISTORY",
      "SEV-OBS-INSTALLATION",
      "SEV-OBS-INSTALLED-EVAL",
      "SEV-RIGHTS-SCHEMA",
      "SEV-RIGHTS-RETRIEVAL",
      "SEV-RIGHTS-DEADLINE",
      "SEV-RIGHTS-DELIVERY",
      "SEV-RIGHTS-SCOPE",
      "SEV-RIGHTS-PERFORMANCE",
      "SEV-RIGHTS-INSTALLATION",
      "SEV-RIGHTS-INSTALLED-EVAL",
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
      "SEV-PROCEDURE-PROJECTION",
      "SEV-PROCEDURE-WORKER",
      "SEV-PROCEDURE-WORKER-TEST",
      "SEV-VAULT-WORKER-AUTHORITY",
      "SEV-WORK-RUNTIME",
      "SEV-WORK-RUNTIME-TEST",
      "SEV-ADOPT-CONTRACT",
      "SEV-ADOPT-SELECTION",
      "SEV-OBS-READING",
      "SEV-OBS-READING-EVAL",
      "SEV-OBS-REVISION",
      "SEV-RIGHTS-JOB",
      "SEV-RIGHTS-ADAPTER",
      "SEV-RIGHTS-ADAPTER-EVAL",
      "SEV-RIGHTS-DELIVERY",
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
      "SEV-PROCEDURE-COMPONENTS",
      "SEV-PROCEDURE-COMPILER",
      "SEV-PROCEDURE-NEGATIVES",
      "SEV-PROCEDURE-BUILD",
      "SEV-PROCEDURE-PROJECTION-TEST",
      "SEV-PROCEDURE-AUTHORING",
      "SEV-PROCEDURE-CANDIDATE",
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
      "SEV-VAULT-LEGACY-NEGATIVE",
      "SEV-VAULT-EXPORT",
      "SEV-VAULT-HUMAN",
      "SEV-VAULT-ISOLATION",
      "SEV-VAULT-DERIVED",
      "SEV-VAULT-CONCURRENCY",
      "SEV-CONTRIBUTION-ISOLATION",
      "SEV-CONTRIBUTION-RIGHTS",
      "SEV-CONTRIBUTION-CONCURRENCY",
      "SEV-WORK-STORAGE-SQL",
      "SEV-WORK-ENTRY-SQL",
      "SEV-WORK-LEGACY-SQL",
      "SEV-ADOPT-SCHEMA",
      "SEV-ADOPT-DEPENDENCIES",
      "SEV-ADOPT-CONCURRENCY",
      "SEV-OBS-SCHEMA",
      "SEV-OBS-HISTORY",
      "SEV-OBS-PINNED",
      "SEV-RIGHTS-SCHEMA",
      "SEV-RIGHTS-RETRIEVAL",
      "SEV-RIGHTS-PUBLIC-CACHE",
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
      "SEV-RIGHTS-RETRIEVAL",
      "SEV-RIGHTS-JOB",
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
      "SEV-VAULT-E2E",
      "SEV-VAULT-ACTIONS",
      "SEV-VAULT-PROTOCOL",
      "SEV-CONTRIBUTION-ACTIONS",
      "SEV-CONTRIBUTION-E2E",
      "SEV-CONTRIBUTION-PROTOCOL",
      "SEV-WORK-CONTEXT",
      "SEV-WORK-WEB",
      "SEV-WORK-E2E",
      "SEV-WORK-AUTH-REPLAY",
      "SEV-ADOPT-IDENTITY",
      "SEV-ADOPT-E2E",
      "SEV-ADOPT-DIFF",
      "SEV-ADOPT-MATH",
      "SEV-OBS-AUTHORITY",
      "SEV-OBS-CONTRACT",
      "SEV-OBS-DECIMAL",
      "SEV-RIGHTS-SCOPE",
      "SEV-RIGHTS-RETRIEVAL",
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
      "SEV-WORK-COMPILE",
      "SEV-WORK-RUNTIME",
      "SEV-ADOPT-CONTRACT",
      "SEV-ADOPT-SELECTION",
      "SEV-OBS-READING",
      "SEV-OBS-READING-EVAL",
      "SEV-OBS-REVISION",
      "SEV-RIGHTS-ADAPTER",
      "SEV-RIGHTS-JOB",
      "SEV-RIGHTS-PUBLIC-CACHE",
      "SEV-RIGHTS-REGISTRY",
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
      "SEV-WORK-STORAGE",
      "SEV-WORK-RUNTIME-TEST",
      "SEV-ADOPT-BINDING",
      "SEV-ADOPT-CONTRACT",
      "SEV-OBS-AUTHORITY",
      "SEV-OBS-CONTRACT",
      "SEV-RIGHTS-JOB",
      "SEV-RIGHTS-DELIVERY",
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
