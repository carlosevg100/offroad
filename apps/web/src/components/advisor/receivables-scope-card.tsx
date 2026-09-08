"use client";
import {useRef, useState, type FormEvent} from "react";
import {useRouter} from "next/navigation";
import type {ReceivablesEvidenceScopeContext} from "@offroad/receivables-analysis";
import {confirmReceivablesScope} from "@/app/[locale]/app/projects/[projectId]/actions";
export type ReceivablesScopeCopy = Record<"title" | "body" | "primary" | "support" | "date" | "declaration" | "confirm" | "pending" | "saved" | "current" | "stale" | "unavailable" | "refresh" | "noSupport" | "invalid" | "denied" | "processing" | "save" | "unnamedSource" | "sheet" | "headerRow" | "version", string>;
export function ReceivablesScopeCard({context, copy, locale, projectId, sessionId}: {context: ReceivablesEvidenceScopeContext; copy: ReceivablesScopeCopy; locale: "pt-BR" | "en-US"; projectId: string; sessionId: string}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const command = useRef<{payload: string; id: string} | null>(null);
  const tapeDocuments = new Set(context.candidates.map((candidate) => candidate.documentId));
  const supports = context.sourceManifest?.sources.filter((source) => !tapeDocuments.has(source.sourceDocumentId)) ?? [];
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !context.sourceManifest) return;
    const form = new FormData(event.currentTarget);
    const selection = form.get("primaryTape");
    const index = typeof selection === "string" && /^\d+$/.test(selection) ? Number(selection) : -1;
    const candidate = Number.isSafeInteger(index) && index >= 0 ? context.candidates[index] : undefined;
    if (!candidate || form.get("scopeConfirmed") !== "yes") {setError(copy.invalid); return;}
    const payload = {locale, projectId, sessionId, manifestFingerprint: context.sourceManifest.fingerprint, primaryTape: {documentId: candidate.documentId, sheet: candidate.sheet, headerRow: candidate.headerRow}, complementDocumentIds: form.getAll("complementDocumentIds").map(String), reportingDate: String(form.get("reportingDate") ?? "")};
    const key = JSON.stringify(payload);
    if (command.current?.payload !== key) command.current = {payload: key, id: crypto.randomUUID()};
    setPending(true); setError(null);
    try {
      const result = await confirmReceivablesScope({...payload, commandId: command.current.id});
      if (!result.ok) {setError(copy[result.code ?? "save"]); return;}
      setSaved(true); router.refresh();
    } catch {setError(copy.save);} finally {setPending(false);}
  }
  return <section className="information-request-card receivables-scope-card" data-testid="receivables-scope-card" data-scope-state={context.state} style={{minWidth: 0, overflowWrap: "anywhere"}}>
    <h3>{copy.title}</h3><p>{copy.body}</p>
    {context.state === "current" && context.scope ? <p role="status">{copy.current} · {context.scope.reportingDate}</p> : null}
    {context.state === "stale" ? <p role="status">{copy.stale}</p> : null}
    {saved ? <p role="status" data-testid="receivables-scope-saved">{copy.saved}</p> : null}
    {context.state === "unavailable" || !context.sourceManifest || !context.candidates.length ? <p>{copy.unavailable}</p> : <form key={`${context.sourceManifest.fingerprint}:${context.scope?.fingerprint ?? "new"}`} onSubmit={submit} data-testid="receivables-scope-form">
      <fieldset disabled={pending || saved} style={{minWidth: 0}}><legend>{copy.primary}</legend>
        {context.candidates.map((candidate, index) => <label key={`${candidate.documentId}:${candidate.sheet}:${candidate.headerRow}`} style={{display: "block", marginBlock: 12}}><input type="radio" name="primaryTape" value={index} required defaultChecked={context.scope?.primaryTape.documentId === candidate.documentId && context.scope.primaryTape.sheet === candidate.sheet && context.scope.primaryTape.headerRow === candidate.headerRow} /> <strong>{candidate.fileName}</strong><small style={{display: "block", marginLeft: 20, marginTop: 4}}>{copy.sheet} {candidate.sheet} · {copy.headerRow} {candidate.headerRow}</small></label>)}
      </fieldset>
      <fieldset disabled={pending || saved} style={{minWidth: 0}}><legend>{copy.support}</legend>
        {supports.length ? supports.map((source) => <label key={source.sourceDocumentId} style={{display: "block", marginBlock: 12}}><input type="checkbox" name="complementDocumentIds" value={source.sourceDocumentId} defaultChecked={context.scope?.complementDocumentIds.includes(source.sourceDocumentId)} /> <strong>{source.fileName ?? copy.unnamedSource}</strong><small style={{display: "block", marginLeft: 20, marginTop: 4}}>{copy.version} {source.documentVersion}</small></label>) : <p>{copy.noSupport}</p>}
      </fieldset>
      <label style={{display: "block", marginBlock: 16}}>{copy.date}<input name="reportingDate" type="date" required disabled={pending || saved} defaultValue={context.scope?.reportingDate} style={{display: "block", maxWidth: "100%"}} /></label>
      <label style={{display: "block", marginBlock: 16}}><input name="scopeConfirmed" type="checkbox" value="yes" required disabled={pending || saved} /> {copy.declaration}</label>
      <button className="button" type="submit" disabled={pending || saved}>{pending ? copy.pending : copy.confirm}</button>
    </form>}
    {error ? <p role="alert">{error}</p> : null}
    <button className="button button--ghost" type="button" onClick={() => router.refresh()} disabled={pending}>{copy.refresh}</button>
  </section>;
}
