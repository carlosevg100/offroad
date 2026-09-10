import {renderToStaticMarkup} from "react-dom/server";
import {NextIntlClientProvider} from "next-intl";
import {describe, expect, it, vi} from "vitest";
import messages from "../../../messages/pt-BR.json";
import type {InstitutionalModelResult} from "@/lib/advisor/institutional-model-results";
import {InstitutionalModelResultWork} from "./institutional-model-result-work";

vi.mock("@/components/deal-state/deal-state-refresh", () => ({DealStateRefresh: () => null}));
const base = {id: "result-test", status: "queued" as const, configurationId: "config-test", configurationFingerprint: "a".repeat(64), sourceManifestFingerprint: "b".repeat(64), artifact: null, blockers: [], createdAt: "2026-09-10T00:00:00Z"};
function render(result: InstitutionalModelResult) {
  return renderToStaticMarkup(<NextIntlClientProvider locale="pt-BR" timeZone="UTC" messages={messages}><InstitutionalModelResultWork projectId="project-test" result={result}/></NextIntlClientProvider>);
}
describe("institutional result delivery", () => {
  it.each(["queued", "blocked", "stale"] as const)("does not offer downloads for %s", status => {
    const html = render({...base, status});
    expect(html).not.toContain("/financial-results/");
    expect(html).toContain("#work-institutional-setup");
  });
  it("links all four formats to the exact persisted result and discloses snapshot export", () => {
    const artifact = {institutional: {scenarios: [{configurationId: "config-test", revision: 2, input: {currency: "BRL", assumptionBook: {scenarioName: "Cenário sintético"}}}]}} as unknown as NonNullable<InstitutionalModelResult["artifact"]>;
    const html = render({...base, status: "completed", artifact});
    for (const format of ["xlsx", "pptx", "docx", "pdf"]) expect(html).toContain(`/pt-BR/app/projects/project-test/financial-results/result-test/${format}`);
    expect(html).toContain("sem recálculo local");
    expect(html).toContain("Cenário sintético");
  });
});
