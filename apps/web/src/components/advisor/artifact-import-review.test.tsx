import {describe, expect, it, vi} from "vitest";
import {renderToStaticMarkup} from "react-dom/server";
import {NextIntlClientProvider} from "next-intl";
import pt from "../../../messages/pt-BR.json";
import {ArtifactImportReview, type ArtifactImportReviewView} from "./artifact-import-review";
vi.mock("next/navigation", () => ({useRouter: () => ({refresh: vi.fn()})}));
const base: ArtifactImportReviewView = {id: "test", status: "candidate", base: null, head: null, items: [], canApply: true, canDiscard: true, requiresDeclaration: false, selfApprovalForbidden: false};
function html(candidate: ArtifactImportReviewView) {return renderToStaticMarkup(<NextIntlClientProvider locale="pt-BR" messages={{ArtifactImportReview: pt.ArtifactImportReview}}><ArtifactImportReview candidate={candidate} onDecide={async () => ({ok: true})}/></NextIntlClientProvider>);}
describe("Human Office import review", () => {
  it("blocks applying until the required self-approval declaration is checked", () => {const output = html({...base, requiresDeclaration: true}); expect(output).toContain(pt.ArtifactImportReview.declaration); expect(output).toContain(`<button disabled="">${pt.ArtifactImportReview.apply}</button>`);});
  it("never preselects a conflict resolution", () => {const output = html({...base, items: [{key: "input", classification: "conflict", base: "100", received: "200", current: "300", detachedClaimIds: []}]});expect(output).not.toContain("checked=");expect(output).toContain(`<button disabled="">${pt.ArtifactImportReview.apply}</button>`);});
  it("shows detached supports and observations without treating a formula edit as a calculation", () => {const output = html({...base, items: [{key: "formula", classification: "formula_changed", base: "100", received: "200", current: "100", detachedClaimIds: ["support-1"]}]});expect(output).toContain(pt.ArtifactImportReview.formula);expect(output).toContain("support-1");expect(output).toContain(pt.ArtifactImportReview.detached);});
});
