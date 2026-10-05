import {z} from "zod";
import {blockKeySchema, blockKindSchema, type ArtifactManifest} from "./artifact-protocol";

export const roundtripManifestVersion = "artifact-roundtrip.2026.09.26-v1";
const name = z.string().min(1).max(300);
const definedName = z.string().max(255).regex(/^[A-Za-z_\\][A-Za-z0-9_.\\]*$/).refine(value => !/^(?:[A-Za-z]{1,3}[1-9][0-9]*|R[0-9]+C[0-9]+)$/i.test(value), {message: "roundtrip_defined_name_invalid"});
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const cellRef = z.string().regex(/^\$?[A-Z]{1,3}\$?[1-9][0-9]{0,6}(?::\$?[A-Z]{1,3}\$?[1-9][0-9]{0,6})?$/);
export const roundtripFormatSchema = z.enum(["xlsx", "docx", "pptx", "pdf"]);
export const roundtripRegionSchema = z.discriminatedUnion("kind", [
  z.strictObject({kind: z.literal("cell"), sheet: name, ref: cellRef, definedName}),
  z.strictObject({kind: z.literal("word"), tag: name, bookmark: name}),
  z.strictObject({kind: z.literal("slide"), slideName: name, shapeName: name,
    parts: z.array(z.strictObject({partKey: name, slideName: name, shapeName: name})).max(120).optional()}),
]);
export const roundtripManifestSchema = z.strictObject({
  schemaVersion: z.literal(roundtripManifestVersion),
  artifactId: z.uuid(), revisionId: z.uuid(), revisionNo: z.number().int().positive(),
  logicalManifestFingerprint: hash, format: roundtripFormatSchema, variant: z.string().min(1).max(80).optional(),
  exportedAt: z.iso.datetime({offset: true}),
  blocks: z.array(z.strictObject({blockKey: blockKeySchema, kind: blockKindSchema, region: roundtripRegionSchema,
    recorded: z.boolean(), claimIds: z.array(name).max(500)})).max(1000),
  inputs: z.array(z.strictObject({name: definedName, blockKey: blockKeySchema, assumptionId: name, period: name, configurationId: z.uuid().optional(), approved: z.string().max(100).regex(/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/).optional(), cellRef})).max(500),
  outputs: z.array(z.strictObject({name: definedName, cellRef, traceId: name})).max(2000),
  formulas: z.array(z.strictObject({name: definedName, cellRef, formulaSha256: hash})).max(10000),
}).superRefine((manifest, context) => {
  for (const field of ["blocks", "inputs", "outputs", "formulas"] as const) {
    const keys = manifest[field].map(entry => "blockKey" in entry && field === "blocks" ? entry.blockKey : "name" in entry ? entry.name : "");
    if (new Set(keys).size !== keys.length) context.addIssue({code: "custom", path: [field], message: "roundtrip_duplicate_identity"});
  }
  for (const block of manifest.blocks) if (block.region.kind === "slide" && block.region.parts) {
    const parts = block.region.parts;
    if (new Set(parts.map(part => part.partKey)).size !== parts.length || new Set(parts.map(part => `${part.slideName}|${part.shapeName}`)).size !== parts.length)
      context.addIssue({code: "custom", path: ["blocks"], message: "roundtrip_duplicate_part"});
  }
  const names = [...manifest.inputs, ...manifest.outputs, ...manifest.formulas].map(entry => entry.name);
  if (new Set(names).size !== names.length) context.addIssue({code: "custom", message: "roundtrip_duplicate_name"});
  if (manifest.inputs.some(entry => !manifest.blocks.some(block => block.blockKey === entry.blockKey)))
    context.addIssue({code: "custom", path: ["inputs"], message: "roundtrip_input_block_missing"});
  if (manifest.format !== "pdf" && manifest.blocks.some(block => block.region.kind !== ({xlsx: "cell", docx: "word", pptx: "slide"} as const)[manifest.format as "xlsx" | "docx" | "pptx"]))
    context.addIssue({code: "custom", path: ["blocks"], message: "roundtrip_region_format_mismatch"});
});
export type RoundtripManifest = z.infer<typeof roundtripManifestSchema>;
export type RoundtripFormat = z.infer<typeof roundtripFormatSchema>;
export type RoundtripRegion = z.infer<typeof roundtripRegionSchema>;
/** Logical identity is independent of output format, storage, final bytes and emission receipts. */
export const roundtripLogicalVersion = "artifact-roundtrip-logical.2026.10.05-v1";
export function logicalManifestProjection(manifest: ArtifactManifest): {schemaVersion: typeof roundtripLogicalVersion; manifest: Omit<ArtifactManifest, "format" | "bytes">} {
  const {format: _format, bytes: _bytes, ...logical} = manifest;
  return {schemaVersion: roundtripLogicalVersion, manifest: logical};
}
export function canonicalRoundtripJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalRoundtripJson).join(",")}]`;
  if (value !== null && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([key, inner]) => `${JSON.stringify(key)}:${canonicalRoundtripJson(inner)}`).join(",")}}`;
  const encoded = JSON.stringify(value);
  if (encoded === undefined) throw new Error("roundtrip_non_json_value");
  return encoded;
}
