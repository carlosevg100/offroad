import {useFormatter, useTranslations} from "next-intl";
import type {PublicCapitalCatalog} from "@/lib/market/public-capital-catalog";
import styles from "./public-capital-browser.module.css";

export function PublicCapitalHistory({catalog}: {catalog: PublicCapitalCatalog}) {
  const t = useTranslations("PublicCapitalMarket");
  const format = useFormatter();
  const date = (value: string) => format.dateTime(new Date(`${value}T00:00:00Z`), {dateStyle: "medium", timeZone: "UTC"});
  return <section className={styles.registry}><h2>{t("history.title")}</h2><p>{t("history.boundary")}</p><div className={styles.grid}>{catalog.transactions.map(row => <article className={styles.card} key={row.id}>
    <header><p>{t(`history.${row.instrument}`)}</p><h3>{row.issuer} · {row.id}</h3></header>
    <p>{format.number(row.principalAmount, {style: "currency", currency: row.currency, maximumFractionDigits: 0})}</p>
    <p>{row.issueDate ? t("history.issue", {date: date(row.issueDate)}) : t("history.announcement", {period: row.announcementPeriod ?? ""})}{row.maturity ? ` · ${t("history.maturity", {date: date(row.maturity)})}` : ""}</p>
    <p>{row.pricing ? t("history.coupon", {index: row.pricing.index, spread: format.number(row.pricing.spreadPercentPerYear, {minimumFractionDigits: 2, maximumFractionDigits: 2})}) : t("history.noPricing")}</p>
    <p>{row.lenderIdentity ? t("history.lender", {name: catalog.institutions.find(item => item.id === row.lenderIdentity)!.name}) : t("history.noLender")}</p>
    <small>{t(`history.${row.status}`)}</small>
    {row.sourceIds.map(id => {const source = catalog.sources.find(item => item.id === id)!;return <p key={id}><a href={source.url} target="_blank" rel="noopener noreferrer">{source.publisher} · {date(source.accessedAt)}</a></p>;})}
  </article>)}</div></section>;
}
