"use client";

import Link from "next/link";
import {usePathname, useSearchParams} from "next/navigation";

type WorkspaceLocale = "pt-BR" | "en-US";

export function localizedWorkspaceHref(pathname: string, search: string, locale: WorkspaceLocale): string {
  const segments = pathname.split("/");
  if (segments[1] === "pt-BR" || segments[1] === "en-US") segments[1] = locale;
  else segments.splice(1, 0, locale);
  const localizedPath = segments.join("/") || `/${locale}`;
  return search ? `${localizedPath}?${search}` : localizedPath;
}

export function WorkspaceLanguageSwitcher({locale}: {locale: WorkspaceLocale}) {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const label = locale === "pt-BR"
    ? "Idioma da interface e da conversa"
    : "Interface and conversation language";

  return (
    <div aria-label={label} className="workspace-language-switcher" role="group">
      <Link aria-current={locale === "pt-BR" ? "page" : undefined} href={localizedWorkspaceHref(pathname, search, "pt-BR")} hrefLang="pt-BR">PT</Link>
      <Link aria-current={locale === "en-US" ? "page" : undefined} href={localizedWorkspaceHref(pathname, search, "en-US")} hrefLang="en-US">EN</Link>
    </div>
  );
}
