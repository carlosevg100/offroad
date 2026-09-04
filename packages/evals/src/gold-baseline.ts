import {createHash} from "node:crypto";

import {z} from "zod";

/**
 * Fair baseline for a gold case (gold-cases/README.md §5). The generalist receives exactly what
 * the Offroad run receives: the same turns, the same documents, the equivalent content of the
 * frozen source pack and the same time window. Nothing here reveals the review rubric; the
 * instruction is the one a VP would give any analyst. Everything the model saw is hashed so a
 * reviewer can prove which bytes produced which output.
 */
export const baselineTurnSchema = z.object({
  id: z.string().regex(/^gc0[1-5]-t[0-9]{2}$/),
  text: z.string().min(10),
});
export type BaselineTurn = z.infer<typeof baselineTurnSchema>;

export const baselineDocumentSchema = z.object({
  id: z.string().min(1).max(80),
  title: z.string().min(1).max(300),
  fileName: z.string().min(1).max(300),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  pages: z.number().int().nonnegative().nullable(),
  text: z.string(),
});
export type BaselineDocument = z.infer<typeof baselineDocumentSchema>;

export const baselineSourceSchema = z.object({
  id: z.string().min(1).max(80),
  title: z.string().min(1).max(500),
  url: z.string().min(1),
  asOfDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  version: z.string().min(1).max(80),
  licencePolicy: z.string().min(1).max(80),
  contentType: z.string().min(1).max(200),
  sha256: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  /** Null when the licence forbids retention or the format has no readable text (an archive). */
  text: z.string().nullable(),
  /** How the text was derived, so a reviewer knows what the model could and could not read. */
  rendering: z.enum(["full_text", "filtered_rows", "metadata_only", "not_retained"]),
  note: z.string().max(500).optional(),
});
export type BaselineSource = z.infer<typeof baselineSourceSchema>;

export const baselineInformationBaseSchema = z.object({
  caseId: z.string().min(1).max(80),
  caseVersion: z.string().min(1).max(20),
  language: z.literal("pt-BR"),
  /** The day the case is run as of; nothing after it may be known. */
  asOfDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  professionalContext: z.object({
    useForms: z.array(z.string()),
    professionalRoles: z.array(z.string()),
    practiceAreas: z.array(z.string()),
    primaryObjectives: z.array(z.string()),
  }),
  turns: z.array(baselineTurnSchema).min(1).max(6),
  documents: z.array(baselineDocumentSchema),
  sources: z.array(baselineSourceSchema),
});
export type BaselineInformationBase = z.infer<typeof baselineInformationBaseSchema>;

export const sha256Hex = (value: string | Uint8Array): string => createHash("sha256").update(value).digest("hex");

const byId = <T extends {id: string}>(items: readonly T[]): T[] => [...items].sort((a, b) => a.id.localeCompare(b.id));

/** Stable instructions. Deliberately silent about how the output will be reviewed. */
export const BASELINE_SYSTEM_PROMPT = `Você é um analista experiente de mercado de capitais de dívida (DCM) em um banco de investimento no Brasil.
Você recebe um pedido de trabalho, os documentos anexados e um conjunto fechado de fontes públicas já coletadas para este trabalho.
Trabalhe somente com esse material: não há acesso à internet e nada fora dele pode ser citado.
Quando usar um número, diga de onde ele veio (documento e página, nota ou tabela). Se algo material não estiver no material, diga que falta em vez de supor.
Responda em português do Brasil, em Markdown, como entregaria ao seu VP.`;

/**
 * The information base as the model reads it. Deterministic: same inputs, same bytes, same
 * hash. Documents and sources are ordered by id so a reordered manifest cannot change a run.
 */
export function renderInformationBase(base: BaselineInformationBase): string {
  const parts: string[] = [];
  parts.push(`# Base de informação do caso ${base.caseId} (versão ${base.caseVersion})`);
  parts.push(`Data-base da execução: ${base.asOfDate}. Nada posterior a essa data é conhecido.`);
  parts.push(`Perfil profissional de quem pede: formas de uso ${base.professionalContext.useForms.join(", ") || "n/d"}; funções ${base.professionalContext.professionalRoles.join(", ") || "n/d"}; áreas ${base.professionalContext.practiceAreas.join(", ") || "n/d"}; objetivos ${base.professionalContext.primaryObjectives.join(", ") || "n/d"}.`);
  parts.push("");
  parts.push(`## Documentos anexados (${base.documents.length})`);
  for (const document of byId(base.documents)) {
    parts.push("");
    parts.push(`### Documento ${document.id}: ${document.title}`);
    parts.push(`Arquivo: ${document.fileName}. SHA-256: ${document.sha256}.${document.pages === null ? "" : ` Páginas: ${document.pages}.`}`);
    parts.push("");
    parts.push(document.text);
  }
  parts.push("");
  parts.push(`## Fontes públicas coletadas antes do trabalho (${base.sources.length})`);
  for (const source of byId(base.sources)) {
    parts.push("");
    parts.push(`### Fonte ${source.id}: ${source.title}`);
    parts.push(`URL: ${source.url}. Data-base: ${source.asOfDate}. Versão: ${source.version}. Licença: ${source.licencePolicy}. Tipo: ${source.contentType}.${source.sha256 ? ` SHA-256: ${source.sha256}.` : ""}`);
    if (source.note) parts.push(`Nota: ${source.note}`);
    if (source.text === null) {
      parts.push(source.rendering === "not_retained"
        ? "Conteúdo não retido por licença; só a referência está disponível."
        : "Conteúdo não legível como texto neste formato; só os metadados estão disponíveis.");
    } else {
      if (source.rendering === "filtered_rows") parts.push("Conteúdo filtrado para as linhas relevantes à companhia do caso; o arquivo completo é maior.");
      parts.push("");
      parts.push(source.text);
    }
  }
  parts.push("");
  return parts.join("\n");
}

export const informationBaseHash = (base: BaselineInformationBase): string => sha256Hex(renderInformationBase(base));

/** What the model is asked in a turn: the person's message, nothing added. */
export function renderTurnMessage(turn: BaselineTurn, index: number): string {
  return `## Turno ${index + 1}\n\n${turn.text}`;
}

/** The gateway returns structured output; the deliverable travels as one Markdown string. */
export const baselineOutputSchema = z.object({
  deliverable: z.string().min(1).describe("O que você entrega ao VP neste turno, em Markdown."),
});
export type BaselineOutput = z.infer<typeof baselineOutputSchema>;

export const baselineRunRecordSchema = z.object({
  schemaVersion: z.literal("gold-baseline-run.v1"),
  caseId: z.string().min(1).max(80),
  caseVersion: z.string().min(1).max(20),
  asOfDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startedAt: z.string().datetime(),
  finishedAt: z.string().datetime(),
  provider: z.string().min(1),
  model: z.string().min(1),
  effort: z.string().min(1),
  systemPromptSha256: z.string().regex(/^[a-f0-9]{64}$/),
  informationBaseSha256: z.string().regex(/^[a-f0-9]{64}$/),
  informationBaseChars: z.number().int().nonnegative(),
  inputs: z.object({
    documents: z.array(z.object({id: z.string(), sha256: z.string(), pages: z.number().int().nullable(), chars: z.number().int()})),
    sources: z.array(z.object({id: z.string(), sha256: z.string().nullable(), rendering: z.string(), chars: z.number().int()})),
  }),
  turns: z.array(z.object({
    id: z.string(),
    messageSha256: z.string().regex(/^[a-f0-9]{64}$/),
    outputSha256: z.string().regex(/^[a-f0-9]{64}$/),
    outputFile: z.string().min(1),
    inputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
    cachedInputTokens: z.number().int().nonnegative(),
    costUsd: z.number().nonnegative(),
    latencyMs: z.number().int().nonnegative(),
    stopReason: z.string(),
  })),
  totalCostUsd: z.number().nonnegative(),
  /** Free text a reviewer needs before reading the outputs (what the model could not read, for instance). */
  caveats: z.array(z.string().max(500)),
});
export type BaselineRunRecord = z.infer<typeof baselineRunRecordSchema>;

/** Keeps only the header and the rows of a CSV that mention the company; large registries stay readable. */
export function filterCsvRows(csv: string, pattern: RegExp, maxRows = 200): {text: string; kept: number; total: number} {
  const lines = csv.split(/\r?\n/).filter((line) => line.length > 0);
  const [header, ...rows] = lines;
  const kept = rows.filter((row) => pattern.test(row)).slice(0, maxRows);
  return {text: [header ?? "", ...kept].join("\n"), kept: kept.length, total: rows.length};
}
