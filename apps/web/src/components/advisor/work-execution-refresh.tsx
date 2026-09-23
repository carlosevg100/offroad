"use client";
import {useRouter} from "next/navigation";
import {useTransition} from "react";

/** Re-reads the execution through the server; nothing is cached on the client. */
export function WorkExecutionRefresh({label}: {label: string}) {
  const router = useRouter(); const [pending, startTransition] = useTransition();
  return <button type="button" disabled={pending} onClick={() => startTransition(() => router.refresh())}>{label}</button>;
}
