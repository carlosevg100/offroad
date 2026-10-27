import Decimal from "decimal.js";
import {describe, expect, it} from "vitest";
import {prepareBoardCapitalDiscussionPacket} from "./board-capital-discussion-packet";
import {boardConceptAttempts, boardSublimitCase, boardSublimitExpected, boardOffDictionaryExpected, boardOffDictionaryNames, boardOffDictionaryReading, boardPacketInput, boardPacketViaPremises, boardRegisteredCreditorExpected,
  boardRegisteredCreditorReading} from "./board-capital-discussion-runs.test-support";
import {auroraBoardReadings, auroraBoardSources, auroraReceivablesPacket, debtTableWithCreditor, withBoardSource, type BoardTurn} from "./board-capital-discussion.test-support";
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
const refusal = /board_capital_(rendered_number_invalid|number_without_origin|unknown_token|date_without_preposition|preposition_on_value|currency_not_supported|field_not_registered|figure_without_origin|figure_diverges|figure_without_statement|figure_reading_invalid|text_reading_not_a_label|text_ref_invalid|template_unknown|slot_invalid|slot_unbound|slot_type_mismatch|template_invalid|title_without_number|answer_without_number|page_without_number|material_fact_not_shown|slot_concept_mismatch|template_condition_failed|template_condition_unverified|deadline_action_mismatch|deliberation_text_mismatch|template_use_invalid|answer_mismatch|source_method_repeated|source_mixed)|Invalid option|Too big|Invalid input|Invalid string|states its value/;

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
  "recommendation.alternative": {prazo: route},
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
  "what_changes.receivable_days": {giro: OP + "readings.projected.scenarios[id=prazo-60].rows[periodId=*].effects.changeInWorkingCapital"},
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
  const missing = d.materialFacts.figures.filter((id) => {const x = d.identity.find((i) => i.figureId === id); return x !== undefined && !joined.includes(reformat(x));});
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
      ["years-in-a-months-slot", (c: CaseData) => {c.pages[10]!.lines[1] = "what_changes.wheat|choque=wheat-shock|defasagem=wal|ano=year-2027|ebitda=ebitda-wheat";}],
      ["rate-in-a-money-slot", (c: CaseData) => {c.pages[1]!.title = "situation.debt_total|total=irr|ano=year-2027";}],
      ["value-in-a-date-slot", (c: CaseData) => {c.pages[1]!.title = "situation.debt_total|total=divida-total|ano=divida-total";}],
      ["reading-in-a-deadline-slot", (c: CaseData) => {c.pages[11]!.lines[0] = "next_steps.notice|prazo=tight-week";}],
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
    expect(date.readings!.omissions[0]).toMatchObject({outcome: "refused", keptFigureIds: ["payback", "peak-need"]});
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
    expect(oracle(p, [{packet: capped}])).toEqual({bad: [], missing: []});
    expect(() => withBoardSource("recebiveis", capped, () => full(2, (c) => {boardSublimitCase(c);
      c.questions[8]!.answer = "a.anchor|saldo=program-a-volume|carteira=carteira|volume=program-a-volume|taxa=spread-a";}))).toThrow("board_capital_slot_concept_mismatch:a.anchor:saldo");
    const open = auroraReceivablesPacket({contractA: "assignable"}) as unknown as Record<string, unknown>;
    expect(() => withBoardSource("recebiveis", open, () => full(2, () => undefined))).toThrow("board_capital_template_condition_failed:a.anchor");
    // The oracle is not vacuous for these two: a text that shows the program's volume as the exposure, and a ban on
    // assignment read against a contract registered as assignable, are both divergences.
    const forged = structuredClone(p), answer = forged.result.discussion!.versions.at(-1)!.questions.find((q) => q.id === "rede-a")!;
    answer.answer = answer.answer.replace("deve R$ 19,8 milhões", "deve R$ 10,0 milhões");
    expect(oracle(forged, [{packet: capped}]).bad.some((x) => x.startsWith("exposure:"))).toBe(true);
    const calibrated = packet(2, () => undefined), openWithSameFingerprint = {...open, fingerprint: calibrated.result.discussion!.identity.find((x) => x.methodId === receivablesMethod)!.packetFingerprint};
    expect(oracle(calibrated, [{packet: openWithSameFingerprint}]).bad.some((x) => x.startsWith("contract:"))).toBe(true);
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
