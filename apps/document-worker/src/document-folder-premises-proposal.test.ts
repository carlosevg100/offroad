import {readFileSync} from "node:fs";
import {beforeAll, describe, expect, it} from "vitest";
import {composeBoundDocumentFolderInventory, prepareDocumentFolderInventoryPacket, type DocumentFolderInventoryPacket, type DocumentFolderInventoryPacketInput, type DocumentReading,
  type ProposedHypothesis} from "@offroad/financial-model";
import type {DocumentLayer} from "@offroad/document-intelligence";
import {compileObjectiveToPlan} from "@offroad/work-plan";
import {completeDocumentFolderFacts, documentFolderEntry, documentFolderLayerContent, documentFolderReaderVersion, documentFolderReading, proposeDocumentFolderPremisesForTurn,
  documentFolderResumeNotices, documentFolderResumeOf, isDocumentFolderResumeNotice, readDocumentFolderFile, type DocumentFolderEvidence, type DocumentFolderFraming, type DocumentFolderReadingOutcome,
  type DocumentFolderExtraction, type DocumentFolderReadingExtraction, type DocumentFolderReadingRequest, type DocumentFolderRequestTest, type DocumentFolderTurnPremises} from "./document-folder-premises-proposal";
import {inMemoryBasis} from "./lote3-reader-check";
import {financialModelFixture} from "./lote2-premises.test-support";

// Synthetic calibration of ficha C09 (Aurora Alimentos, folder "Financeiro 2025-26"), from the method's own test support.
type Support = {auroraFolderReadings: () => DocumentReading[]; auroraTurnTwoReadings: () => DocumentReading[]; auroraEntities: DocumentFolderEvidence["entities"];
  auroraDecisions: DocumentFolderEvidence["decisions"]; auroraVault: () => DocumentFolderEvidence["vault"]};
type Runs = {folderPacketInput: (o?: {turnTwo?: boolean}) => DocumentFolderInventoryPacketInput; folderQuestion: string; folderTurnTwoQuestion: string};
let s: Support, runs: Runs, asks: DocumentFolderRequestTest;
beforeAll(async () => {
  s = await financialModelFixture<Support>("document-folder-inventory.test-support.ts");
  runs = await financialModelFixture<Runs>("document-folder-inventory-runs.test-support.ts");
  // The router's document_folder objective (packages/work-plan/src/document-folder-route.ts), until the router compiles it.
  const route = await import(new URL("../../../packages/work-plan/src/document-folder-route.ts", import.meta.url).href) as {documentFolderRoute: (t: string, k: string) => string};
  const fold = (m: string) => m.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();
  asks = (m, a) => route.documentFolderRoute(fold(m), compileObjectiveToPlan({message: m, hasAttachments: a}).objectiveKind) === "document_folder";
}, 120000);

const mime: Record<DocumentReading["format"], string> = {pdf: "application/pdf", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", xls: "application/vnd.ms-excel",
  csv: "text/csv", pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  jpg: "image/jpeg", png: "image/png"};
/** The content a file carries in the layer: a marker of its bytes, never its name. */
const marker = (r: DocumentReading) => `Conteúdo ${r.sha256.slice(0, 20)}`;
/** A stored layer for a calibrated reading: its pages (the unreadable ones scanned without text), sheets or slides. */
function layerOf(r: DocumentReading): DocumentLayer {
  const base = {documentId: r.fileId, documentVersion: 1, scaleDeclarations: []};
  if (r.format === "xlsx" || r.format === "xls" || r.format === "csv") return {...base, kind: "spreadsheet", sheets: [{name: "Conteúdo", hidden: false, cells: [{ref: "A1", v: marker(r), t: "s"}], tables: []}], stats: {}};
  if (r.format === "pptx") return {...base, kind: "pptx", slides: [{n: 1, blocks: [{id: "sl1.b1", kind: "text", text: marker(r)}], tables: []}], stats: {}};
  // A photo is read by the text its scan yields (the gateway takes no image): the marker stands for that text.
  if (r.format === "jpg" || r.format === "png") return {...base, kind: "image", pages: [{n: 1, blocks: [{id: "p1.b1", kind: "text", text: marker(r)}], tables: [], scanned: true}], stats: {}};
  const count = r.substitutesPages ? 1 : r.legibility.pageCount ?? 1, unread = new Set(r.legibility.unreadablePages.map((p) => p.page));
  return {...base, kind: "pdf", stats: r.legibility.pageCount === null ? {} : {pageCount: r.legibility.pageCount},
    pages: Array.from({length: count}, (_, k) => unread.has(k + 1) ? {n: k + 1, blocks: [], tables: [], scanned: true}
      : {n: k + 1, blocks: [{id: `p${k + 1}.b1`, kind: "text" as const, text: `${marker(r)} página ${k + 1}`}], tables: [], scanned: false})};
}
/** What the reading extraction returns for a calibrated reading, read from its content. */
function extractionOf(r: DocumentReading): DocumentFolderReadingExtraction {
  return {legible: r.legibility.wholeFile === null, kind: r.kind, description: r.description, entity: {registryId: r.entity.primaryId, outsideRegistryName: null, label: r.entity.label},
    period: r.period, perimeter: r.perimeter, version: r.version, referenceDate: r.referenceDate, instrument: r.instrument, asset: r.asset, substitutesPages: r.substitutesPages,
    expectedContent: r.legibility.unreadablePages.flatMap((p) => p.expectedContent && p.expectedFrom ? [{page: p.page, content: p.expectedContent, from: p.expectedFrom}] : []),
    units: r.units, figures: r.figures, clauses: r.clauses, observations: r.observations, debtTable: r.debtTable};
}
const fileOf = (r: DocumentReading) => ({documentId: r.fileId, fileName: r.fileName, sha256: r.sha256, mimeType: mime[r.format], status: "ready" as const, locked: null, layer: layerOf(r)});
const evidenceOf = (readings: DocumentReading[]): DocumentFolderEvidence => ({subjectEntityId: "aurora", entities: s.auroraEntities, decisions: s.auroraDecisions, vault: s.auroraVault(), files: readings.map(fileOf)});
/** The reading extraction: it receives the content and the registry, finds the calibrated reading by the content's marker. */
function reader(all: DocumentReading[], requests: DocumentFolderReadingRequest[]) {
  return async (request: DocumentFolderReadingRequest) => {
    requests.push(request);
    const found = all.find((r) => request.text.includes(marker(r)));
    if (!found) throw new Error("unknown content");
    return extractionOf(found);
  };
}
const turn = (e: Partial<DocumentFolderExtraction> = {}): DocumentFolderExtraction => ({turnIntent: "answers_pending", mode: {value: null, origin: null, source: null}, decisions: [], informed: [], ...e});
const projectId = "a0000000-0000-4000-8000-000000000001";
const entityId = "a0000000-0000-4000-8000-000000000009", definitionVersionId = "a0000000-0000-4000-8000-00000000000a";
/** The confirmation binds the hypotheses to the work's subject and definition, then adopts them as one basis. */
const confirm = (p: {hypotheses: unknown[]}, version: number) => inMemoryBasis((p.hypotheses as ProposedHypothesis[]).map((h) => ({...h, dimensions: {...h.dimensions, entityId, definitionVersionId}})), version);
const withoutInformedIds = (p: DocumentFolderInventoryPacket) => ({...p.result.inventory!, informed: p.result.inventory!.informed.map((i) => ({...i, id: "-"})),
  questions: p.result.inventory!.questions.map((q) => ({...q, answeredBy: q.answeredBy && "-"}))});

/** The reading jobs as the database runs them: one per bytes and registry, each reading the stored layer by content,
 * kept and returned to the turn by document. `pending` leaves the named documents without a reading yet. */
function readingStore(evidence: () => DocumentFolderEvidence, read: (r: DocumentFolderReadingRequest) => Promise<unknown>, pending: ReadonlySet<string> = new Set()) {
  const kept = new Map<string, Promise<DocumentFolderReadingOutcome>>();
  return async (request: {readerVersion: string; context: unknown; files: {documentId: string}[]}) => {
    expect(request.readerVersion).toBe(documentFolderReaderVersion);
    const ctx = JSON.stringify(request.context);
    return {contextFingerprint: "c".repeat(64), queued: 0, files: await Promise.all(request.files.map(async ({documentId}) => {
      const f = evidence().files.find((x) => x.documentId === documentId)!;
      if (pending.has(documentId)) return {documentId, sha256: f.sha256, status: "pending", reading: null, refusalCode: null};
      const key = `${f.sha256}:${ctx}`;
      if (!kept.has(key)) kept.set(key, readDocumentFolderFile({mimeType: f.mimeType, layer: f.layer!}, request.context as never, read));
      const r = await kept.get(key)!;
      return {documentId, sha256: f.sha256, status: r.status, reading: r.status === "ready" ? r.reading : null, refusalCode: r.status === "refused" ? r.refusalCode : null};
    }))};
  };
}

async function run(o: {message: string; readings: DocumentReading[]; extraction?: DocumentFolderExtraction; earlier?: string[]; prior?: unknown; date?: string; author?: string | null;
  evidence?: DocumentFolderEvidence; requests?: DocumentFolderReadingRequest[]; pending?: Set<string>; resume?: {framing: DocumentFolderFraming}; framings?: unknown[]; onExtract?: () => void}) {
  const events: string[] = [], requests = o.requests ?? [];
  const all = [...s.auroraFolderReadings(), ...s.auroraTurnTwoReadings()];
  const evidence = o.evidence ?? evidenceOf(o.readings);
  const result = await proposeDocumentFolderPremisesForTurn({message: o.message, hasAttachments: true, recentUserMessages: o.earlier ?? [], projectId,
    messageDate: o.date ?? "2026-09-01", author: o.author === undefined ? "Controller da Aurora" : o.author,
    loadFolder: async () => evidence, loadPrior: async () => ({prior: o.prior ?? null}), loadReadings: async (request) => {o.framings?.push(request.framing); return readingStore(() => evidence, reader(all, requests), o.pending)(request);}, ...o.resume ? {resume: o.resume} : {},
    extract: async () => {o.onExtract?.(); return o.extraction ?? turn({mode: {value: "organize", origin: "informed", source: "Organiza e me diz o que tem"}});}, log: (event) => {events.push(event);}, asks});
  return {result, events, requests};
}
const proposed = (r: DocumentFolderTurnPremises | null) => {if (r?.forAdvisor.status !== "proposed" || !r.proposal) throw new Error(JSON.stringify(r?.forAdvisor)); return r.proposal;};

describe("ficha C09 bridge: the folder organized from the conversation", {timeout: 120000}, () => {
  it("enters on the ficha's request and its paraphrases, and on the answer that follows; never on a neighbour or a question", () => {
    for (const m of ["Joguei aqui a pasta do último ano. Organiza e me diz o que tem.", "Só organiza, não analisa ainda.", "O que tem nesses arquivos?",
      "Organiza o material para discutirmos a dívida.", "Subi tudo que o financeiro tinha. Dá uma olhada e me fala o que falta."]) expect(documentFolderEntry(m, true, [], asks), m).toBe("cue");
    const earlier = ["Joguei aqui a pasta do último ano. Organiza e me diz o que tem."];
    expect(documentFolderEntry("Segue a página 7 legível e o balancete de março. A minuta não foi para nenhum banco.", true, earlier, asks)).toBe("continuation");
    expect(documentFolderEntry("A minuta foi para algum banco?", false, earlier, asks)).toBeNull();
    expect(documentFolderEntry("Monta a tabela de dívida de junho.", true, earlier, asks)).toBeNull();
    for (const m of ["Monta o data room", "Organize os documentos do data room para o banco", "Lê esse contrato e me diz as cláusulas", "O que é um covenant?"])
      expect(documentFolderEntry(m, true, [], asks), m).toBeNull();
    expect(documentFolderEntry("Segue o balancete de março.", true, ["Tenho uns 60 milhões de recebíveis. Dá para usar isso para financiar a safra em vez da linha do banco?", ...earlier].reverse(), asks)).toBeNull();
  });

  it("turn 1: reads each file by content, once per hash, and the confirmed card organizes the folder as the calibration", async () => {
    const readings = s.auroraFolderReadings(), {result, requests} = await run({message: runs.folderQuestion, readings});
    const p = proposed(result);
    // 30 files, 29 distinct contents: the copy shares the reading of the original; no request carries a file name.
    expect(requests).toHaveLength(29);
    for (const r of readings) expect(requests.some((q) => q.text.includes(r.fileName))).toBe(false);
    expect((p.facts as {files: {value: DocumentReading; origin: string}[]}).files.map((f) => f.value)).toEqual(readings);
    expect((p.facts as {files: {origin: string}[]}).files.every((f) => f.origin === "document")).toBe(true);
    expect(p.summary.mode).toBe("organize");
    expect(p.summary.priorInventory).toBeNull();
    expect(p.hypotheses.every((h) => h.dimensions.entityId === null && h.dimensions.definitionVersionId === null)).toBe(true);
    const one = prepareDocumentFolderInventoryPacket(composeBoundDocumentFolderInventory({base: confirm(p, 900010), question: runs.folderQuestion, mode: p.summary.mode}));
    const ref = prepareDocumentFolderInventoryPacket(runs.folderPacketInput());
    expect(one.status).toBe("prepared_for_human_review");
    expect(one.readings).toEqual(ref.readings);
    expect(one.result.inventory).toEqual(ref.result.inventory);
  });

  it("turn 2: finds the completed inventory of the work, reads only what arrived and records the answer with author and date", async () => {
    const readings = s.auroraFolderReadings(), first = proposed((await run({message: runs.folderQuestion, readings})).result);
    const base = confirm(first, 900010);
    const input = composeBoundDocumentFolderInventory({base, question: runs.folderQuestion, mode: "organize"}), packet = prepareDocumentFolderInventoryPacket(input);
    const open = packet.result.inventory!.questions.filter((q) => q.status === "open");
    expect(open).toHaveLength(1);
    const prior = {executionId: "a0000000-0000-4000-8000-000000000071", resultFingerprint: packet.fingerprint, inputSnapshot: JSON.stringify(input), packet};
    const extraction = turn({informed: [{questionId: open[0]!.id, statement: "A minuta não foi para nenhum banco.", origin: "informed", source: "mensagem da controller no turno 2"}]});
    const requests: DocumentFolderReadingRequest[] = [];
    const {result} = await run({message: runs.folderTurnTwoQuestion, earlier: [runs.folderQuestion], readings: [...readings, ...s.auroraTurnTwoReadings()], extraction, prior, date: "2026-09-02", requests});
    const p = proposed(result);
    expect(requests).toHaveLength(2);
    expect(p.summary.priorInventory).toEqual({executionId: prior.executionId, resultFingerprint: packet.fingerprint, baseFingerprint: base.envelope.fingerprint});
    expect(p.summary.mode).toBe("organize");
    const two = prepareDocumentFolderInventoryPacket(composeBoundDocumentFolderInventory({base, update: confirm(p, 900011), question: runs.folderTurnTwoQuestion, mode: p.summary.mode}));
    const ref2 = prepareDocumentFolderInventoryPacket(runs.folderPacketInput({turnTwo: true}));
    expect(two.status).toBe("prepared_for_human_review");
    expect(two.readings).toEqual(ref2.readings);
    expect(withoutInformedIds(two)).toEqual(withoutInformedIds(ref2));

    // An answer to a question the inventory did not ask, or without the person who gave it, is asked; nothing new is named.
    const wrong = turn({informed: [{questionId: "outra", statement: "Nada.", origin: "informed", source: "mensagem"}]});
    const asked = (await run({message: runs.folderTurnTwoQuestion, earlier: [runs.folderQuestion], readings, extraction: wrong, prior, date: "2026-09-02", author: null})).result!;
    expect(asked.forAdvisor).toMatchObject({status: "missing", missing: ["informed.1.questionId", "informed.1.author"]});
    // The author and date the database gives for the message (worker_document_folder_evidence_v1) prevail and close the gap.
    const named = (await run({message: runs.folderTurnTwoQuestion, earlier: [runs.folderQuestion], readings, extraction: wrong, prior, date: "2026-09-02", author: null,
      evidence: {...evidenceOf(readings), author: "Mariana Souza, Controller", messageDate: "2026-09-02T14:00:00Z"}})).result!;
    expect(named.forAdvisor).toMatchObject({status: "missing", missing: ["informed.1.questionId"]});
    // Independent review, round 1: the same answer twice is one answer; two different answers to the same question are asked.
    const q = open[0]!.id;
    const twice = turn({informed: [{questionId: q, statement: "A minuta não foi para nenhum banco.", origin: "informed", source: "mensagem"},
      {questionId: q, statement: "A minuta não foi para nenhum banco", origin: "informed", source: "mensagem"}]});
    const merged = proposed((await run({message: runs.folderTurnTwoQuestion, earlier: [runs.folderQuestion], readings: [...readings, ...s.auroraTurnTwoReadings()], extraction: twice, prior, date: "2026-09-02"})).result);
    expect((merged.facts as {informed: {value: {questionId: string}}[]}).informed.filter((i) => i.value.questionId === q)).toHaveLength(1);
    const both = turn({informed: [{questionId: q, statement: "A minuta não foi para nenhum banco.", origin: "informed", source: "mensagem"},
      {questionId: q, statement: "A minuta foi enviada ao Itaú.", origin: "informed", source: "mensagem"}]});
    const contradiction = (await run({message: runs.folderTurnTwoQuestion, earlier: [runs.folderQuestion], readings: [...readings, ...s.auroraTurnTwoReadings()], extraction: both, prior, date: "2026-09-02"})).result!;
    expect(contradiction.forAdvisor).toMatchObject({status: "missing", missing: ["informed.2.contradiction"]});
    expect(contradiction.proposal).toBeNull();
    const none = (await run({message: runs.folderTurnTwoQuestion, earlier: [runs.folderQuestion], readings, extraction: turn(), prior, date: "2026-09-02"})).result!;
    expect(none.forAdvisor).toMatchObject({status: "missing", missing: ["nothingArrived"]});
  });

  it("the variations: organize only and organize for the debt discussion travel on the card; an unstated mode is the house default, named", async () => {
    const readings = s.auroraFolderReadings();
    const only = proposed((await run({message: "Só organiza, não analisa ainda.", readings, extraction: turn({mode: {value: "organize_only", origin: "informed", source: "Só organiza"}})})).result);
    expect(only.summary.mode).toBe("organize_only");
    const packet = prepareDocumentFolderInventoryPacket(composeBoundDocumentFolderInventory({base: confirm(only, 900012), question: "Só organiza, não analisa ainda.", mode: only.summary.mode}));
    expect([packet.readings!.decisionFindings, packet.readings!.generalFindings]).toEqual([null, null]);
    const r = (await run({message: runs.folderQuestion, readings, extraction: turn()})).result!;
    expect(r.forAdvisor).toMatchObject({status: "proposed", housePremises: ["openingDate", "mode"]});
  });

  it("names the files still in reading and proposes no card until every reading is ready or refused by name", async () => {
    const readings = s.auroraFolderReadings();
    const r = (await run({message: runs.folderQuestion, readings, pending: new Set([readings[1]!.fileId, readings[3]!.fileId])})).result!;
    expect(r.forAdvisor).toEqual({status: "missing", missing: ["files.2.reading_pending", "files.4.reading_pending"],
      files: [{position: 2, name: readings[1]!.fileName}, {position: 4, name: readings[3]!.fileName}]});
    // A file with no text in any page, a photo whose scan yields none among them, is refused by the reading job and asked as a legible copy.
    const evidence = evidenceOf(readings), photo = evidence.files.findIndex((f) => f.mimeType === "image/jpeg");
    evidence.files[photo] = {...evidence.files[photo]!, layer: {...evidence.files[photo]!.layer!, pages: [{n: 1, blocks: [], tables: [], scanned: true}]} as never};
    const p = (await run({message: runs.folderQuestion, readings, evidence})).result!;
    expect(p.forAdvisor).toMatchObject({status: "missing", missing: [`files.${photo + 1}.unreadable`]});
  });

  it("keeps the person's framing while the files are read, and the resumed turn organizes the folder as asked without a new message", async () => {
    const readings = s.auroraFolderReadings(), framings: unknown[] = [];
    const only = turn({mode: {value: "organize_only", origin: "informed", source: "Só organiza"}});
    const waiting = (await run({message: "Só organiza, não analisa ainda.", readings, extraction: only, pending: new Set([readings[0]!.fileId]), framings})).result!;
    expect(waiting.forAdvisor).toMatchObject({status: "missing", missing: ["files.1.reading_pending"]});
    expect(framings[0]).toEqual({mode: only.mode, decisions: [], informed: []});
    // The database resumes the turn by its brief job (payload document_folder_resume) with that framing and the person's
    // original message; the continuation message is the system's and no extraction reads it as the person's answer.
    const resume = documentFolderResumeOf({wait_id: projectId, source_message_id: projectId, framing: framings[0]})!;
    expect(resume.sourceMessageId).toBe(projectId);
    expect(documentFolderResumeOf({kind: "document_folder_resume", framing: framings[0]})).toBeNull();
    expect(documentFolderResumeOf(undefined)).toBeNull();
    let extracted = 0;
    const resumed = proposed((await run({message: documentFolderResumeNotices["pt-BR"], readings, resume,
      extraction: turn({turnIntent: "unrelated"}), onExtract: () => {extracted++;}})).result);
    expect(resumed.summary.mode).toBe("organize_only");
    expect(extracted).toBe(0);
    // The notices are exactly the texts the database writes, and never count as the person's words.
    const sql = readFileSync(new URL("../../../supabase/migrations/20261028120300_lote4_folder_reading.sql", import.meta.url), "utf8");
    for (const text of Object.values(documentFolderResumeNotices)) {expect(sql).toContain(`'${text}'`); expect(isDocumentFolderResumeNotice(text)).toBe(true);}
    expect(isDocumentFolderResumeNotice("Só organiza, não analisa ainda.")).toBe(false);
  });

  it("names what it cannot read or adopt, never drops a file and never proposes on another intent", async () => {
    const readings = s.auroraFolderReadings();
    const evidence = evidenceOf(readings);
    evidence.files[2] = {...evidence.files[2]!, locked: "password_protected"};
    evidence.files[4] = {...evidence.files[4]!, status: "processing"};
    evidence.files[6] = {...evidence.files[6]!, mimeType: "application/zip"};
    const r = (await run({message: runs.folderQuestion, readings, evidence})).result!;
    expect(r.forAdvisor).toEqual({status: "missing", missing: ["files.3.unreadable", "files.5.processing", "files.7.format"],
      files: [{position: 3, name: readings[2]!.fileName}, {position: 5, name: readings[4]!.fileName}, {position: 7, name: readings[6]!.fileName}]});
    expect((await run({message: runs.folderQuestion, readings, evidence: {...evidenceOf(readings), subjectEntityId: null}})).result!.forAdvisor).toMatchObject({missing: ["subjectEntity"]});
    for (const intent of ["defers", "other_request", "unrelated"] as const) {
      const x = await run({message: runs.folderQuestion, readings, extraction: turn({turnIntent: intent})});
      expect(x.result).toBeNull();
      expect(x.events).toContain("document_folder_premises.not_answering");
    }
  });

  it("a reading the method refuses is a gap at its file; the entity outside the registry is keyed by its stated name", () => {
    const f01 = s.auroraFolderReadings()[0]!, file = fileOf(f01), content = documentFolderLayerContent(file.layer), ids = new Set(["aurora", "aurora-log"]);
    expect(documentFolderReading(file, {...extractionOf(f01), description: "Recomendamos usar esta versão"}, content, ids)).toEqual({missing: ["free_text_outside_reading"]});
    expect(documentFolderReading(file, {...extractionOf(f01), entity: {registryId: "outra", outsideRegistryName: null, label: "Outra"}}, content, ids)).toEqual({missing: ["entity"]});
    const outside = documentFolderReading(file, {...extractionOf(f01), entity: {registryId: null, outsideRegistryName: "Beta Comércio Ltda.", label: "Beta"}}, content, ids);
    expect("reading" in outside && outside.reading.entity.primaryId).toMatch(/^beta-comercio-ltda-[a-f0-9]{12}$/);
    // A page the layer could not read stays unread, whatever the extraction says of it.
    const f20 = s.auroraFolderReadings().find((r) => r.fileId === "f20")!, c20 = documentFolderLayerContent(layerOf(f20));
    expect(c20.pagesWithoutText).toEqual([7]);
    const read = documentFolderReading(fileOf(f20), {...extractionOf(f20), expectedContent: []}, c20, ids);
    expect("reading" in read && read.reading.legibility.unreadablePages).toEqual([{page: 7, reason: "illegible_scan", expectedContent: null, expectedFrom: null}]);
  });

  it("past 200 files or 256 premises in one basis the turn names the limit", async () => {
    const f03 = s.auroraFolderReadings().find((r) => r.fileId === "f03")!;
    const many = Array.from({length: 201}, (_, k) => ({...f03, fileId: `c${k}`, fileName: `c${k}.pdf`}));
    expect((await run({message: runs.folderQuestion, readings: many})).result!.forAdvisor).toMatchObject({missing: ["tooManyFiles"]});
    const evidence = evidenceOf(many.slice(0, 200));
    evidence.vault = Array.from({length: 60}, (_, k) => ({documentId: `v${k}`, sha256: String(k % 10).repeat(64), label: "Escritura", instrumentRef: `inst-${k}`}));
    expect((await run({message: runs.folderQuestion, readings: many.slice(0, 200), evidence})).result!.forAdvisor).toMatchObject({missing: ["tooManyItems"]});
  });

  it("completes the facts with the registry, the open works and the decisions the person named", () => {
    const readings = s.auroraFolderReadings();
    const c = completeDocumentFolderFacts({evidence: {...evidenceOf(readings), decisions: []}, readings, readingDate: "2026-09-01",
      ids: {inventoryId: projectId, entityId: projectId, definitionVersionId: projectId},
      extraction: turn({decisions: [{kind: "financing_plan", origin: "informed", source: "o plano de financiamento de 2027"}]})});
    if (c.status !== "complete") throw new Error(JSON.stringify(c));
    expect(c.facts.decisions).toEqual([{value: {id: "conversa-financing-plan", label: "Plano de financiamento", kind: "financing_plan"}, origin: "informed", source: "o plano de financiamento de 2027"}]);
    expect([c.facts.openingDate, c.facts.subjectEntityId.origin]).toEqual(["2025-01-01", "informed"]);
  });
});
