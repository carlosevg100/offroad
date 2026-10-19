import {createHash} from "node:crypto";
import {z} from "zod";
import {compileObjectiveToPlan} from "@offroad/work-plan";
import {financingComparisonFactsSchema, proposeFinancingComparisonHypotheses, type FinancingComparisonFacts} from "@offroad/financial-model";
import {uuidV5} from "./investment-premises-proposal";

/** The method these premises feed, pinned to its implemented version. */
export const financingComparisonPremiseMethod = {methodId: "compare-financing-proposals", methodVersion: "2026.10.19-v2"} as const;
const fold = (text: string) => text.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();
const proposalsCue = /\b(propostas|term sheets?|ofertas|cotacoes|qual (eu )?(fico|escolho|fecho)|mais barat[ao]|comparar? (as )?(propostas|ofertas))/;

/** More than one offer for the same need: the turn may propose the comparison's premises. */
export function shouldProposeFinancingComparisonPremises(message: string, hasAttachments: boolean): boolean {
  const kind = compileObjectiveToPlan({message, hasAttachments}).objectiveKind;
  return kind !== "factual_question" && proposalsCue.test(fold(message));
}

const origin = z.enum(["informed", "document"]);
const sourced = <T extends z.ZodType>(value: T) => z.strictObject({value: value.nullable(), origin: origin.nullable(), source: z.string().max(400).nullable()});
const money = z.string().regex(/^-?\d{1,15}(?:\.\d{1,8})?$/);
const month = z.string().regex(/^\d{4}-\d{2}$/);
const share = z.number().min(0).max(1);
/** Only what the person said or a document states. Absence stays null; nothing is estimated here. */
export const financingComparisonExtractionSchema = z.strictObject({
  proposals: z.array(z.strictObject({
    label: z.string().min(1).max(80),
    amount: sourced(money), annualSpread: sourced(z.number().min(0).max(0.3)), feeRate: sourced(share), creditTax: sourced(z.boolean()),
    drawMonth: sourced(month), firstAmortizationMonth: sourced(month), installments: sourced(z.number().int().min(1).max(40)),
    installmentEveryMonths: sourced(z.number().int().min(1).max(24)), couponEveryMonths: sourced(z.number().int().min(3).max(12)),
    collateralShareOfLoan: sourced(share), covenantLimit: sourced(z.number().min(0).max(20)),
    /** Two separate clauses of the covenant definition; neither is inferred from the other. */
    covenantLeasesInDebt: sourced(z.boolean()), covenantEbitdaExcludesLeases: sourced(z.boolean()),
    covenantTestFrequency: sourced(z.enum(["semiannual", "annual"])), covenantDescription: z.string().max(200).nullable(),
    /** Consent another creditor must give: whose (as named in the debt table), when and at what cost. */
    waiverRequired: sourced(z.boolean()), waiverCreditor: sourced(z.string().min(1).max(80)), waiverMonth: sourced(month), waiverCost: sourced(money),
    /** Exact draw date and payment day, when the term sheet states them; the lifetime then runs on contract dates. */
    drawDate: sourced(z.iso.date()), paymentDay: sourced(z.number().int().min(1).max(28)),
  })).max(4),
  company: z.strictObject({
    quarters: sourced(z.array(z.strictObject({quarterEnd: z.iso.date(), ebitda: money, leasePayments: money, depreciation: money,
      workingCapitalCashFlow: money, maintenanceCapex: money, growthCapex: money})).min(2).max(40)),
    previousQuarters: sourced(z.array(z.strictObject({period: z.string().min(1).max(20), ebitda: money, leasePayments: money})).min(1).max(8)),
    openingCash: sourced(money), cashTaxRate: sourced(share), minimumCash: sourced(money), receivablesPool: sourced(money), leaseLiability: sourced(money),
  }),
  existingDebt: sourced(z.array(z.strictObject({
    label: z.string().min(1).max(80), openingPrincipal: money, rateKind: z.enum(["floating", "fixed"]), annualRate: z.number().min(0).max(0.5),
    averagePrincipalCoupon: z.boolean(), couponEveryMonths: z.number().int().min(3).max(12),
    draws: z.array(z.strictObject({month, amount: money})).max(40), amortizations: z.array(z.strictObject({month, amount: money})).max(80),
    prepayments: z.array(z.strictObject({month, amount: money})).max(10),
    charges: z.array(z.strictObject({label: z.string().min(1).max(80), kind: z.enum(["fee", "tax", "premium"]), month, amount: money})).max(10),
  })).max(10)),
  indexCurve: sourced(z.array(z.strictObject({year: z.number().int().min(2000).max(2100), annualRate: z.number().min(0).max(1)})).min(1).max(30)),
});
export type FinancingComparisonExtraction = z.infer<typeof financingComparisonExtractionSchema>;

export const financingComparisonExtractionContract = {
  task: "financing_comparison_extraction" as const,
  system: [
    "Você extrai os termos de propostas de financiamento para a mesma necessidade e os dados da companhia que permitem compará-las, a partir da mensagem de uma pessoa, das mensagens anteriores e de campos já extraídos de documentos (term sheets, tabela de dívida, projeção).",
    "Extraia somente o que foi dito ou o que está em documento. Se não estiver, devolva null em value, origin e source. Nunca estime, nunca complete, nunca arredonde por conta própria.",
    "Valores monetários em reais, sem separador de milhar (R$ 70 milhões vira 70000000). Taxas em fração (CDI + 2,30% vira annualSpread 0.023; comissão de 1% vira 0.01).",
    "Meses em AAAA-MM. Para cada proposta: mês do desembolso, mês da primeira amortização, número de parcelas, meses entre parcelas, meses entre pagamentos de juros, parcela da operação cedida em garantia, limite do covenant de dívida líquida sobre EBITDA, se a dívida do covenant inclui arrendamentos e, separadamente, se o EBITDA do covenant exclui arrendamentos (IFRS 16), frequência de teste e se a proposta exige waiver de outro credor: qual credor (como aparece na tabela de dívida), em que mês e quanto custa.",
    "creditTax é true quando a operação paga IOF de crédito (CCB, empréstimo) e false quando não paga (debênture). origin é informed quando a pessoa disse, document quando veio de um campo de documento. source cita em poucas palavras de onde veio.",
    "Quando o term sheet trouxer a data exata do desembolso e o dia do mês dos pagamentos, devolva drawDate (AAAA-MM-DD) e paymentDay.",
    "A projeção da companhia é trimestral: um item por trimestre com EBITDA, arrendamentos pagos, depreciação, fluxo de capital de giro (negativo consome caixa), capex de manutenção e de expansão.",
  ].join("\n"),
  schema: financingComparisonExtractionSchema,
  schemaName: "financing_comparison_extraction_v1",
  outputMode: "prompted_json" as const,
  maxOutputTokens: 6_000,
  cacheKey: "financing-comparison-extraction-2026.10.19-v1",
};

export type ComparisonCompletion =
  | {status: "complete"; facts: FinancingComparisonFacts; housePremiseKeys: string[]}
  | {status: "missing"; missing: string[]};

const months = (m: string) => Number(m.slice(0, 4)) * 12 + Number(m.slice(5, 7)) - 1;
type Sourced<T> = {value: T | null; origin: "informed" | "document" | null; source: string | null};
const src = (f: {origin: "informed" | "document"; source: string}) => ({origin: f.origin, source: f.source});

/** Turns the extraction into the facts the method needs. Required facts that nobody stated make
 * the proposal wait; the reply asks for them in one batch instead of inventing them. House premises
 * (credit tax rule, the bank's stress, consent fee tax treatment) are marked as such. */
export function completeFinancingComparisonFacts(input: {extraction: FinancingComparisonExtraction; ids: {comparisonId: string; entityId: string; definitionVersionId: string}; currency: "BRL"}): ComparisonCompletion {
  const e = input.extraction, missing: string[] = [], used: string[] = [];
  const need = <T>(key: string, f: Sourced<T>) => {
    if (f.value === null || f.origin === null) {missing.push(key); return null;}
    return {value: f.value, origin: f.origin, source: f.source ?? (f.origin === "informed" ? "Informado na conversa" : "Documento")};
  };
  if (e.proposals.length < 2) missing.push("proposals");
  const quarters = need("company.quarters", e.company.quarters), previous = need("company.previousQuarters", e.company.previousQuarters);
  const opening = need("company.openingCash", e.company.openingCash), taxRate = need("company.cashTaxRate", e.company.cashTaxRate);
  const pool = need("company.receivablesPool", e.company.receivablesPool), debt = need("existingDebt", e.existingDebt), curve = need("indexCurve", e.indexCurve);
  const anyLease = e.proposals.some((p) => p.covenantLeasesInDebt.value === true);
  const lease = anyLease ? need("company.leaseLiability", e.company.leaseLiability) : null;
  const proposals = e.proposals.map((p, n) => {
    const k = (f: string) => `proposals.${n + 1}.${f}`;
    return {label: p.label, amount: need(k("amount"), p.amount), spread: need(k("annualSpread"), p.annualSpread), fee: need(k("feeRate"), p.feeRate),
      creditTax: need(k("creditTax"), p.creditTax), draw: need(k("drawMonth"), p.drawMonth), first: need(k("firstAmortizationMonth"), p.firstAmortizationMonth),
      installments: need(k("installments"), p.installments), every: need(k("installmentEveryMonths"), p.installmentEveryMonths),
      coupon: need(k("couponEveryMonths"), p.couponEveryMonths), collateral: need(k("collateralShareOfLoan"), p.collateralShareOfLoan),
      limit: need(k("covenantLimit"), p.covenantLimit), leases: need(k("covenantLeasesInDebt"), p.covenantLeasesInDebt),
      excludes: need(k("covenantEbitdaExcludesLeases"), p.covenantEbitdaExcludesLeases),
      frequency: need(k("covenantTestFrequency"), p.covenantTestFrequency), description: p.covenantDescription,
      waiver: need(k("waiverRequired"), p.waiverRequired), waiverCost: p.waiverRequired.value === true ? need(k("waiverCost"), p.waiverCost) : null,
      waiverCreditor: p.waiverRequired.value === true ? need(k("waiverCreditor"), p.waiverCreditor) : null,
      waiverMonth: p.waiverRequired.value === true ? need(k("waiverMonth"), p.waiverMonth) : null,
      // Contract dates come as a pair or not at all; half of them is a gap, never a silent grid.
      ...(() => {
        const draw = p.drawDate.value !== null && p.drawDate.origin !== null, day = p.paymentDay.value !== null && p.paymentDay.origin !== null;
        if (draw !== day) missing.push(k(draw ? "paymentDay" : "drawDate"));
        return {drawDate: draw && day ? {value: p.drawDate.value!, origin: p.drawDate.origin!, source: p.drawDate.source ?? "Documento"} : null,
          paymentDay: draw && day ? {value: p.paymentDay.value!, origin: p.paymentDay.origin!, source: p.paymentDay.source ?? "Documento"} : null};
      })()};
  });
  if (missing.length || !quarters || !previous || !opening || !taxRate || !pool || !debt || !curve) return {status: "missing", missing};
  const ends = quarters.value.map((q) => q.quarterEnd);
  const firstStart = (() => {const d = new Date(`${ends[0]}T00:00:00Z`); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 2, 1)).toISOString().slice(0, 7);})();
  const openingDate = (() => {const d = new Date(`${ends[0]}T00:00:00Z`); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 2, 0)).toISOString().slice(0, 10);})();
  const quarterOf = (m: string) => Math.floor((months(m) - months(firstStart)) / 3);
  const inHorizon = (m: string, key: string) => {const q = quarterOf(m); if (q < 0 || q >= ends.length) {missing.push(key); return null;} return q;};
  const events = (rows: {month: string; amount: string}[], key: string) => rows.flatMap((r) => {const q = inHorizon(r.month, key); return q === null ? [] : [{quarter: q, amount: r.amount}];});
  const existing = debt.value.map((d, n) => {
    const id = uuidV5(`${input.ids.comparisonId}:debt:${n}:${d.label}`), every = d.couponEveryMonths / 3;
    // A coupon period that does not fit whole quarters is a gap; payments are never dropped to fit the grid.
    if (!Number.isInteger(every)) missing.push(`existingDebt.${n + 1}.couponEveryMonths`);
    const settles = every > 1 ? ends.map((_, q) => q).filter((q) => (q + 1) % every === 0) : null;
    return {id, label: d.label, openingPrincipal: d.openingPrincipal, rate: d.rateKind === "floating" ? {kind: "floating" as const, annualSpread: String(d.annualRate)} : {kind: "fixed" as const, annualRate: String(d.annualRate)},
      couponBase: d.averagePrincipalCoupon ? "average_principal" as const : "opening_principal" as const,
      draws: events(d.draws, `existingDebt.${n + 1}.draws`), amortization: events(d.amortizations, `existingDebt.${n + 1}.amortizations`),
      prepayments: events(d.prepayments, `existingDebt.${n + 1}.prepayments`), accruedPaymentQuarters: settles,
      charges: d.charges.flatMap((c, i) => {const q = inHorizon(c.month, `existingDebt.${n + 1}.charges`); return q === null ? [] : [{id: `${d.label}-${i + 1}`,
        category: c.kind === "fee" ? "origination_fee" as const : c.kind === "tax" ? "tax" as const : "other" as const, quarter: q, amount: c.amount, deductible: true}];})};
  });
  const built = proposals.map((p, n) => {
    const draw = inHorizon(p.draw!.value, `proposals.${n + 1}.drawMonth`);
    if (draw === null) return null;
    // Installments fall a whole number of quarters after the draw month; a month off that calendar is a
    // gap to clarify with the counterparty, never rounded into another quarter.
    const offset = months(p.first!.value) - months(p.draw!.value), first = offset / 3, step = p.every!.value / 3;
    if (offset < 0 || !Number.isInteger(first)) {missing.push(`proposals.${n + 1}.firstAmortizationMonth`); return null;}
    if (!Number.isInteger(step) || !Number.isInteger(p.coupon!.value / 3)) {missing.push(`proposals.${n + 1}.schedule`); return null;}
    if (p.drawDate && p.drawDate.value.slice(0, 7) !== p.draw!.value) {missing.push(`proposals.${n + 1}.drawDate`); return null;}
    const sources = [p.amount!, p.spread!, p.fee!, p.collateral!, p.limit!].map((f) => f.source);
    // The consent fee is paid to the creditor the source names; an unknown creditor is a gap.
    const named = p.waiver!.value === true ? existing.filter((d) => d.label === p.waiverCreditor!.value) : [];
    const creditor = named.length === 1 ? named[0]!.id : null;
    if (p.waiver!.value === true && !creditor) {missing.push(`proposals.${n + 1}.waiverCreditor`); return null;}
    const waiverQuarter = p.waiver!.value === true ? inHorizon(p.waiverMonth!.value, `proposals.${n + 1}.waiverMonth`) : null;
    if (p.waiver!.value === true && waiverQuarter === null) return null;
    const waiverOn = p.waiver!.value === true && creditor && waiverQuarter !== null;
    if (waiverOn) used.push("waiverDeductibility");
    return {value: {id: uuidV5(`${input.ids.comparisonId}:proposal:${p.label}`), label: p.label, amount: p.amount!.value, annualSpread: String(p.spread!.value), feeRate: String(p.fee!.value),
      creditTax: p.creditTax!.value, drawQuarter: draw, amortizationQuarters: Array.from({length: p.installments!.value}, (_, k) => first + k * step),
      couponEveryQuarters: p.coupon!.value / 3, collateralShareOfLoan: String(p.collateral!.value),
      covenant: {name: p.description ?? `Dívida líquida ${p.leases!.value ? "com" : "sem"} arrendamentos sobre EBITDA ${p.excludes!.value ? "sem" : "com"} IFRS 16`, limit: String(p.limit!.value),
        leaseLiabilityInDebt: p.leases!.value, ebitdaExcludesLeases: p.excludes!.value, testFrequency: p.frequency!.value},
      waiver: waiverOn ? {instrumentId: creditor!, quarter: waiverQuarter!, cost: p.waiverCost!.value, deductible: false} : null,
      contractDates: p.drawDate && p.paymentDay ? {drawDate: p.drawDate.value, paymentDay: p.paymentDay.value} : null,
      // Each clause keeps the origin and source it was stated with.
      provenance: {amount: src(p.amount!), annualSpread: src(p.spread!), feeRate: src(p.fee!), creditTax: src(p.creditTax!), drawMonth: src(p.draw!),
        amortization: src(p.first!), installments: src(p.installments!), installmentEveryMonths: src(p.every!), coupon: src(p.coupon!), collateral: src(p.collateral!), covenantLimit: src(p.limit!), covenantDebtDefinition: src(p.leases!),
        covenantEbitdaDefinition: src(p.excludes!), covenantFrequency: src(p.frequency!),
        ...(waiverOn ? {waiverCost: src(p.waiverCost!), waiverCreditor: src(p.waiverCreditor!), waiverMonth: src(p.waiverMonth!)} : {}),
        ...(p.drawDate && p.paymentDay ? {drawDate: {origin: p.drawDate.origin, source: p.drawDate.source}, paymentDay: {origin: p.paymentDay.origin, source: p.paymentDay.source}} : {})}},
      origin: [p.amount!, p.spread!].every((f) => f.origin === "document") ? "document" as const : "informed" as const,
      source: [...new Set(sources)].join("; ").slice(0, 2000)};
  });
  if (missing.length || built.some((b) => b === null)) return {status: "missing", missing: [...new Set(missing)]};
  used.push("creditTax", "stress");
  const col = (k: "ebitda" | "leasePayments" | "depreciation" | "workingCapitalCashFlow" | "maintenanceCapex" | "growthCapex") => ({...quarters, value: quarters.value.map((q) => q[k])});
  const facts = financingComparisonFactsSchema.parse({...input.ids, perimeter: "standalone", currency: input.currency, openingDate, quarterEnds: ends,
    indexCurve: {...curve, value: curve.value.map((c) => ({year: c.year, annualRate: String(c.annualRate)}))},
    company: {openingAvailableCash: opening, ebitda: col("ebitda"), leasePayments: col("leasePayments"), depreciationAndAmortization: col("depreciation"),
      workingCapitalCashFlow: col("workingCapitalCashFlow"), maintenanceCapexPaid: col("maintenanceCapex"), growthCapexPaid: col("growthCapex"),
      cashTaxRate: {...taxRate, value: String(taxRate.value)}, freeReceivablesPool: pool,
      leaseLiability: lease ?? {value: "0", origin: "house", source: "Nenhuma definição de covenant inclui arrendamentos na dívida"},
      covenantHistory: previous,
      minimumCashPolicy: e.company.minimumCash.value !== null && e.company.minimumCash.origin !== null
        ? {value: e.company.minimumCash.value, origin: e.company.minimumCash.origin, source: e.company.minimumCash.source ?? "Informado na conversa"} : null,
      maximumCollateralShare: null},
    existingDebt: {...debt, value: existing}, proposals: built,
    creditTax: {value: {fixedRate: "0.0038", dailyRate: "0.000082", maxDays: 365}, origin: "house", source: "IOF de crédito para pessoa jurídica: 0,38% mais 0,0082% ao dia, limitado a 365 dias"},
    stress: {ebitdaShock: {value: "0.15", origin: "house", source: "EBITDA 15% menor, o caso que um banco tende a usar"},
      fromQuarter: {value: Math.min(1, ends.length - 1), origin: "house", source: "A partir do trimestre seguinte ao atual"}}});
  return {status: "complete", facts, housePremiseKeys: [...new Set(used)]};
}

/** The proposal the worker records next to its reply: facts with origin, the hypotheses one
 * confirmation adopts, a short summary for the card and the fingerprint the confirmation checks. */
export function buildFinancingComparisonPremiseProposal(facts: FinancingComparisonFacts) {
  const hypotheses = proposeFinancingComparisonHypotheses(facts).map((h) => ({...h, dimensions: {...h.dimensions, entityId: null, definitionVersionId: null}}));
  const summary = {
    proposals: facts.proposals.map((p) => ({label: p.value.label, amount: p.value.amount, annualSpread: p.value.annualSpread, feeRate: p.value.feeRate,
      creditTax: p.value.creditTax, collateralShareOfLoan: p.value.collateralShareOfLoan, covenantLimit: p.value.covenant.limit, origin: p.origin, source: p.source})),
    quarters: facts.quarterEnds.length, existingDebt: facts.existingDebt.value.map((d) => d.label),
    minimumCashPolicy: facts.company.minimumCashPolicy?.value ?? null,
    premises: [{key: "creditTax", origin: facts.creditTax.origin, source: facts.creditTax.source}, {key: "stress", origin: facts.stress.ebitdaShock.origin, source: facts.stress.ebitdaShock.source}],
    cases: ["base", "bank-stress"],
  };
  const body = {methodId: financingComparisonPremiseMethod.methodId, methodVersion: financingComparisonPremiseMethod.methodVersion, facts, hypotheses, summary};
  return {...body, fingerprint: createHash("sha256").update(JSON.stringify(body)).digest("hex")};
}

export type ComparisonTurnPremises = {
  forAdvisor: {status: "proposed"; summary: ReturnType<typeof buildFinancingComparisonPremiseProposal>["summary"]; housePremises: string[]} | {status: "missing"; missing: string[]};
  proposal: ReturnType<typeof buildFinancingComparisonPremiseProposal> | null;
};
/** One turn's premise step for a comparison. It never fails the turn: any error is logged and the
 * turn continues as a plain reply. The comparison identity is stable per work, so a corrected
 * proposal replaces the same slots of the working basis instead of accumulating a second one. */
export async function proposeFinancingComparisonPremisesForTurn(input: {
  message: string; hasAttachments: boolean; recentUserMessages: string[]; projectId: string | null;
  loadEvidence: () => Promise<unknown>; extract: (text: string) => Promise<unknown>;
  log: (event: string, detail: Record<string, unknown>) => void;
}): Promise<ComparisonTurnPremises | null> {
  if (!input.projectId || !shouldProposeFinancingComparisonPremises(input.message, input.hasAttachments)) return null;
  try {
    const documentFields = await input.loadEvidence();
    const extraction = financingComparisonExtractionSchema.parse(await input.extract(JSON.stringify({
      latestUserMessage: input.message, earlierUserMessages: input.recentUserMessages.slice(-6), documentFields})));
    const comparisonId = uuidV5(`offroad:financing-comparison:${input.projectId}`);
    const completed = completeFinancingComparisonFacts({extraction, ids: {comparisonId, entityId: comparisonId, definitionVersionId: comparisonId}, currency: "BRL"});
    if (completed.status === "missing") {
      input.log("comparison_premises.missing", {missing: completed.missing});
      return {forAdvisor: {status: "missing", missing: completed.missing}, proposal: null};
    }
    const proposal = buildFinancingComparisonPremiseProposal(completed.facts);
    input.log("comparison_premises.proposed", {hypotheses: proposal.hypotheses.length, housePremises: completed.housePremiseKeys});
    return {forAdvisor: {status: "proposed", summary: proposal.summary, housePremises: completed.housePremiseKeys}, proposal};
  } catch (error) {
    input.log("comparison_premises.failed", {message: error instanceof Error ? error.message.slice(0, 200) : "unknown"});
    return null;
  }
}
