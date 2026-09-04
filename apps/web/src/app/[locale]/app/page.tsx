import {Building2, CheckCircle2, CircleAlert, Landmark, Target} from "lucide-react";
import Link from "next/link";
import {getTranslations} from "next-intl/server";

import {capitalProjectJob, capitalProjectJobSchema} from "@offroad/work-plan";

import {AdvisorStart, type AdvisorStartCopy, type AdvisorStartRecent} from "@/components/advisor/advisor-start";

// The rotating examples are a fixed-length catalogue: next-intl resolves leaf keys, so the
// count lives here and the message-catalogue parity test keeps both locales in step.
const advisorExampleIndexes = [0, 1, 2, 3, 4, 5, 6] as const;
import {requireWorkspace} from "@/lib/auth/workspace";

type Props = {params: Promise<{locale: string}>; searchParams: Promise<{welcome?: string; group?: string}>};

export default async function ApplicationHome({params, searchParams}: Props) {
  const {locale} = await params;
  const state = await searchParams;
  const t = await getTranslations({locale, namespace: "App"});
  const {supabase, organization, userId} = await requireWorkspace(locale);
  const [selectedGroupResult, profileResult] = await Promise.all([
    state.group
      ? supabase.from("workspace_project_groups")
        .select("id, name")
        .eq("organization_id", organization.id)
        .eq("id", state.group)
        .is("archived_at", null)
        .maybeSingle()
      : Promise.resolve({data: null}),
    supabase.from("profiles").select("full_name").eq("id", userId).maybeSingle(),
  ]);
  const selectedGroup = selectedGroupResult.data;
  const userFirstName = profileResult.data?.full_name?.trim().split(/\s+/)[0] ?? "";

  if (organization.organization_type === "capital_provider") {
    const [{data: funds}, {data: mandates}, {data: contacts}, {data: requests}] = await Promise.all([
      supabase.from("funds").select("id, name, strategy, status, updated_at").eq("organization_id", organization.id).order("updated_at", {ascending: false}),
      supabase.from("mandate_versions").select("id, fund_id, version_number, status, valid_from, valid_until, constraints").eq("organization_id", organization.id).order("created_at", {ascending: false}),
      supabase.from("provider_contacts").select("id, full_name, email, status").eq("organization_id", organization.id).eq("status", "active"),
      supabase.from("access_requests").select("id, status").eq("organization_id", organization.id),
    ]);
    const activeMandates = mandates?.filter((item) => item.status === "active") ?? [];
    const openRequests = requests?.filter((item) => item.status === "pending") ?? [];

    return (
      <main className="app-canvas">
        <header className="app-page-header">
          <div><p className="section-kicker">{t("providerEyebrow")}</p><h1>{t("providerWelcome")}</h1><p>{t("providerWelcomeBody")}</p></div>
          <Link className="button" href="#funds"><Target aria-hidden="true" size={16} />{t("viewMandates")}</Link>
        </header>
        {state.welcome === "1" ? <p className="form-notice form-notice--success app-welcome-notice" role="status">{t("welcomeComplete")}</p> : null}
        <section aria-label={t("providerPortfolio")} className="app-stat-grid">
          <article><Landmark aria-hidden="true" size={18} /><span>{t("registeredFunds")}</span><strong>{funds?.length ?? 0}</strong></article>
          <article><Target aria-hidden="true" size={18} /><span>{t("activeMandates")}</span><strong>{activeMandates.length}</strong></article>
          <article><Building2 aria-hidden="true" size={18} /><span>{t("qualifiedFlow")}</span><strong>0</strong></article>
          <article><CircleAlert aria-hidden="true" size={18} /><span>{t("accessRequests")}</span><strong>{openRequests.length}</strong></article>
        </section>
        <section className="pipeline-section" id="funds">
          <div className="pipeline-section__header"><h2>{t("fundsAndMandates")}</h2><span>{organization.name}</span></div>
          {(funds?.length ?? 0) === 0 ? <div className="empty-state"><span className="empty-state__number">01</span><div><h3>{t("emptyFundTitle")}</h3><p>{t("emptyFundBody")}</p></div></div> : (
            <div className="opportunity-table" role="list">
              {funds?.map((fund) => {
                const mandate = mandates?.find((item) => item.fund_id === fund.id);
                return <div className="provider-row" key={fund.id} role="listitem"><div><span>{fund.status}</span><strong>{fund.name}</strong><small>{fund.strategy}</small></div><div><span>{t("mandate")}</span><strong>{mandate ? `${t("version")} ${mandate.version_number}` : t("notRegistered")}</strong></div><div><span>{t("status")}</span><strong>{mandate?.status ?? t("notRegistered")}</strong></div><CheckCircle2 aria-hidden="true" size={16} /></div>;
              })}
            </div>
          )}
        </section>
        <section className="provider-contact-strip"><div><span>{t("routingContacts")}</span><strong>{contacts?.length ?? 0}</strong></div><p>{t("routingContactsBody")}</p></section>
      </main>
    );
  }

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
    question: t("advisor.question"),
    prompt: t("advisor.prompt"),
    exampleLabel: t("advisor.exampleLabel"),
    examples: advisorExampleIndexes.map((index) => ({
      prompt: t(`advisor.examples.${index}.prompt`),
      role: t(`advisor.examples.${index}.role`),
    })),
    documentsOnly: t("advisor.documentsOnly"),
    attach: t("advisor.attach"),
    remove: t("advisor.remove"),
    send: t("advisor.send"),
    continueLabel: t("advisor.continueLabel"),
    status: {creating: t("advisor.status.creating"), uploading: t("advisor.status.uploading"), starting: t("advisor.status.starting")},
    errors: {
      invalid: t("advisor.errors.invalid"), denied: t("advisor.errors.denied"), duplicate: t("advisor.errors.duplicate"), not_found: t("advisor.errors.notFound"), save: t("advisor.errors.save"), processing: t("advisor.errors.processing"), upload: t("advisor.errors.upload"),
    },
    groupContext: t("advisor.groupContext"),
  };

  return <AdvisorStart copy={copy} groupId={selectedGroup?.id} groupName={selectedGroup?.name} locale={locale === "en-US" ? "en-US" : "pt-BR"} organizationId={organization.id} recents={recents} userFirstName={userFirstName} userId={userId} />;
}
