import {buildInstitutionalModelInformationRequests, prepareInstitutionalModelInput, type InstitutionalModelConfiguration} from "@offroad/financial-model";
import type {FullCaseAnalysisJob} from "./queue";

type SetupQueue = {
  loadInstitutionalConfiguration?: (job: FullCaseAnalysisJob) => Promise<{configuration: InstitutionalModelConfiguration | null}>;
  syncInstitutionalInformationRequests?: (job: FullCaseAnalysisJob, input: {requests: readonly unknown[]}) => Promise<{openCount: number}>;
};

/** Collect the reviewed model mapping only for an approved workbook request.
 * Existing configuration is not certified here: source validation, calculation and model
 * approval remain separate. No historical document metadata is inferred from a scenario.
 */
export async function ensureInstitutionalModelSetup(input: {
  queue: SetupQueue; job: FullCaseAnalysisJob; workbookRequested: boolean;
  shadow: boolean; locale: "pt-BR" | "en-US";
}): Promise<{status: "not_requested" | "configuration_present" | "configuration_requested" | "configuration_needs_review"; openCount: number}> {
  if (input.shadow || !input.workbookRequested) return {status: "not_requested", openCount: 0};
  if (!input.queue.loadInstitutionalConfiguration || !input.queue.syncInstitutionalInformationRequests) {
    throw new Error("institutional_model_setup_store_unavailable");
  }
  const stored = await input.queue.loadInstitutionalConfiguration(input.job);
  if (stored.configuration) return {status: "configuration_present", openCount: 0};
  const prepared = prepareInstitutionalModelInput({facts: [], sources: []});
  const projection = buildInstitutionalModelInformationRequests(prepared, input.locale);
  const synced = await input.queue.syncInstitutionalInformationRequests(input.job, {requests: projection.requests});
  return {status: synced.openCount > 0 ? "configuration_requested" : "configuration_needs_review", openCount: synced.openCount};
}
