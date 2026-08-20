import {collateralKindSchema, instrumentSchema, type CollateralKind, type Instrument} from "@offroad/fund-mandate";
import type {SupabaseClient} from "@supabase/supabase-js";
import {z} from "zod";

import type {Database} from "@/types/database";

/**
 * The six facts that decide who could buy the paper.
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
  requestedAmount?: string;
  requestedTermMonths?: number;
  requestedGraceMonths?: number;
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
  amount: z.string().default(""),
  term_months: optionalInt(1, 360),
  grace_months: optionalInt(0, 120),
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
    ...(amount ? {requestedAmount: amount} : {}),
    ...(input.term_months !== undefined ? {requestedTermMonths: input.term_months} : {}),
    ...(input.grace_months !== undefined ? {requestedGraceMonths: input.grace_months} : {}),
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
  "requested_amount" | "requested_term_months" | "requested_grace_months" | "sector" | "geography" | "instruments" | "collateral_kinds" | "expected_rate"
>): DealBrief {
  return {
    ...(session.requested_amount !== null ? {requestedAmount: String(session.requested_amount)} : {}),
    ...(session.requested_term_months !== null ? {requestedTermMonths: session.requested_term_months} : {}),
    ...(session.requested_grace_months !== null ? {requestedGraceMonths: session.requested_grace_months} : {}),
    ...(session.sector ? {sector: session.sector} : {}),
    ...(session.geography ? {geography: session.geography} : {}),
    ...(session.instruments?.length ? {instruments: session.instruments as Instrument[]} : {}),
    ...(session.collateral_kinds?.length ? {collateralKinds: session.collateral_kinds as CollateralKind[]} : {}),
    ...(session.expected_rate ? {expectedRate: session.expected_rate} : {}),
  };
}

/**
 * How much of the brief is answered, and which of the six still decide the buyer set.
 *
 * Grace is excluded from the count: it shapes the structure, never who is eligible to hold it.
 */
export const BRIEF_FIELDS = ["requestedAmount", "requestedTermMonths", "sector", "geography", "instruments", "collateralKinds"] as const;

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
  const {error} = await input.supabase
    .from("document_intake_sessions")
    .update({
      requested_amount: input.brief.requestedAmount ? Number(input.brief.requestedAmount) : null,
      requested_term_months: input.brief.requestedTermMonths ?? null,
      requested_grace_months: input.brief.requestedGraceMonths ?? null,
      sector: input.brief.sector ?? null,
      geography: input.brief.geography ?? null,
      instruments: input.brief.instruments ?? null,
      collateral_kinds: input.brief.collateralKinds ?? null,
      expected_rate: input.brief.expectedRate ?? null,
    })
    .eq("organization_id", input.organizationId)
    .eq("id", input.sessionId);

  return error ? {ok: false} : {ok: true};
}
