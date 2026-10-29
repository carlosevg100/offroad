import Decimal from "decimal.js";
import {z} from "zod";
import {compileObjectiveToPlan} from "@offroad/work-plan";
import {composeBoundReceivedProposal, prepareReceivedProposalPacket, proposeReceivedProposalHypotheses, receivedProposalFactsSchema, type ReceivedProposalFacts} from "@offroad/financial-model";
import {canonicalJson, citedSource, conflictingKeys, extractedOrigin, factsOrGaps, fingerprintedProposal, itemKeys, itemLabel, itemSource, proposeLote2PremisesForTurn,
  repeatedLabels, sameLabel, sourced, stated, statedLabel, summaryRow, unsourcedFields, withRecordIdentity, type Lote2Completion, type Lote2Summary} from "./lote2-premises";
import {asksOrExplains, foldCue, premiseCueKind, turnIntentInstruction, turnIntents} from "./premise-cue";
import {readerGaps, type BoundBasis} from "./lote3-reader-check";

/** The method these premises feed, pinned to its implemented version. */
export const receivedProposalPremiseMethod = {methodId: "evaluate-received-proposal", methodVersion: "2026.10.27-v1"} as const;

// ---------------------------------------------------------------------------------------------
// Entry. The router's own kind (received_proposal, packages/work-plan/src/received-proposal-route.ts) decides.

const whatIf = /(?:^|[.!?;]\s*|\b(?:mas|e|ok|certo)\s+)e se (?:eu|a gente|nos|o banco|mantiver|mantivermos|mantenho|pedir|pedirmos|peco|negociar|negociarmos|tirar|reduzir|aumentar|alongar|trocar)\b/;

/** Whether a message asks, on its own, whether a received proposal is good for the company (ficha C01). */
export function receivedProposalCue(message: string, hasAttachments: boolean): boolean {
  return (compileObjectiveToPlan({message, hasAttachments}).objectiveKind as string) === "received_proposal";
}

/** How a turn enters this step: by its own cue, or as a continuation candidate when the latest earlier premise
 * question among the recent messages is this one, the message is not a question nor a request for explanation,
 * and it compiles to no other premise method. The extraction's `turnIntent` decides any continuation. */
export function receivedProposalEntry(message: string, hasAttachments: boolean, earlierUserMessages: readonly string[]): "cue" | "continuation" | null {
  if (receivedProposalCue(message, hasAttachments)) return "cue";
  // A what-if on the same proposal ("e se eu mantiver o valor e só negociar a garantia?") asks for a variant of
  // this analysis: a candidate continuation even as a question.
  if (premiseCueKind(message, hasAttachments) !== null || (asksOrExplains(message) && !whatIf.test(foldCue(message)))) return null;
  const compiled: string = compileObjectiveToPlan({message, hasAttachments}).objectiveKind;
  if (["proposal_comparison", "relative_debt_cost", "debt_capacity", "document_folder", "financing_paths", "board_capital_discussion"].includes(compiled)) return null;
  for (let n = earlierUserMessages.length - 1; n >= 0; n--) {
    if (receivedProposalCue(earlierUserMessages[n]!, false)) return "continuation";
    if (premiseCueKind(earlierUserMessages[n]!, false) !== null) return null;
  }
  return null;
}
export function shouldProposeReceivedProposalPremises(message: string, hasAttachments: boolean, earlierUserMessages: readonly string[] = []): boolean {
  return receivedProposalEntry(message, hasAttachments, earlierUserMessages) !== null;
}

// ---------------------------------------------------------------------------------------------
// Extraction: only what the person said or a document states.

const money = z.string().regex(/^\d{1,24}(?:\.\d{1,8})?$/);
const signedMoney = z.string().regex(/^-?\d{1,24}(?:\.\d{1,8})?$/);
const ratio = z.string().regex(/^\d{1,4}(?:\.\d{1,20})?$/);
const signedRatio = z.string().regex(/^-?\d{1,4}(?:\.\d{1,20})?$/);
const count = (max: number) => z.number().int().min(0).max(max);
const date = z.iso.date();
const anchor = z.string().trim().min(1).max(200).nullable();
const item = {label: itemLabel, origin: extractedOrigin, source: itemSource};

/** One reading of the proposal's terms: the term sheet, a later version, or what the person said. */
const proposalReading = z.strictObject({
  origin: extractedOrigin, source: itemSource, anchor,
  lender: itemLabel.nullable(), firmness: z.enum(["indicative", "committed"]).nullable(), termSheetDate: date.nullable(), validityDays: z.number().int().min(1).max(365).nullable(),
  amount: money.nullable(), annualSpread: signedRatio.nullable(), feeRate: ratio.nullable(),
  drawDate: date.nullable(), paymentDay: z.number().int().min(1).max(31).nullable(),
  termMonths: z.number().int().min(1).max(480).nullable(), graceMonths: count(120).nullable(), installments: z.number().int().min(1).max(360).nullable(),
  installmentEveryMonths: z.number().int().min(1).max(12).nullable(), interestEveryMonths: z.number().int().min(1).max(12).nullable(),
  amortization: z.enum(["sac", "bullet", "price", "other"]).nullable(),
  collateralKind: z.enum(["receivables_assignment", "financed_asset", "other_asset", "none"]).nullable(), coverage: ratio.nullable(), restrictedAccount: z.boolean().nullable(),
  covenant: z.union([z.literal("none"), z.strictObject({maximumRatio: ratio.nullable(), testDates: z.array(date).max(24), definition: z.enum(["same_as_indenture", "not_stated"]).nullable()})]).nullable(),
  prepaymentPenaltyRate: ratio.nullable(), prepaymentPenaltyMonths: count(360).nullable(),
  reciprocity: z.enum(["none_stated", "stated"]).nullable(), bankSawIndenture: z.boolean().nullable(),
});
const testedLimit = z.strictObject({maximumRatio: ratio.nullable(), testDates: z.array(date).max(24), document: itemLabel.nullable()});

export const receivedProposalExtractionSchema = z.strictObject({
  turnIntent: z.enum(turnIntents),
  proposalReadings: z.array(proposalReading).max(4),
  indexer: sourced(z.enum(["cdi_plus", "percent_of_cdi", "ipca_plus", "fixed"])),
  readingDate: sourced(date),
  needDate: sourced(date),
  uses: z.array(z.strictObject({...item, amount: money.nullable(), kind: z.enum(["seasonal_working_capital", "long_lived_capex", "refinancing", "other"]).nullable(),
    tenorMinYears: ratio.nullable(), tenorMaxYears: ratio.nullable()})).max(8),
  seasonalPeak: sourced(money),
  creditTax: sourced(z.strictObject({fixedRate: ratio.nullable(), dailyRate: ratio.nullable(), maxDays: count(3660).nullable()})),
  indexCurve: sourced(z.array(z.strictObject({year: z.number().int().min(2000).max(2200), annualRate: signedRatio})).max(40)),
  tax: sourced(z.strictObject({regime: z.enum(["lucro_real", "lucro_presumido", "unknown"]).nullable(), rate: ratio.nullable()})),
  taxableAfterCalendar: sourced(z.boolean()),
  calendar: sourced(z.strictObject({openingDate: date.nullable(), periods: z.array(z.strictObject({periodEnd: date, existingService: money.nullable(),
    availableForService: signedMoney.nullable(), closingCash: signedMoney.nullable(), taxable: z.boolean().nullable()})).max(40)})),
  minimumCash: sourced(money),
  indenture: sourced(testedLimit),
  policy: sourced(testedLimit),
  measurements: sourced(z.array(z.strictObject({date, scenario: z.enum(["base", "bank"]), debt: money.nullable(), cash: signedMoney.nullable(),
    reportedEbitda: signedMoney.nullable(), definitionAdjustment: signedMoney.nullable()})).max(12)),
  portfolio: z.array(z.strictObject({...item, anchor, amount: money, contract: z.enum(["assignable", "prohibited_without_consent"]).nullable(),
    encumbrance: z.enum(["free", "assigned"]).nullable(), holder: itemLabel.nullable(), pastDue: z.boolean().nullable(), countsAgainstBasket: z.boolean().nullable()})).max(12),
  basket: sourced(z.strictObject({limit: money.nullable(), basis: z.enum(["aggregate", "per_operation"]).nullable(), occupied: money.nullable(),
    consentLeadDaysMin: count(365).nullable(), consentLeadDaysMax: count(365).nullable()})),
  collateralReference: sourced(z.strictObject({coverageLow: ratio.nullable(), coverageHigh: ratio.nullable()})),
  market: sourced(z.strictObject({comparable: z.boolean().nullable(), low: ratio.nullable(), median: ratio.nullable(), high: ratio.nullable(),
    sample: z.number().int().min(1).max(10000).nullable(), confidence: z.enum(["high", "moderate", "low"]).nullable(), observedOn: date.nullable()})),
  history: sourced(z.strictObject({label: itemLabel.nullable(), spread: signedRatio.nullable(), date: date.nullable(),
    adjustments: z.array(z.strictObject({label: itemLabel, family: z.enum(["pricing_date", "tenor", "guarantee", "instrument_distribution", "scale", "other"]), bps: signedRatio,
      anchor: itemLabel})).max(8)})),
  variants: z.array(z.strictObject({...item, graceMonths: count(120).nullable(), termMonths: z.number().int().min(1).max(480).nullable(),
    installments: z.number().int().min(1).max(360).nullable(), coverage: ratio.nullable(), restrictedAccount: z.boolean().nullable()})).max(4),
  alternatives: z.array(z.strictObject({...item, allInSpread: z.union([signedRatio, z.literal("not_comparable")]).nullable(), collateral: money.nullable(),
    usesCovered: z.array(itemLabel).max(8), monthsToMoneyMin: count(120).nullable(), monthsToMoneyMax: count(120).nullable()})).max(4),
});
export type ReceivedProposalExtraction = z.infer<typeof receivedProposalExtractionSchema>;

export const receivedProposalExtractionContract = {
  task: "received_proposal_extraction" as const,
  system: [
    "Você extrai os dados que permitem dizer se uma proposta de financiamento recebida serve à companhia que a recebeu: os termos da proposta, o uso do dinheiro, o calendário da companhia sem a proposta, o covenant, a carteira de recebíveis e a exceção da escritura para garantia nova, a partir da mensagem de uma pessoa, das mensagens anteriores e de campos já extraídos de documentos (term sheet, escritura com aditamentos, tabela de dívida, aging da carteira, projeção, demonstrações, ata do conselho).",
    "Extraia somente o que foi dito ou o que está em documento. Se não estiver, devolva null (em value, origin e source, ou no campo) ou lista vazia. Nunca estime, nunca complete, nunca suponha o indexador, nunca invente taxa, curva, alíquota ou referência de mercado.",
    "Valores monetários na unidade em que o documento ou a pessoa os escreveu, sem separador de milhar (R$ 30 milhões vira 30000000). Taxas e percentuais em fração (CDI mais 2,10% ao ano vira annualSpread 0.021; comissão de 0,80% vira feeRate 0.008; cobertura de 130% vira coverage 1.3). Datas no formato AAAA-MM-DD.",
    "proposalReadings: uma entrada por leitura dos termos (o term sheet, uma versão nova, o que a pessoa disse na conversa), cada uma com origin, source e anchor (página ou cláusula, null quando a fonte não diz). Em cada leitura: credor, firmeza (indicative quando sujeita a aprovação de crédito, committed quando firme), data do term sheet, validade em dias, valor, spread anual, comissão, data do desembolso, dia do mês dos pagamentos, prazo total em meses (termMonths), carência de principal em meses, número de parcelas, intervalo entre parcelas e entre pagamentos de juros em meses, amortização (sac, bullet, price ou other), tipo e cobertura da garantia, conta vinculada, covenant do credor (\"none\" quando a leitura diz que não há; limite, datas de teste e definição, not_stated quando a proposta não define), multa de pré-pagamento e por quantos meses, reciprocidade (none_stated quando a proposta não pede) e se o banco viu a escritura. Campo que a leitura não diz fica null.",
    "indexer é o indexador da proposta, só quando o documento ou a pessoa o diz. readingDate é a data da leitura, só quando dita. needDate é quando o dinheiro precisa entrar.",
    "uses: cada uso do dinheiro com valor, tipo (seasonal_working_capital, long_lived_capex, refinancing ou other) e o prazo que o uso pede em anos, mínimo e máximo, convertido do que foi dito (de outubro a março são de 0,25 a 0,5 ano; vida útil de dez anos vai até 10). seasonalPeak é o pico da necessidade sazonal, quando dito.",
    "creditTax é a regra do IOF de crédito (alíquota fixa, diária e teto de dias), só quando um documento ou a pessoa a dá; sem isso, fica null e a convenção da casa é usada. indexCurve é o CDI anual por ano usado na conta. tax é o regime tributário e a alíquota nominal. taxableAfterCalendar é se a companhia segue com lucro tributável depois do último período do calendário, só quando dito.",
    "calendar é a companhia sem a proposta por período (normalmente trimestre): openingDate é a data de início do calendário (a posição do último fechamento); em cada período, a data de fim, o serviço da dívida existente, o caixa disponível para o serviço, o caixa de fim de período e se o período tem lucro tributável. minimumCash é o caixa mínimo de operação, quando dito.",
    "indenture é o covenant da escritura vigente com aditamentos (limite, datas de teste, nome do documento); policy é o limite da política do conselho, quando existir. measurements são as apurações sem a proposta na definição da escritura, por data e cenário (base para o caso da companhia, bank para o caso do banco): dívida, caixa, EBITDA reportado e o ajuste que a definição escrita faz no EBITDA (0 quando a definição não ajusta).",
    "portfolio: cada grupo da carteira de recebíveis com valor, se o contrato permite ceder, se está livre ou cedido e a quem, se está em atraso e, quando cedido, se ocupa a exceção da escritura; anchor é a linha ou célula do aging, null quando a fonte não diz. basket é a exceção da escritura para garantia nova: limite, base (aggregate quando é valor agregado, per_operation quando é por operação), quanto já está ocupado e o prazo de convocação da assembleia em dias, mínimo e máximo.",
    "collateralReference é a faixa de cobertura de garantia de referência, market a faixa de spread de comparáveis (mínimo, mediana, máximo, amostra, confiança, data), history a última operação da companhia com o spread, a data e as parcelas da ponte em pontos-base, cada uma só quando um documento ou a pessoa as dá.",
    "variants são pedidos ao banco que a pessoa quer avaliar (\"e se\"): carência, prazo total ou parcelas, cobertura e conta vinculada; termo que a pessoa não mudou fica null. alternatives são outras rotas da companhia com o custo total sobre o CDI (\"not_comparable\" quando não é CDI mais spread), a garantia, os usos que cobrem pelo rótulo e o prazo até o dinheiro em meses.",
    "origin é informed quando a pessoa disse, document quando veio de um campo de documento; num bloco com campos de fontes diferentes, origin é informed se algum campo veio da pessoa. source cita em poucas palavras de onde veio.",
    turnIntentInstruction,
  ].join("\n"),
  schema: receivedProposalExtractionSchema,
  schemaName: "received_proposal_extraction_v1",
  outputMode: "prompted_json" as const,
  maxOutputTokens: 16_000,
  cacheKey: "received-proposal-extraction-2026.10.27-v1",
};

// ---------------------------------------------------------------------------------------------
// Completion: the extraction into the method's facts, or the gaps it leaves.

type Reading = ReceivedProposalExtraction["proposalReadings"][number];
type Origin = "document" | "informed" | "house";
const termFields = ["lender", "firmness", "validityDays", "amount", "annualSpread", "feeRate", "termMonths", "graceMonths", "installments", "installmentEveryMonths",
  "interestEveryMonths", "amortization", "collateralKind", "coverage", "restrictedAccount", "covenant", "prepaymentPenaltyRate", "prepaymentPenaltyMonths", "reciprocity"] as const;
const clauseFields = ["drawDate", "paymentDay", "termSheetDate", "bankSawIndenture"] as const;
type ReadingField = (typeof termFields)[number] | (typeof clauseFields)[number];

const joined = (sources: readonly string[]) => [...new Set(sources.map((s) => s.trim()).filter(Boolean))].join("; ").slice(0, 2000);

/** One reconciled term: equal readings are one value, and a document reading makes it documented; different
 * readings are asked, never resolved by order. */
function reconcileField<F extends ReadingField>(readings: readonly Reading[], field: F, missing: string[]): {value: NonNullable<Reading[F]>; origin: Origin; source: string} | null {
  const stating = readings.filter((r) => r[field] !== null);
  if (!stating.length) return null;
  const value = (r: Reading) => field === "lender" ? statedLabel(r.lender!) : canonicalJson(r[field], field === "covenant" ? "covenant" : "value");
  if (new Set(stating.map(value)).size > 1) {missing.push(`proposal.${field}`); return null;}
  const documented = stating.filter((r) => r.origin === "document");
  const origin: Origin = documented.length ? "document" : "informed";
  const source = documented.length && documented.length < stating.length ? `${joined(documented.map((r) => citedSource("document", r.source)))} (também informado na conversa)`
    : joined(stating.map((r) => citedSource(r.origin, r.source)));
  return {value: stating[0]![field] as NonNullable<Reading[F]>, origin, source};
}

/** The house convention for the credit IOF of a company outside the Simples: 0.38% fixed plus 0.0082% a day, capped at 365
 * days. Named on the card with its source and date; the person corrects it in the conversation. */
export const houseCreditTax = {value: {fixedRate: "0.0038", dailyRate: "0.000082", maxDays: 365}, origin: "house" as const,
  source: "IOF de crédito de pessoa jurídica fora do Simples: 0,38% fixo mais 0,0082% ao dia, com teto de 365 dias (Decreto 6.306/2007, na redação do Decreto 12.499/2025, com eficácia restabelecida pelo STF em 2025). Convenção da casa em 27/10/2026; um valor informado ou de documento prevalece."};

/** A block of one origin whose fields may be partly stated: each unstated field it needs is asked by name. */
function block<T extends Record<string, unknown>>(f: {value: T | null; origin: "informed" | "document" | null; source: string | null}, name: string, required: readonly (keyof T & string)[], missing: string[]) {
  const s = stated(f);
  if (!s) return null;
  const before = missing.length;
  for (const k of required) if (s.value[k] === null || s.value[k] === undefined) missing.push(`${name}.${k}`);
  return missing.length > before ? null : s;
}

/** Contradictions inside one record of the turn, each named by its field: asked, never resolved. */
export function receivedProposalContradictions(e: ReceivedProposalExtraction): string[] {
  const out: string[] = [], d = (x: string) => new Decimal(x);
  for (const [name, f] of [["indenture", e.indenture], ["policy", e.policy]] as const)
    if (f.value && new Set(f.value.testDates).size !== f.value.testDates.length) out.push(`${name}.testDates`);
  e.proposalReadings.forEach((r) => {
    if (r.covenant && r.covenant !== "none" && new Set(r.covenant.testDates).size !== r.covenant.testDates.length) out.push("proposal.covenant");
    if (r.amortization === "bullet" && r.installments !== null && r.installments !== 1) out.push("proposal.installments");
    if (r.collateralKind === "none" && r.coverage !== null && d(r.coverage).gt(0)) out.push("proposal.coverage");
  });
  const t = e.tax.value;
  if (t?.rate && d(t.rate).gt(1)) out.push("tax.rate");
  const b = e.basket.value;
  if (b && b.consentLeadDaysMin !== null && b.consentLeadDaysMax !== null && b.consentLeadDaysMin > b.consentLeadDaysMax) out.push("basket.consentLeadDays");
  if (b && b.limit !== null && d(b.limit).lte(0)) out.push("basket.limit");
  if (b && b.limit !== null && b.occupied !== null && b.basis === "aggregate" && d(b.occupied).gt(d(b.limit))) out.push("basket.occupied");
  // What the portfolio shows assigned under the basket must be in it: the basket is never read as emptier than the portfolio shows.
  const inBasket = e.portfolio.filter((p) => p.encumbrance === "assigned" && p.countsAgainstBasket === true).reduce((s, p) => s.plus(p.amount), new Decimal(0));
  if (b?.occupied != null && d(b.occupied).lt(inBasket)) out.push("basket.occupied");
  const c = e.collateralReference.value;
  if (c && c.coverageLow !== null && c.coverageHigh !== null && d(c.coverageLow).gt(d(c.coverageHigh))) out.push("collateralReference");
  const m = e.market.value;
  if (m && m.low !== null && m.median !== null && m.high !== null && !(d(m.low).lte(d(m.median)) && d(m.median).lte(d(m.high)))) out.push("market");
  e.portfolio.forEach((p, k) => {
    const q = `portfolio.${k + 1}.`;
    if (p.encumbrance === "free" && p.holder !== null) out.push(q + "holder");
    if (p.encumbrance === "free" && p.countsAgainstBasket === true) out.push(q + "countsAgainstBasket");
  });
  e.uses.forEach((u, k) => {
    if (u.tenorMinYears !== null && u.tenorMaxYears !== null && d(u.tenorMinYears).gt(d(u.tenorMaxYears))) out.push(`uses.${k + 1}.tenor`);
    if (u.amount !== null && d(u.amount).lte(0)) out.push(`uses.${k + 1}.amount`);
  });
  e.alternatives.forEach((a, k) => {if (a.monthsToMoneyMin !== null && a.monthsToMoneyMax !== null && a.monthsToMoneyMin > a.monthsToMoneyMax) out.push(`alternatives.${k + 1}.monthsToMoney`);});
  return [...new Set(out)];
}

/** Term, grace and installments are one fact stated three ways (term = grace + installments x interval): two derive
 * the third; three that disagree are asked. A bullet has one installment. */
function structure(term: number | null, grace: number | null, installments: number | null, every: number | null, bullet: boolean, at: string, missing: string[]) {
  const n = installments ?? (bullet ? 1 : null);
  if (every === null) return {grace, installments: n};
  if (term !== null && grace !== null && n !== null && grace + n * every !== term) {missing.push(`${at}.termMonths`); return {grace: null, installments: null};}
  if (term !== null && grace !== null && n === null) {
    const k = (term - grace) / every;
    if (!Number.isInteger(k) || k < 1) {missing.push(`${at}.termMonths`); return {grace, installments: null};}
    return {grace, installments: k};
  }
  if (term !== null && grace === null && n !== null) {
    const g = term - n * every;
    if (g < 0) {missing.push(`${at}.termMonths`); return {grace: null, installments: n};}
    return {grace: g, installments: n};
  }
  return {grace, installments: n};
}

/** Missing keys in the order the procedure weighs them: purpose and collateral are critical, capacity and the
 * clauses in force grave, terms and regime light. Order inside a tier is the order found. */
const tierOf = (key: string) => /^(?:uses|indexer)\b/.test(key) ? 0 : /^(?:portfolio|basket|proposal\.(?:collateralKind|coverage|restrictedAccount|amount))\b/.test(key) ? 1
  : /^(?:calendar|measurements|indenture|policy|needDate|proposal\.covenant)\b/.test(key) ? 2 : 3;
export const receivedProposalGapOrder = (missing: readonly string[]) => [...new Set(missing)].map((k, n) => [k, n] as const)
  .sort((a, b) => tierOf(a[0]) - tierOf(b[0]) || a[1] - b[1]).map(([k]) => k);

/** The dominant use names the situation: the largest use's kind. */
const situationOf = (facts: ReceivedProposalFacts) => {
  const top = [...facts.uses].sort((a, b) => new Decimal(b.value.amount).cmp(new Decimal(a.value.amount)))[0]!.value.kind;
  return top === "seasonal_working_capital" ? "seasonal-working-capital" : top === "long_lived_capex" ? "capex-infrastructure" : top === "refinancing" ? "refinancing" : "structural-working-capital";
};

/** Turns the extraction into the facts the method needs. Every term, use, calendar series, covenant test, bucket
 * and basket term is the company's or its documents': a value no source states is asked, in one batch. House
 * premises carry their own origin and are named: the reading date is the date of the turn, the scenarios the
 * covenant is read in are the company's case and the bank's case (procedure), the draw on the date the money is
 * needed and payments on the day of the draw when the proposal does not state them. The indexer is never assumed.
 * The market range, the last operation, the bank asks and the company's alternatives enter only when stated. */
export function completeReceivedProposalFacts(input: {extraction: ReceivedProposalExtraction; ids: {receivedProposalId: string; entityId: string; definitionVersionId: string};
  currency: "BRL"; today: string}): Lote2Completion<ReceivedProposalFacts> {
  const missing: string[] = [], used: string[] = [];
  const identified = withRecordIdentity(input.extraction, {keyed: ["uses", "variants", "alternatives"], countable: ["portfolio"]}, missing);
  const e = identified.e;
  missing.push(...unsourcedFields(e as unknown as Record<string, unknown>));
  missing.push(...receivedProposalContradictions(e));

  // The proposal: each term reconciled across its readings.
  const r = Object.fromEntries([...termFields, ...clauseFields].map((f) => [f, reconcileField(e.proposalReadings, f, missing)])) as {[K in ReadingField]: {value: NonNullable<Reading[K]>; origin: Origin; source: string} | null};
  if (!e.proposalReadings.length) missing.push("proposal");
  const indexer = stated(e.indexer);
  if (!indexer) missing.push("indexer");
  else if (indexer.value !== "cdi_plus") missing.push("indexer.unsupported");
  if (r.amortization && r.amortization.value !== "sac" && r.amortization.value !== "bullet") missing.push("proposal.amortization.unsupported");
  const every = r.installmentEveryMonths?.value ?? null;
  const shape = structure(r.termMonths?.value ?? null, r.graceMonths?.value ?? null, r.installments?.value ?? null, every, r.amortization?.value === "bullet", "proposal", missing);
  const needDate = stated(e.needDate);
  if (!needDate) missing.push("needDate");
  // House: the draw on the date the money is needed; payments on the day of the draw.
  const draw = r.drawDate ?? (needDate ? {value: needDate.value, origin: "house" as const, source: "Desembolso adotado na data em que o dinheiro precisa entrar"} : null);
  if (!r.drawDate && draw) used.push("drawDate");
  const drawDay = draw ? Number(draw.value.slice(8)) : null;
  const paymentDay = r.paymentDay ?? (drawDay !== null && drawDay <= 28 ? {value: drawDay, origin: "house" as const, source: "Pagamentos no dia do mês do desembolso"} : null);
  if (!r.paymentDay && paymentDay) used.push("paymentDay");
  if (!paymentDay && draw) missing.push("proposal.paymentDay");
  const coverage = r.coverage ?? (r.collateralKind?.value === "none" ? {value: "0", origin: r.collateralKind.origin, source: r.collateralKind.source} : null);
  for (const [k, v] of [["lender", r.lender], ["firmness", r.firmness], ["termSheetDate", r.termSheetDate], ["validityDays", r.validityDays], ["amount", r.amount],
    ["annualSpread", r.annualSpread], ["feeRate", r.feeRate], ["installmentEveryMonths", r.installmentEveryMonths], ["interestEveryMonths", r.interestEveryMonths],
    ["amortization", r.amortization], ["collateralKind", r.collateralKind], ["coverage", coverage], ["restrictedAccount", r.restrictedAccount], ["covenant", r.covenant],
    ["prepaymentPenaltyRate", r.prepaymentPenaltyRate], ["prepaymentPenaltyMonths", r.prepaymentPenaltyMonths], ["reciprocity", r.reciprocity],
    ["bankSawIndenture", r.bankSawIndenture]] as const) if (!v && e.proposalReadings.length) missing.push(`proposal.${k}`);
  if (e.proposalReadings.length && shape.grace === null && !missing.includes("proposal.termMonths")) missing.push("proposal.graceMonths");
  if (e.proposalReadings.length && shape.installments === null && !missing.includes("proposal.termMonths")) missing.push("proposal.installments");
  const covenant = r.covenant?.value;
  if (covenant && covenant !== "none") {
    if (covenant.maximumRatio === null) missing.push("proposal.covenant.maximumRatio");
    if (!covenant.testDates.length) missing.push("proposal.covenant.testDates");
    if (covenant.definition === null) missing.push("proposal.covenant.definition");
  }

  // The company: uses, calendar, covenant, portfolio, basket and references.
  if (!e.uses.length) missing.push("uses");
  for (const k of repeatedLabels(e.uses.map((u) => u.label))) missing.push(`uses.${k}.label`);
  const useIds = itemKeys(e.uses.map((u) => u.label));
  const uses = e.uses.map((u, k) => {
    const before = missing.length;
    for (const f of ["amount", "kind", "tenorMinYears", "tenorMaxYears"] as const) if (u[f] === null) missing.push(`uses.${k + 1}.${f}`);
    return missing.length > before ? null : {value: {id: useIds[k]!, label: u.label, amount: u.amount!, kind: u.kind!, tenorMinYears: u.tenorMinYears!, tenorMaxYears: u.tenorMaxYears!},
      origin: u.origin, source: citedSource(u.origin, u.source)};
  });
  // House: the credit IOF of a company outside the Simples when neither the person nor a document gives it (decision 1);
  // a stated rule prevails, and a rule stated in part is asked field by field.
  const creditTax = stated(e.creditTax) ? block(e.creditTax, "creditTax", ["fixedRate", "dailyRate", "maxDays"], missing) : houseCreditTax;
  if (!stated(e.creditTax)) used.push("creditTax");
  const curve = stated(e.indexCurve);
  if (!curve || !curve.value.length) missing.push("indexCurve");
  else if (conflictingKeys(curve.value, (x) => String(x.year), (x) => x.annualRate).size) missing.push("indexCurve.year");
  const tax = block(e.tax, "tax", ["regime", "rate"], missing);
  if (!stated(e.tax)) missing.push("tax");
  const calendar = stated(e.calendar);
  if (!calendar) missing.push("calendar");
  const periods = calendar ? [...new Map(calendar.value.periods.map((p) => [`${p.periodEnd}|${canonicalJson(p)}`, p])).values()].sort((a, b) => a.periodEnd < b.periodEnd ? -1 : 1) : [];
  if (calendar) {
    if (calendar.value.openingDate === null) missing.push("calendar.openingDate");
    if (!periods.length) missing.push("calendar.periods");
    // The same period end read twice with other values is asked, never resolved by order.
    for (const end of conflictingKeys(periods, (p) => p.periodEnd, (p) => p)) missing.push(`calendar.periods.${end}`);
    periods.forEach((p) => {for (const f of ["existingService", "availableForService", "closingCash", "taxable"] as const) if (p[f] === null) missing.push(`calendar.periods.${p.periodEnd}.${f}`);});
    const opening = calendar.value.openingDate;
    if (opening !== null && periods.some((p) => p.periodEnd <= opening)) missing.push("calendar.openingDate");
    if (opening !== null && draw && periods.length && (draw.value <= opening || draw.value > periods.at(-1)!.periodEnd)) missing.push("calendar.periods");
  }
  const uniquePeriods = [...new Map(periods.map((p) => [p.periodEnd, p])).values()];
  const indenture = block(e.indenture, "indenture", ["maximumRatio"], missing);
  if (!stated(e.indenture)) missing.push("indenture");
  if (indenture && !indenture.value.testDates.length) missing.push("indenture.testDates");
  const policyStated = stated(e.policy);
  const policy = policyStated ? block(e.policy, "policy", ["maximumRatio"], missing) : null;
  if (policy && !policy.value.testDates.length) missing.push("policy.testDates");
  const measured = stated(e.measurements);
  const rows = measured ? [...new Map(measured.value.map((m) => [canonicalJson(m), m])).values()] : [];
  if (!measured || !rows.length) missing.push("measurements");
  for (const k of conflictingKeys(rows, (m) => `${m.date}|${m.scenario}`, (m) => m)) missing.push(`measurements.${k.replaceAll("|", ".")}`);
  rows.forEach((m) => {
    for (const f of ["debt", "cash", "reportedEbitda", "definitionAdjustment"] as const) if (m[f] === null) missing.push(`measurements.${m.date}.${m.scenario}.${f}`);
    if (calendar && !uniquePeriods.some((p) => p.periodEnd === m.date)) missing.push(`measurements.${m.date}.${m.scenario}.date`);
  });
  const uniqueRows = [...new Map(rows.map((m) => [`${m.date}|${m.scenario}`, m])).values()];
  if (!e.portfolio.length) missing.push("portfolio");
  const bucketIds = itemKeys(e.portfolio.map((p) => p.label));
  const portfolio = e.portfolio.map((p, k) => {
    const q = `portfolio.${k + 1}.`, before = missing.length;
    for (const f of ["contract", "encumbrance", "pastDue"] as const) if (p[f] === null) missing.push(q + f);
    if (p.encumbrance === "assigned" && p.holder === null) missing.push(q + "holder");
    if (p.encumbrance === "assigned" && p.countsAgainstBasket === null) missing.push(q + "countsAgainstBasket");
    if (missing.length > before) return null;
    // A free bucket cannot occupy the basket: false follows from what is stated, never from absence.
    return {value: {id: bucketIds[k]!, label: p.label, amount: p.amount, contract: p.contract!, encumbrance: p.encumbrance!, holder: p.encumbrance === "assigned" ? p.holder : null,
      pastDue: p.pastDue!, countsAgainstBasket: p.encumbrance === "assigned" ? p.countsAgainstBasket! : false}, origin: p.origin, source: citedSource(p.origin, p.source)};
  });
  const basket = block(e.basket, "basket", ["limit", "basis", "occupied", "consentLeadDaysMin", "consentLeadDaysMax"], missing);
  if (!stated(e.basket)) missing.push("basket");
  const reference = block(e.collateralReference, "collateralReference", ["coverageLow", "coverageHigh"], missing);
  if (!stated(e.collateralReference)) missing.push("collateralReference");
  const marketStated = stated(e.market);
  const market = marketStated ? block(e.market, "market", ["comparable", "low", "median", "high", "sample", "confidence", "observedOn"], missing) : null;
  const historyStated = stated(e.history);
  const history = historyStated ? block(e.history, "history", ["label", "spread", "date"], missing) : null;
  if (history && conflictingKeys(history.value.adjustments, (a) => statedLabel(a.label), (a) => a).size) missing.push("history.adjustments");
  const historyIds = history ? itemKeys(history.value.adjustments.map((a) => a.label)) : [];
  for (const k of repeatedLabels(e.variants.map((v) => v.label))) missing.push(`variants.${k}.label`);
  const variantIds = itemKeys(e.variants.map((v) => v.label));
  const variants = e.variants.map((v, k) => {
    // An ask that changes no term is asked what it changes; a term the person did not change stays as the proposal states it.
    if ([v.graceMonths, v.termMonths, v.installments, v.coverage, v.restrictedAccount].every((x) => x === null)) {missing.push(`variants.${k + 1}.terms`); return null;}
    const grace = v.graceMonths ?? shape.grace;
    const s = structure(v.termMonths, grace, v.installments ?? (v.termMonths !== null ? null : shape.installments), every, r.amortization?.value === "bullet", `variants.${k + 1}`, missing);
    const cov = v.coverage ?? coverage?.value ?? null, account = v.restrictedAccount ?? r.restrictedAccount?.value ?? null;
    // A term the proposal leaves unresolved is already asked there; the ask waits for it.
    if (s.grace === null || s.installments === null || cov === null || account === null) {if (!missing.some((x) => x.startsWith("proposal"))) missing.push(`variants.${k + 1}`); return null;}
    const kept = [v.graceMonths === null ? "carência" : null, v.termMonths === null && v.installments === null ? "parcelas" : null, v.coverage === null ? "cobertura" : null,
      v.restrictedAccount === null ? "conta vinculada" : null].filter((x) => x !== null);
    return {value: {id: variantIds[k]!, label: v.label, graceMonths: s.grace, installments: s.installments, coverage: cov, restrictedAccount: account},
      origin: v.origin, source: `${citedSource(v.origin, v.source)}${kept.length ? `; ${kept.join(", ")} como na proposta` : ""}`};
  });
  for (const k of repeatedLabels(e.alternatives.map((a) => a.label))) missing.push(`alternatives.${k}.label`);
  const alternativeIds = itemKeys(e.alternatives.map((a) => a.label));
  const alternatives = e.alternatives.map((a, k) => {
    const q = `alternatives.${k + 1}.`, before = missing.length;
    for (const f of ["allInSpread", "collateral", "monthsToMoneyMin", "monthsToMoneyMax"] as const) if (a[f] === null) missing.push(q + f);
    const covered = a.usesCovered.map((l) => e.uses.findIndex((u) => sameLabel(u.label, l)));
    if (!covered.length || covered.some((x) => x < 0)) missing.push(q + "usesCovered");
    if (missing.length > before) return null;
    return {value: {id: alternativeIds[k]!, label: a.label, allInSpread: a.allInSpread === "not_comparable" ? null : a.allInSpread, collateral: a.collateral!,
      usesCovered: [...new Set(covered.map((x) => useIds[x]!))], monthsToMoneyMin: a.monthsToMoneyMin!, monthsToMoneyMax: a.monthsToMoneyMax!}, origin: a.origin, source: citedSource(a.origin, a.source)};
  });
  // House: the reading date is the date of this turn when nobody states it.
  const reading = stated(e.readingDate) ?? {value: input.today, origin: "house" as const, source: "Data desta leitura"};
  if (!stated(e.readingDate)) used.push("readingDate");
  if (draw && reading.value > draw.value) missing.push("proposal.drawDate");

  if (missing.length) return {status: "missing", missing: receivedProposalGapOrder(missing)};
  const terms = [r.lender, r.firmness, r.validityDays, r.amount, r.annualSpread, r.feeRate, r.installmentEveryMonths, r.interestEveryMonths, r.amortization, r.collateralKind,
    coverage, r.restrictedAccount, r.covenant, r.prepaymentPenaltyRate, r.prepaymentPenaltyMonths, r.reciprocity, r.graceMonths, r.installments, r.termMonths].filter((x) => x !== null);
  const documented = terms.every((x) => x!.origin === "document");
  const proposalOrigin: Origin = documented ? "document" : "informed";
  const proposalSource = joined(terms.map((x) => x!.source));
  const cov = covenant === "none" ? null : covenant!;
  const clause = (x: {origin: Origin; source: string}) => ({origin: x.origin, source: x.source});
  const opening = calendar!.value.openingDate!;
  // The covenant is read in the company's case and in the bank's case (procedure, inputs).
  const scenarios = {value: ["base", "bank"], origin: "house" as const, source: "Covenant lido no caso da companhia e no caso do banco (procedimento evaluate-received-proposal)"};
  used.push("covenantScenarios");
  const parsed = factsOrGaps(receivedProposalFactsSchema, {...input.ids, perimeter: "standalone", currency: input.currency, openingDate: opening,
    readingDate: reading, needDate: needDate!,
    proposal: {value: {lender: r.lender!.value!, firmness: r.firmness!.value!, termSheetDate: r.termSheetDate!.value!, validityDays: r.validityDays!.value!, amount: r.amount!.value!,
      annualSpread: r.annualSpread!.value!, feeRate: r.feeRate!.value!, drawDate: draw!.value, paymentDay: paymentDay!.value, graceMonths: shape.grace!, installments: shape.installments!,
      installmentEveryMonths: every!, interestEveryMonths: r.interestEveryMonths!.value!, amortization: r.amortization!.value!, collateralKind: r.collateralKind!.value!,
      coverage: coverage!.value!, restrictedAccount: r.restrictedAccount!.value!,
      covenant: cov === null ? null : {maximumRatio: cov.maximumRatio!, testDates: [...cov.testDates], definition: cov.definition!},
      prepayment: {penaltyRate: r.prepaymentPenaltyRate!.value!, penaltyMonths: r.prepaymentPenaltyMonths!.value!}, reciprocity: r.reciprocity!.value!,
      bankSawIndenture: r.bankSawIndenture!.value!}, origin: proposalOrigin, source: proposalSource},
    indexer: indexer!, provenance: {drawDate: clause(draw!), paymentDay: clause(paymentDay!), termSheetDate: clause(r.termSheetDate!), bankSawIndenture: clause(r.bankSawIndenture!)},
    creditTax: creditTax!, indexCurve: curve!, tax: tax!, taxableAfterCalendar: stated(e.taxableAfterCalendar),
    uses: uses.map((u) => u!), seasonalPeak: stated(e.seasonalPeak),
    calendar: {value: {periodEnds: uniquePeriods.map((p) => p.periodEnd), existingService: uniquePeriods.map((p) => p.existingService!),
      availableForService: uniquePeriods.map((p) => p.availableForService!), closingCash: uniquePeriods.map((p) => p.closingCash!), taxable: uniquePeriods.map((p) => p.taxable!)},
      origin: calendar!.origin, source: calendar!.source},
    minimumCash: stated(e.minimumCash),
    indenture: {value: {maximumRatio: indenture!.value.maximumRatio!, testDates: [...indenture!.value.testDates], source: indenture!.value.document ?? indenture!.source},
      origin: indenture!.origin, source: indenture!.source},
    covenantScenarios: scenarios,
    policy: policy ? {value: {maximumRatio: policy.value.maximumRatio!, testDates: [...policy.value.testDates], source: policy.value.document ?? policy.source}, origin: policy.origin, source: policy.source} : null,
    measurements: {value: uniqueRows.map((m) => ({date: m.date, scenario: m.scenario, debt: m.debt!, cash: m.cash!, reportedEbitda: m.reportedEbitda!, definitionAdjustment: m.definitionAdjustment!})),
      origin: measured!.origin, source: measured!.source},
    portfolio: portfolio.map((p) => p!), basket: basket!, collateralReference: reference!,
    market: market ? {value: {comparable: market.value.comparable!, low: market.value.low!, median: market.value.median!, high: market.value.high!, sample: market.value.sample!,
      confidence: market.value.confidence!, observedOn: market.value.observedOn!}, origin: market.origin, source: market.source} : null,
    history: history ? {value: {label: history.value.label!, spread: history.value.spread!, date: history.value.date!,
      adjustments: history.value.adjustments.map((a, k) => ({id: historyIds[k]!, family: a.family, bps: a.bps, anchor: a.anchor}))}, origin: history.origin, source: history.source} : null,
    variants: variants.map((v) => v!), alternatives: alternatives.map((a) => a!),
  });
  if (!parsed.ok) return {status: "missing", missing: receivedProposalGapOrder(parsed.missing)};
  return {status: "complete", facts: parsed.facts, situationId: situationOf(parsed.facts), housePremiseKeys: [...new Set(used)]};
}

// ---------------------------------------------------------------------------------------------
// Card, reader check and turn.

/** The method's own reader and packet over a basis, as the confirmation will run them. */
export const receivedProposalReader = (b: BoundBasis) =>
  prepareReceivedProposalPacket(composeBoundReceivedProposal({...b, question: "Verificação das premissas antes da confirmação"}));
export function receivedProposalReaderGaps(facts: ReceivedProposalFacts): string[] {
  return readerGaps(proposeReceivedProposalHypotheses(facts), receivedProposalReader);
}

/** The card: the proposal, each use, the calendar, the limits and tests, each bucket, the basket, the references,
 * each ask and alternative, and the house premises named as such. */
export function receivedProposalSummary(facts: ReceivedProposalFacts): Lote2Summary {
  const row = summaryRow, p = facts.provenance ?? {};
  return {situationId: situationOf(facts), referenceDate: facts.readingDate.value, items: [
    row("instrument", facts.proposal.value.lender, facts.proposal, "receivedProposal"),
    ...facts.indexer ? [row("premise", "Indexador", facts.indexer, "indexer")] : [],
    ...(["drawDate", "paymentDay"] as const).flatMap((k) => p[k]?.origin === "house" ? [row("premise", k, p[k]!, k)] : []),
    ...facts.uses.map((u) => row("premise", u.value.label, u, "use")),
    row("premise", "Data em que o dinheiro precisa entrar", facts.needDate, "needDate"),
    row("premise", "Data da leitura", facts.readingDate, "readingDate"),
    row("stream", "Calendário da companhia sem a proposta", facts.calendar, "companyCalendar"),
    ...facts.minimumCash ? [row("premise", "Caixa mínimo de operação", facts.minimumCash, "minimumCash")] : [],
    ...facts.seasonalPeak ? [row("premise", "Pico da necessidade sazonal", facts.seasonalPeak, "seasonalPeak")] : [],
    row("limit", facts.indenture.value.source, facts.indenture, "indentureLimit"),
    ...facts.policy ? [row("limit", facts.policy.value.source, facts.policy, "boardPolicy")] : [],
    row("limit", "Exceção da escritura para garantia nova", facts.basket, "indentureBasket"),
    row("case", "Caso da companhia e caso do banco", facts.covenantScenarios, "covenantScenarios"),
    row("measurement", "Apurações sem a proposta", facts.measurements, "covenantMeasurements"),
    ...facts.portfolio.map((b) => row("item", b.value.label, b)),
    row("premise", "Faixa de cobertura de referência", facts.collateralReference, "collateralReference"),
    row("premise", "IOF de crédito", facts.creditTax, "creditTax"),
    row("premise", "CDI anual por ano", facts.indexCurve, "indexCurve"),
    row("premise", "Regime tributário e alíquota", facts.tax, "tax"),
    ...facts.taxableAfterCalendar ? [row("premise", "Lucro tributável depois do calendário", facts.taxableAfterCalendar, "taxableAfterCalendar")] : [],
    ...facts.market ? [row("premise", "Faixa de spread de comparáveis", facts.market, "marketRange")] : [],
    ...facts.history ? [row("instrument", facts.history.value.label, facts.history, "lastOperation")] : [],
    ...facts.variants.map((v) => row("case", v.value.label, v, "askCase")),
    ...facts.alternatives.map((a) => row("option", a.value.label, a)),
  ]};
}

export function buildReceivedProposalPremiseProposal(facts: ReceivedProposalFacts) {
  return fingerprintedProposal(receivedProposalPremiseMethod, facts, proposeReceivedProposalHypotheses(facts), receivedProposalSummary(facts));
}

/** The date of the turn in São Paulo, the house reading date when nobody states one. */
const saoPauloToday = () => new Intl.DateTimeFormat("en-CA", {timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit"}).format(new Date());

export async function proposeReceivedProposalPremisesForTurn(input: {
  message: string; hasAttachments: boolean; recentUserMessages: string[]; projectId: string | null;
  loadEvidence: () => Promise<unknown>; extract: (text: string) => Promise<unknown>;
  log: (event: string, detail: Record<string, unknown>) => void; today?: string;
}) {
  const entry = input.projectId ? receivedProposalEntry(input.message, input.hasAttachments, input.recentUserMessages) : null;
  if (!input.projectId || !entry) return null;
  const today = input.today ?? saoPauloToday();
  return proposeLote2PremisesForTurn({logPrefix: "received_proposal_premises", idName: "received-proposal", expansionRefusalAsGap: true, schema: receivedProposalExtractionSchema,
    complete: (extraction, id) => completeReceivedProposalFacts({extraction, ids: {receivedProposalId: id, entityId: id, definitionVersionId: id}, currency: "BRL", today}),
    build: buildReceivedProposalPremiseProposal, readerCheck: receivedProposalReaderGaps}, {...input, entry, projectId: input.projectId});
}
