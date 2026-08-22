/**
 * The market stage of a debt process: sounding, indications, book, allocation.
 *
 * A desk sounds a shortlist with a teaser, signs NDAs, opens the room, answers questions and
 * collects indications. Then it lays every indication on one ruler (amount, tenor, all-in cost
 * over the CDI, security asked) and builds the book: who covers what, at what price, and how
 * the allocation closes the amount. Every step is an event with an actor and a time, because
 * "who saw what, when" is what a company asks first and a regulator asks second.
 *
 * Everything here is deterministic arithmetic over stated indications. Nothing is estimated:
 * an investor that has not indicated has no line in the book, and a fixed rate is translated
 * to a spread only against the CDI the desk states.
 */

import Decimal from "decimal.js";

import type {Investor} from "@offroad/investor-base";

export const soundingVersion = "2026.08.21-v1";

/** The stages an investor moves through; each transition is an event. */
export type SoundingStage = "listed" | "teaser_sent" | "nda_signed" | "room_opened" | "indicated" | "declined" | "allocated" | "dropped";

export type SoundingEventType = "listed" | "teaser_sent" | "nda_signed" | "room_opened" | "question_asked" | "question_answered" | "indication_received" | "declined" | "allocated" | "dropped";

export type SoundingEvent = {
  investorId: string;
  type: SoundingEventType;
  /** ISO instant, supplied by the caller: the module never reads the clock. */
  at: string;
  /** Who did it, on the desk side or the investor side. */
  actor: string;
  note?: string;
  /** For questions: the question id, so the answer joins it. */
  questionId?: string;
  indication?: Indication;
};

export type IndicationPricing =
  | {type: "cdi_plus"; spreadPct: string}
  | {type: "cdi_pct"; pct: string}
  | {type: "fixed"; ratePct: string}
  | {type: "ipca_plus"; spreadPct: string};

export type Indication = {
  investorId: string;
  amount: string;
  tenorMonths: number;
  /** Months before the first principal payment. */
  graceMonths?: number;
  pricing: IndicationPricing;
  /** Security the investor requires beyond what the term sheet offers, if any. */
  securityAsked?: string;
  conditions?: readonly string[];
  /** ISO date the indication stands until. */
  validUntil?: string;
  /** Firm or subject to committee. */
  firm: boolean;
};

/** The market assumptions every indication is read against. Stated, never assumed. */
export type MarketBasis = {
  /** CDI expected over the tenor, % p.a. */
  cdiPct: string;
  /** IPCA expected over the tenor, % p.a.; needed only to read IPCA+ indications. */
  ipcaPct?: string;
};

export type NormalizedIndication = {
  indication: Indication;
  /** All-in cost, % p.a., on the stated basis. */
  allInPct: string;
  /** Equivalent spread over the CDI, % p.a. (all-in minus CDI). */
  spreadOverCdiPct: string;
  basisNote: {pt: string; en: string};
};

export type BookLine = NormalizedIndication & {
  investor: Investor;
  rank: number;
  /** Amount this line receives in the allocation. */
  allocated: string;
  share: string;
};

export type Book = {
  target: string;
  basis: MarketBasis;
  lines: BookLine[];
  /** Sum of indications over the target. */
  coverage: string;
  /** Amount-weighted all-in of the allocated lines, % p.a. */
  weightedAllInPct: string | null;
  weightedSpreadOverCdiPct: string | null;
  allocatedTotal: string;
  /** Target minus allocated, zero when the book closes the amount. */
  shortfall: string;
  method: AllocationMethod;
  notes: {pt: string; en: string}[];
};

export type AllocationMethod = "price_priority" | "pro_rata";

const pct = (value: Decimal) => value.toDecimalPlaces(2).toFixed();

/** Reads an indication onto the ruler: all-in % p.a. and spread over the CDI. */
export function normalizeIndication(indication: Indication, basis: MarketBasis): NormalizedIndication {
  const cdi = new Decimal(basis.cdiPct);
  const {pricing} = indication;
  let allIn: Decimal;
  let basisNote: {pt: string; en: string};
  switch (pricing.type) {
    case "cdi_plus":
      allIn = cdi.plus(pricing.spreadPct);
      basisNote = {pt: `CDI + ${pricing.spreadPct}% sobre CDI de ${basis.cdiPct}%`, en: `CDI + ${pricing.spreadPct}% on CDI of ${basis.cdiPct}%`};
      break;
    case "cdi_pct":
      allIn = cdi.times(pricing.pct).div(100);
      basisNote = {pt: `${pricing.pct}% do CDI sobre CDI de ${basis.cdiPct}%`, en: `${pricing.pct}% of CDI on CDI of ${basis.cdiPct}%`};
      break;
    case "fixed":
      allIn = new Decimal(pricing.ratePct);
      basisNote = {pt: `Prefixado ${pricing.ratePct}%; spread lido contra CDI de ${basis.cdiPct}%`, en: `Fixed ${pricing.ratePct}%; spread read against CDI of ${basis.cdiPct}%`};
      break;
    case "ipca_plus": {
      if (!basis.ipcaPct) throw new Error("An IPCA+ indication needs the stated IPCA to be read on the ruler");
      // (1 + ipca)(1 + spread) - 1, the way the paper accrues.
      allIn = new Decimal(1).plus(new Decimal(basis.ipcaPct).div(100)).times(new Decimal(1).plus(new Decimal(pricing.spreadPct).div(100))).minus(1).times(100);
      basisNote = {pt: `IPCA + ${pricing.spreadPct}% sobre IPCA de ${basis.ipcaPct}%`, en: `IPCA + ${pricing.spreadPct}% on IPCA of ${basis.ipcaPct}%`};
      break;
    }
  }
  return {indication, allInPct: pct(allIn), spreadOverCdiPct: pct(allIn.minus(cdi)), basisNote};
}

/**
 * The book: indications ranked by all-in cost, allocated against the target.
 *
 * Price priority fills the cheapest lines first and cuts the marginal line; pro rata scales
 * every line by the same factor when the book is oversubscribed. A desk uses the first to
 * close tight and the second to keep relationships; both are shown with the coverage, so the
 * choice is visible.
 */
export function buildBook(input: {target: string; indications: readonly Indication[]; investors: readonly Investor[]; basis: MarketBasis; method?: AllocationMethod}): Book {
  const method = input.method ?? "price_priority";
  const target = new Decimal(input.target);
  const byId = new Map(input.investors.map((investor) => [investor.id, investor]));
  const notes: {pt: string; en: string}[] = [];

  const normalized = input.indications
    .filter((indication) => {
      if (byId.has(indication.investorId)) return true;
      notes.push({pt: `Indicação de ${indication.investorId} ignorada: investidor fora da lista`, en: `Indication from ${indication.investorId} ignored: investor not on the list`});
      return false;
    })
    .map((indication) => normalizeIndication(indication, input.basis));

  // Cheapest first; a firm indication beats a subject-to-committee one at the same price.
  const ranked = [...normalized].sort((a, b) => {
    const byCost = new Decimal(a.allInPct).comparedTo(b.allInPct);
    if (byCost !== 0) return byCost;
    if (a.indication.firm !== b.indication.firm) return a.indication.firm ? -1 : 1;
    return a.indication.investorId.localeCompare(b.indication.investorId);
  });

  const total = ranked.reduce((sum, line) => sum.plus(line.indication.amount), new Decimal(0));
  const coverage = target.gt(0) ? total.div(target) : new Decimal(0);

  const allocations = new Map<string, Decimal>();
  if (method === "pro_rata" && total.gt(target)) {
    const factor = target.div(total);
    for (const line of ranked) allocations.set(line.indication.investorId, new Decimal(line.indication.amount).times(factor).toDecimalPlaces(0));
    notes.push({pt: `Livro ${pct(coverage.times(100))}% coberto; rateio proporcional de ${pct(factor.times(100))}% sobre cada indicação`, en: `Book ${pct(coverage.times(100))}% covered; pro rata at ${pct(factor.times(100))}% of each indication`});
  } else {
    let remaining = target;
    for (const line of ranked) {
      const amount = Decimal.min(remaining, new Decimal(line.indication.amount));
      allocations.set(line.indication.investorId, amount.gt(0) ? amount : new Decimal(0));
      remaining = remaining.minus(amount);
    }
    if (total.gt(target)) {
      const marginal = ranked.find((line) => allocations.get(line.indication.investorId)!.lt(line.indication.amount));
      if (marginal) notes.push({pt: `Linha marginal: ${byId.get(marginal.indication.investorId)!.name} a ${marginal.allInPct}% a.a., cortada de ${marginal.indication.amount} para ${allocations.get(marginal.indication.investorId)!.toFixed()}`, en: `Marginal line: ${byId.get(marginal.indication.investorId)!.name} at ${marginal.allInPct}% p.a., cut from ${marginal.indication.amount} to ${allocations.get(marginal.indication.investorId)!.toFixed()}`});
    }
  }

  const allocatedTotal = [...allocations.values()].reduce((sum, value) => sum.plus(value), new Decimal(0));
  const shortfall = Decimal.max(target.minus(allocatedTotal), 0);
  if (shortfall.gt(0)) notes.push({pt: `Livro cobre ${pct(coverage.times(100))}% do alvo; faltam ${shortfall.toFixed()}`, en: `Book covers ${pct(coverage.times(100))}% of the target; ${shortfall.toFixed()} short`});

  const lines: BookLine[] = ranked.map((line, index) => {
    const allocated = allocations.get(line.indication.investorId) ?? new Decimal(0);
    return {...line, investor: byId.get(line.indication.investorId)!, rank: index + 1, allocated: allocated.toFixed(), share: allocatedTotal.gt(0) ? pct(allocated.div(allocatedTotal).times(100)) : "0"};
  });

  const weighted = (key: "allInPct" | "spreadOverCdiPct") => {
    if (allocatedTotal.lte(0)) return null;
    return pct(lines.reduce((sum, line) => sum.plus(new Decimal(line[key]).times(line.allocated)), new Decimal(0)).div(allocatedTotal));
  };

  return {
    target: target.toFixed(),
    basis: input.basis,
    lines,
    coverage: coverage.toDecimalPlaces(4).toFixed(),
    weightedAllInPct: weighted("allInPct"),
    weightedSpreadOverCdiPct: weighted("spreadOverCdiPct"),
    allocatedTotal: allocatedTotal.toFixed(),
    shortfall: shortfall.toFixed(),
    method,
    notes,
  };
}

/** Which stage each event type lands the investor in; questions do not move the stage. */
const stageAfter: Partial<Record<SoundingEventType, SoundingStage>> = {
  listed: "listed",
  teaser_sent: "teaser_sent",
  nda_signed: "nda_signed",
  room_opened: "room_opened",
  indication_received: "indicated",
  declined: "declined",
  allocated: "allocated",
  dropped: "dropped",
};

/** What may follow what. The room never opens before the NDA; nobody is allocated without an indication. */
const allowed: Record<SoundingStage, readonly SoundingEventType[]> = {
  listed: ["teaser_sent", "dropped"],
  teaser_sent: ["nda_signed", "declined", "dropped", "question_asked", "question_answered"],
  nda_signed: ["room_opened", "declined", "dropped", "question_asked", "question_answered"],
  room_opened: ["indication_received", "declined", "dropped", "question_asked", "question_answered"],
  indicated: ["indication_received", "allocated", "declined", "dropped", "question_asked", "question_answered"],
  declined: [],
  allocated: ["dropped"],
  dropped: [],
};

export type InvestorTrack = {
  investorId: string;
  stage: SoundingStage;
  events: SoundingEvent[];
  latestIndication: Indication | null;
  openQuestions: number;
  /** Events the track refused, with the reason; the audit keeps them. */
  refused: Array<{event: SoundingEvent; reason: {pt: string; en: string}}>;
};

/** Replays the event log into one track per investor, refusing transitions the process does not allow. */
export function trackSounding(investorIds: readonly string[], events: readonly SoundingEvent[]): InvestorTrack[] {
  const tracks = new Map<string, InvestorTrack>(investorIds.map((id) => [id, {investorId: id, stage: "listed", events: [], latestIndication: null, openQuestions: 0, refused: []}]));
  const ordered = [...events].sort((a, b) => a.at.localeCompare(b.at));
  for (const event of ordered) {
    const track = tracks.get(event.investorId);
    if (!track) continue;
    if (event.type === "listed") {
      track.events.push(event);
      continue;
    }
    if (!allowed[track.stage].includes(event.type)) {
      track.refused.push({event, reason: {pt: `"${event.type}" não é permitido no estágio "${track.stage}"`, en: `"${event.type}" is not allowed at stage "${track.stage}"`}});
      continue;
    }
    track.events.push(event);
    if (event.type === "question_asked") track.openQuestions += 1;
    if (event.type === "question_answered") track.openQuestions = Math.max(0, track.openQuestions - 1);
    if (event.type === "indication_received" && event.indication) track.latestIndication = event.indication;
    const next = stageAfter[event.type];
    if (next) track.stage = next;
  }
  return [...tracks.values()];
}

/** The trail as a company or a regulator reads it: who saw what, when. */
export function auditTrail(tracks: readonly InvestorTrack[], investors: readonly Investor[]): Array<{at: string; investor: string; actor: string; what: {pt: string; en: string}}> {
  const names = new Map(investors.map((investor) => [investor.id, investor.name]));
  const what: Record<SoundingEventType, {pt: string; en: string}> = {
    listed: {pt: "incluído na lista", en: "added to the list"},
    teaser_sent: {pt: "recebeu o teaser", en: "received the teaser"},
    nda_signed: {pt: "assinou o NDA", en: "signed the NDA"},
    room_opened: {pt: "teve a sala liberada", en: "was given access to the room"},
    question_asked: {pt: "fez uma pergunta", en: "asked a question"},
    question_answered: {pt: "recebeu resposta", en: "received an answer"},
    indication_received: {pt: "enviou indicação", en: "sent an indication"},
    declined: {pt: "declinou", en: "declined"},
    allocated: {pt: "foi alocado", en: "was allocated"},
    dropped: {pt: "foi retirado da lista", en: "was removed from the list"},
  };
  return tracks
    .flatMap((track) => track.events.map((event) => ({at: event.at, investor: names.get(track.investorId) ?? track.investorId, actor: event.actor, what: what[event.type]})))
    .sort((a, b) => a.at.localeCompare(b.at));
}
