import {readFileSync} from "node:fs";
import {describe, expect, it} from "vitest";
import type {ReceivablesEvidenceDocument} from "@offroad/receivables-analysis";

import {buildReceivablesVertical} from "./case-analysis";
import {encodeReceivablesEvidence} from "./receivables-evidence";
import {discoverReceivablesEvidence} from "./receivables-scope-resolution";
import {buildReceivablesMethodRequestProjections} from "./receivables-information-requests";
import {applyGovernedReceivablesInformationResponse} from "./receivables-information-response";

const workbook = JSON.parse(readFileSync(
  new URL("../../../supabase/tests/support/receivables_r01_workbook.json", import.meta.url),
  "utf8",
)) as ReceivablesEvidenceDocument;

const organizationId = "80000000-0000-4000-8000-000000000001";
const otherOrganizationId = "80000000-0000-4000-8000-000000000002";
const projectId = "10000000-0000-4000-8000-000000000001";
const processingRunId = "20000000-0000-4000-8000-000000000001";
const scopeId = "40000000-0000-4000-8000-000000000001";
const scopeFingerprint = "b".repeat(64);

/**
 * The real confirmed-scope input the worker sees, with the advance rate already answered. Built
 * once from the real workbook and the real parsers: every case below only shallow-copies it, so
 * the fixture is never mutated and the suite does not re-parse the workbook for each assertion.
 */
function completeCaseInput(): Parameters<typeof buildReceivablesVertical>[0] {
  return builtCaseInput;
}

function buildCompleteCaseInput(): Parameters<typeof buildReceivablesVertical>[0] {
  const sourceId = "30000000-0000-4000-8000-000000000001";
  const source = {
    ...workbook, id: sourceId,
    layer: {
      ...workbook.layer, kind: "spreadsheet", documentId: sourceId, documentVersion: 1,
      sheets: workbook.layer.sheets!.map((sheet) => ({
        ...sheet,
        cells: sheet.cells.map((cell) => ({...cell, t: typeof cell.v === "number" ? "n" : "s"})),
      })),
    },
  };
  const encoded = encodeReceivablesEvidence(source);
  const envelopes = [{
    source_document_id: sourceId, document_version: 1, content_kind: "document_layer" as const,
    schema_version: encoded.schemaVersion, source_sha256: source.fileHash!, content_sha256: encoded.contentSha256,
    payload_sha256: encoded.payloadSha256, codec: "gzip-json-v1" as const,
    uncompressed_bytes: encoded.uncompressedBytes, payload_base64: encoded.payloadBase64,
  }];
  const discovery = discoverReceivablesEvidence(envelopes);
  const candidate = discovery.candidates[0]!;
  const raw: Parameters<typeof buildReceivablesVertical>[0] = {
    session: {id: projectId, capital_project_id: projectId, requested_amount: 1000},
    _execution: {id: processingRunId, mode: "primary", input_fingerprint: "a".repeat(64), pipeline_version: "test", model_policy_version: "test"},
    receivables_evidence: envelopes,
    confirmed_receivables_scope: {
      state: "current", sourceManifest: discovery.sourceManifest, candidates: discovery.candidates,
      supportSheetCandidates: discovery.supportSheetCandidates,
      scope: {
        schemaVersion: "receivables-evidence-scope.v2", id: scopeId, fingerprint: scopeFingerprint,
        sourceManifestFingerprint: discovery.sourceManifest.fingerprint,
        primaryTape: {documentId: candidate.documentId, sheet: candidate.sheet, headerRow: candidate.headerRow},
        primarySupportSheets: discovery.supportSheetCandidates.map((sheet) => sheet.sheet).sort(),
        complementDocumentIds: [], sourceRevisions: discovery.sourceManifest.sources,
        reportingDate: "2026-08-31", confirmedBy: "50000000-0000-4000-8000-000000000001",
        confirmedAt: "2026-09-10T12:00:00Z",
      },
    },
    receivables_method_input_assembly: null, receivables_method_supplement_draft: null,
    receivables_provider_context: {programs: [], observations: []},
  };
  const initial = buildReceivablesVertical(raw, "2026-09-10", false)!;
  const request = buildReceivablesMethodRequestProjections({
    projectId, processingRunId, locale: "pt-BR",
    readiness: initial.publicReport.methodReadiness,
    missingDraftSections: initial.inputResolution.missingSections,
  })[1]!.requests[0]!;
  const answer = applyGovernedReceivablesInformationResponse({
    answeredRequest: {
      id: request.id, requirementKey: request.requirementKey, question: request.question,
      answerKind: request.answerKind,
      producerBinding: "producerBinding" in request ? request.producerBinding : null,
      sourceNamespace: "receivables_method_r01_fields", answerSource: "custom",
      answeredAt: "2026-09-10T12:00:00Z", answeredBy: "50000000-0000-4000-8000-000000000001",
    },
    content: "50", messageId: "60000000-0000-4000-8000-000000000001",
    currentDraft: initial.documentSupplement!.nextDraft,
  })!;
  return {
    ...raw,
    receivables_method_supplement_draft: {
      id: "70000000-0000-4000-8000-000000000001", source_dataset_hash: answer.nextDraft.sourceDatasetHash,
      revision: answer.nextDraft.revision, draft_fingerprint: "c".repeat(64), draft: answer.nextDraft,
    },
  };
}

const builtCaseInput = buildCompleteCaseInput();

describe("released analytical result inside the real case run", () => {
  it("keeps today's behaviour when the organization holds no grant", () => {
    const ungranted = buildReceivablesVertical(completeCaseInput(), "2026-09-10", false)!;
    expect(ungranted.publicReport.methodExecution).toMatchObject({status: "succeeded", mode: "internal_shadow"});
    expect(ungranted.specialistShadow).not.toBeNull();
    expect(ungranted.specialistRelease).toBeNull();
    expect(ungranted.releaseFailureCode).toBeNull();

    const disabled = buildReceivablesVertical(
      {...completeCaseInput(), receivables_analytical_release: {granted: false, organizationId, note: null}},
      "2026-09-10", false,
    )!;
    expect(disabled.specialistRelease).toBeNull();
    expect(disabled.releaseFailureCode).toBeNull();
    expect(disabled.specialistShadow!.artifact.outputFingerprint).toBe(ungranted.specialistShadow!.artifact.outputFingerprint);
  });

  it("releases the same calculation bound to the confirmed scope and its dataset when granted", () => {
    const shadowOnly = buildReceivablesVertical(completeCaseInput(), "2026-09-10", false)!;
    const granted = buildReceivablesVertical(
      {...completeCaseInput(), receivables_analytical_release: {granted: true, organizationId, note: null}},
      "2026-09-10", false,
    )!;
    const release = granted.specialistRelease!;
    expect(release.mode).toBe("analytical_release");
    expect(release.externalEffectAllowed).toBe(false);
    expect(release.release.maximumEffect).toBe("none");
    expect(release.release.allowedUses).not.toContain("external_material");
    expect(release.release.allowedUses).not.toContain("external_action");
    expect(release.release.organizationId).toBe(organizationId);
    // The confirmed scope travels with the released result; the coordinator can prove which
    // portfolio selection produced it, and a later selection supersedes it instead of replacing it.
    expect(release.release.confirmedScope).toEqual({id: scopeId, fingerprint: scopeFingerprint});
    expect(release.release.sourceDatasetHash).toBe(granted.inputAssembly!.source.datasetHash);
    expect(release.artifact.status).toBe("released");
    expect(release.artifact.outputFingerprint).toBe(shadowOnly.specialistShadow!.artifact.outputFingerprint);
    expect(release.artifact.inputFingerprint).toBe(shadowOnly.specialistShadow!.artifact.inputFingerprint);
    expect(release.artifact.content.history_coverage?.aggregatePerformanceBasis).toBe("reported_title_aggregates");
    expect(release.artifact.content.history_coverage?.families).toHaveLength(6);
    expect(release.artifact.content.economic_conventions?.concentrationDenominator).toBe("preliminary_eligible_balance");
    expect(release.artifact.content.decision_boundary.externalDirectionAllowed).toBe(false);
    expect(release.artifact.evidenceRefs.length).toBeGreaterThan(0);
    // The shadow run stays exactly as it was: the released result is additive.
    expect(granted.specialistShadow!.artifact.outputFingerprint).toBe(shadowOnly.specialistShadow!.artifact.outputFingerprint);
    expect(granted.publicReport.methodExecution).toMatchObject({status: "succeeded", mode: "internal_shadow"});
  });

  it("carries only the organization the capability-bound bundle declared", () => {
    const crossTenant = buildReceivablesVertical(
      {
        ...completeCaseInput(),
        receivables_analytical_release: {granted: true, organizationId: otherOrganizationId, note: null},
      },
      "2026-09-10", false,
    )!;
    // The worker never invents a tenant: the identity comes from the grant the database attached to
    // this job, and it is the identity written into the released result. The database then refuses
    // a payload whose organization is not the job's own, proven in the SQL contract test.
    expect(crossTenant.specialistRelease!.release.organizationId).toBe(otherOrganizationId);
    expect(crossTenant.specialistRelease!.release.organizationId).not.toBe(organizationId);
    expect(crossTenant.specialistShadow).not.toBeNull();
  });

  it("never releases a portfolio selection the organization did not confirm", () => {
    const input = completeCaseInput();
    const stale = buildReceivablesVertical(
      {
        ...input,
        confirmed_receivables_scope: {
          ...input.confirmed_receivables_scope!,
          state: "stale",
        },
        receivables_analytical_release: {granted: true, organizationId, note: null},
      },
      "2026-09-10", false,
    )!;
    expect(stale.publicReport.status).toBe("needs_evidence_scope");
    expect(stale.specialistRelease).toBeNull();
    expect(stale.specialistShadow).toBeNull();
  });
});
