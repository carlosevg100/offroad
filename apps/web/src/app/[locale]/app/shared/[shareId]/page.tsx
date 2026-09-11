import {ArrowLeft, Download, ShieldCheck} from "lucide-react";
import type {Metadata} from "next";
import Link from "next/link";
import {getTranslations} from "next-intl/server";
import {notFound} from "next/navigation";
import {z} from "zod";

import {SharedPackResponse} from "@/components/advisor/shared-pack-response";
import {requireWorkspace} from "@/lib/auth/workspace";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {title: "Shared information pack", robots: {index: false, follow: false}};

type Props = {params: Promise<{locale: string; shareId: string}>};

const packSchema = z.object({
  share_id: z.uuid(),
  pack_revision_id: z.uuid(),
  revision_number: z.number().int().positive(),
  pack_fingerprint: z.string().regex(/^[0-9a-f]{64}$/),
  revision_status: z.enum(["current", "superseded"]),
  issued_at: z.string(),
  identity_policy: z.enum(["identified_restricted", "blind_initial"]),
  issuer_name: z.string().nullable(),
  items: z.array(z.object({
    id: z.uuid(),
    position: z.number().int().positive(),
    deliverableId: z.string(),
    format: z.enum(["interactive", "xlsx", "pptx", "docx", "pdf"]),
    artifactFingerprint: z.string().regex(/^[0-9a-f]{64}$/),
    templateKey: z.string(),
    templateVersion: z.string(),
    templateOrigin: z.enum(["offroad_house", "client_supplied"]),
    templateFingerprint: z.string().nullable(),
  })),
});

/**
 * One shared pack as the recipient organization sees it: the exact files, their fingerprint and
 * template identity, and the form where the organization records its own answer. Reading the pack
 * is itself an event, so the issuer knows what was opened and when.
 */
export default async function SharedPackPage({params}: Props) {
  const {locale, shareId} = await params;
  if (!z.uuid().safeParse(shareId).success) notFound();
  const t = await getTranslations({locale, namespace: "SharedInformationPacks"});
  const {supabase, organization} = await requireWorkspace(locale);

  const {data, error} = await supabase.rpc("read_shared_information_pack", {p_share_id: shareId});
  const pack = packSchema.safeParse(data);
  if (error || !pack.success) notFound();

  const {data: responses} = await supabase
    .from("pack_recipient_responses")
    .select("id, response_state, note, occurred_at, supersedes_response_id")
    .eq("recipient_organization_id", organization.id)
    .eq("share_id", shareId)
    .order("occurred_at", {ascending: true});
  const superseded = new Set((responses ?? []).flatMap((row) => row.supersedes_response_id ? [row.supersedes_response_id] : []));
  const active = (responses ?? []).filter((row) => !superseded.has(row.id));
  const latest = active.at(-1) ?? null;

  return (
    <main className="app-canvas" data-testid="shared-pack">
      <Link className="text-link" href={`/${locale}/app/shared`}><ArrowLeft aria-hidden="true" size={14} />{t("back")}</Link>
      <header className="app-page-header">
        <div>
          <p className="section-kicker">{t("kicker")}</p>
          <h1>{pack.data.issuer_name ?? t("blindIssuer")}</h1>
          <p>{t("packRevision", {number: pack.data.revision_number})}</p>
          <p>{t(`identityPolicy.${pack.data.identity_policy}`)}</p>
        </div>
      </header>

      <section className="pipeline-section">
        <div className="pipeline-section__header">
          <h2>{t("itemsTitle")}</h2>
          <span data-testid="shared-pack-fingerprint">{pack.data.pack_fingerprint.slice(0, 16)}</span>
        </div>
        <div className="opportunity-table" role="list">
          {pack.data.items.map((item) => (
            <div className="provider-row" data-testid="shared-pack-item" key={item.id} role="listitem">
              <div>
                <span>{t(`format.${item.format}`)}</span>
                <strong>{t.has(`deliverable.${item.deliverableId}`) ? t(`deliverable.${item.deliverableId}`) : item.deliverableId}</strong>
                <small>{item.templateKey} {item.templateVersion}</small>
              </div>
              <div>
                <span>{t("artifactFingerprint")}</span>
                <strong>{item.artifactFingerprint.slice(0, 16)}</strong>
              </div>
              {item.format === "pdf" || item.format === "docx" || item.format === "pptx" ? (
                <Link
                  className="text-link"
                  data-testid="shared-pack-item-open"
                  href={`/${locale}/app/shared/${shareId}/${item.id}`}
                >
                  <Download aria-hidden="true" size={14} />{t("openItem")}
                </Link>
              ) : <span>{t("itemNotDownloadable")}</span>}
            </div>
          ))}
        </div>
      </section>

      {active.length ? (
        <section className="pipeline-section" data-testid="shared-pack-history">
          <div className="pipeline-section__header"><h2>{t("historyTitle")}</h2></div>
          <ul>
            {active.map((row) => (
              <li key={row.id}>
                {t(`responseState.${row.response_state}`)} · {new Intl.DateTimeFormat(locale, {dateStyle: "short"}).format(new Date(row.occurred_at))}
                {row.note ? ` · ${row.note}` : ""}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <SharedPackResponse
        latestResponseId={latest?.id ?? null}
        locale={locale === "en-US" ? "en-US" : "pt-BR"}
        shareId={shareId}
      />
      <p className="app-boundary-note"><ShieldCheck aria-hidden="true" size={13} />{t("boundary")}</p>
    </main>
  );
}
