import {ArrowLeft, ArrowRight, Info} from "lucide-react";
import Link from "next/link";
import {getTranslations} from "next-intl/server";

import {createOpportunity} from "./actions";

type Props = {
  params: Promise<{locale: string}>;
  searchParams: Promise<{error?: string}>;
};

export default async function NewOpportunityPage({params, searchParams}: Props) {
  const {locale} = await params;
  const state = await searchParams;
  const t = await getTranslations({locale, namespace: "App"});

  return (
    <main className="app-canvas intake-page">
      <Link className="text-link" href={`/${locale}/app`}><ArrowLeft aria-hidden="true" size={14} />{t("overview")}</Link>
      <header className="intake-header">
        <p className="section-kicker">{t("newEyebrow")}</p>
        <h1>{t("newTitle")}</h1>
      </header>

      <div className="intake-layout">
        <form action={createOpportunity} className="intake-form">
          <input name="locale" type="hidden" value={locale} />
          {state.error ? <p className="form-notice form-notice--error" role="alert">{t("formError")}</p> : null}
          <label className="field field--wide"><span>{t("legalName")}</span><input minLength={2} name="legal_name" required /></label>
          <label className="field"><span>{t("sector")}</span><select defaultValue="food_retail" name="sector"><option value="food_retail">Food retail</option><option value="logistics">Logistics</option><option value="manufacturing">Manufacturing</option><option value="technology">Technology</option><option value="healthcare">Healthcare</option></select></label>
          <label className="field field--wide"><span>{t("purpose")}</span><textarea minLength={3} name="purpose" required rows={4} /></label>
          <label className="field"><span>{t("requestedAmount")}</span><input inputMode="decimal" name="requested_amount" placeholder="50000000" required /></label>
          <label className="field"><span>{t("currency")}</span><select defaultValue="BRL" name="currency"><option value="BRL">BRL</option><option value="USD">USD</option><option value="EUR">EUR</option></select></label>
          <label className="field"><span>{t("term")}</span><input defaultValue={48} max={360} min={1} name="desired_term_months" required type="number" /></label>
          <button className="button intake-submit" type="submit">{t("submit")}<ArrowRight aria-hidden="true" size={16} /></button>
        </form>

        <aside className="intake-note">
          <Info aria-hidden="true" size={20} />
          <p>{t("requestNote")}</p>
          <div><span>01</span><p>Growth capex</p></div>
          <div><span>02</span><p>Working capital</p></div>
          <div><span>03</span><p>Refinancing</p></div>
          <div><span>04</span><p>Acquisition finance</p></div>
        </aside>
      </div>
    </main>
  );
}
