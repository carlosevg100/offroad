import Link from "next/link";
import {getTranslations} from "next-intl/server";
import type {WorkExecutionView} from "@/lib/execution/read";
import {WorkExecutionRefresh} from "./work-execution-refresh";
import "./work-execution.css";

/** The composer writes a missing operand's gap as "field path: reason"; the field path is the
 * identity a reader can find again in the basis, the reason is the original text. */
export function splitOperandGap(gap: {code: string; reason: string}): {operand: string | null; reason: string} {
  const at = gap.code === "projection_input_missing" ? gap.reason.indexOf(": ") : -1;
  return at > 0 ? {operand: gap.reason.slice(0, at), reason: gap.reason.slice(at + 2)} : {operand: null, reason: gap.reason};
}

/** Shows what the database returned and nothing more: state, outcome and reason always; the
 * published packet only when the bytes came back and parse as the released output. */
export async function WorkExecutionDetail({locale, projectId, view}: {locale: string; projectId: string; view: WorkExecutionView}) {
  const t = await getTranslations({locale, namespace: "App.workExecutions"});
  const when = new Intl.DateTimeFormat(locale, {dateStyle: "medium", timeStyle: "short"});
  const date = (value: string | null) => value ? when.format(new Date(value)) : t("detail.notInformed");
  const known = (group: "states" | "reasons" | "gapCodes" | "requirements" | "kinds", key: string) => t.has(`${group}.${key}`) ? t(`${group}.${key}`) : key;
  const result = view.result; const packet = result && !result.withheld ? result.packet : null; const marker = result && !result.withheld ? result.marker : null;
  return <>
    <nav aria-label={t("detail.title")}><Link href={`/${locale}/app/projects/${projectId}/executions`}>{t("detail.list")}</Link><WorkExecutionRefresh label={t("detail.refresh")} /></nav>
    <section><h2>{t("detail.title")}</h2>
      <dl className="execution-facts">
        <dt>{t("detail.state")}</dt><dd>{t(`states.${view.state}`)}</dd>
        <dt>{t("detail.outcome")}</dt><dd>{view.outcome ? t(`states.${view.outcome}`) : t("detail.notInformed")}</dd>
        <dt>{t("detail.reason")}</dt><dd>{view.reason ? known("reasons", view.reason) : t("detail.notInformed")}</dd>
        <dt>{t("detail.inputsCurrent")}</dt><dd>{view.inputsCurrent ? t("detail.inputsCurrentYes") : t("detail.inputsCurrentNo")}</dd>
        <dt>{t("detail.requestedAt")}</dt><dd>{date(view.manifest?.requestedAt ?? view.createdAt)}</dd>
        {view.job ? <><dt>{t("detail.job")}</dt><dd>{known("states", view.job.status)} · {t("detail.attempts", {count: view.job.attempts})} · {date(view.job.updatedAt)}{view.job.lastErrorCode ? <> · {t("detail.lastError")}: <code>{view.job.lastErrorCode}</code></> : null}</dd></> : null}
        {view.manifest ? <><dt>{t("detail.method")}</dt><dd>{view.manifest.methodId ?? t("detail.notInformed")} {view.manifest.methodVersion ?? ""}</dd>
          <dt>{t("detail.contractFingerprint")}</dt><dd><code>{view.manifest.contractFingerprint}</code></dd>
          <dt>{t("detail.inputFingerprint")}</dt><dd><code>{view.manifest.inputFingerprint}</code></dd></> : null}
        <dt>{t("detail.execution")}</dt><dd><code>{view.executionId}</code></dd>
      </dl>
    </section>
    {result?.withheld ? <section><h2>{t("detail.withheldTitle")}</h2><p role="status">{t("detail.withheldBody")}</p><p>{t("detail.resultFingerprint")}: <code>{result.resultFingerprint}</code> · {t("detail.committedAt")}: {date(result.committedAt)}</p></section> : null}
    {result && !result.withheld ? <section><h2>{t("detail.resultTitle")}</h2>
      <p>{t("detail.resultFingerprint")}: <code>{result.resultFingerprint}</code> · {t("detail.committedAt")}: {date(result.committedAt)}</p>
      {marker ? <p role="status">{t("detail.markerTitle")}: {known("reasons", marker.reason)}</p> : null}
      {!packet && !marker ? <p role="status">{t("detail.unreadable")}</p> : null}
      {packet ? <>
        <dl className="execution-facts">
          <dt>{t("detail.decisionStatus")}</dt><dd>{t(`decisionStatus.${packet.status}`)}</dd>
          <dt>{t("detail.question")}</dt><dd>{packet.question}</dd>
          <dt>{t("detail.asOf")}</dt><dd>{packet.asOf}</dd>
          <dt>{t("detail.contributions")}</dt><dd>{packet.contributions}</dd>
        </dl>
        <h3>{t("detail.alternatives")}</h3>
        <ul>{packet.alternatives.map(a => <li key={a.id}>{a.label} · {known("kinds", a.kind)} · {a.calculated ? t("detail.calculated") : t("detail.notCalculated")}</li>)}</ul>
        <h3>{t("detail.gaps")}</h3>
        {!packet.informationGaps.length ? <p>{t("detail.noGaps")}</p> : <ul>{packet.informationGaps.map((g, n) => {
          const {operand, reason} = splitOperandGap(g);
          return <li key={n}><strong>{operand ? <code>{operand}</code> : g.subjectId ?? t("detail.decision")}</strong> · {known("gapCodes", g.code)}<details><summary>{t("detail.originalReason")}</summary><p>{reason}</p></details></li>;
        })}</ul>}
        {packet.contractualGaps.length ? <><h3>{t("detail.contractualGaps")}</h3><ul>{packet.contractualGaps.map((g, n) => <li key={n}>{g.subjectId}: <code>{g.code}</code></li>)}</ul></> : null}
        <h3>{t("detail.requirements")}</h3>
        {!packet.nextRequirements.length ? <p>{t("detail.noRequirements")}</p> : <ul>{packet.nextRequirements.map(r => <li key={r}>{known("requirements", r)}</li>)}</ul>}
        <p>{t("detail.packetFingerprint")}: <code>{packet.fingerprint}</code></p>
      </> : null}
    </section> : null}
  </>;
}
