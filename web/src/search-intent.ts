export interface VaultSearchHit {
  path: string;
  title: string;
  snippet: string;
  rank?: number;
}

/** Keep the backend's rank authoritative while rejecting malformed hits. */
export function normalizeVaultSearchResults(
  response: unknown,
): VaultSearchHit[] {
  if (
    !response ||
    typeof response !== "object" ||
    !Array.isArray((response as { results?: unknown }).results)
  )
    return [];
  const hits: Array<VaultSearchHit & { order: number }> = [];
  for (const [order, value] of (
    response as { results: unknown[] }
  ).results.entries()) {
    if (!value || typeof value !== "object") continue;
    const hit = value as Record<string, unknown>;
    if (typeof hit.path !== "string" || !hit.path) continue;
    hits.push({
      path: hit.path,
      title: typeof hit.title === "string" ? hit.title : hit.path,
      snippet: typeof hit.snippet === "string" ? hit.snippet : "",
      rank: typeof hit.rank === "number" && hit.rank > 0 ? hit.rank : undefined,
      order,
    });
  }
  hits.sort(
    (a, b) =>
      (a.rank ?? a.order + 1) - (b.rank ?? b.order + 1) || a.order - b.order,
  );
  const seen = new Set<string>();
  return hits
    .filter((hit) => !seen.has(hit.path) && seen.add(hit.path))
    .map(({ order: _, ...hit }) => hit);
}

export function isCurrentSearchGeneration(
  generation: number,
  currentGeneration: number,
): boolean {
  return generation === currentGeneration;
}

export function searchSubmitIntent(
  value: string,
  activeMode: string | null,
): "intake" | "local" {
  if (activeMode !== null) return "local";
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:"
      ? "intake"
      : "local";
  } catch {
    return "local";
  }
}
