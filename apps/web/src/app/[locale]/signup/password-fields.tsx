"use client";

import {Check} from "lucide-react";
import {useId, useMemo, useState} from "react";

type Props = {
  confirmLabel: string;
  labels: {
    length: string;
    lowercase: string;
    uppercase: string;
    special: string;
  };
  passwordLabel: string;
  validLabel: string;
};

export function PasswordFields({confirmLabel, labels, passwordLabel, validLabel}: Props) {
  const requirementsId = useId();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");

  const requirements = useMemo(() => [
    {label: labels.length, met: password.length >= 8},
    {label: labels.uppercase, met: /[A-Z]/.test(password)},
    {label: labels.lowercase, met: /[a-z]/.test(password)},
    {label: labels.special, met: /[\p{P}\p{S}]/u.test(password)},
  ], [labels, password]);

  const passwordIsValid = requirements.every(({met}) => met);
  const confirmationIsValid = passwordIsValid && confirmation === password;

  return (
    <>
      <label className="field password-field">
        <span>{passwordLabel}</span>
        <span className="password-field__control">
          <input
            aria-describedby={requirementsId}
            autoComplete="new-password"
            maxLength={128}
            minLength={8}
            name="password"
            onInput={(event) => setPassword(event.currentTarget.value)}
            pattern={"(?=.*[a-z])(?=.*[A-Z])(?=.*[\\p{P}\\p{S}]).{8,128}"}
            required
            type="password"
            value={password}
          />
          {passwordIsValid ? <Check aria-label={validLabel} className="password-field__valid" size={16} strokeWidth={2.4} /> : null}
        </span>
        <ul className="password-requirements" id={requirementsId}>
          {requirements.map((requirement) => (
            <li className={requirement.met ? "is-met" : undefined} key={requirement.label}>
              <span aria-hidden="true" className="password-requirements__check"><Check size={10} strokeWidth={2.8} /></span>
              {requirement.label}
            </li>
          ))}
        </ul>
      </label>
      <label className="field password-field">
        <span>{confirmLabel}</span>
        <span className="password-field__control">
          <input
            autoComplete="new-password"
            maxLength={128}
            minLength={8}
            name="confirm_password"
            onInput={(event) => setConfirmation(event.currentTarget.value)}
            required
            type="password"
            value={confirmation}
          />
          {confirmationIsValid ? <Check aria-label={validLabel} className="password-field__valid" size={16} strokeWidth={2.4} /> : null}
        </span>
      </label>
    </>
  );
}
