import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {describe, expect, it} from "vitest";
import {
  currentCapabilityLedger,
  currentEndgameProgramBoard,
  evaluateEndgameProgramBoard,
  masterTrustControlCatalogue,
  renderEndgameProgramBoard,
  type EndgameProgramBoard,
} from "./index";

function boardWithTask(taskId: string, update: (task: EndgameProgramBoard["tasks"][number]) => EndgameProgramBoard["tasks"][number]): EndgameProgramBoard {
  return {
    ...currentEndgameProgramBoard,
    tasks: currentEndgameProgramBoard.tasks.map((task) => task.taskId === taskId ? update(task) : task),
  };
}

describe("endgame program board", () => {
  it("accepts the honest baseline while keeping promotion blocked by material reconciliation findings", () => {
    const decision = evaluateEndgameProgramBoard(currentEndgameProgramBoard, currentCapabilityLedger, masterTrustControlCatalogue);

    expect(decision.valid).toBe(true);
    expect(decision.readyForNextPromotion).toBe(false);
    expect(decision.blockers).toEqual([]);
    expect(decision.taskCounts.blocked).toBe(1);
    expect(currentEndgameProgramBoard.tasks).toHaveLength(62);
  });

  it("refuses gate_passed when acceptance, evidence, dependencies or transition are incomplete", () => {
    const invalid = boardWithTask("CTRL-03", (task) => ({...task, state: "gate_passed"}));
    const decision = evaluateEndgameProgramBoard(invalid, currentCapabilityLedger, masterTrustControlCatalogue);

    expect(decision.valid).toBe(false);
    expect(decision.blockers).toEqual(expect.arrayContaining([
      {code: "terminal_task_has_open_subtasks", taskId: "CTRL-03"},
      {code: "terminal_task_acceptance_incomplete", taskId: "CTRL-03"},
      {code: "terminal_task_requires_evidence", taskId: "CTRL-03"},
      {code: "terminal_task_requires_recorded_capability_transition", taskId: "CTRL-03"},
    ]));
  });

  it("refuses a recorded transition that did not land in the capability ledger", () => {
    const invalid = boardWithTask("RT-01", (task) => ({
      ...task,
      capabilityTransition: task.capabilityTransition ? {
        ...task.capabilityTransition,
        status: "recorded",
        evidenceRefs: ["EV-INTENT-GATE"],
      } : null,
    }));
    const decision = evaluateEndgameProgramBoard(invalid, currentCapabilityLedger, masterTrustControlCatalogue);

    expect(decision.valid).toBe(false);
    expect(decision.blockers).toContainEqual({code: "recorded_transition_not_reflected_in_ledger", taskId: "RT-01"});
  });

  it("refuses dangling evidence and dependency cycles", () => {
    const withEvidence = boardWithTask("CTRL-01", (task) => ({...task, evidenceRefs: [...task.evidenceRefs, "EV-NOT-REAL"]}));
    const invalid: EndgameProgramBoard = {
      ...withEvidence,
      tasks: withEvidence.tasks.map((task) => {
        if (task.taskId === "CTRL-01") return {...task, dependsOn: ["CTRL-02"]};
        if (task.taskId === "CTRL-02") return {...task, dependsOn: ["CTRL-01"]};
        return task;
      }),
    };
    const decision = evaluateEndgameProgramBoard(invalid, currentCapabilityLedger, masterTrustControlCatalogue);

    expect(decision.valid).toBe(false);
    expect(decision.blockers).toEqual(expect.arrayContaining([
      {code: "task_evidence_missing:EV-NOT-REAL", taskId: "CTRL-01"},
      expect.objectContaining({code: "dependency_cycle"}),
    ]));
  });

  it("refuses a security control that is not in the canonical Control Register", () => {
    const invalid = boardWithTask("SEC-01", (task) => ({...task, securityControlIds: [...task.securityControlIds, "TRUST-FAKE-99"]}));
    const decision = evaluateEndgameProgramBoard(invalid, currentCapabilityLedger, masterTrustControlCatalogue);

    expect(decision.valid).toBe(false);
    expect(decision.blockers).toContainEqual({code: "unknown_security_control:TRUST-FAKE-99", taskId: "SEC-01"});
  });

  it("refuses expired evidence and incomplete external assessments", () => {
    const invalid: EndgameProgramBoard = {
      ...currentEndgameProgramBoard,
      evidenceIndex: currentEndgameProgramBoard.evidenceIndex.map((evidence) => evidence.evidenceId === "EV-INTENT-GATE"
        ? {...evidence, validThrough: "2026-09-06T00:00:00.000-03:00"}
        : evidence).concat({
          evidenceId: "EV-EXTERNAL-INCOMPLETE",
          kind: "external_assessment",
          ref: "independent-assessment-register",
          environment: "external",
          capturedAt: "2026-09-07T00:00:00.000-03:00",
          description: "Synthetic incomplete assessment for negative testing",
          immutableFingerprint: null,
          validThrough: null,
        }),
    };
    const decision = evaluateEndgameProgramBoard(invalid, currentCapabilityLedger, masterTrustControlCatalogue, new Date("2026-09-07T12:00:00.000-03:00"));

    expect(decision.valid).toBe(false);
    expect(decision.blockers).toEqual(expect.arrayContaining([
      {code: "acceptance_evidence_expired:EV-INTENT-GATE", taskId: "RT-01"},
      {code: "task_evidence_expired:EV-INTENT-GATE", taskId: "RT-01"},
      {code: "external_assessment_requires_fingerprint_and_validity", taskId: null},
    ]));
  });

  it("keeps the generated Markdown byte-identical to the canonical board", () => {
    const decision = evaluateEndgameProgramBoard(currentEndgameProgramBoard, currentCapabilityLedger, masterTrustControlCatalogue);
    const path = fileURLToPath(new URL("../../../docs/build/ENDGAME_PROGRAM_BOARD.md", import.meta.url));
    expect(readFileSync(path, "utf8")).toBe(renderEndgameProgramBoard(currentEndgameProgramBoard, decision.boardFingerprint));
  });
});
