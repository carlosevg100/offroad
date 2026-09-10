import {PublicCapitalBrowser} from "@/components/market/public-capital-browser";
import {requireWorkspace} from "@/lib/auth/workspace";
import {publicCapitalCatalog} from "@/lib/market/public-capital-catalog";

import {publicCapitalRegistry} from "@/lib/market/public-capital-registry";

export default async function PublicCapitalMarketPage({params}: {params: Promise<{locale: string}>}) {
  const {locale} = await params;
  await requireWorkspace(locale);
  return <PublicCapitalBrowser catalog={publicCapitalCatalog} registry={publicCapitalRegistry} />;
}
