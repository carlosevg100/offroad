import {createHash} from "node:crypto";
import Decimal from "decimal.js";
import {z} from "zod";
import {debtCapacityFactsSchema, proposeDebtCapacityHypotheses, type DebtCapacityFacts} from "@offroad/financial-model";
import {uuidV5} from "./investment-premises-proposal";
import {foldCue, premiseEntry, turnIntentInstruction, turnIntents} from "./premise-cue";

/** The method these premises feed, pinned to its implemented version. */
export const debtCapacityPremiseMethod = {methodId: "assess-debt-capacity", methodVersion: "2026.10.19-v2"} as const;
const fold = foldCue;

/** How much new debt fits: the turn may propose the capacity analysis's premises. While the question
 * is the latest premise question among the messages the agent reads (the last twelve of the
 * conversation), a message that is not a question nor a request for explanation is a continuation
 * candidate, even when it asks for confirmation ("34%, certo?"); the extraction's `turnIntent` decides
 * whether it answers what is pending. */
export function shouldProposeDebtCapacityPremises(message: string, hasAttachments: boolean, earlierUserMessages: readonly string[] = []): boolean {
  return premiseEntry("debt_capacity", message, hasAttachments, earlierUserMessages) !== null;
}

const origin = z.enum(["informed", "document"]);
const sourced = <T extends z.ZodType>(value: T) => z.strictObject({value: value.nullable(), origin: origin.nullable(), source: z.string().max(400).nullable()});
const money = z.string().regex(/^-?\d{1,15}(?:\.\d{1,8})?$/);
const year = z.string().regex(/^\d{4}-12-31$/);
const share = z.number().min(0).max(1);
/** The company situations in which how much new debt fits is the structuring question; the use of the funds decides. */
export const capacitySituations = ["capex-infrastructure", "structural-working-capital", "stable-business-high-conversion", "near-covenant"] as const;
/** Only what the person said or a document states. Absence stays null; nothing is estimated here. */
export const debtCapacityExtractionSchema = z.strictObject({
  turnIntent: z.enum(turnIntents),
  /** What the money is for, as one of the company situations the capacity analysis serves. */
  needSituation: sourced(z.enum(capacitySituations)),
  /** The company's own projection, one item per year (December). */
  projection: sourced(z.array(z.strictObject({yearEnd: year, ebitda: money, leasePayments: money, depreciation: money, maintenanceCapex: money, workingCapitalInvestment: money})).min(2).max(15)),
  openingCash: sourced(money), cashTaxRate: sourced(share),
  /** The covenant's EBITDA excludes lease payments (pre-IFRS 16), as the indenture defines it. */
  covenantEbitdaExcludesLeases: sourced(z.boolean()),
  /** The covenant's maximum net debt to EBITDA, as the indenture states it. */
  covenantLimit: sourced(z.number().min(0).max(20)),
  minimumCash: sourced(money),
  existingDebt: sourced(z.array(z.strictObject({yearEnd: year, closingDebt: money, principalPaid: money, cashInterest: money})).min(2).max(15)),
  existingDebtFinalPaymentDate: sourced(z.iso.date()),
  /** The use the new debt finances: as informed and, when discussed, alternatives; project figures per year. */
  uses: z.array(z.strictObject({
    label: z.string().min(1).max(120), role: z.enum(["informed", "alternative"]), change: z.string().max(300).nullable(),
    years: sourced(z.array(z.strictObject({yearEnd: year, capex: money, ebitda: money, depreciation: money, maintenanceCapex: money, workingCapitalInvestment: money})).min(1).max(15)),
  })).max(3),
  /** The structure of the new debt when stated: indexer and spread or fixed rate, first repayment year, number of equal annual repayments. */
  structure: z.strictObject({label: z.string().max(120).nullable(), indexer: sourced(z.enum(["CDI", "fixed"])), annualSpread: sourced(z.number().min(0).max(0.3)),
    fixedRate: sourced(z.number().min(0).max(0.5)), firstRepaymentYear: sourced(z.number().int().min(2000).max(2100)), repayments: sourced(z.number().int().min(1).max(30))}),
  indexCurve: sourced(z.array(z.strictObject({year: z.number().int().min(2000).max(2100), annualRate: z.number().min(0).max(1)})).min(1).max(30)),
  requestedAmount: sourced(money),
});
export type DebtCapacityExtraction = z.infer<typeof debtCapacityExtractionSchema>;

export const debtCapacityExtractionContract = {
  task: "debt_capacity_extraction" as const,
  system: [
    "Você extrai os dados que permitem medir quanto de dívida nova cabe na companhia, a partir da mensagem de uma pessoa, das mensagens anteriores e de campos já extraídos de documentos (projeção, tabela de dívida, escritura).",
    "Extraia somente o que foi dito ou o que está em documento. Se não estiver, devolva null em value, origin e source. Nunca estime, nunca complete, nunca arredonde por conta própria.",
    "needSituation é o uso dos recursos: investimento (capex-infrastructure), giro estrutural (structural-working-capital), refinanciamento de negócio estável (stable-business-high-conversion) ou companhia perto de covenant (near-covenant). Só preencha se a conversa ou o documento disser.",
    "Valores monetários em reais, sem separador de milhar (R$ 60 milhões vira 60000000). Taxas em fração (CDI + 2,5% vira annualSpread 0.025; alíquota de 34% vira 0.34).",
    "A projeção é anual, um item por ano com data de dezembro (AAAA-12-31): EBITDA, arrendamentos pagos, depreciação, capex de manutenção e investimento em capital de giro (positivo consome caixa).",
    "A dívida vigente também é anual: saldo de fechamento como o covenant conta (inclua linhas rotativas em aberto), principal pago e juros pagos no ano; e a data do último pagamento.",
    "Para o uso que a dívida nova financia, um item por cronograma: o informado e, quando discutida, cada alternativa (por exemplo faseado), com o que muda. Um item para cada ano da projeção, inclusive os anos em que o valor é zero porque foi dito: investimento, EBITDA do projeto, depreciação do projeto, manutenção do projeto e capital de giro do projeto. Se um ano não foi dito, não o inclua. Os números do projeto são só do projeto.",
    "covenantLimit é o limite de dívida líquida sobre EBITDA da escritura; covenantEbitdaExcludesLeases é true quando o EBITDA do covenant exclui arrendamentos (sem IFRS 16). minimumCash é o caixa mínimo que a companhia quer manter, quando dito.",
    "A estrutura da dívida nova só quando dita: indexador (CDI ou prefixado), spread ou taxa, ano da primeira amortização e número de amortizações anuais iguais. indexCurve é o CDI anual por ano, quando houver em documento ou na conversa.",
    "origin é informed quando a pessoa disse, document quando veio de um campo de documento. source cita em poucas palavras de onde veio.",
    turnIntentInstruction,
  ].join("\n"),
  schema: debtCapacityExtractionSchema,
  schemaName: "debt_capacity_extraction_v2",
  outputMode: "prompted_json" as const,
  maxOutputTokens: 6_000,
  cacheKey: "debt-capacity-extraction-2026.10.23-v1",
};

export type CapacityCompletion =
  | {status: "complete"; facts: DebtCapacityFacts; situationId: (typeof capacitySituations)[number]; housePremiseKeys: string[]}
  | {status: "missing"; missing: string[]};
type Sourced<T> = {value: T | null; origin: "informed" | "document" | null; source: string | null};
const Exact = Decimal.clone({precision: 60});
const s20 = (v: Decimal) => v.toDecimalPlaces(20).toFixed();
const key = (label: string, n: number) => (fold(label).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30) || "caso") + (n ? `-${n}` : "");

/** Turns the extraction into the facts the method needs. Required facts nobody stated make the
 * proposal wait; the reply asks for them in one batch. House premises (headroom under the covenant,
 * the market leverage band, the minimum interest coverage, the adverse case and the search
 * resolution) are marked as such; nothing about the company or the project is assumed. */
export function completeDebtCapacityFacts(input: {extraction: DebtCapacityExtraction; ids: {capacityId: string; entityId: string; definitionVersionId: string}; currency: "BRL"}): CapacityCompletion {
  const e = input.extraction, missing: string[] = [], used: string[] = [];
  const need = <T>(name: string, f: Sourced<T>) => {
    if (f.value === null || f.origin === null) {missing.push(name); return null;}
    return {value: f.value, origin: f.origin, source: f.source ?? (f.origin === "informed" ? "Informado na conversa" : "Documento")};
  };
  const situation = need("needSituation", e.needSituation);
  const projection = need("projection", e.projection), opening = need("openingCash", e.openingCash), tax = need("cashTaxRate", e.cashTaxRate);
  const excludes = need("covenantEbitdaExcludesLeases", e.covenantEbitdaExcludesLeases), limit = need("covenantLimit", e.covenantLimit);
  const debt = need("existingDebt", e.existingDebt), finalDebt = need("existingDebtFinalPaymentDate", e.existingDebtFinalPaymentDate);
  const indexer = need("structure.indexer", e.structure.indexer), first = need("structure.firstRepaymentYear", e.structure.firstRepaymentYear), count = need("structure.repayments", e.structure.repayments);
  const rateFact = indexer?.value === "fixed" ? need("structure.fixedRate", e.structure.fixedRate) : indexer ? need("structure.annualSpread", e.structure.annualSpread) : null;
  const curve = indexer?.value === "CDI" ? need("indexCurve", e.indexCurve) : null;
  if (!e.uses.length) missing.push("uses");
  if (e.uses.filter((u) => u.role === "informed").length > 1) missing.push("uses.informed");
  // One informed use and at most one alternative fit in a working basis; a third is asked to be set aside.
  if (e.uses.length > 2) missing.push("uses.atMostTwo");
  const uses = e.uses.map((u, n) => ({u, years: need(`uses.${n + 1}.years`, u.years)}));
  if (missing.length || !situation || !projection || !opening || !tax || !excludes || !limit || !debt || !finalDebt || !indexer || !first || !count || !rateFact || (indexer.value === "CDI" && !curve)) return {status: "missing", missing: [...new Set(missing)]};
  const ends = projection.value.map((p) => p.yearEnd);
  if (ends.some((d, i) => i > 0 && d <= ends[i - 1]!)) return {status: "missing", missing: ["projection"]};
  // The debt table and each use are read on the projection's years; a year off that grid is a question, never a fill.
  const byYear = <T extends {yearEnd: string}>(rows: T[]) => new Map(rows.map((r) => [r.yearEnd, r]));
  const debtRows = byYear(debt.value);
  if (ends.some((d) => !debtRows.has(d))) return {status: "missing", missing: ["existingDebt"]};
  const cases = [];
  for (const [n, {u, years}] of uses.entries()) {
    const rows = byYear(years!.value);
    if ([...rows.keys()].some((d) => !ends.includes(d))) return {status: "missing", missing: [`uses.${n + 1}.years`]};
    // Every year of the projection is stated, zero included; an absent year is a question, never a zero.
    if (ends.some((d) => !rows.has(d))) return {status: "missing", missing: [`uses.${n + 1}.years`]};
    if (u.role === "alternative" && !u.change) return {status: "missing", missing: [`uses.${n + 1}.change`]};
    const col = (k: "capex" | "ebitda" | "depreciation" | "maintenanceCapex" | "workingCapitalInvestment") => ends.map((d) => rows.get(d)![k]);
    cases.push({value: {id: u.role === "informed" ? "informed" : key(u.label, n), role: u.role, label: u.label, changes: u.role === "informed" ? [] : [u.change!],
      capex: col("capex"), ebitda: col("ebitda"), depreciation: col("depreciation"), maintenanceCapex: col("maintenanceCapex"), workingCapitalInvestment: col("workingCapitalInvestment")},
      origin: years!.origin, source: years!.source});
  }
  if (!cases.some((c) => c.value.role === "informed")) cases[0]!.value = {...cases[0]!.value, role: "informed", id: "informed", changes: []};
  // Rate by year and equal annual repayments from the first repayment year.
  // The index of a year is the stated one; every projection year up to the last stated one must be
  // stated, and only the years after it carry the last stated index forward, as a house premise.
  const curveByYear = new Map(curve ? curve.value.map((x) => [x.year, x.annualRate]) : []);
  const lastCurveYear = curve ? Math.max(...curveByYear.keys()) : 0;
  if (curve && ends.some((d) => Number(d.slice(0, 4)) <= lastCurveYear && !curveByYear.has(Number(d.slice(0, 4))))) return {status: "missing", missing: ["indexCurve"]};
  const carried = !!curve && ends.some((d) => Number(d.slice(0, 4)) > lastCurveYear);
  if (carried) used.push("indexCarriedForward");
  const indexOf = (y: number) => new Exact(curveByYear.get(Math.min(y, lastCurveYear))!);
  const rate = ends.map((d) => s20(indexer.value === "fixed" ? new Exact(rateFact.value as number) : indexOf(Number(d.slice(0, 4))).plus(rateFact.value as number)));
  // Equal annual repayments; the last one closes the principal exactly, so the shares add up to one.
  const firstYear = first.value, lastYear = firstYear + count.value - 1, each = new Exact(s20(new Exact(1).div(count.value)));
  const last = new Exact(1).minus(each.times(count.value - 1));
  const shares = ends.map((d) => {const y = Number(d.slice(0, 4)); return y < firstYear || y > lastYear ? "0" : y === lastYear ? s20(last) : each.toFixed();});
  const structureSources = [indexer, rateFact, first, count, ...(curve ? [curve] : [])];
  const covenant = new Exact(limit.value), headroom = new Exact("0.5");
  used.push("covenantHeadroom", "marketLeverage", "interestCoverage", "stress", "monetaryQuantum");
  const limits = [
    {value: {id: "covenant", label: `Covenant de ${covenant.toFixed()}x com folga de 0,5x no caso da companhia`, kind: "maximum_net_debt_to_ebitda" as const,
      base: s20(Decimal.max(covenant.minus(headroom), 0)), adverse: s20(covenant)}, origin: limit.origin, source: `${limit.source}; folga de 0,5x é premissa da casa`},
    {value: {id: "market", label: "Alavancagem de 2,75x acima da qual preço e apetite pioram", kind: "maximum_net_debt_to_ebitda" as const, base: "2.75", adverse: null},
      origin: "house" as const, source: "Faixa de mercado para emissores comparáveis"},
    {value: {id: "interest", label: "Cobertura de juros mínima de 2,5x", kind: "minimum_interest_coverage" as const, base: "2.5", adverse: null},
      origin: "house" as const, source: "Referência de crédito para cobertura de juros"},
    ...(e.minimumCash.value !== null && e.minimumCash.origin !== null ? [{value: {id: "minimum-cash", label: "Caixa mínimo da companhia", kind: "minimum_available_cash" as const,
      base: e.minimumCash.value, adverse: e.minimumCash.value}, origin: e.minimumCash.origin, source: e.minimumCash.source ?? "Informado na conversa"}] : []),
  ];
  const facts = debtCapacityFactsSchema.parse({...input.ids, perimeter: "standalone", currency: input.currency,
    openingDate: `${Number(ends[0]!.slice(0, 4)) - 1}-12-31`, periodEnds: ends,
    company: {openingAvailableCash: opening, cashTaxRate: {...tax, value: String(tax.value)}, covenantEbitdaExcludesLeases: excludes,
      ebitda: {...projection, value: projection.value.map((p) => p.ebitda)}, leasePayments: {...projection, value: projection.value.map((p) => p.leasePayments)},
      depreciation: {...projection, value: projection.value.map((p) => p.depreciation)}, maintenanceCapex: {...projection, value: projection.value.map((p) => p.maintenanceCapex)},
      workingCapitalInvestment: {...projection, value: projection.value.map((p) => p.workingCapitalInvestment)}},
    existingDebt: {...debt, value: {closingDebt: ends.map((d) => debtRows.get(d)!.closingDebt), principalPaid: ends.map((d) => debtRows.get(d)!.principalPaid),
      cashInterest: ends.map((d) => debtRows.get(d)!.cashInterest), finalPaymentDates: [finalDebt.value]}},
    cases,
    structure: {value: {label: e.structure.label ?? (indexer.value === "fixed" ? "Prefixada" : "CDI mais spread"), annualRate: rate, amortizationShares: shares, finalPaymentDate: `${lastYear}-12-31`},
      // An index carried past the last stated year makes the rate an estimate, and the source says so.
      origin: carried ? "estimate" : structureSources.every((x) => x.origin === "document") ? "document" : "informed",
      source: [...structureSources.map((x) => x.source), ...(carried ? [`CDI depois de ${lastCurveYear} mantido no último valor informado, premissa da casa`] : [])].join("; ").slice(0, 2000)},
    limits,
    stress: {ebitdaShock: {value: "0.15", origin: "house", source: "EBITDA 15% menor, o caso que um banco tende a usar"}},
    requestedAmount: e.requestedAmount.value !== null && e.requestedAmount.origin !== null ? {value: e.requestedAmount.value, origin: e.requestedAmount.origin, source: e.requestedAmount.source ?? "Informado na conversa"} : null,
    monetaryQuantum: {value: "10000", origin: "house", source: "Resolução da busca de R$ 10 mil"}});
  return {status: "complete", facts, situationId: situation!.value, housePremiseKeys: [...new Set(used)]};
}

/** The proposal the worker records next to its reply: facts with origin, the hypotheses one
 * confirmation adopts, a short summary for the card and the fingerprint the confirmation checks. */
export function buildDebtCapacityPremiseProposal(facts: DebtCapacityFacts, situationId: (typeof capacitySituations)[number]) {
  const hypotheses = proposeDebtCapacityHypotheses(facts).map((h) => ({...h, dimensions: {...h.dimensions, entityId: null, definitionVersionId: null}}));
  const summary = {
    years: facts.periodEnds.length, firstYear: facts.periodEnds[0]!.slice(0, 4), lastYear: facts.periodEnds.at(-1)!.slice(0, 4),
    requestedAmount: facts.requestedAmount?.value ?? null,
    cases: facts.cases.map((c) => ({id: c.value.id, role: c.value.role, label: c.value.label, use: c.value.capex.reduce((t, x) => t.plus(x), new Exact(0)).toFixed(), origin: c.origin, source: c.source})),
    structure: {label: facts.structure.value.label, finalPaymentDate: facts.structure.value.finalPaymentDate, origin: facts.structure.origin, source: facts.structure.source},
    limits: facts.limits.map((l) => ({id: l.value.id, label: l.value.label, origin: l.origin, source: l.source})),
    premises: [{key: "stress", origin: facts.stress.ebitdaShock.origin, source: facts.stress.ebitdaShock.source}],
    scenarios: ["base", "adverse"], situationId,
  };
  const body = {methodId: debtCapacityPremiseMethod.methodId, methodVersion: debtCapacityPremiseMethod.methodVersion, facts, hypotheses, summary};
  return {...body, fingerprint: createHash("sha256").update(JSON.stringify(body)).digest("hex")};
}

export type CapacityTurnPremises = {
  forAdvisor: {status: "proposed"; summary: ReturnType<typeof buildDebtCapacityPremiseProposal>["summary"]; housePremises: string[]} | {status: "missing"; missing: string[]};
  proposal: ReturnType<typeof buildDebtCapacityPremiseProposal> | null;
};
/** One turn's premise step for a capacity question. It never fails the turn: any error is logged
 * and the turn continues as a plain reply. The capacity identity is stable per work. */
export async function proposeDebtCapacityPremisesForTurn(input: {
  message: string; hasAttachments: boolean; recentUserMessages: string[]; projectId: string | null;
  loadEvidence: () => Promise<unknown>; extract: (text: string) => Promise<unknown>;
  log: (event: string, detail: Record<string, unknown>) => void;
}): Promise<CapacityTurnPremises | null> {
  const entry = input.projectId ? premiseEntry("debt_capacity", input.message, input.hasAttachments, input.recentUserMessages) : null;
  if (!input.projectId || !entry) return null;
  try {
    const documentFields = await input.loadEvidence();
    const extraction = debtCapacityExtractionSchema.parse(await input.extract(JSON.stringify({
      latestUserMessage: input.message, earlierUserMessages: input.recentUserMessages.slice(-6), documentFields})));
    // Only a turn that answers what is pending (or itself asks this question) proposes.
    if (extraction.turnIntent !== "answers_pending") {
      input.log("capacity_premises.not_answering", {turnIntent: extraction.turnIntent, entry});
      return null;
    }
    const capacityId = uuidV5(`offroad:debt-capacity:${input.projectId}`);
    const completed = completeDebtCapacityFacts({extraction, ids: {capacityId, entityId: capacityId, definitionVersionId: capacityId}, currency: "BRL"});
    if (completed.status === "missing") {
      input.log("capacity_premises.missing", {missing: completed.missing});
      return {forAdvisor: {status: "missing", missing: completed.missing}, proposal: null};
    }
    const proposal = buildDebtCapacityPremiseProposal(completed.facts, completed.situationId);
    input.log("capacity_premises.proposed", {hypotheses: proposal.hypotheses.length, housePremises: completed.housePremiseKeys});
    return {forAdvisor: {status: "proposed", summary: proposal.summary, housePremises: completed.housePremiseKeys}, proposal};
  } catch (error) {
    input.log("capacity_premises.failed", {message: error instanceof Error ? error.message.slice(0, 200) : "unknown"});
    return null;
  }
}
