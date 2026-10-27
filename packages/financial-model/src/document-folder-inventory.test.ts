import {describe, expect, it} from "vitest";
import {inventoryFingerprint, organizeDocumentFolder, type DocumentReading} from "./document-folder-inventory";
import {auroraFolderReadings, auroraKernelInput, auroraTurnTwoInformed, auroraTurnTwoReadings} from "./document-folder-inventory.test-support";
import {c09AnswerKey} from "./document-folder-inventory-answer-key.test-support";

const edit = (change: (r: DocumentReading[]) => void) => {const r = auroraFolderReadings(); change(r); return r;};
const file = (r: DocumentReading[], id: string) => r.find((x) => x.fileId === id)!;
const turnOne = () => organizeDocumentFolder(auroraKernelInput());
const turnTwo = (prior = turnOne(), files = [...auroraFolderReadings(), ...auroraTurnTwoReadings()]) =>
  organizeDocumentFolder(auroraKernelInput({asOf: "2026-09-02", files, informed: auroraTurnTwoInformed, prior: {inventory: prior, fingerprint: inventoryFingerprint(prior)}}));

describe("document folder inventory kernel", () => {
  it("reproduces the answer key's situation and group for every file, in arrival order", () => {
    const o = turnOne();
    expect(o.rows.map((r) => [r.situationLabel, r.groupLabel, r.findingIds.length > 0])).toEqual(c09AnswerKey.map((k) => [k[5], k[6], k[7]]));
    expect(o.counts).toEqual({files: 30, duplicates: 1, incompleteReadings: 2, superseded: 3, inVault: 2, withFinding: 21, pageSubstitutes: 0});
  });
  it("states the decision findings with the figures read, and calculates nothing else", () => {
    const d = turnOne().decisionFindings!.map((x) => x.statement);
    expect(d[0]).toBe("O covenant da escritura é o do aditamento de junho de 2023. A versão original diz que o covenant é de 2,75x e não há exceção de valor na garantia negativa; o aditamento elevou o covenant para 3,0x e criou a exceção de R$ 15 milhões em valor agregado. As duas precisam ser lidas juntas.");
    // The comparison with the covenants waits for the CCB's page 7: it is withheld whole and declared.
    expect(d[1]).toBe("Há uma política de endividamento aprovada pelo conselho. A ata do conselho de março de 2026 fixa dívida líquida de no máximo 2,5x o EBITDA.");
    expect(turnOne().findings.find((f) => f.id === "f24-blocked-comparison-politica")!.knowledge).toBe("unread");
    expect(d[2]).toContain("a contraparte responde por 32% da carteira");
    expect(d[3]).toBe("O contrato com o fornecedor renova sozinho em dezembro de 2026. Para renegociar preço ou não renovar, o aviso precisa sair até 2 de outubro de 2026.");
    expect(d[4]).toBe("A dívida em 30 de junho de 2026 é de R$ 130 milhões, não R$ 140 milhões. A tabela soma o limite da conta garantida, que está sem uso.");
    expect(d[5]).toContain("A minuta tem EBITDA de R$ 54,8 milhões; a auditada, R$ 52 milhões");
    expect(d[6]).toBe("A controlada entra no consolidado. O caixa dela, R$ 4,1 milhões, só chega à controladora por dividendo ou mútuo.");
  });
  it("never reads the file name: swapping every name leaves the inventory unchanged but for the names", () => {
    const names = auroraFolderReadings().map((r) => r.fileName).reverse();
    const strip = (o: ReturnType<typeof turnOne>) => o.rows.map(({fileName: _f, description, ...r}) => ({...r, description: r.situation.duplicateOf ? "-" : description}));
    const renamed = organizeDocumentFolder(auroraKernelInput({files: edit((r) => r.forEach((x, n) => {x.fileName = names[n]!;}))}));
    expect(strip(renamed)).toEqual(strip(turnOne()));
    expect(renamed.findings).toEqual(turnOne().findings);
  });
  it("keeps two readings of one period that nothing distinguishes, and chooses neither", () => {
    const o = organizeDocumentFolder(auroraKernelInput({files: edit((r) => {file(r, "f09").version.ordinal = null; file(r, "f10").version.ordinal = null;})}));
    expect(o.families.find((f) => f.id.startsWith("trial_balance"))).toMatchObject({resolution: "unresolved", prevails: [], sideBySide: ["f09", "f10"]});
    expect(o.rows.filter((r) => ["f09", "f10"].includes(r.fileId)).map((r) => r.situation.supersededBy)).toEqual([null, null]);
    // With May unresolved the semester is not summed on either reading.
    expect(o.identityChecks.find((c) => c.kind === "period_against_months")!.status).toBe("not_run");
  });
  it("names a total that does not recompose and an amendment whose original is nowhere", () => {
    const o = organizeDocumentFolder(auroraKernelInput({vault: [], files: edit((r) => {file(r, "f16").debtTable!.reportedTotal = "135"; r.splice(r.indexOf(file(r, "f18")), 1);})}));
    // The overdraft enters by its limit, but the lines as counted do not add up to 135: the rest is declared apart.
    expect(o.findings.find((f) => f.id === "f16-debt-total")!.code).toBe("total_includes_unused_limit");
    expect(o.findings.find((f) => f.id === "f16-debt-total-unexplained")!.statement).toContain("não fecham com o total informado de R$ 135 milhões");
    const none = organizeDocumentFolder(auroraKernelInput({files: edit((r) => {const t = file(r, "f16").debtTable!; t.lines = t.lines.map((l) => ({...l, counted: l.drawn})); t.reportedTotal = "135";})}));
    expect(none.findings.find((f) => f.id === "f16-debt-total")!.code).toBe("total_not_recomposed");
    expect(o.findings.find((f) => f.id === "f19-no-original")!.code).toBe("amendment_without_original");
    expect(o.effectiveTexts).toEqual([]);
  });
  it("reads a cited revenue equal to the net revenue as consistent", () => {
    const o = organizeDocumentFolder(auroraKernelInput({files: edit((r) => {file(r, "f28").figures[0]!.value = "420";})}));
    expect(o.findings.some((f) => f.anchor === "f28")).toBe(false);
  });
  it("updates in turn 2 only the rows touched; the rest are the prior bytes", () => {
    const prior = turnOne(), t = turnTwo(prior);
    expect(t.update).toMatchObject({rowsUpdated: ["f20"], rowsAdded: ["s02"], rowsPreserved: 29, findingsResolved: ["f11-series-gap", "f20-blocked-text-in-force", "f20-unreadable-p7", "f24-blocked-comparison-politica"], findingsAdded: ["f20-s01:reforco"],
      questionsAnswered: ["circulacao-f02"]});
    for (const r of prior.rows.filter((x) => x.fileId !== "f20")) expect(t.rows.find((x) => x.fileId === r.fileId)).toEqual(r);
    expect(t.findings.find((f) => f.id === "f11-series-gap")).toMatchObject({status: "resolved", resolvedBy: ["s02"]});
    expect(t.informed).toEqual([{...auroraTurnTwoInformed[0], origin: "informed"}]);
  });
  it("refuses an update that would drop a row, change an untouched row, lose a finding or update another inventory", () => {
    const prior = turnOne();
    const dropped = structuredClone(prior); dropped.rows.push({...dropped.rows[0]!, fileId: "fx", order: 99}); dropped.counts.files = 31;
    expect(() => turnTwo(dropped)).toThrow("document_inventory_prior_row_dropped");
    const changed = structuredClone(prior); changed.rows[5]!.situationLabel = "lida; superada";
    expect(() => turnTwo(changed)).toThrow("document_inventory_unaffected_row_changed");
    expect(() => turnTwo(prior, [...edit((r) => {file(r, "f22").clauses = [];}), ...auroraTurnTwoReadings()])).toThrow("document_inventory_finding_dropped");
    expect(() => organizeDocumentFolder(auroraKernelInput({prior: {inventory: prior, fingerprint: "0".repeat(64)}}))).toThrow("document_inventory_prior_mismatch");
  });
  it("accepts a page substitute only for an unreadable page of the same instrument", () => {
    const [s01] = auroraTurnTwoReadings();
    expect(() => organizeDocumentFolder(auroraKernelInput({files: [...auroraFolderReadings(), {...s01!, instrument: {...s01!.instrument!, ref: "inexistente"}, substitutesPages: {instrumentRef: "inexistente", pages: [7]}}]}))).toThrow("document_inventory_substitute_without_target");
    // The copy's identity is the target's: another instrument, entity, period or version is refused, a lower version included.
    const refused = (x: DocumentReading) => expect(() => organizeDocumentFolder(auroraKernelInput({files: [...auroraFolderReadings(), x]}))).toThrow("document_inventory_unsupported_substitute");
    refused({...s01!, instrument: {...s01!.instrument!, ref: "finame-2022"}});
    refused({...s01!, entity: {...s01!.entity, primaryId: "aurora-log"}});
    refused({...s01!, period: {label: "2023", start: "2023-01-01", end: "2023-12-31"}});
    refused({...s01!, version: {...s01!.version, ordinal: 1}});
    expect(() => organizeDocumentFolder(auroraKernelInput({files: [...auroraFolderReadings(), {...s01!, clauses: [{...s01!.clauses[0]!, at: {page: 3, section: null}}]}]}))).toThrow("document_inventory_substitute_outside_its_pages");
  });
});

describe("review r1 of the folder inventory kernel", () => {
  it("never sums a month whose versions have no winner", () => {
    const files = [...edit((r) => {file(r, "f09").version.ordinal = null; file(r, "f10").version.ordinal = null;}), auroraTurnTwoReadings()[1]!];
    const c = organizeDocumentFolder(auroraKernelInput({files})).identityChecks.find((x) => x.kind === "period_against_months")!;
    expect([c.status, c.reason, c.recomposed]).toEqual(["not_run", "conflict:unresolved_versions:2026-05", null]);
  });
  it("a draft amendment produces no term in force", () => {
    const o = organizeDocumentFolder(auroraKernelInput({files: edit((r) => {file(r, "f19").version = {label: "minuta não assinada", status: "draft", ordinal: null, lastUpdated: null};})}));
    expect(o.effectiveTexts).toEqual([]);
    expect(o.findings.filter((f) => f.anchor === "f19").map((f) => f.code)).toEqual(["amendment_not_in_force"]);
    expect(o.findings.find((f) => f.id === "f24-politica")!.statement).toBe("Política de no máximo 2,5x.");
  });
  it("derives deadlines from the text in force; the replaced clause stays as history", () => {
    const o = organizeDocumentFolder(auroraKernelInput({files: edit((r) => r.push({...structuredClone(file(r, "f23")), fileId: "f31", sha256: "b".repeat(64),
      period: {label: "ago/2026", start: "2026-08-01", end: "2026-08-31"}, instrument: {ref: "contrato-embalagem-ad1", label: "contrato de embalagem", amends: "contrato-embalagem"},
      clauses: [{type: "auto_renewal", id: "renovacao", at: {page: 1, section: null}, statement: "Renovação automática salvo aviso até 2/nov/26.", termEnd: "2026-12-31", noticeDeadline: "2026-11-02"}]}))}));
    expect(o.followUps.filter((f) => f.kind === "notice_deadline").map((f) => f.kind === "notice_deadline" && f.date)).toEqual(["2026-11-02"]);
    expect(o.findings.find((f) => f.id === "f23-renovacao-superseded")).toMatchObject({code: "clause_superseded", effect: null});
    expect(o.findings.some((f) => f.id === "f23-renovacao")).toBe(false);
  });
  it("refuses a reading of an unreadable page given through a section, and free text in the method's voice", () => {
    expect(() => organizeDocumentFolder(auroraKernelInput({files: edit((r) => file(r, "f20").clauses.push({type: "prepayment", id: "x", at: {page: null, section: "Página 7"}, statement: "Pré-pagamento livre."}))})))
      .toThrow("document_inventory_unpaged_reading_in_partly_unreadable_file");
    expect(() => organizeDocumentFolder(auroraKernelInput({files: edit((r) => file(r, "f05").observations.push({id: "x", at: {page: 3, section: null}, topic: "other",
      statement: "Calculei dívida líquida / EBITDA de 2,50x; recomendo contratar R$ 20 milhões. Todos os documentos foram validados."}))}))).toThrow("document_inventory_free_text_outside_reading");
    expect(() => organizeDocumentFolder(auroraKernelInput({files: edit((r) => {file(r, "f19").clauses[0]!.statement = "Dívida líquida / EBITDA de no máximo 3,5x.";})}))).toThrow("document_inventory_free_text_outside_reading");
  });
  it("quotes what the document says apart from what the method states", () => {
    const f = turnOne().findings.find((x) => x.id === "f22-cessao")!;
    expect([f.quoted, f.statement]).toEqual([{fileId: "f22", page: 9, section: null, text: "Veda a cessão dos recebíveis sem anuência do cliente."}, "Limita qualquer financiamento com cessão dessa carteira."]);
  });
  it("a copy carries its original's reading; the same bytes read two ways is a declared conflict", () => {
    expect(turnOne().rows[29]).toMatchObject({entity: "Aurora", kind: "annual_financial_statements", version: "duplicado exato"});
    const o = organizeDocumentFolder(auroraKernelInput({files: edit((r) => {file(r, "f30").kind = "debt_schedule";})}));
    expect(o.readingConflicts).toEqual([{sha256: o.rows[0]!.sha256, page: null, fileIds: ["f01", "f30"]}]);
    expect([o.rows[0]!.situation.read, o.rows[29]!.situation.read, o.rows[29]!.kind]).toEqual(["conflicted", "conflicted", "unidentified"]);
    expect(o.findings.filter((f) => f.code === "reading_conflict").map((f) => f.anchor)).toEqual(["f01", "f30"]);
  });
});
