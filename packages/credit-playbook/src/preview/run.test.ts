import {describe, expect, it} from "vitest";

import {case01Evidence} from "../cases/gc01";
import {briefObjectFingerprints, briefObjectState, fingerprintOf, headlinesFor, meetingBriefInput, previewArtifactContent, runPreviewStep, type PreviewRunContext, type PreviewStepOutput} from "./run";
import {case01PreviewSteps} from "./workflow";

function runAll(premises: PreviewRunContext["premises"] = {}, request?: Partial<PreviewRunContext["request"]>) {
  const outputs = new Map<string, PreviewStepOutput>();
  const context: PreviewRunContext = {
    evidence: case01Evidence(),
    premises,
    outputs,
    request: {turn: 1, composition: "prepare_meeting", audience: {primary: "vp"}, form: "first_deliverable", pages: null, sponsorInstruction: "Ele falou em refinanciamento, mas não disse que tese quer levar nem que formato espera.", undefinedAspects: ["thesis", "format"], ...request},
    previousBrief: null,
  };
  const results: Array<{taskId: string; output: PreviewStepOutput}> = [];
  for (const step of case01PreviewSteps) {
    const {output} = runPreviewStep(step, context);
    outputs.set(step.taskId, output);
    results.push({taskId: step.taskId, output});
  }
  return {context, results, outputs};
}

describe("integration_preview run of Case 01", () => {
  it("runs the nine steps in order on the frozen evidence, every output carrying a state and fingerprints", () => {
    const {results} = runAll();
    expect(results).toHaveLength(9);
    for (const {taskId, output} of results) {
      expect(typeof output.state, taskId).toBe("string");
      expect(output.trace && typeof output.trace === "object" ? (output.trace as {outputFingerprint?: string}).outputFingerprint : undefined, taskId).toMatch(/^[a-f0-9]{64}$/);
    }
    const brief = results.at(-1)!.output;
    expect(brief.state).toBe("planned");
    // The honest state of the case today: the ledger, the statements and the wall are incomplete,
    // the scenarios are blocked on the frozen manifest, so their blocks are gaps naming the
    // pending objects; what is comparable fills the alternatives and the points for the thesis.
    const deliverable = brief.deliverable as {blocks: Array<{id: string; state: string; object_ids: string[]}>; objects_pending: Array<{id: string}>};
    const filled = deliverable.blocks.filter((block) => block.state === "filled").map((block) => block.id);
    expect(filled).toContain("initial_alternatives");
    expect(filled).toContain("points_for_thesis");
    expect(deliverable.blocks.find((block) => block.id === "debt_by_instrument")?.state).toBe("gap");
    expect(deliverable.objects_pending.map((object) => object.id)).toContain("c05");
    expect(results.map(({output}) => output.state)).toEqual(["incomplete", "incomplete", "conditioned", "incomplete", "partial", "partial", "blocked", "compared", "planned"]);
  });
  it("is deterministic: the same evidence and premises give the same fingerprints twice", () => {
    const first = runAll().results.map(({output}) => (output.trace as {outputFingerprint: string}).outputFingerprint);
    const second = runAll().results.map(({output}) => (output.trace as {outputFingerprint: string}).outputFingerprint);
    expect(second).toEqual(first);
  });
  it("applies a changed premise only to the alternatives, so every other step replays unchanged", () => {
    const base = runAll();
    const changed = runAll({newDebtAnnualRate: "0.1550"});
    for (const step of case01PreviewSteps) {
      const before = (base.outputs.get(step.taskId)!.trace as {outputFingerprint: string}).outputFingerprint;
      const after = (changed.outputs.get(step.taskId)!.trace as {outputFingerprint: string}).outputFingerprint;
      if (step.methodId === "compare-refinancing-before-after" || step.methodId === "plan-meeting-brief") expect(after, step.taskId).not.toBe(before);
      else expect(after, step.taskId).toBe(before);
    }
    const content = previewArtifactContent(case01PreviewSteps.find((step) => step.methodId === "compare-refinancing-before-after")!, changed.outputs.get("S10")!, {newDebtAnnualRate: "0.1550"});
    expect((content.preview as {premisesApplied: unknown}).premisesApplied).toEqual({newDebtAnnualRate: "0.1550"});
    expect((content.preview as {methodMaturity: string}).methodMaturity).toBe("implemented");
  });
  it("cites facts only from signed fields, and the material plan of turn two carries a change note against turn one", () => {
    const first = runAll();
    const ledger = first.outputs.get("C05")!;
    const facts = headlinesFor(case01PreviewSteps[0]!, ledger, fingerprintOf({...ledger}));
    expect(facts[0]?.value?.amount).toBe(ledger.gross_debt);
    expect(briefObjectState(ledger)).toBe(ledger.state);
    const second = runAll({}, {turn: 2, composition: "prepare_material", audience: {primary: "vp", others: ["companhia"]}, form: "pitch_pages", pages: 3, sponsorInstruction: "Meu VP quer três páginas de pitch: situação atual, alternativas e impacto nos indicadores.", undefinedAspects: []});
    second.context.previousBrief = {output: first.outputs.get("A01")!, objectFingerprints: briefObjectFingerprints(first.outputs)};
    const input = meetingBriefInput(second.context);
    expect(input.previousVersion?.outputFingerprint).toBe((first.outputs.get("A01")!.trace as {outputFingerprint: string}).outputFingerprint);
    const brief = runPreviewStep(case01PreviewSteps.at(-1)!, second.context).output;
    expect((brief.page_plan as {state: string}).state).toBe("proposed");
    expect(brief.change_note).not.toBeNull();
  });
});
