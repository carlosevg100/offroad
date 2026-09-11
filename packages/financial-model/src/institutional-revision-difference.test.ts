import {describe, expect, it} from "vitest";

import {buildInstitutionalFinancialModel} from "./institutional-model";
import {institutionalInputFixture} from "./institutional-input.fixture";
import {prepareInstitutionalModelInput} from "./institutional-input";
import {reviewInstitutionalFinancialModel} from "./review";
import {buildInstitutionalWorkbookArtifact} from "./institutional-workbook";
import {institutionalRevisionDifference} from "./institutional-revision-difference";
import type {ApprovedInstitutionalScenario} from "./institutional-runtime";

function approvedScenario(mutate?: (fixture: ReturnType<typeof institutionalInputFixture>) => void): ApprovedInstitutionalScenario {
  const fixture = institutionalInputFixture();
  mutate?.(fixture);
  const prepared = prepareInstitutionalModelInput(fixture);
  const model = buildInstitutionalFinancialModel(prepared.input!);
  return {
    configurationId: "11111111-1111-4111-8111-111111111111", revision: 1,
    configurationFingerprint: prepared.configurationFingerprint,
    reviewedBy: "22222222-2222-4222-8222-222222222222", reviewedAt: "2026-09-10T03:00:00Z",
    prepared, model, review: reviewInstitutionalFinancialModel(prepared.input!, model),
    sourceBindings: fixture.sources.map(source => ({
      ...source, currency: "BRL", amountScale: "units" as const,
      metadataEvidence: {locator: "Page 1", rationale: "Reviewed normalized monetary units"},
      reviewedBy: "22222222-2222-4222-8222-222222222222", reviewedAt: "2026-09-10T03:00:00Z",
    })),
  };
}

const manifest = "a".repeat(64);
/** The fixture is read-only by design; a test that edits a premise says so out loud. */
const editable = (values: Readonly<Record<string, string>>) => values as Record<string, string>;

describe("difference between approved revisions", () => {
  it("names the assumption that moved, the year it moved in, and what it did to the outputs", async () => {
    const previousScenario = approvedScenario();
    const currentScenario = approvedScenario(fixture => {
      editable(fixture.configuration.assumptionBook.assumptions.find(a => a.id === "cost-ratio")!.values)["2027"] = "0.45";
    });
    const previous = await buildInstitutionalWorkbookArtifact([previousScenario], manifest);
    const current = await buildInstitutionalWorkbookArtifact([currentScenario], manifest);

    const difference = institutionalRevisionDifference({id: "previous", artifact: previous}, {id: "current", artifact: current});
    expect(difference).not.toBeNull();
    expect(difference!.limits).toEqual([]);
    expect(difference!.comparedPeriods).toEqual(["2027", "2028", "2029", "2030"]);

    // Only the assumption that actually moved is reported, and only for the year it moved in.
    expect(difference!.assumptions).toHaveLength(1);
    expect(difference!.assumptions[0]).toMatchObject({assumptionId: "cost-ratio", period: "2027", unit: "percent", previous: "0.5", current: "0.45"});
    expect(difference!.assumptions[0]!.difference).toBe("-0.05");
    expect(difference!.assumptions[0]!.relativeChange).toBe("-0.1");

    // The outputs move with it, exactly, and revenue never does.
    const ebitda2027 = difference!.outputs.find(output => output.metric === "ebitda" && output.period === "2027");
    expect(ebitda2027).toBeDefined();
    expect(ebitda2027!.difference).toBe("18.25");
    expect(difference!.outputs.some(output => output.metric === "revenue")).toBe(false);
    expect(ebitda2027!.previous).toBe(previousScenario.model.periods[0]!.ebitda);
    expect(ebitda2027!.current).toBe(currentScenario.model.periods[0]!.ebitda);
  });

  it("reports no change between a revision and itself", async () => {
    const artifact = await buildInstitutionalWorkbookArtifact([approvedScenario()], manifest);
    const difference = institutionalRevisionDifference({id: "a", artifact}, {id: "b", artifact});
    expect(difference!.assumptions).toEqual([]);
    expect(difference!.outputs).toEqual([]);
    expect(difference!.limits).toEqual([]);
  });

  it("refuses to compare an artifact it cannot reproduce", async () => {
    const artifact = await buildInstitutionalWorkbookArtifact([approvedScenario()], manifest);
    const tampered = structuredClone(artifact);
    tampered.institutional.scenarios[0]!.input.openingBalanceSheet.unrestrictedCash = "777";
    expect(institutionalRevisionDifference({id: "a", artifact: tampered}, {id: "b", artifact})).toBeNull();
    expect(institutionalRevisionDifference({id: "a", artifact}, {id: "b", artifact: {not: "an artifact"}})).toBeNull();
  });

  it("does not convert currencies and says so instead", async () => {
    const previous = await buildInstitutionalWorkbookArtifact([approvedScenario()], manifest);
    const current = await buildInstitutionalWorkbookArtifact([approvedScenario(fixture => {
      fixture.configuration.currency = "USD";
      for (const source of fixture.sources) source.currency = "USD";
    })], manifest);
    const difference = institutionalRevisionDifference({id: "previous", artifact: previous}, {id: "current", artifact: current});
    expect(difference!.limits).toContain("currency_changed");
    expect(difference!.currency).toEqual({previous: "BRL", current: "USD"});
    expect(difference!.outputs).toEqual([]);
  });

  it("does not interpolate a period that exists on only one side", async () => {
    const previous = await buildInstitutionalWorkbookArtifact([approvedScenario()], manifest);
    const current = await buildInstitutionalWorkbookArtifact([approvedScenario(fixture => {
      const book = fixture.configuration.assumptionBook;
      book.periods = book.periods.filter(period => period !== "2030");
      for (const assumption of book.assumptions) delete editable(assumption.values)["2030"];
      for (const instrument of fixture.configuration.debtInstruments) instrument.periods = instrument.periods.filter(p => p.period !== "2030");
      fixture.configuration.debtRateLineage = fixture.configuration.debtRateLineage.filter(line => line.period !== "2030");
    })], manifest);
    const difference = institutionalRevisionDifference({id: "previous", artifact: previous}, {id: "current", artifact: current});
    expect(difference!.limits).toContain("periods_changed");
    expect(difference!.comparedPeriods).toEqual(["2027", "2028", "2029"]);
    expect(difference!.outputs.every(output => output.period !== "2030")).toBe(true);
    // The year that disappeared is still reported at the assumption level, with no invented value.
    const dropped = difference!.assumptions.filter(assumption => assumption.period === "2030");
    expect(dropped.length).toBeGreaterThan(0);
    expect(dropped.every(assumption => assumption.current === null && assumption.difference === null)).toBe(true);
  });
});
