import {z} from "zod";
import {isDeepStrictEqual} from "node:util";
import {
  artifactBlockDraftSchema, artifactRevisionSchema, artifactSchema, freezeArtifactValue,
} from "@offroad/domain-contracts";
import {parseVerifiedInstitutionalWorkbookArtifact} from "@offroad/financial-model";

/** Content conversion only. The transactional producer must separately prove source closure. */
export const institutionalContentAdapterVersion = "institutional-artifact-content.2026.09.28-v1";

const hash = z.string().regex(/^[a-f0-9]{64}$/);
const inputSchema = z.strictObject({
  organizationId: z.uuid(), workId: z.uuid(), resultId: z.uuid(),
  configurationId: z.uuid(), configurationFingerprint: hash, sourceManifestFingerprint: hash,
  expectedArtifactFingerprint: hash,
  locale: z.enum(["pt", "en"]),
  artifact: z.unknown(),
  ancestor: z.strictObject({artifact: artifactSchema, revision: artifactRevisionSchema}),
});

/**
 * Split a verified persisted workbook into lossless native block drafts. No renderer, calculator,
 * database, source lookup or current head participates. The result is deliberately not a writable
 * revision/manifest: declared references are not a receipt of all context the producer consumed.
 * Historical review metadata is content, never a new approval or a self-approval declaration.
 */
export function prepareInstitutionalArtifactContent(value: unknown) {
  const input = inputSchema.parse(value);
  const workbook = parseVerifiedInstitutionalWorkbookArtifact(input.artifact);
  if (!workbook || !isDeepStrictEqual(workbook, input.artifact) || workbook.fingerprint !== input.expectedArtifactFingerprint) {
    throw new Error("institutional_content_artifact_invalid");
  }
  const {artifact: ancestorArtifact, revision: ancestorRevision} = input.ancestor;
  const legacy = ancestorRevision.legacyRef;
  const manifest = ancestorRevision.manifest;
  if (ancestorArtifact.organizationId !== input.organizationId || ancestorArtifact.workId !== input.workId
    || ancestorArtifact.kind !== "model_result" || ancestorRevision.artifactId !== ancestorArtifact.id
    || ancestorArtifact.legacyOrigin?.table !== "institutional_model_results"
    || ancestorArtifact.legacyOrigin.id !== input.resultId
    || legacy?.table !== "institutional_model_results" || legacy.id !== input.resultId
    || legacy.fingerprint !== workbook.fingerprint || manifest.kind !== "model_result"
    || manifest.institutionalResult?.id !== input.resultId
    || manifest.institutionalResult.configurationFingerprint !== input.configurationFingerprint) {
    throw new Error("institutional_content_ancestor_mismatch");
  }
  const scenarios = workbook.institutional.scenarios;
  const active = scenarios.find((scenario) => scenario.configurationId === workbook.institutional.activeScenarioId);
  if (new Set(scenarios.map((scenario) => scenario.configurationId)).size !== scenarios.length
    || !active || active.configurationId !== input.configurationId
    || active.configurationFingerprint !== input.configurationFingerprint
    || workbook.institutional.sourceManifestFingerprint !== input.sourceManifestFingerprint) {
    throw new Error("institutional_content_result_mismatch");
  }

  const {institutional, ...envelope} = workbook;
  const {scenarios: _scenarios, ...institutionalEnvelope} = institutional;
  // Keep both locale receipts and every non-scenario field, including the original fingerprint.
  // Reassembling envelope + scenario blocks must reproduce the persisted JSON, without rounding.
  const blocks = [
    artifactBlockDraftSchema.parse({blockKey: "workbook", kind: "section",
      content: {workbook: {...envelope, institutional: institutionalEnvelope}}, claims: []}),
    ...scenarios.map((scenario) => artifactBlockDraftSchema.parse({
      blockKey: `scenario:${scenario.configurationId}`, kind: "section", content: {scenario}, claims: [],
    })),
  ];
  // These references describe only what is present in the content. They do not resolve a version,
  // grant, configuration contribution or imported input, and never assert absence of other sources.
  const declaredReferences = scenarios.flatMap((scenario) => [
    ...scenario.sourceBindings.map((source) => ({configurationId: scenario.configurationId, origin: "source_binding" as const,
      sourceDocument: source.sourceDocument, version: source.version, hash: source.hash})),
    ...scenario.lineage.map((line) => ({configurationId: scenario.configurationId, origin: "lineage" as const,
      sourceDocument: line.sourceDocument, version: line.sourceVersion, hash: line.sourceHash})),
  ]);
  return freezeArtifactValue({
    adapterVersion: institutionalContentAdapterVersion,
    origin: {organizationId: input.organizationId, workId: input.workId, resultId: input.resultId,
      artifactFingerprint: workbook.fingerprint, ancestorArtifactId: ancestorArtifact.id,
      ancestorRevisionId: ancestorRevision.id, ancestorManifestFingerprint: ancestorRevision.manifestFingerprint},
    representation: {locale: input.locale, format: "xlsx" as const, ...workbook.workbooks[input.locale]},
    blocks, declaredReferences,
    prerequisites: {sourceClosure: "unproven" as const, revisionReview: "required" as const},
  });
}
