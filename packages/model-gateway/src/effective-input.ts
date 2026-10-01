import {z} from "zod";
import {redactPersonalIdentifiers, type RedactionOptions} from "./redaction";
import {gatewayAdapterInputVersions, legacyGatewayFingerprint, ordinalGatewayFingerprint} from "./input-serialization";
import type {AdapterRequest, GatewayRequest, ModelRef} from "./types";

/** Owned data only. Shared Zod internals remain mutable; assert at dispatch. */
function freezeData<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) freezeData(child);
    Object.freeze(value);
  }
  return value;
}
export function prepareGatewayInput<T extends z.ZodType>(original: GatewayRequest<T>, redaction: RedactionOptions | false = {}) {
  const request = {...original, input: structuredClone(original.input),
    ...(original.model ? {model: Object.freeze({...original.model})} : {}),
    ...(original.metadata ? {metadata: structuredClone(original.metadata)} : {}),
    ...(original.dataHandling ? {dataHandling: structuredClone(original.dataHandling)} : {})};
  const input = freezeData(redaction === false ? request.input : request.input.map(part => part.type === "text"
    ? {type: "text" as const, text: redactPersonalIdentifiers(part.text, redaction).text} : part));
  if (request.metadata) freezeData(request.metadata);
  if (request.dataHandling) freezeData(request.dataHandling);
  const schemaJson = freezeData(structuredClone(z.toJSONSchema(request.schema)));
  return Object.freeze({request: Object.freeze(request), input, schemaJson, inputFingerprint: legacyGatewayFingerprint(input)});
}
export type PreparedGatewayInput<T extends z.ZodType = z.ZodType> = ReturnType<typeof prepareGatewayInput<T>>;

/** Shared by dispatch and recipe reconstruction. Route/defaults must come from pinned policy;
 * a supplied digest is never used in place of actual input, system or schema bytes. */
export function buildEffectiveAdapterRequest<T extends z.ZodType>(prepared: PreparedGatewayInput<T>, route: ModelRef,
  defaults: {maxOutputTokens: number; timeoutMs: number}, repairGuidance?: string) {
  const {request, input, schemaJson} = prepared;
  const system = repairGuidance ? `${request.system}\n\n${repairGuidance}` : request.system;
  const adapterRequest: AdapterRequest = Object.freeze({model: route.model, effort: route.effort, system, input,
    schema: request.schema, schemaName: request.schemaName,
    maxOutputTokens: request.maxOutputTokens ?? defaults.maxOutputTokens, timeoutMs: request.timeoutMs ?? defaults.timeoutMs,
    ...(request.cacheKey ? {cacheKey: request.cacheKey} : {}), ...(request.thinking ? {thinking: request.thinking} : {}),
    ...(request.outputMode ? {outputMode: request.outputMode} : {}), ...(request.metadata ? {metadata: request.metadata} : {})});
  const projection = {provider: route.provider, ...adapterRequest, schema: schemaJson};
  const requestFingerprintV1 = legacyGatewayFingerprint({schemaVersion: gatewayAdapterInputVersions.legacy, ...projection});
  // Lazy: legacy callers with historically accepted optional undefined metadata retain v1 behavior.
  const ordinalFingerprints = () => Object.freeze({schemaVersion: gatewayAdapterInputVersions.ordinal,
    requestFingerprint: ordinalGatewayFingerprint({schemaVersion: gatewayAdapterInputVersions.ordinal, ...projection}),
    inputFingerprint: ordinalGatewayFingerprint(input),
    promptFingerprint: ordinalGatewayFingerprint({system, schemaName: request.schemaName, schema: schemaJson})});
  return Object.freeze({adapterRequest, requestFingerprintV1, inputFingerprint: prepared.inputFingerprint,
    promptFingerprint: legacyGatewayFingerprint({system, schemaName: request.schemaName, schema: schemaJson}), ordinalFingerprints});
}
export function assertGatewaySchemaUnchanged<T extends z.ZodType>(prepared: PreparedGatewayInput<T>): void {
  if (legacyGatewayFingerprint(z.toJSONSchema(prepared.request.schema)) !== legacyGatewayFingerprint(prepared.schemaJson)) {
    throw new Error("output schema changed before dispatch");
  }
}
