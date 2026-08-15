import type {EmailOtpType} from "@supabase/supabase-js";
import {type NextRequest, NextResponse} from "next/server";

import {routing, type AppLocale} from "@/i18n/routing";
import {createClient} from "@/lib/supabase/server";

export async function GET(request: NextRequest, context: {params: Promise<{locale: string}>}) {
  const {locale: rawLocale} = await context.params;
  const locale = routing.locales.includes(rawLocale as AppLocale) ? rawLocale as AppLocale : routing.defaultLocale;
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type") as EmailOtpType | null;
  const code = request.nextUrl.searchParams.get("code");
  const flowId = request.nextUrl.searchParams.get("sb_flow_id");
  const requestedNext = request.nextUrl.searchParams.get("next");
  const safeNext = requestedNext?.startsWith(`/${locale}/`) && !requestedNext.includes("//")
    ? requestedNext
    : `/${locale}/onboarding`;
  const supabase = await createClient();

  if (supabase && code) {
    const {error} = await supabase.auth.exchangeCodeForSession(
      code,
      flowId ? {flowId} : undefined,
    );
    if (!error) return NextResponse.redirect(new URL(safeNext, request.url));
  }

  if (supabase && tokenHash && type) {
    const {error} = await supabase.auth.verifyOtp({type, token_hash: tokenHash});
    if (!error) return NextResponse.redirect(new URL(safeNext, request.url));
  }

  return NextResponse.redirect(new URL(`/${locale}/auth/error`, request.url));
}
