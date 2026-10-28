import {z} from "zod";
import {readContextualBasis, type AdoptionBasisEntry} from "@offroad/reconciliation";
import {adoptedValueSelectionSchema} from "./adopted-debt-inputs";
import {inventoryModes} from "./document-folder-inventory";
import {documentFolderInventoryPacketInputSchema, type DocumentFolderInventoryPacketInput} from "./document-folder-inventory-packet";

const text = z.string().trim().min(1).max(2000);
const bound = z.strictObject({
  envelope: z.strictObject({canonical: z.string().min(2).max(4194304), fingerprint: z.string().regex(/^[a-f0-9]{64}$/)}),
  scope: z.strictObject({workId: z.uuid(), purpose: z.string().min(3).max(300), versionId: z.uuid()}),
});
/** The folder's basis and, in a later turn, the basis of what arrived. */
export const boundDocumentFolderInventoryInputSchema = z.strictObject({base: bound, update: bound.nullable().default(null), question: text, mode: z.enum(inventoryModes).default("organize")});
type Selection = z.infer<typeof adoptedValueSelectionSchema>;
const uuid = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const k = "[a-z0-9][a-z0-9-]{0,39}";
const keyOf = z.string().regex(new RegExp(`^${k}$`));

/** One basis, composed by field path: the single analysis it carries, each record selected by path,
 * scenario, unit and type in the analysis' own dimensions, listed in the adopted order first. An absent
 * record or one adopted twice for the same slot is declared missing with its reason. */
function composeOne(raw: z.input<typeof bound>, root: string, kinds: {kind: string; leaf: string; order: string}[]) {
  const input = bound.parse(raw);
  const basis = readContextualBasis(input.envelope, input.scope);
  const entries = [...basis.entries].sort((a, b) => a.decisionId < b.decisionId ? -1 : 1);
  const pattern = new RegExp(`^${root}\\.(${uuid})\\.`);
  const roles = entries.flatMap((e) => {const m = pattern.exec(e.fieldPath); return m ? [{analysisId: m[1]!, entry: e}] : [];});
  if (!roles.length) throw new Error("document_inventory_analysis_missing");
  if (new Set(roles.map((r) => r.analysisId)).size !== 1) throw new Error("document_inventory_analysis_ambiguous");
  const analysisId = roles[0]!.analysisId, prefix = `${root}.${analysisId}.`;
  const anchor = (roles.find((r) => r.entry.fieldPath.endsWith(".order.files")) ?? roles[0]!).entry, d = anchor.dimensions, sc = d.scenario!;
  const own = entries.filter((e) => e.fieldPath.startsWith(prefix) && e.dimensions.scenario === sc && e.dimensions.entityId === d.entityId && e.dimensions.perimeter === d.perimeter
    && e.dimensions.currency === d.currency && e.dimensions.periodStart === d.periodStart && e.dimensions.periodEnd === d.periodEnd);
  const definitions: Selection[] = [], missing: Selection[] = [];
  function select(p: string, type: AdoptionBasisEntry["value"]["type"]): Selection {
    const matches = own.filter((e) => e.fieldPath === prefix + p && e.value.type === type && e.dimensions.unit === "identity");
    if (matches.length === 1) {
      const e = matches[0]!, s = {decisionId: e.decisionId, definitionVersionId: e.dimensions.definitionVersionId!, definitionKind: e.definitionKind, missingReason: null};
      definitions.push(s); return s;
    }
    const s = {decisionId: null, definitionVersionId: anchor.dimensions.definitionVersionId!, definitionKind: anchor.definitionKind,
      missingReason: matches.length > 1 ? `${matches.length} contributions match ${p} for scenario ${sc}; keep one value per slot in the working basis` : `No contribution adopted for ${p} in scenario ${sc}`};
    missing.push(s); return s;
  }
  const ids = (kind: string, leaf: string, orderPath: string) => {
    const found = own.filter((e) => e.fieldPath === prefix + orderPath && e.value.type === "list");
    if (found.length > 1) throw new Error("document_inventory_order_ambiguous");
    const order = z.array(keyOf).parse(found[0]?.value.value ?? []);
    if (new Set(order).size !== order.length) throw new Error("document_inventory_order_ambiguous");
    const named = new RegExp(`^${kind}\\.(${k})\\.${leaf}$`);
    const seen = [...new Set(own.flatMap((e) => {const m = named.exec(e.fieldPath.slice(prefix.length)); return m ? [m[1]!] : [];}))].filter((x) => !order.includes(x)).sort();
    return [...order, ...seen];
  };
  const slots = Object.fromEntries(kinds.map(({kind, leaf, order}) => [kind, ids(kind, leaf, order).map((id) => ({id, value: select(`${kind}.${id}.${leaf}`, "text")}))]));
  const context = {envelope: input.envelope, scope: input.scope, entityId: d.entityId!, perimeter: d.perimeter!, currency: d.currency!,
    openingDate: d.periodStart!, endDate: d.periodEnd!, numericInterpretations: [], analysisId, scenario: sc};
  // A missing record carries the lowest resolved definition so the reference is stable; the reader ignores it.
  const borrowed = [...definitions].sort((a, b) => a.definitionVersionId < b.definitionVersionId ? -1 : 1)[0];
  return {context, slots, select, fix: () => {if (borrowed) for (const m of missing) {m.definitionVersionId = borrowed.definitionVersionId; m.definitionKind = borrowed.definitionKind;}}};
}

/** Composes the folder inventory packet input from the bases alone: the folder's basis and, in a later
 * turn, the basis of what arrived, which names the folder's basis by fingerprint. No record is supplied here. */
export function composeBoundDocumentFolderInventory(raw: unknown): DocumentFolderInventoryPacketInput {
  const input = boundDocumentFolderInventoryInputSchema.parse(raw);
  const b = composeOne(input.base, "document_folder_inventory", [{kind: "entity", leaf: "record", order: "order.entities"}, {kind: "decision", leaf: "record", order: "order.decisions"},
    {kind: "vault", leaf: "record", order: "order.vault"}, {kind: "file", leaf: "reading", order: "order.files"}]);
  const subjectEntityId = b.select("subject.entity", "text");
  b.fix();
  const base = {...b.context, subjectEntityId, entities: b.slots.entity!, decisions: b.slots.decision!, vault: b.slots.vault!, files: b.slots.file!};
  let update = null;
  if (input.update) {
    const u = composeOne(input.update, "document_folder_inventory_update", [{kind: "file", leaf: "reading", order: "order.files"}, {kind: "informed", leaf: "record", order: "order.informed"}]);
    const priorFingerprint = u.select("prior.fingerprint", "text");
    u.fix();
    update = {...u.context, priorFingerprint, files: u.slots.file!, informed: u.slots.informed!};
  }
  return documentFolderInventoryPacketInputSchema.parse({schemaVersion: "document-folder-inventory-packet-input.v1", question: input.question, mode: input.mode, analysis: {base, update}});
}
