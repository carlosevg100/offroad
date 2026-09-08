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
    expect(decision.taskCounts.blocked).toBe(0);
    expect(currentEndgameProgramBoard.tasks).toHaveLength(69);
  });

  it("rejects a board evaluated against a different ledger version", () => {
    const mismatched = {...currentCapabilityLedger, ledgerVersion: "unrelated-version"};
    const decision = evaluateEndgameProgramBoard(currentEndgameProgramBoard, mismatched, masterTrustControlCatalogue);

    expect(decision.valid).toBe(false);
    expect(decision.blockers).toContainEqual({code: "capability_ledger_version_mismatch", taskId: null});
  });

  it("rejects a different inspected ledger baseline without conflating it with the version commit", () => {
    const mismatched = {...currentCapabilityLedger, baselineCommit: "abcdef1"};
    const decision = evaluateEndgameProgramBoard(currentEndgameProgramBoard, mismatched, masterTrustControlCatalogue);

    expect(decision.valid).toBe(false);
    expect(decision.blockers).toContainEqual({code: "capability_ledger_baseline_mismatch", taskId: null});
  });

  it("refuses gate_passed when acceptance, evidence or dependencies are incomplete", () => {
    const invalid = boardWithTask("CTRL-03", (task) => ({...task, state: "gate_passed"}));
    const decision = evaluateEndgameProgramBoard(invalid, currentCapabilityLedger, masterTrustControlCatalogue);

    expect(decision.valid).toBe(false);
    expect(decision.blockers).toEqual(expect.arrayContaining([
      {code: "terminal_task_has_open_subtasks", taskId: "CTRL-03"},
      {code: "terminal_task_acceptance_incomplete", taskId: "CTRL-03"},
      {code: "terminal_task_requires_evidence", taskId: "CTRL-03"},
    ]));
  });

  it("allows a support task to pass its gate without inventing a capability transition", () => {
    const gatePassed = boardWithTask("CTRL-02", (task) => ({
      ...task,
      state: "gate_passed",
      subtasks: task.subtasks.map((subtask) => ({...subtask, state: "done"})),
    }));
    const decision = evaluateEndgameProgramBoard(gatePassed, currentCapabilityLedger, masterTrustControlCatalogue);

    expect(decision.valid).toBe(true);
    expect(decision.readyForNextPromotion).toBe(false);
  });

  it("allows gate_passed with a valid planned transition but does not treat it as promotion", () => {
    const gatePassed = boardWithTask("CTRL-02", (task) => ({
      ...task,
      state: "gate_passed",
      subtasks: task.subtasks.map((subtask) => ({...subtask, state: "done"})),
      capabilityTransition: {
        capabilityId: "finance.deterministic-kernels",
        from: "implemented",
        to: "tested",
        status: "planned",
        evidenceRefs: [],
      },
    }));
    const decision = evaluateEndgameProgramBoard(gatePassed, currentCapabilityLedger, masterTrustControlCatalogue);

    expect(decision.valid).toBe(true);
    expect(decision.taskCounts.promoted).toBe(0);
  });

  it("still requires a recorded live and exposed capability transition for promotion", () => {
    const promoted = boardWithTask("CTRL-02", (task) => ({
      ...task,
      state: "promoted",
      subtasks: task.subtasks.map((subtask) => ({...subtask, state: "done"})),
    }));
    const decision = evaluateEndgameProgramBoard(promoted, currentCapabilityLedger, masterTrustControlCatalogue);

    expect(decision.valid).toBe(false);
    expect(decision.blockers).toContainEqual({code: "promoted_task_requires_recorded_capability_transition", taskId: "CTRL-02"});
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

  it("refuses dangling or duplicate capability references", () => {
    const invalid = boardWithTask("CTRL-01", (task) => ({
      ...task,
      capabilityRefs: ["workspace.project-memory", "workspace.project-memory", "workflow.not-real"],
    }));
    const decision = evaluateEndgameProgramBoard(invalid, currentCapabilityLedger, masterTrustControlCatalogue);

    expect(decision.valid).toBe(false);
    expect(decision.blockers).toEqual(expect.arrayContaining([
      {code: "duplicate_capability_ref", taskId: "CTRL-01"},
      {code: "unknown_capability_ref:workflow.not-real", taskId: "CTRL-01"},
    ]));
  });

  it("refuses expired evidence and incomplete external assessments", () => {
    const invalid: EndgameProgramBoard = {
      ...currentEndgameProgramBoard,
      evidenceIndex: currentEndgameProgramBoard.evidenceIndex.map((evidence) => evidence.evidenceId === "EV-CTRL02-LOCAL-GATE"
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
      {code: "acceptance_evidence_expired:EV-CTRL02-LOCAL-GATE", taskId: "CTRL-02"},
      {code: "task_evidence_expired:EV-CTRL02-LOCAL-GATE", taskId: "CTRL-02"},
      {code: "external_assessment_requires_fingerprint_and_validity", taskId: null},
    ]));
  });

  it("prevents a narrow presentation foundation from promoting the template-faithful suite", () => {
    const overclaimed = boardWithTask("MAT-01", (task) => ({
      ...task,
      capabilityTransition: {
        capabilityId: "artifacts.template-faithful-suite",
        from: "specified",
        to: "implemented",
        status: "planned",
        evidenceRefs: [],
      },
    }));
    const decision = evaluateEndgameProgramBoard(overclaimed, currentCapabilityLedger, masterTrustControlCatalogue);

    expect(decision.valid).toBe(false);
    expect(decision.blockers).toContainEqual({code: "capability_transition_owned_by:MAT-05", taskId: "MAT-01"});
  });

  it("records merged foundations without granting customer or external use", () => {
    const byTask = new Map(currentEndgameProgramBoard.tasks.map((task) => [task.taskId, task]));
    expect(byTask.get("SEC-01")).toMatchObject({state: "code_complete", capabilityRefs: ["trust.security-current-state-inventory"]});
    expect(byTask.get("VLT-02")).toMatchObject({state: "code_complete", capabilityRefs: ["documents.governed-quarantine-shadow"]});
    expect(byTask.get("MAT-01")).toMatchObject({
      state: "code_complete",
      capabilityRefs: ["artifacts.governed-office-foundation"],
      capabilityTransition: {from: "unsupported", to: "implemented", status: "recorded"},
    });
    expect(byTask.get("VLT-02")?.blockers.filter((blocker) => blocker.status === "open")).toHaveLength(3);
    expect(byTask.get("SEC-01")?.blockers.filter((blocker) => blocker.status === "open")).toHaveLength(2);
    expect(byTask.get("MAT-01")?.blockers.filter((blocker) => blocker.status === "open")).toHaveLength(1);
    expect(currentCapabilityLedger.entries.every((entry) => entry.allowedUses.every((use) => use === "internal_design" || use === "internal_validation"))).toBe(true);
  });

  it("prevents one pack from promoting the aggregate specialist runtime", () => {
    const overclaimed = boardWithTask("WFI-02", (task) => ({
      ...task,
      capabilityTransition: {
        capabilityId: "execution.general-specialist-runtime",
        from: "specified",
        to: "tested",
        status: "planned",
        evidenceRefs: [],
      },
    }));
    const decision = evaluateEndgameProgramBoard(overclaimed, currentCapabilityLedger, masterTrustControlCatalogue);

    expect(decision.valid).toBe(false);
    expect(decision.blockers).toEqual(expect.arrayContaining([
      {code: "capability_transition_owned_by:WFI-14", taskId: "WFI-02"},
      {code: "duplicate_capability_transition:execution.general-specialist-runtime", taskId: "WFI-02"},
    ]));
  });

  it("prevents one journey from promoting the aggregate G2-G8 capability", () => {
    const overclaimed = boardWithTask("JNY-02", (task) => ({
      ...task,
      capabilityTransition: {
        capabilityId: "gold.g2-g8-reference-journeys",
        from: "specified",
        to: "tested",
        status: "planned",
        evidenceRefs: [],
      },
    }));
    const decision = evaluateEndgameProgramBoard(overclaimed, currentCapabilityLedger, masterTrustControlCatalogue);

    expect(decision.valid).toBe(false);
    expect(decision.blockers).toEqual(expect.arrayContaining([
      {code: "capability_transition_owned_by:JNY-09", taskId: "JNY-02"},
      {code: "duplicate_capability_transition:gold.g2-g8-reference-journeys", taskId: "JNY-02"},
    ]));
  });

  it("keeps the generated Markdown byte-identical to the canonical board", () => {
    const decision = evaluateEndgameProgramBoard(currentEndgameProgramBoard, currentCapabilityLedger, masterTrustControlCatalogue);
    const path = fileURLToPath(new URL("../../../docs/build/ENDGAME_PROGRAM_BOARD.md", import.meta.url));
    expect(readFileSync(path, "utf8")).toBe(renderEndgameProgramBoard(currentEndgameProgramBoard, decision.boardFingerprint));
  });
});
