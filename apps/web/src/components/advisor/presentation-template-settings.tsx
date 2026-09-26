"use client";

import {moveStructureSection, presentationAudiences, type PresentationAudience, type PresentationStructure} from "@offroad/case-export/presentation-structure";
import {offroadHouseTemplateDefinition, pdfRenderableFonts, presentationTemplateColorKeys, suggestedPdfFont} from "@offroad/case-export/presentation-template";
import {useFormatter, useTranslations} from "next-intl";
import {useRouter} from "next/navigation";
import {useState, useTransition, type FormEvent} from "react";

import {savePresentationTemplate, type PresentationTemplateResult} from "@/app/[locale]/app/projects/[projectId]/presentation-template-actions";
import type {PresentationTemplateContext, StoredPresentationTemplate} from "@/lib/advisor/presentation-template";

import styles from "./presentation-template-settings.module.css";

type Scope = "organization" | "project";
type TemplateError = Extract<PresentationTemplateResult, {ok: false}>["error"];

function initialValues(stored: StoredPresentationTemplate | null) {
  const definition = stored?.definition ?? offroadHouseTemplateDefinition;
  return {
    templateKey: stored ? definition.templateKey : "",
    templateVersion: stored ? definition.templateVersion : "2026.09.11-v1",
    colors: {...definition.colors},
    fontDisplay: stored ? definition.fonts.display : "",
    fontBody: stored ? definition.fonts.body : "",
    pdfDisplay: definition.fonts.pdfDisplay,
    pdfBody: definition.fonts.pdfBody,
    confidentialityLabel: definition.confidentialityLabel ?? "",
  };
}

/**
 * Choose and preview the visual identity a delivery is rendered with, and the semantic structure
 * of the presentations: the order of the sections, which fields are required and who each section
 * is for. Every save is a new immutable version; the previous versions stay listed. The Offroad
 * template is the default and stays available; a client identity is recorded with an explicit PDF
 * alternative for any family this renderer cannot embed, because nothing is ever substituted silently.
 */
export function PresentationTemplateSettings({context, locale, projectId}: {context: PresentationTemplateContext; locale: "pt-BR" | "en-US"; projectId: string}) {
  const t = useTranslations("PresentationTemplate");
  const format = useFormatter();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [scope, setScope] = useState<Scope>(context.project ? "project" : "organization");
  const stored = scope === "project" ? context.project : context.organization;
  const [values, setValues] = useState(() => initialValues(stored));
  const [structure, setStructure] = useState<PresentationStructure>(() => stored?.structure ?? context.houseStructure);
  const [error, setError] = useState<TemplateError | null>(null);
  const [savedVersion, setSavedVersion] = useState<number | null>(null);

  const changeScope = (next: Scope) => {
    const target = next === "project" ? context.project : context.organization;
    setScope(next);
    setValues(initialValues(target));
    setStructure(target?.structure ?? context.houseStructure);
    setError(null); setSavedVersion(null);
  };

  const run = (formData: FormData) => {
    setError(null); setSavedVersion(null);
    startTransition(async () => {
      try {
        const result = await savePresentationTemplate(formData);
        if (!result.ok) setError(result.error);
        else {setSavedVersion(result.status === "stored" ? result.versionNo : null); router.refresh();}
      } catch {
        setError("save");
      }
    });
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    formData.set("intent", "store");
    formData.set("structure", JSON.stringify(structure));
    run(formData);
  };

  const clear = () => {
    const formData = new FormData();
    formData.set("locale", locale); formData.set("projectId", projectId);
    formData.set("scope", scope); formData.set("intent", "clear");
    for (const key of presentationTemplateColorKeys) formData.set(`color.${key}`, values.colors[key]);
    run(formData);
  };

  const toggleAudience = (sectionKey: string, audience: PresentationAudience) => {
    setStructure((current) => ({...current, sections: current.sections.map((section) => {
      if (section.key !== sectionKey) return section;
      const present = section.audiences.includes(audience);
      if (present && section.audiences.length === 1) return section;
      return {...section, audiences: present ? section.audiences.filter((item) => item !== audience) : [...section.audiences, audience]};
    })}));
  };
  const toggleRequired = (sectionKey: string, fieldKey: string) => {
    setStructure((current) => ({...current, sections: current.sections.map((section) => section.key !== sectionKey ? section
      : {...section, fields: section.fields.map((field) => field.key === fieldKey ? {...field, required: !field.required} : field)})}));
  };

  const displaySuggestion = suggestedPdfFont(values.fontDisplay);
  const bodySuggestion = suggestedPdfFont(values.fontBody);
  const effective = context.effective;
  const date = (iso: string) => format.dateTime(new Date(iso), {dateStyle: "medium"});
  const previousVersions = stored?.versions.filter((version) => !version.isCurrent) ?? [];

  return <section className={styles.template} data-testid="presentation-template-settings" data-scope={scope}>
    <p className={styles.current} data-testid="presentation-template-current">
      {effective
        ? t("currentClient", {name: effective.definition.templateKey, version: effective.definition.templateVersion, scope: t(`scope.${effective.scope}`)})
        : t("currentHouse")}
    </p>
    {effective && <p className={styles.muted} data-testid="presentation-template-version" data-version={effective.versionNo}>
      {t("version", {number: effective.versionNo, date: date(effective.versionCreatedAt)})}
    </p>}
    {effective && <p className={styles.muted}>{t("fingerprint", {fingerprint: effective.fingerprint.slice(0, 12)})}</p>}
    <p className={styles.muted}>{t("intro")}</p>

    <div className={styles.preview} style={{background: `#${values.colors.paper}`, color: `#${values.colors.ink}`, borderColor: `#${values.colors.muted}`}} aria-label={t("preview")}>
      <span className={styles.previewMark} style={{color: `#${values.colors.accent}`, fontFamily: `${values.fontDisplay || offroadHouseTemplateDefinition.fonts.display}, serif`}}>
        {values.confidentialityLabel || t("previewMark")}
      </span>
      <strong style={{fontFamily: `${values.fontDisplay || offroadHouseTemplateDefinition.fonts.display}, serif`}}>{t("previewTitle")}</strong>
      <span style={{fontFamily: `${values.fontBody || offroadHouseTemplateDefinition.fonts.body}, sans-serif`}}>{t("previewBody")}</span>
      <span className={styles.previewSwatches}>
        {presentationTemplateColorKeys.map(key => <i key={key} style={{background: `#${values.colors[key]}`}} title={t(`colors.${key}`)} />)}
      </span>
    </div>

    {!context.canManage
      ? <p className={styles.muted} data-testid="presentation-template-readonly">{t("readOnly")}</p>
      : <form className={styles.form} onSubmit={submit}>
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="projectId" value={projectId} />
        <input type="hidden" name="intent" value="store" />
        <fieldset className={styles.scope}>
          <legend>{t("scopeLegend")}</legend>
          {(["organization", "project"] as const).map(option => <label key={option}>
            <input type="radio" name="scope" value={option} checked={scope === option} onChange={() => changeScope(option)} />
            {t(`scope.${option}`)}
          </label>)}
        </fieldset>
        <div className={styles.grid}>
          <label>{t("templateKey")}<input name="templateKey" required value={values.templateKey} pattern="[a-z0-9][a-z0-9-]{1,46}[a-z0-9]"
            onChange={event => setValues({...values, templateKey: event.target.value})} /></label>
          <label>{t("templateVersion")}<input name="templateVersion" required value={values.templateVersion} pattern="\d{4}\.\d{2}\.\d{2}-v\d{1,3}"
            onChange={event => setValues({...values, templateVersion: event.target.value})} /></label>
          <label>{t("fontDisplay")}<input name="fontDisplay" required value={values.fontDisplay}
            onChange={event => setValues({...values, fontDisplay: event.target.value})} /></label>
          <label>{t("fontBody")}<input name="fontBody" required value={values.fontBody}
            onChange={event => setValues({...values, fontBody: event.target.value})} /></label>
          <label>{t("pdfDisplay")}<select name="pdfDisplay" value={values.pdfDisplay} onChange={event => setValues({...values, pdfDisplay: event.target.value as typeof values.pdfDisplay})}>
            {pdfRenderableFonts.map(font => <option key={font} value={font}>{font}</option>)}
          </select></label>
          <label>{t("pdfBody")}<select name="pdfBody" value={values.pdfBody} onChange={event => setValues({...values, pdfBody: event.target.value as typeof values.pdfBody})}>
            {pdfRenderableFonts.map(font => <option key={font} value={font}>{font}</option>)}
          </select></label>
          <label>{t("confidentialityLabel")}<input name="confidentialityLabel" maxLength={80} value={values.confidentialityLabel}
            onChange={event => setValues({...values, confidentialityLabel: event.target.value})} /></label>
          <label>{t("logo")}<input name="logo" type="file" accept="image/png,image/jpeg" /></label>
        </div>
        <p className={styles.muted} data-testid="presentation-template-font-note">
          {displaySuggestion && bodySuggestion
            ? t("fontSuggested", {display: displaySuggestion, body: bodySuggestion})
            : t("fontChoiceRequired")}
        </p>
        <fieldset className={styles.colors}>
          <legend>{t("colorsLegend")}</legend>
          {presentationTemplateColorKeys.map(key => <label key={key}>{t(`colors.${key}`)}
            <input name={`color.${key}`} required value={values.colors[key]} pattern="#?[0-9A-Fa-f]{6}"
              onChange={event => setValues({...values, colors: {...values.colors, [key]: event.target.value.replace(/^#/, "").toUpperCase()}})} />
          </label>)}
        </fieldset>
        {stored?.definition.logo && <label className={styles.removeLogo}><input type="checkbox" name="removeLogo" />{t("removeLogo")}</label>}

        <fieldset className={styles.structure} data-testid="presentation-template-structure">
          <legend>{t("structureLegend")}</legend>
          <p className={styles.muted}>{t("structureIntro")}</p>
          <ol className={styles.sections}>
            {structure.sections.map((section, index) => <li key={section.key} className={styles.section} data-section-key={section.key}>
              <div className={styles.sectionHeader}>
                <span className={styles.sectionTitle}>{section.title[locale]}</span>
                <span className={styles.sectionMoves}>
                  <button type="button" disabled={pending || index === 0} aria-label={t("moveUp", {title: section.title[locale]})}
                    onClick={() => setStructure((current) => moveStructureSection(current, section.key, "up"))}>↑</button>
                  <button type="button" disabled={pending || index === structure.sections.length - 1} aria-label={t("moveDown", {title: section.title[locale]})}
                    onClick={() => setStructure((current) => moveStructureSection(current, section.key, "down"))}>↓</button>
                </span>
              </div>
              <div className={styles.audiences} role="group" aria-label={t("audiencesLegend")}>
                {presentationAudiences.map((audience) => <label key={audience}>
                  <input type="checkbox" checked={section.audiences.includes(audience)}
                    disabled={pending || (section.audiences.includes(audience) && section.audiences.length === 1)}
                    onChange={() => toggleAudience(section.key, audience)} />
                  {t(`audience.${audience}`)}
                </label>)}
              </div>
              <ul className={styles.fields}>
                {section.fields.map((field) => <li key={field.key}>
                  <label>
                    <input type="checkbox" checked={field.required} disabled={pending} onChange={() => toggleRequired(section.key, field.key)}
                      data-testid={`presentation-template-required-${section.key}-${field.key}`} />
                    <span>{field.title[locale]}</span>
                    <span className={styles.kind}>{t(`kinds.${field.kind}`)}</span>
                    <span className={styles.required}>{t("fieldRequired")}</span>
                  </label>
                </li>)}
              </ul>
            </li>)}
          </ol>
        </fieldset>

        <div className={styles.actions}>
          <button type="submit" disabled={pending}>{t("save")}</button>
          <button type="button" disabled={pending || !stored} onClick={clear}>{t("useHouse")}</button>
        </div>
        {savedVersion !== null && <p className={styles.saved} role="status" data-testid="presentation-template-saved" data-version={savedVersion}>{t("savedVersion", {number: savedVersion})}</p>}
        {error && <p className={styles.error} role="alert">{t(`errors.${error}`)}</p>}
      </form>}

    {stored && <section className={styles.history} data-testid="presentation-template-history" aria-label={t("versionHistoryTitle")}>
      <h3>{t("versionHistoryTitle")}</h3>
      {previousVersions.length === 0
        ? <p className={styles.muted}>{t("noPreviousVersions")}</p>
        : <ul>{previousVersions.map((version) => <li key={version.versionId} data-version={version.versionNo}>
          {t("versionEntry", {number: version.versionNo, date: date(version.createdAt), author: version.authorName ?? t("authorUnknown")})}
        </li>)}</ul>}
    </section>}
  </section>;
}
