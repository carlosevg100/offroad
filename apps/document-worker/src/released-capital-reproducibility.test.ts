import {createHash} from "node:crypto";
import {describe, expect, it, vi} from "vitest";
import {executionCanonicalText} from "@offroad/agent-contracts";
import {capitalDecisionReviewFixture} from "@offroad/testing-fixtures/capital-structure-decision";
import {calculatePinnedCapital} from "./execution-calculation";
import {executionResultFingerprint} from "./process-pinned-execution";
import {loadReleasedCapital} from "./released-method-executor";

// Every calculation thread created while this file runs is recorded, so the test can prove that
// the two runs never shared an isolate: execution-calculation.ts spawns one Worker per call.
const threads = vi.hoisted(() => ({ids: [] as number[]}));
vi.mock("node:worker_threads", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:worker_threads")>();
  class RecordedWorker extends actual.Worker {
    constructor(...args: ConstructorParameters<typeof actual.Worker>) {
      super(...args);
      threads.ids.push(this.threadId);
    }
  }
  return {...actual, Worker: RecordedWorker};
});

const identity = {methodId: "prepare-capital-structure-decision", methodVersion: "2026.09.21-v4", manifestHash: "2c023cf7b7ec7e35b7f59d363a9b287cb245d3196cd431fc0c2bf1fc937f8478"};

/** The synthetic decision review already shared by the financial-model packet fixtures, bound through the installed schema. No client data. */
function boundPacketInput(): string {
  const {executor} = loadReleasedCapital(identity);
  const packet = executor.capitalProcedurePacketV2InputSchema.parse({
    schemaVersion: "capital-procedure-packet-input.v2",
    decision: {review: capitalDecisionReviewFixture().input, material: {requested: false, audience: "authorized_work_participants"}},
    contracts: [],
    adoptionLinks: [],
  });
  return executionCanonicalText(packet);
}

/** Literal transcription of the SQL side: encode(digest(convert_to(p_result_text,'UTF8'),'sha256'),'hex'). */
const sqlResultHash = (text: string) => createHash("sha256").update(Buffer.from(text, "utf8")).digest("hex");
const bytes = (text: string) => Buffer.from(text, "utf8");

describe("installed published capital method v4 reproducibility", () => {
  it("returns byte-identical settlement bytes and one result fingerprint from two separate worker threads", async () => {
    const input = boundPacketInput();
    const before = threads.ids.length;
    const [first, second] = await Promise.all([
      calculatePinnedCapital(identity, input, new AbortController().signal),
      calculatePinnedCapital(identity, input, new AbortController().signal),
    ]);
    const created = threads.ids.slice(before);
    expect(created).toHaveLength(2);
    expect(new Set(created).size).toBe(2);
    if (!first.ok || !second.ok) throw new Error("the installed v4 method did not calculate the bound packet");
    expect(bytes(first.text).equals(bytes(second.text))).toBe(true);

    // The settle path persists executionCanonicalText(JSON.parse(text)); those are the bytes SQL hashes.
    const settled = [first, second].map((result) => executionCanonicalText(JSON.parse(result.text)));
    expect(bytes(settled[0]!).equals(bytes(settled[1]!))).toBe(true);
    const fingerprints = settled.map(executionResultFingerprint);
    expect(fingerprints[0]).toMatch(/^[a-f0-9]{64}$/);
    expect(fingerprints[0]).toBe(fingerprints[1]);
    expect(fingerprints[0]).toBe(sqlResultHash(settled[0]!));
    expect(JSON.parse(settled[0]!)).toMatchObject({schemaVersion: "capital-procedure-packet.v2", grantsExecution: false, grantsPublication: false});
  }, 30_000);
});
