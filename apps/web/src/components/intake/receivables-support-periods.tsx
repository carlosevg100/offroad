import {getTranslations} from "next-intl/server";
import type {ReceivablesSupportPeriodAssessment, ReceivablesEvidenceSourceManifest} from "@offroad/receivables-analysis";
import {ReceivablesSupportPeriodList} from "./receivables-support-period-list";
export async function ReceivablesSupportPeriods({assessment, sources, locale}: {assessment?: ReceivablesSupportPeriodAssessment; sources?: ReceivablesEvidenceSourceManifest; locale: string}) {
  const t=await getTranslations({locale,namespace:"ReceivablesSupportPeriods"});
  const keys=["title", "boundary", "notAssessed", "reportingDate", "datePolicy", "noEntries", "unnamedSource", "dateKind", "sourceDate", "missingDate", "start", "end", "location", "trace", "sourceId", "sourceHash", "sheet", "row", "column", "cell", "page", "clause", "paragraph", "event", "system", "timestamp", "pagination", "page", "entries", "previous", "next", "qualification.included", "qualification.subsequent", "qualification.missing", "qualification.invalid", "qualification.overlaps_cutoff", "meaning.included", "meaning.subsequent", "meaning.missing", "meaning.invalid", "meaning.overlaps_cutoff", "kind.stock_as_of", "kind.flow_interval", "kind.event_timestamp", "kind.event_date", "limitation.ambiguous_support", "limitation.missing_amount", "limitation.invalid_amount", "limitationMeaning.ambiguous_support", "limitationMeaning.missing_amount", "limitationMeaning.invalid_amount", "limitation.source_review_pending", "limitationMeaning.source_review_pending", "unqualifiedDate"] as const;
  const copy=Object.fromEntries(keys.map((key)=>[key,t(key)]));
  return <ReceivablesSupportPeriodList key={`${locale}:${assessment?.reportingDate ?? "historical"}`} assessment={assessment} sources={sources} copy={copy}/>;
}
