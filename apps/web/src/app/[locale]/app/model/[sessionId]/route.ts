import {deskEvidence} from "@offroad/case-understanding";
import {buildFinancialModel, renderApprovedFinancialWorkbook, renderApprovedInstitutionalFinancialWorkbook} from "@offroad/financial-model";
import type {ArchetypeId} from "@offroad/credit-playbook";

import {requireWorkspace} from "@/lib/auth/workspace";
import {loadGovernedMaterialPackage} from "@/lib/deal-state/materials";
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

  const governed = await loadGovernedMaterialPackage(supabase, organization.id, sessionId);
  const artifact = governed?.plannedArtifacts.includes("financial_model") ? governed.financialModel : null;
  if (!artifact) return new Response(lang === "pt" ? "O modelo aprovado ainda não está disponível." : "The approved model is not available yet.", {status: 409});

  if (artifact.modelKind === "institutional") {
    const bindings = artifact.institutional.scenarios.flatMap(scenario => scenario.sourceBindings);
    const documentIds = [...new Set(bindings.map(source => source.sourceDocument))];
    const {data: documents, error} = await supabase.from("source_documents").select("id, document_version, sha256, sha256_verified_at").eq("organization_id", organization.id).eq("intake_session_id", sessionId).in("id", documentIds);
    if (error || bindings.some(source => !documents?.some(document => document.id === source.sourceDocument && String(document.document_version) === source.version && document.sha256 === source.hash && document.sha256_verified_at))) {
      return new Response(lang === "pt" ? "As fontes mudaram; revise o modelo antes de gerar uma nova entrega." : "Sources changed; review the model before preparing a new delivery.", {status: 409});
    }
    const bytes = await renderApprovedInstitutionalFinancialWorkbook(artifact, lang);
    if (!bytes) return new Response(lang === "pt" ? "O modelo precisa ser preparado novamente." : "The model must be prepared again.", {status: 409});
    return new Response(Buffer.from(bytes), {headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="${lang === "pt" ? "Cenarios_aprovados" : "Approved_scenarios"}_${governed!.issuedOn.slice(0,10)}.xlsx"`,
      "cache-control": "private, no-store",
    }});
  }

  const state = await resolveCaseState({supabase, organizationId: organization.id, sessionId, locale: lang});

  const {data: session} = await supabase
    .from("document_intake_sessions")
    .select("archetype")
    .eq("organization_id", organization.id)
    .eq("id", sessionId)
    .maybeSingle();

  const documentIds = [...new Set(state.reconciliation.facts.map((fact) => fact.accepted.sourceDocument).filter(Boolean))];
  const {data: documents} = documentIds.length
    ? await supabase.from("source_documents").select("id, original_name").eq("organization_id", organization.id).in("id", documentIds)
    : {data: []};

  const evidence = deskEvidence(state.desk, state.trajectory);
  const model = buildFinancialModel({
    archetypeId: ((session?.archetype as ArchetypeId | null) ?? "other"),
    facts: state.reconciliation.facts,
    calculations: [...state.reconciliation.calculations, ...evidence.calculations],
    filenames: new Map((documents ?? []).map((document) => [document.id, document.original_name])),
    lang,
    requestedAmount: artifact.inputs.amount,
    requestedTermMonths: artifact.inputs.termMonths,
    requestedGraceMonths: artifact.inputs.graceMonths,
    amortizationFormat: artifact.inputs.amortization,
    ...(artifact.inputs.annualInterestRate ? {annualInterestRate: artifact.inputs.annualInterestRate} : {}),
  });

  const bytes = await renderApprovedFinancialWorkbook(model, lang, artifact);
  if (!bytes) {
    return new Response(lang === "pt" ? "O modelo mudou desde a compilação e precisa ser preparado novamente." : "The model changed since compilation and must be prepared again.", {status: 409});
  }
  const stamp = governed!.issuedOn.slice(0, 10);
  const filename = `${lang === "pt" ? "Modelo_de_credito" : "Credit_model"}_${stamp}.xlsx`;

  return new Response(bytes as unknown as BodyInit, {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "private, no-store",
    },
  });
}
