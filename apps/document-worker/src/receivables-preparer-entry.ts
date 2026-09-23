import {buildReceivablesRawUniverse, detectReceivablesRawEvidence} from "@offroad/receivables-analysis";
import {discoverReceivablesEvidence, resolveConfirmedReceivablesScope} from "./receivables-scope-resolution";
import type {ReceivablesEvidenceEnvelope} from "./receivables-evidence";
import {prepareReceivablesInputWithOrigins} from "./receivables-preparation";
import {replayReceivablesPreparationHistory} from "./receivables-preparation-history";

/** Technical preparation has a release identity separate from the financial method.
 * Its source closure is packaged and attested before the SQL receipt can accept it. */
export const receivablesPreparationVersion = "r01-preparation.2026-09-23.v1";
export function prepareReceivablesExecutionInput(input: {
  sessionId: string;
  evidence: readonly ReceivablesEvidenceEnvelope[];
  confirmedScope: unknown;
  history: Parameters<typeof replayReceivablesPreparationHistory>[0]["history"];
  currentDraft: unknown;
  responses: Parameters<typeof replayReceivablesPreparationHistory>[0]["responses"];
  resolvedValues: Parameters<typeof replayReceivablesPreparationHistory>[0]["resolvedValues"];
}) {
  const discovery = discoverReceivablesEvidence(input.evidence);
  const selected = resolveConfirmedReceivablesScope(discovery,input.confirmedScope);
  if (selected.state !== "current") throw new Error(`receivables_preparation_${selected.code}`);
  const {scope,documents,fiscalArchives,datasetHash} = selected;
  const candidate = scope.primaryTape;
  const universeId = `${input.sessionId}:pool:${candidate.documentId}:${encodeURIComponent(candidate.sheet)}:${candidate.headerRow}`;
  const built = buildReceivablesRawUniverse({universeId,datasetHash,reportingDate:scope.reportingDate,documents});
  if (!built.phaseOne) throw new Error("receivables_preparation_source_universe_unavailable");
  const draft = replayReceivablesPreparationHistory({...input,phaseOne:built.phaseOne,documents});
  const prepared = prepareReceivablesInputWithOrigins({phaseOne:built.phaseOne,draft});
  const detection = detectReceivablesRawEvidence({universeId,reportingDate:built.phaseOne.universe.dates.reportingDate,datasetHash,documents,fiscalArchives});
  return {schemaVersion:receivablesPreparationVersion,scope,sourceManifest:discovery.sourceManifest,
    phaseOne:built.phaseOne,detection,...prepared};
}
