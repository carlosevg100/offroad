/**
 * The outbound data room: what leaves the desk, in which order, behind which gate.
 *
 * A desk does not hand an investor a folder of whatever the company uploaded. It hands a room
 * with a door: the teaser first, the credit memorandum and the term sheet after the NDA, the
 * source documents behind the same NDA and only after their hashes were verified, and the
 * source documents behind the same NDA and an evidence-led package. This
 * module plans that room deterministically from the case state. It never invents an entry:
 * a document the case still needs appears as "requested", not as a file.
 *
 * The company's name is not a gate here: the teaser is redacted by construction until the
 * company authorises disclosure (case-materials does that), and everything behind the NDA
 * names the company by definition, because that is what the NDA is for.
 *
 * One open exception that blocks external outputs holds the whole room. The analyst sees
 * every entry and why it is held; nothing outside the desk sees anything until it is cleared.
 */

import type {Material, MaterialBlock, MaterialKind} from "@offroad/case-materials";
import {materialTemplateReference} from "@offroad/credit-playbook";
import type {ReadinessReport} from "@offroad/case-understanding";
import {documentKindMap, type DocumentFolder, type DocumentKind} from "@offroad/credit-ontology";
import type {ReconciliationException} from "@offroad/reconciliation";

export const dataRoomVersion = "2026.08.21-v1";

/** Who may see an entry. Tiers are ordered: what is visible pre-NDA is visible after it too. */
export type DataRoomTier = "pre_nda" | "nda" | "internal";

export type DataRoomStatus = "ready" | "held" | "requested";

export type DataRoomSource =
  | {type: "material"; kind: MaterialKind}
  | {type: "document"; documentId: string; documentKind: DocumentKind; sha256?: string; byteSize?: number}
  | {type: "requested"; requirementId: string};

export type DataRoomEntry = {
  /** Stable within the case: material kind, document id, or requirement id. */
  id: string;
  folderId: string;
  name: {pt: string; en: string};
  tier: DataRoomTier;
  status: DataRoomStatus;
  /** Why it is held, each one nameable and fixable. Empty when ready or requested. */
  heldBy: Array<{pt: string; en: string}>;
  source: DataRoomSource;
};

export type DataRoomFolder = {id: string; order: number; name: {pt: string; en: string}; tier: DataRoomTier};

export type DataRoomPlan = {
  version: string;
  folders: DataRoomFolder[];
  entries: DataRoomEntry[];
  counts: Record<DataRoomStatus, number>;
  /** True only when nothing outside the desk is held. */
  releasable: boolean;
  /** Room-wide holds, repeated on every external entry. */
  holds: Array<{pt: string; en: string}>;
};

export type DataRoomDocument = {
  id: string;
  kind: DocumentKind | null;
  originalName: string;
  sha256: string | null;
  sha256VerifiedAt: string | null;
  byteSize: number | null;
};

export type DataRoomInput = {
  materials: readonly Material[];
  /** Why a material that should exist does not; repeated on each missing material entry. */
  materialsBlockedBy: readonly string[];
  documents: readonly DataRoomDocument[];
  exceptions: readonly ReconciliationException[];
  readiness: ReadinessReport;
};

const materialTier: Record<MaterialKind, DataRoomTier> = {
  teaser: "pre_nda",
  credit_profile: "nda",
  package: "nda",
  term_sheet: "nda",
  financial_model: "nda",
  diligence_qa: "nda",
  credit_memo: "nda",
  data_room_index: "internal",
};

const materialName: Record<MaterialKind, {pt: string; en: string}> = {
  teaser: {pt: "Resumo da operação", en: "Transaction summary"},
  credit_profile: {pt: "Perfil de crédito", en: "Credit profile"},
  package: {pt: "Material completo", en: "Full package"},
  credit_memo: {pt: "Memorando de Crédito", en: "Credit Memorandum"},
  term_sheet: {pt: "Term Sheet indicativo", en: "Indicative Term Sheet"},
  financial_model: {pt: "Modelo financeiro indicativo", en: "Indicative financial model"},
  diligence_qa: {pt: "Q&A de diligência", en: "Diligence Q&A"},
  data_room_index: {pt: "Índice da sala", en: "Room index"},
};

/** The materials an investor room is expected to carry, in reading order. */
const expectedMaterials: readonly MaterialKind[] = ["teaser", "credit_memo", "financial_model", "term_sheet", "diligence_qa", "package"];

const folderNames: Record<DocumentFolder, {pt: string; en: string}> = {
  financial: {pt: "Demonstrações e contábil", en: "Financial statements and accounting"},
  debt_and_collateral: {pt: "Dívida e garantias", en: "Debt and collateral"},
  project_and_plan: {pt: "Projeto e plano", en: "Project and plan"},
  institutional_and_corporate: {pt: "Societário e institucional", en: "Corporate and institutional"},
  contracts: {pt: "Contratos", en: "Contracts"},
  other: {pt: "Outros documentos", en: "Other documents"},
};

const folderOrder: readonly DocumentFolder[] = ["financial", "debt_and_collateral", "project_and_plan", "institutional_and_corporate", "contracts", "other"];

const FOLDER_MATERIALS = "01_materiais";
const FOLDER_INTERNAL = "00_mesa";
const FOLDER_OTHER = "90_nao_classificados";
const FOLDER_REQUESTED = "99_pendencias";

export function planDataRoom(input: DataRoomInput): DataRoomPlan {
  const holds = input.exceptions
    .filter((exception) => exception.blocksExternalOutputs)
    .map((exception) => ({pt: `Exceção aberta bloqueia saída: ${exception.title}`, en: `Open exception blocks release: ${exception.title}`}));

  const folders: DataRoomFolder[] = [
    {id: FOLDER_INTERNAL, order: 0, name: {pt: "Mesa (não circula)", en: "Desk (does not circulate)"}, tier: "internal"},
    {id: FOLDER_MATERIALS, order: 1, name: {pt: "Materiais da operação", en: "Transaction materials"}, tier: "pre_nda"},
    ...folderOrder.map((folder, index) => ({id: `${String(index + 2).padStart(2, "0")}_${folder}`, order: index + 2, name: folderNames[folder], tier: "nda" as const})),
  ];
  const folderOfDocument = (folder: DocumentFolder) => folders.find((entry) => entry.id.endsWith(`_${folder}`))!.id;

  const entries: DataRoomEntry[] = [];
  const present = new Map(input.materials.map((material) => [material.kind, material]));

  // Materials: the ones that exist, then the ones that should and do not.
  for (const kind of expectedMaterials) {
    const tier = materialTier[kind];
    const heldBy: Array<{pt: string; en: string}> = [];
    if (!present.has(kind)) {
      heldBy.push(
        ...(input.materialsBlockedBy.length
          ? input.materialsBlockedBy.map((reason) => ({pt: reason, en: reason}))
          : [{pt: "Material ainda não emitido", en: "Material not issued yet"}]),
      );
    }
    if (tier !== "internal") heldBy.push(...holds);
    entries.push({
      id: `material:${kind}`,
      folderId: tier === "internal" ? FOLDER_INTERNAL : FOLDER_MATERIALS,
      name: materialName[kind],
      tier,
      status: heldBy.length ? "held" : "ready",
      heldBy,
      source: {type: "material", kind},
    });
  }

  // Source documents: behind the NDA, and only with a verified hash. A file whose bytes were
  // never checked against what the company uploaded cannot be what the investor relies on.
  let otherFolderNeeded = false;
  const documents = [...input.documents].sort((a, b) => a.originalName.localeCompare(b.originalName, "pt-BR"));
  for (const document of documents) {
    const definition = document.kind ? documentKindMap.get(document.kind) : undefined;
    const heldBy: Array<{pt: string; en: string}> = [...holds];
    if (!definition) heldBy.push({pt: "Documento sem classificação confirmada", en: "Document without a confirmed classification"});
    if (!document.sha256 || !document.sha256VerifiedAt) heldBy.push({pt: "Hash SHA-256 não verificado", en: "SHA-256 hash not verified"});
    if (!definition) otherFolderNeeded = true;
    entries.push({
      id: `document:${document.id}`,
      folderId: definition ? folderOfDocument(definition.folder) : FOLDER_OTHER,
      name: definition ? {pt: `${definition.labels.pt}: ${document.originalName}`, en: `${definition.labels.en}: ${document.originalName}`} : {pt: document.originalName, en: document.originalName},
      tier: "nda",
      status: heldBy.length ? "held" : "ready",
      heldBy,
      source: {
        type: "document",
        documentId: document.id,
        documentKind: document.kind ?? "corporate_docs",
        ...(document.sha256 ? {sha256: document.sha256} : {}),
        ...(document.byteSize !== null ? {byteSize: document.byteSize} : {}),
      },
    });
  }
  if (otherFolderNeeded) folders.push({id: FOLDER_OTHER, order: 90, name: {pt: "Sem classificação", en: "Unclassified"}, tier: "internal"});

  // What the case still needs appears as a request, never as a placeholder file.
  if (input.readiness.blockers.length) {
    folders.push({id: FOLDER_REQUESTED, order: 99, name: {pt: "Pendências com a empresa", en: "Pending with the company"}, tier: "internal"});
    for (const blocker of input.readiness.blockers) {
      entries.push({
        id: `requested:${blocker.id}`,
        folderId: FOLDER_REQUESTED,
        name: blocker.labels,
        tier: "internal",
        status: "requested",
        heldBy: [],
        source: {type: "requested", requirementId: blocker.id},
      });
    }
  }

  const counts: Record<DataRoomStatus, number> = {ready: 0, held: 0, requested: 0};
  for (const entry of entries) counts[entry.status] += 1;
  const releasable = entries.filter((entry) => entry.tier !== "internal").every((entry) => entry.status === "ready");

  return {version: dataRoomVersion, folders: folders.sort((a, b) => a.order - b.order), entries, counts, releasable, holds};
}

const tierLabel: Record<DataRoomTier, {pt: string; en: string}> = {
  pre_nda: {pt: "Antes do NDA", en: "Before NDA"},
  nda: {pt: "Após NDA", en: "After NDA"},
  internal: {pt: "Interno", en: "Internal"},
};

const statusLabel: Record<DataRoomStatus, {pt: string; en: string}> = {
  ready: {pt: "Pronto", en: "Ready"},
  held: {pt: "Retido", en: "Held"},
  requested: {pt: "Solicitado", en: "Requested"},
};

/**
 * The room as a document the desk can print and keep: every entry, its gate, its status, and
 * the hash of every file, so that what went out can be proven later. It is internal, as the
 * memorandum is.
 */
export function dataRoomIndex(plan: DataRoomPlan): Material {
  const blocks: MaterialBlock[] = [
    {
      type: "callout",
      title: {pt: "Estado da sala", en: "Room state"},
      items: [
        {label: {pt: "Liberável", en: "Releasable"}, value: plan.releasable ? {pt: "Sim", en: "Yes"} : {pt: "Não", en: "No"}},
        {label: {pt: "Prontos", en: "Ready"}, value: {pt: String(plan.counts.ready), en: String(plan.counts.ready)}},
        {label: {pt: "Retidos", en: "Held"}, value: {pt: String(plan.counts.held), en: String(plan.counts.held)}},
        {label: {pt: "Solicitados", en: "Requested"}, value: {pt: String(plan.counts.requested), en: String(plan.counts.requested)}},
      ],
    },
  ];
  if (plan.holds.length) blocks.push({type: "list", items: plan.holds});
  for (const folder of plan.folders) {
    const entries = plan.entries.filter((entry) => entry.folderId === folder.id);
    if (!entries.length) continue;
    blocks.push({type: "heading", text: folder.name});
    blocks.push({
      type: "table",
      caption: {pt: `Acesso: ${tierLabel[folder.tier].pt}`, en: `Access: ${tierLabel[folder.tier].en}`},
      head: [
        {pt: "Item", en: "Item"},
        {pt: "Acesso", en: "Access"},
        {pt: "Estado", en: "Status"},
        {pt: "SHA-256", en: "SHA-256"},
        {pt: "Observação", en: "Note"},
      ],
      // Table rows are language-neutral strings by type; the Portuguese label is the house
      // language of the desk and the English reader has the English material beside it.
      rows: entries.map((entry) => [
        entry.name.pt,
        tierLabel[entry.tier].pt,
        statusLabel[entry.status].pt,
        entry.source.type === "document" && entry.source.sha256 ? entry.source.sha256.slice(0, 12) : "",
        entry.heldBy.map((hold) => hold.pt).join("; "),
      ]),
    });
  }
  blocks.push({
    type: "disclaimer",
    text: {
      pt: "Índice interno. Nada desta sala circula antes de o estado ser liberável e de o NDA estar assinado para os itens marcados.",
      en: "Internal index. Nothing in this room circulates before the state is releasable and the NDA is signed for the items so marked.",
    },
  });
  return {
    kind: "data_room_index",
    title: {pt: "Sala de dados de saída", en: "Outbound data room"},
    blocks,
    dependsOn: plan.entries.map((entry) => entry.id),
    template: materialTemplateReference("institutional-data-room-index"),
    sections:["corporate","financial","debt","project","offroad_materials","open_items"],
  };
}
