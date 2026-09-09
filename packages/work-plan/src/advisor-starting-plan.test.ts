import {describe,it,expect} from "vitest";
import {compileAdvisorStartingPlan} from "./advisor-starting-plan";
import {capitalProjectPlanSnapshot} from "./capital-jobs";
import {inferCapitalProjectJob} from "./job-inference";

const requests = [
  "Compare estas propostas de financiamento. Quero uma leitura documental preliminar das condições e lacunas, sem cálculos financeiros nem recomendação de crédito.",
  "Prepare a reunião com esta companhia usando os documentos enviados. Quero uma leitura documental preliminar e perguntas para a conversa, sem cálculos financeiros nem recomendação de crédito.",
  "Revise esta oportunidade a partir dos documentos enviados. Quero uma leitura documental preliminar das condições e lacunas, sem cálculos financeiros nem recomendação de crédito.",
  "Prepare a meeting using these documents for a preliminary documentary reading without financial calculations.",
];
describe("initial advisor documentary plan selection",()=>{
  it.each(requests)("binds the private graph at project creation: %s",message=>{
    const result=compileAdvisorStartingPlan({message,hasAttachments:true,documentaryEnabled:true});
    expect(["structure_from_documents","review_existing_operation"]).toContain(result.entryJob);
    expect(result.plan.job.id).toBe(result.entryJob);
    expect(result.plan.taskSpecs.map(task=>task.id)).toEqual(["Q01","Q02","Q03"]);
  });
  it.each(requests)("preserves existing selection when disabled or without files: %s",message=>{
    for(const boundary of [{hasAttachments:true,documentaryEnabled:false},{hasAttachments:false,documentaryEnabled:true}]) {
      const input={message,...boundary};
      expect(compileAdvisorStartingPlan(input).plan).toEqual(capitalProjectPlanSnapshot(inferCapitalProjectJob(input).job));
    }
  });
  it.each(["Compare these financing proposals", "Compare propostas em leitura documental preliminar e calcule o CET", "Do not compare proposals in a preliminary documentary reading"])("does not narrow a broader, financial or negated request: %s",message=>{
    const input={message,hasAttachments:true,documentaryEnabled:true};
    expect(compileAdvisorStartingPlan(input).plan).toEqual(capitalProjectPlanSnapshot(inferCapitalProjectJob(input).job));
  });
  it("preserves an explicit incompatible starter and accepts a compatible private starter",()=>{
    const input={message:requests[0]!,hasAttachments:true,documentaryEnabled:true};
    expect(compileAdvisorStartingPlan({...input,explicitHint:"capital_planning"}).plan).toEqual(capitalProjectPlanSnapshot("capital_planning"));
    const result=compileAdvisorStartingPlan({...input,explicitHint:"structure_from_documents"});
    expect(result.entryJob).toBe("structure_from_documents");
    expect(result.plan.taskSpecs.map(task=>task.id)).toEqual(["Q01","Q02","Q03"]);
  });
});
