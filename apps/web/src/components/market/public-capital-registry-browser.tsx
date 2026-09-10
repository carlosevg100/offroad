"use client";
import {useState} from "react";
import {useFormatter, useTranslations} from "next-intl";
import {searchPublicCapitalRegistry, type PublicCapitalRegistry} from "@/lib/market/public-capital-registry";
import styles from "./public-capital-browser.module.css";

export function PublicCapitalRegistryBrowser({registry}: {registry: PublicCapitalRegistry}) {
  const t = useTranslations("PublicCapitalMarket");
  const format = useFormatter();
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<"all" | "cvm_manager" | "bcb_root">("all");
  const [page, setPage] = useState(0);
  const result = searchPublicCapitalRegistry(registry, query, kind, page);
  return <section className={styles.registry}>
    <h2>{t("registry.title")}</h2><p>{t("registry.boundary")}</p>
    <p>{t("registry.counts", {managers: registry.records.filter(row => row.kind === "cvm_manager").length, banks: registry.records.filter(row => row.kind === "bcb_root").length})}</p>
    <p>{t("registry.snapshot", {date: format.dateTime(new Date(registry.generatedAt), {dateStyle: "medium", timeZone: "UTC"})})}</p>
    <div className={styles.filters}><label>{t("registry.search")}<input type="search" value={query} onChange={event => {setQuery(event.target.value); setPage(0);}} /></label><label>{t("registry.source")}<select value={kind} onChange={event => {setKind(event.target.value as typeof kind); setPage(0);}}><option value="all">{t("registry.all")}</option><option value="cvm_manager">{t("registry.cvm_manager")}</option><option value="bcb_root">{t("registry.bcb_root")}</option></select></label></div>
    <p aria-live="polite">{t("registry.results", {count: result.total})}</p>
    <div className={styles.grid}>{result.rows.map(row => {
      const source = registry.sources.find(item => item.id === row.sourceId)!;
      return <article className={styles.card} key={row.id}><header><p>{t(`registry.${row.kind}`)}</p><h3>{row.name}</h3></header><p>{t(row.kind === "cvm_manager" ? "registry.cnpj" : "registry.root", {id: row.identity})}</p><p>{row.kind === "cvm_manager" ? t("registry.candidateFunds", {count: row.activeCandidateFunds}) : row.segment ?? t(`registry.${row.collection}`)}</p><small>{t("registry.noMandate")}</small><p><a href={source.url} target="_blank" rel="noopener noreferrer">{t("registry.evidence", {date: format.dateTime(new Date(source.downloadedAt), {dateStyle: "medium", timeZone: "UTC"})})}</a></p></article>;
    })}</div>
    <div className={styles.pagination}><button type="button" disabled={result.page === 0} onClick={() => setPage(result.page - 1)}>{t("registry.previous")}</button><span>{t("registry.page", {current: result.pages ? result.page + 1 : 0, total: result.pages})}</span><button type="button" disabled={result.page + 1 >= result.pages} onClick={() => setPage(result.page + 1)}>{t("registry.next")}</button></div>
    <small>{t("registry.license")}</small>
  </section>;
}
