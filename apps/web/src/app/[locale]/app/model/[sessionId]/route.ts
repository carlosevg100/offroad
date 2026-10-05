import {serveRoundtripDownload} from "@/lib/artifacts/roundtrip-download";
import {readInstitutionalWorkbookBinding} from "@/lib/artifacts/institutional-binding";
import {deskEvidence} from "@offroad/case-understanding";
import type {ArchetypeId} from "@offroad/credit-playbook";
import {buildFinancialModel, renderApprovedFinancialWorkbook} from "@offroad/financial-model";

import {artifactRenderers} from "@/lib/artifacts/artifact-renderers";
import {artifactNotFound, artifactUnavailable, renderedRevisionStillAuthorized} from "@/lib/artifacts/artifact-route";
import {verifyRenderedBytes} from "@/lib/artifacts/authorized-artifact-reader";
import {resolveGovernedMaterialRevision} from "@/lib/artifacts/material-download";
import {renderArtifactRevision} from "@/lib/artifacts/render-artifact-revision";
import {resourceStillReadable} from "@/lib/auth/resource-download";
import {resolveCaseState} from "@/lib/intake/case-pipeline";

/**
 * The financial model, as a workbook the company can send and an investor can argue with.
 *
 * The intake playbook asks companies for their model as a spreadsheet with the assumptions
 * tab visible and the formulas preserved, because a PDF of a model is a picture of the thing
 * we need. Sending back a PDF would be the same failure in the other direction, so this is a
 * real .xlsx: formulas, not results.
 *
 * The workbook belongs to one exact artifact revision of the case's materials (`?revision=`, or
 * the head), read through the authorized reader. It is rebuilt on demand and replayed against the
 * approved hashes: bytes that no longer match the approved model are never served.
 */

type Params = {params: Promise<{locale: string; sessionId: string}>};

export async function GET(request: Request, {params}: Params) {
  const {locale, sessionId} = await params;
  const resolved = await resolveGovernedMaterialRevision(request, {locale, sessionId}, (copy) => copy.model.unavailable);
  if (!resolved.ok) return resolved.response;
  const {supabase, organization, lang, copy, governed, revision, read, issuedOn} = resolved.value;
  const artifact = governed.plannedArtifacts.includes("financial_model") ? governed.financialModel : null;
  if (!artifact) return artifactUnavailable(copy.model.unavailable);

  const nativeBinding = artifact.modelKind === "institutional"
    ? await readInstitutionalWorkbookBinding(supabase, resolved.value.projectId, artifact.fingerprint) : {ok:true as const,native:null};
  if (!nativeBinding.ok || (nativeBinding.native && revision.audience === "external" && nativeBinding.native.release !== "released")) return artifactUnavailable(copy.sourceRestricted);
  let reproduce: () => Promise<Uint8Array | null>;
  let unavailable: string;
  if (artifact.modelKind === "institutional") {
    const bindings = artifact.institutional.scenarios.flatMap(scenario => scenario.sourceBindings);
    const documentIds = [...new Set(bindings.map(source => source.sourceDocument))];
    const {data: documents, error} = await supabase.from("source_documents").select("id, document_version, sha256, sha256_verified_at").eq("organization_id", organization.id).eq("intake_session_id", sessionId).in("id", documentIds);
    if (error || bindings.some(source => !documents?.some(document => document.id === source.sourceDocument && String(document.document_version) === source.version && document.sha256 === source.hash && document.sha256_verified_at))) {
      return artifactUnavailable(copy.model.sourcesChanged);
    }
    reproduce = () => artifactRenderers[artifact.version].produce(artifact, lang);
    unavailable = copy.model.prepareAgain;
  } else {
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
    reproduce = () => renderApprovedFinancialWorkbook(model, lang, artifact);
    unavailable = copy.model.changed;
  }

  // The workbook is the replay itself: the approved hash of this locale decides, never new bytes.
  const rendered = await renderArtifactRevision({revision: {issuedOn}, format: "xlsx", lang, reproduce});
  if (!rendered.ok) return artifactUnavailable(unavailable);
  const verification = verifyRenderedBytes(nativeBinding.native?.revision ?? revision, rendered.bytes, {format: "xlsx", selectors: {locale: lang, materialKind: "financial_model"}});
  if (verification.status === "mismatch") return artifactUnavailable(copy.bytesMismatch);

  if (!await resourceStillReadable(supabase, organization.id, sessionId, "session")) return artifactNotFound();

  if (artifact.modelKind === "institutional") {
    const final = await readInstitutionalWorkbookBinding(supabase, resolved.value.projectId, artifact.fingerprint);
    if (!final.ok || final.native?.summary.id !== nativeBinding.native?.summary.id || final.native?.release !== nativeBinding.native?.release
      || final.native?.summary.manifestFingerprint !== nativeBinding.native?.summary.manifestFingerprint) return artifactUnavailable(copy.sourceRestricted);
  }
  if (!await renderedRevisionStillAuthorized(supabase, read)) return artifactUnavailable(copy.sourceRestricted);
  return serveRoundtripDownload(request, {supabase, locale, artifactId: (nativeBinding.native ?? read).artifact.id, revisionId: nativeBinding.native?.summary.id ?? revision.id, format: "xlsx", variant: "financial_model"});
}
