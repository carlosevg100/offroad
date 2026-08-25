import {describe, expect, it} from "vitest";

import type {Material} from "@offroad/case-materials";
import type {ReadinessReport} from "@offroad/case-understanding";
import type {ReconciliationException} from "@offroad/reconciliation";

import {dataRoomIndex, planDataRoom, type DataRoomDocument} from "./index";

const material = (kind: Material["kind"]): Material => ({kind, title: {pt: kind, en: kind}, blocks: [], dependsOn: []});
const readiness = (blockers: ReadinessReport["blockers"] = []): ReadinessReport => ({state: blockers.length ? "blocked" : "ready", score: 1, components: [], blockers});
const exception = (blocks: boolean): ReconciliationException => ({ruleId: "R1", type: "balance", severity: "critical", title: "Balanço não fecha", description: "", evidence: [], ownerRole: "company", blocksExternalOutputs: blocks});
const verified: DataRoomDocument = {id: "d1", kind: "audited_financial_statements", originalName: "DF 2025.pdf", sha256: "abcdef0123456789", sha256VerifiedAt: "2026-08-21T00:00:00Z", byteSize: 1000};
const unverified: DataRoomDocument = {id: "d2", kind: "debt_schedule", originalName: "Mapa.xlsx", sha256: null, sha256VerifiedAt: null, byteSize: 500};
const unclassified: DataRoomDocument = {id: "d3", kind: null, originalName: "foto.jpg", sha256: "ffff", sha256VerifiedAt: "2026-08-21T00:00:00Z", byteSize: 10};

describe("planDataRoom", () => {
  it("places the teaser before the NDA and the credit memorandum and term sheet after it", () => {
    const plan = planDataRoom({materials: ["teaser", "credit_profile", "term_sheet", "diligence_qa", "package", "credit_memo"].map((k) => material(k as Material["kind"])), materialsBlockedBy: [], documents: [verified], exceptions: [], readiness: readiness()});
    const byId = new Map(plan.entries.map((entry) => [entry.id, entry]));
    expect(byId.get("material:teaser")?.tier).toBe("pre_nda");
    expect(byId.get("material:term_sheet")?.tier).toBe("nda");
    expect(byId.get("material:credit_memo")?.tier).toBe("nda");
    expect(byId.get("material:credit_memo")?.folderId).toBe("01_materiais");
    expect(byId.get("document:d1")?.status).toBe("ready");
    expect(byId.get("document:d1")?.folderId).toBe("02_financial");
    expect(plan.releasable).toBe(true);
    expect(plan.counts).toEqual({ready: 6, held: 0, requested: 0});
  });

  it("holds every external entry behind a blocking exception, including the credit memorandum", () => {
    const plan = planDataRoom({materials: [material("teaser"), material("credit_memo")], materialsBlockedBy: [], documents: [verified], exceptions: [exception(true)], readiness: readiness()});
    expect(plan.releasable).toBe(false);
    expect(plan.entries.find((e) => e.id === "material:teaser")?.heldBy[0]?.pt).toContain("Balanço não fecha");
    expect(plan.entries.find((e) => e.id === "material:credit_memo")?.status).toBe("held");
    expect(plan.entries.find((e) => e.id === "document:d1")?.status).toBe("held");
  });

  it("holds unverified and unclassified files, and lists what the case still needs as requests", () => {
    const plan = planDataRoom({materials: [material("teaser")], materialsBlockedBy: ["audit refused the brief"], documents: [unverified, unclassified], exceptions: [exception(false)], readiness: readiness([{id: "debt_schedule", labels: {pt: "Mapa de dívida", en: "Debt schedule"}}])});
    const byId = new Map(plan.entries.map((entry) => [entry.id, entry]));
    expect(byId.get("document:d2")?.heldBy.map((h) => h.en)).toContain("SHA-256 hash not verified");
    expect(byId.get("document:d3")?.folderId).toBe("90_nao_classificados");
    expect(byId.get("material:term_sheet")?.heldBy.map((h) => h.en)).toEqual(["audit refused the brief"]);
    expect(byId.get("material:teaser")?.status).toBe("ready");
    expect(byId.get("requested:debt_schedule")?.status).toBe("requested");
    expect(plan.folders.map((f) => f.id)).toEqual(["00_mesa", "01_materiais", "02_financial", "03_debt_and_collateral", "04_project_and_plan", "05_institutional_and_corporate", "06_contracts", "07_other", "90_nao_classificados", "99_pendencias"]);
    expect(plan.releasable).toBe(false);
  });

  it("renders an internal index with one table per folder and the hash of each file", () => {
    const plan = planDataRoom({materials: [material("teaser")], materialsBlockedBy: [], documents: [verified], exceptions: [], readiness: readiness()});
    const index = dataRoomIndex(plan);
    expect(index.kind).toBe("data_room_index");
    const tables = index.blocks.filter((block) => block.type === "table");
    // The materials folder and the financial folder. The credit memorandum is lender-facing.
    expect(tables).toHaveLength(2);
    const financial = tables[1]!;
    expect(financial.type === "table" && financial.rows[0]).toEqual(["Demonstrações financeiras auditadas: DF 2025.pdf", "Após NDA", "Pronto", "abcdef012345", ""]);
  });
});
