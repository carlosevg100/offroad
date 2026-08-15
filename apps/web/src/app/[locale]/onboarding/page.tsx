import {ArrowRight, Building2, Landmark, Network} from "lucide-react";
import Link from "next/link";
import {getTranslations} from "next-intl/server";
import {redirect} from "next/navigation";

import {BrandMark} from "@/components/brand-mark";
import type {AppLocale} from "@/i18n/routing";
import {createClient} from "@/lib/supabase/server";

import {completeOnboarding} from "./actions";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{locale: string}>;
  searchParams: Promise<{error?: string}>;
};

export default async function OnboardingPage({params, searchParams}: Props) {
  const {locale} = await params;
  const state = await searchParams;
  const t = await getTranslations({locale, namespace: "Onboarding"});
  const supabase = await createClient();
  if (!supabase) redirect(`/${locale}/login?error=provider`);

  const {data: claimsData, error} = await supabase.auth.getClaims();
  if (error || !claimsData?.claims?.sub) redirect(`/${locale}/login`);

  const {count} = await supabase
    .from("organization_memberships")
    .select("organization_id", {count: "exact", head: true})
    .eq("user_id", claimsData.claims.sub);
  if ((count ?? 0) > 0) redirect(`/${locale}/app`);

  return (
    <main className="onboarding-page">
      <header className="onboarding-header">
        <BrandMark locale={locale as AppLocale} />
        <Link className="text-link" href={`/${locale}/login`}>Login</Link>
      </header>

      <section className="onboarding-intro">
        <p className="section-kicker">{t("eyebrow")}</p>
        <h1>{t("title")}</h1>
        <p>{t("body")}</p>
      </section>

      <form action={completeOnboarding} className="onboarding-form">
        <input name="locale" type="hidden" value={locale} />
        {state.error ? <p className="form-notice form-notice--error" role="alert">{t("error")}</p> : null}

        <fieldset className="journey-options">
          <legend className="sr-only">{t("title")}</legend>
          <label className="journey-option">
            <input defaultChecked name="journey" type="radio" value="company" />
            <Building2 aria-hidden="true" size={22} />
            <strong>{t("company")}</strong>
            <span>{t("companyBody")}</span>
          </label>
          <label className="journey-option">
            <input name="journey" type="radio" value="originator" />
            <Network aria-hidden="true" size={22} />
            <strong>{t("originator")}</strong>
            <span>{t("originatorBody")}</span>
          </label>
          <label className="journey-option">
            <input name="journey" type="radio" value="capital_provider" />
            <Landmark aria-hidden="true" size={22} />
            <strong>{t("capitalProvider")}</strong>
            <span>{t("capitalProviderBody")}</span>
          </label>
        </fieldset>

        <div className="form-grid">
          <label className="field field--wide">
            <span>{t("organizationName")}</span>
            <input minLength={2} name="organization_name" required />
          </label>
          <label className="field">
            <span>{t("legalName")}</span>
            <input name="legal_name" />
          </label>
          <label className="field">
            <span>{t("website")}</span>
            <input name="website" type="url" />
          </label>
          <label className="field">
            <span>{t("country")}</span>
            <select defaultValue="BR" name="country_code">
              <option value="BR">Brasil</option>
              <option value="US">United States</option>
              <option value="GB">United Kingdom</option>
            </select>
          </label>
        </div>

        <button className="button onboarding-submit" type="submit">
          {t("continue")} <ArrowRight aria-hidden="true" size={16} />
        </button>
      </form>
    </main>
  );
}
