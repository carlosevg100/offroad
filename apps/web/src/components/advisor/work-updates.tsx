"use client";

import {Check, CircleAlert, LoaderCircle, RefreshCw, ShieldCheck, X} from "lucide-react";
import {useFormatter, useTranslations} from "next-intl";
import {useRouter} from "next/navigation";
import {useRef, useState} from "react";

import {adoptWorkUpdate, authorizeWorkUpdate, declineWorkUpdate, type WorkUpdateActionResult} from "@/app/[locale]/app/projects/[projectId]/work-update-actions";
import {
  declineReasonCodes, type DeclineReasonCode, type WorkFollowupItem, type WorkUpdateChange, type WorkUpdateItem, type WorkUpdateRecomputation, type WorkUpdatesModel,
} from "@/lib/advisor/work-updates";

import "@/app/work-updates.css";

type Pending =
  | {kind: "adopt"}
  | {kind: "decline"}
  | {kind: "authorize"; candidateId: string; revision: number}
  | {kind: "decline_candidate"; candidateId: string; revision: number};

/**
 * The updates of a work: what changed and why, what was redone and from which execution, what
 * stayed valid and what waits for a decision; then the follow-ups typed in the conversation.
 * Adopting, authorizing and declining each need a second, explicit confirmation; the database
 * checks the revision the person saw.
 */
export function WorkUpdates({locale, model}: {locale: "pt-BR" | "en-US"; model: WorkUpdatesModel | null}) {
  const t = useTranslations("App.workUpdates");
  return <section aria-labelledby="work-updates-heading" className="work-updates">
    <header>
      <h2 id="work-updates-heading">{t("heading")}</h2>
      <p>{t("intro")}</p>
    </header>
    {model === null ? <p className="form-notice form-notice--error" role="alert">{t("unavailable")}</p>
      : model.open.length === 0 && model.closed.length === 0 && model.followups.length === 0 ? <p className="work-updates__empty">{t("empty")}</p> : null}
    {model?.open.length ? <div className="work-updates__group">
      <h3>{t("openHeading")}</h3>
      {model.open.map((item) => <WorkUpdateCard item={item} key={item.updateId} locale={locale} />)}
    </div> : null}
    {model?.closed.length ? <details className="work-updates__group">
      <summary>{t("closedHeading")} <span>{model.closed.length}</span></summary>
      {model.closed.map((item) => <WorkUpdateCard item={item} key={item.updateId} locale={locale} />)}
    </details> : null}
    {model?.followups.length ? <div className="work-updates__group work-updates__followups">
      <h3>{t("followups.heading")}</h3>
      {model.followups.map((item) => <WorkFollowupCard item={item} key={item.requestId} locale={locale} />)}
    </div> : null}
  </section>;
}

/** The command id of one decision attempt, stable while the person retries the same decision. */
function useCommandIds() {
  const commands = useRef(new Map<string, string>());
  return {
    get(key: string): string {
      const known = commands.current.get(key);
      if (known) return known;
      const created = crypto.randomUUID();
      commands.current.set(key, created);
      return created;
    },
    forget(key: string) {
      commands.current.delete(key);
    },
  };
}

function WorkUpdateCard({item, locale}: {item: WorkUpdateItem; locale: "pt-BR" | "en-US"}) {
  const t = useTranslations("App.workUpdates");
  const format = useFormatter();
  const router = useRouter();
  const commands = useCommandIds();
  const [confirming, setConfirming] = useState<Pending | null>(null);
  const [reason, setReason] = useState<DeclineReasonCode>("not_needed");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const date = (value: string) => format.dateTime(new Date(value), {dateStyle: "medium", timeStyle: "short"});
  const cost = (microusd: number) => format.number(microusd / 1_000_000, {style: "currency", currency: "USD"});

  async function run(pending: Pending) {
    if (busy) return;
    setBusy(true);
    setError("");
    const key = JSON.stringify(pending.kind === "decline" || pending.kind === "decline_candidate" ? {...pending, reason} : pending);
    let result: WorkUpdateActionResult;
    try {
      const shared = {locale, commandId: commands.get(key)};
      result = pending.kind === "adopt" ? await adoptWorkUpdate({...shared, updateId: item.updateId, expectedRevision: item.revision})
        : pending.kind === "decline" ? await declineWorkUpdate({...shared, updateId: item.updateId, expectedRevision: item.revision, reason, candidateId: null})
          : pending.kind === "authorize" ? await authorizeWorkUpdate({...shared, candidateId: pending.candidateId, expectedRevision: pending.revision})
            : await declineWorkUpdate({...shared, updateId: item.updateId, expectedRevision: pending.revision, reason, candidateId: pending.candidateId});
    } catch {
      result = {ok: false, error: "save"};
    }
    setBusy(false);
    if (result.ok) {
      commands.forget(key);
      setConfirming(null);
      setDone(t(pending.kind === "adopt" ? "done.adopted" : pending.kind === "authorize" ? "done.authorized" : "done.declined"));
      router.refresh();
      return;
    }
    setError(t(`errors.${result.error}`));
    if (["stale", "processing", "not_found"].includes(result.error)) {
      commands.forget(key);
      setConfirming(null);
      router.refresh();
    }
  }

  const statusLabel = t(`status.${item.status}`);
  return <article aria-label={statusLabel} className="work-update" data-status={item.status}>
    <header>
      <span className="work-update__status">{item.status === "ready" ? <Check aria-hidden="true" size={13} /> : item.open ? <RefreshCw aria-hidden="true" size={13} /> : null}{statusLabel}</span>
      <small>{t("updatedAt", {date: date(item.updatedAt)})}</small>
    </header>

    <section className="work-update__part">
      <h4>{t("sections.changed")}</h4>
      <ul>{item.changes.map((change) => <li key={change.key}>
        <span>{changeText(change, t)}</span>
        {change.executions.length ? <small>{t("change.affects", {executions: change.executions.join(", ")})}</small> : null}
      </li>)}</ul>
      {item.merged ? <p className="work-update__merged">{t("merged", {count: item.merged})}</p> : null}
    </section>

    {item.recomputed.length ? <section className="work-update__part">
      <h4>{t("sections.recomputed")}</h4>
      <ul>{item.recomputed.map((entry) => <li className="work-update__recomputation" data-kind={entry.kind} data-state={entry.state} key={entry.candidateId}>
        <span>{recomputationText(entry, t)}</span>
        {reasonText(entry, t) ? <small>{reasonText(entry, t)}</small> : null}
        {entry.canDecline ? confirming?.kind === "decline_candidate" && confirming.candidateId === entry.candidateId
          ? <DeclineConfirmation busy={busy} explanation={t("recomputation.declineExplanation")} onCancel={() => setConfirming(null)} onConfirm={() => void run(confirming)} reason={reason} setReason={setReason} />
          : <div className="work-update__actions">
            <button className="button button--small button--ghost" disabled={busy} onClick={() => {setDone(""); setConfirming({kind: "decline_candidate", candidateId: entry.candidateId, revision: entry.revision});}} type="button">{t("recomputation.declineOne")}</button>
          </div> : null}
      </li>)}</ul>
    </section> : null}

    <section className="work-update__part">
      <h4>{t("sections.stayedValid")}</h4>
      {item.stayedValid.length ? <ul>{item.stayedValid.map((label, index) => <li key={`${label}-${index}`}>{label}</li>)}</ul> : <p>{t("stayedValidNone")}</p>}
    </section>

    {item.open ? <section className="work-update__part">
      <h4>{t("sections.waiting")}</h4>
      {item.awaitingAuthorization.length === 0 && item.holds.length === 0 && !item.canAdopt ? <p>{t("waitingNone")}</p> : null}
      {item.canAdopt ? <p>{t("adopt.explanation")}</p> : null}
      <ul>
        {item.awaitingAuthorization.map((wait) => <li className="work-update__authorization" key={wait.candidateId}>
          <span>{t("authorization.item", {label: wait.label, cost: cost(wait.maxCostMicrousd), calls: wait.maxModelCalls})}</span>
          {confirming?.kind === "authorize" && confirming.candidateId === wait.candidateId ? <div className="work-update__confirm" role="group">
            <p>{t("authorization.explanation")}</p>
            <button className="button button--small" disabled={busy} onClick={() => void run(confirming)} type="button">{busy ? <LoaderCircle aria-hidden="true" className="spin" size={14} /> : <ShieldCheck aria-hidden="true" size={14} />}{t("authorization.confirm")}</button>
            <button className="button button--small button--ghost" disabled={busy} onClick={() => setConfirming(null)} type="button">{t("cancel")}</button>
          </div> : confirming?.kind === "decline_candidate" && confirming.candidateId === wait.candidateId ? <DeclineConfirmation busy={busy} onCancel={() => setConfirming(null)} onConfirm={() => void run(confirming)} reason={reason} setReason={setReason} />
            : <div className="work-update__actions">
              <button className="button button--small button--outline" disabled={busy} onClick={() => {setDone(""); setConfirming({kind: "authorize", candidateId: wait.candidateId, revision: wait.revision});}} type="button">{t("authorization.authorize")}</button>
              <button className="button button--small button--ghost" disabled={busy} onClick={() => {setDone(""); setConfirming({kind: "decline_candidate", candidateId: wait.candidateId, revision: wait.revision});}} type="button">{t("authorization.declineOne")}</button>
            </div>}
        </li>)}
        {item.holds.map((hold, index) => <li className="work-update__hold" key={`${hold.kind}-${index}`}>
          <CircleAlert aria-hidden="true" size={13} />{t(`hold.${hold.kind}`, {execution: hold.execution})}
        </li>)}
      </ul>
    </section> : <p className="work-update__decided">{decidedText(item, t, date)}</p>}

    {item.open ? <footer className="work-update__actions">
      {confirming?.kind === "adopt" ? <div className="work-update__confirm" role="group">
        <button className="button button--small" disabled={busy} onClick={() => void run({kind: "adopt"})} type="button">{busy ? <LoaderCircle aria-hidden="true" className="spin" size={14} /> : <Check aria-hidden="true" size={14} />}{t("adopt.confirm")}</button>
        <button className="button button--small button--ghost" disabled={busy} onClick={() => setConfirming(null)} type="button">{t("cancel")}</button>
      </div> : confirming?.kind === "decline" ? <DeclineConfirmation busy={busy} explanation={t("decline.explanation")} onCancel={() => setConfirming(null)} onConfirm={() => void run({kind: "decline"})} reason={reason} setReason={setReason} />
        : <>
          {item.canAdopt ? <button className="button button--small" disabled={busy} onClick={() => {setDone(""); setConfirming({kind: "adopt"});}} type="button"><Check aria-hidden="true" size={14} />{t("adopt.action")}</button> : null}
          {item.canDecline ? <button className="button button--small button--outline" disabled={busy} onClick={() => {setDone(""); setConfirming({kind: "decline"});}} type="button"><X aria-hidden="true" size={14} />{t("decline.action")}</button> : null}
        </>}
    </footer> : null}
    {error ? <p className="form-notice form-notice--error" role="alert">{error}</p> : null}
    {done ? <p className="form-notice" role="status">{done}</p> : null}
  </article>;
}

/** A follow-up typed in the conversation, the base it continues, the execution it led to and the
 * person's decision: a ready one is adopted as the new base, an open one can be declined. */
function WorkFollowupCard({item, locale}: {item: WorkFollowupItem; locale: "pt-BR" | "en-US"}) {
  const t = useTranslations("App.workUpdates");
  const format = useFormatter();
  const router = useRouter();
  const commands = useCommandIds();
  const [confirming, setConfirming] = useState<"adopt" | "decline" | null>(null);
  const [reason, setReason] = useState<DeclineReasonCode>("not_needed");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const date = (value: string) => format.dateTime(new Date(value), {dateStyle: "medium", timeStyle: "short"});

  async function run(kind: "adopt" | "decline") {
    if (busy) return;
    setBusy(true);
    setError("");
    const key = JSON.stringify(kind === "decline" ? {kind, reason} : {kind});
    let result: WorkUpdateActionResult;
    try {
      const shared = {locale, commandId: commands.get(key), updateId: item.requestId, expectedRevision: item.revision};
      result = kind === "adopt" ? await adoptWorkUpdate(shared) : await declineWorkUpdate({...shared, reason, candidateId: null});
    } catch {
      result = {ok: false, error: "save"};
    }
    setBusy(false);
    if (result.ok) {
      commands.forget(key);
      setConfirming(null);
      setDone(t(kind === "adopt" ? "followups.done.adopted" : "done.declined"));
      router.refresh();
      return;
    }
    setError(t(`errors.${result.error}`));
    if (["stale", "processing", "not_found"].includes(result.error)) {
      commands.forget(key);
      setConfirming(null);
      router.refresh();
    }
  }

  const statusLabel = t(`followups.status.${item.status}`);
  return <article aria-label={statusLabel} className="work-update work-update--followup" data-status={item.status}>
    <header>
      <span className="work-update__status">{item.status === "ready" ? <Check aria-hidden="true" size={13} /> : null}{statusLabel}</span>
    </header>
    <section className="work-update__part">
      <blockquote className="work-update__followup-text">{item.text}</blockquote>
      <p>{t("followups.base", {label: item.base.label, revision: item.base.revision})}</p>
      <p>{item.execution ? t(`followups.execution.${item.execution.state}`, {name: item.execution.name}) : item.open ? t("followups.execution.none") : null}</p>
    </section>
    {item.open ? <footer className="work-update__actions">
      {confirming === "adopt" ? <div className="work-update__confirm" role="group">
        <p>{t("followups.adoptExplanation")}</p>
        <button className="button button--small" disabled={busy} onClick={() => void run("adopt")} type="button">{busy ? <LoaderCircle aria-hidden="true" className="spin" size={14} /> : <Check aria-hidden="true" size={14} />}{t("followups.adoptConfirm")}</button>
        <button className="button button--small button--ghost" disabled={busy} onClick={() => setConfirming(null)} type="button">{t("cancel")}</button>
      </div> : confirming === "decline" ? <DeclineConfirmation busy={busy} explanation={t("followups.declineExplanation")} onCancel={() => setConfirming(null)} onConfirm={() => void run("decline")} reason={reason} setReason={setReason} />
        : <>
          {item.canAdopt ? <button className="button button--small" disabled={busy} onClick={() => {setDone(""); setConfirming("adopt");}} type="button"><Check aria-hidden="true" size={14} />{t("followups.adopt")}</button> : null}
          {item.canDecline ? <button className="button button--small button--outline" disabled={busy} onClick={() => {setDone(""); setConfirming("decline");}} type="button"><X aria-hidden="true" size={14} />{t("followups.decline")}</button> : null}
        </>}
    </footer> : <p className="work-update__decided">{item.status === "adopted" && item.decidedAt ? t("followups.decided.adopted", {date: date(item.decidedAt)})
      : item.status === "declined" && item.declineReason && item.decidedAt ? t("decided.declined", {date: date(item.decidedAt), reason: t(`decline.reasons.${item.declineReason}`)})
        : t("decided.closed")}</p>}
    {error ? <p className="form-notice form-notice--error" role="alert">{error}</p> : null}
    {done ? <p className="form-notice" role="status">{done}</p> : null}
  </article>;
}

function DeclineConfirmation({busy, explanation, onCancel, onConfirm, reason, setReason}: {
  busy: boolean; explanation?: string; onCancel: () => void; onConfirm: () => void; reason: DeclineReasonCode; setReason: (reason: DeclineReasonCode) => void;
}) {
  const t = useTranslations("App.workUpdates.decline");
  const common = useTranslations("App.workUpdates");
  return <div className="work-update__confirm" role="group">
    {explanation ? <p>{explanation}</p> : null}
    <label><span>{t("reasonLabel")}</span>
      <select disabled={busy} onChange={(event) => setReason(event.target.value as DeclineReasonCode)} value={reason}>
        {declineReasonCodes.map((code) => <option key={code} value={code}>{t(`reasons.${code}`)}</option>)}
      </select>
    </label>
    <button className="button button--small" disabled={busy} onClick={onConfirm} type="button">{busy ? <LoaderCircle aria-hidden="true" className="spin" size={14} /> : <X aria-hidden="true" size={14} />}{t("confirm")}</button>
    <button className="button button--small button--ghost" disabled={busy} onClick={onCancel} type="button">{common("cancel")}</button>
  </div>;
}

type Translate = ReturnType<typeof useTranslations>;

/** Names arrive resolved on the server; only a document or premise nobody named needs a phrase here. */
function changeText(change: WorkUpdateChange, t: Translate): string {
  if (change.kind === "graph_incomplete") return t("change.graph_incomplete");
  if (change.kind === "method_release") return t("change.method_release", {name: change.name ?? t("recomputation.unnamed")});
  const versions = {from: change.from ?? t("change.unknownVersion"), to: change.to ?? t("change.unknownVersion")};
  if (change.kind === "institutional_configuration") return t("change.institutional_configuration", versions);
  if (change.kind === "assumption_slot") return change.name ? t("change.assumption_slot", {name: change.name, ...versions}) : t("change.assumption_slot_unnamed", versions);
  return t("change.source_version", {name: change.name ?? t("change.unnamed"), ...versions});
}

function recomputationText(entry: WorkUpdateRecomputation, t: Translate): string {
  const state = entry.state === "scheduled" && entry.produced ? "produced" : entry.state;
  return t(`recomputation.${entry.kind === "institutional" ? `institutional.${state}` : state}`, {label: entry.label});
}

function reasonText(entry: WorkUpdateRecomputation, t: Translate): string | null {
  if (entry.state !== "declined" && entry.state !== "failed") return null;
  if (entry.reason?.startsWith("person_declined:")) return t("recomputation.reasons.person");
  if (entry.reason?.startsWith("requester_not_authorized")) return t("recomputation.reasons.requester");
  return t("recomputation.reasons.failed");
}

function decidedText(item: WorkUpdateItem, t: Translate, date: (value: string) => string): string {
  if (item.status === "adopted" && item.decidedAt) return t("decided.adopted", {date: date(item.decidedAt)});
  if (item.status === "declined" && item.declineReason && item.decidedAt) {
    return t("decided.declined", {date: date(item.decidedAt), reason: t(`decline.reasons.${item.declineReason}`)});
  }
  if (item.status === "superseded") return t("decided.superseded");
  return t("decided.closed");
}
