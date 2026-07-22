export type PresentationName = "web-research" | "unknown";
export type ToolPresentationState = "queued" | "running" | "success" | "error";

/** Data only. Code chooses both the surface and the affordances. */
export interface ToolPresentationV1 {
  version: 1;
  id: string;
  name: PresentationName;
  state: ToolPresentationState;
  result?: { title: string; text?: string };
}

export type PresentationSurface = "ops" | "terminal-card" | "none";

export function presentationSurface(
  presentation: ToolPresentationV1,
): PresentationSurface {
  if (presentation.name !== "web-research") return "none";
  if (presentation.state === "queued" || presentation.state === "running")
    return "ops";
  return presentation.state === "success" || presentation.state === "error"
    ? "terminal-card"
    : "none";
}

export const ACTIONABLE_CAP = 7;

export interface ActionableEntry<T> {
  id: string;
  presentation: ToolPresentationV1;
  status: "reserved" | "ready";
  createdAt: number;
  collapsed: boolean;
  value?: T;
}

export function canReserveActionable<T>(
  entries: ReadonlyMap<string, ActionableEntry<T>>,
): boolean {
  return entries.size < ACTIONABLE_CAP;
}

export function reserveActionable<T>(
  entries: ReadonlyMap<string, ActionableEntry<T>>,
  presentation: ToolPresentationV1,
  createdAt: number,
): Map<string, ActionableEntry<T>> {
  if (!canReserveActionable(entries) || entries.has(presentation.id))
    return new Map(entries);
  const next = new Map(entries);
  next.set(presentation.id, {
    id: presentation.id,
    presentation,
    status: "reserved",
    createdAt,
    collapsed: false,
  });
  return next;
}

export function resolveActionable<T>(
  entries: ReadonlyMap<string, ActionableEntry<T>>,
  id: string,
  presentation: ToolPresentationV1,
  value: T,
): Map<string, ActionableEntry<T>> {
  const entry = entries.get(id);
  if (!entry) return new Map(entries);
  const next = new Map(entries);
  next.set(id, { ...entry, presentation, status: "ready", value });
  return next;
}

export function collapseActionable<T>(
  entries: ReadonlyMap<string, ActionableEntry<T>>,
  id: string,
): Map<string, ActionableEntry<T>> {
  const entry = entries.get(id);
  if (!entry) return new Map(entries);
  const next = new Map(entries);
  next.set(id, { ...entry, collapsed: true });
  return next;
}

export function removeActionable<T>(
  entries: ReadonlyMap<string, ActionableEntry<T>>,
  id: string,
): Map<string, ActionableEntry<T>> {
  const next = new Map(entries);
  next.delete(id);
  return next;
}

export function visibleActionables<T>(
  entries: ReadonlyMap<string, ActionableEntry<T>>,
): { individual: ActionableEntry<T>[]; aggregate: ActionableEntry<T>[] } {
  const ready = [...entries.values()]
    .filter((entry) => entry.status === "ready")
    .sort((a, b) => b.createdAt - a.createdAt);
  const uncollapsed = ready.filter((entry) => !entry.collapsed);
  if (ready.length <= 3 && uncollapsed.length === ready.length)
    return { individual: ready, aggregate: [] };
  const individual = uncollapsed.slice(0, 2);
  return {
    individual,
    aggregate: ready.filter((entry) => !individual.includes(entry)),
  };
}
