import {z} from "zod";
import {composeBoundDocumentFolderInventory, documentFolderInventoryPacketInputSchema, inventoryModes, type DocumentFolderInventoryPacketInput} from "@offroad/financial-model";

const hash = z.string().regex(/^[a-f0-9]{64}$/);
const bound = z.object({envelope: z.object({canonical: z.string().min(2), fingerprint: hash}).strict(), scope: z.object({workId: z.uuid(), purpose: z.string(), versionId: z.uuid()}).strict()}).strict();
const pinSchema = z.object({executionId: z.uuid(), resultFingerprint: hash, baseFingerprint: hash}).strict();
/** The folder inventory (ficha C09, organize-document-folder). An update reads the latest completed inventory of the
 * same work: its stored input, taken verbatim, is the base the update is composed against. */
export const documentFolderMethodId = "organize-document-folder";

/** The latest completed execution of the folder method in the work, as the server reads it. */
export type DocumentFolderPrior = {executionId: string; resultFingerprint: string; inputSnapshot: string};

/** The mode the card was proposed with; anything else is not a card this action composes. */
export function documentFolderMode(summary: Record<string, unknown>): (typeof inventoryModes)[number] | null {
  const parsed = z.enum(inventoryModes).safeParse(summary.mode);
  return parsed.success ? parsed.data : null;
}

/** The stored base of a prior execution's input, verbatim. */
function storedBase(prior: DocumentFolderPrior) {
  try { return documentFolderInventoryPacketInputSchema.parse(JSON.parse(prior.inputSnapshot)).analysis.base; }
  catch { return null; }
}

/** A card pins the inventory it was proposed over. An inventory card goes ahead only while the work has no completed
 * inventory; an update card only when the latest completed inventory is the pinned execution with the pinned packet,
 * composed on the pinned basis, and its facts name that basis. Anything else makes the card superseded. */
export function checkDocumentFolderPin(summary: Record<string, unknown>, facts: Record<string, unknown>, latest: DocumentFolderPrior | null):
  {ok: true; prior: DocumentFolderPrior | null} | {ok: false; error: "superseded"} {
  if (summary.priorInventory === null) return latest === null ? {ok: true, prior: null} : {ok: false, error: "superseded"};
  const pin = pinSchema.safeParse(summary.priorInventory);
  if (!pin.success || !latest || latest.executionId !== pin.data.executionId || latest.resultFingerprint !== pin.data.resultFingerprint) return {ok: false, error: "superseded"};
  const base = storedBase(latest);
  const named = z.object({priorFingerprint: z.object({value: hash}).loose()}).loose().safeParse(facts);
  if (!base || base.envelope.fingerprint !== pin.data.baseFingerprint || !named.success || named.data.priorFingerprint.value !== pin.data.baseFingerprint) return {ok: false, error: "superseded"};
  return {ok: true, prior: latest};
}

/** The packet input the confirmed card asks the method for: the folder's basis alone, or, for an update, the prior
 * inventory's stored base taken verbatim with the confirmed update composed against it, so the database can compare
 * the base byte for byte with the stored snapshot. */
export function composeDocumentFolderRequest(input: {basis: unknown; question: string; mode: (typeof inventoryModes)[number]; prior: DocumentFolderPrior | null}): DocumentFolderInventoryPacketInput {
  const basis = bound.parse(input.basis);
  if (!input.prior) return composeBoundDocumentFolderInventory({base: basis, question: input.question, mode: input.mode});
  const base = storedBase(input.prior);
  if (!base) throw new Error("document_folder_prior_invalid");
  const composed = composeBoundDocumentFolderInventory({base: {envelope: base.envelope, scope: base.scope}, update: basis, question: input.question, mode: input.mode});
  return documentFolderInventoryPacketInputSchema.parse({...composed, analysis: {...composed.analysis, base}});
}
