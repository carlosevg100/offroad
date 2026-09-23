import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";
import {receivablesEvidenceScopeSchema} from "@offroad/receivables-analysis";
import {resolveConfirmedReceivablesScope} from "./receivables-scope-resolution";

const fixture = JSON.parse(readFileSync(new URL("../../../packages/testing-fixtures/assets/receivables-preparation/scope-hash-vectors.json",import.meta.url),"utf8"));
describe("R01 SQL scope byte contract", () => {
  for (const vector of fixture.vectors as {label:string;scope:unknown;hash:string}[]) {
    it(`matches the pinned scope resolver for ${vector.label}`, () => {
      expect(fixture.synthetic).toBe(true);
      const scope = receivablesEvidenceScopeSchema.parse(vector.scope);
      const sourceManifest = {schemaVersion:"receivables-evidence-manifest.v1" as const,fingerprint:scope.sourceManifestFingerprint,sources:scope.sourceRevisions};
      const candidates = [{...scope.primaryTape,fileName:"synthetic.xlsx"}];
      const supportSheetCandidates = (scope.primarySupportSheets ?? []).map(sheet => ({documentId:scope.primaryTape.documentId,sheet}));
      const discovery: Parameters<typeof resolveConfirmedReceivablesScope>[0] = {sourceManifest,candidates,supportSheetCandidates,fiscalArchives:[],documents:[{
        id:scope.primaryTape.documentId,fileName:"synthetic.xlsx",fileHash:scope.sourceRevisions[0]!.sourceSha256,
        layer:{documentId:scope.primaryTape.documentId,sheets:[scope.primaryTape.sheet,...(scope.primarySupportSheets ?? [])].map(name => ({name,cells:[]}))},
      }]};
      const resolved = resolveConfirmedReceivablesScope(discovery,{state:"current",sourceManifest,candidates,supportSheetCandidates,scope});
      expect(resolved.state).toBe("current");
      if(resolved.state!=="current") throw new Error("Synthetic scope did not resolve");
      expect(resolved.datasetHash).toBe(vector.hash);
      // JSONB order/spacing is expressly not the dataset serialization.
      expect(createHash("sha256").update(JSON.stringify(scope)).digest("hex")).not.toBe(vector.hash);
    });
  }
});
