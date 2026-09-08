"use client";

import {FileText, FolderOpen, CircleAlert} from "lucide-react";
import {useTranslations} from "next-intl";
import {formatDocumentSize} from "@/lib/intake/upload-client";

export type InventoryDocument = {id: string; name: string; size: number | null; status: string; version?: number};
export type InventoryRequirement = {id: string; label: string; status: string; materiality: string; reason: string | null};

const documentStatuses = new Set(["quarantined", "scanning", "clean", "processing", "ready", "rejected", "failed"]);
const requirementStatuses = new Set(["missing", "partial", "conflicting", "unavailable", "not_examined"]);
const materialities = new Set(["blocking", "high", "medium", "low"]);

/** Project evidence is inventory, not an assertion that uploaded bytes prove a requirement. */
export function AdvisorEvidenceInventory({documents, requirements, coverage, onAttach, disabled = false}: {
  onAttach?: () => void;
  disabled?: boolean;
  documents: readonly InventoryDocument[];
  requirements: readonly InventoryRequirement[];
  coverage: {verified: number; total: number; notExamined: number};
}) {
  const t = useTranslations("AdvisorEvidenceInventory");
  return <section className="advisor-evidence-inventory" data-testid="evidence-inventory" id="project-evidence">
    <header><FolderOpen aria-hidden="true" size={18} /><div><h2>{t("title")}</h2><p>{t("description")}</p></div>{onAttach ? <button disabled={disabled} onClick={onAttach} type="button">{t("addFiles")}</button> : null}</header>
    <div className="advisor-evidence-inventory__summary">
      <span>{t("files", {count: documents.length})}</span>
      <span>{coverage.total ? t("coverage", {verified: coverage.verified, total: coverage.total}) : t("coveragePending")}</span>
      {coverage.notExamined > 0 ? <span>{t("notExamined", {count: coverage.notExamined})}</span> : null}
    </div>
    <details>
      <summary>{t("reviewFiles")}</summary>
      {documents.length ? <ul className="advisor-evidence-inventory__files">{documents.map((document) => <li key={document.id}>
        <FileText aria-hidden="true" size={15} /><div><strong>{document.name}</strong><small>
          {document.version ? <span>{t("version", {version: document.version})}</span> : null}
          {document.size !== null ? <span>{formatDocumentSize(document.size)}</span> : null}
          <span>{t(`documentStatus.${documentStatuses.has(document.status) ? document.status : "unknown"}`)}</span>
        </small></div>
      </li>)}</ul> : <p>{t("noFiles")}</p>}
      <p className="advisor-evidence-inventory__note">{t("processingIsNotVerification")}</p>
    </details>
    {requirements.length ? <details>
      <summary><CircleAlert aria-hidden="true" size={14} />{t("requirements", {count: requirements.length})}</summary>
      <ul className="advisor-evidence-inventory__requirements">{requirements.map((requirement) => <li key={requirement.id}>
        <div><strong>{requirement.label}</strong><span data-materiality={requirement.materiality}>
          {t(`materiality.${materialities.has(requirement.materiality) ? requirement.materiality : "unknown"}`)}
        </span></div>
        <small>{t(`requirementStatus.${requirementStatuses.has(requirement.status) ? requirement.status : "unknown"}`)}</small>
        <p>{requirement.reason ?? t("reasonPending")}</p>
      </li>)}</ul>
    </details> : <p className="advisor-evidence-inventory__note">{t("noRequirements")}</p>}
  </section>;
}
