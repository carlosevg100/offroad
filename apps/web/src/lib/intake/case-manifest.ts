import {caseExportVersion} from "@offroad/case-export";
import {caseMaterialsVersion} from "@offroad/case-materials";
import {caseUnderstandingVersion, fingerprintJson, type CaseArtifactManifest} from "@offroad/case-understanding";
import {ontologyVersion} from "@offroad/credit-ontology";
import {creditPlaybookVersion} from "@offroad/credit-playbook";
import {financialCoreVersion} from "@offroad/financial-core";
import {marketReferenceVersion, provenance} from "@offroad/market-reference";
import {matchingCoreVersion} from "@offroad/matching-core";
import {modelGatewayVersion, type GatewayCallLog} from "@offroad/model-gateway";
import {reconciliationVersion} from "@offroad/reconciliation";

import type {Json} from "@/types/database";

/**
 * The normalized inputs that can change the economics, evidence or release status of a case.
 * Presentation timestamps and the previously persisted result are deliberately absent: writing
 * a snapshot must never invalidate that same snapshot.
 */
export type EconomicInputSnapshot = {
  session: Record<string, Json | undefined>;
  sources: Array<Record<string, Json | undefined>>;
  candidates: Array<Record<string, Json | undefined>>;
  answers: Array<Record<string, Json | undefined>>;
  layers: Array<Record<string, Json | undefined>>;
  run: Record<string, Json | undefined> | null;
};

export function normalizeEconomicInput(input: EconomicInputSnapshot): EconomicInputSnapshot {
  return {
    session: input.session,
    sources: sortRecords(input.sources),
    candidates: sortRecords(input.candidates),
    answers: sortRecords(input.answers),
    layers: sortRecords(input.layers),
    run: input.run,
  };
}

export function economicInputFingerprint(input: EconomicInputSnapshot): string {
  return fingerprintJson(normalizeEconomicInput(input));
}

export function parserVersionFingerprint(layers: EconomicInputSnapshot["layers"]): string {
  return `parser-set:${fingerprintJson(sortRecords(layers.map((layer) => ({
    source_document_id: layer.source_document_id,
    document_version: layer.document_version,
    parser_versions: layer.parser_versions,
  }))))}`;
}

export function pipelineVersions(input: {snapshot: EconomicInputSnapshot; extractionVersion: string}) {
  const runVersions = asRecord(input.snapshot.run?.versions);
  const marketAsOf = provenance.kind === "desk_practice" ? provenance.statedOn : "2026-08-24";
  return {
    parser: parserVersionFingerprint(input.snapshot.layers),
    ontology: ontologyVersion,
    extractionPrompt: stringVersion(runVersions.extractionPrompt) ?? input.extractionVersion,
    modelPolicy: modelGatewayVersion,
    reconciliation: reconciliationVersion,
    financialCore: financialCoreVersion,
    playbook: creditPlaybookVersion,
    marketData: {
      version: marketReferenceVersion,
      asOf: new Date(`${marketAsOf}T00:00:00.000Z`).toISOString(),
    },
    caseUnderstanding: caseUnderstandingVersion,
    materialCompiler: caseMaterialsVersion,
    template: caseExportVersion,
    matching: matchingCoreVersion,
  };
}

export function invocationManifest(call: GatewayCallLog): CaseArtifactManifest["models"][number] {
  return {
    invocationId: call.invocationId,
    task: call.task,
    provider: call.provider,
    model: call.model,
    effort: call.effort,
    outcome: call.outcome,
    costUsd: call.costUsd,
    usage: call.usage,
    promptFingerprint: call.promptFingerprint,
    inputFingerprint: call.inputFingerprint,
    outputFingerprint: call.outputFingerprint,
  };
}

function sortRecords(records: Array<Record<string, Json | undefined>>): Array<Record<string, Json | undefined>> {
  return [...records].sort((left, right) => fingerprintJson(left).localeCompare(fingerprintJson(right)));
}

function asRecord(value: Json | undefined): Record<string, Json> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, Json> : {};
}

function stringVersion(value: Json | undefined): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}
