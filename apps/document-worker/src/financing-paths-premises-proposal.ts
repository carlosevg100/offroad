import {createHash} from "node:crypto";
import Decimal from "decimal.js";
import {z} from "zod";
import {capitalPathsFactsSchema, capitalPathsKernelFromFacts, composeBoundCapitalPaths, prepareCapitalPathsPacket, proposeCapitalPathsHypotheses,
  type CapitalPathsFacts} from "@offroad/financial-model";
import {asksForFinancingPaths, compileObjectiveToPlan, financingPathsCues} from "@offroad/work-plan";
import {canonicalJson, citedSource, extractedOrigin, factsOrGaps, fingerprintedProposal, itemKeys, itemLabel, itemSource, labelKey, proposeLote2PremisesForTurn,
  sourced, stated, summaryRow, unsourcedFields, withRecordIdentity, type Lote2Completion, type Lote2Origin, type Lote2Summary, type Lote2TurnPremises} from "./lote2-premises";
import {asksOrExplains, foldCue, premiseCueKind, turnIntentInstruction, turnIntents} from "./premise-cue";
import {readerGaps, type BoundBasis} from "./lote3-reader-check";

/** The method these premises feed, pinned to its implemented version. Not the capital structure procedure
 * (prepare-capital-structure-decision), which keeps its own route. */
export const financingPathsPremiseMethod = {methodId: "evaluate-financing-paths", methodVersion: "2026.10.27-v1"} as const;

/** The ficha C32 phrasings, each the whole construction, are the router's own (packages/work-plan/src/financing-paths-route.ts):
 * the worker reads them before the router knows the kind, so the two never disagree. */
export {financingPathsCues};
/** A what-if on a path of the analysis already open ("E se eu só alongar o Bradesco com ele mesmo, por mais dois anos?",
 * ficha C32 turn 4): a continuation candidate even as a question, never a cue on its own. */
export const financingPathsWhatIf = /^(?:(?:uma|um|a|o) [^.?!]{1,80}[.!]\s*)?e se (?:eu |a gente |nos |a companhia )?(?:so |apenas )?(?:alongar|alongarmos|estender|estendermos|prorrogar|prorrogarmos) (?:o|a|os|as) [a-z0-9 ]{1,40}?(?: com (?:ele|ela|eles|elas) (?:mesmo|mesma|mesmos|mesmas))?(?:,? por mais (?:um|dois|tres|quatro|cinco|\d{1,2}) anos?)?[?.!]*$/;
const routingText = (message: string) => foldCue(message).replace(/\s+/g, " ").trim();
export const financingPathsCue = (message: string) => asksForFinancingPaths(routingText(message));

/** The objectives of the other premise methods: a message that compiles to one of them is that method's. */
const otherPremiseKinds = new Set(["proposal_comparison", "relative_debt_cost", "debt_capacity", "debt_table", "covenant_headroom", "weekly_cash",
  "operating_projection", "projection_challenge", "receivables_funding", "quarter_update", "document_folder", "received_proposal", "board_capital_discussion"]);

/** How a turn enters this step: by the ficha's own phrasing, or as a continuation candidate when the latest earlier
 * premise question among the recent messages is this one's, the message is not a question nor a request for
 * explanation (a what-if on a path is the exception) and it does not compile to another premise method. The
 * extraction's `turnIntent` decides any continuation. */
export function financingPathsEntry(message: string, hasAttachments: boolean, earlierUserMessages: readonly string[]): "cue" | "continuation" | null {
  if (financingPathsCue(message)) return "cue";
  const own = premiseCueKind(message, hasAttachments) as string | null;
  if (own !== null && own !== "financing_paths") return null;
  if (asksOrExplains(message) && !financingPathsWhatIf.test(routingText(message))) return null;
  const compiled = compileObjectiveToPlan({message, hasAttachments}).objectiveKind as string;
  if (otherPremiseKinds.has(compiled)) return null;
  for (let n = earlierUserMessages.length - 1; n >= 0; n--) {
    if (financingPathsCue(earlierUserMessages[n]!)) return "continuation";
    if (premiseCueKind(earlierUserMessages[n]!, false)) return null;
  }
  return null;
}
export const shouldProposeFinancingPathsPremises = (message: string, hasAttachments: boolean, earlierUserMessages: readonly string[] = []) =>
  financingPathsEntry(message, hasAttachments, earlierUserMessages) !== null;

const signed = z.string().regex(/^-?\d{1,40}(?:\.\d{1,40})?$/);
const unsigned = z.string().regex(/^\d{1,40}(?:\.\d{1,40})?$/);
const fraction = z.string().regex(/^-?\d{1,4}(?:\.\d{1,20})?$/);
/** The scale an amount is written in; null when nobody stated it. */
const scale = z.enum(["reais", "milhares", "milhoes"]).nullable();
type Scale = NonNullable<z.infer<typeof scale>>;
const text = z.string().trim().min(1).max(500);
const months = z.array(z.number().int().min(1).max(12)).min(1).max(12);
const year = z.number().int().min(2000).max(2200);
const record = {label: itemLabel, origin: extractedOrigin, source: itemSource};
const dated = z.strictObject({date: z.iso.date(), amount: unsigned});

/** Only what the person said or a document states. Absence stays null; nothing is estimated, no structure is chosen here. */
export const financingPathsExtractionSchema = z.strictObject({
  turnIntent: z.enum(turnIntents),
  /** The date of the opening cash position and the cash available on it. */
  openingDate: sourced(z.iso.date()),
  openingCash: sourced(z.strictObject({amount: signed, scale})),
  /** Minimum cash of policy, when the company or the person states it. */
  minimumCash: sourced(z.strictObject({amount: unsigned, scale})),
  taxRate: sourced(fraction),
  /** One row per period of the projection, as the document gives it. */
  periods: z.array(z.strictObject({periodEnd: z.iso.date(), ebitda: signed, depreciation: unsigned, leasePayments: unsigned, workingCapitalCashFlow: signed,
    maintenanceCapex: unsigned, scale, origin: extractedOrigin, source: itemSource})).max(40),
  /** The DI curve: one annual rate per period end, and one per year after the horizon. */
  diCurve: sourced(z.strictObject({byPeriod: z.array(z.strictObject({periodEnd: z.iso.date(), rate: fraction})).max(40),
    afterHorizon: z.array(z.strictObject({year, rate: fraction})).max(15)})),
  /** Each variant of the investment with its effects per period, as the project analysis states them. */
  variants: z.array(z.strictObject({...record, scale, effects: z.array(z.strictObject({periodEnd: z.iso.date(), ebitda: signed, depreciation: unsigned, maintenanceCapex: unsigned,
    growthCapex: unsigned, startupWorkingCapitalCashFlow: signed})).max(40)})).max(5),
  /** A stress case the person or a document sets; null leaves the house case. */
  stress: sourced(z.strictObject({ebitdaFactor: fraction, fromPeriodEnd: z.iso.date().nullable()})),
  indenture: sourced(z.strictObject({limit: fraction, comparator: z.enum(["lte", "lt"]), measurementMonths: months, ebitdaExcludesLeases: z.boolean()})),
  covenantHistory: z.array(z.strictObject({...record, months: z.number().int().min(1).max(12), ebitda: signed, leasePayments: unsigned, scale})).max(8),
  /** The board policy: stated, stated as none, or null when nobody said. */
  boardPolicy: z.strictObject({status: z.enum(["stated", "none"]).nullable(), limit: fraction.nullable(), comparator: z.enum(["lte", "lt"]).nullable(),
    measurementMonths: months.nullable(), ownDefinition: text.nullable(), origin: extractedOrigin.nullable(), source: itemSource.nullable()}),
  /** The indenture's exception for new liens: stated, stated as none, or null when nobody said. */
  basket: z.strictObject({status: z.enum(["stated", "none"]).nullable(), holderLabel: itemLabel.nullable(), limit: unsigned.nullable(), basis: z.enum(["aggregate", "per_operation"]).nullable(),
    occupied: unsigned.nullable(), scale, origin: extractedOrigin.nullable(), source: itemSource.nullable()}),
  instruments: z.array(z.strictObject({...record, scale,
    role: z.enum(["existing", "amended", "new"]).nullable(), replacesLabel: itemLabel.nullable(),
    lenderKind: z.enum(["bank", "capital_markets", "development_bank"]).nullable(),
    openingPrincipal: unsigned.nullable(), finalPaymentDate: z.iso.date().nullable(),
    rateKind: z.enum(["index_plus_spread", "fixed"]).nullable(),
    /** The spread over DI or the fixed annual rate, from a date on; the first applies from the opening. */
    rates: z.array(z.strictObject({from: z.iso.date().nullable(), rate: fraction})).max(12),
    interestEvery: z.enum(["quarter", "semester"]).nullable(),
    monthlyAmortization: z.boolean().nullable(),
    draws: z.array(dated).max(40).nullable(), amortization: z.array(dated).max(120).nullable(),
    charges: z.array(z.strictObject({label: itemLabel, date: z.iso.date(), category: z.enum(["origination_fee", "recurring_fee", "tax", "other"]), amount: unsigned})).max(12),
    security: z.strictObject({kind: z.enum(["receivables", "financed_asset", "none"]), amount: unsigned, countsAgainstBasket: z.boolean().nullable()}).nullable(),
    prepayment: z.union([z.strictObject({basis: z.enum(["flat", "per_year_of_weighted_remaining_life"]), rate: fraction}), z.literal("none")]).nullable(),
    afterHorizon: z.discriminatedUnion("kind", [z.strictObject({kind: z.literal("none")}), z.strictObject({kind: z.literal("equal_annual"), fromYear: year, toYear: year}),
      z.strictObject({kind: z.literal("shares"), shares: z.array(z.strictObject({year, share: fraction})).min(1).max(15)}),
      z.strictObject({kind: z.literal("not_tested"), reason: text}),
      z.strictObject({kind: z.literal("seasonal_release"), settlementMonthsAfterDraw: z.number().int().min(1).max(12), justification: text})]).nullable(),
    alternativeProfiles: z.array(z.strictObject({label: itemLabel, fromYear: year, toYear: year})).max(3)})).max(24),
  paths: z.array(z.strictObject({...record, scale,
    role: z.enum(["status_quo", "candidate", "companion"]).nullable(),
    projectVariantLabel: itemLabel.nullable(), withoutProject: z.boolean(),
    instrumentLabels: z.array(itemLabel).max(16),
    prepayments: z.array(z.strictObject({instrumentLabel: itemLabel, date: z.iso.date()})).max(8),
    charges: z.array(z.strictObject({label: itemLabel, instrumentLabel: itemLabel, date: z.iso.date(), category: z.enum(["origination_fee", "recurring_fee", "tax", "other"]),
      amount: unsigned})).max(8)})).max(12),
  /** The annual base after the horizon, one row per year. */
  postHorizon: z.array(z.strictObject({year, ebitda: signed, leasePayments: unsigned, maintenanceCapex: unsigned, workingCapitalInvestment: signed, depreciation: unsigned,
    otherInterest: unsigned, scale, origin: extractedOrigin, source: itemSource})).max(15),
  maximumSpread: sourced(fraction), soundingBy: sourced(z.iso.date()), routeDecisionBy: sourced(z.iso.date()),
  sensitivities: z.array(z.strictObject({...record, scale, ebitdaDelta: z.array(z.strictObject({periodEnd: z.iso.date(), amount: signed})).max(40),
    workingCapitalDelta: z.array(z.strictObject({periodEnd: z.iso.date(), amount: signed})).max(40), minimumCash: unsigned.nullable()})).max(6),
});
export type FinancingPathsExtraction = z.infer<typeof financingPathsExtractionSchema>;

export const financingPathsExtractionContract = {
  task: "financing_paths_extraction" as const,
  system: [
    "Você extrai os dados que permitem avaliar, na mesma base, os caminhos de financiamento de uma companhia que precisa financiar um investimento, o giro e os vencimentos da dívida, a partir da mensagem de uma pessoa, das mensagens anteriores e de campos já extraídos de documentos (tabela de dívida, escrituras e aditamentos, contratos, ata do conselho, projeção, análise do investimento, propostas e term sheets, indicações de preço).",
    "Extraia somente o que foi dito ou o que está em documento. Se não estiver, devolva null (em value, origin e source, ou no campo) ou lista vazia. Nunca estime, nunca complete, nunca invente taxa, prazo, garantia ou cronograma. Instrumentos e caminhos são estrutura: traga só os que a pessoa ou um documento descreve, com os termos escritos; nunca monte um caminho ou um instrumento que ninguém descreveu.",
    "Valores monetários como estão escritos, com ponto decimal e sem separador de milhar, e em scale a escala em que o documento ou a conversa os dá: reais, milhares ou milhoes (R$ 1,25 milhão vira 1.25 com milhoes; R$ 1.250 mil vira 1250 com milhares). Nunca converta de uma escala para outra; scale é null quando ninguém disse. Taxas, spreads, alíquotas e participações em fração (CDI mais 2,9 vira 0.029; 34% vira 0.34). Datas no formato AAAA-MM-DD.",
    "openingDate e openingCash são a data e o caixa da posição de abertura. periods é a projeção por período (trimestre, normalmente), uma linha por fim de período: EBITDA, depreciação, arrendamentos pagos, fluxo de capital de giro com sinal (negativo consome caixa) e capex de manutenção. diCurve é o CDI anual por fim de período e por ano depois do horizonte. minimumCash é o caixa mínimo de política; taxRate a alíquota de imposto sobre o lucro.",
    "variants são as variantes do investimento (no cronograma informado, adiado), cada uma com os efeitos por período da análise do projeto: EBITDA a mais, depreciação, manutenção, capex do projeto e giro da partida com sinal, uma linha por fim de período. stress só quando a pessoa ou um documento fixa um caso de estresse (fator do EBITDA, 0.85 para 15% menor).",
    "indenture é o covenant da escritura: limite, comparador (lte para até, lt para menor que), meses de apuração (12 para dezembro) e se o EBITDA exclui arrendamentos (IFRS 16). covenantHistory são os períodos anteriores à abertura que completam a janela de doze meses, com meses, EBITDA e arrendamentos. boardPolicy é a política do conselho para alavancagem: status stated com limite, comparador e meses; none quando foi dito que não há; ownDefinition só quando o conselho escreveu definição própria de EBITDA ou dívida. basket é a exceção da escritura para garantia nova: status stated com a operação cuja escritura a cria (holderLabel, rótulo como em instruments), limite, base (aggregate para valor agregado, per_operation por operação) e quanto já está ocupado; none quando foi dito que não há.",
    "instruments são as dívidas vigentes (existing), aditamentos de uma vigente (amended, com replacesLabel) e dívidas novas descritas em proposta, term sheet, indicação ou pela pessoa (new): tipo de credor, saldo na abertura (0 para nova), data final quando escrita, taxa (rateKind index_plus_spread para CDI mais spread, fixed para taxa anual fixa; rates com a data a partir da qual cada taxa vale, a primeira com from null), juros trimestrais ou semestrais, se a amortização é mensal, desembolsos e amortizações com data e valor (lista vazia quando o documento diz que não há; null quando ninguém disse), encargos com data (comissão, IOF, tarifa, custos de emissão), garantia (recebíveis, bem financiado ou nenhuma; countsAgainstBasket true quando a escritura conta essa garantia na exceção), pré-pagamento (flat sobre o valor, ou per_year_of_weighted_remaining_life por ano de vida média remanescente; none quando o contrato não permite) e o que acontece com o saldo depois do horizonte: none, equal_annual em parcelas anuais iguais de um ano a outro, shares com a fração de cada ano, not_tested quando o perfil foi dito como não definido, seasonal_release para linha da safra quitada com a recomposição do giro, com os meses até a quitação e a justificativa. alternativeProfiles são perfis de amortização alternativos que a pessoa pediu para testar.",
    "paths são os caminhos que a pessoa pediu para comparar ou que um documento descreve: status_quo para manter a dívida como está, candidate para opção de escolha, companion para caminho pedido só para comparação ou como plano alternativo; a variante do investimento pelo rótulo (projectVariantLabel) ou withoutProject true quando o caminho é sem o investimento; as operações pelo rótulo, como em instruments; pré-pagamentos com a data; encargos do caminho (waiver, anuência) com a operação e a data.",
    "postHorizon é a base anual depois do horizonte, uma linha por ano. maximumSpread é o spread máximo da sondagem para seguir com a emissão; soundingBy a data limite da sondagem; routeDecisionBy a data de decisão da rota. sensitivities são os cenários adotados de outras análises, com a variação do EBITDA e do giro por período (só os períodos que mudam) e o caixa mínimo alternativo quando houver.",
    "origin é informed quando a pessoa disse, document quando veio de um campo de documento. source cita em poucas palavras de onde veio.",
    turnIntentInstruction,
  ].join("\n"),
  schema: financingPathsExtractionSchema,
  schemaName: "financing_paths_extraction_v1",
  outputMode: "prompted_json" as const,
  maxOutputTokens: 24_000,
  cacheKey: "financing-paths-extraction-2026.10.27-v1",
};

// ---------------------------------------------------------------------------------------------
// Units and calendar.

const Exact = Decimal.clone({precision: 80});
/** The capital paths basis is adopted in millions of the currency: the unit the board material (C47) reads
 * this method's packet in. An amount written in a stated scale is carried into millions by moving the decimal
 * point; one that does not fit eight decimals or twenty-four digits is refused by name, never rounded. */
export function amountInMillions(value: string, from: Scale): string | null {
  const shift = from === "reais" ? 6 : from === "milhares" ? 3 : 0;
  const out = new Exact(value).div(new Exact(10).pow(shift)).toFixed();
  const normal = out === "-0" ? "0" : out;
  return /^-?\d{1,24}(?:\.\d{1,8})?$/.test(normal) ? normal : null;
}
const dayAfter = (d: string) => new Date(Date.parse(`${d}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
const isMonthEnd = (d: string) => dayAfter(d).slice(8, 10) === "01";
/** The period a dated flow falls in: the first period end on or after the date, inside the horizon. */
const periodOf = (ends: readonly string[], opening: string, date: string) => date <= opening ? -1 : ends.findIndex((e) => date <= e);
/** Equal annual shares, the last absorbing the remainder as the kernel reads them. */
const equalShares = (from: number, to: number) => {
  const n = to - from + 1, one = new Exact(1).div(n).toDecimalPlaces(20, Decimal.ROUND_DOWN).toFixed();
  return Array.from({length: n}, (_, k) => ({year: from + k, share: one}));
};
const sumOf = (values: readonly string[]) => values.reduce((t, v) => t.plus(v), new Exact(0));

// ---------------------------------------------------------------------------------------------
// House conventions, each named in the card.

/** The bank's usual stress, from the first quarter that starts after the conversation (C32: 14/08/2026, from December). */
export const houseStress = {ebitdaFactor: "0.85", label: "EBITDA 15% menor, caso que um banco tende a usar"} as const;
/** The resolution of the smallest issue that keeps a path inside every gate: R$ 10 thousand, in millions. */
export const houseDemandQuantum = "0.01";
export const houseStatusQuoLabel = "Manter e rolar no vencimento";
export const houseWithoutProjectLabel = "Sem o projeto de investimento";

type Fact<T> = {value: T; origin: CapitalPathsFacts["minimumCash"]["origin"]; source: string};
type Kernel = ReturnType<typeof capitalPathsKernelFromFacts>;
type Instrument = Kernel["instruments"][number];
type Path = Kernel["paths"][number];
type Ex = FinancingPathsExtraction;

/** One origin for a fact read from several records: a document only when every part is a document. */
function joined(parts: readonly {origin: "informed" | "document"; source: string}[]): {origin: "informed" | "document"; source: string} {
  const sources = [...new Set(parts.map((p) => p.source.trim()))];
  return {origin: parts.every((p) => p.origin === "document") ? "document" : "informed", source: sources.join("; ").slice(0, 1900)};
}
const short = (message: string) => message.toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60) || "unknown";

/** Contradictions inside one record, each named by its field: asked, never resolved in favour of either side. */
export function financingPathsContradictions(e: Ex): string[] {
  const out: string[] = [];
  const s = e.stress.value;
  if (s !== null && (new Exact(s.ebitdaFactor).lte(0) || new Exact(s.ebitdaFactor).gte(1))) out.push("stress.ebitdaFactor");
  if (e.soundingBy.value !== null && e.routeDecisionBy.value !== null && e.routeDecisionBy.value < e.soundingBy.value) out.push("routeDecisionBy");
  const policy = e.boardPolicy;
  if (policy.status === "none" && [policy.limit, policy.comparator, policy.measurementMonths].some((x) => x !== null)) out.push("boardPolicy.status");
  if (e.basket.status === "none" && [e.basket.holderLabel, e.basket.limit, e.basket.occupied].some((x) => x !== null)) out.push("basket.status");
  if (e.basket.limit !== null && e.basket.occupied !== null && new Exact(e.basket.occupied).gt(e.basket.limit)) out.push("basket.occupied");
  e.instruments.forEach((i, k) => {
    const p = `instruments.${k + 1}.`;
    if (i.role === "amended" && i.replacesLabel === null) out.push(p + "replacesLabel");
    if (i.role !== null && i.role !== "amended" && i.replacesLabel !== null) out.push(p + "role");
    if (i.role === "new" && i.openingPrincipal !== null && !new Exact(i.openingPrincipal).eq(0)) out.push(p + "openingPrincipal");
    if (i.security && i.security.kind === "none" && (!new Exact(i.security.amount).eq(0) || i.security.countsAgainstBasket === true)) out.push(p + "security");
    if (i.rates.length && i.rates[0]!.from !== null) out.push(p + "rates");
    if (i.rates.slice(1).some((r, n) => r.from === null || (n > 0 && r.from <= i.rates[n]!.from!))) out.push(p + "rates");
    const a = i.afterHorizon;
    if (a?.kind === "equal_annual" && a.fromYear > a.toYear) out.push(p + "afterHorizon");
    if (i.alternativeProfiles.some((x) => x.fromYear > x.toYear) || (i.alternativeProfiles.length && a !== null && a.kind !== "equal_annual" && a.kind !== "shares")) out.push(p + "alternativeProfiles");
  });
  e.paths.forEach((x, k) => {if (x.withoutProject && x.projectVariantLabel !== null) out.push(`paths.${k + 1}.projectVariantLabel`);});
  return [...new Set(out)];
}

/** Turns the extraction into the method's facts. Every number, term, instrument and path comes from what the person
 * said or a document states; what is not stated is asked in one batch, in the order a decision needs it. House
 * conventions are the method's own and are named in the card: the bank's stress case, the issue resolution, the
 * status quo path, the variant without the project when a path is stated without it, interest on the average
 * balance for a monthly amortization, and the measures the method fixes (cash available before the project,
 * no cash benefit from a tax loss, the board policy on the indenture definition). Amounts are carried in millions. */
export function completeFinancingPathsFacts(input: {extraction: Ex; ids: {capitalPathsId: string; entityId: string; definitionVersionId: string}; asOf: string}):
  Lote2Completion<CapitalPathsFacts> {
  const missing: string[] = [], used: string[] = [];
  // Keyed collections hold one fact per label (or period, or year): the same content read twice is one fact.
  const e = withRecordIdentity(input.extraction, {keyed: ["periods", "variants", "covenantHistory", "instruments", "paths", "postHorizon", "sensitivities"], countable: []}, missing).e;
  missing.push(...unsourcedFields(e as unknown as Record<string, unknown>));
  missing.push(...financingPathsContradictions(e));
  const conflicts = (name: string, keys: readonly string[]) => keys.forEach((k, n) => {if (keys.indexOf(k) !== n) missing.push(`${name}.${n + 1}.${name === "periods" ? "periodEnd" : name === "postHorizon" ? "year" : "label"}`);});
  conflicts("periods", e.periods.map((p) => p.periodEnd));
  conflicts("postHorizon", e.postHorizon.map((p) => String(p.year)));
  for (const name of ["variants", "covenantHistory", "instruments", "paths", "sensitivities"] as const) conflicts(name, (e[name] as {label: string}[]).map((x) => labelKey(x.label)));
  const money = (path: string, value: string, s: Scale | null): string | null => {
    if (s === null) {missing.push(path.replace(/\.[^.]+$/, "") + ".scale"); return null;}
    const v = amountInMillions(value, s);
    if (v === null) missing.push(path);
    return v;
  };
  const nonNegative = (path: string, v: string | null) => {if (v !== null && v.startsWith("-")) missing.push(path); return v;};

  // The company: opening position and the projection by period.
  const opening = stated(e.openingDate), openingCash = stated(e.openingCash), minimum = stated(e.minimumCash), tax = stated(e.taxRate), curve = stated(e.diCurve);
  if (!opening) missing.push("openingDate");
  if (!openingCash) missing.push("openingCash");
  const periods = [...e.periods].sort((a, b) => a.periodEnd < b.periodEnd ? -1 : 1);
  const ends = periods.map((p) => p.periodEnd);
  if (!periods.length) missing.push("periods");
  else if (opening && (ends[0]! <= opening.value || ends.some((x) => !isMonthEnd(x)) || !isMonthEnd(opening.value))) missing.push("periods.periodEnd");
  const operating = {ebitda: [] as string[], depreciation: [] as string[], leasePayments: [] as string[], workingCapitalCashFlow: [] as string[], maintenanceCapex: [] as string[]};
  periods.forEach((p) => {
    const k = e.periods.indexOf(p) + 1, q = `periods.${k}.`;
    for (const f of ["ebitda", "depreciation", "leasePayments", "workingCapitalCashFlow", "maintenanceCapex"] as const) operating[f].push(money(q + f, p[f], p.scale) ?? "0");
  });
  const openingAvailable = openingCash ? money("openingCash.amount", openingCash.value.amount, openingCash.value.scale) : null;
  const minimumCash = minimum ? nonNegative("minimumCash.amount", money("minimumCash.amount", minimum.value.amount, minimum.value.scale)) : null;
  if (!minimum) missing.push("minimumCash");
  if (!tax) missing.push("taxRate");
  if (!curve) missing.push("diCurve");
  const lastYear = ends.length ? Number(ends.at(-1)!.slice(0, 4)) : null;
  const byPeriod = ends.map((end) => {const r = curve?.value.byPeriod.filter((x) => x.periodEnd === end) ?? []; return r.length === 1 ? r[0]!.rate : null;});
  if (curve && byPeriod.some((x) => x === null)) missing.push("diCurve.byPeriod");
  if (curve && curve.value.byPeriod.some((x) => !ends.includes(x.periodEnd))) missing.push("diCurve.byPeriod");

  // Post-horizon base.
  const post = [...e.postHorizon].sort((a, b) => a.year - b.year);
  if (!post.length) missing.push("postHorizon");
  if (lastYear !== null && post.some((p) => p.year <= lastYear)) missing.push("postHorizon.year");
  const postHorizon = {years: post.map((p) => p.year), ebitda: [] as string[], leasePayments: [] as string[], maintenanceCapex: [] as string[], workingCapitalInvestment: [] as string[],
    depreciation: [] as string[], otherInterest: [] as string[]};
  post.forEach((p) => {const q = `postHorizon.${e.postHorizon.indexOf(p) + 1}.`;
    for (const f of ["ebitda", "leasePayments", "maintenanceCapex", "workingCapitalInvestment", "depreciation", "otherInterest"] as const) postHorizon[f].push(money(q + f, p[f], p.scale) ?? "0");});
  if (curve && post.some((p) => curve.value.afterHorizon.filter((x) => x.year === p.year).length !== 1)) missing.push("diCurve.afterHorizon");

  // The investment: stated variants, and the house variant without it when a path is stated without the project.
  const variantIds = itemKeys([...e.variants.map((v) => v.label), ...e.paths.some((p) => p.withoutProject) ? [houseWithoutProjectLabel] : []]);
  const variants: Fact<Kernel["projectVariants"][number]>[] = e.variants.map((v, k) => {
    const q = `variants.${k + 1}.`, effects = {ebitda: [] as string[], depreciation: [] as string[], maintenanceCapex: [] as string[], growthCapex: [] as string[], startupWorkingCapitalCashFlow: [] as string[]};
    if (v.effects.some((x) => !ends.includes(x.periodEnd)) || ends.some((end) => v.effects.filter((x) => x.periodEnd === end).length !== 1)) missing.push(q + "effects");
    for (const end of ends) {
      const row = v.effects.find((x) => x.periodEnd === end);
      for (const f of ["ebitda", "depreciation", "maintenanceCapex", "growthCapex", "startupWorkingCapitalCashFlow"] as const) effects[f].push(row ? money(q + "effects." + f, row[f], v.scale) ?? "0" : "0");
    }
    return {value: {id: variantIds[k]!, label: v.label, effects}, origin: v.origin, source: citedSource(v.origin, v.source)};
  });
  if (e.paths.some((p) => p.withoutProject)) {
    variants.push({value: {id: variantIds.at(-1)!, label: houseWithoutProjectLabel, effects: null}, origin: "house", source: "Convenção do método: caminho sem o investimento, sem efeitos do projeto"});
    used.push("withoutProjectVariant");
  }

  // Covenant, policy and basket.
  const indenture = stated(e.indenture);
  if (!indenture) missing.push("indenture");
  const decembers = (m: readonly number[]) => ends.filter((x) => m.includes(Number(x.slice(5, 7))));
  if (indenture && ends.length && !decembers(indenture.value.measurementMonths).length) missing.push("indenture.measurementMonths");
  const historyIds = itemKeys(e.covenantHistory.map((h) => h.label));
  const history = e.covenantHistory.map((h, k) => ({id: historyIds[k]!, months: h.months, ebitda: money(`covenantHistory.${k + 1}.ebitda`, h.ebitda, h.scale) ?? "0",
    leasePayments: money(`covenantHistory.${k + 1}.leasePayments`, h.leasePayments, h.scale) ?? "0"}));
  const bp = e.boardPolicy;
  let policy: Fact<NonNullable<Kernel["covenant"]["policy"]>> | null = null;
  if (bp.status === null) missing.push("boardPolicy");
  else if (bp.status === "stated") {
    for (const f of ["limit", "comparator", "measurementMonths", "origin"] as const) if (bp[f] === null) missing.push(`boardPolicy.${f}`);
    // The method measures the policy on the indenture definition until the board writes its own; a definition of its own is asked.
    if (bp.ownDefinition !== null) missing.push("boardPolicy.ownDefinition");
    if (bp.measurementMonths && ends.length && !decembers(bp.measurementMonths).length) missing.push("boardPolicy.measurementMonths");
    if (bp.limit !== null && bp.comparator !== null && bp.measurementMonths !== null && bp.origin !== null && bp.ownDefinition === null) {
      const source = citedSource(bp.origin, bp.source);
      // The limit, comparator and dates are the board's (their origin); the definition is the house's, named apart
      // (financingPathsHouseConventions).
      policy = {value: {limit: bp.limit, comparator: bp.comparator, measurementPeriodEnds: decembers(bp.measurementMonths), definition: "indenture_definition", source},
        origin: bp.origin, source};
      used.push("policyOnIndentureDefinition");
    }
  }

  // Instruments: the terms as written, flows dated into the horizon's periods.
  const instrumentIds = itemKeys(e.instruments.map((i) => i.label));
  const idOfInstrument = (label: string) => {const k = e.instruments.findIndex((i) => labelKey(i.label) === labelKey(label)); return k < 0 ? null : instrumentIds[k]!;};
  const prepaid = new Set(e.paths.flatMap((p) => p.prepayments.map((x) => idOfInstrument(x.instrumentLabel))).filter((x): x is string => x !== null));
  const horizonEnd = ends.at(-1) ?? null;
  const instruments: (Fact<Instrument> | null)[] = e.instruments.map((i, k) => {
    const q = `instruments.${k + 1}.`, before = missing.length, id = instrumentIds[k]!;
    for (const f of ["role", "lenderKind", "openingPrincipal", "rateKind", "interestEvery", "draws", "amortization", "security", "afterHorizon"] as const) if (i[f] === null) {
      // A flow nobody stated is asked; an instrument without draws is new money only when the document says so.
      if (f === "afterHorizon") continue;
      missing.push(q + f);
    }
    if (!i.rates.length) missing.push(q + "rates");
    if (i.security && i.security.kind !== "none" && i.security.countsAgainstBasket === null) missing.push(q + "security.countsAgainstBasket");
    if (i.replacesLabel !== null && idOfInstrument(i.replacesLabel) === null) missing.push(q + "replacesLabel");
    // A prepayment needs the contract's terms; "none" stated and a path that prepays it contradict each other.
    if (prepaid.has(id) && i.prepayment === null) missing.push(q + "prepayment");
    if (prepaid.has(id) && i.prepayment === "none") missing.push(q + "prepayment");
    const inHorizon = (rows: {date: string; amount: string}[] | null, field: string) => {
      const out = ends.map(() => new Exact(0));
      for (const [n, r] of (rows ?? []).entries()) {
        // Without the projection's periods a date has nowhere to fall: the projection is asked, not each date.
        if (!opening || !ends.length) continue;
        const at = periodOf(ends, opening.value, r.date);
        if (at < 0) {missing.push(`${q}${field}.${n + 1}.date`); continue;}
        const v = money(`${q}${field}.${n + 1}.amount`, r.amount, i.scale);
        if (v !== null) out[at] = out[at]!.plus(v);
      }
      return out.map((x) => x.toFixed());
    };
    const draws = inHorizon(i.draws, "draws"), principal = inHorizon(i.amortization, "amortization");
    const statedPrincipal = i.openingPrincipal === null ? null : money(q + "openingPrincipal", i.openingPrincipal, i.scale), openingPrincipal = statedPrincipal ?? "0";
    const residual = new Exact(openingPrincipal).plus(sumOf(draws)).minus(sumOf(principal));
    // The balance after the horizon is read only when the principal and the periods are known.
    const balanceKnown = statedPrincipal !== null && ends.length > 0;
    if (balanceKnown && residual.lt(0)) missing.push(q + "amortization");
    // What happens after the horizon is asked whenever a balance is left and nobody said; nothing is assumed paid.
    let afterHorizon: Instrument["afterHorizon"] = {kind: "none"};
    const a = i.afterHorizon, alternatives = i.alternativeProfiles;
    if (a === null) {if (balanceKnown && residual.gt(0)) missing.push(q + "afterHorizon");}
    else if (a.kind === "equal_annual" || a.kind === "shares") {
      const shares = a.kind === "equal_annual" ? equalShares(a.fromYear, a.toYear) : a.shares;
      if (lastYear !== null && shares.some((s) => s.year <= lastYear)) missing.push(q + "afterHorizon");
      const altIds = itemKeys(alternatives.map((x) => x.label));
      afterHorizon = {kind: "scheduled", shares, alternatives: alternatives.map((x, n) => ({id: altIds[n]!, label: x.label, shares: equalShares(x.fromYear, x.toYear)}))};
    } else afterHorizon = a;
    const charges = (() => {
      const ids = itemKeys(i.charges.map((c) => c.label));
      return i.charges.flatMap((c, n) => {
        if (!opening || !ends.length) return [];
        const at = periodOf(ends, opening.value, c.date);
        if (at < 0) {missing.push(`${q}charges.${n + 1}.date`); return [];}
        const amount = money(`${q}charges.${n + 1}.amount`, c.amount, i.scale);
        return amount === null ? [] : [{id: ids[n]!, periodEnd: ends[at]!, category: c.category, amount}];
      });
    })();
    const rates = ends.map((end) => {const step = [...i.rates].reverse().find((r) => r.from === null || end >= r.from); return step?.rate ?? "0";});
    const monthly = i.monthlyAmortization;
    if (principal.some((x) => !new Exact(x).eq(0)) && monthly === null) missing.push(q + "monthlyAmortization");
    if (monthly === true) used.push("monthlyAmortizationInterest");
    if (i.finalPaymentDate !== null && horizonEnd !== null && balanceKnown && i.finalPaymentDate <= horizonEnd && residual.gt(0) && a?.kind !== "seasonal_release") missing.push(q + "finalPaymentDate");
    const security = i.security ? {kind: i.security.kind, amount: money(q + "security.amount", i.security.amount, i.scale) ?? "0",
      countsAgainstBasket: i.security.kind === "none" ? false : i.security.countsAgainstBasket ?? false} : {kind: "none" as const, amount: "0", countsAgainstBasket: false};
    if (missing.length > before) return null;
    return {value: {id, label: i.label, role: i.role!, replaces: i.replacesLabel === null ? null : idOfInstrument(i.replacesLabel), lenderKind: i.lenderKind!, openingPrincipal,
      finalPaymentDate: i.finalPaymentDate, rate: i.rateKind === "fixed" ? {kind: "fixed" as const, annualRates: rates} : {kind: "index_plus_spread" as const, spreads: rates},
      interestEvery: i.interestEvery!,
      // The method's rule: quarterly interest is paid when it accrues; semiannual interest accrues until June and December.
      couponTreatment: i.interestEvery === "semester" ? "accrued_until_paid" as const : "cash_paid" as const,
      couponBase: monthly === true ? "average_principal" as const : "opening_principal" as const,
      draws, principal, charges, security,
      prepayment: i.prepayment === null || i.prepayment === "none" ? null : i.prepayment, afterHorizon},
    origin: i.origin, source: citedSource(i.origin, i.source)};
  });

  // The basket names its holder among the instruments.
  let basket: Fact<NonNullable<Kernel["basket"]>> | null = null;
  const b = e.basket;
  if (b.status === null) missing.push("basket");
  else if (b.status === "stated") {
    for (const f of ["holderLabel", "limit", "basis", "occupied", "origin"] as const) if (b[f] === null) missing.push(`basket.${f}`);
    const holder = b.holderLabel === null ? null : idOfInstrument(b.holderLabel);
    if (b.holderLabel !== null && holder === null) missing.push("basket.holderLabel");
    const limit = b.limit === null ? null : money("basket.limit", b.limit, b.scale), occupied = b.occupied === null ? null : money("basket.occupied", b.occupied, b.scale);
    if (holder !== null && limit !== null && occupied !== null && b.basis !== null && b.origin !== null) {
      const source = citedSource(b.origin, b.source);
      basket = {value: {holderId: holder, limit, basis: b.basis, occupied, source}, origin: b.origin, source};
    }
  }

  // Paths: the stated ones, after the method's status quo when none is stated.
  const statedQuo = e.paths.some((p) => p.role === "status_quo");
  const pathIds = itemKeys([...statedQuo ? [] : [houseStatusQuoLabel], ...e.paths.map((p) => p.label)]);
  const offset = statedQuo ? 0 : 1;
  const variantOf = (label: string) => {const k = e.variants.findIndex((v) => labelKey(v.label) === labelKey(label)); return k < 0 ? null : variantIds[k]!;};
  const paths: (Fact<Path> | null)[] = e.paths.map((p, k) => {
    const q = `paths.${k + 1}.`, before = missing.length;
    if (p.role === null) missing.push(q + "role");
    const variant = p.withoutProject ? variantIds.at(-1)! : p.projectVariantLabel === null ? null : variantOf(p.projectVariantLabel);
    if (variant === null) missing.push(q + "projectVariant");
    const ids = p.instrumentLabels.map(idOfInstrument);
    if (!ids.length || ids.some((x) => x === null)) missing.push(q + "instrumentLabels");
    const prepayments = p.prepayments.flatMap((x, n) => {
      const id = idOfInstrument(x.instrumentLabel), at = opening ? periodOf(ends, opening.value, x.date) : -1;
      if (id === null || !ids.includes(id)) {missing.push(`${q}prepayments.${n + 1}.instrumentLabel`); return [];}
      if (!opening || !ends.length) return [];
      if (at < 0) {missing.push(`${q}prepayments.${n + 1}.date`); return [];}
      return [{instrumentId: id, periodEnd: ends[at]!}];
    });
    const chargeIds = itemKeys(p.charges.map((c) => c.label));
    const charges = p.charges.flatMap((c, n) => {
      const id = idOfInstrument(c.instrumentLabel), at = opening ? periodOf(ends, opening.value, c.date) : -1;
      if (id === null || !ids.includes(id)) {missing.push(`${q}charges.${n + 1}.instrumentLabel`); return [];}
      if (!opening || !ends.length) return [];
      if (at < 0) {missing.push(`${q}charges.${n + 1}.date`); return [];}
      const amount = money(`${q}charges.${n + 1}.amount`, c.amount, p.scale);
      return amount === null ? [] : [{id: chargeIds[n]!, instrumentId: id, periodEnd: ends[at]!, category: c.category, amount}];
    });
    if (missing.length > before) return null;
    return {value: {id: pathIds[k + offset]!, label: p.label, role: p.role!, projectVariantId: variant!, instrumentIds: ids as string[], prepayments, charges},
      origin: p.origin, source: citedSource(p.origin, p.source)};
  });
  if (!e.paths.length) missing.push("paths");
  if (!e.instruments.length) missing.push("instruments");
  if (!statedQuo && e.paths.length) {
    // Doing nothing: the debt in place, the investment as first stated (or none), no new money and no prepayment.
    const existing = e.instruments.flatMap((i, k) => i.role === "existing" ? [instrumentIds[k]!] : []);
    const plan = e.variants.length ? variantIds[0]! : null;
    if (!existing.length) missing.push("instruments.existing");
    if (plan === null && !e.paths.some((p) => p.withoutProject)) missing.push("paths.statusQuoVariant");
    paths.unshift({value: {id: pathIds[0]!, label: houseStatusQuoLabel, role: "status_quo", projectVariantId: plan ?? variantIds.at(-1)!, instrumentIds: existing, prepayments: [], charges: []},
      origin: "house", source: `Convenção do método: dívida vigente sem nova captação nem pré-pagamento${e.variants.length ? `, com ${e.variants[0]!.label}` : ""}`});
    used.push("statusQuoPath");
  }

  // Sensitivities: a delta changes only the periods it lists.
  const sensitivityIds = itemKeys(e.sensitivities.map((s) => s.label));
  const sensitivities = e.sensitivities.map((s, k) => {
    const q = `sensitivities.${k + 1}.`;
    const series = (rows: {periodEnd: string; amount: string}[], field: string) => {
      if (rows.some((r) => !ends.includes(r.periodEnd)) || new Set(rows.map((r) => r.periodEnd)).size !== rows.length) missing.push(q + field);
      return ends.map((end) => {const r = rows.find((x) => x.periodEnd === end); return r ? money(q + field, r.amount, s.scale) ?? "0" : "0";});
    };
    return {value: {id: sensitivityIds[k]!, label: s.label, ebitdaDelta: series(s.ebitdaDelta, "ebitdaDelta"), workingCapitalDelta: series(s.workingCapitalDelta, "workingCapitalDelta"),
      minimumCash: s.minimumCash === null ? null : money(q + "minimumCash", s.minimumCash, s.scale)}, origin: s.origin, source: citedSource(s.origin, s.source)};
  });

  // The decision's plan: the sounding trigger and dates are the person's or a document's, never the house's.
  const spread = stated(e.maximumSpread), sounding = stated(e.soundingBy), decision = stated(e.routeDecisionBy);
  if (!spread) missing.push("maximumSpread");
  if (!sounding) missing.push("soundingBy");
  if (!decision) missing.push("routeDecisionBy");

  // The stress: the stated one, or the bank's usual case from the first quarter that starts after the conversation.
  const statedStress = stated(e.stress);
  const fromHouse = ends.find((end, n) => (n === 0 ? dayAfter(opening?.value ?? end) : dayAfter(ends[n - 1]!)) > input.asOf) ?? null;
  if (!statedStress && ends.length && fromHouse === null) missing.push("stress");
  // A stated stress takes its start from the same statement: a factor without its date is asked, never dated by the house
  // under the statement's origin (the date changes which periods are stressed).
  const stressFrom = statedStress ? statedStress.value.fromPeriodEnd : fromHouse;
  if (statedStress && (statedStress.value.fromPeriodEnd === null || !ends.includes(statedStress.value.fromPeriodEnd))) missing.push("stress.fromPeriodEnd");
  if (!statedStress) used.push("stress");

  const order = ["openingDate", "openingCash", "indenture", "boardPolicy", "basket", "instruments", "variants", "periods", "diCurve", "taxRate", "postHorizon", "minimumCash",
    "paths", "maximumSpread", "soundingBy", "routeDecisionBy", "covenantHistory", "sensitivities", "stress"];
  const rank = (m: string) => {const k = order.indexOf(m.split(".")[0]!); return k < 0 ? order.length : k;};
  const asked = (list: readonly string[]) => [...new Set(list)].map((m, n) => [m, n] as const).sort((x, y) => rank(x[0]) - rank(y[0]) || x[1] - y[1]).map(([m]) => m);
  if (missing.length || !opening || !openingCash || !minimum || !tax || !curve || !indenture || !spread || !sounding || !decision || openingAvailable === null || minimumCash === null
    || stressFrom === null) return {status: "missing", missing: asked(missing)};

  used.push("demandQuantum", "availableForService", "taxLossTreatment");
  const periodRows = joined(periods.map((p) => ({origin: p.origin, source: citedSource(p.origin, p.source)})));
  const company = joined([{origin: openingCash.origin, source: openingCash.source}, periodRows]);
  const raw = {...input.ids, perimeter: "standalone", currency: "BRL", openingDate: opening.value,
    company: {value: {periodEnds: ends, openingAvailable, operating}, ...company},
    minimumCash: {value: minimumCash, origin: minimum.origin, source: minimum.source},
    index: {value: {name: "DI" as const, annualByPeriod: byPeriod as string[], afterHorizon: post.map((p) => ({year: p.year, annualRate: curve.value.afterHorizon.find((x) => x.year === p.year)!.rate}))},
      origin: curve.origin, source: curve.source},
    // The method's facts carry one origin per fact: the rate's. The loss treatment is the house convention, and its own
    // hypothesis and card row say so with origin house (financingPathsHouseLossTreatment), never the rate's origin.
    tax: {value: {rate: tax.value, lossTreatment: "no_cash_benefit" as const}, origin: tax.origin, source: tax.source},
    variants,
    stress: statedStress ? {value: {id: "estresse", label: `EBITDA multiplicado por ${statedStress.value.ebitdaFactor}`, ebitdaFactor: statedStress.value.ebitdaFactor, fromPeriodEnd: stressFrom},
      origin: statedStress.origin, source: statedStress.source}
      : {value: {id: "estresse", label: houseStress.label, ebitdaFactor: houseStress.ebitdaFactor, fromPeriodEnd: stressFrom}, origin: "house" as const,
        source: "Caso que um banco tende a usar: EBITDA 15% menor a partir do primeiro trimestre que começa depois da conversa"},
    indenture: {value: {ebitdaExcludesLeases: indenture.value.ebitdaExcludesLeases, history, indenture: {limit: indenture.value.limit, comparator: indenture.value.comparator,
      measurementPeriodEnds: decembers(indenture.value.measurementMonths), source: indenture.source}},
      ...joined([{origin: indenture.origin, source: indenture.source}, ...e.covenantHistory.map((h) => ({origin: h.origin, source: citedSource(h.origin, h.source)}))])},
    policy, basket,
    instruments: instruments as Fact<Instrument>[], paths: paths as Fact<Path>[],
    postHorizon: {value: postHorizon, ...joined(post.map((p) => ({origin: p.origin, source: citedSource(p.origin, p.source)})))},
    plan: {value: {maximumSpread: spread.value, soundingBy: sounding.value, routeDecisionBy: decision.value},
      ...joined([{origin: spread.origin, source: spread.source}, {origin: sounding.origin, source: sounding.source}, {origin: decision.origin, source: decision.source}])},
    sensitivities,
    demandQuantum: {value: houseDemandQuantum, origin: "house" as const, source: "Resolução de R$ 10 mil para o menor valor de emissão dentro dos portões"}};
  // The kernel's own check runs inside the facts schema; its refusal is named by its code, never reduced to "facts".
  const checkedFacts = capitalPathsFactsSchema.safeParse(raw);
  const kernel = checkedFacts.success ? null : checkedFacts.error.issues.find((x) => x.message.startsWith(kernelPrefix));
  if (kernel) return {status: "missing", missing: [`kernelRefused.${short(kernel.message.slice(kernelPrefix.length))}`]};
  const parsed = factsOrGaps(capitalPathsFactsSchema, raw);
  if (!parsed.ok) return {status: "missing", missing: parsed.missing};
  return {status: "complete", facts: parsed.facts, situationId: financingPathsSituation, housePremiseKeys: [...new Set(used)]};
}
export const financingPathsSituation = "refinancing";
const kernelPrefix = "Facts do not make a valid capital paths input: ";

// ---------------------------------------------------------------------------------------------
// The method's own reader and packet before the card, once per proposal.

/** The method's own composer and packet over a basis, as the confirmation will run them. */
export const financingPathsReader = (b: BoundBasis) => prepareCapitalPathsPacket(composeBoundCapitalPaths({...b, question: "Verificação das premissas antes da confirmação"}));
/** The packet takes seconds (the equivalent spread solver): the check runs once per set of facts and its
 * answer is kept, so a later turn that proposes the same facts reads it instead of computing again. */
const checked = new Map<string, string[]>();
export function financingPathsReaderGaps(facts: CapitalPathsFacts, run: (b: BoundBasis) => unknown = financingPathsReader): string[] {
  const key = createHash("sha256").update(canonicalJson(facts)).digest("hex");
  const known = checked.get(key);
  if (known) return [...known];
  const gaps = readerGaps(proposeCapitalPathsHypotheses(facts), run);
  if (checked.size >= 32) checked.delete(checked.keys().next().value!);
  checked.set(key, gaps);
  return [...gaps];
}

/** The house conventions the bridge writes into the facts, each with its own origin and its own card row, never the
 * origin of the instrument or the limit it sits in: the cash available before the project's investment, no cash
 * benefit from a tax loss, the board policy measured on the indenture definition, and each instrument's coupon
 * treatment and coupon base. The bank's stress, the issue resolution, the status quo path and the variant without the
 * project are facts of their own with origin house already. Every value a constant of the bridge sets is listed here. */
export const financingPathsHouseConventions = {
  availableForService: {origin: "house" as const, source: "Caixa disponível para o serviço da dívida antes do investimento do projeto: convenção da casa para o método"},
  lossTreatment: {origin: "house" as const, source: "Base negativa sem benefício de caixa: convenção da casa para o método, independente da origem da alíquota"},
  policyDefinition: {origin: "house" as const,
    source: "Política do conselho medida na definição da escritura até o conselho escrever a sua: convenção da casa para o método, independente da origem do limite"},
  coupon: {
    cash_paid: "juros trimestrais pagos quando apurados",
    accrued_until_paid: "juros semestrais acumulados até junho e dezembro",
    opening_principal: "juros sobre o saldo de abertura do período",
    average_principal: "juros sobre o saldo médio do período, pela amortização mensal",
  } as const,
};
/** Kept for the readers of the loss treatment row. */
export const financingPathsHouseLossTreatment = financingPathsHouseConventions.lossTreatment;
const couponSource = (i: Instrument) => `Tratamento e base do cupom (${financingPathsHouseConventions.coupon[i.couponTreatment]}; `
  + `${financingPathsHouseConventions.coupon[i.couponBase]}): convenção da casa para o método, independente da origem dos termos do instrumento`;
const couponKey = (i: Instrument) => `coupon${i.couponTreatment === "accrued_until_paid" ? "Accrued" : "Paid"}${i.couponBase === "average_principal" ? "OnAverage" : "OnOpening"}`;

/** The card: the company and its projection, the limits, each instrument, each variant, each path and each
 * sensitivity, every row with its origin; house rows carry a key the card translates, and every house convention
 * has its own row. */
export function financingPathsSummary(facts: CapitalPathsFacts): Lote2Summary {
  // The bridge never adopts a reviewed result of another method: its facts carry no "analysis" origin.
  const row = (group: Parameters<typeof summaryRow>[0], label: string, x: {origin: string; source: string}, key: string | null = null) =>
    summaryRow(group, label, {origin: x.origin as Lote2Origin, source: x.source}, key);
  const houseVariant = (v: CapitalPathsFacts["variants"][number]) => v.origin === "house" ? "withoutProject" : null;
  const h = financingPathsHouseConventions;
  return {situationId: financingPathsSituation, referenceDate: facts.openingDate, items: [
    row("premise", "Caixa e projeção por período", facts.company, "quarterlyProjection"),
    row("premise", "Caixa disponível antes do investimento do projeto", h.availableForService, "availableForService"),
    row("premise", "Caixa mínimo de política", facts.minimumCash, "minimumCash"),
    row("premise", "Curva do CDI", facts.index, "diCurve"),
    row("premise", "Alíquota de imposto", facts.tax, "taxRate"),
    row("premise", "Base negativa sem benefício de caixa", h.lossTreatment, "taxLossTreatment"),
    row("premise", facts.stress.value.label, facts.stress, "stressCase"),
    row("premise", "Base anual depois do horizonte", facts.postHorizon, "postHorizonBase"),
    row("premise", "Gatilho e datas da sondagem", facts.plan, "soundingPlan"),
    row("premise", "Resolução da emissão mínima", facts.demandQuantum, "issueQuantum"),
    row("limit", "Covenant da escritura", facts.indenture, "indentureCovenant"),
    ...facts.policy ? [row("limit", "Política do conselho", facts.policy, "boardPolicy"),
      row("limit", "Política do conselho medida na definição da escritura", h.policyDefinition, "policyOnIndentureDefinition")] : [],
    ...facts.basket ? [row("limit", "Exceção da escritura para garantia nova", facts.basket, "indentureBasket")] : [],
    ...facts.instruments.flatMap((i) => [row("instrument", i.value.label, i),
      row("instrument", i.value.label, {origin: "house", source: couponSource(i.value)}, couponKey(i.value))]),
    ...facts.variants.map((v) => row("case", v.value.label, v, houseVariant(v))),
    ...facts.paths.map((p) => row("option", p.value.label, p, p.origin === "house" ? "statusQuoPath" : null)),
    ...facts.sensitivities.map((s) => row("scenario", s.value.label, s)),
  ]};
}

/** The hypotheses, with every house convention named as the house's: a hypothesis wholly set by the bridge has origin
 * house; an instrument's terms (written terms and the two coupon conventions, one list the published method reads)
 * cite each part with its own origin. */
export function financingPathsHypotheses(facts: CapitalPathsFacts): ReturnType<typeof proposeCapitalPathsHypotheses> {
  const h = financingPathsHouseConventions, house = (source: string) => `Origem: premissa da casa. ${source}`;
  const originName = {document: "documento", informed: "informado", house: "premissa da casa"} as Record<string, string>;
  return proposeCapitalPathsHypotheses(facts).map((x) => {
    if (x.fieldPath.endsWith(".tax.lossTreatment")) return {...x, reason: house(h.lossTreatment.source)};
    if (x.fieldPath.endsWith(".covenant.policyDefinition")) return {...x, reason: house(h.policyDefinition.source)};
    if (x.fieldPath.endsWith(".company.availableForService")) return {...x, reason: house(h.availableForService.source)};
    const terms = /\.instrument\.([^.]+)\.terms$/.exec(x.fieldPath);
    const i = terms ? facts.instruments.find((y) => y.value.id === terms[1]) : undefined;
    if (i) return {...x, reason: `Origem: termos escritos do instrumento, ${originName[i.origin] ?? i.origin} (${i.source}); tratamento e base do cupom, premissa da casa (${couponSource(i.value)}).`};
    return x;
  });
}
export function buildFinancingPathsPremiseProposal(facts: CapitalPathsFacts) {
  return fingerprintedProposal(financingPathsPremiseMethod, facts, financingPathsHypotheses(facts), financingPathsSummary(facts));
}

export async function proposeFinancingPathsPremisesForTurn(input: {
  message: string; hasAttachments: boolean; recentUserMessages: string[]; projectId: string | null;
  /** The date of the turn, which dates the house stress case; today when not given. */
  asOf?: string;
  loadEvidence: () => Promise<unknown>; extract: (text: string) => Promise<unknown>;
  log: (event: string, detail: Record<string, unknown>) => void;
  /** The method's own reader and packet; replaced only by tests that count its runs. */
  reader?: (b: BoundBasis) => unknown;
}): Promise<Lote2TurnPremises | null> {
  const entry = input.projectId ? financingPathsEntry(input.message, input.hasAttachments, input.recentUserMessages) : null;
  if (!input.projectId || !entry) return null;
  const asOf = input.asOf ?? new Date().toISOString().slice(0, 10);
  return proposeLote2PremisesForTurn({logPrefix: "financing_paths_premises", idName: "financing-paths", expansionRefusalAsGap: true, schema: financingPathsExtractionSchema,
    complete: (extraction, id) => completeFinancingPathsFacts({extraction, ids: {capitalPathsId: id, entityId: id, definitionVersionId: id}, asOf}),
    build: buildFinancingPathsPremiseProposal, readerCheck: (facts) => financingPathsReaderGaps(facts, input.reader)}, {...input, entry, projectId: input.projectId});
}
