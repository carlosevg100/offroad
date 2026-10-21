import {readOdblRelease} from "@/lib/market/odbl-release";

export const dynamic = "force-dynamic";

const baseHeaders = {
  "x-content-type-options": "nosniff",
  "cache-control": "no-store",
  "content-security-policy": "default-src 'none'; frame-ancestors 'none'",
} as const;

/**
 * The ODbL edition as a file: the canonical text byte for byte, its digest in a header. No edition is 404,
 * a withdrawn edition is 410, and a failed read is 503; nothing here sets a cookie.
 */
export async function GET(): Promise<Response> {
  let release;
  try {
    release = await readOdblRelease();
  } catch {
    return new Response(null, {status: 503, headers: baseHeaders});
  }
  if (release.state === "missing") return new Response(null, {status: 404, headers: baseHeaders});
  if (release.state === "withdrawn") return new Response(null, {status: 410, headers: {...baseHeaders, "x-offroad-release": String(release.releaseNumber)}});
  return new Response(release.payload, {status: 200, headers: {...baseHeaders,
    "content-type": "application/json; charset=utf-8",
    "content-disposition": `inline; filename="meta-selic-odbl-${release.releaseNumber}.json"`,
    "x-offroad-release": String(release.releaseNumber),
    "x-offroad-sha256": release.sha256}});
}
