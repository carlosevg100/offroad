import {z} from "zod";
import {getTranslations} from "next-intl/server";

import {receivablesReleasedResultSchema} from "@/lib/receivables/released-result";
import {ReceivablesReleasedResultSection} from "./receivables-released-result";

const metric = z.object({value: z.string()});
const resultSchema = z.object({receivablesVertical: z.object({
  pipeline: z.object({phaseOne: z.object({staticMetrics: z.object({portfolio: z.object({titleCount: metric, totalOpenValue: metric})})})}).nullable(),
  methodReadiness: z.object({state: z.enum(["ready", "blocked"]), gaps: z.array(z.object({code: z.string(), question: z.object({pt: z.string(), en: z.string()})}))}),
  methodExecution: z.object({status: z.enum(["not_ready", "succeeded", "failed"]), mode: z.literal("internal_shadow"), externalEffectAllowed: z.literal(false)}).optional(),
})});

/**
 * The caller supplies only the completed current-run report checked by the server reader, plus the
 * organization's own released analysis when the database granted it. Without that grant, and while
 * a stored result no longer matches the confirmed selection, this stays the compact card.
 */
export async function ReceivablesCurrentResult({report, locale, released}: {
  report: unknown;
  locale: "pt-BR" | "en-US";
  released?: unknown;
}) {
  const grantedRelease = receivablesReleasedResultSchema.safeParse(released);
  if (grantedRelease.success && (grantedRelease.data.state === "current" || grantedRelease.data.state === "superseded")) {
    // Resolved here rather than nested as an element so the released block renders in one pass.
    return await ReceivablesReleasedResultSection({locale, released: grantedRelease.data});
  }
  const parsed = resultSchema.safeParse(report);
  if (!parsed.success || !parsed.data.receivablesVertical.pipeline) return null;
  const t = await getTranslations({locale, namespace: "ReceivablesCurrentResult"});
  const result = parsed.data.receivablesVertical;
  const metrics = result.pipeline!.phaseOne.staticMetrics.portfolio;
  const count = Number(metrics.titleCount.value), balance = Number(metrics.totalOpenValue.value);
  if (!Number.isFinite(count) || !Number.isFinite(balance)) return null;
  const status = result.methodExecution?.status === "succeeded" ? "validated" : result.methodExecution?.status === "failed" ? "failed" : result.methodReadiness.state === "ready" ? "ready" : "blocked";
  return <section className="information-request-card" data-testid="receivables-current-result" data-method-status={status} style={{padding: 24}}>
    <h3>{t("title")}</h3>
    <dl style={{display: "flex", flexWrap: "wrap", gap: 32}}>
      <div><dt>{t("titles")}</dt><dd>{new Intl.NumberFormat(locale).format(count)}</dd></div>
      <div><dt>{t("balance")}</dt><dd>{new Intl.NumberFormat(locale, {style: "currency", currency: "BRL", maximumFractionDigits: 0}).format(balance)}</dd></div>
    </dl>
    <p><strong>{t(status)}</strong></p><p>{t(`${status}Body`)}</p>
    {result.methodReadiness.state === "blocked" ? <ul>{result.methodReadiness.gaps.slice(0, 5).map((gap) => <li key={gap.code}>{gap.question[locale === "en-US" ? "en" : "pt"]}</li>)}</ul> : null}
  </section>;
}
