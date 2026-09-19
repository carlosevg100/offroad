"use client";
import {useState, useTransition} from "react";
import {useFormatter, useTranslations} from "next-intl";
import {changeMethod, loadMethodPage} from "@/app/[locale]/app/settings/method/actions";
import {MethodCompositionReview} from "./method-composition-review";
import {MethodOverrideEditor} from "./method-override-editor";
import type {MethodPage} from "@/lib/advisor/method-publication";

export function MethodPublicationWorkspace({locale, initialPage}: {locale: string; initialPage: MethodPage}) {
 const t = useTranslations("MethodPublication"); const format = useFormatter();
 const [overrides, setOverrides] = useState<Record<string, unknown[]>>({});
 const [page, setPage] = useState(initialPage); const [pending, start] = useTransition(); const [status, setStatus] = useState("");
 async function command(input: object) {const result = await changeMethod({...input, locale}); if (!result.ok) {setStatus(t(`errors.${result.error}`));return;} setPage(await loadMethodPage(locale, page.offset));setStatus(t("saved"));}
 function run(action: () => Promise<void>) {start(async () => {setStatus("");try {await action();} catch {setStatus(t("errors.unavailable"));}});}
 const methodName = (id: string) => id === "underwrite-receivables-pool" ? t("receivables") : id;
 return <section className="vault-workspace" aria-label={t("title")}>
  <div role="status" aria-live="polite">{status}</div>
  <div className="vault-toolbar"><a href={`/${locale}/app/vault`}>{t("managePeople")}</a></div>
  {page.canManage && <form className="vault-card" onSubmit={e => {e.preventDefault();const f = new FormData(e.currentTarget);run(() => command({action: "policy", separateReviewer: f.get("separate") === "on"}));}}>
   <h2>{t("reviewPolicy")}</h2><label><input type="checkbox" name="separate" defaultChecked={page.separateReviewer} />{t("separateReviewer")}</label><p>{t("separationExplanation")}</p><button disabled={pending}>{t("savePolicy")}</button>
  </form>}
  <h2>{t("offroadMethods")}</h2>
  {page.bases.map(base => <article className="vault-card" key={base.id}><h3>{methodName(base.methodId)}</h3><p>{t("version", {version: base.version})}</p><p>{t("approved", {name: base.approval.approvedBy, date: format.dateTime(new Date(base.approval.approvedAt + "T12:00:00Z"), {dateStyle: "medium"})})}</p>
   <details><summary>{t("evidence")}</summary><p>{base.approval.approvalSource}</p><ul>{base.evidence.map(item => <li key={item.path}>{item.path}</li>)}</ul><p className="vault-content">{base.manifestHash}</p></details>
   {base.components.length === 0 && <p>{t("protectedLegacy")}</p>}
   {page.canWork && <form className="vault-toolbar" onSubmit={e => {e.preventDefault();const f = new FormData(e.currentTarget);run(() => command({action: "submit", id: crypto.randomUUID(), title: f.get("title"), baseReleaseId: base.id, overrides: overrides[base.id] ?? [], unitId: null, workType: base.methodId === "underwrite-receivables-pool" ? "receivables_underwriting" : "analysis"}));}}>
    <MethodOverrideEditor key={base.id} locale={locale} components={base.components} organizationId={page.organizationId} onChange={value => setOverrides(current => ({...current,[base.id]: value}))} />
    <label>{t("candidateTitle")}<input name="title" required maxLength={180} /></label><button disabled={pending}>{t("createCandidate")}</button>
   </form>}
  </article>)}
  <h2>{t("houseMethods")}</h2><p>{t("candidateNotice")}</p>
  {!page.canRead && <p>{t("noRead")}</p>}
  {page.canRead && page.rows.length === 0 && <p>{t("empty")}</p>}
  <div className="vault-grid">{page.rows.slice(0,25).map(row => <article className="vault-card" key={row.id}>
   <span className="vault-badge">{t(`states.${row.status}`)}</span><h3>{row.title}</h3>
   {row.base_release_id === null ? <p>{t("legacyCandidate")}</p> : <p>{t("compositionNotice")}</p>}
   <MethodCompositionReview manifest={row.manifest} />
   {page.bindings.some(binding => binding.releaseId === row.id) && <p>{t("currentlyAdopted")}</p>}
   <details><summary>{t("reviewedVersion")}</summary><p className="vault-content">{row.manifest_fingerprint}</p><p>{t("testEvidence")}</p><p className="vault-content">{row.evidence_fingerprint}</p></details>
   {row.reviews.map(review => <blockquote key={review.id}><p>{review.review_text}</p><p>{format.dateTime(new Date(review.created_at), {dateStyle: "medium", timeStyle: "short"})}</p></blockquote>)}
   {page.canPublish && row.status === "candidate" && row.base_release_id && <>
    {(!page.separateReviewer || row.created_by !== page.viewerId) && <form onSubmit={e => {e.preventDefault();const f = new FormData(e.currentTarget);run(() => command({action: "review", id: row.id, reviewId: crypto.randomUUID(), fingerprint: row.manifest_fingerprint, evidenceFingerprint: row.evidence_fingerprint, reason: f.get("reason")}));}}>
     <label>{t("reviewReason")}<textarea name="reason" required minLength={20} maxLength={4000} /></label><button disabled={pending}>{t("recordReview")}</button>
    </form>}
    {row.reviews.filter(review => !page.separateReviewer || review.reviewed_by !== page.viewerId).slice(-1).map(review => <button key={review.id} disabled={pending} onClick={() => run(() => command({action: "publish", id: row.id, reviewId: review.id, fingerprint: row.manifest_fingerprint}))}>{t("publish")}</button>)}
   </>}
   {page.canPublish && row.status === "published" && <>
    <button disabled={pending} onClick={() => run(() => command({action: "bind", id: row.id, bindingId: crypto.randomUUID(), expectedBindingId: page.bindings.find(b => b.unitId === null && b.workId === null && b.workType === (row.manifest.context as {workType: string}).workType)?.id ?? null, unitId: null, workType: (row.manifest.context as {workType: string}).workType, workId: null}))}>{t("useForHouse")}</button>
    <form onSubmit={e => {e.preventDefault();const f = new FormData(e.currentTarget);run(() => command({action: "retire", id: row.id, reason: f.get("reason")}));}}><label>{t("retireReason")}<input name="reason" required minLength={5} maxLength={2000} /></label><button disabled={pending}>{t("retire")}</button></form>
   </>}
  </article>)}</div>
  {page.unavailableReceipts.slice(0,25).map(receipt => <article className="vault-card" key={receipt.id}><h3>{t("unavailableReceipt")}</h3><p>{format.dateTime(new Date(receipt.published_at),{dateStyle:"medium"})}</p><form onSubmit={e => {e.preventDefault();const f=new FormData(e.currentTarget);run(() => command({action:"retire",id:receipt.id,reason:f.get("reason")}));}}><label>{t("retireReason")}<input name="reason" required minLength={5} maxLength={2000} /></label><button disabled={pending}>{t("retire")}</button></form></article>)}
  <div className="vault-toolbar"><button disabled={pending || page.offset === 0} onClick={() => run(async () => setPage(await loadMethodPage(locale, Math.max(0,page.offset-25))))}>{t("previous")}</button><button disabled={pending || page.rows.length <= 25} onClick={() => run(async () => setPage(await loadMethodPage(locale,page.offset+25)))}>{t("next")}</button></div>
 </section>;
}
