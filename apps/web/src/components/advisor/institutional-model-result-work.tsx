"use client";

import Link from "next/link";
import {useFormatter, useLocale, useTranslations} from "next-intl";
import {deliverableFormatDecisions} from "@offroad/case-export/deliverable-formats";
import type {InstitutionalModelResult} from "@/lib/advisor/institutional-model-results";
import {institutionalResultDeliverableContext, institutionalResultDeliverableTypes} from "@/lib/advisor/institutional-result-formats";
import {DeliverableFormatList} from "./deliverable-format-list";
import {institutionalResultIssues} from "@/lib/advisor/institutional-issue-presentation";
import {InstitutionalIssues} from "./institutional-issues";
import {InstitutionalScenarioComparison} from "./institutional-scenario-comparison";
import styles from "./institutional-model-result-work.module.css";
import {followWorkSectionLink, workSectionHref} from "./advisor-work-links";

/** `calculating` is what the work activity says of the calculation of this result (see
 * `institutionalCalculationRuns`). A queued result that nothing calculates is a gap, not "calculating".
 * The page refreshes from the work activity; this view has no refresh of its own.
 *
 * `recalculation` is the recalculated result that waits in the work's Updates to replace this one
 * (see `recalculationAwaitingAdoption`): only its adoption makes it current, so the panel points to
 * that update instead of asking for a new calculation; the link opens the Updates section on it. */
export function InstitutionalModelResultWork({projectId, result, calculating = false, recalculation = null}: {
  projectId: string; result: InstitutionalModelResult; calculating?: boolean; recalculation?: {updateId: string; adoptable: boolean} | null;
}) {
  const t = useTranslations("InstitutionalModelResult");
  const locale = useLocale();
  const formatter = useFormatter();
  return <section className={styles.result} data-testid="institutional-model-result">
    <header><span>{t("kicker")}</span><h2>{t("title")}</h2>
      <p role="status">{recalculation ? t(recalculation.adoptable ? "status.recalculationReady" : "status.recalculationWaiting")
        : t(`status.${result.status === "queued" && !calculating ? "notRunning" : result.status}`)}</p>
      {recalculation ? <p className={styles.recalculation}><a href={workSectionHref("updates", recalculation.updateId)} onClick={followWorkSectionLink}>{t("openUpdate")}</a></p> : null}
      <small>{t("prepared", {date: formatter.dateTime(new Date(result.createdAt), {dateStyle: "medium", timeZone: "UTC"})})}</small>
    </header>
    {result.status === "completed" && result.artifact ? <>
      <p>{t(result.artifact.version === "institutional-workbook-editable.v2" ? "editableSnapshot" : "snapshot")}</p>
      <div className={styles.scenarios}>
        {result.artifact.institutional.scenarios.map(scenario => <article key={scenario.configurationId}>
          <h3>{scenario.input.assumptionBook.scenarioName}</h3>
          <p>{t("revision", {revision: scenario.revision, currency: scenario.input.currency})}</p>
        </article>)}
      </div>
      <InstitutionalScenarioComparison key={result.id} currentId={result.id} comparisons={result.comparisons ?? []} />
      <div className={styles.downloads}>
        <DeliverableFormatList
          label={t("downloads")}
          decisions={deliverableFormatDecisions(institutionalResultDeliverableTypes, institutionalResultDeliverableContext(result))}
          basePath={`/${locale}/app/projects/${projectId}/financial-results/${result.id}`}
        />
      </div>
    </> : result.status === "blocked" ? <><p>{t("blockedHelp")}</p><InstitutionalIssues issues={institutionalResultIssues(result.blockers)} /></> : null}
    <footer><Link href="#work-institutional-setup">{t("edit")}</Link></footer>
  </section>;
}
