import {materialToPptx} from "@offroad/case-export";
import type {MaterialKind} from "@offroad/case-materials";

import {requireWorkspace} from "@/lib/auth/workspace";
import {governedMaterial, loadGovernedMaterialPackage} from "@/lib/deal-state/materials";

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

  const bytes = await materialToPptx({
    material,
    lang,
    meta: {issuedOn: governed.issuedOn},
  });
  const filename = `${kind}-${sessionId.slice(0, 8)}.pptx`;
  return new Response(Buffer.from(bytes), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "private, no-store",
    },
  });
}
