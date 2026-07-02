import { describe, it, expect, afterAll } from "vitest";
import request from "supertest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../app";
import { TOKEN_HEADER } from "./security";
import { createTerminalManager, type PtyLike } from "./terminal";

class FakePty implements PtyLike {
  dataFns: Array<(d: string) => void> = [];
  exitFns: Array<(e: { exitCode: number }) => void> = [];
  written: string[] = [];
  size = { cols: 0, rows: 0 };
  killed = false;
  onData(fn: (d: string) => void) {
    this.dataFns.push(fn);
  }
  onExit(fn: (e: { exitCode: number }) => void) {
    this.exitFns.push(fn);
  }
  write(d: string) {
    this.written.push(d);
  }
  resize(cols: number, rows: number) {
    this.size = { cols, rows };
  }
  kill() {
    this.killed = true;
  }
  emit(d: string) {
    for (const fn of this.dataFns) fn(d);
  }
  exit() {
    for (const fn of this.exitFns) fn({ exitCode: 0 });
  }
}

describe("terminal manager", () => {
  it("spawns once, relays output with backlog replay, kills cleanly", async () => {
    const ptys: FakePty[] = [];
    const spawns: Array<{
      cmd: string;
      cwd: string;
      cols: number;
      rows: number;
    }> = [];
    const mgr = createTerminalManager({
      ptyFactory: async (cmd, cwd, cols, rows) => {
        spawns.push({ cmd, cwd, cols, rows });
        const p = new FakePty();
        ptys.push(p);
        return p;
      },
    });
    await mgr.start("/bin/opencode", "/vault", 100, 30);
    await mgr.start("/bin/opencode", "/vault", 100, 30); // reused, not respawned
    expect(spawns).toHaveLength(1);
    expect(spawns[0]).toMatchObject({ cmd: "/bin/opencode", cwd: "/vault" });

    ptys[0].emit("early output ");
    const seen: string[] = [];
    const unsub = mgr.subscribe((d) => seen.push(d));
    expect(seen).toEqual(["early output "]); // backlog replayed on connect
    ptys[0].emit("live output");
    expect(seen).toEqual(["early output ", "live output"]);

    mgr.write("keys");
    expect(ptys[0].written).toEqual(["keys"]);
    mgr.resize(120, 40);
    expect(ptys[0].size).toEqual({ cols: 120, rows: 40 });

    unsub();
    mgr.kill();
    expect(ptys[0].killed).toBe(true);
    expect(mgr.running()).toBe(false);
  });

  it("marks exited terminals and announces the exit to subscribers", async () => {
    const p = new FakePty();
    const mgr = createTerminalManager({ ptyFactory: async () => p });
    await mgr.start("x", "/v", 80, 24);
    const seen: string[] = [];
    mgr.subscribe((d) => seen.push(d));
    p.exit();
    expect(mgr.running()).toBe(false);
    expect(seen.join("")).toContain("opencode exited");
  });
});

describe("terminal routes", () => {
  const VAULT = mkdtempSync(join(tmpdir(), "solaris-term-test-"));
  afterAll(() => rmSync(VAULT, { recursive: true, force: true }));
  const graphPath = join(VAULT, "graph.json");
  writeFileSync(
    graphPath,
    JSON.stringify({
      meta: { vaultName: "t", vaultPath: VAULT, notes: 0, excludes: [] },
      nodes: [],
      links: [],
    }),
  );
  const authPath = join(VAULT, "auth.json");
  writeFileSync(authPath, JSON.stringify({ opencode: { type: "oauth" } }));
  const OC_BIN = "/fake/bin/opencode";

  function makeApp(ptyOk: boolean) {
    const pty = new FakePty();
    const app = createApp(graphPath, undefined, {
      configPath: join(VAULT, `config-${ptyOk}.json`),
      detectDeps: {
        home: "/h",
        env: { PATH: "/fake/bin" },
        fileExists: (p) => p === OC_BIN,
        run: async (cmd) => ({
          ok: cmd === OC_BIN,
          stdout: "1.17.13",
          stderr: "",
        }),
      },
      opencode: { authJsonPath: authPath, backoff: () => 1 },
      terminal: {
        ptyFactory: async (cmd, cwd) => {
          if (!ptyOk) throw new Error("posix_spawnp failed");
          pty.emit; // touch
          (pty as FakePty & { spawnedWith?: object }).spawnedWith = {
            cmd,
            cwd,
          };
          return pty;
        },
      },
    }).app;
    return { app, pty };
  }

  async function withConsent(app: ReturnType<typeof makeApp>["app"]) {
    const t = (await request(app).get("/api/session")).body.token;
    await request(app)
      .post("/api/integrations/config")
      .set(TOKEN_HEADER, t)
      .send({ consents: { agent: true } });
    return t;
  }

  it("start requires the token and Agent consent", async () => {
    const { app } = makeApp(true);
    expect(
      (await request(app).post("/api/terminal/start").send({})).status,
    ).toBe(403);
    const t = (await request(app).get("/api/session")).body.token;
    const noConsent = await request(app)
      .post("/api/terminal/start")
      .set(TOKEN_HEADER, t)
      .send({});
    expect(noConsent.status).toBe(403);
    expect(noConsent.body.error).toBe("agent-consent-required");
  });

  it("starts the TUI in the vault dir and relays I/O", async () => {
    const { app, pty } = makeApp(true);
    const t = await withConsent(app);
    const start = await request(app)
      .post("/api/terminal/start")
      .set(TOKEN_HEADER, t)
      .send({ cols: 90, rows: 30 });
    expect(start.status).toBe(200);
    expect(
      (pty as FakePty & { spawnedWith?: { cmd: string; cwd: string } })
        .spawnedWith,
    ).toEqual({
      cmd: OC_BIN,
      cwd: VAULT,
    });

    await request(app)
      .post("/api/terminal/input")
      .set(TOKEN_HEADER, t)
      .send({ data: "ls\r" });
    expect(pty.written).toEqual(["ls\r"]);

    await request(app)
      .post("/api/terminal/resize")
      .set(TOKEN_HEADER, t)
      .send({ cols: 120, rows: 40 });
    expect(pty.size).toEqual({ cols: 120, rows: 40 });

    // SSE stream replays backlog; ends when the pty exits
    pty.emit("hello from tui");
    setTimeout(() => pty.exit(), 30);
    const stream = await request(app).get(`/api/terminal/stream?token=${t}`);
    expect(stream.status).toBe(200);
    expect(stream.text).toContain("hello from tui");

    await request(app).post("/api/terminal/kill").set(TOKEN_HEADER, t);
  });

  it("degrades to a clean 503 when node-pty is unavailable", async () => {
    const { app } = makeApp(false);
    const t = await withConsent(app);
    const res = await request(app)
      .post("/api/terminal/start")
      .set(TOKEN_HEADER, t)
      .send({});
    expect(res.status).toBe(503);
    expect(res.body.error).toBe("pty-unavailable");
  });

  it("input and stream are token-guarded", async () => {
    const { app } = makeApp(true);
    expect(
      (await request(app).post("/api/terminal/input").send({ data: "x" }))
        .status,
    ).toBe(403);
    expect(
      (await request(app).get("/api/terminal/stream?token=wrong")).status,
    ).toBe(403);
  });
});
