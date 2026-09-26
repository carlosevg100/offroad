import {createHash} from "node:crypto";

import {
  offroadHousePresentationStructure,
  presentationStructureFromStored,
  type PresentationStructure,
} from "@offroad/case-export/presentation-structure";
import {
  institutionalTemplateFromDefinition,
  offroadHouseTemplateDefinition,
  presentationTemplateFromStored,
  type InstitutionalPresentationTemplate,
  type PresentationTemplateDefinition,
} from "@offroad/case-export/presentation-template";
import type {SupabaseClient} from "@supabase/supabase-js";
import {z} from "zod";

import type {Database} from "@/types/database";

const versionSummarySchema = z.object({
  version_id: z.uuid(),
  version_no: z.number().int().positive(),
  created_at: z.string(),
  author_name: z.string().nullable(),
  is_current: z.boolean(),
});
const storedTemplateSchema = z.object({
  template_id: z.uuid(),
  template_key: z.string().min(1),
  template_version: z.string().min(1),
  origin: z.enum(["offroad_house", "client_supplied"]),
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  definition: z.unknown(),
  structure: z.unknown(),
  version_id: z.uuid(),
  version_no: z.number().int().positive(),
  version_created_at: z.string(),
  versions: z.array(versionSummarySchema),
  scope: z.enum(["organization", "project"]).optional(),
});
const contextSchema = z.object({
  project_id: z.uuid(),
  organization_id: z.uuid(),
  can_manage: z.boolean(),
  effective: storedTemplateSchema.nullable(),
  organization: storedTemplateSchema.nullable(),
  project: storedTemplateSchema.nullable(),
  house_structure: z.unknown().optional(),
  pdf_fonts: z.array(z.string()).min(1),
});

export type PresentationTemplateVersionSummary = {
  versionId: string;
  versionNo: number;
  createdAt: string;
  /** The display name of the person who saved it; null when the profile has none. Never an identifier. */
  authorName: string | null;
  isCurrent: boolean;
};
export type StoredPresentationTemplate = {
  templateId: string;
  scope: "organization" | "project";
  /** Fingerprint of the exact current version: definition plus structure. */
  fingerprint: string;
  definition: PresentationTemplateDefinition;
  structure: PresentationStructure;
  versionId: string;
  versionNo: number;
  versionCreatedAt: string;
  versions: PresentationTemplateVersionSummary[];
};
export type PresentationTemplateContext = {
  projectId: string;
  organizationId: string;
  canManage: boolean;
  effective: StoredPresentationTemplate | null;
  organization: StoredPresentationTemplate | null;
  project: StoredPresentationTemplate | null;
  /** The structure a new client template starts from, as the database defaults it. */
  houseStructure: PresentationStructure;
  pdfFonts: readonly string[];
};

function parseStored(value: z.infer<typeof storedTemplateSchema> | null, fallbackScope: "organization" | "project"): StoredPresentationTemplate | null {
  if (!value) return null;
  const definition = presentationTemplateFromStored(value.definition);
  const structure = presentationStructureFromStored(value.structure);
  // A stored record the renderers cannot honour is treated as absent: the delivery falls back to
  // the Offroad template instead of exporting something that is almost the client's identity.
  if (!definition || !structure) return null;
  return {
    templateId: value.template_id, scope: value.scope ?? fallbackScope, fingerprint: value.fingerprint, definition, structure,
    versionId: value.version_id, versionNo: value.version_no, versionCreatedAt: value.version_created_at,
    versions: value.versions.map((version) => ({versionId: version.version_id, versionNo: version.version_no, createdAt: version.created_at, authorName: version.author_name, isCurrent: version.is_current})),
  };
}

export async function loadPresentationTemplateContext(
  client: SupabaseClient<Database>,
  projectId: string,
): Promise<PresentationTemplateContext | null> {
  const {data, error} = await client.rpc("read_presentation_template_v1", {p_project_id: projectId});
  if (error) return null;
  const parsed = contextSchema.safeParse(data);
  if (!parsed.success) return null;
  return {
    projectId: parsed.data.project_id,
    organizationId: parsed.data.organization_id,
    canManage: parsed.data.can_manage,
    effective: parseStored(parsed.data.effective, "organization"),
    organization: parseStored(parsed.data.organization, "organization"),
    project: parseStored(parsed.data.project, "project"),
    houseStructure: presentationStructureFromStored(parsed.data.house_structure) ?? offroadHousePresentationStructure,
    pdfFonts: parsed.data.pdf_fonts,
  };
}

export type ResolvedPresentationTemplate = {
  template: InstitutionalPresentationTemplate;
  /** True when the record named a logo the export could not verify and left it out. */
  logoOmitted: boolean;
};

/**
 * The identity an export must use: the exact stored version, its structure and its fingerprint.
 * The logo is fetched from the organization's own private object and its SHA-256 is recomputed: a
 * mismatch, a missing object or a revoked read drops the mark instead of embedding an unverified
 * image. Nothing else about the identity changes.
 */
export async function resolvePresentationTemplate(
  client: SupabaseClient<Database>,
  stored: StoredPresentationTemplate | null,
): Promise<ResolvedPresentationTemplate> {
  if (!stored) {
    return {template: {...institutionalTemplateFromDefinition(offroadHouseTemplateDefinition)}, logoOmitted: false};
  }
  const identity = {fingerprint: stored.fingerprint, versionId: stored.versionId, structure: stored.structure};
  const logo = stored.definition.logo;
  if (!logo) {
    return {template: {...institutionalTemplateFromDefinition(stored.definition), ...identity}, logoOmitted: false};
  }
  const download = await client.storage.from("brand-templates").download(logo.objectPath);
  const bytes = download.data ? new Uint8Array(await download.data.arrayBuffer()) : null;
  const verified = bytes !== null
    && bytes.byteLength === logo.byteLength
    && createHash("sha256").update(bytes).digest("hex") === logo.sha256;
  return {
    template: {
      ...institutionalTemplateFromDefinition(stored.definition, verified && bytes
        ? {data: bytes, extension: logo.contentType === "image/png" ? "png" : "jpeg"}
        : undefined),
      ...identity,
    },
    logoOmitted: !verified,
  };
}

/** One call for a download route: read the record for the project and resolve it for rendering. */
export async function presentationTemplateForProject(
  client: SupabaseClient<Database>,
  projectId: string,
): Promise<ResolvedPresentationTemplate> {
  const context = await loadPresentationTemplateContext(client, projectId);
  return resolvePresentationTemplate(client, context?.effective ?? null);
}
