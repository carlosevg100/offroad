import {createTranslator} from "next-intl";
import {renderToStaticMarkup} from "react-dom/server";
import {describe, expect, it, vi} from "vitest";

import {analyzeCreditPosition, deskInputLabel, projectLeverageTrajectory, ratioGapLabels, type DeskInput, type Trajectory} from "@offroad/credit-analysis";

import en from "../../../messages/en-US.json";
import pt from "../../../messages/pt-BR.json";
import {IntakeDesk} from "./intake-desk";

vi.mock("next-intl/server", () => ({
  getTranslations: async ({locale, namespace}: {locale: string; namespace: string}) =>
    createTranslator({locale, messages: locale === "en-US" ? en : pt, namespace: namespace as "Intake.desk", onError: (error) => {throw error;}}),
}));

/** What a person reads: the markup without its tags and attributes. */
const visible = (markup: string) => markup.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&quot;/g, "\"").replace(/&amp;/g, "&").replace(/\s+/g, " ");

// Every path `buildDeskInputs` can report missing.
const missing = [
  "historical_financials.{ano}.revenue", "historical_financials.{ano}.ebitda", "historical_financials.{ano}.cash",
  "historical_financials.{ano}.gross_debt", "debt.instruments", "transaction.requested_amount", "projections.{ano}.ebitda",
  "transaction.desired_term_months", "transaction.desired_grace_months",
];

describe("the list of missing information on the desk screen", () => {
  it.each(["pt-BR", "en-US"] as const)("names each input in words and never shows its field path (%s)", async (locale) => {
    const lang = locale === "en-US" ? "en" : "pt";
    const markup = renderToStaticMarkup(await IntakeDesk({locale, desk: null, trajectory: null, deskMissing: missing, clientQuestions: []}));
    const text = visible(markup);
    for (const path of missing) {
      // Before: the label fell back to the path ("historical_financials.{ano}.revenue") and the path was printed beside it in code.
      expect(text).not.toContain(path);
      const label = deskInputLabel(path)[lang];
      expect(text).toContain(label.charAt(0).toLocaleUpperCase(locale) + label.slice(1));
      // The path stays off the visible text, for whatever needs to select the item.
      expect(markup).toContain(`data-field-path="${path}"`);
    }
    expect(markup).not.toContain("<code>");
  });
});

/** A company whose latest EBITDA and cost of goods sold are zero, and whose projection has a year of zero EBITDA. */
const zeroDesk: DeskInput = {
  indexLevels: {cdi: "0.105"},
  referenceDate: "2026-08-21",
  audited: {year: 2025, revenue: "365", ebitda: "0", cogs: "0"},
  balance: {periodEnd: "2025-12-31", cash: "10", receivables: "20", inventory: "20", suppliers: "10", grossDebt: "200"},
  debt: [{lender: "Banco A", balance: "200", rate: "CDI + 3,00% a.a.", maturity: "2029-06-30"}],
  request: {amounts: [{value: "50", source: "carta"}]},
};
const zeroTrajectory = (): Trajectory => projectLeverageTrajectory({
  referenceDate: "2026-06-30", cash: "0", auditedEbitda: "0",
  existing: [{lender: "Banco A", balance: "1000", maturity: "2030-06-30", amortization: "bullet", hasCovenant: true}],
  existingCovenants: [{lender: "Banco A", maximum: "3"}],
  newDebt: {amount: "500", termMonths: 36, graceMonths: 12},
  projectedEbitda: [{year: 2026, ebitda: "200"}, {year: 2027, ebitda: "0"}, {year: 2028, ebitda: "400"}],
});
const cashDesk = () => analyzeCreditPosition({...zeroDesk, audited: {year: 2025, revenue: "365", ebitda: "100", cogs: "365"}});

describe("an absent ratio on the desk screen", () => {
  it.each(["pt-BR", "en-US"] as const)("names the gap where the figure would be and never prints a division (%s)", async (locale) => {
    const lang = locale === "en-US" ? "en" : "pt";
    const copy = (locale === "en-US" ? en : pt).Intake.desk;
    const markup = renderToStaticMarkup(await IntakeDesk({locale, desk: analyzeCreditPosition(zeroDesk), trajectory: zeroTrajectory(), deskMissing: [], clientQuestions: []}));
    const text = visible(markup);
    // Before: leverage and the cycle read as the division printed them or, over a zero EBITDA, as "sem sentido com EBITDA negativo".
    expect(text).not.toMatch(/∞|NaN|Infinity/);
    expect(text).toContain(`${copy.leveragePre} ${ratioGapLabels.ebitda[lang]}`);
    expect(text).toContain(`${copy.leveragePost} ${ratioGapLabels.ebitda[lang]}`);
    // Interest coverage over a zero EBITDA is not a ratio over zero: it has no meaning, and the screen says so accurately.
    expect(text).toContain(`${copy.interestCoverage} ${copy.notMeaningful}`);
    expect(text).toContain(ratioGapLabels.cost_of_goods_sold[lang]);
    expect(text).toContain(ratioGapLabels.projected_ebitda[lang]);
    expect(text).toContain(ratioGapLabels.stressed_ebitda[lang]);
    // No peak is marked around a year whose leverage in the cut case is absent.
    expect(markup).not.toContain("is-peak");
  });

  it("reads a desk published before absent ratios existed, whose ratios printed the division, as absent", async () => {
    const published = cashDesk();
    const legacy = {...published, leverage: {...published.leverage, preTurns: "Infinity"}, workingCapital: {...published.workingCapital, cycleDays: "NaN"}};
    const text = visible(renderToStaticMarkup(await IntakeDesk({locale: "pt-BR", desk: legacy, trajectory: null, deskMissing: [], clientQuestions: []})));
    expect(text).not.toMatch(/∞|NaN|Infinity/);
    expect(text).toContain(ratioGapLabels.ebitda.pt);
    expect(text).toContain(ratioGapLabels.cost_of_goods_sold.pt);
  });

  it("states a rate per year in the language of the screen", async () => {
    const text = visible(renderToStaticMarkup(await IntakeDesk({locale: "en-US", desk: cashDesk(), trajectory: null, deskMissing: [], clientQuestions: []})));
    // Before: "CDI at 10.5% a.a." on the English screen.
    expect(text).toContain("CDI at 10.5% p.a.");
    expect(text).not.toContain("a.a.");
  });
});
