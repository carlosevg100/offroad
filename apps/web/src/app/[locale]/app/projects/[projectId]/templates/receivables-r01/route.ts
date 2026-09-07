import {receivablesDocumentSupplementContractVersion} from "@offroad/receivables-analysis";

import {requireWorkspace} from "@/lib/auth/workspace";
import {buildReceivablesR01Template} from "@/lib/receivables/r01-template";

type Params = {params: Promise<{locale: string; projectId: string}>};

export async function GET(_request: Request, {params}: Params) {
  const {locale, projectId} = await params;
  const lang = locale === "en-US" ? "en-US" : "pt-BR";
  const {supabase, organization} = await requireWorkspace(locale);
  const {data: project} = await supabase.from("capital_projects")
    .select("id")
    .eq("organization_id", organization.id)
    .eq("id", projectId)
    .maybeSingle();
  if (!project) return new Response("Not found", {status: 404});

  const bytes = buildReceivablesR01Template(lang);
  return new Response(bytes, {headers: {
    "cache-control": "private, no-store",
    "content-disposition": `attachment; filename="${lang === "pt-BR" ? "Modelo_Offroad_Recebiveis_R01" : "Offroad_Receivables_R01_Template"}.xlsx"`,
    "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "x-offroad-method": "R01",
    "x-offroad-template-version": receivablesDocumentSupplementContractVersion,
  }});
}
