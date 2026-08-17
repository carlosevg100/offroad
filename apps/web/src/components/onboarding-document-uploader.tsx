"use client";

import {Check, FileCheck2, FileSpreadsheet, FileText, FileUp, LoaderCircle} from "lucide-react";
import {useRef, useState} from "react";

import {createClient} from "@/lib/supabase/client";

type DocumentItem = {id: string; original_name: string; byte_size: number | null};

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

const allowedTypes = new Set([
  "application/pdf",
  "text/csv",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

function safeName(name: string) {
  return name.normalize("NFKD").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/-+/g, "-").slice(-140);
}

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
    const next = [...documents];

    for (const file of Array.from(files).slice(0, 12)) {
      if (!allowedTypes.has(file.type) || file.size > 52_428_800) {
        setError(copy.error);
        continue;
      }
      const objectPath = `${organizationId}/${opportunityId}/${crypto.randomUUID()}-${safeName(file.name)}`;
      const {error: uploadError} = await supabase.storage.from("opportunity-documents").upload(objectPath, file, {upsert: false, contentType: file.type});
      if (uploadError) {
        setError(copy.error);
        continue;
      }
      const {data, error: insertError} = await supabase.from("source_documents").insert({
        organization_id: organizationId,
        opportunity_id: opportunityId,
        bucket_id: "opportunity-documents",
        object_path: objectPath,
        original_name: file.name,
        mime_type: file.type,
        byte_size: file.size,
        classification: "restricted",
        processing_status: "quarantined",
        created_by: userId,
      }).select("id, original_name, byte_size").single();
      if (insertError || !data) {
        await supabase.storage.from("opportunity-documents").remove([objectPath]);
        setError(copy.error);
        continue;
      }
      next.push(data);
    }
    setDocuments(next);
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
        <input accept=".pdf,.csv,.xlsx,.docx" multiple onChange={(event) => upload(event.target.files)} ref={inputRef} type="file" />
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
