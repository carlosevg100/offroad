import {describe, expect, it} from "vitest";

import {auditCompiledMaterial, type Material} from "./index";

describe("compiled material conduct shadow", () => {
  it("records a clean bilingual artifact with a stable fingerprint", () => {
    const material: Material = {
      kind: "teaser",
      title: {pt: "Oportunidade", en: "Opportunity"},
      blocks: [{type: "paragraph", text: {pt: "Prazo indicativo de 48 meses.", en: "Indicative tenor of 48 months."}, claimId: "term", supportIds: ["term.tenor"]}],
      dependsOn: ["term.tenor"],
    };
    const audit = auditCompiledMaterial(material);
    expect(audit.status).toBe("pass");
    expect(audit.fingerprint).toMatch(/^[a-f0-9]{64}$/u);
  });

  it("surfaces a funding promise without silently rewriting it", () => {
    const material: Material = {
      kind: "teaser",
      title: {pt: "Oportunidade", en: "Opportunity"},
      blocks: [{type: "paragraph", text: {pt: "O financiamento está aprovado.", en: "The financing is approved."}, claimId: "promise", supportIds: ["email-1"]}],
      dependsOn: ["email-1"],
    };
    const audit = auditCompiledMaterial(material);
    expect(audit.status).toBe("blocked");
    expect(audit.findings).toContainEqual(expect.objectContaining({ruleId: "LC-05", code: "outcome_promise"}));
  });
});
