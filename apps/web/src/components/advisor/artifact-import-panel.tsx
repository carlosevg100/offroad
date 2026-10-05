"use client";

import {useCallback, useEffect, useRef, useState} from "react";
import {useTranslations} from "next-intl";
import {z} from "zod";
import {createClient} from "@/lib/supabase/client";
import {artifactImportCandidateSchema} from "@/lib/artifacts/artifact-import-schema";
import {continuationBaseRowSchema} from "@/lib/advisor/work-update-view";
import {ArtifactImportReview, type ArtifactImportReviewCommand, type ArtifactImportReviewView} from "./artifact-import-review";

const setupSchema = z.object({legal_document: z.object({title: z.string(), rendered_text: z.string(), acceptance_statement: z.string(), information_rights_statement: z.string()}).nullable()});
const contextSchema = z.object({ok: z.literal(true), workId: z.uuid(), headRevisionId: z.uuid(), blockKeys: z.array(z.string()), bases: z.array(continuationBaseRowSchema), receipts: z.array(z.object({id: z.uuid(), revisionId: z.uuid(), format: z.enum(["xlsx", "docx", "pptx"]), issuedAt: z.string()})), terms: setupSchema, candidates: z.array(z.object({candidate: artifactImportCandidateSchema, view: z.custom<ArtifactImportReviewView>(value => typeof value === "object" && value !== null && "id" in value)}))});
type ImportContext = z.infer<typeof contextSchema>;
const preparedSchema = z.object({ok: z.literal(true), sessionId: z.uuid(), sourceVersionId: z.uuid(), bucket: z.literal("opportunity-documents"), objectPath: z.string().min(1)});
/** Reads and commands use current authority; the browser only carries uploaded bytes and explicit
 * human choices. An uploaded value is never a result, approval or verified support. */
export function ArtifactImportPanel({locale, workId, artifactId}: {locale: "pt-BR" | "en-US"; workId: string; artifactId: string}) {
  const t = useTranslations("ArtifactImportPanel");
  const endpoint = `/${locale}/app/artifacts/${artifactId}/imports`;
  const [context, setContext] = useState<ImportContext | null>(null), [error, setError] = useState(false), [busy, setBusy] = useState(false);
  const [file, setFile] = useState<File | null>(null), [receiptId, setReceiptId] = useState("");
  const [name, setName] = useState(""), [title, setTitle] = useState(""), [agreed, setAgreed] = useState(false), [rights, setRights] = useState(false);
  const [basisId, setBasisId] = useState(""), [discardReason, setDiscardReason] = useState("");
  const [exportBusy, setExportBusy] = useState(false), [exportTask, setExportTask] = useState<string | null>(null), [readyReceipt, setReadyReceipt] = useState<string | null>(null), [exportFormat, setExportFormat] = useState<"xlsx" | "docx" | "pptx">("xlsx");
  const exportCommand = useRef<{key: string; id: string} | null>(null);
  const [group, setGroup] = useState<Record<string, string>>({}), [rebase, setRebase] = useState<Record<string, boolean>>({});
  const [mappings, setMappings] = useState<Record<string, string>>({});
  const attempt = useRef<{file: File; receipt: string; request: Record<string, unknown>; prepared: z.infer<typeof preparedSchema> | null; uploaded: boolean} | null>(null);
  const refresh = useCallback(async () => {
    try {const response = await fetch(endpoint, {cache: "no-store"}); const parsed = contextSchema.safeParse(await response.json()); if (!response.ok || !parsed.success || parsed.data.workId !== workId) throw new Error(); setContext(parsed.data); setError(false);} catch {setError(true);}
  }, [endpoint, workId]);
  useEffect(() => {const timer = setTimeout(() => void refresh(), 0); return () => clearTimeout(timer);}, [refresh]);
  const hasQueued = context?.candidates.some(row => row.candidate.status === "queued");
  useEffect(() => {if (!hasQueued) return; const timer = setInterval(() => void refresh(), 3000); return () => clearInterval(timer);}, [hasQueued, refresh]);
  async function requestExport() {
    if (!context || exportBusy) return; setExportBusy(true); setError(false);
    const key = `${context.headRevisionId}:${exportFormat}`; if (exportCommand.current?.key !== key) exportCommand.current = {key, id: crypto.randomUUID()};
    try {const response = await fetch(`/${locale}/app/artifacts/${artifactId}/exports`, {method: "POST", headers: {"content-type": "application/json"}, body: JSON.stringify({revisionId: context.headRevisionId, format: exportFormat, commandId: exportCommand.current.id})});const data = await response.json();const result = z.object({receiptId: z.uuid().nullable(), taskId: z.uuid().optional()}).safeParse(data.result);if (!response.ok || !result.success) throw new Error();setReadyReceipt(result.data.receiptId);setExportTask(result.data.taskId ?? null);} catch {setError(true);} finally {setExportBusy(false);}
  }
  useEffect(() => {if (!exportTask || readyReceipt) return; const timer = setInterval(async () => {try {const response = await fetch(`/${locale}/app/artifacts/${artifactId}/exports?taskId=${exportTask}`, {cache: "no-store"});const data = await response.json();const result = z.object({status: z.string(), receiptId: z.uuid().nullable()}).safeParse(data.task);if (!response.ok || !result.success) throw new Error();if (result.data.receiptId) {setReadyReceipt(result.data.receiptId);setExportTask(null);void refresh();} else if (["failed", "cancelled"].includes(result.data.status)) {setExportTask(null);setError(true);}} catch {setExportTask(null);setError(true);}}, 3000); return () => clearInterval(timer);}, [exportTask, readyReceipt, artifactId, locale, refresh]);
  async function command(candidateId: string, input: Record<string, unknown>) {
    const response = await fetch(`${endpoint}/${candidateId}/decide`, {method: "POST", headers: {"content-type": "application/json"}, body: JSON.stringify(input)});
    const result = await response.json();
    if (response.ok && result.ok) {await refresh(); return {ok: true} as const;}
    return {ok: false, error: ["denied", "changed"].includes(result.error) ? result.error as "denied" | "changed" : "save" as const} as const;
  }
  async function decide(input: ArtifactImportReviewCommand) {
    const row = context?.candidates.find(row => row.candidate.candidateId === input.candidateId), basis = context?.bases.find(base => base.milestoneId === basisId);
    if (!row || row.candidate.withheld) return {ok: false, error: "denied"} as const;
    if (input.act === "discard") return command(input.candidateId, {act: "discard", commandId: input.commandId, reason: discardReason});
    if (!basis || !row.candidate.comparisonFingerprint) return {ok: false, error: "changed"} as const;
    return command(input.candidateId, {act: "apply", commandId: input.commandId, expectedHeadRevisionId: row.candidate.currentHeadRevisionId, comparisonFingerprint: row.candidate.comparisonFingerprint, choices: input.choices, selfApprovalDeclared: input.selfApprovalDeclared, configurationId: group[input.candidateId] || null, rebaseDeclared: rebase[input.candidateId] === true, continuationBasis: {milestoneId: basis.milestoneId, decisionId: basis.decisionId, revision: basis.revision}});
  }
  async function upload() {
    if (!context?.terms.legal_document || !file || busy || !agreed || !rights || name.trim().length < 2) return;
    const format = file.name.split(".").at(-1)?.toLowerCase();
    if (!["xlsx", "docx", "pptx"].includes(format ?? "") || file.size < 1 || file.size > 52428800) {setError(true); return;}
    setBusy(true); setError(false);
    try {
      if (!attempt.current || attempt.current.file !== file || attempt.current.receipt !== receiptId) {
        const sha256 = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", await file.arrayBuffer())), byte => byte.toString(16).padStart(2, "0")).join("");
        attempt.current = {file, receipt: receiptId, request: {workId, headRevisionId: context.headRevisionId, candidateId: crypto.randomUUID(), commandId: crypto.randomUUID(), exportReceiptId: receiptId || null, fileName: file.name, format, byteLength: file.size, sha256, terms: {signatoryName: name, signatoryTitle: title, termsAgreed: agreed, informationRightsDeclared: rights}}, prepared: null, uploaded: false};
      }
      const current = attempt.current;
      if (!current.prepared) {
        const response = await fetch(`${endpoint}/upload`, {method: "POST", headers: {"content-type": "application/json"}, body: JSON.stringify(current.request)});
        const parsed = preparedSchema.safeParse(await response.json()); if (!response.ok || !parsed.success) throw new Error(); current.prepared = parsed.data;
      }
      if (!current.uploaded) {const client = createClient(); if (!client) throw new Error(); const result = await client.storage.from(current.prepared.bucket).upload(current.prepared.objectPath, file, {upsert: false}); if (result.error) throw new Error(); current.uploaded = true;}
      const response = await fetch(endpoint, {method: "POST", headers: {"content-type": "application/json"}, body: JSON.stringify({...current.request, sessionId: current.prepared.sessionId, sourceVersionId: current.prepared.sourceVersionId})});
      if (!response.ok) throw new Error(); attempt.current = null; setFile(null); await refresh();
    } catch {setError(true);} finally {setBusy(false);}
  }
  const legal = context?.terms.legal_document;
  return <section data-testid="artifact-import-panel" aria-busy={busy}>
    <h3>{t("title")}</h3><p>{t("scope")}</p>
    <label>{t("exportFormat")}<select value={exportFormat} disabled={exportBusy || Boolean(exportTask)} onChange={event => setExportFormat(event.target.value as "xlsx" | "docx" | "pptx")}>{(["xlsx", "docx", "pptx"] as const).map(format => <option key={format}>{format}</option>)}</select></label>
    <button disabled={!context || exportBusy || Boolean(exportTask)} onClick={() => void requestExport()}>{t("export")}</button>
    {exportTask ? <p role="status">{t("exportQueued")}</p> : null}
    {readyReceipt ? <a href={`/${locale}/app/artifacts/${artifactId}/exports?receiptId=${readyReceipt}`}>{t("download")}</a> : null}
    {legal ? <details><summary>{legal.title}</summary><p style={{whiteSpace: "pre-wrap"}}>{legal.rendered_text}</p></details> : <p>{t("unavailable")}</p>}
    <label>{t("name")}<input value={name} onChange={event => setName(event.target.value)} disabled={busy}/></label>
    <label>{t("role")}<input value={title} onChange={event => setTitle(event.target.value)} disabled={busy}/></label>
    {legal ? <><label><input type="checkbox" checked={agreed} onChange={event => setAgreed(event.target.checked)} disabled={busy}/>{legal.acceptance_statement}</label><label><input type="checkbox" checked={rights} onChange={event => setRights(event.target.checked)} disabled={busy}/>{legal.information_rights_statement}</label></> : null}
    <label>{t("receipt")}<select value={receiptId} onChange={event => setReceiptId(event.target.value)} disabled={busy}><option value="">{t("noReceipt")}</option>{context?.receipts.map(receipt => <option key={receipt.id} value={receipt.id}>{receipt.format.toUpperCase()} · {receipt.issuedAt}</option>)}</select></label>
    <label>{t("file")}<input type="file" accept=".xlsx,.docx,.pptx" disabled={busy} onChange={event => setFile(event.target.files?.[0] ?? null)}/></label>
    <button disabled={busy || !legal || !file || !agreed || !rights || name.trim().length < 2} onClick={() => void upload()}>{t("upload")}</button>
    <label>{t("basis")}<select value={basisId} onChange={event => setBasisId(event.target.value)}><option value="">{t("chooseBasis")}</option>{context?.bases.map(base => <option key={base.milestoneId} value={base.milestoneId}>{base.label} · {base.revision}</option>)}</select></label>
    <label>{t("discardReason")}<textarea value={discardReason} onChange={event => setDiscardReason(event.target.value)}/></label>
    {context?.candidates.map(row => <div key={row.candidate.candidateId}>{!row.candidate.withheld && (row.candidate.contributions?.assumptionChanges.some(change => change.configurationId) || row.candidate.pendingConfigurationIds.length) ? <fieldset><legend>{t("group")}</legend><select value={group[row.candidate.candidateId] ?? ""} onChange={event => setGroup(previous => ({...previous, [row.candidate.candidateId]: event.target.value}))}><option value="">{t("chooseGroup")}</option>{[...new Set(row.candidate.contributions?.assumptionChanges.flatMap(change => change.configurationId ? [change.configurationId] : []) ?? [])].map(id => <option key={id} value={id}>{row.candidate.withheld ? "" : row.candidate.groups.find(item => item.configurationId === id)?.label ?? t("unnamedGroup")}</option>)}</select><label><input type="checkbox" checked={rebase[row.candidate.candidateId] === true} onChange={event => setRebase(previous => ({...previous, [row.candidate.candidateId]: event.target.checked}))}/>{t("rebase")}</label><p>{t("pendingGroups", {count: row.candidate.pendingConfigurationIds.length})}</p></fieldset> : null}<ArtifactImportReview key={`${row.candidate.candidateId}:${row.candidate.withheld ? "withheld" : row.candidate.comparisonFingerprint}:${basisId}:${group[row.candidate.candidateId] ?? ""}:${rebase[row.candidate.candidateId] === true}`} candidate={{...row.view, canApply: row.view.canApply && Boolean(basisId) && (row.candidate.withheld || !row.candidate.contributions?.assumptionChanges.some(change => change.configurationId) || Boolean(group[row.candidate.candidateId])), canDiscard: row.view.canDiscard && discardReason.trim().length >= 2}} onDecide={decide}/>{row.candidate.status === "unmatched" && !row.candidate.withheld ? <fieldset><legend>{t("unmatched")}</legend>
      <button disabled={discardReason.trim().length < 2} onClick={() => void command(row.candidate.candidateId, {act: "keep_source", commandId: crypto.randomUUID(), reason: discardReason})}>{t("keepSource")}</button>
      <p>{t("mappingScope")}</p>
      {row.candidate.comparison?.differences.filter(item => item.classification === "unmatched" && item.received?.role === "text").map(item => <label key={item.key}>{item.received?.value}<select value={mappings[`${row.candidate.candidateId}:${item.key}`] ?? ""} onChange={event => setMappings(previous => ({...previous, [`${row.candidate.candidateId}:${item.key}`]: event.target.value}))}><option value="">{t("chooseBlock")}</option>{context.blockKeys.map(key => <option key={key} value={key}>{key}</option>)}</select></label>)}
      <button disabled={!receiptId || !Object.keys(mappings).some(key => key.startsWith(`${row.candidate.candidateId}:`) && mappings[key])} onClick={() => void command(row.candidate.candidateId, {act: "match", commandId: crypto.randomUUID(), exportReceiptId: receiptId, expectedHeadRevisionId: context.headRevisionId, mappings: Object.entries(mappings).filter(([key, block]) => key.startsWith(`${row.candidate.candidateId}:`) && block).map(([key, blockKey]) => ({receivedKey: key.slice(row.candidate.candidateId.length + 1), blockKey}))})}>{t("match")}</button>
    </fieldset> : null}{row.candidate.status === "stale" && !row.candidate.withheld ? <button onClick={() => void command(row.candidate.candidateId, {act: "recompare", commandId: crypto.randomUUID(), expectedHeadRevisionId: context.headRevisionId})}>{t("recompare")}</button> : null}</div>)}
    {error ? <p role="alert">{t("error")}</p> : null}
  </section>;
}
