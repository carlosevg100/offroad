"use client";

import {useState} from "react";
import {useLocale, useTranslations} from "next-intl";
import type {InstitutionalComparison, ComparisonMetric} from "@/lib/advisor/institutional-scenario-comparison";
import styles from "./institutional-model-result-work.module.css";

/** Presentation only: exact values were verified and calculated on the server. */
export function InstitutionalScenarioComparison({currentId, comparisons}: {currentId: string; comparisons: InstitutionalComparison[]}) {
  const t = useTranslations("InstitutionalScenarioComparison");
  const locale = useLocale();
  const [selectedId, select] = useState("");
  const current = comparisons.find(s => s.id === currentId);
  if (!current) return null;
  const references = comparisons.filter(s => s.id !== currentId);
  const selected = references.find(s => s.id === selectedId);
  const compatible = selected?.compatibilityKey === current.compatibilityKey;
  const value = (v: string | null) => v === null ? t("notComputable") : locale === "pt-BR" ? v.replace(".", ",") : v;
  const label = (s: InstitutionalComparison) => t("revision", {name: s.name, revision: s.revision});
  return <section className={styles.comparison} aria-label={t("title")}>
    <h3>{t("title")}</h3><p>{t("boundary")}</p>
    <label>{t("reference")}<select value={selectedId} onChange={event => select(event.target.value)} disabled={!references.length}>
      <option value="">{t(references.length ? "choose" : "empty")}</option>
      {references.map(s => <option key={s.id} value={s.id}>{label(s)}</option>)}
    </select></label>
    {selected && !compatible ? <p role="alert">{t("incompatible")}</p> : null}
    {selected && compatible ? <>
      <p role="status">{t("units", {currency: current.currency, asOfDate: current.asOfDate})}</p>
      <div className={styles.comparisonScroll} tabIndex={0} role="region" aria-label={t("table")}>
        <table><caption>{t("table")}</caption><thead><tr><th scope="col">{t("metric")}</th><th scope="col">{t("period")}</th><th scope="col">{t("current")} · {label(current)}</th><th scope="col">{t("previous")} · {label(selected)}</th></tr></thead>
          <tbody>{current.periods.flatMap((period, index) => (Object.keys(period.values) as ComparisonMetric[]).map(metric => <tr key={`${period.period}:${metric}`}>
            <th scope="row">{t(`metrics.${metric}`)}</th><td>{period.period}</td><td>{value(period.values[metric])}</td><td>{value(selected.periods[index]!.values[metric])}</td>
          </tr>))}</tbody></table>
      </div>
      <div className={styles.comparisonEvidence}>{[current, selected].map(s => <details key={s.id}><summary>{t("evidence")} · {label(s)}</summary>
        <p>{t("reviewed", {date: s.reviewedAt})}</p>
        <ul>{s.sources.map((source, i) => <li key={i}>{source.document} · {t("sourceVersion", {version: source.version, date: source.asOfDate})}</li>)}</ul>
        <h4>{t("assumptions")}</h4><dl>{s.assumptions.map(a => <div key={a.id}><dt>{a.label[locale === "pt-BR" ? "pt" : "en"]}</dt><dd>{Object.entries(a.values).map(([period, amount]) => `${period}: ${value(amount)}`).join(" · ")} ({t(`assumptionUnits.${a.unit}`)})<p>{a.rationale}</p></dd></div>)}</dl>
      </details>)}</div>
    </> : null}
  </section>;
}
