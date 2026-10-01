import {createHash} from "node:crypto";

export const gatewayAdapterInputVersions = {legacy: "gateway-adapter-input.v1", ordinal: "gateway-adapter-input.v2"} as const;
export type GatewayAdapterInputVersion = typeof gatewayAdapterInputVersions[keyof typeof gatewayAdapterInputVersions];

/** Historical representation, intentionally unchanged. Do not rehash old receipts with v2. */
export function legacyGatewayStableText(value: unknown): string {
  if (value === undefined) return "undefined";
  if (Array.isArray(value)) return `[${value.map(legacyGatewayStableText).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => `${JSON.stringify(key)}:${legacyGatewayStableText(child)}`).join(",")}}`;
  return JSON.stringify(value) ?? "undefined";
}
export const legacyGatewayFingerprint = (value: unknown) => createHash("sha256").update(legacyGatewayStableText(value)).digest("hex");

/** New JSON-only representation: ordinal UTF-16 keys, preserved arrays, no locale/normalization.
 * Optional adapter properties must be omitted rather than serialized as undefined. */
export function ordinalGatewayStableText(value: unknown): string {
  return ordinalText(value, new Set<object>(), 0);
}
function ordinalText(value: unknown, ancestors: Set<object>, depth: number): string {
  if (depth > 128) throw new Error("gateway_input_serialization_invalid");
  if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number" && Number.isFinite(value)) return JSON.stringify(value);
  if (value && typeof value === "object") {
    if (ancestors.has(value)) throw new Error("gateway_input_serialization_invalid");
    ancestors.add(value);
  }
  try {
  if (Array.isArray(value)) {
    const keys = Reflect.ownKeys(value);
    if (keys.length !== value.length + 1 || !keys.includes("length")) throw new Error("gateway_input_serialization_invalid");
    const values: unknown[] = [];
    for (let index = 0; index < value.length; index++) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) throw new Error("gateway_input_serialization_invalid");
      values.push(descriptor.value);
    }
    return `[${values.map(child => ordinalText(child, ancestors, depth + 1)).join(",")}]`;
  }
  if (value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    const keys = Reflect.ownKeys(value);
    if (keys.some(key => typeof key !== "string")) throw new Error("gateway_input_serialization_invalid");
    const entries = (keys as string[]).sort((a, b) => a < b ? -1 : a > b ? 1 : 0).map(key => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) throw new Error("gateway_input_serialization_invalid");
      return `${JSON.stringify(key)}:${ordinalText(descriptor.value, ancestors, depth + 1)}`;
    });
    return `{${entries.join(",")}}`;
  }
  throw new Error("gateway_input_serialization_invalid");
  } finally {if (value && typeof value === "object") ancestors.delete(value);}
}
export const ordinalGatewayFingerprint = (value: unknown) => createHash("sha256").update(ordinalGatewayStableText(value)).digest("hex");
