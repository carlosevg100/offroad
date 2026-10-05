import {z} from "zod";
export const importLocaleSchema = z.enum(["pt-BR", "en-US"]);
export const artifactImportUploadSchema = z.strictObject({workId: z.uuid(), headRevisionId: z.uuid(), candidateId: z.uuid(), commandId: z.uuid(), exportReceiptId: z.uuid().nullable(), fileName: z.string().trim().min(1).max(500), format: z.enum(["xlsx", "docx", "pptx"]), byteLength: z.number().int().min(1).max(52428800), sha256: z.string().regex(/^[a-f0-9]{64}$/), terms: z.strictObject({signatoryName: z.string().trim().min(2).max(160), signatoryTitle: z.string().trim().max(160), termsAgreed: z.literal(true), informationRightsDeclared: z.literal(true)})}).refine(input => input.fileName.toLowerCase().endsWith(`.${input.format}`));
export const artifactImportSubmitSchema = artifactImportUploadSchema.safeExtend({sessionId: z.uuid(), sourceVersionId: z.uuid()});
const common = {commandId: z.uuid()};
export const artifactImportDecisionSchema = z.discriminatedUnion("act", [
  z.strictObject({...common, act: z.literal("apply"), configurationId: z.uuid().nullable().optional(), rebaseDeclared: z.boolean().optional(), expectedHeadRevisionId: z.uuid(), comparisonFingerprint: z.string().regex(/^[a-f0-9]{64}$/), choices: z.array(z.strictObject({key: z.string().min(1).max(600), choice: z.enum(["received", "current"])})).max(20000), selfApprovalDeclared: z.boolean(), continuationBasis: z.strictObject({milestoneId: z.uuid().nullable(), decisionId: z.uuid().nullable(), revision: z.number().int().positive()}).refine(basis => basis.milestoneId !== null || basis.decisionId !== null)}),
  z.strictObject({...common, act: z.literal("keep_source"), reason: z.string().trim().min(2).max(2000)}),
  z.strictObject({...common, act: z.literal("match"), exportReceiptId: z.uuid(), expectedHeadRevisionId: z.uuid(), mappings: z.array(z.strictObject({receivedKey: z.string().min(1).max(600), blockKey: z.string().min(1).max(160)})).min(1).max(1000)}),
  z.strictObject({...common, act: z.literal("discard"), reason: z.string().trim().min(2).max(2000)}),
  z.strictObject({...common, act: z.literal("recompare"), expectedHeadRevisionId: z.uuid()}),
]);
export const artifactImportMime = {xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation"} as const;
export const importNoStore = {"cache-control": "private, no-store"};
/** Cookie-authenticated mutation endpoints do not accept cross-origin form/API submissions. */
export function importSameOrigin(request: Request): boolean {const origin = request.headers.get("origin"); return origin !== null && origin === new URL(request.url).origin;}
export async function readImportRequest(request: Request): Promise<unknown> {
  if (request.headers.get("content-type")?.split(";")[0] !== "application/json") return null;
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (declaredLength > 2_097_152) return null;
  const reader = request.body?.getReader(); if (!reader) return null;
  const chunks: Uint8Array[] = [];let total = 0;
  while (true) {const {done, value} = await reader.read();if (done) break;total += value.byteLength;if (total > 2_097_152) {await reader.cancel();return null;}chunks.push(value);}
  const bytes = new Uint8Array(total);let offset = 0;for (const chunk of chunks) {bytes.set(chunk, offset);offset += chunk.byteLength;}
  try {return JSON.parse(new TextDecoder().decode(bytes));} catch {return null;}
}
