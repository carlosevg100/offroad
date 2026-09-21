import {execFileSync} from "node:child_process";
import {readFileSync} from "node:fs";
import {dirname, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import assert from "node:assert/strict";
import {executionCanonicalText, executionInputFingerprint, executionSerializationVersion, loadExecutionCanonicalText} from "../src/execution-contract.ts";

const database = process.env.OFFROAD_E2E_DATABASE_URL;
const address = database ? new URL(database) : null;
if (!address || !["postgres:", "postgresql:"].includes(address.protocol) || !["127.0.0.1", "localhost", "[::1]"].includes(address.hostname) || address.search || address.hash) throw new Error("execution_byte_proof_requires_local_database");
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const expand = (path: string): string => readFileSync(path, "utf8").replace(/^\\ir (.+)$/gm, (_line, relative: string) => expand(resolve(dirname(path), relative)));
const vectors = [null, true, false, [], {}, {z: 1, a: 2, A: 3, á: 4, "😀": 5}, {text: 'Ação 😀 "\\\n'}, [0, -0, 1e-7, 1e21, Number.MAX_SAFE_INTEGER], {decimal: "12345678901234567890.123456789"}];
const text = executionCanonicalText(vectors);
// Hex encoding is data, not interpolated SQL syntax. No fixture is retained after ROLLBACK.
const prefix = `select set_config('offroad.test_execution_bytes',convert_from(decode('${Buffer.from(text).toString("hex")}','hex'),'UTF8'),false);\n`;
// libpq environment defaults (notably PGHOSTADDR/services) must not override localhost.
const databaseEnvironment = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("PG")));
const output = execFileSync("psql", ["--dbname", address.href, "--no-psqlrc", "-v", "ON_ERROR_STOP=1", "-Atq"], {
  input: prefix + expand(resolve(root, "supabase/tests/execution_persistence.sql")),
  env: databaseEnvironment, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"],
});
const line = output.split("\n").find(value => value.startsWith("EXECUTION_ROUNDTRIP:"));
assert(line, "SQL did not return the persisted snapshot");
const receipt = JSON.parse(line.slice("EXECUTION_ROUNDTRIP:".length));
assert.equal(receipt.text, text);
assert.equal(receipt.version, executionSerializationVersion);
assert.equal(receipt.fingerprint, executionInputFingerprint(vectors));
assert.deepEqual(receipt.projection, JSON.parse(text));
assert.deepEqual(loadExecutionCanonicalText(receipt.text, receipt.fingerprint, receipt.version), JSON.parse(text));
assert(output.includes("execution_persistence: PASS"));
console.log(`execution_bytes_roundtrip: PASS (${vectors.length} vectors, stored UTF-8/hash/projection verified, rollback)`);
