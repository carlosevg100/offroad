import {ReceivablesProjectSupportPeriods, isReceivablesReportCurrent} from "./receivables-project-support-periods";
import {createTranslator} from "next-intl";
import {renderToStaticMarkup} from "react-dom/server";
import {describe, expect, it, vi} from "vitest";
import type {ReceivablesSupportPeriodAssessment} from "@offroad/receivables-analysis";
import pt from "../../../messages/pt-BR.json";
import en from "../../../messages/en-US.json";
import {ReceivablesSupportPeriods} from "./receivables-support-periods";
vi.mock("next-intl/server", () => ({getTranslations: async ({locale}: {locale: string}) => createTranslator({locale, messages: locale === "en-US" ? en : pt, namespace: "ReceivablesSupportPeriods", onError: (error) => {throw error;}})}));
const qualifications = ["included", "subsequent", "missing", "invalid", "overlaps_cutoff"] as const;
const assessment: ReceivablesSupportPeriodAssessment = {
  schemaVersion: "receivables-support-periods.v1", dateComparisonPolicy: "source_local_calendar_date", reportingDate: "2026-08-31",
  entries: qualifications.map((qualification, index) => ({id: `synthetic-${index}`, detectorId: "synthetic-detector", sourceId: "synthetic-source", sourceLabel: "Synthetic supporting file", sourceHash: "a".repeat(64), anchor: {kind: "file", fileId: "synthetic-source", fileHash: "a".repeat(64), sheet: "Cash movements", row: index + 2}, dateKind: index === 4 ? "flow_interval" : index === 0 ? "event_date" : "event_timestamp", rawDate: index === 2 ? null : index === 3 ? "not-a-date" : index === 0 ? "2026-08-30" : "2026-09-01", startDate: index === 2 || index === 3 ? null : index === 0 ? "2026-08-30" : index === 4 ? "2026-08-01" : "2026-09-01", endDate: index === 2 || index === 3 ? null : index === 0 ? "2026-08-30" : "2026-09-01", qualification})),
};
describe("support temporal qualification", () => {
  it.each(["pt-BR", "en-US"])("renders every qualification and actual source dates separately in %s", async (locale) => {
    const copy = (locale === "en-US" ? en : pt).ReceivablesSupportPeriods;
    const html = renderToStaticMarkup(await ReceivablesSupportPeriods({assessment, locale}));
    expect(html).toContain("2026-08-31");
    expect(html).toContain("2026-09-01");
    expect(html).toContain("not-a-date");
    expect(html).toContain("Cash movements");
    expect(html).toContain(copy.boundary);
    expect(html).toContain(copy.datePolicy);
    expect(html).toContain(copy.kind.event_date);
    for (const qualification of qualifications) {expect(html).toContain(copy.qualification[qualification]); expect(html).toContain(copy.meaning[qualification]);}
    expect(html).not.toContain('"dateKind"');
    expect(html).not.toContain('class="is-complete"');
  });
  it.each(["pt-BR", "en-US"])("marks historical snapshots unassessed without inventing a reporting date in %s", async (locale) => {
    const copy = (locale === "en-US" ? en : pt).ReceivablesSupportPeriods;
    const html = renderToStaticMarkup(await ReceivablesSupportPeriods({locale}));
    expect(html).toContain(copy.notAssessed);
    expect(html).not.toContain("<time");
  });
  it("does not interpret empty entries as defect-free coverage", async () => {
    const html = renderToStaticMarkup(await ReceivablesSupportPeriods({locale: "en-US", assessment: {...assessment, entries: []}}));
    expect(html).toContain(en.ReceivablesSupportPeriods.noEntries);
  });
});

it("bounds the DOM to 25 entries and exposes navigation instead of silently truncating",async()=>{const entries=Array.from({length:51},(_,i)=>({...assessment.entries[0]!,id:`entry-${i}`,sourceLabel:`Source number ${i}`}));const html=renderToStaticMarkup(await ReceivablesSupportPeriods({locale:"en-US",assessment:{...assessment,entries}}));expect(html.split("data-period-qualification=")).toHaveLength(26);expect(html).toContain("Source number 24");expect(html).not.toContain("Source number 25");expect(html).toContain("51");expect(html).toContain("Next");expect(html).toContain('aria-label="Temporal reference navigation"');});

it.each(["missing","invalid"] as const)("distinguishes %s amounts from invalid dates",async(amountStatus)=>{const html=renderToStaticMarkup(await ReceivablesSupportPeriods({locale:"en-US",assessment:{...assessment,entries:[{...assessment.entries[0]!,amountStatus}]}}));expect(html).toContain(amountStatus==="missing"?en.ReceivablesSupportPeriods.limitation.missing_amount:en.ReceivablesSupportPeriods.limitation.invalid_amount);expect(html).toContain("2026-08-30");expect(html).not.toContain(en.ReceivablesSupportPeriods.qualification.invalid);});

it.each(["pt-BR","en-US"])("shows pending review of an existing source without claiming its date is absent in %s",async(locale)=>{const copy=(locale==="pt-BR"?pt:en).ReceivablesSupportPeriods;const html=renderToStaticMarkup(await ReceivablesSupportPeriods({locale,assessment:{...assessment,entries:[{...assessment.entries[2]!,requiresSourceReview:true}]}}));expect(html).toContain(copy.limitation.source_review_pending);expect(html).toContain(copy.limitationMeaning.source_review_pending);expect(html).not.toContain(copy.qualification.missing);expect(html).not.toContain(copy.meaning.missing);expect(html).not.toContain(copy.missingDate);});

describe("canonical project temporal report projection",()=>{
 it("renders the persisted assessment from understanding_snapshot",async()=>{const html=renderToStaticMarkup(await ReceivablesProjectSupportPeriods({locale:"en-US",current:true,understanding:{receivablesVertical:{supportPeriodAssessment:assessment,pipeline:{}}}}));expect(html).toContain('data-testid="receivables-support-periods"');expect(html).toContain("2026-08-31");expect(html).toContain("Cash movements");});
 it("marks legacy receivables reports unassessed",async()=>{const html=renderToStaticMarkup(await ReceivablesProjectSupportPeriods({locale:"en-US",current:true,understanding:{receivablesVertical:{pipeline:{}}}}));expect(html).toContain(en.ReceivablesSupportPeriods.notAssessed);expect(html).not.toContain("<time");});
 it("does not expose stale report dates as current",async()=>{const html=renderToStaticMarkup(await ReceivablesProjectSupportPeriods({locale:"en-US",current:false,understanding:{receivablesVertical:{supportPeriodAssessment:assessment,pipeline:{}}}}));expect(html).toContain(en.ReceivablesSupportPeriods.notAssessed);expect(html).not.toContain("2026-08-31");});
 it("does not invent a receivables section in other diagnoses",async()=>{expect(await ReceivablesProjectSupportPeriods({locale:"en-US",current:true,understanding:{readiness:{}}})).toBeNull();});
 it("fails closed on malformed temporal data",async()=>{const html=renderToStaticMarkup(await ReceivablesProjectSupportPeriods({locale:"en-US",current:true,understanding:{receivablesVertical:{supportPeriodAssessment:{...assessment,entries:[{qualification:"trusted"}]}}}}));expect(html).toContain(en.ReceivablesSupportPeriods.notAssessed);expect(html).not.toContain("<time");});
});

it("requires current source bindings and valid chronological report freshness",()=>{
 const id="10000000-0000-4000-8000-000000000001";const source={sourceDocumentId:id,documentVersion:1,contentKind:"document_layer",sourceSha256:"a".repeat(64),contentSha256:"b".repeat(64),schemaVersion:"2026.08.28-v1",fileName:"Pool.xlsx"};
 const context={state:"current",sourceManifest:{schemaVersion:"receivables-evidence-manifest.v1",fingerprint:"c".repeat(64),sources:[source]},candidates:[{documentId:id,fileName:"Pool.xlsx",sheet:"A",headerRow:1}],scope:{schemaVersion:"receivables-evidence-scope.v1",id,fingerprint:"d".repeat(64),sourceManifestFingerprint:"c".repeat(64),primaryTape:{documentId:id,sheet:"A",headerRow:1},complementDocumentIds:[],reportingDate:"2026-08-31",sourceRevisions:[source],confirmedBy:id,confirmedAt:"2026-09-08T12:00:00-03:00"}};
 expect(isReceivablesReportCurrent(context,"2026-09-08T15:01:00Z",false)).toBe(true);
 expect(isReceivablesReportCurrent(context,"2026-09-08T14:59:00Z",false)).toBe(false);
 expect(isReceivablesReportCurrent(context,"invalid",false)).toBe(false);
 expect(isReceivablesReportCurrent(context,"2026-09-08T15:01:00Z",true)).toBe(false);
 expect(isReceivablesReportCurrent({...context,sourceManifest:{...context.sourceManifest,sources:[{...source,documentVersion:2}]}},"2026-09-08T15:01:00Z",false)).toBe(false);
});
