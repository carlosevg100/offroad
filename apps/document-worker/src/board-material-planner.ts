import {boardCapitalDiscussionFactsSchema, boardEffectiveScale, boardFieldOf, boardLinkedInstrument, boardReleasedSources, boardRoleRecords, formatBoardReading, readBoardSourcePath,
  verifyBoardSource, type BoardCapitalDiscussionFacts, type BoardSourceReading} from "@offroad/financial-model";

/** The deterministic planner of a board discussion (ficha C47, prepare-board-capital-discussion 2026.10.27-v1).
 * Pages, deliberations, numbers and questions never come from a model: the plan below is the closed library's own
 * arrangement, each text a template reference whose slots bind to readings of the reviewed results the work holds.
 * A text is planned only when every reading it binds resolves in a released, completed result; everything else is
 * left out and named. The method then verifies every template condition on the bound readings, and the planner keeps
 * only what it accepts: a recommendation, an option, a question or an appendix item whose condition fails is left
 * out and named, anything else is a named refusal. The model only extracts conversation facts. */

/** Each source method the plan reads, by the id the basis gives its result, in the order the basis names them. */
export const boardMaterialSourceIds = {
  "build-company-debt-table": "tabela-divida", "measure-covenant-headroom": "covenant", "project-weekly-cash": "caixa-semanal",
  "analyze-investment-project": "linha-embalagem", "build-operating-projection": "projecao", "challenge-financial-projection": "plano-fpa",
  "monetize-receivables-for-working-capital": "recebiveis", "analyze-relative-debt-cost": "custo-relativo", "evaluate-financing-paths": "plano-2027",
} as const;
export type BoardMaterialSourceMethod = keyof typeof boardMaterialSourceIds;
export type BoardMaterialSourceId = (typeof boardMaterialSourceIds)[BoardMaterialSourceMethod];
export const boardMaterialSourceMethods = Object.keys(boardMaterialSourceIds) as BoardMaterialSourceMethod[];

/** The latest completed execution of one source method in the same work, as the database returns it; released says
 * whether the method is released for execution in this organization. */
/** One prior as the database returns it. `moneyScale` is the scale the source method adopts its basis in, as the database
 * records it per method and version (null when unknown); it is never inferred from the packet. */
export type BoardMaterialPrior = {methodId: string; executionId: string; resultFingerprint: string; released: boolean; moneyScale: "reais" | "millions" | null;
  packet: Record<string, unknown>};
export type BoardMaterialPin = {role: BoardMaterialSourceId; methodId: BoardMaterialSourceMethod; executionId: string; resultFingerprint: string; moneyScale: "reais" | "millions"};

type Said = "informed" | "document";
type Fact<T> = {value: T; origin: Said; source: string};
export const boardMaterialTopics = ["linha-embalagem", "safra", "vencimentos", "politica"] as const;
export type BoardMaterialTopic = (typeof boardMaterialTopics)[number];
/** The dated actions of the library, by the deliberation that carries each. */
export const boardMaterialActions = {supplier_notice: ["linha", "aviso"], join_programs: ["safra", "adesao"], finish_sounding: ["vencimentos", "sondagem"], decide_route: ["vencimentos", "rota"]} as const;
export type BoardMaterialAction = keyof typeof boardMaterialActions;
export const boardMaterialReasonCodes = ["reduce_single_supplier_dependence", "diversify_suppliers", "own_capacity", "reduce_operational_risk", "serve_customer_contract", "outside_dictionary"] as const;

/** What the conversation states, already reconciled: each fact once, with its origin. */
export type BoardMaterialConversation = {
  askedOn: Fact<string> | null; meetingDate: Fact<string> | null; agendaMinutes: Fact<string> | null; nextMeetingDate: Fact<string> | null;
  template: Fact<string> | null; outlineConfirmed: Fact<boolean> | null;
  seen: {topic: BoardMaterialTopic; seen: boolean; origin: Said; source: string}[];
  reasons: {topic: BoardMaterialTopic; author: "chair" | "cfo" | "ceo"; code: (typeof boardMaterialReasonCodes)[number]; origin: Said; source: string}[];
  deadlines: {action: BoardMaterialAction; date: string; origin: Said; source: string}[];
  omissions: {target: "recommendation" | "page" | "deadline"; topic: BoardMaterialTopic | null; action: BoardMaterialAction | null; requestedBy: "chair" | "cfo"; origin: Said; source: string}[];
  /** Proposed identities of a plan instrument and a debt-table row the person said are not the same contract, by the name
   * of either (the creditor, the instrument). */
  linkRejections?: {label: string; origin: Said; source: string}[];
};

type Reading = [string, string, string];
type Plan = ReturnType<typeof boardPlanFor>;
type Page = Plan["pages"][number];
type Deliberation = Plan["deliberations"][number];

type RoleSpec = Parameters<typeof boardRoleRecords>[0];
const bankUnscheduled = "bancario_sem_amortizacao_programada", bankScheduled = "bancario_programado";
const moves = (m: {added?: string[]; removed?: string[]; prepaid?: string[]; charges?: string[]; variant: "same" | "other"}) =>
  ({added: m.added ?? [], removed: m.removed ?? [], prepaid: m.prepaid ?? [], charges: m.charges ?? [], variant: m.variant});
/** The library row of each path the plan of 2027 evaluates, in rank, with the role the method binds it by (the path whose
 * complete moves are the row's, or the status quo the plan registers). Copied from the method's closed library
 * (packages/financial-model/src/board-capital-discussion-templates.ts, the roles of alternatives.row.*); a test checks
 * each equals the template's own, so the planner and the method never bind a row differently. No record id is read. */
export const boardMaterialPathRows: readonly {row: string; role: RoleSpec}[] = [
  {row: "no_line_debenture", role: {bind: "p", role: "path_with_moves", moves: moves({added: [bankUnscheduled, "debenture_nova"], prepaid: ["debenture_atual", "divida_atual"], variant: "other"})}},
  {row: "defer_line", role: {bind: "p", role: "path_with_moves", moves: moves({added: [bankUnscheduled], variant: "other"})}},
  {row: "debenture_with_line", role: {bind: "p", role: "path_with_moves", moves: moves({added: [bankUnscheduled, "fomento", "debenture_nova"], prepaid: ["debenture_atual", "divida_atual"], variant: "same"})}},
  {row: "keep_and_roll", role: {bind: "p", role: "status_quo_path"}},
  {row: "short_bank_loan", role: {bind: "p", role: "path_with_moves", moves: moves({added: [bankScheduled], variant: "same"})}},
  {row: "extend_with_bank", role: {bind: "p", role: "path_with_moves", moves: moves({added: [bankUnscheduled, "fomento", bankScheduled], prepaid: ["divida_atual"], charges: ["waiver|debenture_atual"], variant: "same"})}},
  {row: "extend_bradesco", role: {bind: "p", role: "path_with_moves", moves: moves({added: [bankUnscheduled, "fomento", "aditamento"], removed: ["divida_atual"], variant: "same"})}},
];
/** The other records the library reads, each with the role it is bound by and a template that declares it (for the test). */
export const boardMaterialRecordRoles = {
  q: {template: "situation.cash_shortfall", role: {bind: "q", role: "status_quo_path"}},
  b: {template: "a.roll_bank", role: {bind: "b", role: "path_with_moves", moves: moves({added: [bankUnscheduled, "aditamento"], removed: ["$i"], variant: "other"})}},
  cb: {template: "topic.project_return", role: {bind: "cb", role: "investment_case", caseRole: "base"}},
  cr: {template: "delib.packaging_line.wait", role: {bind: "cr", role: "investment_case", caseRole: "deferral"}},
  cg: {template: "option.staged", role: {bind: "cg", role: "investment_case", caseRole: "staged"}},
  ce: {template: "topic.project_sensitivities", role: {bind: "ce", role: "sensitivity_case", changes: ["project.annualAvoidedOperatingCost", "project.annualVariableOperatingCost",
    "project.annualFixedOperatingCost"], reference: "refe"}},
  cc: {template: "topic.project_sensitivities", role: {bind: "cc", role: "sensitivity_case", changes: ["project.growthCapexPaid", "project.annualDepreciation"], reference: "refc"}},
  cs: {template: "topic.project_sensitivities", role: {bind: "cs", role: "sensitivity_case", changes: ["project.ramp.operationStartMonth"], reference: "refs"}},
  lp: {template: "constraint.covenant_policy", role: {bind: "lp", role: "limit", kind: "board_policy"}},
  lk: {template: "constraint.covenant_policy", role: {bind: "lk", role: "limit", kind: "contractual"}},
  w: {template: "situation.cash_without_line", role: {bind: "w", role: "lowest_cash_alternative_case"}},
} as const satisfies Record<string, {template: string; role: RoleSpec}>;
/** The rows whose line of moves names the bank creditor of the debt table. */
const bankRows = new Set(["no_line_debenture", "debenture_with_line", "extend_with_bank", "extend_bradesco"]);

/** The anchors read from the results before planning: the year of largest maturity, the crop year (the tightest
 * week), the plan's horizon year, the plan target year of the challenged projection, and the first two programs of
 * the receivables plan with the debtor the second one is linked to. None is chosen; each is read. */
type Anchors = {Y: string | null; C: string | null; H: string | null; P: string | null; O1: string | null; O2: string | null; D: string | null;
  /** Covenant measurements by the role the result registers: the headline test, the base test and the adverse test at the
   * end of the year of largest maturity, and the test of the board policy alone at the headline's date. */
  MH: string | null; ME: string | null; MA: string | null; MG: string | null;
  /** Debt table records by what the results register: the row the plan's alternative prepays, the holder of the basket
   * that row occupies, and the one credit line with a free limit. */
  I: string | null; HB: string | null; CL: string | null;
  /** The first year the tested shorter amortization profile of the recommended path falls short. */
  T: string | null;
  /** Records bound by the role their result registers (resolveRoles), and why a role did not bind one. */
  R: RoleRecords};
type RoleRecords = {vars: Record<string, string | null>; rows: Record<string, string | null>; issues: Record<string, string>};
/** A record by its role, or a placeholder naming the role that did not bind one ("_q"): the reading does not resolve and
 * its reason names the role. */
const rec = (a: Anchors, v: string) => a.R.vars[v] ?? `_${v}`;
const rowPath = (a: Anchors, row: string) => a.R.rows[row] ?? null;
/** The figure ids of a path's readings: the path's own id, or the library row when no path binds it. */
const pathFigure = (a: Anchors, row: string) => rowPath(a, row) ?? row;

/** The readings the plan may bind, in the order the basis lists them: [source, path, decimals or date format]. */
function readingsFor(a: Anchors): [string, Reading][] {
  const y = (v: string | null) => v ?? "_";
  const at = (id: string) => `readings.paths[id=${id}].`;
  const paths = boardMaterialPathRows.flatMap(({row}): [string, Reading][] => {
    const id = pathFigure(a, row), path = rowPath(a, row) ?? `_${row}`;
    return [[`${id}-cash`, ["plano-2027", at(path) + "minimumCash.amount", "0"]], [`${id}-lev`, ["plano-2027", at(path) + "worstLeverage", "2"]],
      [`${id}-cost`, ["plano-2027", at(path) + "horizonFinancingCost", "0"]], [`${id}-net`, ["plano-2027", at(path) + "netDebtAtHorizon", "0"]],
      [`${id}-ok`, ["plano-2027", at(path) + "eligible", "-"]], [`${id}-consent`, ["plano-2027", at(path) + "consentRequired", "-"]]];
  });
  const year = (v: string | null): [string, Reading] => [`year-${y(v)}`, ["tabela-divida", `result.table.profile.scheduleByYear[year=${y(v)}].year`, "year"]];
  return [
    ["divida-total", ["tabela-divida", "result.table.reconciliation.principal", "0"]],
    [`principal-${y(a.Y)}`, ["tabela-divida", `result.table.profile.scheduleByYear[year=${y(a.Y)}].principal`, "0"]],
    ["share-12m", ["tabela-divida", "result.table.profile.dueWithinTwelveMonthsShare", "0"]],
    ["wal", ["tabela-divida", "result.table.profile.weightedAverageLifeYears", "1"]],
    ["largest-creditor", ["tabela-divida", "result.table.profile.largestCreditor.creditor", "-"]],
    ["bradesco-creditor", ["tabela-divida", `result.table.rows[id=${a.I ?? "_i"}].creditor`, "-"]],
    ["largest-share", ["tabela-divida", "result.table.profile.largestCreditor.share", "0"]],
    ["basket", ["tabela-divida", `result.table.negativePledgeBaskets[holderId=${y(a.HB)}].basket`, "0"]],
    ["basket-used", ["tabela-divida", `result.table.negativePledgeBaskets[holderId=${y(a.HB)}].occupied`, "0"]],
    ["basket-free", ["tabela-divida", `result.table.negativePledgeBaskets[holderId=${y(a.HB)}].remaining`, "0"]],
    ["bradesco-maturity", ["tabela-divida", `result.table.rows[id=${a.I ?? "_i"}].finalPayment`, "month_long"]],
    ["cov-limit", ["covenant", `result.headroom.limits[id=${rec(a, "lk")}].maximumRatio`, "1"]],
    ["policy-limit", ["covenant", `result.headroom.limits[id=${rec(a, "lp")}].maximumRatio`, "1"]],
    ["lev-dez26", ["covenant", `result.headroom.measurements[id=${y(a.MH)}].ratio`, "1"]],
    ["lev-dez27", ["covenant", `result.headroom.measurements[id=${y(a.ME)}].ratio`, "2"]],
    ["lev-adv27", ["covenant", `result.headroom.measurements[id=${y(a.MA)}].ratio`, "2"]],
    ["ebitda-adv27", ["covenant", `result.headroom.measurements[id=${y(a.MA)}].reportedEbitda`, "1"]],
    ["lev-ger-dez26", ["covenant", `result.headroom.measurements[id=${y(a.MG)}].ratio`, "1"]],
    ["min-cash", ["caixa-semanal", "result.weekly.minimumCash", "0"]],
    ["sem-linha-min", ["caixa-semanal", `readings.sensitivities[caseId=${rec(a, "w")}].minimum`, "1"]],
    ["sem-linha-week", ["caixa-semanal", `readings.sensitivities[caseId=${rec(a, "w")}].weekStart`, "day_long"]],
    ["tight-week", ["caixa-semanal", "readings.tightestWeek.weekStart", "day_long"]],
    ["irr", ["linha-embalagem", `comparison.metrics[caseId=${rec(a, "cb")}].annualIrr`, "0"]],
    ["wacc", ["linha-embalagem", `comparison.metrics[caseId=${rec(a, "cb")}].discountRate`, "0"]],
    ["npv", ["linha-embalagem", `comparison.metrics[caseId=${rec(a, "cb")}].netPresentValue`, "1"]],
    ["payback", ["linha-embalagem", `comparison.metrics[caseId=${rec(a, "cb")}].paybackYears`, "0"]],
    ["peak-need", ["linha-embalagem", `comparison.metrics[caseId=${rec(a, "cb")}].peakCumulativeCashNeed.amount`, "1"]],
    ["peak-date", ["linha-embalagem", `comparison.metrics[caseId=${rec(a, "cb")}].peakCumulativeCashNeed.periodEndDate`, "month_long"]],
    ["npv-economy", ["linha-embalagem", `comparison.metrics[caseId=${rec(a, "ce")}].netPresentValue`, "1"]],
    ["npv-capex", ["linha-embalagem", `comparison.metrics[caseId=${rec(a, "cc")}].netPresentValue`, "1"]],
    ["npv-slow", ["linha-embalagem", `comparison.metrics[caseId=${rec(a, "cs")}].netPresentValue`, "1"]],
    ["npv-defer", ["linha-embalagem", `comparison.metrics[caseId=${rec(a, "cr")}].netPresentValue`, "1"]],
    ["irr-defer", ["linha-embalagem", `comparison.metrics[caseId=${rec(a, "cr")}].annualIrr`, "0"]],
    ["wheat-shock", ["projecao", `result.projection.projection.scenarios[id=${rec(a, "sw")}].inputCostShock.rate`, "0"]],
    ["wheat-lag", ["projecao", `result.projection.projection.scenarios[id=${rec(a, "sw")}].inputCostShock.passThroughLagMonths`, "0"]],
    ["ebitda-wheat", ["projecao", `readings.projected.scenarios[id=${rec(a, "sw")}].rows[periodId=${y(a.Y)}-12-31].ebitda`, "1"]],
    ["wc-60", ["projecao", `readings.projected.scenarios[id=${rec(a, "sr")}].rows[periodId=${y(a.C)}-12-31].effects.changeInWorkingCapital`, "0"]],
    ["fpa-2028", ["plano-fpa", "readings.gap.plan.ebitda", "0"]],
    ["ref-2028", ["plano-fpa", "readings.gap.reference.ebitda", "0"]],
    ["programs", ["recebiveis", `readings.plan[optionId=${y(a.O2)}].cumulative`, "1"]],
    ["spread-b", ["recebiveis", `readings.options[id=${y(a.O1)}].spreadOverDi`, "1"]],
    ["spread-a", ["recebiveis", `readings.options[id=${y(a.O2)}].spreadOverDi`, "1"]],
    ["rede-a", ["recebiveis", `result.funding.portfolio.items[itemId=${y(a.D)}].amount`, "1"]],
    ["rede-a-retained", ["recebiveis", `result.funding.options[id=${y(a.O2)}].byItem[itemId=${y(a.D)}].retained`, "1"]],
    ["need-peak", ["recebiveis", "result.funding.need.peak", "0"]],
    ["carteira", ["recebiveis", "readings.gross", "0"]],
    ["gap-bps", ["custo-relativo", "decomposition.grossBps", "0"]],
    ["date-bps", ["custo-relativo", "result.bridge.steps[family=pricing_date].bps", "0"]],
    ["known-bps", ["custo-relativo", "result.bridge.knownAdjustmentsBps", "0"]],
    ["unexplained-bps", ["custo-relativo", "result.bridge.unexplainedAfterKnownAdjustmentsBps", "0"]],
    ["rating-low", ["custo-relativo", "levers[role=rating&scenario=low].netOfKnownCosts", "2"]],
    ["rating-high", ["custo-relativo", "levers[role=rating&scenario=high].netOfKnownCosts", "2"]],
    ["cl-creditor", ["tabela-divida", `result.table.creditLines[id=${y(a.CL)}].creditor`, "-"]],
    ["cl-unused", ["tabela-divida", `result.table.creditLines[id=${y(a.CL)}].unused`, "0"]],
    ["debenture-creditor", ["tabela-divida", `result.table.rows[id=${y(a.HB)}].creditor`, "-"]],
    ["rede-a-label", ["recebiveis", `result.funding.portfolio.items[itemId=${y(a.D)}].label`, "-"]],
    ["project-label", ["linha-embalagem", `cases[id=${rec(a, "cb")}].label`, "-"]],
    ["wheat-label", ["projecao", `result.projection.projection.scenarios[id=${rec(a, "sw")}].label`, "-"]],
    ["crop-question", ["recebiveis", "question", "-"]],
    [`cash-end-${y(a.Y)}`, ["plano-2027", `result.evaluation.paths[id=${rec(a, "q")}].closingAvailableByPeriod[periodId=${y(a.Y)}-12-31].closingAvailable`, "0"]],
    [`service-${y(a.Y)}`, ["plano-2027", `result.evaluation.paths[id=${rec(a, "q")}].debtServiceByYear[year=${y(a.Y)}].service`, "0"]],
    [`available-${y(a.Y)}`, ["plano-2027", `result.evaluation.paths[id=${rec(a, "q")}].debtServiceByYear[year=${y(a.Y)}].availableForService`, "0"]],
    ["n-paths", ["plano-2027", "readings.horizon.candidatePaths", "0"]],
    ["debenture-amount", ["plano-2027", "readings.recommendation.longInstrument.issueTarget", "0"]],
    ["issue-floor", ["plano-2027", "readings.recommendation.longInstrument.issueFloorInsideGates", "2"]],
    ["debenture-term", ["plano-2027", "readings.recommendation.longInstrument.termYears", "0"]],
    ["deb-cost-low", ["plano-2027", "readings.recommendation.longInstrument.equivalentSpread", "2"]],
    ["deb-cost-high", ["plano-2027", "readings.recommendation.longInstrument.equivalentSpreadAtCondition", "2"]],
    ["amort-first", ["plano-2027", "readings.recommendation.longInstrument.firstAmortizationYear", "year"]],
    ["amort-last", ["plano-2027", "readings.recommendation.longInstrument.lastAmortizationYear", "year"]],
    ["bradesco-gap", ["plano-2027", `result.evaluation.paths[id=${rec(a, "b")}].shortfallVsPolicyMinimum`, "0"]],
    ["five-year-amort", ["plano-2027", `result.evaluation.paths[id=${rec(a, "pr")}].amortizationTests[profileId=${rec(a, "t")}].years[year=${y(a.T)}].scheduledAmortization`, "0"]],
    ["five-year-available", ["plano-2027", `result.evaluation.paths[id=${rec(a, "pr")}].amortizationTests[profileId=${rec(a, "t")}].years[year=${y(a.T)}].availableAfterInterest`, "0"]],
    ["alt-amount", ["plano-2027", "readings.alternative.issueTarget", "0"]],
    ["cost-2028", ["plano-2027", "readings.recommendation.horizonFinancingCost", "0"]],
    ["net-debt-2028", ["plano-2027", "readings.recommendation.netDebtAtHorizon", "0"]],
    year(a.C), year(a.Y), year(a.H), year(a.P),
    ["dez26-date", ["covenant", `result.headroom.measurements[id=${y(a.MH)}].date`, "month_long"]],
    ["dez27-date", ["covenant", `result.headroom.measurements[id=${y(a.ME)}].date`, "month_long"]],
    ["horizon-12m", ["tabela-divida", "result.table.profile.twelveMonthHorizon", "month_long"]],
    ...paths,
  ];
}
/** Readings that, when the result does not register them, stand as pending with the library's reason. */
const pendingReadingsFor = (a: Anchors): [string, Reading, string, string][] => [
  // When the analysis registers no staged case, the role's own name stands for the record in the pending reading.
  ["stages-npv", ["linha-embalagem", `comparison.metrics[caseId=${a.R.vars.cg ?? "staged"}].netPresentValue`, "1"], "analyze-investment-project", "note.case_not_reviewed"],
  ["cl-terms", ["tabela-divida", `result.table.creditLines[id=${a.CL ?? "_"}].terms`, "-"], "build-company-debt-table", "note.credit_line_terms_not_registered"],
];
/** Readings listed whether or not a text binds them (the question the receivables result answers, kept for reference). */
const contextReadings = new Set(["crop-question"]);
/** The material facts the plan marks on top of every economic reading. */
const materialFor = (a: Anchors) => [`principal-${a.Y ?? "_"}`, `cash-end-${a.Y ?? "_"}`, "debenture-amount", "deb-cost-low", "deb-cost-high", "bradesco-gap", "share-12m", "min-cash", "sem-linha-min",
  "cov-limit", "policy-limit", "irr", "wacc", "npv", "payback", "peak-need", "npv-economy", "npv-capex", "npv-slow", "programs", "lev-dez26", "lev-adv27", "ebitda-wheat", "wc-60"];

/** The plan: the closed library's arrangement of a board discussion of capital, with the anchors read from the results. */
function boardPlanFor(a: Anchors) {
  const Y = a.Y ?? "_", C = a.C ?? "_", H = a.H ?? "_", P = a.P ?? "_";
  return {
    deliberations: [
      {id: "linha", title: "delib.packaging_line|projeto=project-label", subject: "delib.packaging_line.subject|projeto=project-label",
        recommendation: "delib.packaging_line.wait" as string | null, deadlines: [{id: "aviso", action: "delib.action.supplier_notice", code: "supplier_notice" as BoardMaterialAction}]},
      {id: "vencimentos", title: `delib.maturities|ano=year-${Y}`, subject: `delib.maturities.subject|ano=year-${Y}`,
        recommendation: "delib.maturities.sounding|valor=debenture-amount|prazo=debenture-term" as string | null,
        deadlines: [{id: "sondagem", action: "delib.action.finish_sounding", code: "finish_sounding" as BoardMaterialAction}, {id: "rota", action: "delib.action.decide_route", code: "decide_route" as BoardMaterialAction}]},
      {id: "politica", title: "delib.policy", subject: "delib.policy.definition|limite=policy-limit", recommendation: null as string | null, deadlines: [] as {id: string; action: string; code: BoardMaterialAction}[]},
      {id: "safra", title: `delib.crop|ano=year-${C}`, subject: `delib.crop.subject|ano=year-${C}`, recommendation: "delib.crop.programs" as string | null,
        deadlines: [{id: "adesao", action: "delib.action.join_programs", code: "join_programs" as BoardMaterialAction}]},
    ],
    pages: [
      {id: "decisoes", role: "decisions", topicId: "geral", title: "page.decisions", lines: [] as string[], recommendation: null as string | null, options: [] as string[]},
      {id: "divida", role: "situation", topicId: "geral", title: `situation.debt_total|total=divida-total|ano=year-${Y}`, recommendation: null, options: [],
        lines: [`situation.debt_maturity|principal=principal-${Y}|ano=year-${Y}|parcela=share-12m|horizonte=horizon-12m`, "situation.debt_profile|prazo=wal|credor=largest-creditor|participacao=largest-share"]},
      {id: "caixa", role: "situation", topicId: "geral", title: `situation.cash_shortfall|semana=tight-week|saldo=cash-end-${Y}|ano=year-${Y}`, recommendation: null, options: [],
        lines: ["situation.cash_without_line|semana=sem-linha-week|saldo=sem-linha-min|minimo=min-cash", `situation.debt_service|ano=year-${Y}|servico=service-${Y}|disponivel=available-${Y}`]},
      {id: "escritura", role: "constraint", topicId: "geral", title: "constraint.indenture_basket|titular=debenture-creditor|saldo=basket-free", recommendation: null, options: [],
        lines: ["constraint.basket_usage|cesta=basket|ocupado=basket-used|credor=bradesco-creditor", "constraint.covenant_policy|covenant=cov-limit|politica=policy-limit"]},
      {id: "linha", role: "topic", topicId: "linha-embalagem", title: "topic.project_return|retorno=irr|custo=wacc|projeto=project-label",
        lines: ["topic.project_value|retorno=irr|custo=wacc|vpl=npv", "topic.project_payback|payback=payback|pico=peak-need|data=peak-date",
          "topic.project_sensitivities|vpl_economia=npv-economy|vpl_capex=npv-capex|vpl_partida=npv-slow", "topic.project_strategic_reason|motivo=informed:motivo-estrategico"],
        recommendation: "topic.project_wait_quotes_registered|vpl=npv-defer|retorno=irr-defer",
        options: ["option.go_now|vpl=npv|retorno=irr", "option.staged|vpl=stages-npv", "option.wait_quotes_registered|vpl=npv-defer|retorno=irr-defer"]},
      {id: "safra", role: "topic", topicId: "safra", title: "topic.crop_programs|valor=programs|pico=need-peak", recommendation: null, options: [],
        lines: ["topic.crop_program_cost|taxa_b=spread-b|taxa_a=spread-a", "topic.crop_overdraft|credor=cl-creditor|livre=cl-unused|termos=cl-terms"]},
      {id: "caminhos", role: "alternatives", topicId: "vencimentos", title: `alternatives.count|caminhos=n-paths|ano=year-${Y}`, recommendation: null, options: [],
        lines: boardMaterialPathRows.map(({row}) => {const id = pathFigure(a, row);
          return `alternatives.row.${row}|caixa=${id}-cash|alavancagem=${id}-lev|custo=${id}-cost|ano=year-${H}|divida=${id}-net|criterios=${id}-ok|anuencia=${id}-consent`;})},
      {id: "movimentos", role: "alternatives", topicId: "vencimentos", title: "alternatives.moves.title|caminhos=n-paths", recommendation: null, options: [],
        lines: boardMaterialPathRows.map(({row}) => `alternatives.moves.${row}|projeto=project-label${bankRows.has(row) ? "|credor=bradesco-creditor" : ""}`)},
      {id: "recomendacao", role: "recommendation", topicId: "vencimentos", title: "recommendation.debenture|valor=debenture-amount|prazo=debenture-term", recommendation: null, options: [],
        lines: ["recommendation.debenture_cost|credor=bradesco-creditor|baixo=deb-cost-low|alto=deb-cost-high", "recommendation.amortization|inicio=amort-first|fim=amort-last",
          "recommendation.alternative|credor=bradesco-creditor|prazo=deadline:vencimentos.rota|projeto=project-label"]},
      {id: "alavancagem", role: "risk", topicId: "vencimentos", title: `risk.leverage|politica=policy-limit|adverso=lev-adv27|ano=year-${Y}`, recommendation: null, options: [],
        lines: ["risk.leverage_path|inicio=lev-dez26|data_inicio=dez26-date|fim=lev-dez27|data_fim=dez27-date", `risk.leverage_adverse|ano=year-${Y}|adverso=lev-adv27|politica=policy-limit`]},
      {id: "politica", role: "risk", topicId: "politica", title: "risk.policy_definition|politica=policy-limit", recommendation: null, options: [],
        lines: ["risk.policy_readings|gerencial=lev-ger-dez26|escritura=lev-dez26|data=dez26-date"]},
      {id: "mudaria", role: "what_changes", topicId: "vencimentos", title: "what_changes.title|piso=issue-floor", recommendation: null, options: [],
        lines: ["what_changes.demand|piso=issue-floor|alvo=debenture-amount", `what_changes.wheat|choque=wheat-shock|defasagem=wheat-lag|ano=year-${Y}|ebitda=ebitda-wheat|insumo=wheat-label`,
          `what_changes.receivable_days|ano=year-${C}|giro=wc-60`]},
      {id: "passos", role: "next_steps", topicId: "geral", title: "next_steps.title", recommendation: null, options: [],
        lines: ["next_steps.notice|prazo=deadline:linha.aviso|projeto=project-label", "next_steps.programs|prazo=deadline:safra.adesao",
          "next_steps.sounding|prazo=deadline:vencimentos.sondagem", `next_steps.route|prazo=deadline:vencimentos.rota|ano=year-${Y}`]},
    ] as {id: string; role: string; topicId: string; title: string; lines: string[]; recommendation: string | null; options: string[]}[],
    summary: {opening: `summary.opening.debt_and_cash|principal=principal-${Y}|ano=year-${Y}|semana=tight-week`, closing: "summary.closing.leverage|alavancagem=lev-dez26|data=dez26-date|politica=policy-limit"},
    appendix: [
      {id: "tabela", label: "appendix.debt_table", sourceIds: ["tabela-divida"]}, {id: "projecao", label: "appendix.projection", sourceIds: ["projecao"]},
      {id: "plano-fpa", label: "appendix.plan_vs_base", sourceIds: ["plano-fpa"]}, {id: "fontes", label: "appendix.sources", sourceIds: Object.values(boardMaterialSourceIds) as string[]},
    ],
    questions: [
      {id: "bradesco", question: "q.roll_bank|credor=bradesco-creditor", answer: "a.roll_bank|credor=bradesco-creditor|falta=bradesco-gap|vencimento=bradesco-maturity|projeto=project-label"},
      {id: "prazo", question: "q.term|prazo=debenture-term", answer: "a.term|ano=amort-first|amortizacao=five-year-amort|disponivel=five-year-available"},
      {id: "demanda", question: "q.demand", answer: "a.demand|valor=alt-amount|prazo=deadline:vencimentos.rota|credor=bradesco-creditor|vencimento=bradesco-maturity|projeto=project-label"},
      {id: "custo", question: "q.cost", answer: `a.cost|baixo=deb-cost-low|alto=deb-cost-high|custo=cost-2028|ano=year-${H}|divida=net-debt-2028|ano_fim=year-${H}`},
      {id: "serra-verde", question: "q.peer", answer: "a.peer|total=gap-bps|ajustes=known-bps|data=date-bps|resto=unexplained-bps"},
      {id: "rating", question: "q.rating", answer: "a.rating|baixo=rating-low|alto=rating-high"},
      {id: "estrategica", question: "q.strategic|projeto=project-label", answer: "a.strategic|retorno=irr|custo=wacc"},
      {id: "trigo", question: "q.wheat|insumo=wheat-label", answer: `a.wheat|choque=wheat-shock|defasagem=wheat-lag|ano=year-${Y}|ebitda=ebitda-wheat|ebitda_adverso=ebitda-adv27|alavancagem=lev-adv27|covenant=cov-limit|insumo=wheat-label`},
      {id: "rede-a", question: "q.anchor|rede=rede-a-label", answer: "a.anchor|rede=rede-a-label|saldo=rede-a|carteira=carteira|volume=rede-a-retained|taxa=spread-a"},
      {id: "fpa", question: `q.plan_vs_base|plano=fpa-2028|ano=year-${P}|base=ref-2028`, answer: "a.plan_vs_base|base=ref-2028"},
    ],
  };
}

/** The bindings of a template reference: figure ids, deadlines (deliberation.deadline) and informed facts. */
export function boardRefBindings(ref: string): {figures: string[]; deadlines: string[]; informed: string[]} {
  const out = {figures: [] as string[], deadlines: [] as string[], informed: [] as string[]};
  for (const part of ref.split("|").slice(1)) {
    const value = part.slice(part.indexOf("=") + 1);
    if (value.startsWith("deadline:")) out.deadlines.push(value.slice(9));
    else if (value.startsWith("informed:")) out.informed.push(value.slice(9));
    else out.figures.push(value);
  }
  return out;
}
const templateOf = (ref: string) => ref.split("|")[0]!;

const isRecord = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
const text = (v: unknown) => typeof v === "string" ? v : null;
/** The anchors, each read from its result; an anchor the result does not determine stays null. */
/** A proposed identity of an existing instrument of the plan and a row of the debt table: the same contract, proposed by
 * the bridge from the terms both results register and never adopted until the person confirms it on the card. */
export type BoardMaterialLink = {id: string; instrumentId: string; rowId: string; creditor: string; instrumentLabel: string; terms: string[]};
type Contribution = {fieldPath?: unknown; value?: {value?: unknown}};
const contributionsOf = (packet: Record<string, unknown> | undefined): Contribution[] => {
  const c = (packet?.result as {contributions?: unknown} | undefined)?.contributions;
  return Array.isArray(c) ? c.filter(isRecord) as Contribution[] : [];
};
const termOf = (cs: Contribution[], suffix: string): unknown => {
  const hits = cs.filter((c) => typeof c.fieldPath === "string" && c.fieldPath.endsWith(`.${suffix}`));
  return hits.length === 1 ? hits[0]!.value?.value : undefined;
};
const linkKey = /^[a-z0-9][a-z0-9-]{0,39}$/;
/** A source reading for the method's own role and identity checks, built from a verified result. */
function sourceReader(packets: Map<string, Record<string, unknown>>, methods: Map<string, string>) {
  return (methodId: string): BoardSourceReading => {
    const id = [...methods].find(([, m]) => m === methodId)?.[0];
    if (!id) throw new Error(`source_absent:${methodId}`);
    return {id, methodId, packet: packets.get(id)!} as unknown as BoardSourceReading;
  };
}
/** The identities the bridge can propose: an existing instrument of the plan and a row of the debt table whose contractual
 * terms registered in both results agree on at least one term (final payment date, or spread or fixed rate) and differ on
 * none, by the method's own check (boardLinkedInstrument); only a pair where each side has exactly one such counterpart,
 * and none the person rejected. Terms agreeing do not prove the identity: the person confirms or rejects it on the card. */
export function proposeBoardMaterialLinks(packets: Map<string, Record<string, unknown>>, methods: Map<string, string>,
  rejected: readonly string[] = []): BoardMaterialLink[] {
  const plan = packets.get("plano-2027"), table = packets.get("tabela-divida");
  if (!plan || !table) return [];
  const sourceOf = sourceReader(packets, methods), plans = contributionsOf(plan);
  const instruments = [...new Set(plans.flatMap((c) => {const m = typeof c.fieldPath === "string" ? /\.instrument\.([a-z0-9-]+)\.terms$/.exec(c.fieldPath) : null;
    return m && Array.isArray(c.value?.value) && c.value.value[0] === "existing" ? [m[1]!] : [];}))];
  const rows = (() => {const r = readBoardSourcePath(table, "result.table.rows"); return Array.isArray(r) ? r.filter(isRecord) : [];})();
  const fold = (x: string) => x.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  const refused = rejected.map(fold).filter((x) => x.length > 1);
  const pairs: {instrumentId: string; row: Record<string, unknown>; terms: string[]}[] = [];
  for (const instrumentId of instruments) for (const row of rows) {
    const rowId = text(row.id);
    if (rowId === null) continue;
    try {
      boardLinkedInstrument("bridge", {bind: "j", role: "plan_instrument_of_row", row: "i"},
        [{id: "proposed", planSourceId: "plano-2027", instrumentId, tableSourceId: "tabela-divida", rowId}], sourceOf, {i: rowId});
    } catch { continue; }
    const terms: string[] = [];
    const final = termOf(plans, `instrument.${instrumentId}.finalPaymentDate`);
    if (typeof final === "string" && final === row.finalPayment) terms.push(`vencimento final ${final}`);
    const rates = termOf(plans, `instrument.${instrumentId}.rates`), rate = Array.isArray(rates) ? rates[0] : undefined;
    if (typeof rate === "string" && typeof row.spread === "string" && Number(rate) === Number(row.spread)) terms.push(`taxa ou spread ${row.spread}`);
    if (terms.length) pairs.push({instrumentId, row, terms});
  }
  const count = (f: (p: (typeof pairs)[number]) => string) => (p: (typeof pairs)[number]) => pairs.filter((x) => f(x) === f(p)).length;
  const byInstrument = count((p) => p.instrumentId), byRow = count((p) => String(p.row.id));
  return pairs.filter((p) => byInstrument(p) === 1 && byRow(p) === 1).flatMap((p, n) => {
    const rowId = String(p.row.id), creditor = text(p.row.creditor) ?? rowId;
    const label = text(termOf(plans, `instrument.${p.instrumentId}.label`)) ?? p.instrumentId;
    if (refused.some((r) => [creditor, label, rowId, p.instrumentId].some((x) => fold(x).includes(r) || r.includes(fold(x))))) return [];
    return [{id: linkKey.test(rowId) ? rowId : `vinculo-${n + 1}`, instrumentId: p.instrumentId, rowId, creditor, instrumentLabel: label, terms: p.terms}];
  });
}
/** The records the library reads, each bound by the role its result registers, as the method binds them (boardRoleRecords);
 * the plan's path of each library row; the recommended path's tested shorter profile; the scenarios the projection
 * defines by exactly one driver. A role that binds none or more than one record is named, never chosen by order. */
function resolveRoles(packets: Map<string, Record<string, unknown>>, methods: Map<string, string>, named: {i: string | null; j: string | null}): RoleRecords {
  const sourceOf = sourceReader(packets, methods), vars: Record<string, string | null> = {}, rows: Record<string, string | null> = {}, issues: Record<string, string> = {};
  const bound = {...named.i ? {i: named.i} : {}, ...named.j ? {j: named.j} : {}};
  // As the method binds them: a role whose moves name the instrument "$i" reads it under the confirmed identity (the
  // template binds $j first); every other role reads the plan's existing debt as such.
  const one = (key: string, role: RoleSpec): string | null => {
    let got: ReturnType<typeof boardRoleRecords>;
    const named = JSON.stringify(role).includes('"$i"');
    if (named && !bound.j) {issues[key] = "link_absent"; return null;}
    try { got = boardRoleRecords(role, sourceOf, named ? bound : {}); } catch { issues[key] = "source_unavailable"; return null; }
    if (typeof got === "string") {issues[key] = `role_refused_${got}`; return null;}
    if (got.length !== 1) {issues[key] = got.length ? "role_ambiguous" : "role_absent"; return null;}
    return got[0]!.id;
  };
  for (const [k, x] of Object.entries(boardMaterialRecordRoles)) vars[k] = one(k, x.role as RoleSpec);
  for (const {row, role} of boardMaterialPathRows) rows[row] = one(row, role);
  const plan = packets.get("plano-2027"), projection = packets.get("projecao");
  // The recommended path (registered by the plan) and its tested profile that falls short while the adopted one passes.
  vars.pr = plan ? text(readBoardSourcePath(plan, "readings.recommendation.pathId")) : null;
  if (vars.pr === null) issues.pr = "role_absent";
  const tests = plan && vars.pr ? readBoardSourcePath(plan, `result.evaluation.paths[id=${vars.pr}].amortizationTests`) : undefined;
  const shorter = (Array.isArray(tests) ? tests.filter(isRecord) : []).filter((t) => t.profileId !== "adopted" && t.passes === false);
  vars.t = shorter.length === 1 ? text(shorter[0]!.profileId) : null;
  if (vars.t === null) issues.t = shorter.length ? "role_ambiguous" : "role_absent";
  // The scenarios the projection defines against the one each derives from by exactly one driver: the input cost shock
  // (the one the person informed, when several do) and the receivable days.
  const scenarios = projection ? readBoardSourcePath(projection, "result.projection.projection.scenarios") : undefined;
  const drivers = (x: Record<string, unknown>) => [...x.volumeGrowthRate != null ? ["volumeGrowthRate"] : [], ...x.volumeFactor != null ? ["volumeFactor"] : [],
    ...Array.isArray(x.overriddenDrivers) ? x.overriddenDrivers.map(String) : [], ...x.inputCostShock != null ? ["inputCostShock"] : []];
  const defining = (driver: string) => (Array.isArray(scenarios) ? scenarios.filter(isRecord) : []).filter((x) => {const d = drivers(x); return d.length === 1 && d[0] === driver;});
  const pick = (key: string, xs: Record<string, unknown>[]) => {
    const informed = xs.filter((x) => x.role === "informed"), chosen = informed.length ? informed : xs;
    vars[key] = chosen.length === 1 ? text(chosen[0]!.id) : null;
    if (vars[key] === null) issues[key] = chosen.length ? "role_ambiguous" : "role_absent";
  };
  pick("sw", defining("inputCostShock")); pick("sr", defining("receivableDays"));
  return {vars, rows, issues};
}
function readAnchors(packets: Map<string, Record<string, unknown>>, methods: Map<string, string> = new Map(), links: readonly BoardMaterialLink[] = []): Anchors {
  const get = (id: string, path: string) => {const p = packets.get(id); return p ? readBoardSourcePath(p, path) : undefined;};
  const schedule = get("tabela-divida", "result.table.profile.scheduleByYear");
  let Y: string | null = null;
  if (Array.isArray(schedule) && schedule.length) {
    const rows = schedule.filter(isRecord).map((r) => ({year: r.year, principal: Number(r.principal)}));
    const top = Math.max(...rows.map((r) => r.principal)), largest = rows.filter((r) => r.principal === top);
    // The largest maturity is one year, or the plan names none.
    if (largest.length === 1 && typeof largest[0]!.year === "number") Y = String(largest[0]!.year);
  }
  const yearOf = (v: unknown) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v.slice(0, 4) : null;
  const steps = get("recebiveis", "result.funding.plan.steps");
  const step = (n: number) => Array.isArray(steps) && isRecord(steps[n]) ? text(steps[n].optionId) : null;
  const O1 = step(0), O2 = step(1);
  // The debtor the second program is linked to in the result's own adopted terms (one debtor, or none named).
  let D: string | null = null;
  const contributions = get("recebiveis", "result.contributions");
  if (O2 && Array.isArray(contributions)) {
    const linked = contributions.filter(isRecord).filter((c) => typeof c.fieldPath === "string" && c.fieldPath.endsWith(`.option.${O2}.anchorItemIds`))
      .map((c) => (c.value as {value?: unknown} | undefined)?.value);
    if (linked.length === 1 && Array.isArray(linked[0]) && linked[0].length === 1 && typeof linked[0][0] === "string") D = linked[0][0];
  }
  const one = (xs: (string | null)[]) => {const set = [...new Set(xs.filter((x): x is string => x !== null))]; return set.length === 1 ? set[0]! : null;};
  // Covenant measurements by registered role, scenario, date and the kinds of the limits each one tests.
  const limits = get("covenant", "result.headroom.limits"), measured = get("covenant", "result.headroom.measurements");
  const kindOf = new Map((Array.isArray(limits) ? limits.filter(isRecord) : []).map((l) => [String(l.id), String(l.kind)]));
  const ms = (Array.isArray(measured) ? measured.filter(isRecord) : []).map((m) => ({id: text(m.id), role: text(m.role), scenario: text(m.scenario), date: text(m.date),
    kinds: (Array.isArray(m.tests) ? m.tests.filter(isRecord) : []).map((t) => kindOf.get(String(t.limitId)) ?? "")}));
  const MH = text(get("covenant", "readings.headline.measurementId"));
  const headline = ms.find((m) => m.id === MH && m.role === "test" && m.scenario === "base") ?? null;
  const end = Y === null ? null : `${Y}-12-31`;
  const both = (m: {kinds: string[]}) => m.kinds.includes("contractual") && m.kinds.includes("board_policy");
  const ME = end === null ? null : one(ms.filter((m) => m.role === "test" && m.scenario === "base" && m.date === end && both(m)).map((m) => m.id));
  const MA = end === null ? null : one(ms.filter((m) => m.role === "test" && m.scenario === "adverse" && m.date === end && both(m)).map((m) => m.id));
  const MG = headline === null ? null : one(ms.filter((m) => m.role === "test" && m.scenario === "base" && m.date === headline.date && m.id !== MH
    && m.kinds.length > 0 && m.kinds.every((k) => k === "board_policy")).map((m) => m.id));
  // The row of the instrument the plan's alternative prepays, by the identity proposed for the two records (never by a
  // shared id); the basket it occupies; the free line.
  const alt = text(get("plano-2027", "readings.alternative.pathId"));
  const prepaid = alt === null ? undefined : get("plano-2027", `result.evaluation.paths[id=${alt}].prepayments`);
  const prepaidIds = new Set((Array.isArray(prepaid) ? prepaid.filter(isRecord) : []).map((x) => text(x.instrumentId)));
  const I = one(links.filter((l) => prepaidIds.has(l.instrumentId)).map((l) => l.rowId));
  const J = I === null ? null : links.find((l) => l.rowId === I)!.instrumentId;
  const baskets = get("tabela-divida", "result.table.negativePledgeBaskets");
  const HB = I === null ? null : one((Array.isArray(baskets) ? baskets.filter(isRecord) : []).filter((b) => Array.isArray(b.usedBy) && b.usedBy.includes(I)).map((b) => text(b.holderId)));
  const lines = get("tabela-divida", "result.table.creditLines");
  const CL = one((Array.isArray(lines) ? lines.filter(isRecord) : []).filter((l) => Number(l.unused) > 0).map((l) => text(l.id)));
  const R = resolveRoles(packets, methods, {i: I, j: J});
  // The row of the prepaid instrument is known only by an identity the person confirms: without one, the texts that name
  // its creditor ask which row of the debt table that instrument is.
  if (I === null) {
    const plans = contributionsOf(packets.get("plano-2027")), existing = [...prepaidIds].filter((x): x is string => x !== null
      && (termOf(plans, `instrument.${x}.terms`) as unknown[] | undefined)?.[0] === "existing");
    R.issues.i = existing.length === 1 ? `link_absent:${text(termOf(plans, `instrument.${existing[0]}.label`)) ?? existing[0]}` : "record_not_identified";
  }
  // Every role that reads that instrument names the same question.
  for (const [k, v] of Object.entries(R.issues)) if (v === "link_absent") R.issues[k] = R.issues.i?.startsWith("link_absent:") ? R.issues.i : "record_not_identified";
  const shortfall = R.vars.pr && R.vars.t ? get("plano-2027", `result.evaluation.paths[id=${R.vars.pr}].amortizationTests[profileId=${R.vars.t}].firstShortfallYear`) : null;
  const T = typeof shortfall === "number" ? String(shortfall) : typeof shortfall === "string" && /^\d{4}$/.test(shortfall) ? shortfall : null;
  return {Y, C: yearOf(get("caixa-semanal", "readings.tightestWeek.weekStart")), H: yearOf(get("plano-2027", "readings.horizon.lastPeriodEnd")),
    P: (() => {const v = get("plano-fpa", "readings.gap.targetPeriodId"); return typeof v === "string" && /^\d{4}/.test(v) ? v.slice(0, 4) : typeof v === "number" ? String(v) : null;})(), O1, O2, D,
    MH: headline ? MH : null, ME, MA, MG, I, HB, CL, T, R};
}

/** One reading resolved in its result: the value stated is the result's own, rounded as the plan presents it. */
function resolveReading(packets: Map<string, Record<string, unknown>>, methods: Map<string, string>, scales: Map<string, "reais" | "millions">,
  [source, path, presentation]: Reading): string[] | null {
  const packet = packets.get(source), methodId = methods.get(source), moneyScale = scales.get(source);
  if (!packet || !methodId || !moneyScale || /=_[a-z_]*\]|_-12-31/.test(path)) return null;
  const spec = boardFieldOf(methodId, path);
  if (!spec) return null;
  const raw = readBoardSourcePath(packet, path);
  if (raw === undefined || raw === null) return null;
  const months = spec.period === "derived" ? spec.horizonMonths?.(packet, path) ?? null : null;
  const currency = typeof packet.currency === "string" ? packet.currency : "";
  let check: ReturnType<typeof formatBoardReading>;
  // A money reading is shown in the scale the database records for its source method, never one read off the packet.
  try { check = formatBoardReading(raw, {...spec, scale: boardEffectiveScale(spec, {id: source, moneyScale})}, presentation, null, currency, months); } catch { return null; }
  if (!check) return null;
  return spec.kind === "label" || spec.kind === "flag" ? [source, path, presentation] : [source, path, presentation, check.rounded];
}

export type BoardMaterialOmitted = {item: string; reason: string};
export type BoardMaterialPlanned = {status: "complete"; facts: BoardCapitalDiscussionFacts; housePremiseKeys: string[]; omitted: BoardMaterialOmitted[]; pins: BoardMaterialPin[]}
  | {status: "missing"; missing: string[]; omitted: BoardMaterialOmitted[]};

/** Plans the board discussion over the reviewed results and the conversation. `check` runs the method over the
 * facts (as the confirmation will) and returns its refusal message, or null; without it the plan is returned as is. */
export function planBoardMaterial(input: {ids: {discussionId: string; definitionVersionId: string}; today: string; perimeter: string; currency: "BRL";
  priors: Partial<Record<string, BoardMaterialPrior | null>>; conversation: BoardMaterialConversation; check?: (facts: BoardCapitalDiscussionFacts) => string | null}): BoardMaterialPlanned {
  const omitted: BoardMaterialOmitted[] = [], missing: string[] = [], house: string[] = [];
  const conv = input.conversation;
  // 1. The sources: the latest completed result of each released method, checked by identity before anything is read.
  const packets = new Map<string, Record<string, unknown>>(), methods = new Map<string, string>(), scales = new Map<string, "reais" | "millions">(), pins: BoardMaterialPin[] = [];
  let entityId: string | null = null;
  for (const methodId of boardMaterialSourceMethods) {
    const id = boardMaterialSourceIds[methodId], prior = input.priors[methodId] ?? null;
    if (!prior) {omitted.push({item: `sources.${id}`, reason: "not_executed"}); continue;}
    if (!prior.released) {omitted.push({item: `sources.${id}`, reason: "not_released"}); continue;}
    // A source whose money scale the database does not know is never read: its numbers could be off by a million.
    if (prior.moneyScale !== "reais" && prior.moneyScale !== "millions") {omitted.push({item: `sources.${id}`, reason: "scale_unknown"}); continue;}
    const moneyScale = prior.moneyScale;
    const released = boardReleasedSources[methodId];
    if (prior.methodId !== methodId || prior.packet.schemaVersion !== released.packet || prior.packet.executorVersion !== released.executorVersion
      || prior.packet.fingerprint !== prior.resultFingerprint) {omitted.push({item: `sources.${id}`, reason: "version_not_released"}); continue;}
    const packetEntity = text(prior.packet.entityId);
    try { verifyBoardSource({id, methodId, packetFingerprint: prior.resultFingerprint, moneyScale}, prior.packet, {entityId: packetEntity ?? "", currency: input.currency}); }
    catch { omitted.push({item: `sources.${id}`, reason: "result_not_verified"}); continue; }
    // Every result is of one company: a result of another company is never read beside the others.
    if (entityId !== null && packetEntity !== entityId) {missing.push(`sources.${id}.entity`); continue;}
    entityId = packetEntity;
    packets.set(id, prior.packet); methods.set(id, methodId); scales.set(id, moneyScale);
    pins.push({role: id, methodId, executionId: prior.executionId, resultFingerprint: prior.resultFingerprint, moneyScale});
  }
  if (!packets.size || entityId === null) return {status: "missing", missing: [...new Set([...missing, "sources"])], omitted};
  if (!conv.meetingDate) missing.push("meetingDate");
  if (missing.length) return {status: "missing", missing: [...new Set(missing)], omitted};

  // 2. The readings each text may bind, resolved in the results.
  // The identities of a plan instrument and a debt-table row the bridge can propose (the person confirms them on the card).
  const links = proposeBoardMaterialLinks(packets, methods, (conv.linkRejections ?? []).map((x) => x.label));
  const anchors = readAnchors(packets, methods, links);
  const declared = new Map<string, {reading: string[]} | {pending: [string, string, string]}>();
  // Why a reading did not resolve, named for the card: its result is absent, the role its record is bound by binds none
  // or several records (named with the role), the record is not identified in the results, or the result does not register it.
  const unresolved = new Map<string, string>();
  const reasonOf = ([source, path]: Reading) => {
    if (!packets.has(source)) return `source_unavailable:${source}`;
    const role = /=_([a-z_]+)\]/.exec(path)?.[1];
    if (role) {const issue = anchors.R.issues[role] ?? "record_not_identified"; return issue.includes(":") ? issue : `${issue}:${role}`;}
    if (/=_\]|_-12-31/.test(path)) return "record_not_identified";
    return "reading_unavailable";
  };
  for (const [id, r] of readingsFor(anchors)) if (!declared.has(id) && !unresolved.has(id)) {
    const x = resolveReading(packets, methods, scales, r);
    if (x) declared.set(id, {reading: x}); else unresolved.set(id, reasonOf(r));
  }
  for (const [id, r, methodId, reason] of pendingReadingsFor(anchors)) {
    if (!packets.has(r[0])) continue;
    const x = resolveReading(packets, methods, scales, r);
    declared.set(id, x ? {reading: x} : {pending: [methodId, r[1], reason]});
  }

  // 3. Deadlines: read from the results where the result dates the action; informed where only the conversation does.
  // A date stated twice differently is asked, never resolved by order.
  const analysisDates: Partial<Record<BoardMaterialAction, string | null>> = {
    finish_sounding: text(packets.get("plano-2027") ? readBoardSourcePath(packets.get("plano-2027")!, "readings.recommendation.soundingBy") : null),
    decide_route: text(packets.get("plano-2027") ? readBoardSourcePath(packets.get("plano-2027")!, "readings.recommendation.routeDecisionBy") : null),
    // The programs are joined before the need they fund begins, as the receivables result registers it.
    join_programs: text(packets.get("recebiveis") ? readBoardSourcePath(packets.get("recebiveis")!, "result.funding.need.startDate") : null),
  };
  const dated = new Map<BoardMaterialAction, {date: string; origin: Said | "analysis"}>();
  for (const [action, date] of Object.entries(analysisDates) as [BoardMaterialAction, string | null][]) if (date) dated.set(action, {date, origin: "analysis"});
  conv.deadlines.forEach((d, k) => {
    const known = dated.get(d.action);
    if (known && known.date !== d.date) missing.push(`deadlines.${k + 1}.date`);
    else if (!known) dated.set(d.action, {date: d.date, origin: d.origin});
  });

  // 4. Informed facts: the chair's reason for the packaging line, as a code of the closed dictionary.
  const reasons = conv.reasons.filter((r) => r.topic === "linha-embalagem" && r.author === "chair");
  if (new Set(reasons.map((r) => r.code)).size > 1) missing.push("reasons.linha-embalagem");
  const informed = reasons.length && new Set(reasons.map((r) => r.code)).size === 1
    ? [{value: {id: "motivo-estrategico", author: "chair" as const, code: reasons[0]!.code === "outside_dictionary" ? "not_in_dictionary" : reasons[0]!.code}, origin: "informed" as const, source: reasons[0]!.source}] : [];
  const seenStated = new Map<string, {seen: boolean; origin: Said; source: string}>();
  for (const s of conv.seen) {const prev = seenStated.get(s.topic); if (prev && prev.seen !== s.seen) missing.push(`seen.${s.topic}`); else seenStated.set(s.topic, s);}
  if (missing.length) return {status: "missing", missing: [...new Set(missing)], omitted};

  // 5. Planning: each text kept only when every binding resolves.
  const plan = boardPlanFor(anchors);
  const deliberations = new Map<string, Deliberation & {dates: {id: string; date: string; action: string; origin: Said | "analysis"}[]}>();
  for (const d of plan.deliberations) {
    const dates = d.deadlines.flatMap((x) => {const at = dated.get(x.code); return at ? [{id: x.id, date: at.date, action: x.action, origin: at.origin}] : [];});
    deliberations.set(d.id, {...d, dates});
  }
  /** Why a text cannot be planned (the first binding that does not resolve, named), or null when every binding resolves. */
  const why = (ref: string, scope: {deliberations: Map<string, {dates: {id: string}[]}>}): string | null => {
    const b = boardRefBindings(ref);
    const figure = b.figures.find((id) => !declared.has(id));
    if (figure !== undefined) {const r = unresolved.get(figure) ?? "reading_unavailable"; return /^(?:role_|link_|source_unavailable:|source_absent|record_not_identified:)/.test(r) ? r : `${r}:${figure}`;}
    if (!b.informed.every((id) => informed.some((x) => x.value.id === id))) return "reason_not_informed";
    if (!b.deadlines.every((x) => {const [d, t] = x.split("."); return scope.deliberations.get(d!)?.dates.some((y) => y.id === t) ?? false;})) return "date_not_stated";
    return null;
  };
  const drop = (item: string, reason: string) => omitted.push({item, reason});
  // Deliberations first: one whose title or subject does not resolve is left out with every text that carries its deadlines.
  for (const [id, d] of [...deliberations]) {
    const head = why(d.title, {deliberations}) ?? why(d.subject, {deliberations});
    if (head) {deliberations.delete(id); drop(`deliberation.${id}`, head); continue;}
    const r = d.recommendation ? why(d.recommendation, {deliberations}) : null;
    if (r) {drop(`deliberation.${id}.recommendation`, r); d.recommendation = null;}
    for (const x of d.deadlines) if (!d.dates.some((y) => y.id === x.id)) drop(`deliberation.${id}.deadline.${x.id}`, "date_not_stated");
  }
  if (!deliberations.size) return {status: "missing", missing: ["deliberations"], omitted};
  const scope = {deliberations};
  const pages: Page[] = [];
  // The two pages of paths present the whole set the plan evaluates: each library row binds the one path whose complete
  // moves are its own (or the status quo the plan registers), so the pages are planned only when every row binds a path
  // and the result's candidate paths are exactly those, and a line of moves only with its path's row. Otherwise both
  // pages are left out, each row and each path named.
  const plannedPaths = boardMaterialPathRows.flatMap(({row}) => anchors.R.rows[row] ? [anchors.R.rows[row]!] : []), candidates = (() => {
    const p = packets.get("plano-2027"), all = p ? readBoardSourcePath(p, "result.evaluation.paths") : undefined;
    return Array.isArray(all) ? all.filter(isRecord).filter((x) => x.role !== "companion").map((x) => String(x.id)) : null;
  })();
  const pathSetIssue = candidates === null ? null : [...boardMaterialPathRows.filter(({row}) => !anchors.R.rows[row]).map(({row}) => `${anchors.R.issues[row] ?? "role_absent"}:${row}`),
    ...candidates.filter((id) => !plannedPaths.includes(id)).map((id) => `path_without_library_row:${id}`)];
  for (const p of plan.pages) {
    if (p.role === "decisions") {pages.push({...p}); continue;}
    const head = why(p.title, scope);
    if (head) {drop(`page.${p.id}`, head); continue;}
    const isPaths = p.id === "caminhos" || p.id === "movimentos";
    const lineWhy = (l: string, j: number) => why(l, scope) ?? (p.id === "movimentos" ? why(plan.pages.find((x) => x.id === "caminhos")!.lines[j]!, scope) : null);
    if (isPaths && pathSetIssue?.length) {drop(`page.${p.id}`, "path_set_incomplete"); for (const r of pathSetIssue) drop(`page.${p.id}.paths`, r); continue;}
    const lineDrops: [number, string][] = [];
    const lines = p.lines.filter((l, j) => {const r = lineWhy(l, j); if (r) lineDrops.push([j, r]); return r === null;});
    if (isPaths && lineDrops.length) {drop(`page.${p.id}`, "path_set_incomplete"); for (const [j, r] of lineDrops) drop(`page.${p.id}.line.${j + 1}`, r); continue;}
    for (const [j, r] of lineDrops) drop(`page.${p.id}.line.${j + 1}`, r);
    const rr = p.recommendation ? why(p.recommendation, scope) : null;
    if (rr) drop(`page.${p.id}.recommendation`, rr);
    const recommendation = rr ? null : p.recommendation;
    const options = p.options.filter((o, j) => {const r = why(o, scope); if (r) drop(`page.${p.id}.option.${j + 1}`, r); return r === null;});
    if (p.role === "next_steps" && !lines.length) {drop(`page.${p.id}`, "date_not_stated"); continue;}
    pages.push({...p, lines, recommendation, options});
  }
  const summaryWhy = why(plan.summary.opening, scope) ?? why(plan.summary.closing, scope);
  if (summaryWhy) return {status: "missing", missing: [`summary.${summaryWhy}`], omitted};
  const questions = plan.questions.filter((q) => {const r = why(q.question, scope) ?? why(q.answer, scope); if (r) drop(`question.${q.id}`, r); return r === null;});
  const appendix = plan.appendix.flatMap((a) => {
    const ids = a.sourceIds.filter((s) => packets.has(s));
    if (a.id === "fontes") return ids.length ? [{...a, sourceIds: ids}] : [];
    return ids.length === a.sourceIds.length ? [a] : (drop(`appendix.${a.id}`, "source_unavailable"), []);
  });

  // 6. Topics the board may not have seen: the review of the project is asked unless stated; the crop financing is a new
  // decision of this meeting and is taken as not seen unless the conversation says otherwise (house convention, on the card).
  const themes = new Set([...pages.map((p) => p.topicId), ...[...deliberations.keys()].map((id) => id === "linha" ? "linha-embalagem" : id)]);
  const topics = ([["linha-embalagem", "topic.packaging_review"], ["safra", "topic.crop_financing"]] as const).flatMap(([id, label]) => {
    if (!themes.has(id)) return [];
    const stated = seenStated.get(id);
    if (stated) return [{value: {id, label, seen: stated.seen as boolean | null}, origin: stated.origin as Said | "house", source: stated.source}];
    if (id === "safra") {house.push("cropTopicNotSeen"); return [{value: {id, label, seen: false as boolean | null}, origin: "house" as Said | "house", source: "Decisão nova desta reunião: tratada como ainda não vista pelo conselho"}];}
    return [{value: {id, label, seen: null as boolean | null}, origin: "house" as Said | "house", source: "O que o conselho já viu ainda não foi dito"}];
  });

  // 7. Omission requests, mapped to the page or deadline they name; the method decides what may be withdrawn.
  const omissions = conv.omissions.flatMap((o, k) => {
    let targetId: string | null = null;
    if (o.target === "deadline") {const a = o.action ? boardMaterialActions[o.action] : null; targetId = a ? `${a[0]}.${a[1]}` : null;}
    else if (o.topic) {
      const own = pages.filter((p) => p.topicId === o.topic);
      targetId = (o.target === "recommendation" ? own.find((p) => p.recommendation !== null) ?? own[0] : own[0])?.id ?? null;
    }
    if (targetId === null) {missing.push(`omissions.${k + 1}.${o.target === "deadline" ? "action" : "topic"}`); return [];}
    const id = o.target === "recommendation" ? `${targetId}-sem-recomendacao` : o.target === "page" ? `${targetId}-sem-pagina` : `${targetId.replace(".", "-")}-sem-prazo`;
    return [{value: {id, target: o.target, targetId, requestedBy: `requester.${o.requestedBy}`}, origin: o.origin, source: o.source}];
  });
  if (missing.length) return {status: "missing", missing: [...new Set(missing)], omitted};

  // 8. The facts, then the method's own verification: a recommendation, an option, a question or an appendix item the
  // library cannot state over these results is left out and named; any other refusal is named and nothing is proposed.
  const askedOn = conv.askedOn ?? (house.push("askedOn"), {value: input.today, origin: "house" as const, source: "Data desta conversa"});
  house.push("leadDays", "minutesPerPage", "plan", "materialFacts");
  if (links.length) house.push("instrumentLink");
  const build = () => {
    const texts = [...[...deliberations.values()].flatMap((d) => [d.title, d.subject, ...d.recommendation ? [d.recommendation] : [], ...d.dates.map((x) => x.action)]),
      ...pages.flatMap((p) => [p.title, ...p.lines, ...p.recommendation ? [p.recommendation] : [], ...p.options]), plan.summary.opening, plan.summary.closing,
      ...appendix.map((a) => a.label), ...questions.flatMap((q) => [q.question, q.answer])];
    const bound = new Set(texts.flatMap((t) => boardRefBindings(t).figures));
    const figureIds = [...declared.keys()].filter((id) => bound.has(id) || contextReadings.has(id));
    const readings = figureIds.filter((id) => "reading" in declared.get(id)!), pendings = figureIds.filter((id) => "pending" in declared.get(id)!);
    const shown = new Set(figureIds);
    // Indicative: the programs whose lead time the result does not register (conditions not confirmed by the bank).
    const rf = packets.get("recebiveis");
    const unconfirmed = (o: string | null) => o !== null && rf !== undefined && readBoardSourcePath(rf, `result.funding.options[id=${o}].leadDays`) === null;
    const indicative = [...unconfirmed(anchors.O1) || unconfirmed(anchors.O2) ? ["programs"] : [], ...unconfirmed(anchors.O1) ? ["spread-b"] : [], ...unconfirmed(anchors.O2) ? ["spread-a"] : []]
      .filter((id) => shown.has(id));
    const short = (id: string) => pins.find((p) => p.role === id)!.executionId.slice(0, 8);
    return {discussionId: input.ids.discussionId, entityId, perimeter: input.perimeter, currency: input.currency, definitionVersionId: input.ids.definitionVersionId,
      askedOn, meetingDate: conv.meetingDate!,
      leadDays: {value: "1", origin: "house", source: "Roteiro antes do material quando há ao menos um dia até a reunião"},
      minutesPerPage: {value: "3", origin: "house", source: "Uma página a cada três minutos de pauta"},
      agendaMinutes: conv.agendaMinutes, nextMeetingDate: conv.nextMeetingDate, template: conv.template,
      outlineConfirmed: conv.outlineConfirmed ?? {value: false, origin: "house", source: "Roteiro ainda não confirmado"},
      sources: pins.map((p) => ({value: {id: p.role, methodId: p.methodId, packetFingerprint: p.resultFingerprint, moneyScale: p.moneyScale}, origin: "analysis", source: `Resultado revisado, execução ${short(p.role)}`})),
      topics,
      deliberations: [...deliberations.values()].map((d) => {
        const informedDate = d.dates.find((x) => x.origin !== "analysis");
        return {value: {id: d.id, topicId: d.id === "linha" ? "linha-embalagem" : d.id, title: d.title, subject: d.subject, recommendation: d.recommendation, authority: "board",
          authorityBasis: null, deadlines: d.dates.map((x) => ({id: x.id, date: x.date, action: x.action}))},
          origin: informedDate ? informedDate.origin : "analysis", source: informedDate ? "Prazo informado na conversa; decisão das análises revisadas" : "Decisão e prazos das análises revisadas"};
      }),
      figures: [...readings.map((id) => ({value: {id, kind: "reading", reading: (declared.get(id) as {reading: string[]}).reading}, origin: "analysis", source: "Leitura do resultado revisado"})),
        ...pendings.map((id) => ({value: {id, kind: "pending", reading: (declared.get(id) as {pending: string[]}).pending}, origin: "house", source: "Número sem resultado revisado"}))],
      materialFigureIds: {value: materialFor(anchors).filter((id) => shown.has(id)), origin: "house", source: "Fatos materiais para as decisões do conselho"},
      indicative: indicative.map((figureId) => ({value: {figureId, reason: "note.program_indicative"}, origin: "analysis", source: "Programa sem prazo de antecipação registrado no resultado"})),
      pages: pages.map((p) => ({value: {...p}, origin: "house", source: "Plano de páginas da biblioteca"})),
      summary: {value: {...plan.summary}, origin: "house", source: "Página de síntese para envio prévio"},
      appendix: appendix.map((a) => ({value: {...a}, origin: "house", source: "Apêndice consultável"})),
      questions: questions.map((q) => ({value: {...q}, origin: "house", source: "Perguntas prováveis do conselho"})),
      omissions, informed,
      // Each identity proposed by the bridge, one card row each: never adopted unless the person confirms the card.
      links: links.map((l) => ({value: {id: l.id, planSourceId: "plano-2027", instrumentId: l.instrumentId, tableSourceId: "tabela-divida", rowId: l.rowId}, origin: "house",
        source: `Identificação proposta do mesmo contrato: ${l.creditor} na tabela de dívida é ${l.instrumentLabel} no plano (${l.terms.join("; ")} nas duas fontes); confirme ou recuse`})),
    };
  };
  for (let round = 0; ; round++) {
    const parsed = boardCapitalDiscussionFactsSchema.safeParse(build());
    if (!parsed.success) return {status: "missing", missing: [...new Set(parsed.error.issues.map((i) => i.path.filter((x) => x !== "value").map((x) => typeof x === "number" ? String(x + 1) : String(x)).join(".") || "facts"))], omitted};
    const refusal = input.check?.(parsed.data) ?? null;
    if (refusal === null) return {status: "complete", facts: parsed.data, housePremiseKeys: [...new Set(house)], omitted, pins};
    const creditorOf = (rowId: string) => {const t = packets.get("tabela-divida"), c = t ? readBoardSourcePath(t, `result.table.rows[id=${rowId}].creditor`) : null;
      return typeof c === "string" ? c : rowId;};
    const condition = /^board_capital_template_condition_(?:failed|undefined):([a-z0-9_.]+):/.exec(refusal)?.[1] ?? null;
    // A record the method binds by role or by an adopted identity that it cannot bind: the texts of that template are left
    // out and named. A missing identity is named as a question to the person (which plan instrument the row is), never as
    // an error; the card carries the identities the bridge could propose.
    const binding = /^board_capital_record_(link|role)_(absent|mismatch|ambiguous):([a-z0-9_.]+):([a-z_]+)(?::(.*))?$/.exec(refusal);
    const failed = condition ?? binding?.[3] ?? null;
    const reason = binding ? (binding[1] === "link" ? `link_${binding[2]}:${anchors.I ? creditorOf(anchors.I) : binding[5] ?? binding[4]}` : `role_${binding[2]}:${binding[5] ?? binding[4]}`)
      : `template_not_applicable:${failed}`;
    const answerless = /^board_capital_answer_without_number:([a-z0-9-]+)$/.exec(refusal)?.[1] ?? null;
    let dropped = false;
    if (round < 32 && binding && failed) {
      // Lines and titles too: a page whose title cannot be bound is left out, and so are both pages of paths when one of
      // their lines is (the board sees every path or none).
      const uses = (ref: string | null) => ref !== null && templateOf(ref) === failed;
      const pathsPages = new Set(["caminhos", "movimentos"]);
      for (let k = pages.length - 1; k >= 0; k--) {
        const p = pages[k]!;
        if (uses(p.title) || (pathsPages.has(p.id) && p.lines.some(uses))) {
          for (const id of pathsPages.has(p.id) && !uses(p.title) ? [...pathsPages] : [p.id]) {
            const at = pages.findIndex((x) => x.id === id);
            if (at >= 0) {pages.splice(at, 1); drop(`page.${id}`, reason); dropped = true;}
          }
          k = Math.min(k, pages.length);
          continue;
        }
        const kept = p.lines.filter((l) => !uses(l));
        if (kept.length !== p.lines.length) {p.lines.forEach((l, j) => {if (uses(l)) drop(`page.${p.id}.line.${j + 1}`, reason);}); p.lines = kept; dropped = true;}
      }
    }
    if (round < 32 && (failed || answerless)) {
      const uses = (ref: string | null) => ref !== null && failed !== null && templateOf(ref) === failed;
      for (const d of deliberations.values()) if (uses(d.recommendation)) {d.recommendation = null; drop(`deliberation.${d.id}.recommendation`, reason); dropped = true;}
      for (const p of pages) {
        if (uses(p.recommendation)) {p.recommendation = null; drop(`page.${p.id}.recommendation`, reason); dropped = true;}
        const kept = p.options.filter((o) => !uses(o));
        if (kept.length !== p.options.length) {p.options = kept; drop(`page.${p.id}.options.${failed}`, reason); dropped = true;}
      }
      for (let k = questions.length - 1; k >= 0; k--) {
        const q = questions[k]!;
        if (uses(q.question) || uses(q.answer) || q.id === answerless) {questions.splice(k, 1); drop(`question.${q.id}`, failed ? reason : "answer_without_number"); dropped = true;}
      }
      for (let k = appendix.length - 1; k >= 0; k--) if (uses(appendix[k]!.label)) {drop(`appendix.${appendix[k]!.id}`, reason); appendix.splice(k, 1); dropped = true;}
    }
    if (!dropped) {
      // Without a confirmed identity of the instrument the plan's alternative prepays, the material the method can still
      // prepare is refused for that reason: the person is asked which row of the debt table the instrument is (or to
      // confirm the proposed identity), never shown the refusal as an error.
      const link = anchors.R.issues.i;
      if (link?.startsWith("link_absent:")) return {status: "missing", missing: [`instrumentLink.${link.slice("link_absent:".length).normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
        .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "instrument"}`], omitted};
      return {status: "missing", missing: [`readerRefused.${refusal.toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60) || "unknown"}`], omitted};
    }
  }
}
