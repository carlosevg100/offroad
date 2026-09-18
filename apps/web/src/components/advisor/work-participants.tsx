"use client";

import {useRef, useState, useTransition} from "react";
import {useTranslations} from "next-intl";
import {changeWorkParticipant, loadContributionHistory, loadContributionSources, loadWorkContributions, loadWorkPeople, promoteWorkContribution, submitWorkContribution} from "@/app/[locale]/app/work-contribution-actions";
import type {ContributionCommandState, ContributionPage, ContributionRevision, WorkPerson} from "@/lib/advisor/work-contributions";
import "./work-participants.css";

type Props = {locale: "pt-BR" | "en-US"; workId: string; viewerId: string; canManage: boolean; people: WorkPerson[]; initial: ContributionPage};
export function WorkParticipants(props: Props) {
  const t = useTranslations("WorkContributions");
  const [pending, start] = useTransition();
  const [audience, setAudience] = useState<"personal" | "shared">("personal");
  const [page, setPage] = useState(props.initial); const [offset, setOffset] = useState(0);
  const [people, setPeople] = useState(props.people); const [peopleOffset, setPeopleOffset] = useState(0); const [peopleSearch, setPeopleSearch] = useState("");
  const [sources, setSources] = useState<{id: string; original_name: string; version_no: number}[]>([]); const [sourcesMore, setSourcesMore] = useState(false); const [sourceOffset, setSourceOffset] = useState(0); const [sourceSearch, setSourceSearch] = useState("");
  const [selectedSources, setSelectedSources] = useState<string[]>([]);
  const [content, setContent] = useState(""); const [editing, setEditing] = useState<ContributionRevision | null>(null); const [base, setBase] = useState<ContributionRevision | null>(null);
  const [result, setResult] = useState<ContributionCommandState | null>(null);
  const [history, setHistory] = useState<{contributionId: string; page: ContributionPage; offset: number} | null>(null);
  const request = useRef<{contributionId: string; revisionId: string} | null>(null);
  const promotions = useRef(new Map<string, string>());
  const identity = {locale: props.locale, workId: props.workId};
  const author = (id: string) => id === props.viewerId ? t("you") : people.find(p => p.user_id === id)?.name ?? t("person", {id: id.slice(0, 8)});
  async function refresh(nextAudience = audience, nextOffset = offset) {
    setPage(await loadWorkContributions({...identity, audience: nextAudience, offset: nextOffset}));setAudience(nextAudience);setOffset(nextOffset);
  }
  function run(action: () => Promise<void>) {start(async () => {try {await action();} catch {setResult({ok: false, error: "save"});}});}
  function propose(row: ContributionRevision, personal: boolean) {
    setEditing(personal ? row : null);setBase(personal ? null : row);setContent(row.content);setSelectedSources([]);request.current=null;setResult(null);
  }
  return <section className="work-contributions" data-testid="work-contributions" aria-label={t("title")}>
    <h3>{t("title")}</h3>
    <p>{t("explanation")}</p>
    <details className="work-contributions__people">
      <summary>{t("people")}</summary>
      <form onSubmit={e => {e.preventDefault();run(async () => {const r=await loadWorkPeople({...identity, search: peopleSearch, offset: 0});setPeople(r.people);setPeopleOffset(0);});}}>
        <label>{t("searchPeople")}<input value={peopleSearch} maxLength={160} onChange={e => setPeopleSearch(e.target.value)} /></label>
        <button disabled={pending}>{t("search")}</button>
      </form>
      <ul>{people.slice(0,50).map(person => <li key={person.user_id}>
        <span>{person.name} {person.participates ? <small>{t(`access.${person.access}`)}</small> : null}</span>
        {props.canManage && person.user_id !== props.viewerId ? <button type="button" disabled={pending} onClick={() => run(async () => {
          const next=await changeWorkParticipant({...identity,userId: person.user_id,access: person.participates ? "remove" : "work"});setResult(next);
          if(next.ok){const r=await loadWorkPeople({...identity,search: peopleSearch,offset:peopleOffset});setPeople(r.people);await refresh();}
        })}>{person.participates ? t("remove") : t("add")}</button> : null}
      </li>)}</ul>
      <div className="work-contributions__pagination">
        <button type="button" disabled={pending || !peopleOffset} onClick={() => run(async () => {const n=Math.max(0,peopleOffset-50);const r=await loadWorkPeople({...identity,search:peopleSearch,offset:n});setPeople(r.people);setPeopleOffset(n);})}>{t("previous")}</button>
        <button type="button" disabled={pending || people.length<=50} onClick={() => run(async () => {const n=peopleOffset+50;const r=await loadWorkPeople({...identity,search:peopleSearch,offset:n});setPeople(r.people);setPeopleOffset(n);})}>{t("next")}</button>
      </div>
      <p>{t("peopleHelp")}</p>
    </details>
    <form className="work-contributions__composer" onSubmit={e => {e.preventDefault();run(async () => {
      request.current ??= {contributionId: editing?.contribution_id ?? crypto.randomUUID(), revisionId: crypto.randomUUID()};
      const r=await submitWorkContribution({...identity,...request.current,expectedRevisionId: editing?.id ?? null,baseRevisionId: base?.id ?? editing?.base_revision_id ?? null,content,sourceVersionIds: selectedSources});setResult(r);
      if(r.ok){setContent("");setEditing(null);setBase(null);setSelectedSources([]);request.current=null;await refresh("personal",0);}
    });}}>
      {base ? <blockquote><strong>{t("basedOn")}</strong><p>{base.content}</p></blockquote> : null}
      <label>{editing ? t("revise") : t("write")}<textarea name="contribution" required maxLength={16000} value={content} onChange={e => {setContent(e.target.value);request.current=null;}} /></label>
      <details onToggle={e => {if(e.currentTarget.open && !sources.length)run(async () => {const r=await loadContributionSources({...identity,search:sourceSearch,offset:0});setSources(r.rows);setSourcesMore(r.more);});}}>
        <summary>{t("sources")}</summary><p>{t("sourcesHelp")}</p>
        <label>{t("searchSources")}<input value={sourceSearch} maxLength={160} onChange={e=>setSourceSearch(e.target.value)} /></label>
        <button type="button" disabled={pending} onClick={()=>run(async()=>{const r=await loadContributionSources({...identity,search:sourceSearch,offset:0});setSources(r.rows);setSourcesMore(r.more);setSourceOffset(0);})}>{t("search")}</button>
        {sources.map(source=><label key={source.id} className="work-contributions__source"><input type="checkbox" checked={selectedSources.includes(source.id)} onChange={e=>{setSelectedSources(current=>e.target.checked?[...current,source.id]:current.filter(id=>id!==source.id));request.current=null;}} />{source.original_name} ({t("version",{version:source.version_no})})</label>)}
        <p>{t("selectedSources",{count:selectedSources.length})}</p>
        <div className="work-contributions__pagination"><button type="button" disabled={pending || !sourceOffset} onClick={()=>run(async()=>{const n=Math.max(0,sourceOffset-25);const r=await loadContributionSources({...identity,search:sourceSearch,offset:n});setSources(r.rows);setSourcesMore(r.more);setSourceOffset(n);})}>{t("previous")}</button>
          <button type="button" disabled={pending || !sourcesMore} onClick={()=>run(async()=>{const n=sourceOffset+25;const r=await loadContributionSources({...identity,search:sourceSearch,offset:n});setSources(r.rows);setSourcesMore(r.more);setSourceOffset(n);})}>{t("next")}</button></div>
      </details>
      <p>{t("privateHelp")}</p><button disabled={pending || !content.trim()}>{t("savePrivate")}</button>
      {editing || base ? <button type="button" disabled={pending} onClick={()=>{setEditing(null);setBase(null);setContent("");setSelectedSources([]);request.current=null;}}>{t("cancel")}</button> : null}
    </form>
    {result ? <p role="status">{result.ok ? t("saved") : result.conflict ? t("conflict") : t(`errors.${result.error ?? "save"}`)}</p> : null}
    {result?.conflict ? <div className="work-contributions__diff" data-testid="contribution-conflict">{(["base","current","candidate"] as const).map(key=><section key={key}><h4>{t(`diff.${key}`)}</h4><p>{result.conflict![key].content}</p></section>)}
      <button type="button" disabled={pending} onClick={()=>{const conflict=result.conflict!;const candidate=page.rows.find(row=>row.id===conflict.candidate.revisionId);if(!candidate){setResult({ok:false,error:"stale"});return;}setBase({id:conflict.current.revisionId,contribution_id:"",author_user_id:props.viewerId,content:conflict.current.content,revision:0,base_revision_id:null,created_at:""});setEditing(candidate);setSelectedSources([]);setContent(conflict.candidate.content);request.current=null;setResult(null);}}>{t("rebase")}</button></div> : null}
    <nav className="work-contributions__tabs" aria-label={t("audience")}>{(["personal","shared"] as const).map(a=><button key={a} type="button" aria-pressed={a===audience} disabled={pending} onClick={()=>run(()=>refresh(a,0))}>{t(a)}</button>)}</nav>
    {!page.rows.length ? <p>{t("empty")}</p> : null}
    {page.rows.map(row=><article key={row.id} data-revision-id={row.id}>
      <header><strong>{author(row.author_user_id)}</strong><small>{t("version",{version:row.revision})}</small></header><p className="work-contributions__text">{row.content}</p>
      <div className="work-contributions__actions"><button type="button" disabled={pending} onClick={()=>propose(row,audience==="personal")}>{audience==="personal"?t("edit"):t("propose")}</button>
        {audience==="personal" ? <button type="button" disabled={pending} onClick={()=>run(async()=>{const id=promotions.current.get(row.id)??crypto.randomUUID();promotions.current.set(row.id,id);const r=await promoteWorkContribution({...identity,revisionId:row.id,promotionId:id,expectedSharedRevisionId:row.base_revision_id});setResult(r);if(r.ok)await refresh("shared",0);})}>{t("share")}</button>:null}
        <button type="button" disabled={pending} onClick={()=>run(async()=>{setHistory({contributionId:row.contribution_id,page:await loadContributionHistory({...identity,contributionId:row.contribution_id,offset:0}),offset:0});})}>{t("history")}</button></div>
    </article>)}
    <div className="work-contributions__pagination"><button type="button" disabled={pending || !offset} onClick={()=>run(()=>refresh(audience,Math.max(0,offset-25)))}>{t("previous")}</button><button type="button" disabled={pending || !page.more} onClick={()=>run(()=>refresh(audience,offset+25))}>{t("next")}</button></div>
    {history ? <section aria-label={t("history")}><h4>{t("history")}</h4><button type="button" onClick={()=>setHistory(null)}>{t("close")}</button>{history.page.rows.map(r=><article key={r.id}><strong>{author(r.author_user_id)} · {t("version",{version:r.revision})}</strong><p className="work-contributions__text">{r.content}</p></article>)}
      <button type="button" disabled={pending || !history.page.more} onClick={()=>run(async()=>{const n=history.offset+25;setHistory({...history,offset:n,page:await loadContributionHistory({...identity,contributionId:history.contributionId,offset:n})});})}>{t("older")}</button></section>:null}
  </section>;
}
