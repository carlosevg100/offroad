import {describe, expect, it} from "vitest";
import {documentKindSchema, resolveFieldPath} from "@offroad/credit-ontology";

import {archetype, archetypes} from "./archetypes";
import {assessSufficiency, missingByPurpose, nextStep, stageOf} from "./sufficiency";
import {archetypeIdSchema} from "./types";

describe("playbook integrity", () => {
  it("names only document kinds the ontology defines", () => {
    // A typo here would silently produce a requirement nothing can ever discharge — a company
    // asked forever for a document the system cannot recognise.
    for (const definition of archetypes) {
      for (const requirement of definition.requirements) {
        // Only document items are discharged by a file. An information item is answered and a
        // notice is neither answered nor uploaded, so both must name no document kind at all —
        // a kind on one of those would be a request nothing could ever close.
        if (requirement.source !== undefined && requirement.source !== "document") {
          expect(requirement.satisfiedBy, `${definition.id}/${requirement.id}`).toHaveLength(0);
          continue;
        }
        expect(requirement.satisfiedBy.length).toBeGreaterThan(0);
        for (const kind of requirement.satisfiedBy) {
          expect(documentKindSchema.safeParse(kind).success).toBe(true);
        }
      }
    }
  });

  it("asks for information as well as files, with the question and an example", () => {
    // Nobody uploads a document that explains why now. A request that only asks for files
    // leaves the qualitative half of the case to be discovered on a call with an investor.
    for (const definition of archetypes) {
      const information = definition.requirements.filter((requirement) => requirement.source === "information");
      expect(information.length, definition.id).toBeGreaterThanOrEqual(6);
      for (const requirement of information) {
        expect(requirement.question?.pt.length, requirement.id).toBeGreaterThan(20);
        expect(requirement.question?.en.length, requirement.id).toBeGreaterThan(20);
        expect(requirement.example?.pt, requirement.id).toBeTruthy();
        expect(requirement.answerFormat, requirement.id).toBeTruthy();
      }
    }
  });

  it("keeps the day-zero ask small enough that nobody reads it as a data room", () => {
    // The market's own guidance for a first request is roughly 15–20 items. Past that a
    // company stops reading and starts estimating how many weeks this will take. This is the
    // guardrail on the whole product: anything genuinely needed later belongs in a later
    // stage, not in the first screen.
    for (const definition of archetypes) {
      const now = definition.requirements.filter((requirement) => stageOf(requirement) === "now");
      expect(now.length, `${definition.id} asks for ${now.length} things on day zero`).toBeLessThanOrEqual(20);
      // And it must not be so short that the desk cannot open a case either.
      expect(now.length, definition.id).toBeGreaterThanOrEqual(6);
    }
  });

  it("shows every operation the road past the first request", () => {
    // A company that finishes the first list and then meets a four-times-longer diligence list
    // concludes the platform under-asked. Naming the road costs a paragraph.
    for (const definition of archetypes) {
      const later = definition.requirements.filter((requirement) => stageOf(requirement) !== "now");
      expect(later.some((requirement) => stageOf(requirement) === "diligence"), definition.id).toBe(true);
      expect(later.some((requirement) => stageOf(requirement) === "closing"), definition.id).toBe(true);
    }
  });

  it("never lets a closing item count against the company", () => {
    const report = assessSufficiency("growth_expansion", [], {});
    const closing = report.byStage.closing;
    expect(closing.length).toBeGreaterThan(0);
    // Present on the screen, absent from every number and from the missing list.
    expect(report.missing.some((status) => status.stage === "closing")).toBe(false);
    expect(report.minimum.total + report.ideal.total).toBe(report.requirements.length - closing.length);
  });

  it("lets a company close an item that does not apply to it, with a reason", () => {
    const withReason = assessSufficiency("working_capital", [], {}, {
      receivables_aging: {response: "not_applicable", note: "Vendemos à vista; não há carteira a receber."},
    });
    const status = withReason.requirements.find((entry) => entry.requirement.id === "receivables_aging");
    expect(status?.satisfied).toBe(true);
    expect(status?.response).toBe("not_applicable");
  });

  it("does not let a bare 'not applicable' make the item go away", () => {
    const bare = assessSufficiency("working_capital", [], {}, {receivables_aging: {response: "not_applicable"}});
    expect(bare.requirements.find((entry) => entry.requirement.id === "receivables_aging")?.satisfied).toBe(false);
    const blank = assessSufficiency("working_capital", [], {}, {receivables_aging: {response: "not_applicable", note: "   "}});
    expect(blank.requirements.find((entry) => entry.requirement.id === "receivables_aging")?.satisfied).toBe(false);
  });

  it("treats partial and after-the-NDA as position, not as delivery", () => {
    // Both are the company telling us where it stands, which is worth recording and is not
    // the same as the desk having what it needs.
    for (const response of ["partial", "after_nda"] as const) {
      const report = assessSufficiency("working_capital", [], {}, {
        receivables_aging: {response, note: "Fechamento do mês sai dia 10."},
      });
      const status = report.requirements.find((entry) => entry.requirement.id === "receivables_aging");
      expect(status?.satisfied, response).toBe(false);
      expect(status?.response, response).toBe(response);
      expect(status?.note, response).toBe("Fechamento do mês sai dia 10.");
    }
  });

  it("tells the company which file to actually send", () => {
    // A requirement labelled "Historical financial statements" is a category, and a company
    // staring at a category sends the wrong thing or nothing. The concrete artifact — "the
    // audited PDF signed by the auditor" — is what people can act on.
    for (const definition of archetypes) {
      for (const requirement of definition.requirements) {
        // Notices are neither uploaded nor answered: there is no file to name and no
        // question to ask, which is the whole point of them being a separate source.
        if (requirement.source !== undefined && requirement.source !== "document") continue;
        expect(requirement.accepts?.length, `${definition.id}/${requirement.id}`).toBeGreaterThan(0);
        for (const entry of requirement.accepts ?? []) {
          expect(entry.pt.length).toBeGreaterThan(20);
          expect(entry.en.length).toBeGreaterThan(20);
          // Naming the usual format is what stops a company sending a screenshot of a
          // spreadsheet, or a PDF of a model whose formulas are the thing we need.
          expect(entry.pt, `${requirement.id}: ${entry.pt}`).toMatch(/\(|\.xlsx|PDF|\.pptx|\.csv|\.docx/);
        }
      }
    }
  });

  it("asks for the spreadsheet, not a picture of it, where the formulas are the point", () => {
    const plan = archetype("growth_expansion").requirements.find((requirement) => requirement.id === "project_plan");
    expect(plan?.accepts?.[0]?.pt).toContain("premissas");
    expect(plan?.accepts?.[0]?.pt).toContain("não envie só o PDF");
  });

  it("asks every operation for the institutional material", () => {
    for (const definition of archetypes) {
      expect(definition.requirements.some((r) => r.id === "institutional_materials"), definition.id).toBe(true);
    }
  });

  it("says what every item unblocks", () => {
    for (const definition of archetypes) {
      for (const requirement of definition.requirements) {
        expect(requirement.purposes.length, `${definition.id}/${requirement.id}`).toBeGreaterThan(0);
      }
      // Storytelling is the purpose people forget, and the one that changes how much gets
      // raised. Every operation asks for at least one thing that serves it.
      const purposes = new Set(definition.requirements.flatMap((requirement) => requirement.purposes));
      expect(purposes.has("storytelling"), definition.id).toBe(true);
      expect(purposes.has("financials"), definition.id).toBe(true);
    }
  });

  it("cites field paths the ontology can resolve", () => {
    for (const definition of archetypes) {
      for (const focus of definition.focus) {
        for (const path of focus.evidence) {
          // Patterns carry placeholders; resolve a concrete instance of each.
          const concrete = path.replace("{period}", "2025").replace("{i}", "1").replace("{ytd}", "");
          expect(resolveFieldPath(concrete), `${definition.id}/${focus.id}: ${path}`).not.toBeNull();
        }
      }
    }
  });

  it("covers every archetype the schema allows, with unique requirement ids", () => {
    const ids = archetypes.map((a) => a.id).sort();
    expect(ids).toEqual([...archetypeIdSchema.options].sort());
    for (const definition of archetypes) {
      const requirementIds = definition.requirements.map((r) => r.id);
      expect(new Set(requirementIds).size, definition.id).toBe(requirementIds.length);
    }
  });

  it("has a minimum that can actually refuse, and an ideal that adds to it", () => {
    for (const definition of archetypes) {
      const minimum = definition.requirements.filter((r) => r.level === "minimum");
      const ideal = definition.requirements.filter((r) => r.level === "ideal");
      expect(minimum.length, definition.id).toBeGreaterThanOrEqual(5);
      expect(ideal.length, definition.id).toBeGreaterThan(0);
    }
  });

  it("says why every requirement matters, in both languages", () => {
    // A checklist that says what without why is a form. This is the line that keeps it a desk.
    for (const definition of archetypes) {
      for (const requirement of definition.requirements) {
        expect(requirement.rationale.pt.length, requirement.id).toBeGreaterThan(40);
        expect(requirement.rationale.en.length, requirement.id).toBeGreaterThan(40);
      }
    }
  });

  it("keeps every question attached to a focus that exists", () => {
    for (const definition of archetypes) {
      const focusIds = new Set(definition.focus.map((f) => f.id));
      for (const question of definition.questions) {
        expect(focusIds.has(question.focusId), `${definition.id}/${question.id}`).toBe(true);
      }
    }
  });

  it("frames tenor as bands, with the typical inside the outer", () => {
    for (const definition of archetypes) {
      const {typical, outer} = definition.structure.tenorMonths;
      expect(typical[0], definition.id).toBeGreaterThanOrEqual(outer[0]);
      expect(typical[1], definition.id).toBeLessThanOrEqual(outer[1]);
      expect(typical[0]).toBeLessThan(typical[1]);
    }
  });
});

describe("sufficiency", () => {
  const growth = archetype("growth_expansion");

  it("answers the checklist from what was read, not from what was asked", () => {
    const documents = [
      {id: "d1", kind: "audited_financial_statements" as const},
      {id: "d2", kind: "trial_balance" as const},
      {id: "d3", kind: "debt_schedule" as const},
      {id: "d4", kind: "company_registration" as const},
      {id: "d5", kind: "capital_request_letter" as const},
      {id: "d6", kind: "business_plan" as const},
    ];
    const answers = Object.fromEntries(
      growth.requirements.filter((r) => r.source === "information" && r.level === "minimum").map((r) => [r.id, "respondido"]),
    );
    const report = assessSufficiency("growth_expansion", documents, answers);
    expect(report.minimum.complete).toBe(true);
    expect(report.ideal.complete).toBe(false);
    expect(report.missing.every((status) => status.requirement.level === "ideal")).toBe(true);
  });

  it("lets one document discharge more than one requirement", () => {
    // Audited statements carry both the history and the auditor's opinion; asking twice for a
    // file already sent is exactly what makes an intake feel bureaucratic.
    const report = assessSufficiency("growth_expansion", [{id: "d1", kind: "audited_financial_statements"}]);
    const discharged = report.requirements.filter((status) => status.satisfiedBy.includes("d1"));
    expect(discharged.length).toBeGreaterThan(1);
    expect(discharged.map((status) => status.requirement.id)).toContain("financials_historical");
    expect(discharged.map((status) => status.requirement.id)).toContain("auditor_opinion");
  });

  it("puts the minimum first, so the next step is the one that unblocks", () => {
    const report = assessSufficiency("growth_expansion", []);
    expect(report.missing[0]?.requirement.level).toBe("minimum");
    expect(report.minimum.satisfied).toBe(0);
  });

  it("reports documents that matched nothing without treating them as a problem", () => {
    const report = assessSufficiency("working_capital", [
      {id: "d1", kind: "insurance_policy"},
      {id: "d2", kind: "debt_schedule"},
    ]);
    expect(report.unmatchedDocuments).toEqual(["d1"]);
    expect(report.requirements.find((s) => s.requirement.id === "debt_schedule")?.satisfied).toBe(true);
  });

  it("counts an information item only when the company actually answered", () => {
    const blank = assessSufficiency("growth_expansion", [], {info_why_now: "   "});
    expect(blank.requirements.find((s) => s.requirement.id === "info_why_now")?.satisfied).toBe(false);

    const answered = assessSufficiency("growth_expansion", [], {info_why_now: "Os pontos já estão contratados."});
    const status = answered.requirements.find((s) => s.requirement.id === "info_why_now");
    expect(status?.satisfied).toBe(true);
    expect(status?.answer).toContain("contratados");
  });

  it("groups what is missing by what it unblocks", () => {
    const grouped = missingByPurpose(assessSufficiency("growth_expansion", []));
    // People close gaps faster when they can see which part of the outcome each one buys.
    expect(grouped.financials.length).toBeGreaterThan(0);
    expect(grouped.storytelling.length).toBeGreaterThan(0);
    expect(grouped.investor_case.length).toBeGreaterThan(0);
  });

  it("names one next step rather than eleven, and in the user's language", () => {
    const blocked = nextStep(assessSufficiency("growth_expansion", []), "pt");
    expect(blocked.state).toBe("blocked");
    expect(blocked.message).toContain("para abrir o caso");

    const complete = assessSufficiency(
      "growth_expansion",
      growth.requirements.flatMap((requirement, index) => {
        const kind = requirement.satisfiedBy[0];
        return kind ? [{id: `d${index}`, kind}] : [];
      }),
      Object.fromEntries(growth.requirements.filter((r) => r.source === "information").map((r) => [r.id, "respondido"])),
    );
    expect(nextStep(complete, "en").state).toBe("priceable");
    expect(nextStep(complete, "pt").message).toContain("Pacote completo");
  });
});
