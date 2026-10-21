import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {join} from "node:path";
import {describe, expect, it} from "vitest";
import {nextCivilDate} from "./market-availability";
import {parseCommuniqueDetail, parseCommuniqueList, parseSelicTarget} from "./selic-target-contract";
import {evaluateSelicTarget} from "./selic-target-quality";

/** Reproduces the empirical conference of 21/10/2026 (docs/build/market-reference/selic-target-conference.json)
 * over the private corpus of real Banco Central answers. The corpus stays outside the public
 * repository; set MARKET_SELIC_CORPUS to its folder to run. Hashes are checked before any reading. */
const dir = process.env.MARKET_SELIC_CORPUS;
const conference = JSON.parse(readFileSync(new URL("../../../docs/build/market-reference/selic-target-conference.json", import.meta.url), "utf8")) as {
  window: {start: string; end: string}; dataBase: string; files: Record<string, string>;
  expected: {observations: number; communiques: number; status: string; links: number; findings: number; anchorMeeting: number; regulatoryDiffersFromSeries: number[]};
};

describe.skipIf(!dir)("conference over the real corpus", () => {
  it("reproduces the recorded result from the recorded bytes", () => {
    const read = (name: string) => {
      const b = readFileSync(join(dir!, name));
      expect(createHash("sha256").update(b).digest("hex"), name).toBe(conference.files[name]);
      return b;
    };
    const acquiredAt = "2026-10-21T15:00:00Z";
    const observations = parseSelicTarget(read("sgs-432-2021-01-14-a-2026-10-21.json"), conference.window).map((o) => ({...o, acquiredAt}));
    parseCommuniqueList(read("comunicados-lista-60.json"), 60);
    const details = Object.keys(conference.files).filter((f) => f.startsWith("comunicados/"));
    const communiques = details.map((f) => ({...parseCommuniqueDetail(read(f), Number(f.slice(12, -5))), acquiredAt}));
    const q = evaluateSelicTarget({observations, communiques, window: conference.window, dataBase: conference.dataBase});
    expect({observations: observations.length, communiques: communiques.length, status: q.status, links: q.links.length, findings: q.findings.length, anchorMeeting: q.anchor?.meeting,
      regulatoryDiffersFromSeries: communiques.filter((c) => c.referenceDate >= conference.window.start && c.regulatoryEffectiveFrom !== nextCivilDate(c.referenceDate)).map((c) => c.meeting).sort((a, b) => a - b)})
      .toEqual(conference.expected);
  });
});
