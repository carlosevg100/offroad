import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {dirname, join} from "node:path";
import {fileURLToPath} from "node:url";
import {gunzipSync} from "node:zlib";

import {
  calculateAdjustedDebtBridge,
  calculateDynamicReceivablesMetrics,
  calculateImplicitAdvanceRate,
  calculateSingleMaturityReceivablesProposal,
  calculateStaticReceivablesMetrics,
  convertReceivablesRate,
  receivablesAgingBuckets,
  receivablesRollDestinations,
  receivablesVintageHorizons,
  type AdjustedDebtBridgeInput,
  type ConcentrationCut,
  type GovernedRateAssumption,
  type MeasuredMetric,
  type ReceivablesAgingBucket,
  type ReceivablesProposalCharge,
  type ReceivablesUniverse,
} from "@offroad/financial-core";
import {analyzeReceivablesPhaseOne} from "@offroad/receivables-analysis";
import {describe, expect, it} from "vitest";

type ExpectedStatic = {
  version: string;
  reportingDate: string;
  latestOriginationDate: string;
  dataStartDate: string;
  portfolio: Record<string, string>;
  aging: Record<ReceivablesAgingBucket, string>;
  concentration: Record<string, Record<ConcentrationCut | "herfindahl", string>>;
};

type ExpectedDynamic = {
  version: string;
  rollRates: Array<{
    fromDate: string;
    toDate: string;
    rows: Record<ReceivablesAgingBucket, {
      sourceExposure: string;
      transitions: Record<string, {amount: string; rate: string | null}>;
    }>;
  }>;
  vintages: Array<{
    cohortMonth: string;
    titleCount: number;
    faceValue: string;
    horizons: Record<string, {unresolvedAmount: string | null; unresolvedShare: string | null}>;
  }>;
  summary: Record<string, string | null>;
};

type VertentesManifest = {
  synthetic: boolean;
  counts: {rawFiles: number; receivables: number; obligors: number; economicGroups: number; settlements: number; dilutions: number; extensions: number};
  rawFiles: Array<{path: string; bytes: number; sha256: string}>;
  reservedTruth: Array<{path: string; bytes: number; sha256: string}>;
  expectedFiles: Array<{path: string; bytes: number; sha256: string}>;
  normalized: {path: string; bytes: number; sha256: string; uncompressedBytes: number; uncompressedSha256: string};
};

type IllustrativeEligibility = {
  status: string;
  exclusiveExclusions: Record<"past_due_over_30" | "related_party" | "cancelled_invoice" | "economic_group_concentration" | "total", string>;
  eligibleOpenValue: string;
  eligibleShare: string;
};

type StructureCostInput = {
  version: string;
  reportingDate: "2026-06-30";
  universeId: string;
  currency: string;
  debt: Omit<AdjustedDebtBridgeInput, "reportingDate" | "currency" | "universeId" | "datasetHash">;
  rateScenarios: {
    primeFactoring: {
      faceValue: string;
      startDate: "2026-01-01";
      maturityDate: "2026-02-12";
      calendarDays: number;
      monthlyOutsideDiscountRate: string;
      adValoremRate: string;
      source: ReceivablesProposalCharge["source"];
    };
    institutionalIllustration: {
      faceValue: string;
      calendarDays: number;
      businessDays: number;
      annualRates: readonly string[];
      source: ReceivablesProposalCharge["source"];
    };
  };
  advanceRateScenario: {
    periodStart: "2024-07-01";
    expectedDilution: string;
    expectedDilutionBasis: string;
    dilutionStressMultiplier: string;
    expectedLossRate: string;
    expectedLossBasis: string;
    lossStressMultiplier: string;
    operationalReserve: string;
    status: string;
  };
};

type ExpectedStructureCost = {
  version: string;
  debt: Record<string, string>;
  primeFactoring: Record<string, string>;
  institutionalIllustration: Record<string, string>;
  advanceRateScenario: Record<string, string>;
  legacyCorrections: readonly string[];
};

const here = dirname(fileURLToPath(import.meta.url));
const packageRoot = join(here, "..");
const goldRoot = join(packageRoot, "gold", "vertentes");
const rawRoot = join(packageRoot, "assets", "vertentes", "raw", "empresa");
const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, "utf8")) as T;
const manifest = readJson<VertentesManifest>(join(goldRoot, "manifest.json"));
const compressed = readFileSync(join(goldRoot, manifest.normalized.path));
const uncompressed = gunzipSync(compressed);
const universe = JSON.parse(uncompressed.toString("utf8")) as ReceivablesUniverse;
const expected = readJson<ExpectedStatic>(join(goldRoot, "expected", "static-metrics.json"));
const expectedDynamic = readJson<ExpectedDynamic>(join(goldRoot, "expected", "dynamic-metrics.json"));
const illustrativeEligibility = readJson<IllustrativeEligibility>(join(goldRoot, "expected", "illustrative-eligibility.json"));
const structureCostInput = readJson<StructureCostInput>(join(goldRoot, "source", "structure-cost-input.json"));
const expectedStructureCost = readJson<ExpectedStructureCost>(join(goldRoot, "expected", "structure-cost.json"));

const cents = (value: string) => {
  const [integer = "0", fraction = ""] = value.split(".");
  return BigInt(integer) * 100n + BigInt((fraction + "00").slice(0, 2));
};
const fixed8 = (value: string) => {
  const [integer = "0", fraction = ""] = value.split(".");
  return BigInt(integer) * 100_000_000n + BigInt((fraction + "00000000").slice(0, 8));
};
const measuredValue = (metric: MeasuredMetric) => {
  expect(metric.status).toBe("measured");
  expect(metric.value).not.toBeNull();
  return metric.value!;
};

function allMetrics(result: ReturnType<typeof calculateStaticReceivablesMetrics>): MeasuredMetric[] {
  return [
    ...Object.values(result.portfolio),
    ...Object.values(result.aging),
    ...Object.values(result.concentration.trailing365ByObligor),
    ...Object.values(result.concentration.trailing365ByEconomicGroup),
    ...Object.values(result.concentration.openByObligor),
    ...Object.values(result.concentration.openByEconomicGroup),
  ];
}

function dynamicValues(result: ReturnType<typeof calculateDynamicReceivablesMetrics>): ExpectedDynamic {
  return {
    version: result.version,
    rollRates: result.rollRates.periods.map((period) => ({
      fromDate: period.fromDate,
      toDate: period.toDate,
      rows: Object.fromEntries(receivablesAgingBuckets.map((bucket) => [bucket, {
        sourceExposure: period.rows[bucket].sourceExposure,
        transitions: Object.fromEntries(receivablesRollDestinations.map((destination) => [destination, {
          amount: period.rows[bucket].transitions[destination].amount,
          rate: period.rows[bucket].transitions[destination].rate.value,
        }])),
      }])) as ExpectedDynamic["rollRates"][number]["rows"],
    })),
    vintages: result.vintages.cohorts.map((cohort) => ({
      cohortMonth: cohort.cohortMonth,
      titleCount: cohort.titleCount,
      faceValue: cohort.faceValue,
      horizons: Object.fromEntries(receivablesVintageHorizons.map((horizon) => [String(horizon), {
        unresolvedAmount: cohort.horizons[horizon].unresolvedAmount,
        unresolvedShare: cohort.horizons[horizon].unresolvedShare.value,
      }])),
    })),
    summary: {
      dilutionAmount: result.dilution.totalAmount.value,
      dilutionShareOfOrigination: result.dilution.shareOfOrigination.value,
      repurchasedAmount: result.repurchaseAndLoss.repurchasedAmount.value,
      repurchaseShareOfAssigned: result.repurchaseAndLoss.repurchaseShareOfAssigned.value,
      finalWrittenOffAmount: result.repurchaseAndLoss.finalWrittenOffAmount.value,
      finalWrittenOffShare: result.repurchaseAndLoss.finalWrittenOffShare.value,
      adjustedLossAmount: result.repurchaseAndLoss.adjustedLossAmount.value,
      adjustedLossShare: result.repurchaseAndLoss.adjustedLossShare.value,
      dueTitleCount: result.punctualSettlement.dueTitleCount.value,
      dueFaceValue: result.punctualSettlement.dueFaceValue.value,
      punctualByCount: result.punctualSettlement.punctualByCount.value,
      punctualByValue: result.punctualSettlement.punctualByValue.value,
      extendedTitleCount: result.extensions.extendedTitleCount.value,
      extendedTitleShare: result.extensions.extendedTitleShare.value,
      extendedFaceValue: result.extensions.extendedFaceValue.value,
      extendedFaceShare: result.extensions.extendedFaceShare.value,
      weightedExtensionDays: result.extensions.weightedExtensionDays.value,
    },
  };
}

function allDynamicMetrics(result: ReturnType<typeof calculateDynamicReceivablesMetrics>): MeasuredMetric[] {
  return [
    ...result.rollRates.periods.flatMap((period) => Object.values(period.rows).flatMap((row) => Object.values(row.transitions).map((transition) => transition.rate))),
    ...result.vintages.cohorts.flatMap((cohort) => receivablesVintageHorizons.map((horizon) => cohort.horizons[horizon].unresolvedShare)),
    result.dilution.totalAmount,
    result.dilution.shareOfOrigination,
    ...Object.values(result.dilution.byReason).flatMap((reason) => [reason.amount, reason.shareOfOrigination]),
    ...Object.values(result.repurchaseAndLoss),
    ...Object.values(result.punctualSettlement),
    ...Object.values(result.extensions),
  ];
}

describe("Vertentes A1-03 gold", () => {
  it("preserves the complete raw room and the reserved truth by hash", () => {
    expect(manifest.synthetic).toBe(true);
    expect(manifest.counts).toEqual({
      rawFiles: 21,
      receivables: 34397,
      obligors: 1200,
      economicGroups: 1199,
      settlements: 30734,
      dilutions: 4840,
      extensions: 340,
    });
    for (const file of manifest.rawFiles) {
      const bytes = readFileSync(join(rawRoot, file.path));
      expect(bytes.byteLength, file.path).toBe(file.bytes);
      expect(sha256(bytes), file.path).toBe(file.sha256);
    }
    for (const file of manifest.reservedTruth) {
      const bytes = readFileSync(join(goldRoot, file.path));
      expect(bytes.byteLength, file.path).toBe(file.bytes);
      expect(sha256(bytes), file.path).toBe(file.sha256);
    }
    for (const file of manifest.expectedFiles) {
      const bytes = readFileSync(join(goldRoot, "expected", file.path));
      expect(bytes.byteLength, file.path).toBe(file.bytes);
      expect(sha256(bytes), file.path).toBe(file.sha256);
    }
    expect(compressed.byteLength).toBe(manifest.normalized.bytes);
    expect(sha256(compressed)).toBe(manifest.normalized.sha256);
    expect(uncompressed.byteLength).toBe(manifest.normalized.uncompressedBytes);
    expect(sha256(uncompressed)).toBe(manifest.normalized.uncompressedSha256);
  });

  it("keeps the illustrative eligibility scenario exclusive and explicitly estimated", () => {
    const exclusions = illustrativeEligibility.exclusiveExclusions;
    const allocated = fixed8(exclusions.past_due_over_30)
      + fixed8(exclusions.related_party)
      + fixed8(exclusions.cancelled_invoice)
      + fixed8(exclusions.economic_group_concentration);
    expect(allocated).toBe(fixed8(exclusions.total));
    expect(fixed8(illustrativeEligibility.eligibleOpenValue) + allocated).toBe(fixed8(expected.portfolio.totalOpenValue!));
    expect(illustrativeEligibility.eligibleShare).toBe("0.74619108");
    expect(illustrativeEligibility.status).toBe("estimated_policy_not_buyer_confirmed");
  });

  it("keeps reporting, origination and data interval dates economically distinct", () => {
    expect(universe.dates.reportingDate).toBe(expected.reportingDate);
    expect(universe.dates.latestOriginationDate).toBe(expected.latestOriginationDate);
    expect(universe.dates.dataStartDate).toBe(expected.dataStartDate);
    expect(universe.dates.reportingDate).not.toBe(universe.dates.latestOriginationDate);
    expect(universe.extensions).toHaveLength(340);
    expect(universe.extensions.every((event) => event.date === null)).toBe(true);
    expect(universe.receivables.filter((item) => item.originalDueDate !== item.currentDueDate)).toHaveLength(340);
  });

  it("matches every approved static metric exactly", () => {
    const result = calculateStaticReceivablesMetrics(universe, {datasetHash: manifest.normalized.uncompressedSha256});
    expect(result.version).toBe(expected.version);
    expect(result.portfolio.titleCount.value).toBe(expected.portfolio.titleCount);
    expect(result.portfolio.totalFaceValue.value).toBe(expected.portfolio.totalFaceValue);
    expect(result.portfolio.trailing365Origination.value).toBe(expected.portfolio.trailing365Origination);
    expect(result.portfolio.averageTicket.value).toBe(expected.portfolio.averageTicket);
    expect(result.portfolio.totalOpenValue.value).toBe(expected.portfolio.totalOpenValue);
    expect(result.portfolio.weightedOriginalTermDays.value).toBe(expected.portfolio.weightedOriginalTermDays);
    expect(result.portfolio.weightedCurrentTermDays.value).toBe(expected.portfolio.weightedCurrentTermDays);
    expect(result.portfolio.weightedRemainingTermDays.value).toBe(expected.portfolio.weightedRemainingTermDays);
    expect(result.portfolio.simpleDsoDays.value).toBe(expected.portfolio.simpleDsoDays);
    expect(result.portfolio.countbackDsoDays.value).toBe(expected.portfolio.countbackDsoDays);

    for (const bucket of receivablesAgingBuckets) expect(result.aging[bucket].value, bucket).toBe(expected.aging[bucket]);
    for (const [scope, cuts] of Object.entries(expected.concentration)) {
      const actual = result.concentration[scope as keyof typeof result.concentration];
      for (const [cut, value] of Object.entries(cuts)) {
        expect(actual[cut as keyof typeof actual].value, `${scope}.${cut}`).toBe(value);
      }
    }
  }, 10_000);

  it("reconciles static invariants and emits complete measured provenance", () => {
    const result = calculateStaticReceivablesMetrics(universe, {datasetHash: manifest.normalized.uncompressedSha256});
    const agingTotal = Object.values(result.aging).reduce((total, metric) => total + cents(measuredValue(metric)), 0n);
    expect(agingTotal).toBe(cents(measuredValue(result.portfolio.totalOpenValue)));
    for (const scope of Object.values(result.concentration)) {
      expect(Number(measuredValue(scope.top_1))).toBeLessThanOrEqual(Number(measuredValue(scope.top_5)));
      expect(Number(measuredValue(scope.top_5))).toBeLessThanOrEqual(Number(measuredValue(scope.top_10)));
      expect(Number(measuredValue(scope.top_10))).toBeLessThanOrEqual(Number(measuredValue(scope.top_50)));
      expect(Number(measuredValue(scope.top_50))).toBeLessThanOrEqual(1);
    }
    for (const metric of allMetrics(result)) {
      expect(metric.provenance.kind).toBe("measured");
      expect(metric.provenance.datasetHash).toBe(manifest.normalized.uncompressedSha256);
      expect(metric.provenance.anchors.length).toBeGreaterThan(0);
      expect(metric.provenance.universe.length).toBeGreaterThan(0);
      expect(metric.provenance.formula.version).toBe(expected.version);
    }
  }, 10_000);

  it("replays deterministically regardless of title order", () => {
    const first = calculateStaticReceivablesMetrics(universe, {datasetHash: manifest.normalized.uncompressedSha256});
    const reversed: ReceivablesUniverse = {...universe, receivables: [...universe.receivables].reverse()};
    const second = calculateStaticReceivablesMetrics(reversed, {datasetHash: manifest.normalized.uncompressedSha256});
    expect(second).toEqual(first);
  }, 10_000);

  it("matches the independent dynamic oracle for every roll, vintage and portfolio metric", () => {
    const result = calculateDynamicReceivablesMetrics(universe, {datasetHash: manifest.normalized.uncompressedSha256});
    expect(result.rollRates.status).toBe("measured");
    expect(result.vintages.status).toBe("measured");
    expect(dynamicValues(result)).toEqual(expectedDynamic);
  }, 20_000);

  it("reconciles dynamic invariants and keeps provenance on every cell", () => {
    const result = calculateDynamicReceivablesMetrics(universe, {datasetHash: manifest.normalized.uncompressedSha256});
    for (const period of result.rollRates.periods) {
      for (const row of Object.values(period.rows)) {
        const amounts = receivablesRollDestinations.reduce((total, destination) => total + fixed8(row.transitions[destination].amount), 0n);
        expect(amounts).toBe(fixed8(row.sourceExposure));
        if (row.sourceExposure !== "0") {
          const rates = receivablesRollDestinations.reduce((total, destination) => total + fixed8(measuredValue(row.transitions[destination].rate)), 0n);
          expect(Number(rates)).toBeCloseTo(100_000_000, -1);
        }
      }
    }
    for (const cohort of result.vintages.cohorts) {
      const observed = receivablesVintageHorizons
        .map((horizon) => cohort.horizons[horizon].unresolvedShare)
        .filter((metric) => metric.status === "measured")
        .map((metric) => Number(measuredValue(metric)));
      for (let index = 1; index < observed.length; index += 1) expect(observed[index]).toBeLessThanOrEqual(observed[index - 1]!);
    }
    for (const metric of allDynamicMetrics(result)) {
      expect(metric.provenance.datasetHash).toBe(manifest.normalized.uncompressedSha256);
      expect(metric.provenance.anchors.length).toBeGreaterThan(0);
      expect(metric.provenance.formula.version).toBe(expectedDynamic.version);
    }
    expect(result.repurchaseAndLoss.repurchaseShareOfAssigned.status).toBe("not_evaluable");
    expect(result.repurchaseAndLoss.repurchaseShareOfAssigned.warnings).toContain("assigned_volume_denominator_unavailable_or_incomplete");
    expect(result.quality.warnings).toContain("extension timing series cannot be calculated");
  }, 20_000);

  it("replays dynamic metrics identically regardless of input ordering", () => {
    const first = calculateDynamicReceivablesMetrics(universe, {datasetHash: manifest.normalized.uncompressedSha256});
    const reversed: ReceivablesUniverse = {
      ...universe,
      receivables: [...universe.receivables].reverse(),
      settlements: [...universe.settlements].reverse(),
      dilutions: [...universe.dilutions].reverse(),
      extensions: [...universe.extensions].reverse(),
    };
    const second = calculateDynamicReceivablesMetrics(reversed, {datasetHash: manifest.normalized.uncompressedSha256});
    expect(second).toEqual(first);
  }, 20_000);

  it("matches the independent debt, rate, CET and advance-rate oracle", () => {
    const debt = calculateAdjustedDebtBridge({
      ...structureCostInput.debt,
      reportingDate: structureCostInput.reportingDate,
      currency: structureCostInput.currency,
      universeId: structureCostInput.universeId,
      datasetHash: manifest.normalized.uncompressedSha256,
    });
    expect(debt.version).toBe(expectedStructureCost.version);
    expect({
      companyDeclaredDebt: debt.companyDeclaredDebt.value,
      declaredPositionSubtotal: debt.declaredPositionSubtotal.value,
      identifiedNotDeclaredSubtotal: debt.identifiedNotDeclaredSubtotal.value,
      declaredPositionMismatch: debt.declaredPositionMismatch.value,
      adjustedGrossDebt: debt.adjustedGrossDebt.value,
      adjustmentToCompanyDeclaration: debt.adjustmentToCompanyDeclaration.value,
      cash: debt.cash.value,
      adjustedNetDebt: debt.adjustedNetDebt.value,
      ebitdaForLeverage: debt.ebitdaForLeverage.value,
      ebitdaBasis: structureCostInput.debt.ebitdaForLeverage.basis,
      adjustedNetLeverage: debt.adjustedNetLeverage.value,
    }).toEqual(expectedStructureCost.debt);
    expect(debt.quality.warnings).toContain("financial obligations identified outside the company-declared debt amount");
    expect(debt.ebitdaForLeverage.period).toMatchObject({startDate: "2025-01-01", endDate: "2025-12-31"});
    expect(debt.adjustedGrossDebt.provenance.anchors.length).toBeGreaterThanOrEqual(9);

    const factoringInput = structureCostInput.rateScenarios.primeFactoring;
    const factoring = calculateSingleMaturityReceivablesProposal({
      reportingDate: structureCostInput.reportingDate,
      universeId: structureCostInput.universeId,
      datasetHash: manifest.normalized.uncompressedSha256,
      currency: structureCostInput.currency,
      faceValue: factoringInput.faceValue,
      startDate: factoringInput.startDate,
      maturityDate: factoringInput.maturityDate,
      quote: {regime: "outside_simple_monthly", monthlyDiscountRate: factoringInput.monthlyOutsideDiscountRate},
      charges: [{id: "ad-valorem", kind: "ad_valorem_face_fee", rate: factoringInput.adValoremRate, source: factoringInput.source}],
      taxTreatment: {status: "not_provided"},
      source: factoringInput.source,
    });
    expect({
      sourceRegime: factoring.rateConversion.sourceRegime,
      acquisitionPriceBeforeFees: factoring.rateConversion.acquisitionPrice.value,
      discountAmount: factoring.rateConversion.discountAmount.value,
      discountShareOfFace: factoring.rateConversion.discountShareOfFace.value,
      effectivePeriodRateBeforeFees: factoring.rateConversion.effectivePeriodRate.value,
      effectiveMonthlyRateBeforeFees: factoring.rateConversion.effectiveMonthlyRate.value,
      effectiveAnnualRateBeforeFees: factoring.rateConversion.effectiveAnnualRate.value,
      adValoremFee: factoring.chargeAmounts[0]?.amount,
      netInitialProceeds: factoring.cet.netInitialProceeds.value,
      cetMonthly: factoring.cet.effectiveMonthlyRate.value,
      cetAnnual: factoring.cet.effectiveAnnualRate.value,
      taxInputStatus: factoringInput === undefined ? "unreachable" : "not_provided",
    }).toEqual(expectedStructureCost.primeFactoring);
    expect(factoring.cet.status).toBe("calculated_with_missing_tax_input");

    const institutionalInput = structureCostInput.rateScenarios.institutionalIllustration;
    const institutional = convertReceivablesRate({
      reportingDate: structureCostInput.reportingDate,
      universeId: structureCostInput.universeId,
      datasetHash: manifest.normalized.uncompressedSha256,
      currency: structureCostInput.currency,
      faceValue: institutionalInput.faceValue,
      calendarDays: institutionalInput.calendarDays,
      quote: {regime: "inside_compound_annual_business", annualRates: institutionalInput.annualRates, businessDays: institutionalInput.businessDays},
      source: institutionalInput.source,
    });
    expect({
      sourceRegime: institutional.sourceRegime,
      acquisitionPrice: institutional.acquisitionPrice.value,
      discountAmount: institutional.discountAmount.value,
      effectivePeriodRate: institutional.effectivePeriodRate.value,
      effectiveMonthlyRate: institutional.effectiveMonthlyRate.value,
      effectiveAnnualRate: institutional.effectiveAnnualRate.value,
    }).toEqual(expectedStructureCost.institutionalIllustration);

    const dynamic = calculateDynamicReceivablesMetrics(universe, {datasetHash: manifest.normalized.uncompressedSha256});
    const scenario = structureCostInput.advanceRateScenario;
    expect(dynamic.dilution.shareOfOrigination.value).toBe(scenario.expectedDilution);
    expect(dynamic.repurchaseAndLoss.adjustedLossShare.value).toBe(scenario.expectedLossRate);
    const estimated = (id: string, value: string, method: string, basis = method): GovernedRateAssumption => ({
      id,
      value,
      basis,
      provenance: {
        kind: "estimated",
        method,
        sources: ["Vertentes governed scenario"],
        asOf: structureCostInput.reportingDate,
        owner: "credit desk",
        confidence: "medium",
        validUntil: "2026-09-30",
      },
    });
    const advanceRate = calculateImplicitAdvanceRate({
      reportingDate: structureCostInput.reportingDate,
      periodStart: scenario.periodStart,
      universeId: structureCostInput.universeId,
      expectedDilution: estimated(
        "expected-dilution",
        dynamic.dilution.shareOfOrigination.value!,
        "measured historical dilution used as a governed forward proxy",
        scenario.expectedDilutionBasis,
      ),
      dilutionStressMultiplier: estimated("dilution-stress", scenario.dilutionStressMultiplier, "scenario stress on measured dilution"),
      expectedLossRate: estimated(
        "expected-loss",
        dynamic.repurchaseAndLoss.adjustedLossShare.value!,
        "portfolio adjusted loss share used as an explicit proxy until a mature-cohort expected loss is governed",
        scenario.expectedLossBasis,
      ),
      lossStressMultiplier: estimated("loss-stress", scenario.lossStressMultiplier, "scenario stress on measured adjusted loss"),
      operationalReserve: estimated("operational-reserve", scenario.operationalReserve, "scenario operating reserve"),
    });
    expect({
      status: scenario.status,
      stressedDilutionReserve: advanceRate.stressedDilutionReserve.value,
      stressedLossReserve: advanceRate.stressedLossReserve.value,
      operationalReserve: advanceRate.operationalReserve.value,
      totalReserve: advanceRate.totalReserve.value,
      implicitAdvanceRate: advanceRate.implicitAdvanceRate.value,
    }).toEqual(expectedStructureCost.advanceRateScenario);
    expect(advanceRate.implicitAdvanceRate.inputs.map((item) => item.provenance.kind)).toEqual([
      "estimated",
      "estimated",
      "estimated",
      "estimated",
      "estimated",
    ]);
  }, 30_000);

  it("assembles the Phase 1 audit report without turning analysis into buyer direction", () => {
    const factoring = structureCostInput.rateScenarios.primeFactoring;
    const scenario = structureCostInput.advanceRateScenario;
    const estimated = (id: string, value: string, method: string, basis = method): GovernedRateAssumption => ({
      id,
      value,
      basis,
      provenance: {
        kind: "estimated",
        method,
        sources: ["Vertentes governed scenario"],
        asOf: structureCostInput.reportingDate,
        owner: "credit desk",
        confidence: "medium",
        validUntil: "2026-09-30",
      },
    });
    const report = analyzeReceivablesPhaseOne({
      universe,
      datasetHash: manifest.normalized.uncompressedSha256,
      adjustedDebt: structureCostInput.debt,
      proposals: [{
        id: "prime-factoring",
        proposal: {
          faceValue: factoring.faceValue,
          startDate: factoring.startDate,
          maturityDate: factoring.maturityDate,
          quote: {regime: "outside_simple_monthly", monthlyDiscountRate: factoring.monthlyOutsideDiscountRate},
          charges: [{id: "ad-valorem", kind: "ad_valorem_face_fee", rate: factoring.adValoremRate, source: factoring.source}],
          taxTreatment: {status: "not_provided"},
          source: factoring.source,
        },
      }],
      advanceRate: {
        periodStart: scenario.periodStart,
        expectedDilution: estimated(
          "expected-dilution",
          scenario.expectedDilution,
          "measured historical dilution used as a governed forward proxy",
          scenario.expectedDilutionBasis,
        ),
        expectedLossRate: estimated(
          "expected-loss",
          scenario.expectedLossRate,
          "portfolio adjusted loss share used as an explicit proxy until a mature-cohort expected loss is governed",
          scenario.expectedLossBasis,
        ),
        dilutionStressMultiplier: estimated("dilution-stress", scenario.dilutionStressMultiplier, "scenario stress on measured dilution"),
        lossStressMultiplier: estimated("loss-stress", scenario.lossStressMultiplier, "scenario stress on measured adjusted loss"),
        operationalReserve: estimated("operational-reserve", scenario.operationalReserve, "scenario operating reserve"),
      },
    });

    expect(report.quality.status).toBe("incomplete");
    expect(report.quality.blockers).toEqual([
      "coverage:assignmentsAndLiens:not_provided",
      "coverage:extensions:partial",
      "metric:repurchase.share_of_assigned:not_evaluable",
      "proposal:prime-factoring:complete_cet_not_available",
    ]);
    expect(report.proposals[0]?.result.cet.effectiveAnnualRate.value).toBe(expectedStructureCost.primeFactoring.cetAnnual);
    expect(report.adjustedDebt?.adjustedNetLeverage.value).toBe(expectedStructureCost.debt.adjustedNetLeverage);
    expect(report.implicitAdvanceRate?.implicitAdvanceRate.value).toBe(expectedStructureCost.advanceRateScenario.implicitAdvanceRate);
    expect(report.implicitAdvanceRate?.implicitAdvanceRate.inputs[2]?.basis).toBe(scenario.expectedLossBasis);
    expect(report.boundaries).toEqual({
      externalDirectionAllowed: false,
      buyerRecommendationAllowed: false,
      qualifiedIntroductionAllowed: false,
      creditApprovalExpressed: false,
    });
  }, 30_000);
});
