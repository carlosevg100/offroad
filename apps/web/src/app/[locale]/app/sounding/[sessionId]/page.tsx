import Link from "next/link";
import {redirect} from "next/navigation";
import {getTranslations} from "next-intl/server";

import {SoundingBoard} from "@/components/sounding/sounding-board";
import {requireWorkspace} from "@/lib/auth/workspace";
import {resolveCaseState} from "@/lib/intake/case-pipeline";
import {loadSounding} from "@/lib/sounding/server";

import {addInvestorAction, openSoundingAction, recordEventAction} from "./actions";

type Props = {params: Promise<{locale: string; sessionId: string}>; searchParams: Promise<{error?: string}>};

/**
 * The market stage of one case: the list, the log and the book.
 *
 * Opens only from a case the desk has analysed, because a sounding without a rating and a
 * term sheet is a cold call. The deal profile for the shortlist comes from the case state:
 * archetype, amount, tenor, rating band, whether the paper is secured.
 */
export default async function SoundingPage({params, searchParams}: Props) {
  const {locale, sessionId} = await params;
  const {error} = await searchParams;
  const t = await getTranslations({locale, namespace: "Sounding"});
  const {supabase, organization} = await requireWorkspace(locale);
  if (organization.organization_type === "capital_provider") redirect(`/${locale}/app`);
  const lang = locale === "en-US" ? "en" : "pt";

  const {data: session} = await supabase
    .from("document_intake_sessions")
    .select("id, archetype, requested_amount, requested_term_months, sector, collateral_kinds")
    .eq("organization_id", organization.id)
    .eq("id", sessionId)
    .maybeSingle();
  if (!session) redirect(`/${locale}/app`);

  const state = await resolveCaseState({supabase, organizationId: organization.id, sessionId, locale: lang});
  const amount = state.termSheet?.terms.find((term) => term.id === "amount")?.value.pt.replace(/\D/g, "") || String(session.requested_amount ?? "");
  const deal = {
    archetypeId: session.archetype ?? "other",
    amount: amount || "0",
    tenorMonths: session.requested_term_months ?? 36,
    rating: state.rating?.band ?? ("watch" as const),
    sector: session.sector ?? "",
    secured: (state.collateral?.lines.length ?? 0) > 0 || ((session.collateral_kinds as string[] | null)?.length ?? 0) > 0,
    ...(session.archetype === "venture_debt" ? {ventureBacked: true} : {}),
  };
  const view = await loadSounding({supabase, organizationId: organization.id, userId: "", sessionId}, deal);

  return (
    <main className="app-canvas">
      <header className="app-page-header">
        <div>
          <p className="section-kicker">{t("kicker")}</p>
          <h1>{t("title")}</h1>
          <p>{t("intro")}</p>
        </div>
        <Link className="button button--ghost" href={`/${locale}/app/new?mode=documents&session=${sessionId}`}>{t("backToCase")}</Link>
      </header>
      {error ? <p className="form-notice form-notice--error" role="alert">{t(`error_${error === "transition" || error === "validation" || error === "save" ? error : "save"}`)}</p> : null}
      <SoundingBoard
        actions={{open: openSoundingAction, addInvestor: addInvestorAction, recordEvent: recordEventAction}}
        deal={deal}
        locale={locale}
        sessionId={sessionId}
        view={view}
      />
    </main>
  );
}
