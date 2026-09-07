import type {GatewayCallLog} from "@offroad/model-gateway";
import {safeModelAttemptDiagnostics} from "./model-call-log";

/**
 * Content-free provider telemetry safe to persist with a failed job. It deliberately excludes
 * prompts, provider error messages and outputs while retaining enough information to distinguish
 * a timeout/transport failure from an invalid structured response or a refusal.
 */
export function summarizeModelAttempts(calls: GatewayCallLog[]) {
  return safeModelAttemptDiagnostics(calls);
}
