import {createTranslator} from "next-intl";
import {renderToStaticMarkup} from "react-dom/server";
import {describe, expect, it, vi} from "vitest";

import {deskInputLabel} from "@offroad/credit-analysis";

import en from "../../../messages/en-US.json";
import pt from "../../../messages/pt-BR.json";
import {IntakeDesk} from "./intake-desk";

vi.mock("next-intl/server", () => ({
  getTranslations: async ({locale, namespace}: {locale: string; namespace: string}) =>
    createTranslator({locale, messages: locale === "en-US" ? en : pt, namespace: namespace as "Intake.desk", onError: (error) => {throw error;}}),
}));

/** What a person reads: the markup without its tags and attributes. */
const visible = (markup: string) => markup.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ");

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
