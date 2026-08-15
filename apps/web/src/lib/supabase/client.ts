"use client";

import {createBrowserClient} from "@supabase/ssr";

import type {Database} from "@/types/database";

import {getSupabasePublicConfig} from "./config";

export function createClient() {
  const config = getSupabasePublicConfig();
  if (!config) return null;
  return createBrowserClient<Database>(config.url, config.publishableKey);
}
