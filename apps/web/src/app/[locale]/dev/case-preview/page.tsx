import {notFound} from "next/navigation";

import {IntakeDesk} from "@/components/intake/intake-desk";
import {auroraDeskState} from "@/lib/intake/dev/aurora-desk";

/**
 * Development-only preview of the desk panel, fed with Aurora's state.
 *
 * Exists so the panel can be designed by looking at it rather than by imagining it. Returns
 * 404 outside development; there is no data here that matters, but a preview route that ships
 * is a route nobody remembers to remove.
 */
export default async function CasePreviewPage({params}: {params: Promise<{locale: string}>}) {
  if (process.env.NODE_ENV === "production") notFound();
  const {locale} = await params;
  const state = auroraDeskState();
  return (
    <main className="app-main" style={{margin: "0 auto", maxWidth: 980, padding: "32px 20px"}}>
      <IntakeDesk clientQuestions={state.clientQuestions} desk={state.desk} deskMissing={state.deskMissing} locale={locale} trajectory={state.trajectory} />
    </main>
  );
}
