import {
  decisionArtifactContractSchema,
  renderedMaterialManifestSchema,
  verifyRenderedMaterialBytes,
  type RenderedMaterialManifest,
} from "@offroad/case-understanding";

type GovernedDownloadFormat = "xlsx" | "pptx";

const surfaceFor = (format: GovernedDownloadFormat) => format === "xlsx" ? "workbook" : "presentation";

export class GovernedMaterialUnavailableError extends Error {
  constructor(public readonly reason: "missing_manifest" | "wrong_format" | "cross_scope" | "not_stored" | "missing_binding" | "tampered_bytes") {
    super(reason);
  }
}

/**
 * Authorizes one governed material at the application boundary. RLS remains the primary tenant
 * boundary; these checks make a malformed or cross-scoped receipt fail closed as well.
 */
export function resolveGovernedMaterialDownload(input: {
  materialContent: unknown;
  decisionContractContent: unknown;
  format: GovernedDownloadFormat;
  organizationId: string;
  projectId: string;
}): RenderedMaterialManifest {
  const content = isRecord(input.materialContent) ? input.materialContent : null;
  const parsedManifest = renderedMaterialManifestSchema.safeParse(content?.manifest);
  if (!parsedManifest.success) throw new GovernedMaterialUnavailableError("missing_manifest");
  const manifest = parsedManifest.data;
  if (manifest.format !== input.format || manifest.surface !== surfaceFor(input.format)) throw new GovernedMaterialUnavailableError("wrong_format");
  if (manifest.organizationId !== input.organizationId || manifest.projectId !== input.projectId) throw new GovernedMaterialUnavailableError("cross_scope");
  if (manifest.storage.state !== "stored") throw new GovernedMaterialUnavailableError("not_stored");

  const contractContent = isRecord(input.decisionContractContent) ? input.decisionContractContent : null;
  const parsedContract = decisionArtifactContractSchema.safeParse(contractContent?.contract);
  if (!parsedContract.success) throw new GovernedMaterialUnavailableError("missing_binding");
  const view = parsedContract.data.views.find((candidate) => candidate.surface === manifest.surface);
  if (!view || view.artifactId !== manifest.id || view.artifactFingerprint !== manifest.contentSha256) {
    throw new GovernedMaterialUnavailableError("missing_binding");
  }
  return manifest;
}

/**
 * The sha256 of the file the decision contract binds to the surface of a format, or null when the
 * contract is absent, malformed or binds no file to that surface. A run that records a newer
 * contract without rendering files binds none, so the last stored file is no longer the one the
 * contract speaks for.
 */
export function decisionContractBoundSha256(decisionContractContent: unknown, format: GovernedDownloadFormat): string | null {
  const contractContent = isRecord(decisionContractContent) ? decisionContractContent : null;
  const parsedContract = decisionArtifactContractSchema.safeParse(contractContent?.contract);
  if (!parsedContract.success) return null;
  return parsedContract.data.views.find((view) => view.surface === surfaceFor(format))?.artifactFingerprint ?? null;
}

export function verifyGovernedMaterialDownload(manifest: RenderedMaterialManifest, bytes: Uint8Array): void {
  try {
    verifyRenderedMaterialBytes(manifest, bytes);
  } catch {
    throw new GovernedMaterialUnavailableError("tampered_bytes");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
