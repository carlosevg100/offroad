import {caseExportVersion} from "@offroad/case-export";
import {caseMaterialsVersion} from "@offroad/case-materials";
import {
  caseUnderstandingVersion,
  fingerprintJson,
  type CaseArtifactManifest,
} from "@offroad/case-understanding";
import {ontologyVersion} from "@offroad/credit-ontology";
import {
  creditPlaybookVersion,
  growthCapexProcedureRegistry,
  materialTemplateRegistryHash,
  procedureCompilerVersion,
} from "@offroad/credit-playbook";
import {financialCoreVersion} from "@offroad/financial-core";
import {marketReferenceVersion, provenance} from "@offroad/market-reference";
import {matchingCoreVersion} from "@offroad/matching-core";
import {modelGatewayVersion, type GatewayCallLog} from "@offroad/model-gateway";
import {reconciliationVersion} from "@offroad/reconciliation";

/** Inputs that can change the economics, evidence or release status of a case. */
export type EconomicInputSnapshot = {
  session: Record<string, unknown>;
  sources: Array<Record<string, unknown>>;
  candidates: Array<Record<string, unknown>>;
  answers: Array<Record<string, unknown>>;
  layers: Array<Record<string, unknown>>;
  run: Record<string, unknown> | null;
};

export function normalizeEconomicInput(input: EconomicInputSnapshot): EconomicInputSnapshot {
  return {
    // Operational state changes when the case job completes. It is not an economic change and
    // must not invalidate the snapshot the job just wrote.
    session: withoutKeys(input.session, ["status"]),
    sources: sortRecords(input.sources),
    candidates: sortRecords(input.candidates),
    answers: sortRecords(input.answers),
    layers: sortRecords(input.layers),
    run: input.run ? withoutKeys(input.run, ["status", "model_calls"]) : null,
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
    procedureCompiler: procedureCompilerVersion,
    procedureRegistry: growthCapexProcedureRegistry.registryHash,
    materialTemplateRegistry: materialTemplateRegistryHash,
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

function sortRecords(records: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  return [...records].sort((left, right) => fingerprintJson(left).localeCompare(fingerprintJson(right)));
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringVersion(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function withoutKeys(record: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  const excluded = new Set(keys);
  return Object.fromEntries(Object.entries(record).filter(([key]) => !excluded.has(key)));
}
