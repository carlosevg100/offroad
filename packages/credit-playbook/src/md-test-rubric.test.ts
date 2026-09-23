import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {describe, expect, it} from "vitest";

import {MD_TEST_RUBRIC, MD_TEST_RUBRIC_SOURCE, MD_TEST_RUBRIC_VERSION} from "./md-test-rubric";

const source = readFileSync(resolve(import.meta.dirname, "../knowledge/procedures", MD_TEST_RUBRIC_SOURCE.procedurePath), "utf8");

/** The numbered questions under Q1, in the order the procedure prints them. */
function q1Questions(): Array<{number: number; question: string}> {
  const lines = source.split("\n");
  const start = lines.findIndex((line) => line.startsWith(`## ${MD_TEST_RUBRIC_SOURCE.section}.`));
  expect(start).toBeGreaterThan(0);
  const questions: Array<{number: number; question: string}> = [];
  for (const line of lines.slice(start + 1)) {
    if (line.startsWith("## ")) break;
    const match = /^(\d+)\. (.+)$/.exec(line);
    if (match) questions.push({number: Number(match[1]), question: match[2]!});
  }
  return questions;
}

describe("MD test rubric", () => {
  it("has ten questions with unique ids q1 to q10, in the procedure's order", () => {
    expect(MD_TEST_RUBRIC_VERSION).toMatch(/^\d{4}\.\d{2}\.\d{2}-v\d+$/);
    expect(MD_TEST_RUBRIC).toHaveLength(10);
    expect(MD_TEST_RUBRIC.map((entry) => entry.id)).toEqual(Array.from({length: 10}, (_, index) => `q${index + 1}`));
    expect(new Set(MD_TEST_RUBRIC.map((entry) => entry.id)).size).toBe(10);
    expect(MD_TEST_RUBRIC.every((entry) => entry.source === "Q1")).toBe(true);
  });

  it("marks exactly one question as human_required, the signature question", () => {
    const human = MD_TEST_RUBRIC.filter((entry) => entry.evaluation === "human_required");
    expect(human.map((entry) => entry.id)).toEqual(["q10"]);
    expect(MD_TEST_RUBRIC.filter((entry) => entry.evaluation === "deterministic")).toHaveLength(9);
  });

  it("copies every question verbatim from the procedure and never drifts from its list", () => {
    for (const entry of MD_TEST_RUBRIC) expect(source, entry.id).toContain(entry.question);
    const listed = q1Questions();
    expect(listed).toHaveLength(10);
    expect(MD_TEST_RUBRIC.map((entry) => ({number: Number(entry.id.slice(1)), question: entry.question}))).toEqual(listed);
  });
});
