import {z} from "zod";
import {analyzeOriginatorCredit, deriveOriginatorFinancials, reconcileOriginatorStatements, originatorExclusionReasons,
  type OriginatorCreditInput, type OriginatorCreditPolicy, type OriginatorFinancialInput, type OriginatorStatementPeriod} from "@offroad/financial-core";
import {createOriginatorNumericReader, originatorEvidenceKey as key, originatorNumericContextSchema, originatorSourceNumberSchema as number, originatorSourceReferenceSchema} from "./originator-evidence";

const decimal = z.string().regex(/^-?\d{1,24}(?:\.\d{1,8})?$/);
function fields<const K extends string>(keys: readonly K[]) {return Object.fromEntries(keys.map(k => [k, number])) as {[P in K]: typeof number};}
const statementFields = ["grossRevenue", "deductions", "netRevenue", "ebitda"] as const;
const balanceFields = ["cash", "restrictedCash", "receivables", "impairmentAllowance", "inventory", "otherCurrentAssets", "fixedAssets", "bankDebt", "nonbankRecourse", "suppliers", "taxDebt", "otherLiabilities", "equity"] as const;
const period = z.strictObject({entityId: key, perimeter: key, currency: z.string().regex(/^[A-Z]{3}$/), start: z.iso.date(), end: z.iso.date(), ...fields(statementFields)});
const title = z.strictObject({reference: key, debtorId: key, groupId: key, issueDate: z.iso.date(), originalDueDate: z.iso.date(), currentDueDate: z.iso.date(), face: number,
  assignment: z.enum(["free", "assigned", "unknown"]), invoice: z.enum(["active", "cancelled", "unknown"]), delivery: z.enum(["verified", "missing", "unknown"]), relatedParty: z.boolean().nullable()});
const policy = z.strictObject({
  fundProgramId: key, sourceId: key, effectiveFrom: z.iso.date(), effectiveUntil: z.iso.date().nullable(),
  financialMaxAgeDays: number, scrMaxAgeDays: number, tapeMaxAgeDays: number, maxTermDays: number, groupFaceCap: number,
  exclusionPriority: z.array(z.enum(originatorExclusionReasons)).length(originatorExclusionReasons.length),
  scoring: z.array(z.strictObject({metric: z.enum(["netDebtToEbitda", "originalPastDueRatio", "largestGroupRatio"]), bands: z.array(z.strictObject({upperInclusive: number.nullable(), points: number})).min(1).max(30)})).min(1).max(3),
  grades: z.array(z.strictObject({grade: key, maxScore: number.nullable(), totalFaceCap: number})).min(1).max(30),
  declineOnScrPastDue: z.boolean(), declineOnScrLoss: z.boolean(), cashFloor: number, coobligationStressRatio: number, severeStressRatio: number,
});

/** Document literals stay literal. The ordinary working-basis adapter supplies confirmed request parameters. */
export const originatorCreditReviewFactsSchema = z.strictObject({
  entityId: key, perimeter: key, currency: z.string().regex(/^[A-Z]{3}$/), analysisDate: z.iso.date(), reportingDate: z.iso.date(),
  sources: z.array(originatorSourceReferenceSchema).max(200000), contexts: z.array(originatorNumericContextSchema).max(2000),
  request: z.strictObject({fundProgramId: key, operationStartDate: z.iso.date(), requestedTermDays: z.number().int().min(1).max(3650), requestedAdditionalFace: decimal, currentFundFaceExposure: decimal, regulationTotalFaceCap: decimal}),
  financials: z.strictObject({priorFullYear: period, priorComparable: period, currentComparable: period, historical: z.array(period).min(1).max(20), balance: z.strictObject({asOf: z.iso.date(), ...fields(balanceFields)}), bankLinesAsOf: z.iso.date(), bankLines: z.array(z.strictObject({id: key, used: number, limit: number})).max(10000),
    scr: z.strictObject({asOf: z.iso.date(), utilizedDebt: number, pastDue: number, lossClassified: number})}),
  portfolio: z.strictObject({entityId: key, asOf: z.iso.date(), groupMappingConfirmed: z.boolean(), supportsAdditionalExposure: z.boolean(), rows: z.array(title).max(100000)}),
  cashBeforeNewCoobligation: z.array(z.strictObject({date: z.iso.date(), amount: number})).max(10000),
  reconciliation: z.strictObject({entityId: key, perimeter: key, periodStart: z.iso.date(), periodEnd: z.iso.date(),
    monthlyGrossRevenue: z.array(z.strictObject({month: z.string().regex(/^\d{4}-\d{2}$/), amount: number})).max(12),
    salesByGroup: z.array(z.strictObject({groupId: key, amount: number})).max(100000),
    receivables: z.strictObject(fields(["opening", "issued", "debtorCollections", "repurchases", "dilution", "writeoffs", "closing"])),
    impairment: z.strictObject(fields(["opening", "additions", "reversals", "usedOnWriteoffs", "closing", "olderWriteoffRecoveries"])),
    cancellationScenario: z.strictObject({confirmedEbitdaImpact: number, origin: z.literal("estimate")}).nullable(),
  }),
  policy: policy.nullable(),
});
export type OriginatorCreditReviewFacts = z.infer<typeof originatorCreditReviewFactsSchema>;

/** Normalizes only evidenced literals, then runs the deterministic financial and committee kernels. */
export function reviewOriginatorCredit(raw: unknown) {
  const f = originatorCreditReviewFactsSchema.parse(raw);
  const {sources, gaps, readings, traces, addGap, read} = createOriginatorNumericReader(f);
  function readFields<K extends string>(input: Record<K, z.infer<typeof number>>, names: readonly K[], prefix: string) {
    const values = Object.fromEntries(names.map(name => [name, read(input[name], prefix + "." + name, "currency")])) as Record<K, string | null>;
    return Object.values(values).some(v => v === null) ? null : values as Record<K, string>;
  }
  function readPeriod(input: z.infer<typeof period>, name: string): OriginatorStatementPeriod | null {
    if (input.entityId !== f.entityId || input.perimeter !== f.perimeter || input.currency !== f.currency) {addGap(name, "financial_source_scope_conflict"); return null;}
    const values = readFields(input, statementFields, name);
    return values && {entityId: input.entityId, perimeter: input.perimeter, currency: input.currency, scale: "1", start: input.start, end: input.end, ...values};
  }
  const priorFullYear = readPeriod(f.financials.priorFullYear, "priorFullYear"), priorComparable = readPeriod(f.financials.priorComparable, "priorComparable"), currentComparable = readPeriod(f.financials.currentComparable, "currentComparable");
  const historical = f.financials.historical.map((p, i) => readPeriod(p, `historical.${i}`));
  const balance = readFields(f.financials.balance, balanceFields, "balance");
  if (f.financials.balance.asOf !== f.reportingDate) addGap("financials", "balance_reporting_cutoff_mismatch");
  if (f.financials.bankLinesAsOf !== f.financials.balance.asOf) addGap("financials", "bank_lines_financial_period_mismatch");
  if (f.financials.scr.asOf !== f.financials.balance.asOf) addGap("financials", "scr_financial_period_mismatch");
  const bankLines = f.financials.bankLines.map((l, i) => {const used = read(l.used, `bankLines.${i}.used`, "currency"), limit = read(l.limit, `bankLines.${i}.limit`, "currency"); return used !== null && limit !== null ? {id: l.id, used, limit} : null;});
  const scrUtilized = read(f.financials.scr.utilizedDebt, "scr.utilizedDebt", "currency"), scrPastDue = read(f.financials.scr.pastDue, "scr.pastDue", "currency"), scrLoss = read(f.financials.scr.lossClassified, "scr.lossClassified", "currency");
  let financialInput: OriginatorFinancialInput | null = null;
  if (priorFullYear && priorComparable && currentComparable && balance && bankLines.every(l => l !== null) && historical.every(p => p !== null)) financialInput = {priorFullYear, priorComparable, currentComparable, historical, balance: {...balance, asOf: f.financials.balance.asOf}, bankLines, scrUtilizedDebt: scrUtilized};
  let financialResult: ReturnType<typeof deriveOriginatorFinancials> | null = null;
  if (financialInput) {
    try {financialResult = deriveOriginatorFinancials(financialInput); for (const reason of financialResult.gaps) addGap("financials", reason);}
    catch (error) {addGap("financials", error instanceof Error && /^originator_[a-z_]+$/.test(error.message) ? error.message : "financial_inputs_unresolved");}
  }
  const titles = f.portfolio.rows.map((t, i) => {const face = read(t.face, `titles.${i}.face`, "currency"); return face === null ? null : {...t, face};});
  if (f.portfolio.entityId !== f.entityId) addGap("portfolio", "portfolio_subject_mismatch");
  if (f.portfolio.asOf !== f.reportingDate) addGap("portfolio", "portfolio_cutoff_mismatch");
  if (!f.portfolio.groupMappingConfirmed) addGap("portfolio", "economic_group_links_unconfirmed");
  const cash = f.cashBeforeNewCoobligation.map((s, i) => {const amount = read(s.amount, `cash.${i}.amount`, "currency"); return amount === null ? null : {date: s.date, amount};});
  let resolvedPolicy: OriginatorCreditPolicy | null = null;
  if (f.policy) {
    const p = f.policy;
    if (!sources.has(p.sourceId)) addGap("policy", "policy_source_missing");
    if (p.fundProgramId !== f.request.fundProgramId) addGap("policy", "policy_fund_program_mismatch");
    // A number present in another document does not become a rule of the selected fund.
    // Clause references may differ, but every policy atom must belong to the selected version.
    const policySource = sources.get(p.sourceId);
    const checkPolicyAtoms = (v: unknown) => {
      if (!v || typeof v !== "object") return;
      if ("literal" in v && "sourceId" in v) {
        const atomSource = sources.get(String(v.sourceId));
        if (!policySource || !atomSource || atomSource.documentId !== policySource.documentId || atomSource.sourceVersionId !== policySource.sourceVersionId || atomSource.sha256 !== policySource.sha256)
          addGap("policy", "policy_number_from_another_source_version");
        return;
      }
      for (const child of Object.values(v)) checkPolicyAtoms(child);
    };
    checkPolicyAtoms(p);
    const count = (n: z.infer<typeof number>, name: string) => {const v = read(n, `policy.${name}`, "count"); if (v === null) return null; const value = Number(v); if (!Number.isSafeInteger(value) || value < 0) {addGap(`policy.${name}`, "policy_count_outside_domain"); return null;} return value;};
    const ages = {financialMaxAgeDays: count(p.financialMaxAgeDays, "financialMaxAgeDays"), scrMaxAgeDays: count(p.scrMaxAgeDays, "scrMaxAgeDays"), tapeMaxAgeDays: count(p.tapeMaxAgeDays, "tapeMaxAgeDays"), maxTermDays: count(p.maxTermDays, "maxTermDays")};
    const groupFaceCap = read(p.groupFaceCap, "policy.groupFaceCap", "currency"), cashFloor = read(p.cashFloor, "policy.cashFloor", "currency"), coobligationStressRatio = read(p.coobligationStressRatio, "policy.coobligationStressRatio", "ratio"), severeStressRatio = read(p.severeStressRatio, "policy.severeStressRatio", "ratio");
    const scoring = p.scoring.map((r, ri) => ({metric: r.metric, bands: r.bands.map((b, bi) => ({upperInclusive: b.upperInclusive === null ? null : read(b.upperInclusive, `policy.scoring.${ri}.${bi}.upper`, r.metric === "netDebtToEbitda" ? "multiple" : "ratio"), points: count(b.points, `scoring.${ri}.${bi}.points`)}))}));
    const grades = p.grades.map((g, i) => ({grade: g.grade, maxScore: g.maxScore === null ? null : count(g.maxScore, `grades.${i}.maxScore`), totalFaceCap: read(g.totalFaceCap, `policy.grades.${i}.totalFaceCap`, "currency")}));
    if (Object.values(ages).every(v => v !== null) && groupFaceCap !== null && cashFloor !== null && coobligationStressRatio !== null && severeStressRatio !== null && !gaps.some(g => g.operand.startsWith("policy"))) {
      resolvedPolicy = {effectiveFrom: p.effectiveFrom, effectiveUntil: p.effectiveUntil, ...ages as {financialMaxAgeDays: number; scrMaxAgeDays: number; tapeMaxAgeDays: number; maxTermDays: number}, groupFaceCap, cashFloor, coobligationStressRatio, severeStressRatio, exclusionPriority: p.exclusionPriority, scoring: scoring as OriginatorCreditPolicy["scoring"], grades: grades as OriginatorCreditPolicy["grades"], declineOnScrPastDue: p.declineOnScrPastDue, declineOnScrLoss: p.declineOnScrLoss};
    }
  }
  let credit: ReturnType<typeof analyzeOriginatorCredit> | null = null;
  const reconciliation = f.reconciliation;
  if (reconciliation.entityId !== f.entityId || reconciliation.perimeter !== f.perimeter || reconciliation.periodStart !== f.financials.currentComparable.start || reconciliation.periodEnd !== f.financials.currentComparable.end) addGap("reconciliation", "reconciliation_source_scope_conflict");
  const monthly = reconciliation.monthlyGrossRevenue.map((m, i) => ({month: m.month, amount: read(m.amount, `reconciliation.monthly.${i}`, "currency")}));
  const sales = reconciliation.salesByGroup.map((s, i) => ({groupId: s.groupId, amount: read(s.amount, `reconciliation.sales.${i}`, "currency")}));
  const movements = readFields(reconciliation.receivables, ["opening", "issued", "debtorCollections", "repurchases", "dilution", "writeoffs", "closing"], "reconciliation.receivables");
  const impairment = readFields(reconciliation.impairment, ["opening", "additions", "reversals", "usedOnWriteoffs", "closing", "olderWriteoffRecoveries"], "reconciliation.impairment");
  const cancellationImpact = reconciliation.cancellationScenario ? read(reconciliation.cancellationScenario.confirmedEbitdaImpact, "reconciliation.confirmedEbitdaImpact", "currency") : null;
  let reconciliationResult: ReturnType<typeof reconcileOriginatorStatements> | null = null;
  if (!gaps.length && financialResult && financialInput && balance && scrPastDue !== null && scrLoss !== null && titles.every(t => t !== null) && cash.every(s => s !== null)) {
    const input: OriginatorCreditInput = {analysisDate: f.analysisDate, reportingDate: f.reportingDate, ...f.request, poolSupportsAdditionalExposure: f.portfolio.supportsAdditionalExposure,
      financials: {bankUsed: financialResult.utilizedBankDebt, unusedBankLimits: financialResult.unusedBankLimits, additionalRecourseDebt: balance.nonbankRecourse, taxDebt: balance.taxDebt, cash: balance.cash, restrictedCash: balance.restrictedCash, ebitdaLtm: financialResult.ltm.ebitda, financialDate: financialInput.balance.asOf, scrDate: f.financials.scr.asOf, tapeDate: f.portfolio.asOf, scrPastDue, scrLossClassified: scrLoss}, titles, cashBeforeNewCoobligation: cash, policy: resolvedPolicy};
    try {credit = analyzeOriginatorCredit(input); for (const reason of credit.gaps) addGap("credit", reason);}
    catch (error) {addGap("credit", error instanceof Error && /^originator_[a-z_]+$/.test(error.message) ? error.message : "credit_inputs_unresolved");}
  }
  if (credit && financialResult && financialInput && balance && movements && impairment && monthly.every(m => m.amount !== null) && sales.every(s => s.amount !== null)) {
    try {
      reconciliationResult = reconcileOriginatorStatements({periodStart: reconciliation.periodStart, periodEnd: reconciliation.periodEnd, interimGrossRevenue: financialInput.currentComparable.grossRevenue,
        monthlyGrossRevenue: monthly as Array<{month: string; amount: string}>, salesByGroup: sales as Array<{groupId: string; amount: string}>, receivables: movements, impairment,
        tapeClosing: credit.metrics.uniqueFace, balanceGrossReceivables: balance.receivables, balanceImpairment: balance.impairmentAllowance,
        cancellationScenario: cancellationImpact === null ? null : {reportedEbitdaLtm: financialResult.ltm.ebitda, confirmedEbitdaImpact: cancellationImpact}});
      for (const reason of reconciliationResult.gaps) addGap("reconciliation", reason);
    } catch (error) {addGap("reconciliation", error instanceof Error && /^originator_[a-z_]+$/.test(error.message) ? error.message : "reconciliation_inputs_unresolved");}
    // Preserve diagnostic mathematics but withhold every grade and limit until the dossier reconciles.
    if (gaps.length) credit = {...credit, status: "needs_evidence", rating: null, capacity: null};
  }
  return {schemaVersion: "originator-credit-review.v1" as const, executorVersion: "2026.10.30-v1" as const,
    entityId: f.entityId, perimeter: f.perimeter, currency: f.currency, analysisDate: f.analysisDate, reportingDate: f.reportingDate, fundProgramId: f.request.fundProgramId,
    policyReference: f.policy ? {sourceId: f.policy.sourceId, effectiveFrom: f.policy.effectiveFrom, effectiveUntil: f.policy.effectiveUntil} : null,
    financials: financialResult, credit, reconciliation: reconciliationResult, numericReadings: readings, gaps, sources: f.sources,
    traces: [...traces, ...financialResult?.traces ?? [], ...credit?.traces ?? [], ...reconciliationResult?.traces ?? []],
    status: gaps.length || credit === null ? "pending_evidence" as const : "prepared_for_committee_review" as const,
    decisionAuthority: "committee" as const, grantsCredit: false as const, grantsPurchase: false as const};
}
