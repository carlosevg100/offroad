import {describe, expect, it} from "vitest";
import {artifactImportDecisionSchema, artifactImportUploadSchema, importSameOrigin, readImportRequest} from "./artifact-import-request";
const id = "a0000000-0000-4000-8000-000000000001";
describe("Office import command boundary", () => {
  it("requires both explicit legal declarations before preparing an upload", () => {
    const input = {workId: id, headRevisionId: id, candidateId: id, commandId: id, exportReceiptId: null, fileName: "proposal.xlsx", format: "xlsx", byteLength: 12, sha256: "a".repeat(64), terms: {signatoryName: "Person", signatoryTitle: "Analyst", termsAgreed: true, informationRightsDeclared: true}};
    expect(artifactImportUploadSchema.safeParse(input).success).toBe(true);
    expect(artifactImportUploadSchema.safeParse({...input, terms: {...input.terms, informationRightsDeclared: false}}).success).toBe(false);
    expect(artifactImportUploadSchema.safeParse({...input, terms: {...input.terms, termsAgreed: false}}).success).toBe(false);
  });
  it("rejects comparison JSON and adoption without an approved continuation basis", () => {
    const input = {act: "apply", commandId: id, expectedHeadRevisionId: id, comparisonFingerprint: "b".repeat(64), choices: [], selfApprovalDeclared: true, continuationBasis: {milestoneId: id, decisionId: id, revision: 1}};
    expect(artifactImportDecisionSchema.safeParse(input).success).toBe(true);
    expect(artifactImportDecisionSchema.safeParse({...input, comparison: {status: "candidate"}}).success).toBe(false);
    expect(artifactImportDecisionSchema.safeParse({...input, continuationBasis: {milestoneId: null, decisionId: null, revision: 1}}).success).toBe(false);
  });
  it("denies missing or foreign Origin on cookie-authenticated commands", () => {
    expect(importSameOrigin(new Request("https://offroad.test/import", {method: "POST"}))).toBe(false);
    expect(importSameOrigin(new Request("https://offroad.test/import", {method: "POST", headers: {origin: "https://evil.test"}}))).toBe(false);
    expect(importSameOrigin(new Request("https://offroad.test/import", {method: "POST", headers: {origin: "https://offroad.test"}}))).toBe(true);
  });
  it("caps untrusted request bytes even when Content-Length is omitted", async () => {
    expect(await readImportRequest(new Request("https://offroad.test/import", {method: "POST", headers: {"content-type": "application/json"}, body: `{"text":"${"a".repeat(2_097_152)}"}`}))).toBeNull();
    expect(await readImportRequest(new Request("https://offroad.test/import", {method: "POST", headers: {"content-type": "application/json"}, body: '{"act":"discard"}'}))).toEqual({act: "discard"});
  });
});
