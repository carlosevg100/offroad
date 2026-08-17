import {ShieldCheck} from "lucide-react";

import {BrandMark} from "@/components/brand-mark";
import type {AppLocale} from "@/i18n/routing";

type Props = {
  children: React.ReactNode;
  locale: AppLocale;
  eyebrow?: string;
  title: string;
  body: string;
  assurance: string;
};

export function AuthShell({children, locale, eyebrow, title, body, assurance}: Props) {
  return (
    <main className="auth-page">
      <section className="auth-panel auth-panel--context">
        <BrandMark inverted locale={locale} />
        <div className="auth-panel__copy">
          {eyebrow ? <p className="section-kicker section-kicker--light">{eyebrow}</p> : null}
          <h1>{title}</h1>
          <p>{body}</p>
        </div>
        <div className="auth-assurance">
          <ShieldCheck aria-hidden="true" size={18} />
          <span>{assurance}</span>
        </div>
      </section>
      <section className="auth-panel auth-panel--form" aria-label={title}>{children}</section>
    </main>
  );
}
