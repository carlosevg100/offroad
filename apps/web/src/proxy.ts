import createMiddleware from "next-intl/middleware";
import type {NextRequest} from "next/server";

import {routing} from "./i18n/routing";
import {refreshAuthSession} from "./lib/supabase/proxy";

const internationalization = createMiddleware(routing);

export async function proxy(request: NextRequest) {
  const response = internationalization(request);
  return refreshAuthSession(request, response);
}

export const config = {
  matcher: "/((?!_next|_vercel|.*\\..*).*)",
};
