export type UiLocale = "en" | "es";

export function parseUiLocale(value: unknown): UiLocale {
  return value === "es" ? "es" : "en";
}

export function outputLanguageInstruction(locale: UiLocale): string {
  return locale === "es" ? "Responde en español." : "Respond in English.";
}
