import {createServerClient} from "@supabase/ssr";
import type {NextRequest, NextResponse} from "next/server";

import type {Database} from "@/types/database";

import {getSupabasePublicConfig} from "./config";

export async function refreshAuthSession(request: NextRequest, response: NextResponse) {
  const config = getSupabasePublicConfig();
  if (!config) return response;

  const supabase = createServerClient<Database>(config.url, config.publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const {name, value} of cookiesToSet) request.cookies.set(name, value);
        for (const {name, value, options} of cookiesToSet) response.cookies.set(name, value, options);
      },
    },
  });

  await supabase.auth.getClaims();
  return response;
}
