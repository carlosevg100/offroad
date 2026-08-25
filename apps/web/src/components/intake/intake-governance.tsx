import {Building2, Check, FileCheck2, ShieldAlert, X} from "lucide-react";
import {getTranslations} from "next-intl/server";

import type {IntakeSession} from "@/lib/intake/types";

type Action = (formData: FormData) => Promise<void>;

type Props = {
  locale: string;
  session: IntakeSession;
  resolveScopeSuggestion?: Action;
  revokeAuthorization?: Action;
};

type Suggestion = {
  suggestionId: string;
  legalName: string;
  status: "pending" | "confirmed" | "dismissed";
  evidenceReferences: string[];
};

const projection = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;

function pendingSuggestions(value: unknown): Suggestion[] {
  const root = projection(value);
  if (!root || !Array.isArray(root.items)) return [];
  return root.items.flatMap((item) => {
    const record = projection(item);
    if (
      !record || record.status !== "pending" || typeof record.suggestionId !== "string" ||
      typeof record.legalName !== "string" || !Array.isArray(record.evidenceReferences)
    ) return [];
    return [{
      suggestionId: record.suggestionId,
      legalName: record.legalName,
      status: "pending" as const,
      evidenceReferences: record.evidenceReferences.filter((reference): reference is string => typeof reference === "string"),
    }];
  });
}

/**
 * Explicit decisions that automation is not allowed to make: economic perimeter and whether an
 * advisor may still act. The panel is shown in collection and review so a worker result never
 * becomes stranded behind a later screen.
 */
export async function IntakeGovernance({locale, session, resolveScopeSuggestion, revokeAuthorization}: Props) {
  const t = await getTranslations({locale, namespace: "Intake.governance"});
  const suggestions = pendingSuggestions(session.analysis_scope_suggestions);
  const authorization = projection(session.advisor_authorization);
  const authorizationStatus = typeof authorization?.status === "string" ? authorization.status : null;
  const showAuthorization = session.journey === "originator" && authorizationStatus;
  if (suggestions.length === 0 && !showAuthorization) return null;

  return (
    <section className="intake-governance">
      <header>
        <span className="section-kicker">{t("kicker")}</span>
        <h3>{t("title")}</h3>
        <p>{t("body")}</p>
      </header>

      {suggestions.length > 0 ? (
        <div className="intake-governance__scope">
          <div className="intake-governance__label"><Building2 aria-hidden="true" size={16} /><strong>{t("scopeTitle")}</strong></div>
          <p>{t("scopeBody")}</p>
          {suggestions.map((suggestion) => (
            <article key={suggestion.suggestionId}>
              <div>
                <strong>{suggestion.legalName}</strong>
                <small><FileCheck2 aria-hidden="true" size={12} />{t("evidenceCount", {count: suggestion.evidenceReferences.length})}</small>
              </div>
              {resolveScopeSuggestion ? (
                <form action={resolveScopeSuggestion}>
                  <input name="locale" type="hidden" value={locale} />
                  <input name="session_id" type="hidden" value={session.id} />
                  <input name="suggestion_id" type="hidden" value={suggestion.suggestionId} />
                  <label>
                    <span>{t("roleLabel")}</span>
                    <select defaultValue="other" name="role">
                      <option value="operating_company">{t("roles.operatingCompany")}</option>
                      <option value="guarantor">{t("roles.guarantor")}</option>
                      <option value="holding">{t("roles.holding")}</option>
                      <option value="target">{t("roles.target")}</option>
                      <option value="other">{t("roles.other")}</option>
                    </select>
                  </label>
                  <label>
                    <span>{t("reasonLabel")}</span>
                    <input maxLength={1000} minLength={3} name="reason" placeholder={t("reasonPlaceholder")} required />
                  </label>
                  <div>
                    <button className="button button--small" name="decision" type="submit" value="confirm"><Check size={13} />{t("confirm")}</button>
                    <button className="button button--ghost button--small" name="decision" type="submit" value="dismiss"><X size={13} />{t("dismiss")}</button>
                  </div>
                </form>
              ) : null}
            </article>
          ))}
        </div>
      ) : null}

      {showAuthorization ? (
        <aside className={`intake-governance__authorization is-${authorizationStatus}`}>
          <div><ShieldAlert aria-hidden="true" size={16} /><strong>{t("authorizationTitle")}</strong><span>{t(`authorizationStatus.${authorizationStatus}`)}</span></div>
          <p>{t(`authorizationBody.${authorizationStatus}`)}</p>
          {authorizationStatus !== "revoked" && revokeAuthorization ? (
            <form action={revokeAuthorization}>
              <input name="locale" type="hidden" value={locale} />
              <input name="session_id" type="hidden" value={session.id} />
              <label><span>{t("revokeReason")}</span><input maxLength={1000} minLength={3} name="reason" required /></label>
              <button className="text-link" type="submit">{t("revoke")}</button>
            </form>
          ) : null}
        </aside>
      ) : null}
    </section>
  );
}
