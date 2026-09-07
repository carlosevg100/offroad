import Decimal from "decimal.js";
import {
  receivablesCaseSchema,
  type Receivable,
  type ReceivablesCase,
} from "@offroad/receivables-analysis";

const DAY = 86_400_000;

/**
 * Builds deliberately synthetic inputs for test harnesses that do not exercise document
 * extraction. It is kept in @offroad/testing-fixtures because it invents policy, evidence,
 * registration, encumbrance and structure facts. Production code must compile those fields from
 * governed evidence or leave them missing; it must never call this helper.
 */
export function buildSyntheticReceivablesCase(input: {
  id: string;
  referenceDate: string;
  cedentName: string;
  tape: Array<{receivableId: string; debtorId: string; balance: string; daysPastDue: number}>;
}): ReceivablesCase {
  const reference = Date.parse(`${input.referenceDate}T00:00:00.000Z`);
  const portfolio = input.tape.map((item, index): Receivable => {
    const due = new Date(reference - item.daysPastDue * DAY);
    if (item.daysPastDue === 0) due.setUTCDate(due.getUTCDate() + 60 + (index % 60));
    const origin = new Date(reference - (450 + (index % 90)) * DAY);
    return {
      id: item.receivableId,
      debtorId: item.debtorId,
      debtorGroupId: item.debtorId,
      debtorSector: "synthetic_test_sector",
      originDate: origin.toISOString().slice(0, 10),
      dueDate: due.toISOString().slice(0, 10),
      originalAmount: item.balance,
      outstandingBalance: item.balance,
      paidAmount: "0",
      collectedInPeriod: "0",
      defaultedBalance: item.daysPastDue > 90 ? item.balance : "0",
      recoveredInPeriod: item.daysPastDue > 90 ? new Decimal(item.balance).times("0.35").toFixed(2) : "0",
      dilutionInPeriod: "0",
      repurchasedInPeriod: "0",
      substitutedInPeriod: "0",
      assignable: true,
      evidenceVerified: true,
      registration: "registered",
      encumbrance: "free",
      disputed: false,
      relatedParty: false,
      sourceDocumentId: "synthetic-receivables-aging.csv",
      sourceAnchor: `synthetic-row:${item.receivableId}`,
      anchorVerified: true,
    };
  });
  const total = portfolio.reduce((sum, item) => sum.plus(item.outstandingBalance), new Decimal(0));
  return receivablesCaseSchema.parse({
    schemaVersion: "2026.08.24-v1",
    id: input.id,
    referenceDate: input.referenceDate,
    cedent: {id: "synthetic-cedent", legalName: input.cedentName, servicingRole: "cedent"},
    portfolio,
    cashReceipts: [],
    accounting: {grossReceivablesBalance: total.toFixed(2), allowanceBalance: "0", reportedCollectionsInPeriod: "0"},
    policy: {
      maxDaysPastDue: 90, maxRemainingTermDays: 365, minSeasoningDays: 30,
      requireAssignable: true, requireEvidenceVerified: true,
      registrationRule: "required_when_applicable", excludeDisputed: true,
      excludeRelatedParties: true, excludeEncumbered: true, allowedDebtorSectors: [],
      maxSingleDebtorShare: "0.20", maxDebtorGroupShare: "0.25", minimumEligibleShare: "0.60",
      minimumEvidenceCoverage: "0.90", minimumRegistrationCoverage: "0.90",
      maximumDelinquency30Share: "0.15", maximumDilutionShare: "0.05",
      maximumRepurchaseShare: "0.08", minimumRecoveryRate: "0.25",
      maximumAccountingMismatchShare: "0.01", maximumCashMismatchShare: "0.01",
      minimumMappedCashShare: "0.95", minimumLinkedAccountCashShare: "0.95",
    },
    structure: {
      requestedFacility: total.times("0.55").toFixed(2), advanceRate: "0.75",
      requiredOvercollateralization: "1.25", requiredSubordinationRate: "0.15",
      actualSeniorAmount: total.times("0.50").toFixed(2), actualMezzanineAmount: "0",
      actualSubordinatedAmount: total.times("0.12").toFixed(2), reserveRate: "0.03",
      waterfall: {
        availableCash: "0", servicingFeeDue: "0", seniorInterestDue: "0",
        seniorPrincipalDue: "0", reserveOpening: total.times("0.015").toFixed(2), mezzanineDue: "0",
      },
    },
  });
}
