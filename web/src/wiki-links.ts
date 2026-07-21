export interface WikiTarget {
  id: string;
  title: string;
  phantom?: boolean;
}

export function createWikiTargetResolver<T extends WikiTarget>(
  nodes: readonly T[],
): (rawTarget: string) => T | undefined {
  const byPath = new Map<string, T>();
  const byFileBase = new Map<string, T>();
  const byTitle = new Map<string, T>();
  const byId = new Map<string, T>();

  for (const node of nodes) {
    byId.set(node.id, node);
    byTitle.set(node.title.toLowerCase(), node);
    if (node.phantom) continue;
    const path = node.id.replace(/\.md$/i, "").toLowerCase();
    if (!byPath.has(path)) byPath.set(path, node);
    const base = path.split("/").pop() ?? path;
    if (!byFileBase.has(base)) byFileBase.set(base, node);
  }

  return (rawTarget) => {
    const normalized = rawTarget
      .trim()
      .replace(/#.*$/, "")
      .replace(/\.md$/i, "")
      .toLowerCase();
    const base = normalized.split("/").pop() ?? normalized;
    return (
      byPath.get(normalized) ??
      byFileBase.get(base) ??
      byTitle.get(normalized) ??
      byId.get(`phantom:${normalized}`)
    );
  };
}
