import {Check, Eye, EyeOff, ShieldCheck} from "lucide-react";
import {getTranslations} from "next-intl/server";
import Link from "next/link";

import {IntakeActionSubmit} from "@/components/intake/intake-action-submit";
import type {Json} from "@/types/database";

type LegalSection = {heading: string; body: string};

type Props = {
  locale: string;
  mode: "terms" | "project";
  journey: "company" | "originator";
  legalDocument?: {
    title: string;
    version: string;
    rendered_text: string;
    body_sections: Json;
    acceptance_statement: string;
    information_rights_statement: string;
  } | null;
  profile: {
    fullName: string;
    jobTitle: string;
  };
  project?: {
    name: string;
    identityPolicy: string;
  };
  acceptAction: (formData: FormData) => Promise<void>;
  startAction: (formData: FormData) => Promise<void>;
  termsAccepted?: boolean;
  termsHref: string;
  returnHref: string;
};

function legalSections(value: Json | undefined): LegalSection[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((section) => {
    if (!section || typeof section !== "object" || Array.isArray(section)) return [];
    const heading = typeof section.heading === "string" ? section.heading : "";
    const body = typeof section.body === "string" ? section.body : "";
    return heading && body ? [{heading, body}] : [];
  });
}

export async function PrivateProjectSetup({
  locale,
  mode,
  journey,
  legalDocument,
  profile,
  project,
  acceptAction,
  startAction,
  termsAccepted = false,
  termsHref,
  returnHref,
}: Props) {
  const t = await getTranslations({locale, namespace: "Onboarding.privateProject"});

  if (mode === "terms") {
    const sections = legalSections(legalDocument?.body_sections);
    return (
      <section className="private-project-gate private-project-gate--terms">
        <header className="private-project-gate__header private-project-gate__legal-header">
          <span className="section-kicker">{t("terms.kicker")}</span>
          <h2>{t("terms.title")}</h2>
          <p>{t("terms.intro")}</p>
        </header>

        <div className="private-project-gate__promise">
          {sections.map((section, index) => (
            <article key={section.heading}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <div><h3>{section.heading}</h3><p>{section.body}</p></div>
            </article>
          ))}
        </div>

        <aside className="private-project-gate__boundary">
          <ShieldCheck aria-hidden="true" size={17} />
          <p><strong>{t("terms.boundaryTitle")}</strong>{t("terms.boundaryBody")}</p>
        </aside>

        {termsAccepted ? (
          <div className="private-project-gate__accepted">
            <div><Check aria-hidden="true" size={15} /><span><strong>{t("terms.acceptedTitle")}</strong>{t("terms.acceptedBody")}</span></div>
            <details className="private-project-gate__full-terms">
              <summary>{t("terms.fullTerms")}</summary>
              <p>{legalDocument?.rendered_text ?? t("terms.fullTermsFallback")}</p>
            </details>
            <div className="private-project-gate__submit">
              <Link className="button" href={returnHref}>{t("terms.returnCta")}</Link>
            </div>
          </div>
        ) : <form action={acceptAction} className="private-project-gate__form">
          <input name="locale" type="hidden" value={locale} />
          <details className="private-project-gate__full-terms">
            <summary>{t("terms.fullTerms")}</summary>
            <p>{legalDocument?.rendered_text ?? t("terms.fullTermsFallback")}</p>
          </details>
          <div className="private-project-gate__signatory-fields">
            <label>
              <span>{t("terms.name")}</span>
              <input defaultValue={profile.fullName} maxLength={160} minLength={2} name="signatory_name" required />
            </label>
            <label>
              <span>{t("terms.titleLabel")}</span>
              <input defaultValue={profile.jobTitle} maxLength={160} minLength={2} name="signatory_title" required />
            </label>
          </div>
          <label className="private-project-gate__check">
            <input name="terms_agreed" required type="checkbox" value="confirmed" />
            <span>{legalDocument?.acceptance_statement ?? t("terms.declaration")}</span>
          </label>
          <label className="private-project-gate__check">
            <input name="information_rights_declared" required type="checkbox" value="confirmed" />
            <span>{legalDocument?.information_rights_statement ?? t("terms.informationRightsDeclaration")}</span>
          </label>
          <div className="private-project-gate__submit">
            <small>{t("terms.ctaNote")}</small>
            <IntakeActionSubmit idle={t("terms.cta")} pending={t("terms.pending")} />
          </div>
        </form>}
      </section>
    );
  }

  const editingExistingProject = Boolean(project?.name.trim());

  return <PrivateProjectForm
    action={startAction}
    backHref={termsHref}
    editingExistingProject={editingExistingProject}
    journey={journey}
    locale={locale}
    project={project}
  />;
}

/** Shared project identity gate used by the first onboarding and every later financing. */
export async function PrivateProjectForm({
  action,
  backHref,
  editingExistingProject = false,
  journey,
  locale,
  project,
}: {
  action: (formData: FormData) => Promise<void>;
  backHref: string;
  editingExistingProject?: boolean;
  journey: "company" | "originator";
  locale: string;
  project?: {name: string; identityPolicy: string};
}) {
  const t = await getTranslations({locale, namespace: "Onboarding.privateProject"});
  const representationCopy = journey === "originator"
    ? {title: t("project.advisorDeclarationTitle"), body: t("project.advisorDeclarationBody")}
    : {title: t("project.companyDeclarationTitle"), body: t("project.companyDeclarationBody")};

  return (
    <section className="private-project-gate private-project-gate--project">
      <Link className="intake-guide__back" href={backHref}>{t(editingExistingProject ? "project.back" : "project.backToWorkspace")}</Link>
      <header className="private-project-gate__header">
        <span className="section-kicker">{t("project.kicker")}</span>
        <h2>{t("project.title")}</h2>
        <p>{t("project.intro")}</p>
      </header>

      <form action={action} className="private-project-gate__form">
        <input name="locale" type="hidden" value={locale} />
        <label className="field private-project-gate__project-name">
          <span>{t("project.name")}</span>
          <input autoComplete="off" defaultValue={project?.name} maxLength={80} minLength={2} name="project_name" placeholder={t("project.namePlaceholder")} required />
          <small>{t("project.nameHelp")}</small>
        </label>

        <fieldset className="private-project-gate__identity">
          <legend>{t("project.identityLegend")}</legend>
          <p>{t("project.identityIntro")}</p>
          <label className="private-project-gate__option is-recommended">
            <input defaultChecked={project?.identityPolicy !== "blind_initial"} name="identity_policy" type="radio" value="identified_restricted" />
            <span className="private-project-gate__option-icon"><Eye aria-hidden="true" size={18} /></span>
            <span><strong>{t("project.identifiedTitle")}</strong><small>{t("project.recommended")}</small><p>{t("project.identifiedBody")}</p></span>
          </label>
          <label className="private-project-gate__option">
            <input defaultChecked={project?.identityPolicy === "blind_initial"} name="identity_policy" type="radio" value="blind_initial" />
            <span className="private-project-gate__option-icon"><EyeOff aria-hidden="true" size={18} /></span>
            <span><strong>{t("project.blindTitle")}</strong><p>{t("project.blindBody")}</p></span>
          </label>
          <aside><ShieldCheck aria-hidden="true" size={17} /><p>{t("project.identityControl")}</p></aside>
        </fieldset>

        {editingExistingProject ? <input name="representation_declared" type="hidden" value="confirmed" /> : (
          <label className="private-project-gate__check">
            <input name="representation_declared" required type="checkbox" value="confirmed" />
            <span><strong>{representationCopy.title}</strong>{representationCopy.body}</span>
          </label>
        )}

        <div className="private-project-gate__submit">
          <IntakeActionSubmit idle={t("project.cta")} pending={t("project.pending")} />
          <small>{t("project.ctaNote")}</small>
        </div>
      </form>
    </section>
  );
}
