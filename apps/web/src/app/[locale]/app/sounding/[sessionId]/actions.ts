"use server";

import {redirect} from "next/navigation";

import type {InvestorKind} from "@offroad/investor-base";
import type {Indication, SoundingEventType} from "@offroad/sounding";

import {routing, type AppLocale} from "@/i18n/routing";
import {requireWorkspace} from "@/lib/auth/workspace";
import {addInvestor, openSounding, recordEvent, type SoundingRuntime} from "@/lib/sounding/server";

const value = (formData: FormData, name: string) => String(formData.get(name) ?? "").trim();

function localeFrom(formData: FormData): AppLocale {
  const raw = value(formData, "locale");
  return routing.locales.includes(raw as AppLocale) ? (raw as AppLocale) : routing.defaultLocale;
}

const kinds: readonly InvestorKind[] = ["credit_fund", "bank_treasury", "family_office", "fidc_manager", "venture_debt_fund", "insurer", "development_bank"];
const eventTypes: readonly SoundingEventType[] = ["teaser_sent", "nda_signed", "room_opened", "question_asked", "question_answered", "indication_received", "declined", "allocated", "dropped"];

async function runtimeFor(locale: AppLocale, sessionId: string): Promise<SoundingRuntime & {actor: string}> {
  const {supabase, organization, userId, email} = await requireWorkspace(locale);
  if (!sessionId) redirect(`/${locale}/app`);
  return {supabase, organizationId: organization.id, userId, sessionId, actor: email || userId};
}

const back = (locale: string, sessionId: string, error?: string) => `/${locale}/app/sounding/${sessionId}${error ? `?error=${error}` : ""}`;

export async function openSoundingAction(formData: FormData) {
  const locale = localeFrom(formData);
  const sessionId = value(formData, "session_id");
  const runtime = await runtimeFor(locale, sessionId);
  const method = value(formData, "method") === "pro_rata" ? "pro_rata" : "price_priority";
  const outcome = await openSounding(runtime, {targetAmount: value(formData, "target_amount"), cdiPct: value(formData, "cdi_pct"), ...(value(formData, "ipca_pct") ? {ipcaPct: value(formData, "ipca_pct")} : {}), method});
  redirect(back(locale, sessionId, outcome.ok ? undefined : outcome.error));
}

export async function addInvestorAction(formData: FormData) {
  const locale = localeFrom(formData);
  const sessionId = value(formData, "session_id");
  const runtime = await runtimeFor(locale, sessionId);
  const kind = value(formData, "kind") as InvestorKind;
  if (!kinds.includes(kind)) redirect(back(locale, sessionId, "validation"));
  const outcome = await addInvestor(runtime, {soundingId: value(formData, "sounding_id"), name: value(formData, "name"), kind, actor: runtime.actor});
  redirect(back(locale, sessionId, outcome.ok ? undefined : outcome.error));
}

export async function recordEventAction(formData: FormData) {
  const locale = localeFrom(formData);
  const sessionId = value(formData, "session_id");
  const runtime = await runtimeFor(locale, sessionId);
  const type = value(formData, "type") as SoundingEventType;
  if (!eventTypes.includes(type)) redirect(back(locale, sessionId, "validation"));
  let indication: Indication | undefined;
  if (type === "indication_received") {
    const pricingType = value(formData, "pricing_type");
    const rate = value(formData, "pricing_value");
    const pricing: Indication["pricing"] =
      pricingType === "cdi_pct" ? {type: "cdi_pct", pct: rate}
      : pricingType === "fixed" ? {type: "fixed", ratePct: rate}
      : pricingType === "ipca_plus" ? {type: "ipca_plus", spreadPct: rate}
      : {type: "cdi_plus", spreadPct: rate};
    const amount = value(formData, "amount");
    const tenor = Number(value(formData, "tenor_months"));
    if (!Number.isFinite(Number(amount)) || Number(amount) <= 0 || !Number.isFinite(tenor) || tenor <= 0 || !Number.isFinite(Number(rate))) redirect(back(locale, sessionId, "validation"));
    indication = {
      investorId: value(formData, "investor_id"),
      amount,
      tenorMonths: tenor,
      ...(value(formData, "grace_months") ? {graceMonths: Number(value(formData, "grace_months"))} : {}),
      pricing,
      ...(value(formData, "security_asked") ? {securityAsked: value(formData, "security_asked")} : {}),
      firm: value(formData, "firm") === "1",
    };
  }
  const outcome = await recordEvent(runtime, {
    soundingId: value(formData, "sounding_id"),
    investorId: value(formData, "investor_id"),
    type,
    actor: runtime.actor,
    ...(value(formData, "note") ? {note: value(formData, "note")} : {}),
    ...(value(formData, "question_id") ? {questionId: value(formData, "question_id")} : {}),
    ...(indication ? {indication} : {}),
  });
  redirect(back(locale, sessionId, outcome.ok ? undefined : outcome.error));
}
