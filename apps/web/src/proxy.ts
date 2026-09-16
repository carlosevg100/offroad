import createMiddleware from "next-intl/middleware";
import {NextResponse, type NextRequest} from "next/server";

import {routing} from "./i18n/routing";
import {refreshAuthSession} from "./lib/supabase/proxy";

import {workspaceRequestContext, WORKSPACE_HEADER} from "./lib/auth/workspace-context";

const internationalization = createMiddleware(routing);

export async function proxy(request: NextRequest) {
  // Never forward a caller-supplied internal context header.
  request.headers.delete(WORKSPACE_HEADER);
  if (/^\/(pt-BR|en-US)\/(?:app|onboarding)(?:\/|$)/.test(request.nextUrl.pathname)) {
    const context = workspaceRequestContext(request.nextUrl, request.headers.get("referer"), request.method);
    if (context.invalid) return new NextResponse(null, {status: 400});
    if (context.workspace) {
      if (context.canonicalize && (request.method === "GET" || request.method === "HEAD")) {
        const target = request.nextUrl.clone();
        target.searchParams.set("workspace", context.workspace);
        return NextResponse.redirect(target);
      }
      request.headers.set(WORKSPACE_HEADER, context.workspace);
    }
  }
  const response = internationalization(request);
  return refreshAuthSession(request, response);
}

export const config = {
  matcher: "/((?!_next|_vercel|.*\\..*).*)",
};
