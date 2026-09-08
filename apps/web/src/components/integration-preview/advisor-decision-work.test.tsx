import {buildDecisionArtifactContract, type DecisionArtifactContract} from "@offroad/case-understanding";
import * as React from "react";
import * as Intl from "next-intl";
import {createTranslator, NextIntlClientProvider} from "next-intl";
import {renderToStaticMarkup} from "react-dom/server";
import {describe, expect, it, vi} from "vitest";
import pt from "../../../messages/pt-BR.json";
import en from "../../../messages/en-US.json";
import {AdvisorDecisionWork} from "./advisor-decision-work";
import type {PreviewArtifactView} from "./integration-preview-work";

vi.mock("react", {spy: true});
vi.mock("next-intl", {spy: true});

const fingerprint = "a".repeat(64);
function contract() {
  return buildDecisionArtifactContract({schemaVersion: "2026.09.07-v1", caseId: "test", snapshotFingerprint: fingerprint, asOf: "2026-05-31", status: "draft", release: {state: "internal_only", recipientIds: []}, sources: [], assumptions: [], gaps: [],
    claims: [{id: "claim", label: "Contract finding", value: "0.21689377", unit: null, evidenceState: "calculated", object: {id: "obj", type: "ledger", fingerprint, path: "value"}, sourceIds: [], assumptionIds: [], gapIds: []}],
    views: [{surface: "conversation", artifactId: "readout", artifactKind: "chat_readout", artifactFingerprint: null, blocks: [{id: "findings", title: "Ordered finding", kind: "metric", claimIds: ["claim"], sourceIds: [], assumptionIds: [], gapIds: []}]}], identityRequirements: []});
}
const methods: PreviewArtifactView[] = [{id: "ledger", type: "preview_debt_ledger", version: 1, status: "complete", createdAt: "2026-09-07T12:00:00Z", content: {preview: {methodMaturity: "implemented"}, output: {ledger_rows: Array.from({length: 18}, (_, index) => ({instrument: `INSTRUMENT-${index + 1}`, amount: "0.21689377"}))}}}];
function render(value: DecisionArtifactContract | null, locale: "pt-BR" | "en-US") {
  return renderToStaticMarkup(<NextIntlClientProvider locale={locale} messages={locale === "pt-BR" ? pt : en} timeZone="UTC"><AdvisorDecisionWork contract={value} artifacts={methods} locale={locale} /></NextIntlClientProvider>);
}
describe("advisor decision and full method continuity", () => {
  it.each(["pt-BR", "en-US"] as const)("%s keeps readout and complete method outputs together", (locale) => {
    const html = render(contract(), locale);
    expect(html).toContain('data-testid="preview-decision-artifact"');
    expect(html).toContain('data-testid="decision-method-inspection"');
    expect(html).toContain("Contract finding");
    expect(html).not.toContain("INSTRUMENT-18");
    expect(html).not.toContain('data-testid="decision-readout-unavailable"');
  });
  it.each(["pt-BR", "en-US"] as const)("%s keeps methods when no contract is available", (locale) => {
    const html = render(null, locale);
    expect(html).toContain('data-testid="decision-readout-unavailable"');
    expect(html).not.toContain("INSTRUMENT-18");
    expect(html).not.toContain('data-testid="preview-decision-artifact"');
  });
  it("does not claim an executive readout exists when the contract contains only a workbook view", () => {
    const value = contract();
    value.views[0]!.surface = "workbook";
    value.views[0]!.artifactKind = "xlsx";
    const html = render(buildDecisionArtifactContract(value), "pt-BR");
    expect(html).toContain('data-testid="decision-readout-unavailable"');
    expect(html).not.toContain("INSTRUMENT-18");
    expect(html).not.toContain('data-testid="preview-decision-artifact"');
  });
});


it("mounts complete methods on native toggle, unmounts on close and reopens with refreshed props", () => {
  let open = false;
  const tree = (artifacts = methods) => {
    // Only the wrapper's single state hook is substituted. Child components render with real hooks.
    const state = vi.spyOn(React, "useState").mockImplementationOnce(() => [open, (value: boolean) => {open = value;}] as never);
    const translations = vi.spyOn(Intl, "useTranslations").mockReturnValueOnce(createTranslator({locale: "pt-BR", messages: pt, namespace: "IntegrationPreviewWork"}) as never);
    try { return AdvisorDecisionWork({contract: contract(), artifacts, locale: "pt-BR"}); }
    finally {state.mockRestore(); translations.mockRestore();}
  };
  const methodsDetails = (element: ReturnType<typeof tree>) => React.Children.toArray(element!.props.children).find((child) => React.isValidElement(child) && child.type === "details") as React.ReactElement<{open: boolean; onToggle: (event: {currentTarget: {open: boolean}}) => void}>;
  const markup = (element: ReturnType<typeof tree>) => renderToStaticMarkup(<NextIntlClientProvider locale="pt-BR" messages={pt} timeZone="UTC">{element}</NextIntlClientProvider>);
  let current = tree();
  expect(markup(current)).not.toContain("INSTRUMENT-18");
  methodsDetails(current).props.onToggle({currentTarget: {open: true}});
  current = tree();
  expect(methodsDetails(current).props.open).toBe(true);
  expect(markup(current)).toContain("INSTRUMENT-18");
  const updated = structuredClone(methods);
  updated[0]!.version = 2;
  (updated[0]!.content as {output: {ledger_rows: Array<{instrument: string}>}}).output.ledger_rows[17]!.instrument = "REFRESHED-18";
  current = tree(updated);
  expect(methodsDetails(current).props.open).toBe(true);
  expect(markup(current)).toContain("REFRESHED-18");
  methodsDetails(current).props.onToggle({currentTarget: {open: false}});
  current = tree(updated);
  expect(markup(current)).not.toContain("REFRESHED-18");
  methodsDetails(current).props.onToggle({currentTarget: {open: true}});
  expect(markup(tree(updated))).toContain("REFRESHED-18");
});
