"use client";
import {useState, useTransition} from "react";
import {useFormatter, useTranslations} from "next-intl";
import {loadVault, loadVaultReceipts, loadVaultReferenceDetail, loadVaultPeople, designateVaultAccess, loadVaultReferences, loadVaultHistory, saveVaultVersion, proposeVaultPublication, publishVaultVersion, withdrawVaultPublication} from "@/app/[locale]/app/vault/actions";
import type {VaultPage, VaultRow, VaultState} from "@/lib/advisor/vault";

type Purpose = "analysis" | "retrieval" | "export";
type Reference = {id: string; title: string; revision: number | null};
export function VaultWorkspace({locale, initialPage, workId = null}: {locale: string; initialPage: VaultPage; workId?: string | null}) {
  const t = useTranslations("Vault"); const format = useFormatter();
  const [page, setPage] = useState(initialPage); const [mode, setMode] = useState<"published" | "candidates">("published");
  const [purpose, setPurpose] = useState<Purpose>("analysis"); const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<VaultRow | "new" | null>(null); const [review, setReview] = useState<VaultRow | null>(null);
  const [people, setPeople] = useState<Awaited<ReturnType<typeof loadVaultPeople>> | null>(null);
  const [peopleSearch, setPeopleSearch] = useState(""); const [status, setStatus] = useState(""); const [pending, start] = useTransition();
  async function refresh(nextMode = mode, nextPurpose = purpose, offset = 0) {
    setPage(await loadVault({locale, search, offset, mode: nextMode, purpose: nextPurpose, workId}));
  }
  function run(action: () => Promise<void>) {start(async () => {setStatus("");try {await action();} catch {setStatus(t("errors.save"));}});}
  async function command(action: () => Promise<VaultState>) {
    const result = await action(); if (!result.ok) {setStatus(t(`errors.${result.error}`));return false;}
    setStatus(t("saved")); await refresh(); return true;
  }
  return <section className="vault-workspace" aria-label={t("title")}>
    <div className="vault-toolbar"><div role="group" aria-label={t("view")}>
      {(["published", "candidates"] as const).map(value => <button key={value} aria-pressed={mode === value} disabled={pending} onClick={() => run(async () => {setMode(value);await refresh(value);})}>{t(value)}</button>)}
    </div><button disabled={pending} onClick={() => setEditing("new")}>{t("create")}</button>
      {page.canAdminister && <button disabled={pending} onClick={() => run(async () => setPeople(await loadVaultPeople({locale, resourceId: page.scopeId, search: "", offset: 0})))}>{t("people")}</button>}
    </div>
    <p className="vault-notice">{t(mode === "published" ? "publishedNotice" : "candidatesNotice")}</p>
    <form className="vault-toolbar" onSubmit={e => {e.preventDefault();run(() => refresh());}}>
      <label>{t("search")}<input value={search} maxLength={160} onChange={e => setSearch(e.target.value)} /></label>
      <label>{t("purpose")}<select value={purpose} onChange={e => {const p = e.target.value as Purpose;setPurpose(p);run(() => refresh(mode,p));}}>{(["analysis", "retrieval", "export"] as const).map(p => <option key={p} value={p}>{t(`purposes.${p}`)}</option>)}</select></label>
      <button disabled={pending}>{t("search")}</button>
    </form>
    {status && <p role="status">{status}</p>}
    {editing && <VaultEditor key={editing === "new" ? "new" : editing.version_id} locale={locale} row={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={() => run(async () => {setEditing(null);setMode("candidates");await refresh("candidates");})} />}
    {review && <VaultReview key={review.version_id} locale={locale} row={review} workId={workId} onClose={() => setReview(null)} onSaved={() => run(async () => {setReview(null);await refresh();})} />}
    {!page.rows.length && <p className="vault-empty">{t("empty")}</p>}
    <div className="vault-list">{page.rows.slice(0,25).map(row => <article className="vault-card" key={row.version_id}>
      <div className="vault-card-heading"><span>{t(`kinds.${row.kind}`)}</span><span>{t(row.is_official ? "official" : "candidate")}</span></div>
      <h2>{row.title}</h2><p>{t("version", {number: row.revision})} · {format.dateTime(new Date(row.created_at), {dateStyle: "medium"})}</p>
      <p>{row.created_by ? t("author", {name: row.author_name ?? row.created_by}) : t("historical")}</p>
      {row.directive_text && <p className="vault-content">{row.directive_text}</p>}
      {row.is_official && <p>{t("publishedBy", {name: row.publisher_name ?? ""})} · {t(`purposes.${row.purpose ?? "analysis"}`)}</p>}
      <div className="vault-toolbar">
        {row.can_edit && <button onClick={() => setEditing(row)}>{t("newVersion")}</button>}
        {(row.can_edit || row.can_publish) && mode === "candidates" && <button onClick={() => setReview(row)}>{t("review")}</button>}
        <VaultHistory locale={locale} entryId={row.entry_id} />
      </div>
      {row.can_publish && row.publication_id && <form className="vault-toolbar" onSubmit={e => {e.preventDefault();const form = new FormData(e.currentTarget);run(async () => {await command(() => withdrawVaultPublication({locale, publicationId: row.publication_id, reason: form.get("reason")}));});}}>
        <label>{t("withdrawReason")}<input name="reason" required minLength={5} maxLength={2000} /></label><button disabled={pending}>{t("withdraw")}</button>
      </form>}
    </article>)}</div>
    <div className="vault-toolbar"><button disabled={pending || page.offset === 0} onClick={() => run(() => refresh(mode,purpose,Math.max(0,page.offset-25)))}>{t("previous")}</button><button disabled={pending || page.rows.length <= 25} onClick={() => run(() => refresh(mode,purpose,page.offset+25))}>{t("next")}</button></div>
    <VaultReceipts locale={locale} onChanged={() => run(() => refresh())} />
    {people && <section className="vault-card"><h2>{t("people")}</h2><p>{t("peopleNotice")}</p>
      <form className="vault-toolbar" onSubmit={e => {e.preventDefault();run(async () => setPeople(await loadVaultPeople({locale,resourceId:page.scopeId,search:peopleSearch,offset:0})));}}><label>{t("searchPeople")}<input value={peopleSearch} maxLength={160} onChange={e => setPeopleSearch(e.target.value)} /></label><button disabled={pending}>{t("search")}</button></form>
      {people.rows.slice(0,25).map(person => <div className="vault-person" key={person.user_id}><span>{person.name}</span>{(["read", "publish"] as const).map(action => <button key={action} disabled={pending} aria-pressed={action === "read" ? person.can_read : person.can_publish} onClick={() => run(async () => {
        const enabled = action === "read" ? person.can_read : person.can_publish;
        if (await command(() => designateVaultAccess({locale,resourceId:page.scopeId,userId:person.user_id,action,effect:enabled ? "deny" : "allow"}))) setPeople(await loadVaultPeople({locale,resourceId:page.scopeId,search:peopleSearch,offset:people.offset}));
      })}>{t(action === "read" ? person.can_read ? "removeReader" : "addReader" : person.can_publish ? "removePublisher" : "addPublisher")}</button>)}</div>)}
      <div className="vault-toolbar"><button disabled={pending || people.offset === 0} onClick={() => run(async () => setPeople(await loadVaultPeople({locale,resourceId:page.scopeId,search:peopleSearch,offset:Math.max(0,people.offset-25)})))}>{t("previous")}</button><button disabled={pending || people.rows.length <= 25} onClick={() => run(async () => setPeople(await loadVaultPeople({locale,resourceId:page.scopeId,search:peopleSearch,offset:people.offset+25})))}>{t("next")}</button><button onClick={() => setPeople(null)}>{t("close")}</button></div>
    </section>}
  </section>;
}
function VaultReferencePicker({locale, kind, onSelect}: {locale: string; kind: "source" | "adoption" | "template" | "work"; onSelect: (r: Reference) => void}) {
  const t = useTranslations("Vault"); const [search,setSearch] = useState(""); const [offset,setOffset] = useState(0);
  const [result,setResult] = useState<{rows: Reference[]; more: boolean} | null>(null); const [error,setError] = useState(false); const [pending,start] = useTransition();
  function load(n: number) {start(async () => {setError(false);try {setResult(await loadVaultReferences({locale,kind,search,offset:n}));setOffset(n);} catch {setError(true);}});}
  return <fieldset className="vault-picker"><legend>{t("selectReference")}</legend><label>{t("search")}<input value={search} onChange={e => setSearch(e.target.value)} maxLength={160} /></label><button type="button" disabled={pending} onClick={() => load(0)}>{t("search")}</button>
    {error && <p role="alert">{t("errors.save")}</p>}{result?.rows.map(r => <button type="button" key={r.id} onClick={() => onSelect(r)}>{r.title}{r.revision !== null ? ` · ${t("version",{number:r.revision})}` : ""}</button>)}
    {result && !result.rows.length && <p>{t("empty")}</p>}
    <button type="button" disabled={pending || offset === 0} onClick={() => load(Math.max(0,offset-25))}>{t("previous")}</button><button type="button" disabled={pending || !result?.more} onClick={() => load(offset+25)}>{t("next")}</button>
  </fieldset>;
}
function VaultEditor({locale,row,onClose,onSaved}: {locale: string; row: VaultRow | null; onClose: () => void; onSaved: () => void}) {
  const t = useTranslations("Vault"); const [kind,setKind] = useState<VaultRow["kind"]>(row?.kind ?? "directive");
  const [title,setTitle] = useState(row?.title ?? ""); const [text,setText] = useState(row?.directive_text ?? "");
  const [reference,setReference] = useState<Reference | null>(row && row.kind !== "directive" ? {id:(row.source_version_id ?? row.assumption_version_id ?? row.presentation_template_id)!,title:row.title,revision:null} : null);
  const [sources,setSources] = useState<Reference[]>([]); const [status,setStatus] = useState(""); const [pending,start] = useTransition();
  const [ids] = useState(() => ({entry:row?.entry_id ?? crypto.randomUUID(),version:crypto.randomUUID()}));
  return <section className="vault-card vault-editor"><h2>{t(row ? "newVersion" : "create")}</h2><p>{t("candidateNotice")}</p>
    <form onSubmit={e => {e.preventDefault();start(async () => {try {
      const result = await saveVaultVersion({locale,entryId:ids.entry,versionId:ids.version,expectedVersionId:row?.version_id ?? null,kind,title,text:kind === "directive" ? text : null,referenceId:kind === "directive" ? null : reference?.id ?? null,sourceVersionIds:sources.map(s => s.id)});
      if (!result.ok) setStatus(t(`errors.${result.error}`)); else onSaved();
    } catch {setStatus(t("errors.save"));}});}}>
      <label>{t("kind")}<select value={kind} disabled={!!row} onChange={e => {setKind(e.target.value as VaultRow["kind"]);setReference(null);}}>{(["directive","source","adoption","template"] as const).map(k => <option key={k} value={k}>{t(`kinds.${k}`)}</option>)}</select></label>
      <label>{t("entryTitle")}<input required maxLength={180} value={title} onChange={e => setTitle(e.target.value)} /></label>
      {kind === "directive" ? <label>{t("text")}<textarea required maxLength={32000} rows={7} value={text} onChange={e => setText(e.target.value)} /></label> : <><VaultReferencePicker key={kind} locale={locale} kind={kind} onSelect={setReference} />{reference && <p>{t("selected",{name:reference.title})}</p>}</>}
      <details><summary>{t("dependencies")}</summary><p>{t("dependencyNotice")}</p><VaultReferencePicker locale={locale} kind="source" onSelect={r => setSources(current => current.some(s => s.id === r.id) ? current : [...current,r])} />
        {sources.map(s => <p key={s.id}>{s.title} <button type="button" onClick={() => setSources(current => current.filter(r => r.id !== s.id))}>{t("remove")}</button></p>)}
        {row && <p>{t("inheritedDependencies",{count:row.dependency_manifest.length})}</p>}
      </details>
      {status && <p role="alert">{status}</p>}<div className="vault-toolbar"><button disabled={pending}>{t("saveCandidate")}</button><button type="button" onClick={onClose}>{t("close")}</button></div>
    </form>
  </section>;
}
function VaultReview({locale,row,workId,onClose,onSaved}: {locale: string; row: VaultRow; workId: string | null; onClose: () => void; onSaved: () => void}) {
  const t = useTranslations("Vault"); const [purpose,setPurpose] = useState<Purpose>(row.purpose ?? "analysis");
  const [scope,setScope] = useState<Reference | null>(row.work_scope_id || workId ? {id:(row.work_scope_id ?? workId)!,title:row.work_scope_id ?? workId!,revision:null} : null);
  const [reason,setReason] = useState(row.reason ?? ""); const [confirmed,setConfirmed] = useState(false); const [status,setStatus] = useState(""); const [pending,start] = useTransition();
  const [ids] = useState(() => ({request:crypto.randomUUID(),publication:crypto.randomUUID()}));
  // A proposal first saves an immutable review. Publication is a separate human action after reload.
  const unchanged = purpose === row.purpose && (scope?.id ?? null) === row.work_scope_id && reason.trim() === row.reason;
  const publishable = unchanged && !!row.request_id && !!row.review_fingerprint;
  return <section className="vault-card vault-review"><h2>{t("review")}</h2><h3>{row.title}</h3><p>{t("version",{number:row.revision})}</p>
    {row.directive_text && <p className="vault-content">{row.directive_text}</p>}
    {row.kind !== "directive" && <VaultReferenceDetail locale={locale} versionId={row.version_id} />}
    <p>{t("inheritedDependencies",{count:row.dependency_manifest.length})}</p>
    <details><summary>{t("reviewIdentity")}</summary><code className="vault-hash">{row.content_fingerprint}</code><p>{row.source_version_id ?? row.assumption_version_id ?? row.presentation_template_id}</p></details>
    <label>{t("purpose")}<select value={purpose} onChange={e => {setPurpose(e.target.value as Purpose);setConfirmed(false);}}>{(["analysis","retrieval","export"] as const).map(p => <option key={p} value={p}>{t(`purposes.${p}`)}</option>)}</select></label>
    <p>{scope ? t("selected",{name:scope.title}) : t("organizationScope")}</p><VaultReferencePicker locale={locale} kind="work" onSelect={r => {setScope(r);setConfirmed(false);}} />
    <button type="button" onClick={() => {setScope(null);setConfirmed(false);}}>{t("organizationScope")}</button>
    <label>{t("reason")}<textarea minLength={5} maxLength={2000} value={reason} onChange={e => {setReason(e.target.value);setConfirmed(false);}} /></label>
    <p>{t("reviewNotice")}</p>{status && <p role="alert">{status}</p>}
    <div className="vault-toolbar"><button disabled={pending || reason.trim().length < 5} onClick={() => start(async () => {try {
      const result = await proposeVaultPublication({locale,requestId:ids.request,versionId:row.version_id,fingerprint:row.content_fingerprint,expectedPublicationId:row.publication_id,workScopeId:scope?.id ?? null,purpose,reason});
      if (!result.ok) setStatus(t(`errors.${result.error}`)); else onSaved();
    } catch {setStatus(t("errors.save"));}})}>{t("saveReview")}</button>
    <button onClick={onClose}>{t("close")}</button></div>
    {row.can_publish && publishable && <div className="vault-publication"><label><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />{t("confirm")}</label><button disabled={pending || !confirmed} onClick={() => start(async () => {try {
      const result = await publishVaultVersion({locale,requestId:row.request_id,publicationId:ids.publication,reviewedFingerprint:row.review_fingerprint});
      if (!result.ok) setStatus(t(`errors.${result.error}`)); else onSaved();
    } catch {setStatus(t("errors.save"));}})}>{t("publish")}</button></div>}
  </section>;
}
function VaultHistory({locale,entryId}: {locale: string; entryId: string}) {
  const t = useTranslations("Vault"); const [history,setHistory] = useState<Awaited<ReturnType<typeof loadVaultHistory>> | null>(null);
  const [offset,setOffset] = useState(0); const [error,setError] = useState(false); const [pending,start] = useTransition();
  function load(n: number) {start(async () => {try {setHistory(await loadVaultHistory({locale,entryId,offset:n}));setOffset(n);setError(false);} catch {setError(true);}});}
  return <div><button disabled={pending} onClick={() => history ? setHistory(null) : load(0)}>{t("history")}</button>{error && <p role="alert">{t("errors.save")}</p>}
    {history && <div className="vault-history">{history.rows.map(v => <details key={v.id}><summary>{t("version",{number:v.revision})}: {v.title}</summary><p className="vault-content">{v.directive_text}</p><code className="vault-hash">{v.content_fingerprint}</code></details>)}<button disabled={pending || offset === 0} onClick={() => load(Math.max(0,offset-25))}>{t("previous")}</button><button disabled={pending || !history.more} onClick={() => load(offset+25)}>{t("next")}</button></div>}
  </div>;
}
function VaultReferenceDetail({locale,versionId}: {locale: string;versionId: string}) {
  const t=useTranslations("Vault"); const [detail,setDetail]=useState<Awaited<ReturnType<typeof loadVaultReferenceDetail>>>(null);
  const [error,setError]=useState(false); const [pending,start]=useTransition();
  return <div><button disabled={pending} onClick={() => start(async () => {try {setDetail(await loadVaultReferenceDetail({locale,versionId}));} catch {setError(true);}})}>{t("inspectReference")}</button>
    {error && <p role="alert">{t("errors.denied")}</p>}{detail && <div><h3>{detail.title ?? t(`kinds.${detail.kind}`)}</h3>{detail.revision !== null && <p>{t("version",{number:detail.revision})}</p>}
      {detail.kind === "source" && <p>{t("declaredHash")}</p>}{detail.body && <p className="vault-hash">{detail.body}</p>}{"preview" in detail && detail.preview && <div><p>{t("fonts")}: {detail.preview.fonts.display} / {detail.preview.fonts.body}</p><div className="vault-toolbar">{Object.entries(detail.preview.colors).map(([key,color]) => <span key={key} style={{borderBottom:`8px solid ${color}`,padding:8}}>{t(`colors.${key}`)}</span>)}</div><p>{detail.preview.confidentiality}</p></div>}{detail.download && <a href={detail.download} target="_blank" rel="noreferrer">{t("openSource")}</a>}
    </div>}
  </div>;
}
function VaultReceipts({locale,onChanged}: {locale:string;onChanged:()=>void}) {
  const t=useTranslations("Vault");const format=useFormatter();const [receipts,setReceipts]=useState<Awaited<ReturnType<typeof loadVaultReceipts>> | null>(null);
  const [status,setStatus]=useState("");const [pending,start]=useTransition();
  function load(offset:number){start(async()=>{try{setReceipts(await loadVaultReceipts({locale,offset}));}catch{setStatus(t("errors.save"));}});}
  return <section className="vault-receipts"><button disabled={pending} onClick={()=>receipts?setReceipts(null):load(0)}>{t("receipts")}</button>{status&&<p role="alert">{status}</p>}
    {receipts&&<><p>{t("receiptsNotice")}</p>{receipts.rows.slice(0,25).map(r=><article className="vault-card" key={r.publication_id}><h3>{r.title??t("restrictedReference")}</h3><p>{t("version",{number:r.revision})} · {format.dateTime(new Date(r.published_at),{dateStyle:"medium",timeStyle:"short"})}</p>
      {r.withdrawn_at?<p>{t("withdrawn")}</p>:<form onSubmit={e=>{e.preventDefault();const reason=new FormData(e.currentTarget).get("reason");start(async()=>{try{const result=await withdrawVaultPublication({locale,publicationId:r.publication_id,reason});if(!result.ok)setStatus(t(`errors.${result.error}`));else{setReceipts(await loadVaultReceipts({locale,offset:receipts.offset}));onChanged();}}catch{setStatus(t("errors.save"));}});}}><label>{t("withdrawReason")}<input name="reason" required minLength={5} maxLength={2000}/></label><button disabled={pending}>{t("withdraw")}</button></form>}
    </article>)}<div className="vault-toolbar"><button disabled={pending||receipts.offset===0} onClick={()=>load(Math.max(0,receipts.offset-25))}>{t("previous")}</button><button disabled={pending||receipts.rows.length<=25} onClick={()=>load(receipts.offset+25)}>{t("next")}</button></div></>}
  </section>;
}
