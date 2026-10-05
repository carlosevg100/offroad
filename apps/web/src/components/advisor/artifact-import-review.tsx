"use client";

import {useRef, useState, useTransition} from "react";
import {useFormatter, useTranslations} from "next-intl";
import {useRouter} from "next/navigation";

/** Only the authorized server reader builds this view. Office values remain proposals; this
 * component never compares files, infers citations, changes a formula or performs a calculation. */
export type ArtifactImportReviewView = {
  id: string;
  status: "queued" | "candidate" | "unmatched" | "stale" | "applied" | "discarded";
  base: {revisionNo: number; createdAt: string; title: string} | null;
  head: {revisionNo: number; createdAt: string; title: string} | null;
  items: Array<{key: string; classification: "unchanged" | "edited" | "conflict" | "missing" | "unmatched" | "formula_changed" | "recorded_edited"; base: string | null; received: string | null; current: string | null; detachedClaimIds: string[]}>;
  canApply: boolean;
  canDiscard: boolean;
  requiresDeclaration: boolean;
  selfApprovalForbidden: boolean;
};
export type ArtifactImportReviewChoice = {key: string; choice: "received" | "current"};
export type ArtifactImportReviewCommand = {candidateId: string; act: "apply" | "discard"; commandId: string; choices: ArtifactImportReviewChoice[]; selfApprovalDeclared: boolean};

export function ArtifactImportReview({candidate, onDecide}: {
  candidate: ArtifactImportReviewView;
  onDecide: (command: ArtifactImportReviewCommand) => Promise<{ok: true} | {ok: false; error: "denied" | "changed" | "save"}>;
}) {
  const t = useTranslations("ArtifactImportReview"), format = useFormatter(), router = useRouter();
  const [pending, start] = useTransition();
  const [declared, setDeclared] = useState(false);
  const [choices, setChoices] = useState<Record<string, "received" | "current">>({});
  const [failure, setFailure] = useState<"denied" | "changed" | "save" | null>(null);
  const conflicts = candidate.items.filter(item => ["conflict", "missing", "unmatched"].includes(item.classification));
  const resolved = conflicts.every(item => choices[item.key] !== undefined);
  const attempt = useRef<{key: string; commandId: string} | null>(null);
  const terminal = candidate.status === "applied" || candidate.status === "discarded";
  function decide(act: "apply" | "discard") {
    if (pending || terminal || act === "apply" && (!candidate.canApply || !resolved || candidate.requiresDeclaration && !declared) || act === "discard" && !candidate.canDiscard) return;
    const selected = conflicts.flatMap(item => choices[item.key] ? [{key: item.key, choice: choices[item.key]!}] : []);
    const key = JSON.stringify({candidate: candidate.id, act, selected, declared});
    if (attempt.current?.key !== key) attempt.current = {key, commandId: crypto.randomUUID()};
    const commandId = attempt.current.commandId;
    setFailure(null);
    start(async () => {
      try {
        const result = await onDecide({candidateId: candidate.id, act, commandId, choices: selected, selfApprovalDeclared: declared});
        if (!result.ok) setFailure(result.error); else {attempt.current = null; router.refresh();}
      } catch {setFailure("save");}
    });
  }
  const revision = (value: ArtifactImportReviewView["base"]) => value
    ? `${value.title} · ${t("revision", {number: value.revisionNo})} · ${format.dateTime(new Date(value.createdAt), {dateStyle: "medium", timeZone: "UTC"})}` : t("noBase");
  return <section data-testid="artifact-import-review" aria-busy={pending}>
    <h3>{t("title")}</h3>
    <p>{t(`status.${candidate.status}`)}</p><p>{t("scope")}</p>
    <dl><dt>{t("base")}</dt><dd>{revision(candidate.base)}</dd><dt>{t("head")}</dt><dd>{revision(candidate.head)}</dd></dl>
    <ul>{candidate.items.map(item => <li key={item.key}>
      <h4>{item.key} · {t(`classes.${item.classification}`)}</h4>
      <dl><dt>{t("baseValue")}</dt><dd>{item.base ?? t("absent")}</dd><dt>{t("received")}</dt><dd>{item.received ?? t("absent")}</dd><dt>{t("current")}</dt><dd>{item.current ?? t("absent")}</dd></dl>
      {item.detachedClaimIds.length ? <p>{t("detached")} {item.detachedClaimIds.join(", ")}</p> : null}
      {item.classification === "formula_changed" ? <p>{t("formula")}</p> : null}
      {item.classification === "recorded_edited" ? <p>{t("recorded")}</p> : null}
      {item.classification === "unmatched" || item.classification === "missing" ? <p>{t("unmatched")}</p> : null}
      {["conflict", "missing", "unmatched"].includes(item.classification) && !terminal ? <fieldset disabled={pending || !candidate.canApply}><legend>{t("resolve")}</legend>
        {(["received", "current"] as const).map(choice => <label key={choice}><input type="radio" name={`import-conflict-${candidate.id}-${item.key}`} checked={choices[item.key] === choice} onChange={() => setChoices(previous => ({...previous, [item.key]: choice}))}/>{t(`choose.${choice}`)}</label>)}
      </fieldset> : null}
    </li>)}</ul>
    {candidate.requiresDeclaration && !terminal ? <label><input type="checkbox" checked={declared} disabled={pending} onChange={event => setDeclared(event.target.checked)}/>{t("declaration")}</label> : null}
    {candidate.selfApprovalForbidden ? <p>{t("differentReviewer")}</p> : null}
    {!terminal ? <div><button disabled={pending || !candidate.canApply || !resolved || candidate.requiresDeclaration && !declared} onClick={() => decide("apply")}>{t("apply")}</button><button disabled={pending || !candidate.canDiscard} onClick={() => decide("discard")}>{t("discard")}</button></div> : null}
    {failure ? <p role="alert">{t(`errors.${failure}`)}</p> : null}
  </section>;
}
