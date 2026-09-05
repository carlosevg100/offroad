import {readFileSync} from "node:fs";
import {dirname, resolve} from "node:path";
import {fileURLToPath} from "node:url";

/**
 * Test helper: the top-level keys an executor emits must be exactly the Outputs the method declares.
 * The compiled skill schema is closed over those Outputs, so an undeclared key would be rejected at
 * runtime and a missing required key would fail validation.
 */
const here = dirname(fileURLToPath(import.meta.url));

export type DeclaredOutput = {id: string; type: string; required: boolean; nullable: boolean};

/** The Outputs lines of a method: `- id (type, required|optional): description`; a description that says the value may be null (or nulo) declares nullability. */
export function declaredOutputList(methodPath: string): DeclaredOutput[] {
  const text = readFileSync(resolve(here, "../../knowledge/procedures", methodPath), "utf8");
  const section = text.split(/^# Outputs\n/m)[1]?.split(/^# /m)[0] ?? "";
  const outputs: DeclaredOutput[] = [];
  for (const line of section.split("\n")) {
    const match = /^- ([a-z][a-z0-9_.-]*) \(([a-z_]+), (required|optional)\)(.*)$/.exec(line);
    if (!match) continue;
    outputs.push({id: match[1]!, type: match[2]!, required: match[3] === "required", nullable: /\bnull\b|\bnulo\b|\bnula\b/i.test(match[4] ?? "")});
  }
  return outputs;
}

export function declaredOutputs(methodPath: string): {required: string[]; optional: string[]} {
  const outputs = declaredOutputList(methodPath);
  return {required: outputs.filter((output) => output.required).map((output) => output.id), optional: outputs.filter((output) => !output.required).map((output) => output.id)};
}

const isDate = (value: unknown) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
const isDecimalString = (value: unknown) => typeof value === "string" && /^-?\d+(\.\d+)?$/.test(value);

/** Whether a runtime value matches a declared type token. */
export function matchesDeclaredType(value: unknown, type: string): boolean {
  switch (type) {
    case "array": return Array.isArray(value);
    case "object": return typeof value === "object" && value !== null && !Array.isArray(value);
    case "string": case "enum": return typeof value === "string" && value.length > 0;
    case "date": return isDate(value);
    case "decimal_string": return isDecimalString(value);
    case "number": return typeof value === "number" && Number.isFinite(value);
    case "boolean": return typeof value === "boolean";
    default: return false;
  }
}

/**
 * Every emitted key is declared, every required key is present, every value matches its declared type
 * (null only where the description declares it), and every anchor found anywhere in the output names a
 * document: evidence travels with the value, never as an empty placeholder.
 */
export function contractMismatch(output: Record<string, unknown>, methodPath: string): string[] {
  const outputs = declaredOutputList(methodPath);
  const declared = new Map(outputs.map((entry) => [entry.id, entry]));
  const problems: string[] = [];
  for (const key of Object.keys(output)) if (!declared.has(key)) problems.push(`emitted key ${key} is not declared in the method's Outputs`);
  for (const entry of outputs) {
    if (!(entry.id in output)) {
      if (entry.required) problems.push(`required output ${entry.id} is missing`);
      continue;
    }
    const value = output[entry.id];
    if (value === null) {
      if (!entry.nullable) problems.push(`output ${entry.id} is null and its Outputs line does not declare a null state`);
      continue;
    }
    if (value === undefined) { problems.push(`output ${entry.id} is undefined; an absent optional output is omitted, never undefined`); continue; }
    if (!matchesDeclaredType(value, entry.type)) problems.push(`output ${entry.id} is declared ${entry.type} and holds ${Array.isArray(value) ? "array" : typeof value}`);
  }
  problems.push(...anchorProblems(output, ""));
  return problems;
}

function anchorProblems(value: unknown, path: string): string[] {
  if (Array.isArray(value)) return value.flatMap((entry, index) => anchorProblems(entry, `${path}[${index}]`));
  if (typeof value !== "object" || value === null) return [];
  const record = value as Record<string, unknown>;
  const problems: string[] = [];
  for (const [key, entry] of Object.entries(record)) {
    const here = path ? `${path}.${key}` : key;
    if (/^anchor$|Anchor$/.test(key) && entry !== null && entry !== undefined) {
      if (typeof entry !== "object" || Array.isArray(entry)) problems.push(`${here} is not an anchor object`);
      else {
        const anchor = entry as Record<string, unknown>;
        if (typeof anchor.document !== "string" || anchor.document.length === 0) problems.push(`${here} names no document`);
      }
    }
    problems.push(...anchorProblems(entry, here));
  }
  return problems;
}
