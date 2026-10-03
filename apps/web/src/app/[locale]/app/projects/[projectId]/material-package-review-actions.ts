"use server";
import {revalidatePath} from "next/cache";
import {z} from "zod";
import {requireWorkspace} from "@/lib/auth/workspace";
import {createMaterialPackageReviewPort} from "@/lib/artifacts/material-package-review";
import {parseMaterialPackageReviewContext} from "@/lib/artifacts/material-package-review-context";

const commandSchema = z.strictObject({locale: z.enum(["pt-BR", "en-US"]), projectId: z.uuid(), revisionId: z.uuid(),
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/), act: z.enum(["approve", "revoke_approval"]),
  declared: z.boolean(), commandId: z.uuid(), note: z.string().trim().max(5000), basisReviewId: z.uuid().nullable()});
export async function reviewMaterialPackage(input: unknown): Promise<{ok: true} | {ok: false; error: "denied" | "changed" | "save"}> {
  const parsed = commandSchema.safeParse(input);
  if (!parsed.success) return {ok: false, error: "save"};
  const c = parsed.data;
  const {supabase, organization} = await requireWorkspace(c.locale);
  const {data: project, error} = await supabase.from("capital_projects").select("id")
    .eq("id", c.projectId).eq("organization_id", organization.id).maybeSingle();
  if (error || !project) return {ok: false, error: "denied"};
  try {
    const port = createMaterialPackageReviewPort(supabase);
    const basis = await port.read(c.projectId, c.revisionId);
    const context = parseMaterialPackageReviewContext(basis, {workId: c.projectId, revisionId: c.revisionId,
      recipeId: basis.recipeId, bundleFingerprint: basis.bundleFingerprint, materialObjectId: basis.materialObjectId});
    if (!context) return {ok: false, error: "denied"};
    if (context.manifestFingerprint !== c.fingerprint) return {ok: false, error: "changed"};
    await port.decide({workId: c.projectId, revisionId: c.revisionId, manifestFingerprint: c.fingerprint,
      act: c.act, note: c.note || null, selfApprovalDeclared: c.declared, commandId: c.commandId, basisReviewId: c.basisReviewId});
    revalidatePath(`/${c.locale}/app/projects/${c.projectId}`);
    revalidatePath(`/${c.locale}/app`, "layout");
    return {ok: true};
  } catch {return {ok: false, error: "denied"};}
}
