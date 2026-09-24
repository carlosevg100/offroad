import {
 runStructuredOutputProbe,
 structuredOutputProbeRoutes,
 structuredOutputProbeSnapshotSchema,
 type StructuredOutputProbeAttempt,
 type StructuredOutputProbePort,
 type StructuredOutputProbeResult,
} from "@offroad/agent-contracts";
import {
 classificationMeasurementContentHashes,
 classificationMeasurementRoutes,
 classificationMeasurementSnapshotSchema,
 documentClassificationVersion,
 runClassificationMeasurement,
 type ClassificationMeasurementResult,
} from "@offroad/document-classification";
import {
 documentExtractionVersion,
 extractionMeasurementContentHashes,
 extractionMeasurementRoutes,
 extractionMeasurementSnapshotSchema,
 extractionPromptVersion,
 runExtractionMeasurement,
 type ExtractionMeasurementResult,
} from "@offroad/document-extraction";
import {ModelGatewayError, type ModelGateway} from "@offroad/model-gateway";
import type {EvaluationFamily} from "./evaluation-families";

/**
 * The measurement families of stage 17, increment 5: the extraction and classification
 * measurements of a gold case and the structured-output probe, each the pure function of its
 * snapshot and the governed gateway that its script called live before, reusing the same product
 * modules. Each family reads its snapshot strictly, declares every route, content hash, case and
 * task policy from that snapshot only, and refuses a snapshot built for another extractor or
 * classifier before anything is reserved.
 */

/** Extraction over the gold case's parsed documents, each with the profile the gold hands it (E3 in isolation). */
export const extractionMeasurementFamily: EvaluationFamily = {
 id: "extraction_measurement",
 prepare(value) {
  const snapshot = extractionMeasurementSnapshotSchema.parse(value);
  if (snapshot.extractor.version !== documentExtractionVersion || snapshot.extractor.promptVersion !== extractionPromptVersion()) {
   throw new Error("extraction_measurement_version_mismatch");
  }
  const {primary, fallback, maxOutputTokens, timeoutMs} = snapshot.model;
  return {
   family: "extraction_measurement",
   routes: extractionMeasurementRoutes(snapshot),
   contentHashes: extractionMeasurementContentHashes(snapshot),
   audience: {caseId: snapshot.caseId, caseVersion: snapshot.caseVersion},
   policies: {extract_fields: {primary, ...(fallback ? {fallback} : {}), maxOutputTokens, timeoutMs}},
   async run(gateway, clock) {
    // The shape the script reads back with readExtractionMeasurementResult.
    return await runExtractionMeasurement(snapshot, gateway, clock) satisfies ExtractionMeasurementResult;
   },
  };
 },
};

/** Classification of the gold case's parsed documents (E1), the columns of the script's record that come from the classifier. */
export const classificationMeasurementFamily: EvaluationFamily = {
 id: "classification_measurement",
 prepare(value) {
  const snapshot = classificationMeasurementSnapshotSchema.parse(value);
  if (snapshot.classifierVersion !== documentClassificationVersion) throw new Error("classification_measurement_version_mismatch");
  const {primary, fallback, maxOutputTokens, timeoutMs} = snapshot.model;
  return {
   family: "classification_measurement",
   routes: classificationMeasurementRoutes(snapshot),
   contentHashes: classificationMeasurementContentHashes(snapshot),
   audience: {caseId: snapshot.caseId, caseVersion: snapshot.caseVersion},
   policies: {classify_document: {primary, ...(fallback ? {fallback} : {}), maxOutputTokens, timeoutMs}},
   async run(gateway, clock) {
    // The shape the script reads back with readClassificationMeasurementResult.
    return await runClassificationMeasurement(snapshot, gateway, clock) satisfies ClassificationMeasurementResult;
   },
  };
 },
};

/**
 * The gateway as the probe's port: a model's own failure (refused, invalid or truncated output, no
 * configured connection) is a verdict with the gateway's code and each attempt's outcome; anything
 * else is the governed transport refusing or stopping the run, and it is thrown.
 */
export function structuredOutputProbePort(gateway: ModelGateway): StructuredOutputProbePort {
 return {
  async attempt(request) {
   try {
    const result = await gateway.complete(request);
    return {accepted: true, model: result.model, output: result.output};
   } catch (error) {
    if (!(error instanceof ModelGatewayError)) throw error;
    type Attempt = Extract<StructuredOutputProbeAttempt, {accepted: false}>["attempts"][number];
    const outcomes: ReadonlyArray<Attempt["outcome"]> = ["ok", "refusal", "error", "invalid_output", "policy_rejected"];
    const attempts = (Array.isArray(error.details) ? error.details as unknown[] : []).flatMap((attempt): Attempt[] => {
     const entry = attempt !== null && typeof attempt === "object" ? attempt as {outcome?: unknown; message?: unknown} : {};
     const outcome = outcomes.find((known) => known === entry.outcome);
     if (!outcome) return [];
     return [{outcome, ...(typeof entry.message === "string" ? {message: entry.message.slice(0, 400)} : {})}];
    });
    return {accepted: false, code: error.code, attempts};
   }
  },
 };
}

/** One request per shape a routing task uses, on one route, with no fallback. */
export const structuredOutputProbeFamily: EvaluationFamily = {
 id: "structured_output_probe",
 prepare(value) {
  const snapshot = structuredOutputProbeSnapshotSchema.parse(value);
  const routes = structuredOutputProbeRoutes(snapshot);
  return {
   family: "structured_output_probe",
   routes,
   // A fixed synthetic sentence and nothing else: the probe carries no source.
   contentHashes: [],
   audience: {caseId: snapshot.caseId, caseVersion: snapshot.caseVersion},
   // Every request names its route and effort and allows no fallback; the policy only holds the limits.
   policies: {route_intent: {primary: routes[0]!, maxOutputTokens: snapshot.maxOutputTokens, timeoutMs: snapshot.timeoutMs}},
   async run(gateway, clock) {
    // The shape the script reads back with readStructuredOutputProbeResult.
    return await runStructuredOutputProbe(snapshot, structuredOutputProbePort(gateway), clock) satisfies StructuredOutputProbeResult;
   },
  };
 },
};

/** Registered under each script's file name, the contract's audience.scriptId. */
export const measurementEvaluationFamilies: Readonly<Record<string, EvaluationFamily>> = Object.freeze({
 "measure-extraction": extractionMeasurementFamily,
 "measure-classification": classificationMeasurementFamily,
 "probe-structured-output": structuredOutputProbeFamily,
});
