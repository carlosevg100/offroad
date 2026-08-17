"use client";

import {FileCheck2, FileSpreadsheet, FileText, FileUp, Image as ImageIcon, LoaderCircle, Presentation} from "lucide-react";
import {useRouter} from "next/navigation";
import {useRef, useState} from "react";

import {createClient} from "@/lib/supabase/client";

type DocumentItem = {id: string; original_name: string; byte_size: number | null};

type Props = {
  organizationId: string;
  sessionId: string;
  userId: string;
  initialDocuments: DocumentItem[];
  locale: string;
};

const allowedExtensions = new Set(["pdf", "csv", "xls", "xlsx", "doc", "docx", "ppt", "pptx", "txt", "jpg", "jpeg", "png", "webp"]);

function safeName(name: string) {
  return name.normalize("NFKD").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/-+/g, "-").slice(-140);
}
export function DocumentIntakeUploader({organizationId, sessionId, userId, initialDocuments, locale}: Props) {
  const isPt = locale === "pt-BR";
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
      setError(isPt ? "Não foi possível iniciar o envio." : "The upload could not be started.");
      return;
    }
    setUploading(true);
    setError("");
    const next = [...documents];

    for (const file of Array.from(files).slice(0, 20)) {
      const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
      if (!allowedExtensions.has(extension) || file.size > 52_428_800) {
        setError(isPt ? "Um ou mais arquivos têm formato não suportado ou excedem 50 MB." : "One or more files use an unsupported format or exceed 50 MB.");
        continue;
      }
      const objectPath = `${organizationId}/${sessionId}/${crypto.randomUUID()}-${safeName(file.name)}`;
      const {error: uploadError} = await supabase.storage.from("opportunity-documents").upload(objectPath, file, {upsert: false, contentType: file.type || "application/octet-stream"});
      if (uploadError) {
        setError(isPt ? "Falha no envio de um dos documentos. Tente novamente." : "A document could not be uploaded. Please try again.");
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
        classification: "restricted",
        processing_status: "quarantined",
        created_by: userId,
      }).select("id, original_name, byte_size").single();
      if (insertError || !data) {
        await supabase.storage.from("opportunity-documents").remove([objectPath]);
        setError(isPt ? "O arquivo chegou, mas não pôde ser registrado com segurança." : "The file arrived but could not be registered securely.");
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
        <h3>{uploading ? (isPt ? "Enviando com segurança" : "Uploading securely") : (isPt ? "Arraste seus documentos para começar" : "Drop your documents to get started")}</h3>
        <p>{isPt ? "Ou selecione arquivos do seu computador. Você pode enviar tudo de uma vez." : "Or select files from your computer. You can upload everything at once."}</p>
        <button onClick={(event) => { event.stopPropagation(); inputRef.current?.click(); }} type="button">{isPt ? "Selecionar documentos" : "Select documents"}</button>
        <small>PDF · Excel · CSV · Word · PowerPoint · Imagens · Texto · 50 MB por arquivo</small>
      </div>

      {error ? <p className="form-notice form-notice--error" role="alert">{error}</p> : null}

      {documents.length ? (
        <div className="intake-upload__files">
          <header><strong>{isPt ? "Documentos recebidos" : "Documents received"}</strong><span>{documents.length}</span></header>
          {documents.map((document) => (
            <div key={document.id}><FileCheck2 aria-hidden="true" size={16} /><span>{document.original_name}</span><small>{document.byte_size ? `${(document.byte_size / 1_000_000).toFixed(1)} MB` : ""}</small></div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
