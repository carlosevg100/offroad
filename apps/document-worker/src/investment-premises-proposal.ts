import {createHash} from "node:crypto";
import {z} from "zod";
import {compileObjectiveToPlan} from "@offroad/work-plan";
import {proposeInvestmentHypotheses, investmentFactsSchema, type InvestmentFacts} from "@offroad/financial-model";

/** The method these premises feed, pinned to its released version. */
export const investmentPremiseMethod = {methodId: "analyze-investment-project", methodVersion: "2026.10.09-v2"} as const;
const fold = (text: string) => text.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();
const investmentCue = /\b(linha (nova|de producao|de embalagem)|capex|investiment|expans|maquin|equipament|fabrica|planta|verticaliz|ampliac|nova unidade|projeto)/;

/** A capital question about an identifiable investment: the turn may propose its premises. */
export function shouldProposeInvestmentPremises(message: string): boolean {
  const kind = compileObjectiveToPlan({message, hasAttachments: false}).objectiveKind;
  return (kind === "capital_strategy" || kind === "board_decision") && investmentCue.test(fold(message));
}

const origin = z.enum(["informed", "document"]);
const sourced = <T extends z.ZodType>(value: T) => z.strictObject({value: value.nullable(), origin: origin.nullable(), source: z.string().max(400).nullable()});
const money = z.string().regex(/^\d{1,15}(?:\.\d{1,2})?$/);
/** Only what the person said or a document states. Absence stays null; nothing is estimated here. */
export const investmentFactExtractionSchema = z.strictObject({
  investmentDescription: z.string().max(400).nullable(),
  capex: sourced(z.array(z.strictObject({year: z.number().int().min(2000).max(2100), amount: money})).max(20)),
  operationStartMonth: sourced(z.string().regex(/^\d{4}-\d{2}$/)),
  annualIncrementalRevenue: sourced(money), annualDisplacedPurchases: sourced(money),
  annualNewVariableCost: sourced(money), annualNewFixedCost: sourced(money), annualMaintenance: sourced(money),
  usefulLifeYears: sourced(z.number().int().min(1).max(60)),
  receivableDays: sourced(z.number().min(0).max(720)), inventoryDays: sourced(z.number().min(0).max(720)),
  newSupplierDays: sourced(z.number().min(0).max(720)), lostSupplierDays: sourced(z.number().min(0).max(720)),
  annualGrowth: sourced(z.number().min(-0.5).max(1)), cashTaxRate: sourced(z.number().min(0).max(1)), discountRate: sourced(z.number().min(0).max(1)),
});
export type InvestmentFactExtraction = z.infer<typeof investmentFactExtractionSchema>;

export const investmentFactExtractionContract = {
  task: "investment_fact_extraction" as const,
  system: [
    "Você extrai fatos de um investimento a partir da mensagem de uma pessoa, das mensagens anteriores e de campos já extraídos de documentos.",
    "Extraia somente o que foi dito ou o que está em documento. Se não estiver, devolva null em value, origin e source. Nunca estime, nunca complete, nunca arredonde por conta própria.",
    "Valores monetários em reais inteiros por ano, com até duas casas decimais, sem separador de milhar (R$ 6 milhões vira 6000000).",
    "origin é informed quando a pessoa disse, document quando veio de um campo de documento. source cita em poucas palavras de onde veio (a frase ou o nome do documento).",
    "Economia de comprar e passar a produzir: o gasto que deixa de existir vai em annualDisplacedPurchases; insumos novos em annualNewVariableCost; custo fixo novo em annualNewFixedCost. Se a pessoa só disser a economia líquida, não a divida: deixe os componentes null.",
    "capex é o desembolso por ano civil. operationStartMonth é o mês em que a operação começa (AAAA-MM).",
  ].join("\n"),
  schema: investmentFactExtractionSchema,
  schemaName: "investment_fact_extraction_v1",
  outputMode: "prompted_json" as const,
  maxOutputTokens: 2_500,
  cacheKey: "investment-fact-extraction-2026.10.10-v1",
};

type House = {value: unknown; source: string};
/** House premises the proposal may use when the person and the documents are silent. Each one is
 * shown to the person as a house premise before anything is adopted. Cost of capital, capex,
 * start date and the benefit components are never defaulted. */
const housePremises: Record<string, House> = {
  ramp: {value: {stageMonths: [3], stageLoads: ["0.5"]}, source: "Três meses a meia carga depois da partida"},
  annualGrowth: {value: "0", source: "Sem crescimento de volume, salvo informação"},
  usefulLifeYears: {value: 10, source: "Vida útil de 10 anos para equipamento industrial"},
  cashTaxRate: {value: "0.34", source: "IR e CSLL de 34% no lucro real"},
  receivableDays: {value: "0", source: "Sem receita nova, sem recebíveis novos"},
  workingCapitalReturnsAtEnd: {value: true, source: "Giro volta no fim da vida útil"},
};

export type PremiseCompletion =
  | {status: "complete"; facts: InvestmentFacts; housePremiseKeys: string[]}
  | {status: "missing"; missing: string[]};

/** Turns the extraction into the facts the method needs. Required facts that nobody stated make
 * the proposal wait; the reply asks for them in one batch instead of inventing them. */
export function completeInvestmentFacts(input: {extraction: InvestmentFactExtraction; ids: {analysisId: string; entityId: string; definitionVersionId: string}; currency: "BRL"}): PremiseCompletion {
  const e = input.extraction, missing: string[] = [];
  const need = <T>(key: string, f: {value: T | null; origin: "informed" | "document" | null; source: string | null}) => {
    if (f.value === null || f.origin === null) {missing.push(key); return null;}
    return {value: f.value, origin: f.origin, source: f.source ?? (f.origin === "informed" ? "Informado na conversa" : "Documento")};
  };
  const capex = need("capex", e.capex), start = need("operationStartMonth", e.operationStartMonth);
  const displaced = need("annualDisplacedPurchases", e.annualDisplacedPurchases), variable = need("annualNewVariableCost", e.annualNewVariableCost);
  const fixed = need("annualNewFixedCost", e.annualNewFixedCost), maintenance = need("annualMaintenance", e.annualMaintenance);
  const inventory = need("inventoryDays", e.inventoryDays), newSupplier = need("newSupplierDays", e.newSupplierDays), lostSupplier = need("lostSupplierDays", e.lostSupplierDays);
  const discount = need("discountRate", e.discountRate);
  if (missing.length || !capex || !start || !displaced || !variable || !fixed || !maintenance || !inventory || !newSupplier || !lostSupplier || !discount) return {status: "missing", missing};
  const used: string[] = [];
  const orHouse = <T>(key: string, f: {value: T | null; origin: "informed" | "document" | null; source: string | null}, map: (v: T) => unknown = v => v) => {
    if (f.value !== null && f.origin !== null) return {value: map(f.value), origin: f.origin, source: f.source ?? "Informado na conversa"};
    used.push(key); return {value: housePremises[key]!.value, origin: "house" as const, source: housePremises[key]!.source};
  };
  const firstYear = Math.min(...capex.value.map(c => c.year));
  const life = orHouse("usefulLifeYears", e.usefulLifeYears) as {value: number; origin: "informed" | "document" | "house"; source: string};
  const startYear = Number(start.value.slice(0, 4));
  const years = Math.max(3, startYear - firstYear + life.value);
  const revenue = e.annualIncrementalRevenue.value !== null && e.annualIncrementalRevenue.origin !== null
    ? {value: e.annualIncrementalRevenue.value, origin: e.annualIncrementalRevenue.origin, source: e.annualIncrementalRevenue.source ?? "Informado na conversa"}
    : {value: "0", origin: "house" as const, source: "Sem receita nova, salvo informação"};
  const facts = investmentFactsSchema.parse({analysisId: input.ids.analysisId, entityId: input.ids.entityId, perimeter: "standalone", currency: input.currency,
    definitionVersionId: input.ids.definitionVersionId, firstYear, years,
    capex, operationStart: {...start, value: `${start.value}-01`}, ramp: {...orHouse("ramp", {value: null, origin: null, source: null})},
    annualIncrementalRevenue: revenue, annualDisplacedPurchases: displaced, annualNewVariableCost: variable, annualNewFixedCost: fixed,
    annualGrowth: orHouse("annualGrowth", e.annualGrowth, v => String(v)), annualMaintenance: maintenance, usefulLifeYears: life,
    cashTaxRate: orHouse("cashTaxRate", e.cashTaxRate, v => String(v)), receivableDays: orHouse("receivableDays", e.receivableDays, v => String(v)),
    inventoryDays: {...inventory, value: String(inventory.value)}, newSupplierDays: {...newSupplier, value: String(newSupplier.value)}, lostSupplierDays: {...lostSupplier, value: String(lostSupplier.value)},
    discountRate: {...discount, value: String(discount.value)}, workingCapitalReturnsAtEnd: orHouse("workingCapitalReturnsAtEnd", {value: null, origin: null, source: null}),
    sensitivities: {benefitFactor: {value: "0.66666666666666666667", origin: "house", source: "Benefício anual um terço menor"},
      capexFactor: {value: "1.2", origin: "house", source: "Capex 20% maior"}, startDelayMonths: {value: 6, origin: "house", source: "Partida seis meses mais tarde"},
      deferMonths: {value: 12, origin: "house", source: "Adiar doze meses"}}});
  return {status: "complete", facts, housePremiseKeys: used};
}

/** The proposal the worker records next to its reply: facts with origin, the hypotheses one
 * confirmation adopts, a short summary for the card and the fingerprint the confirmation checks. */
export function buildInvestmentPremiseProposal(facts: InvestmentFacts) {
  const hypotheses = proposeInvestmentHypotheses(facts).map(h => ({...h, dimensions: {...h.dimensions, entityId: null, definitionVersionId: null}}));
  const summary = {
    capex: facts.capex.value, operationStart: facts.operationStart.value, discountRate: facts.discountRate.value,
    netAnnualBenefit: String(Number(facts.annualDisplacedPurchases.value) + Number(facts.annualIncrementalRevenue.value) - Number(facts.annualNewVariableCost.value) - Number(facts.annualNewFixedCost.value)),
    premises: Object.entries(facts).filter(([, v]) => v && typeof v === "object" && "origin" in v).map(([key, v]) => ({key, origin: (v as {origin: string}).origin, source: (v as {source: string}).source})),
    cases: ["base", "benefit-lower", "capex-higher", "slower-start", "defer-12"],
  };
  const body = {methodId: investmentPremiseMethod.methodId, methodVersion: investmentPremiseMethod.methodVersion, facts, hypotheses, summary};
  return {...body, fingerprint: createHash("sha256").update(JSON.stringify(body)).digest("hex")};
}

const urlNamespace = Buffer.from("6ba7b8119dad11d180b400c04fd430c8", "hex");
/** RFC 9562 UUID version 5 in the URL namespace, as the database derives its own identifiers. */
export function uuidV5(name: string): string {
  const h = createHash("sha1").update(Buffer.concat([urlNamespace, Buffer.from(name, "utf8")])).digest();
  h[6] = (h[6]! & 0x0f) | 0x50; h[8] = (h[8]! & 0x3f) | 0x80;
  const x = h.subarray(0, 16).toString("hex");
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20, 32)}`;
}

export type TurnPremises = {
  forAdvisor: {status: "proposed"; summary: ReturnType<typeof buildInvestmentPremiseProposal>["summary"]; housePremises: string[]} | {status: "missing"; missing: string[]};
  proposal: ReturnType<typeof buildInvestmentPremiseProposal> | null;
};
/** One turn's premise step. It never fails the turn: any error is logged and the turn continues
 * as a plain reply. The analysis identity is stable per work, so a corrected proposal replaces the
 * same slots of the working basis instead of accumulating a second analysis. */
export async function proposeInvestmentPremisesForTurn(input: {
  message: string; recentUserMessages: string[]; projectId: string | null;
  loadEvidence: () => Promise<unknown>; extract: (text: string) => Promise<unknown>;
  log: (event: string, detail: Record<string, unknown>) => void;
}): Promise<TurnPremises | null> {
  if (!input.projectId || !shouldProposeInvestmentPremises(input.message)) return null;
  try {
    const documentFields = await input.loadEvidence();
    const extraction = investmentFactExtractionSchema.parse(await input.extract(JSON.stringify({
      latestUserMessage: input.message, earlierUserMessages: input.recentUserMessages.slice(-6), documentFields})));
    const analysisId = uuidV5(`offroad:investment-analysis:${input.projectId}`);
    const completed = completeInvestmentFacts({extraction, ids: {analysisId, entityId: analysisId, definitionVersionId: analysisId}, currency: "BRL"});
    if (completed.status === "missing") {
      input.log("investment_premises.missing", {missing: completed.missing});
      return {forAdvisor: {status: "missing", missing: completed.missing}, proposal: null};
    }
    const proposal = buildInvestmentPremiseProposal(completed.facts);
    input.log("investment_premises.proposed", {hypotheses: proposal.hypotheses.length, housePremises: completed.housePremiseKeys});
    return {forAdvisor: {status: "proposed", summary: proposal.summary, housePremises: completed.housePremiseKeys}, proposal};
  } catch (error) {
    input.log("investment_premises.failed", {message: error instanceof Error ? error.message.slice(0, 200) : "unknown"});
    return null;
  }
}
