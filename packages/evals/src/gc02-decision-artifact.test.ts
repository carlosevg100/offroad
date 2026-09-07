import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";

import {decisionArtifactIdentityReport, traceDecisionArtifactBlock} from "@offroad/case-understanding";
import {describe, expect, it} from "vitest";

import {buildGc02DecisionArtifactContract} from "./gc02-decision-artifact";
import {buildGc02ReferenceSnapshot} from "./gc02-reference-snapshot";

const referenceRoot = fileURLToPath(new URL("../../../docs/product/reference-products/gc02/", import.meta.url));
const sha256 = (file: string) => createHash("sha256").update(readFileSync(`${referenceRoot}${file}`)).digest("hex");

describe("GC02 cross-surface decision artifact", () => {
  const snapshot = buildGc02ReferenceSnapshot();
  const contract = buildGc02DecisionArtifactContract(snapshot, {
    workbook: sha256("GC02_Camil_Modelo_Conselho_v1.xlsx"),
    presentation: sha256("GC02_Camil_Estrutura_Capital_Conselho_v1.pptx"),
  });

  it("binds the five critical decision claims to chat, workbook and deck", () => {
    const report = decisionArtifactIdentityReport(contract);
    expect(report.valid).toBe(true);
    expect(report.requirements).toHaveLength(5);
    expect(report.requirements.every((requirement) => requirement.present.length === 3)).toBe(true);
  });

  it("uses the audited snapshot value rather than copied surface values", () => {
    const chat = traceDecisionArtifactBlock(contract, "conversation", "CHAT-FORWARD")!;
    const model = traceDecisionArtifactBlock(contract, "workbook", "MODEL-FORWARD")!;
    const deck = traceDecisionArtifactBlock(contract, "presentation", "DECK-FORWARD")!;
    const read = (claims: typeof chat.claims, id: string) => claims.find((claim) => claim.id === id)?.value;
    const expected = snapshot.projections.rollover.find((period) => period.period === "2030/31")!.liquidityCoverage;
    expect(read(chat.claims, "CLM-2030-LIQUIDITY")).toBe(expected);
    expect(read(model.claims, "CLM-2030-LIQUIDITY")).toBe(expected);
    expect(read(deck.claims, "CLM-2030-LIQUIDITY")).toBe(expected);
  });

  it("keeps covenant headroom non-computable and external release closed", () => {
    const headroom = contract.claims.find((claim) => claim.id === "CLM-COVENANT-HEADROOM")!;
    expect(headroom).toMatchObject({value: null, evidenceState: "not_computable", gapIds: ["GAP-01"]});
    expect(contract.release).toEqual({state: "internal_only", recipientIds: []});
  });

  it("records the actual immutable Office file hashes", () => {
    expect(contract.views.find((view) => view.surface === "workbook")?.artifactFingerprint).toBe(sha256("GC02_Camil_Modelo_Conselho_v1.xlsx"));
    expect(contract.views.find((view) => view.surface === "presentation")?.artifactFingerprint).toBe(sha256("GC02_Camil_Estrutura_Capital_Conselho_v1.pptx"));
  });
});
