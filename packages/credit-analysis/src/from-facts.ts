import type {DebtLineInput, DeskInput} from "./analyze";
import type {TrajectoryInput} from "./trajectory";

/**
 * From reconciled facts to desk inputs.
 *
 * The extractor speaks the ontology's field paths (`debt.instruments.3.rate`,
 * `historical_financials.2025.ebitda`), and the battery speaks structured input. This is the
 * bridge, and it is deliberately dumb: it groups, it picks the latest year, it never fills a
 * hole with a guess. What cannot be built is reported in `missing`, in field-path language,
 * so the gap surfaces as a question to the company instead of as a silently absent analysis.
 */

export type Fact = {fieldPath: string; value: string};

export type DeskInputsOptions = {
  referenceDate: string;
  /** A market assumption of the analysis, stated by the caller, never invented here. */
  indexLevels: {cdi: string; tlp?: string; ipca?: string; selic?: string; tr?: string};
  /** What the company stated in the product itself, alongside what the documents say. */
  statedRequest?: {amount?: string; termMonths?: number; graceMonths?: number; expectedRate?: string};
};

export type DeskInputs = {
  desk: DeskInput | null;
  trajectory: TrajectoryInput | null;
  /** What kept either analysis from being built, as field paths a reviewer recognises. */
  missing: string[];
};

const indexed = (facts: Fact[], prefix: string): Map<number, Map<string, string>> => {
  const groups = new Map<number, Map<string, string>>();
  const pattern = new RegExp(`^${prefix.replace(/\./g, "\\.")}\\.(\\d+)\\.([a-z_]+)$`);
  for (const fact of facts) {
    const match = fact.fieldPath.match(pattern);
    if (!match) continue;
    const index = Number(match[1]);
    if (!groups.has(index)) groups.set(index, new Map());
    groups.get(index)!.set(match[2]!, fact.value);
  }
  return groups;
};

export function buildDeskInputs(facts: Fact[], options: DeskInputsOptions): DeskInputs {
  const missing: string[] = [];
  const byPath = new Map(facts.map((fact) => [fact.fieldPath, fact.value]));
  const value = (path: string): string | undefined => byPath.get(path);

  // ---- the latest audited year ---------------------------------------------------------------
  const years = [...new Set(
    facts
      .map((fact) => fact.fieldPath.match(/^historical_financials\.(\d{4})\./)?.[1])
      .filter((year): year is string => Boolean(year)),
  )].map(Number).sort((a, b) => b - a);
  const latest = years[0];

  const revenue = latest ? value(`historical_financials.${latest}.revenue`) : undefined;
  const ebitda = latest ? value(`historical_financials.${latest}.ebitda`) : undefined;
  if (!revenue) missing.push("historical_financials.{ano}.revenue");
  if (!ebitda) missing.push("historical_financials.{ano}.ebitda");

  const cash = latest ? value(`historical_financials.${latest}.cash`) : undefined;
  const receivables = latest ? value(`historical_financials.${latest}.receivables`) : undefined;
  const grossDebt = latest ? value(`historical_financials.${latest}.gross_debt`) : undefined;
  if (!cash) missing.push("historical_financials.{ano}.cash");
  if (!grossDebt) missing.push("historical_financials.{ano}.gross_debt");

  // ---- debt lines ----------------------------------------------------------------------------
  const debtGroups = indexed(facts, "debt.instruments");
  const covenantGroups = indexed(facts, "debt.covenants");
  const covenantTexts = [...covenantGroups.values()]
    .map((group) => {
      const metric = group.get("metric");
      const threshold = group.get("threshold");
      return metric && threshold ? `${metric} <= ${threshold.replace(".", ",")}x` : null;
    })
    .filter((text): text is string => text !== null);

  const debt: DebtLineInput[] = [...debtGroups.entries()]
    .sort(([a], [b]) => a - b)
    .flatMap(([, group]) => {
      const lender = group.get("lender");
      const balance = group.get("balance");
      if (!lender || !balance) return [];
      return [{
        lender,
        balance,
        ...(group.get("instrument_type") !== undefined ? {instrumentType: group.get("instrument_type")!} : {}),
        ...(group.get("rate") !== undefined ? {rate: group.get("rate")!} : {}),
        ...(group.get("maturity") !== undefined ? {maturity: group.get("maturity")!} : {}),
        ...(group.get("amortization") !== undefined ? {amortization: group.get("amortization")!} : {}),
        ...(group.get("collateral") !== undefined ? {collateral: group.get("collateral")!} : {}),
        ...(group.get("covenants") !== undefined ? {covenant: group.get("covenants")!} : {}),
      }];
    });
  if (debt.length === 0) missing.push("debt.instruments");

  // Covenants stated as a table rather than per line bind the company, not one lender. A
  // listed company's note says "os principais instrumentos" and names nobody; pinning that
  // ceiling on whichever line happens to be first would invent a contract. They go in as
  // company-level covenants, labelled by their scope.
  const companyCovenants = covenantTexts.map((text) => ({scope: "escrituras e contratos da companhia", text}));

  // ---- interim -------------------------------------------------------------------------------
  // The most recent balance sheet wins as the anchor for stock figures. A schedule dated May
  // against a balance dated February reads as R$ 750M of phantom debt; the stack, the cash and
  // the receivables must be read on the same date, and that date is the latest one the room has.
  const interimPeriods = [...new Set(
    facts
      .map((fact) => fact.fieldPath.match(/^interim_financials\.(\d{4}_\d{2})\./)?.[1])
      .filter((period): period is string => Boolean(period)),
  )].sort().reverse();
  const period = interimPeriods[0];
  let interim: DeskInput["interim"];
  if (period) {
    const [year, month] = period.split("_").map(Number);
    const find = (metric: string) =>
      facts.find((fact) => new RegExp(`^interim_financials\\.${period}\\.${metric}(_\\d+m|_ytd|_ltm)?$`).test(fact.fieldPath))?.value;
    const interimRevenue = find("revenue");
    if (interimRevenue) {
      interim = {
        periodEnd: `${year}-${String(month).padStart(2, "0")}-28`,
        months: month!,
        revenue: interimRevenue,
        ...(find("ebitda") !== undefined ? {ebitda: find("ebitda")!} : {}),
        ...(find("receivables") !== undefined ? {receivables: find("receivables")!} : {}),
        ...(find("cash") !== undefined ? {cash: find("cash")!} : {}),
      };
    }
  }

  const interimCash = period ? facts.find((fact) => fact.fieldPath === `interim_financials.${period}.cash`)?.value : undefined;
  const interimGrossDebt = period ? facts.find((fact) => fact.fieldPath === `interim_financials.${period}.gross_debt`)?.value : undefined;
  const interimReceivables = period ? facts.find((fact) => fact.fieldPath === `interim_financials.${period}.receivables`)?.value : undefined;
  const interimInventory = period ? facts.find((fact) => fact.fieldPath === `interim_financials.${period}.inventory`)?.value : undefined;
  const interimPayables = period ? facts.find((fact) => fact.fieldPath === `interim_financials.${period}.payables`)?.value : undefined;
  const anchorOnInterim = Boolean(period && interimCash && interimGrossDebt && interimReceivables);
  const balanceCash = anchorOnInterim ? interimCash : cash;
  const balanceGrossDebt = anchorOnInterim ? interimGrossDebt : grossDebt;
  const balanceReceivables = anchorOnInterim ? interimReceivables : receivables;
  const balanceInventory = anchorOnInterim ? interimInventory : latest ? value(`historical_financials.${latest}.inventory`) : undefined;
  const balancePayables = anchorOnInterim ? interimPayables : latest ? value(`historical_financials.${latest}.payables`) : undefined;
  const balancePeriodEnd = anchorOnInterim ? interim?.periodEnd ?? `${period!.replace("_", "-")}-28` : `${latest}-12-31`;

  // ---- the request: documents and the product's own form, side by side -----------------------
  const amounts: Array<{value: string; source: string}> = [];
  const fromDocuments = value("transaction.requested_amount");
  if (fromDocuments) amounts.push({value: fromDocuments, source: "documentos"});
  const stated = options.statedRequest?.amount;
  if (stated && (!fromDocuments || stated !== fromDocuments)) {
    amounts.push({value: stated, source: "informado pela empresa"});
  }
  if (amounts.length === 0) missing.push("transaction.requested_amount");

  const uses = indexed(facts, "transaction.use_of_proceeds");
  const workingCapitalAsk = [...uses.values()].find((group) => /giro|working capital/i.test(group.get("item") ?? ""))?.get("amount");

  const termMonths = options.statedRequest?.termMonths ?? numberOf(value("transaction.desired_term_months"));
  const graceMonths = options.statedRequest?.graceMonths ?? numberOf(value("transaction.desired_grace_months"));
  const rateAsk = options.statedRequest?.expectedRate ?? value("transaction.expected_rate");
  const refinancing = value("transaction.refinancing");

  // ---- projections ---------------------------------------------------------------------------
  const projectionYears = [...new Set(
    facts
      .map((fact) => fact.fieldPath.match(/^projections\.(\d{4})\.ebitda$/)?.[1])
      .filter((year): year is string => Boolean(year)),
  )].map(Number).sort((a, b) => a - b);
  const companyProjections = projectionYears.map((year) => ({year, ebitda: value(`projections.${year}.ebitda`)!}));
  // No projection from the company is a question for the company, not a reason to have no
  // trajectory: the desk runs it on EBITDA held flat and says so. A listed company rarely
  // sends a model; a desk never waits for one to know whether the schedule is serviceable.
  const ebitdaHeldFlat = companyProjections.length === 0 && latest !== undefined && ebitda !== undefined;
  const projectedEbitda = ebitdaHeldFlat
    ? Array.from({length: 5}, (_, offset) => ({year: latest! + 1 + offset, ebitda: ebitda!}))
    : companyProjections;
  const nextRevenue = latest ? value(`projections.${latest + 1}.revenue`) : undefined;

  // ---- the amortisation profile, by window ---------------------------------------------------
  const profileGroups = indexed(facts, "debt.maturity_profile");
  const maturityProfile = [...profileGroups.entries()]
    .sort(([a], [b]) => a - b)
    .flatMap(([, group]) => {
      const window = group.get("window");
      const amount = group.get("amount");
      if (!window || !amount) return [];
      const endsOn = windowEnd(window);
      return [{window, amount, ...(endsOn ? {endsOn} : {})}];
    });

  // ---- what a venture lender reads -----------------------------------------------------------
  const latestOf = (metric: string): string | undefined =>
    facts
      .filter((fact) => new RegExp(`^(historical|interim)_financials\\.\\d{4}(_\\d{2})?\\.${metric}(_\\d+m|_ytd|_ltm)?$`).test(fact.fieldPath))
      .sort((a, b) => b.fieldPath.localeCompare(a.fieldPath))[0]?.value;
  const ventureEntries: Array<[string, string | undefined]> = [
    ["arr", latestOf("arr")],
    ["mrr", latestOf("mrr")],
    ["monthlyBurn", latestOf("monthly_burn")],
    ["runwayMonthsStated", value("company.runway_months")],
    ["lastEquityRoundAmount", value("company.last_equity_round.amount")],
    ["lastEquityRoundDate", value("company.last_equity_round.date")],
    ["nrr", value("company.net_revenue_retention")],
    ["monthlyChurn", value("company.monthly_churn_pct")],
    ["topCustomerShare", value("customers.top_customers.1.share_pct")],
  ];
  const venture = Object.fromEntries(ventureEntries.filter((entry): entry is [string, string] => entry[1] !== undefined)) as NonNullable<DeskInput["venture"]>;
  const hasVenture = Object.keys(venture).length > 0;

  // ---- assemble, honestly --------------------------------------------------------------------
  const canDesk = Boolean(revenue && ebitda && balanceCash && balanceGrossDebt && balanceReceivables && amounts.length > 0);
  const desk: DeskInput | null = canDesk
    ? {
        indexLevels: options.indexLevels,
        referenceDate: options.referenceDate,
        audited: {
          year: latest!,
          revenue: revenue!,
          ebitda: ebitda!,
          ...(latest && value(`historical_financials.${latest}.cogs`) !== undefined
            ? {cogs: value(`historical_financials.${latest}.cogs`)!}
            : {}),
          ...(latest && value(`historical_financials.${latest}.financial_expenses`) !== undefined
            ? {financialExpenses: value(`historical_financials.${latest}.financial_expenses`)!}
            : {}),
        },
        balance: {
          periodEnd: balancePeriodEnd,
          cash: balanceCash!,
          receivables: balanceReceivables!,
          grossDebt: balanceGrossDebt!,
          ...(balanceInventory !== undefined ? {inventory: balanceInventory} : {}),
          ...(balancePayables !== undefined ? {suppliers: balancePayables} : {}),
        },
        ...(interim ? {interim} : {}),
        debt,
        ...(companyCovenants.length > 0 ? {covenants: companyCovenants} : {}),
        ...(hasVenture ? {venture} : {}),
        ...(maturityProfile.length > 0 ? {maturityProfile} : {}),
        request: {
          amounts,
          ...(termMonths !== undefined ? {termMonths} : {}),
          ...(graceMonths !== undefined ? {graceMonths} : {}),
          ...(rateAsk !== undefined ? {rateAsk} : {}),
          ...(workingCapitalAsk !== undefined ? {workingCapitalAsk} : {}),
        },
        ...(nextRevenue && latest ? {projectedNextYear: {year: latest + 1, revenue: nextRevenue}} : {}),
      }
    : null;

  // A leverage trajectory over a negative EBITDA is arithmetic without meaning; the cash-burning
  // company is read through its runway, inside the desk analysis.
  const canTrajectory = Boolean(
    desk && ebitda && Number(ebitda) > 0 && projectedEbitda.length > 0 && amounts.length > 0 && termMonths !== undefined && graceMonths !== undefined,
  );
  // Still asked for, even when the trajectory ran on the fallback: the company's own ramp is
  // the number the fund will underwrite, and the desk's flat line is a placeholder, not an answer.
  if (desk && companyProjections.length === 0) missing.push("projections.{ano}.ebitda");
  if (desk && !canTrajectory) {
    if (termMonths === undefined) missing.push("transaction.desired_term_months");
    if (graceMonths === undefined) missing.push("transaction.desired_grace_months");
  }
  const trajectory: TrajectoryInput | null = canTrajectory
    ? {
        referenceDate: options.referenceDate,
        cash: balanceCash!,
        existing: debt.map((line) => ({
          lender: line.lender,
          balance: line.balance,
          ...(line.maturity !== undefined ? {maturity: line.maturity} : {}),
          ...(line.amortization !== undefined ? {amortization: line.amortization} : {}),
          ...(line.covenant !== undefined ? {hasCovenant: true} : {}),
        })),
        // The larger stated amount, because sizing against the smaller one understates the risk
        // the fund will price, and the divergence itself is already a finding.
        newDebt: {
          amount: amounts.map((entry) => entry.value).sort((a, b) => Number(b) - Number(a))[0]!,
          termMonths: termMonths!,
          graceMonths: graceMonths!,
          ...(refinancing !== undefined ? {refinancing} : {}),
        },
        auditedEbitda: ebitda!,
        projectedEbitda,
        ...(ebitdaHeldFlat ? {ebitdaHeldFlat: true} : {}),
        existingCovenants: [
          ...debt
            .filter((line) => line.covenant !== undefined)
            .map((line) => {
              const match = line.covenant!.match(/([\d.,]+)\s*x/);
              return match ? {lender: line.lender, maximum: match[1]!.replace(",", ".")} : null;
            })
            .filter((entry): entry is {lender: string; maximum: string} => entry !== null),
          ...companyCovenants
            .map((entry) => {
              const match = entry.text.match(/([\d.,]+)\s*x/);
              return match ? {lender: entry.scope, maximum: match[1]!.replace(",", ".")} : null;
            })
            .filter((entry): entry is {lender: string; maximum: string} => entry !== null),
        ],
      }
    : null;

  return {desk, trajectory, missing};
}

const MONTHS: Record<string, number> = {jan: 1, fev: 2, feb: 2, mar: 3, abr: 4, apr: 4, mai: 5, may: 5, jun: 6, jul: 7, ago: 8, aug: 8, set: 9, sep: 9, out: 10, oct: 10, nov: 11, dez: 12, dec: 12};

/**
 * The last month of a window as a note writes it: "Jun/26 a Mai/27" → 2027-05-31, "2028" →
 * 2028-12-31, "Jun/28 a Mai/29" → 2029-05-31. "Após Jun/31" has no end and returns undefined,
 * which keeps it out of every "within N months" sum, as it should be.
 */
export const windowEnd = (window: string): string | undefined => {
  const text = window.trim().toLowerCase();
  if (/^(após|apos|after|a partir)/.test(text)) return undefined;
  const monthYear = [...text.matchAll(/([a-zç]{3})[a-zç]*\.?\/?\s*(\d{2,4})/g)];
  const last = monthYear.at(-1);
  if (last && MONTHS[last[1]!]) {
    const year = last[2]!.length === 2 ? 2000 + Number(last[2]) : Number(last[2]);
    return `${year}-${String(MONTHS[last[1]!]).padStart(2, "0")}-28`;
  }
  const year = text.match(/(20\d{2})(?!.*20\d{2})/);
  if (year) return `${year[1]}-12-31`;
  return undefined;
};

const numberOf = (raw: string | undefined): number | undefined => {
  if (raw === undefined) return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
};
