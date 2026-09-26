import {createTranslator} from "next-intl";

import en from "../../../messages/en-US.json";
import pt from "../../../messages/pt-BR.json";
import {workUpdateNames, type WorkUpdateNames} from "./work-update-names";

export const catalogues = {"pt-BR": pt, "en-US": en} as const;

/** The name resolver as the server builds it, over the message catalog of one locale. Tests only. */
export function namesFor(locale: "pt-BR" | "en-US"): WorkUpdateNames {
  type Translator = {(key: string, values?: Record<string, string | number>): string; has: (key: string) => boolean};
  const t = createTranslator({locale, messages: catalogues[locale], namespace: "App.workUpdateNames"}) as unknown as Translator;
  return workUpdateNames({text: (key, values) => t(key, values), has: (key) => t.has(key)});
}
