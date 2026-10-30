import {describe, expect, it} from "vitest";
import {calculateOriginatorOwnership, type OriginatorOwnershipNode} from "./originator-ownership";

const nodes = (): OriginatorOwnershipNode[] => [
  {id: "cedent", kind: "entity", shareholders: [{holderId: "person-a", share: "0.6"}, {holderId: "holding", share: "0.4"}]},
  {id: "holding", kind: "entity", shareholders: [{holderId: "person-b", share: "0.75"}, {holderId: "person-c", share: "0.25"}]},
  ...["person-a", "person-b", "person-c"].map(id => ({id, kind: "person" as const, shareholders: null})),
];
describe("originator ownership arithmetic", () => {
  it("looks through the supplied holding and reconciles the exact shares", () => {
    expect(calculateOriginatorOwnership({rootEntityId: "cedent", nodes: nodes()})).toMatchObject({status: "complete", resolvedPersons: [{personId: "person-a", resolvedShare: "0.6"}, {personId: "person-b", resolvedShare: "0.3"}, {personId: "person-c", resolvedShare: "0.1"}], unresolved: []});
  });
  it("does not invent the people behind a missing corporate chain", () => {
    const n = nodes(); n[1]!.shareholders = null;
    expect(calculateOriginatorOwnership({rootEntityId: "cedent", nodes: n})).toMatchObject({status: "partial", resolvedPersons: [{personId: "person-a", resolvedShare: "0.6"}], unresolved: [{entityId: "holding", share: "0.4", reason: "ownership_missing"}]});
  });
  it("does not silently close a rounded or incomplete cap table", () => {
    const n = nodes(); n[0]!.shareholders = [{holderId: "person-a", share: "0.59"}, {holderId: "holding", share: "0.4"}];
    expect(calculateOriginatorOwnership({rootEntityId: "cedent", nodes: n}).unresolved).toContainEqual({entityId: "cedent", share: "0.01", reason: "unallocated_share"});
  });
  it("records a cycle as unresolved instead of certifying final beneficial owners", () => {
    const n = nodes(); n[1]!.shareholders = [{holderId: "cedent", share: "1"}];
    expect(calculateOriginatorOwnership({rootEntityId: "cedent", nodes: n})).toMatchObject({status: "partial", unresolved: [{entityId: "cedent", share: "0.4", reason: "cycle"}]});
  });
  it("combines distinct documented paths to the same person", () => {
    const n = nodes(); n[1]!.shareholders = [{holderId: "person-a", share: "0.5"}, {holderId: "person-b", share: "0.5"}];
    expect(calculateOriginatorOwnership({rootEntityId: "cedent", nodes: n}).resolvedPersons).toEqual([{personId: "person-a", resolvedShare: "0.8"}, {personId: "person-b", resolvedShare: "0.2"}]);
  });
  it("refuses duplicate holders instead of doubling their shares", () => {
    const n = nodes(); n[1]!.shareholders = [{holderId: "person-a", share: "0.5"}, {holderId: "person-a", share: "0.5"}];
    expect(() => calculateOriginatorOwnership({rootEntityId: "cedent", nodes: n})).toThrow("originator_ownership_holder_duplicate");
  });
  it("refuses ownership above one", () => {
    const n = nodes(); n[1]!.shareholders = [{holderId: "person-b", share: "0.8"}, {holderId: "person-c", share: "0.3"}];
    expect(() => calculateOriginatorOwnership({rootEntityId: "cedent", nodes: n})).toThrow("originator_ownership_exceeds_one");
  });
  it("requires actual identities for every reported shareholder", () => {
    const n = nodes().filter(n => n.id !== "person-c");
    expect(calculateOriginatorOwnership({rootEntityId: "cedent", nodes: n})).toMatchObject({status: "partial", unresolved: [{entityId: "person-c", share: "0.1", reason: "identity_missing"}]});
  });
  it("is independent of supplied node and edge order", () => {
    const n = nodes().reverse().map(n => ({...n, shareholders: n.shareholders ? [...n.shareholders].reverse() : null}));
    expect(calculateOriginatorOwnership({rootEntityId: "cedent", nodes: n})).toEqual(calculateOriginatorOwnership({rootEntityId: "cedent", nodes: nodes()}));
  });
});
