"use client";

import {FileCheck2, FileSpreadsheet, FileText, FileUp, Image as ImageIcon, LoaderCircle, Presentation} from "lucide-react";
import {useRouter} from "next/navigation";
import {useRef, useState} from "react";

import type {IntakeDocumentSummary} from "@/lib/intake/types";
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
};

type Props = {
  organizationId: string;
  sessionId: string;
  userId: string;
  initialDocuments: IntakeDocumentSummary[];
  copy: DocumentIntakeUploaderCopy;
};

const allowedExtensions = new Set(["pdf", "csv", "xls", "xlsx", "doc", "docx", "ppt", "pptx", "txt", "jpg", "jpeg", "png", "webp"]);
const MAX_BYTES = 52_428_800;
const MAX_FILES_PER_BATCH = 20;

function safeName(name: string) {
  return name.normalize("NFKD").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/-+/g, "-").slice(-140);
}

async function sha256(file: File) {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Session-scoped drag-and-drop upload. Files go straight from the browser to the private
 * bucket under `{organizationId}/{sessionId}/…`, hashed with SHA-256, and are registered in
 * `source_documents` (RLS-protected). Copy comes from the server so the component stays
 * locale-agnostic.
 */
export function DocumentIntakeUploader({organizationId, sessionId, userId, initialDocuments, copy}: Props) {
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
    const next = [...documents];

    for (const file of Array.from(files).slice(0, MAX_FILES_PER_BATCH)) {
      const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
      if (!allowedExtensions.has(extension) || file.size > MAX_BYTES) {
        setError(copy.invalidFile);
        continue;
      }
      const objectPath = `${organizationId}/${sessionId}/${crypto.randomUUID()}-${safeName(file.name)}`;
      const fileHash = await sha256(file);
      const {error: uploadError} = await supabase.storage.from("opportunity-documents").upload(objectPath, file, {upsert: false, contentType: file.type || "application/octet-stream"});
      if (uploadError) {
        setError(copy.uploadError);
        continue;
      }
      const {data, error: insertError} = await supabase.from("source_documents").insert({
        organization_id: organizationId,
        opportunity_id: null,
        intake_session_id: sessionId,
        bucket_id: "opportunity-documents",
        object_path: objectPath,
        original_name: file.name,
        mime_type: file.type || null,
        byte_size: file.size,
        sha256: fileHash,
        classification: "restricted",
        processing_status: "quarantined",
        created_by: userId,
      }).select("id, original_name, byte_size").single();
      if (insertError || !data) {
        await supabase.storage.from("opportunity-documents").remove([objectPath]);
        setError(copy.registerError);
        continue;
      }
      next.push(data);
    }
    setDocuments(next);
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
        <input accept=".pdf,.csv,.xls,.xlsx,.doc,.docx,.ppt,.pptx,.txt,.jpg,.jpeg,.png,.webp" multiple onChange={(event) => void upload(event.target.files)} ref={inputRef} type="file" />
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
            <div key={document.id}><FileCheck2 aria-hidden="true" size={16} /><span>{document.original_name}</span><small>{document.byte_size ? `${(document.byte_size / 1_000_000).toFixed(1)} MB` : ""}</small></div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
