import { matzPick } from "@matz/ui";

/**
 * Translates UI strings across pt-BR, en-US, and es-ES via the shared @matz/ui locale engine.
 */
export function t(pt: string, en: string, es: string): string {
  return matzPick({ "pt-BR": pt, "en-US": en, "es-ES": es });
}
