import {readFileSync} from "node:fs";
import {describe, expect, it} from "vitest";
import {assessReceivablesPoolMethodReadiness, buildReceivablesRawUniverse, detectReceivablesRawEvidence, type ReceivablesEvidenceDocument} from "@offroad/receivables-analysis";
import {prepareReceivablesDocumentSupplement} from "./receivables-document-supplement";
import {resolveReceivablesMethodInput} from "./receivables-method-input-resolution";
import {buildReceivablesMethodRequestProjections} from "./receivables-information-requests";
import {applyGovernedReceivablesInformationResponse} from "./receivables-information-response";
import {executeReceivablesSpecialistShadow} from "./specialist-method-runtime";

const document = JSON.parse(readFileSync(new URL("../../../supabase/tests/support/receivables_r01_workbook.json", import.meta.url), "utf8")) as ReceivablesEvidenceDocument;
const context = {projectId: "10000000-0000-4000-8000-000000000001", processingRunId: "20000000-0000-4000-8000-000000000001", locale: "pt-BR" as const};

describe("real detector and governed R01 premise collection", () => {
  it("keeps source questions open while collecting an exact missing premise, then executes only the internal method", () => {
    const datasetHash = "d".repeat(64);
    const args = {universeId: "pool-1", datasetHash, reportingDate: "2026-08-31" as const, documents: [document], fiscalArchives: []};
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
    const ready = assessReceivablesPoolMethodReadiness({phaseOne, detection, assembly: resolved.assembly});
    expect(ready.methodExecutionAllowed).toBe(true);
    const complete = buildReceivablesMethodRequestProjections({...context, readiness: ready});
    expect(complete.every((projection) => projection.requests.length === 0)).toBe(true);
    const result = executeReceivablesSpecialistShadow({taskId: "R01", executorKey: "@offroad/receivables-analysis#underwriteReceivablesPool", executorVersion: "2026.09.06-v1", phaseOne, detection, assembly: resolved.assembly!});
    expect(result).toMatchObject({mode: "internal_shadow", externalEffectAllowed: false});
    expect(result.artifact.outputFingerprint).toMatch(/^[a-f0-9]{64}$/);
  });
});
