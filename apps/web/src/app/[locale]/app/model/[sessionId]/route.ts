import {buildFinancialModel, toXlsxBuffer} from "@offroad/financial-model";
import type {ArchetypeId} from "@offroad/credit-playbook";

import {requireWorkspace} from "@/lib/auth/workspace";
import {resolveCaseState} from "@/lib/intake/case-pipeline";

/**
 * The financial model, as a workbook the company can send and an investor can argue with.
 *
 * The intake playbook asks companies for their model as a spreadsheet with the assumptions
 * tab visible and the formulas preserved, because a PDF of a model is a picture of the thing
 * we need. Sending back a PDF would be the same failure in the other direction, so this is a
 * real .xlsx: formulas, not results.
 *
 * Built on demand rather than stored. The case state it reads is already cached, so the cost
 * here is arithmetic and a zip — and a stored workbook would go stale the moment a candidate
 * is reviewed, which is the sort of quiet staleness a credit file cannot carry.
 */

type Params = {params: Promise<{locale: string; sessionId: string}>};

export async function GET(_request: Request, {params}: Params) {
  const {locale, sessionId} = await params;
  const {supabase, organization} = await requireWorkspace(locale);
  const lang = locale === "en-US" ? "en" : "pt";

  const state = await resolveCaseState({supabase, organizationId: organization.id, sessionId, locale: lang});

  const {data: session} = await supabase
    .from("document_intake_sessions")
    .select("archetype")
    .eq("organization_id", organization.id)
    .eq("id", sessionId)
    .maybeSingle();

  const requested = state.reconciliation.facts.find((fact) => fact.key.fieldPath === "transaction.requested_amount");
  const term = state.reconciliation.facts.find((fact) => fact.key.fieldPath === "transaction.desired_term_months");
  const grace = state.reconciliation.facts.find((fact) => fact.key.fieldPath === "transaction.desired_grace_months");

  const documentIds = [...new Set(state.reconciliation.facts.map((fact) => fact.accepted.sourceDocument).filter(Boolean))];
  const {data: documents} = documentIds.length
    ? await supabase.from("source_documents").select("id, original_name").eq("organization_id", organization.id).in("id", documentIds)
    : {data: []};

  const model = buildFinancialModel({
    archetypeId: ((session?.archetype as ArchetypeId | null) ?? "other"),
    facts: state.reconciliation.facts,
    calculations: state.reconciliation.calculations,
    filenames: new Map((documents ?? []).map((document) => [document.id, document.original_name])),
    lang,
    ...(requested ? {requestedAmount: requested.value} : {}),
    ...(term && Number.isFinite(Number(term.value)) ? {requestedTermMonths: Number(term.value)} : {}),
    ...(grace && Number.isFinite(Number(grace.value)) ? {requestedGraceMonths: Number(grace.value)} : {}),
  });

  const bytes = toXlsxBuffer(model, lang);
  const stamp = new Date().toISOString().slice(0, 10);
  const filename = `${lang === "pt" ? "Modelo_de_credito" : "Credit_model"}_${stamp}.xlsx`;

  return new Response(bytes as unknown as BodyInit, {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "private, no-store",
    },
  });
}
