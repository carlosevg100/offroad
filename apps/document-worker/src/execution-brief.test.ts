import {describe, expect, it} from "vitest";
import {prepareExecutionBrief} from "./execution-brief";
import {buildPreviewActivation, type PreviewActivation} from "./integration-preview";

function prepare(locale: "pt-BR" | "en-US", form: PreviewActivation["brief"]["request"]["form"], audience = "vp") {
  const activation = buildPreviewActivation("prepare_meeting", {
    turn: 1, composition: "prepare_meeting", audience: {primary: audience, others: []},
    form, pages: null, sponsorInstruction: "Revisar refinanciamento", undefinedAspects: [],
  }, {}, {locale, message: "Revisar refinanciamento", recentMessages: [], artifactTypes: [], runActive: false,
    priorOutputs: new Map(), entryJob: "origination_thesis"});
  const before = structuredClone(activation);
  const prepared = prepareExecutionBrief({locale, message: "Revisar refinanciamento", accessBasis: "public_information", documents: []}, activation);
  expect(activation).toEqual(before);
  return prepared;
}

describe("preview execution brief presentation labels", () => {
  it.each([
    ["first_deliverable", "primeira devolutiva", "initial readout"],
    ["internal_briefing", "briefing interno", "internal briefing"],
    ["pitch_pages", "páginas de apresentação", "pitch pages"],
    ["analysis_with_scenarios", "análise com cenários", "analysis with scenarios"],
    ["board_deck", "apresentação ao conselho", "board presentation"],
  ] as const)("localizes %s without exposing the routing key", (form, pt, en) => {
    for (const locale of ["pt-BR", "en-US"] as const) {
      const result = prepare(locale, form);
      expect(result.visible.proposedDeliverable).toBe(locale === "pt-BR" ? `${pt.charAt(0).toUpperCase()}${pt.slice(1)} para vice-presidente` : `${en.charAt(0).toUpperCase()}${en.slice(1)} for vice president`);
      expect(JSON.stringify(result.visible)).not.toContain(form);
    }
  });
  it("keeps unspecified format honest and preserves a free-text audience", () => {
    expect(prepare("pt-BR", null, "Comitê Atlas").visible.proposedDeliverable).toBe("Devolutiva com formato a definir para Comitê Atlas");
    expect(prepare("en-US", null, "Atlas committee").visible.proposedDeliverable).toBe("Readout with format to be agreed for Atlas committee");
  });
});
