export const receivablesContractVersion = "2026.08.27-v1";

export type IsoDate = `${number}-${number}-${number}`;
export type CurrencyCode = "BRL" | "USD" | "EUR" | (string & {});

export type FileSourceAnchor = {
  kind: "file";
  fileId: string;
  fileHash: string;
  sheet?: string;
  row?: number;
  column?: string;
  cell?: string;
};

export type DocumentSourceAnchor = {
  kind: "document";
  documentId: string;
  documentHash?: string;
  page?: number;
  clause?: string;
  paragraph?: string;
};

export type EventSourceAnchor = {
  kind: "event";
  eventId: string;
  sourceSystem: string;
  occurredAt: string;
};

export type SourceAnchor = FileSourceAnchor | DocumentSourceAnchor | EventSourceAnchor;

export type FormulaReference = {
  id: string;
  version: string;
};

export type MeasuredProvenance = {
  kind: "measured";
  datasetHash: string;
  anchors: readonly SourceAnchor[];
  universe: string;
  reportingDate: IsoDate;
  inclusions: readonly string[];
  exclusions: readonly string[];
  formula: FormulaReference;
  numerator?: string;
  denominator?: string;
  unit?: string;
  rounding?: string;
};

export type CitedProvenance = {
  kind: "cited";
  title: string;
  url?: string;
  sourceHash?: string;
  locator: {
    page?: number;
    clause?: string;
    paragraph?: string;
  };
  effectiveDate?: IsoDate;
  retrievedAt: IsoDate;
  sourceStatus: "primary" | "official" | "contractual" | "secondary_reviewed";
};

export type EstimatedProvenance = {
  kind: "estimated";
  method: string;
  sources: readonly string[];
  asOf: IsoDate;
  owner: string;
  confidence: "low" | "medium" | "high";
  validUntil: IsoDate;
};

export type AssertionProvenance = MeasuredProvenance | CitedProvenance | EstimatedProvenance;

export type ReceivablesAnalysisDates = {
  reportingDate: IsoDate;
  latestOriginationDate: IsoDate;
  dataStartDate: IsoDate;
  dataEndDate: IsoDate;
};

export type ReceivableTitle = {
  id: string;
  externalId?: string;
  currency: CurrencyCode;
  faceValue: string;
  openValue: string;
  issueDate: IsoDate;
  originalDueDate: IsoDate;
  currentDueDate: IsoDate;
  obligorId: string;
  economicGroupId?: string;
  status: "open" | "settled" | "cancelled" | "repurchased" | "written_off";
  source: SourceAnchor;
};

export type SettlementEvent = {
  id: string;
  receivableId: string;
  date: IsoDate;
  amount: string;
  source: SourceAnchor;
};

export type DilutionEvent = {
  id: string;
  receivableId: string;
  date: IsoDate;
  amount: string;
  reason: "return" | "rebate" | "discount" | "credit_note" | "glosa" | "other";
  source: SourceAnchor;
};

export type ExtensionEvent = {
  id: string;
  receivableId: string;
  date: IsoDate | null;
  identifiedAt: IsoDate;
  previousDueDate: IsoDate;
  newDueDate: IsoDate;
  reason?: string;
  source: SourceAnchor;
};

export type RepurchaseEvent = {
  id: string;
  receivableId: string;
  date: IsoDate;
  amount: string;
  reason?: string;
  source: SourceAnchor;
};

export type AssignmentOrLien = {
  id: string;
  receivableId: string;
  kind: "assignment" | "fiduciary_assignment" | "lien" | "other";
  effectiveDate: IsoDate;
  amount: string | null;
  assigneeOrBeneficiary: string;
  withRecourse: boolean | "unknown";
  source: SourceAnchor;
};

export type Obligor = {
  id: string;
  legalName: string;
  taxIdRoot?: string;
  economicGroupId?: string;
  relatedParty: boolean | "unknown";
  source: SourceAnchor;
};

export type EconomicGroup = {
  id: string;
  name: string;
  obligorIds: readonly string[];
  source: SourceAnchor;
};

export type AccountingSnapshot = {
  reportingDate: IsoDate;
  currency: CurrencyCode;
  grossReceivables: string;
  allowance: string;
  assignedReceivables?: string;
  source: SourceAnchor;
};

export type DebtPosition = {
  id: string;
  reportingDate: IsoDate;
  creditor: string;
  principal: string;
  accruedInterest?: string;
  recourseToReceivables?: string;
  source: SourceAnchor;
};

export type ProposalCashFlow = {
  date: IsoDate;
  amount: string;
  kind: "disbursement" | "principal" | "interest" | "fee" | "tax" | "other";
  source: SourceAnchor;
};

export type PerformanceEventCoverage = {
  status: "complete" | "partial" | "not_provided";
  startDate: IsoDate | null;
  endDate: IsoDate | null;
  basis: string;
  limitations: readonly string[];
};

export type ReceivablesEventCoverage = {
  settlements: PerformanceEventCoverage;
  dilutions: PerformanceEventCoverage;
  extensions: PerformanceEventCoverage;
  repurchases: PerformanceEventCoverage;
  assignmentsAndLiens: PerformanceEventCoverage;
};

export type ReceivablesUniverse = {
  id: string;
  dates: ReceivablesAnalysisDates;
  currency: CurrencyCode;
  receivables: readonly ReceivableTitle[];
  settlements: readonly SettlementEvent[];
  dilutions: readonly DilutionEvent[];
  extensions: readonly ExtensionEvent[];
  repurchases: readonly RepurchaseEvent[];
  assignmentsAndLiens: readonly AssignmentOrLien[];
  obligors: readonly Obligor[];
  economicGroups: readonly EconomicGroup[];
  eventCoverage: ReceivablesEventCoverage;
};

export const receivablesAgingBuckets = [
  "not_due",
  "past_due_1_15",
  "past_due_16_30",
  "past_due_31_60",
  "past_due_61_90",
  "past_due_91_180",
  "past_due_over_180",
] as const;
export type ReceivablesAgingBucket = typeof receivablesAgingBuckets[number];

export type EligibilityScope =
  | "receivable"
  | "obligor"
  | "economic_group"
  | "portfolio"
  | "cedent"
  | "vehicle"
  | "class"
  | "operational_legal"
  | "live_mandate";

export type EligibilityDenominator =
  | "receivable_face_value"
  | "portfolio_open_value"
  | "cedent_portfolio_value"
  | "fund_net_asset_value"
  | "class_net_asset_value"
  | "committed_capacity"
  | "not_applicable";

export type BuyerFitStatus =
  | "technically_eligible"
  | "policy_fit_confirmed"
  | "live_appetite_confirmed"
  | "conditionally_eligible"
  | "not_evaluated"
  | "ineligible";

export type EligibilityCriterion = {
  id: string;
  version: string;
  scope: EligibilityScope;
  denominator: EligibilityDenominator;
  description: string;
  provenance: CitedProvenance;
};

export type BuyerFitResult = {
  buyerId: string;
  status: BuyerFitStatus;
  evaluatedAt: IsoDate;
  criterionResults: readonly {
    criterionId: string;
    status: "pass" | "fail" | "condition" | "not_evaluated";
    reason: string;
    provenance?: AssertionProvenance;
  }[];
};

export function agingBucketForDaysPastDue(daysPastDue: number): ReceivablesAgingBucket {
  if (!Number.isInteger(daysPastDue)) throw new RangeError("days past due must be an integer");
  if (daysPastDue <= 0) return "not_due";
  if (daysPastDue <= 15) return "past_due_1_15";
  if (daysPastDue <= 30) return "past_due_16_30";
  if (daysPastDue <= 60) return "past_due_31_60";
  if (daysPastDue <= 90) return "past_due_61_90";
  if (daysPastDue <= 180) return "past_due_91_180";
  return "past_due_over_180";
}

export function assertHardEligibilityProvenance(result: BuyerFitResult): void {
  if (result.status === "not_evaluated") return;
  for (const criterion of result.criterionResults) {
    if (criterion.status === "not_evaluated") continue;
    if (!criterion.provenance) throw new Error(`criterion ${criterion.criterionId} requires provenance`);
    if (criterion.provenance.kind === "estimated") {
      throw new Error(`criterion ${criterion.criterionId} cannot use estimated provenance for a hard decision`);
    }
  }
}
