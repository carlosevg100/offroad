"use client";

import {useRef, useState, useTransition, type FormEvent} from "react";
import {useLocale, useTranslations} from "next-intl";
import {useRouter} from "next/navigation";
import {normalizeDeclaredAssumptionValue} from "@offroad/financial-core";
import {openingKeys, premiseKeys, premiseUnits, type SetupDraft, type SetupPremise} from "@/lib/advisor/institutional-setup-form";
import type {InstitutionalSetupContext} from "@/lib/advisor/institutional-setup-reader";
import {submitInstitutionalSetup} from "@/app/[locale]/app/institutional-setup-actions";
import {institutionalSetupIssues} from "@/lib/advisor/institutional-issue-presentation";
import {InstitutionalIssues} from "./institutional-issues";
import styles from "./institutional-setup-form.module.css";

const historicalKeys = [...openingKeys, "baseRevenue", "taxLossCarryforward", "disallowedInterestCarryforward"] as const;
const decimalPattern = "-?[0-9]+([.,][0-9]+)?";
const scalar = (form: FormData, name: string) => String(form.get(name) ?? "").trim();
const amount = (form: FormData, name: string) => {
  const value = scalar(form, name);
  if (!new RegExp(`^${decimalPattern}$`).test(value)) throw new Error("missing numeric input");
  return value.replace(",", ".");
};

/** The form collects declarations, never invents absent historical balances or forecasts. */
export function InstitutionalSetupForm({context}: {context: InstitutionalSetupContext}) {
  const t = useTranslations("InstitutionalSetup");
  const locale = useLocale();
  const router = useRouter();
  const [baseYear, setBaseYear] = useState("");
  const [horizon, setHorizon] = useState("");
  const [selections, setSelections] = useState<Record<string, string>>({});
  const [capexMode, setCapexMode] = useState("");
  const [debtMode, setDebtMode] = useState("");
  const [capexCount, setCapexCount] = useState(1);
  const [debtCount, setDebtCount] = useState(1);
  const submission = useRef<{payload:string;id:string}|null>(null);
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<{kind: "error" | "success"; text: string} | null>(null);
  const periods = /^\d{4}$/.test(baseYear) && Number(horizon) >= 1 && Number(horizon) <= 40
    ? Array.from({length: Number(horizon)}, (_, i) => String(Number(baseYear) + i + 1)) : [];
  const selectedSourceIds = new Set(context.candidates.filter(f => Object.values(selections).includes(f.id)).map(f => f.source_document_id));
  const selectedSources = context.currentSources.filter(source => selectedSourceIds.has(source.sourceDocument));
  const premise = (form: FormData, prefix: string, label: string): SetupPremise => ({label: {pt: label, en: label}, rationale: scalar(form, `${prefix}.rationale`), values: Object.fromEntries(periods.map(year => [year, scalar(form, `${prefix}.${year}`)]))});

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = new FormData(event.currentTarget);
    setNotice(null);
    let draft: SetupDraft;
    try {
      if (!periods.length || !capexMode || !debtMode) throw new Error("incomplete scope");
      const debt: Array<SetupDraft["debt"][number]> = [];
      const debtRateLineage: Array<SetupDraft["debtRateLineage"][number]> = [];
      if (debtMode === "present") for (let i = 0; i < debtCount; i++) {
        const prefix = `debt.${i}`;
        const instrumentId = `instrument-${i + 1}`;
        debt.push({instrumentId, openingPrincipal: amount(form, `${prefix}.openingPrincipal`),
          indexer: scalar(form, `${prefix}.indexer`) as SetupDraft["debt"][number]["indexer"],
          indexationTreatment: scalar(form, `${prefix}.indexationTreatment`) as SetupDraft["debt"][number]["indexationTreatment"],
          couponTreatment: scalar(form, `${prefix}.couponTreatment`) as SetupDraft["debt"][number]["couponTreatment"],
          couponBase: scalar(form, `${prefix}.couponBase`) as SetupDraft["debt"][number]["couponBase"],
          periods: periods.map(period => ({period,
            indexationRate: normalizeDeclaredAssumptionValue(amount(form, `${prefix}.${period}.indexationRate`), "percent").value,
            couponRate: normalizeDeclaredAssumptionValue(amount(form, `${prefix}.${period}.couponRate`), "percent").value,
            drawdown: amount(form, `${prefix}.${period}.drawdown`), scheduledPrincipal: amount(form, `${prefix}.${period}.scheduledPrincipal`), prepayment: amount(form, `${prefix}.${period}.prepayment`),
          })),
        });
        for (const period of periods) debtRateLineage.push({instrumentId, period,
          indexationSourceId: scalar(form, `${prefix}.${period}.indexationSource`), indexationAsOfDate: scalar(form, `${prefix}.${period}.indexationDate`), indexationMethodology: scalar(form, `${prefix}.${period}.indexationRationale`),
          couponSourceId: scalar(form, `${prefix}.${period}.couponSource`), couponAsOfDate: scalar(form, `${prefix}.${period}.couponDate`), couponMethodology: scalar(form, `${prefix}.${period}.couponRationale`),
        });
      }
      draft = {currency: scalar(form, "currency"), asOfDate: scalar(form, "asOfDate"), baseYear, periods, selections,
        premises: Object.fromEntries(premiseKeys.map(key => [key, premise(form, `premise.${key}`, t(`premises.${key}`))])),
        noDebtRationale: scalar(form, "noDebtRationale"), noCapexRationale: scalar(form, "noCapexRationale"), debt, debtRateLineage,
        capex: capexMode === "present" ? Array.from({length: capexCount}, (_, i) => ({classification: scalar(form, `capex.${i}.classification`) as "maintenance" | "growth", usefulLifeYears: Number(scalar(form, `capex.${i}.life`)), depreciationConvention: scalar(form, `capex.${i}.convention`) as "next_period" | "half_year", premise: premise(form, `capex.${i}`, scalar(form, `capex.${i}.name`))})) : [],
      };
    } catch {setNotice({kind: "error", text: t("invalid")}); return;}
    const sourceReviews = selectedSources.map(source => ({sourceDocument: source.sourceDocument, version: source.version, hash: source.hash, amountScale: "units" as const,
      asOfDate: scalar(form, `source.${source.sourceDocument}.date`), currency: scalar(form, `source.${source.sourceDocument}.currency`),
      metadataEvidence: {locator: scalar(form, `source.${source.sourceDocument}.locator`), rationale: scalar(form, `source.${source.sourceDocument}.rationale`)},
    }));
    const payload = JSON.stringify({draft,sourceReviews,manifest:context.sourceManifestFingerprint});
    if (submission.current?.payload !== payload) submission.current = {payload,id:crypto.randomUUID()};
    const submissionId = submission.current.id;
    startTransition(async () => {
      try {
        const result = await submitInstitutionalSetup({locale, projectId: context.projectId, expectedManifestFingerprint: context.sourceManifestFingerprint, submissionId, draft, sourceReviews});
        if (!result.ok) {setNotice({kind: "error", text: t(result.error === "invalid" || result.error === "stale" ? result.error : "error")}); return;}
        setNotice({kind: "success", text: t("saved")});
        router.refresh();
      } catch {setNotice({kind: "error", text: t("error")});}
    });
  }
  const numberField = (name: string, label: string) => <label key={name}>{label}<input name={name} inputMode="decimal" pattern={decimalPattern} required maxLength={100} /></label>;
  const choice = (name: string, label: string, options: readonly {value: string; label: string}[]) => <label>{label}<select name={name} defaultValue="" required><option value="">{t("choose")}</option>{options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>;
  const annualPremise = (prefix: string, label: string, unit: string) => <div className={styles.premise} key={prefix}><h4>{label} <small>({unit})</small></h4><div className={styles.grid}>{periods.map(year => numberField(`${prefix}.${year}`, year))}</div><label>{t("rationale")}<textarea name={`${prefix}.rationale`} required maxLength={500} rows={2} /></label></div>;
  if (!context.candidates.length) return <section className={styles.form} data-testid="institutional-setup-form"><h2>{t("title")}</h2><p>{t("noFacts")}</p><InstitutionalIssues issues={institutionalSetupIssues(context.latestSubmission)} /></section>;
  return <form className={styles.form} data-testid="institutional-setup-form" onSubmit={submit} aria-busy={pending}>
    <header><h2>{t("title")}</h2><p>{t("intro")}</p><p>{t("boundary")}</p></header><InstitutionalIssues issues={institutionalSetupIssues(context.latestSubmission)} />
    <fieldset disabled={pending}><legend>{t("sources")}</legend>
      <div className={styles.grid}>
        <label>{t("asOfDate")}<input type="date" name="asOfDate" required /></label>
        <label>{t("currency")}<input name="currency" pattern="[A-Z]{3}" placeholder="BRL" required maxLength={3} /></label>
        <label>{t("baseYear")}<input name="baseYear" inputMode="numeric" pattern="[0-9]{4}" required value={baseYear} onChange={event => setBaseYear(event.target.value)} /></label>
        <label>{t("horizon")}<input name="horizon" type="number" min={1} max={40} required value={horizon} onChange={event => setHorizon(event.target.value)} /></label>
      </div><p>{t("unitsNotice")}</p>
    </fieldset>
    <fieldset disabled={pending}><legend>{t("history")}</legend><div className={styles.grid}>
      {historicalKeys.map(key => <label key={key}>{t(`historical.${key}`)}<select name={`history.${key}`} required value={selections[key] ?? ""} onChange={event => setSelections(current => ({...current, [key]: event.target.value}))}>
        <option value="">{t("choose")}</option>{context.candidates.map(fact => <option value={fact.id} key={fact.id}>{fact.label ? `${fact.label} · ` : ""}{String(fact.normalized_value)} {fact.currency ?? ""} · {fact.period_end} · {fact.entity_name} · {context.currentSources.find(source => source.sourceDocument === fact.source_document_id)?.originalName}</option>)}
      </select></label>)}
    </div>{selectedSources.map(source => <article key={source.sourceDocument} className={styles.source}><h3>{source.originalName}</h3><div className={styles.grid}>
      <label>{t("sourceDate")}<input type="date" name={`source.${source.sourceDocument}.date`} required /></label>
      <label>{t("currency")}<input name={`source.${source.sourceDocument}.currency`} pattern="[A-Z]{3}" maxLength={3} required /></label>
      <label>{t("locator")}<input name={`source.${source.sourceDocument}.locator`} maxLength={500} required /></label>
    </div><label>{t("sourceRationale")}<textarea name={`source.${source.sourceDocument}.rationale`} maxLength={500} required rows={2} /></label><p>{t("unitsNotice")}</p></article>)}</fieldset>
    <fieldset disabled={pending || !periods.length}><legend>{t("forecast")}</legend>
      {premiseKeys.map(key => annualPremise(`premise.${key}`, t(`premises.${key}`), t(premiseUnits[key] === "currency" ? "currencyUnit" : premiseUnits[key])))}
    </fieldset>
    <fieldset disabled={pending || !periods.length}><legend>{t("financing")}</legend>
      <label>{t("capex")}<select required value={capexMode} onChange={event => setCapexMode(event.target.value)}><option value="">{t("choose")}</option><option value="none">{t("none")}</option><option value="present">{t("present")}</option></select></label>
      {capexMode === "none" ? <label>{t("absenceRationale")}<textarea name="noCapexRationale" required maxLength={500} /></label> : null}
      {capexMode === "present" ? <><div>{Array.from({length: capexCount}, (_, i) => <article className={styles.source} key={i}><h3>{t("capex")} {i + 1}</h3><label>{t("scenario")}<input name={`capex.${i}.name`} required maxLength={180} /></label><div className={styles.grid}>
        {choice(`capex.${i}.classification`, t("classification"), ["maintenance", "growth"].map(value => ({value, label: t(value as "maintenance" | "growth")})))}
        <label>{t("usefulLife")}<input name={`capex.${i}.life`} type="number" min={1} max={100} required /></label>
        {choice(`capex.${i}.convention`, t("depreciationConvention"), ["next_period", "half_year"].map(value => ({value, label: t(value as "next_period" | "half_year")})))}
      </div>{annualPremise(`capex.${i}`, t("value"), t("currencyUnit"))}</article>)}</div><div className={styles.actions}><button type="button" disabled={capexCount >= 100} onClick={() => setCapexCount(count => count + 1)}>{t("addCapex")}</button>{capexCount > 1 ? <button type="button" onClick={() => setCapexCount(count => count - 1)}>{t("remove")}</button> : null}</div></> : null}
      <label>{t("debt")}<select required value={debtMode} onChange={event => setDebtMode(event.target.value)}><option value="">{t("choose")}</option><option value="none">{t("none")}</option><option value="present">{t("present")}</option></select></label>
      {debtMode === "none" ? <label>{t("absenceRationale")}<textarea name="noDebtRationale" required maxLength={500} /></label> : null}
      {debtMode === "present" ? <><div>{Array.from({length: debtCount}, (_, i) => <article className={styles.source} key={i}><h3>{t("debt")} {i + 1}</h3><div className={styles.grid}>
        {numberField(`debt.${i}.openingPrincipal`, t("openingPrincipal"))}
        {choice(`debt.${i}.indexer`, t("indexer"), ["none", "IPCA", "CDI", "SOFR", "fixed", "other"].map(value => ({value, label: ["none", "fixed", "other"].includes(value) ? t(`indexers.${value}` as "indexers.none" | "indexers.fixed" | "indexers.other") : value})))}
        {choice(`debt.${i}.indexationTreatment`, t("indexationTreatment"), ["not_applicable", "cash_paid", "capitalized_principal"].map(value => ({value, label: t(value as "not_applicable" | "cash_paid" | "capitalized_principal")})))}
        {choice(`debt.${i}.couponTreatment`, t("couponTreatment"), ["cash_paid", "capitalized_principal"].map(value => ({value, label: t(value as "cash_paid" | "capitalized_principal")})))}
        {choice(`debt.${i}.couponBase`, t("couponBase"), ["opening_principal", "indexed_principal", "average_principal"].map(value => ({value, label: t(value as "opening_principal" | "indexed_principal" | "average_principal")})))}
      </div>{periods.map(year => <fieldset key={year}><legend>{year}</legend><div className={styles.grid}>{["indexationRate", "couponRate", "drawdown", "scheduledPrincipal", "prepayment"].map(key => numberField(`debt.${i}.${year}.${key}`, t(key as "indexationRate" | "couponRate" | "drawdown" | "scheduledPrincipal" | "prepayment")))}</div>{["indexation", "coupon"].map(rate => <div className={styles.grid} key={rate}>
        <label>{t(rate === "indexation" ? "indexationRate" : "couponRate")} · {t("rateSource")}<input name={`debt.${i}.${year}.${rate}Source`} required maxLength={500} /></label>
        <label>{t("sourceDate")}<input type="date" name={`debt.${i}.${year}.${rate}Date`} required /></label>
        <label>{t("rateRationale")}<input name={`debt.${i}.${year}.${rate}Rationale`} required maxLength={500} /></label>
      </div>)}</fieldset>)}</article>)}</div><div className={styles.actions}><button type="button" disabled={debtCount >= 100} onClick={() => setDebtCount(count => count + 1)}>{t("addDebt")}</button>{debtCount > 1 ? <button type="button" onClick={() => setDebtCount(count => count - 1)}>{t("remove")}</button> : null}</div></> : null}
    </fieldset>
    {notice ? <p role={notice.kind === "error" ? "alert" : "status"}>{notice.text}</p> : null}
    <button className={styles.submit} type="submit" disabled={pending || !periods.length}>{t(pending ? "pending" : "submit")}</button>
  </form>;
}
