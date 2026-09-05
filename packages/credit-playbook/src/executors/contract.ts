import {readFileSync} from "node:fs";
import {dirname, resolve} from "node:path";
import {fileURLToPath} from "node:url";

/**
 * Test helper: the top-level keys an executor emits must be exactly the Outputs the method declares.
 * The compiled skill schema is closed over those Outputs, so an undeclared key would be rejected at
 * runtime and a missing required key would fail validation.
 */
const here = dirname(fileURLToPath(import.meta.url));

export function declaredOutputs(methodPath: string): {required: string[]; optional: string[]} {
  const text = readFileSync(resolve(here, "../../knowledge/procedures", methodPath), "utf8");
  const section = text.split(/^# Outputs\n/m)[1]?.split(/^# /m)[0] ?? "";
  const required: string[] = [];
  const optional: string[] = [];
  for (const line of section.split("\n")) {
    const match = /^- ([a-z][a-z0-9_.-]*) \(([a-z_]+), (required|optional)\)/.exec(line);
    if (!match) continue;
    (match[3] === "required" ? required : optional).push(match[1]!);
  }
  return {required, optional};
}

export function contractMismatch(output: Record<string, unknown>, methodPath: string): string[] {
  const {required, optional} = declaredOutputs(methodPath);
  const declared = new Set([...required, ...optional]);
  const keys = Object.keys(output);
  const problems: string[] = [];
  for (const key of keys) if (!declared.has(key)) problems.push(`emitted key ${key} is not declared in the method's Outputs`);
  for (const key of required) if (!(key in output)) problems.push(`required output ${key} is missing`);
  return problems;
}
