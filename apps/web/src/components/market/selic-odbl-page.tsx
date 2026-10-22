import Link from "next/link";
import {notFound} from "next/navigation";
import {getTranslations} from "next-intl/server";

import {PublicShell} from "@/components/public-site";
import type {AppLocale} from "@/i18n/routing";
import {odblPayloadSchema, readOdblRelease} from "@/lib/market/odbl-release";
import {dataFiles} from "@/lib/website-routes";

import styles from "./selic-odbl-page.module.css";

const decisions = new Set(["raise", "cut", "hold"]);

/** The public page of the ODbL edition. Without a served edition there is no page (HTTP 404). */
export async function SelicOdblPage({locale}: {locale: AppLocale}) {
  const release = await readOdblRelease();
  if (release.state !== "served") notFound();
  const payload = odblPayloadSchema.parse(JSON.parse(release.payload));
  const t = await getTranslations({locale, namespace: "MarketData"});
  const date = new Intl.DateTimeFormat(locale, {dateStyle: "long", timeZone: "UTC"});
  const instant = new Intl.DateTimeFormat(locale, {dateStyle: "long", timeStyle: "short", timeZone: "America/Sao_Paulo"});
  const percent = new Intl.NumberFormat(locale, {minimumFractionDigits: 2, maximumFractionDigits: 2});
  const day = (iso: string) => date.format(new Date(`${iso}T00:00:00Z`));
  const rate = (value: string) => `${percent.format(Number(value))}%`;
  return <PublicShell locale={locale} page="selicTarget">
    <article className={styles.page}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>{t("eyebrow")}</p>
        <h1>{t("title")}</h1>
        <p className={styles.intro}>{t("intro")}</p>
        <a className={styles.download} href={dataFiles.selicTarget} download>{t("download")}</a>
      </header>
      <dl className={styles.facts}>
        <div><dt>{t("facts.release")}</dt><dd>{payload.release}</dd></div>
        <div><dt>{t("facts.dataBase")}</dt><dd>{day(payload.reading.dataBase)}</dd></div>
        <div><dt>{t("facts.publishedAt")}</dt><dd>{instant.format(new Date(payload.publishedAt))}</dd></div>
        <div><dt>{t("facts.window")}</dt><dd>{t("facts.windowValue", {start: day(payload.reading.window.start), end: day(payload.reading.window.end)})}</dd></div>
        <div><dt>{t("facts.observations")}</dt><dd>{new Intl.NumberFormat(locale).format(payload.observations.length)}</dd></div>
        <div className={styles.digest}><dt>{t("facts.sha256")}</dt><dd><code>{release.sha256}</code></dd></div>
      </dl>
      <section className={styles.section}>
        <h2>{t("changes.title")}</h2>
        {payload.changes.length === 0 ? <p>{t("changes.none")}</p> : <div className={styles.tableWrap}><table>
          <thead><tr><th scope="col">{t("changes.period")}</th><th scope="col">{t("changes.from")}</th><th scope="col">{t("changes.to")}</th>
            <th scope="col">{t("changes.meeting")}</th><th scope="col">{t("changes.decision")}</th></tr></thead>
          <tbody>{payload.changes.map((c) => <tr key={c.period}>
            <td>{day(c.period)}</td><td>{rate(c.from)}</td><td>{rate(c.to)}</td>
            <td>{t("changes.meetingValue", {meeting: c.meeting, date: day(c.referenceDate)})}</td>
            <td>{t(`decision.${decisions.has(c.decision) ? c.decision : "unknown"}`)}</td>
          </tr>)}</tbody>
        </table></div>}
      </section>
      <section className={styles.section}>
        <h2>{t("license.title")}</h2>
        <p>{payload.attribution}</p>
        <p>{t("license.body")}</p>
        <p><a href={payload.license.uri} rel="license noopener" target="_blank">{t("license.link")}</a></p>
        <p>{t("license.source")}: {payload.source.name}</p>
      </section>
      <section className={styles.section}>
        <h2>{t("rules.title")}</h2>
        <p>{t("rules.body")}</p>
        <ul className={styles.links}>
          <li><Link href={payload.rules.parserAndRules}>{t("rules.parser")}</Link></li>
          <li><Link href={payload.rules.vectors}>{t("rules.vectors")}</Link></li>
          <li><Link href={payload.rules.database}>{t("rules.database")}</Link></li>
          <li><Link href={payload.rules.contracts}>{t("rules.contracts")}</Link></li>
        </ul>
        <p className={styles.note}>{t("withdrawal")}</p>
      </section>
    </article>
  </PublicShell>;
}
