/**
 * Pure state for the research footer "Ingest into Wiki" split-button menu.
 * The trigger only reveals the menu; it never mutates. Selecting an item,
 * Escape, or an outside pointer event always close it.
 */
export type IngestMenuEvent = "toggle" | "select" | "escape" | "outside";

export function nextIngestMenuOpen(
  open: boolean,
  ev: IngestMenuEvent,
): boolean {
  return ev === "toggle" ? !open : false;
}

/** Trigger + menu are hidden unless at least one enabled wiki exists. */
export function ingestMenuHidden(enabledWikiCount: number): boolean {
  return enabledWikiCount === 0;
}
