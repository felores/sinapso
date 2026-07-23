import {
  isToolPresentationV1,
  isServerDerivedToolPresentationV1,
  presentationSurface,
  visibleActionables,
  type ActionableEntry,
  type ServerDerivedPresentationRefV1,
} from "./tool-presentation";
import type { ExternalSourceResolver } from "./trusted-external-sources";

export interface TerminalLabels {
  open: string;
  review: string;
  retry: string;
  dismiss: string;
  aggregate: string;
  other: string;
  otherPlaceholder: string;
  create: string;
  edit: string;
  move: string;
}

export interface TerminalHandlers {
  open(id: string, invokingElement: HTMLButtonElement): void;
  dismiss(id: string): void;
  chooseWebResearch?(decisionId: string, value: string): void;
}

function text(entry: ActionableEntry<unknown>): {
  title: string;
  detail?: string;
} {
  const result = entry.presentation.result;
  return { title: result?.title ?? "", detail: result?.text };
}

function externalSourceHref(
  ref: ServerDerivedPresentationRefV1,
  resolveExternalSource?: ExternalSourceResolver,
): string | undefined {
  if (
    ref.kind !== "external-source" ||
    !("url" in ref) ||
    typeof ref.url !== "string"
  )
    return;
  try {
    const href = resolveExternalSource?.(ref.id);
    if (
      !href ||
      href !== ref.url ||
      new TextEncoder().encode(href).length > 2048
    )
      return;
    const url = new URL(href);
    if (
      url.href === href &&
      url.protocol === "https:" &&
      !!url.hostname &&
      !url.username &&
      !url.password &&
      !url.hash &&
      !url.port
    )
      return href;
  } catch {
    // Validation is repeated at the DOM boundary for defense in depth.
  }
}

function references(
  entry: ActionableEntry<unknown>,
  resolveExternalSource?: ExternalSourceResolver,
): HTMLElement | undefined {
  const refs = [
    ...(entry.presentation.sources ?? []),
    ...(entry.presentation.artifacts ?? []),
  ];
  if (!refs.length) return;
  const list = document.createElement("span");
  list.className = "terminal-card-detail";
  for (const ref of refs) {
    const href = externalSourceHref(ref, resolveExternalSource);
    if (href) {
      const link = document.createElement("a");
      link.href = href;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = ref.label ?? ref.id;
      list.appendChild(link);
    } else {
      const item = document.createElement("span");
      item.textContent = ref.label ?? ref.id;
      list.appendChild(item);
    }
  }
  return list;
}

function dismissButton(
  entry: ActionableEntry<unknown>,
  labels: TerminalLabels,
  handlers: TerminalHandlers,
): HTMLButtonElement {
  const dismiss = document.createElement("button");
  dismiss.type = "button";
  dismiss.className = "terminal-card-dismiss";
  dismiss.textContent = "x";
  dismiss.title = labels.dismiss;
  dismiss.setAttribute("aria-label", labels.dismiss);
  dismiss.addEventListener("click", () => handlers.dismiss(entry.id));
  return dismiss;
}

function choiceCard(
  root: HTMLElement,
  entry: ActionableEntry<unknown>,
  labels: TerminalLabels,
  handlers: TerminalHandlers,
): void {
  const choice = entry.presentation.decision?.choice;
  const decisionId = entry.presentation.decision?.decisionId;
  if (
    entry.presentation.name !== "web-research" ||
    !choice ||
    !decisionId ||
    !handlers.chooseWebResearch
  )
    return;
  const question = document.createElement("strong");
  question.className = "terminal-card-title";
  question.textContent = choice.question;
  const explanation = document.createElement("span");
  explanation.className = "terminal-card-detail";
  explanation.textContent = choice.explanation;
  const rows = document.createElement("div");
  rows.className = "terminal-choice-rows";
  const choose = (value: string) =>
    handlers.chooseWebResearch?.(decisionId, value);
  const candidates = [...choice.candidates, { id: "", label: labels.other }];
  const buttons: HTMLButtonElement[] = [];
  let otherInput: HTMLInputElement | null = null;
  candidates.forEach((candidate, index) => {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "terminal-choice-row";
    row.dataset.index = String(index + 1);
    row.textContent = `${index + 1}. ${candidate.label}`;
    row.addEventListener("click", () => {
      if (candidate.id) choose(candidate.id);
      else {
        otherInput ??= document.createElement("input");
        otherInput.className = "terminal-choice-other";
        otherInput.maxLength = 600;
        otherInput.placeholder = labels.otherPlaceholder;
        otherInput.setAttribute("aria-label", labels.other);
        otherInput.addEventListener("keydown", (event) => {
          if (event.key === "Enter") {
            const value = otherInput?.value.trim().normalize("NFC") ?? "";
            if (value) choose(value);
          }
        });
        rows.appendChild(otherInput);
        otherInput.focus();
      }
    });
    buttons.push(row);
    rows.appendChild(row);
  });
  root.tabIndex = 0;
  root.addEventListener("keydown", (event) => {
    if (event.target instanceof HTMLInputElement) return;
    const current = document.activeElement;
    if (
      current !== root &&
      !(
        current instanceof Element &&
        current.classList.contains("terminal-choice-row")
      )
    )
      return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const index = Math.max(0, buttons.indexOf(current as HTMLButtonElement));
      buttons[
        (index + (event.key === "ArrowDown" ? 1 : buttons.length - 1)) %
          buttons.length
      ].focus();
      return;
    }
    if (/^[1-7]$/.test(event.key)) {
      buttons[Number(event.key) - 1]?.click();
      event.preventDefault();
    }
  });
  const actions = document.createElement("div");
  actions.className = "terminal-card-actions";
  actions.appendChild(dismissButton(entry, labels, handlers));
  root.append(question, explanation, rows, actions);
}

function card(
  entry: ActionableEntry<unknown>,
  labels: TerminalLabels,
  handlers: TerminalHandlers,
  resolveExternalSource?: ExternalSourceResolver,
): HTMLElement {
  const root = document.createElement("section");
  root.className = "terminal-card";
  root.dataset.id = entry.id;
  root.setAttribute(
    "role",
    entry.presentation.state === "error" ? "alert" : "status",
  );
  if (entry.presentation.decision?.kind === "choose") {
    choiceCard(root, entry, labels, handlers);
    return root;
  }
  const content = text(entry);
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
  const refs = references(entry, resolveExternalSource);
  if (refs) root.appendChild(refs);
  const review = entry.presentation.decision?.review;
  if (review) {
    const meta = document.createElement("span");
    meta.className = "terminal-card-detail terminal-review-meta";
    meta.textContent = `${review.sourceLabel} → ${review.targetLabel} · ${review.counts.create} ${labels.create}, ${review.counts.edit} ${labels.edit}, ${review.counts.move} ${labels.move}`;
    root.appendChild(meta);
  }
  const actions = document.createElement("div");
  actions.className = "terminal-card-actions";
  const open = document.createElement("button");
  open.type = "button";
  open.className = "terminal-card-open";
  open.textContent =
    entry.presentation.decision?.kind === "review"
      ? labels.review
      : entry.presentation.state === "error"
        ? labels.retry
        : labels.open;
  open.addEventListener("click", () => handlers.open(entry.id, open));
  actions.append(open, dismissButton(entry, labels, handlers));
  root.appendChild(actions);
  return root;
}

/** Closed native-DOM terminal renderer. Entries retain their rich data elsewhere. */
export function renderTerminalCards<T>(
  host: HTMLElement,
  entries: ReadonlyMap<string, ActionableEntry<T>>,
  labels: TerminalLabels,
  handlers: TerminalHandlers,
  resolveExternalSource?: ExternalSourceResolver,
  aggregateOnly = false,
): void {
  const active = document.activeElement;
  const focusedCardId =
    active instanceof HTMLElement
      ? active.closest<HTMLElement>(".terminal-card")?.dataset.id
      : undefined;
  host.replaceChildren();
  const view = visibleActionables(entries);
  const terminalEntries = (entries: readonly ActionableEntry<T>[]) =>
    entries.filter(
      (entry) =>
        (isToolPresentationV1(entry.presentation) ||
          (!!resolveExternalSource &&
            isServerDerivedToolPresentationV1(
              entry.presentation,
              resolveExternalSource,
            ))) &&
        presentationSurface(entry.presentation) === "terminal-card",
    );
  if (!aggregateOnly)
    for (const entry of terminalEntries(view.individual))
      host.appendChild(card(entry, labels, handlers, resolveExternalSource));
  const restoreFocus = () => {
    if (!focusedCardId) return;
    const focusedCard = [
      ...host.querySelectorAll<HTMLElement>(".terminal-card"),
    ].find((card) => card.dataset.id === focusedCardId);
    focusedCard
      ?.querySelector<HTMLElement>("button, summary, [tabindex]")
      ?.focus();
  };
  const aggregateEntries = terminalEntries(
    aggregateOnly ? [...view.individual, ...view.aggregate] : view.aggregate,
  );
  if (!aggregateEntries.length) {
    restoreFocus();
    return;
  }
  const aggregate = document.createElement("details");
  aggregate.className = "terminal-card terminal-card-aggregate";
  const summary = document.createElement("summary");
  summary.textContent = labels.aggregate;
  aggregate.appendChild(summary);
  const list = document.createElement("div");
  list.className = "terminal-card-list";
  for (const entry of aggregateEntries) {
    const item = document.createElement("button");
    item.type = "button";
    const content = text(entry);
    item.textContent =
      content.detail ||
      content.title ||
      entry.presentation.decision?.choice?.question ||
      "";
    item.addEventListener("click", () => handlers.open(entry.id, item));
    list.appendChild(item);
  }
  aggregate.appendChild(list);
  host.appendChild(aggregate);
  restoreFocus();
}

export function renderSelectionResearchTerminals<T>(
  host: HTMLElement,
  entries: ReadonlyMap<string, ActionableEntry<T>>,
  labels: TerminalLabels,
  onOpen: (id: string) => void,
  onDismiss: (id: string) => void,
): void {
  renderTerminalCards(host, entries, labels, {
    open: onOpen,
    dismiss: onDismiss,
  });
}
