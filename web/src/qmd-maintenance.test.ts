// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const html = readFileSync(resolve(root, "web/index.html"), "utf8");
const main = readFileSync(resolve(root, "web/src/main.ts"), "utf8");

describe("qmd maintenance progress", () => {
  it("uses ops status without a secondary progress surface", () => {
    const shell = document.createElement("div");
    shell.innerHTML = html;
    const maintenance = shell.querySelector("#qmd-maint");

    expect(shell.querySelector("#ops-status")?.getAttribute("aria-live")).toBe(
      "polite",
    );
    expect(
      maintenance?.querySelector("progress, [role=progressbar], .modal, .card"),
    ).toBeNull();
    expect(shell.querySelector("#qmd-maint-bar")).toBeNull();
    expect(main).not.toContain("qmd-maint-bar");
    expect(main).toContain('maintStatus.classList.add("hidden")');
  });
});
