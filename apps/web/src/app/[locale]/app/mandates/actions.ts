"use server";

import {collateralKindSchema, instrumentSchema, mandateConfirmationChannelSchema} from "@offroad/fund-mandate";
import {revalidatePath} from "next/cache";
import {z} from "zod";

import {requireWorkspace} from "@/lib/auth/workspace";
import {hasWorkspaceCapability} from "@/lib/workspace/capabilities";

/**
 * Registering, confirming and withdrawing a mandate.
 *
 * Every action derives the organization from the session and never from the form, and every
 * refusal is the database's: the commands check membership, the workspace capability and the
 * record's own state before they write. What this file adds is the shape check, so a malformed
 * ticket range comes back as a message on the form instead of a constraint violation.
 */

export type MandateActionResult =
  | {ok: true}
  | {ok: false; error: "invalid" | "denied" | "not_found" | "conflict" | "save"};

const localeSchema = z.enum(["pt-BR", "en-US"]);
const decimal = z.string().regex(/^(0|[1-9][0-9]{0,17})(\.[0-9]{1,2})?$/);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const label = z.string().trim().min(1).max(200);

const mandateShape = z.object({
  currency: z.enum(["BRL", "USD", "EUR"]),
  ticketMin: decimal,
  ticketMax: decimal,
  instruments: z.array(instrumentSchema).min(1).max(10),
  sectors: z.array(label).max(40).default([]),
  geographies: z.array(label).max(40).default([]),
  collateral: z.array(collateralKindSchema).max(9).default([]),
  termMonthsMin: z.number().int().min(1).max(1200).nullable().default(null),
  termMonthsMax: z.number().int().min(1).max(1200).nullable().default(null),
  leverageCeiling: decimal.nullable().default(null),
  minimumDscr: decimal.nullable().default(null),
  acceptingNewTransactions: z.boolean().default(true),
  validFrom: isoDate,
  validUntil: isoDate.nullable().default(null),
  note: z.string().trim().max(2000).nullable().default(null),
}).strict()
  .refine((value) => Number(value.ticketMax) >= Number(value.ticketMin), {path: ["ticketMax"]})
  .refine((value) => (value.termMonthsMin === null) === (value.termMonthsMax === null), {path: ["termMonthsMax"]})
  .refine((value) => value.termMonthsMin === null || value.termMonthsMax === null || value.termMonthsMax >= value.termMonthsMin, {path: ["termMonthsMax"]})
  .refine((value) => value.validUntil === null || value.validUntil >= value.validFrom, {path: ["validUntil"]});

const registerSchema = z.object({
  locale: localeSchema,
  fundId: z.uuid().nullable().default(null),
  fundName: z.string().trim().min(2).max(200).nullable().default(null),
  fundStrategy: z.string().trim().min(2).max(200).nullable().default(null),
  mandate: mandateShape,
}).strict().refine(
  (value) => value.fundId !== null || (value.fundName !== null && value.fundStrategy !== null),
  {path: ["fundName"]},
);

/**
 * Confirmation takes the evidence its channel requires and nothing else.
 *
 * A declaration carries no document and no contact, because a form that lets somebody attach a
 * filing to a "we declared it ourselves" event is a form that turns research into confirmation
 * by accident. The database refuses the same combinations; this only says so earlier.
 */
const confirmSchema = z.discriminatedUnion("channel", [
  z.object({
    channel: z.literal("direct_declaration"),
    locale: localeSchema,
    mandateId: z.uuid(),
    validFrom: isoDate,
    validUntil: isoDate.nullable().default(null),
    note: z.string().trim().max(2000).nullable().default(null),
  }).strict(),
  z.object({
    channel: z.literal("official_document"),
    locale: localeSchema,
    mandateId: z.uuid(),
    validFrom: isoDate,
    validUntil: isoDate.nullable().default(null),
    documentReference: z.string().trim().min(1).max(500),
    note: z.string().trim().max(2000).nullable().default(null),
  }).strict(),
  z.object({
    channel: z.literal("recorded_contact"),
    locale: localeSchema,
    mandateId: z.uuid(),
    validFrom: isoDate,
    validUntil: isoDate.nullable().default(null),
    contactRecordId: z.uuid(),
    contactDate: isoDate,
    note: z.string().trim().max(2000).nullable().default(null),
  }).strict(),
]);

const withdrawSchema = z.object({
  locale: localeSchema,
  mandateId: z.uuid(),
  note: z.string().trim().max(2000).nullable().default(null),
}).strict();

function mandateError(error: {code?: string} | null): MandateActionResult {
  if (error?.code === "P0002") return {ok: false, error: "not_found"};
  if (error?.code === "42501") return {ok: false, error: "denied"};
  if (error?.code === "40001") return {ok: false, error: "conflict"};
  if (error?.code === "22023" || error?.code === "23514" || error?.code === "23505") return {ok: false, error: "invalid"};
  return {ok: false, error: "save"};
}

async function workspaceForMandates(locale: "pt-BR" | "en-US") {
  const {supabase, organization} = await requireWorkspace(locale);
  return hasWorkspaceCapability(organization.organization_type, "mandate_management")
    ? {supabase, organization}
    : null;
}

export async function registerProviderMandate(input: unknown): Promise<MandateActionResult> {
  const parsed = registerSchema.safeParse(input);
  if (!parsed.success) return {ok: false, error: "invalid"};
  const workspace = await workspaceForMandates(parsed.data.locale);
  if (!workspace) return {ok: false, error: "denied"};
  const {mandate} = parsed.data;
  const {error} = await workspace.supabase.rpc("register_provider_mandate_v1", {
    p_organization_id: workspace.organization.id,
    // The generated client types mark defaulted arguments optional; the database default for
    // each of them is null, so omitting and passing null are the same call.
    p_fund_id: parsed.data.fundId ?? undefined,
    p_fund_name: parsed.data.fundName ?? undefined,
    p_fund_strategy: parsed.data.fundStrategy ?? undefined,
    p_mandate: {
      currency: mandate.currency,
      ticketMin: mandate.ticketMin,
      ticketMax: mandate.ticketMax,
      instruments: mandate.instruments,
      sectors: mandate.sectors,
      geographies: mandate.geographies,
      collateral: mandate.collateral,
      termMonthsMin: mandate.termMonthsMin,
      termMonthsMax: mandate.termMonthsMax,
      leverageCeiling: mandate.leverageCeiling,
      minimumDscr: mandate.minimumDscr,
      acceptingNewTransactions: mandate.acceptingNewTransactions,
      validFrom: mandate.validFrom,
      validUntil: mandate.validUntil,
      note: mandate.note,
      sources: [],
    },
  });
  if (error) return mandateError(error);
  revalidatePath(`/${parsed.data.locale}/app/mandates`);
  return {ok: true};
}

export async function confirmProviderMandate(input: unknown): Promise<MandateActionResult> {
  const parsed = confirmSchema.safeParse(input);
  if (!parsed.success) return {ok: false, error: "invalid"};
  const value = parsed.data;
  if (value.validUntil !== null && value.validUntil < value.validFrom) return {ok: false, error: "invalid"};
  const workspace = await workspaceForMandates(value.locale);
  if (!workspace) return {ok: false, error: "denied"};
  const {error} = await workspace.supabase.rpc("confirm_provider_mandate_v1", {
    p_organization_id: workspace.organization.id,
    p_mandate_id: value.mandateId,
    p_channel: mandateConfirmationChannelSchema.parse(value.channel),
    p_valid_from: value.validFrom,
    p_valid_until: value.validUntil ?? undefined,
    p_document_reference: value.channel === "official_document" ? value.documentReference : undefined,
    p_contact_record_id: value.channel === "recorded_contact" ? value.contactRecordId : undefined,
    p_contact_date: value.channel === "recorded_contact" ? value.contactDate : undefined,
    p_note: value.note ?? undefined,
  });
  if (error) return mandateError(error);
  revalidatePath(`/${value.locale}/app/mandates`);
  return {ok: true};
}

export async function withdrawProviderMandate(input: unknown): Promise<MandateActionResult> {
  const parsed = withdrawSchema.safeParse(input);
  if (!parsed.success) return {ok: false, error: "invalid"};
  const workspace = await workspaceForMandates(parsed.data.locale);
  if (!workspace) return {ok: false, error: "denied"};
  const {error} = await workspace.supabase.rpc("withdraw_provider_mandate_v1", {
    p_organization_id: workspace.organization.id,
    p_mandate_id: parsed.data.mandateId,
    p_note: parsed.data.note ?? undefined,
  });
  if (error) return mandateError(error);
  revalidatePath(`/${parsed.data.locale}/app/mandates`);
  return {ok: true};
}
