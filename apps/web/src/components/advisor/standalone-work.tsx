import {ArtifactRoundtripWork} from "./artifact-roundtrip-work";
import type {SupabaseClient} from "@supabase/supabase-js";
import {loadWorkReviewDashboard} from "@/lib/advisor/work-review-dashboard";
import {loadProjectReviewPolicyContext} from "@/lib/advisor/project-review-policy-context";
import {ProjectReviewRoles} from "./project-review-roles";
import {WorkVaultPanel} from "@/components/advisor/work-vault-panel";
import {getTranslations} from "next-intl/server";
import {WorkParticipationPanel} from "./work-participation-panel";
import {WorkContextPanel} from "@/components/advisor/work-context-panel";
import {AdvisorProject} from "./advisor-project";
import {WorkUpdates} from "./work-updates";
import {advisorProjectCopy} from "@/lib/advisor/advisor-project-copy";
import {executionResultCitations} from "@offroad/domain-contracts";
import {continuationNote} from "@/lib/advisor/work-continuation";
import {executionResultHref} from "@/lib/execution/revision";
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
  const [{data: messages, error}, copy, updates, reviewPolicy] = await Promise.all([
    supabase.from("agent_messages").select("id, role, content, status, error_code, created_at, human_author_id, metadata")
      .eq("organization_id", organization.id).eq("work_id", project.id)
      .order("created_at", {ascending: true}).order("id", {ascending: true}),
    advisorProjectCopy(locale),
    loadWorkUpdates(supabase, project.id, locale === "en-US" ? "en-US" : "pt-BR"),
    loadProjectReviewPolicyContext(supabase, project.id, organization.id),
  ]);
  if (error) throw new Error("work_conversation_unavailable");
  const reviewDashboard = reviewPolicy ? await loadWorkReviewDashboard(async (name, args) => {
    const result = await (supabase as SupabaseClient).rpc(name, args);
    return {data: result.data, error: result.error};
  }, project.id, organization.id, userId) : null;
  const language = locale === "en-US" ? "en-US" : "pt-BR";
  const vaultCopy = await getTranslations({locale, namespace: "Vault"});
  const contributionCopy = await getTranslations({locale, namespace: "WorkContributions"});
  const updatesCopy = await getTranslations({locale, namespace: "App.workUpdates"});
  const rolesCopy = await getTranslations({locale, namespace: "ProjectReviewRoles"});
  const sections: AdvisorWorkSection[] = [
    {id: "project-review", title: rolesCopy("contentTitle"), status: reviewPolicy ? rolesCopy(`regime.${reviewPolicy.regime}`) : undefined,
      content: reviewPolicy ? <ProjectReviewRoles dashboard={reviewDashboard} context={reviewPolicy} locale={language} projectId={project.id}/> : <p role="status">{rolesCopy("unavailable")}</p>},
    {id: "contributions", title: contributionCopy("title"), content: <WorkParticipationPanel locale={locale} workId={project.id} />},
    {id: "vault", title: vaultCopy("title"), content: <WorkVaultPanel locale={locale} workId={project.id} />},
  ];
  const roundtripCopy = await getTranslations({locale, namespace: "ArtifactImportPanel"});
  sections.push({id: "artifact-roundtrip", title: roundtripCopy("title"), content: <ArtifactRoundtripWork supabase={supabase} workId={project.id} locale={language}/>});
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
      continuation: continuationNote(message.metadata),
      citedResults: message.role === "assistant" ? executionResultCitations(message.metadata).map((citation) => ({href: executionResultHref(locale, project.id, citation)})) : []}))}
    activityEvents={[]} coverage={{verified: 0, total: 0, openIssues: 0, notExamined: 0}}
    openRequirements={[]} decisionRecords={[]} proposals={[]}
    projectId={project.id} projectName={project.project_name}
    sessionId={null} sessionStatus="idle" tasks={[]}
  />;
}
