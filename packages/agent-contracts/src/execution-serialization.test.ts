import {createHash} from "node:crypto";
import {describe, expect, it} from "vitest";
import {executionCanonicalText, executionInputFingerprint, executionSerializationVersion, loadExecutionCanonicalText} from "./execution-contract";
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
describe("durable execution bytes", () => {
  it("uses UTF-16 key order independent of locale collation", () => {
    expect(executionCanonicalText({z: 1, a: 2, A: 3, á: 4, "😀": 5})).toBe('{"A":3,"a":2,"z":1,"á":4,"😀":5}');
  });
  it("round-trips Unicode, escapes, scalar limits and precise decimal strings", () => {
    const input = {"companhia": "Ação 😀 \"\\\n", values: [null, true, false, 0, -0, 1e-7, Number.MAX_SAFE_INTEGER, "12345678901234567890.123456789"], empty: {}};
    const text = executionCanonicalText(input);
    expect(executionInputFingerprint(input)).toBe(hash(text));
    expect(loadExecutionCanonicalText(text, hash(text), executionSerializationVersion)).toEqual(JSON.parse(JSON.stringify(input)));
  });
  it.each(['{"a":1,"a":2}', '{ "a": 1 }', '{"z":1,"a":2}', '1.0', '-0'])("refuses noncanonical or ambiguous bytes: %s", text => {
    expect(() => loadExecutionCanonicalText(text, hash(text), executionSerializationVersion)).toThrow("execution_bytes_not_canonical");
  });
  it.each(["\u0000", "\ud800", "\udfff", {"\ud800": 1}])("rejects JSON PostgreSQL cannot retain losslessly: %j", value => {
    expect(() => executionCanonicalText(value)).toThrow("execution_snapshot_invalid_unicode");
  });
  it("refuses unsupported algorithms and altered bytes", () => {
    expect(() => loadExecutionCanonicalText('{}', hash('{}'), 'unknown')).toThrow('execution_serialization_version_unavailable');
    expect(() => loadExecutionCanonicalText('{"a":1}', hash('{}'), executionSerializationVersion)).toThrow('execution_bytes_mismatch');
  });
});
