"use client";

import {ArrowRight, LoaderCircle} from "lucide-react";
import {useFormStatus} from "react-dom";

type Props = {idle: string; pending: string};

export function LoginSubmit({idle, pending: pendingLabel}: Props) {
  const {pending} = useFormStatus();

  return (
    <button aria-disabled={pending} className="button auth-form__primary" disabled={pending} type="submit">
      {pending ? <LoaderCircle aria-hidden="true" className="spin" size={15} /> : null}
      {pending ? pendingLabel : idle}
      {!pending ? <ArrowRight aria-hidden="true" size={15} /> : null}
    </button>
  );
}
