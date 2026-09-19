"use client";
import {useState, useTransition} from "react";
import {useTranslations} from "next-intl";
import type {MethodComponent, MethodValueType} from "@offroad/credit-playbook";
import {loadVault} from "@/app/[locale]/app/vault/actions";
import type {VaultRow} from "@/lib/advisor/vault";

type Change = {componentId: string; pointId: string; version: string; scope: "organization"; scopeId: string; rationale: string; source: {versionId: string; fingerprint: string} | null; value: unknown};
export function MethodOverrideEditor({locale, components, organizationId, onChange}: {locale: string; components: MethodComponent[]; organizationId: string; onChange: (value: Change[]) => void}) {
 const t = useTranslations("MethodPublication"); const [changes, setChanges] = useState<Record<string, Change>>({});
 function update(key: string, value: Change | null) {const next = {...changes};if (value) next[key] = value;else delete next[key];setChanges(next);onChange(Object.values(next));}
 return <>{components.filter(c => c.kind !== "formula" && c.kind !== "quality_gate" && !(c.kind === "rule" && ["law", "contract"].includes(c.authority))).flatMap(component => component.overridePoints.map(point => {
  const key = `${component.id}:${point.id}`; const change = changes[key];
  return <fieldset className="vault-card" key={key}><legend>{component.title}</legend><label><input type="checkbox" checked={!!change} onChange={e => update(key,e.target.checked ? {componentId: component.id, pointId: point.id, version: component.version, scope: "organization", scopeId: organizationId, rationale: "", source: null, value: null} : null)} />{t("override")} · {point.id}</label>
   {change && <><TypedMethodValue type={point.contract.value} label={t("newValue")} value={change.value} onChange={value => update(key,{...change,value})} />
    <label>{t("overrideRationale")}<textarea required minLength={5} maxLength={2000} value={change.rationale} onChange={e => update(key,{...change,rationale: e.target.value})} /></label>
    <MethodSourcePicker locale={locale} onSelect={source => update(key,{...change,source})} />
   </>}
  </fieldset>;
 }))}</>;
}
function TypedMethodValue({type, label, value, onChange}: {type: MethodValueType; label: string; value: unknown; onChange: (value: unknown) => void}) {
 const t = useTranslations("MethodPublication");
 if (type.type === "object") return <fieldset><legend>{label}</legend>{Object.entries(type.fields).map(([key,field]) => <TypedMethodValue key={key} type={field.value} label={key} value={(value as Record<string, unknown> | null)?.[key]} onChange={next => onChange({...value as object,[key]:next})} />)}</fieldset>;
 if (type.type === "array") {const items = Array.isArray(value) ? value : [];return <fieldset><legend>{label}</legend>{items.map((item,index) => <div key={index}><TypedMethodValue type={type.items} label={`${label} ${index+1}`} value={item} onChange={next => onChange(items.map((old,i) => i===index ? next : old))} /><button type="button" onClick={() => onChange(items.filter((_,i) => i!==index))}>{t("removeValue")}</button></div>)}<button type="button" onClick={() => onChange([...items,null])}>{t("addValue")}</button></fieldset>;}
 if (type.type === "boolean" || type.type === "enum") return <label>{label}<select required value={typeof value === "boolean" || typeof value === "string" ? String(value) : ""} onChange={e => onChange(type.type === "boolean" ? e.target.value === "true" : e.target.value)}><option value="" />{(type.type === "enum" ? type.values : ["true","false"]).map(v => <option key={v} value={v}>{type.type === "boolean" ? t(v === "true" ? "yes" : "no") : v}</option>)}</select></label>;
 return <label>{label}<input required type={type.type === "date" ? "date" : type.type === "integer" ? "number" : "text"} inputMode={type.type === "decimal_string" ? "decimal" : undefined} step={type.type === "integer" ? 1 : undefined} value={typeof value === "string" || typeof value === "number" ? value : ""} onChange={e => onChange(type.type === "integer" ? (e.target.value === "" ? null : Number(e.target.value)) : e.target.value)} /></label>;
}
function MethodSourcePicker({locale,onSelect}: {locale: string; onSelect: (source: {versionId: string; fingerprint: string}) => void}) {
 const t = useTranslations("MethodPublication");const [search,setSearch] = useState("");const [rows,setRows] = useState<VaultRow[]>([]);const [offset,setOffset] = useState(0);const [selected,setSelected] = useState<VaultRow | null>(null);const [pending,start] = useTransition();const [error,setError] = useState(false);
 function find(next: number) {start(async () => {setError(false);try {const result = await loadVault({locale,search,offset:next,mode:"published",purpose:"analysis",workId:null});setRows(result.rows);setOffset(next);} catch {setError(true);}});}
 return <fieldset><legend>{t("source")}</legend><label>{t("search")}<input value={search} onChange={e => setSearch(e.target.value)} maxLength={160} /></label><button type="button" disabled={pending} onClick={() => find(0)}>{t("findSource")}</button>
  {error && <p role="alert">{t("errors.unavailable")}</p>}{rows.slice(0,25).filter(row => row.is_official && row.work_scope_id === null).map(row => <button type="button" key={row.version_id} aria-pressed={selected?.version_id === row.version_id} onClick={() => {setSelected(row);onSelect({versionId:row.version_id,fingerprint:row.content_fingerprint});}}>{row.title} · {row.revision}</button>)}
  {selected && <p>{t("selectedSource",{title:selected.title})}</p>}<button type="button" disabled={pending || offset===0} onClick={() => find(Math.max(0,offset-25))}>{t("previous")}</button><button type="button" disabled={pending || rows.length<=25} onClick={() => find(offset+25)}>{t("next")}</button>
 </fieldset>;
}
