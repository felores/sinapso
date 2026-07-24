import { classifyResource } from "../../shared/resource.js";

export type IntakeMethod = "tinyfish-fetch" | "exa-article" | "markitdown-url";

export interface IntakeCapabilities {
  consent: boolean;
  tinyfish: boolean;
  exa: boolean;
  markitdown: boolean;
}

export type IntakeDecision =
  | { method: IntakeMethod }
  | { error: "invalid-url" | "web-consent-required" | "no-intake-capability" };

export function classifyIntakeUrl(
  value: string,
  capabilities: IntakeCapabilities,
): IntakeDecision {
  const resource = classifyResource(value);
  if (resource.kind === "invalid") return { error: "invalid-url" };
  if (resource.kind === "unsupported") return { error: "no-intake-capability" };
  if (resource.kind === "document")
    return capabilities.markitdown
      ? { method: "markitdown-url" }
      : { error: "no-intake-capability" };
  if (capabilities.consent && capabilities.tinyfish)
    return { method: "tinyfish-fetch" };
  if (capabilities.consent && capabilities.exa)
    return { method: "exa-article" };
  return {
    error:
      !capabilities.consent && (capabilities.tinyfish || capabilities.exa)
        ? "web-consent-required"
        : "no-intake-capability",
  };
}
