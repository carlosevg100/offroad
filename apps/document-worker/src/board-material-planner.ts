import {boardCapitalDiscussionFactsSchema, boardEffectiveScale, boardFieldOf, boardReleasedSources, formatBoardReading, readBoardSourcePath, verifyBoardSource, type BoardCapitalDiscussionFacts} from "@offroad/financial-model";

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
};

type Reading = [string, string, string];
type Plan = ReturnType<typeof boardPlanFor>;
type Page = Plan["pages"][number];
type Deliberation = Plan["deliberations"][number];

/** The seven paths the plan of 2027 evaluates and the library row of each, by rank. */
const pathRows: [string, string][] = [["sem-linha-debenture", "no_line_debenture"], ["adiar-linha", "defer_line"], ["debenture-com-linha", "debenture_with_line"],
  ["manter", "keep_and_roll"], ["ccb-tres-anos", "short_bank_loan"], ["alongar-com-banco", "extend_with_bank"], ["alongar-bradesco", "extend_bradesco"]];
const bankMoves = new Set(["sem-linha-debenture", "debenture-com-linha", "alongar-com-banco", "alongar-bradesco"]);

/** The anchors read from the results before planning: the year of largest maturity, the crop year (the tightest
 * week), the plan's horizon year, the plan target year of the challenged projection, and the first two programs of
 * the receivables plan with the debtor the second one is linked to. None is chosen; each is read. */
type Anchors = {Y: string | null; C: string | null; H: string | null; P: string | null; O1: string | null; O2: string | null; D: string | null};

/** The readings the plan may bind, in the order the basis lists them: [source, path, decimals or date format]. */
function readingsFor(a: Anchors): [string, Reading][] {
  const y = (v: string | null) => v ?? "_";
  const at = (id: string) => `readings.paths[id=${id}].`;
  const paths = pathRows.flatMap(([id]): [string, Reading][] => [[`${id}-cash`, ["plano-2027", at(id) + "minimumCash.amount", "0"]], [`${id}-lev`, ["plano-2027", at(id) + "worstLeverage", "2"]],
    [`${id}-cost`, ["plano-2027", at(id) + "horizonFinancingCost", "0"]], [`${id}-net`, ["plano-2027", at(id) + "netDebtAtHorizon", "0"]],
    [`${id}-ok`, ["plano-2027", at(id) + "eligible", "-"]], [`${id}-consent`, ["plano-2027", at(id) + "consentRequired", "-"]]]);
  const year = (v: string | null): [string, Reading] => [`year-${y(v)}`, ["tabela-divida", `result.table.profile.scheduleByYear[year=${y(v)}].year`, "year"]];
  return [
    ["divida-total", ["tabela-divida", "result.table.reconciliation.principal", "0"]],
    [`principal-${y(a.Y)}`, ["tabela-divida", `result.table.profile.scheduleByYear[year=${y(a.Y)}].principal`, "0"]],
    ["share-12m", ["tabela-divida", "result.table.profile.dueWithinTwelveMonthsShare", "0"]],
    ["wal", ["tabela-divida", "result.table.profile.weightedAverageLifeYears", "1"]],
    ["largest-creditor", ["tabela-divida", "result.table.profile.largestCreditor.creditor", "-"]],
    ["bradesco-creditor", ["tabela-divida", "result.table.rows[id=ccb-bradesco].creditor", "-"]],
    ["largest-share", ["tabela-divida", "result.table.profile.largestCreditor.share", "0"]],
    ["basket", ["tabela-divida", "result.table.negativePledgeBaskets[holderId=debenture-1].basket", "0"]],
    ["basket-used", ["tabela-divida", "result.table.negativePledgeBaskets[holderId=debenture-1].occupied", "0"]],
    ["basket-free", ["tabela-divida", "result.table.negativePledgeBaskets[holderId=debenture-1].remaining", "0"]],
    ["bradesco-maturity", ["tabela-divida", "result.table.rows[id=ccb-bradesco].finalPayment", "month_long"]],
    ["cov-limit", ["covenant", "result.headroom.limits[id=aditamento].maximumRatio", "1"]],
    ["policy-limit", ["covenant", "result.headroom.limits[id=politica].maximumRatio", "1"]],
    ["lev-dez26", ["covenant", "result.headroom.measurements[id=dez26-base].ratio", "1"]],
    ["lev-dez27", ["covenant", "result.headroom.measurements[id=dez27-base].ratio", "2"]],
    ["lev-adv27", ["covenant", "result.headroom.measurements[id=dez27-adverso].ratio", "2"]],
    ["ebitda-adv27", ["covenant", "result.headroom.measurements[id=dez27-adverso].reportedEbitda", "1"]],
    ["lev-ger-dez26", ["covenant", "result.headroom.measurements[id=dez26-gerencial].ratio", "1"]],
    ["min-cash", ["caixa-semanal", "result.weekly.minimumCash", "0"]],
    ["sem-linha-min", ["caixa-semanal", "readings.sensitivities[caseId=sem-linha].minimum", "1"]],
    ["sem-linha-week", ["caixa-semanal", "readings.sensitivities[caseId=sem-linha].weekStart", "day_long"]],
    ["tight-week", ["caixa-semanal", "readings.tightestWeek.weekStart", "day_long"]],
    ["irr", ["linha-embalagem", "comparison.metrics[caseId=base].annualIrr", "0"]],
    ["wacc", ["linha-embalagem", "comparison.metrics[caseId=base].discountRate", "0"]],
    ["npv", ["linha-embalagem", "comparison.metrics[caseId=base].netPresentValue", "1"]],
    ["payback", ["linha-embalagem", "comparison.metrics[caseId=base].paybackYears", "0"]],
    ["peak-need", ["linha-embalagem", "comparison.metrics[caseId=base].peakCumulativeCashNeed.amount", "1"]],
    ["peak-date", ["linha-embalagem", "comparison.metrics[caseId=base].peakCumulativeCashNeed.periodEndDate", "month_long"]],
    ["npv-economy", ["linha-embalagem", "comparison.metrics[caseId=economy-4].netPresentValue", "1"]],
    ["npv-capex", ["linha-embalagem", "comparison.metrics[caseId=capex-120].netPresentValue", "1"]],
    ["npv-slow", ["linha-embalagem", "comparison.metrics[caseId=slower-start].netPresentValue", "1"]],
    ["npv-defer", ["linha-embalagem", "comparison.metrics[caseId=defer-12].netPresentValue", "1"]],
    ["irr-defer", ["linha-embalagem", "comparison.metrics[caseId=defer-12].annualIrr", "0"]],
    ["wheat-shock", ["projecao", "result.projection.projection.scenarios[id=informado-trigo-4m].inputCostShock.rate", "0"]],
    ["wheat-lag", ["projecao", "result.projection.projection.scenarios[id=informado-trigo-4m].inputCostShock.passThroughLagMonths", "0"]],
    ["ebitda-wheat", ["projecao", `readings.projected.scenarios[id=informado-trigo-4m].rows[periodId=${y(a.Y)}-12-31].ebitda`, "1"]],
    ["wc-60", ["projecao", `readings.projected.scenarios[id=prazo-60].rows[periodId=${y(a.C)}-12-31].effects.changeInWorkingCapital`, "0"]],
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
    ["cl-creditor", ["tabela-divida", "result.table.creditLines[id=conta-garantida].creditor", "-"]],
    ["cl-unused", ["tabela-divida", "result.table.creditLines[id=conta-garantida].unused", "0"]],
    ["debenture-creditor", ["tabela-divida", "result.table.rows[id=debenture-1].creditor", "-"]],
    ["rede-a-label", ["recebiveis", `result.funding.portfolio.items[itemId=${y(a.D)}].label`, "-"]],
    ["project-label", ["linha-embalagem", "cases[id=base].label", "-"]],
    ["wheat-label", ["projecao", "result.projection.projection.scenarios[id=informado-trigo-4m].label", "-"]],
    ["crop-question", ["recebiveis", "question", "-"]],
    [`cash-end-${y(a.Y)}`, ["plano-2027", `result.evaluation.paths[id=manter].closingAvailableByPeriod[periodId=${y(a.Y)}-12-31].closingAvailable`, "0"]],
    [`service-${y(a.Y)}`, ["plano-2027", `result.evaluation.paths[id=manter].debtServiceByYear[year=${y(a.Y)}].service`, "0"]],
    [`available-${y(a.Y)}`, ["plano-2027", `result.evaluation.paths[id=manter].debtServiceByYear[year=${y(a.Y)}].availableForService`, "0"]],
    ["n-paths", ["plano-2027", "readings.horizon.candidatePaths", "0"]],
    ["debenture-amount", ["plano-2027", "readings.recommendation.longInstrument.issueTarget", "0"]],
    ["issue-floor", ["plano-2027", "readings.recommendation.longInstrument.issueFloorInsideGates", "2"]],
    ["debenture-term", ["plano-2027", "readings.recommendation.longInstrument.termYears", "0"]],
    ["deb-cost-low", ["plano-2027", "readings.recommendation.longInstrument.equivalentSpread", "2"]],
    ["deb-cost-high", ["plano-2027", "readings.recommendation.longInstrument.equivalentSpreadAtCondition", "2"]],
    ["amort-first", ["plano-2027", "readings.recommendation.longInstrument.firstAmortizationYear", "year"]],
    ["amort-last", ["plano-2027", "readings.recommendation.longInstrument.lastAmortizationYear", "year"]],
    ["bradesco-gap", ["plano-2027", "result.evaluation.paths[id=bradesco-sem-linha].shortfallVsPolicyMinimum", "0"]],
    ["five-year-amort", ["plano-2027", "result.evaluation.paths[id=sem-linha-debenture].amortizationTests[profileId=cinco-anos].years[year=2029].scheduledAmortization", "0"]],
    ["five-year-available", ["plano-2027", "result.evaluation.paths[id=sem-linha-debenture].amortizationTests[profileId=cinco-anos].years[year=2029].availableAfterInterest", "0"]],
    ["alt-amount", ["plano-2027", "readings.alternative.issueTarget", "0"]],
    ["cost-2028", ["plano-2027", "readings.recommendation.horizonFinancingCost", "0"]],
    ["net-debt-2028", ["plano-2027", "readings.recommendation.netDebtAtHorizon", "0"]],
    year(a.C), year(a.Y), year(a.H), year(a.P),
    ["dez26-date", ["covenant", "result.headroom.measurements[id=dez26-base].date", "month_long"]],
    ["dez27-date", ["covenant", "result.headroom.measurements[id=dez27-base].date", "month_long"]],
    ["horizon-12m", ["tabela-divida", "result.table.profile.twelveMonthHorizon", "month_long"]],
    ...paths,
  ];
}
/** Readings that, when the result does not register them, stand as pending with the library's reason. */
const pendingReadings: [string, Reading, string, string][] = [
  ["stages-npv", ["linha-embalagem", "comparison.metrics[caseId=staged].netPresentValue", "1"], "analyze-investment-project", "note.case_not_reviewed"],
  ["cl-terms", ["tabela-divida", "result.table.creditLines[id=conta-garantida].terms", "-"], "build-company-debt-table", "note.credit_line_terms_not_registered"],
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
        lines: pathRows.map(([id, row]) => `alternatives.row.${row}|caixa=${id}-cash|alavancagem=${id}-lev|custo=${id}-cost|ano=year-${H}|divida=${id}-net|criterios=${id}-ok|anuencia=${id}-consent`)},
      {id: "movimentos", role: "alternatives", topicId: "vencimentos", title: "alternatives.moves.title|caminhos=n-paths", recommendation: null, options: [],
        lines: pathRows.map(([id, row]) => `alternatives.moves.${row}|projeto=project-label${bankMoves.has(id) ? "|credor=bradesco-creditor" : ""}`)},
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
function readAnchors(packets: Map<string, Record<string, unknown>>): Anchors {
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
  return {Y, C: yearOf(get("caixa-semanal", "readings.tightestWeek.weekStart")), H: yearOf(get("plano-2027", "readings.horizon.lastPeriodEnd")),
    P: (() => {const v = get("plano-fpa", "readings.gap.targetPeriodId"); return typeof v === "string" && /^\d{4}/.test(v) ? v.slice(0, 4) : typeof v === "number" ? String(v) : null;})(), O1, O2, D};
}

/** One reading resolved in its result: the value stated is the result's own, rounded as the plan presents it. */
function resolveReading(packets: Map<string, Record<string, unknown>>, methods: Map<string, string>, scales: Map<string, "reais" | "millions">,
  [source, path, presentation]: Reading): string[] | null {
  const packet = packets.get(source), methodId = methods.get(source), moneyScale = scales.get(source);
  if (!packet || !methodId || !moneyScale || path.includes("[year=_]") || path.includes("=_]") || path.includes("_-12-31")) return null;
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
  const anchors = readAnchors(packets);
  const declared = new Map<string, {reading: string[]} | {pending: [string, string, string]}>();
  for (const [id, r] of readingsFor(anchors)) if (!declared.has(id)) {const x = resolveReading(packets, methods, scales, r); if (x) declared.set(id, {reading: x});}
  for (const [id, r, methodId, reason] of pendingReadings) {
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
  const resolvable = (ref: string, scope: {deliberations: Map<string, {dates: {id: string}[]}>}) => {
    const b = boardRefBindings(ref);
    return b.figures.every((id) => declared.has(id)) && b.informed.every((id) => informed.some((x) => x.value.id === id))
      && b.deadlines.every((x) => {const [d, t] = x.split("."); return scope.deliberations.get(d!)?.dates.some((y) => y.id === t) ?? false;});
  };
  const drop = (item: string, reason: string) => omitted.push({item, reason});
  // Deliberations first: one whose title or subject does not resolve is left out with every text that carries its deadlines.
  for (const [id, d] of [...deliberations]) {
    if (!resolvable(d.title, {deliberations}) || !resolvable(d.subject, {deliberations})) {deliberations.delete(id); drop(`deliberation.${id}`, "reading_unavailable"); continue;}
    if (d.recommendation && !resolvable(d.recommendation, {deliberations})) {drop(`deliberation.${id}.recommendation`, "reading_unavailable"); d.recommendation = null;}
    for (const x of d.deadlines) if (!d.dates.some((y) => y.id === x.id)) drop(`deliberation.${id}.deadline.${x.id}`, "date_not_stated");
  }
  if (!deliberations.size) return {status: "missing", missing: ["deliberations"], omitted};
  const scope = {deliberations};
  const pages: Page[] = [];
  for (const p of plan.pages) {
    if (p.role === "decisions") {pages.push({...p}); continue;}
    if (!resolvable(p.title, scope)) {drop(`page.${p.id}`, "reading_unavailable"); continue;}
    const lines = p.lines.filter((l, j) => resolvable(l, scope) || (drop(`page.${p.id}.line.${j + 1}`, l.startsWith("topic.project_strategic_reason") ? "reason_not_informed" : "reading_unavailable"), false));
    const recommendation = p.recommendation && resolvable(p.recommendation, scope) ? p.recommendation : (p.recommendation && drop(`page.${p.id}.recommendation`, "reading_unavailable"), null);
    const options = p.options.filter((o, j) => resolvable(o, scope) || (drop(`page.${p.id}.option.${j + 1}`, "reading_unavailable"), false));
    if (p.role === "next_steps" && !lines.length) {drop(`page.${p.id}`, "date_not_stated"); continue;}
    pages.push({...p, lines, recommendation, options});
  }
  if (!resolvable(plan.summary.opening, scope) || !resolvable(plan.summary.closing, scope)) return {status: "missing", missing: ["summary"], omitted};
  const questions = plan.questions.filter((q) => (resolvable(q.question, scope) && resolvable(q.answer, scope)) || (drop(`question.${q.id}`, "reading_unavailable"), false));
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
    };
  };
  for (let round = 0; ; round++) {
    const parsed = boardCapitalDiscussionFactsSchema.safeParse(build());
    if (!parsed.success) return {status: "missing", missing: [...new Set(parsed.error.issues.map((i) => i.path.filter((x) => x !== "value").map((x) => typeof x === "number" ? String(x + 1) : String(x)).join(".") || "facts"))], omitted};
    const refusal = input.check?.(parsed.data) ?? null;
    if (refusal === null) return {status: "complete", facts: parsed.data, housePremiseKeys: [...new Set(house)], omitted, pins};
    const failed = /^board_capital_template_condition_(?:failed|undefined):([a-z0-9_.]+):/.exec(refusal)?.[1] ?? null;
    const answerless = /^board_capital_answer_without_number:([a-z0-9-]+)$/.exec(refusal)?.[1] ?? null;
    let dropped = false;
    if (round < 16 && (failed || answerless)) {
      const uses = (ref: string | null) => ref !== null && failed !== null && templateOf(ref) === failed;
      for (const d of deliberations.values()) if (uses(d.recommendation)) {d.recommendation = null; drop(`deliberation.${d.id}.recommendation`, `template_not_applicable:${failed}`); dropped = true;}
      for (const p of pages) {
        if (uses(p.recommendation)) {p.recommendation = null; drop(`page.${p.id}.recommendation`, `template_not_applicable:${failed}`); dropped = true;}
        const kept = p.options.filter((o) => !uses(o));
        if (kept.length !== p.options.length) {p.options = kept; drop(`page.${p.id}.options.${failed}`, `template_not_applicable:${failed}`); dropped = true;}
      }
      for (let k = questions.length - 1; k >= 0; k--) {
        const q = questions[k]!;
        if (uses(q.question) || uses(q.answer) || q.id === answerless) {questions.splice(k, 1); drop(`question.${q.id}`, failed ? `template_not_applicable:${failed}` : "answer_without_number"); dropped = true;}
      }
      for (let k = appendix.length - 1; k >= 0; k--) if (uses(appendix[k]!.label)) {drop(`appendix.${appendix[k]!.id}`, `template_not_applicable:${failed}`); appendix.splice(k, 1); dropped = true;}
    }
    if (!dropped) return {status: "missing", missing: [`readerRefused.${refusal.toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60) || "unknown"}`], omitted};
  }
}
