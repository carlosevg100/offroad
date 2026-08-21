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
  indexLevels: {cdi: string; tlp?: string; ipca?: string; selic?: string};
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

  // Covenants stated as a separate table attach to the lender named in the note when they can;
  // the battery only needs one line to carry each ceiling, and the tightest governs anyway.
  covenantTexts.forEach((text, index) => {
    const line = debt[index];
    if (line && !line.covenant) line.covenant = text.replace("Dívida líquida/EBITDA", "Dívida líquida/EBITDA");
  });

  // ---- interim -------------------------------------------------------------------------------
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

  // ---- projections ---------------------------------------------------------------------------
  const projectionYears = [...new Set(
    facts
      .map((fact) => fact.fieldPath.match(/^projections\.(\d{4})\.ebitda$/)?.[1])
      .filter((year): year is string => Boolean(year)),
  )].map(Number).sort((a, b) => a - b);
  const projectedEbitda = projectionYears.map((year) => ({year, ebitda: value(`projections.${year}.ebitda`)!}));
  const nextRevenue = latest ? value(`projections.${latest + 1}.revenue`) : undefined;

  // ---- assemble, honestly --------------------------------------------------------------------
  const canDesk = Boolean(revenue && ebitda && cash && grossDebt && receivables && amounts.length > 0);
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
        },
        balance: {
          periodEnd: `${latest}-12-31`,
          cash: cash!,
          receivables: receivables!,
          grossDebt: grossDebt!,
          ...(value(`historical_financials.${latest}.inventory`) !== undefined
            ? {inventory: value(`historical_financials.${latest}.inventory`)!}
            : {}),
          ...(value(`historical_financials.${latest}.payables`) !== undefined
            ? {suppliers: value(`historical_financials.${latest}.payables`)!}
            : {}),
        },
        ...(interim ? {interim} : {}),
        debt,
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

  const canTrajectory = Boolean(
    desk && ebitda && projectedEbitda.length > 0 && amounts.length > 0 && termMonths !== undefined && graceMonths !== undefined,
  );
  if (desk && !canTrajectory) {
    if (projectedEbitda.length === 0) missing.push("projections.{ano}.ebitda");
    if (termMonths === undefined) missing.push("transaction.desired_term_months");
    if (graceMonths === undefined) missing.push("transaction.desired_grace_months");
  }
  const trajectory: TrajectoryInput | null = canTrajectory
    ? {
        referenceDate: options.referenceDate,
        cash: cash!,
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
        },
        auditedEbitda: ebitda!,
        projectedEbitda,
        existingCovenants: debt
          .filter((line) => line.covenant !== undefined)
          .map((line) => {
            const match = line.covenant!.match(/([\d.,]+)\s*x/);
            return match ? {lender: line.lender, maximum: match[1]!.replace(",", ".")} : null;
          })
          .filter((entry): entry is {lender: string; maximum: string} => entry !== null),
      }
    : null;

  return {desk, trajectory, missing};
}

const numberOf = (raw: string | undefined): number | undefined => {
  if (raw === undefined) return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
};
