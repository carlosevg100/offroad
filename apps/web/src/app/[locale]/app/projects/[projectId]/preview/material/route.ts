import {materialToDocx} from "@offroad/case-export";
import type {Material, MaterialBlock} from "@offroad/case-materials";
import * as XLSX from "xlsx";

import {requireWorkspace} from "@/lib/auth/workspace";
import {integrationPreviewCoversProject, loadIntegrationPreviewStatus} from "@/lib/integration-preview";

/**
 * The preview material as a real file: a Word document with the synthesis sections and the
 * signed figures, or a spreadsheet with the ledger, the schedule and the alternatives. Built
 * deterministically from the latest `preview_material` artifact and the objects it read, so a
 * new version of the objects is a new version of the file. Internal validation only: the
 * project must run in integration_preview, and the workspace boundary scopes every read.
 */
type Params = {params: Promise<{locale: string; projectId: string}>};

type ArtifactRow = {id: string; artifact_type: string; artifact_version: number; status: string; artifact_fingerprint: string; content: unknown; created_at: string};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

const formatCell = (value: unknown): string => {
  if (value === null || value === undefined) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  if (isRecord(value) && typeof value.value === "string") return value.value;
  if (isRecord(value) && typeof value.document === "string") return `${value.document}${value.page ? ` p. ${String(value.page)}` : ""}`;
  if (Array.isArray(value)) return `[${value.length}]`;
  return "";
};

function tableRows(output: Record<string, unknown>, key: string): {head: string[]; rows: string[][]} | null {
  const value = output[key];
  if (!Array.isArray(value) || value.length === 0 || !isRecord(value[0])) return null;
  const head = Object.keys(value[0] as Record<string, unknown>).filter((column) => {
    const sample = (value[0] as Record<string, unknown>)[column];
    return typeof sample !== "object" || sample === null || (isRecord(sample) && (typeof sample.value === "string" || typeof sample.document === "string"));
  }).slice(0, 10);
  return {head, rows: value.slice(0, 60).map((row) => head.map((column) => formatCell((row as Record<string, unknown>)[column])))};
}

const tableKeys: Record<string, {key: string; caption: {pt: string; en: string}}[]> = {
  preview_debt_ledger: [{key: "ledger_rows", caption: {pt: "Dívida instrumento a instrumento", en: "Debt instrument by instrument"}}],
  preview_maturity_wall: [{key: "walls", caption: {pt: "Vencimentos", en: "Maturities"}}],
  preview_interest_schedule: [{key: "schedule_by_series", caption: {pt: "Juros e correção por série", en: "Interest and indexation by series"}}],
  preview_exit_costs: [{key: "exit_costs", caption: {pt: "Custo de saída por série", en: "Exit cost by series"}}],
  preview_alternatives: [{key: "alternatives", caption: {pt: "Alternativas antes e depois", en: "Alternatives before and after"}}],
  preview_covenants: [{key: "covenants", caption: {pt: "Covenants", en: "Covenants"}}],
};

export async function GET(request: Request, {params}: Params) {
  const {locale, projectId} = await params;
  const lang = locale === "en-US" ? "en" : "pt";
  const format = new URL(request.url).searchParams.get("format") === "xlsx" ? "xlsx" : "docx";
  const {supabase, organization} = await requireWorkspace(locale);
  const status = await loadIntegrationPreviewStatus(supabase, organization.id);
  if (!integrationPreviewCoversProject(status, projectId)) return new Response("Not found", {status: 404});

  const {data} = await supabase.from("capital_project_artifacts")
    .select("id, artifact_type, artifact_version, status, artifact_fingerprint, content, created_at")
    .eq("organization_id", organization.id).eq("capital_project_id", projectId)
    .like("artifact_type", "preview\\_%").neq("status", "superseded")
    .order("created_at", {ascending: false});
  const artifacts = (data ?? []) as ArtifactRow[];
  const latestByType = new Map<string, ArtifactRow>();
  for (const artifact of artifacts) if (!latestByType.has(artifact.artifact_type)) latestByType.set(artifact.artifact_type, artifact);
  const material = latestByType.get("preview_material");
  if (!material) return new Response(lang === "pt" ? "A síntese ainda não foi produzida." : "The synthesis has not been produced yet.", {status: 409});
  const materialContent = isRecord(material.content) ? material.content : {};
  const synthesis = isRecord(materialContent.output) ? materialContent.output : {};
  const sections = Array.isArray(synthesis.sections) ? synthesis.sections as Array<{id: string; title: string; paragraphs: Array<{text: string; references: string[]}>}> : [];
  const source = isRecord(synthesis.source) ? synthesis.source : {};
  const numbers = isRecord(synthesis.numbers) ? synthesis.numbers : {};
  const changeNote = Array.isArray(synthesis.change_note) ? synthesis.change_note as string[] : [];
  const headers = {
    "x-preview-artifact-version": String(material.artifact_version),
    "x-preview-artifact-fingerprint": material.artifact_fingerprint,
    "cache-control": "private, no-store",
  };

  if (format === "xlsx") {
    const workbook = XLSX.utils.book_new();
    const synthesisRows = [["Seção", "Parágrafo", "Referências"], ...sections.flatMap((section) => section.paragraphs.map((paragraph) => [section.title, paragraph.text, paragraph.references.join(", ")]))];
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(synthesisRows), lang === "pt" ? "Síntese" : "Synthesis");
    for (const [type, tables] of Object.entries(tableKeys)) {
      const artifact = latestByType.get(type);
      const output = artifact && isRecord(artifact.content) && isRecord(artifact.content.output) ? artifact.content.output : null;
      if (!output) continue;
      for (const table of tables) {
        const rows = tableRows(output, table.key);
        if (!rows) continue;
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([rows.head, ...rows.rows]), table.caption[lang].slice(0, 31));
      }
    }
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
      ["Validação interna", "integration_preview"],
      ["Artefato", material.id], ["Versão", String(material.artifact_version)], ["Fingerprint", material.artifact_fingerprint],
      ["Fonte da síntese", String(source.kind ?? "")], ["Modelo", String(source.model ?? "")], ["Custo (US$)", String(source.costUsd ?? 0)],
      ["Números verificados", String(numbers.verified ?? 0)], ["Frases removidas", String(Array.isArray(numbers.removed) ? numbers.removed.length : 0)],
      ...changeNote.map((note) => ["Mudança", note]),
    ]), lang === "pt" ? "Origem" : "Provenance");
    const bytes = XLSX.write(workbook, {type: "array", bookType: "xlsx"}) as ArrayBuffer;
    return new Response(new Uint8Array(bytes), {headers: {...headers, "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "content-disposition": `attachment; filename="material-preview-${projectId.slice(0, 8)}-v${material.artifact_version}.xlsx"`}});
  }

  const blocks: MaterialBlock[] = [
    {type: "callout", title: {pt: "Validação interna", en: "Internal validation"}, items: [
      {label: {pt: "Modo", en: "Mode"}, value: {pt: "integration_preview", en: "integration_preview"}},
      {label: {pt: "Fonte da síntese", en: "Synthesis source"}, value: {pt: String(source.kind ?? ""), en: String(source.kind ?? "")}},
      {label: {pt: "Modelo", en: "Model"}, value: {pt: String(source.model ?? "nenhum"), en: String(source.model ?? "none")}},
      {label: {pt: "Números verificados", en: "Numbers verified"}, value: {pt: String(numbers.verified ?? 0), en: String(numbers.verified ?? 0)}},
      {label: {pt: "Frases removidas", en: "Sentences removed"}, value: {pt: String(Array.isArray(numbers.removed) ? numbers.removed.length : 0), en: String(Array.isArray(numbers.removed) ? numbers.removed.length : 0)}},
      {label: {pt: "Versão do artefato", en: "Artifact version"}, value: {pt: String(material.artifact_version), en: String(material.artifact_version)}},
    ]},
    ...sections.flatMap((section): MaterialBlock[] => [
      {type: "heading", text: {pt: section.title, en: section.title}},
      ...section.paragraphs.map((paragraph): MaterialBlock => ({type: "paragraph", text: {pt: paragraph.text, en: paragraph.text}, supportIds: paragraph.references})),
    ]),
    ...(changeNote.length ? [{type: "list" as const, items: changeNote.map((note) => ({pt: note, en: note}))}] : []),
  ];
  for (const [type, tables] of Object.entries(tableKeys)) {
    const artifact = latestByType.get(type);
    const output = artifact && isRecord(artifact.content) && isRecord(artifact.content.output) ? artifact.content.output : null;
    if (!output) continue;
    for (const table of tables) {
      const rows = tableRows(output, table.key);
      if (rows) blocks.push({type: "table", caption: table.caption, head: rows.head.map((column) => ({pt: column, en: column})), rows: rows.rows.slice(0, 25)});
    }
  }
  blocks.push({type: "disclaimer", text: {
    pt: "Validação interna. Métodos em estágio implemented, sem revisão independente aprovada; nada aqui é liberação, parecer ou aprovação. Toda frase com número que os objetos não sustentam foi removida antes da emissão.",
    en: "Internal validation. Methods in the implemented rung, without an approved independent review; nothing here is a release, an opinion or an approval. Every sentence with a number the objects do not hold was removed before issue.",
  }});
  const document: Material = {kind: "credit_memo", title: {pt: "Síntese interna do Caso 01 (validação)", en: "Case 01 internal synthesis (validation)"}, blocks, dependsOn: [material.artifact_fingerprint]};
  const bytes = materialToDocx({material: document, lang, meta: {issuedOn: new Date().toISOString().slice(0, 10), preparedBy: "Offroad Capital, validação interna"}});
  return new Response(new Uint8Array(bytes), {headers: {...headers, "content-type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "content-disposition": `attachment; filename="material-preview-${projectId.slice(0, 8)}-v${material.artifact_version}.docx"`}});
}
