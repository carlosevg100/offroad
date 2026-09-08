"use client";
import {useState} from "react";
import type {ReceivablesSupportPeriodAssessment, ReceivablesEvidenceSourceManifest} from "@offroad/receivables-analysis";
export function ReceivablesSupportPeriodList({assessment, sources, copy}: {assessment?: ReceivablesSupportPeriodAssessment; sources?: ReceivablesEvidenceSourceManifest; copy: Record<string,string>}) {
  const [requestedPage,setPage]=useState(0);
  const pageSize=25;
  const page=Math.min(requestedPage,Math.max(0,Math.ceil((assessment?.entries.length ?? 0)/pageSize)-1));
  const visibleEntries=assessment?.entries.slice(page*pageSize,(page+1)*pageSize) ?? [];
  const t=(key:string)=>copy[key] ?? key;
  return <section className="receivables-support-periods" data-testid="receivables-support-periods">
    <h4>{t("title")}</h4><p>{t("boundary")}</p>
    {!assessment ? <p>{t("notAssessed")}</p> : <>
      <p><strong>{t("reportingDate")}</strong> <time dateTime={assessment.reportingDate}>{assessment.reportingDate}</time></p>
      {assessment.dateComparisonPolicy === "source_local_calendar_date" ? <p>{t("datePolicy")}</p> : null}
      {!assessment.entries.length ? <p>{t("noEntries")}</p> : visibleEntries.map((entry) => {
        const fileName = sources?.sources.find((source) => source.sourceDocumentId === entry.sourceId)?.fileName
          ?? (entry.sourceLabel !== entry.sourceId ? entry.sourceLabel : null);
        const anchor = entry.anchor;
        const limitation = entry.requiresSourceReview ? "source_review_pending" : entry.scopeAmbiguous ? "ambiguous_support" : entry.amountStatus === "missing" ? "missing_amount" : entry.amountStatus === "invalid" ? "invalid_amount" : null;
        const locations = anchor.kind === "file" ? [["sheet", anchor.sheet], ["row", anchor.row], ["column", anchor.column], ["cell", anchor.cell]] as const
          : anchor.kind === "document" ? [["page", anchor.page], ["clause", anchor.clause], ["paragraph", anchor.paragraph]] as const
          : [["event", anchor.eventId], ["system", anchor.sourceSystem], ["timestamp", anchor.occurredAt]] as const;
        return <details key={entry.id} data-period-qualification={entry.qualification}>
          <summary><strong>{fileName ?? t("unnamedSource")}</strong><span>{t(limitation ? `limitation.${limitation}` : `qualification.${entry.qualification}`)} · {entry.rawDate ?? (entry.requiresSourceReview ? t("unqualifiedDate") : t("missingDate"))}{anchor.kind === "file" && anchor.row !== undefined ? ` · ${t("row")} ${anchor.row}` : ""}</span></summary>
          <dl><div><dt>{t("dateKind")}</dt><dd>{t(`kind.${entry.dateKind}`)}</dd></div>
            <div><dt>{t("sourceDate")}</dt><dd>{entry.rawDate ?? (entry.requiresSourceReview ? t("unqualifiedDate") : t("missingDate"))}</dd></div>
            <div><dt>{t("start")}</dt><dd>{entry.startDate ?? (entry.requiresSourceReview ? t("unqualifiedDate") : t("missingDate"))}</dd></div>
            <div><dt>{t("end")}</dt><dd>{entry.endDate ?? (entry.requiresSourceReview ? t("unqualifiedDate") : t("missingDate"))}</dd></div>
          </dl>
          {!entry.scopeAmbiguous && !entry.requiresSourceReview ? <p>{t(`meaning.${entry.qualification}`)}</p> : null}
          {limitation ? <p>{t(`limitationMeaning.${limitation}`)}</p> : null}
          <h5>{t("location")}</h5><dl>{locations.filter(([, value]) => value !== undefined).map(([key, value]) => <div key={key}><dt>{t(key)}</dt><dd>{value}</dd></div>)}</dl>
          <details><summary>{t("trace")}</summary><dl><div><dt>{t("sourceId")}</dt><dd>{entry.sourceId}</dd></div><div><dt>{t("sourceHash")}</dt><dd>{entry.sourceHash}</dd></div></dl></details>
        </details>;
      })}
      {assessment.entries.length > pageSize ? <nav aria-label={t("pagination")}><span role="status" className="sr-only">{t("page")} {page + 1}</span><p>{t("page")} {page + 1} / {Math.ceil(assessment.entries.length / pageSize)} · {assessment.entries.length} {t("entries")}</p><button type="button" disabled={page === 0} onClick={() => setPage(page - 1)}>{t("previous")}</button><button type="button" disabled={(page + 1) * pageSize >= assessment.entries.length} onClick={() => setPage(page + 1)}>{t("next")}</button></nav> : null}
    </>}
  </section>;
}
