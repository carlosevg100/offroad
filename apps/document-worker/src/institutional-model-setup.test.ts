import {describe, expect, it, vi} from "vitest";
import type {InstitutionalModelConfiguration} from "@offroad/financial-model";
import {ensureInstitutionalModelSetup} from "./institutional-model-setup";
import type {FullCaseAnalysisJob} from "./queue";

const job = {kind: "case_analysis"} as FullCaseAnalysisJob;

describe("institutional setup in approved material production", () => {
  it("does not request model information for teaser-only work or shadow execution", async () => {
    for (const flags of [{workbookRequested: false, shadow: false}, {workbookRequested: true, shadow: true}]) {
      expect(await ensureInstitutionalModelSetup({job, queue: {}, locale: "pt-BR", ...flags}))
        .toEqual({status: "not_requested", openCount: 0});
    }
  });
  it("persists bilingual questions with bindings and stable identities across retries", async () => {
    for (const locale of ["pt-BR", "en-US"] as const) {
      const loadInstitutionalConfiguration = vi.fn(async () => ({configuration: null}));
      const syncInstitutionalInformationRequests = vi.fn(async () => ({openCount: 4}));
      const input = {job, queue: {loadInstitutionalConfiguration, syncInstitutionalInformationRequests}, locale, workbookRequested: true, shadow: false};
      expect(await ensureInstitutionalModelSetup(input)).toEqual({status: "configuration_requested", openCount: 4});
      await ensureInstitutionalModelSetup(input);
      const first = syncInstitutionalInformationRequests.mock.calls[0];
      expect(first).toEqual(syncInstitutionalInformationRequests.mock.calls[1]);
      expect(loadInstitutionalConfiguration).toHaveBeenCalledWith(job);
      const projection = syncInstitutionalInformationRequests.mock.calls[0] as unknown as [FullCaseAnalysisJob, {requests: Array<{key: string; answerBinding: unknown}>}];
      expect(projection[1].requests).toHaveLength(4);
      expect(projection[1].requests.every(request => request.key && request.answerBinding)).toBe(true);
    }
  });
  it("does not replace an existing configuration or certify its model readiness", async () => {
    const syncInstitutionalInformationRequests = vi.fn(async () => ({openCount: 0}));
    const result = await ensureInstitutionalModelSetup({job, locale: "pt-BR", workbookRequested: true, shadow: false,
      queue: {loadInstitutionalConfiguration: async () => ({configuration: {} as InstitutionalModelConfiguration}), syncInstitutionalInformationRequests}});
    expect(result.status).toBe("configuration_present");
    expect(syncInstitutionalInformationRequests).not.toHaveBeenCalled();
  });
  it("refuses to pretend questions were saved when the store is absent", async () => {
    await expect(ensureInstitutionalModelSetup({job, queue: {}, locale: "pt-BR", workbookRequested: true, shadow: false}))
      .rejects.toThrow("institutional_model_setup_store_unavailable");
  });
  it("keeps answered setup requests awaiting reviewed mapping, never labels them ready", async () => {
    expect(await ensureInstitutionalModelSetup({job, locale: "pt-BR", workbookRequested: true, shadow: false,
      queue: {loadInstitutionalConfiguration: async () => ({configuration: null}), syncInstitutionalInformationRequests: async () => ({openCount: 0})}}))
      .toEqual({status: "configuration_needs_review", openCount: 0});
  });
});
