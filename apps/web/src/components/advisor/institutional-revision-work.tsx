"use client";

import {useRef, useState, useTransition} from "react";
import {useFormatter, useLocale, useTranslations} from "next-intl";
import {useRouter} from "next/navigation";

import {importInstitutionalWorkbook, propagateProjectRevision, reviewInstitutionalWorkbookProposal} from "@/app/[locale]/app/revision-actions";
import type {ProjectRevisionHistory} from "@/lib/advisor/institutional-revision-history";
import type {InstitutionalRevisionProposal} from "@/lib/advisor/institutional-revision-proposals";
import {displayAssumptionValue} from "./institutional-configuration-review";
import styles from "./institutional-revision-work.module.css";

type Feedback = {tone: "status" | "alert"; text: string};

/**
 * The revision surface: what the approved set of assumptions and data is now, what changed since
 * the previous one, which outputs are current and which are previous, and the way back in for a
 * workbook somebody edited in Excel.
 *
 * Everything shown here was computed on the server from verified snapshots. This component does
 * no arithmetic; it reads exact decimal strings and places them.
 */
export function InstitutionalRevisionWork({projectId, history, proposals}: {
  projectId: string;
  history: ProjectRevisionHistory;
  proposals: InstitutionalRevisionProposal[];
}) {
  const t = useTranslations("InstitutionalRevision");
  const locale = useLocale();
  const formatter = useFormatter();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const requests = useRef(new Map<string, string>());

  const requestId = (key: string) => {
    if (!requests.current.has(key)) requests.current.set(key, crypto.randomUUID());
    return requests.current.get(key)!;
  };
  const decimal = (value: string) => locale === "pt-BR" ? value.replace(".", ",") : value;
  const stamp = (value: string) => formatter.dateTime(new Date(value), {dateStyle: "medium", timeZone: "UTC"});

  function recompute() {
    setFeedback(null);
    startTransition(async () => {
      try {
        const result = await propagateProjectRevision({locale, projectId, requestId: requestId(`propagate:${history.currentRevisionId ?? "none"}`)});
        if (result.ok) { setFeedback({tone: "status", text: t("recomputeQueued")}); router.refresh(); }
        else setFeedback({tone: "alert", text: t(`errors.${result.error}`)});
      } catch { setFeedback({tone: "alert", text: t("errors.save")}); }
    });
  }

  function importWorkbook(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback(null);
    const file = fileInput.current?.files?.[0];
    if (!file) { setFeedback({tone: "alert", text: t("errors.invalid")}); return; }
    const body = new FormData();
    body.set("locale", locale);
    body.set("projectId", projectId);
    body.set("proposalId", requestId(`import:${file.name}:${file.size}:${file.lastModified}`));
    body.set("workbook", file);
    startTransition(async () => {
      try {
        const result = await importInstitutionalWorkbook(body);
        if (result.ok) {
          setFeedback({tone: "status", text: t(result.replayed ? "importAlreadyOpen" : "importAccepted", {changes: result.changes})});
          if (fileInput.current) fileInput.current.value = "";
          router.refresh();
        } else if (result.error === "refused") {
          const where = result.sheet && result.cell ? t("refusedAt", {sheet: result.sheet, cell: result.cell}) : "";
          setFeedback({tone: "alert", text: `${t(`refusals.${result.reason}`)} ${where}`.trim()});
        } else setFeedback({tone: "alert", text: t(`errors.${result.error}`)});
      } catch { setFeedback({tone: "alert", text: t("errors.save")}); }
    });
  }

  function decide(proposal: InstitutionalRevisionProposal, decision: "approved" | "rejected") {
    setFeedback(null);
    startTransition(async () => {
      try {
        const result = await reviewInstitutionalWorkbookProposal({
          locale, proposalId: proposal.id, decision,
          expectedStructureFingerprint: proposal.structureFingerprint,
          requestId: requestId(`review:${proposal.id}:${decision}`),
        });
        if (result.ok) { setFeedback({tone: "status", text: t(decision === "approved" ? "proposalApproved" : "proposalRejected")}); router.refresh(); }
        else setFeedback({tone: "alert", text: t(`errors.${result.error}`)});
      } catch { setFeedback({tone: "alert", text: t("errors.save")}); }
    });
  }

  const difference = history.difference;
  return <section className={styles.revision} data-testid="institutional-revision-work" aria-label={t("title")}>
    <header>
      <span>{t("kicker")}</span>
      <h2>{t("title")}</h2>
      <p>{t("introduction")}</p>
      {history.currentRevisionNumber === null ? null
        : <p data-testid="current-revision">{t("currentRevision", {number: history.currentRevisionNumber})}</p>}
    </header>

    {feedback ? <p className={styles.feedback} role={feedback.tone}>{feedback.text}</p> : null}

    {history.pendingChange ? <div className={styles.pending}>
      <p role="status">{t("pendingChange")}</p>
      <button type="button" disabled={pending} onClick={recompute}>{t("recompute")}</button>
    </div> : null}

    {difference ? <div className={styles.difference}>
      <h3>{t("differenceTitle")}</h3>
      {difference.limits.length ? <ul className={styles.limits}>
        {difference.limits.map(limit => <li key={limit}>{t(`limits.${limit}`)}</li>)}
      </ul> : null}
      {difference.assumptions.length === 0 && difference.outputs.length === 0
        ? <p>{t("noDifference")}</p>
        : <div className={styles.tables}>
          {difference.assumptions.length ? <div className={styles.scroll} tabIndex={0} role="region" aria-label={t("assumptionsChanged")}>
            <table><caption>{t("assumptionsChanged")}</caption>
              <thead><tr><th scope="col">{t("assumption")}</th><th scope="col">{t("period")}</th><th scope="col">{t("previousValue")}</th><th scope="col">{t("currentValue")}</th><th scope="col">{t("movement")}</th></tr></thead>
              <tbody>{difference.assumptions.map(change => <tr key={`${change.assumptionId}:${change.period}`}>
                <th scope="row">{change.label[locale === "pt-BR" ? "pt" : "en"]}</th>
                <td>{change.period}</td>
                <td>{change.previous === null ? t("notPresent") : displayAssumptionValue(change.previous, change.unit === "percent", locale)}</td>
                <td>{change.current === null ? t("notPresent") : displayAssumptionValue(change.current, change.unit === "percent", locale)}</td>
                <td>{change.difference === null ? t("notComputable") : displayAssumptionValue(change.difference, change.unit === "percent", locale)}</td>
              </tr>)}</tbody></table>
          </div> : null}
          {difference.outputs.length ? <div className={styles.scroll} tabIndex={0} role="region" aria-label={t("outputsChanged", {currency: difference.currency.current})}>
            <table><caption>{t("outputsChanged", {currency: difference.currency.current})}</caption>
              <thead><tr><th scope="col">{t("metric")}</th><th scope="col">{t("period")}</th><th scope="col">{t("previousValue")}</th><th scope="col">{t("currentValue")}</th><th scope="col">{t("movement")}</th></tr></thead>
              <tbody>{difference.outputs.map(change => <tr key={`${change.metric}:${change.period}`}>
                <th scope="row">{t(`metrics.${change.metric}`)}</th>
                <td>{change.period}</td>
                <td>{change.previous === null ? t("notComputable") : decimal(change.previous)}</td>
                <td>{change.current === null ? t("notComputable") : decimal(change.current)}</td>
                <td>{change.difference === null ? t("notComputable") : decimal(change.difference)}</td>
              </tr>)}</tbody></table>
          </div> : null}
        </div>}
    </div> : null}

    <div className={styles.history}>
      <h3>{t("historyTitle")}</h3>
      <ol>{history.revisions.map(revision => <li key={revision.id} data-testid={`revision-${revision.revisionNumber}`}>
        <header>
          <h4>{t("revisionLabel", {number: revision.revisionNumber})}</h4>
          <span className={revision.isCurrent ? styles.current : styles.previous}>{t(revision.isCurrent ? "standing.current" : "standing.previous")}</span>
        </header>
        <p>{t(`approvalKind.${revision.approvalKind}`)} · {stamp(revision.approvedAt)}</p>
        {revision.changeSummary.length ? <p>{t("changed", {components: revision.changeSummary.map(component => t(`components.${component}`)).join(", ")})}</p> : null}
        <ul className={styles.results}>{revision.results.map(result => <li key={result.id}>
          <span className={result.standing === "current" ? styles.current : styles.previous}>{t(`standing.${result.standing}`)}</span>
          {" "}{t(`resultStatus.${result.status}`)}
          {result.producedAt ? ` · ${t("producedAt", {date: stamp(result.producedAt)})}` : null}
        </li>)}</ul>
        {revision.results.length === 0 ? <p>{t("noResultYet")}</p> : null}
      </li>)}</ol>
      {history.revisions.length === 0 ? <p>{t("noRevisions")}</p> : null}
    </div>

    <form className={styles.import} onSubmit={importWorkbook}>
      <h3>{t("importTitle")}</h3>
      <p>{t("importHelp")}</p>
      <label htmlFor="institutional-workbook-import">{t("importField")}</label>
      <input id="institutional-workbook-import" ref={fileInput} type="file" name="workbook"
        accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={pending} />
      <button type="submit" disabled={pending}>{t("importSubmit")}</button>
    </form>

    <div className={styles.proposals}>
      <h3>{t("proposalsTitle")}</h3>
      {proposals.length === 0 ? <p>{t("proposalsEmpty")}</p> : <ul>{proposals.map(proposal => <li key={proposal.id} data-testid={`proposal-${proposal.id}`}>
        <header>
          <h4>{t("proposalLabel", {changes: proposal.changes.length})}</h4>
          <span>{t(`proposalStatus.${proposal.status}`)}</span>
        </header>
        <p>{t("proposalOpened", {date: stamp(proposal.createdAt)})}</p>
        <ul className={styles.changes}>{proposal.changes.map(change => <li key={`${change.assumptionId}:${change.period}`}>
          {change.label ? change.label[locale === "pt-BR" ? "pt" : "en"] : change.assumptionId} · {change.period} ·{" "}
          {displayAssumptionValue(change.approved, change.unit === "percent", locale)} → {displayAssumptionValue(change.proposed, change.unit === "percent", locale)}
        </li>)}</ul>
        {proposal.status === "proposed" ? (proposal.callerCanReview
          ? <div className={styles.actions}>
            <button type="button" disabled={pending} onClick={() => decide(proposal, "approved")}>{t("approve")}</button>
            <button type="button" disabled={pending} onClick={() => decide(proposal, "rejected")}>{t("reject")}</button>
          </div>
          : <p>{t("awaitingReviewer")}</p>) : null}
        {proposal.reviewedAt ? <p>{t("reviewedAt", {date: stamp(proposal.reviewedAt)})}</p> : null}
      </li>)}</ul>}
    </div>

    <footer><p>{t("boundary")}</p></footer>
  </section>;
}
