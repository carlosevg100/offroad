import {describe, expect, it} from "vitest";
import {auditBrief, resolveExecutiveSummaryClaims, type CaseBrief} from "./brief";
import {buildClaimRegistry} from "./claim-registry";

const claim = {id: "revenue", text: "Receita de R$ 40 milhões.", material: true, kind: "fact" as const, supportIds: ["revenue"]};
const second = {...claim, id: "qualifier", text: "Receita sujeita à revisão.", supportIds: ["revenue_review"]};
const brief: CaseBrief = {executiveSummary: `${claim.text}\n\n${second.text}`, sections: [{id: "executive_summary", heading: "Resumo", claims: [claim, second]}]};

describe("executive synthesis binding", () => {
  it("keeps selected complete claims in summary order with their evidence and classification", () => {
    expect(resolveExecutiveSummaryClaims({...brief, executiveSummary: `${second.text}\n\n${claim.text}`})).toEqual([second, claim]);
    expect(resolveExecutiveSummaryClaims({...brief, executiveSummary: " Receita de R$ 40 milhões. \r\n\r\n Receita sujeita à revisão. "})).toEqual([claim, second]);
    expect(resolveExecutiveSummaryClaims({...brief, executiveSummary: `${claim.text} ${second.text}`})).toEqual([claim, second]);
  });
  it.each([
    "Receita de R$ 41 milhões.",
    "Receita de R$ 40 milhões. A operação está aprovada.",
    "Receita sujeita",
    `${claim.text}\n\n${claim.text}`,
    "",
  ])("rejects added prose, altered numbers, partial claims and repetition: %s", executiveSummary => {
    expect(resolveExecutiveSummaryClaims({...brief, executiveSummary})).toBeNull();
  });
  it("rejects ambiguous identical text with different claim identity or support", () => {
    expect(resolveExecutiveSummaryClaims({...brief, executiveSummary: claim.text, sections: [{id: "history", heading: "Histórico", claims: [claim, {...claim, id: "other", supportIds: ["other-source"]}]}]})).toBeNull();
  });
  it("rejects multiple valid segmentations instead of guessing the source attribution", () => {
    const combined = {...claim, id: "combined", text: `${claim.text} ${second.text}`};
    expect(resolveExecutiveSummaryClaims({...brief, sections: [{id: "executive_summary", heading: "Resumo", claims: [claim, second, combined]}]})).toBeNull();
  });
  it("blocks unbound summaries even when every structured claim was accepted", () => {
    const unsupported: CaseBrief = {sections: [], executiveSummary: "Funding guaranteed."};
    const result = auditBrief({brief: unsupported, facts: [], calculations: []});
    expect(result.ok).toBe(false);
    expect(result.audit.findings).toContainEqual(expect.objectContaining({reason: "executive_summary_unbound"}));
    const registry = buildClaimRegistry({brief: unsupported, numericAudit: {status: "pass", coverage: 1, accepted: [], findings: []}, semanticAudit: {status: "pass", accepted: [], findings: [], reviews: []}});
    expect(registry.publication.allowed).toBe(false);
    expect(registry.publication.blockers).toContain("executive_summary_unbound");
  });
  it("does not turn a bound but unsupported material claim into an accepted one", () => {
    const result = auditBrief({brief, facts: [], calculations: []});
    expect(result.ok).toBe(false);
    expect(result.audit.findings.every(finding => finding.reason === "support_not_found")).toBe(true);
  });
});
