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
