import {createHash} from "node:crypto";
import {deterministicRunEvidenceFingerprint, type DeterministicMethodRun, type DeterministicMethodRunCase} from "@offroad/credit-playbook";
import {documentFolderInventoryPacketOutputSchema, prepareDocumentFolderInventoryPacket, type DocumentFolderInventoryPacket, type DocumentFolderInventoryPacketInput} from "./document-folder-inventory-packet";
import type {DocumentReading} from "./document-folder-inventory";
import {auroraDecisions, auroraEntities, auroraFolderBasis, auroraFolderReadings, auroraFolderUpdateBasis, auroraTurnTwoInformed, auroraTurnTwoReadings, auroraVault} from "./document-folder-inventory.test-support";
import {c09AnswerKey, c09AnswerKeyCounts} from "./document-folder-inventory-answer-key.test-support";

// Evaluation-only module; not exported to application consumers. All cases are synthetic
// calibrations of ficha C09 (inventario_gabarito.py), never production parameters.
const fingerprint = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
type Case = DeterministicMethodRunCase;
type Evidence = Omit<DeterministicMethodRun, "schemaVersion" | "humanApproval" | "run">;
type Packet = DocumentFolderInventoryPacket;
export const documentFolderInventoryMethodVersion = "2026.10.27-v1";
export const documentFolderInventoryRunIds = {
  gold: "organize-document-folder-2026-10-27-v1-gold",
  adversarial: "organize-document-folder-2026-10-27-v1-adversarial",
  consistency: "organize-document-folder-2026-10-27-v1-consistency",
} as const;
export const folderQuestion = "Joguei aqui a pasta do último ano. Organiza e me diz o que tem.";
export const folderTurnTwoQuestion = "Segue a página 7 legível e o balancete de março. A minuta não foi para nenhum banco.";
type Options = {files?: DocumentReading[]; turnTwo?: boolean | {files?: DocumentReading[]; informed?: typeof auroraTurnTwoInformed}; mode?: "organize" | "organize_only" | "organize_for_debt";
  decisions?: typeof auroraDecisions; vault?: ReturnType<typeof auroraVault>; entities?: typeof auroraEntities; question?: string};
export function folderPacketInput(o: Options = {}): DocumentFolderInventoryPacketInput {
  const base = auroraFolderBasis({files: o.files, decisions: o.decisions, vault: o.vault, entities: o.entities}).seal();
  const t = o.turnTwo === true ? {} : o.turnTwo || null;
  const update = t ? auroraFolderUpdateBasis(base.envelope.fingerprint, t).seal() : null;
  return {schemaVersion: "document-folder-inventory-packet-input.v1", question: o.question ?? (t ? folderTurnTwoQuestion : folderQuestion), mode: o.mode ?? "organize",
    analysis: {base, update}} as DocumentFolderInventoryPacketInput;
}
const readings = (edit: (r: DocumentReading[]) => void) => {const r = auroraFolderReadings(); edit(r); return r;};
const file = (r: DocumentReading[], id: string) => r.find((x) => x.fileId === id)!;
/** A selector that fails is an observation, not a crash of the evaluation. */
const safe = (f: () => unknown) => {try {return JSON.stringify(f());} catch (e) {return `selector failed: ${e instanceof Error ? e.message.slice(0, 200) : "unknown"}`;}};
function observe(id: string, input: DocumentFolderInventoryPacketInput, expected: unknown, select: (p: Packet) => unknown): Case {
  const result = prepareDocumentFolderInventoryPacket(input), observed = safe(() => select(result)), expectation = JSON.stringify(expected);
  return {id, expectation, observed, inputFingerprint: fingerprint(input), outputFingerprint: fingerprint(result), passed: expectation === observed};
}
const inv = (p: Packet) => p.result.inventory!;
/** The rows as the answer key reads them; the file name is shown, never read. */
export const answerKeyMismatches = (p: Packet) => c09AnswerKey.flatMap((k, n) => {
  const r = inv(p).rows[n]!, ours = [r.fileName, r.description, r.entity, r.period, r.version, r.situationLabel, r.groupLabel, r.findingIds.length > 0];
  return ["arquivo", "tipo", "entidade", "periodo", "versao", "situacao", "grupo", "achado"].flatMap((field, i) => ours[i] === k[i] ? [] : [[k[0], field]]);
});
/** Everything but the names: the inventory with each file name and each copy's display line removed. */
const withoutNames = (p: Packet) => {const i = structuredClone(inv(p)); for (const r of i.rows) {r.fileName = "-"; if (r.situation.duplicateOf) r.description = "-";} return i;};

function goldCases(): Case[] {
  const base = () => folderPacketInput(), packet = prepareDocumentFolderInventoryPacket(base());
  const turnTwo = () => folderPacketInput({turnTwo: true}), second = prepareDocumentFolderInventoryPacket(turnTwo());
  const reuse = (id: string, expected: unknown, select: (p: Packet) => unknown, two = false): Case => {
    const p = two ? second : packet, observed = safe(() => select(p)), expectation = JSON.stringify(expected);
    return {id, expectation, observed, inputFingerprint: fingerprint(two ? turnTwo() : base()), outputFingerprint: fingerprint(p), passed: expectation === observed};
  };
  return [
    // Expectations come from the ficha's answer key and its conversation, declared before execution.
    // Review r1: a copy carries the reading of its original and shows the economic group as entity, as the key does.
    reuse("inventory-item-by-item-matches-the-answer-key", [], answerKeyMismatches),
    reuse("counts-30-1-2-3-2-21", Object.values(c09AnswerKeyCounts), (p) => {const c = inv(p).counts; return [c.files, c.duplicates, c.incompleteReadings, c.superseded, c.inVault, c.withFinding];}),
    reuse("copy-found-by-hash", {copy: "f30", of: "f01", vault: [["f18", "cofre-escritura-2021"], ["f20", "cofre-ccb-bradesco"]]},
      (p) => ({copy: inv(p).rows.find((r) => r.situation.duplicateOf)!.fileId, of: inv(p).rows.find((r) => r.situation.duplicateOf)!.situation.duplicateOf,
        vault: inv(p).rows.filter((r) => r.situation.inVault).map((r) => [r.fileId, r.situation.inVault])})),
    reuse("versions-resolved-none-deleted", [["audited_over_draft", ["f01"], ["f02"], []], ["side_by_side", [], [], ["f13", "f14"]],
      ["later_position", ["f16"], ["f17"], []], ["effective_text", ["f18", "f19"], [], []], ["later_version", ["f10"], ["f09"], []]], (p) => p.readings!.versions.map((v) => [v.resolution, v.prevails, v.superseded, v.sideBySide])),
    reuse("amendment-is-the-text-in-force", {texts: [["deb-aurora-1", [["financial_covenant", "f19"], ["negative_pledge", "f19"]]]], original: "Na versão original, o covenant é de 2,75x e não há exceção de valor na garantia negativa. Ler sempre com o aditamento."},
      (p) => ({texts: inv(p).effectiveTexts.map((t) => [t.instrumentRef, t.clauses.map((c) => [c.type, c.fileId])]), original: inv(p).findings.find((f) => f.id === "f18-amended")!.statement})),
    reuse("seven-decision-findings-in-order-with-source", [["f19-amendment", ["plano-financiamento-2027"], ["f19", "f18"]], ["f24-politica", ["plano-financiamento-2027"], ["f24"]],
      ["f22-cessao", ["plano-financiamento-2027"], ["f22"]], ["f23-renovacao", ["linha-embalagem"], ["f23"]], ["f16-debt-total", ["plano-financiamento-2027"], ["f16"]],
      ["f02-draft", ["plano-financiamento-2027"], ["f02", "f01"]], ["f04-subsidiary", ["plano-financiamento-2027"], ["f04"]]],
      (p) => inv(p).decisionFindings!.map((d) => [d.findingId, d.decisionIds, d.sources.map((s) => s.fileId)])),
    reuse("debt-is-130-not-140", {reported: "140000000", recomposed: "130000000", reason: "unused_limit_counted"},
      (p) => {const c = inv(p).identityChecks.find((x) => x.kind === "reported_total")!; return {reported: c.reported, recomposed: c.recomposed, reason: c.reason};}),
    reuse("unreadable-page-and-photo-not-invented", {ccb: ["partial", [7]], photo: "unreadable", sourcedOnPage7: 0, photoFindings: ["file_unreadable"]},
      (p) => ({ccb: [inv(p).rows[19]!.situation.read, inv(p).rows[19]!.situation.unreadablePages], photo: inv(p).rows[28]!.situation.read,
        sourcedOnPage7: inv(p).findings.filter((f) => f.code !== "page_unreadable" && f.sources.some((s) => s.fileId === "f20" && s.page === 7)).length,
        photoFindings: inv(p).findings.filter((f) => f.anchor === "f29").map((f) => f.code)})),
    reuse("gaps-by-purpose-in-the-key-order", [["monthly_series", "f11", ["inventario", "plano-financiamento-2027"]], ["reading_substitute", "f20", ["inventario", "plano-financiamento-2027"]],
      ["real_collateral", "f27", ["plano-financiamento-2027"]], ["group_perimeter", "f04", ["plano-financiamento-2027"]], ["liquidity_projection", "f15", ["plano-financiamento-2027"]]],
      (p) => inv(p).gaps.map((g) => [g.need, inv(p).findings.find((f) => f.id === g.findingId)?.anchor ?? null, g.purposes])),
    reuse("one-question-only-the-user-knows", ["A minuta das demonstrações de 2025 foi enviada a algum banco? Se foi, vale mandar a versão auditada com uma nota sobre a diferença."], (p) => p.readings!.questions),
    reuse("no-numeric-analysis-nothing-validated", {numeric: "none", validated: false, rowsValidated: 0, exclusions: ["ratio_calculation", "projection", "recommendation", "document_validation", "third_party_distribution"]},
      (p) => ({numeric: p.readings!.numericAnalysis, validated: p.readings!.documentsValidated, rowsValidated: inv(p).rows.filter((r) => (r.validated as boolean) !== false).length, exclusions: p.exclusions})),
    observe("renaming-every-file-changes-nothing", folderPacketInput({files: readings((r) => r.forEach((x, n) => {x.fileName = `arquivo-${String(n).padStart(2, "0")}.bin`;}))}), true,
      (p) => JSON.stringify(withoutNames(p)) === JSON.stringify(withoutNames(packet))),
    observe("misleading-names-do-not-move-the-version", folderPacketInput({files: readings((r) => {const a = file(r, "f01"), b = file(r, "f02"); [a.fileName, b.fileName] = [b.fileName, a.fileName];})}),
      {prevails: ["f01"], superseded: ["f02"]}, (p) => {const v = p.readings!.versions[0]!; return {prevails: v.prevails, superseded: v.superseded};}),
    observe("later-draft-does-not-beat-the-audited", folderPacketInput({files: readings((r) => {const d = file(r, "f02"); d.version.lastUpdated = "2026-08-30"; r.splice(r.indexOf(d), 1); r.unshift(d);})}),
      {prevails: ["f01"], reason: "audited_over_draft"}, (p) => ({prevails: p.readings!.versions[0]!.prevails, reason: p.readings!.versions[0]!.resolution})),
    reuse("turn-2-updates-only-the-affected-rows", {updated: ["f20"], added: ["s02"], preserved: 29, ccb: "lida; já estava no cofre",
      preservedBytes: true}, (p) => ({updated: p.readings!.update!.rowsUpdated, added: p.readings!.update!.rowsAdded, preserved: p.readings!.update!.rowsPreserved,
      ccb: inv(p).rows.find((r) => r.fileId === "f20")!.situationLabel,
      preservedBytes: inv(p).rows.filter((r) => !["f20", "s02"].includes(r.fileId)).every((r, n) => JSON.stringify(r) === JSON.stringify(p.result.priorInventory!.rows.filter((x) => x.fileId !== "f20")[n]))}), true),
    reuse("turn-2-page-7-read-and-semester-closes-month-by-month", {page7: [{statement: "Cláusula lida na cópia legível da página 7.", quoted: {fileId: "s01", page: 7, section: null, text: "A página 7 prevê reforço da cessão em cinco dias úteis se a cobertura cair abaixo de 80% e não restringe o pré-pagamento previsto na cláusula 9."}}],
      months: [{id: "f12-months", status: "matches", reported: "27000000", recomposed: "27000000"}]}, (p) => ({page7: p.readings!.update!.newFindings, months: p.readings!.update!.identityChecks}), true),
    reuse("turn-2-informed-fact-with-author-and-date", {informed: [{statement: "A minuta não foi para nenhum banco.", author: "Controller da Aurora", date: "2026-09-02"}], questions: [],
      stillOpen: ["Matrícula atualizada do imóvel avaliado no laudo", "Projeção ou fluxo de caixa de 13 semanas atualizado"]},
      (p) => ({informed: p.readings!.update!.informed, questions: p.readings!.questions, stillOpen: p.readings!.update!.stillOpen}), true),
    observe("variation-organize-only", folderPacketInput({mode: "organize_only", question: "Só organiza, não analisa ainda."}),
      {decisionFindings: null, generalFindings: null, clauseObservations: ["f22-cessao", "f23-renovacao", "f24-politica"], gaps: ["monthly_series", "reading_substitute"]},
      (p) => ({decisionFindings: p.readings!.decisionFindings, generalFindings: p.readings!.generalFindings,
        clauseObservations: inv(p).findings.filter((f) => f.code === "clause" && f.effect).map((f) => f.id), gaps: inv(p).gaps.map((g) => g.need)})),
    observe("variation-for-the-debt-discussion", folderPacketInput({mode: "organize_for_debt", question: "Organiza o material para discutirmos a dívida."}),
      {firstGroup: "Dívida", highlighted: ["instrument:deb-aurora-1"], first: ["f19-amendment", ["discussao-divida", "plano-financiamento-2027"]]},
      (p) => ({firstGroup: inv(p).groups[0]!.label, highlighted: p.readings!.versions.filter((v) => v.highlighted).map((v) => v.familyId),
        first: [inv(p).decisionFindings![0]!.findingId, inv(p).decisionFindings![0]!.decisionIds]})),
    observe("variation-empty-vault-no-decisions", folderPacketInput({vault: [], decisions: []}),
      {inVault: 0, decisionFindings: null, general: ["version_conflict", "binding_limit", "collateral_restriction", "deadline", "policy_limit", "figure_correction", "perimeter"],
        uses: ["bank-material", "debt-analysis", "projection"]},
      (p) => ({inVault: inv(p).counts.inVault, decisionFindings: inv(p).decisionFindings, general: inv(p).generalFindings!.map((g) => g.effect),
        uses: [...new Set(inv(p).gaps.flatMap((g) => g.purposes).filter((x) => x !== "inventario"))].sort()})),
    observe("variation-several-companies", folderPacketInput({files: readings((r) => r.push({...structuredClone(file(r, "f03")), fileId: "f31", fileName: "balanco serra.pdf", sha256: "a".repeat(64),
      description: "Demonstrações financeiras auditadas", entity: {primaryId: "pastificio-serra", label: "Pastifício Serra Ltda."}}))}),
      {partitioned: true, partitions: ["aurora", "pastificio-serra", "nao-identificada"], question: ["Há documentos de uma empresa que não está no cadastro da companhia. Ela entra no perímetro deste trabalho?", ["f31"]]},
      (p) => ({partitioned: inv(p).partitionByEntity, partitions: [...new Set(inv(p).groups.map((g) => g.partition))], question: [p.readings!.questions[0], inv(p).questions[0]!.fileIds]})),
    // Review r1 cases.
    observe("unresolved-month-blocks-the-semester-sum", folderPacketInput({turnTwo: true, files: readings((r) => {file(r, "f09").version.ordinal = null; file(r, "f10").version.ordinal = null;})}),
      {status: "not_run", reason: "conflict:unresolved_versions:2026-05", recomposed: null},
      (p) => {const c = inv(p).identityChecks.find((x) => x.kind === "period_against_months")!; return {status: c.status, reason: c.reason, recomposed: c.recomposed};}),
    observe("draft-amendment-changes-no-term", folderPacketInput({files: readings((r) => {file(r, "f19").version = {label: "minuta não assinada", status: "draft", ordinal: null, lastUpdated: null};})}),
      {effectiveTexts: [], finding: "amendment_not_in_force", decisionFindings: 6, policy: "Política de no máximo 2,5x."},
      (p) => ({effectiveTexts: inv(p).effectiveTexts, finding: inv(p).findings.find((f) => f.anchor === "f19")!.code, decisionFindings: inv(p).decisionFindings!.length,
        policy: inv(p).findings.find((f) => f.id === "f24-politica")!.statement})),
    observe("replaced-notice-is-history-not-a-deadline", folderPacketInput({files: readings((r) => r.push({...structuredClone(file(r, "f23")), fileId: "f31", fileName: "aditivo embalagem.pdf", sha256: "b".repeat(64),
      description: "Aditivo ao contrato de fornecimento de embalagem", period: {label: "ago/2026", start: "2026-08-01", end: "2026-08-31"}, instrument: {ref: "contrato-embalagem-ad1", label: "contrato de embalagem", amends: "contrato-embalagem"},
      clauses: [{type: "auto_renewal", id: "renovacao", at: {page: 1, section: null}, statement: "Renovação automática em dez/26 salvo aviso até 2/nov/26.", termEnd: "2026-12-31", noticeDeadline: "2026-11-02"}]}))}),
      {deadlines: [["f31", "2026-11-02"]], history: "clause_superseded", active: ["f31-renovacao"]},
      (p) => ({deadlines: inv(p).followUps.flatMap((f) => f.kind === "notice_deadline" ? [[f.fileId, f.date]] : []), history: inv(p).findings.find((f) => f.id === "f23-renovacao-superseded")!.code,
        active: inv(p).decisionFindings!.filter((d) => d.effect === "deadline").map((d) => d.findingId)})),
    observe("same-hash-read-two-ways-is-declared", folderPacketInput({files: readings((r) => {const c = file(r, "f30"); c.kind = "debt_schedule"; c.entity = {primaryId: "outra", label: "Outra empresa"};})}),
      {conflicts: [["f01", "f30"]], status: "partial", rows: ["conflicted", "conflicted"], draftFinding: false, decisionFindings: 5},
      (p) => ({conflicts: inv(p).readingConflicts.map((c) => c.fileIds), status: p.status, rows: [inv(p).rows[0]!.situation.read, inv(p).rows[29]!.situation.read],
        draftFinding: inv(p).findings.some((f) => f.code === "draft_superseded"), decisionFindings: inv(p).decisionFindings!.length})),
    // Review r2 cases; the general rules are also checked over generated combinations in document-folder-inventory.properties.test.ts.
    observe("approved-amendment-is-not-in-force", folderPacketInput({files: readings((r) => {file(r, "f19").version = {label: "aprovado, aguardando assinatura e registro", status: "approved", ordinal: null, lastUpdated: null};})}),
      {effectiveTexts: [], code: "amendment_not_in_force", policy: "Política de no máximo 2,5x."},
      (p) => ({effectiveTexts: inv(p).effectiveTexts, code: inv(p).findings.find((f) => f.anchor === "f19")!.code, policy: inv(p).findings.find((f) => f.id === "f24-politica")!.statement})),
    observe("tied-amendments-have-no-winner", folderPacketInput({files: readings((r) => r.push({...structuredClone(file(r, "f19")), fileId: "f31", fileName: "aditamento b.pdf", sha256: "c".repeat(64),
      instrument: {ref: "deb-aurora-1-ad1b", label: "aditamento", amends: "deb-aurora-1"},
      clauses: [{type: "financial_covenant", id: "covenant", at: {page: 2, section: null}, statement: "Dívida líquida / EBITDA de no máximo 3,5x.", metric: "net_debt_to_ebitda", maxRatio: "3.5"}]}))}),
      {conflicts: [{type: "financial_covenant", fileIds: ["f19", "f31"]}], covenantInForce: false, policy: "Política de no máximo 2,5x."},
      (p) => ({conflicts: inv(p).effectiveTexts[0]!.conflicts, covenantInForce: inv(p).effectiveTexts[0]!.clauses.some((c) => c.type === "financial_covenant"),
        policy: inv(p).findings.find((f) => f.id === "f24-politica")!.statement})),
    observe("later-cut-is-the-covenant-in-force", folderPacketInput({files: readings((r) => r.push({...structuredClone(file(r, "f19")), fileId: "f31", fileName: "2o aditamento.pdf", sha256: "d".repeat(64),
      period: {label: "jun/2024", start: "2024-06-01", end: "2024-06-30"}, instrument: {ref: "deb-aurora-1-ad2", label: "2º aditamento", amends: "deb-aurora-1"},
      clauses: [{type: "financial_covenant", id: "covenant", at: {page: 2, section: null}, statement: "Dívida líquida / EBITDA de no máximo 2,8x.", metric: "net_debt_to_ebitda", maxRatio: "2.8"}]}))}),
      {headline: ["f31-amendment"], cut: true, f19: ["amendment_in_force", true, false]},
      (p) => {const h = inv(p).decisionFindings!.filter((d) => /O covenant .* é o do aditamento/.test(d.statement)), f19 = inv(p).findings.find((f) => f.id === "f19-amendment")!;
        return {headline: h.map((d) => d.findingId), cut: h[0]!.statement.includes("O texto anterior dizia que o covenant é de 3,0x; o aditamento reduziu o covenant para 2,8x"),
          f19: [f19.code, f19.statement.includes("fixava o covenant em 3,0x, substituído pelo texto vigente do aditamento de junho de 2024"), f19.decisionStatement?.includes("covenant") ?? false]};}),
    // Review r3 cases: one precedence, the text in force in two steps, identity for every file, pages within the file.
    observe("substitutes-of-one-hash-read-two-ways-are-suspended", folderPacketInput({turnTwo: {files: [...auroraTurnTwoReadings(), {...auroraTurnTwoReadings()[0]!, fileId: "s03",
      clauses: [{type: "collateral_top_up", id: "reforco", at: {page: 7, section: null}, statement: "A página 7 dispensa reforço da cessão."}]}]}}),
      {ccb: "partial", conflicts: [[null, ["s01", "s03"]]]}, (p) => ({ccb: inv(p).rows.find((r) => r.fileId === "f20")!.situation.read, conflicts: inv(p).readingConflicts.map((c) => [c.page, c.fileIds])})),
    observe("text-only-tie-is-a-conflict", folderPacketInput({files: readings((r) => {for (const [id, text] of [["f31", "Pré-pagamento livre."], ["f32", "Pré-pagamento vedado."]] as const) r.push({...structuredClone(file(r, "f19")), fileId: id, fileName: `${id}.pdf`,
      sha256: createHash("sha256").update(id).digest("hex"), period: {label: "jun/2024", start: "2024-06-01", end: "2024-06-30"}, instrument: {ref: `deb-${id}`, label: "aditamento", amends: "deb-aurora-1"},
      clauses: [{type: "prepayment", id: "pp", at: {page: 1, section: null}, statement: text}]});})}),
      [{type: "prepayment", fileIds: ["f31", "f32"]}], (p) => inv(p).effectiveTexts[0]!.conflicts),
    observe("conflict-resolved-later-is-history", folderPacketInput({files: readings((r) => {for (const [id, ratio, ym] of [["f31", "3.5", "2023-06"], ["f32", "2.8", "2024-06"]] as const) r.push({...structuredClone(file(r, "f19")), fileId: id, fileName: `${id}.pdf`,
      sha256: createHash("sha256").update(id).digest("hex"), period: {label: ym, start: `${ym}-01`, end: `${ym}-30`}, instrument: {ref: `deb-${id}`, label: "aditamento", amends: "deb-aurora-1"},
      clauses: [{type: "financial_covenant", id: "covenant", at: {page: 2, section: null}, statement: `Dívida líquida / EBITDA de no máximo ${ratio.replace(".", ",")}x.`, metric: "net_debt_to_ebitda", maxRatio: ratio}]});})}),
      {inForce: "f32", currentConflicts: [], history: [false, false], open: []},
      (p) => ({inForce: inv(p).effectiveTexts[0]!.clauses.find((c) => c.type === "financial_covenant")?.fileId ?? null, currentConflicts: inv(p).effectiveTexts[0]!.conflicts,
        history: ["f19", "f31"].map((id) => inv(p).findings.find((f) => f.id === `${id}-amendment`)!.changes!.find((c) => c.type === "financial_covenant")!.current),
        open: inv(p).findings.filter((f) => f.code === "amendment_conflict").map((f) => f.id)})),
    observe("competing-originals-without-winner", folderPacketInput({files: readings((r) => r.push({...structuredClone(file(r, "f18")), fileId: "f31", fileName: "f31.pdf", sha256: createHash("sha256").update("f31").digest("hex"),
      clauses: file(r, "f18").clauses.map((c) => c.type === "financial_covenant" ? {...c, maxRatio: "4", statement: "Dívida líquida / EBITDA de no máximo 4,0x."} : c)}))}),
      {effectiveTexts: [], conflict: true, f19: "amendment_not_in_force", ids: true},
      (p) => ({effectiveTexts: inv(p).effectiveTexts, conflict: inv(p).findings.some((f) => f.code === "instrument_conflict"), f19: inv(p).findings.find((f) => f.anchor === "f19")!.code,
        ids: new Set(inv(p).findings.map((f) => f.id)).size === inv(p).findings.length})),
    observe("position-tie-broken-by-version", folderPacketInput({files: readings((r) => {file(r, "f16").version.ordinal = 1;
      r.push({...structuredClone(file(r, "f16")), fileId: "f31", fileName: "f31.xlsx", sha256: createHash("sha256").update("f31").digest("hex"), version: {label: "v2", status: "management", ordinal: 2, lastUpdated: null}});})}),
      {prevails: ["f31"], superseded: ["f16", "f17"], f16: "lida; superada pela v2", f17: "lida; superada"},
      (p) => {const f = inv(p).families.find((x) => x.id === "debt_schedule:aurora")!; return {prevails: f.prevails, superseded: f.superseded,
        f16: inv(p).rows.find((x) => x.fileId === "f16")!.situationLabel, f17: inv(p).rows.find((x) => x.fileId === "f17")!.situationLabel};}),
    observe("covenant-without-its-limit-text-has-no-effect", folderPacketInput({files: readings((r) => {file(r, "f19").clauses[0]!.statement = "Altera o índice financeiro da cláusula 2.";})}),
      {observation: true, covenantFrom: null, headline: false}, (p) => ({observation: inv(p).findings.some((f) => f.id === "f19-covenant-unanchored" && f.effect === null),
        covenantFrom: inv(p).effectiveTexts[0]!.clauses.find((c) => c.type === "financial_covenant")?.fileId ?? null,
        headline: inv(p).decisionFindings!.some((d) => d.statement.includes("é o do aditamento") && d.statement.includes("covenant para"))})),
    // Review r4 cases: precedence as a filter, two clauses in one file, recovered pages before force, unread predecessor, future effect.
    observe("two-covenants-in-one-amendment-are-a-conflict", folderPacketInput({files: readings((r) => file(r, "f19").clauses.push({type: "financial_covenant", id: "covenant-2", at: {page: 4, section: null}, statement: "Dívida líquida / EBITDA de no máximo 4,0x.", metric: "net_debt_to_ebitda", maxRatio: "4"}))}),
      {covenantInForce: false, conflict: true}, (p) => ({covenantInForce: inv(p).effectiveTexts[0]!.clauses.some((c) => c.type === "financial_covenant"), conflict: inv(p).findings.some((f) => f.code === "clause_conflict")})),
    observe("recovered-covenant-joins-the-text-in-force", folderPacketInput({turnTwo: {files: auroraTurnTwoReadings().map((x) => x.fileId === "s01" ? {...x, clauses: [{type: "financial_covenant" as const, id: "covenant-ccb", at: {page: 7, section: null}, statement: "Dívida líquida / EBITDA de no máximo 2,0x.", metric: "net_debt_to_ebitda" as const, maxRatio: "2"}]} : x)}}),
      "Política de no máximo 2,5x, igual ou acima do covenant vigente de 2,0x.", (p) => inv(p).findings.find((f) => f.id === "f24-politica")!.statement),
    observe("recovered-notice-does-not-revive-a-replaced-deadline", folderPacketInput({files: readings((r) => {const c = file(r, "f23"); c.clauses = c.clauses.filter((x) => x.type !== "auto_renewal");
      c.legibility = {pageCount: 12, unreadablePages: [{page: 11, reason: "illegible_scan", expectedContent: null, expectedFrom: null}], wholeFile: null};
      r.push({...structuredClone(c), fileId: "f31", fileName: "f31.pdf", sha256: createHash("sha256").update("f31").digest("hex"), legibility: {pageCount: null, unreadablePages: [], wholeFile: null},
        period: {label: "ago/2026", start: "2026-08-01", end: "2026-08-31"}, instrument: {ref: "contrato-embalagem-ad", label: "aditivo", amends: "contrato-embalagem"},
        clauses: [{type: "auto_renewal", id: "renovacao", at: {page: 1, section: null}, statement: "Renovação automática salvo aviso até 2/nov/26.", termEnd: "2026-12-31", noticeDeadline: "2026-11-02"}]});
      r.push({...structuredClone(auroraTurnTwoReadings()[0]!), fileId: "p1", fileName: "p1.pdf", sha256: createHash("sha256").update("p1").digest("hex"), kind: "supplier_contract",
        ...structuredClone({entity: c.entity, period: c.period, version: c.version, referenceDate: c.referenceDate}),
        instrument: {ref: "contrato-embalagem", label: "contrato", amends: null}, substitutesPages: {instrumentRef: "contrato-embalagem", pages: [11]},
        clauses: [{type: "auto_renewal", id: "renovacao", at: {page: 11, section: null}, statement: "Renovação automática salvo aviso até 2/out/26.", termEnd: "2026-12-31", noticeDeadline: "2026-10-02"}]});})}),
      {deadlines: [["f31", "2026-11-02"]], history: "clause_superseded"}, (p) => ({deadlines: inv(p).followUps.flatMap((f) => f.kind === "notice_deadline" ? [[f.fileId, f.date]] : []),
        history: inv(p).findings.find((f) => f.id === "f23-p1:renovacao-superseded")!.code})),
    observe("unread-predecessor-is-not-absent", folderPacketInput({files: readings((r) => {const e = file(r, "f18"); e.clauses = e.clauses.filter((c) => c.type !== "financial_covenant");
      e.legibility = {pageCount: 30, unreadablePages: [{page: 18, reason: "illegible_scan", expectedContent: "o covenant financeiro", expectedFrom: {page: 2, section: null}}], wholeFile: null};})}),
      {covenantHeadline: false, change: false, blocked: "unread"}, (p) => ({covenantHeadline: inv(p).decisionFindings!.some((d) => /O covenant .* é o do aditamento/.test(d.statement)),
        change: inv(p).findings.some((f) => f.id === "f19-amendment"), blocked: inv(p).findings.find((f) => f.id === "f18-blocked-text-in-force")?.knowledge ?? null})),
    observe("future-amendment-is-not-current", folderPacketInput({files: readings((r) => {file(r, "f19").period = {label: "jan/2027", start: "2027-01-01", end: "2027-01-31"};})}),
      {future: [{fileId: "f19", from: "2027-01-01"}], covenantFrom: null, policy: "Política de no máximo 2,5x."},
      (p) => ({future: inv(p).effectiveTexts[0]!.future, covenantFrom: inv(p).effectiveTexts[0]!.clauses.find((c) => c.type === "financial_covenant")?.fileId ?? null,
        policy: inv(p).findings.find((f) => f.id === "f24-politica")!.statement})),
    // Review r5 cases: the state of knowledge of a source reaches everything that depends on it.
    observe("unread-substitutive-clause-keeps-no-limit-in-force", folderPacketInput({files: readings((r) => {const c = file(r, "f19"); c.clauses = c.clauses.filter((x) => x.type !== "financial_covenant");
      c.legibility = {pageCount: 4, unreadablePages: [{page: 2, reason: "illegible_scan", expectedContent: "a cláusula de covenant substitutiva", expectedFrom: {page: 1, section: null}}], wholeFile: null};})}),
      {covenantInForce: false, knowledge: "unread", policy: "Política de no máximo 2,5x."},
      (p) => ({covenantInForce: inv(p).effectiveTexts[0]!.clauses.some((c) => c.type === "financial_covenant"), knowledge: inv(p).effectiveTexts[0]!.knowledge,
        policy: inv(p).findings.find((f) => f.id === "f24-politica")!.statement})),
    observe("page-copies-differing-in-the-debt-table-leave-the-page-unread", folderPacketInput({turnTwo: {files: [...auroraTurnTwoReadings(), {...auroraTurnTwoReadings()[0]!, fileId: "s04", sha256: createHash("sha256").update("s04").digest("hex"),
      debtTable: {lines: [{id: "x", lineKind: "other" as const, label: "Linha", drawn: "150", limit: null, counted: "150"}], reportedTotal: "150", scale: "1", at: {page: 7, section: null}}}]}}),
      {ccb: "partial", conflict: [[7, ["s01", "s04"]]]}, (p) => ({ccb: inv(p).rows.find((r) => r.fileId === "f20")!.situation.read, conflict: inv(p).readingConflicts.map((c) => [c.page, c.fileIds])})),
    observe("amendment-without-a-read-original-has-no-deadline", folderPacketInput({files: readings((r) => {file(r, "f23").instrument = {ref: "contrato-embalagem-ad", label: "aditivo", amends: "contrato-ausente"};})}),
      {deadlines: [], finding: "amendment_without_original"}, (p) => ({deadlines: inv(p).followUps.filter((f) => f.kind === "notice_deadline"), finding: inv(p).findings.find((f) => f.anchor === "f23")!.code})),
    observe("future-board-minutes-have-no-effect", folderPacketInput({files: readings((r) => {file(r, "f24").period = {label: "jan/2027", start: "2027-01-01", end: "2027-01-31"};})}),
      {policy: false, future: true}, (p) => ({policy: inv(p).findings.some((f) => f.id === "f24-politica"), future: inv(p).findings.some((f) => f.id === "f24-blocked-clauses" && f.knowledge === "future")})),
    observe("concurrent-values-of-one-metric-are-a-conflict", folderPacketInput({turnTwo: true, files: readings((r) => {file(r, "f11").figures.push({id: "ebitda-2", metric: "ebitda", value: "6800000", scale: "1", at: {page: null, section: "Outra aba"}});})}),
      {check: "not_run", conflict: true}, (p) => ({check: inv(p).identityChecks.find((c) => c.id === "f12-months")!.status, conflict: inv(p).findings.some((f) => f.code === "figure_conflict" && f.anchor === "f11")})),
    // Review r6 cases: one guard over every dependency of every effect.
    observe("side-by-side-is-for-budgets-only", folderPacketInput({turnTwo: true, files: readings((r) => {file(r, "f09").version = {label: "aprovado", status: "approved", ordinal: null, lastUpdated: null};
      file(r, "f10").version = {label: "revisão", status: "working_revision", ordinal: null, lastUpdated: null};})}),
      // Trial balances are not kept side by side: the approved version prevails by guarantee, and only it is summed.
      {resolution: "higher_assurance", prevails: ["f09"], check: "differs"}, (p) => {const f = inv(p).families.find((x) => x.id.startsWith("trial_balance"))!;
        return {resolution: f.resolution, prevails: f.prevails, check: inv(p).identityChecks.find((c) => c.id === "f12-months")!.status};}),
    observe("future-position-blocks-the-debt-check", folderPacketInput({files: readings((r) => {file(r, "f16").period = {label: "jun/27", start: "2027-06-30", end: "2027-06-30"};})}),
      {check: "not_run", reason: "future", correction: false}, (p) => ({check: inv(p).identityChecks.find((c) => c.kind === "reported_total")!.status,
        reason: inv(p).identityChecks.find((c) => c.kind === "reported_total")!.reason, correction: inv(p).findings.some((f) => f.effect === "figure_correction")})),
    observe("unreadable-original-blocks-the-text-in-force", folderPacketInput({files: readings((r) => {const e = file(r, "f18"); e.clauses = []; e.legibility = {pageCount: null, unreadablePages: [], wholeFile: {reason: "no_extractable_content"}};})}),
      {clauses: [], knowledge: "unread", binding: false}, (p) => ({clauses: inv(p).effectiveTexts[0]!.clauses, knowledge: inv(p).effectiveTexts[0]!.knowledge,
        binding: inv(p).findings.some((f) => f.effect === "binding_limit")})),
    // Review r7 cases: dates after the reading, recovered pages under the copy's worst state, comparisons withheld whole, update not read.
    observe("update-after-the-reading-date-is-future", folderPacketInput({files: readings((r) => {file(r, "f16").version.lastUpdated = "2027-01-15";})}),
      {check: "not_run", reason: "future"}, (p) => {const c = inv(p).identityChecks.find((x) => x.kind === "reported_total")!; return {check: c.status, reason: c.reason};}),
    observe("copy-with-its-own-conflict-does-not-complete-the-page", folderPacketInput({turnTwo: {files: auroraTurnTwoReadings().map((x) => x.fileId === "s01" ? {...x, clauses: [...x.clauses,
      {type: "collateral_top_up" as const, id: "reforco-2", at: {page: 7, section: null}, statement: "A página 7 dispensa o reforço da cessão."}]} : x)}}),
      {ccb: "partial", blocked: "conflict"}, (p) => ({ccb: inv(p).rows.find((r) => r.fileId === "f20")!.situation.read, blocked: inv(p).findings.find((f) => f.id === "f20-blocked-page-7")?.knowledge ?? null})),
    observe("comparison-without-both-operands-is-withheld", folderPacketInput({files: readings((r) => {for (const id of ["f01", "f30"]) file(r, id).figures = file(r, id).figures.filter((x) => x.metric !== "gross_revenue");})}),
      {finding: false, blocked: "missing_source"}, (p) => ({finding: inv(p).findings.some((f) => f.code === "figure_basis_differs"), blocked: inv(p).findings.find((f) => f.id === "f28-blocked-revenue-receita")?.knowledge ?? null})),
    observe("update-not-read-shows-the-prior-as-history", (() => {const i = folderPacketInput({turnTwo: true});
      i.analysis.update = {...i.analysis.update!, files: i.analysis.update!.files.map((f) => f.id === "s02" ? {...f, value: {...f.value, decisionId: null, missingReason: "Leitura do balancete de março pendente"}} : f)}; return i;})(),
      {status: "partial", historical: "update_not_read", decisionFindings: null}, (p) => ({status: p.status, historical: p.readings!.historical?.reason ?? null, decisionFindings: p.readings!.decisionFindings})),
    // Review r8 cases: exact periods, the copy's own force, existence judged.
    observe("partial-period-is-not-summed", folderPacketInput({turnTwo: true, files: readings((r) => {file(r, "f12").period = {label: "1S26", start: "2026-01-02", end: "2026-06-30"};})}),
      {status: "not_run", reason: "partial_period"}, (p) => {const c = inv(p).identityChecks.find((x) => x.kind === "period_against_months")!; return {status: c.status, reason: c.reason};}),
    observe("draft-copy-does-not-fill-the-page", folderPacketInput({turnTwo: {files: auroraTurnTwoReadings().map((x) => x.fileId === "s01" ? {...x, version: {...x.version, status: "draft" as const}} : x)}}),
      {ccb: "partial", cause: "unread"}, (p) => ({ccb: inv(p).rows.find((r) => r.fileId === "f20")!.situation.read, cause: inv(p).findings.find((f) => f.code === "substitute_not_binding")?.knowledge ?? null})),
    observe("future-parent-statements-of-another-period-block-the-perimeter", folderPacketInput({files: readings((r) => {for (const id of ["f01", "f02", "f30"]) r.splice(r.indexOf(file(r, id)), 1); file(r, "f03").version.lastUpdated = "2027-01-15";})}),
      {perimeter: false, blocked: "future"}, (p) => ({perimeter: inv(p).findings.some((f) => f.effect === "perimeter"), blocked: inv(p).findings.find((f) => f.id === "f04-blocked-perimeter")?.knowledge ?? null})),
    // Review r9 case: the page is judged after every recovered page is gathered with the target's own.
    observe("recovered-page-read-against-another-page-leaves-the-row-partial", folderPacketInput({files: readings((r) => {file(r, "f20").clauses.push({type: "financial_covenant" as const, id: "covenant-ccb", at: {page: 6, section: null}, statement: "Dívida líquida / EBITDA de no máximo 3,0x.", metric: "net_debt_to_ebitda" as const, maxRatio: "3.0"});}),
      turnTwo: {files: auroraTurnTwoReadings().map((x) => x.fileId === "s01" ? {...x, clauses: [...x.clauses, {type: "financial_covenant" as const, id: "covenant-ccb-7", at: {page: 7, section: null}, statement: "Dívida líquida / EBITDA de no máximo 1,0x.", metric: "net_debt_to_ebitda" as const, maxRatio: "1.0"}]} : x)}}),
      {ccb: "partial", conflict: "conflict", inForce: false}, (p) => ({ccb: inv(p).rows.find((r) => r.fileId === "f20")!.situation.read,
        conflict: inv(p).findings.find((f) => f.id === "f20-substitute-conflict-p7")?.knowledge ?? null, inForce: inv(p).findings.find((f) => f.id === "f24-politica")?.statement.includes("covenant vigente") ?? false})),
    // Review r10 cases: a recovered page joins the document whole; an update records the new precedence of its family.
    observe("recovered-table-and-note-join-the-document", folderPacketInput({turnTwo: {files: auroraTurnTwoReadings().map((x) => x.fileId === "s01" ? {...x,
      observations: [{id: "nota", at: {page: 7, section: null}, topic: "other" as const, statement: "Garantia por cessão fiduciária de recebíveis."}],
      debtTable: {lines: [{id: "ccb", lineKind: "bank_credit" as const, label: "CCB", drawn: "30", limit: null, counted: "30"}], reportedTotal: "30", scale: "1000000" as const, at: {page: 7, section: null}}} : x)}}),
      {check: "matches", documentary: {fileId: "s01", page: 7}}, (p) => ({check: inv(p).identityChecks.find((c) => c.id === "f20-reported-total")?.status ?? null,
        documentary: (({fileId, page}) => ({fileId, page}))(p.readings!.documentary.find((d) => d.findingId === "f20-s01:nota")!)})),
    observe("new-version-in-the-update-supersedes-the-prior-winner", folderPacketInput({turnTwo: {files: [...auroraTurnTwoReadings(), {...structuredClone(file(auroraFolderReadings(), "f10")), fileId: "s03",
      fileName: "balancete mai26 v3.xlsx", sha256: createHash("sha256").update("s03").digest("hex"), version: {label: "versão 3", status: "closed" as const, ordinal: 3, lastUpdated: null}}]}}),
      {f10: "lida; superada pela v3", updated: ["f09", "f10", "f20"], added: ["s02", "s03"]}, (p) => ({f10: inv(p).rows.find((r) => r.fileId === "f10")!.situationLabel, updated: inv(p).update!.rowsUpdated, added: inv(p).update!.rowsAdded})),
    // Review r11 cases: canonical pages, findings to history on update, source identity of gathered items.
    observe("equivalent-copies-in-another-order-agree", folderPacketInput({turnTwo: {files: (() => {const [s01, s02] = auroraTurnTwoReadings();
      const items = [...s01!.clauses, {type: "prepayment" as const, id: "pre-pagamento", at: {page: 7, section: null}, statement: "Pré-pagamento conforme a cláusula 9."}];
      return [{...s01!, clauses: items}, {...structuredClone(s01!), fileId: "s05", fileName: "ccb-p7-outra-copia.pdf", sha256: createHash("sha256").update("s05").digest("hex"),
        clauses: [...items].reverse().map((c) => ({...c, id: `${c.id}-b`}))}, s02!];})()}}),
      {ccb: "complete", conflict: false}, (p) => ({ccb: inv(p).rows.find((r) => r.fileId === "f20")!.situation.read, conflict: inv(p).findings.some((f) => f.code === "substitute_conflict")})),
    observe("new-debt-position-passes-the-old-total-to-history", folderPacketInput({turnTwo: {files: [...auroraTurnTwoReadings(), (() => {const f16 = file(auroraFolderReadings(), "f16");
      return {...structuredClone(f16), fileId: "s03", fileName: "tabela de divida jul26.xlsx", sha256: createHash("sha256").update("s03-jul").digest("hex"), period: {label: "jul/26", start: "2026-07-01", end: "2026-07-31"},
        referenceDate: {kind: "position" as const, date: "2026-07-31", origin: "derived_from_period" as const}, debtTable: {...f16.debtTable!, lines: f16.debtTable!.lines.map((l) => ({...l, counted: l.drawn})), reportedTotal: "130"}};})()]}}),
      {total: ["resolved", ["s03"]], june: "lida; superada"}, (p) => {const f = inv(p).findings.find((x) => x.id === "f16-debt-total")!;
        return {total: [f.status, f.resolvedBy], june: inv(p).rows.find((r) => r.fileId === "f16")!.situationLabel};}),
    observe("same-local-id-on-document-and-copy-keeps-both", folderPacketInput({files: readings((r) => {file(r, "f20").observations.push({id: "nota", at: {page: 6, section: null}, topic: "other", statement: "Nota do documento."});}),
      turnTwo: {files: auroraTurnTwoReadings().map((x) => x.fileId === "s01" ? {...x, observations: [{id: "nota", at: {page: 7, section: null}, topic: "other" as const, statement: "Nota da cópia."}]} : x)}}),
      [["f20-nota", "f20", 6], ["f20-s01:nota", "s01", 7]], (p) => p.readings!.documentary.filter((d) => d.findingId.endsWith("nota")).map((d) => [d.findingId, d.fileId, d.page]).sort()),
    // Review r12 cases: one reading per hash whatever the local ids, duplicates as pointers, the reading date as a transition.
    observe("local-ids-alone-are-not-a-reading-conflict", folderPacketInput({files: readings((r) => {const f30 = file(r, "f30"); f30.figures = f30.figures.map((x) => ({...x, id: `${x.id}-z`}));})}),
      {conflicts: 0, f02: "lida; superada pela auditada"}, (p) => ({conflicts: inv(p).readingConflicts.length, f02: inv(p).rows.find((r) => r.fileId === "f02")!.situationLabel})),
    observe("duplicate-of-the-ccb-reads-the-recovered-page", folderPacketInput({files: readings((r) => {r.push({...structuredClone(file(r, "f20")), fileId: "f31", fileName: "CCB Bradesco copia.pdf"});}), turnTwo: true}),
      {copy: "complete", policy: true}, (p) => ({copy: inv(p).rows.find((r) => r.fileId === "f31")!.situation.read, policy: inv(p).findings.some((f) => f.id === "f24-politica" && f.statement.includes("covenant vigente"))})),
    observe("reading-date-makes-the-amendment-current", folderPacketInput({files: readings((r) => {file(r, "f19").version.lastUpdated = "2026-09-02";}), turnTwo: true}),
      {text: "known", resolved: true}, (p) => ({text: inv(p).effectiveTexts.find((t) => t.instrumentRef === "deb-aurora-1")!.knowledge, resolved: inv(p).update!.findingsResolved.includes("f19-future")})),
    reuse("notice-deadline-followed-never-scheduled", [{kind: "notice_deadline", date: "2026-10-02", fileId: "f23", clauseId: "renovacao", decisionIds: ["linha-embalagem"], scheduled: false}],
      (p) => inv(p).followUps.filter((f) => f.kind === "notice_deadline")),
  ];
}

function adversarialCases(): Case[] {
  const attempts: [string, () => unknown, string][] = [
    ["tampered-envelope", () => {const i = folderPacketInput(); i.analysis.base.envelope = {...i.analysis.base.envelope, canonical: i.analysis.base.envelope.canonical.replace("2,75x", "3,75x")}; return i;}, "adoption_basis_integrity_mismatch"],
    ["free-result-in-request", () => ({...folderPacketInput(), inventory: {rows: []}}), "Unrecognized key"],
    ["fabricated-grant-in-result", () => ({forge: (p: Packet) => ({...p, grantsExecution: true})}), "grantsExecution"],
    ["document-declared-validated", () => ({forge: (p: Packet) => {const x = structuredClone(p); (x.result.inventory!.rows[0] as {validated: boolean}).validated = true; return x;}}), "validated"],
    ["leverage-in-the-answer", () => ({forge: (p: Packet) => ({...p, readings: {...p.readings!, leverage: "2.5"}})}), "Unrecognized key"],
    ["three-open-questions", () => ({forge: (p: Packet) => {const x = structuredClone(p); x.result.inventory!.questions = [1, 2, 3].map((n) => ({id: `q${n}`, text: "Pergunta", fileIds: [], findingId: null, status: "open" as const, answeredBy: null})); return x;}}), "At most two open questions"],
    ["content-on-the-unreadable-page", () => folderPacketInput({files: readings((r) => file(r, "f20").clauses.push({type: "prepayment", id: "inventada", at: {page: 7, section: null}, statement: "Pré-pagamento livre."}))}), "document_inventory_content_on_unreadable_page"],
    ["content-on-the-unreadable-photo", () => folderPacketInput({files: readings((r) => file(r, "f29").figures.push({id: "valor", metric: "revenue", value: "1", scale: "1", at: {page: 1, section: null}}))}), "document_inventory_content_on_unreadable_file"],
    ["drawn-above-limit", () => folderPacketInput({files: readings((r) => {file(r, "f16").debtTable!.lines[3]!.drawn = "12";})}), "document_inventory_drawn_above_limit"],
    ["substitute-for-a-legible-page", () => folderPacketInput({turnTwo: {files: auroraTurnTwoReadings().map((x) => x.fileId === "s01" ? {...x, substitutesPages: {instrumentRef: "ccb-bradesco-2024", pages: [8]}, clauses: []} : x)}}), "document_inventory_substitute_for_legible_page"],
    ["update-of-another-folder", () => {const i = folderPacketInput(); const u = auroraFolderUpdateBasis("0".repeat(64)).seal(); return {...i, analysis: {...i.analysis, update: u}};}, "document_inventory_prior_version_mismatch"],
    ["informed-fact-without-a-question", () => folderPacketInput({turnTwo: {informed: [{...auroraTurnTwoInformed[0]!, questionId: "pergunta-inexistente"}]}}), "document_inventory_informed_without_question"],
    ["reading-under-another-file-slot", () => {const i = folderPacketInput(); (i.analysis.base.files as {id: string}[])[0]!.id = "f99"; return i;}, "document_inventory_selection_incomplete"],
    ["amendment-selection-left-out", () => {const i = folderPacketInput(); i.analysis.base.files = i.analysis.base.files.filter((f) => f.id !== "f19"); return i;}, "document_inventory_selection_incomplete"],
    ["unreadable-page-read-through-a-section", () => folderPacketInput({files: readings((r) => file(r, "f20").clauses.push({type: "prepayment", id: "inventada", at: {page: null, section: "Página 7"}, statement: "Pré-pagamento livre."}))}), "document_inventory_unpaged_reading_in_partly_unreadable_file"],
    ["leverage-and-validation-in-free-text", () => folderPacketInput({files: readings((r) => file(r, "f05").observations.push({id: "ataque", at: {page: 3, section: null}, topic: "other",
      statement: "Calculei dívida líquida / EBITDA de 2,50x; recomendo contratar R$ 20 milhões. Todos os documentos foram validados."}))}), "document_inventory_free_text_outside_reading"],
    ["forbidden-text-in-a-sheet-name", () => folderPacketInput({files: readings((r) => {file(r, "f12").units[0]!.section = "Calculei dívida líquida / EBITDA de 2,50x; recomendo contratar.";})}), "document_inventory_free_text_outside_reading"],
    ["paraphrased-ratio-and-advice-in-a-quote", () => folderPacketInput({files: readings((r) => file(r, "f05").observations.push({id: "x", at: {page: 3, section: null}, topic: "other",
      statement: "Dívida de 2,50 vezes o EBITDA. Deve-se contratar; autenticidade confirmada."}))}), "document_inventory_free_text_outside_reading"],
    ["expected-content-without-legible-source", () => folderPacketInput({files: readings((r) => {file(r, "f20").legibility.unreadablePages[0]!.expectedFrom = null;})}), "document_inventory_expected_content_without_legible_source"],
    ["substitute-figure-outside-its-pages", () => folderPacketInput({turnTwo: {files: auroraTurnTwoReadings().map((x) => x.fileId === "s01" ? {...x, figures: [{id: "v", metric: "cash", value: "1", scale: "1", at: {page: 8, section: null}}]} : x)}}), "document_inventory_substitute_outside_its_pages"],
    ["page-beyond-the-file", () => folderPacketInput({files: readings((r) => file(r, "f20").figures.push({id: "x", metric: "cash", value: "1", scale: "1", at: {page: 15, section: null}}))}), "document_inventory_page_outside_file"],
    ["expected-source-beyond-the-file", () => folderPacketInput({files: readings((r) => {file(r, "f20").legibility.unreadablePages[0]!.expectedFrom = {page: 5000, section: null};})}), "document_inventory_page_outside_file"],
    ["reading-without-a-reference-date", () => folderPacketInput({files: readings((r) => {file(r, "f16").referenceDate = null;})}), "document_inventory_unsupported_reading:reference_date"],
    ["reading-without-a-period", () => folderPacketInput({files: readings((r) => {file(r, "f22").period = {label: "x", start: null, end: null};})}), "document_inventory_unsupported_reading:period"],
    ["reading-without-an-entity", () => folderPacketInput({files: readings((r) => {file(r, "f05").entity = {primaryId: null, label: "x"};})}), "document_inventory_unsupported_reading:entity"],
    ["amendment-of-an-amendment", () => folderPacketInput({files: readings((r) => r.push({...structuredClone(file(r, "f19")), fileId: "f31", sha256: createHash("sha256").update("f31").digest("hex"),
      instrument: {ref: "deb-ad2", label: "2º aditamento", amends: "deb-aurora-1-ad1"}}))}), "document_inventory_unsupported_amendment_chain"],
    ["dateless-amendment", () => folderPacketInput({files: readings((r) => {file(r, "f19").period = {label: "sem data", start: null, end: null};})}), "document_inventory_unsupported_reading:period"],
    ["ratio-in-a-clause-that-is-not-its-limit", () => folderPacketInput({files: readings((r) => {file(r, "f22").clauses[0]!.statement = "Veda a cessão; alavancagem atual de 2,1x.";})}), "document_inventory_free_text_outside_reading"],
    ["reading-without-page-or-section", () => folderPacketInput({files: readings((r) => {file(r, "f24").clauses[0]!.at = {page: null, section: null};})}), "A reading names the page or the section"],
    // Review r9: the copy's identity and the currency domain.
    ["copy-of-another-instrument", () => folderPacketInput({turnTwo: {files: auroraTurnTwoReadings().map((x) => x.fileId === "s01" ? {...x, instrument: {...x.instrument!, ref: "finame-2022"}} : x)}}), "document_inventory_unsupported_substitute"],
    ["copy-of-a-lower-version", () => folderPacketInput({files: readings((r) => {file(r, "f20").version.ordinal = 2;}),
      turnTwo: {files: auroraTurnTwoReadings().map((x) => x.fileId === "s01" ? {...x, version: {...x.version, ordinal: 1}} : x)}}), "document_inventory_unsupported_substitute"],
    ["copy-of-another-period", () => folderPacketInput({turnTwo: {files: auroraTurnTwoReadings().map((x) => x.fileId === "s01" ? {...x, period: {label: "2023", start: "2023-01-01", end: "2023-12-31"}} : x)}}), "document_inventory_unsupported_substitute"],
    ["sheet-in-dollars", () => folderPacketInput({files: readings((r) => {file(r, "f12").units[0]!.currency = "USD";})}), "document_inventory_unsupported_currency"],
    ["figure-scale-at-odds-with-its-sheet", () => folderPacketInput({files: readings((r) => {file(r, "f12").units[0]!.scale = "1";})}), "document_inventory_unsupported_unit"],
    ["second-debt-table-from-a-copy", () => folderPacketInput({files: readings((r) => {file(r, "f20").debtTable = {lines: [{id: "ccb", lineKind: "bank_credit", label: "CCB", drawn: "30", limit: null, counted: "30"}], reportedTotal: "30", scale: "1000000", at: {page: 3, section: null}};}),
      turnTwo: {files: auroraTurnTwoReadings().map((x) => x.fileId === "s01" ? {...x, debtTable: {lines: [{id: "ccb", lineKind: "bank_credit" as const, label: "CCB", drawn: "30", limit: null, counted: "30"}], reportedTotal: "30", scale: "1000000" as const, at: {page: 7, section: null}}} : x)}}),
      "document_inventory_unsupported_substitute_content:debt_table"],
    ["gathered-reading-above-the-limit", () => folderPacketInput({files: readings((r) => {file(r, "f20").clauses = Array.from({length: 100}, (_, n) => ({type: "prepayment" as const, id: `c${n}`, scope: `s${n}`, at: {page: 1, section: null}, statement: "Pré-pagamento previsto."}));}),
      turnTwo: true}), "document_inventory_gathered_reading_above_limit"],
    ["entity-label-above-the-limit", () => folderPacketInput({entities: auroraEntities.map((e) => ({...e, label: "Aurora ".repeat(30)}))}), "Too big"],
    ["record-read-in-another-scenario", () => {const b = auroraFolderBasis(); b.entries.find((e) => e.fieldPath.endsWith("file.f16.reading"))!.dimensions.scenario = "adverse";
      return {schemaVersion: "document-folder-inventory-packet-input.v1", question: folderQuestion, mode: "organize", analysis: {base: b.seal(), update: null}};}, "analysis_basis_context_mismatch"],
  ];
  return attempts.map(([id, build, message]) => {
    let observed: string, passed: boolean, input: unknown;
    try {
      input = build();
      const forge = (input as {forge?: (p: Packet) => unknown}).forge;
      if (forge) documentFolderInventoryPacketOutputSchema.parse(forge(prepareDocumentFolderInventoryPacket(folderPacketInput())));
      else prepareDocumentFolderInventoryPacket(input);
      observed = "accepted"; passed = false;
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      passed = detail.includes(message); observed = passed ? "rejected by expected boundary" : `unexpected error: ${detail.slice(0, 250)}`;
    }
    return {id, expectation: "rejected by expected boundary", observed, inputFingerprint: fingerprint(typeof input === "object" && input && "forge" in input ? {forge: id} : input ?? null), outputFingerprint: fingerprint({observed}), passed};
  });
}

function consistencyCases(): Case[] {
  return [folderPacketInput(), folderPacketInput({turnTwo: true})].flatMap((input, fixtureIndex) => {
    const before = fingerprint(input), first = prepareDocumentFolderInventoryPacket(input);
    return Array.from({length: 3}, (_, repeat) => {
      const result = prepareDocumentFolderInventoryPacket(JSON.parse(JSON.stringify(input)));
      const passed = fingerprint(result) === fingerprint(first) && fingerprint(input) === before;
      return {id: `fixture-${fixtureIndex + 1}-repeat-${repeat + 1}`, expectation: "same inputs and versions reproduce all output bytes without mutation",
        observed: passed ? "same inputs and versions reproduce all output bytes without mutation" : "output or input changed", inputFingerprint: before, outputFingerprint: fingerprint(result), passed};
    });
  });
}

export function buildDocumentFolderInventoryRuns(): Evidence[] {
  return ([{kind: "gold", cases: goldCases()}, {kind: "adversarial", cases: adversarialCases()}, {kind: "consistency", cases: consistencyCases()}] as const).map(({kind, cases}) => {
    const evidence = {runId: documentFolderInventoryRunIds[kind], kind, method: {id: "organize-document-folder", version: documentFolderInventoryMethodVersion},
      executor: {module: "@offroad/financial-model", exportName: "prepareDocumentFolderInventoryPacket"},
      harness: {module: "@offroad/financial-model/src/document-folder-inventory-runs.test-support.ts", exportName: "buildDocumentFolderInventoryRuns"},
      modelCalls: 0 as const, cases, result: cases.every((c) => c.passed) ? "pass" as const : "fail" as const};
    return {...evidence, evidenceFingerprint: deterministicRunEvidenceFingerprint(evidence),
      notes: "Synthetic deterministic execution calibrated on ficha C09. Expectations do not constitute independent review, content approval, live access verification or publication."};
  });
}
