import {describe, expect, it} from "vitest";
import {parseDocument} from "@offroad/document-parsers";
import {buildReceivablesVertical} from "./case-analysis";
import {documentEvidence, encodeReceivablesEvidence, type ReceivablesEvidenceEnvelope} from "./receivables-evidence";
import {buildReceivablesMethodEvidenceRequestProjection} from "./receivables-information-requests";

const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
async function envelope(n: number, twoSheets = false, version = 1): Promise<ReceivablesEvidenceEnvelope> {
  const parsed = await parseDocument({
    bytes: new TextEncoder().encode("NUM_TITULO,CNPJ_SACADO,NOME_SACADO,DT_EMISSAO,DT_VENCIMENTO,VLR_TITULO,SITUACAO,DT_PAGAMENTO,VLR_PAGO\nNF-1,11222333000144,Synthetic buyer,2026-06-01,2026-07-01,1000,ABERTO,,"),
    documentId: id(n),
    documentVersion: version,
    fileName: "synthetic.csv",
    localeHint: "pt-BR",
  });
  if (twoSheets) {
    const sheet = parsed.layer.sheets![0]!;
    parsed.layer.sheets!.push({...structuredClone(sheet), name: "Second pool"});
  }
  const encoded = encodeReceivablesEvidence(documentEvidence({
    documentId: id(n),
    fileName: "synthetic.csv",
    fileHash: "a".repeat(64),
    parsed,
  }));
  return {
    source_document_id: id(n),
    document_version: version,
    content_kind: "document_layer",
    schema_version: encoded.schemaVersion,
    source_sha256: "a".repeat(64),
    content_sha256: encoded.contentSha256,
    payload_sha256: encoded.payloadSha256,
    codec: "gzip-json-v1",
    uncompressed_bytes: encoded.uncompressedBytes,
    payload_base64: encoded.payloadBase64,
  };
}

function run(evidence: ReceivablesEvidenceEnvelope[]) {
  const raw: Parameters<typeof buildReceivablesVertical>[0] = {
    session: {id: id(90), capital_project_id: id(91), requested_amount: 1000},
    _execution: {
      id: id(92),
      mode: "primary",
      input_fingerprint: "f".repeat(64),
      pipeline_version: "test",
      model_policy_version: "test",
    },
    receivables_evidence: evidence,
    receivables_method_input_assembly: null,
    receivables_method_supplement_draft: null,
    receivables_provider_context: {programs: [], observations: []},
  };
  return buildReceivablesVertical(raw, "2026-09-08", false)!;
}

describe("receivables worker evidence scope", () => {
  it.each(["documents", "sheets"])("blocks competing tapes across %s before assembly or execution", async (kind) => {
    const evidence = kind === "documents"
      ? [await envelope(1), await envelope(2)]
      : [await envelope(1, true)];
    const result = run(evidence);
    expect(result.publicReport.scopeIssue?.candidates).toHaveLength(2);
    const requestProjection = buildReceivablesMethodEvidenceRequestProjection({
      projectId: id(91), processingRunId: id(92), locale: "en-US",
      readiness: result.publicReport.methodReadiness, idFactory: () => id(93),
    });
    expect(requestProjection.requests).toEqual([expect.objectContaining({priority: "blocking", status: "open"})]);
    expect(run([...evidence].reverse()).publicReport.fingerprint).toBe(result.publicReport.fingerprint);
    expect(result.publicReport.status).toBe("needs_evidence_scope");
    expect(result.publicReport.pipeline).toBeNull();
    expect(result.privateReport).toBeNull();
    expect(result.specialistShadow).toBeNull();
    expect(result.inputAssembly).toBeNull();
    expect(result.publicReport.methodReadiness.methodExecutionAllowed).toBe(false);
    expect(run([...evidence].reverse()).publicReport.methodReadiness.sourceDatasetHash).toBe(result.publicReport.methodReadiness.sourceDatasetHash);
  });
  it("retains single-tape analysis and binds fingerprints to source revisions", async () => {
    const evidence = await envelope(1);
    const result = run([evidence]);
    expect(result.publicReport.status).toBe("analyzed");
    expect(result.publicReport.pipeline).not.toBeNull();
    expect(JSON.stringify(result.privateReport)).toContain(`${id(90)}:pool:${id(1)}:`);
    expect(run([await envelope(1, false, 2)]).publicReport.methodReadiness.sourceDatasetHash).not.toBe(result.publicReport.methodReadiness.sourceDatasetHash);
  });
});
