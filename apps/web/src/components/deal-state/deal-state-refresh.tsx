"use client";

import {useRouter} from "next/navigation";
import {useEffect} from "react";

export function DealStateRefresh({active}: {active: boolean}) {
  const router = useRouter();

  useEffect(() => {
    if (!active) return;
    const interval = window.setInterval(() => router.refresh(), 2_500);
    return () => window.clearInterval(interval);
  }, [active, router]);

  return null;
}
