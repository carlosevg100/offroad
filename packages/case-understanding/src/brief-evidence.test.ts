import {describe, expect, it} from "vitest";
import type {InformationGap, ReconciledFact, TracedCalculation} from "@offroad/reconciliation";
import {auditBrief, briefAuthoringSchema, compileAuthoredBrief, resolveExecutiveSummaryClaims} from "./brief";
import {buildBriefEvidenceCatalog} from "./brief-evidence";
import {buildSemanticAuditInput} from "./semantic-audit";

const fact = (value: string, periodEnd: string): ReconciledFact => ({
  key: {fieldPath: "revenue", periodEnd}, value, valueType: "number", disputed: false, conflicts: [],
  accepted: {fieldPath: "revenue", periodEnd, normalizedValue: value, valueType: "number", sourceDocument: "accounts.pdf", evidenceRank: 1, informationClass: "audited", confidence: 1, anchorVerified: true},
});
const gap: InformationGap = {id: "missing_field:dscr", reference: "dscr", severity: "high", title: "Cobertura", description: "Solicitar projeções; não presumir DSCR de 1,20x.", ownerRole: "company"};
const calculation: TracedCalculation = {id: "net_debt", value: "34000000", labels: {pt: "Dívida líquida", en: "Net debt"}, inputs: [], trace: [], warnings: []};
const input = {facts: [fact("40000000", "2025-12-31")], calculations: [calculation], gaps: [gap], exceptions: []};
const claim = {id: "need", text: "A cobertura ainda precisa ser verificada nesta análise.", material: true, kind: "fact" as const, supportIds: [`gap:${gap.id}`]};
const draft = {sections: [{id: "risks" as const, heading: "Pendências", claims: [claim]}], executiveSummaryClaimIds: [claim.id]};

describe("shared brief evidence contract", () => {
  it("gives all three participants the same exact citation ids", () => {
    const catalog = buildBriefEvidenceCatalog(input);
    const authored = briefAuthoringSchema(input).parse(draft);
    const brief = compileAuthoredBrief(authored);
    expect(auditBrief({...input, brief}).ok).toBe(true);
    const review = JSON.parse(buildSemanticAuditInput({...input, brief}));
    expect(review.claims[0].support[0]).toEqual({id: `gap:${gap.id}`, evidenceKind: "gap", value: catalog.get(`gap:${gap.id}`)!.description});
    expect(review.claims[0].support[0].value).toContain("does not prove that a document does not exist");
  });
  it("rejects invented calculation prefixes and any id outside the current case catalog", () => {
    for (const supportId of ["calculated.net_debt", "gap:another-case", "made-up"]) {
      const changed = {...draft, sections: [{...draft.sections[0]!, claims: [{...claim, supportIds: [supportId]}]}]};
      expect(briefAuthoringSchema(input).safeParse(changed).success).toBe(false);
    }
  });
  it("cannot turn a gap's suggested threshold into a financial observation", () => {
    const brief = compileAuthoredBrief({...draft, sections: [{...draft.sections[0]!, claims: [{...claim, text: "O DSCR é de 1,20x."}]}]});
    const audited = auditBrief({...input, brief});
    expect(audited.ok).toBe(false);
    expect(audited.audit.findings).toContainEqual(expect.objectContaining({reason: "number_not_in_support"}));
  });
  it("invalidates a gap citation when that requirement no longer belongs to the current analysis", () => {
    const brief = compileAuthoredBrief(draft);
    expect(auditBrief({...input, gaps: [], brief}).audit.findings).toContainEqual(expect.objectContaining({reason: "support_not_found"}));
    expect(buildBriefEvidenceCatalog({facts: [], calculations: []}).has("review:reconciliation")).toBe(false);
    expect(buildBriefEvidenceCatalog(input).get("review:reconciliation")!.description).toContain("does not prove that all documents agree");
  });
  it("requires period-qualified ids when a field has more than one period", () => {
    const catalog = buildBriefEvidenceCatalog({...input, facts: [fact("40000000", "2025-12-31"), fact("30000000", "2024-12-31")]});
    expect(catalog.has("revenue")).toBe(false);
    expect(catalog.get("revenue|2025-12-31")!.numericValue).toBe("40000000");
    expect(catalog.get("revenue|2024-12-31")!.numericValue).toBe("30000000");
  });
  it("binds new summaries by identity even when two sections contain the same text", () => {
    const second = {...claim, id: "second", supportIds: ["review:reconciliation"]};
    const brief = compileAuthoredBrief({...draft, sections: [{...draft.sections[0]!, claims: [claim, second]}], executiveSummaryClaimIds: [second.id]});
    expect(resolveExecutiveSummaryClaims(brief)).toEqual([second]);
    expect(resolveExecutiveSummaryClaims({...brief, executiveSummary: "Texto acrescentado sem revisão."})).toBeNull();
    expect(() => compileAuthoredBrief({...draft, executiveSummaryClaimIds: [claim.id, claim.id]})).toThrow("summary_claim_selection_invalid");
    expect(() => compileAuthoredBrief({...draft, executiveSummaryClaimIds: ["unknown"]})).toThrow("summary_claim_selection_invalid");
  });
});

describe("executive opening context", () => {
  const identity = {id: "entity", text: "A companhia é Azul S.A.", material: true, kind: "fact" as const, supportIds: ["company.legal_name"]};
  const request = {id: "request", text: "Solicita R$ 12 milhões.", material: true, kind: "fact" as const, supportIds: ["transaction.requested_amount"]};
  const sections = [
    {id: "identity" as const, heading: "Companhia", claims: [identity]},
    {id: "request" as const, heading: "Pedido", claims: [request]},
    ...draft.sections,
  ];
  it("retains authored facts and adds omitted context before selected conclusions", () => {
    const result = compileAuthoredBrief({sections, executiveSummaryClaimIds: [claim.id]});
    expect(result.executiveSummaryClaimIds).toEqual([identity.id, request.id, claim.id]);
    expect(result.executiveSummary).toBe([identity.text, request.text, claim.text].join("\n\n"));
    expect(result.sections).toEqual(sections);
    expect(compileAuthoredBrief({...result, executiveSummaryClaimIds: result.executiveSummaryClaimIds!})).toEqual(result);
  });
  it("does not duplicate supported context already selected by the author", () => {
    const result = compileAuthoredBrief({sections, executiveSummaryClaimIds: [request.id, identity.id, claim.id]});
    expect(result.executiveSummaryClaimIds).toEqual([request.id, identity.id, claim.id]);
  });
  it("does not invent missing context or promote opinions or non-material context", () => {
    for (const changed of [{...identity, kind: "judgment" as const}, {...identity, material: false}]) {
      const result = compileAuthoredBrief({sections: [{id: "identity", heading: "Company", claims: [changed]}, ...draft.sections], executiveSummaryClaimIds: [claim.id]});
      expect(result.executiveSummaryClaimIds).toEqual([claim.id]);
    }
    expect(compileAuthoredBrief(draft).executiveSummaryClaimIds).toEqual([claim.id]);
  });
  it("refuses a non-material summary selection", () => {
    expect(() => compileAuthoredBrief({sections: [{...sections[0]!, claims: [{...identity, material: false}]}], executiveSummaryClaimIds: [identity.id]})).toThrow("summary_claim_must_be_material");
  });
  it("does not silently remove conclusions when added context exceeds the text limit", () => {
    const long = Array.from({length: 6}, (_, i) => ({...claim, id: `long-${i}`, text: "x".repeat(660)}));
    expect(() => compileAuthoredBrief({sections: [...sections, {id: "risks", heading: "Risks", claims: long}], executiveSummaryClaimIds: long.map(c => c.id)})).toThrow();
  });
  it("requires supplied opening facts to have a material factual claim", () => {
    const entityFact = {...input.facts[0]!, key: {fieldPath: "company.legal_name"}, value: "Azul S.A.", valueType: "text" as const,
      accepted: {...input.facts[0]!.accepted, fieldPath: "company.legal_name", normalizedValue: "Azul S.A.", valueType: "text" as const}};
    const schema = briefAuthoringSchema({...input, facts: [entityFact]});
    expect(schema.safeParse(draft).success).toBe(false);
    expect(schema.safeParse({sections: [sections[0]!, ...draft.sections], executiveSummaryClaimIds: [claim.id]}).success).toBe(true);
  });
});
