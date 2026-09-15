import {createServerClient} from "@supabase/ssr";
import {cookies, headers} from "next/headers";

import type {Database} from "@/types/database";

import {getSupabasePublicConfig} from "./config";

export async function createClient() {
  const config = getSupabasePublicConfig();
  if (!config) return null;

  const cookieStore = await cookies();
  const workspace = (await headers()).get("x-offroad-workspace");

  return createServerClient<Database>(config.url, config.publishableKey, {
    global: {headers: workspace ? {"x-offroad-workspace": workspace} : {}},
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const {name, value, options} of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Components cannot persist cookies; proxy refresh covers that path.
        }
      },
    },
  });
}
