import Link from "next/link";
import {getTranslations} from "next-intl/server";

import {capitalProjectJob, capitalProjectJobSchema} from "@offroad/work-plan";

import {AdvisorStart, type AdvisorStartCopy, type AdvisorStartRecent} from "@/components/advisor/advisor-start";

// The rotating examples are a fixed-length catalogue: next-intl resolves leaf keys, so the
// count lives here and the message-catalogue parity test keeps both locales in step.
const advisorExampleIndexes = [0, 1, 2, 3, 4, 5, 6] as const;
const financierExampleIndexes = [0, 1, 2, 3, 4, 5] as const;
import {requireWorkspace} from "@/lib/auth/workspace";
import {workspaceCapabilities} from "@/lib/workspace/capabilities";

type Props = {params: Promise<{locale: string}>; searchParams: Promise<{welcome?: string; group?: string}>};

type WorkspaceTermsSetup = {terms_accepted?: boolean};

export default async function ApplicationHome({params, searchParams}: Props) {
  const {locale} = await params;
  const state = await searchParams;
  const t = await getTranslations({locale, namespace: "App"});
  const {supabase, organization, userId} = await requireWorkspace(locale);
  const capabilities = workspaceCapabilities(organization.organization_type);
  // A financier analyzes in the same conversation as everyone else. Its funds and mandates keep
  // their own page; what this page adds for it is the reminder that private documents wait for
  // the accepted workspace terms, so the attach button never fails without an explanation.
  const financier = capabilities.mandate_management;
  const [selectedGroupResult, profileResult, termsResult] = await Promise.all([
    state.group
      ? supabase.from("workspace_project_groups")
        .select("id, name")
        .eq("organization_id", organization.id)
        .eq("id", state.group)
        .is("archived_at", null)
        .maybeSingle()
      : Promise.resolve({data: null}),
    supabase.from("profiles").select("full_name").eq("id", userId).maybeSingle(),
    financier ? supabase.rpc("get_workspace_project_setup", {p_locale: locale}) : Promise.resolve({data: null}),
  ]);
  const selectedGroup = selectedGroupResult.data;
  const userFirstName = profileResult.data?.full_name?.trim().split(/\s+/)[0] ?? "";
  const termsSetup = termsResult.data && typeof termsResult.data === "object" && !Array.isArray(termsResult.data)
    ? termsResult.data as WorkspaceTermsSetup
    : null;
  const termsPending = financier && termsSetup !== null && termsSetup.terms_accepted !== true;

  const {data: recentSessions} = await supabase
    .from("document_intake_sessions")
    .select("id, capital_project_id, project_name, status, opportunity_id, updated_at, archived_at")
    .eq("organization_id", organization.id)
    .is("archived_at", null)
    .neq("status", "cancelled")
    .order("updated_at", {ascending: false})
    .limit(3);
  const recentProjectIds = (recentSessions ?? []).flatMap((session) => session.capital_project_id ? [session.capital_project_id] : []);
  const {data: capitalProjects} = recentProjectIds.length > 0
    ? await supabase.from("capital_projects").select("id, entry_job").eq("organization_id", organization.id).in("id", recentProjectIds)
    : {data: []};
  // An absolute stamp rather than "2h ago": relative time needs the current instant,
  // which a render may not read, and a desk reads a timestamp faster than an interval.
  const stamp = new Intl.DateTimeFormat(locale, {day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit"});
  const since = (iso: string | null) => (iso ? stamp.format(new Date(iso)) : "");
  const recentProjectById = new Map((capitalProjects ?? []).map((project) => [project.id, project]));
  const recents: AdvisorStartRecent[] = (recentSessions ?? []).map((session) => ({
    href: session.capital_project_id
      ? `/${locale}/app/projects/${session.capital_project_id}`
      : session.status === "confirmed" && session.opportunity_id
        ? `/${locale}/app/opportunities/${session.opportunity_id}`
        : `/${locale}/app/new?mode=documents&session=${session.id}`,
    id: session.id,
    job: (() => {
      const project = session.capital_project_id ? recentProjectById.get(session.capital_project_id) : null;
      const parsed = capitalProjectJobSchema.safeParse(project?.entry_job);
      return parsed.success ? capitalProjectJob(parsed.data).title[locale === "en-US" ? "en" : "pt"] : t("projectInPreparation");
    })(),
    name: session.project_name || t("untitledProject"),
    state: t(`projectStatus.${session.status === "review_ready" ? "reviewReady" : session.status}`),
    when: since(session.updated_at),
  }));

  const copy: AdvisorStartCopy = {
    greetings: {morning: t("advisor.greetings.morning"), afternoon: t("advisor.greetings.afternoon"), evening: t("advisor.greetings.evening")},
    question: financier ? t("advisorFinancier.question") : t("advisor.question"),
    prompt: financier ? t("advisorFinancier.prompt") : t("advisor.prompt"),
    exampleLabel: financier ? t("advisorFinancier.exampleLabel") : t("advisor.exampleLabel"),
    examples: financier
      ? financierExampleIndexes.map((index) => ({
        prompt: t(`advisorFinancier.examples.${index}.prompt`),
        role: t(`advisorFinancier.examples.${index}.role`),
      }))
      : advisorExampleIndexes.map((index) => ({
        prompt: t(`advisor.examples.${index}.prompt`),
        role: t(`advisor.examples.${index}.role`),
      })),
    documentsOnly: financier ? t("advisorFinancier.documentsOnly") : t("advisor.documentsOnly"),
    attach: t("advisor.attach"),
    remove: t("advisor.remove"),
    send: t("advisor.send"),
    continueLabel: t("advisor.continueLabel"),
    status: {creating: t("advisor.status.creating"), uploading: t("advisor.status.uploading"), starting: t("advisor.status.starting")},
    errors: {
      invalid: t("advisor.errors.invalid"),
      denied: financier ? t("advisorFinancier.errors.denied") : t("advisor.errors.denied"),
      duplicate: t("advisor.errors.duplicate"), not_found: t("advisor.errors.notFound"), save: t("advisor.errors.save"), processing: t("advisor.errors.processing"), stale: t("advisor.errors.stale"), upload: t("advisor.errors.upload"),
    },
    groupContext: t("advisor.groupContext"),
  };

  return (
    <>
      {termsPending ? (
        <aside className="form-notice app-welcome-notice financier-terms-notice" data-testid="financier-terms-notice" role="status">
          <strong>{t("advisorFinancier.termsNoticeTitle")}</strong> {t("advisorFinancier.termsNoticeBody")}{" "}
          <Link className="text-link" href={`/${locale}/app/new?setup=terms`}>{t("advisorFinancier.termsNoticeCta")}</Link>
        </aside>
      ) : null}
      <AdvisorStart copy={copy} groupId={selectedGroup?.id} groupName={selectedGroup?.name} locale={locale === "en-US" ? "en-US" : "pt-BR"} organizationId={organization.id} recents={recents} userFirstName={userFirstName} userId={userId} />
    </>
  );
}
