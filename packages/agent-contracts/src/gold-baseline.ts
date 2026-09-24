import {createHash} from "node:crypto";

import {z} from "zod";

/**
 * Fair baseline for a gold case (gold-cases/README.md §5). The generalist receives exactly what
 * the Offroad run receives: the same turns, the same documents, the equivalent content of the
 * frozen source pack and the same time window. Nothing here reveals the review rubric; the
 * instruction is the one a VP would give any analyst. Everything the model saw is hashed so a
 * reviewer can prove which bytes produced which output.
 *
 * This is the contract of the baseline family between the script that assembles its inputs and
 * the worker that runs it under the governed evaluation transport: the information base, the
 * snapshot the worker receives, the per-turn loop and the run record both sides read.
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

/** One model route of the baseline, as the model gateway names it. */
export const baselineModelRouteSchema = z.object({
  provider: z.enum(["anthropic", "openai"]),
  model: z.string().min(1).max(120),
  effort: z.enum(["low", "medium", "high", "xhigh", "max"]),
}).strict();
export type BaselineModelRoute = z.infer<typeof baselineModelRouteSchema>;

/** The routes a run may use and the output ceiling of each call: the whole of its model settings. */
export const baselineModelSettingsSchema = z.object({
  primary: baselineModelRouteSchema,
  fallback: baselineModelRouteSchema.nullable(),
  maxOutputTokens: z.number().int().min(1).max(128_000),
}).strict();
export type BaselineModelSettings = z.infer<typeof baselineModelSettingsSchema>;

/**
 * The evaluation snapshot of the baseline family: the complete information base (turns,
 * documents and sources), the model settings and the caveats the run record repeats. Strict at
 * every level, so no field reaches the worker without being read.
 */
export const baselineGeneralistSnapshotSchema = z.object({
  schemaVersion: z.literal("gold-baseline-snapshot.v1"),
  informationBase: baselineInformationBaseSchema.extend({
    turns: z.array(baselineTurnSchema.strict()).min(1).max(6),
    documents: z.array(baselineDocumentSchema.strict()),
    sources: z.array(baselineSourceSchema.strict()),
  }).strict(),
  model: baselineModelSettingsSchema,
  caveats: z.array(z.string().min(1).max(500)).max(20),
}).strict();
export type BaselineGeneralistSnapshot = z.infer<typeof baselineGeneralistSnapshotSchema>;

/** Every content hash the snapshot carries: its documents and the sources whose bytes were kept. */
export function baselineSnapshotContentHashes(snapshot: BaselineGeneralistSnapshot): string[] {
  const hashes = [...snapshot.informationBase.documents.map((document) => document.sha256),
    ...snapshot.informationBase.sources.flatMap((source) => source.sha256 === null ? [] : [source.sha256])];
  return [...new Set(hashes)].sort();
}

/** The structured request of one turn, exactly as the model gateway receives it. */
export type BaselineTurnRequest = {
  task: "baseline_generalist";
  system: string;
  input: Array<{type: "text"; text: string}>;
  schema: typeof baselineOutputSchema;
  schemaName: "baseline_deliverable";
  metadata: Record<string, string>;
  model: BaselineModelRoute;
  allowFallback: boolean;
  maxOutputTokens: number;
};

/** What the loop needs from a model gateway; `createModelGateway` satisfies it. */
export type BaselineGateway = {
  complete(request: BaselineTurnRequest): Promise<{
    output: BaselineOutput;
    provider: string;
    model: string;
    effort: string;
    usage: {inputTokens: number; outputTokens: number; cachedInputTokens: number};
    costUsd: number;
    stopReason: string;
  }>;
  spent(): {costUsd: number};
};

export type BaselineGeneralistRun = {
  record: BaselineRunRecord;
  outputs: Array<{turnId: string; file: string; deliverable: string}>;
};

/**
 * The per-turn loop of the fair baseline. The whole information base goes first, then each turn
 * with the deliverables already given, one structured call per turn. Pure over its arguments: the
 * gateway decides where each call goes and what it may cost, and the clock stamps the record.
 */
export async function runBaselineGeneralist(snapshot: BaselineGeneralistSnapshot, gateway: BaselineGateway, clock: () => Date = () => new Date()): Promise<BaselineGeneralistRun> {
  const base = snapshot.informationBase;
  const rendered = renderInformationBase(base);
  const startedAt = clock();
  const conversation: Array<{type: "text"; text: string}> = [{type: "text", text: rendered}];
  const turns: BaselineRunRecord["turns"] = [];
  const outputs: BaselineGeneralistRun["outputs"] = [];
  let route = {provider: "", model: "", effort: ""};
  for (const [index, turn] of base.turns.entries()) {
    const message = renderTurnMessage(turn, index);
    conversation.push({type: "text", text: message});
    const started = clock().getTime();
    const result = await gateway.complete({
      task: "baseline_generalist",
      system: BASELINE_SYSTEM_PROMPT,
      input: [...conversation],
      schema: baselineOutputSchema,
      schemaName: "baseline_deliverable",
      metadata: {surface: "gold_baseline", caseId: base.caseId, turn: turn.id},
      model: snapshot.model.primary,
      allowFallback: snapshot.model.fallback !== null,
      maxOutputTokens: snapshot.model.maxOutputTokens,
    });
    const deliverable = result.output.deliverable;
    const file = `${turn.id}.output.md`;
    outputs.push({turnId: turn.id, file, deliverable});
    conversation.push({type: "text", text: `## Resposta ao turno ${index + 1} (sua entrega anterior)\n\n${deliverable}`});
    route = {provider: result.provider, model: result.model, effort: result.effort};
    turns.push({
      id: turn.id, messageSha256: sha256Hex(message), outputSha256: sha256Hex(deliverable), outputFile: file,
      inputTokens: result.usage.inputTokens, outputTokens: result.usage.outputTokens, cachedInputTokens: result.usage.cachedInputTokens,
      costUsd: result.costUsd, latencyMs: Math.max(0, clock().getTime() - started), stopReason: result.stopReason,
    });
  }
  const record = baselineRunRecordSchema.parse({
    schemaVersion: "gold-baseline-run.v1",
    caseId: base.caseId, caseVersion: base.caseVersion, asOfDate: base.asOfDate,
    startedAt: startedAt.toISOString(), finishedAt: clock().toISOString(),
    provider: route.provider, model: route.model, effort: route.effort,
    systemPromptSha256: sha256Hex(BASELINE_SYSTEM_PROMPT),
    informationBaseSha256: sha256Hex(rendered), informationBaseChars: rendered.length,
    inputs: {
      documents: base.documents.map((document) => ({id: document.id, sha256: document.sha256, pages: document.pages, chars: document.text.length})),
      sources: base.sources.map((source) => ({id: source.id, sha256: source.sha256, rendering: source.rendering, chars: source.text?.length ?? 0})),
    },
    turns,
    totalCostUsd: gateway.spent().costUsd,
    caveats: snapshot.caveats,
  });
  return {record, outputs};
}
