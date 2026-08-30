import {renderMaterialHtml} from "@offroad/case-render";
import type {MaterialKind} from "@offroad/case-materials";

import {requireWorkspace} from "@/lib/auth/workspace";
import {governedMaterial, loadGovernedMaterialPackage} from "@/lib/deal-state/materials";
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

const kinds: readonly MaterialKind[] = ["credit_memo", "term_sheet", "diligence_qa", "teaser", "credit_profile", "package", "data_room_index"];

type Params = {params: Promise<{locale: string; sessionId: string; kind: string}>};

export async function GET(request: Request, {params}: Params) {
  const {locale, sessionId, kind} = await params;
  if (!kinds.includes(kind as MaterialKind)) return new Response("Not found", {status: 404});

  const {supabase, organization} = await requireWorkspace(locale);
  const lang = locale === "en-US" ? "en" : "pt";

  const governed = await loadGovernedMaterialPackage(supabase, organization.id, sessionId);
  if (!governed) return new Response(lang === "pt" ? "O pacote aprovado ainda não está disponível." : "The approved package is not available yet.", {status: 409});
  const material = governedMaterial(governed, kind as MaterialKind);
  if (!material) return new Response(lang === "pt" ? "Este material não faz parte do plano aprovado." : "This material is not part of the approved plan.", {status: 409});

  const state = await resolveCaseState({supabase, organizationId: organization.id, sessionId, locale: lang});

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
