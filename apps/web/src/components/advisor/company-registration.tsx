"use client";

import {LoaderCircle} from "lucide-react";
import {useRef, useState} from "react";
import {useTranslations} from "next-intl";

import {registerWorkCompany} from "@/app/[locale]/app/projects/[projectId]/executions/actions";

/** The company the premises are calculated for, stated once in the card when the work names none:
 * its name and CNPJ. On success the card confirms again by itself; nothing else is asked. */
export function CompanyRegistration({locale, projectId, onRegistered}: {locale: "pt-BR" | "en-US"; projectId: string; onRegistered: () => void}) {
  const t = useTranslations("CompanyRegistration");
  const lock = useRef(false);
  const [state, setState] = useState<{kind: "idle" | "busy" | "error"; error?: string}>({kind: "idle"});
  async function submit(form: FormData) {
    if (lock.current) return;
    lock.current = true; setState({kind: "busy"});
    try {
      const result = await registerWorkCompany({locale, projectId, name: String(form.get("name") ?? ""), cnpj: String(form.get("cnpj") ?? "")});
      if (result.ok) {setState({kind: "idle"}); onRegistered();}
      else setState({kind: "error", error: result.error});
    } catch {
      setState({kind: "error", error: "unavailable"});
    } finally {
      lock.current = false;
    }
  }
  return <form className="investment-premises-card__group company-registration" action={submit}>
    <small>{t("title")}</small>
    <p>{t("lead")}</p>
    <label>{t("name")}<input name="name" required minLength={2} maxLength={300} autoComplete="organization" /></label>
    <label>{t("cnpj")}<input name="cnpj" required minLength={14} maxLength={24} inputMode="text" placeholder="00.000.000/0000-00" /></label>
    <button type="submit" className="button button--primary" disabled={state.kind === "busy"}>
      {state.kind === "busy" ? <><LoaderCircle aria-hidden="true" className="spin" size={13} />{t("registering")}</> : t("register")}
    </button>
    {state.kind === "error" ? <p role="alert" className="investment-premises-card__error">{state.error === "invalid_cnpj" ? t("errors.invalidCnpj")
      : state.error === "role_exists" ? t("errors.roleExists") : t("errors.unavailable")}</p> : null}
  </form>;
}
