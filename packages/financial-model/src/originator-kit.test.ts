import {describe, expect, it} from "vitest";
import {auroraKernelInput} from "./document-folder-inventory.test-support";
import {reviewOriginatorKit} from "./originator-kit";
function base() {
  return {inventory: auroraKernelInput(), assignments: [{fileId: "f01", role: "financial_statements", selected: true}], policy: {source: "Synthetic institution checklist explicitly adopted", origin: "house", effectiveFrom: "2026-01-01", effectiveUntil: null as string | null,
    requirements: [{role: "financial_statements", required: true, dateBasis: "reporting_period_end", maxAgeDays: 400}, {role: "scr", required: true, dateBasis: "document_reference", maxAgeDays: 30}]}};
}
describe("originator kit readiness over the existing inventory", () => {
  it("retains every file and copy from the inventory and asks for the absent SCR", () => {
    const r = reviewOriginatorKit(base()); expect(r.inventory.rows.length).toBe(30); expect(r.inventory.counts.duplicates).toBe(1);
    expect(r.gaps).toContainEqual({operand: "scr", reason: "kit_missing"}); expect(r.documentsValidated).toBe(false);
  });
  it("does not invent a checklist or freshness limit", () => {const f = base(); expect(reviewOriginatorKit({...f, policy: null}).gaps).toContainEqual({operand: "policy", reason: "kit_requirements_policy_missing"});});
  it("refuses an assignment to a file absent from the authorized inventory", () => {const f = base(); f.assignments[0]!.fileId = "not-in-folder"; expect(() => reviewOriginatorKit(f)).toThrow("assignment_identity_conflict");});
  it("does not choose between two selected versions", () => {
    const f = base(); f.assignments.push({fileId: "f02", role: "financial_statements", selected: true});
    expect(reviewOriginatorKit(f).gaps).toContainEqual({operand: "financial_statements", reason: "kit_selection_conflict"});
  });
  it("does not declare an expired checklist in force", () => {const f = base(); f.policy.effectiveUntil = "2026-01-31"; expect(reviewOriginatorKit(f).gaps).toContainEqual({operand: "policy", reason: "kit_requirements_policy_not_in_force"});});
  it("does not use a superseded draft as the selected statement", () => {const f = base(); f.assignments[0]!.fileId = "f02"; expect(reviewOriginatorKit(f).gaps).toContainEqual({operand: "financial_statements", reason: "kit_superseded"});});
  it("does not accept statements of a subsidiary for the cedent", () => {const f = base(); f.assignments[0]!.fileId = "f04"; expect(reviewOriginatorKit(f).gaps).toContainEqual({operand: "financial_statements", reason: "kit_subject_mismatch"});});
  it("reports readiness for analysis only after all required roles are satisfied", () => {const f = base(); f.policy.requirements.pop(); expect(reviewOriginatorKit(f).status).toBe("ready_for_analysis");});
  it("uses the reported cut-off rather than the date of upload for SCR freshness", () => {
    const f = base(), d = structuredClone(f.inventory.files[0]!);
    d.kind = "unidentified"; d.perimeter = "not_applicable"; d.period = {label: "SCR June", start: "2026-06-30", end: "2026-06-30"}; d.figures = []; d.referenceDate = {kind: "position", date: "2026-06-30", origin: "stated"};
    f.inventory.files = [d]; f.inventory.asOf = "2026-10-29"; f.inventory.decisions = []; f.inventory.vault = [];
    const r = reviewOriginatorKit({...f, assignments: [{fileId: d.fileId, role: "scr", selected: true}], policy: {...f.policy, requirements: [{role: "scr", required: true, dateBasis: "document_reference", maxAgeDays: 30}]}});
    expect(r.readiness[0]).toMatchObject({ageDays: 121, status: "outdated"});
  });
});
