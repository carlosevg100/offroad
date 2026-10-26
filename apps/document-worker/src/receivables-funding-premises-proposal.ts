import Decimal from "decimal.js";
import {z} from "zod";
import {composeBoundReceivablesFunding, prepareReceivablesFundingPacket, proposeReceivablesFundingHypotheses, receivablesFundingFactsSchema, type ReceivablesFundingFacts} from "@offroad/financial-model";
import {statedLabel, withRecordIdentity, unsourcedFields, factsOrGaps, repeatedLabels, citedSource, extractedOrigin, fingerprintedProposal, itemKeys, itemLabel, itemSource, normalizedName, proposeLote2PremisesForTurn, sameLabel, sourced, stableKey, stated,
  summaryRow, type Lote2Completion, type Lote2Summary} from "./lote2-premises";
import {premiseEntry, turnIntentInstruction, turnIntents} from "./premise-cue";
import {readerGaps, type BoundBasis} from "./lote3-reader-check";

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
  /** The last day the money is used (repaid or no longer drawn): the end of the period of use, not of the need. */
  useEndDate: sourced(z.iso.date()),
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
    debtorLabel: itemLabel.nullable(),
    /** Where the lot was read (row, page or cell of the borderô or the document); null when the source does not say. */
    anchor: z.string().trim().min(1).max(200).nullable(),
    /** The debtor's CNPJ when a document states it: the debtor's identity before any name. */
    debtorTaxId: z.string().regex(/^\d{14}$/).nullable(), debtorSetDisjoint: z.boolean().nullable()})).max(16),
  options: z.array(z.strictObject({...item, kind: z.enum(kinds), recourse: z.enum(["with_recourse", "without_recourse"]).nullable(),
    rateBasis: z.enum(["monthly", "annual", "di_plus"]).nullable(), rate: ratio.nullable(),
    iofDaily: ratio.nullable(), iofDailyCapDays: days.nullable(), iofAdditional: ratio.nullable(), rolloverDays: z.union([days, z.literal("none")]).nullable(), upfrontFee: ratio.nullable(),
    collateral: z.enum(["none", "receivables_assignment", "unknown"]).nullable(), leadDaysMin: days.nullable(), leadDaysMax: days.nullable(),
    maxDaysPastDue: days.nullable(), maxRemainingTermDays: days.nullable(), registrationRule: z.enum(["required", "not_required"]).nullable(),
    minCreditTier: z.enum(["selected", "standard"]).nullable(), sublimitPerDebtor: z.union([money, z.literal("none")]).nullable(), sublimitGroup: z.union([z.literal("none"), itemLabel]).nullable(),
    anchorItemLabels: z.array(itemLabel).max(16)})).max(8),
});
export type ReceivablesFundingExtraction = z.infer<typeof receivablesFundingExtractionSchema>;

export const receivablesFundingExtractionContract = {
  task: "receivables_funding_extraction" as const,
  system: [
    "Você extrai os dados que permitem dizer quanto de uma carteira de recebíveis vira caixa, com quem, a que custo e em quanto tempo, contra a linha bancária, a partir da mensagem de uma pessoa, das mensagens anteriores e de campos já extraídos de documentos (carteira por sacado, contratos com clientes, tabela de dívida, propostas, regulamentos de fundos).",
    "Extraia somente o que foi dito ou o que está em documento. Se não estiver, devolva null (em value, origin e source, ou no campo) ou lista vazia. Nunca estime, nunca complete, nunca invente taxa de mercado.",
    "Valores monetários em reais, sem separador de milhar (R$ 62 milhões vira 62000000). Taxas em fração (1,6% ao mês vira rate 0.016 com rateBasis monthly; CDI mais 1,2 ao ano vira rate 0.012 com rateBasis di_plus). Datas no formato AAAA-MM-DD.",
    "referenceDate é a data da posição da carteira. A necessidade: needAverage é o uso médio, needPeak o pico, needStartDate quando o dinheiro precisa entrar, needEndDate quando a necessidade acaba (o fim da safra, o horizonte da análise), useEndDate o último dia em que o dinheiro é usado (quando é pago ou deixa de ser sacado), calendarDays e businessDays o prazo de uso, do início ao fim do uso, em dias corridos e úteis; o fim do uso pode ser diferente do fim da necessidade, needProfile seasonal (safra, sazonal) ou structural. annualDi é o CDI anual usado na conta; averageTermDays o prazo médio de recebimento. dedicatedVehicleThreshold é a faixa de volume cedido por mês a partir da qual uma operação dedicada se paga, só quando um documento ou a pessoa a der.",
    "items: cada grupo da carteira (um sacado grande, um conjunto de sacados, os vencidos), com o valor, se o contrato permite ceder (assignable) ou proíbe sem anuência, se está livre, cedido ou empenhado e a quem, o evento que libera, as datas de emissão e vencimento, o registro da duplicata, a qualidade de crédito do sacado (selected para os de melhor crédito), se o sacado tem programa de antecipação a fornecedores, o número de sacados e o maior sacado; debtorLabel é o nome do sacado sempre que o grupo tem um só sacado (e o nome do sacado comum quando um sacado aparece em mais de um grupo), nunca o nome do lote; debtorTaxId é o CNPJ do sacado quando um documento o traz; anchor é onde o grupo foi lido (linha, página ou célula do borderô ou do documento), null quando a fonte não diz.",
    "options: cada porta (programa de antecipação de um cliente, FIDC, desconto bancário, linha bancária) como a proposta ou o regulamento escreve: coobrigação, taxa, IOF, comissão, prazo até o primeiro desembolso e os critérios de elegibilidade (atraso máximo, prazo máximo, registro, qualidade de crédito mínima, sublimite por sacado e o grupo de fundos que o compartilha, e os grupos da carteira de um programa de cliente).",
    "rolloverDays é o prazo de cada renovação da linha; sublimitPerDebtor é o limite por sacado. Nos dois, \"none\" quando a proposta ou o regulamento diz que não há (sem renovação, sem sublimite) e null quando ninguém disse; nunca troque um pelo outro. sublimitGroup é o nome do grupo de compradores que divide o sublimite com outras opções (por exemplo os mesmos cotistas em dois produtos FIDC), \"none\" quando foi dito que a opção tem compradores próprios e null quando ninguém disse. lienBasketRemaining é o saldo livre da exceção de garantias da escritura, quando a tabela de dívida ou a pessoa o dá.",
    "origin é informed quando a pessoa disse, document quando veio de um campo de documento. source cita em poucas palavras de onde veio.",
    turnIntentInstruction,
  ].join("\n"),
  schema: receivablesFundingExtractionSchema,
  schemaName: "receivables_funding_extraction_v5",
  outputMode: "prompted_json" as const,
  maxOutputTokens: 10_000,
  cacheKey: "receivables-funding-extraction-2026.10.26-v5",
};

const dayMs = 86400000;
const shift = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * dayMs).toISOString().slice(0, 10);
const between = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / dayMs);
/** Monday to Friday from the start, for the stated number of calendar days; holidays are not known here. */
const weekdays = (start: string, n: number) => Array.from({length: n}, (_, k) => new Date(Date.parse(`${start}T00:00:00Z`) + k * dayMs).getUTCDay()).filter((d) => d !== 0 && d !== 6).length;

/** Contradictions inside one record of a receivables funding turn, each named by its field. */
export function receivablesFundingContradictions(e: ReceivablesFundingExtraction): string[] {
  const out: string[] = [], d = (x: string) => new Decimal(x);
  const average = e.needAverage.value, peak = e.needPeak.value, start = e.needStartDate.value, end = e.needEndDate.value, band = e.dedicatedVehicleThreshold.value;
  if (average !== null && peak !== null && d(peak).lt(d(average))) out.push("needPeak");
  if (start !== null && end !== null && end <= start) out.push("needEndDate");
  // The period of use: its start, its end and its length in calendar days are one fact stated three ways. When the
  // three are stated and disagree, the length is asked; the end of the need is another concept and is not compared.
  const useEnd = e.useEndDate.value, days = e.calendarDays.value;
  if (start !== null && useEnd !== null && useEnd <= start) out.push("useEndDate");
  else if (start !== null && useEnd !== null && days !== null && between(start, useEnd) !== days) out.push("calendarDays");
  if (band !== null && d(band.min).gt(d(band.max))) out.push("dedicatedVehicleThreshold");
  const reference = e.referenceDate.value;
  e.items.forEach((i, k) => {
    const p = `items.${k + 1}.`;
    if (i.encumbrance === "free" && (i.encumbranceHolder !== null || i.releaseEvent !== null)) out.push(p + "encumbrance");
    if (i.originDate !== null && i.dueDate !== null && i.dueDate < i.originDate) out.push(p + "dueDate");
    if (i.originDate !== null && reference !== null && i.originDate > reference) out.push(p + "originDate");
    if (i.debtorCount === 1 && i.debtorSetDisjoint !== null) out.push(p + "debtorSetDisjoint");
    if (i.largestDebtorAmount !== null && (d(i.largestDebtorAmount).gt(d(i.amount)) || (i.debtorCount === 1 && !d(i.largestDebtorAmount).eq(d(i.amount)))
      || (i.debtorCount !== null && d(i.amount).gt(d(i.largestDebtorAmount).mul(i.debtorCount))))) out.push(p + "largestDebtorAmount");
  });
  e.options.forEach((o, k) => {
    const p = `options.${k + 1}.`;
    if (o.kind === "bank_line" && o.recourse === "without_recourse") out.push(p + "recourse");
    if (o.kind === "bank_line" && [o.maxDaysPastDue, o.maxRemainingTermDays, o.registrationRule, o.minCreditTier, o.sublimitPerDebtor, o.sublimitGroup].some((x) => x !== null)) out.push(p + "kind");
    if (o.kind !== "anchor_program" && o.anchorItemLabels.length) out.push(p + "anchorItemLabels");
    if (o.sublimitGroup !== null && o.sublimitGroup !== "none" && (o.sublimitPerDebtor === null || o.sublimitPerDebtor === "none")) out.push(p + "sublimitGroup");
    if (o.leadDaysMin !== null && o.leadDaysMax !== null && o.leadDaysMin > o.leadDaysMax) out.push(p + "leadDays");
  });
  return out;
}

/** Turns the extraction into the facts the method needs. The portfolio, the need and every option's terms,
 * IOF included, are the company's or its documents': a value no source states is never adopted under that
 * source's origin, so the reply asks for it in one batch. House premises carry their own origin and are
 * stated as such: the days of use from the two dates (or the end from the start and the days), and business
 * days counted Monday to Friday without holidays as an estimate. The monthly volume from which a dedicated
 * vehicle pays is asked: no public source in the repository states it. */
export function completeReceivablesFundingFacts(input: {extraction: ReceivablesFundingExtraction; ids: {receivablesFundingId: string; entityId: string; definitionVersionId: string}; currency: "BRL"}):
  Lote2Completion<ReceivablesFundingFacts> {
  // Record identity (see withRecordIdentity): a keyed collection holds one fact per key; a countable one merges only the
  // same record read twice from one source and asks equal records from another source (duplicateOf). Gap positions count after merging.
  const missing: string[] = [], used: string[] = [];
  const {e, ambiguous} = withRecordIdentity(input.extraction, {keyed: ["options"], countable: ["items"]}, missing);
  // A value stated without its origin is asked, never replaced by a house default nor dropped.
  missing.push(...unsourcedFields(e as unknown as Record<string, unknown>));
  // Fields of one record that contradict each other are asked, never resolved in favour of either (independent review, round 12).
  missing.push(...receivablesFundingContradictions(e));
  const need = {average: stated(e.needAverage), peak: stated(e.needPeak), start: stated(e.needStartDate), profile: stated(e.needProfile),
    di: stated(e.annualDi), term: stated(e.averageTermDays), reference: stated(e.referenceDate)};
  for (const [k, v] of [["referenceDate", need.reference], ["needAverage", need.average], ["needPeak", need.peak], ["needStartDate", need.start], ["needProfile", need.profile],
    ["annualDi", need.di], ["averageTermDays", need.term]] as const) if (!v) missing.push(k);
  const threshold = stated(e.dedicatedVehicleThreshold);
  if (!threshold) missing.push("dedicatedVehicleThreshold");
  const end = stated(e.needEndDate), statedDays = stated(e.calendarDays), useEnd = stated(e.useEndDate);
  if (!end && !statedDays && !useEnd) missing.push("needEndDate");
  if (!e.items.length) missing.push("items");
  if (!e.options.length) missing.push("options");
  // Options name their anchor items by label: an item label stated twice is asked, never resolved to the first.
  // A repeated lot label matters only where an option names its lots by label; two rows of one borderô may share a label.
  const referenced = new Set(e.options.flatMap((o) => o.anchorItemLabels.map(statedLabel)));
  for (const k of repeatedLabels(e.items.map((i) => i.label))) if (!ambiguous.get("items")!.has(k) && referenced.has(statedLabel(e.items[k - 1]!.label))) missing.push(`items.${k}.label`);
  const itemIds = itemKeys(e.items.map((i) => i.label));
  // Debtor identities are reconciled across every group before any key, from what is stated only: a stated CNPJ is
  // the debtor's identity; a stated debtor name with compatible CNPJs (equal, or stated in some groups only) is one
  // debtor, keyed by its CNPJ when any group states it and otherwise by the name with a hash. A lot label is never a
  // debtor name. Two lots with the same CNPJ and no names are the same debtor. The same stated name with two CNPJs, or
  // one CNPJ under two stated names, is asked, never split into two debtors nor merged into one (round 16).
  const nameOf = (i: ReceivablesFundingExtraction["items"][number]) => i.debtorLabel === null ? null : normalizedName(i.debtorLabel);
  const taxesByName = new Map<string, Set<string>>(), namesByTax = new Map<string, Set<string>>();
  for (const i of e.items) {
    const name = nameOf(i);
    if (name !== null && !taxesByName.has(name)) taxesByName.set(name, new Set());
    if (i.debtorTaxId !== null && !namesByTax.has(i.debtorTaxId)) namesByTax.set(i.debtorTaxId, new Set());
    if (name !== null && i.debtorTaxId !== null) {taxesByName.get(name)!.add(i.debtorTaxId); namesByTax.get(i.debtorTaxId)!.add(name);}
  }
  e.items.forEach((i, k) => {
    const name = nameOf(i);
    if (name !== null && taxesByName.get(name)!.size > 1) missing.push(`items.${k + 1}.debtorTaxId`);
    if (i.debtorTaxId !== null && namesByTax.get(i.debtorTaxId)!.size > 1) missing.push(`items.${k + 1}.debtorLabel`);
  });
  const debtorKeyOf = (i: ReceivablesFundingExtraction["items"][number]) => {
    if (i.debtorTaxId !== null) return `cnpj-${i.debtorTaxId}`;
    const name = nameOf(i), taxes = name === null ? [] : [...taxesByName.get(name)!];
    if (taxes.length === 1) return `cnpj-${taxes[0]}`;
    // A set of debtors (or a lot without a stated debtor where no per-debtor sublimit applies) keys by its own label.
    return stableKey(i.debtorLabel ?? i.label, 80);
  };
  // A single debtor with neither name nor CNPJ has no identity: where a per-debtor sublimit applies, the lot label is
  // never read as the debtor (two lots would become two independent buyers); the debtor is asked (round 15).
  const perDebtorCap = e.options.some((o) => o.kind !== "bank_line" && o.sublimitPerDebtor !== null && o.sublimitPerDebtor !== "none");
  e.items.forEach((i, k) => {if (perDebtorCap && i.debtorCount === 1 && i.debtorLabel === null && i.debtorTaxId === null) missing.push(`items.${k + 1}.debtorLabel`);});
  const groupIdentities = new Map<string, string>();
  e.options.forEach((o, k) => {if (o.sublimitGroup === null || o.sublimitGroup === "none") return; const key = stableKey(o.sublimitGroup), seen = groupIdentities.get(key), id = normalizedName(o.sublimitGroup);
    if (seen !== undefined && seen !== id) missing.push(`options.${k + 1}.sublimitGroup`); else groupIdentities.set(key, id);});
  const items = e.items.map((i, k) => {
    const p = `items.${k + 1}.`, before = missing.length;
    for (const f of ["contract", "encumbrance", "originDate", "dueDate", "registration", "creditTier", "anchorProgram"] as const) if (i[f] === null) missing.push(p + f);
    if (i.encumbrance !== null && i.encumbrance !== "free" && i.encumbranceHolder === null) missing.push(p + "encumbranceHolder");
    if (missing.length > before) return null;
    const single = i.debtorCount === 1;
    if (!single && i.debtorSetDisjoint === null) {missing.push(p + "debtorSetDisjoint"); return null;}
    const debtor = debtorKeyOf(i);
    const free = i.encumbrance === "free";
    return {value: {id: itemIds[k]!, label: i.label, amount: i.amount, contract: i.contract!, encumbrance: i.encumbrance!, encumbranceHolder: free ? null : i.encumbranceHolder,
      releaseEvent: free ? null : i.releaseEvent, originDate: i.originDate!, dueDate: i.dueDate!, registration: i.registration!, creditTier: i.creditTier!,
      anchorProgram: i.anchorProgram!, debtorCount: i.debtorCount,
      // One debtor whose largest amount equals the lot says nothing more than the lot: carried as the reader expects it (round 13).
      largestDebtorAmount: single && i.largestDebtorAmount !== null && new Decimal(i.largestDebtorAmount).eq(new Decimal(i.amount)) ? null : i.largestDebtorAmount, debtorKey: debtor,
      debtorSetDisjoint: single ? null : i.debtorSetDisjoint!}, origin: i.origin, source: citedSource(i.origin, i.source)};
  });
  const optionIds = itemKeys(e.options.map((o) => o.label));
  const sublimited = e.options.flatMap((o, k) => o.kind !== "bank_line" && o.sublimitPerDebtor !== null && o.sublimitPerDebtor !== "none" ? [k] : []);
  const options = e.options.map((o, k) => {
    const p = `options.${k + 1}.`, before = missing.length;
    // IOF is asked for every option the documents or the person do not price, a sale of receivables included:
    // a value the source does not state is never adopted under the source's origin.
    for (const f of ["recourse", "rateBasis", "rate", "upfrontFee", "iofDaily", "iofDailyCapDays", "iofAdditional", "collateral"] as const) if (o[f] === null) missing.push(p + f);
    if (o.kind !== "bank_line") for (const f of ["maxDaysPastDue", "maxRemainingTermDays", "registrationRule", "minCreditTier"] as const) if (o[f] === null) missing.push(p + f);
    if ((o.leadDaysMin === null) !== (o.leadDaysMax === null)) missing.push(p + "leadDays");
    // Absence is never read as none: a rollover term or a per-debtor sublimit nobody stated is asked; "none" is stated.
    if (o.rolloverDays === null) missing.push(p + "rolloverDays");
    if (o.kind !== "bank_line" && o.sublimitPerDebtor === null) missing.push(p + "sublimitPerDebtor");
    // With two or more sale options capped per debtor, an unstated grouping is asked: shared buyers or independent
    // ones change the volume, and absence is never read as independence (independent review, round 10).
    if (sublimited.length > 1 && sublimited.includes(k) && o.sublimitGroup === null) missing.push(p + "sublimitGroup");
    const anchors = o.anchorItemLabels.map((l) => e.items.findIndex((i) => sameLabel(i.label, l)));
    if (anchors.some((x) => x < 0) || (o.kind === "anchor_program" && !anchors.length)) missing.push(p + "anchorItemLabels");
    if (missing.length > before) return null;
    return {value: {id: optionIds[k]!, label: o.label, kind: o.kind, recourse: o.recourse!,
      eligibility: o.kind === "bank_line" ? null : {maxDaysPastDue: o.maxDaysPastDue!, maxRemainingTermDays: o.maxRemainingTermDays!, registrationRule: o.registrationRule!,
        minCreditTier: o.minCreditTier!, sublimitPerDebtor: o.sublimitPerDebtor === "none" ? null : o.sublimitPerDebtor, sublimitGroup: o.sublimitGroup === null || o.sublimitGroup === "none" ? null : stableKey(o.sublimitGroup),
        anchorItemIds: anchors.map((x) => itemIds[x]!)},
      rate: {basis: o.rateBasis!, rate: o.rate!}, iofDaily: o.iofDaily!, iofDailyCapDays: o.iofDailyCapDays!, iofAdditional: o.iofAdditional!,
      rolloverDays: o.rolloverDays === "none" ? null : o.rolloverDays, upfrontFee: o.upfrontFee!, collateral: o.collateral!, leadDaysMin: o.leadDaysMin, leadDaysMax: o.leadDaysMax},
      origin: o.origin, source: citedSource(o.origin, o.source)};
  });
  // An option that pledges or may pledge the receivables uses the indenture's permitted-lien basket: its remaining balance is asked, never read as unlimited.
  if (e.options.some((o) => o.collateral !== null && o.collateral !== "none") && !stated(e.lienBasketRemaining)) missing.push("lienBasketRemaining");
  // Business days stated beyond the calendar days of use are asked, never reconciled by choosing one.
  const statedBusiness = stated(e.businessDays), calendarSpan = statedDays?.value ?? (useEnd && need.start ? between(need.start.value, useEnd.value) : end && need.start ? between(need.start.value, end.value) : null);
  if (statedBusiness && calendarSpan !== null && statedBusiness.value > calendarSpan) missing.push("businessDays");
  if (missing.length || !threshold || !need.reference || !need.average || !need.peak || !need.start || !need.profile || !need.di || !need.term) return {status: "missing", missing: [...new Set(missing)]};
  // Two of start, end of use and length stated derive the third; with no end of use, the house reads the use as the whole need.
  const calendarDays = statedDays ?? (useEnd ? {value: between(need.start.value, useEnd.value), origin: useEnd.origin, source: `Dias corridos entre o início e o fim do uso (${useEnd.source})`}
    : {value: between(need.start.value, end!.value), origin: "house" as const, source: "Dias corridos entre o início e o fim da necessidade"});
  if (!statedDays && !useEnd) used.push("calendarDays");
  const endDate = end?.value ?? useEnd?.value ?? shift(need.start.value, calendarDays.value);
  if (!end) used.push("needEndDate");
  const business = stated(e.businessDays) ?? {value: weekdays(need.start.value, calendarDays.value), origin: "estimate" as const, source: "Dias de segunda a sexta no prazo de uso, sem feriados"};
  if (!stated(e.businessDays)) used.push("businessDays");
  const parsedFacts = factsOrGaps(receivablesFundingFactsSchema, {...input.ids, perimeter: "standalone", currency: input.currency, referenceDate: need.reference.value, endDate,
    needAverage: need.average, needPeak: need.peak, needStartDate: need.start, calendarDays, businessDays: business, annualDi: need.di, averageTermDays: need.term,
    needProfile: need.profile, lienBasketRemaining: stated(e.lienBasketRemaining),
    dedicatedVehicleThreshold: threshold,
    items: items.map((i) => i!), options: options.map((o) => o!)});
  if (!parsedFacts.ok) return {status: "missing", missing: parsedFacts.missing};
  const facts = parsedFacts.facts;
  return {status: "complete", facts, situationId: need.profile.value === "seasonal" ? "seasonal-working-capital" : "structural-working-capital", housePremiseKeys: [...new Set(used)]};
}


/** What the method's own reader and packet would refuse after confirmation, named before the card is offered. */
/** The method's own reader and packet over a basis, as the confirmation will run them. */
export const receivablesFundingReader = (b: BoundBasis) => {
  const question = "Verificação das premissas antes da confirmação";
  return prepareReceivablesFundingPacket(composeBoundReceivablesFunding({...b, question}));
};
export function receivablesFundingReaderGaps(facts: ReceivablesFundingFacts): string[] {
  return readerGaps(proposeReceivablesFundingHypotheses(facts), receivablesFundingReader);
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
  return proposeLote2PremisesForTurn({logPrefix: "receivables_funding_premises", idName: "receivables-funding", expansionRefusalAsGap: true, schema: receivablesFundingExtractionSchema,
    complete: (extraction, id) => completeReceivablesFundingFacts({extraction, ids: {receivablesFundingId: id, entityId: id, definitionVersionId: id}, currency: "BRL"}),
    build: buildReceivablesFundingPremiseProposal, readerCheck: receivablesFundingReaderGaps}, {...input, entry, projectId: input.projectId});
}
