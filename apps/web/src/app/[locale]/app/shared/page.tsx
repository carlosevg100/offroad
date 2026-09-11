import {FileText, ShieldCheck} from "lucide-react";
import type {Metadata} from "next";
import Link from "next/link";
import {getTranslations} from "next-intl/server";

import {requireWorkspace} from "@/lib/auth/workspace";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {title: "Shared information packs", robots: {index: false, follow: false}};

type Props = {params: Promise<{locale: string}>};

/**
 * What was made available to this organization. The list comes from the share rows the database
 * lets this tenant read; a revoked authorization simply stops returning them.
 */
export default async function SharedPacksPage({params}: Props) {
  const {locale} = await params;
  const t = await getTranslations({locale, namespace: "SharedInformationPacks"});
  const {supabase, organization} = await requireWorkspace(locale);

  const {data: shares} = await supabase
    .from("pack_distribution_shares")
    .select("id, recipient_label, issuer_display_name, issuer_identity_disclosed, pack_revision_id, created_at")
    .eq("recipient_organization_id", organization.id)
    .eq("status", "active")
    .order("created_at", {ascending: false});

  return (
    <main className="app-canvas" data-testid="shared-packs">
      <header className="app-page-header">
        <div>
          <p className="section-kicker">{t("kicker")}</p>
          <h1>{t("title")}</h1>
          <p>{t("intro")}</p>
        </div>
      </header>
      {(shares?.length ?? 0) === 0 ? (
        <div className="empty-state">
          <span className="empty-state__number">01</span>
          <div><h3>{t("empty")}</h3><p>{t("emptyBody")}</p></div>
        </div>
      ) : (
        <section className="opportunity-table" role="list">
          {shares?.map((share) => (
            <Link className="provider-row" href={`/${locale}/app/shared/${share.id}`} key={share.id} role="listitem">
              <div>
                <span>{share.issuer_identity_disclosed ? t("identified") : t("blind")}</span>
                <strong>{share.issuer_display_name ?? t("blindIssuer")}</strong>
                <small>{share.recipient_label}</small>
              </div>
              <div>
                <span>{t("receivedOn")}</span>
                <strong>{new Intl.DateTimeFormat(locale, {dateStyle: "medium"}).format(new Date(share.created_at))}</strong>
              </div>
              <FileText aria-hidden="true" size={16} />
            </Link>
          ))}
        </section>
      )}
      <p className="app-boundary-note"><ShieldCheck aria-hidden="true" size={13} />{t("boundary")}</p>
    </main>
  );
}
