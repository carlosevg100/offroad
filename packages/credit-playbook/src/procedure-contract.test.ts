import {describe, expect, it} from "vitest";

import {
  canonicalProcedureSchema,
  compileProcedure,
  compileProcedureRegistry,
  financialDebtTruthProcedureRegistry,
  financialDebtTruthProcedures,
  growthCapexProcedureRegistry,
  growthCapexProcedures,
  languageConductProcedureRegistry,
  languageConductProcedures,
  institutionalProcedureRegistryHash,
  materialTemplateRegistryHash,
  materialTemplates,
  referenceDataKeys,
} from "./index";

const draft = (objective = "Executar uma atividade verificável.") => canonicalProcedureSchema.parse({
  id: "draft-procedure",
  version: "2026.08.25-v1",
  maturity: "draft",
  title: {pt: "Procedimento draft", en: "Draft procedure"},
  role: "financial_analysis",
  blueprintStage: 5,
  owner: {role: "Head de Análise Financeira"},
  objective,
  product: "Saída estruturada.",
  procedure: [{id: "execute", title: "Executar", instructions: ["Aplicar o método."], mode: "deterministic", tools: [], evidenceInputs: []}],
  output: {schemaId: "offroad.draft.v1", fields: [{id: "status", type: "enum", required: true, description: "Estado.", evidenceRequired: false, allowedValues: ["completed", "blocked"]}]},
  evidence: {hierarchy: ["Fonte governada"], rules: ["Citar suporte."], materialClaimsRequireSupport: true},
  tests: {unit: ["schema"], gold: ["positivo"], adversarial: ["negativo"], acceptance: ["rastreável"]},
  source: {path: "test", effectiveDate: "2026-08-25"},
});

describe("canonical procedure contract", () => {
  it("lets a procedure start with the six-part minimum contract", () => {
    const procedure = draft();
    expect(procedure.maturity).toBe("draft");
    expect(compileProcedure(procedure).outputSchema).toMatchObject({type: "object", additionalProperties: false});
  });

  it("requires the expanded contract before candidate maturity", () => {
    expect(() => canonicalProcedureSchema.parse({...draft(), maturity: "candidate"})).toThrow(/require/i);
  });

  it("requires an approver and examples before production", () => {
    const candidate = growthCapexProcedures[0]!;
    expect(() => canonicalProcedureSchema.parse({...candidate, maturity: "production", owner: {role: candidate.owner.role}})).toThrow(/approver|examples/i);
  });

  it("does not promote a documented candidate without an executor, persistence and evaluation evidence", () => {
    const candidate = growthCapexProcedures[0]!;
    expect(() => canonicalProcedureSchema.parse({
      ...candidate,
      maturity: "production",
      owner: {...candidate.owner, approvedBy: "Head de Crédito"},
    })).toThrow(/executable implementation evidence/i);
  });

  it("carries verified implementation evidence into a production skill", () => {
    const candidate = growthCapexProcedures[0]!;
    const production = canonicalProcedureSchema.parse({
      ...candidate,
      maturity: "production",
      owner: {...candidate.owner, approvedBy: "Head de Crédito"},
      implementation: {
        executor: {module: "@offroad/case-engine", exportName: "runProcedure"},
        resultContract: "offroad.test.result.v1",
        connectedProductStates: ["understanding_in_progress"],
        persistence: {mode: "persisted", target: "case_procedure_results"},
        evaluation: {
          unitTestFiles: ["packages/case-engine/src/procedure.test.ts"],
          goldCaseIds: ["gold:clean"],
          adversarialCaseIds: ["adversarial:conflict"],
          e2eScenarioIds: ["e2e:understanding"],
          costEvalIds: ["cost:understanding"],
        },
      },
    });
    expect(compileProcedure(production).implementation).toEqual(production.implementation);
  });

  it("compiles reproducibly and changes the source hash when knowledge changes", () => {
    const first = compileProcedure(draft());
    const again = compileProcedure(draft());
    const changed = compileProcedure(draft("Executar uma atividade materialmente diferente."));
    expect(first).toEqual(again);
    expect(first.sourceHash).toMatch(/^[a-f0-9]{64}$/);
    expect(changed.sourceHash).not.toBe(first.sourceHash);
  });

  it("carries House Playbook lineage and versioned reference data into the compiled skill", () => {
    const procedure = canonicalProcedureSchema.parse({
      ...draft(),
      knowledge: {
        houseProcedureIds: ["D-27"],
        authorities: ["CASA", "MERCADO"],
        referenceDataKeys: ["stress.interest_rate.parallel_shock"],
        legalReviewRequired: false,
      },
    });
    const skill = compileProcedure(procedure);
    expect(skill.knowledge).toEqual(procedure.knowledge);
    expect(skill.instructions).toContain("D-27");
    expect(skill.instructions).toContain("stress.interest_rate.parallel_shock");
  });

  it("does not label a procedure for legal review without LEI authority", () => {
    expect(() => canonicalProcedureSchema.parse({
      ...draft(),
      knowledge: {houseProcedureIds: ["ES-13"], authorities: ["CASA"], referenceDataKeys: [], legalReviewRequired: true},
    })).toThrow(/LEI authority/);
  });

  it("hard-codes deterministic orchestration and forbids peer handoffs", () => {
    for (const skill of growthCapexProcedureRegistry.skills) {
      expect(skill.runtime.orchestration).toBe("deterministic_pipeline");
      expect(skill.runtime.peerHandoffs).toBe(false);
      expect(skill.runtime.maxModelCalls).toBeLessThanOrEqual(3);
      expect(skill.instructions).toContain("Não delegue, não converse com outros agentes");
    }
  });

  it("refuses unknown dependencies, templates and dependency cycles", () => {
    expect(() => compileProcedureRegistry([{...draft(), dependencies: ["unknown-procedure"]}], [])).toThrow(/unknown procedure/);
    expect(() => compileProcedureRegistry([{...draft(), templates: ["unknown-template"]}], [])).toThrow(/unknown template/);
    expect(() => compileProcedureRegistry([{...draft(), knowledge: {...draft().knowledge, referenceDataKeys: ["unknown.reference"]}}], [], referenceDataKeys)).toThrow(/unknown reference data/);
    const one = {...draft(), id: "cycle-one", dependencies: ["cycle-two"]};
    const two = {...draft(), id: "cycle-two", dependencies: ["cycle-one"]};
    expect(() => compileProcedureRegistry([one, two], [])).toThrow(/cycle/);
  });
});

describe("growth capex vertical", () => {
  it("covers all twelve blueprint stages with atomic, candidate procedures", () => {
    expect(new Set(growthCapexProcedures.map((procedure) => procedure.blueprintStage))).toEqual(new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]));
    expect(growthCapexProcedures.length).toBeGreaterThanOrEqual(18);
    expect(growthCapexProcedures.every((procedure) => procedure.maturity === "candidate")).toBe(true);
    expect(growthCapexProcedures.every((procedure) => procedure.knowledge.houseProcedureIds.length > 0)).toBe(true);
    expect(growthCapexProcedures.flatMap((procedure) => procedure.knowledge.referenceDataKeys)
      .every((key) => referenceDataKeys.includes(key))).toBe(true);
  });

  it("binds every material procedure to a canonical template", () => {
    const materialProcedures = growthCapexProcedures.filter((procedure) => procedure.role === "institutional_materials");
    expect(materialProcedures.length).toBeGreaterThanOrEqual(4);
    for (const procedure of materialProcedures) expect(procedure.templates.length).toBeGreaterThan(0);
  });

  it("keeps templates inside the same governed registry", () => {
    expect(materialTemplateRegistryHash).toMatch(/^[a-f0-9]{64}$/);
    expect(materialTemplates.map((template) => template.id)).toEqual([
      "institutional-teaser",
      "institutional-credit-memo",
      "indicative-term-sheet",
      "institutional-data-room-index",
    ]);
    for (const template of materialTemplates) {
      expect(template.maturity).toBe("candidate");
      expect(template.consistencyChecks.length).toBeGreaterThanOrEqual(5);
      expect(template.sections.every((section) => section.contentRules.length > 0 && section.evidenceRules.length > 0)).toBe(true);
    }
  });

  it("produces a stable registry fingerprint for artifact manifests", () => {
    expect(growthCapexProcedureRegistry.registryHash).toMatch(/^[a-f0-9]{64}$/);
    expect(new Set(growthCapexProcedureRegistry.skills.map((skill) => skill.sourceHash)).size).toBe(growthCapexProcedures.length);
  });
});

describe("language and conduct procedures", () => {
  it("compiles LC-01 to LC-13 as individually promotable deterministic candidates", () => {
    expect(languageConductProcedures).toHaveLength(13);
    expect(languageConductProcedures.map((procedure) => procedure.knowledge.houseProcedureIds[0])).toEqual(
      Array.from({length: 13}, (_, index) => `LC-${String(index + 1).padStart(2, "0")}`),
    );
    for (const procedure of languageConductProcedures) {
      expect(procedure.maturity).toBe("candidate");
      expect(procedure.runtime).toMatchObject({
        orchestration: "deterministic_pipeline",
        peerHandoffs: false,
        maxModelCalls: 0,
      });
      expect(procedure.runtime.allowedTools).toEqual(["conduct_policy"]);
    }
    expect(languageConductProcedureRegistry.registryHash).toMatch(/^[a-f0-9]{64}$/u);
  });
});

describe("M2 and M3 procedure compilation", () => {
  it("compiles Q-01 to Q-18 and D-01 to D-31 as individually governed candidate skills", () => {
    expect(financialDebtTruthProcedures).toHaveLength(49);
    expect(financialDebtTruthProcedures.map((procedure) => procedure.knowledge.houseProcedureIds[0])).toEqual([
      ...Array.from({length: 18}, (_, index) => `Q-${String(index + 1).padStart(2, "0")}`),
      ...Array.from({length: 31}, (_, index) => `D-${String(index + 1).padStart(2, "0")}`),
    ]);
    for (const procedure of financialDebtTruthProcedures) {
      expect(procedure.maturity).toBe("candidate");
      expect(procedure.runtime).toMatchObject({orchestration: "deterministic_pipeline", peerHandoffs: false, maxModelCalls: 0});
      expect(procedure.procedure).toHaveLength(3);
    }
    expect(financialDebtTruthProcedureRegistry.registryHash).toMatch(/^[a-f0-9]{64}$/);
    expect(institutionalProcedureRegistryHash).toMatch(/^[a-f0-9]{64}$/);
  });
});
