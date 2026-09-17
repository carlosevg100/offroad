import {readContextualBasis, type AdoptionBasisEnvelope, type AdoptionBasisEntry} from "@offroad/reconciliation";

export type AdoptionDifference = {
  slotKey: string;
  state: "added" | "removed" | "changed" | "unchanged";
  before: AdoptionBasisEntry | null;
  after: AdoptionBasisEntry | null;
};

/** Compare authorized snapshots. Different scenario/definition slots remain distinct. */
export function compareContextualAdoptionBases(input: {
  workId: string; purpose: string;
  left: {versionId: string; envelope: AdoptionBasisEnvelope};
  right: {versionId: string; envelope: AdoptionBasisEnvelope};
}): AdoptionDifference[] {
  const left = readContextualBasis(input.left.envelope, {...input, versionId: input.left.versionId});
  const right = readContextualBasis(input.right.envelope, {...input, versionId: input.right.versionId});
  const before = new Map(left.entries.map((entry) => [entry.slotKey, entry]));
  const after = new Map(right.entries.map((entry) => [entry.slotKey, entry]));
  return [...new Set([...before.keys(), ...after.keys()])].sort().map((slotKey) => {
    const a = before.get(slotKey) ?? null;
    const b = after.get(slotKey) ?? null;
    return {slotKey, before: a, after: b, state: !a ? "added" : !b ? "removed" : a.decisionId === b.decisionId ? "unchanged" : "changed"};
  });
}

export function describeContributionDifference(entry: AdoptionBasisEntry): {
  hasReference: boolean; valueChanged: boolean; changedDimensions: string[]; classification: "source_observation" | "working_hypothesis";
} {
  return {
    hasReference: entry.observationId !== null,
    valueChanged: entry.referenceValue !== null && JSON.stringify(entry.value) !== JSON.stringify(entry.referenceValue),
    changedDimensions: entry.referenceDimensions === null ? [] : Object.keys(entry.dimensions).filter((key) =>
      entry.dimensions[key as keyof typeof entry.dimensions] !== entry.referenceDimensions?.[key as keyof typeof entry.dimensions]),
    classification: entry.kind === "hypothesis" ? "working_hypothesis" : "source_observation",
  };
}
