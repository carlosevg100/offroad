import {resourceStillReadable} from "@/lib/auth/resource-download";
import {requireWorkspace} from "@/lib/auth/workspace";
import {caseDiagnosisMarkdown} from "@/lib/intake/case-markdown";
import {resolveCaseState} from "@/lib/intake/case-pipeline";

type Params = {params: Promise<{locale: string; sessionId: string}>};

export async function GET(_request: Request, {params}: Params) {
  const {locale, sessionId} = await params;
  const {supabase, organization} = await requireWorkspace(locale);
  if (!await resourceStillReadable(supabase,organization.id,sessionId,"session")) return new Response(null,{status:404,headers:{"cache-control":"private, no-store"}});
  const {data: session} = await supabase
    .from("document_intake_sessions")
    .select("id, project_name, capital_currency")
    .eq("organization_id", organization.id)
    .eq("id", sessionId)
    .is("archived_at", null)
    .maybeSingle();
  if (!session) return new Response("Not found", {status: 404});

  const lang = locale === "en-US" ? "en" : "pt";
  const state = await resolveCaseState({supabase, organizationId: organization.id, sessionId, locale: lang});
  const markdown = caseDiagnosisMarkdown({
    state,
    locale: lang,
    title: session.project_name || (lang === "pt" ? "Case Offroad" : "Offroad case"),
    currency: session.capital_currency,
  });
  if (!await resourceStillReadable(supabase,organization.id,sessionId,"session")) return new Response(null,{status:404,headers:{"cache-control":"private, no-store"}});
  return new Response(markdown, {
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "content-disposition": `inline; filename="case-${sessionId.slice(0, 8)}.md"`,
      "cache-control": "private, no-store",
    },
  });
}
