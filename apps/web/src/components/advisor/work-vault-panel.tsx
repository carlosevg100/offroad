import "@/app/vault.css";
import {loadVault} from "@/app/[locale]/app/vault/actions";
import {VaultWorkspace} from "@/components/vault-publication-review";

export async function WorkVaultPanel({locale, workId}: {locale: string; workId: string}) {
  const initialPage = await loadVault({locale, workId, search: "", offset: 0, mode: "published", purpose: "analysis"});
  return <VaultWorkspace locale={locale} workId={workId} initialPage={initialPage} />;
}
