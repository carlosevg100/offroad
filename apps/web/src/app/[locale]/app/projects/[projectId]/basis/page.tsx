import Link from "next/link";
import {notFound} from "next/navigation";
import {getTranslations} from "next-intl/server";
import {z} from "zod";
import {requireWorkspace} from "@/lib/auth/workspace";
import {loadAdoptionWorkContext} from "@/lib/advisor/adoption-basis-reader";
import {AdoptionBasisWork} from "@/components/advisor/adoption-basis-work";
export const dynamic="force-dynamic";
export default async function BasisPage({params,searchParams}:{params:Promise<{locale:string;projectId:string}>;searchParams:Promise<{context?:string;version?:string;before?:string}>}) {
 const {locale,projectId}=await params;
 if(!z.uuid().safeParse(projectId).success) notFound();
 const query=await searchParams;
 const parsed=z.object({context:z.string().trim().min(1).max(160).default("base"),version:z.uuid().optional(),before:z.string().regex(/^[0-9]{1,19}$/).optional()}).safeParse(query);
 if(!parsed.success) notFound();
 const t=await getTranslations({locale,namespace:"App.adoptionBasis"});
 const {supabase,organization}=await requireWorkspace(locale);
 const {data:project}=await supabase.from("capital_projects").select("id,project_name").eq("organization_id",organization.id).eq("id",projectId).maybeSingle();
 if(!project) notFound();
 let context;
 try { context=await loadAdoptionWorkContext(supabase,organization.id,projectId,parsed.data.context,parsed.data.version??null,parsed.data.before??null); }
 catch { return <main className="adoption-basis"><Link href={`/${locale}/app/projects/${projectId}`}>{t("back")}</Link><h1>{t("title")}</h1><p role="alert">{t("errors.unavailable")}</p></main>; }
 return <main className="adoption-basis"><Link href={`/${locale}/app/projects/${projectId}`}>{t("back")}</Link><h1>{t("title")}</h1><p>{project.project_name}</p><p>{t("intro")}</p><AdoptionBasisWork locale={locale} projectId={projectId} contextKey={parsed.data.context} data={context}/></main>;
}
