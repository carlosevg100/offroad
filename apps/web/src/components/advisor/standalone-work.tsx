import {getTranslations} from "next-intl/server";
import {WorkParticipationPanel} from "./work-participation-panel";
import {WorkContextPanel} from "@/components/advisor/work-context-panel";
import {AdvisorProject} from "./advisor-project";
import {advisorProjectCopy} from "@/lib/advisor/advisor-project-copy";
import {requireWorkspace} from "@/lib/auth/workspace";

/** The same conversation surface without documentary placeholders or intake state. */
export async function StandaloneWork({locale, project}: {
  locale: string;
  project: {id: string; project_name: string; access_basis: string};
}) {
  const {supabase, organization, userId} = await requireWorkspace(locale);
  const [{data: messages, error}, copy] = await Promise.all([
    supabase.from("agent_messages").select("id, role, content, status, error_code, created_at, human_author_id")
      .eq("organization_id", organization.id).eq("work_id", project.id)
      .order("created_at", {ascending: true}).order("id", {ascending: true}),
    advisorProjectCopy(locale),
  ]);
  if (error) throw new Error("work_conversation_unavailable");
  const contributionCopy = await getTranslations({locale, namespace: "WorkContributions"});
  return <AdvisorProject
    currentUserId={userId}
    workSections={[{id: "contributions", title: contributionCopy("title"), content: <WorkParticipationPanel locale={locale} workId={project.id} />}]}
    contextPanel={<WorkContextPanel locale={locale} workId={project.id} />}
    accessBasis={project.access_basis} artifacts={[]} copy={copy} documents={[]}
    locale={locale === "en-US" ? "en-US" : "pt-BR"}
    messages={(messages ?? []).map(message => ({id: message.id, role: message.role,
      humanAuthorId: message.human_author_id, content: message.content, status: message.status, errorCode: message.error_code, createdAt: message.created_at}))}
    activityEvents={[]} coverage={{verified: 0, total: 0, openIssues: 0, notExamined: 0}}
    openRequirements={[]} decisionRecords={[]} proposals={[]}
    projectId={project.id} projectName={project.project_name}
    sessionId={null} sessionStatus="idle" tasks={[]}
  />;
}
