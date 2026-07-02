import { describe, it, expect, afterAll } from "vitest";
import request from "supertest";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../app";
import { TOKEN_HEADER } from "./security";
import {
  composeWithProvenance,
  simpleDiff,
  writeProposePlugin,
} from "./proposals";
import { readChangeLog } from "./write";

const ROOT = mkdtempSync(join(tmpdir(), "solaris-prop-test-"));
const VAULT = join(ROOT, "vault");
const DATA = join(ROOT, "data");
mkdirSync(VAULT, { recursive: true });
mkdirSync(DATA, { recursive: true });
writeFileSync(join(VAULT, "origin.md"), "# Origin\n\nInvestigating a gap.\n");
afterAll(() => rmSync(ROOT, { recursive: true, force: true }));

const graphPath = join(DATA, "graph.json");
writeFileSync(
  graphPath,
  JSON.stringify({
    meta: { vaultName: "t", vaultPath: VAULT, notes: 1, excludes: [] },
    nodes: [{ id: "origin.md", title: "Origin", in: 0, out: 0 }],
    links: [],
  }),
);

const { app } = createApp(graphPath, undefined, {
  configPath: join(DATA, "config.json"),
  detectDeps: {
    fileExists: () => false,
    run: async () => ({ ok: false, stdout: "", stderr: "" }),
    home: "/h",
    env: {},
  },
});
const token = async () => (await request(app).get("/api/session")).body.token;

// The submit endpoint authenticates with the propose secret, which only the
// spawned plugin knows. Tests grab it the way the plugin would: not possible
// from outside — so we exercise submit through supertest with the secret
// captured via a first failing request? No: the secret never leaves the
// server. Instead we verify the auth boundary (wrong/absent secret is 403)
// and drive the lifecycle through the store used by the app via the routes
// that ARE reachable: full coverage of apply paths uses a local store.
import { createProposalStore } from "./proposals";

function makeStore(mode: "approval" | "full") {
  return createProposalStore({
    writeDeps: () => ({ vaultRoot: VAULT, dataDir: DATA }),
    agentMode: () => mode,
    destination: () => "inbox",
    readNote: (id) => {
      const p = join(VAULT, id);
      return existsSync(p) ? readFileSync(p, "utf-8") : null;
    },
  });
}

describe("proposal lifecycle (approval mode)", () => {
  const store = makeStore("approval");

  it("submit records a pending proposal and tells the agent it is NOT applied", () => {
    const { proposal, message } = store.submit({
      kind: "create",
      sessionId: "ses_1",
      title: "Gap Note",
      content: "# Gap Note\n\nCloses the gap.\n",
      rationale: "phantom target",
    });
    expect(proposal.status).toBe("pending");
    expect(message).toContain("awaiting the user's approval");
    expect(existsSync(join(VAULT, "inbox", "Gap Note.md"))).toBe(false);
  });

  it("reject leaves the vault untouched (AE6)", () => {
    const { proposal } = store.submit({
      kind: "create",
      sessionId: "ses_1",
      title: "Rejected Note",
      content: "nope",
    });
    store.reject(proposal.id);
    expect(store.get(proposal.id)?.status).toBe("rejected");
    expect(existsSync(join(VAULT, "inbox", "Rejected Note.md"))).toBe(false);
    // settled proposals cannot be re-approved
    expect(() => store.approve(proposal.id)).toThrowError();
  });

  it("approve create writes with provenance frontmatter and journals", () => {
    const { proposal } = store.submit({
      kind: "create",
      sessionId: "ses_1",
      title: "Approved Note",
      frontmatter: { tags: "[gap]" },
      content: "# Approved\n\nbody\n",
    });
    const applied = store.approve(proposal.id);
    expect(applied.status).toBe("applied");
    const text = readFileSync(join(VAULT, applied.appliedPath!), "utf-8");
    expect(text).toContain("created-by: solaris-agent");
    expect(text).toContain("agent-mode: approval");
    expect(text).toContain("tags: [gap]");
    const last = readChangeLog(DATA).at(-1);
    expect(last).toMatchObject({
      actor: "agent",
      mode: "approval",
      action: "create",
    });
  });

  it("edit proposals carry a diff preview; approve applies it (AE10)", () => {
    const { proposal } = store.submit({
      kind: "edit",
      sessionId: "ses_1",
      path: "origin.md",
      content: "# Origin\n\nInvestigating a gap.\n\nSee also [[Gap Note]].\n",
    });
    expect(proposal.diff).toContain("+ See also [[Gap Note]].");
    store.approve(proposal.id);
    expect(readFileSync(join(VAULT, "origin.md"), "utf-8")).toContain(
      "[[Gap Note]]",
    );
    expect(readChangeLog(DATA).at(-1)).toMatchObject({
      actor: "agent",
      action: "edit",
      path: "origin.md",
    });
  });

  it("edit-before-approve persists the user's modified body", () => {
    const { proposal } = store.submit({
      kind: "create",
      sessionId: "ses_1",
      title: "Tweaked",
      content: "agent draft",
    });
    const applied = store.approve(proposal.id, {
      content: "user-corrected body",
    });
    const text = readFileSync(join(VAULT, applied.appliedPath!), "utf-8");
    expect(text).toContain("user-corrected body");
    expect(text).not.toContain("agent draft");
  });

  it("edit proposal for a missing note is refused at submit", () => {
    expect(() =>
      store.submit({
        kind: "edit",
        sessionId: "s",
        path: "ghost.md",
        content: "x",
      }),
    ).toThrowError();
  });
});

describe("full-access mode (AE9)", () => {
  const store = makeStore("full");

  it("applies immediately through the guarded write, journaled with mode full", () => {
    const { proposal, message } = store.submit({
      kind: "edit",
      sessionId: "ses_2",
      path: "origin.md",
      content:
        readFileSync(join(VAULT, "origin.md"), "utf-8") + "\nDirect edit.\n",
    });
    expect(proposal.status).toBe("applied");
    expect(message).toContain("full-access");
    expect(readFileSync(join(VAULT, "origin.md"), "utf-8")).toContain(
      "Direct edit.",
    );
    expect(readChangeLog(DATA).at(-1)).toMatchObject({
      actor: "agent",
      mode: "full",
      action: "edit",
    });
  });

  it("still refuses paths outside the vault (same guarded write)", () => {
    expect(() =>
      store.submit({
        kind: "create",
        sessionId: "s",
        path: "../escape.md",
        content: "x",
      }),
    ).toThrowError();
  });
});

describe("proposal HTTP surface", () => {
  it("submit rejects a wrong or missing propose secret", async () => {
    const bad = await request(app)
      .post("/api/agent/proposals/submit")
      .set("x-solaris-propose-secret", "wrong")
      .send({ kind: "create", title: "x", content: "y" });
    expect(bad.status).toBe(403);
    const none = await request(app)
      .post("/api/agent/proposals/submit")
      .send({ kind: "create", title: "x", content: "y" });
    expect(none.status).toBe(403);
  });

  it("the browser session token does NOT work on the submit endpoint", async () => {
    const t = await token();
    const res = await request(app)
      .post("/api/agent/proposals/submit")
      .set("x-solaris-propose-secret", t)
      .send({ kind: "create", title: "x", content: "y" });
    expect(res.status).toBe(403);
  });

  it("approve/reject require the browser session token", async () => {
    expect(
      (await request(app).post("/api/agent/proposals/p1/approve").send({}))
        .status,
    ).toBe(403);
    expect(
      (await request(app).post("/api/agent/proposals/p1/reject").send({}))
        .status,
    ).toBe(403);
    // with the token, an unknown id is a clean 404
    const t = await token();
    const res = await request(app)
      .post("/api/agent/proposals/p999/approve")
      .set(TOKEN_HEADER, t)
      .send({});
    expect(res.status).toBe(404);
  });
});

describe("provenance + diff helpers", () => {
  it("injects provenance into an existing frontmatter block", () => {
    const out = composeWithProvenance("---\ntitle: X\n---\n\nbody", undefined, {
      "created-by": "solaris-agent",
    });
    expect(out.indexOf("created-by: solaris-agent")).toBeLessThan(
      out.indexOf("title: X"),
    );
    expect(out).toContain("body");
  });

  it("creates a frontmatter block when the body has none", () => {
    const out = composeWithProvenance(
      "plain body",
      { tags: "[a]" },
      { "created-by": "solaris-agent" },
    );
    expect(out.startsWith("---\ncreated-by: solaris-agent")).toBe(true);
    expect(out).toContain("tags: [a]");
    expect(out.trim().endsWith("plain body")).toBe(true);
  });

  it("simpleDiff shows removed and added lines only", () => {
    const d = simpleDiff("a\nb\nc", "a\nB\nc");
    expect(d).toContain("- b");
    expect(d).toContain("+ B");
    expect(d).not.toContain("- a");
    expect(simpleDiff("same", "same")).toBe("(no changes)");
  });

  it("writeProposePlugin emits both propose tools", () => {
    const p = writeProposePlugin(DATA);
    const src = readFileSync(p, "utf-8");
    expect(src).toContain("propose_create");
    expect(src).toContain("propose_edit");
    expect(src).toContain("SOLARIS_PROPOSE_SECRET");
  });
});
