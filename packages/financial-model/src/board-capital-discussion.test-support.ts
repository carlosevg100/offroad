import type {AdoptionBasisEntry} from "@offroad/reconciliation";
import {analysisTestBasis, analysisTestId as id} from "./adopted-analysis.test-support";
import type {AdoptedBoardCapitalDiscussionInput, BoardCapitalDiscussionAnalyses} from "./adopted-board-capital-discussion";
import type {BoardCapitalDiscussionFacts} from "./board-capital-discussion-premises";
import {prepareInvestmentDecisionPacket} from "./investment-decision-packet";
import {c32PacketInput} from "./investment-decision-packet.test-support";
import {prepareDebtTablePacket} from "./debt-table-packet";
import {auroraDebtTableBasis} from "./debt-table.test-support";
import {prepareCovenantHeadroomPacket} from "./covenant-headroom-packet";
import {auroraCovenantBasis} from "./covenant-headroom.test-support";
import {prepareWeeklyCashPacket} from "./weekly-cash-packet";
import {auroraWeeklyCashBasis} from "./weekly-cash.test-support";
import {prepareOperatingProjectionPacket} from "./operating-projection-packet";
import {auroraProjectionBasis as operatingProjectionBasis} from "./operating-projection.test-support";
import {prepareProjectionChallengePacket} from "./projection-challenge-packet";
import {auroraProjectionBasis as projectionChallengeBasis} from "./projection-challenge.test-support";
import {prepareReceivablesFundingPacket} from "./receivables-funding-packet";
import {auroraReceivablesFunding, auroraReceivablesFundingBasis} from "./receivables-funding.test-support";
import {prepareRelativeDebtCostPacket} from "./relative-debt-cost-packet";
import {c03Id, c03PacketInput} from "./relative-debt-cost.test-support";
import {prepareCapitalPathsPacket} from "./capital-structure-paths-packet";
import {auroraCapitalPathsBasis} from "./capital-structure-paths.test-support";

/** Aurora Alimentos, board meeting of 30/set/2026 (ficha C47, synthetic). The reviewed results are the published
 * calibrations of the released methods, run as they are: C10 debt table, C12 covenant test, C18 weekly cash, C32
 * packaging line, C24 projection with the CFO's informed scenario (turn two of C24), C26 challenge to the FP&A plan,
 * C35 receivables with retailer A's own program (turn two of C35), C03 relative cost and the C32 financing plan for 2027 (evaluate-financing-paths). Three adaptations, all of
 * identity and none of value: the C32 and C03 calibrations are rebound to the shared synthetic company id, and the
 * C12 basis carries the December managerial reading that the C54 calibration adds to it, with the policy definition
 * still unwritten. BRL millions. */
const company = id(1);

/** Replaces one id everywhere in a calibration input (identity only; no value changes). */
function rebind<T>(value: T, from: string, to: string): T {
  return JSON.parse(JSON.stringify(value).split(`"${from}"`).join(`"${to}"`)) as T;
}

function buildSources() {
  const debtTable = prepareDebtTablePacket({schemaVersion: "debt-table-packet-input.v1", question: "Monta a tabela de dívida com tudo que temos.", analysis: auroraDebtTableBasis().seal()});
  const c = auroraCovenantBasis(), measurements = (c.input as unknown as {measurements: unknown[]}).measurements;
  const p = "measurement.dez26-gerencial.", sc = "gerencial_dez", num = (path: string, value: string) => c.contribute(p + path, "currency", {type: "number", value}, sc);
  measurements.push({id: "dez26-gerencial", label: "dez26-gerencial", role: "test", limitIds: ["politica"], scenario: sc, date: c.contribute(p + "date", "date", {type: "date", value: "2026-12-31"}, sc),
    debt: num("debt", "128.66666667"), cash: num("cash", "15.45720186"), reportedEbitda: num("reportedEbitda", "55.5"), adjustments: [], unrealizedEbitda: null});
  const covenant = prepareCovenantHeadroomPacket({schemaVersion: "covenant-headroom-packet-input.v1", question: "Como estamos contra os covenants?", headlineMeasurementId: "dez26-base", analysis: c.seal()});
  const weekly = prepareWeeklyCashPacket({schemaVersion: "weekly-cash-packet-input.v1", question: "Como fica o caixa até dezembro e o que vence?", analysis: auroraWeeklyCashBasis().seal()});
  const investmentCalibration = c32PacketInput(), from = id(1001);
  for (const e of investmentCalibration.basis.entries) if (e.dimensions.entityId === from) e.dimensions.entityId = company;
  for (const x of investmentCalibration.input.cases) x.analysis.entityId = company;
  investmentCalibration.seal();
  const investment = prepareInvestmentDecisionPacket(investmentCalibration.input);
  const projection = prepareOperatingProjectionPacket({schemaVersion: "operating-projection-packet-input.v1",
    question: "Não temos projeção pronta. Ajuda a construir uma para discutir o financiamento.", analysis: operatingProjectionBasis({informed: true}).seal()});
  const challenge = prepareProjectionChallengePacket({schemaVersion: "projection-challenge-packet-input.v1",
    question: "Que premissas você questionaria nessa projeção? Vai para os bancos semana que vem.", analysis: projectionChallengeBasis().seal()});
  const k = auroraReceivablesFunding(), anchor = k.options[0]!;
  const receivables = prepareReceivablesFundingPacket({schemaVersion: "receivables-funding-packet-input.v1",
    question: "Tenho uns 60 milhões de recebíveis. Dá para usar isso para financiar a safra em vez da linha do banco?",
    analysis: auroraReceivablesFundingBasis({...k, items: k.items.map((i) => i.id === "rede-a" ? {...i, anchorProgram: "active" as const} : i),
      options: [...k.options, {...anchor, id: "risco-sacado-a", label: "Risco sacado da rede A", eligibility: {...anchor.eligibility!, anchorItemIds: ["rede-a"]},
        rate: {basis: "di_plus" as const, rate: "0.015"}, leadDaysMin: null, leadDaysMax: null}]}).seal()});
  const relative = c03PacketInput();
  for (const e of relative.entries) if (e.dimensions.entityId === c03Id(1)) e.dimensions.entityId = company;
  // Entries first, then the inputs: the sealed snapshot is a string, so the rebind never touches it.
  const relativeCost = prepareRelativeDebtCostPacket(rebind(relative.seal(), c03Id(1), company));
  const plan = prepareCapitalPathsPacket(auroraCapitalPathsBasis().seal());
  return [
    {id: "tabela-divida", methodId: "build-company-debt-table", packet: debtTable},
    {id: "covenant", methodId: "measure-covenant-headroom", packet: covenant},
    {id: "caixa-semanal", methodId: "project-weekly-cash", packet: weekly},
    {id: "linha-embalagem", methodId: "analyze-investment-project", packet: investment},
    {id: "projecao", methodId: "build-operating-projection", packet: projection},
    {id: "plano-fpa", methodId: "challenge-financial-projection", packet: challenge},
    {id: "recebiveis", methodId: "monetize-receivables-for-working-capital", packet: receivables},
    {id: "custo-relativo", methodId: "analyze-relative-debt-cost", packet: relativeCost},
    {id: "plano-2027", methodId: "evaluate-financing-paths", packet: plan},
  ] as const;
}
let cached: ReturnType<typeof buildSources> | null = null;
/** The reviewed results, computed once per process and handed out as copies. */
export function auroraBoardSources() {
  cached ??= buildSources();
  return cached.map((s) => ({id: s.id, methodId: s.methodId, packet: structuredClone(s.packet) as unknown as Record<string, unknown>}));
}

/** [source, path, decimals or date format, stated]; the unit, scale and periodicity come from the field registry. */
type Reading = [string, string, string, string?];
/** The seven paths the plan evaluates (the status quo and the candidates, by rank), with what the board compares:
 * minimum cash, worst leverage, financing cost and net debt to 2028, and execution (inside every gate, consent). */
export const auroraPaths: [string, string, string, string, string][] = [
  ["sem-linha-debenture", "15", "2.20", "49", "79"], ["adiar-linha", "-60", "2.21", "31", "89"], ["debenture-com-linha", "15", "2.40", "57", "102"],
  ["manter", "-79", "2.38", "25", "81"], ["ccb-tres-anos", "-65", "2.41", "35", "87"], ["alongar-com-banco", "12", "2.40", "57", "102"], ["alongar-bradesco", "-11", "2.40", "44", "93"]];
function auroraPathReadings(): Record<string, Reading> {
  return Object.fromEntries(auroraPaths.flatMap(([id, cash, leverage, cost, net]) => {
    const at = `readings.paths[id=${id}].`;
    return [[`${id}-cash`, ["plano-2027", at + "minimumCash.amount", "0", cash]],
      [`${id}-lev`, ["plano-2027", at + "worstLeverage", "2", leverage]], [`${id}-cost`, ["plano-2027", at + "horizonFinancingCost", "0", cost]],
      [`${id}-net`, ["plano-2027", at + "netDebtAtHorizon", "0", net]], [`${id}-ok`, ["plano-2027", at + "eligible", "-"]],
      [`${id}-consent`, ["plano-2027", at + "consentRequired", "-"]]] as [string, Reading][];
  }));
}
/** Each number as a reading of a reviewed result: [source, path, unit, scale, places, stated]. */
export const auroraBoardReadings: Record<string, Reading> = {
  "divida-total": ["tabela-divida", "result.table.reconciliation.principal", "0", "130"],
  "principal-2027": ["tabela-divida", "result.table.profile.scheduleByYear[year=2027].principal", "0", "77"],
  "share-12m": ["tabela-divida", "result.table.profile.dueWithinTwelveMonthsShare", "0", "28"],
  "wal": ["tabela-divida", "result.table.profile.weightedAverageLifeYears", "1", "1.5"],
  "largest-creditor": ["tabela-divida", "result.table.profile.largestCreditor.creditor", "-"],
  "largest-share": ["tabela-divida", "result.table.profile.largestCreditor.share", "0", "46"],
  "basket": ["tabela-divida", "result.table.negativePledgeBaskets[holderId=debenture-1].basket", "0", "15"],
  "basket-used": ["tabela-divida", "result.table.negativePledgeBaskets[holderId=debenture-1].occupied", "0", "12"],
  "basket-free": ["tabela-divida", "result.table.negativePledgeBaskets[holderId=debenture-1].remaining", "0", "3"],
  "bradesco-maturity": ["tabela-divida", "result.table.rows[id=ccb-bradesco].finalPayment", "month_long", "2027-09-15"],
  "cov-limit": ["covenant", "result.headroom.limits[id=aditamento].maximumRatio", "1", "3.0"],
  "policy-limit": ["covenant", "result.headroom.limits[id=politica].maximumRatio", "1", "2.5"],
  "lev-dez26": ["covenant", "result.headroom.measurements[id=dez26-base].ratio", "1", "2.2"],
  "lev-dez27": ["covenant", "result.headroom.measurements[id=dez27-base].ratio", "2", "1.85"],
  "lev-adv27": ["covenant", "result.headroom.measurements[id=dez27-adverso].ratio", "2", "2.37"],
  "ebitda-adv27": ["covenant", "result.headroom.measurements[id=dez27-adverso].reportedEbitda", "1", "48.1"],
  "lev-ger-dez26": ["covenant", "result.headroom.measurements[id=dez26-gerencial].ratio", "1", "2.0"],
  "min-cash": ["caixa-semanal", "result.weekly.minimumCash", "0", "15"],
  "sem-linha-min": ["caixa-semanal", "readings.sensitivities[caseId=sem-linha].minimum", "1", "-9.5"],
  "sem-linha-week": ["caixa-semanal", "readings.sensitivities[caseId=sem-linha].weekStart", "day_long", "2026-12-21"],
  "tight-week": ["caixa-semanal", "readings.tightestWeek.weekStart", "day_long", "2026-12-21"],
  "irr": ["linha-embalagem", "comparison.metrics[caseId=base].annualIrr", "0", "16"],
  "wacc": ["linha-embalagem", "comparison.metrics[caseId=base].discountRate", "0", "15"],
  "npv": ["linha-embalagem", "comparison.metrics[caseId=base].netPresentValue", "1", "0.7"],
  "payback": ["linha-embalagem", "comparison.metrics[caseId=base].paybackYears", "0", "6"],
  "peak-need": ["linha-embalagem", "comparison.metrics[caseId=base].peakCumulativeCashNeed.amount", "1", "-21.7"],
  "peak-date": ["linha-embalagem", "comparison.metrics[caseId=base].peakCumulativeCashNeed.periodEndDate", "month_long", "2027-12-31"],
  "npv-economy": ["linha-embalagem", "comparison.metrics[caseId=economy-4].netPresentValue", "1", "-6.4"],
  "npv-capex": ["linha-embalagem", "comparison.metrics[caseId=capex-120].netPresentValue", "1", "-2.1"],
  "npv-slow": ["linha-embalagem", "comparison.metrics[caseId=slower-start].netPresentValue", "1", "-1.0"],
  "npv-defer": ["linha-embalagem", "comparison.metrics[caseId=defer-12].netPresentValue", "1", "1.4"],
  "irr-defer": ["linha-embalagem", "comparison.metrics[caseId=defer-12].annualIrr", "0", "17"],
  "wheat-shock": ["projecao", "result.projection.projection.scenarios[id=informado-trigo-4m].inputCostShock.rate", "0", "15"],
  "wheat-lag": ["projecao", "result.projection.projection.scenarios[id=informado-trigo-4m].inputCostShock.passThroughLagMonths", "0", "4"],
  "ebitda-wheat": ["projecao", "readings.projected.scenarios[id=informado-trigo-4m].rows[periodId=2027-12-31].ebitda", "1", "52.6"],
  "wc-60": ["projecao", "readings.projected.scenarios[id=prazo-60].rows[periodId=2026-12-31].effects.changeInWorkingCapital", "0", "12"],
  "fpa-2028": ["plano-fpa", "readings.gap.plan.ebitda", "0", "86"],
  "ref-2028": ["plano-fpa", "readings.gap.reference.ebitda", "0", "59"],
  "programs": ["recebiveis", "readings.plan[optionId=risco-sacado-a].cumulative", "1", "23.5"],
  "spread-b": ["recebiveis", "readings.options[id=risco-sacado-b].spreadOverDi", "1", "1.2"],
  "spread-a": ["recebiveis", "readings.options[id=risco-sacado-a].spreadOverDi", "1", "1.5"],
  "rede-a": ["recebiveis", "readings.options[id=risco-sacado-a].volume", "1", "19.8"],
  "carteira": ["recebiveis", "readings.gross", "0", "62"],
  "gap-bps": ["custo-relativo", "decomposition.grossBps", "0", "125"],
  "date-bps": ["custo-relativo", "result.bridge.steps[family=pricing_date].bps", "0", "60"],
  "rating-low": ["custo-relativo", "levers[label=Rating, ganho menor e custo maior].netOfKnownCosts", "2", "-0.17"],
  "rating-high": ["custo-relativo", "levers[label=Rating, ganho maior e custo menor].netOfKnownCosts", "2", "0.03"],
  "cash-end-2027": ["plano-2027", "result.evaluation.paths[id=manter].closingAvailableByPeriod[periodId=2027-12-31].closingAvailable", "0", "-79"],
  "service-2027": ["plano-2027", "result.evaluation.paths[id=manter].debtServiceByYear[year=2027].service", "0", "90"],
  "available-2027": ["plano-2027", "result.evaluation.paths[id=manter].debtServiceByYear[year=2027].availableForService", "0", "36"],
  "n-paths": ["plano-2027", "readings.horizon.candidatePaths", "0", "7"],
  "debenture-amount": ["plano-2027", "readings.recommendation.longInstrument.issueTarget", "0", "80"],
  "issue-floor": ["plano-2027", "readings.recommendation.longInstrument.issueFloorInsideGates", "2", "74.44"],
  "debenture-term": ["plano-2027", "readings.recommendation.longInstrument.termYears", "0", "7"],
  "deb-cost-low": ["plano-2027", "readings.recommendation.longInstrument.equivalentSpread", "2", "3.46"],
  "deb-cost-high": ["plano-2027", "readings.recommendation.longInstrument.equivalentSpreadAtCondition", "2", "3.56"],
  "amort-first": ["plano-2027", "readings.recommendation.longInstrument.firstAmortizationYear", "year", "2029"],
  "amort-last": ["plano-2027", "readings.recommendation.longInstrument.lastAmortizationYear", "year", "2033"],
  "bradesco-gap": ["plano-2027", "result.evaluation.paths[id=bradesco-sem-linha].shortfallVsPolicyMinimum", "0", "18"],
  "five-year-amort": ["plano-2027", "result.evaluation.paths[id=sem-linha-debenture].amortizationTests[profileId=cinco-anos].years[year=2029].scheduledAmortization", "0", "33"],
  "five-year-available": ["plano-2027", "result.evaluation.paths[id=sem-linha-debenture].amortizationTests[profileId=cinco-anos].years[year=2029].availableAfterInterest", "0", "24"],
  "alt-amount": ["plano-2027", "readings.alternative.issueTarget", "0", "70"],
  "cost-2028": ["plano-2027", "readings.recommendation.horizonFinancingCost", "0", "49"],
  "net-debt-2028": ["plano-2027", "readings.recommendation.netDebtAtHorizon", "0", "79"],
  "year-2026": ["tabela-divida", "result.table.profile.scheduleByYear[year=2026].year", "year", "2026"],
  "year-2027": ["tabela-divida", "result.table.profile.scheduleByYear[year=2027].year", "year", "2027"],
  "year-2028": ["tabela-divida", "result.table.profile.scheduleByYear[year=2028].year", "year", "2028"],
  "dez26-date": ["covenant", "result.headroom.measurements[id=dez26-base].date", "month_long", "2026-12-31"],
  "dez27-date": ["covenant", "result.headroom.measurements[id=dez27-base].date", "month_long", "2027-12-31"],
  "horizon-12m": ["tabela-divida", "result.table.profile.twelveMonthHorizon", "month_long", "2027-06-30"],
  ...auroraPathReadings(),
};
/** Numbers the material needs and no reviewed result supplies: [required method, reason]. */
export const auroraBoardPending: Record<string, [string, string]> = {
  "stages-npv": ["analyze-investment-project", "note.case_not_reviewed"],
};
export const auroraMaterialFigures = ["principal-2027", "cash-end-2027", "debenture-amount", "deb-cost-low", "deb-cost-high", "bradesco-gap", "share-12m", "min-cash", "sem-linha-min", "cov-limit", "policy-limit", "irr", "wacc", "npv", "payback", "peak-need",
  "npv-economy", "npv-capex", "npv-slow", "programs", "lev-dez26", "lev-adv27", "ebitda-wheat", "wc-60"];
export const auroraIndicative = {figures: ["programs", "spread-a"], reason: "note.program_indicative"};

export type BoardTurn = 1 | 2 | 3;
/** The case of ficha C47 at each turn: the request (turn 1), the template, the time and what the board has seen
 * (turn 2) and the chair's request to withdraw the recommendation on the packaging line (turn 3). */
export function auroraBoardCase(turn: BoardTurn) {
  return {
    askedOn: "2026-09-28", meetingDate: "2026-09-30", leadDays: "1", minutesPerPage: "3",
    agendaMinutes: turn === 1 ? null : "45", nextMeetingDate: null as string | null, template: turn === 1 ? null : "conselho-jun26.pptx", outlineConfirmed: turn !== 1,
    topics: [{id: "linha-embalagem", label: "topic.packaging_review", seen: turn === 1 ? null : false}, {id: "safra", label: "topic.crop_financing", seen: false as boolean | null}],
    deliberations: [
      {id: "linha", topicId: "linha-embalagem" as string | null, title: "delib.packaging_line", subject: "delib.packaging_line.subject",
        recommendation: "delib.packaging_line.wait" as string | null, authority: "board" as const, authorityBasis: null as string | null,
        deadlines: [{id: "aviso", date: "2026-10-02", action: "delib.action.supplier_notice"}]},
      {id: "vencimentos", topicId: null, title: "delib.maturities|ano=year-2027", subject: "delib.maturities.subject|ano=year-2027",
        recommendation: "delib.maturities.sounding|valor=debenture-amount|prazo=debenture-term",
        authority: "board" as const, authorityBasis: null, deadlines: [{id: "sondagem", date: "2026-10-31", action: "delib.action.finish_sounding"}, {id: "rota", date: "2026-11-15", action: "delib.action.decide_route"}]},
      {id: "politica", topicId: null, title: "delib.policy", subject: "delib.policy.definition|limite=policy-limit", recommendation: null,
        authority: "board" as const, authorityBasis: null, deadlines: []},
      {id: "safra", topicId: "safra", title: "delib.crop|ano=year-2026", subject: "delib.crop.subject|ano=year-2026", recommendation: "delib.crop.programs",
        authority: "board" as const, authorityBasis: null, deadlines: [{id: "adesao", date: "2026-10-16", action: "delib.action.join_programs"}]},
    ],
    pages: [
      {id: "decisoes", role: "decisions", topicId: null, title: "page.decisions", lines: [], recommendation: null, options: []},
      {id: "divida", role: "situation", topicId: null, title: "situation.debt_total|total=divida-total|ano=year-2027", recommendation: null, options: [],
        lines: ["situation.debt_maturity|principal=principal-2027|ano=year-2027|parcela=share-12m|horizonte=horizon-12m",
          "situation.debt_profile|prazo=wal|credor=largest-creditor|participacao=largest-share"]},
      {id: "caixa", role: "situation", topicId: null, title: "situation.cash_shortfall|semana=tight-week|saldo=cash-end-2027|ano=year-2027", recommendation: null, options: [],
        lines: ["situation.cash_without_line|semana=sem-linha-week|saldo=sem-linha-min|minimo=min-cash", "situation.debt_service|ano=year-2027|servico=service-2027|disponivel=available-2027"]},
      {id: "escritura", role: "constraint", topicId: null, title: "constraint.indenture_basket|saldo=basket-free", recommendation: null, options: [],
        lines: ["constraint.basket_usage|cesta=basket|ocupado=basket-used", "constraint.covenant_policy|covenant=cov-limit|politica=policy-limit"]},
      {id: "linha", role: "topic", topicId: "linha-embalagem", title: "topic.project_return|retorno=irr|custo=wacc",
        lines: ["topic.project_value|retorno=irr|custo=wacc|vpl=npv", "topic.project_payback|payback=payback|pico=peak-need|data=peak-date",
          "topic.project_sensitivities|vpl_economia=npv-economy|vpl_capex=npv-capex|vpl_partida=npv-slow", "topic.project_strategic_reason"],
        recommendation: "topic.project_wait_quotes|vpl=npv-defer|retorno=irr-defer" as string | null,
        options: ["option.go_now|vpl=npv|retorno=irr", "option.staged|vpl=stages-npv", "option.wait_quotes|vpl=npv-defer|retorno=irr-defer"]},
      {id: "safra", role: "topic", topicId: "safra", title: "topic.crop_programs|valor=programs", recommendation: null, options: [],
        lines: ["topic.crop_program_cost|taxa_b=spread-b|taxa_a=spread-a", "topic.crop_overdraft|semana=tight-week"]},
      {id: "caminhos", role: "alternatives", topicId: null, title: "alternatives.count|caminhos=n-paths|ano=year-2027", recommendation: null, options: [],
        lines: auroraPaths.map(([id]) => `alternatives.row.${auroraPathRows[id]}|caixa=${id}-cash|alavancagem=${id}-lev|custo=${id}-cost|ano=year-2028|divida=${id}-net|criterios=${id}-ok|anuencia=${id}-consent`)},
      {id: "recomendacao", role: "recommendation", topicId: null, title: "recommendation.debenture|valor=debenture-amount|prazo=debenture-term", recommendation: null, options: [],
        lines: ["recommendation.debenture_cost|baixo=deb-cost-low|alto=deb-cost-high", "recommendation.amortization|inicio=amort-first|fim=amort-last",
          "recommendation.alternative|prazo=deadline:vencimentos.rota"]},
      {id: "alavancagem", role: "risk", topicId: null, title: "risk.leverage|politica=policy-limit|adverso=lev-adv27|ano=year-2027", recommendation: null, options: [],
        lines: ["risk.leverage_path|inicio=lev-dez26|data_inicio=dez26-date|fim=lev-dez27|data_fim=dez27-date", "risk.leverage_adverse|ano=year-2027|adverso=lev-adv27|politica=policy-limit"]},
      {id: "politica", role: "risk", topicId: null, title: "risk.policy_definition|politica=policy-limit", recommendation: null, options: [],
        lines: ["risk.policy_readings|gerencial=lev-ger-dez26|escritura=lev-dez26|data=dez26-date"]},
      {id: "mudaria", role: "what_changes", topicId: null, title: "what_changes.title|piso=issue-floor", recommendation: null, options: [],
        lines: ["what_changes.demand|piso=issue-floor|alvo=debenture-amount", "what_changes.wheat|choque=wheat-shock|defasagem=wheat-lag|ano=year-2027|ebitda=ebitda-wheat",
          "what_changes.receivable_days|giro=wc-60"]},
      {id: "passos", role: "next_steps", topicId: null, title: "next_steps.title", recommendation: null, options: [],
        lines: ["next_steps.notice|prazo=deadline:linha.aviso", "next_steps.programs|prazo=deadline:safra.adesao",
          "next_steps.sounding|prazo=deadline:vencimentos.sondagem", "next_steps.route|prazo=deadline:vencimentos.rota|ano=year-2027"]},
    ] as {id: string; role: string; topicId: string | null; title: string; lines: string[]; recommendation: string | null; options: string[]}[],
    summary: {opening: "summary.opening.debt_and_cash|principal=principal-2027|ano=year-2027|semana=tight-week",
      closing: "summary.closing.leverage|alavancagem=lev-dez26|data=dez26-date|politica=policy-limit"},
    appendix: [
      {id: "tabela", label: "appendix.debt_table", sourceIds: ["tabela-divida"]},
      {id: "projecao", label: "appendix.projection", sourceIds: ["projecao"]},
      {id: "plano-fpa", label: "appendix.plan_vs_base", sourceIds: ["plano-fpa"]},
      {id: "fontes", label: "appendix.sources", sourceIds: ["tabela-divida", "covenant", "caixa-semanal", "linha-embalagem", "projecao", "plano-fpa", "recebiveis", "custo-relativo", "plano-2027"]},
    ],
    questions: [
      {id: "bradesco", question: "q.roll_bank", answer: "a.roll_bank|falta=bradesco-gap|vencimento=bradesco-maturity"},
      {id: "prazo", question: "q.term|prazo=debenture-term", answer: "a.term|ano=amort-first|amortizacao=five-year-amort|disponivel=five-year-available"},
      {id: "demanda", question: "q.demand", answer: "a.demand|valor=alt-amount|prazo=deadline:vencimentos.rota|vencimento=bradesco-maturity"},
      {id: "custo", question: "q.cost", answer: "a.cost|baixo=deb-cost-low|alto=deb-cost-high|custo=cost-2028|ano=year-2028|divida=net-debt-2028|ano_fim=year-2028"},
      {id: "serra-verde", question: "q.peer", answer: "a.peer|total=gap-bps|data=date-bps"},
      {id: "rating", question: "q.rating", answer: "a.rating|baixo=rating-low|alto=rating-high"},
      {id: "estrategica", question: "q.strategic", answer: "a.strategic|retorno=irr|custo=wacc"},
      {id: "trigo", question: "q.wheat", answer: "a.wheat|choque=wheat-shock|defasagem=wheat-lag|ano=year-2027|ebitda=ebitda-wheat|ebitda_adverso=ebitda-adv27|alavancagem=lev-adv27|covenant=cov-limit"},
      {id: "rede-a", question: "q.anchor", answer: "a.anchor|rede=rede-a|carteira=carteira|taxa=spread-a"},
      {id: "fpa", question: "q.plan_vs_base|plano=fpa-2028|ano=year-2028|base=ref-2028", answer: "a.plan_vs_base|base=ref-2028"},
    ],
    /** Readings a test adds to the basis beside the calibration's own. */
    extraReadings: {} as Record<string, Reading>,
    omissions: turn === 3 ? [{id: "linha-sem-recomendacao", target: "recommendation", targetId: "linha", requestedBy: "requester.chair"}] : [] as {id: string; target: string; targetId: string; requestedBy: string}[],
  };
}
/** The reviewed library row of each path the plan evaluates. */
export const auroraPathRows: Record<string, string> = {"sem-linha-debenture": "no_line_debenture", "adiar-linha": "defer_line", "debenture-com-linha": "debenture_with_line",
  "manter": "keep_and_roll", "ccb-tres-anos": "short_bank_loan", "alongar-com-banco": "extend_with_bank", "alongar-bradesco": "extend_bradesco"};

/** The discussion as adopted contributions, by hand, on its own basis; the reviewed results travel beside it. */
export function auroraBoardBasis(turn: BoardTurn = 2, edit: (c: ReturnType<typeof auroraBoardCase>) => void = () => undefined) {
  const c = auroraBoardCase(turn); edit(c);
  const f = analysisTestBasis(`board_capital.${id(95)}.`, c.askedOn, c.meetingDate);
  const sources = auroraBoardSources();
  const contribute = (p: string, unit: string, value: AdoptionBasisEntry["value"]) => f.contribute(p, unit, value);
  const text = (p: string, value: string) => contribute(p, "text", {type: "text", value});
  const list = (p: string, value: string[], unit = "identity") => contribute(p, unit, {type: "list", value});
  const input = {...f.context, analysisId: id(95), scenario: "base",
    meeting: {date: contribute("meeting.date", "date", {type: "date", value: c.meetingDate}), askedOn: contribute("meeting.askedOn", "date", {type: "date", value: c.askedOn}),
      leadDays: contribute("meeting.leadDays", "days", {type: "number", value: c.leadDays}), minutesPerPage: contribute("meeting.minutesPerPage", "minutes", {type: "number", value: c.minutesPerPage}),
      agendaMinutes: c.agendaMinutes === null ? null : contribute("meeting.agendaMinutes", "minutes", {type: "number", value: c.agendaMinutes}),
      nextMeetingDate: c.nextMeetingDate === null ? null : contribute("meeting.nextMeetingDate", "date", {type: "date", value: c.nextMeetingDate}),
      template: c.template === null ? null : text("meeting.template", c.template),
      outlineConfirmed: contribute("meeting.outlineConfirmed", "convention", {type: "boolean", value: c.outlineConfirmed})},
    sources: sources.map((s) => ({id: s.id, reading: list(`source.${s.id}`, [s.methodId, s.packet.fingerprint as string])})),
    topics: c.topics.map((t) => ({id: t.id, label: text(`topic.${t.id}.label`, t.label), seen: t.seen === null ? null : contribute(`topic.${t.id}.seen`, "convention", {type: "boolean", value: t.seen})})),
    deliberations: c.deliberations.map((d) => {const p = `deliberation.${d.id}.`; return {id: d.id, topicId: d.topicId, title: text(p + "title", d.title), subject: text(p + "subject", d.subject),
      recommendation: d.recommendation === null ? null : text(p + "recommendation", d.recommendation), authority: list(p + "authority", d.authorityBasis === null ? [d.authority] : [d.authority, d.authorityBasis]),
      deadlines: d.deadlines.map((x) => ({id: x.id, reading: list(`${p}deadline.${x.id}`, [x.date, x.action])}))};}),
    figures: [...Object.entries({...auroraBoardReadings, ...c.extraReadings}).map(([k, r]) => ({id: k, kind: "reading" as const, reading: list(`figure.${k}.reading`, r.filter((x): x is string => x !== undefined))})),
      ...Object.entries(auroraBoardPending).map(([k, r]) => ({id: k, kind: "pending" as const, reading: list(`figure.${k}.pending`, r)}))],
    materialFigureIds: list("figures.material", auroraMaterialFigures),
    indicative: auroraIndicative.figures.map((x) => ({figureId: x, reason: text(`figure.${x}.indicative`, auroraIndicative.reason)})),
    pages: c.pages.map((pg) => {const p = `page.${pg.id}.`; return {id: pg.id, topicId: pg.topicId, role: contribute(p + "role", "convention", {type: "text", value: pg.role}), title: text(p + "title", pg.title),
      lines: list(p + "lines", pg.lines, "text"), recommendation: pg.recommendation === null ? null : text(p + "recommendation", pg.recommendation),
      options: pg.options.length ? list(p + "options", pg.options, "text") : null};}),
    summary: {opening: text("summary.opening", c.summary.opening), closing: text("summary.closing", c.summary.closing)},
    appendix: c.appendix.map((a) => ({id: a.id, reading: list(`appendix.${a.id}`, [a.label, ...a.sourceIds])})),
    questions: c.questions.map((q) => ({id: q.id, question: text(`question.${q.id}.question`, q.question), answer: text(`question.${q.id}.answer`, q.answer)})),
    omissions: c.omissions.map((o) => ({id: o.id, reading: list(`omission.${o.id}`, [o.target, o.targetId, o.requestedBy])})),
  } as unknown as AdoptedBoardCapitalDiscussionInput;
  const seal = (): BoardCapitalDiscussionAnalyses => ({sources: auroraBoardSources().map((s) => ({id: s.id, packet: JSON.stringify(s.packet)})), discussion: {...input, envelope: f.seal()}});
  return {...f, input, case: c, seal};
}

/** The same case as facts with their origin, for the premises path. */
export function auroraBoardFacts(turn: BoardTurn = 2, edit: (c: ReturnType<typeof auroraBoardCase>) => void = () => undefined): BoardCapitalDiscussionFacts {
  const c = auroraBoardCase(turn), sources = auroraBoardSources(); edit(c);
  const fact = <T>(value: T, origin: "document" | "informed" | "house" | "estimate" | "analysis", source: string) => ({value, origin, source});
  return {discussionId: id(9500), entityId: company, perimeter: "standalone", currency: "BRL", definitionVersionId: id(3),
    askedOn: fact(c.askedOn, "informed", "data do pedido na conversa"), meetingDate: fact(c.meetingDate, "informed", "conselho na quarta, informado pelo CFO"),
    leadDays: fact(c.leadDays, "house", "roteiro antes do material quando há ao menos um dia até a reunião"),
    minutesPerPage: fact(c.minutesPerPage, "house", "uma página a cada três minutos de pauta"),
    agendaMinutes: c.agendaMinutes === null ? null : fact(c.agendaMinutes, "informed", "tempo de pauta informado pelo CFO"),
    nextMeetingDate: null, template: c.template === null ? null : fact(c.template, "document", "última apresentação ao conselho, anexada"),
    outlineConfirmed: fact(c.outlineConfirmed, "informed", c.outlineConfirmed ? "CFO seguiu o roteiro e mandou o template" : "roteiro ainda não confirmado"),
    sources: sources.map((s) => fact({id: s.id, methodId: s.methodId, packetFingerprint: s.packet.fingerprint as string}, "analysis", "resultado revisado no cofre, na versão vigente")),
    topics: c.topics.map((t) => fact(t, "informed", "o que o conselho já viu, segundo o CFO")),
    deliberations: c.deliberations.map((d) => fact(d, "analysis", "decisões com prazo extraídas das análises revisadas")),
    figures: [...Object.entries({...auroraBoardReadings, ...c.extraReadings}).map(([k, r]) => fact({id: k, kind: "reading" as const, reading: r.filter((x): x is string => x !== undefined)}, "analysis", "leitura do resultado revisado")),
      ...Object.entries(auroraBoardPending).map(([k, r]) => fact({id: k, kind: "pending" as const, reading: r}, "house", "número sem resultado revisado"))],
    materialFigureIds: fact(auroraMaterialFigures, "house", "fatos materiais para as decisões do conselho"),
    indicative: auroraIndicative.figures.map((x) => fact({figureId: x, reason: auroraIndicative.reason}, "analysis", "programa da rede A sem prazo confirmado")),
    pages: c.pages.map((p) => fact(p, "house", "plano de páginas proposto")),
    summary: fact(c.summary, "house", "página de síntese para envio prévio"),
    appendix: c.appendix.map((a) => fact(a, "house", "apêndice consultável")),
    questions: c.questions.map((q) => fact(q, "house", "perguntas prováveis do conselho")),
    omissions: c.omissions.map((o) => fact(o, "informed", "pedido do CFO na conversa")),
  } as unknown as BoardCapitalDiscussionFacts;
}
