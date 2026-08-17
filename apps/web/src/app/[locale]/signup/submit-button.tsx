"use client";

import {useFormStatus} from "react-dom";

type Props = {
  idleLabel: string;
  pendingLabel: string;
};

export function SignupSubmitButton({idleLabel, pendingLabel}: Props) {
  const {pending} = useFormStatus();

  return (
    <button aria-disabled={pending} className="button auth-form__primary" disabled={pending} type="submit">
      {pending ? pendingLabel : idleLabel}
    </button>
  );
}
