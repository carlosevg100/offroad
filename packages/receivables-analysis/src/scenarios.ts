import Decimal from "decimal.js";

import {defaultReceivablesPolicy} from "./analyze";
import {receivablesCaseSchema, type CashReceipt, type Receivable, type ReceivablesCase, type ReceivablesDecision} from "./schema";

const DAY = 86_400_000;
const dateOffset = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00.000Z`) + days * DAY).toISOString().slice(0, 10);

function basePortfolio(referenceDate: string): Receivable[] {
  return Array.from({length: 60}, (_, index) => ({
    id: `REC-${String(index + 1).padStart(4, "0")}`,
    debtorId: `DEBTOR-${String((index % 30) + 1).padStart(3, "0")}`,
    debtorGroupId: `GROUP-${String((index % 10) + 1).padStart(2, "0")}`,
    debtorSector: "services",
    originDate: dateOffset(referenceDate, -120 - (index % 30)),
    dueDate: dateOffset(referenceDate, 30 + (index % 90)),
    originalAmount: "100000.00",
    outstandingBalance: "100000.00",
    paidAmount: "0",
    collectedInPeriod: index < 6 ? "100000.00" : "0",
    defaultedBalance: "0",
    recoveredInPeriod: "0",
    dilutionInPeriod: "0",
    repurchasedInPeriod: "0",
    substitutedInPeriod: "0",
    assignable: true,
    evidenceVerified: true,
    registration: "registered" as const,
    encumbrance: "free" as const,
    disputed: false,
    relatedParty: false,
    sourceDocumentId: "loan-tape.xlsx",
    sourceAnchor: `portfolio:${index + 2}`,
    anchorVerified: true,
  }));
}

function baseCash(referenceDate: string): CashReceipt[] {
  return Array.from({length: 6}, (_, index) => ({
    id: `CASH-${index + 1}`,
    receivedAt: dateOffset(referenceDate, -index),
    amount: "100000.00",
    receivableId: `REC-${String(index + 1).padStart(4, "0")}`,
    debtorId: `DEBTOR-${String(index + 1).padStart(3, "0")}`,
    linkedAccount: true,
    duplicateOf: null,
    sourceDocumentId: "linked-account.csv",
    sourceAnchor: `cash:${index + 2}`,
    anchorVerified: true,
  }));
}

export function diversifiedReceivablesCase(id = "receivables-clean-diversified"): ReceivablesCase {
  const referenceDate = "2026-08-24";
  return receivablesCaseSchema.parse({
    schemaVersion: "2026.08.24-v1",
    id,
    referenceDate,
    cedent: {id: "cedent-atlas", legalName: "Atlas Serviços Empresariais S.A.", servicingRole: "cedent"},
    portfolio: basePortfolio(referenceDate),
    cashReceipts: baseCash(referenceDate),
    accounting: {grossReceivablesBalance: "6000000.00", allowanceBalance: "120000.00", reportedCollectionsInPeriod: "600000.00"},
    policy: defaultReceivablesPolicy,
    structure: {
      requestedFacility: "3000000.00",
      advanceRate: "0.80",
      requiredOvercollateralization: "1.25",
      requiredSubordinationRate: "0.15",
      actualSeniorAmount: "3000000.00",
      actualMezzanineAmount: "0",
      actualSubordinatedAmount: "750000.00",
      reserveRate: "0.03",
      waterfall: {
        availableCash: "400000.00",
        servicingFeeDue: "10000.00",
        seniorInterestDue: "100000.00",
        seniorPrincipalDue: "200000.00",
        reserveOpening: "30000.00",
        mezzanineDue: "0",
      },
    },
  });
}

type Mutation = (draft: ReceivablesCase) => void;
const clone = (value: ReceivablesCase) => structuredClone(value);

function scenario(id: string, expected: ReceivablesDecision, mutator: Mutation, keyRisk: string) {
  const input = clone(diversifiedReceivablesCase(id));
  mutator(input);
  return {id, expected, keyRisk, input: receivablesCaseSchema.parse(input)};
}

const first = (input: ReceivablesCase, count: number) => input.portfolio.slice(0, count);
const firstCash = (input: ReceivablesCase, count: number) => input.cashReceipts.slice(0, count);

/**
 * Parametric coverage matrix. Expectations are declared independently from the analyzer and
 * therefore act as an answer key rather than restating the implementation.
 */
export const receivablesParametricScenarios = [
  scenario("r01-clean-diversified", "ready_for_structuring", () => {}, "clean control"),
  scenario("r02-accounting-mismatch", "needs_remediation", (item) => { item.accounting.grossReceivablesBalance = "5000000.00"; }, "loan tape does not tie to accounting"),
  scenario("r03-cash-mismatch", "needs_remediation", (item) => { item.accounting.reportedCollectionsInPeriod = "500000.00"; }, "reported collections do not tie to cash"),
  scenario("r04-evidence-gap", "needs_remediation", (item) => { for (const row of first(item, 10)) row.evidenceVerified = false; }, "backing evidence coverage below policy"),
  scenario("r05-registration-gap", "needs_remediation", (item) => { for (const row of first(item, 10)) row.registration = "missing"; }, "registration coverage below policy"),
  scenario("r06-registration-conflict", "needs_remediation", (item) => { item.portfolio[0]!.registration = "conflict"; }, "ownership conflict"),
  scenario("r07-high-delinquency", "needs_remediation", (item) => { for (const row of first(item, 12)) row.dueDate = dateOffset(item.referenceDate, -45); }, "30 plus delinquency trigger"),
  scenario("r08-high-dilution", "needs_remediation", (item) => { for (const row of first(item, 4)) row.dilutionInPeriod = "100000.00"; }, "dilution above policy"),
  scenario("r09-high-repurchase", "needs_remediation", (item) => { for (const row of first(item, 5)) row.repurchasedInPeriod = "100000.00"; }, "repurchase above policy"),
  scenario("r10-low-recovery", "needs_remediation", (item) => { for (const row of first(item, 6)) { row.defaultedBalance = "100000.00"; row.recoveredInPeriod = "10000.00"; } }, "recovery below policy"),
  scenario("r11-single-debtor-concentration", "needs_remediation", (item) => {
    for (const row of first(item, 15)) {
      row.debtorId = "DEBTOR-TOP";
      row.debtorGroupId = "GROUP-TOP";
    }
    for (const receipt of item.cashReceipts) receipt.debtorId = "DEBTOR-TOP";
  }, "single obligor concentration"),
  scenario("r12-group-concentration", "needs_remediation", (item) => {
    const concentratedDebtors = new Set(first(item, 20).map((row) => row.debtorId));
    for (const row of item.portfolio) if (concentratedDebtors.has(row.debtorId)) row.debtorGroupId = "GROUP-TOP";
  }, "economic group concentration"),
  scenario("r13-disputed-exclusions", "ready_for_structuring", (item) => { for (const row of first(item, 6)) row.disputed = true; }, "disputed receivables excluded with remaining base sufficient"),
  scenario("r14-related-party-exclusions", "ready_for_structuring", (item) => { for (const row of first(item, 6)) row.relatedParty = true; }, "related party receivables excluded"),
  scenario("r15-encumbered-base", "needs_remediation", (item) => { for (const row of first(item, 30)) row.encumbrance = "assigned"; }, "available base below minimum"),
  scenario("r16-nonassignable-base", "needs_remediation", (item) => { for (const row of first(item, 30)) row.assignable = false; }, "assignment restriction"),
  scenario("r17-long-tenor-base", "needs_remediation", (item) => { for (const row of first(item, 30)) row.dueDate = dateOffset(item.referenceDate, 540); }, "remaining term outside policy"),
  scenario("r18-unseasoned-base", "needs_remediation", (item) => { for (const row of first(item, 30)) row.originDate = dateOffset(item.referenceDate, -5); }, "minimum seasoning not met"),
  scenario("r19-no-eligible-base", "not_viable", (item) => { for (const row of item.portfolio) row.assignable = false; }, "correct refusal with zero eligible base"),
  scenario("r20-duplicate-cash", "needs_remediation", (item) => { item.cashReceipts.push({...item.cashReceipts[0]!, id: "CASH-DUP", sourceAnchor: "cash:duplicate", duplicateOf: item.cashReceipts[0]!.id}); }, "duplicate cash record"),
  scenario("r21-unmapped-cash", "needs_remediation", (item) => { for (const receipt of firstCash(item, 4)) { receipt.receivableId = null; receipt.debtorId = null; } }, "cash application cannot be traced to the portfolio"),
  scenario("r22-unlinked-cash", "needs_remediation", (item) => { for (const receipt of firstCash(item, 4)) receipt.linkedAccount = false; }, "collections outside linked account"),
  scenario("r23-subordination-shortfall", "needs_remediation", (item) => { item.structure.actualSubordinatedAmount = "300000.00"; }, "subordination below target"),
  scenario("r24-waterfall-shortfall", "needs_remediation", (item) => { item.structure.waterfall.availableCash = "50000.00"; }, "senior waterfall shortfall"),
  scenario("r25-sector-exclusion", "not_viable", (item) => { item.policy.allowedDebtorSectors = ["healthcare"]; }, "obligor sector outside policy"),
  scenario("r26-facility-above-base", "needs_remediation", (item) => { item.structure.requestedFacility = "5000000.00"; }, "requested facility exceeds borrowing base"),
  scenario("r27-unknown-cash-mapping", "needs_remediation", (item) => { item.cashReceipts[0]!.receivableId = "REC-UNKNOWN"; }, "cash points to an unknown receivable"),
  scenario("r28-unanchored-cash", "needs_remediation", (item) => { item.cashReceipts[0]!.anchorVerified = false; }, "cash evidence has no verified anchor"),
] as const;

export function scenarioFingerprint(input: ReceivablesCase): string {
  const total = input.portfolio.reduce((value, item) => value.plus(item.outstandingBalance), new Decimal(0));
  return `${total.toFixed(2)}:${input.id}:${input.portfolio.length}`;
}
