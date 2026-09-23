import {readFileSync} from "node:fs";
import {describe,it,expect} from "vitest";
import {preparePinnedR01} from "./r01-preparation-execution";
import {releasedMethodArtifacts} from "./released-methods.generated";
import {applyReceivablesSupplementPatch,buildReceivablesRawUniverse,newReceivablesSupplementDraft} from "@offroad/receivables-analysis";
import {decodeBoundReceivablesEvidence,encodeReceivablesEvidence} from "./receivables-evidence";
import {discoverReceivablesEvidence,resolveConfirmedReceivablesScope} from "./receivables-scope-resolution";
import {buildReceivablesDocumentSupplementPatch} from "./receivables-document-supplement";
import {releasedPreparers} from "./released-preparers.generated";
const identity=releasedMethodArtifacts.find(x=>x.methodId==="underwrite-receivables-pool")!;
const preparer=releasedPreparers[0]!.id;
const fixture=()=>JSON.parse(readFileSync(new URL("../../../packages/testing-fixtures/assets/receivables-preparation/synthetic-complete.json",import.meta.url),"utf8")).input;
describe("bounded R01 preparation and published readiness",()=>{
 it("replays sources and verifies readiness before returning the exact financial input",async()=>{
  const result=await preparePinnedR01(identity,preparer,fixture(),new AbortController().signal);
  expect(result.ready).toBe(true);
  if(!result.ready)throw new Error(result.reason);
  expect(result.preparerId).toBe(preparer);
  expect(result.inputFingerprint).toMatch(/^[a-f0-9]{64}$/);
  expect(result.prepared).not.toHaveProperty("output");
 });
 it("blocks a fully replayable draft when the published method finds unresolved evidence",async()=>{
  const input=fixture();
  const decoded=decodeBoundReceivablesEvidence(input.evidence[0]);
  if(decoded.kind!=="document_layer")throw new Error("Synthetic document required");
  const document=decoded.evidence;
  const ledger=JSON.parse(readFileSync(new URL("../../../packages/testing-fixtures/assets/receivables-preparation/unresolved-ledger.json",import.meta.url),"utf8"));
  expect(ledger.synthetic).toBe(true);
  const rows=ledger.rows as string[][];
  document.layer.sheets=[...document.layer.sheets!,{name:"RAZAO",cells:rows.flatMap((row,i)=>row.map((v,j)=>({ref:`${String.fromCharCode(65+j)}${i+1}`,t:"s" as const,v})))}];
  const encoded=encodeReceivablesEvidence(document);
  input.evidence[0]={...input.evidence[0],content_sha256:encoded.contentSha256,payload_sha256:encoded.payloadSha256,
   uncompressed_bytes:encoded.uncompressedBytes,payload_base64:encoded.payloadBase64};
  const discovery=discoverReceivablesEvidence(input.evidence);
  input.confirmedScope={...input.confirmedScope,sourceManifest:discovery.sourceManifest,candidates:discovery.candidates,supportSheetCandidates:discovery.supportSheetCandidates,
   scope:{...input.confirmedScope.scope,sourceManifestFingerprint:discovery.sourceManifest.fingerprint,sourceRevisions:discovery.sourceManifest.sources,
    primarySupportSheets:discovery.supportSheetCandidates.map(x=>x.sheet)}};
  const selected=resolveConfirmedReceivablesScope(discovery,input.confirmedScope);
  if(selected.state!=="current")throw new Error("Synthetic scope must be current");
  const tape=selected.scope.primaryTape;
  const universeId=`${input.sessionId}:pool:${tape.documentId}:${encodeURIComponent(tape.sheet)}:${tape.headerRow}`;
  const phaseOne=buildReceivablesRawUniverse({universeId,datasetHash:selected.datasetHash,reportingDate:selected.scope.reportingDate,documents:selected.documents}).phaseOne!;
  const patch=buildReceivablesDocumentSupplementPatch({phaseOne,documents:selected.documents}).patch!;
  input.currentDraft=applyReceivablesSupplementPatch({draft:newReceivablesSupplementDraft(selected.datasetHash),patch});
  input.history=[{patch,resultingDraft:input.currentDraft}];
  expect(await preparePinnedR01(identity,preparer,input,new AbortController().signal)).toEqual({ready:false,reason:"method_not_ready"});
 });
 it("denies forged draft history before readiness",async()=>{
  const input=fixture();input.history[0].patch.sections.accounting.value.allowanceBalance="999";
  expect(await preparePinnedR01(identity,preparer,input,new AbortController().signal)).toEqual({ready:false,reason:"preparation_invalid"});
 });
 it("denies incomplete source history",async()=>{
  const input=fixture();input.history=[];
  expect(await preparePinnedR01(identity,preparer,input,new AbortController().signal)).toEqual({ready:false,reason:"preparation_invalid"});
 });
 it("refuses an unavailable preparer without fallback",async()=>{
  await expect(preparePinnedR01(identity,"unpublished",fixture(),new AbortController().signal)).rejects.toThrow("preparer_release_unavailable");
 });
 it("terminates an already started preparation when cancelled",async()=>{
  const controller=new AbortController();
  const pending=preparePinnedR01(identity,preparer,fixture(),controller.signal);
  controller.abort();
  await expect(pending).rejects.toThrow("execution_aborted");
 });
 it("honors cancellation before starting a thread",async()=>{
  const controller=new AbortController();controller.abort();
  await expect(preparePinnedR01(identity,preparer,fixture(),controller.signal)).rejects.toThrow("execution_aborted");
 });
});
