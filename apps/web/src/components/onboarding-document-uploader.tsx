"use client";

import {Check, FileCheck2, FileSpreadsheet, FileText, FileUp, LoaderCircle} from "lucide-react";
import {useRef, useState} from "react";

import type {IntakeDocumentSummary} from "@/lib/intake/types";
import {DOCUMENT_ACCEPT, uploadDocuments} from "@/lib/intake/upload-client";
import {createClient} from "@/lib/supabase/client";

type DocumentItem = IntakeDocumentSummary;

type Props = {
  organizationId: string;
  opportunityId: string;
  userId: string;
  initialDocuments: DocumentItem[];
  copy: {
    title: string;
    body: string;
    choose: string;
    drop: string;
    uploading: string;
    error: string;
    categories: string;
    received: string;
    guidanceTitle: string;
    guidanceBody: string;
    essential: {title: string; items: string[]};
    recommended: {title: string; items: string[]};
    complementary: {title: string; items: string[]};
  };
};

export function OnboardingDocumentUploader({organizationId, opportunityId, userId, initialDocuments, copy}: Props) {
  const [documents, setDocuments] = useState(initialDocuments);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    const supabase = createClient();
    if (!supabase) {
      setError(copy.error);
      return;
    }
    setUploading(true);
    setError("");
    // Same path as the document-first uploader: SHA-256 in the browser (re-verified server-side later),
    // private bucket under {organization}/{opportunity}/…, RLS-protected registration.
    const result = await uploadDocuments({supabase, files: Array.from(files), organizationId, userId, scope: {kind: "opportunity", opportunityId}});
    setDocuments((current) => [...current, ...result.uploaded]);
    if (result.failure) setError(copy.error);
    setUploading(false);
  }

  function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragActive(false);
    void upload(event.dataTransfer.files);
  }

  const guidanceGroups = [copy.essential, copy.recommended, copy.complementary];

  return (
    <div className="document-uploader">
      <div className="document-uploader__intro">
        <span><FileUp aria-hidden="true" size={18} /></span>
        <div><h3>{copy.title}</h3><p>{copy.body}</p></div>
      </div>

      <div
        aria-busy={uploading}
        className={`document-dropzone${dragActive ? " is-dragging" : ""}${uploading ? " is-uploading" : ""}`}
        onClick={() => inputRef.current?.click()}
        onDragEnter={(event) => { event.preventDefault(); setDragActive(true); }}
        onDragLeave={(event) => { event.preventDefault(); if (event.currentTarget === event.target) setDragActive(false); }}
        onDragOver={(event) => event.preventDefault()}
        onDrop={handleDrop}
        onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") inputRef.current?.click(); }}
        role="button"
        tabIndex={0}
      >
        <input accept={DOCUMENT_ACCEPT} multiple onChange={(event) => void upload(event.target.files)} ref={inputRef} type="file" />
        <div className="document-dropzone__visual">
          <i aria-hidden="true" />
          <span>{uploading ? <LoaderCircle aria-hidden="true" className="spin" size={24} /> : <FileUp aria-hidden="true" size={24} />}</span>
          <FileText aria-hidden="true" size={18} />
          <FileSpreadsheet aria-hidden="true" size={18} />
        </div>
        <strong>{uploading ? copy.uploading : copy.drop}</strong>
        <button onClick={(event) => { event.stopPropagation(); inputRef.current?.click(); }} type="button">{copy.choose}</button>
        <small>{copy.categories}</small>
      </div>

      {error ? <p className="form-notice form-notice--error" role="alert">{error}</p> : null}
      {documents.length ? (
        <div className="document-list">
          {documents.map((document) => (
            <div key={document.id}><FileCheck2 aria-hidden="true" size={16} /><span>{document.original_name}</span><small>{copy.received} · {document.byte_size ? `${(document.byte_size / 1_000_000).toFixed(1)} MB` : ""}</small></div>
          ))}
        </div>
      ) : null}

      <section className="document-guidance">
        <header><span>{copy.guidanceTitle}</span><p>{copy.guidanceBody}</p></header>
        <div className="document-guidance__grid">
          {guidanceGroups.map((group, groupIndex) => (
            <article className={groupIndex === 0 ? "is-essential" : ""} key={group.title}>
              <div><span>{String(groupIndex + 1).padStart(2, "0")}</span><strong>{group.title}</strong></div>
              <ul>{group.items.map((item) => <li key={item}><Check aria-hidden="true" size={11} />{item}</li>)}</ul>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
