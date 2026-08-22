import {describe, expect, it} from "vitest";

import {syntheticInvestors} from "@offroad/investor-base";

import {auditTrail, buildBook, normalizeIndication, trackSounding, type Indication, type SoundingEvent} from "./index";

const basis = {cdiPct: "10.50", ipcaPct: "4.00"};

describe("one ruler for every indication", () => {
  it("reads CDI+, % of CDI, fixed and IPCA+ as all-in and spread over the CDI", () => {
    const base = {investorId: "x", amount: "1", tenorMonths: 36, firm: true};
    expect(normalizeIndication({...base, pricing: {type: "cdi_plus", spreadPct: "4.10"}}, basis).allInPct).toBe("14.6");
    expect(normalizeIndication({...base, pricing: {type: "cdi_pct", pct: "140"}}, basis).spreadOverCdiPct).toBe("4.2");
    expect(normalizeIndication({...base, pricing: {type: "fixed", ratePct: "15.00"}}, basis).spreadOverCdiPct).toBe("4.5");
    expect(normalizeIndication({...base, pricing: {type: "ipca_plus", spreadPct: "9.00"}}, basis).allInPct).toBe("13.36");
  });
});

describe("the gate: five investors through the whole flow", () => {
  const investors = syntheticInvestors.slice(0, 5);
  const ids = investors.map((investor) => investor.id);
  const at = (minute: number) => `2026-09-01T10:${String(minute).padStart(2, "0")}:00Z`;
  const desk = "analista@offroad";
  const indication = (investorId: string, amount: string, spreadPct: string, firm = true): Indication => ({investorId, amount, tenorMonths: 48, graceMonths: 12, pricing: {type: "cdi_plus", spreadPct}, firm});

  const events: SoundingEvent[] = [
    ...ids.map((id, i) => ({investorId: id, type: "listed" as const, at: at(i), actor: desk})),
    ...ids.map((id, i) => ({investorId: id, type: "teaser_sent" as const, at: at(10 + i), actor: desk})),
    // Four sign; one declines at the teaser.
    ...ids.slice(0, 4).map((id, i) => ({investorId: id, type: "nda_signed" as const, at: at(20 + i), actor: `${id}@investor`})),
    {investorId: ids[4]!, type: "declined", at: at(24), actor: `${ids[4]}@investor`, note: "fora de tese"},
    ...ids.slice(0, 4).map((id, i) => ({investorId: id, type: "room_opened" as const, at: at(30 + i), actor: desk})),
    {investorId: ids[0]!, type: "question_asked", at: at(35), actor: `${ids[0]}@investor`, questionId: "q1"},
    {investorId: ids[0]!, type: "question_answered", at: at(36), actor: desk, questionId: "q1"},
    // Three indicate; one goes quiet.
    {investorId: ids[0]!, type: "indication_received", at: at(40), actor: `${ids[0]}@investor`, indication: indication(ids[0]!, "20000000", "3.90")},
    {investorId: ids[1]!, type: "indication_received", at: at(41), actor: `${ids[1]}@investor`, indication: indication(ids[1]!, "15000000", "4.40")},
    {investorId: ids[2]!, type: "indication_received", at: at(42), actor: `${ids[2]}@investor`, indication: indication(ids[2]!, "25000000", "4.10", false)},
    // An allocation before any indication is refused and kept in the audit.
    {investorId: ids[3]!, type: "allocated", at: at(43), actor: desk},
  ];

  it("replays the log into stages and refuses what the process does not allow", () => {
    const tracks = trackSounding(ids, events);
    expect(tracks.map((track) => track.stage)).toEqual(["indicated", "indicated", "indicated", "room_opened", "declined"]);
    expect(tracks[3]!.refused).toHaveLength(1);
    expect(tracks[0]!.openQuestions).toBe(0);
    const trail = auditTrail(tracks, investors);
    expect(trail[0]!.what.pt).toBe("incluído na lista");
    expect(trail.filter((entry) => entry.what.en === "signed the NDA")).toHaveLength(4);
  });

  it("builds the book by price and closes the amount on the marginal line", () => {
    const tracks = trackSounding(ids, events);
    const indications = tracks.flatMap((track) => (track.latestIndication ? [track.latestIndication] : []));
    const book = buildBook({target: "42300000", indications, investors, basis});
    expect(book.coverage).toBe("1.4184");
    expect(book.lines.map((line) => line.rank + ":" + line.allocated)).toEqual(["1:20000000", "2:22300000", "3:0"]);
    expect(book.lines[1]!.indication.firm).toBe(false);
    expect(book.shortfall).toBe("0");
    expect(book.weightedAllInPct).toBe("14.51");
    expect(book.notes[0]!.en).toContain("Marginal line");
  });

  it("pro rata scales every line by the same factor", () => {
    const tracks = trackSounding(ids, events);
    const indications = tracks.flatMap((track) => (track.latestIndication ? [track.latestIndication] : []));
    const book = buildBook({target: "42300000", indications, investors, basis, method: "pro_rata"});
    expect(book.allocatedTotal).toBe("42300000");
    expect(book.lines.map((line) => line.share)).toEqual(["33.33", "41.67", "25"]);
  });

  it("says when the book does not close", () => {
    const book = buildBook({target: "60000000", indications: [indication(ids[0]!, "20000000", "3.90")], investors, basis});
    expect(book.shortfall).toBe("40000000");
    expect(book.notes[0]!.pt).toContain("faltam 40000000");
  });
});
