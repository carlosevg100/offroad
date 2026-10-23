import {z} from "zod";
import {proposeWeeklyCashHypotheses, weeklyCashFactsSchema, type WeeklyCashFacts} from "@offroad/financial-model";
import {citedSource, extractedAmount, extractedMoney, extractedOrigin, fingerprintedProposal, itemKeys, itemLabel, itemSource, proposeLote2PremisesForTurn,
  sameLabel, sourced, stated, type Lote2Completion, summaryRow, type Lote2Summary} from "./lote2-premises";
import {premiseEntry, turnIntentInstruction, turnIntents} from "./premise-cue";

/** The method these premises feed, pinned to its implemented version. */
export const weeklyCashPremiseMethod = {methodId: "project-weekly-cash", methodVersion: "2026.10.23-v1"} as const;

/** Weekly cash to a date: the turn may propose the projection's premises. A statement after the latest such
 * question among the recent messages is a continuation candidate; the extraction's `turnIntent` decides it. */
export function shouldProposeWeeklyCashPremises(message: string, hasAttachments: boolean, earlierUserMessages: readonly string[] = []): boolean {
  return premiseEntry("weekly_cash", message, hasAttachments, earlierUserMessages) !== null;
}

export const weeklyCashSituation = "seasonal-working-capital";
const obligations = ["payroll", "thirteenth_salary", "payroll_charges", "sales_taxes", "income_taxes", "debt_service"] as const;
const coverageStatus = z.enum(["included", "not_applicable", "not_examined"]);
const item = {label: itemLabel, origin: extractedOrigin, source: itemSource};

/** Only what the person said or a document states. Absence stays null; nothing is estimated here. */
export const weeklyCashExtractionSchema = z.strictObject({
  turnIntent: z.enum(turnIntents),
  /** The date of the opening balance; the weeks run Monday to Sunday from its week. */
  openingDate: sourced(z.iso.date()),
  openingCash: sourced(extractedMoney), minimumCash: sourced(extractedMoney),
  /** The last day the person asks about (for example the end of the year). */
  calendarEnd: sourced(z.iso.date()),
  /** The balance a period closing projects at the end of the horizon, when stated. */
  projectionClosing: sourced(extractedMoney),
  covenantTestDate: sourced(z.iso.date()),
  streams: z.array(z.strictObject({...item,
    category: z.enum(["debt", "statutory", "operating", "action"]), direction: z.enum(["inflow", "outflow"]),
    obligation: z.enum(obligations).nullable(),
    /** The label of the base stream this one replaces in an alternative (a larger or later harvest); null for a base stream. */
    variantOf: itemLabel.nullable(),
    events: z.array(z.strictObject({date: z.iso.date(), amount: extractedAmount})).min(1).max(2000),
  })).max(40),
  cases: z.array(z.strictObject({...item, role: z.enum(["informed", "alternative"]), streamLabels: z.array(itemLabel).min(1).max(40)})).max(8),
  actions: z.array(z.strictObject({...item,
    streamLabel: itemLabel, replacesStreamLabel: itemLabel.nullable(),
    amount: extractedAmount.nullable(), days: z.number().int().min(0).max(9999).nullable(),
    rate: z.number().min(0).max(10).nullable(), ratePeriod: z.enum(["annual", "monthly"]).nullable(),
    iofDaily: z.number().min(0).max(1).nullable(), iofDailyCapDays: z.number().int().min(0).max(9999).nullable(), iofAdditional: z.number().min(0).max(1).nullable(),
    upfrontFee: z.number().min(0).max(1).nullable(), repaymentDate: z.iso.date().nullable(),
  })).max(4),
  coverage: z.strictObject(Object.fromEntries(obligations.map((o) => [o, sourced(coverageStatus)])) as Record<(typeof obligations)[number], ReturnType<typeof sourced<typeof coverageStatus>>>),
});
export type WeeklyCashExtraction = z.infer<typeof weeklyCashExtractionSchema>;

export const weeklyCashExtractionContract = {
  task: "weekly_cash_extraction" as const,
  system: [
    "Você extrai os dados que permitem projetar o caixa semana a semana da companhia, a partir da mensagem de uma pessoa, das mensagens anteriores e de campos já extraídos de documentos (fluxo da tesouraria, contratos, cronogramas, propostas de banco).",
    "Extraia somente o que foi dito ou o que está em documento. Se não estiver, devolva null (em value, origin e source, ou no campo). Nunca estime, nunca complete, nunca distribua um valor mensal em dias por conta própria.",
    "Valores monetários em reais, sem separador de milhar (R$ 3 milhões vira 3000000), sempre positivos; a direção diz se entra ou sai. Taxas em fração (1,6% ao mês vira rate 0.016 com ratePeriod monthly). Datas no formato AAAA-MM-DD.",
    "openingDate é a data do saldo inicial (openingCash), lido no início desse dia: não inclua eventos anteriores a essa data, que já estão no saldo. minimumCash é o caixa mínimo de operação. calendarEnd é a última data perguntada (por exemplo 31 de dezembro). projectionClosing é o saldo do fechamento projetado no fim do período, quando houver. covenantTestDate é a data de apuração do covenant, quando houver.",
    "Cada fluxo é uma série de eventos datados de um tipo (recebimentos de clientes, folha, 13º, FGTS, INSS, impostos, fornecedores, parcelas de dívida, safra, desembolso de linha): categoria debt, statutory, operating ou action, direção inflow ou outflow, a obrigação que carrega quando é folha (payroll), 13º (thirteenth_salary), encargos (payroll_charges), impostos sobre vendas (sales_taxes), IR e CSLL (income_taxes) ou serviço da dívida (debt_service), e um evento por data com o valor. Cada fluxo tem um rótulo único: dois pagamentos distintos ao mesmo credor recebem rótulos distintos.",
    "Uma ação (saque de conta garantida, antecipação de recebíveis, linha maior) é um fluxo de categoria action e direção inflow com um único desembolso, e um item em actions com o rótulo desse fluxo, o fluxo que substitui quando houver, o valor custeado, os dias de uso, a taxa e o período, o IOF diário, o teto de dias do IOF, o IOF adicional, a comissão e a data de devolução, como a proposta escreve.",
    "variantOf é o rótulo do fluxo base que este fluxo substitui quando é uma variante discutida (por exemplo a safra de R$ 30 milhões no lugar da de R$ 25 milhões, ou a safra adiada); null quando o fluxo é do plano.",
    "cases só quando a conversa os descreve: o plano informado e cada alternativa, com os rótulos dos fluxos de cada um. coverage diz, para cada obrigação, se está incluída, não se aplica ou não foi examinada, quando dito.",
    "origin é informed quando a pessoa disse, document quando veio de um campo de documento. source cita em poucas palavras de onde veio.",
    turnIntentInstruction,
  ].join("\n"),
  schema: weeklyCashExtractionSchema,
  schemaName: "weekly_cash_extraction_v2",
  outputMode: "prompted_json" as const,
  maxOutputTokens: 16_000,
  cacheKey: "weekly-cash-extraction-2026.10.23-v2",
};

const dayMs = 86400000;
const shift = (iso: string, days: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + days * dayMs).toISOString().slice(0, 10);
const weekday = (iso: string) => new Date(`${iso}T00:00:00Z`).getUTCDay();
/** The Monday on or before a date, and the Sunday on or after it. */
const mondayOf = (iso: string) => shift(iso, -((weekday(iso) + 6) % 7));
const sundayOf = (iso: string) => shift(iso, (7 - weekday(iso)) % 7);

/** Turns the extraction into the facts the method needs. Required facts nobody stated make the
 * proposal wait; the reply asks for them in one batch. House premises are only conventions of the
 * method: the week that holds the opening balance, the calendar to the end of the year when no date
 * was asked, the plan and one alternative per action when no case was described, and an obligation
 * nobody examined. No flow of the company is assumed. */
export function completeWeeklyCashFacts(input: {extraction: WeeklyCashExtraction; ids: {weeklyCashId: string; entityId: string; definitionVersionId: string}; currency: "BRL"}): Lote2Completion<WeeklyCashFacts> {
  const e = input.extraction, missing: string[] = [], used: string[] = [];
  const opening = stated(e.openingDate), openingCash = stated(e.openingCash), minimumCash = stated(e.minimumCash);
  if (!opening) missing.push("openingDate");
  if (!openingCash) missing.push("openingCash");
  if (!minimumCash) missing.push("minimumCash");
  if (!e.streams.length) missing.push("streams");
  const streamIds = itemKeys(e.streams.map((s) => s.label));
  // Ids are unique (a repeated label gets a stable suffix), but a reference by a repeated label could
  // name either stream: it is refused, and the streams that share the label are asked to be told apart.
  const ambiguous = new Set<number>();
  const refer = (label: string): number | "unknown" | "ambiguous" => {
    const hits = e.streams.flatMap((x, n) => sameLabel(x.label, label) ? [n] : []);
    if (hits.length > 1) {hits.forEach((n) => ambiguous.add(n)); return "ambiguous";}
    return hits.length ? hits[0]! : "unknown";
  };
  const streamOf = (label: string) => {const k = refer(label); return typeof k === "number" ? streamIds[k]! : null;};
  const firstMonday = opening ? mondayOf(opening.value) : null;
  if (opening && firstMonday !== opening.value) used.push("openingWeek");
  const streams = e.streams.map((s, n) => {
    const p = `streams.${n + 1}.`, before = missing.length;
    // The balance is read at the start of its date: an event before it is already in the balance and is never applied again.
    if (opening && s.events.some((x) => x.date < opening.value)) missing.push(p + "beforeOpeningBalance");
    if (s.obligation !== null && s.direction !== "outflow") missing.push(p + "obligation");
    if (s.category === "action" && s.direction !== "inflow") missing.push(p + "direction");
    // A variant replaces a known base stream of the plan; an unknown base is a question.
    const ref = s.variantOf === null ? null : refer(s.variantOf), base = typeof ref === "number" ? e.streams[ref]! : null;
    if (ref !== null && ref !== "ambiguous" && (!base || base === s || base.variantOf !== null || base.category === "action" || s.category === "action")) missing.push(p + "variantOf");
    if (missing.length > before) return null;
    return {value: {id: streamIds[n]!, label: s.label, category: s.category, direction: s.direction, obligation: s.obligation,
      dates: s.events.map((x) => x.date), amounts: s.events.map((x) => x.amount)}, origin: s.origin, source: citedSource(s.origin, s.source)};
  });
  const actionIds = itemKeys(e.actions.map((a) => a.label));
  const actions = e.actions.map((a, n) => {
    const p = `actions.${n + 1}.`, before = missing.length;
    for (const k of ["amount", "days", "rate", "ratePeriod", "iofDaily", "iofDailyCapDays", "iofAdditional", "upfrontFee", "repaymentDate"] as const) if (a[k] === null) missing.push(p + k);
    const drawn = refer(a.streamLabel), replacing = a.replacesStreamLabel === null ? null : refer(a.replacesStreamLabel);
    const streamId = typeof drawn === "number" ? streamIds[drawn]! : null, replaces = typeof replacing === "number" ? streamIds[replacing]! : null;
    const s = typeof drawn === "number" ? e.streams[drawn]! : null;
    if (drawn !== "ambiguous" && (!s || s.category !== "action" || s.direction !== "inflow")) missing.push(p + "streamLabel");
    if (replacing !== null && replacing !== "ambiguous" && (!replaces || replaces === streamId)) missing.push(p + "replacesStreamLabel");
    if (drawn === "ambiguous" || replacing === "ambiguous") return null;
    if (missing.length > before) return null;
    return {value: {id: actionIds[n]!, label: a.label, streamId: streamId!, replacesStreamId: replaces, amount: a.amount!, days: a.days!, rate: String(a.rate!), ratePeriod: a.ratePeriod!,
      iofDaily: String(a.iofDaily!), iofDailyCapDays: a.iofDailyCapDays!, iofAdditional: String(a.iofAdditional!), upfrontFee: String(a.upfrontFee!), repaymentDate: a.repaymentDate!},
      origin: a.origin, source: citedSource(a.origin, a.source)};
  });
  // An action stream with no terms would be cash without a cost.
  e.streams.forEach((s, n) => {if (s.category === "action" && !ambiguous.has(n) && !e.actions.some((a) => sameLabel(a.streamLabel, s.label))) missing.push(`streams.${n + 1}.action`);});
  let cases: WeeklyCashFacts["cases"] = [];
  if (e.cases.length) {
    if (e.cases.filter((c) => c.role === "informed").length !== 1) missing.push("cases.informed");
    const caseIds = itemKeys(e.cases.map((c) => c.label));
    e.cases.forEach((c, n) => {
      const refs = c.streamLabels.map(refer), ids = refs.map((k) => typeof k === "number" ? streamIds[k]! : null);
      if (refs.includes("unknown")) missing.push(`cases.${n + 1}.streamLabels`);
      if (ids.some((x) => x === null)) return;
      cases.push({value: {id: caseIds[n]!, label: c.label, role: c.role, streamIds: [...new Set(ids as string[])]}, origin: c.origin, source: citedSource(c.origin, c.source)});
    });
  } else if (streams.every((s) => s !== null) && actions.every((a) => a !== null)) {
    // The plan is every base stream, without variants or actions. Each variant is the plan with the
    // variant in place of its base; each action is the plan with its draw, the stream it replaces left out.
    const plan = e.streams.flatMap((x, n) => x.category === "action" || x.variantOf !== null ? [] : [streamIds[n]!]);
    if (!plan.length) missing.push("streams");
    const variants = e.streams.flatMap((x, n) => x.variantOf === null ? [] : [{id: streamIds[n]!, label: x.label, base: streamOf(x.variantOf)!}]);
    const caseId = (prefix: string, id: string) => `${prefix}-${id}`.slice(0, 40).replace(/-$/, "");
    cases = [{value: {id: "plano", label: "Plano informado", role: "informed", streamIds: plan}, origin: "house", source: "fluxos informados, sem variantes nem ações"},
      ...variants.map((v) => ({value: {id: caseId("variante", v.id), label: v.label, role: "alternative" as const, streamIds: plan.map((id) => id === v.base ? v.id : id)},
        origin: "house" as const, source: "variante no lugar do fluxo base"})),
      ...actions.map((a) => ({value: {id: caseId("com", a!.value.id), label: a!.value.label, role: "alternative" as const,
        streamIds: [...plan.filter((id) => id !== a!.value.replacesStreamId), a!.value.streamId]}, origin: "house" as const, source: "alternativa examinada"}))];
    // A working basis holds at most eight cases; more is a question of which to set aside.
    if (cases.length > 8) missing.push("cases.atMostEight");
    used.push("cases");
  }
  for (const n of [...ambiguous].sort((a, b) => a - b)) missing.push(`streams.${n + 1}.label`);
  const coverage = Object.fromEntries(obligations.map((o) => {
    const s = stated(e.coverage[o]), carrier = e.streams.find((x) => x.obligation === o);
    if (s) return [o, s];
    if (carrier) return [o, {value: "included" as const, origin: carrier.origin, source: citedSource(carrier.origin, carrier.source)}];
    used.push("coverageNotExamined");
    return [o, {value: "not_examined" as const, origin: "house" as const, source: "Ninguém confirmou essa obrigação; fica como não examinada"}];
  })) as WeeklyCashFacts["coverage"];
  if (missing.length || !opening || !openingCash || !minimumCash || !firstMonday) return {status: "missing", missing: [...new Set(missing)]};
  const asked = stated(e.calendarEnd);
  const calendarEnd = asked ?? {value: `${opening.value.slice(0, 4)}-12-31`, origin: "house" as const, source: "calendário até o fim do ano"};
  if (!asked) used.push("calendarEnd");
  const lastEvent = streams.flatMap((s) => s!.value.dates).sort().at(-1)!;
  const endDate = sundayOf([calendarEnd.value, lastEvent, shift(firstMonday, 6)].sort().at(-1)!);
  const closing = stated(e.projectionClosing), test = stated(e.covenantTestDate);
  const facts = weeklyCashFactsSchema.parse({...input.ids, perimeter: "standalone", currency: input.currency, openingDate: firstMonday, endDate,
    openingCash, minimumCash, projectionClosing: closing, calendarEnd, covenantTestDate: test,
    streams: streams.map((s) => s!), cases, actions: actions.map((a) => a!), coverage});
  return {status: "complete", facts, situationId: weeklyCashSituation, housePremiseKeys: [...new Set(used)]};
}

/** The card: each stream, each case, each action, the minimum and the opening cash. */
export function weeklyCashSummary(facts: WeeklyCashFacts): Lote2Summary {
  const row = summaryRow;
  return {situationId: weeklyCashSituation, referenceDate: facts.openingDate, items: [
    ...facts.streams.map((s) => row("stream", s.value.label, s)),
    ...facts.cases.map((c) => row("case", c.value.label, c, c.origin !== "house" ? null
      : c.value.id === "plano" ? "informedPlan" : c.value.id.startsWith("variante-") ? "variantCase" : c.value.id.startsWith("com-") ? "actionCase" : null)),
    ...facts.actions.map((a) => row("action", a.value.label, a)),
    row("premise", "Caixa mínimo de operação", facts.minimumCash, "minimumCash"),
    row("premise", "Caixa inicial", facts.openingCash, "openingCash"),
  ]};
}

export function buildWeeklyCashPremiseProposal(facts: WeeklyCashFacts) {
  return fingerprintedProposal(weeklyCashPremiseMethod, facts, proposeWeeklyCashHypotheses(facts), weeklyCashSummary(facts));
}

export async function proposeWeeklyCashPremisesForTurn(input: {
  message: string; hasAttachments: boolean; recentUserMessages: string[]; projectId: string | null;
  loadEvidence: () => Promise<unknown>; extract: (text: string) => Promise<unknown>;
  log: (event: string, detail: Record<string, unknown>) => void;
}) {
  const entry = input.projectId ? premiseEntry("weekly_cash", input.message, input.hasAttachments, input.recentUserMessages) : null;
  if (!input.projectId || !entry) return null;
  return proposeLote2PremisesForTurn({logPrefix: "weekly_cash_premises", idName: "weekly-cash", schema: weeklyCashExtractionSchema,
    complete: (extraction, id) => completeWeeklyCashFacts({extraction, ids: {weeklyCashId: id, entityId: id, definitionVersionId: id}, currency: "BRL"}),
    build: buildWeeklyCashPremiseProposal}, {...input, entry, projectId: input.projectId});
}
