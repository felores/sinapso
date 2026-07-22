import { visibleActionables, type ActionableEntry } from "./tool-presentation";

export interface TerminalLabels {
  open: string;
  dismiss: string;
  aggregate: string;
}

function resultText(entry: ActionableEntry<unknown>): {
  title: string;
  detail?: string;
} {
  const result = entry.presentation.result;
  return {
    title: result?.title ?? "",
    detail: result?.text,
  };
}

function card(
  entry: ActionableEntry<unknown>,
  labels: TerminalLabels,
  onOpen: (id: string) => void,
  onDismiss: (id: string) => void,
): HTMLElement {
  const content = resultText(entry);
  const root = document.createElement("section");
  root.className = "terminal-card";
  root.dataset.id = entry.id;
  root.setAttribute("role", "status");
  const title = document.createElement("strong");
  title.className = "terminal-card-title";
  title.textContent = content.title;
  root.appendChild(title);
  if (content.detail) {
    const detail = document.createElement("span");
    detail.className = "terminal-card-detail";
    detail.textContent = content.detail;
    root.appendChild(detail);
  }
  const actions = document.createElement("div");
  actions.className = "terminal-card-actions";
  const open = document.createElement("button");
  open.type = "button";
  open.className = "terminal-card-open";
  open.textContent = labels.open;
  open.addEventListener("click", () => onOpen(entry.id));
  const dismiss = document.createElement("button");
  dismiss.type = "button";
  dismiss.className = "terminal-card-dismiss";
  dismiss.textContent = "×";
  dismiss.title = labels.dismiss;
  dismiss.setAttribute("aria-label", labels.dismiss);
  dismiss.addEventListener("click", () => onDismiss(entry.id));
  actions.append(open, dismiss);
  root.appendChild(actions);
  return root;
}

/** Closed renderer for browser-owned selection-research results. */
export function renderSelectionResearchTerminals<T>(
  host: HTMLElement,
  entries: ReadonlyMap<string, ActionableEntry<T>>,
  labels: TerminalLabels,
  onOpen: (id: string) => void,
  onDismiss: (id: string) => void,
): void {
  host.replaceChildren();
  const view = visibleActionables(entries);
  for (const entry of view.individual)
    host.appendChild(card(entry, labels, onOpen, onDismiss));
  if (!view.aggregate.length) return;
  const aggregate = document.createElement("details");
  aggregate.className = "terminal-card terminal-card-aggregate";
  const summary = document.createElement("summary");
  summary.textContent = labels.aggregate;
  aggregate.appendChild(summary);
  const list = document.createElement("div");
  list.className = "terminal-card-list";
  for (const entry of view.aggregate) {
    const item = document.createElement("button");
    item.type = "button";
    item.textContent = resultText(entry).detail || resultText(entry).title;
    item.addEventListener("click", () => onOpen(entry.id));
    list.appendChild(item);
  }
  aggregate.appendChild(list);
  host.appendChild(aggregate);
}
