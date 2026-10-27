import Decimal from "decimal.js";
import {describe, expect, it} from "vitest";
import {prepareBoardCapitalDiscussionPacket} from "./board-capital-discussion-packet";
import {boardConceptAttempts, boardRestateKeptDebt, boardRestatePath, boardRestated, boardWorkingCapital2027, boardStatedMillions, boardWeeklyVariant, boardWeeklyVariantCase, boardWorkingCapitalReading, boardSublimitCase, boardSublimitExpected, boardOffDictionaryExpected, boardOffDictionaryNames, boardOffDictionaryReading, boardPacketInput, boardPacketViaPremises, boardRegisteredCreditorExpected,
  boardRegisteredCreditorReading} from "./board-capital-discussion-runs.test-support";
import {auroraBoardReadings, auroraBoardSources, auroraCovenantPacket, auroraInvestmentPacket, auroraPlanPacket, auroraProjectionPacket, auroraReceivablesPacket, debtTableWithCreditor, withBoardSource, type BoardTurn} from "./board-capital-discussion.test-support";
import {boardTemplates} from "./board-capital-discussion-templates";

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
const refusal = /board_capital_(rendered_number_invalid|number_without_origin|unknown_token|date_without_preposition|preposition_on_value|currency_not_supported|field_not_registered|figure_without_origin|figure_diverges|figure_without_statement|figure_reading_invalid|text_reading_not_a_label|text_ref_invalid|template_unknown|slot_invalid|slot_unbound|slot_type_mismatch|template_invalid|title_without_number|answer_without_number|page_without_number|material_fact_not_shown|slot_concept_mismatch|template_condition_failed|template_condition_unverified|deadline_action_mismatch|deliberation_text_mismatch|template_use_invalid|answer_mismatch|source_method_repeated|source_mixed|informed_fact_mismatch|informed_fact_invalid)|Invalid option|Too big|Invalid input|Invalid string|states its value/;

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
const notice = "deadline:enviar ao fornecedor atual o aviso para renegociar o contrato", programs = "deadline:aderir aos programas",
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
  "constraint.indenture_basket": {saldo: DT + "result.table.negativePledgeBaskets[holderId=debenture-1].remaining"},
  "constraint.basket_usage": {cesta: DT + "result.table.negativePledgeBaskets[holderId=debenture-1].basket", ocupado: DT + "result.table.negativePledgeBaskets[holderId=debenture-1].occupied",
    credor: DT + "result.table.rows[id=*].creditor"},
  "constraint.covenant_policy": {covenant: CV + "result.headroom.limits[id=aditamento].maximumRatio", politica: CV + "result.headroom.limits[id=politica].maximumRatio"},
  "topic.project_return": {retorno: IP + "[caseId=base].annualIrr", custo: IP + "[caseId=base].discountRate"},
  "topic.project_value": {retorno: IP + "[caseId=base].annualIrr", custo: IP + "[caseId=base].discountRate", vpl: IP + "[caseId=base].netPresentValue"},
  "topic.project_payback": {payback: IP + "[caseId=base].paybackYears", pico: IP + "[caseId=base].peakCumulativeCashNeed.amount", data: IP + "[caseId=base].peakCumulativeCashNeed.periodEndDate"},
  "topic.project_sensitivities": {vpl_economia: IP + "[caseId=economy-4].netPresentValue", vpl_capex: IP + "[caseId=capex-120].netPresentValue", vpl_partida: IP + "[caseId=slower-start].netPresentValue"},
  "topic.project_strategic_reason": {motivo: "informed:chair"},
  "topic.project_wait_quotes": {vpl: IP + "[caseId=defer-12].netPresentValue", retorno: IP + "[caseId=defer-12].annualIrr"},
  "option.go_now": {vpl: IP + "[caseId=base].netPresentValue", retorno: IP + "[caseId=base].annualIrr"},
  "option.staged": {vpl: "pending:analyze-investment-project"},
  "option.wait_quotes": {vpl: IP + "[caseId=defer-12].netPresentValue", retorno: IP + "[caseId=defer-12].annualIrr"},
  "topic.crop_programs": {valor: RF + "readings.plan[optionId=risco-sacado-a].cumulative", pico: RF + "result.funding.need.peak"},
  "topic.crop_program_cost": {taxa_b: RF + "readings.options[id=risco-sacado-b].spreadOverDi", taxa_a: RF + "readings.options[id=risco-sacado-a].spreadOverDi"},
  "topic.crop_overdraft": {semana: WC + "readings.tightestWeek.weekStart"},
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
  "risk.leverage": {politica: CV + "result.headroom.limits[id=politica].maximumRatio", adverso: CV + "result.headroom.measurements[id=dez27-adverso].ratio", ano: "year"},
  "risk.leverage_path": {inicio: CV + "result.headroom.measurements[id=dez26-base].ratio", data_inicio: CV + "result.headroom.measurements[id=dez26-base].date",
    fim: CV + "result.headroom.measurements[id=dez27-base].ratio", data_fim: CV + "result.headroom.measurements[id=dez27-base].date"},
  "risk.leverage_adverse": {ano: "year", adverso: CV + "result.headroom.measurements[id=dez27-adverso].ratio", politica: CV + "result.headroom.limits[id=politica].maximumRatio"},
  "risk.policy_definition": {politica: CV + "result.headroom.limits[id=politica].maximumRatio"},
  "risk.policy_readings": {gerencial: CV + "result.headroom.measurements[id=dez26-gerencial].ratio", escritura: CV + "result.headroom.measurements[id=dez26-base].ratio",
    data: CV + "result.headroom.measurements[id=dez26-base].date"},
  "what_changes.title": {piso: LI + "issueFloorInsideGates"},
  "what_changes.demand": {piso: LI + "issueFloorInsideGates", alvo: LI + "issueTarget"},
  "what_changes.wheat": {choque: OP + "result.projection.projection.scenarios[id=informado-trigo-4m].inputCostShock.rate",
    defasagem: OP + "result.projection.projection.scenarios[id=informado-trigo-4m].inputCostShock.passThroughLagMonths", ano: "year",
    ebitda: OP + "readings.projected.scenarios[id=informado-trigo-4m].rows[periodId=*].ebitda"},
  "what_changes.receivable_days": {ano: "year", giro: OP + "readings.projected.scenarios[id=prazo-60].rows[periodId=*].effects.changeInWorkingCapital"},
  "next_steps.notice": {prazo: notice}, "next_steps.programs": {prazo: programs}, "next_steps.sounding": {prazo: sounding}, "next_steps.route": {prazo: route, ano: "year"},
  "summary.opening.debt_and_cash": {principal: DT + "result.table.profile.scheduleByYear[year=*].principal", ano: "year", semana: WC + "readings.tightestWeek.weekStart"},
  "summary.closing.leverage": {alavancagem: CV + "result.headroom.measurements[id=dez26-base].ratio", data: CV + "result.headroom.measurements[id=dez26-base].date",
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
  "a.peer": {total: RC + "decomposition.grossBps", data: RC + "result.bridge.steps[family=pricing_date].bps"},
  "a.rating": {baixo: RC + "levers[label=Rating, ganho menor e custo maior].netOfKnownCosts", alto: RC + "levers[label=Rating, ganho maior e custo menor].netOfKnownCosts"},
  "a.strategic": {retorno: IP + "[caseId=base].annualIrr", custo: IP + "[caseId=base].discountRate"},
  "a.wheat": {choque: OP + "result.projection.projection.scenarios[id=informado-trigo-4m].inputCostShock.rate",
    defasagem: OP + "result.projection.projection.scenarios[id=informado-trigo-4m].inputCostShock.passThroughLagMonths", ano: "year",
    ebitda: OP + "readings.projected.scenarios[id=informado-trigo-4m].rows[periodId=*].ebitda", ebitda_adverso: CV + "result.headroom.measurements[id=dez27-adverso].reportedEbitda",
    alavancagem: CV + "result.headroom.measurements[id=dez27-adverso].ratio", covenant: CV + "result.headroom.limits[id=aditamento].maximumRatio"},
  "a.anchor": {saldo: RF + "result.funding.portfolio.items[itemId=rede-a].amount", carteira: RF + "readings.gross", volume: RF + "readings.options[id=risco-sacado-a].volume",
    taxa: RF + "readings.options[id=risco-sacado-a].spreadOverDi"},
  "q.plan_vs_base": {plano: PC + "readings.gap.plan.ebitda", ano: "year", base: PC + "readings.gap.reference.ebitda"},
  "a.plan_vs_base": {base: PC + "readings.gap.reference.ebitda"},
};
/** What the oracle reads in the numbers each fixed text asserts, on the source values of the identity check. */
const claims: Record<string, (v: Record<string, Decimal>) => boolean> = {
  "situation.cash_without_line": (v) => v.saldo!.lt(v.minimo!), "situation.debt_service": (v) => v.servico!.gt(v.disponivel!),
  "constraint.indenture_basket": (v) => v.saldo!.gte(0), "constraint.basket_usage": (v) => v.ocupado!.lte(v.cesta!),
  "topic.project_return": (v) => v.retorno!.gt(v.custo!), "topic.project_sensitivities": (v) => [v.vpl_economia, v.vpl_capex, v.vpl_partida].every((x) => x!.lt(0)),
  "recommendation.debenture_cost": (v) => v.baixo!.lte(v.alto!), "recommendation.amortization": (v) => v.inicio!.lte(v.fim!),
  "risk.leverage_path": (v) => v.fim!.lt(v.inicio!), "risk.leverage_adverse": (v) => v.adverso!.lt(v.politica!), "risk.leverage": (v) => v.adverso!.lt(v.politica!),
  "what_changes.demand": (v) => v.piso!.lt(v.alvo!), "what_changes.receivable_days": (v) => v.giro!.gt(0), "what_changes.wheat": (v) => v.choque!.gt(0),
  "a.roll_bank": (v) => v.falta!.gt(0), "a.term": (v) => v.amortizacao!.gt(v.disponivel!), "a.peer": (v) => v.data!.lte(v.total!), "a.rating": (v) => v.baixo!.lte(v.alto!),
  "a.strategic": (v) => v.retorno!.gt(v.custo!), "a.wheat": (v) => v.alavancagem!.lt(v.covenant!), "a.anchor": (v) => v.saldo!.lte(v.carteira!), "q.plan_vs_base": (v) => v.plano!.gt(v.base!),
};

/** An independent reader of the final text. It formats every reading again from its source value, kind, scale,
 * periodicity and presentation with its own rules; then removes from each displayed field every reading's text,
 * every deadline, the counts and ordinals, and requires that what remains passes its own whitelist and lexicon.
 * Every material fact must appear by its own formatted text. */
const names = new Set(["Itaú", "Bradesco", "Santander", "Banco do Brasil", "Caixa", "BTG Pactual", "Banco Safra", "BNDES", "XP", "Sicredi", "Sicoob", "Banrisul", "Citi", "JPMorgan",
  "Debenturistas", "rede A", "rede B"]);
/** The oracle's own reading of the receivables result: balance owed by the chain, program volume and the registered contract. */
function receivablesFacts(packet: Record<string, unknown>) {
  const f = (packet.result as {funding: {portfolio: {items: {itemId: string; amount: string}[]}}}).funding;
  const r = packet.readings as {options: {id: string; volume: string | null}[]};
  const contract = (packet.result as {contributions: {fieldPath: string; value: {value: unknown}}[]}).contributions.find((x) => x.fieldPath.endsWith(".item.rede-a.contract"))?.value.value;
  return {balance: f.portfolio.items.find((x) => x.itemId === "rede-a")!.amount, volume: r.options.find((x) => x.id === "risco-sacado-a")!.volume, contract};
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
    const per = x.period === "annual" ? (x.unit === "rate" ? " ao ano" : " por ano") : "";
    return x.unit === "money" ? `R$ ${n} ${scaled.abs().toDecimalPlaces(Number(x.presentation)).lt(2) ? "milhão" : "milhões"}${per}` : x.unit === "rate" ? `${n}%${per}`
      : x.unit === "multiple" ? `${n}x` : x.unit === "years" ? `${n} ${n === "1" ? "ano" : "anos"}` : x.unit === "months" ? `${n} ${n === "1" ? "mês" : "meses"}` : x.unit === "bps" ? `${n} pontos` : n;
  };
  const bad: string[] = d.identity.filter((x) => reformat(x) !== x.display).map((x) => `format:${x.figureId}`);
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
    if (!x) {if (!want.startsWith("pending:")) bad.push(`concept_pending:${b.field}:${b.slot}`); g.complete = false; continue;}
    const ok = want === "year" ? x.unit === "calendar" : pattern(want).test(`${x.methodId}|${x.path}`);
    if (!ok) bad.push(`concept:${b.field}:${b.slot}:${b.figureId}`);
    if (/^-?\d+(\.\d+)?$/.test(x.value)) g.values[b.slot] = new D(x.value);
  }
  for (const [key, g] of groups) if (g.complete && claims[g.templateId] && !claims[g.templateId]!(g.values)) bad.push(`claim:${key}`);
  // Names: the oracle's own dictionary. A label outside it is never shown and leaves a gap of name; one inside it is
  // shown as registered. One package per method. A row's creditor is named only beside readings of that same row.
  for (const x of d.identity.filter((i) => i.unit === "label")) {
    if (names.has(x.value)) continue;
    if (texts.some((t) => t.includes(x.value) || t.includes(x.value.normalize("NFKC")))) bad.push(`name_shown:${x.figureId}`);
    if (v.bindings.some((b) => b.figureId === x.figureId) && !d.gaps.some((g) => g.reason === "label_not_in_dictionary" && g.item.endsWith(`.label.${x.figureId}`))) bad.push(`name_gap:${x.figureId}`);
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
    if (/\b(?:leva|levam|reduzem|cai para|deixa|pesam|explica|por causa|devido)\b/i.test(t)) bad.push(`causal:${t.slice(0, 60)}`);
    const projection = (projectionPacket?.result as {projection?: {projection?: {base?: {periodId: string}[]; scenarios?: {id: string; basedOn: string; overriddenDrivers: string[];
      volumeGrowthRate: unknown; volumeFactor: unknown; inputCostShock: {fromPeriodId: string; rate: string} | null}[]}}; contributions?: {fieldPath: string; value: {value: unknown}}[]} | undefined);
    const scenarios = projection?.projection?.projection?.scenarios ?? [], periods = (projection?.projection?.projection?.base ?? []).map((x) => x.periodId);
    const defined = (id: string) => {const x = scenarios.find((y) => y.id === id); return x ? [...x.overriddenDrivers, ...x.volumeGrowthRate !== null ? ["volume"] : [],
      ...x.volumeFactor !== null ? ["volume"] : [], ...x.inputCostShock ? ["shock"] : []].sort().join(",") : "missing";};
    const year = /\b(20\d\d)\b/.exec(t.split("fica")[0]!.split("EBITDA").at(-1)! + " " + t)?.[1];
    if (/No cenário de trigo/.test(t) || /^No cenário de trigo|Com trigo/.test(t)) {
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
    const leaves = (r: Record<string, unknown> | undefined) => {
      const out = new Map<string, string>();
      const walk = (v: unknown, p: string) => {if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${p}[${i}]`)); else if (v && typeof v === "object") Object.entries(v).forEach(([k, x]) => {if (!/anchor$/i.test(k)) walk(x, `${p}.${k}`);}); else out.set(p, String(v));};
      walk((r?.project as {operands?: unknown} | undefined)?.operands, "p"); walk((r?.startupCapital as {operands?: unknown} | undefined)?.operands, "s"); walk(r?.ramp, "r");
      return out;
    };
    const changed = (id: string) => {
      const c = cases.find((x) => x.id === id), ref = cases.find((x) => x.id === (c?.result.inheritedScenario ?? "base"));
      const a = leaves(c?.result), b = leaves(ref?.result);
      return [...new Set([...new Set([...a.keys(), ...b.keys()])].filter((k) => a.get(k) !== b.get(k)).map((k) => k.split(".").at(-1)!.replace(/\[\d+\]$/, "")))].sort().join(",");
    };
    if (/economia menor/.test(t) && changed("economy-4") !== "annualAvoidedOperatingCost,annualFixedOperatingCost,annualVariableOperatingCost") bad.push(`scenario_economy:${t.slice(0, 60)}`);
    if (/capex e depreciação maiores/.test(t) && changed("capex-120") !== "annualDepreciation,growthCapexPaid") bad.push(`scenario_capex:${t.slice(0, 60)}`);
    if (/partida mais lenta/.test(t) && !/^activeMonths,activeYearFraction,loadEquivalentYearFraction,loadYearFraction,operationStartMonth$/.test(changed("slower-start"))) bad.push(`scenario_start:${t.slice(0, 60)}`);
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
    const creditorRow = "ccb-bradesco";
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
    // An extension: the amended instrument pays finally later and repays no more principal than the original in any period.
    if (/alongada por aditamento/.test(t)) {
      const amended = planContributions.find((x) => x.fieldPath.endsWith(".replaces") && x.value.value === creditorRow)?.fieldPath.match(/\.instrument\.([a-z0-9-]+)\.replaces$/)?.[1];
      const late = amended ? term(`.instrument.${amended}.finalPaymentDate`) as string : undefined, before = term(`.instrument.${creditorRow}.finalPaymentDate`) as string | undefined;
      const a = amended ? (term(`.instrument.${amended}.amortization`) as string[]) : [], o = (term(`.instrument.${creditorRow}.amortization`) as string[] | undefined) ?? [];
      const repaid = (xs: string[]) => xs.reduce((sum, v) => sum.plus(v), new D(0));
      if (!late || !before || !(late > before) || !repaid(a).lt(repaid(o))) bad.push(`path_extension:${t.slice(0, 60)}`);
    }
    // A plan deferral: every recorded component of the variant starts later than the reference variant's.
    if (/linha de embalagem adiada/i.test(t) && !["growthCapex", "ebitda", "depreciation", "maintenanceCapex", "startupWorkingCapitalCashFlow"]
      .every((f) => firstNonZero(variant("adiar-12", f) as string[]) > firstNonZero(variant("seguir", f) as string[]))) bad.push(`scenario_plan_deferral:${t.slice(0, 60)}`);
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
      const facts = receivablesFacts(source.packet), number = (x: string) => new D(x.replace(/\./g, "").replace(",", "."));
      for (const t of texts) {
        const owes = /rede A deve R\$ (-?[\d.,]+) milh/.exec(t);
        if (owes && !number(owes[1]!).eq(new D(facts.balance).toDecimalPlaces(1))) bad.push(`exposure:${t.slice(0, 60)}`);
        const program = /programa próprio da rede antecipa R\$ (-?[\d.,]+) milh/.exec(t);
        if (program && (facts.volume === null || !number(program[1]!).eq(new D(facts.volume).toDecimalPlaces(1)))) bad.push(`capacity:${t.slice(0, 60)}`);
        if (/veda a cessão/.test(t) && facts.contract !== "prohibited_without_consent") bad.push(`contract:${t.slice(0, 60)}`);
      }
    }
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
      ["years-in-a-months-slot", (c: CaseData) => {c.pages[11]!.lines[1] = "what_changes.wheat|choque=wheat-shock|defasagem=wal|ano=year-2027|ebitda=ebitda-wheat";}],
      ["rate-in-a-money-slot", (c: CaseData) => {c.pages[1]!.title = "situation.debt_total|total=irr|ano=year-2027";}],
      ["value-in-a-date-slot", (c: CaseData) => {c.pages[1]!.title = "situation.debt_total|total=divida-total|ano=divida-total";}],
      ["reading-in-a-deadline-slot", (c: CaseData) => {c.pages[12]!.lines[0] = "next_steps.notice|prazo=tight-week";}],
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
      const p = withBoardSource("tabela-divida", debtTableWithCreditor(name), () => full(2, () => undefined));
      expect(boardOffDictionaryReading(p, name), name).toEqual(boardOffDictionaryExpected);
      expect(oracle(p), name).toEqual({bad: [], missing: []});
    }
    const itau = withBoardSource("tabela-divida", debtTableWithCreditor("Itaú", "Bradesco"), () => full(2, () => undefined));
    expect(boardRegisteredCreditorReading(itau)).toEqual(boardRegisteredCreditorExpected);
    expect(oracle(itau)).toEqual({bad: [], missing: []});
  });
  it("regression r9: exposure is the chain's balance and a ban on assignment needs the registered contract, through the full path", () => {
    const capped = auroraReceivablesPacket({sublimitA: "10"}) as unknown as Record<string, unknown>;
    const p = withBoardSource("recebiveis", capped, () => full(2, boardSublimitCase));
    expect(p.result.discussion!.versions.at(-1)!.questions.find((q) => q.id === "rede-a")!.answer).toBe(boardSublimitExpected);
    expect(oracle(p, [{packet: capped}, ...auroraBoardSources()])).toEqual({bad: [], missing: []});
    expect(() => withBoardSource("recebiveis", capped, () => full(2, (c) => {boardSublimitCase(c);
      c.questions[8]!.answer = "a.anchor|saldo=program-a-volume|carteira=carteira|volume=program-a-volume|taxa=spread-a";}))).toThrow("board_capital_slot_concept_mismatch:a.anchor:saldo");
    const open = auroraReceivablesPacket({contractA: "assignable"}) as unknown as Record<string, unknown>;
    expect(() => withBoardSource("recebiveis", open, () => full(2, () => undefined))).toThrow("board_capital_template_condition_failed:a.anchor");
    // The oracle is not vacuous for these two: a text that shows the program's volume as the exposure, and a ban on
    // assignment read against a contract registered as assignable, are both divergences.
    const forged = structuredClone(p), answer = forged.result.discussion!.versions.at(-1)!.questions.find((q) => q.id === "rede-a")!;
    answer.answer = answer.answer.replace("deve R$ 19,8 milhões", "deve R$ 10,0 milhões");
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
    expect(p.result.discussion!.versions.at(-1)!.pages.find((x) => x.id === "linha")!.lines[3]).toBe("Motivo estratégico apresentado pelo presidente do conselho: reduzir a dependência de um único fornecedor de embalagem.");
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
    line.lines[0] = line.lines[0]!.replace("No caso alternativo de menor caixa da análise de curto prazo", "Sem a linha da safra");
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
  it("property: generated contributions (templates moved, slots rebound, templates at random) are refused or read clean by the independent oracle, concepts included (fixed seed)", () => {
    const r = random(4724);
    let probe: CaseData | null = null;
    boardPacketInput(2, (c) => {probe = structuredClone(c);});
    const fields = textFields(probe!).filter(([, , ref]) => /^[a-z]/.test(ref) && !ref.includes(" "));
    const refs = fields.map(([, , ref]) => ref), ids = Object.keys(boardTemplates), readings = [...Object.keys(auroraBoardReadings), "stages-npv"];
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
});
