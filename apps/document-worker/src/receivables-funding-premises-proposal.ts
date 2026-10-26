import {z} from "zod";
import {proposeReceivablesFundingHypotheses, receivablesFundingFactsSchema, type ReceivablesFundingFacts} from "@offroad/financial-model";
import {citedSource, extractedOrigin, fingerprintedProposal, itemKeys, itemLabel, itemSource, proposeLote2PremisesForTurn, sameLabel, sourced, stated,
  summaryRow, type Lote2Completion, type Lote2Summary} from "./lote2-premises";
import {premiseEntry, turnIntentInstruction, turnIntents} from "./premise-cue";

/** The method these premises feed, pinned to its implemented version. */
export const receivablesFundingPremiseMethod = {methodId: "monetize-receivables-for-working-capital", methodVersion: "2026.10.26-v1"} as const;

/** Receivables to turn into working capital: the turn may propose the analysis's premises. A statement after the
 * latest such question among the recent messages is a continuation candidate; the extraction's `turnIntent` decides it. */
export function shouldProposeReceivablesFundingPremises(message: string, hasAttachments: boolean, earlierUserMessages: readonly string[] = []): boolean {
  return premiseEntry("receivables_funding", message, hasAttachments, earlierUserMessages) !== null;
}

const money = z.string().regex(/^\d{1,15}(?:\.\d{1,8})?$/);
const ratio = z.string().regex(/^\d{1,4}(?:\.\d{1,8})?$/);
const days = z.number().int().min(0).max(9999);
const kinds = ["anchor_program", "fidc", "bank_discount", "bank_line"] as const;
const item = {label: itemLabel, origin: extractedOrigin, source: itemSource};

/** Only what the person said or a document states. Absence stays null; nothing is estimated here. */
export const receivablesFundingExtractionSchema = z.strictObject({
  turnIntent: z.enum(turnIntents),
  /** The date of the portfolio position. */
  referenceDate: sourced(z.iso.date()),
  needAverage: sourced(money), needPeak: sourced(money), needStartDate: sourced(z.iso.date()), needEndDate: sourced(z.iso.date()),
  calendarDays: sourced(days), businessDays: sourced(days),
  needProfile: sourced(z.enum(["seasonal", "structural"])),
  annualDi: sourced(ratio), averageTermDays: sourced(days),
  /** The monthly volume from which a dedicated vehicle starts to pay for itself, when a document or the person states it. */
  dedicatedVehicleThreshold: sourced(z.strictObject({min: money, max: money})),
  /** What is left of the basket for liens the indenture allows, when stated. */
  lienBasketRemaining: sourced(money),
  items: z.array(z.strictObject({...item, amount: money,
    contract: z.enum(["assignable", "prohibited_without_consent"]).nullable(), encumbrance: z.enum(["free", "assigned", "pledged"]).nullable(),
    encumbranceHolder: z.string().trim().min(1).max(300).nullable(), releaseEvent: z.string().trim().min(1).max(300).nullable(),
    originDate: z.iso.date().nullable(), dueDate: z.iso.date().nullable(), registration: z.enum(["registered", "not_required", "missing"]).nullable(),
    creditTier: z.enum(["selected", "standard"]).nullable(), anchorProgram: z.enum(["active", "none", "unknown"]).nullable(),
    debtorCount: z.number().int().min(1).max(1000000).nullable(), largestDebtorAmount: money.nullable(),
    /** The debtor these receivables are owed by, when one debtor spans several groups; null names the group itself. */
    debtorLabel: itemLabel.nullable(), debtorSetDisjoint: z.boolean().nullable()})).max(16),
  options: z.array(z.strictObject({...item, kind: z.enum(kinds), recourse: z.enum(["with_recourse", "without_recourse"]).nullable(),
    rateBasis: z.enum(["monthly", "annual", "di_plus"]).nullable(), rate: ratio.nullable(),
    iofDaily: ratio.nullable(), iofDailyCapDays: days.nullable(), iofAdditional: ratio.nullable(), rolloverDays: days.nullable(), upfrontFee: ratio.nullable(),
    collateral: z.enum(["none", "receivables_assignment", "unknown"]).nullable(), leadDaysMin: days.nullable(), leadDaysMax: days.nullable(),
    maxDaysPastDue: days.nullable(), maxRemainingTermDays: days.nullable(), registrationRule: z.enum(["required", "not_required"]).nullable(),
    minCreditTier: z.enum(["selected", "standard"]).nullable(), sublimitPerDebtor: money.nullable(), sublimitGroup: itemLabel.nullable(),
    anchorItemLabels: z.array(itemLabel).max(16)})).max(8),
});
export type ReceivablesFundingExtraction = z.infer<typeof receivablesFundingExtractionSchema>;

export const receivablesFundingExtractionContract = {
  task: "receivables_funding_extraction" as const,
  system: [
    "Você extrai os dados que permitem dizer quanto de uma carteira de recebíveis vira caixa, com quem, a que custo e em quanto tempo, contra a linha bancária, a partir da mensagem de uma pessoa, das mensagens anteriores e de campos já extraídos de documentos (carteira por sacado, contratos com clientes, tabela de dívida, propostas, regulamentos de fundos).",
    "Extraia somente o que foi dito ou o que está em documento. Se não estiver, devolva null (em value, origin e source, ou no campo) ou lista vazia. Nunca estime, nunca complete, nunca invente taxa de mercado.",
    "Valores monetários em reais, sem separador de milhar (R$ 62 milhões vira 62000000). Taxas em fração (1,6% ao mês vira rate 0.016 com rateBasis monthly; CDI mais 1,2 ao ano vira rate 0.012 com rateBasis di_plus). Datas no formato AAAA-MM-DD.",
    "referenceDate é a data da posição da carteira. A necessidade: needAverage é o uso médio, needPeak o pico, needStartDate quando o dinheiro precisa entrar, needEndDate quando a necessidade acaba, calendarDays e businessDays o prazo de uso, needProfile seasonal (safra, sazonal) ou structural. annualDi é o CDI anual usado na conta; averageTermDays o prazo médio de recebimento. dedicatedVehicleThreshold é a faixa de volume cedido por mês a partir da qual uma operação dedicada se paga, só quando um documento ou a pessoa a der.",
    "items: cada grupo da carteira (um sacado grande, um conjunto de sacados, os vencidos), com o valor, se o contrato permite ceder (assignable) ou proíbe sem anuência, se está livre, cedido ou empenhado e a quem, o evento que libera, as datas de emissão e vencimento, o registro da duplicata, a qualidade de crédito do sacado (selected para os de melhor crédito), se o sacado tem programa de antecipação a fornecedores, o número de sacados e o maior sacado.",
    "options: cada porta (programa de antecipação de um cliente, FIDC, desconto bancário, linha bancária) como a proposta ou o regulamento escreve: coobrigação, taxa, IOF, comissão, prazo até o primeiro desembolso e os critérios de elegibilidade (atraso máximo, prazo máximo, registro, qualidade de crédito mínima, sublimite por sacado e o grupo de fundos que o compartilha, e os grupos da carteira de um programa de cliente).",
    "origin é informed quando a pessoa disse, document quando veio de um campo de documento. source cita em poucas palavras de onde veio.",
    turnIntentInstruction,
  ].join("\n"),
  schema: receivablesFundingExtractionSchema,
  schemaName: "receivables_funding_extraction_v1",
  outputMode: "prompted_json" as const,
  maxOutputTokens: 10_000,
  cacheKey: "receivables-funding-extraction-2026.10.26-v1",
};

const dayMs = 86400000;
const shift = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * dayMs).toISOString().slice(0, 10);
const between = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / dayMs);
/** Monday to Friday from the start, for the stated number of calendar days; holidays are not known here. */
const weekdays = (start: string, n: number) => Array.from({length: n}, (_, k) => new Date(Date.parse(`${start}T00:00:00Z`) + k * dayMs).getUTCDay()).filter((d) => d !== 0 && d !== 6).length;

/** Turns the extraction into the facts the method needs. The portfolio, the need and every option's terms,
 * IOF included, are the company's or its documents': a value no source states is never adopted under that
 * source's origin, so the reply asks for it in one batch. House premises carry their own origin and are
 * stated as such: the days of use from the two dates (or the end from the start and the days), and business
 * days counted Monday to Friday without holidays as an estimate. The monthly volume from which a dedicated
 * vehicle pays is asked: no public source in the repository states it. */
export function completeReceivablesFundingFacts(input: {extraction: ReceivablesFundingExtraction; ids: {receivablesFundingId: string; entityId: string; definitionVersionId: string}; currency: "BRL"}):
  Lote2Completion<ReceivablesFundingFacts> {
  const e = input.extraction, missing: string[] = [], used: string[] = [];
  const need = {average: stated(e.needAverage), peak: stated(e.needPeak), start: stated(e.needStartDate), profile: stated(e.needProfile),
    di: stated(e.annualDi), term: stated(e.averageTermDays), reference: stated(e.referenceDate)};
  for (const [k, v] of [["referenceDate", need.reference], ["needAverage", need.average], ["needPeak", need.peak], ["needStartDate", need.start], ["needProfile", need.profile],
    ["annualDi", need.di], ["averageTermDays", need.term]] as const) if (!v) missing.push(k);
  const threshold = stated(e.dedicatedVehicleThreshold);
  if (!threshold) missing.push("dedicatedVehicleThreshold");
  const end = stated(e.needEndDate), statedDays = stated(e.calendarDays);
  if (!end && !statedDays) missing.push("needEndDate");
  if (!e.items.length) missing.push("items");
  if (!e.options.length) missing.push("options");
  const itemIds = itemKeys(e.items.map((i) => i.label));
  const items = e.items.map((i, k) => {
    const p = `items.${k + 1}.`, before = missing.length;
    for (const f of ["contract", "encumbrance", "originDate", "dueDate", "registration", "creditTier", "anchorProgram"] as const) if (i[f] === null) missing.push(p + f);
    if (i.encumbrance !== null && i.encumbrance !== "free" && i.encumbranceHolder === null) missing.push(p + "encumbranceHolder");
    if (missing.length > before) return null;
    const single = i.debtorCount === 1;
    if (!single && i.debtorSetDisjoint === null) {missing.push(p + "debtorSetDisjoint"); return null;}
    const debtor = i.debtorLabel === null ? itemIds[k]! : itemKeys([i.debtorLabel])[0]!;
    const free = i.encumbrance === "free";
    return {value: {id: itemIds[k]!, label: i.label, amount: i.amount, contract: i.contract!, encumbrance: i.encumbrance!, encumbranceHolder: free ? null : i.encumbranceHolder,
      releaseEvent: free ? null : i.releaseEvent, originDate: i.originDate!, dueDate: i.dueDate!, registration: i.registration!, creditTier: i.creditTier!,
      anchorProgram: i.anchorProgram!, debtorCount: i.debtorCount, largestDebtorAmount: i.largestDebtorAmount, debtorKey: debtor,
      debtorSetDisjoint: single ? null : i.debtorSetDisjoint!}, origin: i.origin, source: citedSource(i.origin, i.source)};
  });
  const optionIds = itemKeys(e.options.map((o) => o.label));
  const options = e.options.map((o, k) => {
    const p = `options.${k + 1}.`, before = missing.length;
    // IOF is asked for every option the documents or the person do not price, a sale of receivables included:
    // a value the source does not state is never adopted under the source's origin.
    for (const f of ["recourse", "rateBasis", "rate", "upfrontFee", "iofDaily", "iofDailyCapDays", "iofAdditional", "collateral"] as const) if (o[f] === null) missing.push(p + f);
    if (o.kind !== "bank_line") for (const f of ["maxDaysPastDue", "maxRemainingTermDays", "registrationRule", "minCreditTier"] as const) if (o[f] === null) missing.push(p + f);
    if ((o.leadDaysMin === null) !== (o.leadDaysMax === null)) missing.push(p + "leadDays");
    const anchors = o.anchorItemLabels.map((l) => e.items.findIndex((i) => sameLabel(i.label, l)));
    if (anchors.some((x) => x < 0) || (o.kind === "anchor_program" && !anchors.length)) missing.push(p + "anchorItemLabels");
    if (missing.length > before) return null;
    return {value: {id: optionIds[k]!, label: o.label, kind: o.kind, recourse: o.recourse!,
      eligibility: o.kind === "bank_line" ? null : {maxDaysPastDue: o.maxDaysPastDue!, maxRemainingTermDays: o.maxRemainingTermDays!, registrationRule: o.registrationRule!,
        minCreditTier: o.minCreditTier!, sublimitPerDebtor: o.sublimitPerDebtor, sublimitGroup: o.sublimitGroup === null ? null : itemKeys([o.sublimitGroup])[0]!,
        anchorItemIds: anchors.map((x) => itemIds[x]!)},
      rate: {basis: o.rateBasis!, rate: o.rate!}, iofDaily: o.iofDaily!, iofDailyCapDays: o.iofDailyCapDays!, iofAdditional: o.iofAdditional!,
      rolloverDays: o.rolloverDays, upfrontFee: o.upfrontFee!, collateral: o.collateral!, leadDaysMin: o.leadDaysMin, leadDaysMax: o.leadDaysMax},
      origin: o.origin, source: citedSource(o.origin, o.source)};
  });
  if (missing.length || !threshold || !need.reference || !need.average || !need.peak || !need.start || !need.profile || !need.di || !need.term) return {status: "missing", missing: [...new Set(missing)]};
  const calendarDays = statedDays ?? {value: between(need.start.value, end!.value), origin: "house" as const, source: "Dias corridos entre o início e o fim da necessidade"};
  if (!statedDays) used.push("calendarDays");
  const endDate = end?.value ?? shift(need.start.value, calendarDays.value);
  if (!end) used.push("needEndDate");
  const business = stated(e.businessDays) ?? {value: weekdays(need.start.value, calendarDays.value), origin: "estimate" as const, source: "Dias de segunda a sexta no prazo de uso, sem feriados"};
  if (!stated(e.businessDays)) used.push("businessDays");
  const facts = receivablesFundingFactsSchema.parse({...input.ids, perimeter: "standalone", currency: input.currency, referenceDate: need.reference.value, endDate,
    needAverage: need.average, needPeak: need.peak, needStartDate: need.start, calendarDays, businessDays: business, annualDi: need.di, averageTermDays: need.term,
    needProfile: need.profile, lienBasketRemaining: stated(e.lienBasketRemaining),
    dedicatedVehicleThreshold: threshold,
    items: items.map((i) => i!), options: options.map((o) => o!)});
  return {status: "complete", facts, situationId: need.profile.value === "seasonal" ? "seasonal-working-capital" : "structural-working-capital", housePremiseKeys: [...new Set(used)]};
}

/** The card: each group of the portfolio, each option, the need and the market range for a dedicated vehicle. */
export function receivablesFundingSummary(facts: ReceivablesFundingFacts): Lote2Summary {
  const row = summaryRow;
  return {situationId: facts.needProfile.value === "seasonal" ? "seasonal-working-capital" : "structural-working-capital", referenceDate: facts.referenceDate, items: [
    ...facts.items.map((i) => row("item", i.value.label, i)),
    ...facts.options.map((o) => row("option", o.value.label, o)),
    row("premise", "Necessidade média", facts.needAverage, "needAverage"),
    row("premise", "Pico da necessidade", facts.needPeak, "needPeak"),
    row("premise", "CDI anual", facts.annualDi, "annualDi"),
    ...facts.lienBasketRemaining ? [row("premise", "Saldo livre da exceção de garantias", facts.lienBasketRemaining, "lienBasketRemaining")] : [],
    row("premise", "Faixa para operação dedicada", facts.dedicatedVehicleThreshold, "dedicatedVehicleThreshold"),
  ]};
}

export function buildReceivablesFundingPremiseProposal(facts: ReceivablesFundingFacts) {
  return fingerprintedProposal(receivablesFundingPremiseMethod, facts, proposeReceivablesFundingHypotheses(facts), receivablesFundingSummary(facts));
}

export async function proposeReceivablesFundingPremisesForTurn(input: {
  message: string; hasAttachments: boolean; recentUserMessages: string[]; projectId: string | null;
  loadEvidence: () => Promise<unknown>; extract: (text: string) => Promise<unknown>;
  log: (event: string, detail: Record<string, unknown>) => void;
}) {
  const entry = input.projectId ? premiseEntry("receivables_funding", input.message, input.hasAttachments, input.recentUserMessages) : null;
  if (!input.projectId || !entry) return null;
  return proposeLote2PremisesForTurn({logPrefix: "receivables_funding_premises", idName: "receivables-funding", schema: receivablesFundingExtractionSchema,
    complete: (extraction, id) => completeReceivablesFundingFacts({extraction, ids: {receivablesFundingId: id, entityId: id, definitionVersionId: id}, currency: "BRL"}),
    build: buildReceivablesFundingPremiseProposal}, {...input, entry, projectId: input.projectId});
}
