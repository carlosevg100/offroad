import type {MaterialKind} from "@offroad/case-materials";

import {artifactRenderers} from "@/lib/artifacts/artifact-renderers";
import {artifactNotFound, artifactUnavailable} from "@/lib/artifacts/artifact-route";
import {artifactResponseHeaders, verifyRenderedBytes} from "@/lib/artifacts/authorized-artifact-reader";
import {governedMaterialKinds, materialSourcesFromRevision, resolveGovernedMaterialRevision} from "@/lib/artifacts/material-download";
import {resourceStillReadable} from "@/lib/auth/resource-download";
import {governedMaterial} from "@/lib/deal-state/materials";

/**
 * The material as a file the company can send.
 *
 * Served as a print-ready page rather than a generated PDF binary: Chrome's own print engine
 * produces the file, which means no headless browser in a serverless function, no render
 * service to keep alive, and no font substitution surprise between what the screen showed and
 * what the recipient opens. The page opens its own print dialog, and "Save as PDF" is the
 * export.
 *
 * The page renders one exact artifact revision (`?revision=`, or the head of the case's
 * materials), read through the authorized reader under the work's read access and the release
 * the database evaluates. Its sources appendix comes from that revision, never from the case state
 * of the day.
 */

type Params = {params: Promise<{locale: string; sessionId: string; kind: string}>};

export async function GET(request: Request, {params}: Params) {
  const {locale, sessionId, kind} = await params;
  if (!governedMaterialKinds.includes(kind as MaterialKind)) return new Response("Not found", {status: 404});

  const resolved = await resolveGovernedMaterialRevision(request, {locale, sessionId}, (copy) => copy.materials.packageUnavailable);
  if (!resolved.ok) return resolved.response;
  const {supabase, organization, lang, copy, governed, revision, read, issuedOn} = resolved.value;
  const material = governedMaterial(governed, kind as MaterialKind);
  if (!material) return artifactUnavailable(copy.materials.outsidePlan);

  const appendix = await materialSourcesFromRevision(supabase, organization.id, revision, material);
  if (!appendix.ok) return artifactUnavailable(copy.sourceRestricted);
  const render = (autoPrint: boolean) => artifactRenderers["case-render.material-html"].produce({
    material: appendix.material,
    lang,
    meta: {issuedOn, sources: appendix.sources, autoPrint, ...(organization.name ? {companyName: organization.name} : {})},
  });
  const autoPrint = new URL(request.url).searchParams.get("print") === "1";
  const html = render(autoPrint);
  // The print dialog is an option of the request, not of the version: pinned bytes are those of the page without it.
  const verification = verifyRenderedBytes(revision, new TextEncoder().encode(autoPrint ? render(false) : html), {format: "html", selectors: {locale: lang, materialKind: kind}});
  if (verification.status === "mismatch") return artifactUnavailable(copy.bytesMismatch);

  if (!await resourceStillReadable(supabase, organization.id, sessionId, "session")) return artifactNotFound();

  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      // A credit memo is never a cacheable public asset.
      "cache-control": "private, no-store",
      ...artifactResponseHeaders(read, verification),
    },
  });
}
