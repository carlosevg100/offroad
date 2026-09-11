"use client";

import {offroadHouseTemplateDefinition, pdfRenderableFonts, presentationTemplateColorKeys, suggestedPdfFont} from "@offroad/case-export/presentation-template";
import {useTranslations} from "next-intl";
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
 * Choose and preview the visual identity a delivery is rendered with. The Offroad template is the
 * default and stays available; a client identity is recorded with an explicit PDF alternative for
 * any family this renderer cannot embed, because nothing is ever substituted silently.
 */
export function PresentationTemplateSettings({context, locale, projectId}: {context: PresentationTemplateContext; locale: "pt-BR" | "en-US"; projectId: string}) {
  const t = useTranslations("PresentationTemplate");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [scope, setScope] = useState<Scope>(context.project ? "project" : "organization");
  const stored = scope === "project" ? context.project : context.organization;
  const [values, setValues] = useState(() => initialValues(stored));
  const [error, setError] = useState<TemplateError | null>(null);
  const [saved, setSaved] = useState(false);

  const changeScope = (next: Scope) => {
    setScope(next);
    setValues(initialValues(next === "project" ? context.project : context.organization));
    setError(null); setSaved(false);
  };

  const run = (formData: FormData) => {
    setError(null); setSaved(false);
    startTransition(async () => {
      try {
        const result = await savePresentationTemplate(formData);
        if (!result.ok) setError(result.error);
        else {setSaved(true); router.refresh();}
      } catch {
        setError("save");
      }
    });
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    formData.set("intent", "store");
    run(formData);
  };

  const clear = (event: FormEvent<HTMLFormElement> | null) => {
    void event;
    const formData = new FormData();
    formData.set("locale", locale); formData.set("projectId", projectId);
    formData.set("scope", scope); formData.set("intent", "clear");
    for (const key of presentationTemplateColorKeys) formData.set(`color.${key}`, values.colors[key]);
    run(formData);
  };

  const displaySuggestion = suggestedPdfFont(values.fontDisplay);
  const bodySuggestion = suggestedPdfFont(values.fontBody);
  const effective = context.effective;

  return <section className={styles.template} data-testid="presentation-template-settings" data-scope={scope}>
    <p className={styles.current} data-testid="presentation-template-current">
      {effective
        ? t("currentClient", {name: effective.definition.templateKey, version: effective.definition.templateVersion, scope: t(`scope.${effective.scope}`)})
        : t("currentHouse")}
    </p>
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
        <div className={styles.actions}>
          <button type="submit" disabled={pending}>{t("save")}</button>
          <button type="button" disabled={pending || !stored} onClick={() => clear(null)}>{t("useHouse")}</button>
        </div>
        {saved && <p className={styles.saved} role="status">{t("saved")}</p>}
        {error && <p className={styles.error} role="alert">{t(`errors.${error}`)}</p>}
      </form>}
  </section>;
}
