/**
 * Which template a governed presentation is rendered with.
 *
 * When the project the job belongs to has a current client template version, the worker renders
 * with that exact version: its visual definition, its semantic structure, its fingerprint and its
 * id, which the manifest and the render audit carry. With none, it renders with the house template
 * exactly as before. A stored version the renderers cannot honour is treated as absent, logged and
 * reported in the result, never silently patched; a logo the worker cannot fetch or verify is left
 * out and reported, never replaced by another mark.
 */
import {createHash} from "node:crypto";

import {
  institutionalTemplateFromDefinition,
  presentationStructureFromStored,
  presentationTemplateFromStored,
  type InstitutionalPresentationTemplate,
} from "@offroad/case-export";
import {z} from "zod";

const hex64 = /^[a-f0-9]{64}$/;
const versionReadSchema = z.object({
  template: z.object({
    template_id: z.uuid(),
    scope: z.enum(["organization", "project"]),
    template_key: z.string().min(1),
    template_version: z.string().min(1),
    origin: z.enum(["offroad_house", "client_supplied"]),
    version_id: z.uuid(),
    version_no: z.number().int().positive(),
    fingerprint: z.string().regex(hex64),
    definition: z.unknown(),
    structure: z.unknown(),
  }).nullable(),
});

export type PresentationTemplateSource<Job> = {
  readPresentationTemplateVersion?(job: Job): Promise<unknown>;
  downloadBrandTemplateLogo?(objectPath: string): Promise<Uint8Array | null>;
};

export type ResolvedWorkerPresentationTemplate = {
  template: InstitutionalPresentationTemplate;
  source: "client_version" | "house";
  /** Why the house template applies although a client version was read; null when the version rendered. */
  reason: "no_client_version" | "read_invalid" | "version_unrenderable" | null;
  versionId: string | null;
  versionNo: number | null;
  scope: "organization" | "project" | null;
  /** True when the version names a logo the worker could not read or verify; the deck renders without a mark. */
  logoOmitted: boolean;
};

export async function resolvePresentationTemplateForJob<Job>(
  job: Job,
  source: PresentationTemplateSource<Job>,
  house: InstitutionalPresentationTemplate,
  log: (event: string, detail?: Record<string, unknown>) => void = () => {},
): Promise<ResolvedWorkerPresentationTemplate> {
  const houseResult = (reason: ResolvedWorkerPresentationTemplate["reason"]): ResolvedWorkerPresentationTemplate =>
    ({template: house, source: "house", reason, versionId: null, versionNo: null, scope: null, logoOmitted: false});
  if (!source.readPresentationTemplateVersion) return houseResult("no_client_version");
  const parsed = versionReadSchema.safeParse(await source.readPresentationTemplateVersion(job));
  if (!parsed.success) {
    log("presentation_template.read_invalid", {issues: parsed.error.issues.length});
    return houseResult("read_invalid");
  }
  const version = parsed.data.template;
  if (!version) return houseResult("no_client_version");
  const definition = presentationTemplateFromStored(version.definition);
  const structure = presentationStructureFromStored(version.structure);
  if (!definition || !structure) {
    log("presentation_template.version_unrenderable", {versionId: version.version_id, definition: definition !== null, structure: structure !== null});
    return houseResult("version_unrenderable");
  }
  let logo: {data: Uint8Array; extension: "png" | "jpeg"} | undefined;
  let logoOmitted = false;
  if (definition.logo) {
    const bytes = source.downloadBrandTemplateLogo ? await source.downloadBrandTemplateLogo(definition.logo.objectPath) : null;
    const verified = bytes !== null
      && bytes.byteLength === definition.logo.byteLength
      && createHash("sha256").update(bytes).digest("hex") === definition.logo.sha256;
    if (verified && bytes) logo = {data: bytes, extension: definition.logo.contentType === "image/png" ? "png" : "jpeg"};
    else {
      logoOmitted = true;
      log("presentation_template.logo_omitted", {versionId: version.version_id, read: bytes !== null});
    }
  }
  return {
    template: {...institutionalTemplateFromDefinition(definition, logo), fingerprint: version.fingerprint, versionId: version.version_id, structure},
    source: "client_version",
    reason: null,
    versionId: version.version_id,
    versionNo: version.version_no,
    scope: version.scope,
    logoOmitted,
  };
}
