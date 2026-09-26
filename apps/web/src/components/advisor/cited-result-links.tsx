"use client";

import {FileText} from "lucide-react";
import Link from "next/link";
import {useTranslations} from "next-intl";

/** One link per execution result a conversation answer cites, to the exact revision it read. The
 * link says what it opens; the identifiers stay in the address. */
export function CitedResultLinks({citedResults}: {citedResults?: ReadonlyArray<{href: string}>}) {
  const t = useTranslations("App.advisorProject");
  if (!citedResults?.length) return null;
  return <>{citedResults.map((cited) => <Link className="advisor-thread__artifact-link" href={cited.href} key={cited.href}><FileText aria-hidden="true" size={13} />{t("openExecutionResult")}</Link>)}</>;
}
