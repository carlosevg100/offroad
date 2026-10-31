"use client";

import {FileText, FolderOpen, CircleAlert} from "lucide-react";
import {useFormatter, useTranslations} from "next-intl";
import {formatDocumentSize} from "@/lib/intake/upload-client";
import type {InventoryMetadata} from "@/lib/intake/inventory-metadata";

export type InventoryDocument = {id: string; name: string; size: number | null; status: string; version?: number; metadata?: InventoryMetadata | null};
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
  const format = useFormatter();
  const date = (value: string) => format.dateTime(new Date(value + "T00:00:00Z"), {day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC"});
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
        </small>{document.metadata ? <small data-document-classification="initial">
          <span>{t("initialClassification", {classification: document.metadata.classification ?? t("classificationUnknown")})}</span>
          <span>{document.metadata.entityName ? t("observedEntity", {name: document.metadata.entityName}) : t("entityPending")}</span>
          <span>{document.metadata.periodStart && document.metadata.periodEnd ? t("period", {start: date(document.metadata.periodStart), end: date(document.metadata.periodEnd)})
            : document.metadata.periodStart ? t("periodFrom", {date: date(document.metadata.periodStart)})
            : document.metadata.periodEnd ? t("periodUntil", {date: date(document.metadata.periodEnd)}) : t("periodPending")}</span>
        </small> : <small>{t("classificationPending")}</small>}</div>
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
