"use client";

import {FileCheck2, FileSpreadsheet, FileText, FileUp, Image as ImageIcon, LoaderCircle, Presentation, Trash2} from "lucide-react";
import {useRouter} from "next/navigation";
import {useRef, useState} from "react";

import type {IntakeDocumentSummary} from "@/lib/intake/types";
import {DOCUMENT_ACCEPT, uploadDocuments} from "@/lib/intake/upload-client";
import {createClient} from "@/lib/supabase/client";

export type DocumentIntakeUploaderCopy = {
  startError: string;
  invalidFile: string;
  uploadError: string;
  registerError: string;
  uploading: string;
  dropTitle: string;
  dropBody: string;
  select: string;
  formats: string;
  received: string;
  remove: string;
};

type Props = {
  organizationId: string;
  sessionId: string;
  userId: string;
  locale: string;
  initialDocuments: IntakeDocumentSummary[];
  copy: DocumentIntakeUploaderCopy;
  /** Server action removing one document (`document_id`, `session_id`, `locale`); omitted once the session is closed. */
  removeAction?: (formData: FormData) => Promise<void>;
};

/**
 * Session-scoped drag-and-drop upload. Files go straight from the browser to the private
 * bucket under `{organizationId}/{sessionId}/…`, are hashed (SHA-256, re-verified server-side
 * during processing) and registered in `source_documents` (RLS-protected). Copy comes from
 * the server so the component stays locale-agnostic.
 */
export function DocumentIntakeUploader({organizationId, sessionId, userId, locale, initialDocuments, copy, removeAction}: Props) {
  const router = useRouter();
  const [documents, setDocuments] = useState(initialDocuments);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    const supabase = createClient();
    if (!supabase) {
      setError(copy.startError);
      return;
    }
    setUploading(true);
    setError("");
    const result = await uploadDocuments({supabase, files: Array.from(files), organizationId, userId, scope: {kind: "session", sessionId}});
    setDocuments((current) => [...current, ...result.uploaded]);
    if (result.failure === "invalid") setError(copy.invalidFile);
    else if (result.failure === "upload") setError(copy.uploadError);
    else if (result.failure === "register") setError(copy.registerError);
    setUploading(false);
    router.refresh();
  }

  return (
    <div className="intake-upload">
      <div
        aria-busy={uploading}
        className={`intake-upload__drop${dragActive ? " is-dragging" : ""}${uploading ? " is-uploading" : ""}`}
        onClick={() => inputRef.current?.click()}
        onDragEnter={(event) => { event.preventDefault(); setDragActive(true); }}
        onDragLeave={(event) => { event.preventDefault(); if (event.currentTarget === event.target) setDragActive(false); }}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => { event.preventDefault(); setDragActive(false); void upload(event.dataTransfer.files); }}
        onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") inputRef.current?.click(); }}
        role="button"
        tabIndex={0}
      >
        <input accept={DOCUMENT_ACCEPT} multiple onChange={(event) => void upload(event.target.files)} ref={inputRef} type="file" />
        <div className="intake-upload__animation" aria-hidden="true">
          <span>{uploading ? <LoaderCircle className="spin" size={28} /> : <FileUp size={28} />}</span>
          <i><FileText size={18} /></i><i><FileSpreadsheet size={18} /></i><i><Presentation size={18} /></i><i><ImageIcon size={18} /></i>
        </div>
        <h3>{uploading ? copy.uploading : copy.dropTitle}</h3>
        <p>{copy.dropBody}</p>
        <button onClick={(event) => { event.stopPropagation(); inputRef.current?.click(); }} type="button">{copy.select}</button>
        <small>{copy.formats}</small>
      </div>

      {error ? <p className="form-notice form-notice--error" role="alert">{error}</p> : null}

      {documents.length ? (
        <div className="intake-upload__files">
          <header><strong>{copy.received}</strong><span>{documents.length}</span></header>
          {documents.map((document) => (
            <div key={document.id}>
              <FileCheck2 aria-hidden="true" size={16} />
              <span>{document.original_name}</span>
              <small>{document.byte_size ? `${(document.byte_size / 1_000_000).toFixed(1)} MB` : ""}</small>
              {removeAction ? (
                <form action={removeAction} className="intake-upload__remove">
                  <input name="locale" type="hidden" value={locale} />
                  <input name="session_id" type="hidden" value={sessionId} />
                  <input name="document_id" type="hidden" value={document.id} />
                  <button aria-label={`${copy.remove}: ${document.original_name}`} title={copy.remove} type="submit"><Trash2 aria-hidden="true" size={14} /></button>
                </form>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
