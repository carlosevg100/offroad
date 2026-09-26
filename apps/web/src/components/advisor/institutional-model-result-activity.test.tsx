import {renderToStaticMarkup} from "react-dom/server";
import {NextIntlClientProvider} from "next-intl";
import {describe, expect, it} from "vitest";
import messages from "../../../messages/pt-BR.json";
import type {InstitutionalModelResult} from "@/lib/advisor/institutional-model-results";
import {InstitutionalModelResultWork} from "./institutional-model-result-work";

const queued: InstitutionalModelResult = {id: "result-test", status: "queued", configurationId: "config-test", configurationFingerprint: "a".repeat(64),
  sourceManifestFingerprint: "b".repeat(64), artifact: null, blockers: [], createdAt: "2026-09-10T00:00:00Z"};
const status = messages.InstitutionalModelResult.status;

function render(calculating: boolean, result: InstitutionalModelResult = queued, recalculation: {updateId: string; adoptable: boolean} | null = null) {
  return renderToStaticMarkup(<NextIntlClientProvider locale="pt-BR" timeZone="UTC" messages={messages}>
    <InstitutionalModelResultWork projectId="project-test" result={result} calculating={calculating} recalculation={recalculation} />
  </NextIntlClientProvider>);
}

describe("institutional result while a recalculation waits for adoption (5D)", () => {
  const update = "a4210000-0000-4000-9000-000000000060";
  it("points to the update whose recalculated result waits for the person's decision, instead of asking for a new calculation", () => {
    const html = render(false, {...queued, status: "stale"}, {updateId: update, adoptable: true});
    expect(html).toContain(status.recalculationReady);
    expect(html).not.toContain(status.stale);
    expect(html).toContain(`href="#work-updates/${update}"`);
    expect(html).toContain(messages.InstitutionalModelResult.openUpdate);
  });

  it("says the update still waits for another step when its recalculated result is ready but the update is not", () => {
    const html = render(false, {...queued, status: "stale"}, {updateId: update, adoptable: false});
    expect(html).toContain(status.recalculationWaiting);
    expect(html).not.toContain(status.recalculationReady);
    expect(html).toContain(`href="#work-updates/${update}"`);
  });

  it("keeps the outdated result and its next step when no recalculation waits", () => {
    const html = render(false, {...queued, status: "stale"});
    expect(html).toContain(status.stale);
    expect(html).not.toContain("#work-updates");
  });
});

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
