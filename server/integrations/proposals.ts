/**
 * Agent proposal lifecycle (U10): the trust core. The agent's ONLY mutation
 * path is a pair of custom tools (propose_create / propose_edit) registered
 * by a Solaris-generated OpenCode plugin. The plugin lives in Solaris's
 * data dir (never the vault, never the user's opencode config) and POSTs
 * proposals back to Solaris with a per-spawn secret.
 *
 * Approval mode holds each proposal for review; full-access mode
 * auto-approves. BOTH paths apply through the guarded write (U7), so no
 * OpenCode-direct filesystem route exists (KTD3). Agent-created notes get
 * provenance frontmatter; every applied change journals (R19).
 */

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  guardedCreate,
  guardedEdit,
  WriteError,
  type WriteDeps,
} from "./write.js";

export interface Proposal {
  id: string;
  kind: "create" | "edit";
  sessionId: string;
  /** Edit: target note id. Create: optional explicit path. */
  path?: string;
  title?: string;
  frontmatter?: Record<string, string>;
  /** Create: body markdown. Edit: full replacement content. */
  content: string;
  rationale?: string;
  status: "pending" | "applied" | "rejected";
  createdAt: string;
  appliedPath?: string;
  /** Edit proposals carry a preview diff against the current content. */
  diff?: string;
}

/**
 * Single-hunk line diff for edit previews.
 * ponytail: common prefix/suffix trim only; a proper LCS diff if notes
 * start churning in ways this renders confusingly.
 */
export function simpleDiff(oldText: string, newText: string): string {
  const a = oldText.split("\n");
  const b = newText.split("\n");
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  if (start === endA && start === endB) return "(no changes)";
  const out = [`@@ lines ${start + 1}-${endA} -> ${start + 1}-${endB} @@`];
  for (let i = start; i < endA; i++) out.push("- " + a[i]);
  for (let i = start; i < endB; i++) out.push("+ " + b[i]);
  return out.join("\n");
}

/**
 * Compose a note body with provenance frontmatter (R19). Provenance keys
 * are injected into the body's existing frontmatter block when present,
 * otherwise a new block is created (merged with agent-supplied frontmatter).
 */
export function composeWithProvenance(
  body: string,
  frontmatter: Record<string, string> | undefined,
  provenance: Record<string, string>,
): string {
  const provLines = Object.entries(provenance).map(([k, v]) => `${k}: ${v}`);
  if (body.startsWith("---\n")) {
    return body.replace("---\n", "---\n" + provLines.join("\n") + "\n");
  }
  const fmLines = Object.entries(frontmatter ?? {}).map(
    ([k, v]) => `${k}: ${v}`,
  );
  return ["---", ...provLines, ...fmLines, "---", "", body].join("\n");
}

export interface ProposalStoreDeps {
  writeDeps: () => WriteDeps;
  agentMode: () => "approval" | "full";
  destination: () => string;
  readNote: (id: string) => string | null;
}

export interface SubmitInput {
  kind: "create" | "edit";
  sessionId?: string;
  path?: string;
  title?: string;
  frontmatter?: Record<string, string>;
  content: string;
  rationale?: string;
}

export function createProposalStore(deps: ProposalStoreDeps) {
  const proposals: Proposal[] = [];
  let seq = 0;

  function apply(
    p: Proposal,
    override?: { content?: string; path?: string },
  ): string {
    const mode = deps.agentMode();
    const content = override?.content ?? p.content;
    if (p.kind === "create") {
      const composed = composeWithProvenance(content, p.frontmatter, {
        "created-by": "solaris-agent",
        "agent-mode": mode,
        "agent-session": p.sessionId || "unknown",
        "agent-approved": new Date().toISOString(),
      });
      const r = guardedCreate(deps.writeDeps(), {
        content: composed,
        path: override?.path ?? p.path,
        title: p.title,
        destination: deps.destination(),
        actor: "agent",
        mode,
      });
      return r.id;
    }
    if (!p.path) throw new WriteError(400, "edit proposal needs a target path");
    const r = guardedEdit(deps.writeDeps(), {
      id: override?.path ?? p.path,
      content,
      actor: "agent",
      mode,
    });
    return r.id;
  }

  return {
    /**
     * Record a proposal from the agent. In full-access mode it is applied
     * immediately (standing consent, R17) through the same guarded write.
     * Returns the message relayed to the agent as the tool result, which
     * is how the conversation shows what changed.
     */
    submit(input: SubmitInput): { proposal: Proposal; message: string } {
      if (input.kind === "edit" && !input.path)
        throw new WriteError(400, "edit needs a path");
      if (input.kind === "create" && !input.title && !input.path)
        throw new WriteError(400, "create needs a title or path");
      const p: Proposal = {
        id: `p${++seq}`,
        kind: input.kind,
        sessionId: input.sessionId ?? "",
        path: input.path,
        title: input.title,
        frontmatter: input.frontmatter,
        content: input.content,
        rationale: input.rationale,
        status: "pending",
        createdAt: new Date().toISOString(),
      };
      if (p.kind === "edit" && p.path) {
        const current = deps.readNote(p.path);
        if (current === null)
          throw new WriteError(404, `note not found: ${p.path}`);
        p.diff = simpleDiff(current, p.content);
      }
      proposals.push(p);
      if (deps.agentMode() === "full") {
        p.appliedPath = apply(p);
        p.status = "applied";
        return {
          proposal: p,
          message: `Applied directly (full-access mode): ${p.kind} ${p.appliedPath}. The change is journaled and will appear in the galaxy after a rescan.`,
        };
      }
      return {
        proposal: p,
        message: `Proposal ${p.id} recorded (${p.kind} ${p.path ?? p.title}). It is awaiting the user's approval in Solaris; do not assume it was applied.`,
      };
    },

    list(sessionId?: string): Proposal[] {
      return proposals.filter((p) => !sessionId || p.sessionId === sessionId);
    },

    get(id: string): Proposal | undefined {
      return proposals.find((p) => p.id === id);
    },

    /** Approve (optionally with user-edited content, AE10 edit-before-approve). */
    approve(
      id: string,
      override?: { content?: string; path?: string },
    ): Proposal {
      const p = proposals.find((x) => x.id === id);
      if (!p) throw new WriteError(404, "proposal not found");
      if (p.status !== "pending")
        throw new WriteError(409, `proposal already ${p.status}`);
      if (override?.content !== undefined) p.content = override.content;
      p.appliedPath = apply(p, override);
      p.status = "applied";
      return p;
    },

    /** Reject: vault untouched (AE6). */
    reject(id: string): Proposal {
      const p = proposals.find((x) => x.id === id);
      if (!p) throw new WriteError(404, "proposal not found");
      if (p.status !== "pending")
        throw new WriteError(409, `proposal already ${p.status}`);
      p.status = "rejected";
      return p;
    },
  };
}

export type ProposalStore = ReturnType<typeof createProposalStore>;

/**
 * Generate the OpenCode plugin that registers the propose tools. Written
 * into the data dir and loaded via config.plugin — the vault and the
 * user's opencode config are never touched.
 */
export function writeProposePlugin(dataDir: string): string {
  const path = join(dataDir, "solaris-propose.mjs");
  writeFileSync(
    path,
    `// Generated by Solaris. Registers the agent's only mutation path:
// proposals POSTed back to Solaris, applied through its guarded write.
import { tool } from "@opencode-ai/plugin";

async function submit(kind, args, ctx) {
  const res = await fetch(process.env.SOLARIS_PROPOSE_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-solaris-propose-secret": process.env.SOLARIS_PROPOSE_SECRET,
    },
    body: JSON.stringify({ kind, sessionId: ctx?.sessionID, ...args }),
  });
  const data = await res.json();
  if (!res.ok) return "Proposal rejected by Solaris: " + (data.error ?? res.status);
  return data.message;
}

export const SolarisProposals = async () => ({
  tool: {
    propose_create: tool({
      description:
        "Propose creating a new markdown note in the vault. The user reviews and applies it through Solaris; you cannot write files directly.",
      args: {
        title: tool.schema.string().describe("Note title (used as filename)"),
        body: tool.schema.string().describe("Markdown body of the note"),
        rationale: tool.schema.string().optional().describe("Why this note should exist"),
      },
      async execute(args, ctx) {
        return submit("create", { title: args.title, content: args.body, rationale: args.rationale }, ctx);
      },
    }),
    propose_edit: tool({
      description:
        "Propose replacing the full content of an existing vault note (path relative to the vault root, e.g. 'folder/note.md'). The user reviews a diff and applies it through Solaris.",
      args: {
        path: tool.schema.string().describe("Vault-relative path of the note to edit"),
        new_content: tool.schema.string().describe("Full replacement markdown content"),
        rationale: tool.schema.string().optional().describe("Why this edit is needed"),
      },
      async execute(args, ctx) {
        return submit("edit", { path: args.path, content: args.new_content, rationale: args.rationale }, ctx);
      },
    }),
  },
});
`,
  );
  return path;
}
