"use client";

import {ArrowRight, LoaderCircle} from "lucide-react";
import {useState} from "react";
import {useFormStatus} from "react-dom";

type Props = {
  idle: string;
  pending: string;
  className?: string;
  form?: string;
};

/** Immediate feedback for server-action forms. The route may still be rendering, but the click
 * is never silent and duplicate submissions are blocked while the mutation is in flight. */
export function IntakeActionSubmit({idle, pending, className = "button", form}: Props) {
  const {pending: formPending} = useFormStatus();
  const [externalPending, setExternalPending] = useState(false);
  const isPending = formPending || externalPending;

  function showExternalPending() {
    if (!form) return;
    const target = document.getElementById(form);
    if (target instanceof HTMLFormElement && target.checkValidity()) setExternalPending(true);
  }

  return (
    <button aria-busy={isPending} aria-live="polite" className={className} disabled={isPending} form={form} onClick={showExternalPending} type="submit">
      {isPending ? <LoaderCircle aria-hidden="true" className="spin" size={15} /> : null}
      {isPending ? pending : idle}
      {!isPending ? <ArrowRight aria-hidden="true" size={15} /> : null}
    </button>
  );
}
