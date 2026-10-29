"use client";

import {ArrowUp, LoaderCircle, Paperclip, X} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import {useRouter} from "next/navigation";
import {useEffect, useMemo, useRef, useState} from "react";

import {beginAdvisorProjectProcessing, prepareAdvisorDocumentUpload, startAdvisorProject} from "@/app/[locale]/app/advisor-actions";
import {finishAdvisorDocumentUpload} from "@/lib/advisor/upload-continuation";
import {DOCUMENT_ACCEPT, formatDocumentSize, uploadDocuments} from "@/lib/intake/upload-client";
import {createClient} from "@/lib/supabase/client";

export type AdvisorStartExample = {role: string; prompt: string};
export type AdvisorStartRecent = {id: string; href: string; name: string; job: string; state: string; when: string};

export type AdvisorStartCopy = {
  greetings: {morning: string; afternoon: string; evening: string};
  question: string;
  prompt: string;
  exampleLabel: string;
  examples: AdvisorStartExample[];
  documentsOnly: string;
  attach: string;
  remove: string;
  send: string;
  continueLabel: string;
  openProject: string;
  status: {creating: string; uploading: string; starting: string};
  errors: {invalid: string; denied: string; duplicate: string; not_found: string; save: string; processing: string; stale: string; upload: string};
  groupContext: string;
};

type Props = {
  copy: AdvisorStartCopy;
  locale: "pt-BR" | "en-US";
  organizationId: string;
  userId: string;
  groupId?: string;
  groupName?: string;
  recents: AdvisorStartRecent[];
  userFirstName?: string;
};

function greetingFor(copy: AdvisorStartCopy["greetings"], name: string): string {
  const hour = new Date().getHours();
  const salute = hour < 12 ? copy.morning : hour < 18 ? copy.afternoon : copy.evening;
  return name ? `${salute}, ${name}.` : `${salute}.`;
}

/**
 * The placeholder types a real request and erases it, cycling through the roles the
 * desk actually serves. It is the cheapest answer to the only question a new user
 * has on this screen, which is what may be asked of it at all. It stops the moment
 * the field holds anything, so it never competes with the user's own text.
 */
function useRotatingExample(examples: AdvisorStartExample[], idle: boolean, fallback: string) {
  const [index, setIndex] = useState(0);
  const [typed, setTyped] = useState("");
  const reduced = useRef(false);

  useEffect(() => {
    reduced.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  useEffect(() => {
    if (!idle || examples.length === 0) return;
    const text = examples[index % examples.length]?.prompt ?? "";
    let cursor = 0;
    let timer = 0;

    // Every state change happens inside a scheduled callback, never in the effect
    // body, so a re-render can never be triggered synchronously by the effect.
    const advance = () => setIndex((current) => current + 1);
    const erase = () => {
      cursor -= 3;
      setTyped(text.slice(0, Math.max(0, cursor)));
      timer = cursor > 0 ? window.setTimeout(erase, 8) : window.setTimeout(advance, 260);
    };
    const type = () => {
      cursor += 1;
      setTyped(text.slice(0, cursor));
      timer = cursor < text.length ? window.setTimeout(type, 17) : window.setTimeout(erase, 2400);
    };
    const hold = () => {
      setTyped(text);
      timer = window.setTimeout(advance, 6000);
    };

    timer = window.setTimeout(reduced.current ? hold : type, 260);
    return () => window.clearTimeout(timer);
  }, [examples, idle, index]);

  const role = idle && examples.length > 0 ? examples[index % examples.length]?.role ?? "" : "";
  return {placeholder: idle && typed ? typed : fallback, role};
}

export function AdvisorStart({copy, groupId, groupName, locale, recents, userFirstName}: Props) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [prompt, setPrompt] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [status, setStatus] = useState<"idle" | "creating" | "uploading" | "starting">("idle");
  const [error, setError] = useState("");
  const [failedFiles, setFailedFiles] = useState<string[]>([]);
  const [createdWorkId, setCreatedWorkId] = useState<string | null>(null);
  const inFlight = useRef(false);
  const creationAttempt = useRef<{key: string; requestId: string} | null>(null);
  const pending = status !== "idle";
  const statusLabel = status === "creating" ? copy.status.creating : status === "uploading" ? copy.status.uploading : copy.status.starting;
  const distinctFiles = useMemo(() => {
    const byKey = new Map<string, File>();
    for (const file of files) byKey.set(`${file.name}:${file.size}:${file.lastModified}`, file);
    return [...byKey.values()];
  }, [files]);
  const {placeholder, role} = useRotatingExample(copy.examples, !prompt && distinctFiles.length === 0, copy.prompt);

  function addFiles(selected: FileList | null) {
    if (!selected?.length) return;
    setFiles((current) => [...current, ...Array.from(selected)]);
  }

  async function submit() {
    const normalizedPrompt = prompt.trim() || (distinctFiles.length > 0 ? copy.documentsOnly : "");
    if (!normalizedPrompt || inFlight.current || createdWorkId) return;
    inFlight.current = true;
    setError("");
    setFailedFiles([]);
    const key = JSON.stringify([normalizedPrompt, groupId ?? null, distinctFiles.map((file) => [file.name, file.size, file.lastModified])]);
    if (creationAttempt.current?.key !== key) creationAttempt.current = {key, requestId: crypto.randomUUID()};
    setStatus("creating");
    let workCreated = false;
    try {
      const result = await startAdvisorProject({
        locale, prompt: normalizedPrompt,
        entryJobHint: distinctFiles.length > 0 ? "structure_from_documents" : null,
        hasAttachments: distinctFiles.length > 0,
        requestId: creationAttempt.current.requestId,
        groupId: groupId ?? null,
      });
      if (!result.ok) {
        setError(copy.errors[result.error === "role" ? "denied" : result.error]);
        return;
      }
      // A confirmed work remains reachable after upload/processing failure. Retrying here
      // must never create a second work or hide the files already registered in the first.
      workCreated = true;
      setCreatedWorkId(result.workId);
      if (distinctFiles.length > 0) {
        const supabase = createClient();
        if (!supabase) {setError(copy.errors.upload); return;}
        const scope = await prepareAdvisorDocumentUpload({locale, projectId: result.workId});
        if (!scope.ok) {setError(copy.errors[scope.error === "role" ? "denied" : scope.error]); return;}
        setStatus("uploading");
        const upload = await uploadDocuments({supabase, files: distinctFiles,
          organizationId: scope.organizationId, userId: scope.userId,
          scope: {kind: "session", sessionId: scope.sessionId}});
        setStatus("starting");
        const continuation = await finishAdvisorDocumentUpload(upload,
          () => beginAdvisorProjectProcessing({locale, projectId: result.workId}));
        setFailedFiles(continuation.failedFiles);
        if (continuation.error) {
          setError(copy.errors[continuation.error === "role" ? "denied" : continuation.error]);
          return;
        }
      }
      router.push(`/${locale}/app/projects/${result.workId}`);
    } catch {
      setError(workCreated ? copy.errors.upload : copy.errors.save);
    } finally {
      inFlight.current = false;
      setStatus("idle");
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  return (
    <main className="advisor-start">
      <div className="advisor-start__center">
        {groupName ? <span className="advisor-start__project-context">{copy.groupContext.replace("{project}", groupName)}</span> : null}

        <header className="advisor-start__head">
          <span aria-hidden="true" className="advisor-start__mark">
            <Image alt="" height={520} priority src="/brand/offroad-symbol.png" width={512} />
          </span>
          <h1>
            <span suppressHydrationWarning>{greetingFor(copy.greetings, userFirstName ?? "")}</span>
            <span className="advisor-start__question">{copy.question}</span>
          </h1>
        </header>

        <section className="advisor-composer advisor-composer--start">
          {role ? <p className="advisor-composer__example"><span>{copy.exampleLabel}</span><i aria-hidden="true" /><span>{role}</span></p> : null}
          <label>
            <span className="sr-only">{copy.prompt}</span>
            <textarea
              autoFocus
              disabled={pending || Boolean(createdWorkId)}
              maxLength={8000}
              onChange={(event) => setPrompt(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void submit();
                }
              }}
              placeholder={placeholder}
              rows={3}
              value={prompt}
            />
          </label>

          {distinctFiles.length > 0 ? (
            <div className="advisor-composer__files">
              {distinctFiles.map((file) => (
                <span key={`${file.name}:${file.size}:${file.lastModified}`}>
                  <Paperclip aria-hidden="true" size={12} />
                  <strong>{file.name}</strong>
                  <small>{formatDocumentSize(file.size)}</small>
                  <button
                    aria-label={`${copy.remove}: ${file.name}`}
                    disabled={pending || Boolean(createdWorkId)}
                    onClick={() => setFiles((current) => current.filter((candidate) => candidate !== file))}
                    type="button"
                  ><X aria-hidden="true" size={12} /></button>
                </span>
              ))}
            </div>
          ) : null}

          <footer>
            <input accept={DOCUMENT_ACCEPT} disabled={pending || Boolean(createdWorkId)} hidden multiple onChange={(event) => addFiles(event.target.files)} ref={fileInput} type="file" />
            <button aria-label={copy.attach} disabled={pending || Boolean(createdWorkId)} onClick={() => fileInput.current?.click()} title={copy.attach} type="button">
              <Paperclip aria-hidden="true" size={16} />
            </button>
            <span className="advisor-composer__grow" />
            <button
              aria-label={copy.send}
              className="advisor-composer__send"
              disabled={pending || Boolean(createdWorkId) || (!prompt.trim() && distinctFiles.length === 0)}
              onClick={() => void submit()}
              title={copy.send}
              type="button"
            >{pending ? <LoaderCircle aria-hidden="true" className="spin" size={15} /> : <ArrowUp aria-hidden="true" size={15} />}</button>
          </footer>
        </section>

        {pending ? <p className="advisor-start__status" role="status">{statusLabel}</p> : null}

        {error ? <p className="form-notice form-notice--error" role="alert">{error}</p> : null}
        {failedFiles.length > 0 ? <ul className="form-notice form-notice--error">{failedFiles.map((name, index) => <li key={`${index}:${name}`}>{name}</li>)}</ul> : null}
        {createdWorkId && !pending ? <p><Link className="button button--secondary" href={`/${locale}/app/projects/${createdWorkId}`}>{copy.openProject}</Link></p> : null}

        {recents.length > 0 ? (
          <section className="advisor-start__continue">
            <h2>{copy.continueLabel}</h2>
            <div>
              {recents.map((recent) => (
                <Link href={recent.href} key={recent.id}>
                  <em>{recent.job}</em>
                  <strong>{recent.name}</strong>
                  <span><i /> {recent.state}</span>
                  <time>{recent.when}</time>
                </Link>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
