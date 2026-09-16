import {redirect} from "next/navigation";
import {requireWorkspace} from "@/lib/auth/workspace";

/** Historical settings links return to the same authorized workspace without collecting a role. */
export default async function RetiredProfessionalContextPage({params}: {params: Promise<{locale: string}>}) {
  const {locale} = await params;
  const {organization} = await requireWorkspace(locale);
  redirect(`/${locale}/app?workspace=${organization.id}`);
}
