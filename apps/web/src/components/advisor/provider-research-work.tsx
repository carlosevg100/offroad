"use client";

import Link from "next/link";
import {useState} from "react";
import {useFormatter, useTranslations} from "next-intl";
import type {ProviderResearchArtifact} from "@offroad/work-plan";
import styles from "./provider-research-work.module.css";

/** An inspectable snapshot of authorized records, with no selection or disclosure actions. */
export function ProviderResearchWork({research}: {research: ProviderResearchArtifact}) {
  const t = useTranslations("ProviderResearchWork");
  const format = useFormatter();
  const [query, setQuery] = useState("");
  const normalized = query.trim().toLocaleLowerCase(research.locale);
  const providers = research.providers.filter(provider => !normalized ||
    [provider.name, ...provider.observations.flatMap(item => [item.criterion, item.value])].some(text => text.toLocaleLowerCase(research.locale).includes(normalized)));
  return <section className={styles.research} data-testid="provider-research-work">
    <header><span>{t("kicker")}</span><h2>{t("title")}</h2><p>{t("description")}</p>
      <small>{t("asOf", {date: format.dateTime(new Date(research.asOf), {dateStyle: "medium", timeZone: "UTC"})})}</small></header>
    <p><Link href={`/${research.locale}/app/market`}>{t("publicCatalog")}</Link></p>
    <div className={styles.coverage}><strong>{t("coverage", {count: research.providers.length})}</strong><p>{t("coverageBoundary")}</p></div>
    {research.providers.length ? <label className={styles.search}><span>{t("search")}</span><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder={t("searchPlaceholder")} /></label> : null}
    {providers.length ? <div className={styles.providers}>{providers.map(provider => <article key={`${provider.sourceClass}-${provider.providerId}`}>
      <header><h3>{provider.name}</h3><span>{t(`sourceClass.${provider.sourceClass}`)}</span></header>
      <dl>{provider.observations.map((observation, index) => <div key={index}><dt>{observation.criterion}</dt><dd>{observation.value}<small>{observation.provenance} · {observation.observedAt ? t("observedAt", {date: format.dateTime(new Date(observation.observedAt), {dateStyle: "medium", timeZone: "UTC"})}) : t("dateUnknown")}</small></dd></div>)}</dl>
      {provider.gaps.length ? <details><summary>{t("gaps", {count: provider.gaps.length})}</summary><ul>{provider.gaps.map((gap, index) => <li key={index}>{gap}</li>)}</ul></details> : null}
    </article>)}</div> : <p role="status" className={styles.empty}>{t(research.providers.length ? "noSearchResults" : "empty")}</p>}
    <footer><h3>{t("limitations")}</h3><ul>{research.limitations.map((limitation, index) => <li key={index}>{limitation}</li>)}</ul><p>{t("boundary")}</p></footer>
  </section>;
}
