import {renderToStaticMarkup} from "react-dom/server";
import {NextIntlClientProvider} from "next-intl";
import {describe, expect, it} from "vitest";
import messages from "../../../messages/pt-BR.json";
import type {InstitutionalModelResult} from "@/lib/advisor/institutional-model-results";
import {InstitutionalModelResultWork} from "./institutional-model-result-work";

const queued: InstitutionalModelResult = {id: "result-test", status: "queued", configurationId: "config-test", configurationFingerprint: "a".repeat(64),
  sourceManifestFingerprint: "b".repeat(64), artifact: null, blockers: [], createdAt: "2026-09-10T00:00:00Z"};
const status = messages.InstitutionalModelResult.status;

function render(calculation: "running" | "waiting" | null, result: InstitutionalModelResult = queued) {
  return renderToStaticMarkup(<NextIntlClientProvider locale="pt-BR" timeZone="UTC" messages={messages}>
    <InstitutionalModelResultWork projectId="project-test" result={result} calculation={calculation} />
  </NextIntlClientProvider>);
}

describe("institutional result status from the work activity", () => {
  it("says the result is being calculated only while its job runs", () => {
    expect(render("running")).toContain(status.queued);
  });

  it("says a held calculation waits for a person, not that it is being calculated", () => {
    const html = render("waiting");
    expect(html).toContain(status.waiting);
    expect(html).not.toContain(status.queued);
  });

  it("shows a queued result without a live job as a gap with its next step", () => {
    const html = render(null);
    expect(html).toContain(status.notRunning);
    expect(html).not.toContain(status.queued);
    expect(html).toContain("#work-institutional-setup");
  });

  it("leaves finished statuses as they are", () => {
    expect(render(null, {...queued, status: "blocked"})).toContain(status.blocked);
    expect(render(null, {...queued, status: "stale"})).toContain(status.stale);
  });
});
