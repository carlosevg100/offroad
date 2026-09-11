import {
  collateralKindSchema,
  instrumentSchema,
  mandateConfirmationChannelSchema,
  mandateRenewalState,
  verifiedMandateStatusSchema,
  type MandateRenewalState,
} from "@offroad/fund-mandate";
import {z} from "zod";

/**
 * What `/app/mandates` reads, and the only shape the panel trusts.
 *
 * The listing comes from `list_provider_mandates_v1`, which already applies the validity window,
 * so `effectiveStatus` is the answer and `status` is the stored value kept beside it. Parsing
 * here rather than casting means a schema drift shows up as an empty panel with a reason, not as
 * a screen quietly claiming a fund is taking deals when the record says otherwise.
 */

const decimalText = z.string().regex(/^-?\d+(\.\d+)?$/);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const providerMandateSourceSchema = z.object({
  kind: z.string().min(1).max(100).optional(),
  reference: z.string().min(1).max(500).optional(),
  note: z.string().min(1).max(1000).optional(),
}).loose();

export const providerMandateConfirmationSchema = z.object({
  channel: mandateConfirmationChannelSchema,
  confirmedAt: z.string().min(1),
  documentReference: z.string().nullable(),
  contactRecordId: z.string().nullable(),
  contactDate: isoDate.nullable(),
  validFrom: isoDate,
  validUntil: isoDate.nullable(),
}).strict();

export const providerMandateSchema = z.object({
  id: z.uuid(),
  fundId: z.uuid(),
  fundName: z.string().min(1),
  fundStrategy: z.string().min(1),
  versionNumber: z.number().int().positive(),
  status: verifiedMandateStatusSchema,
  effectiveStatus: verifiedMandateStatusSchema,
  currency: z.enum(["BRL", "USD", "EUR"]),
  ticketMin: decimalText,
  ticketMax: decimalText,
  instruments: z.array(instrumentSchema),
  sectors: z.array(z.string().min(1)),
  geographies: z.array(z.string().min(1)),
  collateral: z.array(collateralKindSchema),
  termMonthsMin: z.number().int().nullable(),
  termMonthsMax: z.number().int().nullable(),
  leverageCeiling: decimalText.nullable(),
  minimumDscr: decimalText.nullable(),
  acceptingNewTransactions: z.boolean(),
  validFrom: isoDate,
  validUntil: isoDate.nullable(),
  sources: z.array(providerMandateSourceSchema),
  confirmedAt: z.string().min(1).nullable(),
  withdrawnAt: z.string().min(1).nullable(),
  note: z.string().nullable(),
  lastConfirmation: providerMandateConfirmationSchema.nullable(),
  confirmationCount: z.number().int().nonnegative(),
}).strict();

export type ProviderMandate = z.infer<typeof providerMandateSchema>;

export function readProviderMandates(value: unknown): ProviderMandate[] {
  const parsed = z.array(providerMandateSchema).safeParse(value);
  return parsed.success ? parsed.data : [];
}

/** One fund, its newest mandate version, and the older versions kept for the record. */
export type MandateFund = {
  fundId: string;
  fundName: string;
  fundStrategy: string;
  current: ProviderMandate;
  history: ProviderMandate[];
  renewal: MandateRenewalState;
};

/**
 * Groups versions by fund and names the one matching would read.
 *
 * The newest version wins, draft included. A fund that started describing new terms is not still
 * offering the old ones, and the panel has to say so plainly rather than keep showing a
 * confirmation that no longer describes the box.
 */
export function groupMandatesByFund(mandates: readonly ProviderMandate[], asOf: string): MandateFund[] {
  const byFund = new Map<string, ProviderMandate[]>();
  for (const mandate of mandates) {
    const existing = byFund.get(mandate.fundId);
    if (existing) existing.push(mandate);
    else byFund.set(mandate.fundId, [mandate]);
  }
  return [...byFund.values()]
    .map((versions) => {
      const ordered = [...versions].sort((left, right) => right.versionNumber - left.versionNumber);
      const current = ordered[0]!;
      return {
        fundId: current.fundId,
        fundName: current.fundName,
        fundStrategy: current.fundStrategy,
        current,
        history: ordered.slice(1),
        renewal: mandateRenewalState({
          versionNumber: current.versionNumber,
          status: current.status,
          effectiveStatus: current.effectiveStatus,
          validFrom: current.validFrom,
          validUntil: current.validUntil,
          confirmedAt: current.confirmedAt,
          channel: current.lastConfirmation?.channel ?? null,
          confirmationCount: current.confirmationCount,
        }, asOf),
      };
    })
    .sort((left, right) => left.fundName.localeCompare(right.fundName));
}

/** Funds whose record is what a case fit would read as a current mandate. */
export function currentMandateCount(funds: readonly MandateFund[]): number {
  return funds.filter((fund) => fund.current.effectiveStatus === "confirmed").length;
}

/** Funds the panel is asking somebody to renew or confirm. No outreach follows from this. */
export function attentionCount(funds: readonly MandateFund[]): number {
  return funds.filter((fund) => fund.renewal === "due_soon" || fund.renewal === "expired" || fund.renewal === "unconfirmed").length;
}
