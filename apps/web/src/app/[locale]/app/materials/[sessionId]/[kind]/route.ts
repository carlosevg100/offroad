import {renderMaterialHtml} from "@offroad/case-render";
import type {MaterialKind} from "@offroad/case-materials";

import {requireWorkspace} from "@/lib/auth/workspace";
import {resolveCaseState} from "@/lib/intake/case-pipeline";

/**
 * The material as a file the company can send.
 *
 * Served as a print-ready page rather than a generated PDF binary: Chrome's own print engine
 * produces the file, which means no headless browser in a serverless function, no render
 * service to keep alive, and no font substitution surprise between what the screen showed and
 * what the recipient opens. The page opens its own print dialog, and "Save as PDF" is the
 * export.
 *
 * Authorisation is the ordinary workspace boundary and nothing more: RLS scopes every read to
 * the caller's organization, so a session id belonging to another company returns an empty
 * case, not somebody else's memo.
 */

const kinds: readonly MaterialKind[] = ["teaser", "credit_profile", "package"];

type Params = {params: Promise<{locale: string; sessionId: string; kind: string}>};

export async function GET(request: Request, {params}: Params) {
  const {locale, sessionId, kind} = await params;
  if (!kinds.includes(kind as MaterialKind)) return new Response("Not found", {status: 404});

  const {supabase, organization} = await requireWorkspace(locale);
  const lang = locale === "en-US" ? "en" : "pt";

  const state = await resolveCaseState({supabase, organizationId: organization.id, sessionId, locale: lang});
  const material = state.materials.find((entry) => entry.kind === kind);

  if (!material) {
    // The reason is already computed upstream; repeating it here beats a bare 404, because
    // "the audit refused this brief" and "this case has no facts yet" need different actions.
    const reason = state.materialsBlockedBy.join("; ") || state.briefBlockedBy.join("; ");
    return new Response(
      lang === "pt"
        ? `Este material ainda não pode ser emitido.${reason ? ` Motivo: ${reason}` : ""}`
        : `This material cannot be issued yet.${reason ? ` Reason: ${reason}` : ""}`,
      {status: 409, headers: {"content-type": "text/plain; charset=utf-8"}},
    );
  }

  // Resolve every citation to the field and the file it came from — an appendix of opaque ids
  // would carry the form of traceability without the substance.
  const documentIds = [...new Set(state.reconciliation.facts.map((fact) => fact.accepted.sourceDocument).filter(Boolean))];
  const {data: documents} = documentIds.length
    ? await supabase.from("source_documents").select("id, original_name").eq("organization_id", organization.id).in("id", documentIds)
    : {data: []};
  const filenameOf = new Map((documents ?? []).map((document) => [document.id, document.original_name]));

  const sources = [
    ...state.reconciliation.facts.map((fact) => ({
      id: fact.key.periodEnd ? `${fact.key.fieldPath} (${fact.key.periodEnd})` : fact.key.fieldPath,
      label: fact.key.periodEnd ? `${fact.key.fieldPath} · ${fact.key.periodEnd}` : fact.key.fieldPath,
      ...(filenameOf.get(fact.accepted.sourceDocument) ? {document: filenameOf.get(fact.accepted.sourceDocument)!} : {}),
    })),
    ...state.reconciliation.calculations.map((calculation) => ({
      id: calculation.id,
      label: `${calculation.labels[lang]} · ${lang === "pt" ? "calculado de" : "computed from"}: ${calculation.inputs.join(", ")}`,
    })),
  ];

  const html = renderMaterialHtml({
    material,
    lang,
    meta: {
      issuedOn: new Date().toISOString().slice(0, 10),
      sources,
      autoPrint: new URL(request.url).searchParams.get("print") === "1",
      ...(organization.name ? {companyName: organization.name} : {}),
    },
  });

  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      // A credit memo is never a cacheable public asset.
      "cache-control": "private, no-store",
    },
  });
}
