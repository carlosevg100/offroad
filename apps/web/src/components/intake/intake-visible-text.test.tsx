import {createTranslator} from "next-intl";
import {renderToStaticMarkup} from "react-dom/server";
import {describe, expect, it, vi} from "vitest";

import {analyzeCreditPosition, buildDeskInputs, projectLeverageTrajectory, questionsForCompany, rateCredit, stressTable, type Fact} from "@offroad/credit-analysis";
import {informationClassSchema} from "@offroad/credit-ontology";
import {instrumentVerdicts} from "@offroad/credit-playbook";
import {designCollateralPackage} from "@offroad/deal-structure";
import {indicativePrice} from "@offroad/market-reference";
import {syntheticCreditMaterialsCase as fixture} from "@offroad/testing-fixtures/credit-materials-case";

import en from "../../../messages/en-US.json";
import pt from "../../../messages/pt-BR.json";
import {IntakeCommittee} from "./intake-committee";
import {IntakeDesk} from "./intake-desk";
import {leaks, visible} from "./visible-text.test-support";

vi.mock("next-intl/server", () => ({
  getTranslations: async ({locale, namespace}: {locale: string; namespace: string}) =>
    createTranslator({locale, messages: locale === "en-US" ? en : pt, namespace: namespace as "Intake", onError: (error) => {throw error;}}),
}));

/**
 * The visible text of the desk, the committee screen and the questions to the company, in both
 * languages, over the synthetic Aurora case (stage 19, second polish): no field path, no internal
 * identifier, no em dash or en dash, and no division printed as a number. The case screen is read the
 * same way in `intake-case.test.tsx`, where its own children are rendered apart.
 */
const facts: Fact[] = fixture.facts.map((fact) => ({fieldPath: fact.fieldPath, value: fact.value}));
const inputs = buildDeskInputs(facts, {referenceDate: fixture.referenceDate, indexLevels: fixture.indexLevels, statedRequest: fixture.statedRequest});
const desk = analyzeCreditPosition(inputs.desk!);
const trajectory = projectLeverageTrajectory(inputs.trajectory!);
const committee = {
  rating: rateCredit({desk, trajectory, ...fixture.rating}), stress: stressTable({desk, ...fixture.stress}),
  instruments: instrumentVerdicts({...fixture.instruments, archetypeId: fixture.capacity.archetypeId}),
  collateral: designCollateralPackage(fixture.collateral), price: indicativePrice(fixture.price),
};

describe("the visible text of the desk and the committee", () => {
  it.each(["pt-BR", "en-US"] as const)("prints no field path, identifier, dash or division (%s)", async (locale) => {
    const lang = locale === "en-US" ? "en" : "pt";
    const screens = {
      desk: visible(renderToStaticMarkup(await IntakeDesk({locale, desk, trajectory, deskMissing: inputs.missing, clientQuestions: questionsForCompany(desk, trajectory, inputs.missing)}))),
      committee: visible(renderToStaticMarkup(await IntakeCommittee({locale, ...committee}))),
    };
    for (const [screen, text] of Object.entries(screens)) expect(leaks(text), screen).toEqual([]);
    // Before: "Base: banda watch para ccb"; "Requires sa; the company is ltda."; "12 a 60 months"; "% a.a." in English.
    expect(screens.committee).toContain(lang === "pt" ? "Base: Cédula de Crédito Bancário (CCB); perfil analítico: atenção" : "Base: Bank credit note (CCB); analytical profile: watch");
    if (lang === "en") {
      expect(screens.committee).toContain("Requires a sociedade anônima; the company is a limitada.");
      expect(screens.committee).toContain("12 to 60 months");
      expect(`${screens.committee}${screens.desk}`).not.toMatch(/a\.a\.|\d a \d/);
    }
  });

  it("names every information class of a field under review in words, in both catalogs", () => {
    // Before: the review screen printed the class by its key with the underscores turned into spaces ("bank statement").
    for (const informationClass of informationClassSchema.options) {
      for (const catalog of [pt, en]) {
        const label = (catalog.Intake.review as unknown as Record<string, string>)[`informationClass_${informationClass}`];
        expect(label, informationClass).toBeTruthy();
        expect(leaks(label!)).toEqual([]);
      }
    }
  });
});
