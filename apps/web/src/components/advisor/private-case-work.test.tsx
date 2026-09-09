import {renderToStaticMarkup} from "react-dom/server";
import {NextIntlClientProvider} from "next-intl";
import {describe, expect, it, vi} from "vitest";
import messages from "../../../messages/pt-BR.json";
import type {PreliminaryUnderstandingState} from "@/lib/intake/preliminary-understanding";
import {PrivateCaseWork} from "./private-case-work";

vi.mock("next/navigation", () => ({useRouter: () => ({refresh: vi.fn()})}));
vi.mock("@/app/[locale]/app/advisor-actions", () => ({beginAdvisorProjectProcessing: vi.fn()}));
vi.mock("@/app/[locale]/app/projects/[projectId]/actions", () => ({decidePrivateProjectPreliminary: vi.fn()}));

function render(status: string, documentary = true) {
  const preliminary = {isProcessing: false, tasks: [], current: {row: {id: "one", status, object_fingerprint: "a".repeat(64)}, value: {
    summary: "Entendimento a confirmar", company: {name: "Companhia", companySummary: "Contexto da companhia"},
    operation: {archetypeLabel: "Outro", operationSummary: "Revisão documental"},
    basis: {publicResearch: {sources: []}}, preliminaryAssessment: {researchSignals: [], openPoints: [], boundary: "Leitura inicial"},
  }}} as unknown as PreliminaryUnderstandingState;
  return renderToStaticMarkup(<NextIntlClientProvider locale="pt-BR" messages={messages}><PrivateCaseWork preliminary={preliminary} canRetry={false} shouldStart={false} checklist={null} locale="pt-BR" projectId="project" sessionId="session" {...(documentary ? {documentaryWork: {job: "review" as const}} : {})} /></NextIntlClientProvider>);
}

describe("PrivateCaseWork documentary scope", () => {
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
});
