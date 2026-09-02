"use client";

import {
  ArrowUp,
  Building2,
  FileSearch2,
  FolderInput,
  LoaderCircle,
  MessageSquareText,
  Paperclip,
  Route,
  X,
} from "lucide-react";
import {useRouter} from "next/navigation";
import {useMemo, useRef, useState} from "react";

import type {CapitalProjectJob} from "@offroad/work-plan";

import {beginAdvisorProjectProcessing, startAdvisorProject} from "@/app/[locale]/app/advisor-actions";
import {DOCUMENT_ACCEPT, formatDocumentSize, uploadDocuments} from "@/lib/intake/upload-client";
import {createClient} from "@/lib/supabase/client";

const starterJobs = [
  "company_debt_view",
  "origination_thesis",
  "capital_planning",
  "structure_from_documents",
  "review_existing_operation",
] as const satisfies readonly CapitalProjectJob[];

const icons = {
  company_debt_view: Building2,
  origination_thesis: MessageSquareText,
  capital_planning: Route,
  structure_from_documents: FolderInput,
  review_existing_operation: FileSearch2,
} as const;

export type AdvisorStartCopy = {
  kicker: string;
  title: string;
  body: string;
  prompt: string;
  starterLabel: string;
  starters: Record<(typeof starterJobs)[number], {label: string; placeholder: string}>;
  attach: string;
  remove: string;
  send: string;
  privacy: string;
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
};

export function AdvisorStart({copy, groupId, groupName, locale, organizationId, userId}: Props) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [entryJobHint, setEntryJobHint] = useState<(typeof starterJobs)[number] | null>(null);
  const [prompt, setPrompt] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [status, setStatus] = useState<"idle" | "creating" | "uploading" | "starting">("idle");
  const [error, setError] = useState("");
  const pending = status !== "idle";
  const placeholder = entryJobHint ? copy.starters[entryJobHint].placeholder : copy.prompt;
  const statusLabel = status === "creating" ? copy.status.creating : status === "uploading" ? copy.status.uploading : copy.status.starting;
  const distinctFiles = useMemo(() => {
    const byKey = new Map<string, File>();
    for (const file of files) byKey.set(`${file.name}:${file.size}:${file.lastModified}`, file);
    return [...byKey.values()];
  }, [files]);

  function addFiles(selected: FileList | null) {
    if (!selected?.length) return;
    setFiles((current) => [...current, ...Array.from(selected)]);
  }

  async function submit() {
    const normalizedPrompt = prompt.trim()
      || (distinctFiles.length > 0
        ? entryJobHint ? copy.starters[entryJobHint].label : copy.starters.structure_from_documents.label
        : "");
    if (!normalizedPrompt || pending) return;
    setError("");
    setStatus("creating");
    const result = await startAdvisorProject({
      locale,
      prompt: normalizedPrompt,
      entryJobHint,
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
      if (!["structure_from_documents", "review_existing_operation"].includes(result.entryJob)) {
        setStatus("starting");
        await beginAdvisorProjectProcessing({locale, projectId: result.projectId});
      }
    }

    router.push(`/${locale}/app/projects/${result.projectId}`);
  }

  return (
    <main className="advisor-start">
      <section className="advisor-start__center">
        <header>
          {groupName ? <span className="advisor-start__project-context">{copy.groupContext.replace("{project}", groupName)}</span> : null}
          <span className="section-kicker">{copy.kicker}</span>
          <h1>{copy.title}</h1>
          <p>{copy.body}</p>
        </header>

        <div aria-label={copy.starterLabel} className="advisor-starters" role="list">
          {starterJobs.map((job) => {
            const Icon = icons[job];
            const selected = entryJobHint === job;
            return (
              <button
                aria-pressed={selected}
                className={selected ? "is-selected" : undefined}
                key={job}
                onClick={() => setEntryJobHint((current) => current === job ? null : job)}
                type="button"
              >
                <Icon aria-hidden="true" size={15} />
                <span>{copy.starters[job].label}</span>
              </button>
            );
          })}
        </div>

        <section className="advisor-composer advisor-composer--start">
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
              rows={4}
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
            <div>
              <input accept={DOCUMENT_ACCEPT} hidden multiple onChange={(event) => addFiles(event.target.files)} ref={fileInput} type="file" />
              <button aria-label={copy.attach} disabled={pending} onClick={() => fileInput.current?.click()} title={copy.attach} type="button">
                <Paperclip aria-hidden="true" size={17} />
              </button>
              <span>{pending ? statusLabel : copy.privacy}</span>
            </div>
            <button
              aria-label={copy.send}
              className="advisor-composer__send"
              disabled={pending || (!prompt.trim() && distinctFiles.length === 0)}
              onClick={() => void submit()}
              title={copy.send}
              type="button"
            >{pending ? <LoaderCircle aria-hidden="true" className="spin" size={17} /> : <ArrowUp aria-hidden="true" size={17} />}</button>
          </footer>
        </section>

        {error ? <p className="form-notice form-notice--error" role="alert">{error}</p> : null}
      </section>
    </main>
  );
}
