import { describe, it, expect, afterAll } from "vitest";
import request from "supertest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../app";
import { TOKEN_HEADER } from "./security";
import { installAddons, QMD_INSTALL_SPEC } from "./install";
import type { RunResult } from "./detect";

const ok = (stdout = ""): RunResult => ({ ok: true, stdout, stderr: "" });
const fail = (stderr = "boom"): RunResult => ({
  ok: false,
  stdout: "",
  stderr,
});

function recordingRunner(behavior: (cmd: string, args: string[]) => RunResult) {
  const calls: string[][] = [];
  return {
    calls,
    run: async (cmd: string, args: string[]) => {
      calls.push([cmd, ...args]);
      return behavior(cmd, args);
    },
  };
}

const HOME = "/home/tester";

describe("installAddons", () => {
  it("skips existing installs and never runs an installer (R16/AE7)", async () => {
    const qmdBin = join(HOME, ".bun", "bin", "qmd");
    const { calls, run } = recordingRunner((cmd) =>
      cmd === qmdBin ? ok("1.0.0") : fail(),
    );
    const results = await installAddons({
      run,
      home: HOME,
      env: { PATH: "" },
      fileExists: (p) => p === qmdBin,
    });
    expect(results.map((r) => r.status)).toEqual([
      "already-installed",
      "instructions", // markitdown missing, no uv/pip on the fake system
    ]);
    // detection may probe via a login shell (-lc); installers use -c or `install`
    const installers = calls.filter(
      ([cmd, a1]) => (cmd === "/bin/sh" && a1 === "-c") || a1 === "install",
    );
    expect(installers).toEqual([]); // no reinstall, config untouched
  });

  it("returns guided instructions when qmd is missing and Bun is absent", async () => {
    const { calls, run } = recordingRunner(() => fail());
    const results = await installAddons(
      { run, home: HOME, env: { PATH: "" }, fileExists: () => false },
      ["qmd"],
    );
    expect(results[0].status).toBe("instructions");
    expect(results[0].detail).toContain("bun.sh/install");
    expect(results[0].detail).toContain(QMD_INSTALL_SPEC);
    // no partial install attempted
    expect(calls.some(([, a0]) => a0 === "install")).toBe(false);
  });

  it("installs qmd via bun when Bun exists, surfacing stderr on failure", async () => {
    const bun = join(HOME, ".bun", "bin", "bun");
    const good = recordingRunner((cmd) => (cmd === bun ? ok() : fail()));
    const installed = await installAddons(
      {
        run: good.run,
        home: HOME,
        env: { PATH: "" },
        fileExists: (p) => p === bun,
      },
      ["qmd"],
    );
    expect(installed[0].status).toBe("installed");
    expect(
      good.calls.some(
        ([cmd, a0, a1, a2]) =>
          cmd === bun &&
          a0 === "install" &&
          a1 === "-g" &&
          a2 === QMD_INSTALL_SPEC,
      ),
    ).toBe(true);

    const bad = recordingRunner((cmd, args) =>
      cmd === bun && args[0] === "install"
        ? fail("registry unreachable")
        : fail(),
    );
    const failed = await installAddons(
      {
        run: bad.run,
        home: HOME,
        env: { PATH: "" },
        fileExists: (p) => p === bun,
      },
      ["qmd"],
    );
    expect(failed[0].status).toBe("failed");
    expect(failed[0].detail).toContain("registry unreachable");
  });
});

describe("POST /api/integrations/install", () => {
  const VAULT = mkdtempSync(join(tmpdir(), "solaris-install-test-"));
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
  const qmdBin = join(HOME, ".bun", "bin", "qmd");
  const { run } = recordingRunner((cmd) =>
    cmd === qmdBin ? ok("qmd 1.0.0") : fail(),
  );
  const { app } = createApp(graphPath, undefined, {
    configPath: join(VAULT, "config.json"),
    detectDeps: {
      run,
      home: HOME,
      env: { PATH: "" },
      fileExists: (p) => p === qmdBin,
    },
  });

  it("requires the session token", async () => {
    expect(
      (await request(app).post("/api/integrations/install").send({})).status,
    ).toBe(403);
  });

  it("reports per-tool results", async () => {
    const t = (await request(app).get("/api/session")).body.token;
    const res = await request(app)
      .post("/api/integrations/install")
      .set(TOKEN_HEADER, t)
      .send({ tools: ["qmd"] });
    expect(res.status).toBe(200);
    expect(res.body.results).toEqual([
      {
        tool: "qmd",
        status: "already-installed",
        detail: expect.stringContaining(qmdBin),
      },
    ]);
  });
});
