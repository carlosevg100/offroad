import {ArrowLeft, ArrowRight, Building2, Check, FileText, Landmark, Network} from "lucide-react";
import type {Metadata} from "next";
import {getTranslations} from "next-intl/server";
import {redirect} from "next/navigation";

import {BrandMark} from "@/components/brand-mark";
import {OnboardingDocumentUploader} from "@/components/onboarding-document-uploader";
import type {AppLocale} from "@/i18n/routing";
import {createClient} from "@/lib/supabase/server";
import type {Json} from "@/types/database";

import {
  completeOnboarding,
  finishDocumentsStep,
  previousOnboardingStep,
  saveAdvisedCompanyStep,
  saveContactStep,
  saveFundingStep,
  saveFundStep,
  saveMandateStep,
  saveOrganizationStep,
} from "./actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {title: "Institutional Profile", robots: {index: false, follow: false}};

type Props = {params: Promise<{locale: string}>; searchParams: Promise<{error?: string}>};
type AnswerMap = Record<string, Json | undefined>;
type Journey = "company" | "originator" | "capital_provider";

function answerObject(answers: AnswerMap, key: string): AnswerMap {
  const value = answers[key];
  return value && typeof value === "object" && !Array.isArray(value) ? value as AnswerMap : {};
}

function text(answer: Json | undefined) {
  return typeof answer === "string" || typeof answer === "number" ? String(answer) : "";
}

function StepActions({locale, back = true, continueLabel}: {locale: string; back?: boolean; continueLabel: string}) {
  return (
    <div className="onboarding-actions">
      {back ? (
        <button className="button button--ghost" formAction={previousOnboardingStep} formNoValidate>
          <ArrowLeft aria-hidden="true" size={15} />
          <span className="sr-only">{locale === "pt-BR" ? "Voltar" : "Back"}</span>
        </button>
      ) : <span />}
      <button className="button" type="submit">{continueLabel}<ArrowRight aria-hidden="true" size={15} /></button>
    </div>
  );
}

export default async function OnboardingPage({params, searchParams}: Props) {
  const {locale} = await params;
  const state = await searchParams;
  const t = await getTranslations({locale, namespace: "Onboarding"});
  const supabase = await createClient();
  if (!supabase) redirect(`/${locale}/login?error=provider`);

  const {data: claimsData, error: claimsError} = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (claimsError || !userId) redirect(`/${locale}/login`);
  const {data: membership} = await supabase.from("organization_memberships").select("organization_id").eq("user_id", userId).eq("status", "active").limit(1).maybeSingle();
  if (!membership) redirect(`/${locale}/signup?error=session`);
  const [{data: organization}, {data: progress}] = await Promise.all([
    supabase.from("organizations").select("id, name, legal_name, website, country_code, state_code, city, sector, subsector, provider_type, description").eq("id", membership.organization_id).single(),
    supabase.from("onboarding_progress").select("journey, current_step, answers, completed_at").eq("organization_id", membership.organization_id).eq("user_id", userId).maybeSingle(),
  ]);
  if (!organization || !progress) redirect(`/${locale}/signup?error=session`);
  if (progress.completed_at) redirect(`/${locale}/app`);

  const journey = progress.journey as Journey;
  const currentStep = progress.current_step;
  const answers = (progress.answers ?? {}) as AnswerMap;
  const organizationAnswers = answerObject(answers, "organization");
  const companyAnswers = answerObject(answers, "advised_company");
  const fundingAnswers = answerObject(answers, "funding");
  const fundAnswers = answerObject(answers, "fund");
  const mandateAnswers = answerObject(answers, "mandate");
  const contactAnswers = answerObject(answers, "contact");
  const steps = journey === "company"
    ? ["organization", "funding", "documents", "review"]
    : journey === "originator"
      ? ["organization", "company", "funding", "documents", "review"]
      : ["organization", "fund", "mandate", "contacts", "review"];
  const currentIndex = Math.max(0, steps.indexOf(currentStep));
  const journeyTitle = journey === "company" ? t("journeyCompany") : journey === "originator" ? t("journeyOriginator") : t("journeyProvider");
  const JourneyIcon = journey === "company" ? Building2 : journey === "originator" ? Network : Landmark;

  let documents: Array<{id: string; original_name: string; byte_size: number | null}> = [];
  const opportunityId = text(answers.opportunity_id);
  if (currentStep === "documents" && opportunityId) {
    const result = await supabase.from("source_documents").select("id, original_name, byte_size").eq("organization_id", organization.id).eq("opportunity_id", opportunityId).order("created_at");
    documents = result.data ?? [];
  }

  const errorMessage = state.error === "documents" ? t("documentsRequired") : state.error ? t("error") : null;

  return (
    <main className="professional-onboarding">
      <header className="onboarding-header">
        <BrandMark locale={locale as AppLocale} />
        <div className="onboarding-header__context"><JourneyIcon aria-hidden="true" size={16} /><span>{journeyTitle}</span></div>
      </header>

      <div className="onboarding-layout">
        <aside className="onboarding-progress" aria-label={t("progressLabel")}>
          <p className="section-kicker">{t("eyebrow")}</p>
          <h1>{t("title")}</h1>
          <p>{t("body")}</p>
          <ol>
            {steps.map((step, index) => (
              <li className={index === currentIndex ? "is-current" : index < currentIndex ? "is-complete" : ""} key={step}>
                <span>{index < currentIndex ? <Check aria-hidden="true" size={13} /> : String(index + 1).padStart(2, "0")}</span>
                <div><strong>{t(`steps.${journey}.${step}.title`)}</strong><small>{t(`steps.${journey}.${step}.short`)}</small></div>
              </li>
            ))}
          </ol>
        </aside>

        <section className="onboarding-stage">
          <header className="onboarding-stage__header">
            <span>{t("stepCounter", {current: currentIndex + 1, total: steps.length})}</span>
            <h2>{t(`steps.${journey}.${currentStep}.title`)}</h2>
            <p>{t(`steps.${journey}.${currentStep}.body`)}</p>
          </header>
          {errorMessage ? <p className="form-notice form-notice--error" role="alert">{errorMessage}</p> : null}

          {currentStep === "organization" ? (
            <form action={saveOrganizationStep} className="onboarding-stage__form">
              <input name="locale" type="hidden" value={locale} />
              <div className="form-grid form-grid--onboarding">
                <label className="field field--wide"><span>{journey === "company" ? t("companyName") : t("organizationName")}</span><input defaultValue={organization.name.includes("em cadastro") ? "" : organization.name} maxLength={160} minLength={2} name="organization_name" required /></label>
                <label className="field"><span>{t("legalName")}</span><input defaultValue={organization.legal_name ?? ""} maxLength={200} name="legal_name" /></label>
                <label className="field"><span>{t("legalIdentifier")}</span><input aria-describedby="identifier-note" inputMode="numeric" maxLength={40} name="legal_identifier" placeholder={text(organizationAnswers.identifier_last4) ? `•••• ${text(organizationAnswers.identifier_last4)}` : ""} /><small id="identifier-note">{t("identifierNote")}</small></label>
                <label className="field"><span>{t("website")}</span><input defaultValue={organization.website ?? ""} maxLength={500} name="website" type="url" /></label>
                <label className="field"><span>{t("phone")}</span><input autoComplete="tel" maxLength={40} name="phone" type="tel" /></label>
                <label className="field"><span>{t("country")}</span><select defaultValue={organization.country_code ?? "BR"} name="country_code"><option value="BR">Brasil</option><option value="US">United States</option><option value="GB">United Kingdom</option></select></label>
                <label className="field"><span>{t("state")}</span><input defaultValue={organization.state_code ?? ""} maxLength={8} name="state_code" /></label>
                <label className="field"><span>{t("city")}</span><input defaultValue={organization.city ?? ""} maxLength={120} name="city" /></label>
                <label className="field"><span>{t("sector")}</span><input defaultValue={organization.sector ?? ""} maxLength={160} name="sector" /></label>
                <label className="field"><span>{t("subsector")}</span><input defaultValue={organization.subsector ?? ""} maxLength={160} name="subsector" /></label>
                {journey === "capital_provider" ? <label className="field"><span>{t("providerType")}</span><select defaultValue={organization.provider_type ?? "fund_manager"} name="provider_type"><option value="fund_manager">{t("providerTypes.fundManager")}</option><option value="fidc_manager">{t("providerTypes.fidcManager")}</option><option value="factor">{t("providerTypes.factor")}</option><option value="bank">{t("providerTypes.bank")}</option><option value="family_office">{t("providerTypes.familyOffice")}</option><option value="alternative_lender">{t("providerTypes.alternative")}</option><option value="other">{t("providerTypes.other")}</option></select></label> : null}
                {journey !== "company" ? <label className="field field--wide"><span>{t("description")}</span><textarea defaultValue={organization.description ?? ""} maxLength={2000} name="description" rows={4} /></label> : null}
              </div>
              <StepActions back={false} continueLabel={t("continue")} locale={locale} />
            </form>
          ) : null}

          {currentStep === "company" ? (
            <form action={saveAdvisedCompanyStep} className="onboarding-stage__form">
              <input name="locale" type="hidden" value={locale} />
              <div className="form-grid form-grid--onboarding">
                <label className="field"><span>{t("companyName")}</span><input defaultValue={text(companyAnswers.display_name)} maxLength={160} minLength={2} name="company_name" required /></label>
                <label className="field"><span>{t("legalName")}</span><input defaultValue={text(companyAnswers.legal_name)} maxLength={200} minLength={2} name="company_legal_name" required /></label>
                <label className="field"><span>{t("legalIdentifier")}</span><input inputMode="numeric" maxLength={40} name="legal_identifier" /></label>
                <label className="field"><span>{t("country")}</span><select defaultValue="BR" name="country_code"><option value="BR">Brasil</option><option value="US">United States</option></select></label>
                <label className="field"><span>{t("website")}</span><input defaultValue={text(companyAnswers.website)} name="website" type="url" /></label>
                <label className="field"><span>{t("sector")}</span><input defaultValue={text(companyAnswers.sector)} name="sector" /></label>
                <label className="field"><span>{t("subsector")}</span><input defaultValue={text(companyAnswers.subsector)} name="subsector" /></label>
                <label className="field"><span>{t("relationship")}</span><select defaultValue={text(companyAnswers.relationship) || "engaged_advisor"} name="relationship"><option value="engaged_advisor">{t("relationships.engaged")}</option><option value="exclusive_mandate">{t("relationships.exclusive")}</option><option value="company_authorized">{t("relationships.authorized")}</option></select></label>
                <label className="field"><span>{t("authorityKind")}</span><select defaultValue={text(companyAnswers.authority_kind) || "mandate"} name="authority_kind"><option value="mandate">{t("authorityKinds.mandate")}</option><option value="power_of_attorney">{t("authorityKinds.power")}</option><option value="board_resolution">{t("authorityKinds.board")}</option><option value="other">{t("authorityKinds.other")}</option></select></label>
                <label className="field"><span>{t("authorityReference")}</span><input defaultValue={text(companyAnswers.authority_reference)} name="authority_reference" /></label>
                <label className="field"><span>{t("companyContact")}</span><input defaultValue={text(companyAnswers.contact_name)} name="company_contact_name" /></label>
                <label className="field"><span>{t("companyContactEmail")}</span><input defaultValue={text(companyAnswers.contact_email)} name="company_contact_email" type="email" /></label>
              </div>
              <StepActions continueLabel={t("continue")} locale={locale} />
            </form>
          ) : null}

          {currentStep === "funding" ? (
            <form action={saveFundingStep} className="onboarding-stage__form">
              <input name="locale" type="hidden" value={locale} />
              <div className="form-grid form-grid--onboarding">
                <label className="field"><span>{t("purposeCategory")}</span><select defaultValue={text(fundingAnswers.purpose_category) || "growth"} name="purpose_category"><option value="working_capital">{t("purposes.workingCapital")}</option><option value="growth">{t("purposes.growth")}</option><option value="capex">Capex</option><option value="acquisition">{t("purposes.acquisition")}</option><option value="equipment">{t("purposes.equipment")}</option><option value="refinance">{t("purposes.refinance")}</option><option value="other">{t("purposes.other")}</option></select></label>
                <label className="field"><span>{t("desiredTiming")}</span><input defaultValue={text(fundingAnswers.desired_timing)} maxLength={500} name="desired_timing" /></label>
                <label className="field field--wide"><span>{t("purposeSummary")}</span><textarea defaultValue={text(fundingAnswers.purpose_summary)} maxLength={500} minLength={3} name="purpose_summary" required rows={3} /></label>
                <label className="field field--wide"><span>{t("rationale")}</span><textarea defaultValue={text(fundingAnswers.rationale)} maxLength={4000} name="rationale" required rows={4} /></label>
                <label className="field"><span>{t("requestedAmount")}</span><input defaultValue={text(fundingAnswers.requested_amount)} min="1" name="requested_amount" required step="0.01" type="number" /></label>
                <label className="field"><span>{t("currency")}</span><select defaultValue={text(fundingAnswers.currency) || "BRL"} name="currency"><option value="BRL">BRL</option><option value="USD">USD</option><option value="EUR">EUR</option></select></label>
                <label className="field"><span>{t("desiredTerm")}</span><input defaultValue={text(fundingAnswers.desired_term_months)} max="360" min="1" name="desired_term_months" type="number" /></label>
                <label className="field"><span>{t("repaymentSource")}</span><input defaultValue={text(fundingAnswers.repayment_source)} maxLength={2000} name="repayment_source" /></label>
                <label className="field field--wide"><span>{t("strategicImportance")}</span><textarea defaultValue={text(fundingAnswers.strategic_importance)} maxLength={3000} name="strategic_importance" rows={3} /></label>
                <label className="field field--wide"><span>{t("expectedOutcome")}</span><textarea defaultValue={text(fundingAnswers.expected_outcome)} maxLength={3000} name="expected_outcome" rows={3} /></label>
                <label className="field field--wide"><span>{t("collateral")}</span><textarea defaultValue={text(fundingAnswers.collateral_summary)} maxLength={2000} name="collateral_summary" rows={3} /></label>
              </div>
              <StepActions continueLabel={t("continue")} locale={locale} />
            </form>
          ) : null}

          {currentStep === "documents" ? (
            <div className="onboarding-stage__form">
              <OnboardingDocumentUploader copy={{title: t("uploadTitle"), body: t("uploadBody"), choose: t("uploadChoose"), uploading: t("uploading"), error: t("uploadError"), categories: t("uploadCategories")}} initialDocuments={documents} opportunityId={opportunityId} organizationId={organization.id} userId={userId} />
              <form action={finishDocumentsStep}><input name="locale" type="hidden" value={locale} /><StepActions continueLabel={t("review")} locale={locale} /></form>
            </div>
          ) : null}

          {currentStep === "fund" ? (
            <form action={saveFundStep} className="onboarding-stage__form">
              <input name="locale" type="hidden" value={locale} />
              <div className="form-grid form-grid--onboarding">
                <label className="field field--wide"><span>{t("fundName")}</span><input defaultValue={text(fundAnswers.name)} maxLength={200} minLength={2} name="fund_name" required /></label>
                <label className="field field--wide"><span>{t("fundStrategy")}</span><textarea defaultValue={text(fundAnswers.strategy)} maxLength={2000} minLength={2} name="strategy" required rows={5} /></label>
              </div>
              <div className="onboarding-note"><FileText aria-hidden="true" size={18} /><p>{t("multipleFundsNote")}</p></div>
              <StepActions continueLabel={t("continue")} locale={locale} />
            </form>
          ) : null}

          {currentStep === "mandate" ? (
            <form action={saveMandateStep} className="onboarding-stage__form">
              <input name="locale" type="hidden" value={locale} />
              <div className="form-grid form-grid--onboarding">
                <label className="field"><span>{t("currencies")}</span><input defaultValue={Array.isArray(mandateAnswers.currencies) ? mandateAnswers.currencies.join(", ") : "BRL"} name="currencies" required /></label>
                <label className="field"><span>{t("geographies")}</span><input defaultValue={Array.isArray(mandateAnswers.geographies) ? mandateAnswers.geographies.join(", ") : "Brasil"} name="geographies" required /></label>
                <label className="field"><span>{t("ticketMin")}</span><input min="1" name="ticket_min" required step="0.01" type="number" /></label>
                <label className="field"><span>{t("ticketMax")}</span><input min="1" name="ticket_max" required step="0.01" type="number" /></label>
                <label className="field"><span>{t("sectors")}</span><input name="sectors" placeholder={t("commaSeparated")} /></label>
                <label className="field"><span>{t("excludedSectors")}</span><input name="excluded_sectors" placeholder={t("commaSeparated")} /></label>
                <label className="field"><span>{t("mandatePurposes")}</span><input name="purposes" placeholder={t("commaSeparated")} /></label>
                <label className="field"><span>{t("structureTypes")}</span><input name="structure_types" placeholder={t("commaSeparated")} /></label>
                <label className="field"><span>{t("seniority")}</span><input name="seniority" placeholder={t("commaSeparated")} /></label>
                <label className="field"><span>{t("collateralTypes")}</span><input name="collateral" placeholder={t("commaSeparated")} /></label>
                <label className="field"><span>{t("termMin")}</span><input max="360" min="1" name="term_min" type="number" /></label>
                <label className="field"><span>{t("termMax")}</span><input max="360" min="1" name="term_max" type="number" /></label>
                <label className="field"><span>{t("pricing")}</span><input name="pricing" /></label>
                <label className="field"><span>{t("validUntil")}</span><input name="valid_until" type="date" /></label>
                <label className="field field--wide"><span>{t("exclusions")}</span><textarea maxLength={3000} name="exclusions" rows={3} /></label>
              </div>
              <StepActions continueLabel={t("continue")} locale={locale} />
            </form>
          ) : null}

          {currentStep === "contacts" ? (
            <form action={saveContactStep} className="onboarding-stage__form">
              <input name="locale" type="hidden" value={locale} />
              <div className="form-grid form-grid--onboarding">
                <label className="field"><span>{t("contactName")}</span><input defaultValue={text(contactAnswers.full_name)} name="contact_name" required /></label>
                <label className="field"><span>{t("contactTitle")}</span><input name="contact_title" /></label>
                <label className="field"><span>{t("contactEmail")}</span><input defaultValue={text(contactAnswers.email)} name="contact_email" required type="email" /></label>
                <label className="field"><span>{t("phone")}</span><input name="contact_phone" type="tel" /></label>
                <label className="field"><span>{t("routingSectors")}</span><input name="routing_sectors" placeholder={t("commaSeparated")} /></label>
                <label className="field"><span>{t("routingGeographies")}</span><input name="routing_geographies" placeholder={t("commaSeparated")} /></label>
                <label className="field"><span>{t("routingTicket")}</span><input name="routing_ticket" /></label>
                <label className="field"><span>{t("routingOperations")}</span><input name="routing_operations" placeholder={t("commaSeparated")} /></label>
              </div>
              <StepActions continueLabel={t("review")} locale={locale} />
            </form>
          ) : null}

          {currentStep === "review" ? (
            <form action={completeOnboarding} className="onboarding-stage__form">
              <input name="locale" type="hidden" value={locale} />
              <div className="onboarding-review">
                <article><span>01</span><div><strong>{organization.name}</strong><p>{organization.legal_name || t("notProvided")}</p></div><Check aria-hidden="true" size={17} /></article>
                {journey === "capital_provider" ? (
                  <>
                    <article><span>02</span><div><strong>{text(fundAnswers.name)}</strong><p>{text(fundAnswers.strategy)}</p></div><Check aria-hidden="true" size={17} /></article>
                    <article><span>03</span><div><strong>{t("mandateReady")}</strong><p>{t("mandateReviewBody")}</p></div><Check aria-hidden="true" size={17} /></article>
                    <article><span>04</span><div><strong>{text(contactAnswers.full_name)}</strong><p>{text(contactAnswers.email)}</p></div><Check aria-hidden="true" size={17} /></article>
                  </>
                ) : (
                  <>
                    <article><span>02</span><div><strong>{text(fundingAnswers.purpose_summary)}</strong><p>{text(fundingAnswers.currency)} {text(fundingAnswers.requested_amount)}</p></div><Check aria-hidden="true" size={17} /></article>
                    <article><span>03</span><div><strong>{t("documentsReady", {count: Number(answers.documents_uploaded ?? 0)})}</strong><p>{t("documentsReviewBody")}</p></div><Check aria-hidden="true" size={17} /></article>
                  </>
                )}
              </div>
              <div className="onboarding-submit-note"><strong>{t("reviewNoticeTitle")}</strong><p>{journey === "capital_provider" ? t("reviewNoticeProvider") : t("reviewNoticeOriginating")}</p></div>
              <div className="onboarding-actions">
                <button className="button button--ghost" formAction={previousOnboardingStep} formNoValidate><ArrowLeft aria-hidden="true" size={15} /></button>
                <button className="button" type="submit">{journey === "capital_provider" ? t("activateMandate") : t("submitOpportunity")}<ArrowRight aria-hidden="true" size={15} /></button>
              </div>
            </form>
          ) : null}
        </section>
      </div>
    </main>
  );
}
