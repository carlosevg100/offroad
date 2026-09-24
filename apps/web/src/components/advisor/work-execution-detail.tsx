import Link from "next/link";
import {getTranslations} from "next-intl/server";
import type {WorkExecutionView} from "@/lib/execution/read";
import {formatDecimal} from "@/lib/execution/format";
import {WorkExecutionRefresh} from "./work-execution-refresh";
import "./work-execution.css";

/** The composer writes a missing operand's gap as "field path: reason"; the field path is the
 * identity a reader can find again in the basis, the reason is the original text. */
export function splitOperandGap(gap: {code: string; reason: string}): {operand: string | null; reason: string} {
  const at = gap.code === "projection_input_missing" ? gap.reason.indexOf(": ") : -1;
  return at > 0 ? {operand: gap.reason.slice(0, at), reason: gap.reason.slice(at + 2)} : {operand: null, reason: gap.reason};
}

/** Shows what the database returned and nothing more: state, outcome and reason always; the
 * published packet only when the bytes came back and parse as the released output; the gate
 * receipt only when its bytes match the stored fingerprint; the MD test question by question,
 * with no overall verdict; and each chart piece's decisive number as text, without a chart. */
export async function WorkExecutionDetail({locale, projectId, view}: {locale: string; projectId: string; view: WorkExecutionView}) {
  const t = await getTranslations({locale, namespace: "App.workExecutions"});
  const when = new Intl.DateTimeFormat(locale, {dateStyle: "medium", timeStyle: "short"});
  const date = (value: string | null) => value ? when.format(new Date(value)) : t("detail.notInformed");
  const known = (group: string, key: string) => t.has(`${group}.${key}`) ? t(`${group}.${key}`) : key;
  const result = view.result; const packet = result && !result.withheld ? result.packet : null; const marker = result && !result.withheld ? result.marker : null;
  const mdTest = result && !result.withheld ? result.mdTest : null; const decisive = result && !result.withheld ? result.decisiveNumbers : null;
  const gates = view.gates;
  const alternativeLabel = (id: string) => packet?.alternatives.find(a => a.id === id)?.label ?? id;
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
    <section><h2>{t("gates.title")}</h2>
      {!gates ? <p role="status">{t("gates.none")}</p>
        : !gates.verified ? <p role="status">{t("gates.unverified")} <code>{gates.fingerprint}</code></p>
        : <dl className="execution-facts">
          <dt>{t("gates.registration")}</dt><dd>{t(`gates.registrationStates.${gates.companyRegistration}`)}</dd>
          <dt>{t("gates.research")}</dt><dd>{t(`gates.researchStates.${gates.research}`)} · {t("gates.recordedOn", {date: date(gates.createdAt)})}</dd>
          <dt>{t("gates.situations")}</dt><dd><ul>{gates.methodSelection.situationIds.map(id => <li key={id}>{known("situations", id)}</li>)}</ul></dd>
          <dt>{t("gates.conventions")}</dt><dd>{!gates.conventions.length ? t("gates.noConventions") : <ul>{gates.conventions.map(c => <li key={c.key}><code>{c.key}</code>: {c.effective === "gap" ? t("gates.conventionGap") : t("gates.conventionApproved")}{c.status ? <> · {known("gates.conventionStatuses", c.status)}</> : null}{c.version ? <> · <code>{c.version}</code></> : null}</li>)}</ul>}</dd>
          <dt>{t("gates.voice")}</dt><dd>{t("gates.voiceCounts", {block: gates.voice.blockCount, warn: gates.voice.warnCount})}</dd>
          <dt>{t("gates.fingerprint")}</dt><dd><code>{gates.fingerprint}</code></dd>
        </dl>}
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
    {packet && mdTest ? <section><h2>{t("mdTest.title")}</h2><p>{t("mdTest.note")}</p>
      {!mdTest.evaluated ? <p role="status">{t(`mdTest.notEvaluated.${mdTest.reason}`)}</p>
        : <ol className="execution-questions">{mdTest.questions.map(q => <li key={q.id}><strong>{known("mdTest.questions", q.id)}</strong>
          <p>{t(`mdTest.statuses.${q.status}`)}
            {q.status === "not_applicable" ? <> · {known("mdTest.scopeCodes", q.scopeCode)} (<code>{q.scopeCode}</code>)</> : null}
            {q.status === "fail" ? <> · <code>{q.reasonCodes.join(", ")}</code></> : null}
            {q.status === "human_required" ? <> · <code>{q.reasonCode}</code></> : null}</p></li>)}</ol>}
    </section> : null}
    {packet ? <section><h2>{t("decisive.title")}</h2>
      {decisive === null ? <p role="status">{t("decisive.unavailable")}</p>
        : !decisive.length ? <p>{t("decisive.none")}</p>
        : <ul>{decisive.map(n => <li key={n.pieceId}>{known("decisive.questions", n.questionCode)} · {alternativeLabel(n.alternativeId)}: <strong>{formatDecimal(n.value, locale)} {n.unit}</strong> · {t("decisive.period", {period: n.periodLabel})}</li>)}</ul>}
    </section> : null}
  </>;
}
