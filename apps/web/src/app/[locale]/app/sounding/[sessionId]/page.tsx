import {redirect} from "next/navigation";
type Props = {params: Promise<{locale: string; sessionId: string}>};

/** Legacy URL retained only as a safe redirect. M8 stops at qualified introduction. */
export default async function SoundingPage({params}: Props) {
  const {locale, sessionId} = await params;
  redirect(`/${locale}/app/new?mode=documents&session=${sessionId}`);
}
