import {describe, expect, it} from "vitest";
import {routeWorkspaceRequest} from "./index";

describe("workspace request router", () => {
  it("keeps a hypothetical case question read-only", () => {
    expect(routeWorkspaceRequest({message: "E se o prazo fosse cinco anos?", surface: "case_workspace"})).toMatchObject({
      intent: "simulate",
      scope: "case",
      effect: "none",
      requiresExplicitConfirmation: false,
      allowedOnCurrentSurface: true,
    });
  });

  it("routes a factual change to a proposal rather than a silent commit", () => {
    expect(routeWorkspaceRequest({message: "O valor agora é R$ 50 milhões.", surface: "operation_brief"})).toMatchObject({
      intent: "propose_change",
      scope: "case",
      effect: "proposal",
      requiresExplicitConfirmation: false,
    });
  });

  it("recognizes approval but still requires the governed confirmation path", () => {
    expect(routeWorkspaceRequest({message: "Aprovo essa estrutura.", surface: "case_workspace"})).toMatchObject({
      intent: "approve",
      effect: "commit",
      requiresExplicitConfirmation: true,
    });
  });

  it("blocks an external instruction on the operation brief surface", () => {
    expect(routeWorkspaceRequest({message: "Pode enviar ao Fundo Alfa.", surface: "operation_brief"})).toMatchObject({
      intent: "authorize_external",
      scope: "market",
      effect: "external",
      allowedOnCurrentSurface: false,
      requiresExplicitConfirmation: true,
    });
  });

  it("routes general instrument questions to knowledge without state effects", () => {
    expect(routeWorkspaceRequest({message: "Qual a diferença entre CCB e debênture?", surface: "knowledge"})).toMatchObject({
      intent: "explain",
      scope: "knowledge",
      effect: "none",
    });
  });

  it("abstains when no deterministic rule is safe", () => {
    expect(routeWorkspaceRequest({message: "Quero conversar sobre isso.", surface: "case_workspace"})).toMatchObject({
      intent: "clarify",
      confidence: "ambiguous",
      effect: "none",
    });
  });
});
