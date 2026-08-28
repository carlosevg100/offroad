import {XMLParser} from "fast-xml-parser";

import {openSafeZip} from "./ooxml";
import {ParserError, parserLimits, type ParserWarning} from "./types";

export const nfeArchiveParserVersion = "nfe-archive-1.0.0";

export type NfeArchiveInvoice = {
  entryName: string;
  accessKey: string;
  accessKeyValid: boolean;
  invoiceNumber: string | null;
  issuedAt: string | null;
  issuerTaxId: string | null;
  recipientTaxId: string | null;
  totalAmount: string | null;
};

export type NfeArchiveCancellation = {
  entryName: string;
  accessKey: string;
  accessKeyValid: boolean;
  occurredAt: string | null;
  eventCode: string;
  registrationStatus: string | null;
  reason: string | null;
};

export type NfeArchiveParseResult = {
  archiveId: string;
  fileHash: string;
  invoices: readonly NfeArchiveInvoice[];
  cancellations: readonly NfeArchiveCancellation[];
  warnings: readonly ParserWarning[];
  parserVersion: typeof nfeArchiveParserVersion;
};

const xml = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  removeNSPrefix: true,
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  processEntities: false,
});

function text(value: unknown): string | null {
  if (typeof value === "string" && value.trim().length > 0) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function invoiceFrom(parsed: unknown, entryName: string): NfeArchiveInvoice | null {
  const root = object(parsed);
  const process = object(root?.nfeProc) ?? root;
  const nfe = object(process?.NFe);
  const info = object(nfe?.infNFe);
  if (!info) return null;
  const ide = object(info.ide);
  const issuer = object(info.emit);
  const recipient = object(info.dest);
  const total = object(object(info.total)?.ICMSTot);
  const id = text(info["@_Id"]);
  const accessKey = id?.replace(/^NFe/, "") ?? "";
  if (!/^\d{40,60}$/.test(accessKey)) return null;
  return {
    entryName,
    accessKey,
    accessKeyValid: /^\d{44}$/.test(accessKey),
    invoiceNumber: text(ide?.nNF),
    issuedAt: text(ide?.dhEmi) ?? text(ide?.dEmi),
    issuerTaxId: text(issuer?.CNPJ) ?? text(issuer?.CPF),
    recipientTaxId: text(recipient?.CNPJ) ?? text(recipient?.CPF),
    totalAmount: text(total?.vNF),
  };
}

function cancellationFrom(parsed: unknown, entryName: string): NfeArchiveCancellation | null {
  const root = object(parsed);
  const process = object(root?.procEventoNFe) ?? root;
  const event = object(object(process?.evento)?.infEvento);
  if (!event || text(event.tpEvento) !== "110111") return null;
  const response = object(object(process?.retEvento)?.infEvento);
  const detail = object(event.detEvento);
  const accessKey = text(event.chNFe) ?? text(response?.chNFe) ?? "";
  if (!/^\d{40,60}$/.test(accessKey)) return null;
  return {
    entryName,
    accessKey,
    accessKeyValid: /^\d{44}$/.test(accessKey),
    occurredAt: text(event.dhEvento) ?? text(response?.dhRegEvento),
    eventCode: "110111",
    registrationStatus: text(response?.cStat),
    reason: text(detail?.xJust),
  };
}

/**
 * Reads the fiscal evidence inside a NF-e archive without assigning credit meaning.
 * The archive remains a sample: this parser reports only the XMLs actually present and
 * never extrapolates their incidence to the full receivables tape.
 */
export async function parseNfeArchive(input: {
  bytes: Uint8Array;
  archiveId: string;
  fileHash: string;
}): Promise<NfeArchiveParseResult> {
  if (!/^[a-f0-9]{64}$/.test(input.fileHash)) throw new ParserError("NF-e archive requires a SHA-256 file hash");
  const archive = await openSafeZip(input.bytes, "NF-e archive");
  const invoices: NfeArchiveInvoice[] = [];
  const cancellations: NfeArchiveCancellation[] = [];
  const warnings: ParserWarning[] = [];

  const entries = Object.values(archive.files)
    .filter((entry) => !entry.dir && entry.name.toLowerCase().endsWith(".xml"))
    .sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    try {
      const source = await entry.async("string");
      if (source.length > parserLimits.maxZipEntryBytes) throw new ParserError(`entry "${entry.name}" is too large to parse`);
      const parsed = xml.parse(source) as unknown;
      const cancellation = cancellationFrom(parsed, entry.name);
      if (cancellation) {
        cancellations.push(cancellation);
        if (!cancellation.accessKeyValid) {
          warnings.push({code: "parse_error", message: "NF-e access key is not 44 digits", where: entry.name});
        }
        continue;
      }
      const invoice = invoiceFrom(parsed, entry.name);
      if (invoice) {
        invoices.push(invoice);
        if (!invoice.accessKeyValid) {
          warnings.push({code: "parse_error", message: "NF-e access key is not 44 digits", where: entry.name});
        }
      }
      else warnings.push({code: "parse_error", message: "XML is not a supported NF-e invoice or cancellation event", where: entry.name});
    } catch (error) {
      warnings.push({code: "parse_error", message: `XML could not be read: ${(error as Error).message}`, where: entry.name});
    }
  }

  return {
    archiveId: input.archiveId,
    fileHash: input.fileHash,
    invoices,
    cancellations,
    warnings,
    parserVersion: nfeArchiveParserVersion,
  };
}
