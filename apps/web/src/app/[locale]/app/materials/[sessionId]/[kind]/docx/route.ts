import {materialToDocx} from "@offroad/case-export";
import type {MaterialKind} from "@offroad/case-materials";

import {requireWorkspace} from "@/lib/auth/workspace";
import {resolveCaseState} from "@/lib/intake/case-pipeline";

/**
 * The material as a Word file: the term sheet and the covenant definitions are negotiated in
 * tracked changes, and that happens in .docx, not in a print dialog. Built deterministically
 * from the same blocks the HTML renders, so the two never say different things.
 *
 * Authorisation is the workspace boundary: RLS scopes every read to the caller's organization.
 */

const kinds: readonly MaterialKind[] = ["investment_memo", "term_sheet", "diligence_qa", "teaser", "credit_profile", "package", "data_room_index"];

type Params = {params: Promise<{locale: string; sessionId: string; kind: string}>};

export async function GET(_request: Request, {params}: Params) {
  const {locale, sessionId, kind} = await params;
  if (!kinds.includes(kind as MaterialKind)) return new Response("Not found", {status: 404});

  const {supabase, organization} = await requireWorkspace(locale);
  const lang = locale === "en-US" ? "en" : "pt";

  const state = await resolveCaseState({supabase, organizationId: organization.id, sessionId, locale: lang});
  const material = state.materials.find((entry) => entry.kind === kind);
  if (!material) {
    const reason = state.materialsBlockedBy.join("; ") || state.briefBlockedBy.join("; ");
    return new Response(
      lang === "pt" ? `Este material ainda não pode ser emitido.${reason ? ` Motivo: ${reason}` : ""}` : `This material cannot be issued yet.${reason ? ` Reason: ${reason}` : ""}`,
      {status: 409, headers: {"content-type": "text/plain; charset=utf-8"}},
    );
  }

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
