import Decimal from "decimal.js";
import {createHash} from "node:crypto";
import {boardReleasedSources} from "./board-capital-discussion-sources";
import {describe, expect, it} from "vitest";
import {prepareBoardCapitalDiscussionPacket} from "./board-capital-discussion-packet";
import {boardShownTexts, boardConceptAttempts, boardDeferralReadings, boardRatingReadings, boardRestateSource, boardStrictDeferral, boardInformedProse, boardRestateKeptDebt, boardRestatePath, boardRestated, boardWorkingCapital2027, boardStatedMillions, boardWeeklyVariant, boardWeeklyVariantCase, boardWorkingCapitalReading, boardSublimitCase, boardSublimitExpected, boardOffDictionaryExpected, boardOffDictionaryNames, boardOffDictionaryReading, boardPacketInput, boardPacketViaPremises, boardRegisteredCreditorExpected,
  boardRegisteredCreditorReading} from "./board-capital-discussion-runs.test-support";
import {auroraBoardPending, auroraBoardReadings, auroraBoardSources, auroraRelativeCostPacket, debtTableWithPrincipal, covenantWithAdverseDebt, auroraCovenantPacket, debtTableWithCreditLineLabel, auroraInvestmentPacket, auroraPlanPacket, auroraProjectionPacket, auroraReceivablesPacket, debtTableWithCreditor, withBoardSource, type BoardTurn} from "./board-capital-discussion.test-support";
import {boardTemplates, checkBoardTemplateLibrary, parseBoardTextRef} from "./board-capital-discussion-templates";
import {boardConditionSlots} from "./board-capital-discussion";

type CaseData = Parameters<NonNullable<Parameters<typeof boardPacketInput>[1]>>[0];
/** A fixed-seed generator (mulberry32), so every property run is the same run. */
function random(seed: number) {
  let a = seed >>> 0;
  return () => {a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296;};
}
const pick = <T>(r: () => number, xs: readonly T[]) => xs[Math.floor(r() * xs.length)]!;
const packet = (turn: BoardTurn, edit: (c: CaseData) => void) => prepareBoardCapitalDiscussionPacket(boardPacketInput(turn, edit));
/** The full path: facts, premises, composer, adopted reader and packet. */
const full = (turn: BoardTurn, edit: (c: CaseData) => void) => prepareBoardCapitalDiscussionPacket(boardPacketViaPremises(turn, edit));
type Packet = ReturnType<typeof packet>;
const current = (p: Packet) => p.result.discussion!.versions.at(-1)!;
const shown = (p: Packet) => {
  const v = current(p);
  return new Set([...v.pages.flatMap((x) => x.figureIds), ...v.questions.flatMap((x) => x.figureIds), ...v.deliberations.flatMap((x) => x.figureIds), ...v.summaryFigureIds]);
};
const refusal = /board_capital_(page_role_mismatch|reading_presentation_not_unique|template_condition_undefined|rendered_number_invalid|number_without_origin|unknown_token|date_without_preposition|preposition_on_value|currency_not_supported|field_not_registered|figure_without_origin|figure_diverges|figure_without_statement|figure_reading_invalid|text_reading_not_a_label|text_ref_invalid|template_unknown|slot_invalid|slot_unbound|slot_type_mismatch|template_invalid|title_without_number|answer_without_number|page_without_number|material_fact_not_shown|slot_concept_mismatch|template_condition_failed|template_condition_unverified|deadline_action_mismatch|deliberation_text_mismatch|template_use_invalid|answer_mismatch|source_method_repeated|source_mixed|informed_fact_mismatch|informed_fact_invalid)|Invalid option|Too big|Invalid input|Invalid string|states its value/;

/** Every generated text field of the case, as a setter, so a number can be written into any of them. */
function textFields(c: CaseData): [string, (v: string) => void, string][] {
  const out: [string, (v: string) => void, string][] = [];
  c.deliberations.forEach((d, i) => {
    out.push([`deliberation.${d.id}.title`, (v) => {c.deliberations[i]!.title = v;}, d.title], [`deliberation.${d.id}.subject`, (v) => {c.deliberations[i]!.subject = v;}, d.subject]);
    if (d.recommendation) out.push([`deliberation.${d.id}.recommendation`, (v) => {c.deliberations[i]!.recommendation = v;}, d.recommendation]);
    d.deadlines.forEach((t, j) => out.push([`deliberation.${d.id}.deadline.${t.id}`, (v) => {c.deliberations[i]!.deadlines[j]!.action = v;}, t.action]));
    out.push([`deliberation.${d.id}.authorityBasis`, (v) => {c.deliberations[i]!.authorityBasis = v;}, "Política de endividamento aprovada na ata de março"]);
  });
  c.pages.forEach((p, i) => {
    out.push([`page.${p.id}.title`, (v) => {c.pages[i]!.title = v;}, p.title]);
    p.lines.forEach((l, j) => out.push([`page.${p.id}.line.${j}`, (v) => {c.pages[i]!.lines[j] = v;}, l]));
    if (p.recommendation) out.push([`page.${p.id}.recommendation`, (v) => {c.pages[i]!.recommendation = v;}, p.recommendation]);
    p.options.forEach((o, j) => out.push([`page.${p.id}.option.${j}`, (v) => {c.pages[i]!.options[j] = v;}, o]));
  });
  out.push(["summary.opening", (v) => {c.summary.opening = v;}, c.summary.opening], ["summary.closing", (v) => {c.summary.closing = v;}, c.summary.closing]);
  c.appendix.forEach((a, i) => out.push([`appendix.${a.id}`, (v) => {c.appendix[i]!.label = v;}, a.label]));
  c.questions.forEach((q, i) => out.push([`question.${q.id}.question`, (v) => {c.questions[i]!.question = v;}, q.question], [`question.${q.id}.answer`, (v) => {c.questions[i]!.answer = v;}, q.answer]));
  c.topics.forEach((t, i) => out.push([`topic.${t.id}`, (v) => {c.topics[i]!.label = v;}, t.label]));
  return out;
}

/** The eleven families of displayed fields the reviews wrote into. */
const families: [string, (c: CaseData, add: string) => void][] = [
  ["deliberation.title", (c, x) => {c.deliberations[0]!.title += x;}], ["deliberation.recommendation", (c, x) => {c.deliberations[0]!.recommendation += x;}],
  ["deadline.action", (c, x) => {c.deliberations[0]!.deadlines[0]!.action += x;}], ["page.title", (c, x) => {c.pages[1]!.title += x;}],
  ["page.line", (c, x) => {c.pages[1]!.lines[0] += x;}], ["page.recommendation", (c, x) => {c.pages[4]!.recommendation += x;}],
  ["summary.opening", (c, x) => {c.summary.opening += x;}], ["summary.closing", (c, x) => {c.summary.closing += x;}],
  ["appendix.label", (c, x) => {c.appendix[0]!.label += x;}], ["question.question", (c, x) => {c.questions[0]!.question += x;}], ["question.answer", (c, x) => {c.questions[0]!.answer += x;}]];
/** Every attack of the six review rounds, as the prose a contribution would have to write: there is no field for it. */
const attacks = [" Retorno de menos {irr}.", " VPL de menos {npv}.", " O prazo médio é de dezasseis.", " A dívida é a terça parte de {divida-total}.", " Retorno de {irr} por minuto.",
  " Prazo médio de {wal} (leia-se em minutos).", " Dívida {divida-total} bilhões.", " Prazo de {wal} meses.", " A dívida é de {year-2027} BRL.", " A taxa é de １６%.",
  " A dívida equivale a {em:year-2027} ienes.", " Custo de {divida-total} e centavos.", " Retorno de {irr} por semana.", " Dívida -{divida-total}."];

/** The oracle's own reading of what each slot means, written apart from the library: the method and path a reading
 * must come from (`*` stands for any selector value), `year` for a year reading, or the action text a deadline must
 * belong to. A displayed binding outside this table is a divergence. */
const DT = "build-company-debt-table|", CV = "measure-covenant-headroom|", WC = "project-weekly-cash|", IP = "analyze-investment-project|comparison.metrics",
  OP = "build-operating-projection|", PC = "challenge-financial-projection|", RF = "monetize-receivables-for-working-capital|", RC = "analyze-relative-debt-cost|",
  FP = "evaluate-financing-paths|", LI = FP + "readings.recommendation.longInstrument.";
const pathRow = (id: string) => ({caixa: `${FP}readings.paths[id=${id}].minimumCash.amount`, alavancagem: `${FP}readings.paths[id=${id}].worstLeverage`,
  custo: `${FP}readings.paths[id=${id}].horizonFinancingCost`, ano: "year", divida: `${FP}readings.paths[id=${id}].netDebtAtHorizon`,
  criterios: `${FP}readings.paths[id=${id}].eligible`, anuencia: `${FP}readings.paths[id=${id}].consentRequired`});
const notice = "deadline:enviar ao fornecedor o aviso para renegociar o contrato", programs = "deadline:aderir aos programas",
  sounding = "deadline:concluir a sondagem", route = "deadline:decidir a rota";
const meaning: Record<string, Record<string, string>> = {
  "delib.crop": {ano: "year"}, "delib.crop.subject": {ano: "year"}, "delib.maturities": {ano: "year"}, "delib.maturities.subject": {ano: "year"},
  "delib.maturities.sounding": {valor: LI + "issueTarget", prazo: LI + "termYears"},
  "delib.policy.definition": {limite: CV + "result.headroom.limits[id=politica].maximumRatio"},
  "situation.debt_total": {total: DT + "result.table.reconciliation.principal", ano: "year"},
  "situation.debt_maturity": {principal: DT + "result.table.profile.scheduleByYear[year=*].principal", ano: "year", parcela: DT + "result.table.profile.dueWithinTwelveMonthsShare",
    horizonte: DT + "result.table.profile.twelveMonthHorizon"},
  "situation.debt_profile": {prazo: DT + "result.table.profile.weightedAverageLifeYears", credor: DT + "result.table.profile.largestCreditor.creditor", participacao: DT + "result.table.profile.largestCreditor.share"},
  "situation.cash_shortfall": {semana: WC + "readings.tightestWeek.weekStart", saldo: FP + "result.evaluation.paths[id=manter].closingAvailableByPeriod[periodId=*].closingAvailable", ano: "year"},
  "situation.cash_without_line": {semana: WC + "readings.sensitivities[caseId=sem-linha].weekStart", saldo: WC + "readings.sensitivities[caseId=sem-linha].minimum", minimo: WC + "result.weekly.minimumCash"},
  "situation.debt_service": {ano: "year", servico: FP + "result.evaluation.paths[id=manter].debtServiceByYear[year=*].service",
    disponivel: FP + "result.evaluation.paths[id=manter].debtServiceByYear[year=*].availableForService"},
  "constraint.indenture_basket": {titular: DT + "result.table.rows[id=*].creditor", saldo: DT + "result.table.negativePledgeBaskets[holderId=*].remaining"},
  "constraint.basket_usage": {cesta: DT + "result.table.negativePledgeBaskets[holderId=*].basket", ocupado: DT + "result.table.negativePledgeBaskets[holderId=*].occupied",
    credor: DT + "result.table.rows[id=*].creditor"},
  "constraint.covenant_policy": {covenant: CV + "result.headroom.limits[id=aditamento].maximumRatio", politica: CV + "result.headroom.limits[id=politica].maximumRatio"},
  "topic.project_return": {retorno: IP + "[caseId=base].annualIrr", custo: IP + "[caseId=base].discountRate"},
  "topic.project_value": {retorno: IP + "[caseId=base].annualIrr", custo: IP + "[caseId=base].discountRate", vpl: IP + "[caseId=base].netPresentValue"},
  "topic.project_payback": {payback: IP + "[caseId=base].paybackYears", pico: IP + "[caseId=base].peakCumulativeCashNeed.amount", data: IP + "[caseId=base].peakCumulativeCashNeed.periodEndDate"},
  "topic.project_sensitivities": {vpl_economia: IP + "[caseId=economy-4].netPresentValue", vpl_capex: IP + "[caseId=capex-120].netPresentValue", vpl_partida: IP + "[caseId=slower-start].netPresentValue"},
  "topic.project_strategic_reason": {motivo: "informed:chair"},
  "topic.project_wait_quotes": {vpl: IP + "[caseId=defer-12].netPresentValue", retorno: IP + "[caseId=defer-12].annualIrr"},
  "option.go_now": {vpl: IP + "[caseId=base].netPresentValue", retorno: IP + "[caseId=base].annualIrr"},
  "option.staged": {vpl: IP + "[caseId=staged].netPresentValue"},
  "option.wait_quotes": {vpl: IP + "[caseId=defer-12].netPresentValue", retorno: IP + "[caseId=defer-12].annualIrr"},
  "topic.project_wait_quotes_registered": {vpl: IP + "[caseId=defer-12].netPresentValue", retorno: IP + "[caseId=defer-12].annualIrr"},
  "option.wait_quotes_registered": {vpl: IP + "[caseId=defer-12].netPresentValue", retorno: IP + "[caseId=defer-12].annualIrr"},
  "topic.crop_programs": {valor: RF + "readings.plan[optionId=*].cumulative", pico: RF + "result.funding.need.peak"},
  "topic.crop_program_cost": {taxa_b: RF + "readings.options[id=*].spreadOverDi", taxa_a: RF + "readings.options[id=*].spreadOverDi"},
  "topic.crop_overdraft": {credor: DT + "result.table.creditLines[id=*].creditor", livre: DT + "result.table.creditLines[id=*].unused", termos: DT + "result.table.creditLines[id=*].terms"},
  "alternatives.count": {caminhos: FP + "readings.horizon.candidatePaths", ano: "year"},
  "alternatives.row.no_line_debenture": pathRow("sem-linha-debenture"), "alternatives.row.defer_line": pathRow("adiar-linha"),
  "alternatives.row.debenture_with_line": {...pathRow("debenture-com-linha"), credor: DT + "result.table.rows[id=*].creditor"}, "alternatives.row.keep_and_roll": pathRow("manter"), "alternatives.row.short_bank_loan": pathRow("ccb-tres-anos"),
  "alternatives.row.extend_with_bank": pathRow("alongar-com-banco"), "alternatives.row.extend_bradesco": {...pathRow("alongar-bradesco"), credor: DT + "result.table.rows[id=*].creditor"},
  "recommendation.debenture": {valor: LI + "issueTarget", prazo: LI + "termYears"},
  "recommendation.debenture_cost": {credor: DT + "result.table.rows[id=*].creditor", baixo: LI + "equivalentSpread", alto: LI + "equivalentSpreadAtCondition"},
  "recommendation.amortization": {inicio: LI + "firstAmortizationYear", fim: LI + "lastAmortizationYear"},
  "recommendation.alternative": {credor: DT + "result.table.rows[id=*].creditor", prazo: route},
  "alternatives.moves.title": {caminhos: FP + "readings.horizon.candidatePaths"},
  "alternatives.moves.no_line_debenture": {credor: DT + "result.table.rows[id=*].creditor"}, "alternatives.moves.debenture_with_line": {credor: DT + "result.table.rows[id=*].creditor"},
  "alternatives.moves.extend_with_bank": {credor: DT + "result.table.rows[id=*].creditor"}, "alternatives.moves.extend_bradesco": {credor: DT + "result.table.rows[id=*].creditor"},
  "risk.leverage": {politica: CV + "result.headroom.limits[id=politica].maximumRatio", adverso: CV + "result.headroom.measurements[id=*].ratio", ano: "year"},
  "risk.leverage_path": {inicio: CV + "result.headroom.measurements[id=*].ratio", data_inicio: CV + "result.headroom.measurements[id=*].date",
    fim: CV + "result.headroom.measurements[id=*].ratio", data_fim: CV + "result.headroom.measurements[id=*].date"},
  "risk.leverage_adverse": {ano: "year", adverso: CV + "result.headroom.measurements[id=*].ratio", politica: CV + "result.headroom.limits[id=politica].maximumRatio"},
  "risk.policy_definition": {politica: CV + "result.headroom.limits[id=politica].maximumRatio"},
  "risk.policy_readings": {gerencial: CV + "result.headroom.measurements[id=*].ratio", escritura: CV + "result.headroom.measurements[id=*].ratio",
    data: CV + "result.headroom.measurements[id=*].date"},
  "what_changes.title": {piso: LI + "issueFloorInsideGates"},
  "what_changes.demand": {piso: LI + "issueFloorInsideGates", alvo: LI + "issueTarget"},
  "what_changes.wheat": {choque: OP + "result.projection.projection.scenarios[id=informado-trigo-4m].inputCostShock.rate",
    defasagem: OP + "result.projection.projection.scenarios[id=informado-trigo-4m].inputCostShock.passThroughLagMonths", ano: "year",
    ebitda: OP + "readings.projected.scenarios[id=informado-trigo-4m].rows[periodId=*].ebitda"},
  "what_changes.receivable_days": {ano: "year", giro: OP + "readings.projected.scenarios[id=prazo-60].rows[periodId=*].effects.changeInWorkingCapital"},
  "next_steps.notice": {prazo: notice}, "next_steps.programs": {prazo: programs}, "next_steps.sounding": {prazo: sounding}, "next_steps.route": {prazo: route, ano: "year"},
  "summary.opening.debt_and_cash": {principal: DT + "result.table.profile.scheduleByYear[year=*].principal", ano: "year", semana: WC + "readings.tightestWeek.weekStart"},
  "summary.closing.leverage": {alavancagem: CV + "result.headroom.measurements[id=*].ratio", data: CV + "result.headroom.measurements[id=*].date",
    politica: CV + "result.headroom.limits[id=politica].maximumRatio"},
  "q.roll_bank": {credor: DT + "result.table.rows[id=*].creditor"},
  "a.roll_bank": {credor: DT + "result.table.rows[id=*].creditor", falta: FP + "result.evaluation.paths[id=bradesco-sem-linha].shortfallVsPolicyMinimum",
    vencimento: DT + "result.table.rows[id=*].finalPayment"},
  "q.term": {prazo: LI + "termYears"},
  "a.term": {ano: "year", amortizacao: FP + "result.evaluation.paths[id=sem-linha-debenture].amortizationTests[profileId=cinco-anos].years[year=*].scheduledAmortization",
    disponivel: FP + "result.evaluation.paths[id=sem-linha-debenture].amortizationTests[profileId=cinco-anos].years[year=*].availableAfterInterest"},
  "a.demand": {valor: FP + "readings.alternative.issueTarget", prazo: route, credor: DT + "result.table.rows[id=*].creditor", vencimento: DT + "result.table.rows[id=*].finalPayment"},
  "a.cost": {baixo: LI + "equivalentSpread", alto: LI + "equivalentSpreadAtCondition", custo: FP + "readings.recommendation.horizonFinancingCost", ano: "year",
    divida: FP + "readings.recommendation.netDebtAtHorizon", ano_fim: "year"},
  "a.peer": {total: RC + "decomposition.grossBps", ajustes: RC + "result.bridge.knownAdjustmentsBps", data: RC + "result.bridge.steps[family=pricing_date].bps",
    resto: RC + "result.bridge.unexplainedAfterKnownAdjustmentsBps"},
  "a.rating": {baixo: RC + "levers[role=rating&scenario=low].netOfKnownCosts", alto: RC + "levers[role=rating&scenario=high].netOfKnownCosts"},
  "a.rating_known_costs": {baixo: RC + "levers[role=rating&scenario=low].netOfKnownCosts", alto: RC + "levers[role=rating&scenario=high].netOfKnownCosts"},
  "a.strategic": {retorno: IP + "[caseId=base].annualIrr", custo: IP + "[caseId=base].discountRate"},
  "a.wheat": {choque: OP + "result.projection.projection.scenarios[id=informado-trigo-4m].inputCostShock.rate",
    defasagem: OP + "result.projection.projection.scenarios[id=informado-trigo-4m].inputCostShock.passThroughLagMonths", ano: "year",
    ebitda: OP + "readings.projected.scenarios[id=informado-trigo-4m].rows[periodId=*].ebitda", ebitda_adverso: CV + "result.headroom.measurements[id=*].reportedEbitda",
    alavancagem: CV + "result.headroom.measurements[id=*].ratio", covenant: CV + "result.headroom.limits[id=aditamento].maximumRatio"},
  "q.anchor": {rede: RF + "result.funding.portfolio.items[itemId=*].label"},
  "a.anchor": {rede: RF + "result.funding.portfolio.items[itemId=*].label", saldo: RF + "result.funding.portfolio.items[itemId=*].amount", carteira: RF + "readings.gross",
    volume: RF + "result.funding.options[id=*].byItem[itemId=*].retained", taxa: RF + "readings.options[id=*].spreadOverDi"},
  "a.anchor_shared": {rede: RF + "result.funding.portfolio.items[itemId=*].label", saldo: RF + "result.funding.portfolio.items[itemId=*].amount", carteira: RF + "readings.gross",
    volume: RF + "result.funding.options[id=*].byItem[itemId=*].retained", taxa: RF + "readings.options[id=*].spreadOverDi"},
  "q.plan_vs_base": {plano: PC + "readings.gap.plan.ebitda", ano: "year", base: PC + "readings.gap.reference.ebitda"},
  "a.plan_vs_base": {base: PC + "readings.gap.reference.ebitda"},
};
// Named objects: the oracle's own reading of the registered field that names each one.
const PROJECT = "analyze-investment-project|cases[id=base].label", INPUT = OP + "result.projection.projection.scenarios[id=informado-trigo-4m].label";
for (const [slot, want, ids] of [
  ["projeto", PROJECT, ["delib.packaging_line", "delib.packaging_line.subject", "topic.project_return", "recommendation.alternative", "a.roll_bank", "a.demand", "q.strategic", "next_steps.notice",
    ...["no_line_debenture", "defer_line", "defer_line_generic", "debenture_with_line", "keep_and_roll", "short_bank_loan", "extend_with_bank", "extend_bradesco"].map((x) => `alternatives.moves.${x}`)]],
  ["insumo", INPUT, ["what_changes.wheat", "a.wheat", "q.wheat"]],
] as const) for (const id of ids) meaning[id] = {...meaning[id], [slot]: want};
/** The oracle's own closed vocabularies (its copy, written apart from the method's): each term with the whole registered
 * labels that name it. A field names a term only when the whole field equals one of them, ignoring case, spacing and accents. */
const vocabularies: Record<string, Record<string, string[]>> = {
  input: {trigo: ["trigo", "informado, com trigo +15% e repasse em quatro meses"], "açúcar": ["açúcar"], farinha: ["farinha"], embalagem: ["embalagem"]},
  project: {
    "linha de embalagem": ["linha de embalagem", "linha de embalagem, cronograma original", "linha de embalagem no cronograma informado", "linha de embalagem adiada doze meses"],
    caldeira: ["caldeira", "caldeira, cronograma original", "caldeira no cronograma informado", "caldeira adiada doze meses"],
  },
};
const word = (w: string) => new RegExp(`(?<![\\p{L}])${w}(?![\\p{L}])`, "iu");
const plain = (x: string) => x.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().split(/\s+/).filter(Boolean).join(" ");
/** The term a registered field names by whole-field equality, or null. */
const termOf = (vocabulary: string, text: string) => {
  const hits = Object.entries(vocabularies[vocabulary]!).filter(([, labels]) => labels.some((l) => plain(l) === plain(text))).map(([term]) => term);
  return hits.length === 1 ? hits[0]! : null;
};
/** What the oracle reads in the numbers each fixed text asserts, on the source values of the identity check. */
const claims: Record<string, (v: Record<string, Decimal>) => boolean> = {
  "situation.cash_without_line": (v) => v.saldo!.lt(v.minimo!), "situation.debt_service": (v) => v.servico!.gt(v.disponivel!),
  "constraint.indenture_basket": (v) => v.saldo!.gte(0), "constraint.basket_usage": (v) => v.ocupado!.lte(v.cesta!),
  "topic.project_return": (v) => v.retorno!.gt(v.custo!), "topic.project_sensitivities": (v) => [v.vpl_economia, v.vpl_capex, v.vpl_partida].every((x) => x!.lt(0)),
  "recommendation.debenture_cost": (v) => v.baixo!.lte(v.alto!), "recommendation.amortization": (v) => v.inicio!.lte(v.fim!),
  "risk.leverage_path": (v) => v.fim!.lt(v.inicio!), "risk.leverage_adverse": (v) => v.adverso!.lt(v.politica!), "risk.leverage": (v) => v.adverso!.lt(v.politica!),
  "what_changes.demand": (v) => v.piso!.lt(v.alvo!), "what_changes.receivable_days": (v) => v.giro!.gt(0), "what_changes.wheat": (v) => v.choque!.gt(0),
  "a.roll_bank": (v) => v.falta!.gt(0), "a.term": (v) => v.amortizacao!.gt(v.disponivel!), "a.peer": (v) => v.data!.lte(v.total!), "a.rating": (v) => v.baixo!.lte(v.alto!), "a.rating_known_costs": (v) => v.baixo!.lte(v.alto!),
  "a.strategic": (v) => v.retorno!.gt(v.custo!), "a.wheat": (v) => v.alavancagem!.lt(v.covenant!), "a.anchor": (v) => v.saldo!.lte(v.carteira!) && v.volume!.lte(v.saldo!), "a.anchor_shared": (v) => v.saldo!.lte(v.carteira!) && v.volume!.lte(v.saldo!), "q.plan_vs_base": (v) => v.plano!.gt(v.base!),
};

/** An independent reader of the final text. It formats every reading again from its source value, kind, scale,
 * periodicity and presentation with its own rules; then removes from each displayed field every reading's text,
 * every deadline, the counts and ordinals, and requires that what remains passes its own whitelist and lexicon.
 * Every material fact must appear by its own formatted text. */
const names = new Set(["Itaú", "Bradesco", "Santander", "Banco do Brasil", "Caixa", "BTG Pactual", "Banco Safra", "BNDES", "XP", "Sicredi", "Sicoob", "Banrisul", "Citi", "JPMorgan",
  "Debenturistas", "rede A", "rede B"]);
/** The oracle's own reading of the receivables result: balance owed by the chain, program volume and the registered contract. */
/** The oracle's own reading of a debtor in the receivables result, by the debtor key the source registers (its own
 * dictionary of names to keys), never by item or option identifiers: balance, the anchor program linked to the item, contract. */
const debtorKeys: Record<string, string> = {"rede A": "rede-a", "rede B": "rede-b"};
function receivablesFacts(packet: Record<string, unknown>, name: string) {
  const contributions = (packet.result as {contributions: {fieldPath: string; value: {value: unknown}}[]}).contributions;
  const items = contributions.flatMap((x) => {const m = /\.item\.([a-z0-9-]+)\.debtorKey$/.exec(x.fieldPath); return m && x.value.value === debtorKeys[name] ? [m[1]!] : [];});
  if (items.length !== 1) return null;
  const item = items[0]!;
  const f = (packet.result as {funding: {portfolio: {items: {itemId: string; amount: string}[]}; options: {id: string; byItem?: {itemId: string; retained: string}[]}[]}}).funding;
  // The programs the source links to the item, and among them those linked to that item alone (the debtor's own).
  const links = contributions.flatMap((x) => {const m = /\.option\.([a-z0-9-]+)\.anchorItemIds$/.exec(x.fieldPath);
    return m && Array.isArray(x.value.value) && (x.value.value as string[]).includes(item) ? [{id: m[1]!, alone: (x.value.value as string[]).length === 1}] : [];});
  // The debtor's volume in a program is the program's figure for that item, never the program's total.
  const retained = (id: string) => f.options.find((o) => o.id === id)?.byItem?.find((b) => b.itemId === item)?.retained ?? null;
  const own = links.filter((x) => x.alone);
  return {balance: f.portfolio.items.find((x) => x.itemId === item)!.amount, own: own.length === 1 ? retained(own[0]!.id) : null,
    shared: links.map((x) => retained(x.id)).filter((x): x is string => x !== null),
    contract: contributions.find((x) => x.fieldPath.endsWith(`.item.${item}.contract`))?.value.value};
}
const receivablesMethod = "monetize-receivables-for-working-capital";
function oracle(p: Packet, sources: {packet: Record<string, unknown>}[] = auroraBoardSources()) {
  const v = current(p), d = p.result.discussion!;
  const D = Decimal.clone({precision: 60, rounding: Decimal.ROUND_HALF_UP});
  const short = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  const long = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  const reformat = (x: (typeof d.identity)[number]) => {
    if (x.unit === "label") return names.has(x.value) ? x.value : "nome fora do dicionário";
    if (x.unit === "flag") return x.value === "true" ? "sim" : "não";
    if (x.unit === "calendar") return x.value;
    if (x.unit === "date") {
      const m = Number(x.value.slice(5, 7)) - 1, day = Number(x.value.slice(8, 10));
      return ({day_month: `${day}/${short[m]}`, day_long: `${day} de ${long[m]}`, month_year: `${short[m]}/${x.value.slice(2, 4)}`, month_long: `${long[m]} de ${x.value.slice(0, 4)}`,
        year: x.value.slice(0, 4)} as Record<string, string>)[x.presentation]!;
    }
    const scaled = x.scale === "reais" ? new D(x.value).div(1000000) : x.scale === "ratio" ? new D(x.value).times(100) : new D(x.value);
    const n = scaled.toFixed(Number(x.presentation)).replace(".", ",");
    const words = ["", "um mês", "dois meses", "três meses", "quatro meses", "cinco meses", "seis meses", "sete meses", "oito meses", "nove meses", "dez meses", "onze meses"];
    const months = /^months_(\d+)$/.exec(x.period)?.[1];
    const per = x.period === "annual" ? (x.unit === "rate" ? " ao ano" : " por ano") : months ? (months === "12" ? " por ano" : ` em ${Number(months) < 12 ? words[Number(months)] : `${months} meses`}`) : "";
    return x.unit === "money" ? `R$ ${n} ${scaled.abs().toDecimalPlaces(Number(x.presentation)).lt(2) ? "milhão" : "milhões"}${per}` : x.unit === "rate" ? `${n}%${per}`
      : x.unit === "multiple" ? `${n}x` : x.unit === "years" ? `${n} ${n === "1" ? "ano" : "anos"}` : x.unit === "months" ? `${n} ${n === "1" ? "mês" : "meses"}` : x.unit === "bps" ? `${n} pontos` : n;
  };
  const bad: string[] = d.identity.filter((x) => reformat(x) !== x.display).map((x) => `format:${x.figureId}`);
  // Period against the source's own operands: a lever's benefit is nominal over its action's exposure, so its period is
  // the sum of that exposure's registered year fractions, in months; a figure claimed per year must cover twelve.
  for (const x of d.identity.filter((i) => i.methodId === "analyze-relative-debt-cost" && /netOfKnownCosts$/.test(i.path))) {
    const rc = sources.find((y) => y.packet.fingerprint === x.packetFingerprint)?.packet as {levers?: {role: string; scenario: string; actionId: string}[]; result?: {actions?: {actionId: string; result: {operands: {exposure: {yearFraction: string}[]}}}[]}} | undefined;
    const sel = /levers\[([^\]]+)\]/.exec(x.path)?.[1] ?? "";
    const lever = rc?.levers?.find((l) => sel.split("&").every((c) => String((l as Record<string, unknown>)[c.split("=")[0]!]) === c.slice(c.indexOf("=") + 1)));
    const exposure = rc?.result?.actions?.find((a) => a.actionId === lever?.actionId)?.result.operands.exposure ?? [];
    const months = exposure.reduce((sum, e) => sum.plus(new D(e.yearFraction).times(12)), new D(0));
    if (!exposure.length || x.period !== `months_${months.toFixed(0)}` || !months.eq(months.toDecimalPlaces(0))) bad.push(`period:${x.figureId}`);
  }
  const texts = [v.summary, ...v.pages.flatMap((x) => [x.title, ...x.lines, x.recommendation ?? "", ...x.options]), ...v.deliberations.flatMap((x) => [x.title, x.text, ...x.deadlines.map((t) => t.action)]),
    ...v.questions.flatMap((x) => [x.question, x.answer]), ...v.appendix.map((x) => x.label)];
  const counts = ["zero", "uma", "duas", "três", "quatro", "cinco", "seis", "sete", "oito", "nove", "dez", "onze", "doze"];
  const known = [...d.identity.map((x) => x.display), ...v.deliberations.flatMap((x) => x.deadlines.map((t) => t.display)),
    `Pedimos ${counts[v.deliberations.length]} decisões; ${counts[v.deliberations.filter((x) => x.deadlines.length).length]} têm`, "[pendente]"].sort((a, b) => b.length - a.length);
  const joined = texts.join(" | ");
  // Its own whitelist and lexicon, written apart from the method's.
  const allowed = /^[a-zA-ZÀ-ÿ ,.;:?!()"'“”‘’-]*$/u;
  const lexicon = /(?<![a-zA-ZÀ-ÿ])(menos|dois|duas|tr[eê]s|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|dezasseis|dezesseis|quinze|vinte|trinta|cem|mil|milh\S*|bilh\S*|centavos?|milhares?|meio|metade|ter[cç]a|ter[cç]o|dobro|reais|real|d[oó]lar\S*|euros?|ienes?|brl|usd|cad|eur|janeiro|fevereiro|mar[cç]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro|anos?|m[eê]s|meses|dias?|semanas?|semestres?|trimestres?|minutos?|horas?|anual|mensal|semestral|trimestral|cento|percentua\S*|pontos?|x)(?![a-zA-ZÀ-ÿ])/iu;
  for (const t of texts) {
    let rest = t;
    for (const k of known) rest = rest.split(k).join(" ");
    rest = rest.replace(/^\d{1,2}\. /, " ").replace(/\(\d{1,2}\) /g, " ").normalize("NFKC");
    if (!allowed.test(rest)) bad.push(`character@${t.slice(0, 60)}`);
    const word = lexicon.exec(rest);
    if (word) bad.push(`${word[0]}@${t.slice(0, 60)}`);
  }
  // Text to concept: every displayed binding reads what the oracle's own table names for that slot, and every
  // assertion of the fixed text holds on the source values.
  const byId = new Map(d.identity.map((x) => [x.figureId, x]));
  const pattern = (want: string) => new RegExp(`^${want.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\\\*/g, "[^\\]]+")}$`);
  const groups = new Map<string, {templateId: string; values: Record<string, Decimal>; complete: boolean}>();
  for (const b of v.bindings) {
    const want = meaning[b.templateId]?.[b.slot], key = `${b.field}|${b.templateId}`;
    const g = groups.get(key) ?? {templateId: b.templateId, values: {}, complete: true}; groups.set(key, g);
    if (!want) {bad.push(`concept_unknown:${b.templateId}.${b.slot}`); continue;}
    if (b.informedId !== null) {
      const fact = d.informed.find((x) => x.id === b.informedId);
      if (want !== `informed:${fact?.author}` || fact?.origin !== "informed") bad.push(`concept_informed:${b.field}:${b.slot}`);
      continue;
    }
    if (b.deadlineId !== null) {
      const [dId, tId] = b.deadlineId.split(".");
      const t = v.deliberations.find((x) => x.id === dId)?.deadlines.find((x) => x.id === tId);
      if (want !== `deadline:${t?.action}`) bad.push(`concept_deadline:${b.field}:${b.slot}`);
      continue;
    }
    const x = byId.get(b.figureId!);
    if (!x) {
      // A pending figure: the exact field it stands for must be the one the oracle's table names for the slot.
      const pendingFigure = d.pendingFigures.find((f) => f.figureId === b.figureId);
      if (!pendingFigure || !pattern(want).test(`${pendingFigure.methodId}|${pendingFigure.path}`)) bad.push(`concept_pending:${b.field}:${b.slot}`);
      g.complete = false; continue;
    }
    const ok = want === "year" ? x.unit === "calendar" : pattern(want).test(`${x.methodId}|${x.path}`);
    if (!ok) bad.push(`concept:${b.field}:${b.slot}:${b.figureId}`);
    if (/^-?\d+(\.\d+)?$/.test(x.value)) g.values[b.slot] = new D(x.value);
  }
  // Three values: a claim that reads a pending or absent slot is undefined, and undefined is never accepted.
  for (const [key, g] of groups) {
    const fn = claims[g.templateId];
    if (!fn) continue;
    let ok: boolean | "undefined";
    try {ok = fn(g.values);} catch {ok = "undefined";}
    if (ok !== true) bad.push(`claim${ok === "undefined" ? "_undefined" : ""}:${key}`);
  }
  // Names: the oracle's own dictionary. A label outside it is never shown and leaves a gap of name; one inside it is
  // shown as registered. One package per method. A row's creditor is named only beside readings of that same row.
  const objectPaths: [string, RegExp][] = [["project", /^analyze-investment-project\|cases\[id=[^\]]+\]\.label$/], ["input", /^build-operating-projection\|result\.projection\.projection\.scenarios\[id=[^\]]+\]\.label$/]];
  const vocabularyOf = (x: {methodId: string; path: string}) => objectPaths.find(([, r]) => r.test(`${x.methodId}|${x.path}`))?.[0];
  for (const x of d.identity.filter((i) => i.unit === "label")) {
    if (vocabularyOf(x)) continue;
    if (names.has(x.value)) continue;
    // A debtor's free label is never shown; the debtor is named by its registered key (checked against the receivables result below).
    if (/portfolio\.items\[/.test(x.path)) {if (texts.some((t) => t.includes(x.value))) bad.push(`name_shown:${x.figureId}`); continue;}
    if (texts.some((t) => t.includes(x.value) || t.includes(x.value.normalize("NFKC")))) bad.push(`name_shown:${x.figureId}`);
    if (v.bindings.some((b) => b.figureId === x.figureId) && !d.gaps.some((g) => g.reason === "label_not_in_dictionary" && g.item.endsWith(`.label.${x.figureId}`))) bad.push(`name_gap:${x.figureId}`);
  }
  // Named objects, by the oracle's own vocabularies: a term appears in a text only when a registered field bound in the
  // material names it (and the key of its path names no other term); an unmatched field leaves a gap. The registered
  // free text itself is never shown. Across sources, the plan's project variants name the project the investment names.
  const objectTerms = new Map<string, Set<string>>();
  for (const x of d.identity) {
    const vocabulary = vocabularyOf(x);
    if (!vocabulary) continue;
    if (texts.some((t) => t.includes(x.value))) bad.push(`object_text_shown:${x.figureId}`);
    const named = termOf(vocabulary, x.value), ok = named !== null;
    if (ok) {const set = objectTerms.get(vocabulary) ?? new Set<string>(); set.add(named!); objectTerms.set(vocabulary, set);}
    else if (v.bindings.some((b) => b.figureId === x.figureId) && !d.gaps.some((g) => g.reason === "object_not_in_vocabulary" && g.item.endsWith(`.object.${x.figureId}`))) bad.push(`object_gap:${x.figureId}`);
  }
  for (const t of texts) for (const [vocabulary, terms] of Object.entries(vocabularies)) for (const term of Object.keys(terms)) {
    // A shorter term inside a longer one of another vocabulary (embalagem inside linha de embalagem) is read as the longer.
    const stripped = Object.values(vocabularies).flatMap((v) => Object.keys(v)).filter((o) => o !== term && o.includes(term)).reduce((acc, o) => acc.replace(new RegExp(o, "giu"), " "), t);
    if (word(term).test(stripped) && !objectTerms.get(vocabulary)?.has(term)) bad.push(`object_unregistered:${term}@${t.slice(0, 60)}`);
  }
  const planIdentity = d.identity.find((x) => x.methodId === "evaluate-financing-paths");
  const planPacket = (planIdentity ? sources.find((x) => x.packet.fingerprint === planIdentity.packetFingerprint)?.packet : undefined) as {result: {contributions: {fieldPath: string; value: {value: unknown}}[]}} | undefined;
  const planTerms = planPacket?.result.contributions ?? [];
  const variantTerms = planTerms.filter((x) => /\.variant\.[a-z0-9-]+\.label$/.test(x.fieldPath)
    && planTerms.some((k) => k.fieldPath === x.fieldPath.replace(/\.label$/, ".kind") && k.value.value === "project")).map((x) => termOf("project", String(x.value.value)));
  const investedTerm = (() => {const x = d.identity.find((i) => vocabularyOf(i) === "project"); return x ? termOf("project", x.value) : null;})();
  for (const t of texts.filter((x) => /^Caminho [A-G]:|^Plano alternativo:|^No caminho sem/.test(x))) {
    const shown = Object.keys(vocabularies.project!).find((term) => word(term).test(t));
    if (shown && (variantTerms.length === 0 || variantTerms.some((x) => x !== shown) || investedTerm !== shown)) bad.push(`object_across_sources:${t.slice(0, 60)}`);
  }
  for (const method of new Set(d.identity.map((x) => x.methodId)))
    if (new Set(d.identity.filter((x) => x.methodId === method).map((x) => `${x.sourceId}|${x.packetFingerprint}`)).size !== 1) bad.push(`packages_mixed:${method}`);
  const rowsOf = new Map<string, Set<string>>();
  for (const b of v.bindings) {
    const x = b.figureId === null ? undefined : byId.get(b.figureId), row = x && x.methodId === "build-company-debt-table" ? /^result\.table\.rows\[id=([^\]]+)\]/.exec(x.path)?.[1] : undefined;
    if (row) {const key = `${b.field}|${b.templateId}`; rowsOf.set(key, (rowsOf.get(key) ?? new Set()).add(row));}
  }
  for (const [key, rows] of rowsOf) if (rows.size > 1) bad.push(`creditor_row:${key}`);
  // Between versions only recommendations may leave: every title, line, question, answer and appendix label stays.
  if (d.versions.length === 2) {
    // The decisions page lists the deliberations, whose ask is the recommendation when there is one; it is not a fact line.
    const facts = (x: (typeof d.versions)[number]) => [...x.pages.flatMap((pg) => [pg.title, ...pg.role === "decisions" ? [] : pg.lines]), ...x.questions.flatMap((q) => [q.question, q.answer]), ...x.appendix.map((a) => a.label)];
    const now = new Set(facts(d.versions[1]!));
    for (const f of facts(d.versions[0]!)) if (!now.has(f)) bad.push(`fact_left:${f.slice(0, 60)}`);
  }
  const missing = d.materialFacts.figures.filter((id) => {const x = d.identity.find((i) => i.figureId === id); return x !== undefined && !joined.includes(reformat(x));});
  // Policy and sensitivities, read in the text against the covenant and investment results the identity names: a
  // policy said to lack a definition has none recorded, and each cause of a sensitivity is the operand its case changes.
  const sourceOf = (method: string) => {const x = d.identity.find((i) => i.methodId === method); return x ? sources.find((s) => s.packet.fingerprint === x.packetFingerprint)?.packet : undefined;};
  const covenantPacket = sourceOf("measure-covenant-headroom"), investmentPacket = sourceOf("analyze-investment-project"), projectionPacket = sourceOf("build-operating-projection");
  for (const t of texts) {
    if (/definição de EBITDA|qual EBITDA mede/.test(t)) {
      const definition = (covenantPacket?.result as {definitions?: {limitId: string; definition: string | null}[]} | undefined)?.definitions?.find((x) => x.limitId === "politica");
      if (!definition || definition.definition !== null) bad.push(`policy_definition:${t.slice(0, 60)}`);
    }
    // Scenario definitions, by the oracle's own reading of the sources: a named scenario changes exactly what the sentence
    // names, active in the year it shows; a deferral has a later schedule. No sentence attributes a cause.
    if (/(?<![\p{L}])(?:leva|levam|reduzem|cai para|deixa|pesam|explica|por causa|devido)(?![\p{L}])/iu.test(t)) bad.push(`causal:${t.slice(0, 60)}`);
    const projection = (projectionPacket?.result as {projection?: {projection?: {base?: {periodId: string}[]; scenarios?: {id: string; basedOn: string; overriddenDrivers: string[];
      volumeGrowthRate: unknown; volumeFactor: unknown; inputCostShock: {fromPeriodId: string; rate: string} | null}[]}}; contributions?: {fieldPath: string; value: {value: unknown}}[]} | undefined);
    const scenarios = projection?.projection?.projection?.scenarios ?? [], periods = (projection?.projection?.projection?.base ?? []).map((x) => x.periodId);
    // The scenario's whole input object: every field recorded under it in the projection's contributions (origin tags aside).
    const recorded = (id: string) => (projection?.contributions ?? []).flatMap((x) => {const m = new RegExp(`\\.scenario\\.${id}\\.(.+)$`).exec(x.fieldPath); return m && !/\.origin$/.test(m[1]!) && m[1] !== "origin" ? [m[1]!] : [];}).sort().join(",");
    const defined = (id: string) => {const x = scenarios.find((y) => y.id === id); if (!x) return "missing";
      const fromResult = [...x.overriddenDrivers, ...x.volumeGrowthRate !== null ? ["volume"] : [], ...x.volumeFactor !== null ? ["volume"] : [], ...x.inputCostShock ? ["shock"] : []].sort().join(",");
      const whole = recorded(id);
      return fromResult === "shock" && whole === "shock.fromPeriodEnd,shock.passThroughLagMonths,shock.rate" ? "shock"
        : fromResult === "receivableDays" && whole === "override.receivableDays" ? "receivableDays" : `other:${fromResult}:${whole}`;};
    const year = /\b(20\d\d)\b/.exec(t.split("fica")[0]!.split("EBITDA").at(-1)! + " " + t)?.[1];
    if (/No cenário d[oa] (?:insumo|trigo|açúcar|farinha|embalagem) /.test(t)) {
      const x = scenarios.find((y) => y.id === "informado-trigo-4m"), shown = /EBITDA de (20\d\d)/.exec(t)?.[1];
      if (defined("informado-trigo-4m") !== "shock" || !x?.inputCostShock || !shown || x.inputCostShock.fromPeriodId > `${shown}-12-31`) bad.push(`scenario_wheat:${t.slice(0, 60)}`);
    }
    if (/prazo maior de recebimento/.test(t)) {
      const contributions = projection?.contributions ?? [];
      const own = (suffix: string) => contributions.find((x) => x.fieldPath.endsWith(suffix))?.value.value as string[] | undefined;
      const days = (id: string): string[] | undefined => id === "base" ? own(".base.receivableDays") : own(`.scenario.${id}.override.receivableDays`)
        ?? (() => {const parent = scenarios.find((x) => x.id === id)?.basedOn; return parent ? days(parent) : undefined;})();
      const shown = /capital de giro em (20\d\d)/.exec(t)?.[1], k = shown ? periods.indexOf(`${shown}-12-31`) : -1, parent = scenarios.find((x) => x.id === "prazo-60")?.basedOn;
      const mine = days("prazo-60"), theirs = parent ? days(parent) : undefined;
      if (defined("prazo-60") !== "receivableDays" || k < 0 || !mine || !theirs || !new D(mine[k]!).gt(theirs[k]!)) bad.push(`scenario_receivables:${t.slice(0, 60)}`);
    }
    // Project sensitivities: the inputs of each case against its reference differ exactly in the named operands.
    const cases = (investmentPacket as {cases?: {id: string; role: string; result: Record<string, unknown> & {inheritedScenario: string | null}}[]} | undefined)?.cases ?? [];
    // The oracle's own reading of a case's whole input object: every adopted contribution, leaf by leaf, without the
    // link ids and source anchors it lists itself; a field is changed when any of its leaves differs.
    const ignoredLeaf = /^(?:decisionId|slotKey|actorId|observationId|fieldPath|origin|\w*[Aa]nchor)$/;
    const inputLeaves = (r: Record<string, unknown> | undefined) => {
      const out = new Map<string, Map<string, string>>();
      for (const c of (r?.contributions as {fieldPath: string}[] | undefined) ?? []) {
        const field = c.fieldPath.replace(/^[^.]+\.[0-9a-f-]{36}\./, ""), leaves = new Map<string, string>();
        const walk = (v: unknown, p: string) => {if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${p}[${i}]`)); else if (v && typeof v === "object") Object.entries(v).forEach(([k, x]) => {if (!ignoredLeaf.test(k) && !(k === "scenario" && /dimensions$/i.test(p))) walk(x, `${p}.${k}`);}); else leaves.set(p, String(v));};
        walk(c, "");
        out.set(field, leaves);
      }
      return out;
    };
    const changedFields = (a: ReturnType<typeof inputLeaves>, b: ReturnType<typeof inputLeaves>) => [...new Set([...a.keys(), ...b.keys()])].filter((k) => {
      const x = a.get(k), y = b.get(k);
      return !x || !y || [...new Set([...x.keys(), ...y.keys()])].some((l) => x.get(l) !== y.get(l));
    }).sort().join(",");
    const changed = (id: string) => {
      const c = cases.find((x) => x.id === id), ref = cases.find((x) => x.id === (c?.result.inheritedScenario ?? "base"));
      return changedFields(inputLeaves(c?.result), inputLeaves(ref?.result));
    };
    if (/economia menor/.test(t) && changed("economy-4") !== "project.annualAvoidedOperatingCost,project.annualFixedOperatingCost,project.annualVariableOperatingCost") bad.push(`scenario_economy:${t.slice(0, 60)}`);
    if (/capex e depreciação maiores/.test(t) && changed("capex-120") !== "project.annualDepreciation,project.growthCapexPaid") bad.push(`scenario_capex:${t.slice(0, 60)}`);
    if (/partida mais lenta/.test(t) && changed("slower-start") !== "project.ramp.operationStartMonth") bad.push(`scenario_start:${t.slice(0, 60)}`);
    // A deferral named by its exact definition: the oracle's own uniform shift, written apart from the method's. Every
    // series of the horizon's length moves by k periods with its own neutral value before; dates of the project and the
    // company's final payments move by k periods; everything else is equal. No other leeway.
    if (/início de operação adiados e horizonte da análise estendido na mesma medida/.test(t)) {
      const neutral: Record<string, "zero" | "first" | "calendar" | "index"> = {periodEnds: "calendar", "valuation.adoptedTimes": "index", "company.closingDebtStock": "first",
        "project.cashTaxRate": "first", "project.lossTaxTreatment": "first", "project.fixedCostScaling": "first", "company.cashTaxRate": "first", "company.lossTaxTreatment": "first"};
      const flows = /^(project\.(annual\w+|growthCapexPaid|startup\.retainedCapitalMultipliers)|company\.(ebitda|nonCashEbitdaBridge|cashLeasePayments|netWorkingCapitalChange|maintenanceCapex|growthCapex|taxableBaseBeforeProject|netFinancingCashAvailable|netCapitalCashAvailable|netRestrictedCashMovement))$/;
      const moved = ["project.ramp.operationStartMonth", "company.finalPaymentDates"];
      const raw = (id: string) => new Map(((cases.find((x) => x.id === id)?.result.contributions as {fieldPath: string; value: {value: unknown}; dimensions: Record<string, unknown>}[] | undefined) ?? [])
        .map((c) => [c.fieldPath.replace(/^[^.]+\.[0-9a-f-]{36}\./, ""), c]));
      const a = raw("defer-12"), b = raw("base");
      const ends = (m: typeof a) => (m.get("periodEnds")?.value.value as string[] | undefined) ?? [];
      const month = (x: string) => Number(x.slice(0, 4)) * 12 + Number(x.slice(5, 7)) - 1;
      const plus = (x: string, months: number) => {const m = month(x) + months, y = Math.floor(m / 12), mo = m % 12 + 1, last = new Date(Date.UTC(y, mo, 0)).getUTCDate();
        const lastDay = Number(x.slice(8, 10)) === new Date(Date.UTC(Number(x.slice(0, 4)), Number(x.slice(5, 7)), 0)).getUTCDate();
        return `${y}-${String(mo).padStart(2, "0")}-${String(lastDay ? last : Math.min(Number(x.slice(8, 10)), last)).padStart(2, "0")}`;};
      const ea = ends(a), eb = ends(b), n = eb.length, k = ea.length - n, step = n > 1 ? month(eb[1]!) - month(eb[0]!) : 0;
      const strip = (c: Record<string, unknown>) => {const {fieldPath: _f, decisionId: _d, slotKey: _s, actorId: _a, observationId: _o, value: _v, dimensions, ...rest} = c;
        const {scenario: _sc, periodEnd: _pe, ...dims} = dimensions as Record<string, unknown>; return JSON.stringify({...Object.fromEntries(Object.entries(rest).filter(([key]) => !/anchor$/i.test(key) && key !== "origin")), dims});};
      let ok = k >= 1 && step > 0 && a.size === b.size;
      for (const [key, y] of b) {
        const x = a.get(key);
        if (!x || strip(x as unknown as Record<string, unknown>) !== strip(y as unknown as Record<string, unknown>)) {ok = false; break;}
        if (x.dimensions.periodEnd !== undefined && x.dimensions.periodEnd !== ea.at(-1)) {ok = false; break;}
        const xv = x.value.value, yv = y.value.value;
        if (Array.isArray(yv) && yv.length === n) {
          const rule = neutral[key] ?? (flows.test(key) ? "zero" : null);
          if (!rule || !Array.isArray(xv) || xv.length !== n + k) {ok = false; break;}
          const want = (t: number) => rule === "calendar" ? plus(eb[0]!, t * step) : rule === "index" ? String(t) : t >= k ? String(yv[t - k]) : rule === "zero" ? "0" : String(yv[0]);
          if (xv.some((v, t) => String(v) !== want(t)) || (rule === "calendar" && yv.some((v, t) => String(v) !== plus(eb[0]!, t * step))) || (rule === "index" && yv.some((v, t) => String(v) !== String(t)))) {ok = false; break;}
        } else if (moved.includes(key)) {
          const xs = Array.isArray(xv) ? xv : [xv], ys = Array.isArray(yv) ? yv : [yv];
          if (xs.length !== ys.length || xs.some((v, i) => String(v) !== plus(String(ys[i]), k * step))) {ok = false; break;}
        } else if (JSON.stringify(xv) !== JSON.stringify(yv)) {ok = false; break;}
      }
      if (!ok) bad.push(`deferral_uniform:${t.slice(0, 60)}`);
    }
    // A deferral named only by the role the analysis registers for it.
    if (/no caso que a análise registra como adiamento/.test(t) && cases.find((x) => x.id === "defer-12")?.role !== "deferral") bad.push(`deferral_role:${t.slice(0, 60)}`);
    // Deferrals: the first disbursement and the first operation strictly later than the reference's.
    const firstNonZero = (xs: string[] | undefined) => xs ? xs.findIndex((v) => !new D(v).eq(0)) : -1;
    if (/início de operação adiados/i.test(t)) {
      const rows = (id: string) => ((cases.find((x) => x.id === id)?.result.project as {rows?: {incrementalEbitda: string; operands: Record<string, string>}[]} | undefined)?.rows ?? []);
      const later = (f: (r: ReturnType<typeof rows>[number]) => string) => firstNonZero(rows("defer-12").map(f)) > firstNonZero(rows("base").map(f));
      if (!(later((r) => r.operands.growthCapexPaid!) && later((r) => r.operands.activeYearFraction!) && later((r) => r.incrementalEbitda))) bad.push(`scenario_deferral:${t.slice(0, 60)}`);
    }
    const planContributions = (sourceOf("evaluate-financing-paths")?.result as {contributions?: {fieldPath: string; value: {value: unknown}}[]} | undefined)?.contributions ?? [];
    const variant = (id: string, field: string) => planContributions.find((x) => x.fieldPath.endsWith(`.variant.${id}.${field}`))?.value.value;
    // Plan paths: the oracle's own reading of each instrument's terms (role, lender kind, schedule after the horizon,
    // final payment, amortization), never identifiers; its own table of each label's complete moves.
    const term = (suffix: string) => planContributions.find((x) => x.fieldPath.endsWith(suffix))?.value.value as string[] | string | undefined;
    const termsOf = (id: string) => (term(`.instrument.${id}.terms`) as string[] | undefined) ?? [];
    const existing = planContributions.flatMap((x) => {const m = /\.instrument\.([a-z0-9-]+)\.terms$/.exec(x.fieldPath); return m && (x.value.value as string[])[0] === "existing" ? [m[1]!] : [];});
    // The row of the creditor a text names, by the debt table's creditor field (the identifier only links that row to the plan).
    const named = texts.map((x) => /dívida com ([\p{L} .&'-]+?)(?:[;,.]| alongada)/u.exec(x)?.[1]).find((x) => x && x !== "credor sem nome confirmado");
    const debtRows = ((sourceOf("build-company-debt-table") as {result?: {table?: {rows?: {id: string; creditor: string}[]}}} | undefined)?.result?.table?.rows ?? []).filter((r) => r.creditor === named);
    const creditorRow = debtRows.length === 1 ? debtRows[0]!.id : "\u0000";
    const describe = (id: string) => {const [role, lender, , , , , , , after] = termsOf(id);
      return role === "amended" ? "aditamento" : lender === "capital_markets" ? (role === "existing" ? "debenture atual" : "debenture nova") : lender === "development_bank" ? "fomento"
        : lender === "bank" ? (role === "existing" ? (id === creditorRow ? "credor" : "banco") : after === "scheduled" ? "banco programado" : after === "none" || after === "seasonal_release" ? "banco curto" : "banco outro") : "outro";};
    const pathMoves = (id: string) => {
      const ids = (term(`.path.${id}.instruments`) as string[] | undefined) ?? [];
      return {added: [...new Set(ids.filter((x) => !existing.includes(x)).map(describe))].sort().join(","), removed: existing.filter((x) => !ids.includes(x)).map(describe).sort().join(","),
        prepaid: ((term(`.path.${id}.prepayments`) as string[] | undefined) ?? []).map((x) => describe(x.split("|")[0]!)).sort().join(","),
        charges: ((term(`.path.${id}.chargeSlots`) as string[] | undefined) ?? []).map((x) => `${x.split("|")[0]} ${describe(x.split("|")[1]!)}`).sort().join(","),
        variant: ((term(`.path.${id}.terms`) as string[] | undefined) ?? [])[1]};
    };
    const expected: Record<string, [string, ReturnType<typeof pathMoves>]> = {
      "Caminho A:": ["sem-linha-debenture", {added: "banco curto,debenture nova", removed: "", prepaid: "credor,debenture atual", charges: "", variant: "sem-linha"}],
      "Caminho B:": ["adiar-linha", {added: "banco curto", removed: "", prepaid: "", charges: "", variant: "adiar-12"}],
      "Caminho C:": ["debenture-com-linha", {added: "banco curto,debenture nova,fomento", removed: "", prepaid: "credor,debenture atual", charges: "", variant: "seguir"}],
      "Caminho D:": ["manter", {added: "", removed: "", prepaid: "", charges: "", variant: "seguir"}],
      "Caminho E:": ["ccb-tres-anos", {added: "banco programado", removed: "", prepaid: "", charges: "", variant: "seguir"}],
      "Caminho F:": ["alongar-com-banco", {added: "banco curto,banco programado,fomento", removed: "", prepaid: "credor", charges: "waiver debenture atual", variant: "seguir"}],
      "Caminho G:": ["alongar-bradesco", {added: "aditamento,banco curto,fomento", removed: "credor", prepaid: "", charges: "", variant: "seguir"}],
    };
    for (const [label, [id, want]] of Object.entries(expected)) if (t.startsWith(`${label} `) && !/caixa mínimo/.test(t) && JSON.stringify(pathMoves(id)) !== JSON.stringify(want)) bad.push(`path_moves:${label}`);
    if (/mantida a dívida como está/.test(t) && JSON.stringify(pathMoves("manter")) !== JSON.stringify(expected["Caminho D:"]![1])) bad.push(`path_kept:${t.slice(0, 60)}`);
    // "De curto prazo" for bank credit, the oracle's own reading: the path the sentence names; each of its new bank
    // instruments without a scheduled amortization after the horizon runs, from the start of its first draw period to
    // its final payment, at most twelve months by the dates, and its registered termYears agrees with the dates.
    if (/crédito bancário de curto prazo/.test(t)) {
      const plan = sourceOf("evaluate-financing-paths") as {readings?: {alternative?: {pathId?: string}}; result?: {evaluation?: {openingDate: string; periodEnds: string[];
        instrumentCosts: {instrumentId: string; termYears?: string; finalPaymentDate?: string}[]}}} | undefined;
      const allPaths = planContributions.flatMap((x) => {const m = /\.path\.([a-z0-9-]+)\.instruments$/.exec(x.fieldPath); return m ? [m[1]!] : [];});
      const label = Object.keys(expected).find((l) => t.startsWith(`${l} `));
      const named = label ? [expected[label]![0]] : /^Plano alternativo:/.test(t) ? [plan?.readings?.alternative?.pathId ?? ""]
        : /^No caminho sem .*alongada por aditamento/.test(t) ? allPaths.filter((id) => ((term(`.path.${id}.instruments`) as string[]) ?? []).some((x) => termsOf(x)[0] === "amended")
          && variant(((term(`.path.${id}.terms`) as string[] | undefined) ?? [])[1] ?? "", "kind") === "none") : [];
      const ev = plan?.result?.evaluation;
      const monthIndex = (iso: string) => Number(iso.slice(0, 4)) * 12 + Number(iso.slice(5, 7));
      const months = named.length === 1 && ev ? ((term(`.path.${named[0]}.instruments`) as string[] | undefined) ?? []).filter((x) => {const [role, lender, , , , , , , after] = termsOf(x);
        return role === "new" && lender === "bank" && (after === "none" || after === "seasonal_release");}).map((x) => {
        const draws = (term(`.instrument.${x}.draws`) as string[] | undefined) ?? [], k = draws.findIndex((v) => new D(v).gt(0));
        const cost = ev.instrumentCosts.find((c) => c.instrumentId === x);
        if (k < 0 || !cost?.finalPaymentDate || !cost.termYears) return null;
        // Draw at the start of its period: the month after the previous period end (or after the opening date).
        const start = monthIndex(k === 0 ? ev.openingDate : ev.periodEnds[k - 1]!) + 1, byDates = monthIndex(cost.finalPaymentDate) - start + 1;
        return {byDates, registered: new D(cost.termYears).times(12)};
      }) : [];
      if (!months.length || months.some((m) => m === null || !m.registered.eq(m.byDates) || m.byDates > 12)) bad.push(`bank_term:${t.slice(0, 60)}`);
    }
    // An extension: the amended instrument pays finally later and repays no more principal than the original in any period.
    if (/alongada por aditamento/.test(t)) {
      const amended = planContributions.find((x) => x.fieldPath.endsWith(".replaces") && x.value.value === creditorRow)?.fieldPath.match(/\.instrument\.([a-z0-9-]+)\.replaces$/)?.[1];
      const late = amended ? term(`.instrument.${amended}.finalPaymentDate`) as string : undefined, before = term(`.instrument.${creditorRow}.finalPaymentDate`) as string | undefined;
      const a = amended ? (term(`.instrument.${amended}.amortization`) as string[]) : [], o = (term(`.instrument.${creditorRow}.amortization`) as string[] | undefined) ?? [];
      const repaid = (xs: string[]) => xs.reduce((sum, v) => sum.plus(v), new D(0));
      if (!late || !before || !(late > before) || !repaid(a).lt(repaid(o))) bad.push(`path_extension:${t.slice(0, 60)}`);
    }
    // A plan deferral: every recorded component of the variant starts later than the reference variant's.
    // A plan deferral, the oracle's own reading: the path's variant is the reference variant moved by k periods, every
    // recorded component the same values later (zeros before, the tail past the horizon out), every other field equal.
    if (/adiamento d[oa] /i.test(t)) {
      const pathVariant = (id: string) => ((term(`.path.${id}.terms`) as string[] | undefined) ?? [])[1];
      const fields = (id: string | undefined) => new Map(planContributions.filter((x) => id && x.fieldPath.includes(`.variant.${id}.`)).map((x) => [x.fieldPath.split(`.variant.${id}.`)[1]!, x.value.value]));
      const a = fields(pathVariant("adiar-linha")), b = fields(pathVariant("manter"));
      const lists = [...b.entries()].filter(([, v]) => Array.isArray(v)) as [string, string[]][];
      const n = lists[0]?.[1].length ?? 0;
      const shifted = (k: number) => lists.every(([f, y]) => {const x = a.get(f) as string[] | undefined; return !!x && x.length === n && x.every((v, i) => new D(v).eq(i >= k ? y[i - k]! : "0"));});
      const others = [...new Set([...a.keys(), ...b.keys()])].every((f) => f === "label" || Array.isArray(b.get(f)) || JSON.stringify(a.get(f)) === JSON.stringify(b.get(f)));
      if (!(a.size === b.size && others && Array.from({length: Math.max(0, n - 1)}, (_, i) => i + 1).some(shifted))) bad.push(`scenario_plan_deferral:${t.slice(0, 60)}`);
    }
    // A plan variant described by its components only: each component starts strictly later than the reference's.
    if (/outra variante d[oa] .*começando depois/.test(t) && !["growthCapex", "ebitda", "depreciation", "maintenanceCapex", "startupWorkingCapitalCashFlow"]
      .every((f) => firstNonZero(variant("adiar-12", f) as string[]) > firstNonZero(variant("seguir", f) as string[]))) bad.push(`plan_components:${t.slice(0, 60)}`);
    // A flow is never read as a balance: a working-capital amount above a reference is said of its variation.
    if (/capital de giro/.test(t) && /acima/.test(t) && !/variação do capital de giro/.test(t)) bad.push(`nature:${t.slice(0, 60)}`);
    if (/sem a linha da safra/i.test(t)) bad.push(`scenario_weekly_line:${t.slice(0, 60)}`);
    void year;
  }
  // Exposure, capacity and contract, read in the text and against the receivables result the identity names: the
  // balance the chain owes is the exposure, the program's volume is a capacity, and a ban on assignment needs the
  // registered contract to say so.
  const rfIdentity = d.identity.find((x) => x.methodId === receivablesMethod);
  if (rfIdentity) {
    const source = sources.find((x) => x.packet.fingerprint === rfIdentity.packetFingerprint);
    if (!source) bad.push("receivables_source_unknown");
    else {
      const number = (x: string) => new D(x.replace(/\./g, "").replace(",", "."));
      for (const t of texts) {
        // A debtor is named only when the source registers that debtor's key; then its balance, program and contract are its own.
        for (const name of Object.keys(debtorKeys)) if (new RegExp(`(?<![\\p{L}])${name}(?![\\p{L}])`, "u").test(t) && !receivablesFacts(source.packet, name)) bad.push(`debtor:${name}`);
        const owes = /A carteira tem R\$ (-?[\d.,]+) milh\S* de (rede [AB]),/.exec(t);
        if (!owes) continue;
        const facts = receivablesFacts(source.packet, owes[2]!);
        if (!facts || !number(owes[1]!).eq(new D(facts.balance).toDecimalPlaces(1))) bad.push(`exposure:${t.slice(0, 60)}`);
        const program = /programa próprio dele antecipa R\$ (-?[\d.,]+) milh/.exec(t);
        if (program && (!facts || facts.own === null || !number(program[1]!).eq(new D(facts.own).toDecimalPlaces(1)))) bad.push(`capacity:${t.slice(0, 60)}`);
        const shared = /programa de antecipação aceita R\$ (-?[\d.,]+) milh/.exec(t);
        if (shared && (!facts || !facts.shared.some((x) => number(shared[1]!).eq(new D(x).toDecimalPlaces(1))))) bad.push(`capacity_shared:${t.slice(0, 60)}`);
        if (/veda a cessão/.test(t) && facts?.contract !== "prohibited_without_consent") bad.push(`contract:${t.slice(0, 60)}`);
      }
    }
  }
  // Species, the oracle's own reading: a capital-markets instrument is called by its species only when its registered
  // label is the species or one of the labels the oracle itself lists for it.
  const speciesLabels: Record<string, string[]> = {"debênture": ["debênture", "debênture 2021", "debênture da 2ª emissão, r$ 90 mi", "debênture da 2ª emissão, r$ 80 mi"], "nota comercial": ["nota comercial"]};
  const planSpecies = (() => {
    const fp = sources.find((x) => x.packet.fingerprint === d.identity.find((i) => i.methodId === "evaluate-financing-paths")?.packetFingerprint)?.packet as
      {readings?: {recommendation?: {longInstrument?: {id?: string}}}; result?: {contributions?: {fieldPath: string; value: {value: unknown}}[]}} | undefined;
    const cs = fp?.result?.contributions ?? [], label = (id: string | undefined) => cs.find((x) => id && x.fieldPath.endsWith(`.instrument.${id}.label`))?.value.value as string | undefined;
    const existing = cs.flatMap((x) => {const m = /\.instrument\.([a-z0-9-]+)\.terms$/.exec(x.fieldPath); const v = x.value.value as string[]; return m && v[0] === "existing" && v[1] === "capital_markets" ? [m[1]!] : [];});
    const speciesOf = (l: string | undefined) => l === undefined ? null : Object.entries(speciesLabels).find(([, ls]) => ls.includes(l.toLowerCase()))?.[0] ?? null;
    return {long: speciesOf(label(fp?.readings?.recommendation?.longInstrument?.id)), existing: existing.length === 1 ? speciesOf(label(existing[0])) : null};
  })();
  for (const t of texts) {
    const longSays = /sond(ar|agem de) (uma )?(debênture|nota comercial)|(Demanda|sondagem|investidores) d[a] (debênture|nota comercial)/.exec(t);
    if (longSays && planSpecies.long !== (longSays[3] ?? longSays[5])) bad.push(`species_long:${t.slice(0, 60)}`);
    const existingSays = /(debênture|nota comercial) atual|debenturistas|waiver da (debênture|nota comercial)/.exec(t);
    if (existingSays && planSpecies.existing !== (existingSays[0] === "debenturistas" ? "debênture" : existingSays[1] ?? existingSays[2])) bad.push(`species_existing:${t.slice(0, 60)}`);
  }
  // The oracle's own resolution of each reading to the field it reaches (selectors replaced by the selected index): two
  // readings of one field never carry two presentations, whatever the selector text.
  {
    const resolve = (root: unknown, path: string) => {
      let node: unknown = root; const out: string[] = [];
      for (const raw of path.split(/\.(?![^[]*\])/)) {
        const name = raw.replace(/\[.*$/, ""); node = (node as Record<string, unknown> | undefined)?.[name]; let part = name;
        for (const sel of raw.match(/\[[^\]]+\]/g) ?? []) {
          const body = sel.slice(1, -1), xs = node as Record<string, unknown>[];
          if (!Array.isArray(xs)) return null;
          const i = /^\d+$/.test(body) ? Number(body) : (() => {const hits = xs.flatMap((x, k) => body.split("&").every((c) => String(x?.[c.split("=")[0]!]) === c.slice(c.indexOf("=") + 1)) ? [k] : []); return hits.length === 1 ? hits[0]! : -1;})();
          if (i < 0) return null; node = xs[i]; part += `[${i}]`;
        }
        out.push(part);
      }
      return out.join(".");
    };
    const byField = new Map<string, Set<string>>();
    for (const x of d.identity) {
      const packet = sources.find((y) => y.packet.fingerprint === x.packetFingerprint)?.packet;
      const field = packet ? resolve(packet, x.path) : null;
      if (!field) continue;
      const key = `${x.packetFingerprint}|${field}`, set = byField.get(key) ?? new Set<string>(); set.add(`${x.presentation}`); byField.set(key, set);
    }
    for (const [key, set] of byField) if (set.size > 1) bad.push(`presentation_conflict:${key.split("|")[1]}`);
  }
  // Audit after r33, the oracle's own reading of the whole plan and of the cost coverage: "sem dívida bancária nova" and
  // "com a linha bancária só como reserva" hold over every step; "os programas" means exactly two program steps; a
  // "ganho líquido" without qualification needs complete cost coverage; the alternative plan said presented is shown.
  {
    const rfPacket = sources.find((x) => x.packet.fingerprint === d.identity.find((i) => i.methodId === "monetize-receivables-for-working-capital")?.packetFingerprint)?.packet as
      {result?: {funding?: {plan?: {steps?: {optionId: string}[]}; options?: {id: string; kind: string}[]}}} | undefined;
    const steps = rfPacket?.result?.funding?.plan?.steps ?? [], kindOf = (id: string) => rfPacket?.result?.funding?.options?.find((o) => o.id === id)?.kind;
    if (texts.some((t) => /sem dívida bancária nova|linha bancária só como reserva/.test(t)) && steps.some((x) => ["bank_discount", "bank_line"].includes(kindOf(x.optionId) ?? ""))) bad.push("plan_bank_step");
    if (texts.some((t) => /Os programas dos clientes antecipam|Custo indicativo dos programas/.test(t)) && steps.filter((x) => kindOf(x.optionId) === "anchor_program").length !== 2) bad.push("plan_program_count");
    const rcPacket = sources.find((x) => x.packet.fingerprint === d.identity.find((i) => i.methodId === "analyze-relative-debt-cost")?.packetFingerprint)?.packet as
      {levers?: {role: string; actionId: string}[]; result?: {actions?: {actionId: string; result: {operands: {costCoverage: string}}}[]}} | undefined;
    const coverage = (rcPacket?.levers ?? []).filter((l) => l.role === "rating").map((l) => rcPacket?.result?.actions?.find((a) => a.actionId === l.actionId)?.result.operands.costCoverage);
    if (texts.some((t) => /o ganho líquido fica entre/.test(t)) && coverage.some((c) => c !== "complete_for_stated_horizon")) bad.push("rating_coverage");
    if (texts.some((t) => /plano alternativo apresentado no material/.test(t)) && !texts.some((t) => /^Plano alternativo:/.test(t))) bad.push("alternative_not_presented");
  }
  // Period of a projected flow, against the source's own dates: the row shown for a year covers exactly that year; and
  // every page holds only templates of its own role.
  {
    const op = sources.find((x) => x.packet.fingerprint === d.identity.find((i) => i.methodId === "build-operating-projection")?.packetFingerprint)?.packet as
      {result?: {projection?: {projection?: {base?: {periodId: string; startDate: string; endDate: string}[]; scenarios?: {id: string; rows: {periodId: string; startDate: string; endDate: string}[]}[]}}}} | undefined;
    for (const x of d.identity.filter((i) => /^readings\.projected\.scenarios\[id=[^\]]+\]\.rows\[periodId=/.test(i.path))) {
      const m = /scenarios\[id=([^\]&]+)\]\.rows\[periodId=([^\]&]+)\]/.exec(x.path)!, rows = m[1] === "base" ? op?.result?.projection?.projection?.base : op?.result?.projection?.projection?.scenarios?.find((y) => y.id === m[1])?.rows;
      const row = rows?.find((r) => r.periodId === m[2]), year = m[2]!.slice(0, 4);
      if (!row || row.startDate !== `${year}-01-01` || row.endDate !== `${year}-12-31`) bad.push(`flow_period:${x.figureId}`);
    }
    const family: Record<string, string> = {decisions: "page.", situation: "situation.", constraint: "constraint.", topic: "topic.", alternatives: "alternatives.", recommendation: "recommendation.", risk: "risk.", what_changes: "what_changes.", next_steps: "next_steps."};
    for (const page of v.pages) for (const b of v.bindings.filter((x) => x.field.startsWith(`page.${page.id}.`) && !x.field.includes(".option.")))
      if (!b.templateId.startsWith(family[page.role] ?? "")) bad.push(`page_role:${page.id}:${b.templateId}`);
  }
  // Coherence across fields: a text that puts every measurement below the policy holds for every measurement shown
  // anywhere in the material, at its one presentation.
  for (const t of texts) {
    const below = /abaixo d(?:a política de|e) (-?[\d.,]+)x nos cenários avaliados/.exec(t);
    if (!below) continue;
    const limit = new D(below[1]!.replace(/\./g, "").replace(",", "."));
    // Every member of the global claim, read or not: shown members by their one presentation, the others by their exact value.
    const covenantPacket = sources.find((x) => x.packet.fingerprint === d.identity.find((i) => i.methodId === "measure-covenant-headroom")?.packetFingerprint)?.packet as
      {result?: {headroom?: {measurements?: {id: string; ratio: string | null}[]}}} | undefined;
    for (const m of covenantPacket?.result?.headroom?.measurements ?? []) {
      if (m.ratio === null) continue;
      const shown = d.identity.find((i) => i.path === `result.headroom.measurements[id=${m.id}].ratio`);
      const value = shown ? new D(/-?[\d.]+(?:,\d+)?/.exec(shown.display)![0].replace(/\./g, "").replace(",", ".")) : new D(m.ratio);
      if (!value.lt(limit)) bad.push(`order_across_fields:${shown?.figureId ?? m.id}`);
    }
  }
  // A shorter profile ends earlier: the last effective payment of the tested profile comes before the adopted one's, by
  // the years of the two schedules, and the tested schedule shows its end.
  const fpSource = sources.find((x) => x.packet.fingerprint === d.identity.find((i) => i.methodId === "evaluate-financing-paths")?.packetFingerprint)?.packet as
    {readings?: {recommendation?: {pathId?: string}}; result?: {evaluation?: {paths?: {id: string; amortizationTests?: {profileId: string; years: {year: number; scheduledAmortization: string}[]}[]}[]}}} | undefined;
  for (const t of texts.filter((x) => /perfil de amortização mais curto testado/.test(x))) {
    const tests = fpSource?.result?.evaluation?.paths?.find((p) => p.id === fpSource.readings?.recommendation?.pathId)?.amortizationTests ?? [];
    const last = (id: string) => {const ys = tests.find((x) => x.profileId === id)?.years ?? []; const paid = ys.filter((y) => !new D(y.scheduledAmortization).eq(0)); return {last: paid.at(-1)?.year, listed: ys.at(-1)?.year};};
    const tested = last("cinco-anos"), adopted = last("adopted");
    if (!(tested.last !== undefined && adopted.last !== undefined && tested.last < adopted.last && tested.last < tested.listed!)) bad.push(`term_last_payment:${t.slice(0, 60)}`);
  }
  // Roles by the registered record, the oracle's own reading: a measurement shown is a registered test; "pela definição
  // da escritura" is a base test of the contractual limit in force whose definition is registered; "pelo EBITDA gerencial"
  // registers no adjustment; a base path is of the base scenario; "no adverso" of the adverse scenario.
  {
    const cv = sources.find((x) => x.packet.fingerprint === d.identity.find((i) => i.methodId === "measure-covenant-headroom")?.packetFingerprint)?.packet as
      {result?: {headroom?: {limits?: {id: string; kind: string; status: string}[]; measurements?: {id: string; role: string; scenario: string; adjustments: unknown[]; tests: {limitId: string; kind: string}[]}[]}; definitions?: {limitId: string; definition: string | null}[]}} | undefined;
    const record = (figureId: string | undefined) => {const x = d.identity.find((i) => i.figureId === figureId); const id = x ? /measurements\[id=([^\]&]+)/.exec(x.path)?.[1] : undefined; return cv?.result?.headroom?.measurements?.find((m) => m.id === id);};
    for (const b of v.bindings) {
      const m = record(b.figureId ?? undefined);
      if (!m) continue;
      if (m.role !== "test") bad.push(`role_contrast_shown:${b.field}:${b.slot}`);
      if (b.templateId === "risk.policy_readings" && b.slot === "escritura") {
        const t = m.tests.find((x) => x.kind === "contractual"), limit = cv?.result?.headroom?.limits?.find((l) => l.id === t?.limitId);
        const definition = cv?.result?.definitions?.find((x) => x.limitId === t?.limitId)?.definition;
        if (m.scenario !== "base" || !limit || limit.status !== "in_force" || !definition) bad.push(`role_contractual:${b.field}`);
      }
      if (b.templateId === "risk.policy_readings" && b.slot === "gerencial" && m.adjustments.length) bad.push(`role_managerial:${b.field}`);
      if ((b.templateId === "risk.leverage_path" || b.templateId === "summary.closing.leverage") && m.scenario !== "base") bad.push(`role_base:${b.field}:${b.slot}`);
      if (["risk.leverage", "risk.leverage_adverse", "a.wheat"].includes(b.templateId) && ["adverso", "alavancagem", "ebitda_adverso"].includes(b.slot) && m.scenario !== "adverse") bad.push(`role_adverse:${b.field}:${b.slot}`);
    }
    // Compliance with a limit: the measurement shown against a limit is a registered test of that very limit, not breached,
    // and no test of that limit at the same date and scenario is registered as breached.
    type T = {limitId: string; breached: boolean};
    const all = (cv?.result?.headroom?.measurements ?? []) as unknown as {id: string; role: string; date: string; scenario: string; tests: T[]}[];
    for (const [templateId, slot, limitSlot] of [["a.wheat", "alavancagem", "covenant"], ["risk.leverage", "adverso", "politica"], ["risk.leverage_adverse", "adverso", "politica"], ["summary.closing.leverage", "alavancagem", "politica"]] as const) {
      for (const b of v.bindings.filter((x) => x.templateId === templateId && x.slot === slot)) {
        const limitBinding = v.bindings.find((x) => x.field === b.field && x.templateId === templateId && x.slot === limitSlot);
        const limitId = /limits\[id=([^\]]+)\]/.exec(d.identity.find((i) => i.figureId === limitBinding?.figureId)?.path ?? "")?.[1];
        const m = all.find((x) => x.id === /measurements\[id=([^\]&]+)/.exec(d.identity.find((i) => i.figureId === b.figureId)?.path ?? "")?.[1]);
        const own = m?.tests.find((x) => x.limitId === limitId);
        if (!m || !own || own.breached || all.some((x) => x.role === "test" && x.date === m.date && x.scenario === m.scenario && x.tests.some((y) => y.limitId === limitId && y.breached)))
          bad.push(`compliance:${b.field}:${slot}`);
      }
    }
    if (texts.some((t) => /nos cenários avaliados/.test(t)) && all.some((x) => x.role === "test" && x.tests.some((y) => y.limitId === "politica" && y.breached))) bad.push("compliance:global");
  }
  // Orders as shown: a text that says one shown figure is above or below another says so of the numbers as shown.
  for (const t of texts) {
    const num = (x: string) => new D(x.replace(/\./g, "").replace(",", "."));
    const policy = /chega a (-?[\d.,]+)x no adverso de \d{4}, abaixo da política de (-?[\d.,]+)x/.exec(t);
    if (policy && !num(policy[1]!).lt(num(policy[2]!))) bad.push(`order_as_shown:${t.slice(0, 60)}`);
    const negative = /^O VPL fica negativo em cada sensibilidade: (.*)$/.exec(t);
    if (negative && [...negative[1]!.matchAll(/R\$ (-?[\d.,]+) milh/g)].some((m) => !num(m[1]!).lt(0))) bad.push(`sign_as_shown:${t.slice(0, 60)}`);
    const covenantBelow = /alavancagem fica em (-?[\d.,]+)x, abaixo do covenant de (-?[\d.,]+)x/.exec(t);
    if (covenantBelow && !num(covenantBelow[1]!).lt(num(covenantBelow[2]!))) bad.push(`order_as_shown:${t.slice(0, 60)}`);
    const above = /rende (-?[\d.,]+)% ao ano, acima do custo de capital de (-?[\d.,]+)%/.exec(t) ?? /retorno de (-?[\d.,]+)% ao ano fica acima do custo de capital de (-?[\d.,]+)%/.exec(t);
    if (above && !num(above[1]!).gt(num(above[2]!))) bad.push(`order_as_shown:${t.slice(0, 60)}`);
  }
  // Credit lines: the debt table records no modality nor purpose, so no text may present a line as a working-capital or
  // overdraft line; the generic line names the creditor the table registers for it.
  const lines = ((sourceOf("build-company-debt-table") as {result?: {table?: {creditLines?: {creditor: string; unused: string}[]}}} | undefined)?.result?.table?.creditLines ?? []);
  for (const t of texts) {
    if (/conta garantida/i.test(t)) bad.push(`credit_line_modality:${t.slice(0, 60)}`);
    const shown = /^Linha de crédito registrada com ([^,]+), com limite livre de R\$ (-?[\d.,]+) milh/.exec(t);
    if (shown && !lines.some((l) => l.creditor === shown[1] && new D(l.unused).eq(new D(shown[2]!.replace(",", "."))))) bad.push(`credit_line:${t.slice(0, 60)}`);
  }
  // Informed reasons: the oracle's own dictionary of reviewed phrases; the shown words are the phrase of the adopted code,
  // or the generic words with a gap; the fact itself never carries text.
  const reasons: Record<string, string> = {reduce_single_supplier_dependence: "reduzir a dependência de um único fornecedor do insumo principal", diversify_suppliers: "diversificar fornecedores",
    own_capacity: "ganhar capacidade própria de produção", reduce_operational_risk: "reduzir risco operacional", serve_customer_contract: "atender contrato de cliente"};
  for (const t of texts) {
    const said = /^Motivo apresentado pelo presidente do conselho: (.*)\.$/.exec(t)?.[1];
    if (said === undefined) continue;
    const fact = d.informed[0], want = fact ? reasons[fact.code] : undefined;
    if (want ? said !== want : !(said === "a confirmar" && d.gaps.some((g) => g.reason === "informed_reason_not_in_dictionary"))) bad.push(`informed:${said.slice(0, 40)}`);
  }
  // A decomposition without causal attribution keeps its remainder: the text shows the source's unexplained points and attributes nothing.
  const relative = sourceOf("analyze-relative-debt-cost") as {result?: {bridge?: {causalAttribution?: boolean; unexplainedAfterKnownAdjustmentsBps?: string}}} | undefined;
  const bridge = relative?.result?.bridge;
  for (const t of texts) if (/^Da diferença de/.test(t) && bridge && bridge.causalAttribution === false) {
    if (/vêm d|se divide|explicad[oa]s? por|deve-se|por causa/i.test(t) || !t.includes(`${bridge.unexplainedAfterKnownAdjustmentsBps} pontos ficam sem explicação`)) bad.push(`decomposition:${t.slice(0, 60)}`);
  }
  return {bad, missing};
}

describe("board discussion properties (fixed seed)", {timeout: 900000}, () => {
  it("no text field accepts prose: a number, a sign, a fraction or a unit written by a contribution is refused in every field", () => {
    let probe: CaseData | null = null;
    boardPacketInput(2, (c) => {probe = structuredClone(c);});
    const names = textFields(probe!).map(([name]) => name);
    const r = random(4720);
    for (const name of names) {
      const add = pick(r, attacks);
      expect(() => packet(2, (c) => {const f = textFields(c).find(([n]) => n === name)!; f[1](`${f[2]}${add}`);}), name).toThrow(refusal);
    }
    expect(names.length).toBeGreaterThan(80);
  });
  it("regression r1 to r6: every attack in every displayed field family is refused through the full path", () => {
    let refused = 0;
    for (const [family, set] of families) for (const add of attacks) {
      expect(() => full(2, (c) => set(c, add)), `${family} ${add}`).toThrow(refusal);
      refused++;
    }
    expect(refused).toBe(11 * attacks.length);
  });
  it("refuses an unknown template, a missing, extra or repeated slot and a reading of the wrong kind in a slot", () => {
    for (const [name, edit] of [
      ["unknown-template", (c: CaseData) => {c.pages[1]!.title = "situation.debt_total_with_minus|total=divida-total|ano=year-2027";}],
      ["missing-slot", (c: CaseData) => {c.pages[1]!.title = "situation.debt_total|total=divida-total";}],
      ["extra-slot", (c: CaseData) => {c.pages[1]!.title = "situation.debt_total|total=divida-total|ano=year-2027|sinal=irr";}],
      ["repeated-slot", (c: CaseData) => {c.pages[1]!.title = "situation.debt_total|total=divida-total|total=basket|ano=year-2027";}],
      ["years-in-a-months-slot", (c: CaseData) => {c.pages[11]!.lines[1] = "what_changes.wheat|choque=wheat-shock|defasagem=wal|ano=year-2027|ebitda=ebitda-wheat|insumo=wheat-label";}],
      ["rate-in-a-money-slot", (c: CaseData) => {c.pages[1]!.title = "situation.debt_total|total=irr|ano=year-2027";}],
      ["value-in-a-date-slot", (c: CaseData) => {c.pages[1]!.title = "situation.debt_total|total=divida-total|ano=divida-total";}],
      ["reading-in-a-deadline-slot", (c: CaseData) => {c.pages[12]!.lines[0] = "next_steps.notice|prazo=tight-week|projeto=project-label";}],
      ["deadline-in-a-value-slot", (c: CaseData) => {c.pages[1]!.title = "situation.debt_total|total=deadline:linha.aviso|ano=year-2027";}],
      ["prose-in-a-binding", (c: CaseData) => {c.pages[1]!.title = "situation.debt_total|total=menos divida-total|ano=year-2027";}],
    ] as const) expect(() => full(2, edit), name).toThrow(refusal);
  });
  it("keeps every material fact in the current version under any sequence of omission requests", () => {
    const r = random(4721);
    let probe: CaseData | null = null;
    boardPacketInput(3, (c) => {probe = structuredClone(c);});
    const pages = probe!.pages.map((p) => p.id), figures = [...Object.keys(auroraBoardReadings), "stages-npv"];
    const deadlines = probe!.deliberations.flatMap((d) => d.deadlines.map((t) => `${d.id}.${t.id}`));
    for (let run = 0; run < 24; run++) {
      const omissions = Array.from({length: 1 + Math.floor(r() * 4)}, (_, i) => {
        const target = pick(r, ["recommendation", "page", "figure", "figure", "deadline"] as const);
        const targetId = target === "figure" ? pick(r, figures) : target === "deadline" ? pick(r, deadlines) : pick(r, pages);
        return {id: `pedido-${i}`, target, targetId, requestedBy: "requester.chair"};
      });
      const p = packet(3, (c) => {c.omissions = omissions;});
      const s = shown(p);
      expect(p.result.discussion!.materialFacts.figures.filter((id) => !s.has(id)), JSON.stringify(omissions)).toEqual([]);
      expect(p.readings!.material!.materialFactsShown).toBe(true);
      expect(oracle(p)).toEqual({bad: [], missing: []});
    }
  });
  it("regression r1 and r2: transformations never take a material fact out of the current version", () => {
    const date = packet(2, (c) => {c.omissions = [{id: "sem-mes", target: "figure", targetId: "peak-date", requestedBy: "requester.cfo"}];});
    expect(date.readings!.omissions[0]).toMatchObject({outcome: "refused", keptFigureIds: []});
    const recommendation = packet(3, (c) => {
      const line = c.pages.find((x) => x.id === "linha")!;
      line.options = line.options.slice(0, 2);
    });
    expect(recommendation.readings!.omissions[0]).toMatchObject({outcome: "refused", keptFigureIds: ["npv-defer", "irr-defer"]});
    expect(() => packet(2, (c) => {c.pages.find((x) => x.id === "linha")!.lines[1] = "topic.project_value|retorno=irr|custo=wacc|vpl=npv";})).toThrow("board_capital_material_fact_not_shown:payback");
    // A page line can no longer stand in for a deliberation's subject, so the hidden subject cannot be built.
    expect(() => packet(2, (c) => {c.deliberations[0]!.subject = "topic.project_payback|payback=payback|pico=peak-need|data=peak-date";})).toThrow("board_capital_template_use_invalid");
  });
  it("regression r3 and r4: a contribution cannot choose the unit, the scale, the periodicity or a date format of a field", () => {
    const tries: [string, string[]][] = [
      ["principal-as-label", ["tabela-divida", "result.table.reconciliation.principal", "-"]],
      ["npv-as-label", ["linha-embalagem", "comparison.metrics[caseId=base].netPresentValue", "-"]],
      ["wal-as-date", ["tabela-divida", "result.table.profile.weightedAverageLifeYears", "day_month", "2026-12-31"]],
      ["debt-scaled-by-a-thousand", ["tabela-divida", "result.table.reconciliation.principal", "0", "130000"]],
      ["unregistered-field", ["linha-embalagem", "comparison.metrics[caseId=base].irrMinusDiscountRate", "2", "0.8"]],
      ["case-label-no-longer-a-label", ["linha-embalagem", "cases[id=defer-12].label", "-"]],
      ["year-from-a-value-field", ["tabela-divida", "result.table.reconciliation.principal", "year", "130"]],
      ["too-many-decimals", ["tabela-divida", "result.table.reconciliation.principal", "3", "130"]]];
    for (const [id, reading] of tries)
      expect(() => full(2, (c) => {(c.extraReadings as Record<string, unknown>)[id] = reading; c.pages[1]!.title = `situation.debt_total|total=${id}|ano=year-2027`;}), id).toThrow(refusal);
  });
  it("regression r7: every evasion by meaning is refused through the full path, including labels produced by the source method", () => {
    const attempts = boardConceptAttempts((turn, edit) => boardPacketViaPremises(turn, edit));
    for (const [id, build, message] of attempts) expect(() => prepareBoardCapitalDiscussionPacket(build() as Parameters<typeof prepareBoardCapitalDiscussionPacket>[0]), id).toThrow(message);
    expect(attempts.length).toBeGreaterThanOrEqual(18);
  });
  it("regression r8: names outside the dictionary are never shown and a creditor is named by its row's field, through the full path", () => {
    for (const name of boardOffDictionaryNames) {
      const table = debtTableWithCreditor(name), p = withBoardSource("tabela-divida", table, () => full(2, () => undefined));
      expect(boardOffDictionaryReading(p, name), name).toEqual(boardOffDictionaryExpected);
      expect(oracle(p, [{packet: table}, ...auroraBoardSources()]), name).toEqual({bad: [], missing: []});
    }
    const itauTable = debtTableWithCreditor("Itaú", "Bradesco"), itau = withBoardSource("tabela-divida", itauTable, () => full(2, () => undefined));
    expect(boardRegisteredCreditorReading(itau)).toEqual(boardRegisteredCreditorExpected);
    expect(oracle(itau, [{packet: itauTable}, ...auroraBoardSources()])).toEqual({bad: [], missing: []});
  });
  it("regression r9: exposure is the chain's balance and a ban on assignment needs the registered contract, through the full path", () => {
    const capped = auroraReceivablesPacket({sublimitA: "10"}) as unknown as Record<string, unknown>;
    const p = withBoardSource("recebiveis", capped, () => full(2, boardSublimitCase));
    expect(p.result.discussion!.versions.at(-1)!.questions.find((q) => q.id === "rede-a")!.answer).toBe(boardSublimitExpected);
    expect(oracle(p, [{packet: capped}, ...auroraBoardSources()])).toEqual({bad: [], missing: []});
    expect(() => withBoardSource("recebiveis", capped, () => full(2, (c) => {boardSublimitCase(c);
      c.extraReadings["program-a-volume"] = ["recebiveis", "readings.options[id=risco-sacado-a].volume", "1", "10.0"];
      c.questions[8]!.answer = "a.anchor|rede=rede-a-label|saldo=program-a-volume|carteira=carteira|volume=program-a-volume|taxa=spread-a";}))).toThrow("board_capital_slot_concept_mismatch:a.anchor:saldo");
    const open = auroraReceivablesPacket({contractA: "assignable"}) as unknown as Record<string, unknown>;
    expect(() => withBoardSource("recebiveis", open, () => full(2, () => undefined))).toThrow("board_capital_template_condition_failed:a.anchor");
    // The oracle is not vacuous for these two: a text that shows the program's volume as the exposure, and a ban on
    // assignment read against a contract registered as assignable, are both divergences.
    const forged = structuredClone(p), answer = forged.result.discussion!.versions.at(-1)!.questions.find((q) => q.id === "rede-a")!;
    answer.answer = answer.answer.replace("A carteira tem R$ 19,8 milhões", "A carteira tem R$ 10,0 milhões");
    expect(oracle(forged, [{packet: capped}, ...auroraBoardSources()]).bad.some((x) => x.startsWith("exposure:"))).toBe(true);
    const calibrated = packet(2, () => undefined), openWithSameFingerprint = {...open, fingerprint: calibrated.result.discussion!.identity.find((x) => x.methodId === receivablesMethod)!.packetFingerprint};
    expect(oracle(calibrated, [{packet: openWithSameFingerprint}]).bad.some((x) => x.startsWith("contract:"))).toBe(true);
  });
  it("regression r10: a defined policy and a sensitivity whose economy is unchanged are refused; the chair's reason is an attributed informed fact (full path)", () => {
    const defined = auroraCovenantPacket({policyDefinition: "Mesma definição da escritura"}) as unknown as Record<string, unknown>;
    expect(() => withBoardSource("covenant", defined, () => full(2, () => undefined))).toThrow("board_capital_template_condition_failed:delib.policy.definition");
    const relabelled = auroraInvestmentPacket({economyCaseWithLargerCapexOnly: true}) as unknown as Record<string, unknown>;
    expect(() => withBoardSource("linha-embalagem", relabelled, () => full(2, (c) => {
      c.extraReadings["npv-economy"] = ["linha-embalagem", "comparison.metrics[caseId=economy-4].netPresentValue", "1", boardStatedMillions(relabelled, "economy-4")];
    }))).toThrow("board_capital_template_condition_failed:topic.project_sensitivities");
    const p = full(2, () => undefined);
    expect(p.result.discussion!.versions.at(-1)!.pages.find((x) => x.id === "linha")!.lines[3]).toBe("Motivo apresentado pelo presidente do conselho: reduzir a dependência de um único fornecedor do insumo principal.");
    expect(() => full(2, (c) => {c.informed[0]!.author = "cfo";})).toThrow("board_capital_informed_fact_mismatch");
    expect(() => full(2, (c) => {c.informed[0]!.origin = "analysis";})).toThrow(refusal);
    // The oracle is not vacuous for the two: the calibrated material read against a covenant result whose policy is
    // defined, and against an investment result whose economy case keeps the base economy, is read as false.
    const calibrated = packet(2, () => undefined), fingerprintOf = (method: string) => calibrated.result.discussion!.identity.find((x) => x.methodId === method)!.packetFingerprint;
    const forged = [{packet: {...defined, fingerprint: fingerprintOf("measure-covenant-headroom")}}, {packet: {...relabelled, fingerprint: fingerprintOf("analyze-investment-project")}}, ...auroraBoardSources()];
    const read = oracle(calibrated, forged).bad;
    expect(read.some((x) => x.startsWith("policy_definition:"))).toBe(true);
    expect(read.some((x) => x.startsWith("scenario_economy:"))).toBe(true);
    expect(read.some((x) => x.startsWith("scenario_capex:") || x.startsWith("scenario_start:"))).toBe(false);
  });
  it("regression r11: each cause by its driver, through the full path; the oracle reads the drivers of the sources", () => {
    const inventory = auroraProjectionPacket({inventoryInsteadOfReceivables: true}) as unknown as Record<string, unknown>;
    expect(() => withBoardSource("projecao", inventory, () => full(2, (c) => {c.extraReadings["wc-60"] = boardWorkingCapitalReading(inventory);})))
      .toThrow("board_capital_template_condition_failed:what_changes.receivable_days");
    const frontLoaded = auroraInvestmentPacket({capexFrontLoadedSmallerTotal: true}) as unknown as Record<string, unknown>;
    expect(() => withBoardSource("linha-embalagem", frontLoaded, () => full(2, (c) => {
      c.extraReadings["npv-capex"] = ["linha-embalagem", "comparison.metrics[caseId=capex-120].netPresentValue", "1", boardStatedMillions(frontLoaded, "capex-120")];
    }))).toThrow("board_capital_template_condition_failed:topic.project_sensitivities");
    // Not vacuous: the calibrated material read against the projection with longer inventory and the investment with
    // front-loaded capex is read as false on both causes, and only on those.
    const calibrated = packet(2, () => undefined), fingerprintOf = (method: string) => calibrated.result.discussion!.identity.find((x) => x.methodId === method)!.packetFingerprint;
    const forged = [{packet: {...inventory, fingerprint: fingerprintOf("build-operating-projection")}}, {packet: {...frontLoaded, fingerprint: fingerprintOf("analyze-investment-project")}}, ...auroraBoardSources()];
    const read = oracle(calibrated, forged).bad;
    expect(read.some((x) => x.startsWith("scenario_receivables:"))).toBe(true);
    expect(read.some((x) => x.startsWith("scenario_capex:"))).toBe(true);
    expect(read.some((x) => /^scenario_(economy|start|wheat):/.test(x))).toBe(false);
  });
  it("regression r12: the cause is read on its component and against the reference of its effect (full path); the oracle catches both", () => {
    const shorter = auroraProjectionPacket({shorterThanParentWithInventory: true}) as unknown as Record<string, unknown>;
    expect(() => withBoardSource("projecao", shorter, () => full(2, (c) => {c.extraReadings["wc-60"] = boardWorkingCapitalReading(shorter);})))
      .toThrow("board_capital_template_condition_failed:what_changes.receivable_days");
    const weekly = boardWeeklyVariant(), kept = withBoardSource("caixa-semanal", weekly, () => full(2, boardWeeklyVariantCase));
    expect(kept.result.discussion!.versions.at(-1)!.pages.find((x) => x.id === "caixa")!.lines[0]!.startsWith("No caso alternativo de menor caixa")).toBe(true);
    expect(oracle(kept, [{packet: weekly}, ...auroraBoardSources()])).toEqual({bad: [], missing: []});
    // Not vacuous: the calibrated text read against a projection whose receivables fall below the parent, and a line
    // that says the weekly case is without the crop line, are both read as false.
    const calibrated = packet(2, () => undefined), fingerprintOf = (method: string) => calibrated.result.discussion!.identity.find((x) => x.methodId === method)!.packetFingerprint;
    expect(oracle(calibrated, [{packet: {...shorter, fingerprint: fingerprintOf("build-operating-projection")}}, ...auroraBoardSources()]).bad.some((x) => x.startsWith("scenario_receivables:"))).toBe(true);
    const forged = structuredClone(calibrated), line = forged.result.discussion!.versions.at(-1)!.pages.find((x) => x.id === "caixa")!;
    line.lines[0] = line.lines[0]!.replace("No caso alternativo de menor caixa", "Sem a linha da safra");
    expect(oracle(forged).bad.some((x) => x.startsWith("scenario_weekly_line:"))).toBe(true);
    expect(oracle(calibrated)).toEqual({bad: [], missing: []});
  });
  it("regression r13: a scenario is named only by its exact definition, active in the year shown; a deferral needs its schedule deferred (full path, oracle not vacuous)", () => {
    const late = auroraProjectionPacket({shockFrom2028: true}) as unknown as Record<string, unknown>;
    expect(() => withBoardSource("projecao", late, () => full(2, (c) => {
      c.extraReadings["ebitda-wheat"] = boardRestated(late, "projecao", "readings.projected.scenarios[id=informado-trigo-4m].rows[periodId=2027-12-31].ebitda", 1);
    }))).toThrow("board_capital_template_condition_failed:what_changes.wheat");
    const elsewhere = auroraProjectionPacket({receivablesOnlyIn2027: true}) as unknown as Record<string, unknown>;
    expect(() => withBoardSource("projecao", elsewhere, () => full(2, (c) => {c.extraReadings["wc-60"] = boardWorkingCapitalReading(elsewhere);})))
      .toThrow("board_capital_template_condition_failed:what_changes.receivable_days");
    const flat = auroraPlanPacket({deferralWithoutLaterSchedule: true}) as unknown as Record<string, unknown>;
    expect(() => withBoardSource("plano-2027", flat, () => full(2, (c) => {boardRestatePath(c, flat, "adiar-linha");})))
      .toThrow("board_capital_template_condition_failed:alternatives.moves.defer_line");
    // Not vacuous: the calibrated texts read against each forged source are read as false, each on its own scenario.
    const calibrated = packet(2, () => undefined), fingerprintOf = (method: string) => calibrated.result.discussion!.identity.find((x) => x.methodId === method)!.packetFingerprint;
    const readWith = (packet: Record<string, unknown>, method: string) => oracle(calibrated, [{packet: {...packet, fingerprint: fingerprintOf(method)}}, ...auroraBoardSources()]).bad;
    expect(readWith(late, "build-operating-projection").some((x) => x.startsWith("scenario_wheat:"))).toBe(true);
    expect(readWith(elsewhere, "build-operating-projection").some((x) => x.startsWith("scenario_receivables:"))).toBe(true);
    expect(readWith(flat, "evaluate-financing-paths").some((x) => x.startsWith("scenario_plan_deferral:"))).toBe(true);
    expect(readWith(late, "build-operating-projection").some((x) => x.startsWith("scenario_receivables:"))).toBe(false);
  });
  it("regression r14: balance against flow, first operation, and a path's complete moves (full path, oracle not vacuous)", () => {
    const p2027 = full(2, boardWorkingCapital2027);
    expect(p2027.result.discussion!.versions.at(-1)!.pages.find((x) => x.id === "mudaria")!.lines[3]).toContain("a variação do capital de giro em 2027");
    expect(oracle(p2027)).toEqual({bad: [], missing: []});
    const kept = auroraPlanPacket({keptDebtWithNewLoan: true}) as unknown as Record<string, unknown>;
    expect(() => withBoardSource("plano-2027", kept, () => full(2, (c) => {boardRestateKeptDebt(c, kept);}))).toThrow("board_capital_template_condition_failed:situation.cash_shortfall");
    const onTime = auroraPlanPacket({deferralWithOperationOnTime: true}) as unknown as Record<string, unknown>;
    expect(() => withBoardSource("plano-2027", onTime, () => full(2, (c) => {boardRestatePath(c, onTime, "adiar-linha");}))).toThrow("board_capital_template_condition_failed:alternatives.moves.defer_line");
    const extra = auroraPlanPacket({extensionWithExtraPrepayment: true}) as unknown as Record<string, unknown>;
    expect(() => withBoardSource("plano-2027", extra, () => full(2, (c) => {boardRestatePath(c, extra, "alongar-bradesco");}))).toThrow("board_capital_template_condition_failed:alternatives.moves.extend_bradesco");
    // Not vacuous: each forged plan read against the calibrated texts, and a working-capital line forged as a balance.
    const calibrated = packet(2, () => undefined), plan = calibrated.result.discussion!.identity.find((x) => x.methodId === "evaluate-financing-paths")!.packetFingerprint;
    const readWith = (packet: Record<string, unknown>) => oracle(calibrated, [{packet: {...packet, fingerprint: plan}}, ...auroraBoardSources()]).bad;
    expect(readWith(kept).some((x) => x.startsWith("path_kept:") || x.startsWith("path_moves:Caminho D:"))).toBe(true);
    expect(readWith(onTime).some((x) => x.startsWith("scenario_plan_deferral:"))).toBe(true);
    expect(readWith(extra).some((x) => x === "path_moves:Caminho G:")).toBe(true);
    expect(readWith(extra).some((x) => x === "path_moves:Caminho A:")).toBe(false);
    const forged = structuredClone(calibrated), line = forged.result.discussion!.versions.at(-1)!.pages.find((x) => x.id === "mudaria")!;
    line.lines[2] = line.lines[2]!.replace("a variação do capital de giro", "o capital de giro");
    expect(oracle(forged).bad.some((x) => x.startsWith("nature:"))).toBe(true);
  });
  it("regression r15: only recommendations leave; moves, extensions and deferrals read by terms (full path, oracle not vacuous)", () => {
    const refused = full(3, (c) => {c.omissions = [{id: "sem-movimentos", target: "page", targetId: "movimentos", requestedBy: "requester.chair"},
      {id: "sem-recomendacao", target: "page", targetId: "recomendacao", requestedBy: "requester.chair"}];});
    expect(refused.readings!.omissions.map((o) => o.outcome)).toEqual(["refused", "refused"]);
    expect(oracle(refused)).toEqual({bad: [], missing: []});
    const variants = [["amendmentWithoutExtension", "alternatives.moves.extend_bradesco", ["alongar-bradesco"]], ["developmentLoanAsBank", "alternatives.moves.debenture_with_line", ["debenture-com-linha", "alongar-com-banco", "alongar-bradesco"]],
      ["deferralOnlyCapexAndEbitda", "alternatives.moves.defer_line", ["adiar-linha"]]] as const;
    const calibrated = packet(3, () => undefined), plan = calibrated.result.discussion!.identity.find((x) => x.methodId === "evaluate-financing-paths")!.packetFingerprint;
    for (const [name, template, paths] of variants) {
      const forged = auroraPlanPacket({[name]: true} as Parameters<typeof auroraPlanPacket>[0]) as unknown as Record<string, unknown>;
      expect(() => withBoardSource("plano-2027", forged, () => full(2, (c) => {for (const id of paths) boardRestatePath(c, forged, id);
        c.extraReadings["bradesco-gap"] = boardRestated(forged, "plano-2027", "result.evaluation.paths[id=bradesco-sem-linha].shortfallVsPolicyMinimum", 0);})), name).toThrow(`board_capital_template_condition_failed:${template}`);
      // Not vacuous: the calibrated texts read against the forged plan are flagged by the oracle on that path.
      const read = oracle(calibrated, [{packet: {...forged, fingerprint: plan}}, ...auroraBoardSources()]).bad;
      expect(read.some((x) => x.startsWith("path_") || x.startsWith("scenario_plan_deferral:")), name).toBe(true);
    }
    // Not vacuous: a second version that loses a fact sentence is read as a loss.
    const lost = structuredClone(calibrated), v2 = lost.result.discussion!.versions.at(-1)!;
    v2.pages = v2.pages.filter((x) => x.id !== "movimentos");
    expect(oracle(lost).bad.some((x) => x.startsWith("fact_left:"))).toBe(true);
  });
  it("regression r16: an informed fact is a dictionary code and a decomposition keeps its remainder (full path, oracle not vacuous)", () => {
    for (const text of boardInformedProse) expect(() => full(2, (c) => {c.informed[0]!.code = text;}), text).toThrow(/must match pattern|Invalid/);
    const unknown = full(2, (c) => {c.informed[0]!.code = "a_divida_corresponde_a_um_bilhao";});
    expect(unknown.result.discussion!.versions.at(-1)!.pages.find((x) => x.id === "linha")!.lines[3]).toBe("Motivo apresentado pelo presidente do conselho: a confirmar.");
    expect(oracle(unknown)).toEqual({bad: [], missing: []});
    const calibrated = packet(2, () => undefined);
    expect(calibrated.result.discussion!.versions.at(-1)!.questions.find((q) => q.id === "serra-verde")!.answer).toContain("55 pontos ficam sem explicação");
    // Not vacuous: an attribution of the remainder and a free informed text, forged into the calibrated material, are both read.
    const forged = structuredClone(calibrated), v = forged.result.discussion!.versions.at(-1)!;
    v.questions.find((q) => q.id === "serra-verde")!.answer = "Da diferença de 125 pontos, 60 pontos vêm da data de contratação; o restante se divide entre prazo, garantia, distribuição do instrumento e escala.";
    v.pages.find((x) => x.id === "linha")!.lines[3] = "Motivo apresentado pelo presidente do conselho: a dívida corresponde a um bilião.";
    const read = oracle(forged).bad;
    expect(read.some((x) => x.startsWith("decomposition:"))).toBe(true);
    expect(read.some((x) => x.startsWith("informed:"))).toBe(true);
  });
  it("regression r17: meaning from registered identity, never identifiers: credit line terms and debtors (full path, oracle not vacuous)", () => {
    const machinery = debtTableWithCreditLineLabel("Linha para aquisição de máquinas");
    const p = withBoardSource("tabela-divida", machinery, () => full(2, () => undefined));
    const safra = p.result.discussion!.versions.at(-1)!.pages.find((x) => x.id === "safra")!;
    expect(safra.lines[1]).toBe("Linha de crédito registrada com Itaú, com limite livre de R$ 10 milhões; modalidade e finalidade: [pendente].");
    expect(p.result.discussion!.gaps.map((g) => g.item)).toContain("page.safra.figure.cl-terms");
    expect(oracle(p, [{packet: machinery}, ...auroraBoardSources()])).toEqual({bad: [], missing: []});
    const renamed = auroraReceivablesPacket({debtorRenamed: true}) as unknown as Record<string, unknown>;
    const z = withBoardSource("recebiveis", renamed, () => full(2, () => undefined));
    const question = z.result.discussion!.versions.at(-1)!.questions.find((q) => q.id === "rede-a")!;
    expect(question.question).toBe("Dependemos demais de um único cliente?");
    expect(JSON.stringify(z.result.discussion!.versions.at(-1))).not.toMatch(/rede A|Rede Z/);
    expect(oracle(z, [{packet: renamed}, ...auroraBoardSources()])).toEqual({bad: [], missing: []});
    // Not vacuous: a working-capital claim on the line, and the old name on the renamed debtor, are both read.
    const forged = structuredClone(p), line = forged.result.discussion!.versions.at(-1)!.pages.find((x) => x.id === "safra")!;
    line.lines[1] = "Conta garantida para o aperto de caixa em 21 de dezembro.";
    expect(oracle(forged, [{packet: machinery}, ...auroraBoardSources()]).bad.some((x) => x.startsWith("credit_line_modality:"))).toBe(true);
    const forgedZ = structuredClone(z);
    forgedZ.result.discussion!.versions.at(-1)!.questions.find((q) => q.id === "rede-a")!.question = "Dependemos demais de rede A?";
    expect(oracle(forgedZ, [{packet: renamed}, ...auroraBoardSources()]).bad).toContain("debtor:rede A");
  });
  it("regression r18: an object is named only by its registered field in a closed vocabulary, and the same across sources (full path, oracle not vacuous)", () => {
    // Sugar: the scenario's label names sugar while its key names wheat; the material names neither and leaves a gap.
    const sugar = auroraProjectionPacket({shockLabel: "Informado, com açúcar +15% e repasse em quatro meses"}) as unknown as Record<string, unknown>;
    const ps = withBoardSource("projecao", sugar, () => full(2, () => undefined));
    const vs = ps.result.discussion!.versions.at(-1)!, wheatLine = vs.pages.find((x) => x.id === "mudaria")!.lines[1]!;
    expect(wheatLine).toMatch(/^No cenário do insumo 15% mais caro com repasse em 4 meses/);
    expect(vs.questions.find((q) => q.id === "trigo")!.question).toBe("E se o custo do insumo subir?");
    const shown = (v: typeof vs) => [v.summary, ...v.pages.flatMap((x) => [x.title, ...x.lines, x.recommendation ?? "", ...x.options]),
      ...v.deliberations.flatMap((x) => [x.title, x.text]), ...v.questions.flatMap((x) => [x.question, x.answer])].join(" | ");
    expect(shown(vs)).not.toMatch(/trigo|açúcar/i);
    expect(ps.result.discussion!.gaps.filter((g) => g.reason === "object_not_in_vocabulary").map((g) => g.item)).toEqual(expect.arrayContaining([expect.stringMatching(/\.object\.wheat-label$/)]));
    expect(oracle(ps, [{packet: sugar}, ...auroraBoardSources()])).toEqual({bad: [], missing: []});
    // Boiler: the investment analysed is a boiler, the plan's variants are the packaging line; the path lines are refused.
    const boiler = auroraInvestmentPacket({baseLabel: "Caldeira, cronograma original"}) as unknown as Record<string, unknown>;
    expect(() => withBoardSource("linha-embalagem", boiler, () => full(2, () => undefined))).toThrow(/board_capital_template_condition_failed:alternatives\.moves\./);
    // With the plan registered for the same boiler, the identity holds in both sources and every text names the boiler.
    const boilerPlan = auroraPlanPacket({projectNamed: "caldeira"}) as unknown as Record<string, unknown>;
    const alone = withBoardSource("linha-embalagem", boiler, () => withBoardSource("plano-2027", boilerPlan, () => full(2, () => undefined)));
    const va = alone.result.discussion!.versions.at(-1)!;
    expect(va.pages.find((x) => x.id === "linha")!.title).toMatch(/^A caldeira rende /);
    expect(shown(va)).not.toMatch(/linha de embalagem/i);
    expect(va.pages.find((x) => x.id === "movimentos")!.lines[0]).toMatch(/^Caminho A: sem a caldeira; /);
    expect(oracle(alone, [{packet: boiler}, {packet: boilerPlan}, ...auroraBoardSources()])).toEqual({bad: [], missing: []});
    // Not vacuous: the old input on the sugar scenario, the packaging line on the boiler, and a plan whose variants name
    // another project are each read by the oracle's own vocabularies.
    const forgedS = structuredClone(ps);
    forgedS.result.discussion!.versions.at(-1)!.pages.find((x) => x.id === "mudaria")!.lines[1] = wheatLine.replace("do insumo", "do trigo");
    expect(oracle(forgedS, [{packet: sugar}, ...auroraBoardSources()]).bad.some((x) => x.startsWith("object_unregistered:trigo"))).toBe(true);
    const forgedB = structuredClone(alone);
    forgedB.result.discussion!.versions.at(-1)!.pages.find((x) => x.id === "linha")!.title = va.pages.find((x) => x.id === "linha")!.title.replace("A caldeira", "A linha de embalagem");
    expect(oracle(forgedB, [{packet: boiler}, {packet: boilerPlan}, ...auroraBoardSources()]).bad.some((x) => x.startsWith("object_unregistered:linha de embalagem"))).toBe(true);
    const base = full(2, () => undefined), plan = auroraBoardSources().find((x) => x.methodId === "evaluate-financing-paths")!;
    const otherPlan = structuredClone(plan.packet) as {result: {contributions: {fieldPath: string; value: {value: unknown}}[]}};
    for (const x of otherPlan.result.contributions) if (/\.variant\.[a-z0-9-]+\.label$/.test(x.fieldPath)) x.value.value = String(x.value.value).replace(/linha de embalagem/i, "caldeira");
    expect(oracle(base, [{packet: otherPlan as unknown as Record<string, unknown>}, ...auroraBoardSources().filter((x) => x !== plan && x.methodId !== "evaluate-financing-paths")]).bad.some((x) => x.startsWith("object_across_sources:"))).toBe(true);
  });
  it("regression r19: whole-field identity of objects and projects, and a client's volume in a joint program (full path, oracle not vacuous)", () => {
    const shown = (p: Packet) => {const v = p.result.discussion!.versions.at(-1)!; return [v.summary, ...v.pages.flatMap((x) => [x.title, ...x.lines, x.recommendation ?? "", ...x.options]),
      ...v.deliberations.flatMap((x) => [x.title, x.text]), ...v.questions.flatMap((x) => [x.question, x.answer])].join(" | ");};
    // A known term inside a longer label (a comparison, a negation, an unchanged input) never names the shocked input.
    for (const label of ["Milho 15% mais caro, com trigo inalterado", "Alta do milho, não do trigo", "Óleo mais caro; trigo sem mudança"]) {
      const packet = auroraProjectionPacket({shockLabel: label}) as unknown as Record<string, unknown>;
      const p = withBoardSource("projecao", packet, () => full(2, () => undefined)), line = p.result.discussion!.versions.at(-1)!.pages.find((x) => x.id === "mudaria")!.lines[1]!;
      expect(line, label).toMatch(/^No cenário do insumo 15% mais caro/);
      expect(shown(p), label).not.toMatch(/trigo|milho|óleo/i);
      expect(p.result.discussion!.gaps.some((g) => g.reason === "object_not_in_vocabulary" && g.item.endsWith(".object.wheat-label")), label).toBe(true);
      expect(oracle(p, [{packet}, ...auroraBoardSources()]), label).toEqual({bad: [], missing: []});
      // Not vacuous: the executor's old reading (the term found inside the label) is caught by the oracle's whole-field rule.
      const forged = structuredClone(p);
      forged.result.discussion!.versions.at(-1)!.pages.find((x) => x.id === "mudaria")!.lines[1] = line.replace("do insumo", "do trigo");
      expect(oracle(forged, [{packet}, ...auroraBoardSources()]).bad.some((x) => x.startsWith("object_unregistered:trigo")), label).toBe(true);
    }
    // Same category, different qualifiers: the Sul investment and the Norte plan are different projects.
    const sul = auroraInvestmentPacket({baseLabel: "Linha de embalagem da unidade Sul, cronograma original"}) as unknown as Record<string, unknown>;
    const norte = auroraPlanPacket({projectNamed: "linha de embalagem da unidade Norte"}) as unknown as Record<string, unknown>;
    expect(() => withBoardSource("linha-embalagem", sul, () => withBoardSource("plano-2027", norte, () => full(2, () => undefined)))).toThrow(/board_capital_template_condition_failed:alternatives\.moves\./);
    // Not vacuous: the calibration's texts read against the Sul label and the Norte plan are refused by the oracle.
    const base = full(2, () => undefined), forgedSul = structuredClone(base);
    for (const x of forgedSul.result.discussion!.identity) if (x.figureId === "project-label") x.value = "Linha de embalagem da unidade Sul, cronograma original";
    const planSource = auroraBoardSources().find((x) => x.methodId === "evaluate-financing-paths")!;
    const norteAsPlan = {...(norte as object), fingerprint: (planSource.packet as {fingerprint: string}).fingerprint} as unknown as Record<string, unknown>;
    const bad = oracle(forgedSul, [{packet: norteAsPlan}, ...auroraBoardSources().filter((x) => x.methodId !== "evaluate-financing-paths")]).bad;
    expect(bad.some((x) => x.startsWith("object_unregistered:linha de embalagem"))).toBe(true);
    expect(bad.some((x) => x.startsWith("object_across_sources:"))).toBe(true);
    // A joint program of rede A and rede B: never rede A's own, and the volume shown is rede A's figure in it, not the total.
    const joint = auroraReceivablesPacket({jointProgram: true}) as unknown as Record<string, unknown>;
    expect(() => withBoardSource("recebiveis", joint, () => full(2, () => undefined))).toThrow("board_capital_template_condition_failed:a.anchor");
    const pj = withBoardSource("recebiveis", joint, () => full(2, (c) => {c.questions[8]!.answer = "a.anchor_shared|rede=rede-a-label|saldo=rede-a|carteira=carteira|volume=rede-a-retained|taxa=spread-a";}));
    const answer = pj.result.discussion!.versions.at(-1)!.questions.find((q) => q.id === "rede-a")!.answer;
    expect(answer).toBe("A carteira tem R$ 19,8 milhões de rede A, de um total de R$ 62 milhões; o contrato com esse cliente veda a cessão sem consentimento, mas um programa de antecipação aceita R$ 19,8 milhões desses recebíveis sem regresso, a CDI mais 1,5% ao ano.");
    expect(oracle(pj, [{packet: joint}, ...auroraBoardSources()])).toEqual({bad: [], missing: []});
    // Not vacuous: the program called rede A's own, and the program's total shown as rede A's, are both read.
    const own = structuredClone(pj), q = own.result.discussion!.versions.at(-1)!.questions.find((x) => x.id === "rede-a")!;
    q.answer = answer.replace("um programa de antecipação aceita R$ 19,8 milhões desses recebíveis", "o programa próprio dele antecipa R$ 19,8 milhões");
    expect(oracle(own, [{packet: joint}, ...auroraBoardSources()]).bad.some((x) => x.startsWith("capacity:"))).toBe(true);
    const total = structuredClone(pj);
    total.result.discussion!.versions.at(-1)!.questions.find((x) => x.id === "rede-a")!.answer = answer.replace("aceita R$ 19,8 milhões", "aceita R$ 23,5 milhões");
    expect(oracle(total, [{packet: joint}, ...auroraBoardSources()]).bad.some((x) => x.startsWith("capacity_shared:"))).toBe(true);
  });
  it("regression r20: a named scenario is its whole input object; a discount rate changed with or without the economy is refused (full path, oracle not vacuous)", () => {
    const original = auroraBoardSources().find((x) => x.methodId === "analyze-investment-project")!;
    for (const withEconomy of [true, false]) {
      const packet = auroraInvestmentPacket({economyCaseDiscountRate: {rate: "0.3", withEconomy}}) as unknown as Record<string, unknown>;
      const metrics = (packet.comparison as {metrics: {caseId: string; netPresentValue: string}[]}).metrics, npv = (id: string) => new Decimal(metrics.find((m) => m.caseId === id)!.netPresentValue);
      expect(npv("economy-4").lt(0)).toBe(true);
      // Without the economy change: the same operations are positive at the base's 15% and negative at 30%.
      if (!withEconomy) expect(npv("base").gt(0)).toBe(true);
      expect(() => withBoardSource("linha-embalagem", packet, () => full(2, (c) => {
        c.extraReadings["npv-economy"] = ["linha-embalagem", "comparison.metrics[caseId=economy-4].netPresentValue", "1", boardStatedMillions(packet, "economy-4")];}))).toThrow("board_capital_template_condition_failed:topic.project_sensitivities");
      // Not vacuous: the calibration's texts read against this result (same fingerprint) are refused by the oracle.
      const p = full(2, () => undefined), forged = {...packet, fingerprint: (original.packet as {fingerprint: string}).fingerprint};
      expect(oracle(p, [{packet: forged}, ...auroraBoardSources().filter((x) => x !== original && x.methodId !== "analyze-investment-project")]).bad.some((x) => x.startsWith("scenario_economy:"))).toBe(true);
    }
  });
  /** A result changed by hand, sealed again as its method would (regressions only): fingerprint of the parsed payload. */
  const reseal = <T extends Record<string, unknown>>(methodId: string, packet: T): T => {
    const schema = boardReleasedSources[methodId as keyof typeof boardReleasedSources].schema as unknown as {parse: (v: unknown) => Record<string, unknown>};
    const {fingerprint: _f, ...payload} = schema.parse(packet);
    return {...packet, fingerprint: createHash("sha256").update(JSON.stringify(payload)).digest("hex")};
  };
  it("regression r21 and r22: longer horizons, in years or by dates, are never the exact deferral (full path, oracle not vacuous)", () => {
    const strict = (packet: Record<string, unknown>) => (c: CaseData) => {boardDeferralReadings(packet)(c); boardStrictDeferral(c);};
    for (const variant of [{deferralHorizonYears: 2}, {deferralHorizonYears: 3}, {deferralHorizonYears: 5}, {deferralLastPeriodEnd: "2037-06-30"}, {deferralLastPeriodEnd: "2038-12-31"}, {deferralLastPeriodEnd: "2040-12-31"}]) {
      const packet = auroraInvestmentPacket(variant) as unknown as Record<string, unknown>;
      for (const turn of [2, 3] as const) expect(() => withBoardSource("linha-embalagem", packet, () => full(turn, strict(packet))), JSON.stringify(variant)).toThrow("board_capital_template_condition_failed:topic.project_wait_quotes:1");
    }
  });
  it("regression r23: the deferral is the base moved uniformly, series by series; the calibration's case is named by its registered role (full path, oracle not vacuous)", () => {
    const original = auroraBoardSources().find((x) => x.methodId === "analyze-investment-project")!;
    // The calibration: not a uniform shift (costs on calendar, company series, maintenance and depreciation from the start).
    const p = full(2, () => undefined), rec = p.result.discussion!.versions.at(-1)!.pages.find((x) => x.id === "linha")!.recommendation!;
    expect(rec).toBe("Recomendamos pedir cotações antes do pedido de compra; no caso que a análise registra como adiamento, o VPL fica em R$ 1,4 milhão e o retorno em 17% ao ano.");
    expect(() => full(2, boardStrictDeferral)).toThrow("board_capital_template_condition_failed:topic.project_wait_quotes:1");
    const edit = (packet: Record<string, unknown>, registered: boolean) => (c: CaseData) => {boardDeferralReadings(packet)(c); boardStrictDeferral(c);
      c.deliberations.find((d) => d.id === "linha")!.recommendation = null;
      if (registered) c.pages.find((x) => x.id === "linha")!.recommendation = "topic.project_wait_quotes_registered|vpl=npv-defer|retorno=irr-defer";};
    // The exact control passes the definition and is refused only by the comparison with going on now.
    const control = auroraInvestmentPacket({exactDeferral: "control"}) as unknown as Record<string, unknown>;
    for (const turn of [2, 3] as const) expect(() => withBoardSource("linha-embalagem", control, () => full(turn, edit(control, false)))).toThrow("board_capital_template_condition_failed:topic.project_wait_quotes:2");
    // Extra economy in the last period, another valuation time, a smaller startup capital: refused by the definition.
    for (const kind of ["lastPeriodEconomy", "adoptedTimes", "startupCapital"] as const) {
      const packet = auroraInvestmentPacket({exactDeferral: kind}) as unknown as Record<string, unknown>;
      for (const turn of [2, 3] as const) expect(() => withBoardSource("linha-embalagem", packet, () => full(turn, edit(packet, false))), kind).toThrow("board_capital_template_condition_failed:topic.project_wait_quotes:1");
      if (kind !== "adoptedTimes") expect(() => withBoardSource("linha-embalagem", packet, () => full(3, edit(packet, true))), kind).toThrow("board_capital_template_condition_failed:option.wait_quotes:1");
    }
    // The oracle: the exact sentence read against the calibration is refused; against the exact control it is clean; against
    // each deviation it is refused. Not vacuous in both directions.
    const forged = structuredClone(p);
    forged.result.discussion!.versions.at(-1)!.pages.find((x) => x.id === "linha")!.recommendation = rec.replace("no caso que a análise registra como adiamento", "com capex e início de operação adiados e horizonte da análise estendido na mesma medida");
    const against = (packet: Record<string, unknown>) => oracle(forged, [{packet: {...packet, fingerprint: (original.packet as {fingerprint: string}).fingerprint}}, ...auroraBoardSources().filter((x) => x.methodId !== "analyze-investment-project")]).bad;
    expect(oracle(forged).bad.some((x) => x.startsWith("deferral_uniform:"))).toBe(true);
    expect(against(control).some((x) => x.startsWith("deferral_uniform:"))).toBe(false);
    for (const kind of ["lastPeriodEconomy", "adoptedTimes", "startupCapital"] as const)
      expect(against(auroraInvestmentPacket({exactDeferral: kind}) as unknown as Record<string, unknown>).some((x) => x.startsWith("deferral_uniform:")), kind).toBe(true);
  });
  it("property: every element of every time series of the deferral case's input object (enumerated from the schema), the added positions included, is part of the definition", () => {
    const control = auroraInvestmentPacket({exactDeferral: "control"}) as unknown as {cases: {id: string; result: {contributions: {fieldPath: string; value: {type: string; value: unknown}}[]}}[]};
    const deferred = control.cases.find((x) => x.id === "defer-12")!.result.contributions;
    const n = (control.cases.find((x) => x.id === "base")!.result.contributions.find((x) => x.fieldPath.endsWith(".periodEnds"))!.value.value as unknown[]).length;
    // The series of the case's input schema: every adopted input that is a list over the horizon.
    const series = deferred.filter((x) => Array.isArray(x.value.value) && (x.value.value as unknown[]).length === n + 1).map((x) => x.fieldPath.replace(/^[^.]+\.[0-9a-f-]{36}\./, ""));
    expect(series.length).toBeGreaterThan(25);
    const other = (x: unknown) => {const t = String(x);
      if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return `${t.slice(0, 8)}${t.slice(8) === "01" ? "02" : "01"}`;
      return /^-?\d+(?:\.\d+)?$/.test(t) ? new Decimal(t).plus(1).toFixed() : `${t}_x`;};
    const edit = (packet: Record<string, unknown>) => (c: CaseData) => {boardDeferralReadings(packet)(c); boardStrictDeferral(c); c.deliberations.find((d) => d.id === "linha")!.recommendation = null;};
    let checked = 0;
    for (const field of series) for (const position of [0, n]) {
      const packet = structuredClone(control);
      const entry = packet.cases.find((x) => x.id === "defer-12")!.result.contributions.find((x) => x.fieldPath.endsWith(`.${field}`))!;
      const xs = [...entry.value.value as unknown[]]; xs[position] = other(xs[position]); entry.value = {...entry.value, value: xs};
      const sealed = reseal("analyze-investment-project", packet as unknown as Record<string, unknown>);
      expect(() => withBoardSource("linha-embalagem", sealed, () => full(2, edit(sealed))), `${field}[${position}]`).toThrow("board_capital_template_condition_failed:topic.project_wait_quotes:1");
      checked++;
    }
    expect(checked).toBe(series.length * 2);
  }, 600000);
  it("regression r24: a pending figure occupies only its own field's slot, and a condition on a pending or absent operand is undefined (full path, oracle not vacuous)", () => {
    // Cost of capital of 30%: the IRR of 16% no longer exceeds it.
    const packet = auroraInvestmentPacket({discountRate: "0.3"}) as unknown as Record<string, unknown>;
    const metrics = (packet.comparison as {metrics: {caseId: string; netPresentValue: string; discountRate: string}[]}).metrics;
    const restate = (c: CaseData) => {
      c.extraReadings.wacc = ["linha-embalagem", "comparison.metrics[caseId=base].discountRate", "0", "30"];
      for (const [id, caseId] of [["npv", "base"], ["npv-economy", "economy-4"], ["npv-capex", "capex-120"], ["npv-slow", "slower-start"], ["npv-defer", "defer-12"]] as const)
        c.extraReadings[id] = ["linha-embalagem", `comparison.metrics[caseId=${caseId}].netPresentValue`, "1", boardStatedMillions(packet, caseId)];
    };
    expect(metrics.find((m) => m.caseId === "base")!.discountRate).toBe("0.3");
    const run = (edit: (c: CaseData) => void) => () => withBoardSource("linha-embalagem", packet, () => full(2, (c) => {restate(c); edit(c);}));
    // Without a pending figure, the title's claim fails on the reviewed numbers.
    expect(run(() => undefined)).toThrow("board_capital_template_condition_failed:topic.project_return:0");
    // The staged NPV, pending, in the title and in the answer: refused, it is not the cost of capital nor the return.
    expect(run((c) => {c.pages.find((x) => x.id === "linha")!.title = "topic.project_return|retorno=irr|custo=stages-npv|projeto=project-label";}))
      .toThrow("board_capital_slot_concept_mismatch:topic.project_return:custo:pending_origin");
    // The answer, with the title as reviewed (the concept refusal does not depend on the rate).
    expect(() => full(2, (c) => {c.questions.find((q) => q.id === "estrategica")!.answer = "a.strategic|retorno=stages-npv|custo=wacc";}))
      .toThrow("board_capital_slot_concept_mismatch:a.strategic:retorno:pending_origin");
    // A pending figure of exactly the cost of capital: the claim is undefined and the title does not come out.
    auroraBoardPending["wacc-pending"] = ["analyze-investment-project", "comparison.metrics[caseId=base].discountRate", "note.case_not_reviewed"];
    try {
      expect(run((c) => {c.pages.find((x) => x.id === "linha")!.title = "topic.project_return|retorno=irr|custo=wacc-pending|projeto=project-label";}))
        .toThrow("board_capital_template_condition_undefined:topic.project_return:0");
      expect(() => full(2, (c) => {c.questions.find((q) => q.id === "estrategica")!.answer = "a.strategic|retorno=irr|custo=wacc-pending";}))
        .toThrow("board_capital_template_condition_undefined:a.strategic:0");
    } finally {delete auroraBoardPending["wacc-pending"];}
    // Not vacuous: the oracle refuses a shown title whose claim reads a pending slot, and a pending figure in another concept's slot.
    const p = full(2, () => undefined), forged = structuredClone(p), v = forged.result.discussion!.versions.at(-1)!;
    const binding = v.bindings.find((b) => b.templateId === "topic.project_return" && b.slot === "custo")!;
    binding.figureId = "stages-npv";
    const bad = oracle(forged).bad;
    expect(bad.some((x) => x.startsWith("concept_pending:"))).toBe(true);
    expect(bad.some((x) => x.startsWith("claim_undefined:"))).toBe(true);
  });
  it("property: every pending figure bound in every slot of the calibration is refused unless the slot admits exactly its field; every slot a condition reads, made pending, leaves that condition undefined (full path)", () => {
    let probe: CaseData | null = null;
    boardPacketInput(2, (c) => {probe = structuredClone(c);});
    const fields = textFields(probe!).filter(([, , ref]) => /^[a-z]/.test(ref) && !ref.includes(" ") && ref.includes("|"));
    let refused = 0, accepted = 0, undefinedCount = 0;
    for (const [name, , ref] of fields) {
      const set = (c: CaseData, v: string) => textFields(c).find(([n]) => n === name)![1](v);
      const {templateId, bindings} = parseBoardTextRef(ref), template = boardTemplates[templateId]!;
      for (const slot of Object.keys(bindings)) {
        const spec = template.slots[slot]!;
        if (spec.type === "deadline" || spec.type === "informed") continue;
        for (const pending of ["stages-npv", "cl-terms"]) {
          const changed = ref.replace(new RegExp(`\\|${slot}=[^|]+`), `|${slot}=${pending}`);
          let p: Packet | null = null, error = "";
          // Options are shown once the recommendation is withdrawn (turn 3); every other field is shown at turn 2.
          const turn = name.includes(".option.") ? 3 : 2;
          try {p = full(turn, (c) => {set(c, changed);});} catch (e) {error = String(e);}
          const own = (templateId === "option.staged" && slot === "vpl" && pending === "stages-npv") || (templateId === "topic.crop_overdraft" && slot === "termos" && pending === "cl-terms");
          if (own) {expect(error, `${name} ${changed}`).toBe(""); expect(oracle(p!)).toEqual({bad: [], missing: []}); accepted++;}
          else {expect(error, `${name} ${changed}`).toMatch(/board_capital_(slot_concept_mismatch|slot_type_mismatch|template_condition_undefined|figure_|material_fact|text_|answer_mismatch|deliberation_text_mismatch)/); refused++;}
        }
      }
      // Every slot a condition reads, made pending with its own exact field: the condition is undefined.
      for (const slot of new Set(template.when.flatMap((c) => boardConditionSlots(c)))) {
        const bound = bindings[slot];
        const reading = bound ? auroraBoardReadings[bound as keyof typeof auroraBoardReadings] : undefined;
        if (!reading || !template.slots[slot] || template.slots[slot]!.year !== undefined) continue;
        const methodId = auroraBoardSources().find((x) => x.id === reading[0])!.methodId;
        auroraBoardPending["probe-pending"] = [methodId, reading[1], "note.case_not_reviewed"];
        try {
          const changed = ref.replace(new RegExp(`\\|${slot}=[^|]+`), `|${slot}=probe-pending`);
          // A question and its answer share their readings: the same slot is made pending in both.
          const both = (c: CaseData) => {set(c, changed);
            const q = /^question\.([a-z0-9-]+)\.question$/.exec(name);
            if (q) {const answer = c.questions.find((x) => x.id === q[1])!; answer.answer = answer.answer.replace(new RegExp(`\\|${slot}=${bound}(?=\\||$)`), `|${slot}=probe-pending`);}};
          expect(() => full(name.includes(".option.") ? 3 : 2, both), `${name} ${changed}`).toThrow(`board_capital_template_condition_undefined:${templateId}`);
          undefinedCount++;
        } finally {delete auroraBoardPending["probe-pending"];}
      }
    }
    expect(accepted).toBe(2);
    expect(refused).toBeGreaterThan(150);
    expect(undefinedCount).toBeGreaterThan(30);
  }, 1200000);
  it("regression r25: a plan deferral is the reference variant moved uniformly, an instrument's species is registered, and a shown order holds as shown (full path, oracle not vacuous)", () => {
    const shown = (p: Packet) => {const v = p.result.discussion!.versions.at(-1)!; return [v.summary, ...v.pages.flatMap((x) => [x.title, ...x.lines, x.recommendation ?? "", ...x.options]),
      ...v.deliberations.flatMap((x) => [x.title, x.text]), ...v.questions.flatMap((x) => [x.question, x.answer])];};
    const generic = (c: CaseData) => {const page = c.pages.find((x) => x.id === "movimentos")!; page.lines = page.lines.map((l) => l.replace("alternatives.moves.defer_line|", "alternatives.moves.defer_line_generic|"));};
    for (const factor of [2, 10]) {
      const plan = auroraPlanPacket({deferredCapexFactor: factor}) as unknown as Record<string, unknown>;
      const restate = (c: CaseData) => boardRestatePath(c, plan, "adiar-linha");
      for (const turn of [2, 3] as const) {
        expect(() => withBoardSource("plano-2027", plan, () => full(turn, restate)), `${factor} ${turn}`).toThrow("board_capital_template_condition_failed:alternatives.moves.defer_line");
        const p = withBoardSource("plano-2027", plan, () => full(turn, (c) => {restate(c); generic(c);}));
        const line = p.result.discussion!.versions.at(-1)!.pages.find((x) => x.id === "movimentos")!.lines[1]!;
        expect(line).toBe("Caminho B: outra variante da linha de embalagem, com capex, EBITDA, depreciação, manutenção e capital de giro de partida começando depois dos do plano de referência; crédito bancário de curto prazo.");
        expect(oracle(p, [{packet: plan}, ...auroraBoardSources()])).toEqual({bad: [], missing: []});
      }
      // Not vacuous: the calibration's deferral line read against this plan (same fingerprint).
      const calibrationPlan = auroraBoardSources().find((x) => x.methodId === "evaluate-financing-paths")!;
      const forged = {...plan, fingerprint: (calibrationPlan.packet as {fingerprint: string}).fingerprint};
      expect(oracle(full(2, () => undefined), [{packet: forged}, ...auroraBoardSources().filter((x) => x.methodId !== "evaluate-financing-paths")]).bad.some((x) => x.startsWith("scenario_plan_deferral:")), `${factor}`).toBe(true);
    }
    // The long instrument registered as a commercial note, exactly, and under a longer label.
    for (const [label, says] of [["Nota comercial", "Recomendamos sondar uma nota comercial de até"], ["Nota comercial de longo prazo", "Recomendamos sondar um instrumento de mercado de capitais de até"]] as const) {
      const plan = auroraPlanPacket({longInstrumentLabel: label}) as unknown as Record<string, unknown>;
      for (const turn of [2, 3] as const) {
        const p = withBoardSource("plano-2027", plan, () => full(turn, () => undefined));
        expect(shown(p).some((x) => x.startsWith(says)), `${label} ${turn}`).toBe(true);
        expect(shown(p).filter((x) => /sondar|sondagem|Demanda d|investidores d/.test(x)).some((x) => /debênture/.test(x)), `${label} ${turn}`).toBe(false);
        expect(p.result.discussion!.gaps.some((g) => g.reason === "species_not_registered"), `${label} ${turn}`).toBe(label !== "Nota comercial");
        expect(oracle(p, [{packet: plan}, ...auroraBoardSources()]), `${label} ${turn}`).toEqual({bad: [], missing: []});
      }
      const calibrationPlan = auroraBoardSources().find((x) => x.methodId === "evaluate-financing-paths")!;
      const forged = {...plan, fingerprint: (calibrationPlan.packet as {fingerprint: string}).fingerprint};
      expect(oracle(full(2, () => undefined), [{packet: forged}, ...auroraBoardSources().filter((x) => x.methodId !== "evaluate-financing-paths")]).bad.some((x) => x.startsWith("species_long:")), label).toBe(true);
    }
    // Cost of capital of 15,8% against a return of 15,8032%: both shown as 16%, so no order is asserted.
    const investment = auroraInvestmentPacket({discountRate: "0.158"}) as unknown as Record<string, unknown>;
    const restate = (c: CaseData) => {
      c.extraReadings.wacc = ["linha-embalagem", "comparison.metrics[caseId=base].discountRate", "0", "16"];
      for (const [id, caseId] of [["npv", "base"], ["npv-economy", "economy-4"], ["npv-capex", "capex-120"], ["npv-slow", "slower-start"], ["npv-defer", "defer-12"]] as const)
        c.extraReadings[id] = ["linha-embalagem", `comparison.metrics[caseId=${caseId}].netPresentValue`, "1", boardStatedMillions(investment, caseId)];
    };
    for (const turn of [2, 3] as const) {
      const p = withBoardSource("linha-embalagem", investment, () => full(turn, restate));
      const texts = shown(p);
      expect(texts).toContain("A linha de embalagem rende 16% ao ano, praticamente igual ao custo de capital de 16% ao ano");
      expect(texts.some((x) => x.startsWith("O retorno de 16% ao ano fica praticamente igual ao custo de capital de 16% ao ano"))).toBe(true);
      expect(texts.some((x) => /acima do custo de capital/.test(x))).toBe(false);
      expect(oracle(p, [{packet: investment}, ...auroraBoardSources()])).toEqual({bad: [], missing: []});
      // Not vacuous: the old wording, 16% above 16%.
      const forged = structuredClone(p), page = forged.result.discussion!.versions.at(-1)!.pages.find((x) => x.id === "linha")!;
      page.title = "A linha de embalagem rende 16% ao ano, acima do custo de capital de 16% ao ano";
      expect(oracle(forged, [{packet: investment}, ...auroraBoardSources()]).bad.some((x) => x.startsWith("order_as_shown:"))).toBe(true);
    }
  });
  it("regression r26: every order or sign holds on the values as shown, every and constants included (full path, oracle not vacuous)", () => {
    // Adverse leverage of 2,459 against the policy of 2,5x: with one decimal both show 2,5x.
    const covenant = auroraCovenantPacket({adverseDebt: "124"}) as unknown as Record<string, unknown>;
    const lev = (places: string, stated: string) => (c: CaseData) => {c.extraReadings["lev-adv27"] = ["covenant", "result.headroom.measurements[id=dez27-adverso].ratio", places, stated];};
    for (const turn of [2, 3] as const) {
      expect(() => withBoardSource("covenant", covenant, () => full(turn, lev("1", "2.5")))).toThrow("board_capital_display_order_lost:risk.leverage:0:lev-adv27,policy-limit");
      const p = withBoardSource("covenant", covenant, () => full(turn, lev("2", "2.46")));
      expect(p.result.discussion!.versions.at(-1)!.pages.find((x) => x.id === "alavancagem")!.title).toBe("A alavancagem chega a 2,46x no adverso de 2027, abaixo da política de 2,5x pela definição da escritura");
      expect(oracle(p, [{packet: covenant}, ...auroraBoardSources()])).toEqual({bad: [], missing: []});
      const forged = structuredClone(p), page = forged.result.discussion!.versions.at(-1)!.pages.find((x) => x.id === "alavancagem")!;
      page.title = page.title.replace("2,46x", "2,5x");
      expect(oracle(forged, [{packet: covenant}, ...auroraBoardSources()]).bad.some((x) => x.startsWith("order_as_shown:"))).toBe(true);
    }
    // A sensitivity NPV of -11.532 reais: in millions with one decimal it shows R$ 0,0 milhão, not negative.
    const investment = auroraInvestmentPacket({economyCaseFactor: "0.965"}) as unknown as Record<string, unknown>;
    const npv = (places: string, stated: string) => (c: CaseData) => {c.extraReadings["npv-economy"] = ["linha-embalagem", "comparison.metrics[caseId=economy-4].netPresentValue", places, stated];};
    for (const turn of [2, 3] as const) {
      expect(() => withBoardSource("linha-embalagem", investment, () => full(turn, npv("1", "0.0")))).toThrow("board_capital_display_order_lost:topic.project_sensitivities:0:npv-economy");
      const p = withBoardSource("linha-embalagem", investment, () => full(turn, npv("2", "-0.01")));
      const line = p.result.discussion!.versions.at(-1)!.pages.find((x) => x.id === "linha")!.lines.find((l) => l.startsWith("O VPL fica negativo"))!;
      expect(line).toContain("com economia menor, R$ -0,01 milhão");
      expect(oracle(p, [{packet: investment}, ...auroraBoardSources()])).toEqual({bad: [], missing: []});
      const forged = structuredClone(p), page = forged.result.discussion!.versions.at(-1)!.pages.find((x) => x.id === "linha")!;
      page.lines = page.lines.map((l) => l.replace("R$ -0,01 milhão", "R$ 0,0 milhão"));
      expect(oracle(forged, [{packet: investment}, ...auroraBoardSources()]).bad.some((x) => x.startsWith("sign_as_shown:"))).toBe(true);
    }
  });
  it("regression r27: one presentation per reading across the material, and a shorter profile by its last effective payment (full path, oracle not vacuous)", () => {
    // The adverse leverage of 2,459 shown as 2,5x only in the wheat answer, the summary saying below 2,5x in every scenario.
    const covenant = auroraCovenantPacket({adverseDebt: "124"}) as unknown as Record<string, unknown>;
    const edit = (places: string, stated: string) => (c: CaseData) => {
      c.extraReadings["lev-adv27"] = ["covenant", "result.headroom.measurements[id=dez27-adverso].ratio", places, stated];
      const page = c.pages.find((x) => x.id === "alavancagem")!;
      page.title = "risk.policy_definition|politica=policy-limit"; page.lines = page.lines.filter((l) => !l.startsWith("risk.leverage_adverse"));
    };
    for (const turn of [2, 3] as const) {
      expect(() => withBoardSource("covenant", covenant, () => full(turn, edit("1", "2.5")))).toThrow(/board_capital_display_order_lost:summary\.closing\.leverage:0:lev-adv27/);
      const p = withBoardSource("covenant", covenant, () => full(turn, edit("2", "2.46")));
      expect(oracle(p, [{packet: covenant}, ...auroraBoardSources()])).toEqual({bad: [], missing: []});
      // Not vacuous: the same material with the adverse leverage shown as 2,5x elsewhere.
      const forged = structuredClone(p);
      forged.result.discussion!.identity.find((x) => x.figureId === "lev-adv27")!.display = "2,5x";
      expect(oracle(forged, [{packet: covenant}, ...auroraBoardSources()]).bad.some((x) => x.startsWith("order_across_fields:lev-adv27"))).toBe(true);
    }
    // The same reading at two precisions is refused.
    expect(() => full(2, (c) => {c.extraReadings["lev-adv27-short"] = ["covenant", "result.headroom.measurements[id=dez27-adverso].ratio", "1", "2.4"];
      c.questions.find((q) => q.id === "trigo")!.answer = c.questions.find((q) => q.id === "trigo")!.answer.replace("alavancagem=lev-adv27", "alavancagem=lev-adv27-short");}))
      .toThrow("board_capital_reading_presentation_not_unique");
    // The tested profile that ends in 2034, after the adopted one's 2033: never "mais curto".
    const plan = auroraPlanPacket({alternativeEndingIn2034: true}) as unknown as Record<string, unknown>;
    for (const turn of [2, 3] as const) expect(() => withBoardSource("plano-2027", plan, () => full(turn, () => undefined))).toThrow("board_capital_template_condition_failed:a.term");
    const calibrationPlan = auroraBoardSources().find((x) => x.methodId === "evaluate-financing-paths")!;
    const forged = {...plan, fingerprint: (calibrationPlan.packet as {fingerprint: string}).fingerprint};
    expect(oracle(full(2, () => undefined), [{packet: forged}, ...auroraBoardSources().filter((x) => x.methodId !== "evaluate-financing-paths")]).bad.some((x) => x.startsWith("term_last_payment:"))).toBe(true);
  });
  it("regression r28: every member of a global order, shown or not, holds against the limit as shown (full path, oracle not vacuous)", () => {
    // Policy of 2,44x shown as 2,4x, with a measurement of 2,426x that no reading shows.
    const covenant = auroraCovenantPacket({policyMaximum: "2.44", unshownMeasurement: true}) as unknown as Record<string, unknown>;
    const limit = (places: string, stated: string) => (c: CaseData) => {c.extraReadings["policy-limit"] = ["covenant", "result.headroom.limits[id=politica].maximumRatio", places, stated];};
    for (const turn of [2, 3] as const) {
      expect(() => withBoardSource("covenant", covenant, () => full(turn, limit("1", "2.4"))))
        .toThrow("board_capital_display_order_lost:summary.closing.leverage:0:result.headroom.measurements[9].ratio,policy-limit");
      const p = withBoardSource("covenant", covenant, () => full(turn, limit("2", "2.44")));
      expect(p.result.discussion!.versions.at(-1)!.pages.find((x) => x.id === "alavancagem")!.title).toBe("A alavancagem chega a 2,37x no adverso de 2027, abaixo da política de 2,44x pela definição da escritura");
      expect(oracle(p, [{packet: covenant}, ...auroraBoardSources()])).toEqual({bad: [], missing: []});
      // Not vacuous: the limit shown as 2,4x leaves the unshown 2,426x above it.
      const forged = structuredClone(p);
      for (const v of forged.result.discussion!.versions) for (const pg of v.pages) pg.title = pg.title.replace("2,44x", "2,4x");
      forged.result.discussion!.versions.at(-1)!.summary = forged.result.discussion!.versions.at(-1)!.summary.replace(/2,44x/g, "2,4x");
      expect(oracle(forged, [{packet: covenant}, ...auroraBoardSources()]).bad).toContain("order_across_fields:dez27-estresse");
    }
  });
  it("regression r29: a role is the registered record's, never an identifier's: a managerial contrast under the id dez26-base is never the contractual reading (full path, oracle not vacuous)", () => {
    const covenant = auroraCovenantPacket({baseAsManagerialContrast: true}) as unknown as Record<string, unknown>;
    for (const turn of [2, 3] as const) {
      // The readings bound to the record under the old id: a contrast, 2,116x, is refused as the base path and as the contract.
      expect(() => withBoardSource("covenant", covenant, () => full(turn, (c) => {c.extraReadings["lev-dez26"] = ["covenant", "result.headroom.measurements[id=dez26-base].ratio", "1", "2.1"];})))
        .toThrow(/board_capital_template_condition_failed:(risk\.leverage_path|risk\.policy_readings|summary\.closing\.leverage)/);
      // The readings bound to the registered contractual test (2,198x): accepted, and named for what it is.
      const p = withBoardSource("covenant", covenant, () => full(turn, (c) => {
        c.extraReadings["lev-dez26"] = ["covenant", "result.headroom.measurements[id=dez26-contratual].ratio", "1", "2.2"];
        c.extraReadings["dez26-date"] = ["covenant", "result.headroom.measurements[id=dez26-contratual].date", "month_long", "2026-12-31"];}));
      expect(p.result.discussion!.versions.at(-1)!.pages.find((x) => x.id === "politica")!.lines[0]).toBe("Pelo EBITDA gerencial, 2,0x; pela definição da escritura, 2,2x em dezembro de 2026.");
      expect(oracle(p, [{packet: covenant}, ...auroraBoardSources()])).toEqual({bad: [], missing: []});
      // Not vacuous: the same text with its contractual reading bound to the contrast.
      const forged = structuredClone(p), x = forged.result.discussion!.identity.find((i) => i.figureId === "lev-dez26")!;
      x.path = "result.headroom.measurements[id=dez26-base].ratio";
      const bad = oracle(forged, [{packet: covenant}, ...auroraBoardSources()]).bad;
      expect(bad.some((y) => y.startsWith("role_contrast_shown:"))).toBe(true);
      expect(bad.some((y) => y.startsWith("role_contractual:"))).toBe(true);
    }
  });
  it("regression r30: compliance with a limit only by a registered, unbreached test of that very limit at the date and scenario (full path, oracle not vacuous)", () => {
    const edit = (cov: string, managerial: boolean) => (c: CaseData) => {
      c.extraReadings["cov-limit"] = ["covenant", "result.headroom.limits[id=aditamento].maximumRatio", "1", cov];
      if (managerial) {
        c.extraReadings["lev-adv27-ger"] = ["covenant", "result.headroom.measurements[id=dez27-adverso-gerencial].ratio", "2", "2.22"];
        c.extraReadings["ebitda-adv27-ger"] = ["covenant", "result.headroom.measurements[id=dez27-adverso-gerencial].reportedEbitda", "1", "48.1"];
        const q = c.questions.find((x) => x.id === "trigo")!;
        q.answer = q.answer.replace("ebitda_adverso=ebitda-adv27", "ebitda_adverso=ebitda-adv27-ger").replace("alavancagem=lev-adv27", "alavancagem=lev-adv27-ger");
      }
    };
    const at23 = auroraCovenantPacket({covenantMaximum: "2.3", adverseManagerial: true}) as unknown as Record<string, unknown>;
    const at30 = auroraCovenantPacket({adverseManagerial: true}) as unknown as Record<string, unknown>;
    for (const turn of [2, 3] as const) {
      // The managerial 2,2229x (tests only the policy) beside the breached contractual 2,3707x, against 2,3x: refused.
      expect(() => withBoardSource("covenant", at23, () => full(turn, edit("2.3", true)))).toThrow("board_capital_template_condition_failed:a.wheat:7");
      // Controls: the contractual test against 2,3x is refused; against 3,0x it is accepted.
      expect(() => withBoardSource("covenant", at23, () => full(turn, edit("2.3", false)))).toThrow("board_capital_template_condition_failed:a.wheat:3");
      const p = withBoardSource("covenant", at30, () => full(turn, edit("3.0", false)));
      expect(p.result.discussion!.versions.at(-1)!.questions.find((q) => q.id === "trigo")!.answer).toContain("a alavancagem fica em 2,37x, abaixo do covenant de 3,0x.");
      expect(oracle(p, [{packet: at30}, ...auroraBoardSources()])).toEqual({bad: [], missing: []});
      // Not vacuous: the accepted answer read with the managerial measurement bound to it.
      const forged = structuredClone(p), x = forged.result.discussion!.identity.find((i) => i.figureId === "lev-adv27")!;
      x.path = "result.headroom.measurements[id=dez27-adverso-gerencial].ratio";
      expect(oracle(forged, [{packet: at30}, ...auroraBoardSources()]).bad.some((y) => y.startsWith("compliance:"))).toBe(true);
    }
  });
  it("decision after r30: a compliance sentence against a limit without registered definition names the definition of the registered test; without it, refused", () => {
    // The calibration names it: the policy has no registered definition; the covenant has one, so its answer may omit it.
    const p = full(2, () => undefined), v = p.result.discussion!.versions.at(-1)!;
    expect(v.pages.find((x) => x.id === "alavancagem")!.title).toBe("A alavancagem chega a 2,37x no adverso de 2027, abaixo da política de 2,5x pela definição da escritura");
    expect(v.pages.find((x) => x.id === "alavancagem")!.lines).toContain("No adverso de 2027, chega a 2,37x, contra a política de 2,5x pela definição da escritura.");
    expect(v.summary).toContain("abaixo de 2,5x nos cenários avaliados pela definição da escritura e pelo EBITDA gerencial.");
    expect(v.questions.find((q) => q.id === "trigo")!.answer).toContain("abaixo do covenant de 3,0x.");
    // The same sentence without the definition named: refused at render and flagged by the library.
    const original = boardTemplates["risk.leverage_adverse"]!;
    boardTemplates["risk.leverage_adverse"] = {...original, text: original.text.replace("{definition:politica:$ma}", "")};
    try {
      expect(() => full(2, () => undefined)).toThrow("board_capital_limit_definition_not_named:risk.leverage_adverse:politica");
      expect(checkBoardTemplateLibrary()).toContain("risk.leverage_adverse:definition_token:politica");
    } finally {boardTemplates["risk.leverage_adverse"] = original;}
    // With a registered definition the definition may be omitted; with the policy definition registered the sentence omits it.
    const defined = auroraCovenantPacket({policyDefinition: "Mesma definição da escritura"}) as unknown as Record<string, unknown>;
    expect(() => withBoardSource("covenant", defined, () => full(2, () => undefined))).toThrow("board_capital_template_condition_failed:delib.policy.definition");
  });
  it("regression r31: a reading is the field it resolves to; equivalent selectors never carry two presentations (full path, oracle not vacuous)", () => {
    // 2,4602x shown as 2,46x by one selector and as 2,5x by an equivalent one.
    const covenant = auroraCovenantPacket({adverseDebt: "124.0361"}) as unknown as Record<string, unknown>;
    const edit = (places: string, stated: string) => (c: CaseData) => {
      c.extraReadings["lev-adv27"] = ["covenant", "result.headroom.measurements[id=dez27-adverso].ratio", "2", "2.46"];
      c.extraReadings["lev-adv27-alt"] = ["covenant", "result.headroom.measurements[id=dez27-adverso&scenario=adverse].ratio", places, stated];
      const q = c.questions.find((x) => x.id === "trigo")!; q.answer = q.answer.replace("alavancagem=lev-adv27", "alavancagem=lev-adv27-alt");
    };
    for (const turn of [2, 3] as const) {
      expect(() => withBoardSource("covenant", covenant, () => full(turn, edit("1", "2.5")))).toThrow("board_capital_reading_presentation_not_unique:lev-adv27,lev-adv27-alt");
      // Control: the same presentation through both selectors is one reading of one field.
      const p = withBoardSource("covenant", covenant, () => full(turn, edit("2", "2.46")));
      expect(p.result.discussion!.versions.at(-1)!.questions.find((q) => q.id === "trigo")!.answer).toContain("a alavancagem fica em 2,46x, abaixo do covenant de 3,0x.");
      expect(oracle(p, [{packet: covenant}, ...auroraBoardSources()])).toEqual({bad: [], missing: []});
      // Not vacuous: the equivalent selector given another presentation.
      const forged = structuredClone(p), x = forged.result.discussion!.identity.find((i) => i.figureId === "lev-adv27-alt")!;
      x.presentation = "1";
      expect(oracle(forged, [{packet: covenant}, ...auroraBoardSources()]).bad.some((y) => y.startsWith("presentation_conflict:result.headroom.measurements["))).toBe(true);
    }
  });
  it("regression r32: a period the method does not fix is the horizon its source registers for the row; a range of different horizons is refused (full path, oracle not vacuous)", () => {
    const answer = (p: Packet) => p.result.discussion!.versions.at(-1)!.questions.find((q) => q.id === "rating")!.answer;
    for (const [months, words] of [[3, "em três meses"], [6, "em seis meses"], [12, "por ano"]] as const) {
      const packet = auroraRelativeCostPacket({ratingHorizonMonths: [months, months]});
      for (const turn of [2, 3] as const) {
        const p = withBoardSource("custo-relativo", packet, () => full(turn, boardRatingReadings(packet)));
        expect([...answer(p).matchAll(new RegExp(`milhão ${words}`, "g"))].length, `${months}`).toBe(2);
        expect(oracle(p, [{packet}, ...auroraBoardSources()])).toEqual({bad: [], missing: []});
        if (months !== 12) {
          // Not vacuous: the three- or six-month benefit written per year, and its period claimed as twelve months.
          const forged = structuredClone(p), x = forged.result.discussion!.identity.find((i) => i.figureId === "rating-low")!;
          x.period = "months_12"; x.display = x.display.replace(words, "por ano");
          const bad = oracle(forged, [{packet}, ...auroraBoardSources()]).bad;
          expect(bad).toContain("period:rating-low");
        }
      }
    }
    const mixed = auroraRelativeCostPacket({ratingHorizonMonths: [3, 12]});
    for (const turn of [2, 3] as const) expect(() => withBoardSource("custo-relativo", mixed, () => full(turn, boardRatingReadings(mixed)))).toThrow("board_capital_template_condition_failed:a.rating:0");
  });
  it("regression r33 and the audit: whole-plan bank steps, cost coverage, program count and the alternative presented (full path, oracle not vacuous)", () => {
    const answer = (p: Packet, id: string) => p.result.discussion!.versions.at(-1)!.questions.find((q) => q.id === id)!.answer;
    for (const turn of [2, 3] as const) {
      // A bank discount after the two programs (peaks of 25 and 40): "sem dívida bancária nova" and "só como reserva" refused.
      for (const peak of ["25", "40"]) {
        const packet = auroraReceivablesPacket({needPeak: peak, cheapBankDiscount: true}) as unknown as Record<string, unknown>;
        expect(() => withBoardSource("recebiveis", packet, () => full(turn, (c) => {c.extraReadings["need-peak"] = ["recebiveis", "result.funding.need.peak", "0", peak];})), peak)
          .toThrow("board_capital_template_condition_failed:delib.crop.programs:8");
        const forged = {...packet, fingerprint: (auroraBoardSources().find((x) => x.id === "recebiveis")!.packet as {fingerprint: string}).fingerprint};
        expect(oracle(full(turn, () => undefined), [{packet: forged}, ...auroraBoardSources().filter((x) => x.id !== "recebiveis")]).bad).toContain("plan_bank_step");
      }
      // A third program in the plan: "os programas" and "no primeiro e no segundo" refused.
      const third = auroraReceivablesPacket({thirdProgram: true}) as unknown as Record<string, unknown>;
      expect(() => withBoardSource("recebiveis", third, () => full(turn, () => undefined))).toThrow("board_capital_template_condition_failed:topic.crop_programs:7");
      const forgedThird = {...third, fingerprint: (auroraBoardSources().find((x) => x.id === "recebiveis")!.packet as {fingerprint: string}).fingerprint};
      expect(oracle(full(turn, () => undefined), [{packet: forgedThird}, ...auroraBoardSources().filter((x) => x.id !== "recebiveis")]).bad).toContain("plan_program_count");
      // Incomplete cost coverage: the plain "ganho líquido" refused; the qualified sentence accepted.
      const incomplete = auroraRelativeCostPacket({ratingCostCoverage: "incomplete"});
      expect(() => withBoardSource("custo-relativo", incomplete, () => full(turn, () => undefined))).toThrow("board_capital_template_condition_failed:a.rating:3");
      const p = withBoardSource("custo-relativo", incomplete, () => full(turn, (c) => {const q = c.questions.find((x) => x.id === "rating")!; q.answer = q.answer.replace("a.rating|", "a.rating_known_costs|");}));
      expect(answer(p, "rating")).toContain("o ganho líquido dos custos conhecidos fica entre R$ -0,17 milhão por ano e R$ 0,03 milhão por ano, com custos ainda não levantados");
      expect(oracle(p, [{packet: incomplete}, ...auroraBoardSources()])).toEqual({bad: [], missing: []});
      const forgedRating = structuredClone(p), q = forgedRating.result.discussion!.versions.at(-1)!.questions.find((x) => x.id === "rating")!;
      q.answer = q.answer.replace("o ganho líquido dos custos conhecidos fica entre", "o ganho líquido fica entre");
      expect(oracle(forgedRating, [{packet: incomplete}, ...auroraBoardSources()]).bad).toContain("rating_coverage");
      // The alternative plan said presented, absent from the material: refused.
      expect(() => full(turn, (c) => {for (const pg of c.pages) pg.lines = pg.lines.filter((l) => !l.startsWith("recommendation.alternative"));
        c.questions = c.questions.filter((x) => !x.answer.startsWith("a.demand"));})).toThrow("board_capital_alternative_not_presented");
    }
    // A tie for the largest creditor (60 and 60): "maior credor" refused; with 50 it is unique and accepted.
    const tied = debtTableWithPrincipal("ccb-bradesco", "60");
    expect(() => withBoardSource("tabela-divida", tied, () => full(2, boardRestateSource("tabela-divida", "build-company-debt-table", tied)))).toThrow("board_capital_template_condition_failed:situation.debt_profile:0");
    const unique = debtTableWithPrincipal("ccb-bradesco", "50");
    const pu = withBoardSource("tabela-divida", unique, () => full(2, boardRestateSource("tabela-divida", "build-company-debt-table", unique)));
    expect(pu.result.discussion!.versions.at(-1)!.pages.flatMap((x) => x.lines)).toContain("Prazo médio de 1,5 anos; maior credor: Debenturistas, com 43% da dívida.");
    const forgedAlternative = structuredClone(full(2, () => undefined));
    for (const v of forgedAlternative.result.discussion!.versions) {for (const pg of v.pages) pg.lines = pg.lines.filter((l) => !l.startsWith("Plano alternativo:")); v.questions = v.questions.filter((x) => !x.answer.startsWith("Plano alternativo:"));}
    expect(oracle(forgedAlternative).bad).toContain("alternative_not_presented");
  });
  it("regression r34: a flow shown for a year covers exactly that year; a page holds only templates of its role (full path, oracle not vacuous)", () => {
    const line = (p: Packet) => p.result.discussion!.versions.at(-1)!.pages.find((x) => x.id === "mudaria")!.lines[1];
    for (const turn of [2, 3] as const) {
      for (const ends of [["2026-12-31", "2027-06-30", "2027-12-31"], ["2026-12-31", "2027-09-30", "2027-12-31"]]) {
        const packet = auroraProjectionPacket({periodEnds: ends}) as unknown as Record<string, unknown>;
        expect(() => withBoardSource("projecao", packet, () => full(turn, boardRestateSource("projecao", "build-operating-projection", packet))), ends[1]).toThrow("board_capital_template_condition_failed:what_changes.wheat:3");
        const forged = {...packet, fingerprint: (auroraBoardSources().find((x) => x.id === "projecao")!.packet as {fingerprint: string}).fingerprint};
        expect(oracle(full(turn, () => undefined), [{packet: forged}, ...auroraBoardSources().filter((x) => x.id !== "projecao")]).bad.some((x) => x.startsWith("flow_period:")), ends[1]).toBe(true);
      }
      const annual = auroraProjectionPacket() as unknown as Record<string, unknown>;
      const p = withBoardSource("projecao", annual, () => full(turn, boardRestateSource("projecao", "build-operating-projection", annual)));
      expect(line(p)).toBe("No cenário do trigo 15% mais caro com repasse em 4 meses, o EBITDA de 2027 fica em cerca de R$ 52,6 milhões.");
      expect(oracle(p, [{packet: annual}, ...auroraBoardSources()])).toEqual({bad: [], missing: []});
      // The recommendation page given the role of a situation page: refused; the oracle reads the page against its role.
      expect(() => full(turn, (c) => {c.pages.find((x) => x.id === "recomendacao")!.role = "situation";})).toThrow("board_capital_page_role_mismatch:recomendacao:situation");
      const forged = structuredClone(full(turn, () => undefined));
      forged.result.discussion!.versions.at(-1)!.pages.find((x) => x.id === "recomendacao")!.role = "situation";
      expect(oracle(forged).bad.some((x) => x.startsWith("page_role:recomendacao:"))).toBe(true);
    }
  });
  it("property: changing any single field of a named case's input object (enumerated from the case schema) refuses the named sentence; likewise a scenario's and a path's", () => {
    const original = auroraBoardSources().find((x) => x.methodId === "analyze-investment-project")!.packet as {cases: {id: string; result: {contributions: {fieldPath: string; value: {type: string; value: unknown}}[]}}[]};
    const economy = original.cases.find((x) => x.id === "economy-4")!.result.contributions;
    // The fields of the case's input schema, as the case records them: every adopted input of the analysis.
    const fields = economy.map((x) => x.fieldPath.replace(/^[^.]+\.[0-9a-f-]{36}\./, ""));
    expect(fields.length).toBeGreaterThan(50);
    expect(fields).toEqual(expect.arrayContaining(["valuation.discountRate", "valuation.perspective", "valuation.baseDate", "valuation.timing", "periodEnds", "company.ebitda"]));
    const named = ["project.annualAvoidedOperatingCost", "project.annualVariableOperatingCost", "project.annualFixedOperatingCost"];
    // A different value of the same type: a date one day later, a number plus one, any other text with a suffix.
    const other = (x: unknown) => {const t = String(x);
      if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return `${t.slice(0, 8)}${t.slice(8) === "01" ? "02" : "01"}`;
      return /^-?\d+(?:\.\d+)?$/.test(t) ? new Decimal(t).plus(1).toFixed() : `${t}_x`;};
    const change = (v: {type: string; value: unknown}) => Array.isArray(v.value) ? {...v, value: [other(v.value[0]), ...v.value.slice(1)]} : {...v, value: other(v.value)};
    let refused = 0;
    for (const field of fields.filter((f) => !named.includes(f))) {
      const packet = structuredClone(original);
      const entry = packet.cases.find((x) => x.id === "economy-4")!.result.contributions.find((x) => x.fieldPath.endsWith(`.${field}`))!;
      entry.value = change(entry.value);
      expect(() => withBoardSource("linha-embalagem", reseal("analyze-investment-project", packet as unknown as Record<string, unknown>), () => full(2, () => undefined)), field).toThrow("board_capital_template_condition_failed:topic.project_sensitivities");
      refused++;
    }
    expect(refused).toBe(fields.length - named.length);
    // A projection scenario: any other driver recorded under the wheat scenario refuses the sentences that name it.
    const projection = auroraBoardSources().find((x) => x.methodId === "build-operating-projection")!.packet as {result: {contributions: {fieldPath: string; value: unknown}[]}};
    const prefix = projection.result.contributions.find((x) => x.fieldPath.includes(".scenario.informado-trigo-4m.shock.rate"))!.fieldPath.replace(/shock\.rate$/, "");
    for (const extra of ["override.receivableDays", "override.inventoryDays", "override.payableDays", "volumeGrowthRate", "volumeFactor"]) {
      const packet = structuredClone(projection);
      packet.result.contributions.push({...structuredClone(packet.result.contributions[0]!), fieldPath: prefix + extra, value: {type: "number", value: "1"}});
      expect(() => withBoardSource("projecao", reseal("build-operating-projection", packet as unknown as Record<string, unknown>), () => full(2, () => undefined)), extra).toThrow(/board_capital_template_condition_failed:(what_changes\.wheat|a\.wheat)/);
    }
    // A plan path: a field the move line does not read refuses the line.
    const plan = auroraBoardSources().find((x) => x.methodId === "evaluate-financing-paths")!.packet as {result: {contributions: {fieldPath: string; value: unknown}[]}};
    const packet = structuredClone(plan), instruments = packet.result.contributions.find((x) => x.fieldPath.endsWith(".path.ccb-tres-anos.instruments"))!;
    packet.result.contributions.push({...structuredClone(instruments), fieldPath: instruments.fieldPath.replace(/instruments$/, "covenantPackage"), value: {type: "text", value: "novo"}});
    expect(() => withBoardSource("plano-2027", reseal("evaluate-financing-paths", packet as unknown as Record<string, unknown>), () => full(2, () => undefined))).toThrow("board_capital_template_condition_failed:alternatives.moves.short_bank_loan");
  }, 300000);
  it("property: generated contributions (templates moved, slots rebound, templates at random) are refused or read clean by the independent oracle, concepts included (fixed seed)", () => {
    const r = random(4724);
    let probe: CaseData | null = null;
    boardPacketInput(2, (c) => {probe = structuredClone(c);});
    const fields = textFields(probe!).filter(([, , ref]) => /^[a-z]/.test(ref) && !ref.includes(" "));
    const refs = fields.map(([, , ref]) => ref), ids = Object.keys(boardTemplates), readings = [...Object.keys(auroraBoardReadings), "stages-npv", "cl-terms", "stages-npv", "cl-terms"];
    const deadlines = ["deadline:linha.aviso", "deadline:safra.adesao", "deadline:vencimentos.sondagem", "deadline:vencimentos.rota"];
    const anyBinding = () => r() < 0.2 ? pick(r, deadlines) : pick(r, readings);
    let refused = 0, accepted = 0;
    for (let run = 0; run < 90; run++) {
      const [name, , own] = pick(r, fields), mode = r();
      let ref: string;
      if (mode < 0.15) ref = own;
      else if (mode < 0.5) {const parts = own.split("|"); if (parts.length > 1) {const k = 1 + Math.floor(r() * (parts.length - 1)); parts[k] = `${parts[k]!.split("=")[0]}=${anyBinding()}`;} ref = parts.join("|");}
      else if (mode < 0.8) ref = pick(r, refs);
      else {const id = pick(r, ids); ref = [id, ...Object.keys(boardTemplates[id]!.slots).map((slot) => `${slot}=${anyBinding()}`)].join("|");}
      try {
        const p = full(2, (c) => {textFields(c).find(([n]) => n === name)![1](ref);});
        accepted++;
        expect(oracle(p), `${name} ${ref}`).toEqual({bad: [], missing: []});
      } catch (error) {
        expect(String(error), `${name} ${ref}`).toMatch(refusal);
        refused++;
      }
    }
    expect(refused).toBeGreaterThan(0); expect(accepted).toBeGreaterThan(0);
  });
  it("regression r5: a discussion in another currency is refused, never shown as reais", () => {
    expect(() => prepareBoardCapitalDiscussionPacket(boardPacketViaPremises(2, () => undefined, undefined, (f) => {(f as {currency: string}).currency = "USD";}))).toThrow("board_capital_currency_not_supported:USD");
  });
  it("the independent oracle reads the calibration clean at every turn, through the full path as well", () => {
    for (const turn of [2, 3] as const) expect(oracle(packet(turn, () => undefined))).toEqual({bad: [], missing: []});
    expect(oracle(full(2, () => undefined))).toEqual({bad: [], missing: []});
    // The oracle is not vacuous: a forged binding (return read from the cost of capital) and a forged assertion
    // (a sensitivity made positive) in an otherwise clean packet are both read as divergences.
    const forged = structuredClone(packet(2, () => undefined));
    const v = forged.result.discussion!.versions.at(-1)!;
    const swap = v.bindings.find((b) => b.templateId === "topic.project_return" && b.slot === "retorno")!;
    swap.figureId = "wacc";
    const sensitivity = forged.result.discussion!.identity.find((x) => x.figureId === "npv-economy")!;
    sensitivity.value = sensitivity.value.replace("-", "");
    const read = oracle(forged).bad;
    expect(read).toContain("concept:page.linha.title:retorno:wacc");
    expect(read.some((x) => x.startsWith("claim:page.linha.line.2|topic.project_sensitivities"))).toBe(true);
    const named = structuredClone(packet(2, () => undefined)), nv = named.result.discussion!.versions.at(-1)!;
    const creditor = named.result.discussion!.identity.find((x) => x.figureId === "largest-creditor")!;
    creditor.value = "Bradesco Deve Dezassete Cêntimos"; creditor.display = creditor.value;
    nv.pages.find((x) => x.id === "divida")!.lines[1] = "Prazo médio de 1,5 anos; maior credor: Bradesco Deve Dezassete Cêntimos, com 46% da dívida.";
    named.result.discussion!.identity.find((x) => x.figureId === "lev-adv27")!.packetFingerprint = "0".repeat(64);
    named.result.discussion!.identity.find((x) => x.figureId === "bradesco-maturity")!.path = "result.table.rows[id=finame].finalPayment";
    const flagged = oracle(named).bad;
    for (const x of ["name_shown:largest-creditor", "name_gap:largest-creditor", "packages_mixed:measure-covenant-headroom"]) expect(flagged).toContain(x);
    expect(flagged.some((x) => x.startsWith("creditor_row:question.bradesco.answer"))).toBe(true);
  });
  it("regression r35: 'curto prazo' only with a registered effective term of up to twelve months; every qualifier proven (full path, turns 2 and 3, oracle not vacuous)", () => {
    const termOf = (plan: Record<string, unknown>) => (plan as {result: {evaluation: {instrumentCosts: {instrumentId: string; termYears: string; finalPaymentDate: string}[]}}}).result.evaluation.instrumentCosts.find((c) => c.instrumentId === "giro-4t26-17")!;
    const calibrated = packet(2, () => undefined), planFingerprint = calibrated.result.discussion!.identity.find((x) => x.methodId === "evaluate-financing-paths")!.packetFingerprint;
    // Control (0,5 ano, the calibration's quarter) and the two terms the reviewer registered (1,25 and 2,25 anos).
    for (const [period, years, finalPayment] of [[2, "0.5", "2027-03-31"], [5, "1.25", "2027-12-31"], [9, "2.25", "2028-12-31"]] as const) {
      const plan = auroraPlanPacket({giroPaidInPeriod: period}) as unknown as Record<string, unknown>;
      expect(termOf(plan).termYears).toBe(years);
      expect(termOf(plan).finalPaymentDate).toBe(finalPayment);
      const short = years === "0.5";
      for (const turn of [2, 3] as const) {
        const p = withBoardSource("plano-2027", plan, () => full(turn, boardRestateSource("plano-2027", "evaluate-financing-paths", plan))), texts = boardShownTexts(p);
        const withGiro17 = [texts.find((x) => x.startsWith("Caminho A: sem "))!, texts.find((x) => x.startsWith("Plano alternativo: sem a linha de embalagem, crédito bancário") && x.includes("com waiver da"))!,
          texts.find((x) => x.startsWith("Plano alternativo: sem a linha de embalagem, crédito bancário") && x.includes("de cerca de"))!, texts.find((x) => x.startsWith("No caminho sem a linha de embalagem, com crédito bancário"))!];
        expect(withGiro17.every(Boolean), `${years}:${turn}`).toBe(true);
        for (const x of withGiro17) expect(x.includes("crédito bancário de curto prazo"), `${years}:${turn}:${x}`).toBe(short);
        if (!short) {
          expect(withGiro17[0]).toBe("Caminho A: sem a linha de embalagem; crédito bancário; debênture nova; pré-pagamento da debênture atual e da dívida com Bradesco.");
          expect(withGiro17[1]).toContain("Plano alternativo: sem a linha de embalagem, crédito bancário e financiamento bancário novo com amortização programada");
        }
        // Paths with the six-month crop loans keep the proven words in the same material.
        expect(texts.find((x) => x.startsWith("Caminho B: adiamento "))).toContain("crédito bancário de curto prazo");
        expect(oracle(p, [{packet: plan}, ...auroraBoardSources().filter((x) => x.id !== "plano-2027")]), `${years}:${turn}`).toEqual({bad: [], missing: []});
        // Not vacuous: the calibrated texts read against this source are flagged exactly when the term exceeds twelve months.
        const flagged = oracle(turn === 2 ? calibrated : packet(3, () => undefined), [{packet: {...plan, fingerprint: planFingerprint}}, ...auroraBoardSources().filter((x) => x.id !== "plano-2027")]).bad
          .filter((x) => x.startsWith("bank_term:"));
        expect(flagged.length > 0, `${years}:${turn}`).toBe(!short);
      }
    }
    // The library refuses a qualifier without its proof: "de curto prazo" written as fixed text, and the token on a path
    // whose moves carry no unscheduled bank credit; a qualifier removed from the registry's phrase is refused too.
    const original = boardTemplates["alternatives.moves.short_bank_loan"]!, roll = boardTemplates["a.roll_bank"]!;
    boardTemplates["alternatives.moves.short_bank_loan"] = {...original, text: original.text.replace("financiamento bancário novo", "crédito bancário de curto prazo e financiamento bancário novo")};
    boardTemplates["a.roll_bank"] = {...roll, text: roll.text.replace("{bankcredit:bradesco-sem-linha}", "{bankcredit:ccb-tres-anos}")};
    try {
      const problems = checkBoardTemplateLibrary();
      expect(problems).toContain("alternatives.moves.short_bank_loan:qualifier_unproved:curto");
      expect(problems).toContain("a.roll_bank:bankcredit_unproved:ccb-tres-anos");
    } finally {boardTemplates["alternatives.moves.short_bank_loan"] = original; boardTemplates["a.roll_bank"] = roll;}
    const supplier = boardTemplates["delib.action.supplier_notice"]!;
    boardTemplates["delib.action.supplier_notice"] = {...supplier, text: supplier.text.replace("ao fornecedor", "ao fornecedor atual")};
    try {expect(checkBoardTemplateLibrary()).toEqual(["delib.action.supplier_notice:qualifier_unproved:atual"]);}
    finally {boardTemplates["delib.action.supplier_notice"] = supplier;}
    expect(checkBoardTemplateLibrary()).toEqual([]);
  });
});
