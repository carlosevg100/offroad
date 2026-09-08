import {describe, expect, it} from "vitest";
import {parseDocument} from "@offroad/document-parsers";
import type {ReceivablesEvidenceScopeContext} from "@offroad/receivables-analysis";
import {discoverReceivablesEvidence, resolveConfirmedReceivablesScope} from "./receivables-scope-resolution";
import {buildReceivablesVertical} from "./case-analysis";
import {documentEvidence, encodeReceivablesEvidence, type ReceivablesEvidenceEnvelope} from "./receivables-evidence";
import {buildReceivablesMethodEvidenceRequestProjection} from "./receivables-information-requests";

const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
async function envelope(n: number, twoSheets = false, version = 1, mode: "tape" | "blocks" | "support" = "tape", csv?: string): Promise<ReceivablesEvidenceEnvelope> {
  const parsed = await parseDocument({
    bytes: new TextEncoder().encode(csv ?? "NUM_TITULO,CNPJ_SACADO,NOME_SACADO,DT_EMISSAO,DT_VENCIMENTO,VLR_TITULO,SITUACAO,DT_PAGAMENTO,VLR_PAGO\nNF-1,11222333000144,Synthetic buyer,2026-06-01,2026-07-01,1000,ABERTO,,"),
    documentId: id(n),
    documentVersion: version,
    fileName: "synthetic.csv",
    localeHint: "pt-BR",
  });
  if (twoSheets) {
    const sheet = parsed.layer.sheets![0]!;
    parsed.layer.sheets!.push({...structuredClone(sheet), name: "Second pool"});
  }
  if (mode === "blocks") {
    const sheet = parsed.layer.sheets![0]!;
    const second = structuredClone(sheet.cells).map((cell) => ({...cell, ref: cell.ref.replace(/^([A-Z]+)([0-9]+)$/, (_ref, column: string, row: string) => `${column}${Number(row) + 4}`), v: cell.v === "NF-1" ? "NF-SECOND" : cell.v}));
    sheet.cells.push(...second);
  } else if (mode === "support") {
    parsed.layer.sheets = [{...parsed.layer.sheets![0]!, cells: [{ref: "A1", t: "s", v: "Synthetic supporting evidence"}]}];
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

function confirmation(evidence: ReceivablesEvidenceEnvelope[], candidateIndex = 0, reportingDate = "2026-06-30"): ReceivablesEvidenceScopeContext {
  const discovery = discoverReceivablesEvidence(evidence);
  const candidate = discovery.candidates[candidateIndex]!;
  return {
    state: "current", sourceManifest: discovery.sourceManifest, candidates: discovery.candidates,
    scope: {
      schemaVersion: "receivables-evidence-scope.v1", id: id(80), fingerprint: "b".repeat(64),
      sourceManifestFingerprint: discovery.sourceManifest.fingerprint,
      primaryTape: {documentId: candidate.documentId, sheet: candidate.sheet, headerRow: candidate.headerRow},
      complementDocumentIds: [], reportingDate,
      sourceRevisions: discovery.sourceManifest.sources.filter((source) => source.sourceDocumentId === candidate.documentId),
      confirmedBy: id(81), confirmedAt: "2026-09-08T12:00:00Z",
    },
  };
}

function run(evidence: ReceivablesEvidenceEnvelope[], scope: ReceivablesEvidenceScopeContext | null = null) {
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
    confirmed_receivables_scope: scope,
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
    const result = run([evidence], confirmation([evidence]));
    expect(result.publicReport.status).toBe("analyzed");
    expect(result.publicReport.pipeline).not.toBeNull();
    expect(JSON.stringify(result.privateReport)).toContain(`${id(90)}:pool:${id(1)}:`);
    const revised = [await envelope(1, false, 2)];
    expect(run(revised, confirmation(revised)).publicReport.methodReadiness.sourceDatasetHash).not.toBe(result.publicReport.methodReadiness.sourceDatasetHash);
  });
});


describe("confirmed receivables scope isolation", () => {
  it("requires confirmation even for one detected tape", async () => {
    const result = run([await envelope(1)]);
    expect(result.publicReport.scopeIssue?.code).toBe("scope_confirmation_required");
    expect(result.publicReport.pipeline).toBeNull();
  });
  it.each([false, true])("projects only the selected pool (same workbook: %s)", async (sameWorkbook) => {
    const evidence = sameWorkbook ? [await envelope(1, true)] : [await envelope(1), await envelope(2)];
    const scope = confirmation(evidence, 1);
    const discovery = discoverReceivablesEvidence(evidence);
    const selected = resolveConfirmedReceivablesScope(discovery, scope);
    expect(selected.state).toBe("current");
    if (selected.state !== "current") throw new Error("Expected selection");
    expect(selected.documents).toHaveLength(1);
    expect(selected.documents[0]!.id).toBe(scope.scope!.primaryTape.documentId);
    expect(selected.documents[0]!.layer.sheets).toHaveLength(1);
    expect(selected.documents[0]!.layer.sheets![0]!.name).toBe(scope.scope!.primaryTape.sheet);
    expect(run(evidence, scope).publicReport.status).toBe("analyzed");
    const reordered = resolveConfirmedReceivablesScope(discoverReceivablesEvidence([...evidence].reverse()), scope);
    expect(reordered).toEqual(selected);
  });
  it("invalidates confirmation when the delivered revision changes", async () => {
    const evidence = [await envelope(1)];
    const changed = [await envelope(1, false, 2)];
    expect(run(changed, confirmation(evidence)).publicReport.scopeIssue?.code).toBe("scope_stale");
  });
  it("rejects another pool disguised as a complement", async () => {
    const evidence = [await envelope(1), await envelope(2)];
    const scope = confirmation(evidence);
    scope.scope!.complementDocumentIds = [id(2)];
    scope.scope!.sourceRevisions = scope.sourceManifest!.sources;
    expect(run(evidence, scope).publicReport.scopeIssue?.code).toBe("scope_stale");
  });
  it("binds the declared date to calculation identity and blocks future source events", async () => {
    const evidence = [await envelope(1)];
    const earlier = run(evidence, confirmation(evidence, 0, "2026-06-15"));
    const later = run(evidence, confirmation(evidence, 0, "2026-07-15"));
    expect(earlier.publicReport.methodReadiness.sourceDatasetHash).not.toBe(later.publicReport.methodReadiness.sourceDatasetHash);
    expect(run(evidence, confirmation(evidence, 0, "2026-05-01")).publicReport.scopeIssue?.code).toBe("reporting_date_conflict");
  });
});


describe("confirmed scope boundaries within source files", () => {
  it.each([0, 1])("isolates header block %s and retains original source row addresses", async (index) => {
    const evidence = [await envelope(1, false, 1, "blocks")];
    const selected = resolveConfirmedReceivablesScope(discoverReceivablesEvidence(evidence), confirmation(evidence, index));
    if (selected.state !== "current") throw new Error("Expected selection");
    const cells = selected.documents[0]!.layer.sheets![0]!.cells;
    expect(cells.map((cell) => cell.ref)).toContain(index === 0 ? "A2" : "A6");
    expect(cells.map((cell) => cell.ref)).not.toContain(index === 0 ? "A6" : "A2");
    expect(run(evidence, confirmation(evidence, index)).publicReport.status).toBe("analyzed");
  });
  it("admits only explicitly selected supporting documents in a stable order", async () => {
    const evidence = [await envelope(1), await envelope(2, false, 1, "support"), await envelope(3, false, 1, "support"), await envelope(4, false, 1, "support")];
    const scope = confirmation(evidence);
    scope.scope!.complementDocumentIds = [id(3), id(2)];
    scope.scope!.sourceRevisions = scope.sourceManifest!.sources.filter((source) => source.sourceDocumentId !== id(4));
    const selected = resolveConfirmedReceivablesScope(discoverReceivablesEvidence(evidence), scope);
    if (selected.state !== "current") throw new Error("Expected selection");
    expect(selected.documents.map((document) => document.id)).toEqual([id(1), id(2), id(3)]);
    expect(resolveConfirmedReceivablesScope(discoverReceivablesEvidence([...evidence].reverse()), scope)).toEqual(selected);
  });
});


it("admits fiscal evidence only when its archive is explicitly selected", async () => {
  const archives = [2, 3].map((n): ReceivablesEvidenceEnvelope => {
    const encoded = encodeReceivablesEvidence({archiveId: id(n), fileHash: "a".repeat(64), invoices: [], cancellations: []});
    return {source_document_id: id(n), document_version: 1, content_kind: "nfe_archive", schema_version: encoded.schemaVersion,
      source_sha256: "a".repeat(64), content_sha256: encoded.contentSha256, payload_sha256: encoded.payloadSha256,
      codec: "gzip-json-v1", uncompressed_bytes: encoded.uncompressedBytes, payload_base64: encoded.payloadBase64};
  });
  const evidence = [await envelope(1), ...archives];
  expect(discoverReceivablesEvidence(evidence, new Map([[id(2), "synthetic-fiscal-archive.zip"]])).sourceManifest.sources.find((source) => source.sourceDocumentId === id(2))?.fileName).toBe("synthetic-fiscal-archive.zip");
  const scope = confirmation(evidence);
  scope.scope!.complementDocumentIds = [id(2)];
  scope.scope!.sourceRevisions = scope.sourceManifest!.sources.filter((source) => source.sourceDocumentId !== id(3));
  const selected = resolveConfirmedReceivablesScope(discoverReceivablesEvidence(evidence), scope);
  if (selected.state !== "current") throw new Error("Expected selection");
  expect(selected.fiscalArchives.map((archive) => archive.archiveId)).toEqual([id(2)]);
  expect(selected.documents).toHaveLength(1);
});


it("carries scoped ledger periods into the report, readiness and reproducible identity", async () => {
  const ledger = "DATA,HISTORICO,DOCUMENTO,DEBITO,CREDITO,SALDO\n2026-08-31,Ajuste de conciliacao,ADJ-1,100,0,100\n2026-09-01,Reclassificacao,ADJ-2,900,0,1000\n,Ajuste de conciliacao,ADJ-3,50,0,1050";
  const evidence = [await envelope(1), await envelope(2, false, 1, "tape", ledger)];
  const scope = confirmation(evidence, 0, "2026-08-31");
  scope.scope!.complementDocumentIds = [id(2)];
  scope.scope!.sourceRevisions = scope.sourceManifest!.sources;
  const result = run(evidence, scope).publicReport;
  expect(result.supportPeriodAssessment).toMatchObject({schemaVersion: "receivables-support-periods.v1", reportingDate: "2026-08-31"});
  expect(result.supportPeriodAssessment?.entries).toEqual(expect.arrayContaining([
    expect.objectContaining({sourceId: id(2), rawDate: "2026-08-31", qualification: "included", anchor: expect.objectContaining({row: 2})}),
    expect.objectContaining({sourceId: id(2), rawDate: "2026-09-01", qualification: "subsequent", anchor: expect.objectContaining({row: 3})}),
    expect.objectContaining({sourceId: id(2), rawDate: null, qualification: "missing", anchor: expect.objectContaining({row: 4})}),
  ]));
  expect(result.evidenceCoverage.complete).toBe(false);
  expect(result.methodReadiness.methodExecutionAllowed).toBe(false);
  const projection = buildReceivablesMethodEvidenceRequestProjection({projectId: id(91), processingRunId: id(92), locale: "en-US", readiness: result.methodReadiness, idFactory: () => id(93)});
  expect(projection.requests.length).toBeGreaterThan(0);
  expect(run([...evidence].reverse(), scope).publicReport.fingerprint).toBe(result.fingerprint);
  const revised = [evidence[0]!, await envelope(2, false, 2, "tape", ledger.replace("2026-09-01", "2026-08-30"))];
  expect(run(revised, scope).publicReport.scopeIssue?.code).toBe("scope_stale");
});
