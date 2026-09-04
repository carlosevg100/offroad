"use client";

import {ArrowUp, LoaderCircle, Paperclip, X} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import {useRouter} from "next/navigation";
import {useEffect, useMemo, useRef, useState} from "react";

import type {CapitalProjectJob} from "@offroad/work-plan";

import {beginAdvisorProjectProcessing, startAdvisorProject} from "@/app/[locale]/app/advisor-actions";
import {DOCUMENT_ACCEPT, formatDocumentSize, uploadDocuments} from "@/lib/intake/upload-client";
import {createClient} from "@/lib/supabase/client";

const seedJobs = ["company_debt_view", "capital_planning", "review_existing_operation", "structure_from_documents"] as const;
type SeedJob = (typeof seedJobs)[number];

export type AdvisorStartExample = {role: string; prompt: string};
export type AdvisorStartRecent = {id: string; href: string; name: string; state: string};

export type AdvisorStartCopy = {
  greetings: {morning: string; afternoon: string; evening: string};
  question: string;
  prompt: string;
  exampleLabel: string;
  examples: AdvisorStartExample[];
  seeds: Record<SeedJob, {label: string; text: string}>;
  documentsOnly: string;
  attach: string;
  remove: string;
  send: string;
  privacy: string;
  continueLabel: string;
  status: {creating: string; uploading: string; starting: string};
  errors: {invalid: string; denied: string; duplicate: string; not_found: string; save: string; processing: string; upload: string};
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

export function AdvisorStart({copy, groupId, groupName, locale, organizationId, recents, userFirstName, userId}: Props) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [entryJobHint, setEntryJobHint] = useState<CapitalProjectJob | null>(null);
  const [prompt, setPrompt] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [status, setStatus] = useState<"idle" | "creating" | "uploading" | "starting">("idle");
  const [error, setError] = useState("");
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
    if (!normalizedPrompt || pending) return;
    setError("");
    setStatus("creating");
    const result = await startAdvisorProject({
      locale,
      prompt: normalizedPrompt,
      entryJobHint: distinctFiles.length > 0 && !entryJobHint ? "structure_from_documents" : entryJobHint,
      hasAttachments: distinctFiles.length > 0,
      requestId: crypto.randomUUID(),
      groupId: groupId ?? null,
    });
    if (!result.ok) {
      setError(copy.errors[result.error]);
      setStatus("idle");
      return;
    }

    if (distinctFiles.length > 0) {
      const supabase = createClient();
      if (!supabase) {
        setError(copy.errors.upload);
        setStatus("idle");
        return;
      }
      setStatus("uploading");
      const upload = await uploadDocuments({
        supabase,
        files: distinctFiles,
        organizationId,
        userId,
        scope: {kind: "session", sessionId: result.sessionId},
      });
      if (upload.failure || upload.uploaded.length === 0) {
        setError(copy.errors.upload);
        setStatus("idle");
        return;
      }
      // Uploading the documents is only the intake boundary. Every document-backed project must
      // cross the preliminary evidence gate immediately afterwards, including the two journeys
      // whose prompt may consist entirely of the attached package. Otherwise a documents-only
      // start creates a valid project and then leaves it idle with no analysis to continue.
      setStatus("starting");
      const processing = await beginAdvisorProjectProcessing({locale, projectId: result.projectId});
      if (!processing.ok) {
        setError(copy.errors[processing.error]);
        setStatus("idle");
        return;
      }
    }

    router.push(`/${locale}/app/projects/${result.projectId}`);
  }

  return (
    <main className="advisor-start">
      <div className="advisor-start__center">
        {groupName ? <span className="advisor-start__project-context">{copy.groupContext.replace("{project}", groupName)}</span> : null}

        <header className="advisor-start__head">
          <Image alt="" className="advisor-start__mark" height={520} priority src="/brand/offroad-symbol.png" width={512} />
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
              disabled={pending}
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
                    disabled={pending}
                    onClick={() => setFiles((current) => current.filter((candidate) => candidate !== file))}
                    type="button"
                  ><X aria-hidden="true" size={12} /></button>
                </span>
              ))}
            </div>
          ) : null}

          <footer>
            <input accept={DOCUMENT_ACCEPT} hidden multiple onChange={(event) => addFiles(event.target.files)} ref={fileInput} type="file" />
            <button aria-label={copy.attach} disabled={pending} onClick={() => fileInput.current?.click()} title={copy.attach} type="button">
              <Paperclip aria-hidden="true" size={16} />
            </button>
            <span className="advisor-composer__grow" />
            <button
              aria-label={copy.send}
              className="advisor-composer__send"
              disabled={pending || (!prompt.trim() && distinctFiles.length === 0)}
              onClick={() => void submit()}
              title={copy.send}
              type="button"
            >{pending ? <LoaderCircle aria-hidden="true" className="spin" size={15} /> : <ArrowUp aria-hidden="true" size={15} />}</button>
          </footer>
        </section>

        <p className="advisor-start__privacy">{pending ? statusLabel : copy.privacy}</p>

        <div className="advisor-start__seeds">
          {seedJobs.map((job) => (
            <button
              key={job}
              onClick={() => {
                setEntryJobHint(job);
                setPrompt(copy.seeds[job].text);
              }}
              type="button"
            >{copy.seeds[job].label}</button>
          ))}
        </div>

        {error ? <p className="form-notice form-notice--error" role="alert">{error}</p> : null}

        {recents.length > 0 ? (
          <section className="advisor-start__continue">
            <header><h2>{copy.continueLabel}</h2></header>
            {recents.map((recent) => (
              <Link href={recent.href} key={recent.id}>
                <span>{recent.name}</span>
                <small>{recent.state}</small>
              </Link>
            ))}
          </section>
        ) : null}
      </div>
    </main>
  );
}
