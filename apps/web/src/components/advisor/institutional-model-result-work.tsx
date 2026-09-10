"use client";

import Link from "next/link";
import {useFormatter, useLocale, useTranslations} from "next-intl";
import type {InstitutionalModelResult} from "@/lib/advisor/institutional-model-results";
import {DealStateRefresh} from "@/components/deal-state/deal-state-refresh";
import {institutionalResultIssues} from "@/lib/advisor/institutional-issue-presentation";
import {InstitutionalIssues} from "./institutional-issues";
import styles from "./institutional-model-result-work.module.css";

export function InstitutionalModelResultWork({projectId, result}: {projectId: string; result: InstitutionalModelResult}) {
  const t = useTranslations("InstitutionalModelResult");
  const locale = useLocale();
  const formatter = useFormatter();
  return <section className={styles.result} data-testid="institutional-model-result">
    <DealStateRefresh active={result.status === "queued"} />
    <header><span>{t("kicker")}</span><h2>{t("title")}</h2>
      <p role="status">{t(`status.${result.status}`)}</p>
      <small>{t("prepared", {date: formatter.dateTime(new Date(result.createdAt), {dateStyle: "medium", timeZone: "UTC"})})}</small>
    </header>
    {result.status === "completed" && result.artifact ? <>
      <p>{t("snapshot")}</p>
      <div className={styles.scenarios}>
        {result.artifact.institutional.scenarios.map(scenario => <article key={scenario.configurationId}>
          <h3>{scenario.input.assumptionBook.scenarioName}</h3>
          <p>{t("revision", {revision: scenario.revision, currency: scenario.input.currency})}</p>
        </article>)}
      </div>
      <nav className={styles.downloads} aria-label={t("downloads")}>
        {(["xlsx", "pptx", "docx", "pdf"] as const).map(format => <a key={format} href={`/${locale}/app/projects/${projectId}/financial-results/${result.id}/${format}`}>{t(`formats.${format}`)}</a>)}
      </nav>
    </> : result.status === "blocked" ? <><p>{t("blockedHelp")}</p><InstitutionalIssues issues={institutionalResultIssues(result.blockers)} /></> : null}
    <footer><Link href="#work-institutional-setup">{t("edit")}</Link></footer>
  </section>;
}
