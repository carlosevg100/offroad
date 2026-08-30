"use client";

import {LoaderCircle} from "lucide-react";
import Link from "next/link";
import {useRouter} from "next/navigation";
import {useEffect} from "react";

type Props = {
  body: string;
  locale: string;
  newProjectLabel: string;
  overviewLabel: string;
  title: string;
};

/** Keeps the project state fresh while analysis runs without blocking navigation. */
export function IntakeProcessingStatus({body, locale, newProjectLabel, overviewLabel, title}: Props) {
  const router = useRouter();

  useEffect(() => {
    const interval = window.setInterval(() => router.refresh(), 5000);
    return () => window.clearInterval(interval);
  }, [router]);

  return (
    <div className="form-notice intake-processing-status" role="status">
      <p><strong><LoaderCircle aria-hidden="true" className="spin" size={14} /> {title}</strong> {body}</p>
      <div>
        <Link className="text-link" href={`/${locale}/app`}>{overviewLabel}</Link>
        <Link className="text-link" href={`/${locale}/app/new`}>{newProjectLabel}</Link>
      </div>
    </div>
  );
}
