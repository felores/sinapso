import { expect, test } from "@playwright/test";
import { captureBrowserDiagnostics } from "./diagnostics";

type Graph = {
  nodes: Array<{ id: string; title: string; phantom?: boolean }>;
};

test("loads Solaris shell", async ({ page }) => {
  const assertCleanBrowser = captureBrowserDiagnostics(page, test.info());
  try {
    await page.goto("/");
    await expect(page).toHaveTitle(/Solaris/);
    await expect(page.locator("#graph")).toBeAttached();
  } finally {
    await assertCleanBrowser();
  }
});

test("opens a node from the URL", async ({ page }) => {
  const assertCleanBrowser = captureBrowserDiagnostics(page, test.info());
  try {
    const graph = (await (await page.request.get("/api/graph")).json()) as Graph;
    const node = graph.nodes.find((n) => !n.phantom);
    if (!node) {
      test.skip(true, "graph has no real nodes");
      return;
    }

    await page.goto(`/?node=${encodeURIComponent(node.id)}`);
    await expect(page.locator("#reader")).not.toHaveClass(/hidden/, {
      timeout: 15_000,
    });
    await expect(page.locator("#reader-path")).toHaveText(node.id);
  } finally {
    await assertCleanBrowser();
  }
});

test("writes selected node to the URL", async ({ page }) => {
  const assertCleanBrowser = captureBrowserDiagnostics(page, test.info());
  try {
    const graph = (await (await page.request.get("/api/graph")).json()) as Graph;
    const node = graph.nodes.find((n) => !n.phantom);
    if (!node) {
      test.skip(true, "graph has no real nodes");
      return;
    }

    await page.goto("/");
    await page.locator("#search").fill(node.title);
    await page.locator("#search-results .result").first().click();

    await expect(page.locator("#reader")).not.toHaveClass(/hidden/);
    const selectedId = await page.locator("#reader-path").textContent();
    await expect
      .poll(() => new URL(page.url()).searchParams.get("node"))
      .toBe(selectedId);
    expect(new URL(page.url()).searchParams.has("focus")).toBe(false);
  } finally {
    await assertCleanBrowser();
  }
});
