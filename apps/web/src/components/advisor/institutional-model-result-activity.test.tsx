import {renderToStaticMarkup} from "react-dom/server";
import {NextIntlClientProvider} from "next-intl";
import {describe, expect, it} from "vitest";
import messages from "../../../messages/pt-BR.json";
import type {InstitutionalModelResult} from "@/lib/advisor/institutional-model-results";
import {InstitutionalModelResultWork} from "./institutional-model-result-work";

const queued: InstitutionalModelResult = {id: "result-test", status: "queued", configurationId: "config-test", configurationFingerprint: "a".repeat(64),
  sourceManifestFingerprint: "b".repeat(64), artifact: null, blockers: [], createdAt: "2026-09-10T00:00:00Z"};
const status = messages.InstitutionalModelResult.status;

function render(calculating: boolean, result: InstitutionalModelResult = queued) {
  return renderToStaticMarkup(<NextIntlClientProvider locale="pt-BR" timeZone="UTC" messages={messages}>
    <InstitutionalModelResultWork projectId="project-test" result={result} calculating={calculating} />
  </NextIntlClientProvider>);
}

describe("institutional result status from the work activity", () => {
  it("says the result is being calculated only while its calculation runs", () => {
    expect(render(true)).toContain(status.queued);
  });

  it("shows a queued result that nothing calculates as a gap with its next step", () => {
    const html = render(false);
    expect(html).toContain(status.notRunning);
    expect(html).not.toContain(status.queued);
    expect(html).toContain("#work-institutional-setup");
  });

  it("leaves finished statuses as they are", () => {
    expect(render(false, {...queued, status: "blocked"})).toContain(status.blocked);
    expect(render(false, {...queued, status: "stale"})).toContain(status.stale);
  });
});
