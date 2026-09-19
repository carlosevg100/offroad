"use client";
import {useTranslations} from "next-intl";
import {z} from "zod";

const parameter = z.object({componentId:z.string(),pointId:z.string(),version:z.string(),scope:z.enum(["organization","unit","work_type"]),scopeId:z.string(),rationale:z.string(),value:z.json(),source:z.object({versionId:z.string(),fingerprint:z.string()})});
export function MethodCompositionReview({manifest}: {manifest:Record<string,unknown>}) {
 const t=useTranslations("MethodPublication");
 const parsed=z.array(parameter).safeParse(manifest.overrides);
 if (!parsed.success) return null;
 return <section aria-label={t("compositionContent")}><h4>{t("compositionContent")}</h4>{parsed.data.length===0 && <p>{t("noAdaptations")}</p>}{parsed.data.map(item => <section key={`${item.componentId}:${item.pointId}:${item.scope}`}>
  <h5>{item.componentId} · {item.pointId}</h5><p>{t("version",{version:item.version})}</p>
  <p>{t("reviewScope")}: {t(`scopes.${item.scope}`)}</p><MethodValue value={item.value} />
  <p>{item.rationale}</p><details><summary>{t("reviewSource")}</summary><p className="vault-content">{item.source.versionId}</p><p className="vault-content">{item.source.fingerprint}</p></details>
 </section>)}</section>;
}
function MethodValue({value}: {value:unknown}) {
 const t=useTranslations("MethodPublication");
 if (Array.isArray(value)) return <ul>{value.map((item,index)=><li key={index}><MethodValue value={item} /></li>)}</ul>;
 if (value && typeof value==="object") return <dl>{Object.entries(value).map(([key,item])=><div key={key}><dt>{key}</dt><dd><MethodValue value={item} /></dd></div>)}</dl>;
 return <p className="vault-content">{typeof value==="boolean" ? t(value?"yes":"no") : String(value??"")}</p>;
}
