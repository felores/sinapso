import { expect, test } from "@playwright/test";
import { captureBrowserDiagnostics } from "./diagnostics";

type Graph = {
  nodes: Array<{ id: string; title: string; phantom?: boolean }>;
};

test("loads Sinapso shell", async ({ page }) => {
  const assertCleanBrowser = captureBrowserDiagnostics(page, test.info());
  try {
    await page.goto("/");
    await expect(page).toHaveTitle(/Sinapso/);
    await expect(page.locator("#graph")).toBeAttached();
    await expect(page.locator("#research-selection-assist")).toBeHidden();
  } finally {
    await assertCleanBrowser();
  }
});

test("keeps local tools in Tools and opens providers in Settings", async ({
  page,
}) => {
  const assertCleanBrowser = captureBrowserDiagnostics(page, test.info());
  try {
    await page.goto("/");
    // The integrations source lives inside the Settings modal and is hidden
    // until the modal opens (no cards, no wide grid).
    await expect(page.locator("#admin-integrations-source")).toBeHidden();
    await expect(page.locator(".admin-integration-card")).toHaveCount(0);

    // Tools menu keeps only the local integrations (markitdown, qmd) + re-check.
    const toolsMenu = page
      .locator(".menu")
      .filter({ has: page.locator("#mi-integrations") });
    await toolsMenu.locator(".menu-label").click();
    await expect(toolsMenu.locator("#integ-markitdown")).toBeVisible();
    await expect(toolsMenu.locator("#integ-qmd")).toBeVisible();
    await expect(toolsMenu.locator("#admin-git")).toHaveCount(1);
    await expect(toolsMenu.locator("#mi-rescan")).toBeVisible();
    await expect(toolsMenu.locator("#mi-export")).toBeVisible();
    await expect(toolsMenu.locator("#mi-reload")).toBeVisible();
    await expect(toolsMenu.locator("#integ-exa")).toHaveCount(0);
    await expect(toolsMenu.locator("#integ-openrouter")).toHaveCount(0);
    await expect(toolsMenu.locator("#integ-voice")).toHaveCount(0);

    // Settings modal: title, restored narrow width, vertical sections after
    // Wikis, no card chrome, agent rows, voice three-column row.
    const fileMenu = page.locator(".menu").first();
    await expect(
      fileMenu.locator("#mi-rescan, #mi-export, #mi-reload"),
    ).toHaveCount(0);
    await fileMenu.locator(".menu-label").hover();
    await expect(fileMenu.locator("#mi-admin")).toBeVisible();
    await page.locator("#mi-admin").click();
    await expect(page.locator("#modal-title")).toHaveText("Settings");
    await expect(page.locator("#admin-integrations-source")).toBeVisible();
    await expect(page.locator("#admin-integrations #admin-git")).toHaveCount(0);
    await expect(page.locator("#modal")).toHaveCSS("width", /^(\d+)px$/);
    const width = await page
      .locator("#modal")
      .evaluate((el) => el.getBoundingClientRect().width);
    expect(width).toBeLessThanOrEqual(521);
    await expect(page.locator(".set-section")).toHaveCount(4);
    await expect(
      page.locator("#admin-integrations .set-section").first(),
    ).toBeVisible();
    await expect(page.locator("#set-provider-select")).toBeVisible();
    await expect(page.locator("#set-provider-key")).toBeVisible();
    await expect(page.locator(".set-provider-cap")).toHaveCount(3);
    await expect(page.locator(".set-model-status")).toHaveCount(2);
    await expect(page.locator("#set-voice-status")).toBeVisible();
    await expect(page.locator(".set-model-row")).toHaveCount(2);
    await expect(page.locator(".set-effort-select")).toHaveCount(0);
    await expect(page.locator("#worker-model-select")).toBeVisible();
    await expect(page.locator("#thinker-model-select")).toBeVisible();
    await expect(page.locator("#web-provider-select")).toBeVisible();
    await expect(page.locator(".set-voice-row .voice-col")).toHaveCount(3);
    await expect(page.locator("#voice-provider-select")).toBeVisible();
    await expect(page.locator("#voice-model-select")).toBeVisible();
    await expect(page.locator("#voice-name-select")).toBeVisible();
    await expect(page.locator(".admin-prompt-path")).toHaveCount(4);
    await expect(page.locator(".admin-prompt-file-enabled")).toHaveCount(4);

    // Reopening preserves the controls (close + reopen via the config button).
    await page.locator("#modal-close").click();
    await page.locator("#config-btn").click();
    await expect(page.locator("#set-provider-select")).toBeVisible();
    await expect(page.locator(".set-model-row")).toHaveCount(2);
    await expect(page.locator("#voice-name-select")).toBeVisible();
    await expect(page.locator("#web-provider-select")).toBeVisible();
  } finally {
    await assertCleanBrowser();
  }
});

test("opens a node from the URL", async ({ page }) => {
  const assertCleanBrowser = captureBrowserDiagnostics(page, test.info());
  try {
    const graph = (await (
      await page.request.get("/api/graph")
    ).json()) as Graph;
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

test("opens a node from the hash URL", async ({ page }) => {
  const assertCleanBrowser = captureBrowserDiagnostics(page, test.info());
  try {
    const graph = (await (
      await page.request.get("/api/graph")
    ).json()) as Graph;
    const node = graph.nodes.find((n) => !n.phantom);
    if (!node) {
      test.skip(true, "graph has no real nodes");
      return;
    }

    await page.goto(`/#node=${encodeURIComponent(node.id)}`);
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
    const graph = (await (
      await page.request.get("/api/graph")
    ).json()) as Graph;
    const node = graph.nodes.find((n) => !n.phantom);
    if (!node) {
      test.skip(true, "graph has no real nodes");
      return;
    }

    // A fresh vault triggers the qmd onboarding prompt, which overlays the
    // search results; mark it answered so the click isn't intercepted.
    await page.addInitScript(() =>
      localStorage.setItem("sinapso-qmd-prompted", "1"),
    );
    await page.goto("/");
    await page.locator("#search").fill(node.title);
    await page.locator("#search-results .result").first().click();

    await expect(page.locator("#reader")).not.toHaveClass(/hidden/);
    const selectedId = await page.locator("#reader-path").textContent();
    await expect
      .poll(() =>
        new URLSearchParams(new URL(page.url()).hash.slice(1)).get("node"),
      )
      .toBe(selectedId);
    expect(new URL(page.url()).searchParams.has("node")).toBe(false);
    expect(new URL(page.url()).searchParams.has("focus")).toBe(false);
  } finally {
    await assertCleanBrowser();
  }
});

test("hash node changes do not reload the app", async ({ page }) => {
  const assertCleanBrowser = captureBrowserDiagnostics(page, test.info());
  try {
    const graph = (await (
      await page.request.get("/api/graph")
    ).json()) as Graph;
    const nodes = graph.nodes.filter((n) => !n.phantom).slice(0, 2);
    if (nodes.length < 2) {
      test.skip(true, "graph has fewer than two real nodes");
      return;
    }

    await page.goto(`/#node=${encodeURIComponent(nodes[0].id)}`);
    await expect(page.locator("#reader-path")).toHaveText(nodes[0].id, {
      timeout: 15_000,
    });
    await page.evaluate(() => {
      (
        window as unknown as { __sinapsoReloadProbe: string }
      ).__sinapsoReloadProbe = "alive";
    });
    const next = new URL(page.url());
    next.hash = `node=${encodeURIComponent(nodes[1].id)}`;
    await page.evaluate((url) => {
      window.location.href = url;
    }, next.toString());

    await expect(page.locator("#reader-path")).toHaveText(nodes[1].id);
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (window as unknown as { __sinapsoReloadProbe?: string })
              .__sinapsoReloadProbe,
        ),
      )
      .toBe("alive");
  } finally {
    await assertCleanBrowser();
  }
});
