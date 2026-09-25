import {describe, expect, it} from "vitest";

import {computeDependencyImpact, mergeDependencyUpdate, type ContinuationGraph, type DependencyChangeEvent} from "./index";

/**
 * Cross-language vector. The outbox consumer of stage 18 (supabase/migrations/*_work_dependency_events.sql)
 * stores the dependency-update-request.v1 body and fingerprints it with private.continuation_fingerprint_v1;
 * supabase/tests/work_continuity_dependencies.sql asserts the same body and the same fingerprint below,
 * so a request written by the database can be read back by mergeDependencyUpdate unchanged.
 */
const WORK = "b0183000-0000-4000-9000-000000000002";
const AFFECTED = "b0183000-0000-4000-9000-000000000101";
const UNAFFECTED = "b0183000-0000-4000-9000-000000000102";
const SOURCE = "b0183000-0000-4000-9000-000000000201";
const OTHER_SOURCE = "b0183000-0000-4000-9000-000000000202";
const RELEASE = "synthetic-execution-test-v1";
const ZERO = {maxCostMicrousd: 0, maxModelCalls: 0};

const graph: ContinuationGraph = {
  workId: WORK,
  executions: [
    {executionId: AFFECTED, workId: WORK, baseExecutionId: null, profileBudget: ZERO, dependencies: [
      {kind: "source_version", sourceId: SOURCE, versionNo: 1, versionId: "b0183000-0000-4000-9000-000000000211"},
      {kind: "method_release", procedureId: "synthetic-execution", platformReleaseId: RELEASE, houseReleaseId: null},
    ]},
    {executionId: UNAFFECTED, workId: WORK, baseExecutionId: null, profileBudget: ZERO, dependencies: [
      {kind: "source_version", sourceId: OTHER_SOURCE, versionNo: 1, versionId: "b0183000-0000-4000-9000-000000000221"},
      {kind: "method_release", procedureId: "synthetic-execution", platformReleaseId: RELEASE, houseReleaseId: null},
    ]},
  ],
  derivations: [],
  heads: [
    {kind: "source_version", sourceId: SOURCE, versionNo: 2, versionId: "b0183000-0000-4000-9000-000000000212"},
    {kind: "source_version", sourceId: OTHER_SOURCE, versionNo: 1, versionId: "b0183000-0000-4000-9000-000000000221"},
    {kind: "method_release", procedureId: "synthetic-execution", platformReleaseId: RELEASE, houseReleaseId: null, profileBudget: ZERO},
  ],
};

const events: DependencyChangeEvent[] = [
  {eventId: "b0183000-0000-4000-9000-000000000301", aggregateKind: "source_version", aggregateId: SOURCE, aggregateVersion: 2},
  {eventId: "b0183000-0000-4000-9000-000000000302", aggregateKind: "assumption_version", aggregateId: "b0183000-0000-4000-9000-000000000401", aggregateVersion: 1},
];

describe("dependency-update request parity with the SQL consumer", () => {
  it("builds the canonical body and fingerprint that private.continuation_fingerprint_v1 reproduces", () => {
    const merged = mergeDependencyUpdate({workId: WORK, openRequest: null, events, impact: computeDependencyImpact(graph)});
    expect(merged.request).toEqual({
      schemaVersion: "dependency-update-request.v1",
      workId: WORK,
      status: "open",
      affectedExecutionIds: [AFFECTED],
      events: [events[1], events[0]],
      aggregateVersions: [
        {aggregateKind: "assumption_version", aggregateId: "b0183000-0000-4000-9000-000000000401", version: 1},
        {aggregateKind: "source_version", aggregateId: SOURCE, version: 2},
      ],
      fingerprint: "3ab2acb831c999cbb49da0e78093e555d2ee432d885cdb0a6cabcf1d558b2b0b",
    });
  });
});
