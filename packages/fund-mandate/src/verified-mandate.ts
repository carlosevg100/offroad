import {z} from "zod";

/**
 * The verified mandate record: what a financier says it wants today, and who confirmed it.
 *
 * `mandate.ts` models a criterion as several dated observations from sources that may disagree.
 * That is the right shape for research about a fund we have only mapped. It is the wrong shape
 * for the record a fund keeps about itself here, which has to answer a narrower and harder
 * question: **is this current, and did they say so?**
 *
 * So this record is deliberately flat and singular. One currency, one ticket range, one set of
 * instruments, one validity window, one status. The plurality lives where it belongs: in the
 * confirmation events, which accumulate and are never rewritten, so "confirmed in March, renewed
 * in September by telephone" stays readable a year later.
 *
 * The status is the whole point of the separation. A public filing and a deal from two years ago
 * are evidence about a fund; neither is an assertion that the fund wants a transaction this
 * quarter. Only a confirmation event is, and only inside its window.
 */

export const verifiedMandateStatusSchema = z.enum(["draft", "confirmed", "expired", "withdrawn"]);
export type VerifiedMandateStatus = z.infer<typeof verifiedMandateStatusSchema>;

/**
 * How a mandate was confirmed. Three channels, and the difference between them matters enough to
 * be shown next to every candidate:
 *
 * - `direct_declaration` — the organization stated it here, signed in as itself.
 * - `official_document` — it rests on a document somebody can open and check.
 * - `recorded_contact` — Offroad spoke to them, and the conversation has a date and a record id.
 *
 * What is not a channel: a public registration, a filing, or a transaction they did. Those are
 * research, they live in the directory, and no amount of them adds up to current interest.
 */
export const mandateConfirmationChannelSchema = z.enum([
  "direct_declaration",
  "official_document",
  "recorded_contact",
]);
export type MandateConfirmationChannel = z.infer<typeof mandateConfirmationChannelSchema>;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const isoTimestamp = z.string().min(1);

/** The summary that travels with a candidate so the fit can name its version and its date. */
export const verifiedMandateRecordSchema = z.object({
  versionNumber: z.number().int().positive(),
  status: verifiedMandateStatusSchema,
  /** The status with the validity window applied at the date the question was asked. */
  effectiveStatus: verifiedMandateStatusSchema,
  validFrom: isoDate,
  validUntil: isoDate.nullable(),
  confirmedAt: isoTimestamp.nullable(),
  channel: mandateConfirmationChannelSchema.nullable(),
  confirmationCount: z.number().int().nonnegative(),
}).strict();
export type VerifiedMandateRecord = z.infer<typeof verifiedMandateRecordSchema>;

/**
 * Whether a record still speaks for the fund, and how loudly.
 *
 * `due_soon` exists so the surface can ask for a renewal before the window shuts rather than
 * after, because the alternative is a mandate that silently stops matching on a Tuesday and a
 * relationship manager who finds out from a company asking why the list got shorter.
 *
 * A record with no end date still ages. A fund that confirmed its box once and has not been
 * asked since is not more current for having left the field blank, so an open window is treated
 * as due for renewal after `openWindowDueAfterDays`. Nothing here contacts anybody: the state is
 * a label on a screen and the renewal is somebody deciding to ask.
 */
export type MandateRenewalState = "current" | "due_soon" | "expired" | "withdrawn" | "unconfirmed";

export type RenewalOptions = {
  /** Days before `validUntil` at which the surface starts asking. */
  dueWithinDays?: number;
  /** Days after which a confirmation with no end date is due for a refresh. */
  openWindowDueAfterDays?: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole days from `from` to `to`, negative when `to` is earlier. Dates only, no clock drift. */
export function daysBetween(from: string, to: string): number {
  const start = Date.parse(`${from.slice(0, 10)}T00:00:00Z`);
  const end = Date.parse(`${to.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.round((end - start) / DAY_MS);
}

export function mandateRenewalState(
  record: VerifiedMandateRecord,
  asOf: string,
  options: RenewalOptions = {},
): MandateRenewalState {
  const dueWithinDays = options.dueWithinDays ?? 30;
  const openWindowDueAfterDays = options.openWindowDueAfterDays ?? 365;
  if (record.effectiveStatus === "withdrawn") return "withdrawn";
  if (record.effectiveStatus === "expired") return "expired";
  if (record.effectiveStatus !== "confirmed" || !record.confirmedAt) return "unconfirmed";
  if (record.validUntil !== null) {
    return daysBetween(asOf, record.validUntil) <= dueWithinDays ? "due_soon" : "current";
  }
  return daysBetween(record.confirmedAt, asOf) >= openWindowDueAfterDays ? "due_soon" : "current";
}

/** True when a record may be used as a current mandate. Nothing else counts as confirmed. */
export function isCurrentMandate(record: VerifiedMandateRecord | null): boolean {
  return record !== null && record.effectiveStatus === "confirmed" && record.confirmedAt !== null;
}
