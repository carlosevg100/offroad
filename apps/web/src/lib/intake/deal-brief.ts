import {randomUUID} from "node:crypto";

import {collateralKindSchema, instrumentSchema, type CollateralKind, type Instrument} from "@offroad/fund-mandate";
import type {SupabaseClient} from "@supabase/supabase-js";
import {z} from "zod";

import type {Database} from "@/types/database";
import {reportServerFailure} from "@/lib/observability/report";

import {prepareIntakeRequestLadders} from "./replay";

/**
 * The capital-need facts that shape preparation and market fit.
 *
 * The archetype already says what the money is for, which drives the checklist. It says nothing
 * about who would fund it. Amount, tenor, sector, geography, the instruments the operation could
 * take and what the company can pledge are what turn "here is a company that wants money" into
 * "here are the desks that write this kind of cheque" — and every one of them is knowable from a
 * conversation, before a single document exists.
 *
 * Every field is optional at every layer: the type, the parser, the columns. A brief is filled in
 * across a conversation and often by someone who does not yet know the answer to half of it, and
 * a form that refuses to save until it is complete is a form people abandon. What partial costs
 * is precision in the answer, not the ability to give one.
 */

export type DealBrief = {
  objective?: string;
  requestedAmount?: string;
  currency?: "BRL" | "USD" | "EUR";
  urgency?: "up_to_3_months" | "3_to_6_months" | "6_to_12_months" | "no_rush";
  requestedTermMonths?: number;
  requestedGraceMonths?: number;
  consequenceIfNotExecuted?: string;
  sector?: string;
  geography?: string;
  instruments?: Instrument[];
  collateralKinds?: CollateralKind[];
  /** The cost hoped for, in the company's own words. Answered, never countered with a guess. */
  expectedRate?: string;
};

/**
 * Parses a Brazilian-formatted amount.
 *
 * People type "45.000.000", "45000000", "R$ 45 milhões" and "45,5" for the same intention, and a
 * parser that accepts only one of them makes the first field of the first screen the place where
 * users give up. Thousands separators are dots, the decimal separator is a comma, and a magnitude
 * word may follow.
 *
 * The magnitude words are recognised **explicitly and exhaustively**, and anything else with
 * letters in it is refused. That asymmetry is deliberate. A parser that strips non-digits reads
 * "mais ou menos 40" as R$ 40,00 — a request that will match no fund on earth, for a reason
 * nobody looking at the screen could ever see. It is the same failure the extraction ledger
 * classifies as a scale error, arriving through the front door: a number wrong by six orders of
 * magnitude, held with complete confidence. Refusing is loud and recoverable; guessing is silent
 * and is not.
 */
const MAGNITUDES: ReadonlyArray<[RegExp, number]> = [
  [/\bbilh(?:ao|ão|oes|ões)\b/, 1_000_000_000],
  [/\bbi\b/, 1_000_000_000],
  [/\bmilh(?:ao|ão|oes|ões)\b/, 1_000_000],
  [/\bmi\b/, 1_000_000],
  [/\bmil\b/, 1_000],
];

export function parseAmount(raw: string): string | null {
  // Accents are folded first so "milhões" and "milhoes" are one case rather than two.
  const folded = raw.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  // Currency marks are noise, never meaning.
  let rest = folded.replace(/r\$|reais/g, " ");

  let multiplier = 1;
  for (const [pattern, factor] of MAGNITUDES) {
    if (pattern.test(rest)) {
      multiplier = factor;
      rest = rest.replace(pattern, " ");
      break;
    }
  }

  // Anything still carrying letters is a sentence, not an amount. "uns quarenta", "cerca de 40" —
  // all of them have a magnitude the writer knows and we would be inventing.
  if (/[a-z]/.test(rest)) return null;

  const cleaned = rest.replace(/[^\d.,]/g, "").trim();
  if (!cleaned) return null;

  const lastComma = cleaned.lastIndexOf(",");
  const normalized =
    lastComma >= 0
      ? `${cleaned.slice(0, lastComma).replace(/[.,]/g, "")}.${cleaned.slice(lastComma + 1).replace(/[^\d]/g, "")}`
      : cleaned.replace(/\./g, "");

  const value = Number(normalized) * multiplier;
  if (!Number.isFinite(value) || value <= 0) return null;
  return value.toFixed(2);
}

const optionalInt = (min: number, max: number) =>
  z
    .string()
    .trim()
    .transform((value) => (value === "" ? undefined : Number(value.replace(/[^\d]/g, ""))))
    .refine((value) => value === undefined || (Number.isInteger(value) && value >= min && value <= max), {
      message: "out_of_range",
    });

/**
 * Reads a brief off a form.
 *
 * Returns `null` only when a value was supplied and is invalid — an empty field is a legitimate
 * "not yet", not an error, and treating the two the same is how a form starts scolding people for
 * things they were never asked to know.
 */
export const dealBriefFormSchema = z.object({
  objective: z.string().trim().max(4000).default(""),
  amount: z.string().default(""),
  currency: z.enum(["BRL", "USD", "EUR"]).optional(),
  urgency: z.enum(["up_to_3_months", "3_to_6_months", "6_to_12_months", "no_rush"]).optional(),
  term_months: optionalInt(1, 360),
  grace_months: optionalInt(0, 120),
  consequence: z.string().trim().max(4000).default(""),
  sector: z.string().trim().max(120).default(""),
  geography: z
    .string()
    .trim()
    .toUpperCase()
    .default("")
    .refine((value) => value === "" || /^[A-Z]{2}$/.test(value), {message: "invalid_uf"}),
  instruments: z.array(instrumentSchema).default([]),
  collateral_kinds: z.array(collateralKindSchema).default([]),
  expected_rate: z.string().trim().max(80).default(""),
});

export type DealBriefInput = z.infer<typeof dealBriefFormSchema>;

export function toDealBrief(input: DealBriefInput): DealBrief | null {
  const amount = input.amount.trim() === "" ? undefined : parseAmount(input.amount);
  // A number that was typed and could not be read is the one case worth refusing: saving it as
  // absent would silently discard something the company believes it told us.
  if (input.amount.trim() !== "" && amount === null) return null;

  // Grace longer than the facility is a contradiction, and the database refuses it anyway. Saying
  // so here turns a 500 into a sentence.
  if (
    input.grace_months !== undefined &&
    input.term_months !== undefined &&
    input.grace_months >= input.term_months
  ) {
    return null;
  }

  return {
    ...(input.objective ? {objective: input.objective} : {}),
    ...(amount ? {requestedAmount: amount} : {}),
    ...(amount && input.currency ? {currency: input.currency} : {}),
    ...(input.urgency ? {urgency: input.urgency} : {}),
    ...(input.term_months !== undefined ? {requestedTermMonths: input.term_months} : {}),
    ...(input.grace_months !== undefined ? {requestedGraceMonths: input.grace_months} : {}),
    ...(input.consequence ? {consequenceIfNotExecuted: input.consequence} : {}),
    ...(input.sector ? {sector: input.sector} : {}),
    ...(input.geography ? {geography: input.geography} : {}),
    ...(input.instruments.length > 0 ? {instruments: input.instruments} : {}),
    ...(input.collateral_kinds.length > 0 ? {collateralKinds: input.collateral_kinds} : {}),
    ...(input.expected_rate ? {expectedRate: input.expected_rate} : {}),
  };
}

type SessionRow = Database["public"]["Tables"]["document_intake_sessions"]["Row"];

/** Reads the brief back off a session row, in the shape the fit assessment consumes. */
export function dealBriefOf(session: Pick<
  SessionRow,
  "capital_objective" | "capital_currency" | "capital_urgency" | "capital_consequence" |
  "requested_amount" | "requested_term_months" | "requested_grace_months" | "sector" |
  "geography" | "instruments" | "collateral_kinds" | "expected_rate"
>): DealBrief {
  return {
    ...(session.capital_objective ? {objective: session.capital_objective} : {}),
    ...(session.requested_amount !== null ? {requestedAmount: String(session.requested_amount)} : {}),
    ...(session.capital_currency ? {currency: session.capital_currency as DealBrief["currency"]} : {}),
    ...(session.capital_urgency ? {urgency: session.capital_urgency as DealBrief["urgency"]} : {}),
    ...(session.requested_term_months !== null ? {requestedTermMonths: session.requested_term_months} : {}),
    ...(session.requested_grace_months !== null ? {requestedGraceMonths: session.requested_grace_months} : {}),
    ...(session.capital_consequence ? {consequenceIfNotExecuted: session.capital_consequence} : {}),
    ...(session.sector ? {sector: session.sector} : {}),
    ...(session.geography ? {geography: session.geography} : {}),
    ...(session.instruments?.length ? {instruments: session.instruments as Instrument[]} : {}),
    ...(session.collateral_kinds?.length ? {collateralKinds: session.collateral_kinds as CollateralKind[]} : {}),
    ...(session.expected_rate ? {expectedRate: session.expected_rate} : {}),
  };
}

/**
 * How much of the brief is answered, including the declared purpose and the fit dimensions.
 *
 * Grace is excluded from the count: it shapes the structure, never who is eligible to hold it.
 */
export const BRIEF_FIELDS = [
  "objective", "requestedAmount", "urgency", "requestedTermMonths", "consequenceIfNotExecuted",
  "sector", "geography", "instruments", "collateralKinds",
] as const;

export function briefCompleteness(brief: DealBrief): {answered: number; total: number; missing: string[]} {
  const missing = BRIEF_FIELDS.filter((field) => {
    const value = brief[field];
    return value === undefined || (Array.isArray(value) && value.length === 0);
  });
  return {answered: BRIEF_FIELDS.length - missing.length, total: BRIEF_FIELDS.length, missing};
}

export async function saveDealBrief(input: {
  supabase: SupabaseClient<Database>;
  organizationId: string;
  sessionId: string;
  brief: DealBrief;
}): Promise<{ok: true} | {ok: false}> {
  const {data: session, error: sessionError} = await input.supabase
    .from("document_intake_sessions")
    .select("archetype")
    .eq("organization_id", input.organizationId)
    .eq("id", input.sessionId)
    .maybeSingle();
  if (sessionError || !session?.archetype) return {ok: false};

  const {error} = await input.supabase.rpc("record_intake_capital_need_command", {
    p_organization_id: input.organizationId,
    p_session_id: input.sessionId,
    p_event_id: randomUUID(),
    p_use_of_proceeds: session.archetype,
    p_objective: input.brief.objective,
    p_requested_amount: input.brief.requestedAmount ? Number(input.brief.requestedAmount) : undefined,
    p_currency: input.brief.currency,
    p_urgency: input.brief.urgency,
    p_requested_term_months: input.brief.requestedTermMonths,
    p_requested_grace_months: input.brief.requestedGraceMonths,
    p_consequence: input.brief.consequenceIfNotExecuted,
    p_sector: input.brief.sector,
    p_geography: input.brief.geography,
    p_instruments: input.brief.instruments ?? [],
    p_collateral_kinds: input.brief.collateralKinds ?? [],
    p_expected_rate: input.brief.expectedRate,
  });

  if (error) return {ok: false};
  try {
    await prepareIntakeRequestLadders(input);
  } catch (ladderError) {
    // The capital need is already committed. Do not tell the user that save failed because a
    // derived request projection could not refresh; report it and allow the next command or
    // worker pass to retry safely.
    reportServerFailure({
      step: "intake.prepare_request_ladders",
      error: {message: ladderError instanceof Error ? ladderError.message : "request ladder refresh failed"},
    });
  }
  return {ok: true};
}
