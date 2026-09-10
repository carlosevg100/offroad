import {mkdirSync,writeFileSync,readFileSync} from "node:fs";
import {describe,it,expect} from "vitest";
import * as XLSX from "xlsx";
import {institutionalInputFixture} from "./institutional-input.fixture";
import {prepareInstitutionalModelInput} from "./institutional-input";
import {buildInstitutionalFinancialModel} from "./institutional-model";
import {reviewInstitutionalFinancialModel} from "./review";
import {buildInstitutionalWorkbookArtifact,parseVerifiedInstitutionalWorkbookArtifact,renderApprovedInstitutionalFinancialWorkbook} from "./institutional-workbook";
import type {ApprovedInstitutionalScenario} from "./institutional-runtime";
function scenario():ApprovedInstitutionalScenario{
 const f=institutionalInputFixture();const prepared=prepareInstitutionalModelInput(f);const model=buildInstitutionalFinancialModel(prepared.input!);
 return {configurationId:"11111111-1111-4111-8111-111111111111",revision:1,configurationFingerprint:prepared.configurationFingerprint,reviewedBy:"22222222-2222-4222-8222-222222222222",reviewedAt:"2026-09-10T03:00:00Z",prepared,model,review:reviewInstitutionalFinancialModel(prepared.input!,model),sourceBindings:f.sources.map(s=>({...s,currency:"BRL",amountScale:"units",metadataEvidence:{locator:"Page 1",rationale:"Reviewed normalized monetary units"},reviewedBy:"22222222-2222-4222-8222-222222222222",reviewedAt:"2026-09-10T03:00:00Z"}))};
}
describe("approved institutional workbook",()=>{
 it("replays the pre-upgrade v1 receipt without changing a single byte",async()=>{
  const original=JSON.parse(readFileSync(new URL("./institutional-workbook-v1.fixture.json",import.meta.url),"utf8"));
  expect(original.version).toBe("institutional-workbook-snapshot.v1");
  for(const lang of ["pt","en"] as const) expect(await renderApprovedInstitutionalFinancialWorkbook(original,lang)).not.toBeNull();
 });
 it("replays exact bilingual bytes and includes all approved statement outputs and source anchors",async()=>{
  const approved=scenario();const artifact=await buildInstitutionalWorkbookArtifact([approved],"a".repeat(64));
  expect(parseVerifiedInstitutionalWorkbookArtifact(artifact)).toEqual(artifact);expect(artifact.institutional.exportMode).toBe("approved_snapshot");expect(artifact.renderAudits.pt.editableInputCount).toBeGreaterThan(0);
  for(const lang of ["pt","en"] as const){const bytes=await renderApprovedInstitutionalFinancialWorkbook(artifact,lang);expect(bytes).not.toBeNull();if(process.env.OFFROAD_INSTITUTIONAL_QA_DIR){mkdirSync(process.env.OFFROAD_INSTITUTIONAL_QA_DIR,{recursive:true});writeFileSync(`${process.env.OFFROAD_INSTITUTIONAL_QA_DIR}/institutional-${lang}.xlsx`,bytes!);writeFileSync(`${process.env.OFFROAD_INSTITUTIONAL_QA_DIR}/institutional-artifact.json`,JSON.stringify(artifact,null,2));}const wb=XLSX.read(bytes!,{type:"array"});const grid=XLSX.utils.sheet_to_json(wb.Sheets[lang==="pt"?"Cenário 1":"Scenario 1"]!,{header:1}) as string[][];expect(grid.some(row=>row[0]==="EBITDA"&&row[1]===approved.model.periods[0]!.ebitda)).toBe(true);expect(grid.some(row=>row[0]===(lang==="pt"?"Conciliação do balanço":"Balance check")&&row.slice(1).every(v=>v==="0"))).toBe(true);expect(approved.model.periods.every(p=>p.dscr===null)).toBe(true);expect(grid.find(row=>row[0]==="DSCR")?.slice(1)).toEqual(approved.model.periods.map(()=>lang==="pt"?"Não calculável":"Not computable"));const cover=JSON.stringify(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]!]!,{header:1}));expect(cover).toContain(lang==="pt"?"recalculam localmente":"recalculate locally");}
 });
 it("refuses modified economics, approval, manifest and workbook receipts",async()=>{
  const artifact=await buildInstitutionalWorkbookArtifact([scenario()],"a".repeat(64));
  for(const mutate of [(a:typeof artifact)=>{a.institutional.scenarios[0]!.input.openingBalanceSheet.unrestrictedCash="777";},(a:typeof artifact)=>{a.institutional.scenarios[0]!.reviewedBy="33333333-3333-4333-8333-333333333333";},(a:typeof artifact)=>{a.institutional.sourceManifestFingerprint="b".repeat(64);},(a:typeof artifact)=>{a.workbooks.pt.sha256="b".repeat(64);}]){const copy=structuredClone(artifact);mutate(copy);expect(parseVerifiedInstitutionalWorkbookArtifact(copy)).toBeNull();expect(await renderApprovedInstitutionalFinancialWorkbook(copy,"pt")).toBeNull();}
 });
 it("keeps the full approval and every source field in readable dedicated registers",async()=>{
  const approved=scenario();const artifact=await buildInstitutionalWorkbookArtifact([approved],"a".repeat(64));
  const wb=XLSX.read((await renderApprovedInstitutionalFinancialWorkbook(artifact,"en"))!,{type:"array"});
  const register=JSON.stringify(XLSX.utils.sheet_to_json(wb.Sheets["Approval register"]!,{header:1}));
  expect(register).toContain(approved.configurationId);expect(register).toContain(approved.configurationFingerprint);expect(register).toContain(approved.reviewedBy);
  const sources=XLSX.utils.sheet_to_json(wb.Sheets["Sources and reconciliation"]!,{header:1}) as string[][];
  expect(sources.filter(row=>row[0]?.startsWith("Source "))).toHaveLength(approved.prepared.lineage.length);
  for(const line of approved.prepared.lineage){const values=sources.map(row=>row[1]);expect(values).toContain(`${line.entityName} / ${line.entityScope}`);expect(values).toContain(line.sourceHash);expect(values).toContain(JSON.stringify(line.anchor));expect(values).toContain(line.value);}
 });
 it("compares multiple scenarios while preserving each approved calculation",async()=>{const a=scenario();const b=scenario();b.configurationId="33333333-3333-4333-8333-333333333333";const artifact=await buildInstitutionalWorkbookArtifact([a,b],"a".repeat(64));expect(artifact.sheetNames.en).toContain("Scenario 2");expect(await renderApprovedInstitutionalFinancialWorkbook(artifact,"en")).not.toBeNull();});
});
