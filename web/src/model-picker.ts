/**
 * Pure option-state mapping for the Admin tier model pickers (KTD8).
 * Given a slot's saved provider + model and the curated option values,
 * compute what the provider select, model select, custom input, and the
 * DeepSeek fixed-model label should show (AE1). DOM wiring lives in main.ts.
 */

export type TierName = "worker" | "thinker";
export type ProviderValue = "" | "openrouter" | "deepseek";

/** Mirrors the server's fixed DeepSeek pair (server/integrations/llm.ts). */
export const DEEPSEEK_FIXED: Record<TierName, string> = {
  worker: "deepseek-v4-flash",
  thinker: "deepseek-v4-pro",
};

export interface PickerState {
  providerValue: ProviderValue;
  /** Value for the model <select>: "", a curated id, or "__custom". */
  modelSelectValue: string;
  /** Model select hidden entirely for DeepSeek (fixed pair, no picker). */
  modelSelectVisible: boolean;
  customVisible: boolean;
  customValue: string;
  /** Non-null = show this fixed model label instead of a picker (AE1). */
  fixedLabel: string | null;
}

export function pickerState(
  tier: TierName,
  provider: string | null | undefined,
  model: string | null | undefined,
  curated: string[],
): PickerState {
  const providerValue: ProviderValue =
    provider === "openrouter" || provider === "deepseek" ? provider : "";
  if (providerValue === "deepseek") {
    return {
      providerValue,
      modelSelectValue: "",
      modelSelectVisible: false,
      customVisible: false,
      customValue: "",
      fixedLabel: DEEPSEEK_FIXED[tier],
    };
  }
  const m = model ?? "";
  const isCurated = m !== "" && curated.includes(m);
  return {
    providerValue,
    modelSelectValue: isCurated ? m : m ? "__custom" : "",
    modelSelectVisible: providerValue === "openrouter",
    customVisible: providerValue === "openrouter" && !!m && !isCurated,
    customValue: !isCurated ? m : "",
    fixedLabel: null,
  };
}
