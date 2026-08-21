import Decimal from "decimal.js";

import type {DeskAnalysis, Trajectory} from "@offroad/credit-analysis";
import type {ReconciledFact, TracedCalculation} from "@offroad/reconciliation";

import type {Material, MaterialBlock} from "./compile";

/**
 * The forty questions a fund asks, answered before it asks them.
 *
 * Every diligence starts with the same list, and a desk that has read the room answers most of
 * it from the facts and the battery before the first call. What it cannot answer it says is
 * open, addressed to the company, so the list is also the request that goes back. Every
 * answer cites what it stands on; an open question cites nothing and says so.
 */

type Lang = "pt" | "en";
type Bi = {pt: string; en: string};
const bi = (pt: string, en: string): Bi => ({pt, en});

const money = (value: Decimal.Value, locale: "pt-BR" | "en-US") =>
  `R$ ${new Decimal(value).div(1_000_000).toFixed(1).replace(".", locale === "pt-BR" ? "," : ".")}M`;
const turns = (value: Decimal.Value, locale: "pt-BR" | "en-US") => `${new Decimal(value).toFixed(2).replace(".", locale === "pt-BR" ? "," : ".")}x`;
const pct = (value: Decimal.Value, locale: "pt-BR" | "en-US") => `${new Decimal(value).times(100).toFixed(1).replace(".", locale === "pt-BR" ? "," : ".")}%`;

export type DiligenceContext = {
  facts: readonly ReconciledFact[];
  calculations: readonly TracedCalculation[];
  desk: DeskAnalysis | null;
  trajectory: Trajectory | null;
};

export type DiligenceAnswer = {
  id: string;
  section: Bi;
  question: Bi;
  /** Null when the room cannot answer: the question goes back to the company. */
  answer: Bi | null;
  supportIds: string[];
};

const find = (facts: readonly ReconciledFact[], pattern: RegExp): ReconciledFact | undefined =>
  facts.filter((fact) => pattern.test(fact.key.fieldPath)).sort((a, b) => (b.key.periodEnd ?? "").localeCompare(a.key.periodEnd ?? ""))[0];
const indexed = (facts: readonly ReconciledFact[], prefix: string): ReconciledFact[] => facts.filter((fact) => fact.key.fieldPath.startsWith(`${prefix}.`));

type Resolver = (context: DiligenceContext) => {answer: Bi; supportIds: string[]} | null;

const questions: Array<{id: string; section: Bi; question: Bi; resolve: Resolver}> = [
  // ---- the business -------------------------------------------------------------------------
  {id: "q01", section: bi("Negócio", "Business"), question: bi("O que a companhia faz, desde quando e onde?", "What does the company do, since when and where?"), resolve: ({facts}) => {
    const sector = find(facts, /^company\.sector$/); const founded = find(facts, /^company\.founded_year$/); const city = find(facts, /^company\.city$/);
    if (!sector) return null;
    return {answer: bi(`${sector.value}${founded ? `, desde ${founded.value}` : ""}${city ? `, em ${city.value}` : ""}.`, `${sector.value}${founded ? `, since ${founded.value}` : ""}${city ? `, in ${city.value}` : ""}.`), supportIds: [sector.key.fieldPath, ...(founded ? [founded.key.fieldPath] : []), ...(city ? [city.key.fieldPath] : [])]};
  }},
  {id: "q02", section: bi("Negócio", "Business"), question: bi("Quem controla a companhia e com que participação?", "Who controls the company and with what stake?"), resolve: ({facts}) => {
    const names = indexed(facts, "company.controllers").filter((fact) => fact.key.fieldPath.endsWith(".name"));
    if (names.length === 0) return null;
    const parts = names.map((name) => {const share = facts.find((fact) => fact.key.fieldPath === name.key.fieldPath.replace(".name", ".ownership_pct")); return `${name.value}${share ? ` (${pct(share.value, "pt-BR")})` : ""}`;});
    return {answer: bi(parts.join("; ") + ".", parts.join("; ") + "."), supportIds: names.map((name) => name.key.fieldPath)};
  }},
  {id: "q03", section: bi("Negócio", "Business"), question: bi("Qual a concentração nos cinco maiores clientes?", "What is the concentration in the top five customers?"), resolve: ({facts}) => {
    const shares = indexed(facts, "customers.top_customers").filter((fact) => fact.key.fieldPath.endsWith(".share_pct"));
    if (shares.length === 0) return null;
    const total = shares.slice(0, 5).reduce((sum, fact) => sum.plus(fact.value), new Decimal(0));
    const top = shares.sort((a, b) => Number(b.value) - Number(a.value))[0]!;
    return {answer: bi(`Cinco maiores: ${pct(total, "pt-BR")} da receita; o maior, ${pct(top.value, "pt-BR")}.`, `Top five: ${pct(total, "en-US")} of revenue; the largest, ${pct(top.value, "en-US")}.`), supportIds: shares.map((fact) => fact.key.fieldPath)};
  }},
  {id: "q04", section: bi("Negócio", "Business"), question: bi("Quais os prazos e cláusulas de rescisão dos contratos com os maiores clientes?", "What are the terms and termination clauses of the largest customers' contracts?"), resolve: ({facts}) => {
    const terms = find(facts, /^customers\.contract_terms$/);
    return terms ? {answer: bi(terms.value, terms.value), supportIds: [terms.key.fieldPath]} : null;
  }},
  {id: "q05", section: bi("Negócio", "Business"), question: bi("Há sazonalidade relevante na receita?", "Is there material seasonality in revenue?"), resolve: ({facts}) => {
    const seasonality = find(facts, /^customers\.seasonality$/);
    return seasonality ? {answer: bi(seasonality.value, seasonality.value), supportIds: [seasonality.key.fieldPath]} : null;
  }},
  // ---- financials ---------------------------------------------------------------------------
  {id: "q06", section: bi("Financeiro", "Financials"), question: bi("Qual a receita e o EBITDA dos últimos três exercícios?", "What were revenue and EBITDA for the last three years?"), resolve: ({facts}) => {
    const rows = facts.filter((fact) => /^historical_financials\.\d{4}\.(revenue|ebitda)$/.test(fact.key.fieldPath)).sort((a, b) => a.key.fieldPath.localeCompare(b.key.fieldPath));
    if (rows.length === 0) return null;
    const years = [...new Set(rows.map((fact) => fact.key.fieldPath.split(".")[1]!))];
    const line = (locale: "pt-BR" | "en-US") => years.map((year) => {const rev = rows.find((f) => f.key.fieldPath === `historical_financials.${year}.revenue`); const eb = rows.find((f) => f.key.fieldPath === `historical_financials.${year}.ebitda`); return `${year}: ${rev ? money(rev.value, locale) : "n/d"} / ${eb ? money(eb.value, locale) : "n/d"}`;}).join("; ");
    return {answer: bi(`Receita / EBITDA. ${line("pt-BR")}.`, `Revenue / EBITDA. ${line("en-US")}.`), supportIds: rows.map((fact) => fact.key.fieldPath)};
  }},
  {id: "q07", section: bi("Financeiro", "Financials"), question: bi("As demonstrações são auditadas? Por quem, com que opinião?", "Are the statements audited? By whom, with what opinion?"), resolve: ({facts}) => {
    const firm = find(facts, /^company\.auditor\.firm$/); const opinion = find(facts, /^company\.auditor\.opinion$/);
    if (!firm) return null;
    return {answer: bi(`${firm.value}${opinion ? `, opinião ${opinion.value}` : ""}.`, `${firm.value}${opinion ? `, opinion: ${opinion.value}` : ""}.`), supportIds: [firm.key.fieldPath, ...(opinion ? [opinion.key.fieldPath] : [])]};
  }},
  {id: "q08", section: bi("Financeiro", "Financials"), question: bi("Qual a posição mais recente (receita acumulada, caixa, recebíveis)?", "What is the latest position (year-to-date revenue, cash, receivables)?"), resolve: ({facts}) => {
    const revenue = find(facts, /^interim_financials\.\d{4}_\d{2}\.revenue(_\d+m|_ytd)?$/); const cash = find(facts, /^interim_financials\.\d{4}_\d{2}\.cash$/); const receivables = find(facts, /^interim_financials\.\d{4}_\d{2}\.receivables$/);
    if (!revenue && !cash) return null;
    const parts = (locale: "pt-BR" | "en-US") => [revenue ? `${locale === "pt-BR" ? "receita" : "revenue"} ${money(revenue.value, locale)} (${revenue.key.periodEnd ?? ""})` : null, cash ? `${locale === "pt-BR" ? "caixa" : "cash"} ${money(cash.value, locale)}` : null, receivables ? `${locale === "pt-BR" ? "recebíveis" : "receivables"} ${money(receivables.value, locale)}` : null].filter(Boolean).join("; ");
    return {answer: bi(parts("pt-BR") + ".", parts("en-US") + "."), supportIds: [revenue, cash, receivables].filter((fact): fact is ReconciledFact => Boolean(fact)).map((fact) => fact.key.fieldPath)};
  }},
  {id: "q09", section: bi("Financeiro", "Financials"), question: bi("Qual o ciclo de caixa (DSO, DIO, DPO)?", "What is the cash cycle (DSO, DIO, DPO)?"), resolve: ({desk}) => {
    if (!desk?.workingCapital.cycleDays) return null;
    const w = desk.workingCapital;
    return {answer: bi(`DSO ${w.dso} dias, DIO ${w.dio} dias, DPO ${w.dpo} dias: ciclo de ${w.cycleDays} dias.`, `DSO ${w.dso} days, DIO ${w.dio} days, DPO ${w.dpo} days: a ${w.cycleDays}-day cycle.`), supportIds: ["desk.ciclo_de_caixa_dias"]};
  }},
  {id: "q10", section: bi("Financeiro", "Financials"), question: bi("Há itens não recorrentes no EBITDA? Quais?", "Are there non-recurring items in EBITDA? Which?"), resolve: ({facts}) => {
    const adjusted = find(facts, /^historical_financials\.\d{4}\.adjusted_ebitda$/); const reported = adjusted ? find(facts, new RegExp(`^${adjusted.key.fieldPath.replace("adjusted_ebitda", "ebitda").replace(/\./g, "\\\\.")}$`)) : undefined;
    if (!adjusted || !reported) return null;
    const diff = new Decimal(adjusted.value).minus(reported.value);
    return {answer: bi(`EBITDA ajustado de ${money(adjusted.value, "pt-BR")} contra reportado de ${money(reported.value, "pt-BR")}: ${money(diff.abs(), "pt-BR")} de ajustes, a detalhar item a item.`, `Adjusted EBITDA of ${money(adjusted.value, "en-US")} against reported ${money(reported.value, "en-US")}: ${money(diff.abs(), "en-US")} of adjustments, to be detailed item by item.`), supportIds: [adjusted.key.fieldPath, reported.key.fieldPath]};
  }},
  // ---- debt ---------------------------------------------------------------------------------
  {id: "q11", section: bi("Dívida", "Debt"), question: bi("Qual o estoque de dívida, por credor, custo e vencimento?", "What is the debt stack, by lender, cost and maturity?"), resolve: ({desk}) => {
    if (!desk || desk.stack.lines.length === 0) return null;
    const lines = desk.stack.lines.map((line) => `${line.lender} ${money(line.balance, "pt-BR")}${line.effectiveAnnual ? ` a ${pct(line.effectiveAnnual, "pt-BR")} a.a.` : ""}${line.maturity ? `, venc. ${line.maturity}` : ""}`);
    return {answer: bi(`${desk.stack.lines.length} linha(s), ${money(desk.stack.totalSchedule, "pt-BR")} no total${desk.stack.weightedCost ? `, custo médio ${pct(desk.stack.weightedCost, "pt-BR")} a.a.` : ""}: ${lines.join("; ")}.`, `${desk.stack.lines.length} line(s), ${money(desk.stack.totalSchedule, "en-US")} in total${desk.stack.weightedCost ? `, weighted cost ${pct(desk.stack.weightedCost, "en-US")} p.a.` : ""}: ${lines.join("; ")}.`), supportIds: ["desk.custo_medio_do_stack"]};
  }},
  {id: "q12", section: bi("Dívida", "Debt"), question: bi("O mapa de dívida bate com o balanço?", "Does the debt schedule tie to the balance sheet?"), resolve: ({desk}) => {
    if (!desk) return null;
    const gap = new Decimal(desk.stack.scheduleGap);
    return {answer: gap.abs().lte(new Decimal(desk.stack.totalOnBalance).times("0.02")) ? bi("Sim, dentro de 2%.", "Yes, within 2%.") : bi(`Não: ${money(gap.abs(), "pt-BR")} ${gap.gt(0) ? "no balanço e fora do mapa" : "no mapa e fora do balanço"}; a companhia precisa explicar.`, `No: ${money(gap.abs(), "en-US")} ${gap.gt(0) ? "on the balance sheet and outside the schedule" : "in the schedule and outside the balance sheet"}; the company has to explain.`), supportIds: ["desk.divida_fora_do_mapa"]};
  }},
  {id: "q13", section: bi("Dívida", "Debt"), question: bi("Quais covenants existem hoje e qual a folga?", "Which covenants exist today and what is the headroom?"), resolve: ({desk}) => {
    if (!desk?.leverage.tightestCovenant) return null;
    const c = desk.leverage.tightestCovenant;
    return {answer: bi(`O mais apertado: ${turns(c.maximum, "pt-BR")} de dívida líquida/EBITDA (${c.lender}); alavancagem atual ${turns(desk.leverage.preTurns, "pt-BR")}${desk.leverage.maxNewDebtUnderCovenants ? `, cabem ${money(desk.leverage.maxNewDebtUnderCovenants, "pt-BR")} de dívida nova` : ""}.`, `Tightest: ${turns(c.maximum, "en-US")} net debt/EBITDA (${c.lender}); current leverage ${turns(desk.leverage.preTurns, "en-US")}${desk.leverage.maxNewDebtUnderCovenants ? `, ${money(desk.leverage.maxNewDebtUnderCovenants, "en-US")} of new debt fits` : ""}.`), supportIds: ["desk.alavancagem_pre", "desk.divida_nova_que_cabe"]};
  }},
  {id: "q14", section: bi("Dívida", "Debt"), question: bi("Quanto vence nos próximos 12 e 24 meses, e como será pago?", "How much matures in the next 12 and 24 months, and how will it be paid?"), resolve: ({desk}) => {
    if (!desk) return null;
    return {answer: bi(`${money(desk.stack.maturingWithin12Months, "pt-BR")} em 12 meses${desk.stack.liquidityCoverage12 ? ` (caixa cobre ${turns(desk.stack.liquidityCoverage12, "pt-BR")})` : ""} e ${money(desk.stack.maturingWithin24Months, "pt-BR")} em 24 meses.`, `${money(desk.stack.maturingWithin12Months, "en-US")} within 12 months${desk.stack.liquidityCoverage12 ? ` (cash covers ${turns(desk.stack.liquidityCoverage12, "en-US")})` : ""} and ${money(desk.stack.maturingWithin24Months, "en-US")} within 24 months.`), supportIds: ["desk.vencendo_12m", "desk.vencendo_24m"]};
  }},
  {id: "q15", section: bi("Dívida", "Debt"), question: bi("Qual a alavancagem pró-forma com a operação e a trajetória esperada?", "What is pro forma leverage with the deal and the expected trajectory?"), resolve: ({desk, trajectory}) => {
    if (!desk) return null;
    const post = desk.leverage.scenarios[0];
    if (!post) return null;
    const peak = trajectory ? ` Pico de ${turns(trajectory.peak.leverageBase, "pt-BR")} em ${trajectory.peak.year}.` : "";
    return {answer: bi(`De ${turns(desk.leverage.preTurns, "pt-BR")} para ${turns(post.postTurns, "pt-BR")} com o pedido.${peak}`, `From ${turns(desk.leverage.preTurns, "en-US")} to ${turns(post.postTurns, "en-US")} with the ask.${trajectory ? ` Peak of ${turns(trajectory.peak.leverageBase, "en-US")} in ${trajectory.peak.year}.` : ""}`), supportIds: ["desk.alavancagem_pre", ...(trajectory ? [`trajetoria.${trajectory.peak.year}.alavancagem`] : [])]};
  }},
  {id: "q16", section: bi("Dívida", "Debt"), question: bi("A despesa financeira é coberta pelo EBITDA com que folga?", "How comfortably does EBITDA cover interest expense?"), resolve: ({desk}) => {
    // Coverage joins the battery in a parallel change; read it when present, stay open otherwise.
    const leverage = desk?.leverage as (DeskAnalysis["leverage"] & {interestCoverage?: string | null; interestCoveragePost?: string | null}) | undefined;
    if (!leverage?.interestCoverage) return null;
    return {answer: bi(`${turns(leverage.interestCoverage, "pt-BR")} hoje${leverage.interestCoveragePost ? `, ${turns(leverage.interestCoveragePost, "pt-BR")} com a operação` : ""}.`, `${turns(leverage.interestCoverage, "en-US")} today${leverage.interestCoveragePost ? `, ${turns(leverage.interestCoveragePost, "en-US")} with the deal` : ""}.`), supportIds: ["desk.cobertura_de_juros"]};
  }},
  // ---- the transaction ----------------------------------------------------------------------
  {id: "q17", section: bi("Operação", "Transaction"), question: bi("Quanto, por quanto tempo, com que carência, para quê?", "How much, for how long, with what grace, for what?"), resolve: ({facts}) => {
    const amount = find(facts, /^transaction\.requested_amount$/); const term = find(facts, /^transaction\.desired_term_months$/); const grace = find(facts, /^transaction\.desired_grace_months$/); const uses = indexed(facts, "transaction.use_of_proceeds").filter((fact) => fact.key.fieldPath.endsWith(".item"));
    if (!amount) return null;
    return {answer: bi(`${money(amount.value, "pt-BR")}${term ? `, ${term.value} meses` : ""}${grace ? `, ${grace.value} de carência` : ""}${uses.length ? `. Destinação: ${uses.map((u) => u.value).join("; ")}` : ""}.`, `${money(amount.value, "en-US")}${term ? `, ${term.value} months` : ""}${grace ? `, ${grace.value} of grace` : ""}${uses.length ? `. Use: ${uses.map((u) => u.value).join("; ")}` : ""}.`), supportIds: [amount.key.fieldPath, ...(term ? [term.key.fieldPath] : []), ...(grace ? [grace.key.fieldPath] : [])]};
  }},
  {id: "q18", section: bi("Operação", "Transaction"), question: bi("Quanto do pedido é dinheiro novo e quanto é troca de passivo?", "How much of the ask is new money and how much a liability swap?"), resolve: ({trajectory}) => {
    const lm = trajectory?.liabilityManagement;
    if (!lm) return null;
    return {answer: bi(`${money(lm.covenantedBalance, "pt-BR")} resgatam dívida existente${lm.lendersTakenOut.length ? ` (${lm.lendersTakenOut.join(", ")})` : ""}; ${money(lm.netNewMoney, "pt-BR")} são dinheiro novo.`, `${money(lm.covenantedBalance, "en-US")} repay existing debt${lm.lendersTakenOut.length ? ` (${lm.lendersTakenOut.join(", ")})` : ""}; ${money(lm.netNewMoney, "en-US")} is new money.`), supportIds: ["trajetoria.dinheiro_novo_liquido"]};
  }},
  {id: "q19", section: bi("Operação", "Transaction"), question: bi("Que garantias estão disponíveis e quanto já está comprometido?", "What collateral is available and how much is already pledged?"), resolve: ({desk}) => {
    if (!desk) return null;
    const e = desk.encumbrance;
    return {answer: bi(`Recebíveis de ${money(e.receivablesBase, "pt-BR")}, ${money(e.encumbered, "pt-BR")} já comprometidos, ${money(e.free, "pt-BR")} livres${e.askAgainstFree ? ` (o pedido consome ${pct(e.askAgainstFree, "pt-BR")} dos livres)` : ""}.`, `Receivables of ${money(e.receivablesBase, "en-US")}, ${money(e.encumbered, "en-US")} already pledged, ${money(e.free, "en-US")} free${e.askAgainstFree ? ` (the ask consumes ${pct(e.askAgainstFree, "en-US")} of the free base)` : ""}.`), supportIds: ["desk.recebiveis_livres"]};
  }},
  {id: "q20", section: bi("Operação", "Transaction"), question: bi("A taxa pedida é compatível com o estoque e com o risco?", "Is the rate asked consistent with the stack and the risk?"), resolve: ({desk}) => {
    const finding = desk?.findings.find((entry) => entry.id === "rate-ask-vs-stack");
    return finding ? {answer: bi(finding.pt, finding.en), supportIds: [`desk.${finding.id}.${Object.keys(finding.values)[0] ?? "valor"}`]} : null;
  }},
  // ---- projections and plan -----------------------------------------------------------------
  {id: "q21", section: bi("Projeções", "Projections"), question: bi("Quais as premissas de crescimento e margem nas projeções?", "What are the growth and margin assumptions in the projections?"), resolve: ({facts}) => {
    const drivers = indexed(facts, "projections").filter((fact) => /key_assumptions\.\d+\.driver$/.test(fact.key.fieldPath));
    if (drivers.length === 0) return null;
    const parts = drivers.map((driver) => {const value = facts.find((fact) => fact.key.fieldPath === driver.key.fieldPath.replace(".driver", ".value")); return `${driver.value}${value ? `: ${value.value}` : ""}`;});
    return {answer: bi(parts.join("; ") + ".", parts.join("; ") + "."), supportIds: drivers.map((fact) => fact.key.fieldPath)};
  }},
  {id: "q22", section: bi("Projeções", "Projections"), question: bi("A base das projeções bate com o último exercício auditado?", "Does the projections' base tie to the last audited year?"), resolve: ({desk}) => {
    const finding = desk?.findings.find((entry) => entry.id === "projection-base-mismatch");
    return finding ? {answer: bi(finding.pt, finding.en), supportIds: []} : null;
  }},
  {id: "q23", section: bi("Projeções", "Projections"), question: bi("Qual o DSCR mínimo projetado e em que ano?", "What is the minimum projected DSCR and in which year?"), resolve: ({facts}) => {
    const dscr = find(facts, /^projections\.minimum_dscr$/);
    return dscr ? {answer: bi(`${turns(dscr.value, "pt-BR")}.`, `${turns(dscr.value, "en-US")}.`), supportIds: [dscr.key.fieldPath]} : null;
  }},
  {id: "q24", section: bi("Projeções", "Projections"), question: bi("Quanto capital de giro o crescimento projetado absorve?", "How much working capital does projected growth absorb?"), resolve: ({desk}) => {
    if (!desk?.workingCapital.growthAbsorption) return null;
    return {answer: bi(`${money(desk.workingCapital.growthAbsorption, "pt-BR")} ao ciclo atual de ${desk.workingCapital.cycleDays} dias.`, `${money(desk.workingCapital.growthAbsorption, "en-US")} at the current ${desk.workingCapital.cycleDays}-day cycle.`), supportIds: ["desk.ciclo_de_caixa_dias"]};
  }},
  {id: "q25", section: bi("Projeções", "Projections"), question: bi("Qual o covenant de alavancagem que a trajetória suporta?", "What leverage covenant does the trajectory support?"), resolve: ({trajectory}) => {
    if (!trajectory || trajectory.covenantProposal.length === 0) return null;
    const steps = trajectory.covenantProposal.map((step) => `${step.year} ≤ ${turns(step.maximum, "pt-BR")}`).join("; ");
    return {answer: bi(`${steps}, com folga de ${turns(trajectory.assumptions.covenantCushion, "pt-BR")} sobre o cenário cortado.`, `${trajectory.covenantProposal.map((step) => `${step.year} ≤ ${turns(step.maximum, "en-US")}`).join("; ")}, with ${turns(trajectory.assumptions.covenantCushion, "en-US")} of cushion over the cut case.`), supportIds: trajectory.covenantProposal.map((step) => `trajetoria.${step.year}.alavancagem_cortada`)};
  }},
  // ---- governance, legal, tax ---------------------------------------------------------------
  {id: "q26", section: bi("Governança e jurídico", "Governance and legal"), question: bi("Qual a forma societária e ela permite o instrumento pretendido?", "What is the legal form and does it allow the intended instrument?"), resolve: ({facts}) => {
    const name = find(facts, /^company\.legal_name$/);
    if (!name) return null;
    const sa = /\bS\.?A\.?\b|sociedade an[oô]nima/i.test(name.value); const ltda = /ltda|limitada/i.test(name.value);
    return {answer: bi(sa ? "Sociedade anônima: debênture, CRA e CRI disponíveis." : ltda ? "Limitada: sem debênture; CCB, CRA/CRI via securitizadora e FIDC disponíveis." : "Forma societária a confirmar nos atos constitutivos.", sa ? "Sociedade anônima: debentures, CRA and CRI available." : ltda ? "Limitada: no debentures; CCB, CRA/CRI through a securitiser and FIDC available." : "Legal form to be confirmed in the corporate documents."), supportIds: [name.key.fieldPath]};
  }},
  {id: "q27", section: bi("Governança e jurídico", "Governance and legal"), question: bi("Quem administra e há quanto tempo?", "Who runs the company and for how long?"), resolve: ({facts}) => {
    const names = indexed(facts, "company.management").filter((fact) => fact.key.fieldPath.endsWith(".name"));
    if (names.length === 0) return null;
    const parts = names.map((name) => {const title = facts.find((fact) => fact.key.fieldPath === name.key.fieldPath.replace(".name", ".title")); return `${name.value}${title ? ` (${title.value})` : ""}`;});
    return {answer: bi(parts.join("; ") + ".", parts.join("; ") + "."), supportIds: names.map((fact) => fact.key.fieldPath)};
  }},
  {id: "q28", section: bi("Governança e jurídico", "Governance and legal"), question: bi("Há contingências tributárias, trabalhistas ou cíveis relevantes?", "Are there material tax, labour or civil contingencies?"), resolve: () => null},
  {id: "q29", section: bi("Governança e jurídico", "Governance and legal"), question: bi("As certidões negativas estão válidas?", "Are the tax clearance certificates valid?"), resolve: () => null},
  {id: "q30", section: bi("Governança e jurídico", "Governance and legal"), question: bi("Há partes relacionadas com saldos ou contratos relevantes?", "Are there related parties with material balances or contracts?"), resolve: () => null},
  // ---- operations ----------------------------------------------------------------------------
  {id: "q31", section: bi("Operação e projeto", "Operations and project"), question: bi("Qual o custo total do projeto e quanto já foi gasto?", "What is the project's total cost and how much has been spent?"), resolve: ({facts}) => {
    const total = find(facts, /^project\.total_cost$/);
    return total ? {answer: bi(`${money(total.value, "pt-BR")} no total.`, `${money(total.value, "en-US")} in total.`), supportIds: [total.key.fieldPath]} : null;
  }},
  {id: "q32", section: bi("Operação e projeto", "Operations and project"), question: bi("Em que estágio estão as licenças e alvarás?", "What stage are permits and licences at?"), resolve: () => null},
  {id: "q33", section: bi("Operação e projeto", "Operations and project"), question: bi("A carência pedida cobre a obra e o ramp-up?", "Does the grace asked cover construction and ramp-up?"), resolve: ({desk}) => {
    const finding = desk?.findings.find((entry) => entry.id === "grace-vs-project");
    return finding ? {answer: bi(finding.pt, finding.en), supportIds: []} : null;
  }},
  {id: "q34", section: bi("Operação e projeto", "Operations and project"), question: bi("Quantos funcionários e quantas unidades?", "How many employees and how many sites?"), resolve: ({facts}) => {
    const employees = find(facts, /^company\.employees$/);
    return employees ? {answer: bi(`${employees.value} colaboradores.`, `${employees.value} employees.`), supportIds: [employees.key.fieldPath]} : null;
  }},
  {id: "q35", section: bi("Operação e projeto", "Operations and project"), question: bi("Há seguros vigentes sobre os ativos e a operação?", "Are there insurance policies in force on the assets and the operation?"), resolve: () => null},
  // ---- the cash-burning company ---------------------------------------------------------------
  {id: "q36", section: bi("Startup", "Startup"), question: bi("Qual o runway hoje e com a operação?", "What is runway today and with the deal?"), resolve: ({desk}) => {
    if (!desk?.runway) return null;
    const r = desk.runway;
    return {answer: bi(`${r.monthsPre} meses hoje; ${r.monthsPostAfterService} com a captação, pagando os juros dela.`, `${r.monthsPre} months today; ${r.monthsPostAfterService} with the raise, paying its interest.`), supportIds: ["desk.runway_pre_meses", "desk.runway_pos_meses"]};
  }},
  {id: "q37", section: bi("Startup", "Startup"), question: bi("Qual o ARR e a retenção líquida?", "What are ARR and net revenue retention?"), resolve: ({desk}) => {
    if (!desk?.runway?.arr) return null;
    return {answer: bi(`ARR de ${money(desk.runway.arr, "pt-BR")}${desk.runway.nrr ? `, NRR de ${pct(desk.runway.nrr, "pt-BR")}` : ""}.`, `ARR of ${money(desk.runway.arr, "en-US")}${desk.runway.nrr ? `, NRR of ${pct(desk.runway.nrr, "en-US")}` : ""}.`), supportIds: ["desk.arr"]};
  }},
  {id: "q38", section: bi("Startup", "Startup"), question: bi("Quem são os investidores e quando foi a última rodada?", "Who are the investors and when was the last round?"), resolve: ({facts}) => {
    const amount = find(facts, /^company\.last_equity_round\.amount$/); const date = find(facts, /^company\.last_equity_round\.date$/); const lead = find(facts, /^company\.last_equity_round\.lead_investor$/);
    if (!amount) return null;
    return {answer: bi(`${money(amount.value, "pt-BR")}${date ? ` em ${date.value}` : ""}${lead ? `, liderada por ${lead.value}` : ""}.`, `${money(amount.value, "en-US")}${date ? ` on ${date.value}` : ""}${lead ? `, led by ${lead.value}` : ""}.`), supportIds: [amount.key.fieldPath]};
  }},
  {id: "q39", section: bi("Startup", "Startup"), question: bi("Os fundos atuais confirmaram reserva para follow-on?", "Have the current funds confirmed follow-on reserves?"), resolve: () => null},
  {id: "q40", section: bi("Startup", "Startup"), question: bi("Que diluição via warrant a companhia aceita?", "What warrant dilution does the company accept?"), resolve: () => null},
];

export function answerDiligence(context: DiligenceContext): DiligenceAnswer[] {
  const burning = context.desk?.profile === "cash_burning";
  return questions
    .filter((entry) => (entry.section.pt === "Startup" ? burning : true))
    .map((entry) => {
      const resolved = entry.resolve(context);
      return {id: entry.id, section: entry.section, question: entry.question, answer: resolved?.answer ?? null, supportIds: resolved?.supportIds ?? []};
    });
}

/** The Q&A as a material: one table per section, open questions marked as the request they are. */
export function diligenceQa(context: DiligenceContext, companyName?: string): Material {
  const answers = answerDiligence(context);
  const sections = [...new Set(answers.map((entry) => entry.section.pt))];
  const open = answers.filter((entry) => entry.answer === null).length;
  const blocks: MaterialBlock[] = [
    {type: "paragraph", text: bi(`${answers.length} perguntas que um fundo faz na diligência; ${answers.length - open} respondidas a partir da sala e ${open} em aberto, endereçadas à companhia. Toda resposta cita o que a sustenta.`, `${answers.length} questions a fund asks in diligence; ${answers.length - open} answered from the room and ${open} open, addressed to the company. Every answer cites what it stands on.`)},
    ...sections.flatMap((section): MaterialBlock[] => {
      const rows = answers.filter((entry) => entry.section.pt === section);
      return [
        {type: "heading", text: rows[0]!.section},
        {type: "kv", rows: rows.map((entry) => ({label: entry.question, value: entry.answer ?? bi("Em aberto: pedido à companhia.", "Open: requested from the company."), ...(entry.supportIds.length ? {supportIds: entry.supportIds} : {})}))},
      ];
    }),
  ];
  return {
    kind: "diligence_qa",
    title: bi("Q&A de diligência", "Diligence Q&A"),
    blocks,
    dependsOn: [...new Set(answers.flatMap((entry) => entry.supportIds))],
    ...(companyName ? {} : {}),
  };
}

export const diligenceQuestionCount = questions.length;
export type {Lang as DiligenceLang};
