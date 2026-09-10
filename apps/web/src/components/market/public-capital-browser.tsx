"use client";

import {useState} from "react";
import {useFormatter, useTranslations} from "next-intl";
import {filterPublicInstitutions, researchStructures, screenPublicInstitution, type PublicCapitalCatalog, type ResearchStructure} from "@/lib/market/public-capital-catalog";
import type {PublicCapitalRegistry} from "@/lib/market/public-capital-registry";
import {PublicCapitalRegistryBrowser} from "./public-capital-registry-browser";
import {PublicCapitalHistory} from "./public-capital-history";
import styles from "./public-capital-browser.module.css";

export function PublicCapitalBrowser({catalog, registry}: {catalog: PublicCapitalCatalog; registry: PublicCapitalRegistry}) {
  const t = useTranslations("PublicCapitalMarket");
  const format = useFormatter();
  const [view, setView] = useState<"profiles" | "registry" | "history">("profiles");
  const [query, setQuery] = useState("");
  const [role, setRole] = useState("");
  const [segment, setSegment] = useState("");
  const [structure, setStructure] = useState<ResearchStructure>("corporate");
  const rows = filterPublicInstitutions(catalog, {query, role, segment});
  const date = (value: string) => format.dateTime(new Date(`${value}T00:00:00Z`), {dateStyle: "medium", timeZone: "UTC"});
  const sources = new Map(catalog.sources.map(source => [source.id, source]));
  const sourceLinks = (ids: string[]) => ids.map(id => {
    const source = sources.get(id)!;
    return <a key={id} href={source.url} target="_blank" rel="noopener noreferrer">{source.publisher} · {date(source.accessedAt)}</a>;
  });
  return <main className={styles.page}>
    <header className={styles.header}><p>{t("kicker")}</p><h1>{t("title")}</h1><p>{t("intro")}</p></header>
    <section className={styles.coverage} aria-label={t("coverageTitle")}>
      <div><strong>{format.number(catalog.institutions.length)}</strong><span>{t("institutions")}</span></div>
      <div><strong>{date(catalog.asOf)}</strong><span>{t("snapshot")}</span></div>
      <p>{t("boundary")}</p>
    </section>
    <nav className={styles.tabs} aria-label={t("views.label")}>{(["profiles", "registry", "history"] as const).map(item => <button key={item} type="button" aria-pressed={view === item} onClick={() => setView(item)}>{t(`views.${item}`)}</button>)}</nav>
    {view === "registry" ? <PublicCapitalRegistryBrowser registry={registry} /> : view === "history" ? <PublicCapitalHistory catalog={catalog} /> : <>
    <div className={styles.filters}>
      <label>{t("search")}<input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder={t("searchPlaceholder")} /></label>
      <label>{t("role")}<select value={role} onChange={event => setRole(event.target.value)}><option value="">{t("allRoles")}</option>{[...new Set(catalog.institutions.flatMap(row => row.roles))].map(value => <option key={value} value={value}>{t(`roles.${value}`)}</option>)}</select></label>
      <label>{t("strategy")}<select value={segment} onChange={event => setSegment(event.target.value)}><option value="">{t("allStrategies")}</option>{catalog.segments.map(value => <option key={value.id} value={value.id}>{t(`segments.${value.id}`)}</option>)}</select></label>
    </div>
    <section className={styles.screen} aria-label={t("screenTitle")}><div><h2>{t("screenTitle")}</h2><p>{t("screenBody")}</p></div><label>{t("structure")}<select value={structure} onChange={event => setStructure(event.target.value as ResearchStructure)}>{researchStructures.map(value => <option key={value} value={value}>{t(`structures.${value}`)}</option>)}</select></label></section>
    <p aria-live="polite">{t("results", {count: rows.length})}</p>
    <div className={styles.grid}>{rows.map(row => {
      const screen = screenPublicInstitution(row, structure);
      return <article className={styles.card} key={row.id}>
        <header><p>{row.roles.map(value => t(`roles.${value}`)).join(" · ")}</p><h2>{row.name}</h2><span className={styles.badge} data-status={screen.status}>{t(`statuses.${screen.status}`)}</span></header>
        <p>{t(`rationales.${screen.status}`, {structure: t(`structures.${structure}`)})}</p>
        <div className={styles.tags}>{row.segmentIds.map(value => <span key={value}>{t(`segments.${value}`)}</span>)}</div>
        <details><summary>{t("evidence")}</summary>{row.claims.map((claim, index) => <div className={styles.evidence} key={index}><p>{claim.value}</p><small>{t("observed", {date: date(claim.observedAt)})}</small>{sourceLinks(claim.sourceIds)}</div>)}</details>
        <details><summary>{t("vehicles", {count: row.vehicles.length})}</summary><p>{t("vehicleBoundary")}</p>{row.vehicles.map(vehicle => <div className={styles.evidence} key={vehicle.name}><strong>{vehicle.name}</strong>{sourceLinks(vehicle.sourceIds)}</div>)}{!row.vehicles.length ? <p>{t("noVehicles")}</p> : null}</details>
        {catalog.pricingObservations.filter(item => item.institutionId === row.id).map((item, index) => <details key={index}><summary>{t("history.productPricing")}</summary><p>{t("history.advertisedFloor", {value: format.number(item.value, {maximumFractionDigits: 2})})}</p><p>{t("history.floorBoundary")}</p>{sourceLinks(item.sourceIds)}</details>)}
        {catalog.transactions.some(item => item.lenderIdentity === row.id) ? <button className={styles.historyLink} type="button" onClick={() => setView("history")}>{t("history.viewRelated")}</button> : null}
        <details><summary>{t("qualification")}</summary><ul>{screen.requiredChecks.map(check => <li key={check}>{t(`checks.${check}`)}</li>)}</ul><p>{t("unknowns")}</p></details>
      </article>;
    })}</div>
    {!rows.length ? <p role="status">{t("empty")}</p> : null}
    <footer className={styles.footer}>{t("footer")}</footer>
    </>}
  </main>;
}
