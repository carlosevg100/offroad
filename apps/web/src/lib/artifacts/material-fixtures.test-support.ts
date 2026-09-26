import {artifactReadFixture, artifactRpc, type ReadFixtureInput} from "./artifact-read.test-support";
import {supabaseDouble, type TableAnswer} from "./supabase-double.test-support";

/**
 * One synthetic governed material package and the artifact revisions that name it, shared by the
 * materials and model route tests. The legacy revision is what the projection of increment 2b
 * writes for a `material_artifact` row: kind `material`, subject `materials:<session>`, audience
 * internal, no bytes.
 */

export const materialSessionId = "10000000-0000-4000-8000-000000000001";
export const materialProjectId = "40000000-0000-4000-8000-000000000001";
export const materialRowId = "50000000-0000-4000-8000-000000000001";
export const materialRevisionId = "60000000-0000-4000-8000-000000000001";
export const materialFingerprint = "a".repeat(64);

export const termSheet = {
  kind: "term_sheet" as const,
  title: {pt: "Termos sintéticos para teste", en: "Synthetic test terms"},
  dependsOn: [],
  blocks: [
    {type: "paragraph" as const, text: {pt: "Material sintético. Consentimento prévio é necessário.", en: "Synthetic material. Prior consent is required."}, supportIds: ["historical_financials.revenue (2025-12-31)", "net_debt_to_ebitda"]},
  ],
};

export const governedPackage = {
  issuedOn: "2026-09-07",
  artifactId: materialRowId,
  artifactFingerprint: materialFingerprint,
  plannedArtifacts: ["indicative_term_sheet" as const],
  materials: [termSheet],
  financialModel: null,
};

export function legacyMaterialRead(overrides: Partial<ReadFixtureInput> = {}) {
  return artifactReadFixture({
    workId: materialProjectId, kind: "material", subject: `materials:${materialSessionId}`, revisionId: materialRevisionId,
    legacy: {table: "deal_state_objects", id: materialRowId, fingerprint: materialFingerprint}, createdAt: "2026-09-07T15:00:00+00:00",
    ...overrides,
  });
}

export function materialSupabase(
  reads: ReadonlyArray<ReturnType<typeof artifactReadFixture>> = [legacyMaterialRead()],
  extra: {tables?: Record<string, TableAnswer>; rpc?: Parameters<typeof artifactRpc>[1]} = {},
) {
  return supabaseDouble({
    tables: {document_intake_sessions: {data: {capital_project_id: materialProjectId}, error: null}, ...extra.tables},
    rpc: artifactRpc(reads, extra.rpc),
  });
}
