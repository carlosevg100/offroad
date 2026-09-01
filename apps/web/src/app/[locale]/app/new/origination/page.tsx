import {randomUUID} from "node:crypto";

import {ArrowLeft, Globe2, LockKeyhole, SearchCheck} from "lucide-react";
import type {Metadata} from "next";
import Link from "next/link";
import {getTranslations} from "next-intl/server";
import {redirect} from "next/navigation";

import {IntakeActionSubmit} from "@/components/intake/intake-action-submit";
import {requireWorkspace} from "@/lib/auth/workspace";

import {startPublicOriginationThesis} from "./actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {title: "Tese de originação", robots: {index: false, follow: false}};

type Props = {
  params: Promise<{locale: string}>;
  searchParams: Promise<{error?: string}>;
};

export default async function OriginationThesisSetup({params, searchParams}: Props) {
  const {locale} = await params;
  const {error} = await searchParams;
  const t = await getTranslations({locale, namespace: "App.origination"});
  const {organization} = await requireWorkspace(locale);
  if (organization.organization_type === "capital_provider") redirect(`/${locale}/app`);

  const errorMessage = error === "duplicate"
    ? t("errors.duplicate")
    : error ? t("errors.save") : null;

  return (
    <main className="app-canvas origination-setup">
      <Link className="text-link origination-back" href={`/${locale}/app`}><ArrowLeft aria-hidden="true" size={14} />{t("back")}</Link>
      <header className="origination-setup__header">
        <p className="section-kicker">{t("kicker")}</p>
        <h1>{t("title")}</h1>
        <p>{t("body")}</p>
      </header>

      <div className="origination-setup__layout">
        <form action={startPublicOriginationThesis} className="origination-form">
          <input name="locale" type="hidden" value={locale} />
          <input name="request_id" type="hidden" value={randomUUID()} />
          {errorMessage ? <p className="form-notice form-notice--error origination-form__wide" role="alert">{errorMessage}</p> : null}

          <section className="origination-form__section origination-form__wide">
            <span>01</span><div><strong>{t("projectSection.title")}</strong><p>{t("projectSection.body")}</p></div>
          </section>
          <label><span>{t("fields.projectName")}</span><input autoComplete="off" maxLength={80} minLength={2} name="project_name" placeholder={t("fields.projectNamePlaceholder")} required /></label>
          <label><span>{t("fields.companyName")}</span><input autoComplete="organization" maxLength={160} minLength={2} name="company_name" placeholder={t("fields.companyNamePlaceholder")} required /></label>
          <label className="origination-form__wide"><span>{t("fields.website")}</span><input autoComplete="url" maxLength={500} name="company_website" placeholder={t("fields.websitePlaceholder")} /></label>

          <section className="origination-form__section origination-form__wide">
            <span>02</span><div><strong>{t("briefSection.title")}</strong><p>{t("briefSection.body")}</p></div>
          </section>
          <label className="origination-form__wide"><span>{t("fields.meetingContext")}</span><textarea maxLength={5000} minLength={10} name="meeting_context" placeholder={t("fields.meetingContextPlaceholder")} required rows={6} /><small>{t("fields.meetingContextHelp")}</small></label>
          <label><span>{t("fields.audience")}</span><input maxLength={240} name="audience" placeholder={t("fields.audiencePlaceholder")} /></label>
          <label><span>{t("fields.meetingDate")}</span><input name="meeting_date" type="date" /></label>
          <label className="origination-form__wide"><span>{t("fields.thesis")}</span><textarea maxLength={3000} name="thesis_to_test" placeholder={t("fields.thesisPlaceholder")} rows={4} /><small>{t("fields.thesisHelp")}</small></label>

          <div className="origination-form__boundary origination-form__wide">
            <LockKeyhole aria-hidden="true" size={17} />
            <p><strong>{t("boundary.title")}</strong>{t("boundary.body")}</p>
          </div>
          <div className="origination-form__action origination-form__wide">
            <p><SearchCheck aria-hidden="true" size={15} />{t("actionNote")}</p>
            <IntakeActionSubmit idle={t("submit")} pending={t("submitting")} />
          </div>
        </form>

        <aside className="origination-setup__aside">
          <Globe2 aria-hidden="true" size={19} />
          <p className="section-kicker">{t("aside.kicker")}</p>
          <h2>{t("aside.title")}</h2>
          <ol>
            <li><span>01</span><p><strong>{t("aside.steps.research.title")}</strong>{t("aside.steps.research.body")}</p></li>
            <li><span>02</span><p><strong>{t("aside.steps.read.title")}</strong>{t("aside.steps.read.body")}</p></li>
            <li><span>03</span><p><strong>{t("aside.steps.prepare.title")}</strong>{t("aside.steps.prepare.body")}</p></li>
          </ol>
          <small>{t("aside.footer")}</small>
        </aside>
      </div>
    </main>
  );
}
