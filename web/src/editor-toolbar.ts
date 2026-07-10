/**
 * Floating selection toolbar (plan 018 U4): a bubble on non-empty selections
 * offering markdown transforms. Transforms are pure `EditorState -> spec`
 * functions so they test headless; the tooltip is CM6's native `showTooltip`
 * (no library ships this — it's the documented CodeMirror pattern).
 *
 * The row reserves a trailing slot (`toolbarExtras`) for the U7 AI input so
 * adding it never reflows the formatting tools.
 */
import {
  EditorState,
  StateField,
  type Extension,
  type TransactionSpec,
} from "@codemirror/state";
import { EditorView, showTooltip, type Tooltip } from "@codemirror/view";

export type ToolbarTransform = (state: EditorState) => TransactionSpec | null;

/** Wrap/unwrap the selection in an inline marker (`**`, `*`, `` ` ``). */
export function toggleInline(marker: string): ToolbarTransform {
  return (state) => {
    const r = state.selection.main;
    if (r.empty) return null;
    const doc = state.doc;
    const inner = doc.sliceString(r.from, r.to);
    // Markers inside the selection: **bold** selected whole.
    if (
      inner.length >= marker.length * 2 &&
      inner.startsWith(marker) &&
      inner.endsWith(marker)
    ) {
      return {
        changes: {
          from: r.from,
          to: r.to,
          insert: inner.slice(marker.length, inner.length - marker.length),
        },
        selection: { anchor: r.from, head: r.to - marker.length * 2 },
      };
    }
    // Markers just outside the selection: bold selected without its stars.
    const before = doc.sliceString(Math.max(0, r.from - marker.length), r.from);
    const after = doc.sliceString(
      r.to,
      Math.min(doc.length, r.to + marker.length),
    );
    if (before === marker && after === marker) {
      return {
        changes: [
          { from: r.from - marker.length, to: r.from, insert: "" },
          { from: r.to, to: r.to + marker.length, insert: "" },
        ],
        selection: {
          anchor: r.from - marker.length,
          head: r.to - marker.length,
        },
      };
    }
    return {
      changes: [
        { from: r.from, insert: marker },
        { from: r.to, insert: marker },
      ],
      selection: {
        anchor: r.from + marker.length,
        head: r.to + marker.length,
      },
    };
  };
}

/** Heading cycle on the selection's first line: none → H1 → H2 → H3 → H4 → none. */
export const cycleHeading: ToolbarTransform = (state) => {
  const line = state.doc.lineAt(state.selection.main.from);
  const m = /^(#{1,6})\s/.exec(line.text);
  const level = m ? m[1].length : 0;
  const next = level >= 4 ? 0 : level + 1;
  const prefix = next === 0 ? "" : "#".repeat(next) + " ";
  return {
    changes: {
      from: line.from,
      to: line.from + (m ? m[0].length : 0),
      insert: prefix,
    },
  };
};

/** Toggle `- ` bullets across the selected lines (all-on → remove). */
export const toggleBulletList: ToolbarTransform = (state) => {
  const r = state.selection.main;
  const first = state.doc.lineAt(r.from).number;
  const last = state.doc.lineAt(r.to).number;
  const lines = [];
  for (let n = first; n <= last; n++) lines.push(state.doc.line(n));
  const content = lines.filter((l) => l.text.trim().length > 0);
  if (content.length === 0) return null;
  const allBulleted = content.every((l) => /^\s*- /.test(l.text));
  const changes = content.map((l) => {
    if (allBulleted) {
      const m = /^(\s*)- /.exec(l.text)!;
      return {
        from: l.from + m[1].length,
        to: l.from + m[0].length,
        insert: "",
      };
    }
    return /^\s*- /.test(l.text)
      ? { from: l.from, to: l.from, insert: "" }
      : { from: l.from, insert: "- " };
  });
  return { changes };
};

/** Wrap the selection as `[selection]()` with the cursor inside the parens. */
export const wrapLink: ToolbarTransform = (state) => {
  const r = state.selection.main;
  if (r.empty) return null;
  const text = state.doc.sliceString(r.from, r.to);
  return {
    changes: { from: r.from, to: r.to, insert: `[${text}]()` },
    selection: { anchor: r.from + text.length + 3 },
  };
};

export type ToolbarExtras = (dom: HTMLElement, view: EditorView) => void;

interface ToolButton {
  label: string;
  title: string;
  cls: string;
  transform: ToolbarTransform;
}

const TOOLS: ToolButton[] = [
  {
    label: "B",
    title: "Bold",
    cls: "cm-tb-bold",
    transform: toggleInline("**"),
  },
  {
    label: "I",
    title: "Italic",
    cls: "cm-tb-italic",
    transform: toggleInline("*"),
  },
  {
    label: "H",
    title: "Heading H1–H4",
    cls: "cm-tb-heading",
    transform: cycleHeading,
  },
  {
    label: "•",
    title: "Bullet list",
    cls: "cm-tb-list",
    transform: toggleBulletList,
  },
  { label: "🔗", title: "Link", cls: "cm-tb-link", transform: wrapLink },
  {
    label: "`",
    title: "Inline code",
    cls: "cm-tb-code",
    transform: toggleInline("`"),
  },
];

function buildToolbarDom(
  view: EditorView,
  extras?: ToolbarExtras,
): HTMLElement {
  const dom = document.createElement("div");
  dom.className = "cm-selection-toolbar";
  for (const tool of TOOLS) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = `cm-tb-btn ${tool.cls}`;
    b.textContent = tool.label;
    b.title = tool.title;
    // mousedown would steal the selection the transform needs — block it.
    b.onmousedown = (e) => e.preventDefault();
    b.onclick = () => {
      const spec = tool.transform(view.state);
      if (spec) view.dispatch(spec);
      view.focus();
    };
    dom.appendChild(b);
  }
  if (extras) extras(dom, view);
  return dom;
}

function toolbarTooltip(
  state: EditorState,
  extras?: ToolbarExtras,
): Tooltip | null {
  const r = state.selection.main;
  if (r.empty) return null;
  return {
    pos: Math.min(r.anchor, r.head),
    above: true,
    strictSide: false,
    create: (view) => ({ dom: buildToolbarDom(view, extras) }),
  };
}

/** The toolbar extension: a StateField feeding CM6's showTooltip facet. */
export function selectionToolbar(extras?: ToolbarExtras): Extension {
  return StateField.define<Tooltip | null>({
    create: (state) => toolbarTooltip(state, extras),
    update(value, tr) {
      if (tr.docChanged || tr.selection)
        return toolbarTooltip(tr.state, extras);
      return value;
    },
    provide: (f) => showTooltip.from(f),
  });
}
