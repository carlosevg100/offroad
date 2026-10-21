/** A strict JSON reader for acquired market bytes (M2 part 0). `JSON.parse` keeps the last of two
 * equal keys, drops a byte order mark through `TextDecoder` and accepts a lone surrogate or NUL that
 * Postgres `text`/`jsonb` cannot hold, so the worker and the database could read different values.
 * This reader refuses all of them: UTF-8 without BOM, RFC 8259 grammar, no repeated key in an object,
 * strings made of Unicode scalar values without U+0000. Numbers keep their JSON type; a parser that
 * wants text must find text. */
export class StrictJsonError extends Error {
  constructor(readonly code: string) {super(code);}
}

export type JsonValue = null | boolean | number | string | JsonValue[] | {[key: string]: JsonValue};

const loneSurrogate = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/;

export function strictJsonParse(bytes: Uint8Array): JsonValue {
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) throw new StrictJsonError("json_bom");
  let text: string;
  try {text = new TextDecoder("utf-8", {fatal: true, ignoreBOM: true}).decode(bytes);} catch {throw new StrictJsonError("json_not_utf8");}
  let i = 0;
  const fail = (code = "json_syntax"): never => {throw new StrictJsonError(code);};
  const ws = () => {while (i < text.length && " \t\n\r".includes(text[i]!)) i++;};
  const str = (): string => {
    if (text[i] !== "\"") fail();
    i++;
    let out = "";
    for (;;) {
      if (i >= text.length) fail();
      const c = text[i++]!;
      if (c === "\"") break;
      if (c < " ") fail();
      if (c !== "\\") {out += c; continue;}
      const e = text[i++];
      if (e === "u") {
        const hex = text.slice(i, i + 4);
        if (!/^[0-9a-fA-F]{4}$/.test(hex)) fail();
        out += String.fromCharCode(parseInt(hex, 16)); i += 4;
      } else {
        const simple: Record<string, string> = {"\"": "\"", "\\": "\\", "/": "/", b: "\b", f: "\f", n: "\n", r: "\r", t: "\t"};
        if (e === undefined || !(e in simple)) fail();
        out += simple[e!];
      }
    }
    if (out.includes("\u0000")) fail("json_nul");
    if (loneSurrogate.test(out)) fail("json_lone_surrogate");
    return out;
  };
  const value = (): JsonValue => {
    ws();
    const c = text[i];
    if (c === "{") {
      i++; ws();
      const obj: {[key: string]: JsonValue} = Object.create(null) as {[key: string]: JsonValue};
      const seen = new Set<string>();
      if (text[i] === "}") {i++; return obj;}
      for (;;) {
        ws();
        const k = str();
        if (seen.has(k)) fail("json_duplicate_key");
        seen.add(k);
        ws();
        if (text[i++] !== ":") fail();
        obj[k] = value();
        ws();
        const sep = text[i++];
        if (sep === "}") return obj;
        if (sep !== ",") fail();
      }
    }
    if (c === "[") {
      i++; ws();
      const arr: JsonValue[] = [];
      if (text[i] === "]") {i++; return arr;}
      for (;;) {
        arr.push(value());
        ws();
        const sep = text[i++];
        if (sep === "]") return arr;
        if (sep !== ",") fail();
      }
    }
    if (c === "\"") return str();
    const m = /^(?:-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null)/.exec(text.slice(i));
    if (!m) return fail();
    i += m[0].length;
    return m[0] === "true" ? true : m[0] === "false" ? false : m[0] === "null" ? null : Number(m[0]);
  };
  const v = value();
  ws();
  if (i !== text.length) fail();
  return v;
}

export const isJsonObject = (v: JsonValue | undefined): v is {[key: string]: JsonValue} => typeof v === "object" && v !== null && !Array.isArray(v);
