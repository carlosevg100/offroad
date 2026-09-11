"use server";

import {createHash} from "node:crypto";

import {
  isPdfRenderableFont,
  presentationTemplateColorKeys,
  presentationTemplateIssues,
  presentationTemplateToStored,
  type PresentationTemplateDefinition,
} from "@offroad/case-export/presentation-template";
import {revalidatePath} from "next/cache";
import {z} from "zod";

import {requireWorkspace} from "@/lib/auth/workspace";
import {loadPresentationTemplateContext} from "@/lib/advisor/presentation-template";

export type PresentationTemplateResult =
  | {ok: true; status: "stored" | "cleared"}
  | {ok: false; error: "invalid" | "unsupported_font" | "logo" | "denied" | "not_found" | "save"};

const localeSchema = z.enum(["pt-BR", "en-US"]);
const scopeSchema = z.enum(["organization", "project"]);
const fontSchema = z.string().trim().regex(/^[A-Za-z0-9 ()+.-]{2,64}$/);
const colorSchema = z.string().trim().transform(value => value.replace(/^#/, "").toUpperCase()).pipe(z.string().regex(/^[0-9A-F]{6}$/));
const logoTypes = ["image/png", "image/jpeg"] as const;
const maxLogoBytes = 2_097_152;

const formSchema = z.object({
  locale: localeSchema,
  projectId: z.uuid(),
  scope: scopeSchema,
  intent: z.enum(["store", "clear"]),
  templateKey: z.string().trim().regex(/^[a-z0-9][a-z0-9-]{1,46}[a-z0-9]$/).optional(),
  templateVersion: z.string().trim().regex(/^\d{4}\.\d{2}\.\d{2}-v\d{1,3}$/).optional(),
  fontDisplay: fontSchema.optional(),
  fontBody: fontSchema.optional(),
  pdfDisplay: z.string().trim().optional(),
  pdfBody: z.string().trim().optional(),
  confidentialityLabel: z.string().trim().max(80).optional(),
  removeLogo: z.boolean(),
  colors: z.record(z.string(), colorSchema),
}).strict();

function commandError(error: {code?: string; message?: string} | null): PresentationTemplateResult {
  if (error?.code === "P0002") return {ok: false, error: "not_found"};
  if (error?.code === "42501") return {ok: false, error: "denied"};
  if (error?.message?.includes("unsupported_presentation_template_font")) return {ok: false, error: "unsupported_font"};
  if (error?.message?.includes("presentation_template_logo")) return {ok: false, error: "logo"};
  if (error?.code === "22023") return {ok: false, error: "invalid"};
  return {ok: false, error: "save"};
}

/**
 * Record the visual identity a delivery is rendered with. The database decides who may write
 * (organization owners and administrators) and refuses anything the renderers cannot honour; this
 * action derives the workspace from the session, never from the form, and refuses a font outside
 * the embeddable set here as well, so the person sees the reason before a write is attempted.
 */
export async function savePresentationTemplate(formData: FormData): Promise<PresentationTemplateResult> {
  const raw = {
    locale: formData.get("locale"),
    projectId: formData.get("projectId"),
    scope: formData.get("scope"),
    intent: formData.get("intent"),
    templateKey: formData.get("templateKey") ?? undefined,
    templateVersion: formData.get("templateVersion") ?? undefined,
    fontDisplay: formData.get("fontDisplay") ?? undefined,
    fontBody: formData.get("fontBody") ?? undefined,
    pdfDisplay: formData.get("pdfDisplay") ?? undefined,
    pdfBody: formData.get("pdfBody") ?? undefined,
    confidentialityLabel: formData.get("confidentialityLabel") ?? undefined,
    removeLogo: formData.get("removeLogo") === "on",
    colors: Object.fromEntries(presentationTemplateColorKeys.map(key => [key, formData.get(`color.${key}`) ?? ""])),
  };
  const parsed = formSchema.safeParse(raw);
  if (!parsed.success) return {ok: false, error: "invalid"};
  const input = parsed.data;
  const {supabase, organization} = await requireWorkspace(input.locale);
  // Exactly one scope is addressed and the other argument is null; the generated types mark every
  // RPC argument non-nullable, so the null side is cast at this single boundary.
  const target = (input.scope === "project"
    ? {p_organization_id: null, p_project_id: input.projectId}
    : {p_organization_id: organization.id, p_project_id: null}) as unknown as {p_organization_id: string; p_project_id: string};

  if (input.intent === "clear") {
    const {error} = await supabase.rpc("set_presentation_template_v1", {...target, p_definition: null as never});
    if (error) return commandError(error);
    revalidatePath(`/${input.locale}/app/projects/${input.projectId}`);
    return {ok: true, status: "cleared"};
  }

  if (!input.templateKey || !input.templateVersion || !input.fontDisplay || !input.fontBody) return {ok: false, error: "invalid"};
  // The PDF family is always an explicit decision; an unrecorded or unknown one stops here.
  if (!input.pdfDisplay || !input.pdfBody || !isPdfRenderableFont(input.pdfDisplay) || !isPdfRenderableFont(input.pdfBody)) {
    return {ok: false, error: "unsupported_font"};
  }

  const current = await loadPresentationTemplateContext(supabase, input.projectId);
  const existing = input.scope === "project" ? current?.project : current?.organization;
  let logo = input.removeLogo ? undefined : existing?.definition.logo;
  const file = formData.get("logo");
  if (file instanceof File && file.size > 0) {
    if (!logoTypes.includes(file.type as (typeof logoTypes)[number]) || file.size > maxLogoBytes) return {ok: false, error: "logo"};
    const bytes = new Uint8Array(await file.arrayBuffer());
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const objectPath = `${organization.id}/presentation-templates/${sha256}.${file.type === "image/png" ? "png" : "jpg"}`;
    const upload = await supabase.storage.from("brand-templates").upload(objectPath, bytes, {contentType: file.type, upsert: true});
    if (upload.error) return {ok: false, error: "logo"};
    logo = {objectPath, sha256, byteLength: bytes.byteLength, contentType: file.type === "image/png" ? "image/png" : "image/jpeg"};
  }

  const definition: PresentationTemplateDefinition = {
    templateKey: input.templateKey,
    templateVersion: input.templateVersion,
    origin: "client_supplied",
    colors: Object.fromEntries(presentationTemplateColorKeys.map(key => [key, input.colors[key]!])) as PresentationTemplateDefinition["colors"],
    fonts: {display: input.fontDisplay, body: input.fontBody, pdfDisplay: input.pdfDisplay, pdfBody: input.pdfBody},
    ...(logo ? {logo} : {}),
    ...(input.confidentialityLabel ? {confidentialityLabel: input.confidentialityLabel} : {}),
  };
  const issues = presentationTemplateIssues(definition);
  if (issues.length > 0) return {ok: false, error: issues.some(issue => issue.code === "unsupported_font") ? "unsupported_font" : issues.some(issue => issue.code === "invalid_logo") ? "logo" : "invalid"};

  const {error} = await supabase.rpc("set_presentation_template_v1", {...target, p_definition: presentationTemplateToStored(definition) as never});
  if (error) return commandError(error);
  revalidatePath(`/${input.locale}/app/projects/${input.projectId}`);
  return {ok: true, status: "stored"};
}
