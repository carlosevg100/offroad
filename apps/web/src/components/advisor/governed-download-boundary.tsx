"use client";
import {useRef, useState, type ReactNode, type MouseEvent} from "react";
import {useTranslations} from "next-intl";
import {z} from "zod";
const contextSchema = z.object({artifactId: z.uuid(), revisionId: z.uuid(), locale: z.enum(["pt-BR", "en-US"]), format: z.enum(["xlsx", "docx", "pptx", "pdf"]), variant: z.string()});
/** Existing file actions keep their delivery selection and gates, then queue an explicit export. */
export function GovernedDownloadBoundary({children}: {children: ReactNode}) {
  const t = useTranslations("ArtifactImportPanel"), [pending, setPending] = useState(false), [failed, setFailed] = useState(false);
  const attempts = useRef(new Map<string, string>());
  async function click(event: MouseEvent<HTMLDivElement>) {
    const anchor = (event.target as Element).closest("a[href]");if (!anchor || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
    const url = new URL(anchor.getAttribute("href")!, window.location.origin);
    if (url.origin !== window.location.origin || !/\/app\/(?:model\/[^/]+$|materials\/[^/]+\/[^/]+\/(?:docx|pdf|pptx)$|projects\/[^/]+\/(?:preview\/material$|financial-results\/[^/]+\/(?:xlsx|docx|pptx|pdf)$|work-products\/[^/]+\/(?:docx|pdf)$))/.test(url.pathname)) return;
    event.preventDefault();if (pending) return;setPending(true);setFailed(false);
    try {
      url.searchParams.set("exportContext", "1");const response = await fetch(url, {cache: "no-store"});const parsed = contextSchema.safeParse(await response.json());if (!response.ok || !parsed.success) throw new Error();const context = parsed.data;
      const endpoint = `/${context.locale}/app/artifacts/${context.artifactId}/exports`, key = JSON.stringify(context);
      if (!attempts.current.has(key)) attempts.current.set(key, crypto.randomUUID());
      const requested = await fetch(endpoint, {method: "POST", headers: {"content-type": "application/json"}, body: JSON.stringify({revisionId: context.revisionId, format: context.format, variant: context.variant, commandId: attempts.current.get(key)})});
      const result = z.object({ok: z.literal(true), result: z.object({receiptId: z.uuid().nullable(), taskId: z.uuid().optional()})}).safeParse(await requested.json());if (!requested.ok || !result.success) throw new Error();
      let receiptId = result.data.result.receiptId;
      // Bounded client waiting never regenerates a file or repeats the queue mutation.
      for (let count = 0; !receiptId && result.data.result.taskId && count < 100; count++) {
        await new Promise(resolve => setTimeout(resolve, 1500));const polled = await fetch(`${endpoint}?taskId=${result.data.result.taskId}`, {cache: "no-store"});const task = z.object({ok: z.literal(true), task: z.object({status: z.string(), receiptId: z.uuid().nullable()})}).safeParse(await polled.json());if (!polled.ok || !task.success || ["failed", "cancelled"].includes(task.data.task.status)) throw new Error();receiptId = task.data.task.receiptId;
      }
      if (!receiptId) throw new Error();const download = document.createElement("a");download.href = `${endpoint}?receiptId=${receiptId}`;download.download = "";download.click();attempts.current.delete(key);
    } catch {setFailed(true);} finally {setPending(false);}
  }
  return <div style={{display: "contents"}} onClick={event => void click(event)}>{children}{pending ? <p role="status">{t("exportQueued")}</p> : null}{failed ? <p role="alert">{t("error")}</p> : null}</div>;
}
