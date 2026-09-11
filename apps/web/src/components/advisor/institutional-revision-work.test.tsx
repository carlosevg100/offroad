import {renderToStaticMarkup} from "react-dom/server";
import {NextIntlClientProvider} from "next-intl";
import {describe, expect, it, vi} from "vitest";

import messages from "../../../messages/pt-BR.json";
import english from "../../../messages/en-US.json";
import type {ProjectRevisionHistory} from "@/lib/advisor/institutional-revision-history";
import type {InstitutionalRevisionProposal} from "@/lib/advisor/institutional-revision-proposals";
import {InstitutionalRevisionWork} from "./institutional-revision-work";

vi.mock("next/navigation", () => ({useRouter: () => ({refresh: vi.fn()})}));
vi.mock("@/app/[locale]/app/revision-actions", () => ({
  importInstitutionalWorkbook: vi.fn(), propagateProjectRevision: vi.fn(), reviewInstitutionalWorkbookProposal: vi.fn(),
}));

const result = (over: Partial<ProjectRevisionHistory["revisions"][number]["results"][number]> = {}) => ({
  id: "11111111-1111-4111-8111-111111111111", status: "completed" as const,
  configurationId: "22222222-2222-4222-8222-222222222222", configurationFingerprint: "a".repeat(64),
  sourceManifestFingerprint: "b".repeat(64), producedAt: "2026-09-10T12:00:00Z", createdAt: "2026-09-10T11:00:00Z",
  supersededBy: null, isCurrent: true, standing: "current" as const, ...over,
});

const history = (over: Partial<ProjectRevisionHistory> = {}): ProjectRevisionHistory => ({
  projectId: "33333333-3333-4333-8333-333333333333",
  currentRevisionId: "44444444-4444-4444-8444-444444444444",
  currentRevisionNumber: 2,
  pendingChange: false,
  revisions: [
    {id: "44444444-4444-4444-8444-444444444444", revisionNumber: 2, parentRevisionId: "55555555-5555-4555-8555-555555555555",
      inputsFingerprint: "c".repeat(64), changeSummary: ["assumptions"], approvalKind: "institutional_configuration",
      approvalReference: "22222222-2222-4222-8222-222222222222", approvedBy: "66666666-6666-4666-8666-666666666666",
      approvedAt: "2026-09-10T10:00:00Z", isCurrent: true, results: [result()]},
    {id: "55555555-5555-4555-8555-555555555555", revisionNumber: 1, parentRevisionId: null,
      inputsFingerprint: "d".repeat(64), changeSummary: [], approvalKind: "initial",
      approvalReference: null, approvedBy: "66666666-6666-4666-8666-666666666666",
      approvedAt: "2026-09-01T10:00:00Z", isCurrent: false, results: [result({
        id: "77777777-7777-4777-8777-777777777777", isCurrent: false, standing: "previous",
        supersededBy: "11111111-1111-4111-8111-111111111111", producedAt: "2026-09-01T12:00:00Z"})]},
  ],
  difference: {
    previousResultId: "77777777-7777-4777-8777-777777777777", currentResultId: "11111111-1111-4111-8111-111111111111",
    scenarioName: {previous: "Cenário", current: "Cenário"}, currency: {previous: "BRL", current: "BRL"},
    comparedPeriods: ["2027"], limits: [],
    assumptions: [{assumptionId: "cost-ratio", label: {pt: "Custo sobre receita", en: "Cost to revenue"}, unit: "percent",
      period: "2027", previous: "0.5", current: "0.45", difference: "-0.05", relativeChange: "-0.1"}],
    outputs: [{metric: "ebitda", period: "2027", previous: "100", current: "118.25", difference: "18.25", relativeChange: "0.1825"}],
  },
  ...over,
});

const proposal = (over: Partial<InstitutionalRevisionProposal> = {}): InstitutionalRevisionProposal => ({
  id: "88888888-8888-4888-8888-888888888888", status: "proposed", origin: "imported_workbook",
  canonicalRevisionId: "44444444-4444-4444-8444-444444444444", configurationId: "22222222-2222-4222-8222-222222222222",
  configurationFingerprint: "a".repeat(64), artifactFingerprint: "e".repeat(64),
  structureFingerprint: "f".repeat(64), uploadFingerprint: "0".repeat(64),
  changes: [{assumptionId: "cost-ratio", label: {pt: "Custo sobre receita", en: "Cost to revenue"}, unit: "percent",
    period: "2027", approved: "0.5", proposed: "0.45", difference: "-0.05"}],
  candidateConfigurationId: null, preparedBy: "66666666-6666-4666-8666-666666666666",
  reviewedBy: null, reviewedAt: null, createdAt: "2026-09-10T13:00:00Z", callerCanReview: true, ...over,
});

function render(props: {history: ProjectRevisionHistory; proposals: InstitutionalRevisionProposal[]}, locale: "pt-BR" | "en-US" = "pt-BR") {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale={locale} timeZone="UTC" messages={locale === "pt-BR" ? messages : english}>
      <InstitutionalRevisionWork projectId="33333333-3333-4333-8333-333333333333" {...props} />
    </NextIntlClientProvider>);
}

describe("revision surface", () => {
  it("marks the current revision current and the older output previous", () => {
    const html = render({history: history(), proposals: []});
    expect(html).toContain("Revisão atual: 2");
    expect(html).toContain("Revisão 2");
    expect(html).toContain("Revisão 1");
    // Inside the history itself, the newer revision is the current one and the older is previous.
    const historySection = html.slice(html.indexOf("Histórico de revisões"));
    expect(historySection.indexOf("Atual")).toBeLessThan(historySection.indexOf("Anterior"));
    expect(historySection).toContain("produzido em");
  });

  it("shows which assumption moved and what it did to the outputs, with exact values", () => {
    const html = render({history: history(), proposals: []});
    expect(html).toContain("Custo sobre receita");
    // Percentages are shifted for display without rounding the exact decimal value.
    expect(html).toContain("50%");
    expect(html).toContain("45%");
    expect(html).toContain("-5%");
    expect(html).toContain("118,25");
    expect(html).toContain("18,25");
    expect(html).toContain("EBITDA");
  });

  it("says what it could not compare instead of comparing it anyway", () => {
    const base = history();
    const html = render({history: {...base, difference: {...base.difference!, limits: ["currency_changed"], outputs: []}}, proposals: []});
    expect(html).toContain("A moeda mudou entre as revisões");
    expect(html).not.toContain("118,25");
  });

  it("offers the recompute only while an approved change has produced nothing", () => {
    expect(render({history: history(), proposals: []})).not.toContain("Recalcular a revisão atual");
    const pending = render({history: history({pendingChange: true}), proposals: []});
    expect(pending).toContain("Recalcular a revisão atual");
    expect(pending).toContain("Uma mudança aprovada ainda não produziu resultado");
  });

  it("offers the import entry and never promises that an upload is applied", () => {
    const html = render({history: history(), proposals: []});
    expect(html).toContain("Importar planilha editada");
    expect(html).toContain("Nada é aplicado sem revisão");
    expect(html).toContain('accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"');
  });

  it("offers a decision only to a reviewer who may take it", () => {
    const reviewable = render({history: history(), proposals: [proposal()]});
    expect(reviewable).toContain("Aprovar e recalcular");
    expect(reviewable).toContain("Devolver");
    const readOnly = render({history: history(), proposals: [proposal({callerCanReview: false})]});
    expect(readOnly).not.toContain("Aprovar e recalcular");
    expect(readOnly).toContain("A aprovação cabe a quem tem a função de aprovador");
  });

  it("keeps the same numbers in English", () => {
    const html = render({history: history(), proposals: [proposal()]}, "en-US");
    expect(html).toContain("Current revision: 2");
    expect(html).toContain("118.25");
    expect(html).toContain("18.25");
    expect(html).toContain("Cost to revenue");
    expect(html).toContain("It is not a credit approval, a funding commitment or a recommendation.");
  });
});
