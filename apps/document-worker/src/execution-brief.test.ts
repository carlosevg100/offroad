import {capitalProjectPlanSnapshot} from "@offroad/work-plan";
import {workspaceJobActivationSchema} from "@offroad/agent-contracts";
import {governedSectorContextInputsSchema} from "./governed-sector-planning";
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

it("keeps sector planning tied to the displayed objective across short follow-up messages", () => {
  const activation = workspaceJobActivationSchema.parse({job:"company_debt_view",company:{name:"Synthetic Company"},brief:{focus:"Analisar a companhia e seus riscos de crédito"}});
  const governedSectorContextInputs = governedSectorContextInputsSchema.parse({schema_version:"governed-sector-context-inputs.v1",as_of:"2026-09-08",sources:[],candidates:[{
    id:"10000000-0000-4000-8000-000000000080",field_path:"company.revenue_model",normalized_value:"merchant",review_state:"edited",is_primary:true,
    reviewed_by:"10000000-0000-4000-8000-000000000081",reviewed_at:"2026-09-08T00:00:00Z",entity_name:null,entity_scope:"company",period_start:null,period_end:null,
    source_anchor:{},anchor_verified:null,extraction_method:"user_entry",processing_run_id:null,source_document_id:null,extraction_document_version:null,extraction_source_sha256:null,
  }]});
  const base = {locale:"pt-BR" as const,sessionId:"10000000-0000-4000-8000-000000000082",accessBasis:"authorized_private",documents:[],activePlan:capitalProjectPlanSnapshot("company_debt_view"),governedSectorContextInputs};
  const initial=prepareExecutionBrief({...base,message:"Analisar a companhia e seus riscos de crédito"},activation);
  const followup=prepareExecutionBrief({...base,message:"Pode continuar"},activation);
  expect(initial.visible.planningContext?.objects[0]?.requirements.length).toBeGreaterThan(0);
  expect(followup.visible.objective).toBe(initial.visible.objective);
  expect(followup.visible.planningContext).toEqual(initial.visible.planningContext);
});
