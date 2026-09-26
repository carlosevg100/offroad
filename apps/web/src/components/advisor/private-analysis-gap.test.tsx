import {renderToStaticMarkup} from "react-dom/server";
import {NextIntlClientProvider} from "next-intl";
import {describe, expect, it, vi} from "vitest";
import messages from "../../../messages/pt-BR.json";
import type {DealStateGap, DealStateGapApproval} from "@/lib/deal-state/analysis-gap";
import type {DealStateWorkbench} from "@/lib/deal-state/workbench";
import {PrivateMaterialsWork} from "./private-materials-work";
import {PrivateStructureWork} from "./private-structure-work";

vi.mock("@/app/[locale]/app/projects/[projectId]/actions", () => ({
  approvePrivateProjectMaterialPackage: vi.fn(), approvePrivateProjectProductionPlan: vi.fn(),
  decidePrivateProjectStructure: vi.fn(), resumePrivateProjectAnalysis: vi.fn(),
}));

const copy = messages.App.privateCase;
const wrap = (node: React.ReactNode) => renderToStaticMarkup(<NextIntlClientProvider locale="pt-BR" messages={messages}>{node}</NextIntlClientProvider>);
const approvedPlan = {row: {status: "approved", object_fingerprint: "a".repeat(64)}, value: {artifacts: []}} as unknown as DealStateWorkbench["productionPlan"];

function materials(gap: DealStateGap | null, isProcessing: boolean, gapApproval: DealStateGapApproval | null = null) {
  return wrap(<PrivateMaterialsWork gap={gap} gapApproval={gapApproval} governed={null} isProcessing={isProcessing} locale="pt-BR" packageReview={null}
    productionPlan={approvedPlan} projectId="project" sessionId="session" structureConfirmed />);
}

describe("a missing case result is shown as a gap, never as processing", () => {
  it("an approved plan without materials and without a running analysis is a gap with the resume step", () => {
    const html = materials("materials", false);
    expect(html).toContain('data-gap="materials"');
    expect(html).toContain(copy.analysisGap.materials.title);
    expect(html).toContain(copy.analysisGap.resume);
    expect(html).not.toContain(copy.materialsProcessingTitle);
  });

  it("says the materials are being compiled only while the analysis runs", () => {
    const html = materials(null, true);
    expect(html).toContain(copy.materialsProcessingTitle);
    expect(html).not.toContain('data-testid="analysis-gap"');
  });

  it("shows the missing alternatives as a gap instead of the earlier proposal", () => {
    const html = wrap(<PrivateStructureWork gap="structure" isProcessing={false} locale="pt-BR" projectId="project" sessionId="session"
      structure={null} structureDecision={null} />);
    expect(html).toContain('data-gap="structure"');
    expect(html).toContain(copy.analysisGap.structure.title);
    expect(html).not.toContain(copy.structureProcessingTitle);
  });
});

describe("a missing result whose analysis is held for the approval of its plan", () => {
  it("names the approval as the next step, points to the plan and never offers to resume", () => {
    const html = materials("materials", false, {href: "#execution-brief-approval"});
    expect(html).toContain('data-gap="materials"');
    expect(html).toContain('data-step="approve"');
    expect(html).toContain(copy.analysisGap.materials.title);
    expect(html).toContain(copy.analysisGap.held.body);
    expect(html).toContain(copy.analysisGap.held.nextStepBody);
    expect(html).toContain('href="#execution-brief-approval"');
    expect(html).toContain(copy.analysisGap.held.review);
    expect(html).not.toContain(copy.analysisGap.resume);
    expect(html).not.toContain('type="submit"');
  });

  it("says the plan is being prepared while the page has no approval to show", () => {
    const html = wrap(<PrivateStructureWork gap="structure" gapApproval={{href: null}} isProcessing={false} locale="pt-BR" projectId="project"
      sessionId="session" structure={null} structureDecision={null} />);
    expect(html).toContain('data-step="approve"');
    expect(html).toContain(copy.analysisGap.held.preparingBody);
    expect(html).not.toContain("href=");
    expect(html).not.toContain(copy.analysisGap.resume);
  });

  it("keeps the resume step when nothing is held", () => {
    const html = materials("materials", false, null);
    expect(html).toContain('data-step="resume"');
    expect(html).toContain(copy.analysisGap.resume);
    expect(html).not.toContain(copy.analysisGap.held.body);
  });
});
