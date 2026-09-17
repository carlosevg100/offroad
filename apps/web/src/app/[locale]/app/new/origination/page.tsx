import {redirect} from "next/navigation";
import {requireWorkspace} from "@/lib/auth/workspace";

/** Preserve old links while retiring company-first setup as a second entry path. */
export default async function LegacyWorkEntry({params}: {params: Promise<{locale: string}>}) {
  const {locale} = await params;
  await requireWorkspace(locale);
  redirect(`/${locale}/app`);
}
