import {expect,it} from "vitest";
import {fingerprintJson} from "@offroad/case-understanding";
import {receivablesScopeFixture} from "../../../e2e/support/receivables-scope-fixture";
import {discoverReceivablesEvidence} from "../../../../document-worker/src/receivables-scope-resolution";
it("scope browser fixture preserves the real worker discovery instead of changing the approved input when the report is written",async()=>{
 const fixture=await receivablesScopeFixture();
 const envelopes=fixture.sources.map(source=>({source_document_id:source.id,document_version:1,content_kind:source.contentKind,schema_version:"2026.08.28-v1",source_sha256:source.sourceHash,content_sha256:source.contentHash,payload_sha256:source.payloadHash,codec:"gzip-json-v1",uncompressed_bytes:source.bytes,payload_base64:source.payload}));
 const actual=discoverReceivablesEvidence(envelopes,new Map(fixture.sources.map(source=>[source.id,source.name])));
 expect(fixture.report.sourceManifest).toEqual(actual.sourceManifest);expect(fixture.report.candidates).toEqual(actual.candidates);
 expect(fingerprintJson({sourceManifest:fixture.report.sourceManifest,candidates:fixture.report.candidates})).toBe(fingerprintJson({sourceManifest:actual.sourceManifest,candidates:actual.candidates}));
 expect(actual.candidates).toHaveLength(2);expect(actual.candidates.find(candidate=>candidate.documentId===fixture.sources[0].id)?.fileName).toBe("Synthetic selected pool.csv");
});
