"use client";

import {useRouter} from "next/navigation";
import {useEffect, useTransition} from "react";

export function DealStateRefresh({active}: {active: boolean}) {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();

  useEffect(() => {
    if (!active) return;
    const refresh = () => {
      if (refreshing || document.visibilityState !== "visible") return;
      startRefresh(() => router.refresh());
    };
    const interval = window.setInterval(refresh, 2_500);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [active, refreshing, router, startRefresh]);

  return null;
}
