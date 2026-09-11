import {createHash} from "node:crypto";

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

const storedTemplateSchema = z.object({
  template_id: z.uuid(),
  template_key: z.string().min(1),
  template_version: z.string().min(1),
  origin: z.enum(["offroad_house", "client_supplied"]),
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  definition: z.unknown(),
  scope: z.enum(["organization", "project"]).optional(),
});
const contextSchema = z.object({
  project_id: z.uuid(),
  organization_id: z.uuid(),
  can_manage: z.boolean(),
  effective: storedTemplateSchema.nullable(),
  organization: storedTemplateSchema.nullable(),
  project: storedTemplateSchema.nullable(),
  pdf_fonts: z.array(z.string()).min(1),
});

export type StoredPresentationTemplate = {
  templateId: string;
  scope: "organization" | "project";
  fingerprint: string;
  definition: PresentationTemplateDefinition;
};
export type PresentationTemplateContext = {
  projectId: string;
  organizationId: string;
  canManage: boolean;
  effective: StoredPresentationTemplate | null;
  organization: StoredPresentationTemplate | null;
  project: StoredPresentationTemplate | null;
  pdfFonts: readonly string[];
};

function parseStored(value: z.infer<typeof storedTemplateSchema> | null, fallbackScope: "organization" | "project"): StoredPresentationTemplate | null {
  if (!value) return null;
  const definition = presentationTemplateFromStored(value.definition);
  // A stored record the renderers cannot honour is treated as absent: the delivery falls back to
  // the Offroad template instead of exporting something that is almost the client's identity.
  if (!definition) return null;
  return {templateId: value.template_id, scope: value.scope ?? fallbackScope, fingerprint: value.fingerprint, definition};
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
    pdfFonts: parsed.data.pdf_fonts,
  };
}

export type ResolvedPresentationTemplate = {
  template: InstitutionalPresentationTemplate;
  /** True when the record named a logo the export could not verify and left it out. */
  logoOmitted: boolean;
};

/**
 * The identity an export must use. The logo is fetched from the organization's own private object
 * and its SHA-256 is recomputed: a mismatch, a missing object or a revoked read drops the mark
 * instead of embedding an unverified image. Nothing else about the identity changes.
 */
export async function resolvePresentationTemplate(
  client: SupabaseClient<Database>,
  stored: StoredPresentationTemplate | null,
): Promise<ResolvedPresentationTemplate> {
  if (!stored) {
    return {template: {...institutionalTemplateFromDefinition(offroadHouseTemplateDefinition)}, logoOmitted: false};
  }
  const logo = stored.definition.logo;
  if (!logo) {
    return {template: {...institutionalTemplateFromDefinition(stored.definition), fingerprint: stored.fingerprint}, logoOmitted: false};
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
      fingerprint: stored.fingerprint,
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
