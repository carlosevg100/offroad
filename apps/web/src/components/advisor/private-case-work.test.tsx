import {renderToStaticMarkup} from "react-dom/server";
import {NextIntlClientProvider} from "next-intl";
import {describe, expect, it, vi} from "vitest";
import messages from "../../../messages/pt-BR.json";
import type {PreliminaryUnderstandingState} from "@/lib/intake/preliminary-understanding";
import {PrivateCaseWork} from "./private-case-work";

vi.mock("next/navigation", () => ({useRouter: () => ({refresh: vi.fn()})}));
vi.mock("@/app/[locale]/app/advisor-actions", () => ({beginAdvisorProjectProcessing: vi.fn()}));
vi.mock("@/app/[locale]/app/projects/[projectId]/actions", () => ({decidePrivateProjectPreliminary: vi.fn()}));

function render(status: string, documentary = true, term?: {requestedTermDays?: number | null; requestedTermMonths?: number | null}, recovery: {canRetry?: boolean; isProcessing?: boolean} = {}) {
  const preliminary = {isProcessing: recovery.isProcessing ?? false, tasks: [], current: {row: {id: "one", status, object_fingerprint: "a".repeat(64)}, value: {
    summary: "Entendimento a confirmar", company: {name: "Companhia", companySummary: "Contexto da companhia"},
    operation: {archetypeLabel: "Outro", operationSummary: "Revisão documental", ...term},
    basis: {publicResearch: {sources: []}}, preliminaryAssessment: {researchSignals: [], openPoints: [], boundary: "Leitura inicial"},
  }}} as unknown as PreliminaryUnderstandingState;
  return renderToStaticMarkup(<NextIntlClientProvider locale="pt-BR" messages={messages}><PrivateCaseWork preliminary={preliminary} canRetry={recovery.canRetry ?? false} shouldStart={false} checklist={null} locale="pt-BR" projectId="project" sessionId="session" {...(documentary ? {documentaryWork: {job: "review" as const}} : {})} /></NextIntlClientProvider>);
}

describe("PrivateCaseWork documentary scope", () => {
  it("offers recovery after a requested correction fails without presenting the old reading for confirmation", () => {
    const html = render("changes_requested", false, undefined, {canRetry: true});
    expect(html).toContain(messages.App.privateCase.failedTitle);
    expect(html).toContain(messages.App.privateCase.retry);
    expect(html).not.toContain(messages.App.privateCase.confirm);
  });
  it.each(["confirmed", "pending_confirmation"])("does not replace usable %s understanding with an initial-read retry", status => {
    expect(render(status, false, undefined, {canRetry: true})).not.toContain(messages.App.privateCase.failedTitle);
  });
  it("does not offer duplicate recovery while the replacement reading is processing", () => {
    const html = render("changes_requested", false, undefined, {canRetry: true, isProcessing: true});
    expect(html).toContain(messages.App.privateCase.processingTitle);
    expect(html).not.toContain(messages.App.privateCase.failedTitle);
  });
  it("keeps preliminary confirmation required even when documentary scope is provided", () => {
    const html = render("pending_confirmation");
    expect(html).toContain(messages.App.privateCase.confirm);
    expect(html).toContain('name="decision"');
    expect(html).not.toContain('data-testid="documentary-work-next-step"');
  });
  it("adapts only confirmed scope and preserves the existing financing flow otherwise", () => {
    expect(render("confirmed")).toContain('data-testid="documentary-work-next-step"');
    expect(render("confirmed")).not.toContain(messages.App.privateCase.requestTitle);
    expect(render("confirmed", false)).toContain(messages.App.privateCase.requestTitle);
  });
  it("shows a verified day count without relabeling it as months", () => {
    const html = render("pending_confirmation", true, {requestedTermDays: 120, requestedTermMonths: null});
    expect(html).toContain("120 dias"); expect(html).not.toContain("120 meses");
  });
  it("shows a verified month count and withholds a historical unitless month projection", () => {
    expect(render("pending_confirmation", true, {requestedTermDays: null, requestedTermMonths: 18})).toContain("18 meses");
    expect(render("pending_confirmation", true, {requestedTermMonths: 120})).not.toContain("120 meses");
  });
});
