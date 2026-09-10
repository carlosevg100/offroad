import {readFileSync} from "node:fs";
import {describe, expect, it} from "vitest";
import {assessReceivablesPoolMethodReadiness, buildReceivablesRawUniverse, detectReceivablesRawEvidence, type ReceivablesEvidenceDocument} from "@offroad/receivables-analysis";
import {prepareReceivablesDocumentSupplement} from "./receivables-document-supplement";
import {resolveReceivablesMethodInput} from "./receivables-method-input-resolution";
import {buildReceivablesMethodRequestProjections} from "./receivables-information-requests";
import {applyGovernedReceivablesInformationResponse} from "./receivables-information-response";
import {buildReceivablesVertical} from "./case-analysis";
import {encodeReceivablesEvidence} from "./receivables-evidence";
import {discoverReceivablesEvidence} from "./receivables-scope-resolution";
import {executeReceivablesSpecialistShadow} from "./specialist-method-runtime";

const document = JSON.parse(readFileSync(new URL("../../../supabase/tests/support/receivables_r01_workbook.json", import.meta.url), "utf8")) as ReceivablesEvidenceDocument;
const context = {projectId: "10000000-0000-4000-8000-000000000001", processingRunId: "20000000-0000-4000-8000-000000000001", locale: "pt-BR" as const};

describe("real detector and governed R01 premise collection", () => {
  it("materializes the actual worker refresh after a governed answer using the source locator identity", () => {
    const sourceId = "30000000-0000-4000-8000-000000000001";
    const source = {...document, id: sourceId, layer: {...document.layer, kind: "spreadsheet", documentId: sourceId, documentVersion: 1, sheets: document.layer.sheets!.map((sheet) => ({...sheet, cells: sheet.cells.map((cell) => ({...cell, t: typeof cell.v === "number" ? "n" : "s"}))}))}};
    const encoded = encodeReceivablesEvidence(source);
    const envelopes = [{source_document_id: sourceId, document_version: 1, content_kind: "document_layer" as const,
      schema_version: encoded.schemaVersion, source_sha256: source.fileHash!, content_sha256: encoded.contentSha256,
      payload_sha256: encoded.payloadSha256, codec: "gzip-json-v1" as const, uncompressed_bytes: encoded.uncompressedBytes, payload_base64: encoded.payloadBase64}];
    const discovery = discoverReceivablesEvidence(envelopes);
    const candidate = discovery.candidates[0]!;
    const raw: Parameters<typeof buildReceivablesVertical>[0] = {
      session: {id: context.projectId, capital_project_id: context.projectId, requested_amount: 1000},
      _execution: {id: context.processingRunId, mode: "primary", input_fingerprint: "a".repeat(64), pipeline_version: "test", model_policy_version: "test"},
      receivables_evidence: envelopes,
      confirmed_receivables_scope: {state: "current", sourceManifest: discovery.sourceManifest, candidates: discovery.candidates, supportSheetCandidates: discovery.supportSheetCandidates,
        scope: {schemaVersion: "receivables-evidence-scope.v2", id: "40000000-0000-4000-8000-000000000001", fingerprint: "b".repeat(64),
          sourceManifestFingerprint: discovery.sourceManifest.fingerprint, primaryTape: {documentId: candidate.documentId, sheet: candidate.sheet, headerRow: candidate.headerRow},
          primarySupportSheets: discovery.supportSheetCandidates.map((sheet) => sheet.sheet).sort(), complementDocumentIds: [], sourceRevisions: discovery.sourceManifest.sources,
          reportingDate: "2026-08-31", confirmedBy: "50000000-0000-4000-8000-000000000001", confirmedAt: "2026-09-10T12:00:00Z"}},
      receivables_method_input_assembly: null, receivables_method_supplement_draft: null, receivables_provider_context: {programs: [], observations: []},
    };
    const initial = buildReceivablesVertical(raw, "2026-09-10", false)!;
    expect(initial.inputResolution.missingSections).toEqual(["structure.advanceRate"]);
    const request = buildReceivablesMethodRequestProjections({...context, readiness: initial.publicReport.methodReadiness, missingDraftSections: initial.inputResolution.missingSections})[1]!.requests[0]!;
    const answer = applyGovernedReceivablesInformationResponse({answeredRequest: {id: request.id, requirementKey: request.requirementKey, question: request.question, answerKind: request.answerKind,
      producerBinding: "producerBinding" in request ? request.producerBinding : null, sourceNamespace: "receivables_method_r01_fields", answerSource: "custom", answeredAt: "2026-09-10T12:00:00Z", answeredBy: "50000000-0000-4000-8000-000000000001"},
      content: "50", messageId: "60000000-0000-4000-8000-000000000001", currentDraft: initial.documentSupplement!.nextDraft})!;
    expect(answer.status.state).toBe("complete");
    const refreshInput = {...raw, receivables_method_supplement_draft: {id: "70000000-0000-4000-8000-000000000001", source_dataset_hash: answer.nextDraft.sourceDatasetHash,
      revision: answer.nextDraft.revision, draft_fingerprint: "c".repeat(64), draft: answer.nextDraft}};
    const refreshed = buildReceivablesVertical(refreshInput, "2026-09-10", false)!;
    expect(refreshed.inputAssembly!.source.universeId).toBe(`${context.projectId}:pool:${sourceId}:${encodeURIComponent(candidate.sheet)}:${candidate.headerRow}`);
    expect(refreshed.inputAssembly!.input.case.id).toMatch(/^r01-[a-f0-9]{64}$/);
    expect(refreshed.publicReport.methodExecution).toMatchObject({status: "succeeded", mode: "internal_shadow", externalEffectAllowed: false});
    expect(buildReceivablesVertical(refreshInput, "2026-09-10", false)!.publicReport.methodExecution.outputFingerprint).toBe(refreshed.publicReport.methodExecution.outputFingerprint);
  });

  it("keeps source questions open while collecting an exact missing premise, then executes only the internal method", () => {
    const datasetHash = "d".repeat(64);
    const args = {universeId: `${context.projectId}:pool:${document.id}:CARTEIRA:1`, datasetHash, reportingDate: "2026-08-31" as const, documents: [document], fiscalArchives: []};
    const phaseOne = buildReceivablesRawUniverse(args).phaseOne!;
    const detection = detectReceivablesRawEvidence(args);
    expect(detection.evidenceCoverage.warnings).not.toContain("receivables_tape_not_identified");
    const prepared = prepareReceivablesDocumentSupplement({phaseOne, documents: [document]});
    const initial = resolveReceivablesMethodInput({phaseOne, supplementDraft: prepared.nextDraft});
    expect(initial.missingSections).toEqual(["structure.advanceRate"]);
    const blocked = assessReceivablesPoolMethodReadiness({phaseOne, detection});
    const [evidence, fields] = buildReceivablesMethodRequestProjections({...context, readiness: blocked, missingDraftSections: initial.missingSections});
    expect(evidence!.requests.length).toBeGreaterThan(0);
    expect(blocked.methodExecutionAllowed).toBe(false);
    expect(fields!.requests).toHaveLength(1);
    const request = fields!.requests[0]!;
    const response = applyGovernedReceivablesInformationResponse({
      answeredRequest: {id: request.id, requirementKey: request.requirementKey, question: request.question, answerKind: request.answerKind, producerBinding: "producerBinding" in request ? request.producerBinding : null, sourceNamespace: "receivables_method_r01_fields", answerSource: "custom", answeredAt: "2026-09-10T12:00:00Z", answeredBy: "30000000-0000-4000-8000-000000000001"},
      content: "50%", messageId: "40000000-0000-4000-8000-000000000001", currentDraft: prepared.nextDraft,
    })!;
    expect(response.status.state).toBe("complete");
    const resolved = resolveReceivablesMethodInput({phaseOne, supplementDraft: response.nextDraft});
    expect(resolved.assembly!.input.case.id).toMatch(/^r01-[a-f0-9]{64}$/);
    expect(resolved.assembly!.source.universeId).toBe(args.universeId);
    const ready = assessReceivablesPoolMethodReadiness({phaseOne, detection, assembly: resolved.assembly});
    expect(ready.methodExecutionAllowed).toBe(true);
    const complete = buildReceivablesMethodRequestProjections({...context, readiness: ready});
    expect(complete.every((projection) => projection.requests.length === 0)).toBe(true);
    const result = executeReceivablesSpecialistShadow({taskId: "R01", executorKey: "@offroad/receivables-analysis#underwriteReceivablesPool", executorVersion: "2026.09.06-v1", phaseOne, detection, assembly: resolved.assembly!});
    expect(result).toMatchObject({mode: "internal_shadow", externalEffectAllowed: false});
    expect(result.artifact.outputFingerprint).toMatch(/^[a-f0-9]{64}$/);
  });
});
