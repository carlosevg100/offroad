"use client";

import {FileCheck2, FileUp, LoaderCircle, X} from "lucide-react";
import {useState} from "react";

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
    uploading: string;
    error: string;
    categories: string;
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
  const [error, setError] = useState("");

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

  return (
    <div className="document-uploader">
      <div className="document-uploader__intro">
        <FileUp aria-hidden="true" size={22} />
        <div><h3>{copy.title}</h3><p>{copy.body}</p></div>
      </div>
      <label className="document-dropzone">
        <input accept=".pdf,.csv,.xlsx,.docx" multiple onChange={(event) => upload(event.target.files)} type="file" />
        {uploading ? <LoaderCircle aria-hidden="true" className="spin" size={20} /> : <FileUp aria-hidden="true" size={20} />}
        <strong>{uploading ? copy.uploading : copy.choose}</strong>
        <span>{copy.categories}</span>
      </label>
      {error ? <p className="form-notice form-notice--error" role="alert">{error}</p> : null}
      {documents.length ? (
        <div className="document-list">
          {documents.map((document) => (
            <div key={document.id}><FileCheck2 aria-hidden="true" size={16} /><span>{document.original_name}</span><small>{document.byte_size ? `${(document.byte_size / 1_000_000).toFixed(1)} MB` : ""}</small></div>
          ))}
        </div>
      ) : <div className="document-list document-list--empty"><X aria-hidden="true" size={16} /><span>0</span></div>}
    </div>
  );
}
