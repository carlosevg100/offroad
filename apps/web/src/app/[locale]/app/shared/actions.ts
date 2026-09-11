"use server";

import {revalidatePath} from "next/cache";
import {z} from "zod";

import {routing, type AppLocale} from "@/i18n/routing";
import {requireWorkspace} from "@/lib/auth/workspace";
import type {Json} from "@/types/database";

export type SharedPackResponseState = {
  ok: boolean;
  code?: "invalid" | "unavailable" | "content" | "save";
};

const localeOf = (value: FormDataEntryValue | null): AppLocale => (
  routing.locales.includes(String(value ?? "") as AppLocale)
    ? String(value) as AppLocale
    : routing.defaultLocale
);

function field(formData: FormData, key: string): string {
  const entry = formData.get(key);
  return typeof entry === "string" ? entry.trim() : "";
}

function codes(formData: FormData, key: string): Array<{code: string}> {
  return [...new Set(formData.getAll(key)
    .flatMap((entry) => (typeof entry === "string" && entry.trim() ? [entry.trim()] : [])))]
    .map((code) => ({code}));
}

const responseSchema = z.object({
  shareId: z.uuid(),
  responseState: z.enum(["interested", "needs_information", "declined", "no_response_yet"]),
  note: z.string().trim().min(3).max(4000).optional(),
  ticketAmount: z.string().regex(/^(0|[1-9]\d*)(\.\d{1,2})?$/).optional(),
  ticketCurrency: z.enum(["BRL", "USD", "EUR"]).optional(),
  tenorMonths: z.coerce.number().int().min(1).max(600).optional(),
  pricingBasis: z.string().regex(/^[a-z][a-z0-9_]{1,60}$/).optional(),
  pricingMin: z.string().regex(/^(0|[1-9]\d*)(\.\d{1,4})?$/).optional(),
  pricingMax: z.string().regex(/^(0|[1-9]\d*)(\.\d{1,4})?$/).optional(),
  requestedConditions: z.array(z.object({code: z.string().regex(/^[a-z][a-z0-9_]{1,63}$/)})).max(20),
  termObjections: z.array(z.object({code: z.string().regex(/^[a-z][a-z0-9_]{1,63}$/)})).max(20),
  supersedesResponseId: z.uuid().optional(),
});

/**
 * The recipient organization records its own answer about the pack it can open. Interest, a
 * request for information, a decline or silence: none of them is an approval or a commitment.
 */
export async function recordSharedPackResponse(
  _previous: SharedPackResponseState,
  formData: FormData,
): Promise<SharedPackResponseState> {
  void _previous;
  const locale = localeOf(formData.get("locale"));
  const amount = field(formData, "ticket_amount");
  const pricingMin = field(formData, "pricing_min");
  const parsed = responseSchema.safeParse({
    shareId: field(formData, "share_id"),
    responseState: field(formData, "response_state"),
    note: field(formData, "note") || undefined,
    ticketAmount: amount || undefined,
    ticketCurrency: amount ? (field(formData, "ticket_currency") || "BRL") : undefined,
    tenorMonths: field(formData, "tenor_months") || undefined,
    pricingBasis: pricingMin ? (field(formData, "pricing_basis") || undefined) : undefined,
    pricingMin: pricingMin || undefined,
    pricingMax: field(formData, "pricing_max") || undefined,
    requestedConditions: codes(formData, "requested_condition"),
    termObjections: codes(formData, "term_objection"),
    supersedesResponseId: field(formData, "supersedes_response_id") || undefined,
  });
  if (!parsed.success) return {ok: false, code: "invalid"};
  if (parsed.data.responseState === "declined"
    && !parsed.data.note && parsed.data.termObjections.length === 0) {
    return {ok: false, code: "content"};
  }
  if (parsed.data.responseState === "no_response_yet"
    && (parsed.data.note || parsed.data.ticketAmount || parsed.data.tenorMonths || parsed.data.pricingMin
      || parsed.data.requestedConditions.length > 0 || parsed.data.termObjections.length > 0)) {
    return {ok: false, code: "content"};
  }

  const {supabase} = await requireWorkspace(locale);
  const {error} = await supabase.rpc("record_pack_recipient_response", {
    p_share_id: parsed.data.shareId,
    p_response_state: parsed.data.responseState,
    ...(parsed.data.note ? {p_note: parsed.data.note} : {}),
    ...(parsed.data.ticketAmount ? {p_ticket_amount: Number(parsed.data.ticketAmount)} : {}),
    ...(parsed.data.ticketCurrency ? {p_ticket_currency: parsed.data.ticketCurrency} : {}),
    ...(parsed.data.tenorMonths ? {p_tenor_months: parsed.data.tenorMonths} : {}),
    ...(parsed.data.pricingBasis ? {p_pricing_basis: parsed.data.pricingBasis} : {}),
    ...(parsed.data.pricingMin ? {p_pricing_min: Number(parsed.data.pricingMin)} : {}),
    ...(parsed.data.pricingMax ? {p_pricing_max: Number(parsed.data.pricingMax)} : {}),
    p_requested_conditions: parsed.data.requestedConditions as unknown as Json,
    p_term_objections: parsed.data.termObjections as unknown as Json,
    ...(parsed.data.supersedesResponseId ? {p_supersedes_response_id: parsed.data.supersedesResponseId} : {}),
  });
  revalidatePath(`/${locale}/app/shared/${parsed.data.shareId}`);
  revalidatePath(`/${locale}/app/shared`);
  if (!error) return {ok: true};
  if (error.code === "42501") return {ok: false, code: "unavailable"};
  if (error.message.includes("check constraint")) return {ok: false, code: "content"};
  return {ok: false, code: "save"};
}
