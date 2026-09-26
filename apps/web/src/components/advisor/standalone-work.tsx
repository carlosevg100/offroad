import {WorkVaultPanel} from "@/components/advisor/work-vault-panel";
import {getTranslations} from "next-intl/server";
import {WorkParticipationPanel} from "./work-participation-panel";
import {WorkContextPanel} from "@/components/advisor/work-context-panel";
import {AdvisorProject} from "./advisor-project";
import {WorkUpdates} from "./work-updates";
import {advisorProjectCopy} from "@/lib/advisor/advisor-project-copy";
import {continuationNote} from "@/lib/advisor/work-continuation";
import {loadWorkUpdates} from "@/lib/advisor/work-updates-reader";
import {summarizeWorkActivity} from "@/lib/advisor/work-activity";
import {loadWorkActivity} from "@/lib/advisor/work-activity-reader";
import {requireWorkspace} from "@/lib/auth/workspace";
import type {AdvisorWorkSection} from "./advisor-work-surface";

/** The same conversation surface without documentary placeholders or intake state. */
export async function StandaloneWork({locale, project}: {
  locale: string;
  project: {id: string; project_name: string; access_basis: string};
}) {
  const {supabase, organization, userId} = await requireWorkspace(locale);
  // What is in progress is read before what it produces: a turn answered between the two reads
  // costs one more refresh and never leaves the page waiting without one.
  const activity = await loadWorkActivity(supabase, {organizationId: organization.id, workId: project.id, sessionId: null});
  const [{data: messages, error}, copy, updates] = await Promise.all([
    supabase.from("agent_messages").select("id, role, content, status, error_code, created_at, human_author_id, metadata")
      .eq("organization_id", organization.id).eq("work_id", project.id)
      .order("created_at", {ascending: true}).order("id", {ascending: true}),
    advisorProjectCopy(locale),
    loadWorkUpdates(supabase, project.id, locale === "en-US" ? "en-US" : "pt-BR"),
  ]);
  if (error) throw new Error("work_conversation_unavailable");
  const language = locale === "en-US" ? "en-US" : "pt-BR";
  const vaultCopy = await getTranslations({locale, namespace: "Vault"});
  const contributionCopy = await getTranslations({locale, namespace: "WorkContributions"});
  const updatesCopy = await getTranslations({locale, namespace: "App.workUpdates"});
  const sections: AdvisorWorkSection[] = [
    {id: "contributions", title: contributionCopy("title"), content: <WorkParticipationPanel locale={locale} workId={project.id} />},
    {id: "vault", title: vaultCopy("title"), content: <WorkVaultPanel locale={locale} workId={project.id} />},
  ];
  // An update that awaits a decision comes first; otherwise the section waits at the end.
  const updatesSection: AdvisorWorkSection = {id: "updates", title: updatesCopy("title"), content: <WorkUpdates locale={language} model={updates} workId={project.id} />,
    status: updates?.awaitingDecision ? updatesCopy("awaiting", {count: updates.awaitingDecision}) : undefined};
  if (updates?.awaitingDecision) sections.unshift(updatesSection); else sections.push(updatesSection);
  return <AdvisorProject
    currentUserId={userId}
    workSections={sections}
    contextPanel={<WorkContextPanel locale={locale} workId={project.id} />}
    accessBasis={project.access_basis} artifacts={[]} copy={copy} documents={[]}
    locale={language}
    activity={summarizeWorkActivity(activity)}
    messages={(messages ?? []).map(message => ({id: message.id, role: message.role,
      humanAuthorId: message.human_author_id, content: message.content, status: message.status, errorCode: message.error_code, createdAt: message.created_at,
      continuation: continuationNote(message.metadata)}))}
    activityEvents={[]} coverage={{verified: 0, total: 0, openIssues: 0, notExamined: 0}}
    openRequirements={[]} decisionRecords={[]} proposals={[]}
    projectId={project.id} projectName={project.project_name}
    sessionId={null} sessionStatus="idle" tasks={[]}
  />;
}
