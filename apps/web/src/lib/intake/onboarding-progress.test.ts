import {describe, expect, it} from "vitest";

import {documentFirstProgress} from "./onboarding-progress";

const empty = {
  objectiveSelected: false,
  briefAnswered: 0,
  briefTotal: 9,
  documentsUploaded: 0,
  minimumSatisfied: 0,
  minimumTotal: 6,
  idealSatisfied: 0,
  idealTotal: 4,
  reviewReady: false,
};

describe("documentFirstProgress", () => {
  it("starts at zero without an artificial floor", () => {
    expect(documentFirstProgress(empty)).toBe(0);
  });

  it("moves as the objective and request are completed", () => {
    expect(documentFirstProgress({...empty, objectiveSelected: true})).toBe(10);
    expect(documentFirstProgress({...empty, objectiveSelected: true, briefAnswered: 3})).toBe(20);
    expect(documentFirstProgress({...empty, objectiveSelected: true, briefAnswered: 9})).toBe(40);
  });

  it("reaches one hundred only when evidence and review are ready", () => {
    expect(documentFirstProgress({
      ...empty,
      objectiveSelected: true,
      briefAnswered: 9,
      documentsUploaded: 2,
      minimumSatisfied: 6,
      idealSatisfied: 4,
      reviewReady: true,
    })).toBe(100);
  });
});

