import {describe, expect, it} from "vitest";

import {governedMaterial, governedMaterialPackageFromRows} from "./materials";
import type {DealStateRow} from "./workbench";

const fingerprint = (character: string) => character.repeat(64);
const row = (
  objectType: string,
  status: string,
  objectFingerprint: string,
  payload: unknown,
  dependencies: unknown[] = [],
): DealStateRow => ({
  id: crypto.randomUUID(),
  organization_id: crypto.randomUUID(),
  intake_session_id: crypto.randomUUID(),
  object_type: objectType,
  object_version: 1,
  status,
  input_fingerprint: fingerprint("f"),
  object_fingerprint: objectFingerprint,
  payload: payload as DealStateRow["payload"],
  dependencies: dependencies as DealStateRow["dependencies"],
  created_by: null,
  created_by_kind: "worker",
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  superseded_at: null,
});
const dependency = (objectType: string, objectFingerprint: string) => ({objectType, objectFingerprint});

function chain(planDependency = fingerprint("b")) {
  const option = row("structure_option", "pending_confirmation", fingerprint("a"), {});
  const decision = row("structure_decision", "confirmed", fingerprint("b"), {}, [dependency("structure_option", option.object_fingerprint)]);
  const plan = row("production_plan", "approved", fingerprint("c"), {
    artifacts: ["teaser", "financial_model", "indicative_term_sheet", "data_room_index"],
  }, [dependency("structure_decision", planDependency)]);
  const artifact = row("material_artifact", "pending_confirmation", fingerprint("d"), {
    materials: [{kind: "teaser", title: {pt: "Teaser", en: "Teaser"}, blocks: [{type: "heading", text: {pt: "Caso", en: "Case"}}], dependsOn: ["fact-1"]}],
    financialModel: null,
    materialTruth: {},
    dataRoom: {},
  }, [dependency("production_plan", plan.object_fingerprint)]);
  return [option, decision, plan, artifact];
}

describe("governed material package", () => {
  it("serves only artifacts compiled from the exact approved chain", () => {
    const governed = governedMaterialPackageFromRows(chain());
    expect(governed?.artifactFingerprint).toBe(fingerprint("d"));
    expect(governedMaterial(governed!, "teaser")?.title.pt).toBe("Teaser");
    expect(governedMaterial(governed!, "credit_memo")).toBeNull();
  });

  it("rejects a plan linked to a different structure decision", () => {
    expect(governedMaterialPackageFromRows(chain(fingerprint("e")))).toBeNull();
  });
});
