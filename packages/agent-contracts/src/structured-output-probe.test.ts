import {describe, expect, it, vi} from "vitest";

import {
  readStructuredOutputProbeResult,
  runStructuredOutputProbe,
  structuredOutputProbeCalls,
  structuredOutputProbeLabel,
  structuredOutputProbeResultSchema,
  structuredOutputProbeRoutes,
  structuredOutputProbeShapes,
  structuredOutputProbeSnapshotSchema,
  type StructuredOutputProbePort,
  type StructuredOutputProbeRequest,
  type StructuredOutputProbeResult,
  type StructuredOutputProbeSnapshot,
} from "./structured-output-probe";

const snapshotInput = () => ({
  schemaVersion: "structured-output-probe-snapshot.v1",
  caseId: "structured-output-probe",
  caseVersion: "2026.09.24-v1",
  route: {provider: "anthropic", model: "claude-sonnet-5"},
  system: "You classify one sentence into the requested JSON. Return the requested JSON only.",
  input: [{type: "text", text: "{\"latestUserMessage\":\"Frase sintética sobre uma companhia fictícia.\"}"}],
  maxOutputTokens: 1_500,
  timeoutMs: 60_000,
  variants: [
    {effort: "low", thinking: "off", shape: "flat"},
    {effort: "low", thinking: "adaptive", shape: "full-prompted"},
    {effort: "medium", thinking: "off", shape: "nested"},
  ],
}) as Record<string, unknown>;
const snapshot = (): StructuredOutputProbeSnapshot => structuredOutputProbeSnapshotSchema.parse(snapshotInput());
const ticking = () => { let now = Date.parse("2026-09-24T12:00:00Z"); return () => new Date(now += 250); };

describe("structured output probe snapshot", () => {
  it("names each route by effort and bounds the calls, a repair included where the schema travels in the prompt", () => {
    const s = snapshot();
    expect(structuredOutputProbeRoutes(s)).toEqual([{provider: "anthropic", model: "claude-sonnet-5", effort: "low"}, {provider: "anthropic", model: "claude-sonnet-5", effort: "medium"}]);
    expect(structuredOutputProbeCalls(s)).toBe(4);
    expect(s.variants.map(structuredOutputProbeLabel)).toEqual(["effort=low thinking=off schema=flat", "effort=low thinking=adaptive schema=full-prompted",
      "effort=medium thinking=off schema=nested"]);
  });

  it.each<[string, (value: Record<string, unknown>) => void]>([
    ["an unknown field", (value) => { value.extra = true; }],
    ["an unknown shape", (value) => { (value.variants as Array<Record<string, unknown>>)[0]!.shape = "huge"; }],
    ["a variant sent twice", (value) => { (value.variants as unknown[]).push((value.variants as unknown[])[0]); }],
    ["another case", (value) => { value.caseId = "gc01"; }],
    ["no variant", (value) => { value.variants = []; }],
  ])("refuses %s", (_label, change) => {
    const value = snapshotInput();
    change(value);
    expect(structuredOutputProbeSnapshotSchema.safeParse(value).success).toBe(false);
  });
});

describe("structured output probe run", () => {
  it("sends each variant once on the snapshot's route, with no fallback, and publishes every verdict", async () => {
    const requests: StructuredOutputProbeRequest[] = [];
    const port: StructuredOutputProbePort = {attempt: vi.fn(async (request: StructuredOutputProbeRequest) => {
      requests.push(request);
      if (request.schemaName === "probe_full-prompted") return {accepted: false as const, code: "all_attempts_failed", attempts: [{outcome: "invalid_output" as const, message: "routingCore: Required"}]};
      return {accepted: true as const, model: "claude-sonnet-5", output: request.schemaName === "probe_flat" ? {intent: "x", confidence: 1, company: null} : {routingCore: {}, abstain: false}};
    })};
    const result = await runStructuredOutputProbe(snapshot(), port, ticking());
    expect(structuredOutputProbeResultSchema.parse(JSON.parse(JSON.stringify(result)))).toEqual(result);
    expect(requests.map((request) => [request.schemaName, request.outputMode, request.thinking ?? "adaptive", request.model.effort, request.allowFallback])).toEqual([
      ["probe_flat", "structured", "off", "low", false],
      ["probe_full-prompted", "prompted_json", "adaptive", "low", false],
      ["probe_nested", "structured", "off", "medium", false],
    ]);
    expect(requests[1]!.schema).toBe(structuredOutputProbeShapes.full.schema);
    expect(requests.every((request) => request.task === "route_intent" && request.maxOutputTokens === 1_500 && request.timeoutMs === 60_000
      && request.model.provider === "anthropic" && request.model.model === "claude-sonnet-5")).toBe(true);
    expect(result.variants).toEqual([
      {label: "effort=low thinking=off schema=flat", verdict: "accepted", model: "claude-sonnet-5", ms: 250, keys: ["intent", "confidence", "company"]},
      {label: "effort=low thinking=adaptive schema=full-prompted", verdict: "failed", code: "all_attempts_failed", attempts: [{outcome: "invalid_output", message: "routingCore: Required"}], ms: 250},
      {label: "effort=medium thinking=off schema=nested", verdict: "accepted", model: "claude-sonnet-5", ms: 250, keys: ["routingCore", "abstain"]},
    ]);
  });

  it("ends the run when the port throws, which is how a refusal of the transport arrives", async () => {
    const refusal = new Error("evaluation_stopped:transport_denied");
    const port: StructuredOutputProbePort = {attempt: vi.fn(async () => { throw refusal; })};
    await expect(runStructuredOutputProbe(snapshot(), port, ticking())).rejects.toBe(refusal);
    expect(port.attempt).toHaveBeenCalledOnce();
  });
});

describe("structured output probe result, read back", () => {
  const run = async (s: StructuredOutputProbeSnapshot) => JSON.parse(JSON.stringify(await runStructuredOutputProbe(s,
    {attempt: async () => ({accepted: true, model: "claude-sonnet-5", output: {intent: "x"}})}, ticking()))) as StructuredOutputProbeResult;

  it("reads the verdicts of exactly these variants", async () => {
    const s = snapshot();
    const result = await run(s);
    expect(readStructuredOutputProbeResult(result, s)).toEqual(result);
  });

  it.each<[string, (result: StructuredOutputProbeResult) => void]>([
    ["variants out of order", (result) => { result.variants.reverse(); }],
    ["a missing variant", (result) => { result.variants.pop(); }],
    ["a variant under another label", (result) => { result.variants[0]!.label = "effort=max thinking=off schema=flat"; }],
    ["an unknown field", (result) => { (result.variants[0] as Record<string, unknown>).raw = "text"; }],
  ])("refuses %s", async (_label, change) => {
    const s = snapshot();
    const result = await run(s);
    change(result);
    expect(() => readStructuredOutputProbeResult(result, s)).toThrow();
  });
});
