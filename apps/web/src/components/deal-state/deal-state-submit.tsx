"use client";

import {ArrowRight, LoaderCircle} from "lucide-react";
import {useFormStatus} from "react-dom";

export function DealStateSubmit({idle, pending, value}: {idle: string; pending: string; value: string}) {
  const {pending: isPending} = useFormStatus();
  return (
    <button aria-live="polite" disabled={isPending} name="decision" type="submit" value={value}>
      {isPending ? <LoaderCircle aria-hidden="true" className="spin" size={14} /> : null}
      {isPending ? pending : idle}
      {!isPending ? <ArrowRight aria-hidden="true" size={14} /> : null}
    </button>
  );
}
