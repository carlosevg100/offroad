import {materialToDocx} from "@offroad/case-export";
import type {MaterialKind} from "@offroad/case-materials";

import {requireWorkspace} from "@/lib/auth/workspace";
import {governedMaterial, loadGovernedMaterialPackage} from "@/lib/deal-state/materials";

/**
 * The material as a Word file: the term sheet and the covenant definitions are negotiated in
 * tracked changes, and that happens in .docx, not in a print dialog. Built deterministically
 * from the same blocks the HTML renders, so the two never say different things.
 *
 * Authorisation is the workspace boundary: RLS scopes every read to the caller's organization.
 */

const kinds: readonly MaterialKind[] = ["credit_memo", "term_sheet", "diligence_qa", "teaser", "credit_profile", "package", "data_room_index"];

type Params = {params: Promise<{locale: string; sessionId: string; kind: string}>};

export async function GET(_request: Request, {params}: Params) {
  const {locale, sessionId, kind} = await params;
  if (!kinds.includes(kind as MaterialKind)) return new Response("Not found", {status: 404});

  const {supabase, organization} = await requireWorkspace(locale);
  const lang = locale === "en-US" ? "en" : "pt";

  const governed = await loadGovernedMaterialPackage(supabase, organization.id, sessionId);
  if (!governed) return new Response(lang === "pt" ? "O pacote aprovado ainda não está disponível." : "The approved package is not available yet.", {status: 409});
  const material = governedMaterial(governed, kind as MaterialKind);
  if (!material) return new Response(lang === "pt" ? "Este material não faz parte do plano aprovado." : "This material is not part of the approved plan.", {status: 409});

  const bytes = materialToDocx({
    material,
    lang,
    meta: {issuedOn: new Date().toISOString().slice(0, 10), ...(organization.name ? {companyName: organization.name} : {})},
  });
  const filename = `${kind}-${sessionId.slice(0, 8)}.docx`;
  return new Response(Buffer.from(bytes), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "private, no-store",
    },
  });
}
